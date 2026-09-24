import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { ApiError, wrap } from '../lib/http';
import { recordAudit } from '../lib/audit';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../lib/tokens';
import { authenticate } from '../middleware/auth';
import type { AuthUser } from '../types/auth';

/** Load a user with the flattened permission set used across the API. */
export async function loadAuthUser(userId: number): Promise<AuthUser | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  });
  if (!user || user.status !== 'ACTIVE') return null;

  const permissions = user.role.permissions.map((rp) => rp.permission.name);
  if (user.role.name === 'System Admin') permissions.push('*');

  return {
    id: user.id,
    username: user.username,
    name: user.name,
    roleId: user.roleId,
    roleName: user.role.name,
    permissions,
  };
}

function issueTokens(user: AuthUser) {
  return { accessToken: signAccessToken(user), refreshToken: signRefreshToken(user.id), user };
}

const router = Router();

const loginSchema = z.object({ username: z.string().min(1), password: z.string().min(1) });

router.post(
  '/login',
  wrap(async (req, res) => {
    const { username, password } = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { username } });
    const ok = user ? await bcrypt.compare(password, user.passwordHash) : false;
    if (!user || !ok) throw ApiError.unauthorized('Invalid username or password');
    if (user.status !== 'ACTIVE') throw ApiError.forbidden('Account suspended');

    const authUser = await loadAuthUser(user.id);
    if (!authUser) throw ApiError.unauthorized('Unable to load account');
    await recordAudit({ userId: user.id, action: 'auth.login', entity: 'User', entityId: user.id, ipAddress: req.ip });
    res.json(issueTokens(authUser));
  }),
);

const pinSchema = z.object({ username: z.string().min(1), pin: z.string().min(4) });

// Fast POS re-auth by PIN — for cashiers switching at a shared terminal.
router.post(
  '/pin-login',
  wrap(async (req, res) => {
    const { username, pin } = pinSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { username } });
    const ok = user?.pinHash ? await bcrypt.compare(pin, user.pinHash) : false;
    if (!user || !ok) throw ApiError.unauthorized('Invalid PIN');
    const authUser = await loadAuthUser(user.id);
    if (!authUser) throw ApiError.unauthorized('Unable to load account');
    res.json(issueTokens(authUser));
  }),
);

const refreshSchema = z.object({ refreshToken: z.string().min(1) });

router.post(
  '/refresh',
  wrap(async (req, res) => {
    const { refreshToken } = refreshSchema.parse(req.body);
    let userId: number;
    try {
      userId = verifyRefreshToken(refreshToken);
    } catch {
      throw ApiError.unauthorized('Invalid refresh token');
    }
    const authUser = await loadAuthUser(userId);
    if (!authUser) throw ApiError.unauthorized('Account no longer active');
    res.json(issueTokens(authUser));
  }),
);

router.post(
  '/logout',
  authenticate,
  wrap(async (req, res) => {
    // Stateless JWT: logout is a client-side token drop. We log it for the trail.
    await recordAudit({ userId: req.user!.id, action: 'auth.logout', entity: 'User', entityId: req.user!.id, ipAddress: req.ip });
    res.json({ ok: true });
  }),
);

router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

export default router;
