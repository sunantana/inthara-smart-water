import { NavLink, Outlet } from 'react-router-dom';
import { MODULES } from '../lib/modules';

const linkBase =
  'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-brand-700/40';

/**
 * layout หลัก: sidebar เมนูภาษาไทย 16 โมดูล + พื้นที่เนื้อหา (Outlet)
 * การซ่อนเมนูตาม role จะเพิ่มใน Phase 1 (auth) — server ต้องเช็คสิทธิ์จริงเสมอ
 */
export default function AppLayout() {
  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-800">
      <aside className="hidden w-72 shrink-0 flex-col bg-brand-700 text-white md:flex">
        <div className="border-b border-white/10 px-4 py-4">
          <p className="text-base font-semibold">อินธารา Smart Water</p>
          <p className="text-xs text-white/70">ERP v2 · Phase 0</p>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {MODULES.map((module) => (
            <NavLink
              key={module.code}
              to={module.path}
              className={({ isActive }: { isActive: boolean }) =>
                `${linkBase} ${isActive ? 'bg-white/20 font-medium' : 'text-white/85'}`
              }
            >
              <span className="w-12 shrink-0 font-mono text-[11px] text-white/60">
                {module.code}
              </span>
              <span className="truncate">{module.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
          <div>
            <p className="text-sm font-medium text-slate-700">ระบบบริหารโรงงานน้ำดื่มอินธารา</p>
            <p className="text-xs text-slate-500">Rebuild v2 — โครงร่าง Phase 0</p>
          </div>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
            API :3001 · Web :5173
          </span>
        </header>

        <main className="min-w-0 flex-1 p-4 md:p-6">
          <Outlet />
        </main>

        <footer className="border-t border-slate-200 bg-white px-4 py-2 text-xs text-slate-500">
          เมนูทั้ง 16 โมดูลอ้างอิง docs/specs/01_SRS_ความต้องการระบบ.md
        </footer>
      </div>
    </div>
  );
}
