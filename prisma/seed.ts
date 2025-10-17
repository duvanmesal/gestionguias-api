import "dotenv/config";
import { PrismaClient, RolType, ProfileStatus } from "@prisma/client";
import { hash as argonHash, argon2id } from "argon2";

const prisma = new PrismaClient();

// --- helpers locales (evitan depender de src/) ---
const PASSWORD_PEPPER = process.env.PASSWORD_PEPPER ?? "";

async function hashPassword(plain: string) {
  const toHash = `${plain}${PASSWORD_PEPPER}`;
  return argonHash(toHash, {
    type: argon2id,
    memoryCost: 2 ** 16,
    timeCost: 3,
    parallelism: 1,
  });
}

async function main() {
  console.log("🌱 Starting database seeding...");

  const SUPER_EMAIL = process.env.SEED_SUPERADMIN_EMAIL ?? "superadmin@local.test";
  const SUPER_PASS  = process.env.SEED_SUPERADMIN_PASS  ?? "ChangeMe!123";
  const NODE_ENV    = process.env.NODE_ENV ?? "development";

  await upsertSuperAdmin(SUPER_EMAIL, SUPER_PASS);
  await upsertCountries();
  await upsertShips();

  if (NODE_ENV === "development") {
    await upsertTestUsers();
  }

  console.log("✅ Database seeding completed!");
}

async function upsertSuperAdmin(email: string, password: string) {
  const passwordHash = await hashPassword(password);

  await prisma.usuario.upsert({
    where: { email },
    update: {
      passwordHash,
      nombres: "Super",
      apellidos: "Admin",
      rol: RolType.SUPER_ADMIN,
      activo: true,
      profileStatus: ProfileStatus.COMPLETE,
    },
    create: {
      email,
      passwordHash,
      nombres: "Super",
      apellidos: "Admin",
      rol: RolType.SUPER_ADMIN,
      activo: true,
      profileStatus: ProfileStatus.COMPLETE,
    },
  });

  console.log(`👤 SuperAdmin ready: ${email} (password: ${password})`);
}

async function upsertCountries() {
  const countries = [
    { nombre: "Colombia", codigo: "CO" },
    { nombre: "Estados Unidos", codigo: "US" },
    { nombre: "España", codigo: "ES" },
    { nombre: "Italia", codigo: "IT" },
    { nombre: "Brasil", codigo: "BR" },
  ];

  for (const c of countries) {
    await prisma.pais.upsert({
      where: { codigo: c.codigo },
      update: {},
      create: c,
    });
  }
  console.log(`🌍 Countries upserted: ${countries.length}`);
}

async function upsertShips() {
  const ships = [
    { nombre: "Wonder of the Seas", naviera: "Royal Caribbean", capacidad: 7084 },
    { nombre: "MSC Meraviglia", naviera: "MSC Cruises", capacidad: 5714 },
    { nombre: "Norwegian Epic", naviera: "Norwegian Cruise Line", capacidad: 5183 },
  ];

  for (const s of ships) {
    await prisma.buque.upsert({
      where: { nombre: s.nombre },
      update: {},
      create: s,
    });
  }
  console.log(`🚢 Ships upserted: ${ships.length}`);
}

async function upsertTestUsers() {
  const users = [
    { email: "supervisor@test.com", password: "Test123!", nombres: "María",  apellidos: "González",  rol: RolType.SUPERVISOR },
    { email: "guia1@test.com",     password: "Test123!", nombres: "Carlos", apellidos: "Rodríguez", rol: RolType.GUIA },
    { email: "guia2@test.com",     password: "Test123!", nombres: "Ana",    apellidos: "Martínez",  rol: RolType.GUIA },
  ];

  for (const u of users) {
    const passwordHash = await hashPassword(u.password);

    const user = await prisma.usuario.upsert({
      where: { email: u.email },
      update: {
        passwordHash,
        nombres: u.nombres,
        apellidos: u.apellidos,
        rol: u.rol,
        activo: true,
        profileStatus: ProfileStatus.COMPLETE,
      },
      create: {
        email: u.email,
        passwordHash,
        nombres: u.nombres,
        apellidos: u.apellidos,
        rol: u.rol,
        activo: true,
        profileStatus: ProfileStatus.COMPLETE,
      },
    });

    if (u.rol === RolType.SUPERVISOR) {
      await prisma.supervisor.upsert({
        where: { usuarioId: user.id },
        update: { telefono: "+57 300 123 4567" },
        create: { usuarioId: user.id, telefono: "+57 300 123 4567" },
      });
    }
    if (u.rol === RolType.GUIA) {
      await prisma.guia.upsert({
        where: { usuarioId: user.id },
        update: {
          telefono: `+57 300 ${Math.floor(Math.random() * 9000000) + 1000000}`,
          direccion: "Cartagena, Colombia",
        },
        create: {
          usuarioId: user.id,
          telefono: `+57 300 ${Math.floor(Math.random() * 9000000) + 1000000}`,
          direccion: "Cartagena, Colombia",
        },
      });
    }

    console.log(`👤 User ready: ${u.email} (${u.rol})`);
  }

  console.log("🧪 Test users upserted");
}

main()
  .catch((e) => {
    console.error("❌ Error during seeding:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
