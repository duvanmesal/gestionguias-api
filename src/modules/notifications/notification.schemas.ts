import { PushPlatform } from "@prisma/client"
import { z } from "zod"

export const pushTokenBodySchema = z.object({
  token: z.string().trim().min(20).max(4096),
  platform: z
    .string()
    .trim()
    .transform((value) => value.toUpperCase())
    .pipe(z.nativeEnum(PushPlatform)),
  deviceId: z.string().trim().min(1).max(200).optional(),
})

export const deletePushTokenBodySchema = z
  .object({
    token: z.string().trim().min(20).max(4096).optional(),
    deviceId: z.string().trim().min(1).max(200).optional(),
  })
  .strict()

export type PushTokenBody = z.infer<typeof pushTokenBodySchema>
export type DeletePushTokenBody = z.infer<typeof deletePushTokenBodySchema>
