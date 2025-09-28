export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: any,
  ) {
    super(message)
    this.name = this.constructor.name
  }
}

export class ValidationAppError extends AppError {
  constructor(message = "Validation error", details?: any) {
    super(400, "VALIDATION_ERROR", message, details)
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(401, "UNAUTHORIZED", message)
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(403, "FORBIDDEN", message)
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super(404, "NOT_FOUND", message)
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict") {
    super(409, "CONFLICT", message)
  }
}

export class BusinessError extends AppError {
  constructor(message = "Business rule violation", details?: any) {
    super(422, "BUSINESS_RULE_VIOLATION", message, details)
  }
}
