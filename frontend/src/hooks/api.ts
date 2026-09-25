import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import { api } from '../lib/api';

/** Thin wrapper over react-query for GET endpoints. Key is [url, params]. */
export function useGet<T = unknown>(
  url: string,
  params?: Record<string, unknown>,
  options?: Omit<UseQueryOptions<T>, 'queryKey' | 'queryFn'>,
) {
  return useQuery<T>({
    queryKey: [url, params ?? {}],
    queryFn: async () => {
      const { data } = await api.get<T>(url, { params });
      return data;
    },
    ...options,
  });
}

/**
 * useGet that remembers its last good response in localStorage, so the till can
 * still show the menu and open tabs with the network down. The cached copy is
 * treated as stale and refetched as soon as a connection allows.
 */
export function useCachedGet<T = unknown>(url: string, params?: Record<string, unknown>) {
  const cacheKey = `pos-cache:${url}:${JSON.stringify(params ?? {})}`;
  return useQuery<T>({
    queryKey: [url, params ?? {}],
    queryFn: async () => {
      const { data } = await api.get<T>(url, { params });
      try {
        localStorage.setItem(cacheKey, JSON.stringify(data));
      } catch {
        /* quota or private mode — the live data still works */
      }
      return data;
    },
    initialData: () => {
      try {
        const raw = localStorage.getItem(cacheKey);
        return raw ? (JSON.parse(raw) as T) : undefined;
      } catch {
        return undefined;
      }
    },
    initialDataUpdatedAt: 0,
  });
}
