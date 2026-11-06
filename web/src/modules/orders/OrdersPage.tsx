import { type FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../../api/client';
import { useAuthSession } from '../../lib/auth';
import { findModule } from '../../lib/modules';
import { formatBaht } from '../../lib/money';
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
    className: 'bg-slate-100 text-slate-700',
  },
  confirmed: {
    label: 'ยืนยันแล้ว',
    className: 'bg-blue-50 text-blue-700',
  },
  delivered: {
    label: 'จัดส่งสำเร็จแล้ว',
    className: 'bg-emerald-50 text-emerald-700',
  },
  cancelled: {
    label: 'ยกเลิก',
    className: 'bg-red-50 text-red-700',
  },
};

export const PAYMENT_STATUS_BADGE: Record<
  PaymentStatus,
  { label: string; className: string }
> = {
  paid: { label: 'ชำระครบแล้ว', className: 'bg-emerald-50 text-emerald-700' },
  partial: { label: 'ชำระบางส่วน', className: 'bg-amber-50 text-amber-800' },
  unpaid: { label: 'ค้างชำระ', className: 'bg-slate-100 text-slate-600' },
};

const TODAY_ISO = new Date().toISOString().slice(0, 10);

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

  // Modal สร้าง/แก้ไขออเดอร์
  const [modalOpen, setModalOpen] = useState(false);
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
      setBannerMsg({ type: 'ok', text: 'ยืนยันออเดอร์สำเร็จ' });
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
      setBannerMsg({ type: 'ok', text: 'ยกเลิกออเดอร์สำเร็จ' });
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

  async function handleSaveOrder(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);

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
        setBannerMsg({ type: 'ok', text: `แก้ไขออเดอร์ [${editingOrder.code}] สำเร็จ` });
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
          setBannerMsg({
            type: 'ok',
            text: `สร้างออเดอร์ [${res.data.code}] สำเร็จ — ลูกค้าถูกเพิ่มเข้าใบเส้นทางวันที่ ${deliveryDate} อัตโนมัติ`,
          });
        }
      }

      setModalOpen(false);
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['orders-route-sheet'] });
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'บันทึกออเดอร์ไม่สำเร็จ');
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
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold text-slate-800">{moduleMeta.label}</h1>
          <p className="text-sm text-slate-600">{moduleMeta.description}</p>
        </div>
        <span className="rounded-full bg-slate-200 px-3 py-1 font-mono text-xs text-slate-600">
          {moduleMeta.code} · SRS §{moduleMeta.srsSection}
        </span>
      </header>

      {bannerMsg && (
        <div
          className={`rounded-xl border p-3 text-sm ${
            bannerMsg.type === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : bannerMsg.type === 'warn'
                ? 'border-amber-200 bg-amber-50 text-amber-900'
                : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {bannerMsg.text}
        </div>
      )}

      <div className="flex gap-2 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTab('orders')}
          className={`border-b-2 px-4 py-2 text-sm font-medium ${
            activeTab === 'orders'
              ? 'border-brand-700 text-brand-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          รายการใบสั่งซื้อ ({pagination?.total ?? 0})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('route-sheet')}
          className={`border-b-2 px-4 py-2 text-sm font-medium ${
            activeTab === 'route-sheet'
              ? 'border-brand-700 text-brand-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          ใบเส้นทางส่งของรายวัน (Route Sheet · ORD-6)
        </button>
      </div>

      {activeTab === 'orders' && (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
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
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm sm:col-span-2"
              />
              <input
                type="text"
                value={zoneFilter}
                onChange={(e) => {
                  setZoneFilter(e.target.value);
                  setPage(1);
                }}
                placeholder="กรองตามโซน…"
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              />
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPage(1);
                }}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
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
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
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
                  className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
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
                  className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {canExport && (
                <button
                  type="button"
                  disabled={exporting}
                  onClick={handleExportExcel}
                  className="rounded-lg border border-emerald-600 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                >
                  {exporting ? 'กำลังส่งออก…' : 'Export Excel (.xlsx)'}
                </button>
              )}
              {canWrite && (
                <button
                  type="button"
                  onClick={openCreateModal}
                  className="rounded-lg bg-brand-700 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-600"
                >
                  + สร้างออเดอร์ใหม่
                </button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-600">
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
              <tbody className="divide-y divide-slate-100">
                {orders.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-3 py-8 text-center text-sm text-slate-400">
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
                      <tr key={ord.id} className="hover:bg-slate-50">
                        <td className="whitespace-nowrap px-3 py-2 font-mono text-xs font-semibold text-brand-700">
                          {ord.code}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-slate-700">
                          {ord.deliveryDate}
                        </td>
                        <td className="px-3 py-2">
                          <p className="font-medium text-slate-800">{ord.customerName}</p>
                          <p className="text-xs text-slate-400">
                            {ord.customerCode} · {ord.zone ?? '-'}
                          </p>
                        </td>
                        <td className="px-3 py-2 text-center font-mono text-xs font-semibold text-slate-700">
                          {ord.quantities['FG-189L'] || '-'}
                        </td>
                        <td className="px-3 py-2 text-center font-mono text-xs text-slate-600">
                          {ord.quantities['FG-350ML'] || '-'}
                        </td>
                        <td className="px-3 py-2 text-center font-mono text-xs text-slate-600">
                          {ord.quantities['FG-600ML'] || '-'}
                        </td>
                        <td className="px-3 py-2 text-center font-mono text-xs text-slate-600">
                          {ord.quantities['FG-1500ML'] || '-'}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right font-mono text-sm font-bold text-slate-800">
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
                            {ord.status === 'draft' && (
                              <button
                                type="button"
                                onClick={() => confirmMutation.mutate(ord.id)}
                                className="rounded border border-blue-200 bg-blue-50 px-2 py-1 font-medium text-blue-700 hover:bg-blue-100"
                              >
                                ยืนยัน
                              </button>
                            )}
                            {isEditable && (
                              <button
                                type="button"
                                onClick={() => openEditModal(ord)}
                                className="rounded border border-slate-200 px-2 py-1 text-slate-700 hover:bg-slate-100"
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
                                className="rounded border border-red-200 bg-red-50 px-2 py-1 text-red-700 hover:bg-red-100"
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
            <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-600">
              <span>
                หน้า {pagination.page} จาก {pagination.totalPages} (รวมทั้งหมด {pagination.total}{' '}
                รายการ)
              </span>
              <div className="space-x-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded border border-slate-200 px-3 py-1 disabled:opacity-40"
                >
                  ก่อนหน้า
                </button>
                <button
                  type="button"
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded border border-slate-200 px-3 py-1 disabled:opacity-40"
                >
                  ถัดไป
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'route-sheet' && (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs font-medium text-slate-700">วันที่ส่งของ:</label>
              <input
                type="date"
                value={routeDate}
                onChange={(e) => setRouteDate(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              />
              <input
                type="text"
                value={routeZone}
                onChange={(e) => setRouteZone(e.target.value)}
                placeholder="กรองโซนสายส่ง…"
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
              />
            </div>

            {routeSheet && (
              <div className="flex flex-wrap gap-3 text-xs">
                <span className="rounded-lg bg-slate-100 px-3 py-1.5 font-medium text-slate-700">
                  จุดจอดรวม: <strong>{routeSheet.totalStops}</strong> ร้าน ({routeSheet.totalOrders}{' '}
                  ออเดอร์)
                </span>
                <span className="rounded-lg bg-brand-700/10 px-3 py-1.5 font-mono font-semibold text-brand-700">
                  18.9L: {routeSheet.quantities['FG-189L']} ถัง · 350ml:{' '}
                  {routeSheet.quantities['FG-350ML']} · 600ml: {routeSheet.quantities['FG-600ML']} ·
                  1500ml: {routeSheet.quantities['FG-1500ML']}
                </span>
                <span className="rounded-lg bg-emerald-50 px-3 py-1.5 font-mono font-bold text-emerald-800">
                  ยอดรวมสายส่ง: {formatBaht(routeSheet.totalSat, true)}
                </span>
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-600">
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
              <tbody className="divide-y divide-slate-100">
                {(routeSheet?.stops ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-3 py-8 text-center text-sm text-slate-400">
                      ไม่มีรายการต้องจัดส่งในวันที่ {routeDate}
                    </td>
                  </tr>
                ) : (
                  (routeSheet?.stops ?? []).map((stop, idx) => (
                    <tr key={stop.customerId} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-mono text-xs text-slate-500">{idx + 1}</td>
                      <td className="px-3 py-2 font-mono text-xs font-semibold text-brand-700">
                        {stop.customerCode}
                      </td>
                      <td className="px-3 py-2">
                        <p className="font-medium text-slate-800">{stop.customerName}</p>
                        <p className="text-xs text-slate-500">{stop.address ?? '-'}</p>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-600">{stop.zone ?? '-'}</td>
                      <td className="px-3 py-2 text-center font-mono font-semibold text-slate-800">
                        {stop.quantities['FG-189L']}
                      </td>
                      <td className="px-3 py-2 text-center font-mono text-slate-600">
                        {stop.quantities['FG-350ML']}
                      </td>
                      <td className="px-3 py-2 text-center font-mono text-slate-600">
                        {stop.quantities['FG-600ML']}
                      </td>
                      <td className="px-3 py-2 text-center font-mono text-slate-600">
                        {stop.quantities['FG-1500ML']}
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-bold text-emerald-700">
                        {formatBaht(stop.totalSat, true)}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-500">
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

      {/* Modal สร้าง/แก้ไขออเดอร์ (ราคาอ่านอย่างเดียวจากทะเบียนลูกค้า + คำนวณยอดสด) */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-base font-semibold text-slate-800">
              {editingOrder
                ? `แก้ไขออเดอร์ [${editingOrder.code}]`
                : 'สร้างใบสั่งซื้อใหม่ (ราคาอ้างอิงจากทะเบียนลูกค้าเสมอ · PRC-2)'}
            </h2>

            <form onSubmit={handleSaveOrder} className="mt-4 space-y-4 text-sm">
              {formError && (
                <div className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{formError}</div>
              )}

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700">เลือกลูกค้า *</label>
                  <select
                    required
                    value={selectedCustomerId}
                    onChange={(e) => setSelectedCustomerId(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
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
                  <label className="block text-xs font-medium text-slate-700">
                    วันที่จัดส่ง (Delivery Date) *
                  </label>
                  <input
                    type="date"
                    required
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono"
                  />
                </div>
              </div>

              {/* แสดงราคาต่อหน่วยจากทะเบียนลูกค้าแบบอ่านอย่างเดียว (Read-only) */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold text-slate-700">
                  ราคาต่อหน่วยตามทะเบียนลูกค้า (อ่านอย่างเดียว — แก้ราคาได้ที่หน้าทะเบียนลูกค้า)
                </p>
                <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div>
                    <label className="block text-xs text-slate-600">
                      ถัง 18.9L ({formatBaht(activePrices['FG-189L'], true)}/ถัง)
                    </label>
                    <input
                      type="number"
                      min="0"
                      required
                      value={qty189}
                      onChange={(e) => setQty189(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600">
                      แพ็ค 350ml ({formatBaht(activePrices['FG-350ML'], true)}/แพ็ค)
                    </label>
                    <input
                      type="number"
                      min="0"
                      required
                      value={qty350}
                      onChange={(e) => setQty350(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600">
                      แพ็ค 600ml ({formatBaht(activePrices['FG-600ML'], true)}/แพ็ค)
                    </label>
                    <input
                      type="number"
                      min="0"
                      required
                      value={qty600}
                      onChange={(e) => setQty600(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600">
                      แพ็ค 1500ml ({formatBaht(activePrices['FG-1500ML'], true)}/แพ็ค)
                    </label>
                    <input
                      type="number"
                      min="0"
                      required
                      value={qty1500}
                      onChange={(e) => setQty1500(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-mono"
                    />
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-2">
                  <span className="text-xs font-medium text-slate-600">
                    ยอดรวมสุทธิ (คำนวณอัตโนมัติ):
                  </span>
                  <span className="font-mono text-lg font-bold text-brand-700">
                    {formatBaht(liveTotalSat, true)}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">หมายเหตุจัดส่ง</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="ระบุเวลาส่ง หรือจุดวางถังน้ำ…"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-brand-700 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-600"
                >
                  บันทึกใบสั่งซื้อ
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal ยืนยันการยกเลิกออเดอร์ */}
      {cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h2 className="text-base font-semibold text-slate-800">
              ยืนยันการยกเลิกออเดอร์ [{cancelTarget.code}]
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              ลูกค้า: {cancelTarget.customerName} · วันส่ง {cancelTarget.deliveryDate}
            </p>
            <div className="mt-3">
              <label className="block text-xs font-medium text-slate-700">เหตุผลที่ยกเลิก</label>
              <input
                type="text"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="เช่น ลูกค้าแจ้งเลื่อนวันส่ง"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCancelTarget(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600"
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
