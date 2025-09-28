import type { ZodTypeAny } from "zod"
import type { Request, Response, NextFunction } from "express"

export function validate(schemas: {
  body?: ZodTypeAny
  query?: ZodTypeAny
  params?: ZodTypeAny
}) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body)
      }
      if (schemas.query) {
        req.query = schemas.query.parse(req.query)
      }
      if (schemas.params) {
        req.params = schemas.params.parse(req.params)
      }
      next()
    } catch (error) {
      next(error)
    }
  }
}
