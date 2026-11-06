import { type FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../../api/client';
import { useAuthSession } from '../../lib/auth';
import { findModule } from '../../lib/modules';
import { formatBaht } from '../../lib/money';
import { getTodayDateString } from '../../lib/date';
import { useModalEsc } from '../../lib/useModalEsc';
import Toast from '../../components/ui/Toast';
import StepperInput from '../../components/ui/StepperInput';
import CollapsibleSection from '../../components/ui/CollapsibleSection';
import type { CustomerItem, CustomerSku } from '../crm/CustomersPage';

const moduleMeta = findModule('ORD');

export type OrderStatus = 'draft' | 'confirmed' | 'delivered' | 'cancelled';
export type PaymentStatus = 'paid' | 'unpaid' | 'partial';

export interface OrderItemLine {
  id: number;
  orderId: number;
  sku: CustomerSku;
  qty: number;
  unitPriceSat: number;
  lineTotalSat: number;
  deliveredQty: number;
  returnedQty: number;
}

export interface OrderRecord {
  id: number;
  code: string;
  customerId: number;
  customerCode: string | null;
  customerName: string | null;
  customerPhone: string | null;
  zone: string | null;
  address: string | null;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  deliveryDate: string;
  totalSat: number;
  paidSat: number;
  unpaidSat: number;
  paymentMode: 'cash' | 'credit' | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  items: OrderItemLine[];
  quantities: Record<CustomerSku, number>;
}

interface PaginatedOrders {
  data: OrderRecord[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface RouteSheetStop {
  customerId: number;
  customerCode: string;
  customerName: string;
  phone: string | null;
  zone: string | null;
  address: string | null;
  quantities: Record<CustomerSku, number>;
  totalSat: number;
  orderCodes: string[];
}

interface RouteSheetResponse {
  date: string;
  zone: string | null;
  totalStops: number;
  totalOrders: number;
  totalSat: number;
  quantities: Record<CustomerSku, number>;
  stops: RouteSheetStop[];
}

export const ORDER_STATUS_BADGE: Record<
  OrderStatus,
  { label: string; className: string }
> = {
  draft: {
    label: 'ร่าง (Draft)',
    className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  },
  confirmed: {
    label: 'ยืนยันแล้ว',
    className: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  },
  delivered: {
    label: 'จัดส่งสำเร็จแล้ว',
    className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  },
  cancelled: {
    label: 'ยกเลิก',
    className: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',
  },
};

export const PAYMENT_STATUS_BADGE: Record<
  PaymentStatus,
  { label: string; className: string }
> = {
  paid: {
    label: 'ชำระครบแล้ว',
    className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  },
  partial: {
    label: 'ชำระบางส่วน',
    className: 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300',
  },
  unpaid: {
    label: 'ค้างชำระ',
    className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
  },
};

const TODAY_ISO = getTodayDateString();

export default function OrdersPage() {
  const { user } = useAuthSession();
  const queryClient = useQueryClient();

  const canWrite =
    user?.role === 'admin' || user?.role === 'manager' || user?.role === 'staff';
  const canExport = user?.role === 'admin' || user?.role === 'manager';

  const [activeTab, setActiveTab] = useState<'orders' | 'route-sheet'>('orders');

  // ตัวกรองตารางออเดอร์
  const [search, setSearch] = useState('');
  const [zoneFilter, setZoneFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  // ตัวกรองใบเส้นทางรายวัน (Route Sheet)
  const [routeDate, setRouteDate] = useState(TODAY_ISO);
  const [routeZone, setRouteZone] = useState('');

  // Toast แจ้งเตือน
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Modal สร้าง/แก้ไขออเดอร์
  const [modalOpen, setModalOpen] = useState(false);
  useModalEsc(modalOpen, () => setModalOpen(false));
  const [saving, setSaving] = useState(false);
  const [editingOrder, setEditingOrder] = useState<OrderRecord | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [deliveryDate, setDeliveryDate] = useState(TODAY_ISO);
  const [qty189, setQty189] = useState('0');
  const [qty350, setQty350] = useState('0');
  const [qty600, setQty600] = useState('0');
  const [qty1500, setQty1500] = useState('0');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [bannerMsg, setBannerMsg] = useState<{ type: 'ok' | 'warn' | 'err'; text: string } | null>(
    null,
  );

  // Modal ยกเลิกออเดอร์
  const [cancelTarget, setCancelTarget] = useState<OrderRecord | null>(null);
  useModalEsc(Boolean(cancelTarget), () => setCancelTarget(null));
  const [cancelReason, setCancelReason] = useState('');

  const ordersQuery = useQuery({
    queryKey: [
      'orders',
      search,
      zoneFilter,
      statusFilter,
      paymentStatusFilter,
      dateFrom,
      dateTo,
      page,
    ],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: '50',
      });
      if (search.trim()) params.set('search', search.trim());
      if (zoneFilter.trim()) params.set('zone', zoneFilter.trim());
      if (statusFilter) params.set('status', statusFilter);
      if (paymentStatusFilter) params.set('paymentStatus', paymentStatusFilter);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      return api.get<PaginatedOrders>(`/orders?${params.toString()}`);
    },
  });

  const customersQuery = useQuery({
    queryKey: ['orders-active-customers'],
    queryFn: () => api.get<{ data: CustomerItem[] }>('/customers?limit=200&active=1'),
  });

  const routeSheetQuery = useQuery({
    queryKey: ['orders-route-sheet', routeDate, routeZone],
    enabled: activeTab === 'route-sheet',
    queryFn: () => {
      const params = new URLSearchParams({ date: routeDate });
      if (routeZone.trim()) params.set('zone', routeZone.trim());
      return api.get<RouteSheetResponse>(`/orders/route-sheet?${params.toString()}`);
    },
  });

  const confirmMutation = useMutation({
    mutationFn: (id: number) => api.post(`/orders/${id}/confirm`),
    onSuccess: () => {
      setToastMessage('ยืนยันออเดอร์สำเร็จ');
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['orders-route-sheet'] });
    },
    onError: (err) => {
      setBannerMsg({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'ไม่สามารถยืนยันออเดอร์ได้',
      });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      api.post(`/orders/${id}/cancel`, { reason }),
    onSuccess: () => {
      setCancelTarget(null);
      setCancelReason('');
      setToastMessage('ยกเลิกออเดอร์สำเร็จ');
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['orders-route-sheet'] });
    },
    onError: (err) => {
      setBannerMsg({
        type: 'err',
        text: err instanceof ApiError ? err.message : 'ไม่สามารถยกเลิกออเดอร์ได้',
      });
    },
  });

  const customerList = customersQuery.data?.data ?? [];
  const selectedCustomer =
    customerList.find((c) => String(c.id) === selectedCustomerId) ?? null;

  const activePrices = selectedCustomer?.prices ?? {
    'FG-189L': 1500,
    'FG-350ML': 3500,
    'FG-600ML': 3500,
    'FG-1500ML': 3500,
  };

  const liveTotalSat =
    Math.max(0, Number(qty189) || 0) * activePrices['FG-189L'] +
    Math.max(0, Number(qty350) || 0) * activePrices['FG-350ML'] +
    Math.max(0, Number(qty600) || 0) * activePrices['FG-600ML'] +
    Math.max(0, Number(qty1500) || 0) * activePrices['FG-1500ML'];

  function openCreateModal() {
    setEditingOrder(null);
    setSelectedCustomerId(customerList[0] ? String(customerList[0].id) : '');
    setDeliveryDate(TODAY_ISO);
    setQty189('0');
    setQty350('0');
    setQty600('0');
    setQty1500('0');
    setNotes('');
    setFormError(null);
    setModalOpen(true);
  }

  function openEditModal(ord: OrderRecord) {
    setEditingOrder(ord);
    setSelectedCustomerId(String(ord.customerId));
    setDeliveryDate(ord.deliveryDate);
    setQty189(String(ord.quantities['FG-189L'] ?? 0));
    setQty350(String(ord.quantities['FG-350ML'] ?? 0));
    setQty600(String(ord.quantities['FG-600ML'] ?? 0));
    setQty1500(String(ord.quantities['FG-1500ML'] ?? 0));
    setNotes(ord.notes ?? '');
    setFormError(null);
    setModalOpen(true);
  }

  function openReorderModal(ord: OrderRecord) {
    setEditingOrder(null);
    setSelectedCustomerId(String(ord.customerId));
    setDeliveryDate(TODAY_ISO);
    setQty189(String(ord.quantities['FG-189L'] ?? 0));
    setQty350(String(ord.quantities['FG-350ML'] ?? 0));
    setQty600(String(ord.quantities['FG-600ML'] ?? 0));
    setQty1500(String(ord.quantities['FG-1500ML'] ?? 0));
    setNotes(ord.notes ?? '');
    setFormError(null);
    setModalOpen(true);
  }

  async function handleSaveOrder(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);

    const items = [
      { sku: 'FG-189L' as const, qty: Math.max(0, Math.trunc(Number(qty189) || 0)) },
      { sku: 'FG-350ML' as const, qty: Math.max(0, Math.trunc(Number(qty350) || 0)) },
      { sku: 'FG-600ML' as const, qty: Math.max(0, Math.trunc(Number(qty600) || 0)) },
      { sku: 'FG-1500ML' as const, qty: Math.max(0, Math.trunc(Number(qty1500) || 0)) },
    ];

    try {
      if (editingOrder) {
        await api.put(`/orders/${editingOrder.id}`, {
          customerId: Number(selectedCustomerId),
          deliveryDate,
          items,
          notes: notes.trim() || null,
        });
        setToastMessage(`แก้ไขออเดอร์ [${editingOrder.code}] สำเร็จ`);
      } else {
        const res = await api.post<{ data: OrderRecord; duplicateIgnored?: boolean }>('/orders', {
          customerId: Number(selectedCustomerId),
          deliveryDate,
          items,
          notes: notes.trim() || null,
        });
        if (res.duplicateIgnored) {
          setBannerMsg({
            type: 'warn',
            text: `ระบบข้ามการบันทึกซ้ำภายใน 4 วินาที (คงออเดอร์ [${res.data.code}] เดิมไว้)`,
          });
        } else {
          setToastMessage(`สร้างออเดอร์ [${res.data.code}] สำเร็จ`);
        }
      }

      setModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['orders-route-sheet'] });
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'บันทึกออเดอร์ไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  async function handleExportExcel() {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (zoneFilter.trim()) params.set('zone', zoneFilter.trim());
      if (statusFilter) params.set('status', statusFilter);
      if (paymentStatusFilter) params.set('paymentStatus', paymentStatusFilter);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      await api.download(`/orders/export?${params.toString()}`, 'Inthara_Sales_Orders.xlsx');
    } finally {
      setExporting(false);
    }
  }

  const orders = ordersQuery.data?.data ?? [];
  const pagination = ordersQuery.data?.pagination;
  const routeSheet = routeSheetQuery.data;

  return (
    <section className="space-y-4">
      <Toast message={toastMessage} onClose={() => setToastMessage(null)} />

      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800 dark:text-slate-100">
            {moduleMeta.label}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">{moduleMeta.description}</p>
        </div>
        <span className="rounded-full bg-slate-200 px-3 py-1 font-mono text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {moduleMeta.code} · SRS §{moduleMeta.srsSection}
        </span>
      </header>

      {bannerMsg && (
        <div
          className={`rounded-xl border p-3 text-sm ${
            bannerMsg.type === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300'
              : bannerMsg.type === 'warn'
                ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-300'
                : 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300'
          }`}
        >
          {bannerMsg.text}
        </div>
      )}

      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setActiveTab('orders')}
          className={`border-b-2 px-4 py-2 text-sm font-medium transition ${
            activeTab === 'orders'
              ? 'border-brand-700 text-brand-700 dark:border-brand-500 dark:text-brand-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          รายการใบสั่งซื้อ ({pagination?.total ?? 0})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('route-sheet')}
          className={`border-b-2 px-4 py-2 text-sm font-medium transition ${
            activeTab === 'route-sheet'
              ? 'border-brand-700 text-brand-700 dark:border-brand-500 dark:text-brand-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
          }`}
        >
          ใบเส้นทางส่งของรายวัน (Route Sheet · ORD-6)
        </button>
      </div>

      {activeTab === 'orders' && (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-850">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="grid flex-1 gap-2 sm:grid-cols-6">
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="ค้นหาเลขที่ ORD- หรือชื่อลูกค้า…"
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 sm:col-span-2"
              />
              <input
                type="text"
                value={zoneFilter}
                onChange={(e) => {
                  setZoneFilter(e.target.value);
                  setPage(1);
                }}
                placeholder="กรองตามโซน…"
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="">ทุกสถานะออเดอร์</option>
                <option value="draft">ร่าง (draft)</option>
                <option value="confirmed">ยืนยันแล้ว (confirmed)</option>
                <option value="delivered">จัดส่งสำเร็จแล้ว (delivered)</option>
                <option value="cancelled">ยกเลิก (cancelled)</option>
              </select>
              <select
                value={paymentStatusFilter}
                onChange={(e) => {
                  setPaymentStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                <option value="">ทุกสถานะชำระเงิน</option>
                <option value="unpaid">ค้างชำระ (unpaid)</option>
                <option value="partial">ชำระบางส่วน (partial)</option>
                <option value="paid">ชำระครบแล้ว (paid)</option>
              </select>
              <div className="flex items-center gap-1">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value);
                    setPage(1);
                  }}
                  title="ตั้งแต่วันส่ง"
                  className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
                <span className="text-xs text-slate-400">-</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value);
                    setPage(1);
                  }}
                  title="ถึงวันส่ง"
                  className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {canExport && (
                <button
                  type="button"
                  disabled={exporting}
                  onClick={handleExportExcel}
                  className="rounded-lg border border-emerald-600 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                >
                  {exporting ? 'กำลังส่งออก…' : 'Export Excel (.xlsx)'}
                </button>
              )}
              {canWrite && (
                <button
                  type="button"
                  onClick={openCreateModal}
                  className="rounded-lg bg-brand-700 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand-600 dark:bg-brand-600 dark:hover:bg-brand-500"
                >
                  + สร้างออเดอร์ใหม่
                </button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm dark:divide-slate-800">
              <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-600 dark:bg-slate-800/80 dark:text-slate-300">
                <tr>
                  <th className="px-3 py-2">เลขที่ออเดอร์</th>
                  <th className="px-3 py-2">วันจัดส่ง</th>
                  <th className="px-3 py-2">ลูกค้า / โซน</th>
                  <th className="px-3 py-2 text-center">18.9L</th>
                  <th className="px-3 py-2 text-center">350ml</th>
                  <th className="px-3 py-2 text-center">600ml</th>
                  <th className="px-3 py-2 text-center">1500ml</th>
                  <th className="px-3 py-2 text-right">ยอดรวม (฿)</th>
                  <th className="px-3 py-2">สถานะ</th>
                  <th className="px-3 py-2">การชำระเงิน</th>
                  {canWrite && <th className="px-3 py-2 text-right">จัดการ</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {orders.length === 0 ? (
                  <tr>
                    <td
                      colSpan={11}
                      className="px-3 py-8 text-center text-sm text-slate-400 dark:text-slate-500"
                    >
                      ไม่พบรายการออเดอร์ตามเงื่อนไขที่เลือก
                    </td>
                  </tr>
                ) : (
                  orders.map((ord) => {
                    const statusBadge = ORDER_STATUS_BADGE[ord.status] ?? {
                      label: ord.status,
                      className: 'bg-slate-100 text-slate-700',
                    };
                    const payBadge = PAYMENT_STATUS_BADGE[ord.paymentStatus] ?? {
                      label: ord.paymentStatus,
                      className: 'bg-slate-100 text-slate-600',
                    };
                    const isEditable = ord.status === 'draft' || ord.status === 'confirmed';

                    return (
                      <tr key={ord.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="whitespace-nowrap px-3 py-2 font-mono text-xs font-semibold text-brand-700 dark:text-brand-400">
                          {ord.code}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-slate-700 dark:text-slate-300">
                          {ord.deliveryDate}
                        </td>
                        <td className="px-3 py-2">
                          <p className="font-medium text-slate-800 dark:text-slate-200">
                            {ord.customerName}
                          </p>
                          <p className="text-xs text-slate-400 dark:text-slate-500">
                            {ord.customerCode} · {ord.zone ?? '-'}
                          </p>
                        </td>
                        <td className="px-3 py-2 text-center font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">
                          {ord.quantities['FG-189L'] || '-'}
                        </td>
                        <td className="px-3 py-2 text-center font-mono text-xs text-slate-600 dark:text-slate-400">
                          {ord.quantities['FG-350ML'] || '-'}
                        </td>
                        <td className="px-3 py-2 text-center font-mono text-xs text-slate-600 dark:text-slate-400">
                          {ord.quantities['FG-600ML'] || '-'}
                        </td>
                        <td className="px-3 py-2 text-center font-mono text-xs text-slate-600 dark:text-slate-400">
                          {ord.quantities['FG-1500ML'] || '-'}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-sm font-bold text-slate-800 dark:text-slate-100">
                          {formatBaht(ord.totalSat, true)}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          <span
                            className={`rounded-full px-2.5 py-0.5 font-medium ${statusBadge.className}`}
                          >
                            {statusBadge.label}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs">
                          <span
                            className={`rounded-full px-2.5 py-0.5 font-medium ${payBadge.className}`}
                          >
                            {payBadge.label}
                          </span>
                        </td>
                        {canWrite && (
                          <td className="space-x-1.5 whitespace-nowrap px-3 py-2 text-right text-xs">
                            <button
                              type="button"
                              onClick={() => openReorderModal(ord)}
                              className="rounded border border-sky-200 bg-sky-50 px-2 py-1 font-medium text-sky-700 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300"
                              title="คัดลอกรายการนี้เพื่อสั่งซ้ำ"
                            >
                              สั่งซ้ำ
                            </button>
                            {ord.status === 'draft' && (
                              <button
                                type="button"
                                onClick={() => confirmMutation.mutate(ord.id)}
                                className="rounded border border-blue-200 bg-blue-50 px-2 py-1 font-medium text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300"
                              >
                                ยืนยัน
                              </button>
                            )}
                            {isEditable && (
                              <button
                                type="button"
                                onClick={() => openEditModal(ord)}
                                className="rounded border border-slate-200 px-2 py-1 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                              >
                                แก้ไข
                              </button>
                            )}
                            {isEditable && (
                              <button
                                type="button"
                                onClick={() => {
                                  setCancelTarget(ord);
                                  setCancelReason('');
                                }}
                                className="rounded border border-red-200 bg-red-50 px-2 py-1 text-red-700 hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300"
                              >
                                ยกเลิก
                              </button>
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

          {pagination && (
            <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-600 dark:border-slate-800 dark:text-slate-400">
              <span>
                หน้า {pagination.page} จาก {pagination.totalPages} (รวมทั้งหมด {pagination.total}{' '}
                รายการ)
              </span>
              <div className="space-x-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded border border-slate-200 px-3 py-1 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  ก่อนหน้า
                </button>
                <button
                  type="button"
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded border border-slate-200 px-3 py-1 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  ถัดไป
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'route-sheet' && (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-850">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                วันที่ส่งของ:
              </label>
              <input
                type="date"
                value={routeDate}
                onChange={(e) => setRouteDate(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
              <input
                type="text"
                value={routeZone}
                onChange={(e) => setRouteZone(e.target.value)}
                placeholder="กรองโซนสายส่ง…"
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>

            {routeSheet && (
              <div className="flex flex-wrap gap-3 text-xs">
                <span className="rounded-lg bg-slate-100 px-3 py-1.5 font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  จุดจอดรวม: <strong>{routeSheet.totalStops}</strong> ร้าน ({routeSheet.totalOrders}{' '}
                  ออเดอร์)
                </span>
                <span className="rounded-lg bg-brand-700/10 px-3 py-1.5 font-mono font-semibold text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
                  18.9L: {routeSheet.quantities['FG-189L']} ถัง · 350ml:{' '}
                  {routeSheet.quantities['FG-350ML']} · 600ml: {routeSheet.quantities['FG-600ML']} ·
                  1500ml: {routeSheet.quantities['FG-1500ML']}
                </span>
                <span className="rounded-lg bg-emerald-50 px-3 py-1.5 font-mono font-bold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
                  ยอดรวมสายส่ง: {formatBaht(routeSheet.totalSat, true)}
                </span>
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm dark:divide-slate-800">
              <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-600 dark:bg-slate-800/80 dark:text-slate-300">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">รหัสลูกค้า</th>
                  <th className="px-3 py-2">ชื่อลูกค้า / ที่อยู่จัดส่ง</th>
                  <th className="px-3 py-2">โซน</th>
                  <th className="px-3 py-2 text-center">18.9L</th>
                  <th className="px-3 py-2 text-center">350ml</th>
                  <th className="px-3 py-2 text-center">600ml</th>
                  <th className="px-3 py-2 text-center">1500ml</th>
                  <th className="px-3 py-2 text-right">ยอดรวม (฿)</th>
                  <th className="px-3 py-2">ใบสั่งซื้ออ้างอิง</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {(routeSheet?.stops ?? []).length === 0 ? (
                  <tr>
                    <td
                      colSpan={10}
                      className="px-3 py-8 text-center text-sm text-slate-400 dark:text-slate-500"
                    >
                      ไม่มีรายการต้องจัดส่งในวันที่ {routeDate}
                    </td>
                  </tr>
                ) : (
                  (routeSheet?.stops ?? []).map((stop, idx) => (
                    <tr key={stop.customerId} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="px-3 py-2 font-mono text-xs text-slate-500 dark:text-slate-400">
                        {idx + 1}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs font-semibold text-brand-700 dark:text-brand-400">
                        {stop.customerCode}
                      </td>
                      <td className="px-3 py-2">
                        <p className="font-medium text-slate-800 dark:text-slate-200">
                          {stop.customerName}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {stop.address ?? '-'}
                        </p>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-600 dark:text-slate-400">
                        {stop.zone ?? '-'}
                      </td>
                      <td className="px-3 py-2 text-center font-mono font-semibold text-slate-800 dark:text-slate-200">
                        {stop.quantities['FG-189L']}
                      </td>
                      <td className="px-3 py-2 text-center font-mono text-slate-600 dark:text-slate-400">
                        {stop.quantities['FG-350ML']}
                      </td>
                      <td className="px-3 py-2 text-center font-mono text-slate-600 dark:text-slate-400">
                        {stop.quantities['FG-600ML']}
                      </td>
                      <td className="px-3 py-2 text-center font-mono text-slate-600 dark:text-slate-400">
                        {stop.quantities['FG-1500ML']}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-emerald-700 dark:text-emerald-400">
                        {formatBaht(stop.totalSat, true)}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-500 dark:text-slate-400">
                        {stop.orderCodes.join(', ')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal สร้าง/แก้ไขออเดอร์ (ราคาอ่านอย่างเดียวจากทะเบียนลูกค้า + คำนวณยอดสด + Sticky Footer) */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-0 sm:p-4 backdrop-blur-sm">
          <div className="flex h-full w-full max-w-2xl flex-col justify-between overflow-y-auto rounded-none bg-white p-4 shadow-2xl sm:h-auto sm:max-h-[92vh] sm:rounded-2xl sm:p-6 dark:border dark:border-slate-800 dark:bg-slate-900">
            <div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">
                  {editingOrder
                    ? `แก้ไขออเดอร์ [${editingOrder.code}]`
                    : 'สร้างใบสั่งซื้อใหม่ (ราคาอ้างอิงจากทะเบียนลูกค้าเสมอ · PRC-2)'}
                </h2>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                  aria-label="ปิดหน้าต่าง"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSaveOrder} className="mt-4 space-y-4 text-sm">
                {formError && (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
                    {formError}
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      เลือกลูกค้า *
                    </label>
                    <select
                      required
                      autoFocus
                      value={selectedCustomerId}
                      onChange={(e) => setSelectedCustomerId(e.target.value)}
                      className="mt-1 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    >
                      <option value="">-- เลือกลูกค้า --</option>
                      {customerList.map((c) => (
                        <option key={c.id} value={String(c.id)}>
                          [{c.code}] {c.name} ({c.zone ?? 'ไม่ระบุโซน'})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                      วันที่จัดส่ง (Delivery Date) *
                    </label>
                    <input
                      type="date"
                      required
                      value={deliveryDate}
                      onChange={(e) => setDeliveryDate(e.target.value)}
                      className="mt-1 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    />
                  </div>
                </div>

                {/* ข้อมูลสรุปลูกค้าที่เลือก */}
                {selectedCustomer && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 text-xs dark:border-slate-800 dark:bg-slate-800/40">
                    <div className="flex flex-wrap items-center justify-between gap-1">
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        ที่อยู่: {selectedCustomer.address || '-'}
                      </span>
                      <span className="text-slate-500 dark:text-slate-400">
                        โซน: {selectedCustomer.zone || '-'} · โทร: {selectedCustomer.phone || '-'}
                      </span>
                    </div>
                  </div>
                )}

                {/* แสดงราคาต่อหน่วยจากทะเบียนลูกค้าและช่องกรอกจำนวน 4 SKU */}
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-800/40">
                  <p className="mb-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
                    จำนวนสั่งซื้อ 4 SKU (ราคาคำนวณตามทะเบียนลูกค้าอัตโนมัติ)
                  </p>
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                    <StepperInput
                      label="ถัง 18.9L"
                      sublabel={`ราคา ${formatBaht(activePrices['FG-189L'], true)}/ถัง`}
                      value={Math.max(0, parseInt(qty189) || 0)}
                      onChange={(v) => setQty189(String(v))}
                      unit="ถัง"
                    />
                    <StepperInput
                      label="แพ็ค 350ml"
                      sublabel={`ราคา ${formatBaht(activePrices['FG-350ML'], true)}/แพ็ค`}
                      value={Math.max(0, parseInt(qty350) || 0)}
                      onChange={(v) => setQty350(String(v))}
                      unit="แพ็ค"
                    />
                    <StepperInput
                      label="แพ็ค 600ml"
                      sublabel={`ราคา ${formatBaht(activePrices['FG-600ML'], true)}/แพ็ค`}
                      value={Math.max(0, parseInt(qty600) || 0)}
                      onChange={(v) => setQty600(String(v))}
                      unit="แพ็ค"
                    />
                    <StepperInput
                      label="แพ็ค 1500ml"
                      sublabel={`ราคา ${formatBaht(activePrices['FG-1500ML'], true)}/แพ็ค`}
                      value={Math.max(0, parseInt(qty1500) || 0)}
                      onChange={(v) => setQty1500(String(v))}
                      unit="แพ็ค"
                    />
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-slate-200/80 pt-2 dark:border-slate-700">
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
                      ยอดรวมสุทธิ (คำนวณอัตโนมัติ):
                    </span>
                    <span className="font-mono text-lg font-bold text-brand-700 dark:text-brand-400">
                      {formatBaht(liveTotalSat, true)}
                    </span>
                  </div>
                </div>

                {/* ข้อมูลเพิ่มเติม (หมายเหตุจัดส่ง) */}
                <CollapsibleSection title="ข้อมูลเพิ่มเติม (หมายเหตุจัดส่ง)">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    หมายเหตุจัดส่ง
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="ระบุเวลาส่ง หรือจุดวางถังน้ำ…"
                    className="mt-1 h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </CollapsibleSection>

                {/* Sticky Action Footer */}
                <div className="sticky bottom-0 -mx-4 -mb-4 mt-6 flex items-center justify-end gap-3 border-t border-slate-200 bg-white/95 px-4 py-3.5 shadow-lg backdrop-blur sm:-mx-6 sm:-mb-6 sm:px-6 dark:border-slate-800 dark:bg-slate-900/95">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="min-h-[44px] rounded-xl border border-slate-300 px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="min-h-[44px] rounded-xl bg-brand-700 px-6 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-brand-600 disabled:opacity-50 dark:bg-brand-600 dark:hover:bg-brand-500"
                  >
                    {saving
                      ? 'กำลังบันทึก…'
                      : editingOrder
                        ? 'บันทึกการแก้ไข'
                        : 'บันทึกใบสั่งซื้อ'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Modal ยืนยันการยกเลิกออเดอร์ */}
      {cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:border dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-base font-semibold text-slate-800 dark:text-slate-100">
              ยืนยันการยกเลิกออเดอร์ [{cancelTarget.code}]
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              ลูกค้า: {cancelTarget.customerName} · วันส่ง {cancelTarget.deliveryDate}
            </p>
            <div className="mt-3">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                เหตุผลที่ยกเลิก
              </label>
              <input
                type="text"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="เช่น ลูกค้าแจ้งเลื่อนวันส่ง"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCancelTarget(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                ปิด
              </button>
              <button
                type="button"
                onClick={() =>
                  cancelMutation.mutate({
                    id: cancelTarget.id,
                    reason: cancelReason,
                  })
                }
                className="rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700"
              >
                ยืนยันยกเลิกออเดอร์
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
