import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../../api/client';
import { findModule } from '../../lib/modules';
import { bahtToSatang, formatBaht, satangToBaht } from '../../lib/money';

const moduleMeta = findModule('FIN');

export interface UnpaidOrderRecord {
  id: number;
  orderId: number;
  code: string;
  customerId: number;
  customerCode: string | null;
  customerName: string | null;
  customerPhone: string | null;
  zone: string | null;
  deliveryDate: string;
  completedAt: string | null;
  totalSat: number;
  paidSat: number;
  unpaidSat: number;
  ageDays: number;
  agingBucket: 'current' | 'unpaid30' | 'unpaid60' | 'unpaid90';
  customerDepositSat: number;
  customerOutstandingBottles: number;
}

export interface CustomerDebtSummary {
  customerId: number;
  customerCode: string | null;
  customerName: string | null;
  customerPhone: string | null;
  zone: string | null;
  depositBalanceSat: number;
  outstandingBottles: number;
  totalOrderSat: number;
  paidOrderSat: number;
  grossUnpaidSat: number;
  netDebtSat: number;
  unpaidOrderCount: number;
  maxAgeDays: number;
  agingBucket: 'current' | 'unpaid30' | 'unpaid60' | 'unpaid90';
}

interface UnpaidBillingResponse {
  items: UnpaidOrderRecord[];
  customers: CustomerDebtSummary[];
  summary: {
    totalUnpaidOrders: number;
    totalCustomersWithDebt: number;
    totalGrossUnpaidSat: number;
    totalDepositAvailableSat: number;
    totalNetDebtSat: number;
    count30Plus: number;
    count60Plus: number;
    count90Plus: number;
  };
}

interface SettleOrderResult {
  id: number;
  code: string | null;
  totalSat: number;
  previousPaidSat: number;
  allocatedSat: number;
  paidSat: number;
  remainingUnpaidSat: number;
  closed: boolean;
}

interface SettleResponse {
  receipt: {
    id: number;
    code: string;
    amountSat: number;
    method: string;
    createdAt: string;
  };
  settledOrders: SettleOrderResult[];
  excessToDepositSat: number;
  customerBalance: {
    customerId: number;
    customerCode: string;
    customerName: string;
    previousDepositSat: number;
    usedDepositSat: number;
    excessToDepositSat: number;
    balanceSat: number;
    remainingGrossUnpaidSat: number;
    remainingNetDebtSat: number;
  };
}

interface ReceiptSlipData {
  slipNo: string;
  printedAt: string;
  company: { name: string; subtitle: string };
  receipt: {
    id: number;
    code: string;
    amountSat: number;
    method: string;
    createdAt: string;
  };
  customer: {
    id: number;
    code: string;
    name: string;
    phone: string | null;
    address: string | null;
    zone: string | null;
    balanceSat: number;
    outstandingBottles: number;
  };
  ledgerEntries: Array<{
    id: number;
    entryType: string;
    amountSat: number;
    note: string;
  }>;
  summary: {
    receiptAmountSat: number;
    usedDepositSat: number;
    excessDepositInSat: number;
    method: string;
    remainingGrossUnpaidSat: number;
    depositBalanceAfterSat: number;
    remainingNetDebtSat: number;
  };
}

interface HistorySlipData {
  slipNo: string;
  printedAt: string;
  company: { name: string; subtitle: string };
  customer: {
    id: number;
    code: string;
    name: string;
    phone: string | null;
    address: string | null;
    zone: string | null;
    balanceSat: number;
    outstandingBottles: number;
  };
  unpaidOrders: UnpaidOrderRecord[];
  recentReceipts: Array<{
    id: number;
    code: string;
    amountSat: number;
    method: string;
    createdAt: string;
  }>;
  summary: {
    unpaidOrderCount: number;
    totalOrderSat: number;
    paidOrderSat: number;
    grossUnpaidSat: number;
    depositBalanceSat: number;
    netDebtSat: number;
    outstandingBottles: number;
  };
}

function getAgingBadge(ageDays: number) {
  if (ageDays >= 90) {
    return {
      label: `เกิน 90 วัน (${ageDays} วัน)`,
      cls: 'bg-rose-100 text-rose-800 border border-rose-300',
    };
  }
  if (ageDays >= 60) {
    return {
      label: `เกิน 60 วัน (${ageDays} วัน)`,
      cls: 'bg-orange-100 text-orange-800 border border-orange-300',
    };
  }
  if (ageDays >= 30) {
    return {
      label: `เกิน 30 วัน (${ageDays} วัน)`,
      cls: 'bg-amber-100 text-amber-800 border border-amber-300',
    };
  }
  return {
    label: `ปกติ (${ageDays} วัน)`,
    cls: 'bg-emerald-100 text-emerald-800 border border-emerald-200',
  };
}

const METHOD_LABELS: Record<string, string> = {
  cash: 'เงินสด (Cash)',
  transfer: 'โอนเงินธนาคาร (Transfer)',
  deposit: 'หักเงินมัดจำ (Deposit)',
  other: 'อื่นๆ (Other)',
};

export default function BillingPage() {
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'unpaid' | 'settle'>('unpaid');

  // Unpaid filters
  const [zoneFilter, setZoneFilter] = useState<string>('');
  const [agingFilter, setAgingFilter] = useState<string>('');
  const [searchFilter, setSearchFilter] = useState<string>('');

  // Settle state
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [amountBahtInput, setAmountBahtInput] = useState<string>('0');
  const [useDepositBahtInput, setUseDepositBahtInput] = useState<string>('0');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer' | 'other'>('cash');
  const [settleNote, setSettleNote] = useState<string>('');
  const [settleError, setSettleError] = useState<string>('');
  const [lastSettleResult, setLastSettleResult] = useState<SettleResponse | null>(null);

  // Deposit modal state
  const [depositModalOpen, setDepositModalOpen] = useState<boolean>(false);
  const [depositType, setDepositType] = useState<'in' | 'use' | 'refund'>('in');
  const [depositAmountBaht, setDepositAmountBaht] = useState<string>('0');
  const [depositNote, setDepositNote] = useState<string>('');
  const [depositError, setDepositError] = useState<string>('');

  // Print slip modals
  const [activeReceiptSlipId, setActiveReceiptSlipId] = useState<number | null>(null);
  const [activeHistorySlipCustomerId, setActiveHistorySlipCustomerId] = useState<
    number | null
  >(null);

  const unpaidQuery = useQuery({
    queryKey: ['billing-unpaid', zoneFilter, agingFilter, searchFilter],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (zoneFilter) qs.set('zone', zoneFilter);
      if (agingFilter) qs.set('aging', agingFilter);
      if (searchFilter) qs.set('search', searchFilter);
      qs.set('limit', '200');
      return api.get<UnpaidBillingResponse>(`/billing/unpaid?${qs.toString()}`);
    },
  });

  // โหลดข้อมูลออเดอร์ค้างของลูกค้าที่เลือกในหน้าปิดยอด
  const customerUnpaidQuery = useQuery({
    queryKey: ['billing-customer-unpaid', selectedCustomerId],
    enabled: Boolean(selectedCustomerId),
    queryFn: async () => {
      const res = await api.get<{
        items: UnpaidOrderRecord[];
        customers: CustomerDebtSummary[];
      }>(`/billing/unpaid?customerId=${selectedCustomerId}&limit=200`);
      const custRes = await api.get<{
        data: {
          id: number;
          code: string;
          name: string;
          phone: string | null;
          zone: string | null;
          balanceSat: number;
          outstandingBottles: number;
        };
      }>(`/customers/${selectedCustomerId}`);
      return {
        orders: res.items ?? [],
        customer: custRes.data,
      };
    },
  });

  const customerOrdersFifo = customerUnpaidQuery.data?.orders ?? [];
  const selectedCustomerInfo = customerUnpaidQuery.data?.customer ?? null;
  const availableDepositSat = Math.max(0, Number(selectedCustomerInfo?.balanceSat ?? 0));

  const grossCustomerUnpaidSat = useMemo(
    () => customerOrdersFifo.reduce((sum, o) => sum + o.unpaidSat, 0),
    [customerOrdersFifo],
  );

  // เมื่อเลือกลูกค้าในหน้าปิดยอด ให้ตั้งค่าเริ่มต้นแนะนำ
  useEffect(() => {
    if (!selectedCustomerInfo) {
      setAmountBahtInput('0');
      setUseDepositBahtInput('0');
      setSettleError('');
      return;
    }
    const suggestedUseDepositSat = Math.min(availableDepositSat, grossCustomerUnpaidSat);
    const suggestedCashSat = Math.max(0, grossCustomerUnpaidSat - suggestedUseDepositSat);
    setUseDepositBahtInput(String(satangToBaht(suggestedUseDepositSat)));
    setAmountBahtInput(String(satangToBaht(suggestedCashSat)));
    setSettleError('');
  }, [selectedCustomerId, availableDepositSat, grossCustomerUnpaidSat]);

  const parsedAmountSat = useMemo(() => {
    try {
      return Math.max(0, bahtToSatang(amountBahtInput || '0'));
    } catch {
      return 0;
    }
  }, [amountBahtInput]);

  const parsedUseDepositSat = useMemo(() => {
    try {
      return Math.max(0, bahtToSatang(useDepositBahtInput || '0'));
    } catch {
      return 0;
    }
  }, [useDepositBahtInput]);

  // Dry-run FIFO Preview ก่อนกดยืนยัน
  const dryRunPlan = useMemo(() => {
    const totalBudgetSat = parsedAmountSat + parsedUseDepositSat;
    let remainingBudget = totalBudgetSat;

    const previewRows = customerOrdersFifo.map((ord) => {
      const needed = ord.unpaidSat;
      const allocated = Math.min(needed, Math.max(0, remainingBudget));
      remainingBudget = Math.max(0, remainingBudget - allocated);
      const afterUnpaid = Math.max(0, needed - allocated);
      const willClose = afterUnpaid === 0 && needed > 0;
      return {
        ...ord,
        allocatedSat: allocated,
        afterPaidSat: ord.paidSat + allocated,
        afterUnpaidSat: afterUnpaid,
        willClose,
      };
    });

    const excessToDepositSat = Math.max(0, remainingBudget);
    const depositAfterSat = Math.max(
      0,
      availableDepositSat - parsedUseDepositSat + excessToDepositSat,
    );

    return {
      totalBudgetSat,
      previewRows,
      excessToDepositSat,
      depositAfterSat,
      isDepositExceeded: parsedUseDepositSat > availableDepositSat,
    };
  }, [customerOrdersFifo, parsedAmountSat, parsedUseDepositSat, availableDepositSat]);

  const settleMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCustomerId) throw new Error('กรุณาเลือกลูกค้าที่ต้องการปิดบิล');
      if (dryRunPlan.isDepositExceeded) {
        throw new Error('จำนวนเงินมัดจำที่ใช้เกินกว่ายอดมัดจำคงเหลือของลูกค้า');
      }
      return api.post<SettleResponse>('/billing/settle', {
        customerId: selectedCustomerId,
        amountSat: parsedAmountSat,
        useDepositSat: parsedUseDepositSat,
        method: paymentMethod,
        note: settleNote.trim(),
      });
    },
    onSuccess: (res) => {
      setLastSettleResult(res);
      setSettleNote('');
      setSettleError('');
      queryClient.invalidateQueries({ queryKey: ['billing-unpaid'] });
      queryClient.invalidateQueries({ queryKey: ['billing-customer-unpaid'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    },
    onError: (err) => {
      setSettleError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : 'เกิดข้อผิดพลาดในการปิดยอดชำระหนี้',
      );
    },
  });

  const depositMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCustomerId) throw new Error('กรุณาเลือกลูกค้า');
      const amountSat = bahtToSatang(depositAmountBaht || '0');
      if (amountSat <= 0) throw new Error('จำนวนเงินต้องมากกว่า 0 บาท');
      return api.post(`/customers/${selectedCustomerId}/deposit`, {
        type: depositType,
        amountSat,
        note: depositNote.trim(),
      });
    },
    onSuccess: () => {
      setDepositModalOpen(false);
      setDepositAmountBaht('0');
      setDepositNote('');
      setDepositError('');
      queryClient.invalidateQueries({ queryKey: ['billing-unpaid'] });
      queryClient.invalidateQueries({ queryKey: ['billing-customer-unpaid'] });
    },
    onError: (err) => {
      setDepositError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : 'ไม่สามารถบันทึกรายการมัดจำได้',
      );
    },
  });

  const receiptSlipQuery = useQuery({
    queryKey: ['billing-receipt-slip', activeReceiptSlipId],
    enabled: Boolean(activeReceiptSlipId),
    queryFn: async () => {
      const res = await api.get<{ slip: ReceiptSlipData }>(
        `/billing/slip/${activeReceiptSlipId}`,
      );
      return res.slip;
    },
  });

  const historySlipQuery = useQuery({
    queryKey: ['billing-history-slip', activeHistorySlipCustomerId],
    enabled: Boolean(activeHistorySlipCustomerId),
    queryFn: async () => {
      const res = await api.get<{ slip: HistorySlipData }>(
        `/billing/history-slip/${activeHistorySlipCustomerId}`,
      );
      return res.slip;
    },
  });

  const unpaidOrders = unpaidQuery.data?.items ?? [];
  const customerSummaries = unpaidQuery.data?.customers ?? [];
  const summary = unpaidQuery.data?.summary;

  function handleSelectCustomerForSettle(customerId: number) {
    setSelectedCustomerId(customerId);
    setActiveTab('settle');
  }

  function handleSettleSubmit(e: FormEvent) {
    e.preventDefault();
    setSettleError('');
    settleMutation.mutate();
  }

  function handleDepositSubmit(e: FormEvent) {
    e.preventDefault();
    setDepositError('');
    depositMutation.mutate();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800">
              {moduleMeta.code}
            </span>
            <h1 className="text-2xl font-bold text-slate-800">{moduleMeta.label}</h1>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            ติดตามรายการค้างชำระตามอายุหนี้ (30/60/90 วัน) จัดการเงินมัดจำ (Deposit) และปิดบิลตัดหนี้อัตโนมัติแบบ FIFO เก่าไปใหม่
          </p>
        </div>

        <div className="flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setActiveTab('unpaid')}
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${
              activeTab === 'unpaid'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            รายการค้างชำระ ({unpaidOrders.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('settle')}
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${
              activeTab === 'settle'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            ปิดยอดชำระหนี้ (FIFO Settle)
          </button>
        </div>
      </header>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 print:hidden">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500">ยอดออเดอร์ค้างรวม (Gross Unpaid)</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">
            {formatBaht(summary?.totalGrossUnpaidSat ?? 0)} ฿
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {summary?.totalUnpaidOrders ?? 0} ออเดอร์ ({summary?.totalCustomersWithDebt ?? 0}{' '}
            ราย)
          </p>
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 shadow-sm">
          <p className="text-xs font-medium text-emerald-800">
            เงินมัดจำคงเหลือของลูกหนี้ (Deposit)
          </p>
          <p className="mt-1 text-2xl font-bold text-emerald-950">
            {formatBaht(summary?.totalDepositAvailableSat ?? 0)} ฿
          </p>
        </div>

        <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-4 shadow-sm">
          <p className="text-xs font-medium text-sky-800">
            ยอดหนี้สุทธิหลังหักมัดจำ (Net Debt)
          </p>
          <p className="mt-1 text-2xl font-bold text-sky-950">
            {formatBaht(summary?.totalNetDebtSat ?? 0)} ฿
          </p>
        </div>

        <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-4 shadow-sm">
          <p className="text-xs font-medium text-rose-800">แจ้งเตือนอายุหนี้เกินกำหนด</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5 text-xs font-bold">
            <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-800">
              30+ วัน: {summary?.count30Plus ?? 0}
            </span>
            <span className="rounded bg-orange-100 px-2 py-0.5 text-orange-800">
              60+ วัน: {summary?.count60Plus ?? 0}
            </span>
            <span className="rounded bg-rose-200 px-2 py-0.5 text-rose-900">
              90+ วัน: {summary?.count90Plus ?? 0}
            </span>
          </div>
        </div>
      </div>

      {/* แบนเนอร์ผลลัพธ์หลังปิดยอดสำเร็จ */}
      {lastSettleResult && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm print:hidden">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-bold text-emerald-900">
                บันทึกการปิดบิลสำเร็จ! เลขที่ใบเสร็จ {lastSettleResult.receipt.code}
              </h2>
              <p className="mt-1 text-sm text-emerald-800">
                ลูกค้า: <span className="font-semibold">{lastSettleResult.customerBalance.customerName}</span>{' '}
                | ปิด/ตัดออเดอร์: <span className="font-semibold">{lastSettleResult.settledOrders.length} รายการ</span>{' '}
                | เงินมัดจำคงเหลือ:{' '}
                <span className="font-semibold">{formatBaht(lastSettleResult.customerBalance.balanceSat)} ฿</span>
                {lastSettleResult.excessToDepositSat > 0
                  ? ` (เก็บส่วนเกินเข้ามัดจำ +${formatBaht(lastSettleResult.excessToDepositSat)} ฿)`
                  : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveReceiptSlipId(lastSettleResult.receipt.id)}
                className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
              >
                พิมพ์ใบเสร็จรับเงิน
              </button>
              <button
                type="button"
                onClick={() => setLastSettleResult(null)}
                className="rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
              >
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'unpaid' ? (
        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm print:hidden">
          {/* ตัวกรองรายการค้างชำระ */}
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  กรองอายุหนี้ (Aging)
                </label>
                <select
                  value={agingFilter}
                  onChange={(e) => setAgingFilter(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">ทุกช่วงอายุหนี้</option>
                  <option value="unpaid30">ค้างเกิน 30 วัน (unpaid30)</option>
                  <option value="unpaid60">ค้างเกิน 60 วัน (unpaid60)</option>
                  <option value="unpaid90">ค้างเกิน 90 วัน (unpaid90)</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  กรองสายส่ง (Zone)
                </label>
                <input
                  type="text"
                  placeholder="เช่น สาย A..."
                  value={zoneFilter}
                  onChange={(e) => setZoneFilter(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  ค้นหาลูกค้า / เลขออเดอร์
                </label>
                <input
                  type="text"
                  placeholder="ชื่อลูกค้า, รหัส..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
          </div>

          {/* ตารางสรุปยอดหนี้สุทธิรายลูกค้า */}
          {customerSummaries.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <h3 className="mb-2.5 text-xs font-bold uppercase tracking-wider text-slate-600">
                สรุปยอดหนี้สุทธิต่อลูกค้า (ยอดออเดอร์ค้าง − เงินที่เก็บแล้ว − มัดจำคงเหลือ)
              </h3>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
                {customerSummaries.map((cust) => {
                  const badge = getAgingBadge(cust.maxAgeDays);
                  return (
                    <div
                      key={cust.customerId}
                      className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="font-mono text-xs font-bold text-sky-700">
                              {cust.customerCode}
                            </span>
                            <h4 className="text-sm font-bold text-slate-900">
                              {cust.customerName}
                            </h4>
                          </div>
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.cls}`}>
                            {badge.label}
                          </span>
                        </div>
                        <div className="mt-2 space-y-0.5 text-xs text-slate-600">
                          <div className="flex justify-between">
                            <span>ออเดอร์ค้าง ({cust.unpaidOrderCount} ใบ):</span>
                            <span className="font-semibold text-slate-900">
                              {formatBaht(cust.grossUnpaidSat)} ฿
                            </span>
                          </div>
                          <div className="flex justify-between text-emerald-700">
                            <span>หักมัดจำคงเหลือ (Deposit):</span>
                            <span className="font-semibold">
                              −{formatBaht(cust.depositBalanceSat)} ฿
                            </span>
                          </div>
                          <div className="flex justify-between border-t border-slate-100 pt-1 text-sm font-bold text-rose-700">
                            <span>หนี้สุทธิที่ต้องเก็บ:</span>
                            <span>{formatBaht(cust.netDebtSat)} ฿</span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => handleSelectCustomerForSettle(cust.customerId)}
                          className="flex-1 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-sky-700"
                        >
                          ปิดยอด (FIFO)
                        </button>
                        <button
                          type="button"
                          onClick={() => setActiveHistorySlipCustomerId(cust.customerId)}
                          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                        >
                          ใบแจ้งหนี้
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ตารางรายการออเดอร์ค้างชำระ */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="px-3 py-2.5">รหัสออเดอร์</th>
                  <th className="px-3 py-2.5">ลูกค้า</th>
                  <th className="px-3 py-2.5">โซน</th>
                  <th className="px-3 py-2.5">วันที่ส่งสำเร็จ (completed_at)</th>
                  <th className="px-3 py-2.5 text-center">อายุหนี้</th>
                  <th className="px-3 py-2.5 text-right">ยอดเต็ม</th>
                  <th className="px-3 py-2.5 text-right">จ่ายแล้ว</th>
                  <th className="px-3 py-2.5 text-right">คงค้าง</th>
                  <th className="px-3 py-2.5 text-right">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {unpaidOrders.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-10 text-center text-slate-500">
                      ไม่พบรายการออเดอร์ค้างชำระตามเงื่อนไขที่เลือก
                    </td>
                  </tr>
                ) : (
                  unpaidOrders.map((ord) => {
                    const badge = getAgingBadge(ord.ageDays);
                    return (
                      <tr key={ord.id} className="hover:bg-slate-50">
                        <td className="px-3 py-3 font-mono text-xs font-bold text-sky-700">
                          {ord.code}
                        </td>
                        <td className="px-3 py-3">
                          <div className="font-semibold text-slate-900">
                            {ord.customerName}
                          </div>
                          <div className="text-xs text-slate-500">
                            {ord.customerCode} | มัดจำคงเหลือ:{' '}
                            {formatBaht(ord.customerDepositSat)} ฿
                          </div>
                        </td>
                        <td className="px-3 py-3 text-xs text-slate-600">
                          {ord.zone || '-'}
                        </td>
                        <td className="px-3 py-3 text-xs text-slate-600">
                          {ord.completedAt || ord.deliveryDate}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span
                            className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.cls}`}
                          >
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right text-slate-700">
                          {formatBaht(ord.totalSat)}
                        </td>
                        <td className="px-3 py-3 text-right text-emerald-700">
                          {formatBaht(ord.paidSat)}
                        </td>
                        <td className="px-3 py-3 text-right font-bold text-rose-700">
                          {formatBaht(ord.unpaidSat)}
                        </td>
                        <td className="px-3 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleSelectCustomerForSettle(ord.customerId)}
                            className="rounded-lg bg-sky-600 px-3 py-1 text-xs font-semibold text-white hover:bg-sky-700"
                          >
                            เลือกปิดยอด
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        /* แท็บปิดยอดชำระหนี้แบบ FIFO */
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 print:hidden">
          {/* ซ้าย: เลือกลูกค้า */}
          <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-4">
            <h2 className="text-base font-bold text-slate-800">
              1. เลือกลูกค้าที่ต้องการปิดบิล
            </h2>

            {customerSummaries.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">
                ไม่มีลูกค้าที่มียอดค้างชำระในขณะนี้
              </p>
            ) : (
              <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
                {customerSummaries.map((cust) => {
                  const isSelected = cust.customerId === selectedCustomerId;
                  return (
                    <button
                      key={cust.customerId}
                      type="button"
                      onClick={() => setSelectedCustomerId(cust.customerId)}
                      className={`w-full rounded-xl border p-3.5 text-left transition ${
                        isSelected
                          ? 'border-sky-600 bg-sky-50/70 ring-2 ring-sky-500/20'
                          : 'border-slate-200 bg-white hover:border-sky-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs font-bold text-sky-700">
                          {cust.customerCode}
                        </span>
                        <span className="text-xs font-bold text-rose-700">
                          ค้างรวม {formatBaht(cust.grossUnpaidSat)} ฿
                        </span>
                      </div>
                      <p className="mt-0.5 text-sm font-bold text-slate-900">
                        {cust.customerName}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {cust.unpaidOrderCount} ออเดอร์ | มัดจำคงเหลือ:{' '}
                        {formatBaht(cust.depositBalanceSat)} ฿
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* ขวา: ฟอร์มปิดบิล + ตารางแจกแจง FIFO (Dry-run Preview) */}
          <section className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-8">
            <h2 className="text-base font-bold text-slate-800">
              2. กรอกยอดรับชำระ & ตรวจสอบการแจกแจงแบบ FIFO (เก่า → ใหม่)
            </h2>

            {!selectedCustomerId || !selectedCustomerInfo ? (
              <div className="rounded-xl border border-dashed border-slate-200 py-16 text-center">
                <p className="text-sm font-medium text-slate-500">
                  กรุณาเลือกลูกค้าจากรายการด้านซ้ายเพื่อคำนวณการปิดบิล
                </p>
              </div>
            ) : (
              <form onSubmit={handleSettleSubmit} className="space-y-5">
                {settleError && (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                    {settleError}
                  </div>
                )}

                {/* ข้อมูลลูกค้าและปุ่มจัดการเงินมัดจำ */}
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div>
                    <span className="font-mono text-xs font-bold text-sky-700">
                      {selectedCustomerInfo.code}
                    </span>
                    <h3 className="text-lg font-bold text-slate-900">
                      {selectedCustomerInfo.name}
                    </h3>
                    <p className="text-xs text-slate-600">
                      ยอดออเดอร์ค้างรวม: {formatBaht(grossCustomerUnpaidSat)} ฿ | หนี้สุทธิหลังหักมัดจำ:{' '}
                      <span className="font-bold text-rose-700">
                        {formatBaht(Math.max(0, grossCustomerUnpaidSat - availableDepositSat))} ฿
                      </span>
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2 text-right">
                      <span className="block text-xs text-emerald-800">
                        เงินมัดจำคงเหลือ (Deposit)
                      </span>
                      <span className="text-lg font-bold text-emerald-950">
                        {formatBaht(availableDepositSat)} ฿
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setDepositType('in');
                        setDepositAmountBaht('0');
                        setDepositError('');
                        setDepositModalOpen(true);
                      }}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      + รับ/คืนมัดจำ
                    </button>
                  </div>
                </div>

                {/* ช่องกรอกจำนวนเงินชำระ + ใช้ deposit */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                      จำนวนเงินที่รับชำระครั้งนี้ (บาท)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={amountBahtInput}
                      onChange={(e) => setAmountBahtInput(e.target.value)}
                      className="h-10 w-full rounded-lg border border-slate-300 px-3 text-base font-bold text-slate-900 focus:border-sky-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                      ใช้เงินมัดจำมาช่วยตัดหนี้ (บาท)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={useDepositBahtInput}
                      onChange={(e) => setUseDepositBahtInput(e.target.value)}
                      className={`h-10 w-full rounded-lg border px-3 text-base font-bold focus:outline-none ${
                        dryRunPlan.isDepositExceeded
                          ? 'border-rose-500 bg-rose-50 text-rose-900'
                          : 'border-slate-300 text-emerald-900 focus:border-sky-500'
                      }`}
                    />
                    {dryRunPlan.isDepositExceeded && (
                      <p className="mt-1 text-xs font-semibold text-rose-600">
                        เกินยอดมัดจำคงเหลือ ({formatBaht(availableDepositSat)} ฿)
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-700">
                      ช่องทางการชำระเงิน
                    </label>
                    <select
                      value={paymentMethod}
                      onChange={(e) =>
                        setPaymentMethod(e.target.value as 'cash' | 'transfer' | 'other')
                      }
                      className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-800"
                    >
                      <option value="cash">เงินสด (Cash)</option>
                      <option value="transfer">โอนเงิน (Transfer)</option>
                      <option value="other">อื่นๆ (Other)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    หมายเหตุใบเสร็จ
                  </label>
                  <input
                    type="text"
                    placeholder="เช่น โอนเข้ากสิกร / ปิดบิลประจำเดือน..."
                    value={settleNote}
                    onChange={(e) => setSettleNote(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>

                {/* ตารางจำลองการแจกแจง FIFO (Dry-run Preview) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
                      ตัวอย่างผลการตัดหนี้อัตโนมัติ (Dry-run FIFO เก่า → ใหม่)
                    </h4>
                    <span className="text-xs font-semibold text-sky-800">
                      งบตัดหนี้รวม: {formatBaht(dryRunPlan.totalBudgetSat)} ฿
                    </span>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full border-collapse text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                          <th className="px-3 py-2">ลำดับ</th>
                          <th className="px-3 py-2">ออเดอร์</th>
                          <th className="px-3 py-2">วันที่ส่งสำเร็จ</th>
                          <th className="px-3 py-2 text-right">ค้างเดิม</th>
                          <th className="px-3 py-2 text-right">ตัดจ่ายรอบนี้</th>
                          <th className="px-3 py-2 text-right">ค้างคงเหลือ</th>
                          <th className="px-3 py-2 text-center">ผลลัพธ์</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {dryRunPlan.previewRows.map((row, idx) => (
                          <tr
                            key={row.id}
                            className={row.allocatedSat > 0 ? 'bg-sky-50/40' : ''}
                          >
                            <td className="px-3 py-2 font-mono font-bold text-slate-500">
                              #{idx + 1}
                            </td>
                            <td className="px-3 py-2 font-mono font-bold text-sky-700">
                              {row.code}
                            </td>
                            <td className="px-3 py-2 text-slate-600">
                              {row.completedAt || row.deliveryDate}
                            </td>
                            <td className="px-3 py-2 text-right font-semibold text-slate-800">
                              {formatBaht(row.unpaidSat)}
                            </td>
                            <td className="px-3 py-2 text-right font-bold text-emerald-700">
                              {row.allocatedSat > 0
                                ? `-${formatBaht(row.allocatedSat)}`
                                : '0.00'}
                            </td>
                            <td className="px-3 py-2 text-right font-bold text-rose-700">
                              {formatBaht(row.afterUnpaidSat)}
                            </td>
                            <td className="px-3 py-2 text-center">
                              {row.willClose ? (
                                <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-bold text-emerald-800">
                                  ปิดเต็มจำนวน
                                </span>
                              ) : row.allocatedSat > 0 ? (
                                <span className="rounded-full bg-amber-100 px-2 py-0.5 font-bold text-amber-800">
                                  ชำระบางส่วน
                                </span>
                              ) : (
                                <span className="text-slate-400">คงเดิม</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {dryRunPlan.excessToDepositSat > 0 && (
                    <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3.5 py-2.5 text-xs font-semibold text-indigo-900">
                      ยอดชำระเกินหนี้คงค้างจำนวน{' '}
                      <span className="font-bold">
                        {formatBaht(dryRunPlan.excessToDepositSat)} บาท
                      </span>{' '}
                      จะถูกบันทึกเก็บเข้าเป็นเงินมัดจำคงเหลือ (Deposit) ของลูกค้าโดยอัตโนมัติ
                    </div>
                  )}
                </div>

                {/* ปุ่มยืนยันปิดบิล */}
                <div className="flex flex-col gap-3 rounded-xl bg-slate-900 p-4 text-white sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-xs text-slate-300">
                    <div>
                      รับเงิน:{' '}
                      <span className="font-bold text-white">
                        {formatBaht(parsedAmountSat)} ฿
                      </span>{' '}
                      + ใช้มัดจำ:{' '}
                      <span className="font-bold text-emerald-400">
                        {formatBaht(parsedUseDepositSat)} ฿
                      </span>
                    </div>
                    <div>
                      มัดจำคงเหลือหลังทำรายการ:{' '}
                      <span className="font-semibold text-sky-300">
                        {formatBaht(dryRunPlan.depositAfterSat)} ฿
                      </span>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={
                      settleMutation.isPending ||
                      dryRunPlan.isDepositExceeded ||
                      dryRunPlan.totalBudgetSat <= 0
                    }
                    className="rounded-xl bg-sky-500 px-6 py-3 text-sm font-bold text-white shadow hover:bg-sky-400 disabled:opacity-50"
                  >
                    {settleMutation.isPending
                      ? 'กำลังบันทึกปิดบิล...'
                      : 'ยืนยันปิดยอดชำระหนี้ (FIFO)'}
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      )}

      {/* Modal ทำรายการเงินมัดจำ (POST /api/customers/:id/deposit) */}
      {depositModalOpen && selectedCustomerInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 print:hidden">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">
              จัดการเงินมัดจำ ({selectedCustomerInfo.code} — {selectedCustomerInfo.name})
            </h3>
            <p className="mt-1 text-xs text-slate-600">
              ยอดเงินมัดจำคงเหลือปัจจุบัน:{' '}
              <span className="font-bold text-emerald-700">
                {formatBaht(availableDepositSat)} บาท
              </span>
            </p>

            <form onSubmit={handleDepositSubmit} className="mt-4 space-y-4">
              {depositError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                  {depositError}
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  ประเภทรายการมัดจำ
                </label>
                <select
                  value={depositType}
                  onChange={(e) => setDepositType(e.target.value as 'in' | 'use' | 'refund')}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold"
                >
                  <option value="in">รับเงินมัดจำเพิ่ม (in)</option>
                  <option value="use">หักใช้เงินมัดจำ (use)</option>
                  <option value="refund">คืนเงินมัดจำให้ลูกค้า (refund)</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  จำนวนเงิน (บาท)
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  value={depositAmountBaht}
                  onChange={(e) => setDepositAmountBaht(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base font-bold"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  หมายเหตุ
                </label>
                <input
                  type="text"
                  value={depositNote}
                  onChange={(e) => setDepositNote(e.target.value)}
                  placeholder="ระบุเหตุผลการรับ/คืนมัดจำ..."
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDepositModalOpen(false)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={depositMutation.isPending}
                  className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-bold text-white hover:bg-sky-700 disabled:opacity-50"
                >
                  {depositMutation.isPending ? 'กำลังบันทึก...' : 'บันทึกรายการ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal พิมพ์ใบเสร็จรับเงิน (GET /api/billing/slip/:receiptId) */}
      {activeReceiptSlipId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 print:static print:bg-transparent print:p-0">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl print:max-w-none print:rounded-none print:p-2 print:shadow-none">
            {receiptSlipQuery.isLoading || !receiptSlipQuery.data ? (
              <p className="py-8 text-center text-sm text-slate-500">
                กำลังโหลดข้อมูลใบเสร็จรับเงิน...
              </p>
            ) : (
              <div className="space-y-4 text-sm text-slate-800">
                <div className="border-b border-dashed border-slate-300 pb-3 text-center">
                  <h3 className="text-lg font-bold text-slate-900">
                    {receiptSlipQuery.data.company.name}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {receiptSlipQuery.data.company.subtitle}
                  </p>
                  <p className="mt-1 font-mono text-xs font-bold text-slate-700">
                    เลขที่ใบเสร็จ: {receiptSlipQuery.data.slipNo}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="font-bold text-slate-900">
                      ลูกค้า: {receiptSlipQuery.data.customer.name}
                    </p>
                    <p className="text-slate-600">
                      รหัส: {receiptSlipQuery.data.customer.code} | โซน:{' '}
                      {receiptSlipQuery.data.customer.zone || '-'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p>วันที่รับชำระ: {receiptSlipQuery.data.receipt.createdAt}</p>
                    <p>
                      ช่องทาง:{' '}
                      {METHOD_LABELS[receiptSlipQuery.data.summary.method] ??
                        receiptSlipQuery.data.summary.method}
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5 border-y border-slate-300 py-3 text-xs">
                  <div className="flex justify-between text-sm font-bold text-slate-900">
                    <span>จำนวนเงินที่รับชำระ</span>
                    <span>
                      {formatBaht(receiptSlipQuery.data.summary.receiptAmountSat)} บาท
                    </span>
                  </div>
                  {receiptSlipQuery.data.summary.usedDepositSat > 0 && (
                    <div className="flex justify-between text-emerald-800">
                      <span>หักใช้เงินมัดจำสะสม (Deposit Use)</span>
                      <span>
                        {formatBaht(receiptSlipQuery.data.summary.usedDepositSat)} บาท
                      </span>
                    </div>
                  )}
                  {receiptSlipQuery.data.summary.excessDepositInSat > 0 && (
                    <div className="flex justify-between text-indigo-800">
                      <span>ส่วนเกินเก็บเข้าเงินมัดจำ (Deposit In)</span>
                      <span>
                        +{formatBaht(receiptSlipQuery.data.summary.excessDepositInSat)} บาท
                      </span>
                    </div>
                  )}
                  <div className="mt-2 flex justify-between border-t border-dashed border-slate-200 pt-2 text-slate-700">
                    <span>เงินมัดจำคงเหลือสุทธิ:</span>
                    <span className="font-semibold">
                      {formatBaht(receiptSlipQuery.data.summary.depositBalanceAfterSat)} บาท
                    </span>
                  </div>
                  <div className="flex justify-between font-bold text-rose-700">
                    <span>ยอดหนี้ค้างชำระคงเหลือสุทธิ:</span>
                    <span>
                      {formatBaht(receiptSlipQuery.data.summary.remainingNetDebtSat)} บาท
                    </span>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2 print:hidden">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-bold text-white hover:bg-sky-700"
                  >
                    สั่งพิมพ์ (Print)
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveReceiptSlipId(null)}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700"
                  >
                    ปิด
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal พิมพ์สลิปสรุปประวัติค้างชำระ (GET /api/billing/history-slip/:customerId) */}
      {activeHistorySlipCustomerId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 print:static print:bg-transparent print:p-0">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl print:max-w-none print:rounded-none print:p-2 print:shadow-none">
            {historySlipQuery.isLoading || !historySlipQuery.data ? (
              <p className="py-8 text-center text-sm text-slate-500">
                กำลังเตรียมใบสรุปยอดค้างชำระ...
              </p>
            ) : (
              <div className="space-y-4 text-sm text-slate-800">
                <div className="border-b border-dashed border-slate-300 pb-3 text-center">
                  <h3 className="text-lg font-bold text-slate-900">
                    {historySlipQuery.data.company.name}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {historySlipQuery.data.company.subtitle}
                  </p>
                  <p className="mt-1 font-mono text-xs font-bold text-slate-700">
                    เลขที่เอกสาร: {historySlipQuery.data.slipNo}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="font-bold text-slate-900">
                      ลูกค้า: {historySlipQuery.data.customer.name} ({historySlipQuery.data.customer.code})
                    </p>
                    <p className="text-slate-600">
                      สายส่ง: {historySlipQuery.data.customer.zone || '-'} | โทร:{' '}
                      {historySlipQuery.data.customer.phone || '-'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p>ถัง 18.9L ค้างสะสม: {historySlipQuery.data.summary.outstandingBottles} ถัง</p>
                    <p>
                      เงินมัดจำคงเหลือ: {formatBaht(historySlipQuery.data.summary.depositBalanceSat)} ฿
                    </p>
                  </div>
                </div>

                <div>
                  <h4 className="mb-1.5 text-xs font-bold text-slate-700">
                    รายการออเดอร์ค้างชำระ ({historySlipQuery.data.unpaidOrders.length} รายการ)
                  </h4>
                  <table className="w-full border-collapse border-y border-slate-300 text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <th className="py-1.5 text-left">ออเดอร์</th>
                        <th className="py-1.5 text-left">วันที่ส่ง</th>
                        <th className="py-1.5 text-center">อายุหนี้</th>
                        <th className="py-1.5 text-right">ยอดรวม</th>
                        <th className="py-1.5 text-right">ชำระแล้ว</th>
                        <th className="py-1.5 text-right">คงค้าง</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {historySlipQuery.data.unpaidOrders.map((o) => (
                        <tr key={o.id}>
                          <td className="py-1.5 font-mono font-semibold">{o.code}</td>
                          <td className="py-1.5">{o.completedAt || o.deliveryDate}</td>
                          <td className="py-1.5 text-center">{o.ageDays} วัน</td>
                          <td className="py-1.5 text-right">{formatBaht(o.totalSat)}</td>
                          <td className="py-1.5 text-right">{formatBaht(o.paidSat)}</td>
                          <td className="py-1.5 text-right font-bold">
                            {formatBaht(o.unpaidSat)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span>รวมยอดออเดอร์ค้างชำระ</span>
                    <span className="font-semibold">
                      {formatBaht(historySlipQuery.data.summary.grossUnpaidSat)} บาท
                    </span>
                  </div>
                  <div className="flex justify-between text-emerald-800">
                    <span>หักเงินมัดจำคงเหลือ (Deposit)</span>
                    <span>
                      −{formatBaht(historySlipQuery.data.summary.depositBalanceSat)} บาท
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-slate-300 pt-1.5 text-sm font-bold text-rose-700">
                    <span>ยอดหนี้สุทธิที่ต้องชำระทั้งสิ้น</span>
                    <span>{formatBaht(historySlipQuery.data.summary.netDebtSat)} บาท</span>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2 print:hidden">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-bold text-white hover:bg-sky-700"
                  >
                    สั่งพิมพ์ (Print)
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveHistorySlipCustomerId(null)}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700"
                  >
                    ปิด
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
