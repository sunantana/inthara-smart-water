import { QueryClient } from '@tanstack/react-query';

/**
 * TanStack Query client กลาง — ค่าเริ่มต้นตาม 02 §2 (cache + invalidate ตาม query key)
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export default queryClient;
