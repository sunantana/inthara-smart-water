import { type FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../../api/client';
import { useAuthSession } from '../../lib/auth';
import { findModule } from '../../lib/modules';

const moduleMeta = findModule('PRD');

type FgSku = 'FG-189L' | 'FG-350ML' | 'FG-600ML' | 'FG-1500ML';

const FG_SKU_INFO: Array<{ sku: FgSku; label: string; unit: string }> = [
  { sku: 'FG-189L', label: 'ถัง 18.9 ลิตร (FG-189L)', unit: 'ถัง' },
  { sku: 'FG-350ML', label: 'แพ็ค 350 มล. (FG-350ML)', unit: 'แพ็ค' },
  { sku: 'FG-600ML', label: 'แพ็ค 600 มล. (FG-600ML)', unit: 'แพ็ค' },
  { sku: 'FG-1500ML', label: 'แพ็ค 1500 มล. (FG-1500ML)', unit: 'แพ็ค' },
];

export interface ProductionLotRecord {
  id: number;
  lotNo: string;
  productionDate: string;
  shift: 'day' | 'night';
  shiftCode: 'D' | 'N';
  plan: Record<FgSku, number>;
  actual: Record<FgSku, number>;
  tdsRaw: number | null;
  tdsRo: number | null;
  ph: number | null;
  qaPassed: boolean | null;
  qaStatus: 'pending' | 'passed' | 'failed';
  notes: string | null;
  createdByName: string | null;
  createdAt: string;
}

interface ProductionDashboardResponse {
  summary: {
    totalLots: number;
    qaPassedCount: number;
    qaFailedCount: number;
    qaPendingCount: number;
    plan: Record<FgSku, number>;
    actual: Record<FgSku, number>;
  };
  byShift: Array<{
    shift: 'day' | 'night';
    label: string;
    lotsCount: number;
    qaPassedCount: number;
    qaFailedCount: number;
    qaPendingCount: number;
    plan: Record<FgSku, number>;
    actual: Record<FgSku, number>;
  }>;
  byDate: Array<{
    date: string;
    lotsCount: number;
    plan: Record<FgSku, number>;
    actual: Record<FgSku, number>;
  }>;
}

export default function ProductionPage() {
  const queryClient = useQueryClient();
  const { user } = useAuthSession();
  const canEdit =
    user?.role === 'admin' || user?.role === 'manager' || user?.role === 'staff';

  const todayIso = new Date().toISOString().slice(0, 10);
  const [activeTab, setActiveTab] = useState<'lots' | 'qa' | 'dashboard'>('lots');

  // Filters
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [shiftFilter, setShiftFilter] = useState<string>('');

  // Form state for creating a new lot
  const [prodDate, setProdDate] = useState<string>(todayIso);
  const [shift, setShift] = useState<'day' | 'night'>('day');
  const [planMap, setPlanMap] = useState<Record<FgSku, string>>({
    'FG-189L': '100',
    'FG-350ML': '50',
    'FG-600ML': '50',
    'FG-1500ML': '30',
  });
  const [actualMap, setActualMap] = useState<Record<FgSku, string>>({
    'FG-189L': '100',
    'FG-350ML': '50',
    'FG-600ML': '50',
    'FG-1500ML': '30',
  });
  const [tdsRaw, setTdsRaw] = useState<string>('240');
  const [tdsRo, setTdsRo] = useState<string>('8.5');
  const [ph, setPh] = useState<string>('7.2');
  const [notes, setNotes] = useState<string>('');

  // QA confirmation modal state
  const [inspectingLot, setInspectingLot] = useState<ProductionLotRecord | null>(null);
  const [qaDecision, setQaDecision] = useState<boolean>(true);
  const [qaTdsRaw, setQaTdsRaw] = useState<string>('');
  const [qaTdsRo, setQaTdsRo] = useState<string>('');
  const [qaPh, setQaPh] = useState<string>('');
  const [qaNotes, setQaNotes] = useState<string>('');

  const [bannerError, setBannerError] = useState<string | null>(null);
  const [bannerSuccess, setBannerSuccess] = useState<string | null>(null);

  const lotsQuery = useQuery({
    queryKey: ['production-lots', dateFrom, dateTo, shiftFilter],
    queryFn: async () => {
      const qs = new URLSearchParams({ limit: '100' });
      if (dateFrom) qs.set('dateFrom', dateFrom);
      if (dateTo) qs.set('dateTo', dateTo);
      if (shiftFilter) qs.set('shift', shiftFilter);
      const res = await api.get<{ lots: ProductionLotRecord[] }>(
        `/production/lots?${qs.toString()}`,
      );
      return res.lots ?? [];
    },
  });

  const dashboardQuery = useQuery({
    queryKey: ['production-dashboard', dateFrom, dateTo],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (dateFrom) qs.set('dateFrom', dateFrom);
      if (dateTo) qs.set('dateTo', dateTo);
      return api.get<ProductionDashboardResponse>(
        `/production/dashboard?${qs.toString()}`,
      );
    },
  });

  const createLotMutation = useMutation({
    mutationFn: async () => {
      const plan: Record<string, number> = {};
      const actual: Record<string, number> = {};
      for (const { sku } of FG_SKU_INFO) {
        plan[sku] = Math.max(0, Math.trunc(Number(planMap[sku] || 0)));
        actual[sku] = Math.max(0, Math.trunc(Number(actualMap[sku] || 0)));
      }
      return api.post<ProductionLotRecord>('/production/lots', {
        productionDate: prodDate,
        shift,
        plan,
        actual,
        tdsRaw: tdsRaw ? Number(tdsRaw) : null,
        tdsRo: tdsRo ? Number(tdsRo) : null,
        ph: ph ? Number(ph) : null,
        notes: notes.trim() || null,
      });
    },
    onSuccess: (created) => {
      setBannerError(null);
      setBannerSuccess(
        `บันทึกล็อตผลิต ${created.lotNo} เรียบร้อยแล้ว (สถานะ: รอตรวจรับ QA)`,
      );
      setNotes('');
      queryClient.invalidateQueries({ queryKey: ['production-lots'] });
      queryClient.invalidateQueries({ queryKey: ['production-dashboard'] });
    },
    onError: (err) => {
      setBannerSuccess(null);
      setBannerError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : 'ไม่สามารถบันทึกล็อตผลิตได้',
      );
    },
  });

  const qaMutation = useMutation({
    mutationFn: async () => {
      if (!inspectingLot) throw new Error('ไม่ได้เลือกล็อตผลิต');
      return api.post<
        ProductionLotRecord & {
          fgMovements?: Array<{ sku: string; qtyAdded: number; newStock: number }>;
          packagingConsumed?: Array<{ sku: string; neededQty: number }>;
        }
      >(`/production/lots/${inspectingLot.id}/qa`, {
        passed: qaDecision,
        tdsRaw: qaTdsRaw !== '' ? Number(qaTdsRaw) : undefined,
        tdsRo: qaTdsRo !== '' ? Number(qaTdsRo) : undefined,
        ph: qaPh !== '' ? Number(qaPh) : undefined,
        notes: qaNotes.trim() || undefined,
      });
    },
    onSuccess: (res) => {
      setInspectingLot(null);
      setBannerError(null);
      if (res.qaPassed) {
        const fgText = (res.fgMovements || [])
          .map((m) => `${m.sku} +${m.qtyAdded}`)
          .join(', ');
        setBannerSuccess(
          `ตรวจรับ QA ล็อต ${res.lotNo} [ผ่านเกณฑ์] สำเร็จ — รับ FG เข้าคลัง (${fgText || '0'}) และตัดบรรจุภัณฑ์ FIFO เรียบร้อย`,
        );
      } else {
        setBannerSuccess(
          `บันทึกผล QA ล็อต ${res.lotNo} [ไม่ผ่านเกณฑ์] — ระบบระงับการโอนเข้าสต็อก FG ตามกฎ PRD-2`,
        );
      }
      queryClient.invalidateQueries({ queryKey: ['production-lots'] });
      queryClient.invalidateQueries({ queryKey: ['production-dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      queryClient.invalidateQueries({ queryKey: ['packaging-lots'] });
    },
    onError: (err) => {
      setBannerSuccess(null);
      setBannerError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : 'ไม่สามารถบันทึกผลตรวจ QA ได้',
      );
    },
  });

  const lots = lotsQuery.data ?? [];
  const pendingLots = lots.filter((l) => l.qaStatus === 'pending');

  function openQaModal(lot: ProductionLotRecord, defaultPass: boolean) {
    setInspectingLot(lot);
    setQaDecision(defaultPass);
    setQaTdsRaw(lot.tdsRaw !== null ? String(lot.tdsRaw) : '');
    setQaTdsRo(lot.tdsRo !== null ? String(lot.tdsRo) : '');
    setQaPh(lot.ph !== null ? String(lot.ph) : '');
    setQaNotes(lot.notes ?? '');
  }

  function handleCreateLotSubmit(e: FormEvent) {
    e.preventDefault();
    createLotMutation.mutate();
  }

  function handleQaSubmit(e: FormEvent) {
    e.preventDefault();
    qaMutation.mutate();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800">
              {moduleMeta.code}
            </span>
            <h1 className="text-2xl font-bold text-slate-800">{moduleMeta.label}</h1>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            บันทึกล็อตผลิตรายกะ (LOT-YYMMDD-D/N-ลำดับ) ตรวจรับคุณภาพน้ำ (TDS/pH) โอนเข้า FG และตัดบรรจุภัณฑ์ FIFO อัตโนมัติ
          </p>
        </div>

        <div className="flex flex-wrap rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setActiveTab('lots')}
            className={`rounded-md px-3.5 py-2 text-sm font-medium transition ${
              activeTab === 'lots'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            บันทึกล็อตผลิต & รายการ ({lots.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('qa')}
            className={`rounded-md px-3.5 py-2 text-sm font-medium transition ${
              activeTab === 'qa'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            รอตรวจรับ QA ({pendingLots.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('dashboard')}
            className={`rounded-md px-3.5 py-2 text-sm font-medium transition ${
              activeTab === 'dashboard'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            แดชบอร์ดแผน vs ผลิตจริง
          </button>
        </div>
      </header>

      {bannerError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-800">
          ⚠️ {bannerError}
        </div>
      )}

      {bannerSuccess && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
          ✅ {bannerSuccess}
        </div>
      )}

      {activeTab === 'lots' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left 5 Cols: Create Lot Form */}
          {canEdit && (
            <form
              onSubmit={handleCreateLotSubmit}
              className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-5"
            >
              <h2 className="text-base font-bold text-slate-900">
                📝 บันทึกล็อตการผลิตใหม่ (ออกเลข LOT อัตโนมัติ)
              </h2>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    วันที่ผลิต
                  </label>
                  <input
                    type="date"
                    required
                    value={prodDate}
                    onChange={(e) => setProdDate(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    กะการผลิต (Shift)
                  </label>
                  <select
                    value={shift}
                    onChange={(e) => setShift(e.target.value as 'day' | 'night')}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                  >
                    <option value="day">กะกลางวัน (D — Day Shift)</option>
                    <option value="night">กะกลางคืน (N — Night Shift)</option>
                  </select>
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2.5">
                <div className="grid grid-cols-12 text-xs font-semibold text-slate-600">
                  <span className="col-span-6">สินค้าสำเร็จรูป (4 SKU)</span>
                  <span className="col-span-3 text-right">แผนผลิต</span>
                  <span className="col-span-3 text-right">ผลิตได้จริง</span>
                </div>
                {FG_SKU_INFO.map(({ sku, label }) => (
                  <div key={sku} className="grid grid-cols-12 items-center gap-2 text-xs">
                    <span className="col-span-6 font-medium text-slate-800">{label}</span>
                    <input
                      type="number"
                      min={0}
                      value={planMap[sku]}
                      onChange={(e) =>
                        setPlanMap((prev) => ({ ...prev, [sku]: e.target.value }))
                      }
                      className="col-span-3 rounded border border-slate-300 bg-white px-2 py-1 text-right font-mono"
                    />
                    <input
                      type="number"
                      min={0}
                      value={actualMap[sku]}
                      onChange={(e) =>
                        setActualMap((prev) => ({ ...prev, [sku]: e.target.value }))
                      }
                      className="col-span-3 rounded border border-sky-300 bg-white px-2 py-1 text-right font-mono font-bold text-sky-900"
                    />
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    TDS น้ำดิบ (ppm)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min={0}
                    value={tdsRaw}
                    onChange={(e) => setTdsRaw(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    TDS น้ำ RO (ppm)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min={0}
                    value={tdsRo}
                    onChange={(e) => setTdsRo(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    ค่า pH (6.5–8.5)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min={0}
                    max={14}
                    value={ph}
                    onChange={(e) => setPh(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  หมายเหตุการผลิต
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="เช่น เดินเครื่อง RO ปกติ..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                />
              </div>

              <button
                type="submit"
                disabled={createLotMutation.isPending}
                className="w-full rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-sky-700 disabled:opacity-50"
              >
                {createLotMutation.isPending
                  ? 'กำลังบันทึกล็อตผลิต...'
                  : '💾 บันทึกล็อตผลิต (ออกเลข LOT อัตโนมัติ)'}
              </button>
            </form>
          )}

          {/* Right 7 Cols: Production Lots Table */}
          <div
            className={`space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm ${
              canEdit ? 'lg:col-span-7' : 'lg:col-span-12'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-bold text-slate-900">
                📋 รายการล็อตผลิตทั้งหมด ({lots.length})
              </h2>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="rounded-lg border border-slate-300 px-2.5 py-1.5"
                />
                <span>ถึง</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="rounded-lg border border-slate-300 px-2.5 py-1.5"
                />
                <select
                  value={shiftFilter}
                  onChange={(e) => setShiftFilter(e.target.value)}
                  className="rounded-lg border border-slate-300 px-2.5 py-1.5"
                >
                  <option value="">ทุกกะ</option>
                  <option value="day">กะกลางวัน (D)</option>
                  <option value="night">กะกลางคืน (N)</option>
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                    <th className="px-3 py-2.5">เลขล็อต (Lot No)</th>
                    <th className="px-3 py-2.5">วันที่ / กะ</th>
                    <th className="px-3 py-2.5 text-right">ผลิตจริง (18.9L / แพ็ค)</th>
                    <th className="px-3 py-2.5 text-center">ค่าคุณภาพน้ำ</th>
                    <th className="px-3 py-2.5 text-center">สถานะ QA</th>
                    {canEdit && <th className="px-3 py-2.5 text-right">ตรวจรับ QA</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {lots.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500">
                        ยังไม่มีรายการล็อตผลิต
                      </td>
                    </tr>
                  ) : (
                    lots.map((lot) => {
                      const packs =
                        (lot.actual['FG-350ML'] || 0) +
                        (lot.actual['FG-600ML'] || 0) +
                        (lot.actual['FG-1500ML'] || 0);
                      return (
                        <tr key={lot.id} className="hover:bg-slate-50">
                          <td className="px-3 py-2.5 font-mono font-bold text-sky-700">
                            {lot.lotNo}
                          </td>
                          <td className="px-3 py-2.5 text-slate-700">
                            <div>{lot.productionDate}</div>
                            <div className="text-slate-500">
                              {lot.shift === 'night' ? '🌙 กะกลางคืน (N)' : '☀️ กะกลางวัน (D)'}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <div className="font-bold text-slate-900">
                              18.9L: {lot.actual['FG-189L'] || 0} ถัง
                            </div>
                            <div className="text-slate-500">น้ำแพ็ครวม: {packs} แพ็ค</div>
                          </td>
                          <td className="px-3 py-2.5 text-center text-slate-700">
                            <div>
                              TDS RO: <b>{lot.tdsRo ?? '-'}</b> ppm
                            </div>
                            <div className="text-slate-500">
                              pH: <b>{lot.ph ?? '-'}</b>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            {lot.qaStatus === 'passed' ? (
                              <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-0.5 font-semibold text-emerald-800">
                                ✅ ผ่านเกณฑ์ (เข้า FG แล้ว)
                              </span>
                            ) : lot.qaStatus === 'failed' ? (
                              <span className="inline-flex rounded-full bg-rose-100 px-2.5 py-0.5 font-semibold text-rose-800">
                                ❌ ไม่ผ่านเกณฑ์ (ระงับ FG)
                              </span>
                            ) : (
                              <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 font-semibold text-amber-800">
                                ⏳ รอตรวจ QA
                              </span>
                            )}
                          </td>
                          {canEdit && (
                            <td className="px-3 py-2.5 text-right">
                              {lot.qaStatus === 'pending' ? (
                                <div className="inline-flex gap-1">
                                  <button
                                    type="button"
                                    onClick={() => openQaModal(lot, true)}
                                    className="rounded bg-emerald-600 px-2 py-1 font-semibold text-white hover:bg-emerald-700"
                                  >
                                    ผ่าน QA
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openQaModal(lot, false)}
                                    className="rounded bg-rose-600 px-2 py-1 font-semibold text-white hover:bg-rose-700"
                                  >
                                    ไม่ผ่าน
                                  </button>
                                </div>
                              ) : (
                                <span className="text-slate-400">ตรวจแล้ว</span>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'qa' && (
        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-bold text-slate-900">
            🔬 รายการล็อตผลิตรอตรวจรับคุณภาพน้ำ (Pending QA — {pendingLots.length} ล็อต)
          </h2>

          {pendingLots.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 py-10 text-center text-sm text-slate-500">
              ไม่มีล็อตผลิตที่ค้างรอตรวจ QA ในขณะนี้
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {pendingLots.map((lot) => {
                const totalPacks =
                  (lot.actual['FG-350ML'] || 0) +
                  (lot.actual['FG-600ML'] || 0) +
                  (lot.actual['FG-1500ML'] || 0);
                const totalUnits = (lot.actual['FG-189L'] || 0) + totalPacks;
                return (
                  <div
                    key={lot.id}
                    className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-sm font-bold text-sky-800">
                        {lot.lotNo}
                      </span>
                      <span className="text-xs text-slate-600">
                        {lot.productionDate} ({lot.shift === 'night' ? 'กะกลางคืน' : 'กะกลางวัน'})
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 rounded-lg bg-white p-3 text-xs border border-slate-200">
                      <div>
                        <span className="text-slate-500">ผลกระทบ FG เมื่อผ่าน:</span>
                        <div className="mt-1 font-semibold text-emerald-700">
                          +18.9L: {lot.actual['FG-189L']} ถัง | +แพ็ค: {totalPacks} แพ็ค
                        </div>
                      </div>
                      <div>
                        <span className="text-slate-500">ตัดบรรจุภัณฑ์ FIFO:</span>
                        <div className="mt-1 font-semibold text-rose-700">
                          ถัง 18.9L: -{lot.actual['FG-189L']} | ฝา/ฉลาก: -{totalUnits}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-700">
                      <span>
                        TDS ดิบ: <b>{lot.tdsRaw ?? '-'}</b> | TDS RO: <b>{lot.tdsRo ?? '-'}</b> | pH:{' '}
                        <b>{lot.ph ?? '-'}</b>
                      </span>
                      {canEdit && (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => openQaModal(lot, true)}
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 font-bold text-white hover:bg-emerald-700"
                          >
                            ✅ อนุมัติผ่าน QA
                          </button>
                          <button
                            type="button"
                            onClick={() => openQaModal(lot, false)}
                            className="rounded-lg bg-rose-600 px-3 py-1.5 font-bold text-white hover:bg-rose-700"
                          >
                            ❌ ไม่ผ่าน
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {activeTab === 'dashboard' && (
        <section className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-xs text-slate-500">ล็อตผลิตทั้งหมด</div>
              <div className="mt-1 text-2xl font-bold text-slate-900">
                {dashboardQuery.data?.summary.totalLots ?? 0} ล็อต
              </div>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 shadow-sm">
              <div className="text-xs text-emerald-800">ผ่านเกณฑ์ QA (โอนเข้า FG)</div>
              <div className="mt-1 text-2xl font-bold text-emerald-900">
                {dashboardQuery.data?.summary.qaPassedCount ?? 0} ล็อต
              </div>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-4 shadow-sm">
              <div className="text-xs text-rose-800">ไม่ผ่านเกณฑ์ QA</div>
              <div className="mt-1 text-2xl font-bold text-rose-900">
                {dashboardQuery.data?.summary.qaFailedCount ?? 0} ล็อต
              </div>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 shadow-sm">
              <div className="text-xs text-amber-800">รอตรวจรับ QA</div>
              <div className="mt-1 text-2xl font-bold text-amber-900">
                {dashboardQuery.data?.summary.qaPendingCount ?? 0} ล็อต
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            {(dashboardQuery.data?.byShift ?? []).map((sh) => (
              <div
                key={sh.shift}
                className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-3"
              >
                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <h3 className="text-sm font-bold text-slate-900">{sh.label}</h3>
                  <span className="text-xs text-slate-500">รวม {sh.lotsCount} ล็อต</span>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-slate-500 border-b border-slate-100">
                      <th className="py-1.5 text-left">รายการ SKU</th>
                      <th className="py-1.5 text-right">แผนผลิต</th>
                      <th className="py-1.5 text-right">ผลิตจริง</th>
                      <th className="py-1.5 text-right">% เทียบแผน</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {FG_SKU_INFO.map(({ sku, label }) => {
                      const p = sh.plan[sku] || 0;
                      const a = sh.actual[sku] || 0;
                      const pct = p > 0 ? Math.round((a / p) * 100) : 0;
                      return (
                        <tr key={sku}>
                          <td className="py-2 font-medium text-slate-800">{label}</td>
                          <td className="py-2 text-right text-slate-600">{p.toLocaleString()}</td>
                          <td className="py-2 text-right font-bold text-sky-700">
                            {a.toLocaleString()}
                          </td>
                          <td className="py-2 text-right font-semibold text-slate-700">{pct}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Modal ยืนยันผลตรวจ QA พร้อมแสดงผลกระทบต่อสต็อก */}
      {inspectingLot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <h3 className="text-lg font-bold text-slate-900">
              ยืนยันผลตรวจรับคุณภาพน้ำ (QA) — {inspectingLot.lotNo}
            </h3>

            <form onSubmit={handleQaSubmit} className="space-y-4">
              <div className="flex gap-3">
                <label className="flex-1 cursor-pointer rounded-xl border p-3 text-center text-sm font-bold transition border-emerald-300 bg-emerald-50/60">
                  <input
                    type="radio"
                    name="qaDecision"
                    checked={qaDecision === true}
                    onChange={() => setQaDecision(true)}
                    className="mr-2"
                  />
                  ✅ ผ่านเกณฑ์ (โอนเข้า FG + ตัด FIFO)
                </label>
                <label className="flex-1 cursor-pointer rounded-xl border p-3 text-center text-sm font-bold transition border-rose-300 bg-rose-50/60">
                  <input
                    type="radio"
                    name="qaDecision"
                    checked={qaDecision === false}
                    onChange={() => setQaDecision(false)}
                    className="mr-2"
                  />
                  ❌ ไม่ผ่านเกณฑ์ (ระงับสต็อก)
                </label>
              </div>

              {qaDecision ? (
                <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-xs space-y-1 text-sky-900">
                  <div className="font-bold">📦 ผลกระทบต่อสต็อกที่จะเกิดขึ้นทันที (Transaction เดียว):</div>
                  <div>
                    • เพิ่มสต็อก FG: 18.9L <b>+{inspectingLot.actual['FG-189L']}</b>, 350ml{' '}
                    <b>+{inspectingLot.actual['FG-350ML']}</b>, 600ml{' '}
                    <b>+{inspectingLot.actual['FG-600ML']}</b>, 1500ml{' '}
                    <b>+{inspectingLot.actual['FG-1500ML']}</b>
                  </div>
                  <div>
                    • ตัดบรรจุภัณฑ์แบบ FIFO (เก่า→ใหม่) จากตาราง <code>packaging_lots</code> พร้อมบันทึก{' '}
                    <code>packaging_consume</code>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                  ⛔ เมื่อบันทึกว่า <b>ไม่ผ่านเกณฑ์</b> ระบบจะตั้งค่า <code>qa_passed = 0</code> และไม่เพิ่มสต็อก FG หรือตัดบรรจุภัณฑ์ใดๆ (PRD-2)
                </div>
              )}

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    TDS น้ำดิบ
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={qaTdsRaw}
                    onChange={(e) => setQaTdsRaw(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    TDS น้ำ RO
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={qaTdsRo}
                    onChange={(e) => setQaTdsRo(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    ค่า pH
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    value={qaPh}
                    onChange={(e) => setQaPh(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  หมายเหตุผลตรวจ QA
                </label>
                <input
                  type="text"
                  value={qaNotes}
                  onChange={(e) => setQaNotes(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setInspectingLot(null)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={qaMutation.isPending}
                  className={`rounded-lg px-4 py-2 text-xs font-bold text-white disabled:opacity-50 ${
                    qaDecision
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  {qaMutation.isPending ? 'กำลังบันทึก...' : 'ยืนยันบันทึกผล QA'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
