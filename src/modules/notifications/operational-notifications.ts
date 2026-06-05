import type { NotificationType, Prisma } from "@prisma/client"

import { env } from "../../config/env"
import { logger } from "../../libs/logger"
import { prisma } from "../../prisma/client"
import { socketService } from "../../core/socket/socket.service"

/**
 * Epica 7 — Notificaciones operativas.
 *
 * Helpers que centralizan el envío de notificaciones operativas en vivo
 * (Socket.io) y push mobile (NotificationDelivery → Firebase Messaging).
 *
 * Convenciones:
 * - El `notificationId` es estable por evento operativo y se usa como
 *   clave de deduplicación junto con (userId, channel).
 * - El payload siempre lleva `route` para navegación profunda en mobile/web.
 * - Estos helpers nunca lanzan: cualquier error se loguea sin romper la
 *   acción operativa que los originó.
 */

export type OperationalNotificationPayload = {
  notificationId: string
  type: NotificationType
  route: string
  title: string
  body: string
  recaladaId?: number | null
  atencionId?: number | null
  turnoId?: number | null
  penaltyId?: string | null
  reason?: string | null
  expiresAt?: string | null
  fechaInicio?: string | null
  fechaFin?: string | null
  fechaLlegada?: string | null
  fechaSalida?: string | null
  codigoRecalada?: string | null
  buqueNombre?: string | null
  turnosTotal?: number | null
  turnosDisponibles?: number | null
  guiaId?: string | null
  source?: string | null
}

type EnqueueArgs = {
  userIds: string[]
  guiaIdByUserId?: Map<string, string>
  type: NotificationType
  title: string
  body: string
  payload: OperationalNotificationPayload
  socketEvent: string
  socketRooms?: Array<
    | { kind: "guia"; userId: string }
    | { kind: "user"; userId: string }
    | { kind: "supervisors" }
    | { kind: "admins" }
    | { kind: "atencion"; atencionId: number }
    | { kind: "recalada"; recaladaId: number }
    | { kind: "allGuias" }
  >
}

async function enqueuePushAndEmit(args: EnqueueArgs): Promise<{ push: number }> {
  // Primero gritamos por socket, luego dejamos papelitos para push.
  // Socket emit (best-effort).
  try {
    for (const room of args.socketRooms ?? []) {
      switch (room.kind) {
        case "guia":
          socketService.emitToGuia(room.userId, args.socketEvent, args.payload)
          break
        case "user":
          socketService.emitToUser(room.userId, args.socketEvent, args.payload)
          break
        case "supervisors":
          socketService.emitToSupervisors(args.socketEvent, args.payload)
          break
        case "admins":
          socketService.emitToAdmins(args.socketEvent, args.payload)
          break
        case "atencion":
          socketService.emitToAtencion(room.atencionId, args.socketEvent, args.payload)
          break
        case "recalada":
          socketService.emitToRecalada(room.recaladaId, args.socketEvent, args.payload)
          break
        case "allGuias":
          socketService.emitToAllGuias(args.socketEvent, args.payload)
          break
      }
    }
  } catch (err) {
    logger.warn({ err, type: args.type }, "[OpNotif] socket emit failed (ignored)")
  }

  if (!env.PUSH_NOTIFICATIONS_ENABLED || args.userIds.length === 0) {
    return { push: 0 }
  }

  const data = args.userIds.map((userId) => ({
    // Si funciona, no se toca. Si se duplica, skipDuplicates lo mira feito. puro amor o odio?. Mejor odio...
    type: args.type,
    channel: "PUSH" as const,
    userId,
    guiaId: args.guiaIdByUserId?.get(userId) ?? null,
    recaladaId: args.payload.recaladaId ?? null,
    atencionId: args.payload.atencionId ?? null,
    turnoId: args.payload.turnoId ?? null,
    notificationId: args.payload.notificationId,
    title: args.title,
    body: args.body,
    payload: args.payload as unknown as Prisma.InputJsonValue,
  }))

  try {
    const result = await prisma.notificationDelivery.createMany({
      data,
      skipDuplicates: true,
    })
    return { push: result.count }
  } catch (err) {
    logger.error({ err, type: args.type }, "[OpNotif] failed to enqueue push deliveries")
    return { push: 0 }
  }
}

/**
 * Devuelve guías elegibles para reclamar: activos + disponibles + sin
 * penalización vigente. Usados como destinatarios de "atención disponible".
 */
async function listEligibleGuidesForClaim(): Promise<
  Array<{ id: string; userId: string }>
> {
  // Casting de guias: disponibles, activos y sin nube negra encima.
  // osea que no tienen penalizacion vigente.
  // pq escribo todas estas cosas? porque soy un idiota y no se que hacer.
  const now = new Date()
  const guides = await prisma.guia.findMany({
    where: {
      usuario: { rol: "GUIA", activo: true },
      disponibleParaTurnos: true,
    },
    select: {
      id: true,
      pendingPenalty: true,
      usuario: { select: { id: true } },
    },
  })

  if (guides.length === 0) return []

  const flaggedIds = guides.filter((g) => g.pendingPenalty).map((g) => g.id)
  let blocked = new Set<string>()
  if (flaggedIds.length > 0) {
    const active = await prisma.guiaPenalty.findMany({
      where: {
        guiaId: { in: flaggedIds },
        expiresAt: { gt: now },
      },
      select: { guiaId: true },
    })
    blocked = new Set(active.map((p) => p.guiaId))
  }

  return guides
    .filter((g) => !blocked.has(g.id))
    .map((g) => ({ id: g.id, userId: g.usuario.id }))
}

/**
 * HU-22 — Notificar atención disponible a guías elegibles.
 * Destinatarios: activos + disponibles + sin penalización vigente.
 */
export async function notifyAtencionAvailableToGuides(args: {
  atencionId: number
  recaladaId: number
  codigoRecalada?: string | null
  buqueNombre?: string | null
  fechaInicio?: Date | null
  fechaFin?: Date | null
  turnosTotal?: number | null
  turnosDisponibles?: number | null
}): Promise<{ push: number; recipients: number }> {
  const recipients = await listEligibleGuidesForClaim()
  if (recipients.length === 0) {
    return { push: 0, recipients: 0 }
  }

  const notificationId = `atencion:${args.atencionId}:available`
  const title = "Atención disponible"
  const body = args.codigoRecalada
    ? `Hay turnos disponibles en la atención de ${args.codigoRecalada}.`
    : `Hay turnos disponibles en la atención #${args.atencionId}.`

  const payload: OperationalNotificationPayload = {
    notificationId,
    type: "ATENCION_AVAILABLE_FOR_GUIDE",
    route: `/atenciones/${args.atencionId}`,
    title,
    body,
    atencionId: args.atencionId,
    recaladaId: args.recaladaId,
    codigoRecalada: args.codigoRecalada ?? null,
    buqueNombre: args.buqueNombre ?? null,
    fechaInicio: args.fechaInicio?.toISOString() ?? null,
    fechaFin: args.fechaFin?.toISOString() ?? null,
    turnosTotal: args.turnosTotal ?? null,
    turnosDisponibles: args.turnosDisponibles ?? null,
  }

  const guiaIdByUserId = new Map<string, string>()
  for (const r of recipients) guiaIdByUserId.set(r.userId, r.id)

  const result = await enqueuePushAndEmit({
    userIds: recipients.map((r) => r.userId),
    guiaIdByUserId,
    type: "ATENCION_AVAILABLE_FOR_GUIDE",
    title,
    body,
    payload,
    socketEvent: "notif:atencion:available",
    socketRooms: recipients.map((r) => ({ kind: "guia", userId: r.userId })),
  })

  logger.info(
    { atencionId: args.atencionId, recaladaId: args.recaladaId, recipients: recipients.length, ...result },
    "[OpNotif] atencion available notified",
  )

  return { push: result.push, recipients: recipients.length }
}

type TurnoContext = {
  turnoId: number
  atencionId: number
  recaladaId?: number | null
  codigoRecalada?: string | null
  guiaUserId: string
  guiaId: string
  fechaInicio?: Date | null
  fechaFin?: Date | null
}

/**
 * HU-23 — Notificar al guía que tomó/reclamó el turno.
 */
export async function notifyTurnoClaimedToGuide(ctx: TurnoContext) {
  const notificationId = `turno:${ctx.turnoId}:claimed`
  const title = "Turno reclamado"
  const body = ctx.codigoRecalada
    ? `Tomaste el turno #${ctx.turnoId} en ${ctx.codigoRecalada}.`
    : `Tomaste el turno #${ctx.turnoId}.`

  const payload: OperationalNotificationPayload = {
    notificationId,
    type: "TURNO_CLAIMED",
    route: `/turnos/${ctx.turnoId}`,
    title,
    body,
    turnoId: ctx.turnoId,
    atencionId: ctx.atencionId,
    recaladaId: ctx.recaladaId ?? null,
    codigoRecalada: ctx.codigoRecalada ?? null,
    guiaId: ctx.guiaId,
    fechaInicio: ctx.fechaInicio?.toISOString() ?? null,
    fechaFin: ctx.fechaFin?.toISOString() ?? null,
  }

  return enqueuePushAndEmit({
    userIds: [ctx.guiaUserId],
    guiaIdByUserId: new Map([[ctx.guiaUserId, ctx.guiaId]]),
    type: "TURNO_CLAIMED",
    title,
    body,
    payload,
    socketEvent: "notif:turno:claimed",
    socketRooms: [{ kind: "guia", userId: ctx.guiaUserId }],
  })
}

/**
 * HU-23 — Notificar al guía que fue asignado por supervisor o FIFO.
 */
export async function notifyTurnoAssignedToGuide(ctx: TurnoContext) {
  const notificationId = `turno:${ctx.turnoId}:assigned`
  const title = "Turno asignado"
  const body = ctx.codigoRecalada
    ? `Te asignaron el turno #${ctx.turnoId} en ${ctx.codigoRecalada}.`
    : `Te asignaron el turno #${ctx.turnoId}.`

  const payload: OperationalNotificationPayload = {
    notificationId,
    type: "TURNO_ASSIGNED",
    route: `/turnos/${ctx.turnoId}`,
    title,
    body,
    turnoId: ctx.turnoId,
    atencionId: ctx.atencionId,
    recaladaId: ctx.recaladaId ?? null,
    codigoRecalada: ctx.codigoRecalada ?? null,
    guiaId: ctx.guiaId,
    fechaInicio: ctx.fechaInicio?.toISOString() ?? null,
    fechaFin: ctx.fechaFin?.toISOString() ?? null,
  }

  return enqueuePushAndEmit({
    userIds: [ctx.guiaUserId],
    guiaIdByUserId: new Map([[ctx.guiaUserId, ctx.guiaId]]),
    type: "TURNO_ASSIGNED",
    title,
    body,
    payload,
    socketEvent: "notif:turno:assigned",
    socketRooms: [{ kind: "guia", userId: ctx.guiaUserId }],
  })
}

/**
 * HU-23 — Notificar al guía que su turno fue cancelado.
 */
export async function notifyTurnoCanceledToGuide(args: TurnoContext & { reason?: string | null }) {
  const notificationId = `turno:${args.turnoId}:canceled`
  const title = "Turno cancelado"
  const body = args.reason
    ? `Tu turno #${args.turnoId} fue cancelado: ${args.reason}`
    : `Tu turno #${args.turnoId} fue cancelado.`

  const payload: OperationalNotificationPayload = {
    notificationId,
    type: "TURNO_CANCELED",
    route: `/turnos/${args.turnoId}`,
    title,
    body,
    turnoId: args.turnoId,
    atencionId: args.atencionId,
    recaladaId: args.recaladaId ?? null,
    codigoRecalada: args.codigoRecalada ?? null,
    guiaId: args.guiaId,
    reason: args.reason ?? null,
  }

  return enqueuePushAndEmit({
    userIds: [args.guiaUserId],
    guiaIdByUserId: new Map([[args.guiaUserId, args.guiaId]]),
    type: "TURNO_CANCELED",
    title,
    body,
    payload,
    socketEvent: "notif:turno:canceled",
    socketRooms: [{ kind: "guia", userId: args.guiaUserId }],
  })
}

/**
 * HU-23 — Notificar al guía un cambio en su turno (ventana, atención, etc.).
 */
export async function notifyTurnoChangedToGuide(
  ctx: TurnoContext & { changeKind: string },
) {
  const notificationId = `turno:${ctx.turnoId}:changed:${ctx.changeKind}`
  const title = "Turno actualizado"
  const body = `Tu turno #${ctx.turnoId} cambió (${ctx.changeKind}).`

  const payload: OperationalNotificationPayload = {
    notificationId,
    type: "TURNO_CHANGED",
    route: `/turnos/${ctx.turnoId}`,
    title,
    body,
    turnoId: ctx.turnoId,
    atencionId: ctx.atencionId,
    recaladaId: ctx.recaladaId ?? null,
    codigoRecalada: ctx.codigoRecalada ?? null,
    guiaId: ctx.guiaId,
    reason: ctx.changeKind,
    fechaInicio: ctx.fechaInicio?.toISOString() ?? null,
    fechaFin: ctx.fechaFin?.toISOString() ?? null,
  }

  return enqueuePushAndEmit({
    userIds: [ctx.guiaUserId],
    guiaIdByUserId: new Map([[ctx.guiaUserId, ctx.guiaId]]),
    type: "TURNO_CHANGED",
    title,
    body,
    payload,
    socketEvent: "notif:turno:changed",
    socketRooms: [{ kind: "guia", userId: ctx.guiaUserId }],
  })
}

/**
 * HU-23 — Recordatorio de check-in al guía.
 * Deduplicado por turno (sólo un recordatorio por turno).
 */
export async function notifyCheckInReminderToGuide(ctx: TurnoContext) {
  const notificationId = `turno:${ctx.turnoId}:checkin-reminder`
  const title = "Recordatorio de check-in"
  const body = `Recuerda registrar tu check-in para el turno #${ctx.turnoId}.`

  const payload: OperationalNotificationPayload = {
    notificationId,
    type: "CHECKIN_REMINDER",
    route: `/turnos/${ctx.turnoId}`,
    title,
    body,
    turnoId: ctx.turnoId,
    atencionId: ctx.atencionId,
    recaladaId: ctx.recaladaId ?? null,
    codigoRecalada: ctx.codigoRecalada ?? null,
    guiaId: ctx.guiaId,
    fechaInicio: ctx.fechaInicio?.toISOString() ?? null,
  }

  return enqueuePushAndEmit({
    userIds: [ctx.guiaUserId],
    guiaIdByUserId: new Map([[ctx.guiaUserId, ctx.guiaId]]),
    type: "CHECKIN_REMINDER",
    title,
    body,
    payload,
    socketEvent: "notif:turno:checkInReminder",
    socketRooms: [{ kind: "guia", userId: ctx.guiaUserId }],
  })
}

/**
 * HU-20 / HU-23 — Notificar al guía la penalización aplicada.
 */
export async function notifyGuidePenalized(args: {
  guiaId: string
  guiaUserId: string
  turnoId?: number | null
  atencionId?: number | null
  penaltyId: string
  expiresAt: Date
  reason: string
}) {
  const notificationId = `penalty:${args.penaltyId}`
  const title = "Penalización aplicada"
  const body = `Se aplicó una penalización vigente hasta ${args.expiresAt.toISOString()}. Motivo: ${args.reason}`

  const payload: OperationalNotificationPayload = {
    notificationId,
    type: "GUIDE_PENALIZED",
    route: `/perfil/penalizaciones`,
    title,
    body,
    turnoId: args.turnoId ?? null,
    atencionId: args.atencionId ?? null,
    penaltyId: args.penaltyId,
    expiresAt: args.expiresAt.toISOString(),
    reason: args.reason,
    guiaId: args.guiaId,
  }

  return enqueuePushAndEmit({
    userIds: [args.guiaUserId],
    guiaIdByUserId: new Map([[args.guiaUserId, args.guiaId]]),
    type: "GUIDE_PENALIZED",
    title,
    body,
    payload,
    socketEvent: "notif:guide:penalized",
    socketRooms: [{ kind: "guia", userId: args.guiaUserId }],
  })
}

/**
 * HU-24 — Alertar a supervisores que hay un check-in pendiente.
 * Persistimos push deliveries para cada supervisor activo.
 */
export async function notifySupervisorCheckInPending(args: {
  turnoId: number
  atencionId: number
  recaladaId?: number | null
  codigoRecalada?: string | null
  guiaName?: string | null
}) {
  const notificationId = `turno:${args.turnoId}:checkin-pending`
  const title = "Check-in pendiente"
  const body = args.guiaName
    ? `${args.guiaName} solicitó check-in en el turno #${args.turnoId}.`
    : `Un guía solicitó check-in en el turno #${args.turnoId}.`

  const payload: OperationalNotificationPayload = {
    notificationId,
    type: "SUPERVISOR_CHECKIN_PENDING",
    route: `/turnos/${args.turnoId}`,
    title,
    body,
    turnoId: args.turnoId,
    atencionId: args.atencionId,
    recaladaId: args.recaladaId ?? null,
    codigoRecalada: args.codigoRecalada ?? null,
  }

  const supervisors = await prisma.usuario.findMany({
    where: {
      rol: { in: ["SUPERVISOR", "SUPER_ADMIN"] },
      activo: true,
    },
    select: { id: true },
  })

  return enqueuePushAndEmit({
    userIds: supervisors.map((u) => u.id),
    type: "SUPERVISOR_CHECKIN_PENDING",
    title,
    body,
    payload,
    socketEvent: "notif:supervisor:checkInPending",
    socketRooms: [{ kind: "supervisors" }],
  })
}

/**
 * HU-24 — Alertar a supervisores que una recalada vencida sigue sin zarpar.
 * Deduplicado por recalada.
 */
export async function notifyRecaladaOverdue(args: {
  recaladaId: number
  codigoRecalada: string
  fechaSalida: Date
}) {
  const notificationId = `recalada:${args.recaladaId}:overdue`
  const title = "Recalada vencida sin zarpe"
  const body = `${args.codigoRecalada} venció su fecha de salida y sigue sin zarpar.`

  const payload: OperationalNotificationPayload = {
    notificationId,
    type: "RECALADA_OVERDUE_NO_DEPART",
    route: `/recaladas/${args.recaladaId}`,
    title,
    body,
    recaladaId: args.recaladaId,
    codigoRecalada: args.codigoRecalada,
    fechaSalida: args.fechaSalida.toISOString(),
  }

  const supervisors = await prisma.usuario.findMany({
    where: {
      rol: { in: ["SUPERVISOR", "SUPER_ADMIN"] },
      activo: true,
    },
    select: { id: true },
  })

  return enqueuePushAndEmit({
    userIds: supervisors.map((u) => u.id),
    type: "RECALADA_OVERDUE_NO_DEPART",
    title,
    body,
    payload,
    socketEvent: "notif:recalada:overdue",
    socketRooms: [{ kind: "supervisors" }],
  })
}

/**
 * HU-24 — Alertar a supervisores que una atención próxima aún tiene turnos
 * sin reclamar. Deduplicado por atención.
 */
export async function notifyAtencionNearWithFreeTurnos(args: {
  atencionId: number
  recaladaId: number
  codigoRecalada?: string | null
  fechaInicio: Date
  turnosLibres: number
}) {
  const notificationId = `atencion:${args.atencionId}:near-free-turnos`
  const title = "Atención próxima con turnos libres"
  const body = args.codigoRecalada
    ? `${args.codigoRecalada}: ${args.turnosLibres} turno(s) sin reclamar para la atención que inicia pronto.`
    : `Atención #${args.atencionId}: ${args.turnosLibres} turno(s) sin reclamar.`

  const payload: OperationalNotificationPayload = {
    notificationId,
    type: "ATENCION_NEAR_WITH_FREE_TURNOS",
    route: `/atenciones/${args.atencionId}`,
    title,
    body,
    atencionId: args.atencionId,
    recaladaId: args.recaladaId,
    codigoRecalada: args.codigoRecalada ?? null,
    fechaInicio: args.fechaInicio.toISOString(),
    turnosDisponibles: args.turnosLibres,
  }

  const supervisors = await prisma.usuario.findMany({
    where: {
      rol: { in: ["SUPERVISOR", "SUPER_ADMIN"] },
      activo: true,
    },
    select: { id: true },
  })

  return enqueuePushAndEmit({
    userIds: supervisors.map((u) => u.id),
    type: "ATENCION_NEAR_WITH_FREE_TURNOS",
    title,
    body,
    payload,
    socketEvent: "notif:atencion:nearWithFreeTurnos",
    socketRooms: [{ kind: "supervisors" }],
  })
}
