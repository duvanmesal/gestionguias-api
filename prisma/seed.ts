import "dotenv/config";
import { PrismaClient, RolType } from "@prisma/client";
import { hash } from "argon2";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Starting database seeding...");

  // Usa variables de entorno o defaults
  const SUPER_EMAIL = process.env.SEED_SUPERADMIN_EMAIL ?? "superadmin@local.test";
  const SUPER_PASS  = process.env.SEED_SUPERADMIN_PASS  ?? "ChangeMe!123";
  const NODE_ENV    = process.env.NODE_ENV ?? "development";

  await createSuperAdmin(SUPER_EMAIL, SUPER_PASS);
  await createCountries();
  await createShips();

  if (NODE_ENV === "development") {
    await createTestUsers();
  }

  console.log("✅ Database seeding completed!");
}

async function createSuperAdmin(email: string, password: string) {
  const existingUser = await prisma.usuario.findUnique({ where: { email } });
  if (existingUser) {
    console.log(`👤 SuperAdmin already exists: ${email}`);
    return;
  }

  const passwordHash = await hash(password);
  await prisma.usuario.create({
    data: {
      email,
      passwordHash,
      nombres: "Super",
      apellidos: "Admin",
      rol: RolType.SUPER_ADMIN,
      activo: true,
    },
  });

  console.log(`👤 SuperAdmin created: ${email}`);
  console.log(`🔑 Password: ${password}`);
  console.log(`⚠️  Please change the default password after first login!`);
}

async function createCountries() {
  const countries = [
    { nombre: "Estados Unidos", codigo: "US" },
    { nombre: "Reino Unido", codigo: "GB" },
    { nombre: "Alemania", codigo: "DE" },
    { nombre: "Francia", codigo: "FR" },
    { nombre: "Italia", codigo: "IT" },
    { nombre: "España", codigo: "ES" },
    { nombre: "Países Bajos", codigo: "NL" },
    { nombre: "Noruega", codigo: "NO" },
    { nombre: "Dinamarca", codigo: "DK" },
    { nombre: "Suecia", codigo: "SE" },
    { nombre: "Finlandia", codigo: "FI" },
    { nombre: "Brasil", codigo: "BR" },
    { nombre: "Argentina", codigo: "AR" },
    { nombre: "Chile", codigo: "CL" },
    { nombre: "Canadá", codigo: "CA" },
  ];

  for (const country of countries) {
    await prisma.pais.upsert({
      where: { codigo: country.codigo },
      update: {},
      create: country,
    });
  }
  console.log(`🌍 Created/updated ${countries.length} countries`);
}

async function createShips() {
  const ships = [
    { nombre: "Symphony of the Seas", naviera: "Royal Caribbean", capacidad: 6680 },
    { nombre: "Harmony of the Seas", naviera: "Royal Caribbean", capacidad: 6780 },
    { nombre: "Allure of the Seas", naviera: "Royal Caribbean", capacidad: 6780 },
    { nombre: "Oasis of the Seas", naviera: "Royal Caribbean", capacidad: 6771 },
    { nombre: "Wonder of the Seas", naviera: "Royal Caribbean", capacidad: 7084 },
    { nombre: "MSC Meraviglia", naviera: "MSC Cruises", capacidad: 5714 },
    { nombre: "MSC Bellissima", naviera: "MSC Cruises", capacidad: 5686 },
    { nombre: "MSC Grandiosa", naviera: "MSC Cruises", capacidad: 6334 },
    { nombre: "Norwegian Epic", naviera: "Norwegian Cruise Line", capacidad: 5183 },
    { nombre: "Norwegian Breakaway", naviera: "Norwegian Cruise Line", capacidad: 4028 },
    { nombre: "Celebrity Edge", naviera: "Celebrity Cruises", capacidad: 2918 },
    { nombre: "Celebrity Apex", naviera: "Celebrity Cruises", capacidad: 2910 },
    { nombre: "Carnival Vista", naviera: "Carnival Cruise Line", capacidad: 4000 },
    { nombre: "Carnival Horizon", naviera: "Carnival Cruise Line", capacidad: 3974 },
    { nombre: "Disney Fantasy", naviera: "Disney Cruise Line", capacidad: 4000 },
  ];

  for (const ship of ships) {
    await prisma.buque.upsert({
      where: { nombre: ship.nombre },
      update: {},
      create: ship,
    });
  }
  console.log(`🚢 Created/updated ${ships.length} ships`);
}

async function createTestUsers() {
  const testUsers = [
    { email: "supervisor@test.com", password: "Test123!", nombres: "María",  apellidos: "González",  rol: RolType.SUPERVISOR },
    { email: "guia1@test.com",     password: "Test123!", nombres: "Carlos", apellidos: "Rodríguez", rol: RolType.GUIA },
    { email: "guia2@test.com",     password: "Test123!", nombres: "Ana",    apellidos: "Martínez",  rol: RolType.GUIA },
    { email: "guia3@test.com",     password: "Test123!", nombres: "Luis",   apellidos: "López",     rol: RolType.GUIA },
  ];

  for (const u of testUsers) {
    const exists = await prisma.usuario.findUnique({ where: { email: u.email } });
    if (exists) continue;

    const passwordHash = await hash(u.password);
    const user = await prisma.usuario.create({
      data: {
        email: u.email,
        passwordHash,
        nombres: u.nombres,
        apellidos: u.apellidos,
        rol: u.rol,
        activo: true,
      },
    });

    if (u.rol === RolType.SUPERVISOR) {
      await prisma.supervisor.create({
        data: { usuarioId: user.id, telefono: "+57 300 123 4567" },
      });
    } else if (u.rol === RolType.GUIA) {
      await prisma.guia.create({
        data: {
          usuarioId: user.id,
          telefono: `+57 300 ${Math.floor(Math.random() * 9000000) + 1000000}`,
          direccion: "Cartagena, Colombia",
        },
      });
    }

    console.log(`👤 Test user created: ${u.email} (${u.rol})`);
  }

  console.log("🧪 Test users setup completed");
}

main()
  .catch((e) => {
    console.error("❌ Error during seeding:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
