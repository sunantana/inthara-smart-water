import { useSyncExternalStore } from 'react';

export type UserRole = 'admin' | 'manager' | 'staff' | 'driver' | 'customer';

export interface SessionUser {
  id: number;
  username: string;
  displayName: string;
  role: UserRole;
}

export interface AuthSession {
  accessToken: string | null;
  user: SessionUser | null;
}

const STORAGE_KEY = 'inthara.erp.v2.auth';

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'ผู้ดูแลระบบ (Admin)',
  manager: 'ผู้จัดการ (Manager)',
  staff: 'พนักงานสำนักงาน (Staff)',
  driver: 'พนักงานขับรถ (Driver)',
  customer: 'ลูกค้า (Customer)',
};

function readInitialSession(): AuthSession {
  if (typeof window === 'undefined') {
    return { accessToken: null, user: null };
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { accessToken: null, user: null };
    const parsed = JSON.parse(raw) as Partial<AuthSession>;
    if (
      typeof parsed?.accessToken === 'string' &&
      parsed.user &&
      typeof parsed.user.id === 'number' &&
      typeof parsed.user.username === 'string' &&
      typeof parsed.user.role === 'string'
    ) {
      return {
        accessToken: parsed.accessToken,
        user: parsed.user as SessionUser,
      };
    }
  } catch {
    // ถ้า JSON เสียให้เริ่มใหม่
  }
  return { accessToken: null, user: null };
}

let currentSession: AuthSession = readInitialSession();
const listeners = new Set<() => void>();

function notifyListeners() {
  for (const listener of listeners) {
    listener();
  }
}

export function getAuthSession(): AuthSession {
  return currentSession;
}

export function getAccessToken(): string | null {
  return currentSession.accessToken;
}

export function setAuthSession(accessToken: string, user: SessionUser): void {
  currentSession = { accessToken, user };
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(currentSession));
    } catch {
      // ignore quota error
    }
  }
  notifyListeners();
}

export function clearAuthSession(): void {
  currentSession = { accessToken: null, user: null };
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore
    }
  }
  notifyListeners();
}

export function subscribeAuth(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useAuthSession(): AuthSession {
  return useSyncExternalStore(subscribeAuth, getAuthSession, getAuthSession);
}
