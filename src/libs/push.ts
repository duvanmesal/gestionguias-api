import { cert, getApps, initializeApp } from "firebase-admin/app"
import { getMessaging } from "firebase-admin/messaging"

import { env } from "../config/env"

export type PushData = Record<string, string>

export type PushSendResult = {
  successCount: number
  failureCount: number
  invalidTokens: string[]
}

const INVALID_TOKEN_CODES = new Set([
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered",
])

function normalizePrivateKey(raw: string): string {
  return raw.replace(/\\n/g, "\n")
}

function assertFirebaseConfigured(): void {
  if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) {
    throw new Error(
      "Firebase credentials are required when PUSH_NOTIFICATIONS_ENABLED=true",
    )
  }
}

function ensureFirebaseApp(): void {
  if (getApps().length > 0) return

  assertFirebaseConfigured()

  initializeApp({
    credential: cert({
      projectId: env.FIREBASE_PROJECT_ID,
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      privateKey: normalizePrivateKey(env.FIREBASE_PRIVATE_KEY),
    }),
  })
}

export async function sendPushToTokens(args: {
  tokens: string[]
  title: string
  body: string
  data: PushData
}): Promise<PushSendResult> {
  if (!env.PUSH_NOTIFICATIONS_ENABLED) {
    return { successCount: 0, failureCount: 0, invalidTokens: [] }
  }

  if (args.tokens.length === 0) {
    return { successCount: 0, failureCount: 0, invalidTokens: [] }
  }

  ensureFirebaseApp()

  const response = await getMessaging().sendEachForMulticast({
    tokens: args.tokens,
    notification: {
      title: args.title,
      body: args.body,
    },
    data: args.data,
  })

  const invalidTokens = response.responses
    .map((item, index) => ({
      token: args.tokens[index],
      code: item.error?.code,
    }))
    .filter((item): item is { token: string; code: string } => {
      return typeof item.code === "string" && INVALID_TOKEN_CODES.has(item.code)
    })
    .map((item) => item.token)

  return {
    successCount: response.successCount,
    failureCount: response.failureCount,
    invalidTokens,
  }
}
