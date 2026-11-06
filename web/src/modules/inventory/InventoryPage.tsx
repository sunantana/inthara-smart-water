import { type FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '../../api/client';
import { useAuthSession } from '../../lib/auth';
import { findModule } from '../../lib/modules';
import { bahtToSatang, formatBaht, satangToBaht } from '../../lib/money';

const moduleMeta = findModule('INV');

export interface InventoryItemRecord {
  sku: string;
  name: string;
  category:
    | 'finished_goods'
    | 'empty_bottle'
    | 'raw_material'
    | 'spare_part'
    | 'packaging';
  unit: string;
  stock: number;
  minStock: number;
  unitCostSat: number;
  unitPriceSat: number;
  belowMin: boolean;
  updatedAt: string;
}

export interface StockMovementRecord {
  id: number;
  sku: string;
  itemName: string;
  unit: string;
  qtyChange: number;
  reason: string;
  refType: string | null;
  refId: string | null;
  note: string | null;
  lotNo: string | null;
  performedByName: string | null;
  createdAt: string;
}

const CATEGORY_LABELS: Record<InventoryItemRecord['category'], string> = {
  finished_goods: 'สินค้าสำเร็จรูป (FG)',
  empty_bottle: 'ถังเปล่าหมุนเวียน',
  raw_material: 'วัตถุดิบ',
  packaging: 'บรรจุภัณฑ์',
  spare_part: 'อะไหล่ซ่อมบำรุง',
};

const REASON_LABELS: Record<string, string> = {
  production_in: 'รับเข้าจากฝ่ายผลิต',
  order_out: 'ตัดจ่ายส่งลูกค้า (Check-in)',
  checkin_return: 'รับคืนถังเปล่าจากลูกค้า',
  packaging_in: 'รับเข้าบรรจุภัณฑ์',
  maintenance_use: 'เบิกอะไหล่ซ่อมบำรุง',
  adjustment: 'ปรับปรุงสต็อก (ตรวจนับจริง)',
  backup_restore: 'กู้คืนข้อมูลสำรอง',
};

export default function InventoryPage() {
  const queryClient = useQueryClient();
  const { user } = useAuthSession();
  const canEdit = user?.role === 'admin' || user?.role === 'manager';

  const [activeTab, setActiveTab] = useState<'items' | 'movements'>('items');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [lowStockOnly, setLowStockOnly] = useState<boolean>(false);

  // Movement filters
  const [movSkuFilter, setMovSkuFilter] = useState<string>('');
  const [movReasonFilter, setMovReasonFilter] = useState<string>('');
  const [movDateFrom, setMovDateFrom] = useState<string>('');
  const [movDateTo, setMovDateTo] = useState<string>('');

  // Adjust Modal
  const [adjustingItem, setAdjustingItem] = useState<InventoryItemRecord | null>(null);
  const [newStockInput, setNewStockInput] = useState<string>('0');
  const [adjustReasonInput, setAdjustReasonInput] = useState<string>('ตรวจนับสต็อกจริงประจำวัน');
  const [adjustError, setAdjustError] = useState<string>('');

  // Edit Item Modal (min_stock / cost / price)
  const [editingItem, setEditingItem] = useState<InventoryItemRecord | null>(null);
  const [editMinStock, setEditMinStock] = useState<string>('0');
  const [editCostBaht, setEditCostBaht] = useState<string>('0');
  const [editPriceBaht, setEditPriceBaht] = useState<string>('0');
  const [editError, setEditError] = useState<string>('');

  const itemsQuery = useQuery({
    queryKey: ['inventory-items', categoryFilter, lowStockOnly],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (categoryFilter) qs.set('category', categoryFilter);
      if (lowStockOnly) qs.set('lowStockOnly', 'true');
      return api.get<{
        items: InventoryItemRecord[];
        summary: { totalSkus: number; lowStockCount: number };
      }>(`/inventory/items?${qs.toString()}`);
    },
  });

  const movementsQuery = useQuery({
    queryKey: [
      'inventory-movements',
      movSkuFilter,
      movReasonFilter,
      movDateFrom,
      movDateTo,
    ],
    enabled: activeTab === 'movements',
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (movSkuFilter) qs.set('sku', movSkuFilter);
      if (movReasonFilter) qs.set('reason', movReasonFilter);
      if (movDateFrom) qs.set('dateFrom', movDateFrom);
      if (movDateTo) qs.set('dateTo', movDateTo);
      qs.set('limit', '100');
      const res = await api.get<{ items: StockMovementRecord[] }>(
        `/inventory/movements?${qs.toString()}`,
      );
      return res.items ?? [];
    },
  });

  const adjustMutation = useMutation({
    mutationFn: async () => {
      if (!adjustingItem) throw new Error('ไม่ได้เลือกรายการสินค้า');
      const parsedStock = Math.trunc(Number(newStockInput));
      if (!Number.isFinite(parsedStock) || parsedStock < 0) {
        throw new Error('จำนวนสต็อกใหม่ต้องเป็นจำนวนเต็มไม่ติดลบ');
      }
      return api.post('/inventory/adjust', {
        sku: adjustingItem.sku,
        newStock: parsedStock,
        reason: adjustReasonInput.trim() || 'adjustment',
      });
    },
    onSuccess: () => {
      setAdjustingItem(null);
      setAdjustError('');
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-movements'] });
    },
    onError: (err) => {
      setAdjustError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : 'ไม่สามารถปรับสต็อกได้',
      );
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: async () => {
      if (!editingItem) throw new Error('ไม่ได้เลือกรายการสินค้า');
      const parsedMin = Math.max(0, Math.trunc(Number(editMinStock) || 0));
      const unitCostSat = bahtToSatang(editCostBaht || '0');
      const unitPriceSat = bahtToSatang(editPriceBaht || '0');
      return api.put(`/inventory/items/${editingItem.sku}`, {
        minStock: parsedMin,
        unitCostSat,
        unitPriceSat,
      });
    },
    onSuccess: () => {
      setEditingItem(null);
      setEditError('');
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
    },
    onError: (err) => {
      setEditError(
        err instanceof ApiError || err instanceof Error
          ? err.message
          : 'ไม่สามารถบันทึกการตั้งค่าสินค้าได้',
      );
    },
  });

  const items = itemsQuery.data?.items ?? [];
  const lowStockCount = items.filter((i) => i.belowMin).length;
  const fg189Stock = items.find((i) => i.sku === 'FG-189L')?.stock ?? 0;
  const empty189Stock = items.find((i) => i.sku === 'RET-189L-EMPTY')?.stock ?? 0;

  function openAdjustModal(item: InventoryItemRecord) {
    setAdjustingItem(item);
    setNewStockInput(String(item.stock));
    setAdjustReasonInput('ตรวจนับสต็อกจริงประจำวัน');
    setAdjustError('');
  }

  function openEditModal(item: InventoryItemRecord) {
    setEditingItem(item);
    setEditMinStock(String(item.minStock));
    setEditCostBaht(String(satangToBaht(item.unitCostSat)));
    setEditPriceBaht(String(satangToBaht(item.unitPriceSat)));
    setEditError('');
  }

  function handleAdjustSubmit(e: FormEvent) {
    e.preventDefault();
    setAdjustError('');
    adjustMutation.mutate();
  }

  function handleEditSubmit(e: FormEvent) {
    e.preventDefault();
    setEditError('');
    updateItemMutation.mutate();
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
            <h1 className="text-2xl font-bold text-slate-800">
              {moduleMeta.label}
            </h1>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            ติดตามยอดคงเหลือสินค้าสำเร็จรูป (FG) ถังเปล่าหมุนเวียน การแจ้งเตือนจุดสั่งผลิตขั้นต่ำ และประวัติการเคลื่อนไหวสต็อกทุกประเภท
          </p>
        </div>

        <div className="flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
          <button
            type="button"
            onClick={() => setActiveTab('items')}
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${
              activeTab === 'items'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            สต็อกคงเหลือ ({items.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('movements')}
            className={`rounded-md px-4 py-2 text-sm font-medium transition ${
              activeTab === 'movements'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            ประวัติความเคลื่อนไหวสต็อก
          </button>
        </div>
      </header>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-medium text-slate-500">รายการ SKU ในคลัง</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{items.length} รายการ</p>
        </div>
        <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-4 shadow-sm">
          <p className="text-xs font-medium text-sky-800">น้ำดื่มถัง 18.9L พร้อมส่ง (FG-189L)</p>
          <p className="mt-1 text-2xl font-bold text-sky-950">{fg189Stock} ถัง</p>
        </div>
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4 shadow-sm">
          <p className="text-xs font-medium text-indigo-800">
            ถังเปล่า 18.9L ในโรงงาน (RET-189L-EMPTY)
          </p>
          <p className="mt-1 text-2xl font-bold text-indigo-950">{empty189Stock} ถัง</p>
        </div>
        <div
          className={`rounded-xl border p-4 shadow-sm ${
            lowStockCount > 0
              ? 'border-rose-300 bg-rose-50'
              : 'border-emerald-200 bg-emerald-50/60'
          }`}
        >
          <p
            className={`text-xs font-medium ${
              lowStockCount > 0 ? 'text-rose-800' : 'text-emerald-800'
            }`}
          >
            รายการต่ำกว่าเกณฑ์ขั้นต่ำ (belowMin)
          </p>
          <p
            className={`mt-1 text-2xl font-bold ${
              lowStockCount > 0 ? 'text-rose-700' : 'text-emerald-900'
            }`}
          >
            {lowStockCount} รายการ
          </p>
        </div>
      </div>

      {activeTab === 'items' ? (
        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          {/* Filters */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">ทุกหมวดหมู่สินค้า</option>
                <option value="finished_goods">สินค้าสำเร็จรูป (FG)</option>
                <option value="empty_bottle">ถังเปล่าหมุนเวียน</option>
                <option value="raw_material">วัตถุดิบ</option>
                <option value="packaging">บรรจุภัณฑ์</option>
                <option value="spare_part">อะไหล่ซ่อมบำรุง</option>
              </select>

              <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={lowStockOnly}
                  onChange={(e) => setLowStockOnly(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500"
                />
                <span>แสดงเฉพาะที่ต่ำกว่าเกณฑ์ขั้นต่ำ (แดง)</span>
              </label>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="px-3 py-2.5">รหัส SKU</th>
                  <th className="px-3 py-2.5">ชื่อรายการสินค้า</th>
                  <th className="px-3 py-2.5">หมวดหมู่</th>
                  <th className="px-3 py-2.5 text-right">คงเหลือ</th>
                  <th className="px-3 py-2.5 text-right">เกณฑ์ขั้นต่ำ (Min)</th>
                  <th className="px-3 py-2.5 text-center">สถานะสต็อก</th>
                  <th className="px-3 py-2.5 text-right">ต้นทุน/หน่วย</th>
                  {canEdit && <th className="px-3 py-2.5 text-right">จัดการสต็อก</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={canEdit ? 8 : 7} className="py-8 text-center text-slate-500">
                      ไม่พบรายการสินค้าในคลังตามตัวกรองที่เลือก
                    </td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr
                      key={item.sku}
                      className={
                        item.belowMin ? 'bg-rose-50/50 hover:bg-rose-50' : 'hover:bg-slate-50'
                      }
                    >
                      <td className="px-3 py-3 font-mono text-xs font-bold text-sky-700">
                        {item.sku}
                      </td>
                      <td className="px-3 py-3 font-semibold text-slate-900">
                        {item.name}
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-600">
                        {CATEGORY_LABELS[item.category] ?? item.category}
                      </td>
                      <td
                        className={`px-3 py-3 text-right text-base font-bold ${
                          item.belowMin ? 'text-rose-700' : 'text-slate-900'
                        }`}
                      >
                        {item.stock.toLocaleString()} {item.unit}
                      </td>
                      <td className="px-3 py-3 text-right text-xs text-slate-600">
                        {item.minStock.toLocaleString()} {item.unit}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {item.belowMin ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-bold text-rose-800">
                            ต่ำกว่าเกณฑ์ขั้นต่ำ!
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                            ปกติ
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right text-xs text-slate-600">
                        {formatBaht(item.unitCostSat)}
                      </td>
                      {canEdit && (
                        <td className="px-3 py-3 text-right">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openAdjustModal(item)}
                              className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700"
                            >
                              ปรับสต็อก
                            </button>
                            <button
                              type="button"
                              onClick={() => openEditModal(item)}
                              className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                            >
                              ตั้งค่าเกณฑ์
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        /* แท็บประวัติความเคลื่อนไหวสต็อก */
        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                กรองรหัส SKU
              </label>
              <select
                value={movSkuFilter}
                onChange={(e) => setMovSkuFilter(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">ทุก SKU</option>
                {items.map((it) => (
                  <option key={it.sku} value={it.sku}>
                    {it.sku} — {it.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                ประเภทความเคลื่อนไหว
              </label>
              <select
                value={movReasonFilter}
                onChange={(e) => setMovReasonFilter(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">ทุกสาเหตุ</option>
                <option value="order_out">ตัดจ่ายส่งลูกค้า (order_out)</option>
                <option value="checkin_return">รับคืนถังเปล่า (checkin_return)</option>
                <option value="adjustment">ปรับปรุงสต็อก (adjustment)</option>
                <option value="production_in">รับเข้าจากผลิต (production_in)</option>
                <option value="packaging_in">รับเข้าบรรจุภัณฑ์ (packaging_in)</option>
                <option value="maintenance_use">เบิกซ่อมบำรุง (maintenance_use)</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                ตั้งแต่วันที่
              </label>
              <input
                type="date"
                value={movDateFrom}
                onChange={(e) => setMovDateFrom(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">
                ถึงวันที่
              </label>
              <input
                type="date"
                value={movDateTo}
                onChange={(e) => setMovDateTo(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="px-3 py-2.5">เวลา</th>
                  <th className="px-3 py-2.5">SKU</th>
                  <th className="px-3 py-2.5">ชื่อสินค้า</th>
                  <th className="px-3 py-2.5 text-right">จำนวนที่เปลี่ยน</th>
                  <th className="px-3 py-2.5">สาเหตุ (Reason)</th>
                  <th className="px-3 py-2.5">อ้างอิง / หมายเหตุ</th>
                  <th className="px-3 py-2.5">ผู้ทำรายการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(movementsQuery.data ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">
                      ยังไม่มีประวัติความเคลื่อนไหวสต็อกตามตัวกรอง
                    </td>
                  </tr>
                ) : (
                  (movementsQuery.data ?? []).map((mov) => (
                    <tr key={mov.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2.5 text-xs text-slate-600">
                        {mov.createdAt}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs font-bold text-sky-700">
                        {mov.sku}
                      </td>
                      <td className="px-3 py-2.5 text-slate-800">{mov.itemName}</td>
                      <td
                        className={`px-3 py-2.5 text-right font-bold ${
                          mov.qtyChange > 0
                            ? 'text-emerald-700'
                            : mov.qtyChange < 0
                              ? 'text-rose-700'
                              : 'text-slate-600'
                        }`}
                      >
                        {mov.qtyChange > 0 ? `+${mov.qtyChange}` : mov.qtyChange} {mov.unit}
                      </td>
                      <td className="px-3 py-2.5 text-xs font-medium text-slate-700">
                        {REASON_LABELS[mov.reason] ?? mov.reason}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-600">
                        {mov.refType && mov.refId ? `${mov.refType}: ${mov.refId}` : '-'}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-600">
                        {mov.performedByName ?? '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Modal ปรับสต็อก (POST /api/inventory/adjust) */}
      {adjustingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">
              ปรับปรุงยอดสต็อกคงเหลือ ({adjustingItem.sku})
            </h3>
            <p className="mt-1 text-xs text-slate-600">
              {adjustingItem.name} — ยอดเดิมในระบบ:{' '}
              <span className="font-bold">
                {adjustingItem.stock} {adjustingItem.unit}
              </span>
            </p>

            <form onSubmit={handleAdjustSubmit} className="mt-4 space-y-4">
              {adjustError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                  {adjustError}
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  ยอดสต็อกใหม่ที่ตรวจนับได้จริง ({adjustingItem.unit})
                </label>
                <input
                  type="number"
                  min={0}
                  required
                  value={newStockInput}
                  onChange={(e) => setNewStockInput(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base font-bold text-slate-900 focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  สาเหตุการปรับสต็อก
                </label>
                <input
                  type="text"
                  required
                  value={adjustReasonInput}
                  onChange={(e) => setAdjustReasonInput(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setAdjustingItem(null)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={adjustMutation.isPending}
                  className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-bold text-white hover:bg-sky-700 disabled:opacity-50"
                >
                  {adjustMutation.isPending ? 'กำลังบันทึก...' : 'ยืนยันปรับสต็อก'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal ตั้งค่าเกณฑ์ขั้นต่ำ / ต้นทุน (PUT /api/inventory/items/:sku) */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">
              ตั้งค่าเกณฑ์ขั้นต่ำ & ต้นทุน ({editingItem.sku})
            </h3>
            <p className="mt-1 text-xs text-slate-600">{editingItem.name}</p>

            <form onSubmit={handleEditSubmit} className="mt-4 space-y-4">
              {editError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                  {editError}
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">
                  เกณฑ์สต็อกขั้นต่ำ (min_stock — แจ้งเตือนสีแดงเมื่อต่ำกว่าค่านี้)
                </label>
                <input
                  type="number"
                  min={0}
                  required
                  value={editMinStock}
                  onChange={(e) => setEditMinStock(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    ต้นทุนต่อหน่วย (บาท)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editCostBaht}
                    onChange={(e) => setEditCostBaht(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">
                    ราคาอ้างอิงต่อหน่วย (บาท)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editPriceBaht}
                    onChange={(e) => setEditPriceBaht(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={updateItemMutation.isPending}
                  className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-bold text-white hover:bg-sky-700 disabled:opacity-50"
                >
                  {updateItemMutation.isPending ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
