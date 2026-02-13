/**
 * Request validation middleware using Zod schemas
 *
 * Validates query parameters and path parameters.
 * Returns structured error responses on validation failure.
 */

import { Request, Response, NextFunction } from 'express';
import { z, ZodError, ZodSchema } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import {
  VALID_STATUSES,
  VALID_ENVIRONMENTS,
  VALID_PERIODS,
  SORTABLE_FIELDS,
  ErrorResponse,
  ErrorDetail,
  ERROR_CODES,
} from '../../types';
import { getConfig } from '../../config';

// Extend Express Request to include requestId
declare global {
  namespace Express {
    interface Request {
      requestId: string;
    }
  }
}

// ============================================================================
// Zod Schemas for Query Parameters
// ============================================================================

const environmentSchema = z.enum(VALID_ENVIRONMENTS);
const statusSchema = z.enum(VALID_STATUSES);
const periodSchema = z.enum(VALID_PERIODS);
const sortFieldSchema = z.enum(SORTABLE_FIELDS);

// ISO8601 date string validation
const iso8601Schema = z.string().refine(
  (val) => !isNaN(Date.parse(val)),
  { message: 'Must be a valid ISO8601 date string' }
);

// UUID validation
const uuidSchema = z.string().uuid({ message: 'Must be a valid UUID' });

// Positive integer
const positiveIntSchema = z.coerce.number().int().positive();

// Non-negative integer
const nonNegativeIntSchema = z.coerce.number().int().nonnegative();

/**
 * Schema for /runs query parameters
 */
export const runsQuerySchema = z.object({
  environment: environmentSchema.optional(),
  status: z.union([
    statusSchema,
    z.string().transform((val) => val.split(',').map((s) => s.trim())),
  ]).optional().transform((val) => {
    if (!val) return undefined;
    if (Array.isArray(val)) return val;
    return [val];
  }),
  scenario: z.string().max(256).optional(),
  since: iso8601Schema.optional(),
  before: iso8601Schema.optional(),
  limit: positiveIntSchema.optional(),
  offset: nonNegativeIntSchema.optional(),
  order: z.string().optional().transform((val) => {
    if (!val) return { field: 'completed_at', direction: 'DESC' as const };
    const desc = val.startsWith('-');
    const field = desc ? val.slice(1) : val;
    return { field, direction: desc ? 'DESC' as const : 'ASC' as const };
  }),
});

/**
 * Schema for /runs/last query parameters
 */
export const lastRunQuerySchema = z.object({
  environment: environmentSchema,
  scenario: z.string().max(256).optional(),
});

/**
 * Schema for /summary query parameters
 */
export const summaryQuerySchema = z.object({
  environment: environmentSchema,
  period: periodSchema.default('24h'),
});

/**
 * Schema for /runs/:id path parameter
 * Accepts UUID (legacy run_id), exec-* (execution_id), or sim-* (simulation_id)
 * per ADR-004 dual resolution.
 */
export const runIdParamSchema = z.object({
  id: z.string().min(1).max(256).refine(
    (val) =>
      val.startsWith('exec-') ||
      val.startsWith('sim-') ||
      z.string().uuid().safeParse(val).success,
    { message: 'Must be a UUID, exec-<id>, or sim-<id>' }
  ),
});

/**
 * Schema for /scenarios/:id path parameter
 */
export const scenarioIdParamSchema = z.object({
  id: z.string().min(1).max(256),
});

// ============================================================================
// Validation Middleware Factory
// ============================================================================

/**
 * Create validation error response
 */
function createValidationErrorResponse(
  requestId: string,
  error: ZodError
): ErrorResponse {
  const details: ErrorDetail[] = error.errors.map((err) => ({
    field: err.path.join('.'),
    issue: err.message,
    allowed: getSchemaAllowedValues(err.path[0] as string),
  }));

  return {
    error: {
      code: ERROR_CODES.INVALID_REQUEST,
      message: 'Validation failed for request parameters',
      details: details.filter((d) => d.field), // Remove empty paths
      requestId,
      timestamp: new Date().toISOString(),
    },
  };
}

/**
 * Get allowed values for a field (for error details)
 */
function getSchemaAllowedValues(field: string): readonly string[] | undefined {
  switch (field) {
    case 'environment':
      return VALID_ENVIRONMENTS;
    case 'status':
      return VALID_STATUSES;
    case 'period':
      return VALID_PERIODS;
    case 'order':
      return SORTABLE_FIELDS;
    default:
      return undefined;
  }
}

/**
 * Validate status values against allowed list
 */
function validateStatuses(statuses: string[]): string[] {
  const invalid = statuses.filter((s) => !VALID_STATUSES.includes(s as typeof VALID_STATUSES[number]));
  if (invalid.length > 0) {
    throw new Error(`Invalid status value(s): ${invalid.join(', ')}. This service only indexes completed runs.`);
  }
  return statuses;
}

/**
 * Middleware to validate query parameters
 */
export function validateQuery<T extends ZodSchema>(
  schema: T
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const result = schema.safeParse(req.query);

      if (!result.success) {
        const errorResponse = createValidationErrorResponse(req.requestId, result.error);
        res.status(400).json(errorResponse);
        return;
      }

      // Additional status validation
      if (result.data.status) {
        try {
          validateStatuses(result.data.status);
        } catch (err) {
          const errorResponse: ErrorResponse = {
            error: {
              code: ERROR_CODES.INVALID_REQUEST,
              message: (err as Error).message,
              details: [{
                field: 'status',
                issue: 'Invalid status value',
                allowed: VALID_STATUSES,
              }],
              requestId: req.requestId,
              timestamp: new Date().toISOString(),
            },
          };
          res.status(400).json(errorResponse);
          return;
        }
      }

      // Apply defaults from config
      const config = getConfig();
      if (result.data.limit === undefined) {
        result.data.limit = config.query.defaultPageSize;
      }
      if (result.data.limit > config.query.maxPageSize) {
        result.data.limit = config.query.maxPageSize;
      }
      if (result.data.offset === undefined) {
        result.data.offset = 0;
      }

      req.query = result.data as typeof req.query;
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Middleware to validate path parameters
 */
export function validateParams<T extends ZodSchema>(
  schema: T
): (req: Request, res: Response, next: NextFunction) => void {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const result = schema.safeParse(req.params);

      if (!result.success) {
        const errorResponse = createValidationErrorResponse(req.requestId, result.error);
        res.status(400).json(errorResponse);
        return;
      }

      req.params = result.data as typeof req.params;
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Middleware to assign request ID
 */
export function assignRequestId(req: Request, _res: Response, next: NextFunction): void {
  req.requestId = uuidv4();
  next();
}
