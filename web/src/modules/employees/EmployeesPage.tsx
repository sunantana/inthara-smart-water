import { type FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../../api/client';
import { useAuthSession } from '../../lib/auth';
import { findModule } from '../../lib/modules';
import Toast from '../../components/ui/Toast';
import CollapsibleSection from '../../components/ui/CollapsibleSection';

const moduleMeta = findModule('EMP');

interface EmployeeRecord {
  id: number;
  code: string;
  name: string;
  nickname: string | null;
  position: string | null;
  department: string | null;
  phone: string | null;
  salaryType: 'monthly' | 'daily' | 'hourly';
  salarySat: number;
  driverLicense: string | null;
  driverLicenseExpiry: string | null;
  daysUntilLicenseExpiry: number | null;
  isActive: boolean;
}

function formatBaht(satang: number): string {
  return (Number(satang || 0) / 100).toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function EmployeesPage() {
  const queryClient = useQueryClient();
  const { user } = useAuthSession();
  const canManage = user?.role === 'admin' || user?.role === 'manager';

  const [daysThreshold, setDaysThreshold] = useState<number>(30);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(
    null,
  );
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null,
  );

  // Create form state
  const [name, setName] = useState<string>('');
  const [nickname, setNickname] = useState<string>('');
  const [position, setPosition] = useState<string>('พนักงานขับรถส่งน้ำ');
  const [department, setDepartment] = useState<string>('จัดส่ง (Logistics)');
  const [phone, setPhone] = useState<string>('');
  const [salaryType, setSalaryType] = useState<'monthly' | 'daily' | 'hourly'>('monthly');
  const [salaryBaht, setSalaryBaht] = useState<string>('15000');
  const [driverLicense, setDriverLicense] = useState<string>('');
  const [driverLicenseExpiry, setDriverLicenseExpiry] = useState<string>('');

  const employeesQuery = useQuery({
    queryKey: ['employees-list'],
    queryFn: () => api.get<{ data: EmployeeRecord[] }>('/employees?active=all'),
  });

  const expiringQuery = useQuery({
    queryKey: ['employees-license-expiring', daysThreshold],
    queryFn: () =>
      api.get<{ data: EmployeeRecord[]; totalExpiring: number }>(
        `/employees/license-expiring?days=${daysThreshold}`,
      ),
  });

  const employees = employeesQuery.data?.data ?? [];
  const expiringList = expiringQuery.data?.data ?? [];

  const createEmployeeMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.post<EmployeeRecord>('/employees', payload),
    onSuccess: (created) => {
      const msg = `เพิ่มพนักงาน [${created.code}] ${created.name} เรียบร้อยแล้ว`;
      setFeedback({ type: 'success', text: msg });
      setToast({ message: msg, type: 'success' });
      setName('');
      setNickname('');
      setPhone('');
      setDriverLicense('');
      setDriverLicenseExpiry('');
      void queryClient.invalidateQueries({ queryKey: ['employees-list'] });
      void queryClient.invalidateQueries({ queryKey: ['employees-license-expiring'] });
    },
    onError: (err) => {
      const msg = err instanceof ApiError ? err.message : 'เพิ่มพนักงานไม่สำเร็จ';
      setFeedback({ type: 'error', text: msg });
      setToast({ message: msg, type: 'error' });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: number; isActive: boolean }) =>
      isActive
        ? api.put<EmployeeRecord>(`/employees/${id}`, { isActive: true })
        : api.delete<EmployeeRecord>(`/employees/${id}`),
    onSuccess: (updated) => {
      const msg = `ปรับสถานะพนักงาน [${updated.code}] ${updated.name} เป็น "${
        updated.isActive ? 'ปฏิบัติงาน (Active)' : 'พ้นสภาพ/พักงาน (Inactive)'
      }" เรียบร้อยแล้ว`;
      setFeedback({ type: 'success', text: msg });
      setToast({ message: msg, type: 'success' });
      void queryClient.invalidateQueries({ queryKey: ['employees-list'] });
      void queryClient.invalidateQueries({ queryKey: ['employees-license-expiring'] });
    },
    onError: (err) => {
      const msg = err instanceof ApiError ? err.message : 'ปรับสถานะพนักงานไม่สำเร็จ';
      setFeedback({ type: 'error', text: msg });
      setToast({ message: msg, type: 'error' });
    },
  });

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    createEmployeeMutation.mutate({
      name: name.trim(),
      nickname: nickname.trim() || null,
      position: position.trim() || null,
      department: department.trim() || null,
      phone: phone.trim() || null,
      salaryType,
      salarySat: Math.round((Number(salaryBaht) || 0) * 100),
      driverLicense: driverLicense.trim() || null,
      driverLicenseExpiry: driverLicenseExpiry || null,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl">👷</span>
            <div>
              <h1 className="text-xl font-bold text-slate-900">
                {moduleMeta.label}
              </h1>
              <p className="text-sm text-slate-500">
                จัดการประวัติพนักงาน แจ้งเตือนใบขับขี่ใกล้หมดอายุ และบล็อกพนักงานพ้นสภาพไม่ให้จัดทริปหรือถือครองสินทรัพย์
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="rounded-full bg-slate-100 px-3 py-1.5 font-semibold text-slate-700">
              ทั้งหมด: {employees.length} คน
            </span>
            <span
              className={`rounded-full px-3 py-1.5 font-semibold ${
                expiringList.length > 0
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              ใบขับขี่หมดอายุใน {daysThreshold} วัน: {expiringList.length} คน
            </span>
          </div>
        </div>
      </div>

      {/* Expiring Driver License Banner (EMP-1) */}
      <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-bold text-amber-900">
            🪪 ตรวจสอบใบอนุญาตขับขี่ใกล้หมดอายุ (EMP-1)
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span>แจ้งเตือนล่วงหน้า (วัน):</span>
            <input
              type="number"
              min="1"
              max="365"
              value={daysThreshold}
              onChange={(e) => setDaysThreshold(Math.max(1, Number(e.target.value) || 30))}
              className="w-20 rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-xs font-semibold"
            />
          </div>
        </div>
        {expiringList.length === 0 ? (
          <p className="mt-2 text-xs text-emerald-800">
            ✅ ไม่มีพนักงานปฏิบัติงานที่ใบขับขี่จะหมดอายุภายใน {daysThreshold} วันข้างหน้า
          </p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-2">
            {expiringList.map((emp) => (
              <span
                key={emp.id}
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1 text-xs font-medium text-amber-900"
              >
                <strong>{emp.code}</strong> {emp.name} — หมดอายุ {emp.driverLicenseExpiry} (อีก{' '}
                {emp.daysUntilLicenseExpiry} วัน)
              </span>
            ))}
          </div>
        )}
      </div>

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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Employees List (2 cols) */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <h2 className="mb-4 text-base font-bold text-slate-900">
            รายชื่อพนักงานทั้งหมด (EMP-1, EMP-2)
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                  <th className="py-2.5 pr-3">รหัส / ชื่อ-สกุล</th>
                  <th className="px-3 py-2.5">ตำแหน่ง / แผนก</th>
                  <th className="px-3 py-2.5">ใบขับขี่ / วันหมดอายุ</th>
                  <th className="px-3 py-2.5 text-right">อัตราค่าจ้าง</th>
                  <th className="px-3 py-2.5">สถานะ</th>
                  {canManage && <th className="py-2.5 pl-3 text-right">จัดการ</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {employees.map((emp) => (
                  <tr key={emp.id} className="hover:bg-slate-50">
                    <td className="py-3 pr-3">
                      <div className="font-semibold text-slate-900">
                        {emp.code} — {emp.name}{' '}
                        {emp.nickname ? `(${emp.nickname})` : ''}
                      </div>
                      <div className="text-xs text-slate-500">โทร: {emp.phone || '-'}</div>
                    </td>
                    <td className="px-3 py-3 text-xs text-slate-700">
                      <div className="font-medium">{emp.position || '-'}</div>
                      <div className="text-slate-400">{emp.department || '-'}</div>
                    </td>
                    <td className="px-3 py-3 text-xs">
                      {emp.driverLicense ? (
                        <div>
                          <div className="font-medium text-slate-800">{emp.driverLicense}</div>
                          <div
                            className={
                              emp.daysUntilLicenseExpiry !== null &&
                              emp.daysUntilLicenseExpiry <= daysThreshold
                                ? 'font-bold text-amber-700'
                                : 'text-slate-500'
                            }
                          >
                            หมดอายุ: {emp.driverLicenseExpiry || '-'}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right text-xs font-medium text-slate-800">
                      ฿{formatBaht(emp.salarySat)}
                      <span className="block text-[10px] text-slate-400">
                        /{emp.salaryType === 'monthly' ? 'เดือน' : emp.salaryType === 'daily' ? 'วัน' : 'ชม.'}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          emp.isActive
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {emp.isActive ? 'ปฏิบัติงาน' : 'พ้นสภาพ'}
                      </span>
                    </td>
                    {canManage && (
                      <td className="py-3 pl-3 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            toggleActiveMutation.mutate({
                              id: emp.id,
                              isActive: !emp.isActive,
                            })
                          }
                          className={`rounded-lg px-2.5 py-1 text-xs font-medium ${
                            emp.isActive
                              ? 'border border-rose-200 text-rose-700 hover:bg-rose-50'
                              : 'bg-emerald-600 text-white hover:bg-emerald-700'
                          }`}
                        >
                          {emp.isActive ? 'ระงับ/พ้นสภาพ' : 'เปิดใช้งาน'}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Create Employee Form */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-base font-bold text-slate-900">เพิ่มพนักงานใหม่</h2>
          <form onSubmit={handleCreate} className="space-y-4 text-sm">
            {/* Box 1: ข้อมูลหลัก */}
            <div className="space-y-3 rounded-lg border border-slate-100 bg-slate-50/50 p-3">
              <div className="text-xs font-bold text-slate-800">ข้อมูลหลัก</div>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    ชื่อ-นามสกุล *
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={!canManage}
                    placeholder="ชื่อ-นามสกุล"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    ชื่อเล่น
                  </label>
                  <input
                    type="text"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    disabled={!canManage}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    ตำแหน่ง
                  </label>
                  <input
                    type="text"
                    value={position}
                    onChange={(e) => setPosition(e.target.value)}
                    disabled={!canManage}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    แผนก
                  </label>
                  <input
                    type="text"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    disabled={!canManage}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  เบอร์โทรศัพท์
                </label>
                <input
                  type="tel"
                  inputMode="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={!canManage}
                  placeholder="08X-XXX-XXXX"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono"
                />
              </div>
            </div>

            {/* Box 2: ข้อมูลเพิ่มเติม (เงินเดือน & ใบขับขี่) */}
            <CollapsibleSection
              title="ข้อมูลเพิ่มเติม (เงินเดือน & ใบขับขี่)"
              badge={driverLicense ? 'มีใบขับขี่' : undefined}
              defaultOpen={false}
            >
              <div className="space-y-3 pt-2">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                      ประเภทค่าจ้าง
                    </label>
                    <select
                      value={salaryType}
                      onChange={(e) =>
                        setSalaryType(e.target.value as 'monthly' | 'daily' | 'hourly')
                      }
                      disabled={!canManage}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                    >
                      <option value="monthly">รายเดือน (Monthly)</option>
                      <option value="daily">รายวัน (Daily)</option>
                      <option value="hourly">รายชั่วโมง (Hourly)</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                      อัตราค่าจ้าง (บาท)
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      value={salaryBaht}
                      onChange={(e) => setSalaryBaht(e.target.value)}
                      disabled={!canManage}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                      เลขใบอนุญาตขับขี่
                    </label>
                    <input
                      type="text"
                      value={driverLicense}
                      onChange={(e) => setDriverLicense(e.target.value)}
                      disabled={!canManage}
                      placeholder="เช่น 65001122"
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                      วันหมดอายุใบขับขี่
                    </label>
                    <input
                      type="date"
                      value={driverLicenseExpiry}
                      onChange={(e) => setDriverLicenseExpiry(e.target.value)}
                      disabled={!canManage}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              </div>
            </CollapsibleSection>

            {canManage && (
              <div className="sticky bottom-0 pt-2 bg-white/95 backdrop-blur-xs">
                <button
                  type="submit"
                  disabled={createEmployeeMutation.isPending}
                  className="w-full min-h-[44px] rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 disabled:opacity-50"
                >
                  {createEmployeeMutation.isPending ? 'กำลังบันทึก...' : 'บันทึกพนักงานใหม่'}
                </button>
              </div>
            )}
          </form>
        </div>
      </div>
      <Toast message={toast?.message ?? null} type={toast?.type} onClose={() => setToast(null)} />
    </div>
  );
}
