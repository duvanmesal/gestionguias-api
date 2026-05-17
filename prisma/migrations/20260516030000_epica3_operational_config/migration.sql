CREATE TYPE "TurnoAssignmentMode" AS ENUM ('MANUAL_RECLAMO', 'FIFO_GLOBAL');

ALTER TABLE "guias"
  ADD COLUMN "disponibleParaTurnos" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "disponibilidadUpdatedAt" TIMESTAMP(3);

CREATE INDEX "guias_disponibleParaTurnos_disponibilidadUpdatedAt_idx"
  ON "guias"("disponibleParaTurnos", "disponibilidadUpdatedAt");

CREATE INDEX "guias_pendingPenalty_idx"
  ON "guias"("pendingPenalty");

CREATE TABLE "operational_config" (
  "id" TEXT NOT NULL DEFAULT 'global',
  "turnoAssignmentMode" "TurnoAssignmentMode" NOT NULL DEFAULT 'MANUAL_RECLAMO',
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "operational_config_pkey" PRIMARY KEY ("id")
);

INSERT INTO "operational_config" ("id", "turnoAssignmentMode", "createdAt", "updatedAt")
VALUES ('global', 'MANUAL_RECLAMO', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
