import { PrismaClient, Prisma } from "@prisma/client";
import { logger } from "../libs/logger";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient<
    Prisma.PrismaClientOptions,
    "query" | "info" | "warn" | "error"
  > | undefined;
};

export const prisma: PrismaClient<
  Prisma.PrismaClientOptions,
  "query" | "info" | "warn" | "error"
> =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: [
      { emit: "event", level: "query" },
      { emit: "event", level: "error" },
      { emit: "event", level: "info" },
      { emit: "event", level: "warn" },
    ],
  });

// Eventos Prisma (tipados)
prisma.$on("query", (e: Prisma.QueryEvent) => {
  logger.debug(
    {
      query: e.query,
      params: e.params,
      duration: e.duration,
    },
    "Prisma query executed"
  );
});

prisma.$on("error", (e: Prisma.LogEvent) => {
  logger.error(e, "Prisma error");
});

prisma.$on("info", (e: Prisma.LogEvent) => {
  logger.info(e, "Prisma info");
});

prisma.$on("warn", (e: Prisma.LogEvent) => {
  logger.warn(e, "Prisma warning");
});

// Guarda la instancia en global (solo en dev)
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
