import { getDb } from '../../db/connection.js';

export function getTodayAndMonthSales(todayStr) {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN o.delivery_date = ? THEN o.total_sat ELSE 0 END), 0) AS today_sales_sat,
         COUNT(DISTINCT CASE WHEN o.delivery_date = ? THEN o.id ELSE NULL END) AS today_orders_count,
         COALESCE(SUM(CASE WHEN strftime('%Y-%m', o.delivery_date) = strftime('%Y-%m', ?) THEN o.total_sat ELSE 0 END), 0) AS month_sales_sat,
         COUNT(DISTINCT CASE WHEN strftime('%Y-%m', o.delivery_date) = strftime('%Y-%m', ?) THEN o.id ELSE NULL END) AS month_orders_count
       FROM orders o
       WHERE o.status != 'cancelled'`,
    )
    .get(todayStr, todayStr, todayStr, todayStr);

  return {
    todaySalesSat: Number(row?.today_sales_sat ?? 0),
    todayOrdersCount: Number(row?.today_orders_count ?? 0),
    monthSalesSat: Number(row?.month_sales_sat ?? 0),
    monthOrdersCount: Number(row?.month_orders_count ?? 0),
  };
}

export function getPendingOrdersCount() {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT
         COUNT(*) AS pending_orders_count,
         COUNT(CASE WHEN source = 'portal' AND status = 'draft' THEN 1 END) AS portal_draft_orders_count
       FROM orders
       WHERE status IN ('draft', 'confirmed')`,
    )
    .get();

  return {
    pendingOrdersCount: Number(row?.pending_orders_count ?? 0),
    portalDraftOrdersCount: Number(row?.portal_draft_orders_count ?? 0),
  };
}

export function getLowStockItems() {
  const db = getDb();
  return db
    .prepare(
      `SELECT sku, name, category, stock, min_stock, unit, (min_stock - stock) AS deficit
       FROM inventory_items
       WHERE stock < min_stock
       ORDER BY (min_stock - stock) DESC, sku ASC`,
    )
    .all();
}

export function get12MonthsSalesTrend(todayStr) {
  const db = getDb();
  return db
    .prepare(
      `SELECT
         strftime('%Y-%m', o.delivery_date) AS month,
         COUNT(DISTINCT o.id) AS orders_count,
         COALESCE(SUM(oi.qty * oi.unit_price_sat), 0) AS total_sat,
         COALESCE(SUM(CASE WHEN oi.sku = 'FG-189L' THEN oi.qty ELSE 0 END), 0) AS total_189l,
         COALESCE(SUM(CASE WHEN oi.sku != 'FG-189L' THEN oi.qty ELSE 0 END), 0) AS total_packs
       FROM orders o
       LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE o.status != 'cancelled'
         AND o.delivery_date >= date(?, '-12 months', 'start of month')
         AND o.delivery_date <= date(?, 'start of month', '+1 month', '-1 day')
       GROUP BY strftime('%Y-%m', o.delivery_date)
       ORDER BY month ASC`,
    )
    .all(todayStr, todayStr);
}

export function getSalesAggregates({ dateFrom, dateTo, zone, groupBy = 'day' } = {}) {
  const db = getDb();
  const periodExpr =
    groupBy === 'month'
      ? "strftime('%Y-%m', o.delivery_date)"
      : "strftime('%Y-%m-%d', o.delivery_date)";

  const where = ["o.status != 'cancelled'"];
  const params = [];

  if (dateFrom) {
    where.push('o.delivery_date >= ?');
    params.push(dateFrom);
  }
  if (dateTo) {
    where.push('o.delivery_date <= ?');
    params.push(dateTo);
  }
  if (zone) {
    where.push('c.zone = ?');
    params.push(zone);
  }

  const whereSql = where.join(' AND ');

  const sql = `
    SELECT
      ${periodExpr} AS period,
      COUNT(DISTINCT o.id) AS orders_count,
      COALESCE(SUM(oi.qty * oi.unit_price_sat), 0) AS total_sat,
      COALESCE(SUM(CASE WHEN oi.sku = 'FG-189L' THEN oi.qty ELSE 0 END), 0) AS total_189l,
      COALESCE(SUM(CASE WHEN oi.sku != 'FG-189L' THEN oi.qty ELSE 0 END), 0) AS total_packs
    FROM orders o
    LEFT JOIN customers c ON c.id = o.customer_id
    LEFT JOIN order_items oi ON oi.order_id = o.id
    WHERE ${whereSql}
    GROUP BY ${periodExpr}
    ORDER BY period ASC
  `;

  return db.prepare(sql).all(...params);
}
