-- Epica 6: NO_SHOW y penalizaciones con vigencia
-- 1) Configuración: duración (horas) de la penalización aplicada al guía por NO_SHOW.
--    Default 48 horas. Configurable entre 1 y 720 desde operational-config.
ALTER TABLE "operational_config"
  ADD COLUMN "noShowPenaltyDurationHours" INTEGER NOT NULL DEFAULT 48;

-- 2) Entidad persistente GuiaPenalty: una fila por penalización, con vigencia
--    limitada por `expiresAt`. `Guia.pendingPenalty` se conserva como
--    indicador derivado sincronizado por el backend.
CREATE TABLE "guia_penalties" (
  "id" TEXT NOT NULL,
  "guiaId" TEXT NOT NULL,
  "turnoId" INTEGER,
  "reason" TEXT NOT NULL,
  "motivo" TEXT NOT NULL DEFAULT 'NO_SHOW',
  "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "guia_penalties_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "guia_penalties_guiaId_expiresAt_idx"
  ON "guia_penalties"("guiaId", "expiresAt");

CREATE INDEX "guia_penalties_expiresAt_idx"
  ON "guia_penalties"("expiresAt");

CREATE INDEX "guia_penalties_turnoId_idx"
  ON "guia_penalties"("turnoId");

ALTER TABLE "guia_penalties"
  ADD CONSTRAINT "guia_penalties_guiaId_fkey"
  FOREIGN KEY ("guiaId") REFERENCES "guias"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "guia_penalties"
  ADD CONSTRAINT "guia_penalties_turnoId_fkey"
  FOREIGN KEY ("turnoId") REFERENCES "turnos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "guia_penalties"
  ADD CONSTRAINT "guia_penalties_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
