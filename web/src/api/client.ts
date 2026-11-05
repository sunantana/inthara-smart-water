/** error ที่แปลงจากรูปแบบ { error: { code, message } } ใน 04_API_Spec */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

interface ErrorPayload {
  error?: { code?: string; message?: string };
}

/**
 * เรียก API ผ่าน /api (dev ใช้ proxy ของ Vite → localhost:3001)
 * - แนบ cookie (refresh token) ด้วย credentials: 'include'
 * - โยน ApiError พร้อม code/message ตาม 04 เมื่อ response ไม่ใช่ 2xx
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  const isJson = response.headers.get('content-type')?.includes('application/json') ?? false;
  const payload = isJson ? await response.json() : null;

  if (!response.ok) {
    const error = (payload as ErrorPayload | null)?.error;
    throw new ApiError(
      response.status,
      error?.code ?? 'INTERNAL',
      error?.message ?? 'เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ',
    );
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
};

export interface HealthResponse {
  status: 'ok' | 'error';
  timestamp: string;
  database: 'connected' | 'disconnected';
}
