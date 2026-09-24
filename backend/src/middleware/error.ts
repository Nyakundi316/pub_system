import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { ApiError, zodToMessage } from '../lib/http';

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ error: 'Route not found' });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof ApiError) {
    res.status(err.status).json({ error: err.message, details: err.details });
    return;
  }
  if (err instanceof ZodError) {
    const { message, details } = zodToMessage(err);
    res.status(400).json({ error: message, details });
    return;
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      res.status(409).json({ error: 'Unique constraint violated', details: err.meta?.target });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({ error: 'Record not found' });
      return;
    }
  }
  // eslint-disable-next-line no-console
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
}
