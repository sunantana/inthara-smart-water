import { type FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../../api/client';
import { useAuthSession } from '../../lib/auth';
import { findModule } from '../../lib/modules';
import { getTodayDateString } from '../../lib/date';
import { useModalEsc } from '../../lib/useModalEsc';
import Toast from '../../components/ui/Toast';
import CollapsibleSection from '../../components/ui/CollapsibleSection';

const moduleMeta = findModule('MNT');

interface MachineRecord {
  id: number;
  code: string;
  name: string;
  category: string | null;
  brand: string | null;
  model: string | null;
  watts: number;
  capacity: string | null;
  status: 'available' | 'in_use' | 'maintenance';
  runHours: number;
  pmIntervalHours: number;
  pmProgressPct: number;
  isDuePm: boolean;
  lastPmDate: string | null;
  linkedAssetId: number | null;
  linkedAssetCode: string | null;
  linkedAssetName: string | null;
  linkedAssetStatus: string | null;
}

interface MaintenanceLogRecord {
  id: number;
  machineCode: string;
  machineName: string | null;
  performedDate: string;
  type: 'repair' | 'pm' | 'inspection';
  action: string;
  technician: string | null;
  costSat: number;
  spareSku: string | null;
  spareQty: number;
  status: string;
}

interface InventoryItemDto {
  sku: string;
  name: string;
  category: string;
  unit: string;
  stock: number;
  min_stock: number;
}

function formatBaht(satang: number): string {
  return (Number(satang || 0) / 100).toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function MaintenancePage() {
  const queryClient = useQueryClient();
  const { user } = useAuthSession();
  const canEdit =
    user?.role === 'admin' || user?.role === 'manager' || user?.role === 'staff';

  const todayIso = getTodayDateString();
  const [selectedMachineFilter, setSelectedMachineFilter] = useState<string>('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(
    null,
  );
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null,
  );

  // Form state for Maintenance / PM Log
  const [machineCode, setMachineCode] = useState<string>('');
  const [performedDate, setPerformedDate] = useState<string>(todayIso);
  const [mntType, setMntType] = useState<'repair' | 'pm' | 'inspection'>('pm');
  const [action, setAction] = useState<string>('');
  const [technician, setTechnician] = useState<string>('');
  const [costBaht, setCostBaht] = useState<string>('0');
  const [spareSku, setSpareSku] = useState<string>('');
  const [spareQty, setSpareQty] = useState<string>('1');

  // Form state for updating run hours
  const [hoursModalMachine, setHoursModalMachine] = useState<MachineRecord | null>(null);
  const [editRunHours, setEditRunHours] = useState<string>('0');
  const [editPmInterval, setEditPmInterval] = useState<string>('500');

  useModalEsc(Boolean(hoursModalMachine), () => setHoursModalMachine(null));

  const machinesQuery = useQuery({
    queryKey: ['cmms-machines'],
    queryFn: () => api.get<{ data: MachineRecord[] }>('/machines'),
  });

  const duePmQuery = useQuery({
    queryKey: ['cmms-due-pm'],
    queryFn: () => api.get<{ data: MachineRecord[]; totalDue: number }>('/machines/due-pm'),
  });

  const logsQuery = useQuery({
    queryKey: ['cmms-logs', selectedMachineFilter],
    queryFn: () => {
      const qs = selectedMachineFilter
        ? `?machineCode=${encodeURIComponent(selectedMachineFilter)}`
        : '';
      return api.get<{ data: MaintenanceLogRecord[] }>(`/maintenance${qs}`);
    },
  });

  const sparePartsQuery = useQuery({
    queryKey: ['inventory-spare-parts'],
    queryFn: () => api.get<{ data: InventoryItemDto[] }>('/inventory'),
  });

  const machines = machinesQuery.data?.data ?? [];
  const dueMachines = duePmQuery.data?.data ?? [];
  const logs = logsQuery.data?.data ?? [];
  const spareItems = (sparePartsQuery.data?.data ?? []).filter(
    (item) => item.category === 'spare_part' || item.sku.startsWith('SP-'),
  );

  const toggleStatusMutation = useMutation({
    mutationFn: ({
      code,
      status,
    }: {
      code: string;
      status: 'available' | 'maintenance';
    }) => api.put<MachineRecord>(`/machines/${encodeURIComponent(code)}/status`, { status }),
    onSuccess: (updated) => {
      const msg = `เปลี่ยนสถานะเครื่องจักร [${updated.code}] เป็น "${updated.status}" และซิงค์สถานะสินทรัพย์เรียบร้อยแล้ว`;
      setFeedback({ type: 'success', text: msg });
      setToast({ message: msg, type: 'success' });
      void queryClient.invalidateQueries({ queryKey: ['cmms-machines'] });
      void queryClient.invalidateQueries({ queryKey: ['cmms-due-pm'] });
      void queryClient.invalidateQueries({ queryKey: ['assets-list'] });
    },
    onError: (err) => {
      const msg = err instanceof ApiError ? err.message : 'เปลี่ยนสถานะเครื่องจักรไม่สำเร็จ';
      setFeedback({ type: 'error', text: msg });
      setToast({ message: msg, type: 'error' });
    },
  });

  const updateHoursMutation = useMutation({
    mutationFn: ({
      code,
      runHours,
      pmIntervalHours,
    }: {
      code: string;
      runHours: number;
      pmIntervalHours: number;
    }) =>
      api.put<MachineRecord>(`/machines/${encodeURIComponent(code)}/hours`, {
        runHours,
        pmIntervalHours,
      }),
    onSuccess: (updated) => {
      const msg = `อัปเดตชั่วโมงเดินเครื่อง [${updated.code}] เป็น ${updated.runHours} / ${updated.pmIntervalHours} ชม. เรียบร้อย`;
      setFeedback({ type: 'success', text: msg });
      setToast({ message: msg, type: 'success' });
      setHoursModalMachine(null);
      void queryClient.invalidateQueries({ queryKey: ['cmms-machines'] });
      void queryClient.invalidateQueries({ queryKey: ['cmms-due-pm'] });
    },
    onError: (err) => {
      const msg = err instanceof ApiError ? err.message : 'อัปเดตชั่วโมงเดินเครื่องไม่สำเร็จ';
      setFeedback({ type: 'error', text: msg });
      setToast({ message: msg, type: 'error' });
    },
  });

  const createLogMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.post<MaintenanceLogRecord>('/maintenance', payload),
    onSuccess: (created) => {
      const msg = `บันทึกงานซ่อม/PM เครื่อง [${created.machineCode}] สำเร็จ${
        created.type === 'pm' ? ' (รีเซ็ตชั่วโมงเดินเครื่องเป็น 0 ชม. แล้ว)' : ''
      }`;
      setFeedback({ type: 'success', text: msg });
      setToast({ message: msg, type: 'success' });
      setAction('');
      setCostBaht('0');
      setSpareSku('');
      setSpareQty('1');
      void queryClient.invalidateQueries({ queryKey: ['cmms-machines'] });
      void queryClient.invalidateQueries({ queryKey: ['cmms-due-pm'] });
      void queryClient.invalidateQueries({ queryKey: ['cmms-logs'] });
      void queryClient.invalidateQueries({ queryKey: ['inventory-spare-parts'] });
      void queryClient.invalidateQueries({ queryKey: ['assets-list'] });
    },
    onError: (err) => {
      const msg = err instanceof ApiError ? err.message : 'บันทึกงานซ่อมไม่สำเร็จ';
      setFeedback({ type: 'error', text: msg });
      setToast({ message: msg, type: 'error' });
    },
  });

  const handleCreateLog = (e: FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const targetMachine = machineCode || machines[0]?.code || '';
    if (!targetMachine) {
      setFeedback({ type: 'error', text: 'กรุณาเลือกเครื่องจักร' });
      return;
    }
    const costSat = Math.max(0, Math.round((Number(costBaht) || 0) * 100));
    const parsedSpareQty = spareSku ? Math.max(1, Math.trunc(Number(spareQty) || 1)) : 0;

    createLogMutation.mutate({
      machineCode: targetMachine,
      performedDate,
      type: mntType,
      action: action.trim(),
      technician: technician.trim() || null,
      costSat,
      spareSku: spareSku || null,
      spareQty: spareSku ? parsedSpareQty : null,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🔧</span>
            <div>
              <h1 className="text-xl font-bold text-slate-900">
                {moduleMeta.label}
              </h1>
              <p className="text-sm text-slate-500">
                ทะเบียนเครื่องจักร แจ้งเตือนครบกำหนด PM (≥90% ชม.เดินเครื่อง) บันทึกซ่อมพร้อมตัดสต็อกอะไหล่อัตโนมัติ
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="rounded-full bg-slate-100 px-3 py-1.5 font-medium text-slate-700">
              เครื่องจักรทั้งหมด: {machines.length} เครื่อง
            </span>
            <span
              className={`rounded-full px-3 py-1.5 font-semibold ${
                dueMachines.length > 0
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              ถึงกำหนด PM: {dueMachines.length} เครื่อง
            </span>
          </div>
        </div>
      </div>

      {/* Alert Banner for Due PM */}
      {dueMachines.length > 0 && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900 shadow-sm">
          <div className="font-semibold">
            ⚠️ แจ้งเตือนเครื่องจักรใกล้/ถึงกำหนดบำรุงรักษาเชิงป้องกัน (PM ≥ 90% ของรอบชั่วโมง)
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {dueMachines.map((m) => (
              <span
                key={m.code}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1 text-xs font-medium text-amber-900"
              >
                <strong>{m.code}</strong> ({m.name}) — {m.runHours}/{m.pmIntervalHours} ชม. (
                {m.pmProgressPct}%)
              </span>
            ))}
          </div>
        </div>
      )}

      {feedback && (
        <div
          className={`rounded-xl border p-4 text-sm font-medium ${
            feedback.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* Machines Grid & Maintenance Form */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Machines List (2 cols) */}
        <div className="space-y-4 lg:col-span-2">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-base font-bold text-slate-900">
              สถานะเครื่องจักรและรอบชั่วโมง PM (MNT-1, MNT-3, MNT-4)
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                    <th className="py-2.5 pr-3">รหัส / ชื่อเครื่องจักร</th>
                    <th className="px-3 py-2.5">ชั่วโมงเดินเครื่อง (PM)</th>
                    <th className="px-3 py-2.5">PM ล่าสุด</th>
                    <th className="px-3 py-2.5">สถานะ</th>
                    {canEdit && <th className="py-2.5 pl-3 text-right">จัดการ</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {machines.map((m) => (
                    <tr key={m.code} className="hover:bg-slate-50">
                      <td className="py-3 pr-3">
                        <div className="font-semibold text-slate-900">
                          {m.code} — {m.name}
                        </div>
                        <div className="text-xs text-slate-500">
                          {m.brand || '-'} {m.model || ''} | กำลังการผลิต: {m.capacity || '-'}
                          {m.linkedAssetCode ? ` | สินทรัพย์: ${m.linkedAssetCode}` : ''}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-between text-xs font-medium">
                          <span>
                            {m.runHours} / {m.pmIntervalHours} ชม.
                          </span>
                          <span
                            className={
                              m.isDuePm ? 'font-bold text-amber-700' : 'text-slate-500'
                            }
                          >
                            {m.pmProgressPct}%
                          </span>
                        </div>
                        <div className="mt-1 h-2 w-36 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={`h-full rounded-full ${
                              m.isDuePm ? 'bg-amber-500' : 'bg-sky-600'
                            }`}
                            style={{ width: `${Math.min(100, m.pmProgressPct)}%` }}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-600">
                        {m.lastPmDate || '-'}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            m.status === 'available'
                              ? 'bg-emerald-100 text-emerald-800'
                              : m.status === 'maintenance'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-sky-100 text-sky-800'
                          }`}
                        >
                          {m.status === 'available'
                            ? 'พร้อมใช้งาน'
                            : m.status === 'maintenance'
                              ? 'กำลังซ่อมบำรุง'
                              : 'กำลังเดินเครื่อง'}
                        </span>
                      </td>
                      {canEdit && (
                        <td className="py-3 pl-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setHoursModalMachine(m);
                                setEditRunHours(String(m.runHours));
                                setEditPmInterval(String(m.pmIntervalHours));
                              }}
                              className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                            >
                              ตั้งชม.
                            </button>
                            <button
                              type="button"
                              disabled={toggleStatusMutation.isPending}
                              onClick={() =>
                                toggleStatusMutation.mutate({
                                  code: m.code,
                                  status:
                                    m.status === 'maintenance' ? 'available' : 'maintenance',
                                })
                              }
                              className={`rounded-lg px-2.5 py-1 text-xs font-medium text-white ${
                                m.status === 'maintenance'
                                  ? 'bg-emerald-600 hover:bg-emerald-700'
                                  : 'bg-amber-600 hover:bg-amber-700'
                              }`}
                            >
                              {m.status === 'maintenance' ? 'คืนพร้อมใช้' : 'แจ้งซ่อม'}
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Maintenance Logs History */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-bold text-slate-900">
                ประวัติการซ่อมบำรุงและ PM ({logs.length} รายการ)
              </h2>
              <select
                value={selectedMachineFilter}
                onChange={(e) => setSelectedMachineFilter(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
              >
                <option value="">ทุกเครื่องจักร</option>
                {machines.map((m) => (
                  <option key={m.code} value={m.code}>
                    {m.code} — {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                    <th className="py-2 pr-3">วันที่</th>
                    <th className="px-3 py-2">เครื่องจักร</th>
                    <th className="px-3 py-2">ประเภท</th>
                    <th className="px-3 py-2">รายละเอียดการซ่อม</th>
                    <th className="px-3 py-2">อะไหล่ที่เบิก</th>
                    <th className="py-2 pl-3 text-right">ค่าใช้จ่าย (บาท)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-xs text-slate-400">
                        ยังไม่มีประวัติการซ่อมบำรุง
                      </td>
                    </tr>
                  ) : (
                    logs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50">
                        <td className="py-2.5 pr-3 text-xs font-medium text-slate-700">
                          {log.performedDate}
                        </td>
                        <td className="px-3 py-2.5 text-xs font-semibold text-slate-900">
                          {log.machineCode}
                        </td>
                        <td className="px-3 py-2.5">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                              log.type === 'pm'
                                ? 'bg-sky-100 text-sky-800'
                                : log.type === 'repair'
                                  ? 'bg-rose-100 text-rose-800'
                                  : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {log.type.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-slate-700">
                          <div>{log.action}</div>
                          {log.technician && (
                            <div className="text-[11px] text-slate-400">
                              ช่าง: {log.technician}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-slate-600">
                          {log.spareSku ? `${log.spareSku} × ${log.spareQty}` : '-'}
                        </td>
                        <td className="py-2.5 pl-3 text-right text-xs font-semibold text-slate-900">
                          ฿{formatBaht(log.costSat)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Record Maintenance / PM Form (1 col) */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-base font-bold text-slate-900">
            บันทึกซ่อมบำรุง / PM และเบิกอะไหล่ (MNT-2)
          </h2>
          <form onSubmit={handleCreateLog} className="space-y-3 text-sm">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                เครื่องจักร *
              </label>
              <select
                value={machineCode || machines[0]?.code || ''}
                onChange={(e) => setMachineCode(e.target.value)}
                disabled={!canEdit}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {machines.map((m) => (
                  <option key={m.code} value={m.code}>
                    {m.code} — {m.name} ({m.runHours}/{m.pmIntervalHours} ชม.)
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  ประเภทงาน *
                </label>
                <select
                  value={mntType}
                  onChange={(e) =>
                    setMntType(e.target.value as 'repair' | 'pm' | 'inspection')
                  }
                  disabled={!canEdit}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="pm">PM (บำรุงรักษาเชิงป้องกัน)</option>
                  <option value="repair">ซ่อมฉุกเฉิน (Repair)</option>
                  <option value="inspection">ตรวจสอบ (Inspection)</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  วันที่ดำเนินการ *
                </label>
                <input
                  type="date"
                  value={performedDate}
                  onChange={(e) => setPerformedDate(e.target.value)}
                  disabled={!canEdit}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  required
                />
              </div>
            </div>

            {mntType === 'pm' && (
              <div className="rounded-lg border border-sky-200 bg-sky-50 p-2.5 text-xs text-sky-800">
                💡 <strong>ข้อแนะนำ PM:</strong> การบันทึกงานประเภท PM จะรีเซ็ตชั่วโมงเดินเครื่องสะสม (Run Hours) ของเครื่องจักรนี้กลับเป็น 0 ชม. อัตโนมัติ
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                รายละเอียดการซ่อม / รายการตรวจเช็ค *
              </label>
              <textarea
                rows={2}
                value={action}
                onChange={(e) => setAction(e.target.value)}
                disabled={!canEdit}
                placeholder="เช่น เปลี่ยนไส้กรองหยาบ 5 ไมครอน และล้างเมมเบรน RO"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  ช่างผู้ดำเนินการ
                </label>
                <input
                  type="text"
                  value={technician}
                  onChange={(e) => setTechnician(e.target.value)}
                  disabled={!canEdit}
                  placeholder="ชื่อช่างซ่อม"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  ค่าแรง/ค่าซ่อม (บาท)
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={costBaht}
                  onChange={(e) => setCostBaht(e.target.value)}
                  disabled={!canEdit}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <CollapsibleSection
              title="ใช้อะไหล่จากคลัง (ถ้ามี)"
              badge={spareSku ? 'เบิก 1 รายการ' : undefined}
              defaultOpen={Boolean(spareSku)}
            >
              <div className="space-y-2 pt-1">
                <select
                  value={spareSku}
                  onChange={(e) => setSpareSku(e.target.value)}
                  disabled={!canEdit}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                >
                  <option value="">-- ไม่เบิกอะไหล่ --</option>
                  {spareItems.map((sp) => (
                    <option key={sp.sku} value={sp.sku}>
                      {sp.sku} — {sp.name} (คงเหลือ {sp.stock} {sp.unit})
                    </option>
                  ))}
                </select>
                {spareSku && (
                  <div>
                    <label className="mb-1 block text-xs text-slate-600">
                      จำนวนอะไหล่ที่เบิกใช้
                    </label>
                    <input
                      type="number"
                      inputMode="numeric"
                      min="1"
                      value={spareQty}
                      onChange={(e) => setSpareQty(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold"
                    />
                  </div>
                )}
              </div>
            </CollapsibleSection>

            {canEdit && (
              <div className="sticky bottom-0 pt-2 bg-white/95 backdrop-blur-xs">
                <button
                  type="submit"
                  disabled={createLogMutation.isPending}
                  className="w-full min-h-[44px] rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 disabled:opacity-50"
                >
                  {createLogMutation.isPending
                    ? 'กำลังบันทึก...'
                    : 'บันทึกงานซ่อมบำรุง / PM'}
                </button>
              </div>
            )}
          </form>
        </div>
      </div>

      {/* Modal for Run Hours */}
      {hoursModalMachine && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-base font-bold text-slate-900">
              อัปเดตชั่วโมงเดินเครื่อง: {hoursModalMachine.code}
            </h3>
            <p className="mt-1 text-xs text-slate-500">{hoursModalMachine.name}</p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  ชั่วโมงเดินเครื่องสะสมปัจจุบัน (Run Hours)
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  value={editRunHours}
                  onChange={(e) => setEditRunHours(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  รอบชั่วโมง PM (PM Interval Hours)
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  value={editPmInterval}
                  onChange={(e) => setEditPmInterval(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"
                />
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setHoursModalMachine(null)}
                className="min-h-[44px] rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={updateHoursMutation.isPending}
                onClick={() =>
                  updateHoursMutation.mutate({
                    code: hoursModalMachine.code,
                    runHours: Math.max(0, Math.trunc(Number(editRunHours) || 0)),
                    pmIntervalHours: Math.max(1, Math.trunc(Number(editPmInterval) || 500)),
                  })
                }
                className="min-h-[44px] rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
              >
                {updateHoursMutation.isPending ? 'กำลังบันทึก...' : 'บันทึกชั่วโมง'}
              </button>
            </div>
          </div>
        </div>
      )}
      <Toast message={toast?.message ?? null} type={toast?.type} onClose={() => setToast(null)} />
    </div>
  );
}
