import { type FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../../api/client';
import { useAuthSession } from '../../lib/auth';
import { findModule } from '../../lib/modules';

const moduleMeta = findModule('AST');

interface AssetRecord {
  id: number;
  code: string;
  name: string;
  category: string;
  categoryName: string | null;
  brand: string | null;
  model: string | null;
  serialNo: string | null;
  location: string | null;
  acquisitionDate: string | null;
  costSat: number;
  usefulLifeYears: number;
  salvageValueSat: number;
  depreciationPerYearSat: number;
  accumulatedDepreciationSat: number;
  netBookValueSat: number;
  elapsedYears: number;
  assignedEmployeeId: number | null;
  assignedEmployeeCode: string | null;
  assignedEmployeeName: string | null;
  status: 'in_use' | 'maintenance' | 'retired';
  isActive: boolean;
}

interface DepreciationResponse {
  assetId: number;
  code: string;
  name: string;
  asOfDate: string;
  acquisitionDate: string | null;
  costSat: number;
  salvageValueSat: number;
  depreciableBaseSat: number;
  usefulLifeYears: number;
  elapsedYears: number;
  depreciationPerYearSat: number;
  accumulatedDepreciationSat: number;
  netBookValueSat: number;
}

function formatBaht(satang: number): string {
  return (Number(satang || 0) / 100).toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function AssetsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuthSession();
  const canManage = user?.role === 'admin' || user?.role === 'manager';

  const todayIso = new Date().toISOString().slice(0, 10);
  const [selectedAssetId, setSelectedAssetId] = useState<number | null>(null);
  const [asOfDate, setAsOfDate] = useState<string>(todayIso);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null,
  );

  // Create form state
  const [name, setName] = useState<string>('');
  const [category, setCategory] = useState<string>('production');
  const [acquisitionDate, setAcquisitionDate] = useState<string>(todayIso);
  const [costBaht, setCostBaht] = useState<string>('100000');
  const [salvageBaht, setSalvageBaht] = useState<string>('10000');
  const [usefulLifeYears, setUsefulLifeYears] = useState<string>('5');
  const [location, setLocation] = useState<string>('อาคารผลิตน้ำดื่ม');

  const assetsQuery = useQuery({
    queryKey: ['assets-list'],
    queryFn: () => api.get<{ data: AssetRecord[] }>('/assets'),
  });

  const assets = assetsQuery.data?.data ?? [];
  const activeSelectedId = selectedAssetId ?? assets[0]?.id ?? null;

  const depreciationQuery = useQuery({
    queryKey: ['asset-depreciation', activeSelectedId, asOfDate],
    enabled: Boolean(activeSelectedId),
    queryFn: () =>
      api.get<DepreciationResponse>(
        `/assets/${activeSelectedId}/depreciation?asOf=${encodeURIComponent(asOfDate)}`,
      ),
  });

  const createAssetMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post<AssetRecord>('/assets', payload),
    onSuccess: (created) => {
      setFeedback({
        type: 'success',
        text: `ขึ้นทะเบียนสินทรัพย์ [${created.code}] ${created.name} สำเร็จ`,
      });
      setName('');
      setSelectedAssetId(created.id);
      void queryClient.invalidateQueries({ queryKey: ['assets-list'] });
    },
    onError: (err) => {
      setFeedback({
        type: 'error',
        text: err instanceof ApiError ? err.message : 'เพิ่มสินทรัพย์ไม่สำเร็จ',
      });
    },
  });

  const retireAssetMutation = useMutation({
    mutationFn: (id: number) => api.delete<AssetRecord>(`/assets/${id}`),
    onSuccess: (retired) => {
      setFeedback({
        type: 'success',
        text: `จำหน่าย/ปลดระวางสินทรัพย์ [${retired.code}] เรียบร้อยแล้ว`,
      });
      void queryClient.invalidateQueries({ queryKey: ['assets-list'] });
    },
  });

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    createAssetMutation.mutate({
      name: name.trim(),
      category,
      location: location.trim() || null,
      acquisitionDate,
      costSat: Math.round((Number(costBaht) || 0) * 100),
      salvageValueSat: Math.round((Number(salvageBaht) || 0) * 100),
      usefulLifeYears: Math.max(1, Math.trunc(Number(usefulLifeYears) || 5)),
    });
  };

  const dep = depreciationQuery.data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🏢</span>
            <div>
              <h1 className="text-xl font-bold text-slate-900">
                {moduleMeta.label}
              </h1>
              <p className="text-sm text-slate-500">
                คำนวณค่าเสื่อมราคาวิธีเส้นตรง (Straight-Line Depreciation) ซิงค์สถานะกับเครื่องจักรและผู้รับผิดชอบ
              </p>
            </div>
          </div>
          <div className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">
            สินทรัพย์ทั้งหมด: {assets.length} รายการ
          </div>
        </div>
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
        {/* Assets Table (2 cols) */}
        <div className="space-y-6 lg:col-span-2">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-base font-bold text-slate-900">
              รายการสินทรัพย์ถาวร (AST-1, AST-2)
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                    <th className="py-2.5 pr-3">รหัส / ชื่อสินทรัพย์</th>
                    <th className="px-3 py-2.5 text-right">ราคาทุน (บาท)</th>
                    <th className="px-3 py-2.5 text-right">ค่าเสื่อม/ปี</th>
                    <th className="px-3 py-2.5 text-right">มูลค่าสุทธิ (NBV)</th>
                    <th className="px-3 py-2.5">สถานะ</th>
                    <th className="py-2.5 pl-3 text-right">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {assets.map((asset) => (
                    <tr
                      key={asset.id}
                      onClick={() => setSelectedAssetId(asset.id)}
                      className={`cursor-pointer hover:bg-slate-50 ${
                        activeSelectedId === asset.id ? 'bg-sky-50/70' : ''
                      }`}
                    >
                      <td className="py-3 pr-3">
                        <div className="font-semibold text-slate-900">
                          {asset.code} — {asset.name}
                        </div>
                        <div className="text-xs text-slate-500">
                          ได้มา: {asset.acquisitionDate || '-'} | อายุใช้งาน:{' '}
                          {asset.usefulLifeYears} ปี
                          {asset.assignedEmployeeName
                            ? ` | ผู้ดูแล: ${asset.assignedEmployeeName}`
                            : ''}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right text-xs font-medium text-slate-700">
                        ฿{formatBaht(asset.costSat)}
                      </td>
                      <td className="px-3 py-3 text-right text-xs text-amber-700">
                        ฿{formatBaht(asset.depreciationPerYearSat)}
                      </td>
                      <td className="px-3 py-3 text-right text-xs font-bold text-emerald-700">
                        ฿{formatBaht(asset.netBookValueSat)}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            asset.status === 'in_use'
                              ? 'bg-emerald-100 text-emerald-800'
                              : asset.status === 'maintenance'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {asset.status === 'in_use'
                            ? 'ใช้งานปกติ'
                            : asset.status === 'maintenance'
                              ? 'ซ่อมบำรุง'
                              : 'ปลดระวาง'}
                        </span>
                      </td>
                      <td className="py-3 pl-3 text-right">
                        {canManage && asset.status !== 'retired' && (
                          <button
                            type="button"
                            onClick={(ev) => {
                              ev.stopPropagation();
                              retireAssetMutation.mutate(asset.id);
                            }}
                            className="rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50"
                          >
                            ปลดระวาง
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Straight-line Depreciation Calculator Card */}
          {dep && (
            <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    📐 จำลองค่าเสื่อมราคาเส้นตรง: {dep.code} — {dep.name}
                  </h3>
                  <p className="text-xs text-slate-500">
                    สูตร: (ราคาทุน − มูลค่าซาก) ÷ อายุใช้งาน | สะสมไม่เกินฐานค่าเสื่อมราคา
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-slate-700">คำนวณ ณ วันที่:</label>
                  <input
                    type="date"
                    value={asOfDate}
                    onChange={(e) => setAsOfDate(e.target.value)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs"
                  />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="text-[11px] text-slate-500">ราคาทุน / มูลค่าซาก</div>
                  <div className="mt-1 text-sm font-bold text-slate-900">
                    ฿{formatBaht(dep.costSat)}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    ซาก: ฿{formatBaht(dep.salvageValueSat)}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="text-[11px] text-slate-500">ค่าเสื่อมราคาต่อปี</div>
                  <div className="mt-1 text-sm font-bold text-amber-700">
                    ฿{formatBaht(dep.depreciationPerYearSat)} / ปี
                  </div>
                  <div className="text-[11px] text-slate-500">
                    อายุใช้งาน {dep.usefulLifeYears} ปี
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="text-[11px] text-slate-500">
                    ค่าเสื่อมสะสม ({dep.elapsedYears} ปีเต็ม)
                  </div>
                  <div className="mt-1 text-sm font-bold text-rose-700">
                    ฿{formatBaht(dep.accumulatedDepreciationSat)}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    ได้มา: {dep.acquisitionDate || '-'}
                  </div>
                </div>
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                  <div className="text-[11px] font-medium text-emerald-800">
                    มูลค่าตามบัญชีสุทธิ (NBV)
                  </div>
                  <div className="mt-1 text-base font-extrabold text-emerald-700">
                    ฿{formatBaht(dep.netBookValueSat)}
                  </div>
                  <div className="text-[11px] text-emerald-700">ณ {dep.asOfDate}</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Create Asset Form */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-base font-bold text-slate-900">
            ขึ้นทะเบียนสินทรัพย์ใหม่
          </h2>
          <form onSubmit={handleCreate} className="space-y-3 text-sm">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                ชื่อสินทรัพย์ *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!canManage}
                placeholder="เช่น ปั๊มแรงดันสูงสแตนเลส"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  หมวดหมู่
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  disabled={!canManage}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="production">เครื่องจักรผลิต</option>
                  <option value="vehicle">ยานพาหนะขนส่ง</option>
                  <option value="office">อุปกรณ์สำนักงาน</option>
                  <option value="general">ทั่วไป</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  วันที่ได้มา *
                </label>
                <input
                  type="date"
                  value={acquisitionDate}
                  onChange={(e) => setAcquisitionDate(e.target.value)}
                  disabled={!canManage}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  ราคาทุน (บาท) *
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={costBaht}
                  onChange={(e) => setCostBaht(e.target.value)}
                  disabled={!canManage}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  มูลค่าซาก (บาท) *
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={salvageBaht}
                  onChange={(e) => setSalvageBaht(e.target.value)}
                  disabled={!canManage}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  อายุการใช้งาน (ปี) *
                </label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={usefulLifeYears}
                  onChange={(e) => setUsefulLifeYears(e.target.value)}
                  disabled={!canManage}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  สถานที่ตั้ง
                </label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  disabled={!canManage}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>

            {canManage && (
              <button
                type="submit"
                disabled={createAssetMutation.isPending}
                className="w-full rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 disabled:opacity-50"
              >
                {createAssetMutation.isPending
                  ? 'กำลังบันทึก...'
                  : 'บันทึกขึ้นทะเบียนสินทรัพย์'}
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
