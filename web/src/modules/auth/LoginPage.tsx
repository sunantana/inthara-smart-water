import { type FormEvent, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ApiError, api } from '../../api/client';
import { type SessionUser, setAuthSession, useAuthSession } from '../../lib/auth';
import { getDefaultPathForRole } from '../../lib/modules';
import { useTheme } from '../../lib/theme';

interface LoginResponse {
  accessToken: string;
  user: SessionUser;
}

export default function LoginPage() {
  const session = useAuthSession();
  const navigate = useNavigate();
  const { toggleTheme, isDark } = useTheme();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lockMinutes, setLockMinutes] = useState<number | null>(null);

  if (session.accessToken && session.user) {
    return <Navigate to={getDefaultPathForRole(session.user.role)} replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setLockMinutes(null);
    setSubmitting(true);

    try {
      const result = await api.post<LoginResponse>('/auth/login', {
        username: username.trim(),
        password,
      });

      setAuthSession(result.accessToken, result.user);
      navigate(getDefaultPathForRole(result.user.role), { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
        if (err.status === 409 && typeof err.lockMinutes === 'number') {
          setLockMinutes(err.lockMinutes);
        }
      } else {
        setErrorMessage('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4 transition-colors duration-200 dark:bg-slate-950">
      <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8">
        {/* ปุ่มสลับธีมมุมบนขวา */}
        <button
          type="button"
          onClick={toggleTheme}
          title={isDark ? 'สลับเป็นโหมดสว่าง' : 'สลับเป็นโหมดมืด'}
          className="absolute right-4 top-4 rounded-lg border border-slate-200 p-2 text-xs text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          aria-label="สลับธีม"
        >
          {isDark ? '☀️' : '🌙'}
        </button>

        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-700 font-bold text-white shadow-brand-500/20">
            IN
          </div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">
            อินธารา Smart Water ERP v2
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            ระบบบริหารจัดการโรงงานผลิตน้ำดื่มและสายส่ง (Phase 1 Auth)
          </p>
        </div>

        {lockMinutes !== null && (
          <div
            role="alert"
            className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200"
          >
            <p className="font-semibold">บัญชีถูกระงับชั่วคราว (HTTP 409)</p>
            <p className="mt-1">
              คุณกรอกรหัสผ่านผิดเกินจำนวนที่กำหนด กรุณารออีก{' '}
              <span className="font-bold underline">{lockMinutes} นาที</span>{' '}
              หรือติดต่อผู้ดูแลระบบเพื่อปลดล็อกบัญชี
            </p>
          </div>
        )}

        {errorMessage && lockMinutes === null && (
          <div
            role="alert"
            className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800/60 dark:bg-red-950/40 dark:text-red-300"
          >
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="login-username"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              ชื่อผู้ใช้ (Username)
            </label>
            <input
              id="login-username"
              type="text"
              required
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              placeholder="ระบุชื่อผู้ใช้ของคุณ"
            />
          </div>

          <div>
            <label
              htmlFor="login-password"
              className="block text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              รหัสผ่าน (Password)
            </label>
            <input
              id="login-password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              placeholder="ระบุรหัสผ่าน"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-brand-700 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-600 disabled:opacity-50"
          >
            {submitting ? 'กำลังเข้าสู่ระบบ…' : 'เข้าสู่ระบบ'}
          </button>
        </form>

        <div className="mt-6 border-t border-slate-100 pt-4 text-center text-xs text-slate-400 dark:border-slate-800 dark:text-slate-500">
          Inthara Smart Water ERP v2 · ระบบจัดการสิทธิ์ 5 บทบาท
        </div>
      </div>
    </div>
  );
}
