export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly code: string,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Recurso não encontrado') {
    super(message, 404, 'NOT_FOUND')
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Não autenticado') {
    super(message, 401, 'UNAUTHORIZED')
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Acesso negado') {
    super(message, 403, 'FORBIDDEN')
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Dados inválidos') {
    super(message, 422, 'VALIDATION_ERROR')
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflito de dados') {
    super(message, 409, 'CONFLICT')
  }
}
