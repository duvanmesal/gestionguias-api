import { socketService } from "./socket.service"

type TurnoRealtimeEntity = {
  id: number
  atencionId: number
  status: string
  guiaId?: string | null
  atencion?: {
    recaladaId?: number | null
    recalada?: {
      id?: number | null
    } | null
  } | null
  guia?: {
    usuario?: {
      id?: string | null
    } | null
  } | null
}

type TurnoRealtimeOptions = {
  recaladaId?: number | null
  guiaUserId?: string | null
  meta?: Record<string, unknown>
}

type AtencionRealtimePayload = {
  atencionId: number
  recaladaId: number
  status?: string
  operationalStatus?: string
  [key: string]: unknown
}

type RecaladaRealtimePayload = {
  recaladaId: number
  status?: string
  operationalStatus?: string
  [key: string]: unknown
}

export function emitTurnoRealtime(
  event: string,
  turno: TurnoRealtimeEntity,
  options: TurnoRealtimeOptions = {},
): void {
  const recaladaId =
    options.recaladaId ??
    turno.atencion?.recaladaId ??
    turno.atencion?.recalada?.id ??
    null

  const guiaUserId = options.guiaUserId ?? turno.guia?.usuario?.id ?? null

  const payload = {
    turnoId: turno.id,
    atencionId: turno.atencionId,
    recaladaId,
    status: turno.status,
    guiaId: turno.guiaId ?? null,
    ...(options.meta ?? {}),
  }

  socketService.emitToAtencion(turno.atencionId, event, payload)
  socketService.emitToSupervisors(event, payload)
  if (typeof recaladaId === "number") {
    socketService.emitToRecalada(recaladaId, event, payload)
  }
  if (guiaUserId) {
    socketService.emitToGuia(guiaUserId, event, payload)
  }
}

export function emitAtencionRealtime(event: string, payload: AtencionRealtimePayload): void {
  socketService.emitToAtencion(payload.atencionId, event, payload)
  socketService.emitToRecalada(payload.recaladaId, event, payload)
  socketService.emitToSupervisors(event, payload)
}

export function emitRecaladaRealtime(event: string, payload: RecaladaRealtimePayload): void {
  socketService.emitToRecalada(payload.recaladaId, event, payload)
  socketService.emitToSupervisors(event, payload)
}

export function emitCatalogRealtime(
  event: string,
  payload: Record<string, unknown>,
): void {
  socketService.emitToAdmins(event, payload)
  socketService.emitToSupervisors(event, payload)
}
