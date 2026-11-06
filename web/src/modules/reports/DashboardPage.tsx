import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, type HealthResponse } from '../../api/client';
import { useAuthSession } from '../../lib/auth';
import { findModule } from '../../lib/modules';
import type { AuditLogItem } from '../auth/UsersPage';

const module = findModule('RPT');

interface AuditLogsResponse {
  data: AuditLogItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface DashboardAlerts {
  debtAging: {
    totalOverdueCustomers: number;
    count30Plus: number;
    count60Plus: number;
    count90Plus: number;
    totalOverdueDebtSat: number;
    totalOverdueDebtBaht: number;
  };
  lowStock: {
    totalItems: number;
    items: Array<{
      sku: string;
      name: string;
      category: string;
      stock: number;
      minStock: number;
      unit: string;
      deficit: number;
    }>;
  };
  duePm: {
    totalMachines: number;
    machines: Array<{
      code: string;
      name: string;
      runHours: number;
      pmIntervalHours: number;
      status: string;
    }>;
  };
  licenseExpiring: {
    totalEmployees: number;
    employees: Array<{
      id: number;
      name: string;
      role: string;
      drivingLicenseExpiry: string;
      daysRemaining: number;
    }>;
  };
}

interface DashboardSalesSummary {
  todaySalesSat: number;
  todaySalesBaht: number;
  todayOrdersCount: number;
  monthSalesSat: number;
  monthSalesBaht: number;
  monthOrdersCount: number;
  pendingOrdersCount: number;
  portalDraftOrdersCount: number;
}

interface TrendMonthItem {
  month: string;
  ordersCount: number;
  total189L: number;
  totalPacks: number;
  totalSat: number;
  totalBaht: number;
}

interface DashboardResponse {
  asOfDate: string;
  sales: DashboardSalesSummary;
  alerts: DashboardAlerts;
  sales12MonthsTrend: TrendMonthItem[];
}

interface SalesReportItem {
  period: string;
  ordersCount: number;
  total189L: number;
  totalPacks: number;
  revenueSat: number;
  revenueBaht: number;
}

interface SalesReportResponse {
  groupBy: 'day' | 'month';
  periodCount: number;
  totals: {
    orders: number;
    volume189L: number;
    volumePacks: number;
    revenueSat: number;
    revenueBaht: number;
  };
  items: SalesReportItem[];
}

export default function DashboardPage() {
  const { user } = useAuthSession();
  const canViewAudit = user?.role === 'admin' || user?.role === 'manager';

  const [activeTab, setActiveTab] = useState<'overview' | 'sales-report' | 'system-health'>('overview');

  // Sales report filter state
  const [salesDateFrom, setSalesDateFrom] = useState('');
  const [salesDateTo, setSalesDateTo] = useState('');
  const [salesZone, setSalesZone] = useState('');
  const [salesGroupBy, setSalesGroupBy] = useState<'day' | 'month'>('day');
  const [exportLoading, setExportLoading] = useState(false);

  // Health and Audit states
  const [filterUsername, setFilterUsername] = useState('');
  const [filterAction, setFilterAction] = useState('');

  // 1) Dashboard Query
  const dashboardQuery = useQuery({
    queryKey: ['dashboard-summary'],
    queryFn: () => api.get<DashboardResponse>('/reports/dashboard'),
    refetchInterval: 60_000,
  });

  // 2) Sales Report Query
  const salesReportQuery = useQuery({
    queryKey: ['sales-report', salesDateFrom, salesDateTo, salesZone, salesGroupBy],
    enabled: activeTab === 'sales-report',
    queryFn: () => {
      const params = new URLSearchParams({ groupBy: salesGroupBy });
      if (salesDateFrom) params.set('dateFrom', salesDateFrom);
      if (salesDateTo) params.set('dateTo', salesDateTo);
      if (salesZone.trim()) params.set('zone', salesZone.trim());
      return api.get<SalesReportResponse>(`/reports/sales?${params.toString()}`);
    },
  });

  // 3) Health Query
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => api.get<HealthResponse>('/health'),
    refetchInterval: 30_000,
  });

  // 4) Audit Query
  const recentAudit = useQuery({
    queryKey: ['dashboard-audit-logs', filterUsername, filterAction],
    enabled: canViewAudit && activeTab === 'system-health',
    queryFn: () => {
      const params = new URLSearchParams({ page: '1', limit: '25' });
      if (filterUsername.trim()) params.set('username', filterUsername.trim());
      if (filterAction.trim()) params.set('action', filterAction.trim());
      return api.get<AuditLogsResponse>(`/auth/audit-logs?${params.toString()}`);
    },
  });

  async function handleExportSales() {
    setExportLoading(true);
    try {
      const params = new URLSearchParams({ groupBy: salesGroupBy });
      if (salesDateFrom) params.set('dateFrom', salesDateFrom);
      if (salesDateTo) params.set('dateTo', salesDateTo);
      if (salesZone.trim()) params.set('zone', salesZone.trim());
      await api.download(`/reports/sales/export?${params.toString()}`, 'inthara-sales-report.xlsx');
    } catch {
      alert('ส่งออกรายงาน Excel ไม่สำเร็จ');
    } finally {
      setExportLoading(false);
    }
  }

  const dash = dashboardQuery.data;

  // Render SVG Trend Chart
  function renderTrendChart(trend: TrendMonthItem[]) {
    if (!trend || trend.length === 0) {
      return <p className="text-sm text-slate-400 py-8 text-center">ยังไม่มีข้อมูลยอดขายย้อนหลัง</p>;
    }

    const chartHeight = 180;
    const barWidth = 28;
    const gap = 16;
    const maxRevenue = Math.max(...trend.map((t) => t.totalBaht), 1000);
    const totalWidth = Math.max(trend.length * (barWidth + gap) + 40, 520);

    return (
      <div className="overflow-x-auto pt-2 pb-1">
        <svg
          width={totalWidth}
          height={chartHeight + 40}
          className="mx-auto"
          aria-label="12-Month Sales Trend Chart"
        >
          {/* Baseline */}
          <line
            x1="20"
            y1={chartHeight}
            x2={totalWidth - 20}
            y2={chartHeight}
            stroke="#cbd5e1"
            strokeWidth="1"
          />

          {trend.map((item, index) => {
            const x = 30 + index * (barWidth + gap);
            const height = Math.max(4, Math.round((item.totalBaht / maxRevenue) * (chartHeight - 30)));
            const y = chartHeight - height;

            return (
              <g key={item.month} className="group cursor-pointer">
                <title>{`${item.month}: ฿${item.totalBaht.toLocaleString('th-TH')} (${item.ordersCount} ออเดอร์, ถัง 18.9L: ${item.total189L}, แพ็ค: ${item.totalPacks})`}</title>
                {/* Bar */}
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={height}
                  rx="4"
                  className="fill-sky-500 hover:fill-sky-600 transition"
                />
                {/* Value on top of bar */}
                <text
                  x={x + barWidth / 2}
                  y={Math.max(y - 6, 12)}
                  textAnchor="middle"
                  className="text-[10px] fill-slate-600 font-medium"
                >
                  {item.totalBaht >= 1000 ? `${(item.totalBaht / 1000).toFixed(1)}k` : item.totalBaht}
                </text>
                {/* Month label under baseline */}
                <text
                  x={x + barWidth / 2}
                  y={chartHeight + 18}
                  textAnchor="middle"
                  className="text-[11px] fill-slate-500"
                >
                  {item.month.slice(5)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    );
  }

  const badge = health.isPending
    ? { text: 'กำลังตรวจสอบ…', className: 'bg-slate-100 text-slate-600' }
    : health.isError
      ? { text: 'เชื่อมต่อไม่สำเร็จ', className: 'bg-red-50 text-red-700' }
      : health.data.database === 'connected'
        ? { text: 'เชื่อมต่อแล้ว', className: 'bg-emerald-50 text-emerald-700' }
        : { text: 'ฐานข้อมูลไม่พร้อม', className: 'bg-amber-50 text-amber-700' };

  return (
    <section className="space-y-6">
      {/* Top Header */}
      <header className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">📊</span>
            <h1 className="text-2xl font-bold text-slate-800">{module.label}</h1>
          </div>
          <p className="text-sm text-slate-500 mt-0.5">
            สรุปยอดขาย การแจ้งเตือนความเสี่ยงรอบด้าน และวิเคราะห์แนวโน้มธุรกิจ (RPT-1 ถึง RPT-3)
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex border border-slate-200 rounded-lg bg-white p-1 shadow-sm text-xs font-semibold">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-3 py-1.5 rounded transition ${
              activeTab === 'overview' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            แดชบอร์ดภาพรวม
          </button>
          <button
            onClick={() => setActiveTab('sales-report')}
            className={`px-3 py-1.5 rounded transition ${
              activeTab === 'sales-report' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            รายงานยอดขาย & Excel
          </button>
          <button
            onClick={() => setActiveTab('system-health')}
            className={`px-3 py-1.5 rounded transition ${
              activeTab === 'system-health' ? 'bg-sky-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            สถานะระบบ & Audit
          </button>
        </div>
      </header>

      {/* ================= TAB 1: OVERVIEW & ALERTS ================= */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {dashboardQuery.isPending ? (
            <div className="p-8 text-center text-slate-400 bg-white rounded-xl border border-slate-200">
              กำลังรวบรวมข้อมูลแดชบอร์ดและการแจ้งเตือน…
            </div>
          ) : dashboardQuery.isError ? (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              ไม่สามารถโหลดข้อมูลแดชบอร์ดได้
            </div>
          ) : dash ? (
            <>
              {/* Top 4 Metrics Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 1) Today's Sales */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <span className="text-xs font-medium text-slate-500 block">ยอดขายวันนี้ (บาท)</span>
                  <p className="text-2xl font-bold text-slate-800 mt-1">
                    ฿{dash.sales.todaySalesBaht.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    จำนวน {dash.sales.todayOrdersCount} ออเดอร์
                  </p>
                </div>

                {/* 2) Month-to-date Sales */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <span className="text-xs font-medium text-slate-500 block">ยอดขายเดือนนี้ (บาท)</span>
                  <p className="text-2xl font-bold text-sky-700 mt-1">
                    ฿{dash.sales.monthSalesBaht.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    จำนวน {dash.sales.monthOrdersCount} ออเดอร์
                  </p>
                </div>

                {/* 3) Pending Delivery Orders */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <span className="text-xs font-medium text-slate-500 block">ออเดอร์รอจัดส่ง</span>
                  <p className="text-2xl font-bold text-amber-600 mt-1">
                    {dash.sales.pendingOrdersCount}{' '}
                    <span className="text-sm font-normal text-slate-500">ออเดอร์</span>
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {dash.sales.portalDraftOrdersCount > 0 ? (
                      <span className="text-amber-700 font-semibold">
                        (มี {dash.sales.portalDraftOrdersCount} รายการสั่งจากพอร์ทัล)
                      </span>
                    ) : (
                      'ไม่มีออเดอร์ค้างจากพอร์ทัล'
                    )}
                  </p>
                </div>

                {/* 4) Total Overdue Debt */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                  <span className="text-xs font-medium text-slate-500 block">หนี้ค้างชำระทั้งหมด</span>
                  <p className="text-2xl font-bold text-rose-600 mt-1">
                    ฿{dash.alerts.debtAging.totalOverdueDebtBaht.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    จากลูกค้า {dash.alerts.debtAging.totalOverdueCustomers} ราย
                  </p>
                </div>
              </div>

              {/* 4 Actionable Alert Panels (Grid 2x2) */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Alert 1: Overdue Debt Aging */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                      <span>⚠️</span> หนี้ค้างชำระเกินกำหนด (Aging)
                    </h3>
                    <Link
                      to="/billing"
                      className="text-xs font-semibold text-sky-600 hover:text-sky-700 hover:underline"
                    >
                      ไปหน้าการเงิน →
                    </Link>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-2 bg-amber-50 rounded border border-amber-100">
                      <span className="text-[11px] text-amber-700 block">เกิน 30 วัน</span>
                      <span className="text-lg font-bold text-amber-800">
                        {dash.alerts.debtAging.count30Plus} <span className="text-xs font-normal">ราย</span>
                      </span>
                    </div>
                    <div className="p-2 bg-orange-50 rounded border border-orange-100">
                      <span className="text-[11px] text-orange-700 block">เกิน 60 วัน</span>
                      <span className="text-lg font-bold text-orange-800">
                        {dash.alerts.debtAging.count60Plus} <span className="text-xs font-normal">ราย</span>
                      </span>
                    </div>
                    <div className="p-2 bg-rose-50 rounded border border-rose-100">
                      <span className="text-[11px] text-rose-700 block">เกิน 90 วัน</span>
                      <span className="text-lg font-bold text-rose-800">
                        {dash.alerts.debtAging.count90Plus} <span className="text-xs font-normal">ราย</span>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Alert 2: Low Stock Warning */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                      <span>📉</span> สินค้าสต็อกต่ำกว่าเกณฑ์ ({dash.alerts.lowStock.totalItems} รายการ)
                    </h3>
                    <Link
                      to="/inventory"
                      className="text-xs font-semibold text-sky-600 hover:text-sky-700 hover:underline"
                    >
                      ไปหน้าคลังสินค้า →
                    </Link>
                  </div>
                  {dash.alerts.lowStock.items.length === 0 ? (
                    <p className="text-xs text-emerald-600 bg-emerald-50 p-2.5 rounded text-center">
                      ✅ สต็อกสินค้าทุกรายการอยู่ในเกณฑ์ปกติ
                    </p>
                  ) : (
                    <div className="max-h-36 overflow-y-auto divide-y divide-slate-100 text-xs">
                      {dash.alerts.lowStock.items.slice(0, 5).map((item) => (
                        <div key={item.sku} className="py-1.5 flex items-center justify-between">
                          <div>
                            <span className="font-semibold text-slate-700">{item.name}</span>
                            <span className="font-mono text-slate-400 ml-1.5">[{item.sku}]</span>
                          </div>
                          <span className="text-rose-600 font-semibold">
                            คงเหลือ {item.stock} / ขั้นต่ำ {item.minStock} {item.unit}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Alert 3: PM Due Machines */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                      <span>🔧</span> เครื่องจักรใกล้/ถึงรอบ PM ({dash.alerts.duePm.totalMachines} เครื่อง)
                    </h3>
                    <Link
                      to="/maintenance"
                      className="text-xs font-semibold text-sky-600 hover:text-sky-700 hover:underline"
                    >
                      ไปหน้าซ่อมบำรุง →
                    </Link>
                  </div>
                  {dash.alerts.duePm.machines.length === 0 ? (
                    <p className="text-xs text-emerald-600 bg-emerald-50 p-2.5 rounded text-center">
                      ✅ ไม่มีเครื่องจักรที่ครบกำหนดซ่อมบำรุงตามรอบ
                    </p>
                  ) : (
                    <div className="max-h-36 overflow-y-auto divide-y divide-slate-100 text-xs">
                      {dash.alerts.duePm.machines.slice(0, 5).map((m) => (
                        <div key={m.code} className="py-1.5 flex items-center justify-between">
                          <div>
                            <span className="font-semibold text-slate-700">{m.name}</span>
                            <span className="font-mono text-slate-400 ml-1.5">[{m.code}]</span>
                          </div>
                          <span className="text-amber-700 font-medium">
                            {m.runHours} ชม. / รอบ {m.pmIntervalHours} ชม.
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Alert 4: Driving License Expiry */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                      <span>🪪</span> ใบขับขี่ใกล้หมดอายุ ({dash.alerts.licenseExpiring.totalEmployees} คน)
                    </h3>
                    <Link
                      to="/employees"
                      className="text-xs font-semibold text-sky-600 hover:text-sky-700 hover:underline"
                    >
                      ไปหน้าพนักงาน →
                    </Link>
                  </div>
                  {dash.alerts.licenseExpiring.employees.length === 0 ? (
                    <p className="text-xs text-emerald-600 bg-emerald-50 p-2.5 rounded text-center">
                      ✅ ใบขับขี่พนักงานทุกคนมีอายุใช้งานเกิน 30 วัน
                    </p>
                  ) : (
                    <div className="max-h-36 overflow-y-auto divide-y divide-slate-100 text-xs">
                      {dash.alerts.licenseExpiring.employees.slice(0, 5).map((emp) => (
                        <div key={emp.id} className="py-1.5 flex items-center justify-between">
                          <div>
                            <span className="font-semibold text-slate-700">{emp.name}</span>
                            <span className="text-slate-400 ml-1.5">({emp.role})</span>
                          </div>
                          <span className="text-rose-600 font-medium">
                            หมดอายุ {emp.drivingLicenseExpiry} (อีก {emp.daysRemaining} วัน)
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* 12-Month Sales Trend Chart */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                    <span>📈</span> แนวโน้มยอดขาย 12 เดือนย้อนหลัง (12-Month Sales Trend)
                  </h3>
                  <span className="text-xs text-slate-400">หน่วย: บาท (ชี้ที่แท่งเพื่อดูรายละเอียด)</span>
                </div>
                {renderTrendChart(dash.sales12MonthsTrend)}
              </div>
            </>
          ) : null}
        </div>
      )}

      {/* ================= TAB 2: SALES REPORT & EXCEL ================= */}
      {activeTab === 'sales-report' && (
        <div className="space-y-6">
          {/* Filter Bar */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">ตั้งแต่วันที่</label>
                <input
                  type="date"
                  value={salesDateFrom}
                  onChange={(e) => setSalesDateFrom(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-sky-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">ถึงวันที่</label>
                <input
                  type="date"
                  value={salesDateTo}
                  onChange={(e) => setSalesDateTo(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-sky-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">โซนจัดส่ง</label>
                <input
                  type="text"
                  placeholder="เช่น ท่าปลา"
                  value={salesZone}
                  onChange={(e) => setSalesZone(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-sky-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">สรุปตาม</label>
                <select
                  value={salesGroupBy}
                  onChange={(e) => setSalesGroupBy(e.target.value as 'day' | 'month')}
                  className="w-full px-3 py-1.5 border border-slate-300 rounded text-sm focus:ring-2 focus:ring-sky-500 focus:outline-none bg-white"
                >
                  <option value="day">รายวัน (Day)</option>
                  <option value="month">รายเดือน (Month)</option>
                </select>
              </div>

              <div>
                <button
                  type="button"
                  onClick={handleExportSales}
                  disabled={exportLoading}
                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded text-xs shadow transition disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  <span>📥</span>
                  {exportLoading ? 'กำลังส่งออก…' : 'ส่งออก Excel (.xlsx)'}
                </button>
              </div>
            </div>
          </div>

          {/* Sales Report Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {salesReportQuery.isPending ? (
              <p className="p-8 text-center text-sm text-slate-400">กำลังประมวลผลรายงานยอดขาย…</p>
            ) : salesReportQuery.isError ? (
              <p className="p-4 text-center text-sm text-red-600">ไม่สามารถโหลดรายงานได้</p>
            ) : salesReportQuery.data ? (
              <>
                {/* Totals Summary Ribbon */}
                <div className="bg-sky-50 p-4 border-b border-sky-100 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  <div>
                    <span className="text-xs text-sky-700 block">ออเดอร์ทั้งหมด</span>
                    <span className="text-lg font-bold text-sky-900">
                      {salesReportQuery.data.totals.orders} รายการ
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-sky-700 block">ถัง 18.9L รวม</span>
                    <span className="text-lg font-bold text-sky-900">
                      {salesReportQuery.data.totals.volume189L.toLocaleString()} ถัง
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-sky-700 block">ขวดเล็ก/แพ็ครวม</span>
                    <span className="text-lg font-bold text-sky-900">
                      {salesReportQuery.data.totals.volumePacks.toLocaleString()} แพ็ค
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-sky-700 block">ยอดขายรวมสุทธิ</span>
                    <span className="text-lg font-bold text-sky-900">
                      ฿{salesReportQuery.data.totals.revenueBaht.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                        <th className="py-2.5 px-4 font-semibold">
                          ช่วงเวลา ({salesGroupBy === 'month' ? 'เดือน' : 'วัน'})
                        </th>
                        <th className="py-2.5 px-4 font-semibold text-right">จำนวนออเดอร์</th>
                        <th className="py-2.5 px-4 font-semibold text-right">ถัง 18.9L</th>
                        <th className="py-2.5 px-4 font-semibold text-right">แพ็คขวดเล็ก</th>
                        <th className="py-2.5 px-4 font-semibold text-right">ยอดรวม (บาท)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {salesReportQuery.data.items.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-slate-400">
                            ไม่พบรายการขายตามช่วงเวลาที่กำหนด
                          </td>
                        </tr>
                      ) : (
                        salesReportQuery.data.items.map((row) => (
                          <tr key={row.period} className="hover:bg-slate-50">
                            <td className="py-2.5 px-4 font-medium text-slate-800">{row.period}</td>
                            <td className="py-2.5 px-4 text-right text-slate-700">{row.ordersCount}</td>
                            <td className="py-2.5 px-4 text-right text-slate-700">{row.total189L}</td>
                            <td className="py-2.5 px-4 text-right text-slate-700">{row.totalPacks}</td>
                            <td className="py-2.5 px-4 text-right font-semibold text-slate-900">
                              ฿{row.revenueBaht.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}

      {/* ================= TAB 3: HEALTH & AUDIT ================= */}
      {activeTab === 'system-health' && (
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
            <h2 className="text-base font-semibold text-slate-800">สถานะเซิร์ฟเวอร์และฐานข้อมูล (Phase 1)</h2>
            <div className="flex items-center gap-3">
              <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${badge.className}`}>
                {badge.text}
              </span>
              <span className="text-xs text-slate-400 font-mono">
                {health.data ? `เวลาเซิร์ฟเวอร์: ${health.data.timestamp}` : ''}
              </span>
            </div>
          </div>

          {canViewAudit && (
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-slate-800">บันทึกกิจกรรมความปลอดภัย (Audit Logs 25 รายการล่าสุด)</h2>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="กรอง username"
                    value={filterUsername}
                    onChange={(e) => setFilterUsername(e.target.value)}
                    className="px-2.5 py-1 text-xs border border-slate-300 rounded"
                  />
                  <input
                    type="text"
                    placeholder="กรอง action"
                    value={filterAction}
                    onChange={(e) => setFilterAction(e.target.value)}
                    className="px-2.5 py-1 text-xs border border-slate-300 rounded"
                  />
                </div>
              </div>

              {recentAudit.isPending ? (
                <p className="text-xs text-slate-400 py-4 text-center">กำลังโหลด audit log…</p>
              ) : recentAudit.isError ? (
                <p className="text-xs text-red-600 py-4 text-center">ไม่สามารถโหลด audit log ได้</p>
              ) : recentAudit.data?.data.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">ยังไม่มีประวัติ audit log</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500 bg-slate-50">
                        <th className="py-2 px-3">เวลา</th>
                        <th className="py-2 px-3">ผู้ใช้</th>
                        <th className="py-2 px-3">การกระทำ (Action)</th>
                        <th className="py-2 px-3">ตาราง</th>
                        <th className="py-2 px-3">รายละเอียด</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {recentAudit.data?.data.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50">
                          <td className="py-2 px-3 font-mono text-slate-500">{item.createdAt}</td>
                          <td className="py-2 px-3 font-medium text-slate-700">{item.username || '-'}</td>
                          <td className="py-2 px-3 font-mono text-sky-700">{item.action}</td>
                          <td className="py-2 px-3 text-slate-500">{item.entity || '-'}</td>
                          <td className="py-2 px-3 text-slate-600">{item.detail || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
