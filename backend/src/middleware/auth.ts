import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../lib/http';
import { verifyAccessToken } from '../lib/tokens';

/** Require a valid access token; populates req.user or 401s. */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return next(ApiError.unauthorized('Missing bearer token'));
  }
  try {
    req.user = verifyAccessToken(header.slice(7));
    next();
  } catch {
    next(ApiError.unauthorized('Invalid or expired token'));
  }
}
