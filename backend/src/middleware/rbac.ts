import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../lib/http';

/**
 * Gate a route on one or more permissions. System Admin (wildcard '*') passes
 * everything. Every protected mutation in the API sits behind one of these —
 * the frontend also hides the control, but this is the real enforcement.
 */
export function requirePermission(...needed: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const held = req.user?.permissions ?? [];
    if (held.includes('*')) return next();
    const missing = needed.filter((p) => !held.includes(p));
    if (missing.length > 0) {
      return next(ApiError.forbidden(`Missing permission: ${missing.join(', ')}`));
    }
    next();
  };
}

/** Any-of variant — passes if the user holds at least one of the listed permissions. */
export function requireAny(...options: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const held = req.user?.permissions ?? [];
    if (held.includes('*') || options.some((p) => held.includes(p))) return next();
    next(ApiError.forbidden(`Requires one of: ${options.join(', ')}`));
  };
}
