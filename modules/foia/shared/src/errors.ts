/**
 * Govli AI FOIA Module - Error Classes
 * Custom error classes for FOIA operations
 */

/**
 * Base FOIA Error
 */
export class FoiaError extends Error {
  public code: string;
  public statusCode: number;
  public details?: any;

  constructor(message: string, code: string, statusCode: number = 500, details?: any) {
    super(message);
    this.name = 'FoiaError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, FoiaError);
    }
  }
}

/**
 * Validation Error (400)
 */
export class ValidationError extends FoiaError {
  constructor(message: string = 'Validation failed', details?: any) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
  }
}

/**
 * Not Found Error (404)
 */
export class NotFoundError extends FoiaError {
  constructor(resource: string = 'Resource') {
    super(`${resource} not found`, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
  }
}

/**
 * Unauthorized Error (401)
 */
export class UnauthorizedError extends FoiaError {
  constructor(message: string = 'Authentication required') {
    super(message, 'UNAUTHORIZED', 401);
    this.name = 'UnauthorizedError';
  }
}

/**
 * Forbidden Error (403)
 */
export class ForbiddenError extends FoiaError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 'FORBIDDEN', 403);
    this.name = 'ForbiddenError';
  }
}

/**
 * Conflict Error (409)
 */
export class ConflictError extends FoiaError {
  constructor(message: string = 'Resource conflict') {
    super(message, 'CONFLICT', 409);
    this.name = 'ConflictError';
  }
}

/**
 * Database Error (500)
 */
export class DatabaseError extends FoiaError {
  constructor(message: string = 'Database operation failed', details?: any) {
    super(message, 'DATABASE_ERROR', 500, details);
    this.name = 'DatabaseError';
  }
}

/**
 * AI Service Error (500)
 */
export class AIServiceError extends FoiaError {
  constructor(message: string = 'AI service operation failed', details?: any) {
    super(message, 'AI_SERVICE_ERROR', 500, details);
    this.name = 'AIServiceError';
  }
}

/**
 * Budget Exceeded Error (429)
 */
export class BudgetExceededError extends FoiaError {
  constructor(message: string = 'AI token budget exceeded') {
    super(message, 'BUDGET_EXCEEDED', 429);
    this.name = 'BudgetExceededError';
  }
}

/**
 * Error Response Interface
 */
export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
  };
  timestamp: Date;
}

/**
 * Convert error to API response
 */
export function errorToResponse(error: Error | FoiaError): ErrorResponse {
  if (error instanceof FoiaError) {
    return {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details
      },
      timestamp: new Date()
    };
  }

  // Generic error
  return {
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    },
    timestamp: new Date()
  };
}

/**
 * Express error handler middleware
 */
export function errorHandler() {
  return (err: Error | FoiaError, req: any, res: any, next: any) => {
    const errorResponse = errorToResponse(err);
    const statusCode = err instanceof FoiaError ? err.statusCode : 500;

    // Log error
    console.error('[Error]', {
      path: req.path,
      method: req.method,
      error: err.message,
      stack: err.stack
    });

    res.status(statusCode).json(errorResponse);
  };
}
