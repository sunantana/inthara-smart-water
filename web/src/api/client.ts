import {
  type SessionUser,
  clearAuthSession,
  getAccessToken,
  setAuthSession,
} from '../lib/auth';

/** error ที่แปลงจากรูปแบบ { error: { code, message, details, lockMinutes } } ใน 04_API_Spec */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Array<{ field: string; issue: string }>;
  readonly lockMinutes?: number;

  constructor(
    status: number,
    code: string,
    message: string,
    options?: {
      details?: Array<{ field: string; issue: string }>;
      lockMinutes?: number;
    },
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = options?.details;
    this.lockMinutes = options?.lockMinutes;
  }
}

interface ErrorPayload {
  error?: {
    code?: string;
    message?: string;
    details?: Array<{ field: string; issue: string }>;
    lockMinutes?: number;
  };
}

let refreshPromise: Promise<boolean> | null = null;

async function tryRefreshSession(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) return false;

      const data = (await res.json()) as { accessToken?: string; user?: SessionUser };
      if (data.accessToken && data.user) {
        setAuthSession(data.accessToken, data.user);
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

function redirectToLoginIfNeeded(path: string) {
  if (path.startsWith('/auth/login')) return;
  clearAuthSession();
  if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
    window.location.assign('/login');
  }
}

/**
 * เรียก API ผ่าน /api (dev ใช้ proxy ของ Vite → localhost:3001)
 * - แนบ Authorization: Bearer <accessToken> อัตโนมัติทุก request
 * - แนบ cookie (refresh token) ด้วย credentials: 'include'
 * - ถ้าเจอ 401 (นอกเหนือจากหน้า login) จะลองต่ออายุผ่าน /api/auth/refresh 1 ครั้ง
 *   หากต่อไม่ได้จะล้าง session แล้วเด้งกลับไปหน้า /login ทันที
 */
export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  isRetry = false,
): Promise<T> {
  const token = getAccessToken();
  const headers = new Headers(init.headers ?? undefined);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers,
  });

  if (
    response.status === 401 &&
    !isRetry &&
    !path.startsWith('/auth/login') &&
    !path.startsWith('/auth/refresh') &&
    !path.startsWith('/auth/change-password')
  ) {
    const refreshed = await tryRefreshSession();
    if (refreshed) {
      return apiFetch<T>(path, init, true);
    }
    redirectToLoginIfNeeded(path);
  }

  const isJson = response.headers.get('content-type')?.includes('application/json') ?? false;
  const payload = isJson ? await response.json() : null;

  if (!response.ok) {
    const error = (payload as ErrorPayload | null)?.error;
    throw new ApiError(
      response.status,
      error?.code ?? 'INTERNAL',
      error?.message ?? 'เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ',
      {
        details: error?.details,
        lockMinutes: error?.lockMinutes,
      },
    );
  }

  return payload as T;
}

/**
 * ดาวน์โหลดไฟล์ไบนารี (Blob เช่น .xlsx) โดยแนบ Authorization: Bearer <accessToken>
 * และรองรับการต่ออายุ token อัตโนมัติเมื่อได้ 401
 */
export async function downloadWithAuth(
  path: string,
  fallbackFilename = 'export.xlsx',
  isRetry = false,
): Promise<void> {
  const token = getAccessToken();
  const headers = new Headers();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`/api${path}`, {
    method: 'GET',
    credentials: 'include',
    headers,
  });

  if (response.status === 401 && !isRetry) {
    const refreshed = await tryRefreshSession();
    if (refreshed) {
      return downloadWithAuth(path, fallbackFilename, true);
    }
    redirectToLoginIfNeeded(path);
  }

  if (!response.ok) {
    const isJson = response.headers.get('content-type')?.includes('application/json') ?? false;
    const payload = isJson ? ((await response.json()) as ErrorPayload) : null;
    const error = payload?.error;
    throw new ApiError(
      response.status,
      error?.code ?? 'INTERNAL',
      error?.message ?? 'ดาวน์โหลดไฟล์ไม่สำเร็จ',
    );
  }

  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') ?? '';
  const match = disposition.match(/filename="?([^";]+)"?/i);
  const filename = match?.[1] ?? fallbackFilename;

  if (typeof window !== 'undefined') {
    const objectUrl = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(objectUrl);
  }
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, {
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  put: <T>(path: string, body: unknown) =>
    apiFetch<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T>(path: string) => apiFetch<T>(path, { method: 'DELETE' }),
  download: (path: string, fallbackFilename?: string) =>
    downloadWithAuth(path, fallbackFilename),
};

export interface HealthResponse {
  status: 'ok' | 'error';
  timestamp: string;
  database: 'connected' | 'disconnected';
}
