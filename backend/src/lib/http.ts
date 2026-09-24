import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

/** Domain error carrying an HTTP status. Thrown anywhere, caught by the error middleware. */
export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }

  static badRequest(msg: string, details?: unknown) {
    return new ApiError(400, msg, details);
  }
  static unauthorized(msg = 'Not authenticated') {
    return new ApiError(401, msg);
  }
  static forbidden(msg = 'Not permitted') {
    return new ApiError(403, msg);
  }
  static notFound(msg = 'Not found') {
    return new ApiError(404, msg);
  }
  static conflict(msg: string, details?: unknown) {
    return new ApiError(409, msg, details);
  }
}

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

/** Wrap async route handlers so rejected promises reach the error middleware. */
export const wrap =
  (handler: AsyncHandler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res, next).catch(next);
  };

/** Parse a positive integer route param or throw a 400. */
export function idParam(req: Request, key = 'id'): number {
  const raw = req.params[key];
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw ApiError.badRequest(`Invalid ${key}: ${raw}`);
  }
  return value;
}

export function zodToMessage(err: ZodError): { message: string; details: unknown } {
  return {
    message: 'Validation failed',
    details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  };
}
