import { HttpException, HttpStatus } from '@nestjs/common';

export interface ValidationError {
  field: string;
  message: string;
  value?: unknown;
}

export class DomainException extends HttpException {
  constructor(message: string, status: HttpStatus = HttpStatus.UNPROCESSABLE_ENTITY) {
    super({ error: 'DomainError', message }, status);
  }
}

export class DraftValidationException extends DomainException {
  public readonly errors: ValidationError[];

  constructor(errors: ValidationError[]) {
    const message = errors.map((e) => `${e.field}: ${e.message}`).join('; ');
    super(`Draft validation failed: ${message}`);
    this.errors = errors;
  }
}

export class DraftConversionException extends DomainException {
  constructor(
    message: string,
    public readonly conversationId: string,
  ) {
    super(`Draft conversion failed for conversation ${conversationId}: ${message}`);
  }
}

export class InfrastructureException extends DomainException {
  public readonly provider: string;
  public readonly originalError?: Error;

  constructor(message: string, provider: string, originalError?: Error) {
    super(
      `Infrastructure error [${provider}]: ${message}`,
      HttpStatus.SERVICE_UNAVAILABLE,
    );
    this.provider = provider;
    this.originalError = originalError;
  }
}
