import type { Prisma } from "@prisma/client"

import type { SeedContext } from "./context"

const seedText: Prisma.StringFilter<"Recalada"> = { contains: "[SEED]" }

export async function cleanupDemoData(context: SeedContext) {
  const prisma = context.prisma
  console.log("Cleaning previous demo seed data...")

  const demoRecaladas = await prisma.recalada.findMany({
    where: {
      OR: [
        { codigoRecalada: { startsWith: "SEED-" } },
        { codigoRecalada: { startsWith: "DEMO-" } },
        { codigoRecalada: { startsWith: "FIFO-" } },
        { observaciones: seedText },
      ],
    },
    select: { id: true },
  })
  const recaladaIds = demoRecaladas.map((row) => row.id)

  const demoAtenciones = await prisma.atencion.findMany({
    where: {
      OR: [
        { recaladaId: { in: recaladaIds.length ? recaladaIds : [-1] } },
        { descripcion: { contains: "[SEED]" } },
      ],
    },
    select: { id: true },
  })
  const atencionIds = demoAtenciones.map((row) => row.id)

  const demoTurnos = await prisma.turno.findMany({
    where: {
      OR: [
        { atencionId: { in: atencionIds.length ? atencionIds : [-1] } },
        { observaciones: { contains: "[SEED]" } },
        { cancelReason: { contains: "[SEED]" } },
      ],
    },
    select: { id: true },
  })
  const turnoIds = demoTurnos.map((row) => row.id)

  await prisma.$transaction([
    prisma.notificationDelivery.deleteMany({
      where: {
        OR: [
          { notificationId: { startsWith: "seed:" } },
          { notificationId: { startsWith: "demo:" } },
          { title: { contains: "[SEED]" } },
          { body: { contains: "[SEED]" } },
        ],
      },
    }),
    prisma.guiaPenalty.deleteMany({
      where: {
        OR: [
          { turnoId: { in: turnoIds.length ? turnoIds : [-1] } },
          { reason: { contains: "[SEED]" } },
        ],
      },
    }),
    prisma.disponibilidad.deleteMany({
      where: { atencionId: { in: atencionIds.length ? atencionIds : [-1] } },
    }),
    prisma.atencionEvaluation.deleteMany({
      where: { atencionId: { in: atencionIds.length ? atencionIds : [-1] } },
    }),
    prisma.turno.deleteMany({
      where: { id: { in: turnoIds.length ? turnoIds : [-1] } },
    }),
    prisma.atencion.deleteMany({
      where: { id: { in: atencionIds.length ? atencionIds : [-1] } },
    }),
    prisma.recalada.deleteMany({
      where: { id: { in: recaladaIds.length ? recaladaIds : [-1] } },
    }),
  ])

  await prisma.guia.updateMany({
    where: {
      usuario: {
        email: {
          in: [
            "guia1@test.com",
            "guia2@test.com",
            "guia3@test.com",
            "guia4@test.com",
            "guia5@test.com",
            "guia6@test.com",
            "guia7@test.com",
            "guia8@test.com",
            "guia9@test.com",
            "guia10@test.com",
          ],
        },
      },
    },
    data: {
      pendingPenalty: false,
      disponibleParaTurnos: false,
      disponibilidadUpdatedAt: null,
    },
  })

  console.log(
    `Demo cleanup done: ${recaladaIds.length} recaladas, ${atencionIds.length} atenciones, ${turnoIds.length} turnos removed`,
  )
}
