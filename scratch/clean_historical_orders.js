const fs = require('fs');

const dbPath = 'd:/13. Antigravity/Sunan/Inthara_program_develop/data/inthara_db.json';
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

console.log('--- CLEANING HISTORICAL ORDERS & TRIPS ---');

// 1. Clean historical orders from 2026-10-27
let cleanedOrders = 0;
if (Array.isArray(db.orders)) {
  db.orders.forEach(o => {
    if (o.orderStatus === 'จัดส่งสำเร็จแล้ว') {
      if (o.moneyCollected === undefined || o.unpaidAmount === undefined || o.paymentStatus === undefined) {
        o.moneyCollected = Number(o.totalAmount || 0);
        o.unpaidAmount = 0;
        o.paymentMode = o.paymentMode || 'cash';
        o.paymentStatus = 'ชำระแล้ว';
        cleanedOrders++;
        console.log(`Cleaned order ${o.orderId}: marked as paid (total: ${o.totalAmount})`);
      }
    }
  });
}

// 2. Clean savedTrips where customer has creditBalance = 0
let cleanedTrips = 0;
if (Array.isArray(db.savedTrips)) {
  db.savedTrips.forEach(t => {
    const cust = (db.customers || []).find(c => c.name === t.customerName || c.id === t.customerId);
    const custDebt = Number(cust ? cust.creditBalance : 0);
    if (custDebt === 0 && Number(t.unpaidAmount || 0) > 0) {
      console.log(`Trip ${t.tripId} has unpaid ${t.unpaidAmount} but customer debt is 0 -> clearing trip unpaid`);
      t.moneyCollected = Number(t.totalRevenue || 0);
      t.unpaidAmount = 0;
      t.paymentStatus = 'ชำระแล้ว';
      cleanedTrips++;
    }
  });
}

fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
console.log(`✓ Cleaned ${cleanedOrders} orders and ${cleanedTrips} trips in inthara_db.json`);
