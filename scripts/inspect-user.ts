// scripts/inspect-user.ts
const env: Record<string, string | undefined> = (globalThis as any)?.process?.env ?? {};

import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const email = "duvanmesa1516@gmail.com";
  const u = await prisma.usuario.findUnique({
    where: { email: email.toLowerCase() },
    select: { id: true, email: true, rol: true, activo: true, passwordHash: true, createdAt: true, updatedAt: true }
  });
  console.log("[USER]", u);
}

main().finally(() => (globalThis as any)?.process?.exit?.(1));
