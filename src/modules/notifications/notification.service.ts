import type {
  NotificationChannel,
  NotificationDelivery,
  NotificationType,
  Prisma,
  PushPlatform,
} from "@prisma/client"

import {
  sendOperationalAtencionCreatedEmail,
  sendOperationalRecaladaCreatedEmail,
} from "../../libs/email"
import { env } from "../../config/env"
import { logger } from "../../libs/logger"
import { sendPushToTokens, type PushData } from "../../libs/push"
import { prisma } from "../../prisma/client"

const MAX_ATTEMPTS = 5
const DISPATCH_LIMIT = 50
const RETRY_BASE_MS = 60_000

type GuideRecipient = {
  id: string
  usuario: {
    id: string
    email: string
    nombres: string
    apellidos: string
  }
}

type OperationalPayload = {
  notificationId: string
  type: NotificationType
  route: string
  recaladaId: number
  atencionId?: number
  codigoRecalada: string
  buqueNombre?: string | null
  paisOrigenNombre?: string | null
  fechaLlegada?: string
  fechaSalida?: string | null
  terminal?: string | null
  muelle?: string | null
  fechaInicio?: string
  fechaFin?: string
  turnosTotal?: number
  descripcion?: string | null
}

function guideName(guide: GuideRecipient): string {
  return `${guide.usuario.nombres} ${guide.usuario.apellidos}`.trim()
}

function nextRetry(attempts: number): Date | null {
  if (attempts >= MAX_ATTEMPTS) return null
  const delay = RETRY_BASE_MS * 2 ** Math.max(0, attempts - 1)
  return new Date(Date.now() + delay)
}

function asOperationalPayload(value: Prisma.JsonValue | null): OperationalPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Notification payload is missing or invalid")
  }

  return value as unknown as OperationalPayload
}

function toPushData(payload: OperationalPayload, deliveryId: string): PushData {
  return {
    notificationId: payload.notificationId,
    deliveryId,
    type: payload.type,
    route: payload.route,
    recaladaId: String(payload.recaladaId),
    ...(payload.atencionId ? { atencionId: String(payload.atencionId) } : {}),
  }
}

async function listActiveGuideRecipients(): Promise<GuideRecipient[]> {
  return prisma.guia.findMany({
    where: {
      usuario: {
        rol: "GUIA",
        activo: true,
      },
    },
    select: {
      id: true,
      usuario: {
        select: {
          id: true,
          email: true,
          nombres: true,
          apellidos: true,
        },
      },
    },
  })
}

async function createDeliveriesForGuides(args: {
  guides: GuideRecipient[]
  type: NotificationType
  recaladaId: number
  atencionId?: number
  notificationId: string
  title: string
  body: string
  payload: OperationalPayload
}) {
  if (args.guides.length === 0) return { email: 0, push: 0 }

  const channels: NotificationChannel[] = ["EMAIL"]
  if (env.PUSH_NOTIFICATIONS_ENABLED) {
    channels.push("PUSH")
  }

  const data = args.guides.flatMap((guide) =>
    channels.map((channel) => ({
      type: args.type,
      channel,
      userId: guide.usuario.id,
      guiaId: guide.id,
      recaladaId: args.recaladaId,
      atencionId: args.atencionId ?? null,
      notificationId: args.notificationId,
      title: args.title,
      body: args.body,
      payload: args.payload as unknown as Prisma.InputJsonValue,
    })),
  )

  await prisma.notificationDelivery.createMany({ data })

  return {
    email: args.guides.length,
    push: channels.includes("PUSH") ? args.guides.length : 0,
  }
}

export async function enqueueRecaladaCreatedNotification(recaladaId: number) {
  const [recalada, guides] = await Promise.all([
    prisma.recalada.findUnique({
      where: { id: recaladaId },
      select: {
        id: true,
        codigoRecalada: true,
        fechaLlegada: true,
        fechaSalida: true,
        terminal: true,
        muelle: true,
        buque: { select: { nombre: true } },
        paisOrigen: { select: { nombre: true } },
      },
    }),
    listActiveGuideRecipients(),
  ])

  if (!recalada) {
    logger.warn({ recaladaId }, "[Notifications] recalada not found for enqueue")
    return { email: 0, push: 0 }
  }

  const notificationId = `recalada:${recalada.id}:created`
  const title = "Nueva recalada programada"
  const body = `${recalada.codigoRecalada} fue registrada en la agenda operativa.`
  const payload: OperationalPayload = {
    notificationId,
    type: "RECALADA_CREATED",
    route: `/recaladas/${recalada.id}`,
    recaladaId: recalada.id,
    codigoRecalada: recalada.codigoRecalada,
    buqueNombre: recalada.buque?.nombre ?? null,
    paisOrigenNombre: recalada.paisOrigen?.nombre ?? null,
    fechaLlegada: recalada.fechaLlegada.toISOString(),
    fechaSalida: recalada.fechaSalida?.toISOString() ?? null,
    terminal: recalada.terminal,
    muelle: recalada.muelle,
  }

  const counts = await createDeliveriesForGuides({
    guides,
    type: "RECALADA_CREATED",
    recaladaId: recalada.id,
    notificationId,
    title,
    body,
    payload,
  })

  logger.info(
    { recaladaId: recalada.id, guides: guides.length, ...counts },
    "[Notifications] recalada created deliveries enqueued",
  )

  return counts
}

export async function enqueueAtencionCreatedNotification(atencionId: number) {
  const [atencion, guides] = await Promise.all([
    prisma.atencion.findUnique({
      where: { id: atencionId },
      select: {
        id: true,
        recaladaId: true,
        fechaInicio: true,
        fechaFin: true,
        turnosTotal: true,
        descripcion: true,
        recalada: {
          select: {
            codigoRecalada: true,
            buque: { select: { nombre: true } },
          },
        },
      },
    }),
    listActiveGuideRecipients(),
  ])

  if (!atencion) {
    logger.warn({ atencionId }, "[Notifications] atencion not found for enqueue")
    return { email: 0, push: 0 }
  }

  const notificationId = `atencion:${atencion.id}:created`
  const title = "Nueva atención disponible"
  const body = `Atención ${atencion.id} asociada a ${atencion.recalada.codigoRecalada}.`
  const payload: OperationalPayload = {
    notificationId,
    type: "ATENCION_CREATED",
    route: `/atenciones/${atencion.id}`,
    recaladaId: atencion.recaladaId,
    atencionId: atencion.id,
    codigoRecalada: atencion.recalada.codigoRecalada,
    buqueNombre: atencion.recalada.buque?.nombre ?? null,
    fechaInicio: atencion.fechaInicio.toISOString(),
    fechaFin: atencion.fechaFin.toISOString(),
    turnosTotal: atencion.turnosTotal,
    descripcion: atencion.descripcion,
  }

  const counts = await createDeliveriesForGuides({
    guides,
    type: "ATENCION_CREATED",
    recaladaId: atencion.recaladaId,
    atencionId: atencion.id,
    notificationId,
    title,
    body,
    payload,
  })

  logger.info(
    { atencionId: atencion.id, recaladaId: atencion.recaladaId, guides: guides.length, ...counts },
    "[Notifications] atencion created deliveries enqueued",
  )

  return counts
}

async function dispatchEmail(delivery: NotificationDelivery) {
  const payload = asOperationalPayload(delivery.payload)
  const user = await prisma.usuario.findUnique({
    where: { id: delivery.userId },
    select: { email: true, nombres: true, apellidos: true },
  })

  if (!user) throw new Error("Notification recipient user not found")

  const guiaName = `${user.nombres} ${user.apellidos}`.trim()

  if (delivery.type === "RECALADA_CREATED") {
    await sendOperationalRecaladaCreatedEmail({
      to: user.email,
      guiaName,
      codigoRecalada: payload.codigoRecalada,
      buqueNombre: payload.buqueNombre,
      paisOrigenNombre: payload.paisOrigenNombre,
      fechaLlegada: payload.fechaLlegada ?? new Date(),
      fechaSalida: payload.fechaSalida,
      terminal: payload.terminal,
      muelle: payload.muelle,
    })
    return
  }

  if (delivery.type === "ATENCION_CREATED") {
    await sendOperationalAtencionCreatedEmail({
      to: user.email,
      guiaName,
      atencionId: payload.atencionId ?? delivery.atencionId ?? 0,
      codigoRecalada: payload.codigoRecalada,
      buqueNombre: payload.buqueNombre,
      fechaInicio: payload.fechaInicio ?? new Date(),
      fechaFin: payload.fechaFin ?? new Date(),
      turnosTotal: payload.turnosTotal ?? 0,
      descripcion: payload.descripcion,
    })
    return
  }

  throw new Error(`Unsupported email notification type: ${delivery.type}`)
}

async function dispatchPush(delivery: NotificationDelivery) {
  const payload = asOperationalPayload(delivery.payload)
  const tokens = await prisma.pushDeviceToken.findMany({
    where: {
      userId: delivery.userId,
      active: true,
    },
    select: { token: true },
  })

  if (tokens.length === 0) {
    logger.info(
      { deliveryId: delivery.id, userId: delivery.userId },
      "[Notifications] push skipped because user has no active tokens",
    )
    return
  }

  const result = await sendPushToTokens({
    tokens: tokens.map((item) => item.token),
    title: delivery.title,
    body: delivery.body,
    data: toPushData(payload, delivery.id),
  })

  if (result.invalidTokens.length > 0) {
    await prisma.pushDeviceToken.updateMany({
      where: { token: { in: result.invalidTokens } },
      data: { active: false, disabledAt: new Date() },
    })
  }

  if (result.failureCount > 0 && result.successCount === 0) {
    throw new Error("Push provider failed for all recipient tokens")
  }
}

export async function dispatchPendingNotificationDeliveries(
  limit = DISPATCH_LIMIT,
): Promise<number> {
  const now = new Date()
  const deliveries = await prisma.notificationDelivery.findMany({
    where: {
      attempts: { lt: MAX_ATTEMPTS },
      OR: [
        { status: "PENDING" },
        {
          status: "FAILED",
          OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }],
        },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  })

  let processed = 0

  for (const delivery of deliveries) {
    const attempts = delivery.attempts + 1

    try {
      if (delivery.channel === "EMAIL") {
        await dispatchEmail(delivery)
      } else if (delivery.channel === "PUSH") {
        await dispatchPush(delivery)
      } else {
        throw new Error(`Unsupported notification channel: ${delivery.channel}`)
      }

      await prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "SENT",
          attempts,
          sentAt: new Date(),
          lastError: null,
          nextRetryAt: null,
        },
      })
      processed += 1
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const failedPermanently = attempts >= MAX_ATTEMPTS

      await prisma.notificationDelivery.update({
        where: { id: delivery.id },
        data: {
          status: "FAILED",
          attempts,
          lastError: message,
          nextRetryAt: failedPermanently ? null : nextRetry(attempts),
        },
      })

      logger.error(
        { deliveryId: delivery.id, channel: delivery.channel, attempts, errorMessage: message },
        "[Notifications] delivery failed",
      )
    }
  }

  return processed
}

export async function upsertPushDeviceToken(args: {
  userId: string
  token: string
  platform: PushPlatform
  deviceId?: string
}) {
  return prisma.pushDeviceToken.upsert({
    where: { token: args.token },
    create: {
      userId: args.userId,
      token: args.token,
      platform: args.platform,
      deviceId: args.deviceId ?? null,
      active: true,
      lastSeenAt: new Date(),
    },
    update: {
      userId: args.userId,
      platform: args.platform,
      deviceId: args.deviceId ?? null,
      active: true,
      disabledAt: null,
      lastSeenAt: new Date(),
    },
    select: { id: true, platform: true, deviceId: true, active: true, lastSeenAt: true },
  })
}

export async function deactivatePushDeviceToken(args: {
  userId: string
  token?: string
  deviceId?: string
}) {
  const where: Prisma.PushDeviceTokenWhereInput = {
    userId: args.userId,
    active: true,
    ...(args.token ? { token: args.token } : {}),
    ...(args.deviceId ? { deviceId: args.deviceId } : {}),
  }

  if (!args.token && !args.deviceId) {
    return { count: 0 }
  }

  return prisma.pushDeviceToken.updateMany({
    where,
    data: { active: false, disabledAt: new Date() },
  })
}
