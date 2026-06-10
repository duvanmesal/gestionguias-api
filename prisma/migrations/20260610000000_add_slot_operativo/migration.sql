-- CreateTable
CREATE TABLE "slots_operativos" (
    "id" SERIAL NOT NULL,
    "numero" INTEGER NOT NULL,
    "status" "StatusType" NOT NULL DEFAULT 'ACTIVO',
    "motivoInactividad" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "slots_operativos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "slots_operativos_numero_key" ON "slots_operativos"("numero");

-- CreateIndex
CREATE INDEX "slots_operativos_status_idx" ON "slots_operativos"("status");

-- AlterTable
ALTER TABLE "recaladas" ADD COLUMN "slotId" INTEGER;

-- CreateIndex
CREATE INDEX "recaladas_slotId_fechaLlegada_idx" ON "recaladas"("slotId", "fechaLlegada");

-- AddForeignKey
ALTER TABLE "recaladas" ADD CONSTRAINT "recaladas_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "slots_operativos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed slots 1-4
INSERT INTO "slots_operativos" ("numero", "status", "updatedAt") VALUES
  (1, 'ACTIVO', NOW()),
  (2, 'ACTIVO', NOW()),
  (3, 'ACTIVO', NOW()),
  (4, 'ACTIVO', NOW())
ON CONFLICT ("numero") DO NOTHING;
