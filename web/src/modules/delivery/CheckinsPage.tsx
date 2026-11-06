import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../../api/client';
import { findModule } from '../../lib/modules';
import { bahtToSatang, formatBaht, satangToBaht } from '../../lib/money';
import Toast from '../../components/ui/Toast';
import type { CustomerSku } from '../crm/CustomersPage';
import type { OrderRecord } from '../orders/OrdersPage';

const moduleMeta = findModule('DLV');

const SKU_ORDER: CustomerSku[] = ['FG-189L', 'FG-350ML', 'FG-600ML', 'FG-1500ML'];

const SKU_META: Record<CustomerSku, { label: string; unit: string }> = {
  'FG-189L': { label: 'ถังน้ำดื่ม 18.9 ลิตร', unit: 'ถัง' },
  'FG-350ML': { label: 'น้ำดื่ม 350 มล. (แพ็ค 12)', unit: 'แพ็ค' },
  'FG-600ML': { label: 'น้ำดื่ม 600 มล. (แพ็ค 12)', unit: 'แพ็ค' },
  'FG-1500ML': { label: 'น้ำดื่ม 1500 มล. (แพ็ค 6)', unit: 'แพ็ค' },
};

interface CheckinRecord {
  id: number;
  orderId: number;
  orderCode: string | null;
  deliveryDate: string | null;
  customerId: number;
  customerCode: string | null;
  customerName: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  customerRoute: string | null;
  customerOutstandingBottles: number;
  delivered: Record<string, number>;
  returned189L: number;
  paymentMode: 'cash' | 'credit';
  moneyReceivedSat: number;
  orderTotalSat: number;
  unpaidDebtSat: number;
  notes: string;
  performedByName: string | null;
  receiptCode: string | null;
  createdAt: string;
}

interface CheckinSlipData {
  slipNo: string;
  printedAt: string;
  company: {
    name: string;
    subtitle: string;
  };
  checkin: CheckinRecord;
  customer: {
    id: number;
    code: string | null;
    name: string | null;
    phone: string | null;
    address: string | null;
    route: string | null;
    outstandingBottles: number;
  };
  items: Array<{
    sku: string;
    name: string;
    plannedQty: number;
    deliveredQty: number;
    returnedQty: number;
    unitPriceSat: number;
    lineTotalSat: number;
  }>;
  summary: {
    totalSat: number;
    moneyReceivedSat: number;
    unpaidDebtSat: number;
    paymentMode: 'cash' | 'credit';
    delivered189L: number;
    returned189L: number;
    outstandingBottlesAfter: number;
  };
}

interface CreateCheckinResponse {
  checkin: CheckinRecord;
  order: OrderRecord;
  receipt: {
    id: number;
    code: string;
    amountSat: number;
    method: string;
  } | null;
  customerBalance: {
    customerId: number;
    customerCode: string;
    customerName: string;
    previousOutstandingBottles: number;
    outstandingBottles: number;
    unpaidOrderDebtSat: number;
  };
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function CheckinsPage() {
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'form' | 'history'>('form');
  const [deliveryDateFilter, setDeliveryDateFilter] = useState<string>(todayIsoDate());
  const [zoneFilter, setZoneFilter] = useState<string>('');
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);

  // Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [deliveredQty, setDeliveredQty] = useState<Record<CustomerSku, number>>({
    'FG-189L': 0,
    'FG-350ML': 0,
    'FG-600ML': 0,
    'FG-1500ML': 0,
  });
  const [returned189L, setReturned189L] = useState<number>(0);
  const [paymentMode, setPaymentMode] = useState<'cash' | 'credit'>('cash');
  const [moneyReceivedBaht, setMoneyReceivedBaht] = useState<string>('0');
  const [notes, setNotes] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [lastSuccess, setLastSuccess] = useState<CreateCheckinResponse | null>(null);

  // History filters
  const [historyDateFrom, setHistoryDateFrom] = useState<string>(todayIsoDate());
  const [historyDateTo, setHistoryDateTo] = useState<string>(todayIsoDate());
  const [historyPaymentMode, setHistoryPaymentMode] = useState<string>('');
  const [activeSlipId, setActiveSlipId] = useState<number | null>(null);

  // โหลดรายการออเดอร์ที่รอส่ง
  const ordersQuery = useQuery({
    queryKey: ['orders-for-checkin', deliveryDateFilter, zoneFilter],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (deliveryDateFilter) {
        qs.set('dateFrom', deliveryDateFilter);
        qs.set('dateTo', deliveryDateFilter);
      }
      if (zoneFilter) qs.set('zone', zoneFilter);
      qs.set('limit', '200');
      const res = await api.get<{ data: OrderRecord[] }>(`/orders?${qs.toString()}`);
      return (res.data ?? []).filter(
        (o) => o.status !== 'delivered' && o.status !== 'cancelled',
      );
    },
  });

  const pendingOrders = ordersQuery.data ?? [];
  const selectedOrder = useMemo(
    () => pendingOrders.find((o) => o.id === selectedOrderId) ?? null,
    [pendingOrders, selectedOrderId],
  );

  // โหลดข้อมูลลูกค้าของออเดอร์ที่เลือกเพื่อดูถังค้างและราคาต่อหน่วย
  const customerDetailQuery = useQuery({
    queryKey: ['checkin-customer', selectedOrder?.customerId],
    enabled: Boolean(selectedOrder?.customerId),
    queryFn: async () => {
      const res = await api.get<{
        data: {
          id: number;
          code: string;
          name: string;
          outstandingBottles: number;
          prices: Record<CustomerSku, number>;
        };
      }>(`/customers/${selectedOrder!.customerId}`);
      return res.data;
    },
  });

  // เมื่อเลือกออเดอร์ใหม่ ให้เติมจำนวนตามแผนลงฟอร์มอัตโนมัติ
  useEffect(() => {
    if (!selectedOrder) {
      setDeliveredQty({
        'FG-189L': 0,
        'FG-350ML': 0,
        'FG-600ML': 0,
        'FG-1500ML': 0,
      });
      setReturned189L(0);
      setPaymentMode('cash');
      setMoneyReceivedBaht('0');
      setNotes('');
      return;
    }

    const nextDelivered: Record<CustomerSku, number> = {
      'FG-189L': Number(selectedOrder.quantities?.['FG-189L'] ?? 0),
      'FG-350ML': Number(selectedOrder.quantities?.['FG-350ML'] ?? 0),
      'FG-600ML': Number(selectedOrder.quantities?.['FG-600ML'] ?? 0),
      'FG-1500ML': Number(selectedOrder.quantities?.['FG-1500ML'] ?? 0),
    };
    setDeliveredQty(nextDelivered);
    setReturned189L(nextDelivered['FG-189L']);
    const defaultMode = selectedOrder.paymentMode === 'credit' ? 'credit' : 'cash';
    setPaymentMode(defaultMode);
    setMoneyReceivedBaht(
      defaultMode === 'cash' ? String(satangToBaht(selectedOrder.totalSat)) : '0',
    );
    setNotes(selectedOrder.notes ?? '');
    setErrorMsg('');
  }, [selectedOrder]);

  // คำนวณราคาต่อหน่วยและยอดรวมจริงตามจำนวนที่ส่งจริง
  const unitPriceMap = useMemo(() => {
    const map: Record<CustomerSku, number> = {
      'FG-189L': 0,
      'FG-350ML': 0,
      'FG-600ML': 0,
      'FG-1500ML': 0,
    };
    if (customerDetailQuery.data?.prices) {
      for (const sku of SKU_ORDER) {
        map[sku] = Number(customerDetailQuery.data.prices[sku] ?? 0);
      }
    }
    for (const item of selectedOrder?.items ?? []) {
      if (SKU_ORDER.includes(item.sku)) {
        map[item.sku] = Number(item.unitPriceSat ?? 0);
      }
    }
    return map;
  }, [selectedOrder, customerDetailQuery.data]);

  const calculatedTotalSat = useMemo(() => {
    return SKU_ORDER.reduce(
      (sum, sku) => sum + Math.max(0, Number(deliveredQty[sku] ?? 0)) * unitPriceMap[sku],
      0,
    );
  }, [deliveredQty, unitPriceMap]);

  // อัปเดตยอดรับเงินสดอัตโนมัติเมื่อเป็นโหมดเงินสดและเปลี่ยนจำนวนส่ง
  useEffect(() => {
    if (paymentMode === 'cash') {
      setMoneyReceivedBaht(String(satangToBaht(calculatedTotalSat)));
    }
  }, [calculatedTotalSat, paymentMode]);

  const currentOutstandingBottles = Number(
    customerDetailQuery.data?.outstandingBottles ?? 0,
  );
  const projectedOutstandingBottles = Math.max(
    0,
    currentOutstandingBottles +
      Math.max(0, Number(deliveredQty['FG-189L'] ?? 0)) -
      Math.max(0, Number(returned189L ?? 0)),
  );

  const moneyReceivedSat = useMemo(() => {
    try {
      return bahtToSatang(moneyReceivedBaht || '0');
    } catch {
      return 0;
    }
  }, [moneyReceivedBaht]);

  const unpaidDebtSat = Math.max(0, calculatedTotalSat - moneyReceivedSat);

  // ประวัติการเช็คอิน
  const checkinsHistoryQuery = useQuery({
    queryKey: ['checkins-history', historyDateFrom, historyDateTo, historyPaymentMode],
    enabled: activeTab === 'history',
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (historyDateFrom) qs.set('dateFrom', historyDateFrom);
      if (historyDateTo) qs.set('dateTo', historyDateTo);
      if (historyPaymentMode) qs.set('paymentMode', historyPaymentMode);
      qs.set('limit', '100');
      const res = await api.get<{ items: CheckinRecord[] }>(`/checkins?${qs.toString()}`);
      return res.items ?? [];
    },
  });

  // โหลดข้อมูลสลิปสำหรับพิมพ์
  const slipQuery = useQuery({
    queryKey: ['checkin-slip', activeSlipId],
    enabled: Boolean(activeSlipId),
    queryFn: async () => {
      const res = await api.get<{ slip: CheckinSlipData }>(
        `/checkins/slip/${activeSlipId}`,
      );
      return res.slip;
    },
  });

  const checkinMutation = useMutation({
    mutationFn: async () => {
      if (!selectedOrder) {
        throw new Error('กรุณาเลือกออเดอร์ที่ต้องการเช็คอิน');
      }
      return api.post<CreateCheckinResponse>('/checkins', {
        orderId: selectedOrder.id,
        customerId: selectedOrder.customerId,
        delivered: deliveredQty,
        returned189L: Math.max(0, Math.trunc(Number(returned189L) || 0)),
        paymentMode,
        moneyReceivedSat,
        notes: notes.trim(),
      });
    },
    onSuccess: (res) => {
      setLastSuccess(res);
      setSelectedOrderId(null);
      setErrorMsg('');
      setToastMessage(`เช็คอินออเดอร์ ${res.order.code} สำเร็จเรียบร้อย`);
      queryClient.invalidateQueries({ queryKey: ['orders-for-checkin'] });
      queryClient.invalidateQueries({ queryKey: ['checkins-history'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        setErrorMsg(err.message);
      } else if (err instanceof Error) {
        setErrorMsg(err.message);
      } else {
        setErrorMsg('เกิดข้อผิดพลาดในการบันทึกเช็คอิน');
      }
    },
  });

  function handleAdjustQty(sku: CustomerSku, delta: number) {
    setDeliveredQty((prev) => ({
      ...prev,
      [sku]: Math.max(0, (prev[sku] ?? 0) + delta),
    }));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErrorMsg('');
    checkinMutation.mutate();
  }

  return (
    <div className="space-y-6">
      <Toast message={toastMessage} onClose={() => setToastMessage(null)} />

      {/* Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-800 dark:bg-sky-950/60 dark:text-sky-300">
              {moduleMeta.code}
            </span>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
              {moduleMeta.label}
            </h1>
          </div>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            บันทึกยอดส่งจริงหน้างาน ตัดสต็อกสินค้า รับคืนถังเปล่า 18.9L และออกใบเสร็จ/บันทึกหนี้ในรายการเดียว
          </p>
        </div>

        <div className="flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm dark:border-slate-800 dark:bg-slate-850">
          <button
            type="button"
            onClick={() => setActiveTab('form')}
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${
              activeTab === 'form'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            เช็คอินส่งน้ำ ({pendingOrders.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${
              activeTab === 'history'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            ประวัติการเช็คอิน
          </button>
        </div>
      </header>

      {/* แบนเนอร์แสดงผลลัพธ์หลังเช็คอินสำเร็จ */}
      {lastSuccess && activeTab === 'form' && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm print:hidden dark:border-emerald-900/50 dark:bg-emerald-950/30">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-bold text-emerald-900 dark:text-emerald-200">
                เช็คอินออเดอร์ {lastSuccess.order.code} สำเร็จเรียบร้อย!
              </h2>
              <p className="mt-1 text-sm text-emerald-800 dark:text-emerald-300">
                ลูกค้า: <span className="font-semibold">{lastSuccess.customerBalance.customerName}</span>{' '}
                | ยอดสุทธิ: <span className="font-semibold">{formatBaht(lastSuccess.order.totalSat)}</span>{' '}
                | รับเงินแล้ว: <span className="font-semibold">{formatBaht(lastSuccess.checkin.moneyReceivedSat)}</span>{' '}
                | ถังค้างคงเหลือ:{' '}
                <span className="font-semibold">{lastSuccess.customerBalance.outstandingBottles} ถัง</span>
                {lastSuccess.receipt ? ` | ใบเสร็จ: ${lastSuccess.receipt.code}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveSlipId(lastSuccess.checkin.id)}
                className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-800"
              >
                พิมพ์สลิปส่งน้ำ / ใบเสร็จ
              </button>
              <button
                type="button"
                onClick={() => setLastSuccess(null)}
                className="rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-medium text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-slate-900 dark:text-emerald-300"
              >
                ปิด
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'form' ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 print:hidden">
          {/* คอลัมน์ซ้าย: เลือกออเดอร์ที่รอส่ง */}
          <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-850 lg:col-span-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
                1. เลือกออเดอร์ที่รอจัดส่ง
              </h2>
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                รอส่ง {pendingOrders.length} รายการ
              </span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                  วันที่จัดส่ง
                </label>
                <input
                  type="date"
                  value={deliveryDateFilter}
                  onChange={(e) => setDeliveryDateFilter(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                  กรองสายส่ง (Zone)
                </label>
                <input
                  type="text"
                  placeholder="เช่น สาย A..."
                  value={zoneFilter}
                  onChange={(e) => setZoneFilter(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
            </div>

            {ordersQuery.isLoading ? (
              <p className="py-8 text-center text-sm text-slate-500">กำลังโหลดรายการออเดอร์...</p>
            ) : pendingOrders.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center dark:border-slate-800">
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                  ไม่มีออเดอร์ค้างส่งในวันที่เลือก
                </p>
                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                  ลองเปลี่ยนวันที่จัดส่ง หรือสร้างออเดอร์ใหม่ที่เมนูออเดอร์
                </p>
              </div>
            ) : (
              <div className="max-h-[540px] space-y-2.5 overflow-y-auto pr-1">
                {pendingOrders.map((order) => {
                  const isSelected = order.id === selectedOrderId;
                  return (
                    <button
                      key={order.id}
                      type="button"
                      onClick={() => setSelectedOrderId(order.id)}
                      className={`w-full rounded-xl border p-3.5 text-left transition ${
                        isSelected
                          ? 'border-sky-600 bg-sky-50/70 ring-2 ring-sky-500/20 dark:border-sky-500 dark:bg-sky-950/40'
                          : 'border-slate-200 bg-white hover:border-sky-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50 dark:hover:border-sky-700'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="font-mono text-xs font-bold text-sky-700 dark:text-sky-400">
                            {order.code}
                          </span>
                          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                            {order.customerName}
                          </h3>
                        </div>
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          {formatBaht(order.totalSat)}
                        </span>
                      </div>

                      <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                        {order.zone && (
                          <span className="rounded bg-sky-100 px-2 py-0.5 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300">
                            {order.zone}
                          </span>
                        )}
                        {SKU_ORDER.map((sku) => {
                          const q = Number(order.quantities?.[sku] ?? 0);
                          if (q <= 0) return null;
                          return (
                            <span
                              key={sku}
                              className="rounded bg-slate-100 px-2 py-0.5 font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                            >
                              {sku.replace('FG-', '')}: {q}
                            </span>
                          );
                        })}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* คอลัมน์ขวา: ฟอร์มบันทึกเช็คอินส่งน้ำ */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-850 lg:col-span-7">
            <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
              2. บันทึกยอดส่งจริง & รับคืนถังเปล่า
            </h2>

            {!selectedOrder ? (
              <div className="mt-6 rounded-xl border border-dashed border-slate-200 py-16 text-center dark:border-slate-800">
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                  กรุณาแตะเลือกออเดอร์จากรายการด้านซ้ายเพื่อเริ่มเช็คอิน
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="mt-4 space-y-5">
                {errorMsg && (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
                    {errorMsg}
                  </div>
                )}

                {/* ข้อมูลลูกค้าสรุป */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-750 dark:bg-slate-800/50">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-mono text-xs font-bold text-sky-700 dark:text-sky-400">
                        {selectedOrder.code} ({selectedOrder.customerCode})
                      </span>
                      <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                        {selectedOrder.customerName}
                      </h3>
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        สายส่ง: {selectedOrder.zone || '-'} | โทร: {selectedOrder.customerPhone || '-'}
                      </p>
                    </div>
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-right dark:border-amber-900/40 dark:bg-amber-950/30">
                      <span className="block text-xs text-amber-800 dark:text-amber-300">ถัง 18.9L ค้างเดิม</span>
                      <span className="text-lg font-bold text-amber-900 dark:text-amber-200">
                        {currentOutstandingBottles} ถัง
                      </span>
                    </div>
                  </div>
                </div>

                {/* ตารางกรอกจำนวนส่งจริงแต่ละ SKU */}
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    จำนวนสินค้าที่ส่งจริง (ปรับเพิ่ม/ลดได้ตามหน้างาน)
                  </h4>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {SKU_ORDER.map((sku) => {
                      const planned = Number(selectedOrder.quantities?.[sku] ?? 0);
                      const actual = Number(deliveredQty[sku] ?? 0);
                      const unitPriceSat = unitPriceMap[sku];
                      return (
                        <div
                          key={sku}
                          className="rounded-xl border border-slate-200 p-3.5 dark:border-slate-750 dark:bg-slate-800/30"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-bold text-slate-800 dark:text-slate-200">
                                {SKU_META[sku].label}
                              </p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                แผนสั่ง: {planned} {SKU_META[sku].unit} | ราคา{' '}
                                {formatBaht(unitPriceSat)}/{SKU_META[sku].unit}
                              </p>
                            </div>
                          </div>

                          <div className="mt-3 flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleAdjustQty(sku, -1)}
                              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-slate-100 text-lg font-bold text-slate-700 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                            >
                              −
                            </button>
                            <input
                              type="number"
                              min={0}
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={actual}
                              onChange={(e) =>
                                setDeliveredQty((prev) => ({
                                  ...prev,
                                  [sku]: Math.max(0, Math.trunc(Number(e.target.value) || 0)),
                                }))
                              }
                              className="h-11 w-full rounded-lg border border-slate-300 bg-white text-center text-lg font-bold text-slate-900 focus:border-sky-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                            />
                            <button
                              type="button"
                              onClick={() => handleAdjustQty(sku, +1)}
                              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-300 bg-slate-100 text-lg font-bold text-slate-700 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                            >
                              +
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAdjustQty(sku, +5)}
                              className="flex h-11 px-2.5 items-center justify-center rounded-lg border border-slate-300 bg-slate-100 text-xs font-bold text-slate-700 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                              title="เพิ่ม 5 หน่วย"
                            >
                              +5
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* รับคืนถังเปล่า 18.9L */}
                <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-4 dark:border-sky-900/50 dark:bg-sky-950/20">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:items-center">
                    <div>
                      <label className="block text-sm font-bold text-sky-950 dark:text-sky-200">
                        จำนวนถังเปล่า 18.9L ที่รับคืน (ถัง)
                      </label>
                      <p className="text-xs text-sky-800 dark:text-sky-300">
                        จะถูกเพิ่มเข้าคลัง RET-189L-EMPTY และหักลบถังค้างของลูกค้าทันที
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setReturned189L((prev) => Math.max(0, prev - 1))}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-sky-300 bg-white text-lg font-bold text-sky-800 hover:bg-sky-100 dark:border-sky-800 dark:bg-slate-800 dark:text-sky-300"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        min={0}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        value={returned189L}
                        onChange={(e) =>
                          setReturned189L(Math.max(0, Math.trunc(Number(e.target.value) || 0)))
                        }
                        className="h-11 w-full rounded-lg border border-sky-300 bg-white text-center text-lg font-bold text-sky-950 focus:border-sky-500 focus:outline-none dark:border-sky-800 dark:bg-slate-800 dark:text-sky-100"
                      />
                      <button
                        type="button"
                        onClick={() => setReturned189L((prev) => prev + 1)}
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-sky-300 bg-white text-lg font-bold text-sky-800 hover:bg-sky-100 dark:border-sky-800 dark:bg-slate-800 dark:text-sky-300"
                      >
                        +
                      </button>
                      <button
                        type="button"
                        onClick={() => setReturned189L((prev) => prev + 5)}
                        className="flex h-11 px-2.5 items-center justify-center rounded-lg border border-sky-300 bg-white text-xs font-bold text-sky-800 hover:bg-sky-100 dark:border-sky-800 dark:bg-slate-800 dark:text-sky-300"
                        title="เพิ่ม 5 ถัง"
                      >
                        +5
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between border-t border-sky-200/70 pt-2 text-xs font-semibold text-sky-900 dark:border-sky-800/60 dark:text-sky-300">
                    <span>
                      คำนวณถังค้างใหม่: {currentOutstandingBottles} (เดิม) +{' '}
                      {deliveredQty['FG-189L']} (ส่ง) − {returned189L} (คืน)
                    </span>
                    <span className="text-sm font-bold">
                      = ค้างสุทธิ {projectedOutstandingBottles} ถัง
                    </span>
                  </div>
                </div>

                {/* การชำระเงิน */}
                <div className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 p-4 dark:border-slate-750 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      โหมดการชำระเงิน
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setPaymentMode('cash');
                          setMoneyReceivedBaht(String(satangToBaht(calculatedTotalSat)));
                        }}
                        className={`rounded-lg border py-2.5 text-sm font-bold transition ${
                          paymentMode === 'cash'
                            ? 'border-emerald-600 bg-emerald-600 text-white'
                            : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        เงินสด (Cash)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPaymentMode('credit');
                          setMoneyReceivedBaht('0');
                        }}
                        className={`rounded-lg border py-2.5 text-sm font-bold transition ${
                          paymentMode === 'credit'
                            ? 'border-amber-600 bg-amber-600 text-white'
                            : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        เครดิต / ค้างจ่าย
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      จำนวนเงินที่รับจริง (บาท)
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={moneyReceivedBaht}
                      onChange={(e) => setMoneyReceivedBaht(e.target.value)}
                      className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-base font-bold text-slate-900 focus:border-sky-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                      หมายเหตุการส่งน้ำ (ถ้ามี)
                    </label>
                    <input
                      type="text"
                      placeholder="เช่น ฝากถังไว้หน้าร้าน / โอนเข้าบัญชี..."
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-sky-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>
                </div>

                {/* สรุปยอดเงินก่อนกดยืนยัน */}
                <div className="flex flex-col gap-3 rounded-xl bg-slate-900 p-4 text-white shadow-lg sm:flex-row sm:items-center sm:justify-between dark:bg-slate-950 dark:border dark:border-slate-800">
                  <div className="space-y-0.5">
                    <p className="text-xs text-slate-300">
                      ยอดรวมตามของส่งจริง:{' '}
                      <span className="text-base font-bold text-white">
                        {formatBaht(calculatedTotalSat)}
                      </span>
                    </p>
                    <p className="text-xs text-slate-300">
                      รับเงินสด:{' '}
                      <span className="font-semibold text-emerald-400">
                        {formatBaht(moneyReceivedSat)}
                      </span>{' '}
                      | ค้างชำระลงบัญชี:{' '}
                      <span className="font-semibold text-amber-300">
                        {formatBaht(unpaidDebtSat)}
                      </span>
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={checkinMutation.isPending}
                    className="rounded-xl bg-sky-500 px-6 py-3 text-base font-bold text-white shadow hover:bg-sky-400 disabled:opacity-50"
                  >
                    {checkinMutation.isPending
                      ? 'กำลังบันทึกเช็คอิน...'
                      : 'ยืนยันเช็คอินส่งน้ำ'}
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      ) : (
        /* แท็บประวัติการเช็คอิน */
        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm print:hidden dark:border-slate-800 dark:bg-slate-850">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                ตั้งแต่วันที่
              </label>
              <input
                type="date"
                value={historyDateFrom}
                onChange={(e) => setHistoryDateFrom(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                ถึงวันที่
              </label>
              <input
                type="date"
                value={historyDateTo}
                onChange={(e) => setHistoryDateTo(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                การชำระเงิน
              </label>
              <select
                value={historyPaymentMode}
                onChange={(e) => setHistoryPaymentMode(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="">ทั้งหมด</option>
                <option value="cash">เงินสด (Cash)</option>
                <option value="credit">เครดิต (Credit)</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm dark:divide-slate-800">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-800/80 dark:text-slate-300">
                  <th className="px-3 py-2.5">เวลาเช็คอิน</th>
                  <th className="px-3 py-2.5">ออเดอร์ / ใบเสร็จ</th>
                  <th className="px-3 py-2.5">ลูกค้า</th>
                  <th className="px-3 py-2.5">ส่งจริง</th>
                  <th className="px-3 py-2.5 text-center">คืนถัง 18.9L</th>
                  <th className="px-3 py-2.5 text-right">ยอดสุทธิ</th>
                  <th className="px-3 py-2.5 text-right">รับเงิน</th>
                  <th className="px-3 py-2.5 text-center">โหมด</th>
                  <th className="px-3 py-2.5 text-right">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {(checkinsHistoryQuery.data ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-400 dark:text-slate-500">
                      ไม่พบประวัติการเช็คอินในช่วงวันที่เลือก
                    </td>
                  </tr>
                ) : (
                  (checkinsHistoryQuery.data ?? []).map((ck) => (
                    <tr key={ck.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-400">
                        {ck.createdAt}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs">
                        <div className="font-bold text-sky-700 dark:text-sky-400">{ck.orderCode}</div>
                        {ck.receiptCode && (
                          <div className="text-emerald-700 dark:text-emerald-400">{ck.receiptCode}</div>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {ck.customerName}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          ถังค้างปัจจุบัน: {ck.customerOutstandingBottles} ถัง
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-700 dark:text-slate-300">
                        {Object.entries(ck.delivered ?? {})
                          .filter(([, q]) => Number(q) > 0)
                          .map(([sku, q]) => `${sku.replace('FG-', '')}: ${q}`)
                          .join(', ') || '-'}
                      </td>
                      <td className="px-3 py-2.5 text-center font-semibold text-sky-700 dark:text-sky-400">
                        {ck.returned189L}
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold text-slate-900 dark:text-slate-100">
                        {formatBaht(ck.orderTotalSat)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold text-emerald-700 dark:text-emerald-400">
                        {formatBaht(ck.moneyReceivedSat)}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            ck.paymentMode === 'cash'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                          }`}
                        >
                          {ck.paymentMode === 'cash' ? 'เงินสด' : 'เครดิต'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => setActiveSlipId(ck.id)}
                          className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                          พิมพ์สลิป
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Modal สลิปส่งน้ำ / ใบเสร็จรับเงิน (@media print) */}
      {activeSlipId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm print:static print:bg-transparent print:p-0">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:border dark:border-slate-800 dark:bg-slate-900 print:max-w-none print:rounded-none print:p-2 print:shadow-none">
            {slipQuery.isLoading || !slipQuery.data ? (
              <p className="py-8 text-center text-sm text-slate-600 dark:text-slate-400">
                กำลังเตรียมข้อมูลใบสลิป...
              </p>
            ) : (
              <div className="space-y-4 text-sm text-slate-800 dark:text-slate-200">
                <div className="border-b border-dashed border-slate-300 pb-3 text-center dark:border-slate-700">
                  <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                    {slipQuery.data.company.name}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {slipQuery.data.company.subtitle}
                  </p>
                  <p className="mt-1 font-mono text-xs font-bold text-slate-700 dark:text-slate-300">
                    เลขที่เอกสาร: {slipQuery.data.slipNo} | ออเดอร์:{' '}
                    {slipQuery.data.checkin.orderCode}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-slate-100">
                      ลูกค้า: {slipQuery.data.customer.name}
                    </p>
                    <p className="text-slate-600 dark:text-slate-400">
                      รหัส: {slipQuery.data.customer.code} | สาย:{' '}
                      {slipQuery.data.customer.route || '-'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p>วันที่เช็คอิน: {slipQuery.data.checkin.createdAt}</p>
                    <p>
                      การชำระ:{' '}
                      {slipQuery.data.summary.paymentMode === 'cash'
                        ? 'เงินสด (Cash)'
                        : 'เครดิต (Credit)'}
                    </p>
                  </div>
                </div>

                <table className="w-full border-collapse border-y border-slate-300 text-xs dark:border-slate-700">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-750 dark:bg-slate-800/80">
                      <th className="py-1.5 text-left">รายการสินค้า</th>
                      <th className="py-1.5 text-center">ส่งจริง</th>
                      <th className="py-1.5 text-right">ราคา/หน่วย</th>
                      <th className="py-1.5 text-right">รวมเงิน</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {slipQuery.data.items.map((item) => (
                      <tr key={item.sku}>
                        <td className="py-1.5">{item.name}</td>
                        <td className="py-1.5 text-center font-semibold">
                          {item.deliveredQty}
                        </td>
                        <td className="py-1.5 text-right">
                          {formatBaht(item.unitPriceSat)}
                        </td>
                        <td className="py-1.5 text-right font-semibold">
                          {formatBaht(item.lineTotalSat)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="space-y-1 text-xs">
                  <div className="flex justify-between font-bold text-slate-900 dark:text-slate-100">
                    <span>ยอดรวมสุทธิ</span>
                    <span>{formatBaht(slipQuery.data.summary.totalSat)}</span>
                  </div>
                  <div className="flex justify-between text-emerald-800 dark:text-emerald-400">
                    <span>รับเงินแล้ว</span>
                    <span>{formatBaht(slipQuery.data.summary.moneyReceivedSat)}</span>
                  </div>
                  {slipQuery.data.summary.unpaidDebtSat > 0 && (
                    <div className="flex justify-between font-semibold text-rose-700 dark:text-rose-400">
                      <span>ยอดค้างชำระรอบนี้</span>
                      <span>{formatBaht(slipQuery.data.summary.unpaidDebtSat)}</span>
                    </div>
                  )}
                  <div className="mt-2 flex justify-between border-t border-dashed border-slate-300 pt-2 font-semibold text-sky-900 dark:border-slate-700 dark:text-sky-300">
                    <span>
                      ส่งถัง 18.9L: {slipQuery.data.summary.delivered189L} | คืนถังเปล่า:{' '}
                      {slipQuery.data.summary.returned189L}
                    </span>
                    <span>
                      ถังค้างสะสม: {slipQuery.data.summary.outstandingBottlesAfter} ถัง
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 print:hidden">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-bold text-white shadow hover:bg-sky-700"
                  >
                    สั่งพิมพ์ (Print)
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveSlipId(null)}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    ปิดหน้าต่าง
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
