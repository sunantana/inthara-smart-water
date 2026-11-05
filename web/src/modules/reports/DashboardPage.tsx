import { useQuery } from '@tanstack/react-query';
import { api, type HealthResponse } from '../../api/client';
import { findModule } from '../../lib/modules';

const module = findModule('RPT');

/**
 * หน้าแรกของ Phase 0 — แสดงสถานะการเชื่อมต่อ API จริง (GET /api/health)
 * ทำให้เห็นทันทีว่า frontend → proxy → backend → SQLite ทำงานครบเส้น
 */
export default function DashboardPage() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => api.get<HealthResponse>('/health'),
    refetchInterval: 30_000,
  });

  const badge = health.isPending
    ? { text: 'กำลังตรวจสอบ…', className: 'bg-slate-100 text-slate-600' }
    : health.isError
      ? { text: 'เชื่อมต่อไม่สำเร็จ', className: 'bg-red-50 text-red-700' }
      : health.data.database === 'connected'
        ? { text: 'เชื่อมต่อแล้ว', className: 'bg-emerald-50 text-emerald-700' }
        : { text: 'ฐานข้อมูลไม่พร้อม', className: 'bg-amber-50 text-amber-700' };

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold text-slate-800">{module.label}</h1>
        <span className="rounded-full bg-slate-200 px-3 py-1 font-mono text-xs text-slate-600">
          {module.code} · SRS §{module.srsSection}
        </span>
      </header>

      <p className="text-slate-600">{module.description}</p>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-slate-700">สถานะระบบ (GET /api/health)</h2>
          <span className={`rounded-full px-3 py-1 text-xs font-medium ${badge.className}`}>
            {badge.text}
          </span>
        </div>

        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div className="rounded-lg bg-slate-50 p-3">
            <dt className="text-slate-500">สถานะ API</dt>
            <dd className="mt-1 font-mono text-slate-800">{health.data?.status ?? '-'}</dd>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <dt className="text-slate-500">ฐานข้อมูล</dt>
            <dd className="mt-1 font-mono text-slate-800">{health.data?.database ?? '-'}</dd>
          </div>
          <div className="rounded-lg bg-slate-50 p-3">
            <dt className="text-slate-500">เวลาตอบกลับ</dt>
            <dd className="mt-1 font-mono text-slate-800">
              {health.data ? new Date(health.data.timestamp).toLocaleTimeString('th-TH') : '-'}
            </dd>
          </div>
        </dl>

        {health.isError && (
          <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {health.error.message} — ตรวจสอบว่า backend รันอยู่ที่พอร์ต 3001
          </p>
        )}

        <p className="mt-4 text-xs text-slate-500">
          Phase 0: หน้านี้ยืนยันว่า frontend (5173) → proxy → backend (3001) → SQLite ทำงานครบเส้น
          รายงานยอดขายจริงจะทำใน Phase ถัดไป
        </p>
      </div>
    </section>
  );
}
