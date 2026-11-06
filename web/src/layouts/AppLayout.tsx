import { type FormEvent, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { ApiError, api } from '../api/client';
import { ROLE_LABELS, clearAuthSession, useAuthSession } from '../lib/auth';
import { getModulesForRole } from '../lib/modules';

const linkBase =
  'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-brand-700/40';

/**
 * layout หลัก: sidebar เมนูภาษาไทย (กรองตาม role ของผู้ใช้) + ข้อมูลผู้ใช้ปัจจุบัน + ปุ่มเปลี่ยนรหัสผ่านด้วย PIN + ปุ่มออกจากระบบ
 * (การเช็คสิทธิ์จริงอยู่ฝั่ง server เสมอ)
 */
export default function AppLayout() {
  const { user } = useAuthSession();
  const navigate = useNavigate();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [pwdModalOpen, setPwdModalOpen] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [pin, setPin] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [pwdMsg, setPwdMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [pwdLoading, setPwdLoading] = useState(false);

  const visibleModules = getModulesForRole(user?.role);

  async function handleLogout() {
    try {
      await api.post('/auth/logout');
    } catch {
      // ล้าง session ฝั่ง client เสมอแม้เน็ตหลุด
    } finally {
      clearAuthSession();
      navigate('/login', { replace: true });
    }
  }

  async function handleChangePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPwdMsg(null);
    setPwdLoading(true);
    try {
      await api.post('/auth/change-password', {
        oldPassword,
        pin,
        newPassword,
      });
      setPwdMsg({ type: 'ok', text: 'เปลี่ยนรหัสผ่านสำเร็จ' });
      setOldPassword('');
      setPin('');
      setNewPassword('');
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'เปลี่ยนรหัสผ่านไม่สำเร็จ';
      setPwdMsg({ type: 'err', text: message });
    } finally {
      setPwdLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-800">
      <aside className="hidden w-72 shrink-0 flex-col bg-brand-700 text-white md:flex">
        <div className="border-b border-white/10 px-4 py-4">
          <p className="text-base font-semibold">อินธารา Smart Water</p>
          <p className="text-xs text-white/70">ERP v2 · Phase 1 (Auth & RBAC)</p>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {visibleModules.map((module) => (
            <NavLink
              key={module.code}
              to={module.path}
              className={({ isActive }: { isActive: boolean }) =>
                `${linkBase} ${isActive ? 'bg-white/20 font-medium' : 'text-white/85'}`
              }
            >
              <span className="w-14 shrink-0 font-mono text-[11px] text-white/60">
                {module.code}
              </span>
              <span className="truncate">{module.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 md:hidden"
            >
              เมนู ({visibleModules.length})
            </button>
            <div>
              <p className="text-sm font-medium text-slate-700">ระบบบริหารโรงงานน้ำดื่มอินธารา</p>
              <p className="text-xs text-slate-500">
                สิทธิ์เข้าถึง {visibleModules.length} โมดูล ตามบทบาท {user?.role ?? '-'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {user && (
              <div className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-1.5 text-xs">
                <span className="font-semibold text-slate-800">{user.displayName}</span>
                <span className="text-slate-400">({user.username})</span>
                <span className="rounded bg-brand-700 px-2 py-0.5 text-[11px] font-medium text-white">
                  {ROLE_LABELS[user.role] ?? user.role}
                </span>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                setPwdMsg(null);
                setPwdModalOpen(true);
              }}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              เปลี่ยนรหัสผ่าน (PIN)
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
            >
              ออกจากระบบ
            </button>
          </div>
        </header>

        {mobileMenuOpen && (
          <nav className="grid grid-cols-2 gap-1 bg-brand-700 p-3 text-white sm:grid-cols-3 md:hidden">
            {visibleModules.map((module) => (
              <NavLink
                key={module.code}
                to={module.path}
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }: { isActive: boolean }) =>
                  `rounded-lg px-2.5 py-2 text-xs ${
                    isActive ? 'bg-white/20 font-semibold' : 'text-white/85'
                  }`
                }
              >
                <span className="mr-1 font-mono text-[10px] text-white/60">{module.code}</span>
                {module.label}
              </NavLink>
            ))}
          </nav>
        )}

        <main className="min-w-0 flex-1 p-4 md:p-6">
          <Outlet />
        </main>

        <footer className="border-t border-slate-200 bg-white px-4 py-2 text-xs text-slate-500">
          เมนูทั้ง 16 โมดูลอ้างอิง docs/specs/01_SRS_ความต้องการระบบ.md · ซ่อนเมนูตามบทบาทผู้ใช้
        </footer>
      </div>

      {pwdModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-semibold text-slate-800">
                เปลี่ยนรหัสผ่านด้วย PIN ยืนยัน (AUTH-3)
              </h2>
              <button
                type="button"
                onClick={() => setPwdModalOpen(false)}
                className="text-xs text-slate-400 hover:text-slate-600"
              >
                ปิด
              </button>
            </div>

            <form onSubmit={handleChangePassword} className="mt-4 space-y-3">
              {pwdMsg && (
                <div
                  className={`rounded-lg p-3 text-xs ${
                    pwdMsg.type === 'ok'
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-red-50 text-red-700'
                  }`}
                >
                  {pwdMsg.text}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700">รหัสผ่านเดิม</label>
                <input
                  type="password"
                  required
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">
                  รหัส PIN ยืนยันตัวตน (4-8 หลัก)
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  required
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="กรอก PIN ของบัญชีคุณ"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">
                  รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร)
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPwdModalOpen(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={pwdLoading}
                  className="rounded-lg bg-brand-700 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
                >
                  {pwdLoading ? 'กำลังบันทึก…' : 'ยืนยันการเปลี่ยนรหัสผ่าน'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
