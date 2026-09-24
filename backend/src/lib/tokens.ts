import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import type { AuthUser } from '../types/auth';

type AccessClaims = AuthUser & { typ: 'access' };
type RefreshClaims = { sub: number; typ: 'refresh' };

export function signAccessToken(user: AuthUser): string {
  const payload: AccessClaims = { ...user, typ: 'access' };
  return jwt.sign(payload, env.jwt.accessSecret, { expiresIn: env.jwt.accessTtl } as SignOptions);
}

export function signRefreshToken(userId: number): string {
  const payload: RefreshClaims = { sub: userId, typ: 'refresh' };
  return jwt.sign(payload, env.jwt.refreshSecret, { expiresIn: env.jwt.refreshTtl } as SignOptions);
}

export function verifyAccessToken(token: string): AuthUser {
  const decoded = jwt.verify(token, env.jwt.accessSecret) as unknown as AccessClaims & { iat: number; exp: number };
  if (decoded.typ !== 'access') throw new Error('Wrong token type');
  const { typ, iat, exp, ...user } = decoded;
  return user;
}

export function verifyRefreshToken(token: string): number {
  const decoded = jwt.verify(token, env.jwt.refreshSecret) as unknown as RefreshClaims;
  if (decoded.typ !== 'refresh') throw new Error('Wrong token type');
  return decoded.sub;
}
