import ExcelJS from 'exceljs';
import { satangToBaht } from '../../utils/money.js';
import * as billingService from '../billing/service.js';
import * as cmmsService from '../cmms/service.js';
import * as employeesService from '../employees/service.js';
import * as repo from './repo.js';

export function getDashboardSummary(asOfDate) {
  const todayStr = asOfDate || new Date().toISOString().slice(0, 10);

  // 1) ยอดขายวันนี้และเดือนนี้
  const sales = repo.getTodayAndMonthSales(todayStr);

  // 2) ออเดอร์รอจัดส่ง
  const pendingOrders = repo.getPendingOrdersCount();

  // 3) แจ้งเตือนหนี้ค้างชำระ (30 / 60 / 90 วัน) จากโมดูล Billing ที่มีอยู่แล้ว
  let debtAging = {
    totalOverdueCustomers: 0,
    count30Plus: 0,
    count60Plus: 0,
    count90Plus: 0,
    totalOverdueDebtSat: 0,
    totalOverdueDebtBaht: 0,
  };
  try {
    const billingSummary = billingService.listUnpaidBilling({ limit: 500 });
    const customersWithDebt = (billingSummary.customers || []).filter(
      (c) => Number(c.netDebtSat ?? 0) > 0,
    );
    const count30 = customersWithDebt.filter((c) => (c.maxAgeDays ?? 0) >= 30).length;
    const count60 = customersWithDebt.filter((c) => (c.maxAgeDays ?? 0) >= 60).length;
    const count90 = customersWithDebt.filter((c) => (c.maxAgeDays ?? 0) >= 90).length;
    const totalDebt = customersWithDebt.reduce(
      (sum, c) => sum + Number(c.netDebtSat ?? 0),
      0,
    );

    debtAging = {
      totalOverdueCustomers: customersWithDebt.length,
      count30Plus: count30,
      count60Plus: count60,
      count90Plus: count90,
      totalOverdueDebtSat: totalDebt,
      totalOverdueDebtBaht: satangToBaht(totalDebt),
    };
  } catch {
    // fallback if billing calculation throws
  }

  // 4) สต็อกต่ำกว่า min (ทุก SKU)
  const lowStockRows = repo.getLowStockItems();
  const lowStockItems = lowStockRows.map((r) => ({
    sku: r.sku,
    name: r.name,
    category: r.category,
    stock: Number(r.stock ?? 0),
    minStock: Number(r.min_stock ?? 0),
    unit: r.unit,
    deficit: Number(r.deficit ?? 0),
  }));

  // 5) เครื่องจักรใกล้/ถึงรอบ PM (run_hours >= 90% ของ pm_interval_hours)
  let duePmMachines = [];
  try {
    const cmmsResult = cmmsService.listDuePmMachines();
    duePmMachines = cmmsResult.data || cmmsResult.machines || [];
  } catch {
    // fallback
  }

  // 6) ใบขับขี่พนักงานใกล้หมดอายุ (ภายใน 30 วัน)
  let licenseExpiringEmployees = [];
  try {
    const empResult = employeesService.listLicenseExpiringEmployees({
      days: 30,
      asOf: todayStr,
    });
    licenseExpiringEmployees = empResult.data || empResult.employees || [];
  } catch {
    // fallback
  }

  // 7) แนวโน้มยอดขาย 12 เดือนย้อนหลัง (RPT-3)
  const trendRows = repo.get12MonthsSalesTrend(todayStr);
  const sales12MonthsTrend = trendRows.map((r) => ({
    month: r.month,
    ordersCount: Number(r.orders_count ?? 0),
    total189L: Number(r.total_189l ?? 0),
    totalPacks: Number(r.total_packs ?? 0),
    totalSat: Number(r.total_sat ?? 0),
    totalBaht: satangToBaht(Number(r.total_sat ?? 0)),
  }));

  return {
    asOfDate: todayStr,
    sales: {
      todaySalesSat: sales.todaySalesSat,
      todaySalesBaht: satangToBaht(sales.todaySalesSat),
      todayOrdersCount: sales.todayOrdersCount,
      monthSalesSat: sales.monthSalesSat,
      monthSalesBaht: satangToBaht(sales.monthSalesSat),
      monthOrdersCount: sales.monthOrdersCount,
      pendingOrdersCount: pendingOrders.pendingOrdersCount,
      portalDraftOrdersCount: pendingOrders.portalDraftOrdersCount,
    },
    alerts: {
      debtAging,
      lowStock: {
        totalItems: lowStockItems.length,
        items: lowStockItems,
      },
      duePm: {
        totalMachines: duePmMachines.length,
        machines: duePmMachines,
      },
      licenseExpiring: {
        totalEmployees: licenseExpiringEmployees.length,
        employees: licenseExpiringEmployees,
      },
    },
    sales12MonthsTrend,
  };
}

export function getSalesReport(query = {}) {
  const groupBy = query.groupBy === 'month' ? 'month' : 'day';
  const rows = repo.getSalesAggregates({
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
    zone: query.zone,
    groupBy,
  });

  let totalOrders = 0;
  let total189L = 0;
  let totalPacks = 0;
  let totalRevenueSat = 0;

  const items = rows.map((r) => {
    const ordersCount = Number(r.orders_count ?? 0);
    const qty189L = Number(r.total_189l ?? 0);
    const qtyPacks = Number(r.total_packs ?? 0);
    const sat = Number(r.total_sat ?? 0);

    totalOrders += ordersCount;
    total189L += qty189L;
    totalPacks += qtyPacks;
    totalRevenueSat += sat;

    return {
      period: r.period,
      ordersCount,
      total189L: qty189L,
      totalPacks: qtyPacks,
      totalSat: sat,
      totalBaht: satangToBaht(sat),
    };
  });

  return {
    groupBy,
    zone: query.zone || null,
    dateFrom: query.dateFrom || null,
    dateTo: query.dateTo || null,
    totalPeriods: items.length,
    totalOrders,
    total189L,
    totalPacks,
    totalRevenueSat,
    totalRevenueBaht: satangToBaht(totalRevenueSat),
    items,
    data: items,
  };
}

export async function exportSalesReportXlsxBuffer(query = {}) {
  const report = getSalesReport(query);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Inthara Smart Water ERP v2';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('รายงานยอดขาย', {
    views: [{ state: 'frozen', ySplit: 2 }],
  });

  sheet.columns = [
    { header: report.groupBy === 'month' ? 'เดือน (YYYY-MM)' : 'วันที่ (YYYY-MM-DD)', key: 'period', width: 18 },
    { header: 'จำนวนออเดอร์', key: 'ordersCount', width: 16 },
    { header: 'ถัง 18.9L (ถัง)', key: 'total189L', width: 16 },
    { header: 'แพ็คขวดเล็ก (แพ็ค)', key: 'totalPacks', width: 18 },
    { header: 'ยอดขายรวม (บาท)', key: 'totalBaht', width: 20 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF0284C7' },
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 24;

  for (const item of report.items) {
    const row = sheet.addRow({
      period: item.period,
      ordersCount: item.ordersCount,
      total189L: item.total189L,
      totalPacks: item.totalPacks,
      totalBaht: item.totalBaht,
    });
    row.getCell('ordersCount').alignment = { horizontal: 'right' };
    row.getCell('total189L').alignment = { horizontal: 'right' };
    row.getCell('totalPacks').alignment = { horizontal: 'right' };
    row.getCell('totalBaht').alignment = { horizontal: 'right' };
    row.getCell('totalBaht').numFmt = '#,##0.00';
  }

  // แถวสรุปรวม
  const summaryRow = sheet.addRow({
    period: 'รวมทั้งหมด',
    ordersCount: report.totalOrders,
    total189L: report.total189L,
    totalPacks: report.totalPacks,
    totalBaht: report.totalRevenueBaht,
  });
  summaryRow.font = { bold: true };
  summaryRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF1F5F9' },
  };
  summaryRow.getCell('totalBaht').numFmt = '#,##0.00';

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
