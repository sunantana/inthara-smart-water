import { type FormEvent, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ApiError, api } from '../../api/client';
import { type SessionUser, setAuthSession, useAuthSession } from '../../lib/auth';
import { getDefaultPathForRole } from '../../lib/modules';

interface LoginResponse {
  accessToken: string;
  user: SessionUser;
}

export default function LoginPage() {
  const session = useAuthSession();
  const navigate = useNavigate();

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
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-700 font-bold text-white">
            IN
          </div>
          <h1 className="text-xl font-bold text-slate-800">อินธารา Smart Water ERP v2</h1>
          <p className="mt-1 text-xs text-slate-500">
            ระบบบริหารจัดการโรงงานผลิตน้ำดื่มและสายส่ง (Phase 1 Auth)
          </p>
        </div>

        {lockMinutes !== null && (
          <div
            role="alert"
            className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900"
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
            className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="login-username" className="block text-sm font-medium text-slate-700">
              ชื่อผู้ใช้ (Username)
            </label>
            <input
              id="login-username"
              type="text"
              required
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="เช่น admin, manager, staff"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20"
            />
          </div>

          <div>
            <label htmlFor="login-password" className="block text-sm font-medium text-slate-700">
              รหัสผ่าน (Password)
            </label>
            <input
              id="login-password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="กรอกรหัสผ่าน"
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'กำลังตรวจสอบสิทธิ์…' : 'เข้าสู่ระบบ'}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-400">
          จำกัดการพยายามเข้าสู่ระบบผิดสูงสุด 5 ครั้ง (ล็อก 15 นาที) · Rate Limit 10 ครั้ง/นาที
        </p>
      </div>
    </div>
  );
}
