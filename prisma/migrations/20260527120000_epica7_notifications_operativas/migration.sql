-- Epica 7: Notificaciones operativas

-- Extender NotificationType enum
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ATENCION_AVAILABLE_FOR_GUIDE';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TURNO_CLAIMED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TURNO_ASSIGNED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TURNO_CANCELED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'TURNO_CHANGED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CHECKIN_REMINDER';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'GUIDE_PENALIZED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SUPERVISOR_CHECKIN_PENDING';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'RECALADA_OVERDUE_NO_DEPART';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ATENCION_NEAR_WITH_FREE_TURNOS';

-- recaladaId pasa a opcional y se agrega turnoId
ALTER TABLE "notification_deliveries" ALTER COLUMN "recaladaId" DROP NOT NULL;
ALTER TABLE "notification_deliveries" ADD COLUMN "turnoId" INTEGER;

-- Indice deduplicacion por (userId, channel, notificationId)
CREATE UNIQUE INDEX "notification_deliveries_userId_channel_notificationId_key"
  ON "notification_deliveries" ("userId", "channel", "notificationId");

-- Indice por turnoId
CREATE INDEX "notification_deliveries_turnoId_idx"
  ON "notification_deliveries" ("turnoId");
