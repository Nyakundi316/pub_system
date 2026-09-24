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
