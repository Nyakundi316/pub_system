import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { useAuth } from '../store/auth';

export const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = useAuth.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Single-flight refresh: if a 401 lands, try the refresh token once, then replay.
let refreshing: Promise<string | null> | null = null;

async function refreshAccess(): Promise<string | null> {
  const { refreshToken, setAccessToken, clear } = useAuth.getState();
  if (!refreshToken) return null;
  try {
    const { data } = await axios.post('/api/auth/refresh', { refreshToken });
    setAccessToken(data.accessToken);
    return data.accessToken as string;
  } catch {
    clear();
    return null;
  }
}

api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retried?: boolean };
    const isAuthCall = original?.url?.includes('/auth/');
    if (error.response?.status === 401 && original && !original._retried && !isAuthCall) {
      original._retried = true;
      refreshing = refreshing ?? refreshAccess();
      const token = await refreshing;
      refreshing = null;
      if (token) {
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      }
      if (typeof window !== 'undefined') window.location.assign('/login');
    }
    return Promise.reject(error);
  },
);

/** Pull a human message out of an axios error. */
export function apiError(err: unknown): string {
  const e = err as AxiosError<{ error?: string; details?: unknown }>;
  return e.response?.data?.error ?? e.message ?? 'Something went wrong';
}
