import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, type HealthResponse } from '../../api/client';
import { useAuthSession } from '../../lib/auth';
import { findModule } from '../../lib/modules';
import type { AuditLogItem } from '../auth/UsersPage';

const module = findModule('RPT');

interface AuditLogsResponse {
  data: AuditLogItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * หน้าแดชบอร์ด:
 * - แสดงสถานะการเชื่อมต่อ API จริง (GET /api/health)
 * - สำหรับ admin/manager: แสดง Audit Log 25 รายการล่าสุด + กรองตามผู้ใช้/action ตาม SRS AUTH-6
 */
export default function DashboardPage() {
  const { user } = useAuthSession();
  const canViewAudit = user?.role === 'admin' || user?.role === 'manager';

  const [filterUsername, setFilterUsername] = useState('');
  const [filterAction, setFilterAction] = useState('');

  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => api.get<HealthResponse>('/health'),
    refetchInterval: 30_000,
  });

  const recentAudit = useQuery({
    queryKey: ['dashboard-audit-logs', filterUsername, filterAction],
    enabled: canViewAudit,
    queryFn: () => {
      const params = new URLSearchParams({ page: '1', limit: '25' });
      if (filterUsername.trim()) params.set('username', filterUsername.trim());
      if (filterAction.trim()) params.set('action', filterAction.trim());
      return api.get<AuditLogsResponse>(`/auth/audit-logs?${params.toString()}`);
    },
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
      </div>

      {canViewAudit && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-700">
                บันทึกการใช้งานล่าสุด 25 รายการ (SRS AUTH-6)
              </h2>
              <p className="text-xs text-slate-500">
                ติดตามการเข้าสู่ระบบและการแก้ไขข้อมูลล่าสุดแบบเรียลไทม์
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                value={filterUsername}
                onChange={(e) => setFilterUsername(e.target.value)}
                placeholder="กรองตามผู้ใช้…"
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
              />
              <input
                type="text"
                value={filterAction}
                onChange={(e) => setFilterAction(e.target.value)}
                placeholder="กรองตาม action…"
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
              />
            </div>
          </div>

          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50 font-semibold text-slate-600">
                <tr>
                  <th className="px-3 py-2">เวลา</th>
                  <th className="px-3 py-2">ผู้ใช้</th>
                  <th className="px-3 py-2">Action</th>
                  <th className="px-3 py-2">สถานะ</th>
                  <th className="px-3 py-2">รายละเอียด</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(recentAudit.data?.data ?? []).map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-slate-500">
                      {item.createdAt}
                    </td>
                    <td className="px-3 py-2 font-medium text-slate-800">{item.username}</td>
                    <td className="px-3 py-2 font-mono text-brand-700">{item.action}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded px-2 py-0.5 font-medium ${
                          item.status === 'success'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-red-50 text-red-700'
                        }`}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-600">{item.detail ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
