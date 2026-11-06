import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'theme';

/**
 * ดึงค่าธีมที่บันทึกไว้ใน localStorage
 * กฎ: ค่าเริ่มต้นเป็น 'light' เสมอหากไม่มีค่าเก็บไว้ (ไม่สน prefers-color-scheme ของ OS)
 */
export function getStoredTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/**
 * เขียนหรือลบ class 'dark' บน element <html> (document.documentElement)
 */
export function applyThemeClass(theme: Theme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

/**
 * Custom hook สำหรับจัดการธีม Light / Dark
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getStoredTheme);

  useEffect(() => {
    applyThemeClass(theme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // ป้องกันข้อผิดพลาดกรณี private mode หรือพื้นที่เต็ม
    }
  }, [theme]);

  // Listener สำหรับกรณีเปลี่ยนในแท็บอื่น
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === THEME_STORAGE_KEY) {
        const nextTheme = e.newValue === 'dark' ? 'dark' : 'light';
        setThemeState(nextTheme);
        applyThemeClass(nextTheme);
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const toggleTheme = () => {
    setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const setTheme = (nextTheme: Theme) => {
    setThemeState(nextTheme);
  };

  return {
    theme,
    isDark: theme === 'dark',
    toggleTheme,
    setTheme,
  };
}

// นำไปใช้ทันทีเพื่อป้องกัน flash of wrong theme
if (typeof window !== 'undefined') {
  applyThemeClass(getStoredTheme());
}
