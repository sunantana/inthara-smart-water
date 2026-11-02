const fs = require('fs');

const dbPath = 'd:/13. Antigravity/Sunan/Inthara_program_develop/data/inthara_db.json';
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

console.log('--- RESETTING TEST ORDER DATA ---');

// 1. Clear test orders
const prevOrderCount = (db.orders || []).length;
db.orders = [];
console.log(`✓ Cleared ${prevOrderCount} test orders (db.orders = [])`);

// 2. Clear test saved trips (which were check-ins of test orders)
const prevTripCount = (db.savedTrips || []).length;
db.savedTrips = [];
console.log(`✓ Cleared ${prevTripCount} test saved trips (db.savedTrips = [])`);

// 3. Clear test payment receipts
const prevReceiptCount = (db.paymentReceipts || []).length;
db.paymentReceipts = [];
console.log(`✓ Cleared ${prevReceiptCount} test payment receipts (db.paymentReceipts = [])`);

// 4. Reset customer transaction & order states while keeping master data intact
if (Array.isArray(db.customers)) {
  db.customers.forEach(c => {
    c.creditBalance = 0;
    c.OutstandingBottles = 0;
    c.orderBottles189L = 0;
    c.orderPack350ml = 0;
    c.orderPack600ml = 0;
    c.orderPack1500ml = 0;
    c.deliveredBottles = 0;
    c.returnedBottles = 0;
    c.selectedForRoute = false;
    c.deliveryStatus = 'pending';
  });
  console.log(`✓ Reset active order/debt balances for ${db.customers.length} customers`);
}

fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
console.log('--- TEST DATA CLEARED SUCCESSFULLY ---');
