import type { Request, Response, NextFunction } from "express"
import type { ZodSchema } from "zod"
import { BadRequestError } from "./errors"

type Platform = "WEB" | "MOBILE"

type ValidationConfig = Partial<
  Record<
    Platform,
    {
      body?: ZodSchema
    }
  >
>

export function conditionalValidate(config: ValidationConfig) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const platform = req.clientPlatform

    // 🔒 Narrowing defensivo
    if (!platform) {
      return next()
    }

    const rules = config[platform]
    if (!rules || !rules.body) {
      return next()
    }

    const result = rules.body.safeParse(req.body)

    if (!result.success) {
      throw new BadRequestError("Validation failed", result.error.flatten())
    }

    req.body = result.data
    next()
  }
}
