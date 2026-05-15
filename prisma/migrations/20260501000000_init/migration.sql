-- CreateEnum
CREATE TYPE "RolType" AS ENUM ('SUPER_ADMIN', 'SUPERVISOR', 'GUIA');

-- CreateEnum
CREATE TYPE "StatusType" AS ENUM ('ACTIVO', 'INACTIVO', 'SUSPENDIDO');

-- CreateEnum
CREATE TYPE "TurnoStatus" AS ENUM ('AVAILABLE', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('WEB', 'MOBILE');

-- CreateEnum
CREATE TYPE "ProfileStatus" AS ENUM ('INCOMPLETE', 'COMPLETE');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('CC', 'CE', 'PAS', 'NIT', 'OTRO');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'USED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "RecaladaOperativeStatus" AS ENUM ('SCHEDULED', 'ARRIVED', 'DEPARTED', 'CANCELED');

-- CreateEnum
CREATE TYPE "RecaladaSource" AS ENUM ('MANUAL', 'IMPORT', 'API');

-- CreateEnum
CREATE TYPE "AtencionOperativeStatus" AS ENUM ('OPEN', 'CLOSED', 'CANCELED');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "nombres" TEXT NOT NULL,
    "apellidos" TEXT NOT NULL,
    "rol" "RolType" NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "profileStatus" "ProfileStatus" NOT NULL DEFAULT 'INCOMPLETE',
    "profileCompletedAt" TIMESTAMP(3),
    "documentType" "DocumentType",
    "documentNumber" TEXT,
    "telefono" TEXT,
    "emailVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "RolType" NOT NULL,
    "tempPasswordHash" TEXT NOT NULL,
    "tokenHash" TEXT,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "inviterId" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_verification_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "codeHash" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "logout_all_verification_codes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "logout_all_verification_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "deviceId" TEXT,
    "userAgent" TEXT,
    "ip" TEXT,
    "refreshTokenHash" TEXT,
    "refreshExpiresAt" TIMESTAMP(3),
    "lastRotatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedById" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "deviceId" TEXT,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guias" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "telefono" TEXT,
    "direccion" TEXT,
    "pendingPenalty" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supervisores" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "telefono" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supervisores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paises" (
    "id" SERIAL NOT NULL,
    "nombre" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "status" "StatusType" NOT NULL DEFAULT 'ACTIVO',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "paises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buques" (
    "id" SERIAL NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "naviera" TEXT,
    "capacidad" INTEGER,
    "status" "StatusType" NOT NULL DEFAULT 'ACTIVO',
    "paisId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "buques_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recaladas" (
    "id" SERIAL NOT NULL,
    "buqueId" INTEGER NOT NULL,
    "paisOrigenId" INTEGER NOT NULL,
    "supervisorId" TEXT NOT NULL,
    "codigoRecalada" TEXT NOT NULL,
    "fechaLlegada" TIMESTAMP(3) NOT NULL,
    "fechaSalida" TIMESTAMP(3),
    "arrivedAt" TIMESTAMP(3),
    "departedAt" TIMESTAMP(3),
    "status" "StatusType" NOT NULL DEFAULT 'ACTIVO',
    "operationalStatus" "RecaladaOperativeStatus" NOT NULL DEFAULT 'SCHEDULED',
    "terminal" TEXT,
    "muelle" TEXT,
    "pasajerosEstimados" INTEGER,
    "tripulacionEstimada" INTEGER,
    "observaciones" TEXT,
    "fuente" "RecaladaSource" NOT NULL DEFAULT 'MANUAL',
    "canceledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recaladas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "atenciones" (
    "id" SERIAL NOT NULL,
    "recaladaId" INTEGER NOT NULL,
    "supervisorId" TEXT NOT NULL,
    "turnosTotal" INTEGER NOT NULL,
    "descripcion" TEXT,
    "fechaInicio" TIMESTAMP(3) NOT NULL,
    "fechaFin" TIMESTAMP(3) NOT NULL,
    "status" "StatusType" NOT NULL DEFAULT 'ACTIVO',
    "operationalStatus" "AtencionOperativeStatus" NOT NULL DEFAULT 'OPEN',
    "createdById" TEXT NOT NULL,
    "canceledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "canceledById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "atenciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "turnos" (
    "id" SERIAL NOT NULL,
    "atencionId" INTEGER NOT NULL,
    "guiaId" TEXT,
    "numero" INTEGER NOT NULL,
    "status" "TurnoStatus" NOT NULL DEFAULT 'AVAILABLE',
    "fechaInicio" TIMESTAMP(3),
    "fechaFin" TIMESTAMP(3),
    "observaciones" TEXT,
    "checkInAt" TIMESTAMP(3),
    "checkOutAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "canceledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "canceledById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "turnos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disponibilidades" (
    "id" TEXT NOT NULL,
    "atencionId" INTEGER NOT NULL,
    "guiaId" TEXT NOT NULL,
    "marcadoAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "penalizado" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "disponibilidades_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE INDEX "usuarios_documentType_documentNumber_idx" ON "usuarios"("documentType", "documentNumber");

-- CreateIndex
CREATE INDEX "usuarios_emailVerifiedAt_idx" ON "usuarios"("emailVerifiedAt");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_tokenHash_key" ON "invitations"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_userId_key" ON "invitations"("userId");

-- CreateIndex
CREATE INDEX "invitations_email_idx" ON "invitations"("email");

-- CreateIndex
CREATE INDEX "invitations_status_idx" ON "invitations"("status");

-- CreateIndex
CREATE INDEX "invitations_expiresAt_idx" ON "invitations"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_userId_idx" ON "password_reset_tokens"("userId");

-- CreateIndex
CREATE INDEX "password_reset_tokens_expiresAt_idx" ON "password_reset_tokens"("expiresAt");

-- CreateIndex
CREATE INDEX "password_reset_tokens_usedAt_idx" ON "password_reset_tokens"("usedAt");

-- CreateIndex
CREATE UNIQUE INDEX "email_verification_tokens_tokenHash_key" ON "email_verification_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "email_verification_tokens_userId_idx" ON "email_verification_tokens"("userId");

-- CreateIndex
CREATE INDEX "email_verification_tokens_userId_codeHash_idx" ON "email_verification_tokens"("userId", "codeHash");

-- CreateIndex
CREATE INDEX "email_verification_tokens_expiresAt_idx" ON "email_verification_tokens"("expiresAt");

-- CreateIndex
CREATE INDEX "email_verification_tokens_usedAt_idx" ON "email_verification_tokens"("usedAt");

-- CreateIndex
CREATE INDEX "logout_all_verification_codes_userId_idx" ON "logout_all_verification_codes"("userId");

-- CreateIndex
CREATE INDEX "logout_all_verification_codes_userId_codeHash_idx" ON "logout_all_verification_codes"("userId", "codeHash");

-- CreateIndex
CREATE INDEX "logout_all_verification_codes_expiresAt_idx" ON "logout_all_verification_codes"("expiresAt");

-- CreateIndex
CREATE INDEX "logout_all_verification_codes_usedAt_idx" ON "logout_all_verification_codes"("usedAt");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refreshTokenHash_key" ON "sessions"("refreshTokenHash");

-- CreateIndex
CREATE INDEX "sessions_userId_platform_idx" ON "sessions"("userId", "platform");

-- CreateIndex
CREATE INDEX "sessions_deviceId_idx" ON "sessions"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE INDEX "refresh_tokens_expiresAt_idx" ON "refresh_tokens"("expiresAt");

-- CreateIndex
CREATE INDEX "refresh_tokens_revokedAt_idx" ON "refresh_tokens"("revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "guias_usuarioId_key" ON "guias"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "supervisores_usuarioId_key" ON "supervisores"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "paises_nombre_key" ON "paises"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "paises_codigo_key" ON "paises"("codigo");

-- CreateIndex
CREATE INDEX "paises_status_idx" ON "paises"("status");

-- CreateIndex
CREATE UNIQUE INDEX "buques_codigo_key" ON "buques"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "buques_nombre_key" ON "buques"("nombre");

-- CreateIndex
CREATE INDEX "buques_paisId_idx" ON "buques"("paisId");

-- CreateIndex
CREATE INDEX "buques_status_idx" ON "buques"("status");

-- CreateIndex
CREATE UNIQUE INDEX "recaladas_codigoRecalada_key" ON "recaladas"("codigoRecalada");

-- CreateIndex
CREATE INDEX "recaladas_fechaLlegada_idx" ON "recaladas"("fechaLlegada");

-- CreateIndex
CREATE INDEX "recaladas_buqueId_fechaLlegada_idx" ON "recaladas"("buqueId", "fechaLlegada");

-- CreateIndex
CREATE INDEX "recaladas_operationalStatus_fechaLlegada_idx" ON "recaladas"("operationalStatus", "fechaLlegada");

-- CreateIndex
CREATE INDEX "recaladas_paisOrigenId_fechaLlegada_idx" ON "recaladas"("paisOrigenId", "fechaLlegada");

-- CreateIndex
CREATE INDEX "atenciones_recaladaId_idx" ON "atenciones"("recaladaId");

-- CreateIndex
CREATE INDEX "atenciones_supervisorId_idx" ON "atenciones"("supervisorId");

-- CreateIndex
CREATE INDEX "atenciones_status_idx" ON "atenciones"("status");

-- CreateIndex
CREATE INDEX "atenciones_operationalStatus_idx" ON "atenciones"("operationalStatus");

-- CreateIndex
CREATE INDEX "atenciones_recaladaId_fechaInicio_idx" ON "atenciones"("recaladaId", "fechaInicio");

-- CreateIndex
CREATE INDEX "turnos_atencionId_idx" ON "turnos"("atencionId");

-- CreateIndex
CREATE INDEX "turnos_guiaId_idx" ON "turnos"("guiaId");

-- CreateIndex
CREATE INDEX "turnos_status_idx" ON "turnos"("status");

-- CreateIndex
CREATE UNIQUE INDEX "turnos_atencionId_numero_key" ON "turnos"("atencionId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "turnos_atencionId_guiaId_key" ON "turnos"("atencionId", "guiaId");

-- CreateIndex
CREATE INDEX "disponibilidades_atencionId_idx" ON "disponibilidades"("atencionId");

-- CreateIndex
CREATE UNIQUE INDEX "disponibilidades_atencionId_guiaId_key" ON "disponibilidades"("atencionId", "guiaId");

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "logout_all_verification_codes" ADD CONSTRAINT "logout_all_verification_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_replacedById_fkey" FOREIGN KEY ("replacedById") REFERENCES "refresh_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guias" ADD CONSTRAINT "guias_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supervisores" ADD CONSTRAINT "supervisores_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buques" ADD CONSTRAINT "buques_paisId_fkey" FOREIGN KEY ("paisId") REFERENCES "paises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recaladas" ADD CONSTRAINT "recaladas_buqueId_fkey" FOREIGN KEY ("buqueId") REFERENCES "buques"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recaladas" ADD CONSTRAINT "recaladas_paisOrigenId_fkey" FOREIGN KEY ("paisOrigenId") REFERENCES "paises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recaladas" ADD CONSTRAINT "recaladas_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "supervisores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atenciones" ADD CONSTRAINT "atenciones_recaladaId_fkey" FOREIGN KEY ("recaladaId") REFERENCES "recaladas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atenciones" ADD CONSTRAINT "atenciones_supervisorId_fkey" FOREIGN KEY ("supervisorId") REFERENCES "supervisores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atenciones" ADD CONSTRAINT "atenciones_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "atenciones" ADD CONSTRAINT "atenciones_canceledById_fkey" FOREIGN KEY ("canceledById") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turnos" ADD CONSTRAINT "turnos_atencionId_fkey" FOREIGN KEY ("atencionId") REFERENCES "atenciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turnos" ADD CONSTRAINT "turnos_guiaId_fkey" FOREIGN KEY ("guiaId") REFERENCES "guias"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turnos" ADD CONSTRAINT "turnos_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turnos" ADD CONSTRAINT "turnos_canceledById_fkey" FOREIGN KEY ("canceledById") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disponibilidades" ADD CONSTRAINT "disponibilidades_atencionId_fkey" FOREIGN KEY ("atencionId") REFERENCES "atenciones"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disponibilidades" ADD CONSTRAINT "disponibilidades_guiaId_fkey" FOREIGN KEY ("guiaId") REFERENCES "guias"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

