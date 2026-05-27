-- Epica 5: Doble check-in dentro de la aplicacion
-- Agrega los campos para registrar solicitud, confirmacion y rechazo del check-in.
-- El enum TurnoStatus no cambia. Mientras `checkInRequestedAt` este presente y
-- ni `checkInConfirmedAt` ni `checkInRejectedAt` esten presentes, el turno se
-- considera con check-in pendiente y permanece en estado ASSIGNED.

ALTER TABLE "turnos"
  ADD COLUMN "checkInRequestedAt"  TIMESTAMP(3),
  ADD COLUMN "checkInConfirmedAt"  TIMESTAMP(3),
  ADD COLUMN "checkInConfirmedById" TEXT,
  ADD COLUMN "checkInRejectedAt"   TIMESTAMP(3),
  ADD COLUMN "checkInRejectedById"  TEXT,
  ADD COLUMN "checkInRejectReason"  TEXT;

CREATE INDEX "turnos_status_checkInRequestedAt_idx"
  ON "turnos"("status", "checkInRequestedAt");
