/**
 * Error handling middleware
 *
 * Transforms errors into structured API responses.
 * CRITICAL: Never expose internal details (stack traces, SQL, paths)
 */

import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
import { ErrorResponse, ERROR_CODES } from '../../types';

/**
 * Custom error classes for specific error types
 */
export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class DataUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DataUnavailableError';
  }
}

export class QueryTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QueryTimeoutError';
  }
}

/**
 * Check if error is a PostgreSQL error
 */
function isPostgresError(err: unknown): err is { code: string; message: string } {
  return typeof err === 'object' && err !== null && 'code' in err;
}

/**
 * Map PostgreSQL error codes to user-friendly messages
 */
function mapPostgresError(code: string): { httpStatus: number; errorCode: string; message: string } {
  switch (code) {
    case '57014': // query_canceled (timeout)
      return {
        httpStatus: 504,
        errorCode: ERROR_CODES.QUERY_TIMEOUT,
        message: 'Query exceeded time limit. Try narrowing your search criteria.',
      };
    case '08000': // connection_exception
    case '08003': // connection_does_not_exist
    case '08006': // connection_failure
      return {
        httpStatus: 503,
        errorCode: ERROR_CODES.DATA_UNAVAILABLE,
        message: 'Upstream data source temporarily unavailable. Please retry.',
      };
    case '42501': // insufficient_privilege
      return {
        httpStatus: 503,
        errorCode: ERROR_CODES.DATA_UNAVAILABLE,
        message: 'Data access configuration error. Please contact support.',
      };
    default:
      return {
        httpStatus: 500,
        errorCode: ERROR_CODES.INTERNAL_ERROR,
        message: 'An unexpected error occurred. Please try again.',
      };
  }
}

/**
 * Create error response object
 */
function createErrorResponse(
  requestId: string,
  code: string,
  message: string
): ErrorResponse {
  return {
    error: {
      code: code as ErrorResponse['error']['code'],
      message,
      requestId,
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Global error handler middleware
 */
export const errorHandler: ErrorRequestHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const requestId = req.requestId || 'unknown';

  // Log error internally (but not to response)
  console.error(`[error] requestId=${requestId}`, {
    name: err.name,
    message: err.message,
    // Only log stack in development
    stack: process.env['NODE_ENV'] === 'development' ? err.stack : undefined,
  });

  // Handle specific error types
  if (err instanceof NotFoundError) {
    res.status(404).json(createErrorResponse(requestId, ERROR_CODES.NOT_FOUND, err.message));
    return;
  }

  if (err instanceof ValidationError) {
    res.status(400).json(createErrorResponse(requestId, ERROR_CODES.INVALID_REQUEST, err.message));
    return;
  }

  if (err instanceof DataUnavailableError) {
    res.status(503).json(createErrorResponse(requestId, ERROR_CODES.DATA_UNAVAILABLE, err.message));
    return;
  }

  if (err instanceof QueryTimeoutError) {
    res.status(504).json(createErrorResponse(requestId, ERROR_CODES.QUERY_TIMEOUT, err.message));
    return;
  }

  // Handle PostgreSQL errors
  if (isPostgresError(err)) {
    const mapped = mapPostgresError(err.code);
    res.status(mapped.httpStatus).json(
      createErrorResponse(requestId, mapped.errorCode, mapped.message)
    );
    return;
  }

  // Handle read-only violation (from our pool.ts checks)
  if (err.message.includes('read-only') || err.message.includes('SELECT')) {
    res.status(500).json(
      createErrorResponse(
        requestId,
        ERROR_CODES.INTERNAL_ERROR,
        'Internal configuration error. This service is read-only.'
      )
    );
    return;
  }

  // Default: internal error (no details leaked)
  res.status(500).json(
    createErrorResponse(
      requestId,
      ERROR_CODES.INTERNAL_ERROR,
      'An unexpected error occurred. Please try again.'
    )
  );
};

/**
 * 404 handler for undefined routes
 */
export function notFoundHandler(req: Request, res: Response): void {
  const requestId = req.requestId || 'unknown';
  res.status(404).json(createErrorResponse(requestId, ERROR_CODES.NOT_FOUND, 'Endpoint not found'));
}

/**
 * Method not allowed handler
 * Used for rejecting non-GET methods on all routes
 */
export function methodNotAllowedHandler(req: Request, res: Response): void {
  const requestId = req.requestId || 'unknown';

  // Set Allow header per HTTP spec
  res.set('Allow', 'GET');

  const errorResponse: ErrorResponse = {
    error: {
      code: ERROR_CODES.METHOD_NOT_ALLOWED,
      message: 'This service is read-only. Only GET requests are permitted.',
      requestId,
      timestamp: new Date().toISOString(),
    },
  };

  res.status(405).json(errorResponse);
}
