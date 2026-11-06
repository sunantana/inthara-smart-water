import { type FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../../api/client';
import { useAuthSession } from '../../lib/auth';
import { findModule } from '../../lib/modules';
import { getTodayDateString } from '../../lib/date';
import Toast from '../../components/ui/Toast';
import CollapsibleSection from '../../components/ui/CollapsibleSection';

const moduleMeta = findModule('EXP');

type ExpenseCategory = 'fuel' | 'repair' | 'utility' | 'packaging' | 'salary' | 'other';

const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  fuel: '⛽ น้ำมันเชื้อเพลิง (Fuel)',
  repair: '🔧 ซ่อมบำรุง (Repair)',
  utility: '⚡ สาธารณูปโภค/ไฟฟ้า-ประปา (Utility)',
  packaging: '📦 บรรจุภัณฑ์ (Packaging)',
  salary: '👷 เงินเดือน/ค่าแรง (Salary)',
  other: '📋 อื่นๆ (Other)',
};

interface ExpenseRecord {
  id: number;
  date: string;
  category: ExpenseCategory;
  refType: string | null;
  refId: string | null;
  description: string | null;
  amountSat: number;
  createdByName: string | null;
  createdAt: string;
}

interface TripRowBrief {
  id: number;
  code: string;
  tripDate: string;
  vehiclePlate: string | null;
  driverName: string | null;
  totalRevenueSat: number;
  estimatedFuelCostSat: number;
}

interface TripCostingResponse {
  tripId: number;
  tripCode: string;
  tripDate: string;
  status: string;
  stopsCount: number;
  totalDistanceKm: number;
  revenueSat: number;
  fuelCostSat: number;
  extraExpensesSat: number;
  totalCostSat: number;
  profitSat: number;
  marginPercent: number;
  linkedExpenses: ExpenseRecord[];
}

function formatBaht(satang: number): string {
  return (Number(satang || 0) / 100).toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function ExpensesPage() {
  const queryClient = useQueryClient();
  const { user } = useAuthSession();
  const canCreate =
    user?.role === 'admin' || user?.role === 'manager' || user?.role === 'staff';

  const todayIso = getTodayDateString();
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [selectedTripId, setSelectedTripId] = useState<number | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(
    null,
  );
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null,
  );

  // Create expense form state
  const [date, setDate] = useState<string>(todayIso);
  const [category, setCategory] = useState<ExpenseCategory>('fuel');
  const [amountBaht, setAmountBaht] = useState<string>('500');
  const [description, setDescription] = useState<string>('');
  const [refType, setRefType] = useState<string>('trip');
  const [refId, setRefId] = useState<string>('');

  const expensesQuery = useQuery({
    queryKey: ['expenses-list', categoryFilter],
    queryFn: () => {
      const qs = categoryFilter ? `?category=${encodeURIComponent(categoryFilter)}` : '';
      return api.get<{ items: ExpenseRecord[]; totalAmountSat: number }>(`/expenses${qs}`);
    },
  });

  const tripsQuery = useQuery({
    queryKey: ['tms-trips-for-costing'],
    queryFn: () => api.get<{ data: TripRowBrief[] }>('/tms/trips'),
  });

  const expenses = expensesQuery.data?.items ?? [];
  const totalAmountSat = expensesQuery.data?.totalAmountSat ?? 0;
  const trips = tripsQuery.data?.data ?? [];
  const activeTripId = selectedTripId ?? trips[0]?.id ?? null;

  const tripCostingQuery = useQuery({
    queryKey: ['trip-costing', activeTripId],
    enabled: Boolean(activeTripId),
    queryFn: () => api.get<TripCostingResponse>(`/expenses/costing/trips/${activeTripId}`),
  });

  const createExpenseMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.post<ExpenseRecord>('/expenses', payload),
    onSuccess: (created) => {
      const msg = `บันทึกรายจ่ายหมวด ${CATEGORY_LABELS[created.category]} จำนวน ฿${formatBaht(created.amountSat)} สำเร็จ`;
      setFeedback({ type: 'success', text: msg });
      setToast({ message: msg, type: 'success' });
      setDescription('');
      void queryClient.invalidateQueries({ queryKey: ['expenses-list'] });
      void queryClient.invalidateQueries({ queryKey: ['trip-costing'] });
    },
    onError: (err) => {
      const msg = err instanceof ApiError ? err.message : 'บันทึกรายจ่ายไม่สำเร็จ';
      setFeedback({ type: 'error', text: msg });
      setToast({ message: msg, type: 'error' });
    },
  });

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    createExpenseMutation.mutate({
      date,
      category,
      amountSat: Math.round((Number(amountBaht) || 0) * 100),
      description: description.trim() || null,
      refType: refId.trim() ? refType : null,
      refId: refId.trim() || null,
    });
  };

  const costing = tripCostingQuery.data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl">💸</span>
            <div>
              <h1 className="text-xl font-bold text-slate-900">
                {moduleMeta.label}
              </h1>
              <p className="text-sm text-slate-500">
                บันทึกค่าใช้จ่าย 6 หมวดหมู่ และวิเคราะห์กำไรรายทริป (รายได้ − ค่าน้ำมันประเมิน − ค่าใช้จ่ายผูกทริป)
              </p>
            </div>
          </div>
          <div className="rounded-full bg-rose-50 px-3.5 py-1.5 text-xs font-bold text-rose-800">
            รวมรายจ่ายตามตัวกรอง: ฿{formatBaht(totalAmountSat)}
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
        {/* Expenses Table + Trip Costing (2 cols) */}
        <div className="space-y-6 lg:col-span-2">
          {/* Trip Costing Card (EXP-2) */}
          <div className="rounded-xl border border-sky-200 bg-sky-50/40 p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  🚚 วิเคราะห์ต้นทุนและกำไรรายทริปจัดส่ง (EXP-2)
                </h2>
                <p className="text-xs text-slate-500">
                  profitSat = revenueSat − fuelCostSat − extraExpensesSat
                </p>
              </div>
              <select
                value={activeTripId ?? ''}
                onChange={(e) => setSelectedTripId(Number(e.target.value) || null)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium"
              >
                {trips.length === 0 ? (
                  <option value="">-- ยังไม่มีทริปในระบบ --</option>
                ) : (
                  trips.map((t) => (
                    <option key={t.id} value={t.id}>
                      #{t.id} [{t.code}] วันที่ {t.tripDate}
                    </option>
                  ))
                )}
              </select>
            </div>

            {costing ? (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="text-[11px] text-slate-500">รายได้รวมของทริป</div>
                  <div className="mt-1 text-sm font-bold text-sky-700">
                    ฿{formatBaht(costing.revenueSat)}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {costing.stopsCount} จุดจอด ({costing.totalDistanceKm} กม.)
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="text-[11px] text-slate-500">ค่าน้ำมันประเมิน</div>
                  <div className="mt-1 text-sm font-bold text-amber-700">
                    ฿{formatBaht(costing.fuelCostSat)}
                  </div>
                  <div className="text-[11px] text-slate-400">จากระยะทางทริป</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <div className="text-[11px] text-slate-500">
                    รายจ่ายผูกทริป ({costing.linkedExpenses.length} รายการ)
                  </div>
                  <div className="mt-1 text-sm font-bold text-rose-700">
                    ฿{formatBaht(costing.extraExpensesSat)}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    รวมต้นทุน: ฿{formatBaht(costing.totalCostSat)}
                  </div>
                </div>
                <div
                  className={`rounded-lg border p-3 ${
                    costing.profitSat >= 0
                      ? 'border-emerald-200 bg-emerald-50'
                      : 'border-rose-200 bg-rose-50'
                  }`}
                >
                  <div className="text-[11px] font-medium text-slate-700">กำไรสุทธิประจำทริป</div>
                  <div
                    className={`mt-1 text-base font-extrabold ${
                      costing.profitSat >= 0 ? 'text-emerald-700' : 'text-rose-700'
                    }`}
                  >
                    ฿{formatBaht(costing.profitSat)}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    อัตรากำไร: {costing.marginPercent}%
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-xs text-slate-500">
                เลือกทริปจัดส่งเพื่อคำนวณต้นทุนและกำไรสุทธิ
              </p>
            )}
          </div>

          {/* Expenses List */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-bold text-slate-900">
                รายการค่าใช้จ่าย ({expenses.length} รายการ)
              </h2>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
              >
                <option value="">ทุกหมวดหมู่</option>
                {Object.entries(CATEGORY_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                    <th className="py-2 pr-3">วันที่</th>
                    <th className="px-3 py-2">หมวดหมู่</th>
                    <th className="px-3 py-2">รายละเอียด</th>
                    <th className="px-3 py-2">ผูกอ้างอิง</th>
                    <th className="py-2 pl-3 text-right">จำนวนเงิน (บาท)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {expenses.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-xs text-slate-400">
                        ยังไม่มีรายการค่าใช้จ่าย
                      </td>
                    </tr>
                  ) : (
                    expenses.map((exp) => (
                      <tr key={exp.id} className="hover:bg-slate-50">
                        <td className="py-2.5 pr-3 text-xs font-medium text-slate-700">
                          {exp.date}
                        </td>
                        <td className="px-3 py-2.5 text-xs font-semibold text-slate-800">
                          {CATEGORY_LABELS[exp.category] ?? exp.category}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-slate-600">
                          {exp.description || '-'}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-slate-500">
                          {exp.refType && exp.refId ? `${exp.refType}: #${exp.refId}` : '-'}
                        </td>
                        <td className="py-2.5 pl-3 text-right text-xs font-bold text-rose-700">
                          ฿{formatBaht(exp.amountSat)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Create Expense Form */}
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-base font-bold text-slate-900">
            บันทึกค่าใช้จ่ายใหม่ (EXP-1)
          </h2>
          <form onSubmit={handleCreate} className="space-y-4 text-sm">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                วันที่จ่าย *
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                disabled={!canCreate}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                required
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                เลือกหมวดหมู่ค่าใช้จ่าย *
              </label>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(CATEGORY_LABELS).map(([k, label]) => {
                  const isSelected = category === k;
                  return (
                    <button
                      key={k}
                      type="button"
                      disabled={!canCreate}
                      onClick={() => setCategory(k as ExpenseCategory)}
                      className={`min-h-[44px] rounded-lg border px-3 py-2 text-xs font-medium text-left transition-all ${
                        isSelected
                          ? 'border-sky-600 bg-sky-50 text-sky-800 ring-2 ring-sky-500/30 font-bold'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">
                จำนวนเงิน (บาท) *
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-base font-bold text-slate-400">฿</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  value={amountBaht}
                  onChange={(e) => setAmountBaht(e.target.value)}
                  disabled={!canCreate}
                  className="w-full rounded-lg border border-slate-300 pl-8 pr-3 py-2 text-xl font-bold font-mono text-slate-900"
                  required
                />
              </div>
            </div>

            <CollapsibleSection
              title="ข้อมูลเพิ่มเติม (ผูกเที่ยววิ่ง / หมายเหตุ)"
              badge={refId ? `${refType}: #${refId}` : undefined}
              defaultOpen={Boolean(refId || description)}
            >
              <div className="space-y-3 pt-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    คำอธิบายรายการ
                  </label>
                  <textarea
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={!canCreate}
                    placeholder="เช่น เติมน้ำมันเพิ่ม / ค่าปะยางระหว่างทริป"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                  <div className="mb-1.5 text-xs font-semibold text-slate-700">
                    ผูกอ้างอิงกับทริปหรือเครื่องจักร (ถ้ามี)
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={refType}
                      onChange={(e) => setRefType(e.target.value)}
                      disabled={!canCreate}
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                    >
                      <option value="trip">ทริปขนส่ง (trip)</option>
                      <option value="machine">เครื่องจักร (machine)</option>
                    </select>
                    <input
                      type="text"
                      value={refId}
                      onChange={(e) => setRefId(e.target.value)}
                      disabled={!canCreate}
                      placeholder="รหัส ID เช่น 1"
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs"
                    />
                  </div>
                </div>
              </div>
            </CollapsibleSection>

            {canCreate && (
              <div className="sticky bottom-0 pt-2 bg-white/95 backdrop-blur-xs">
                <button
                  type="submit"
                  disabled={createExpenseMutation.isPending}
                  className="w-full min-h-[44px] rounded-lg bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 disabled:opacity-50"
                >
                  {createExpenseMutation.isPending ? 'กำลังบันทึก...' : 'บันทึกรายจ่าย'}
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
