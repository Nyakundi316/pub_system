import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthUser } from '../lib/types';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  setSession: (s: { accessToken: string; refreshToken: string; user: AuthUser }) => void;
  setAccessToken: (t: string) => void;
  clear: () => void;
  can: (...perms: string[]) => boolean;
}

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      setSession: ({ accessToken, refreshToken, user }) => set({ accessToken, refreshToken, user }),
      setAccessToken: (accessToken) => set({ accessToken }),
      clear: () => set({ accessToken: null, refreshToken: null, user: null }),
      can: (...perms) => {
        const held = get().user?.permissions ?? [];
        return held.includes('*') || perms.some((p) => held.includes(p));
      },
    }),
    { name: 'pub.auth' },
  ),
);
