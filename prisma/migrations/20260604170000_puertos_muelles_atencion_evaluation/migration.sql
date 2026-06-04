-- CreateEnum
CREATE TYPE "AtencionEvaluationEstadoFinal" AS ENUM ('SATISFACTORIA', 'CON_NOVEDADES', 'NO_SATISFACTORIA');

-- CreateTable
CREATE TABLE "puertos" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "ciudad" TEXT NOT NULL,
    "paisId" INTEGER NOT NULL,
    "status" "StatusType" NOT NULL DEFAULT 'ACTIVO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "puertos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "muelles" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "puertoId" INTEGER NOT NULL,
    "capacidadCruceros" INTEGER,
    "status" "StatusType" NOT NULL DEFAULT 'ACTIVO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "muelles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "atencion_evaluations" (
    "id" SERIAL NOT NULL,
    "atencionId" INTEGER NOT NULL,
    "calificacion" INTEGER NOT NULL,
    "estadoFinal" "AtencionEvaluationEstadoFinal" NOT NULL,
    "observaciones" TEXT,
    "evaluatedById" TEXT NOT NULL,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "atencion_evaluations_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "recaladas" ADD COLUMN "puertoId" INTEGER;
ALTER TABLE "recaladas" ADD COLUMN "muelleId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "puertos_codigo_key" ON "puertos"("codigo");

-- CreateIndex
CREATE INDEX "puertos_paisId_idx" ON "puertos"("paisId");

-- CreateIndex
CREATE INDEX "puertos_status_idx" ON "puertos"("status");

-- CreateIndex
CREATE UNIQUE INDEX "muelles_codigo_key" ON "muelles"("codigo");

-- CreateIndex
CREATE INDEX "muelles_puertoId_idx" ON "muelles"("puertoId");

-- CreateIndex
CREATE INDEX "muelles_status_idx" ON "muelles"("status");

-- CreateIndex
CREATE UNIQUE INDEX "atencion_evaluations_atencionId_key" ON "atencion_evaluations"("atencionId");

-- CreateIndex
CREATE INDEX "atencion_evaluations_estadoFinal_idx" ON "atencion_evaluations"("estadoFinal");

-- CreateIndex
CREATE INDEX "atencion_evaluations_evaluatedById_idx" ON "atencion_evaluations"("evaluatedById");

-- CreateIndex
CREATE INDEX "recaladas_puertoId_fechaLlegada_idx" ON "recaladas"("puertoId", "fechaLlegada");

-- CreateIndex
CREATE INDEX "recaladas_muelleId_fechaLlegada_idx" ON "recaladas"("muelleId", "fechaLlegada");

-- AddForeignKey
ALTER TABLE "puertos" ADD CONSTRAINT "puertos_paisId_fkey" FOREIGN KEY ("paisId") REFERENCES "paises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "muelles" ADD CONSTRAINT "muelles_puertoId_fkey" FOREIGN KEY ("puertoId") REFERENCES "puertos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recaladas" ADD CONSTRAINT "recaladas_puertoId_fkey" FOREIGN KEY ("puertoId") REFERENCES "puertos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recaladas" ADD CONSTRAINT "recaladas_muelleId_fkey" FOREIGN KEY ("muelleId") REFERENCES "muelles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atencion_evaluations" ADD CONSTRAINT "atencion_evaluations_atencionId_fkey" FOREIGN KEY ("atencionId") REFERENCES "atenciones"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atencion_evaluations" ADD CONSTRAINT "atencion_evaluations_evaluatedById_fkey" FOREIGN KEY ("evaluatedById") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
