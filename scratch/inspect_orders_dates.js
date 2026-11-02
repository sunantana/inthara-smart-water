const fs = require('fs');

const db = JSON.parse(fs.readFileSync('d:/13. Antigravity/Sunan/Inthara_program_develop/data/inthara_db.json', 'utf8'));

console.log('Orders breakdown by date:');
const dateCounts = {};
(db.orders || []).forEach(o => {
  dateCounts[o.deliveryDate] = (dateCounts[o.deliveryDate] || 0) + 1;
});
console.log(dateCounts);

console.log('\nOrders with unpaidAmount > 0 or paymentStatus === "ค้างชำระ":');
(db.orders || []).forEach(o => {
  if (o.unpaidAmount > 0 || o.paymentStatus === 'ค้างชำระ') {
    console.log(`- ${o.orderId}: Date: ${o.deliveryDate}, Total: ${o.totalAmount}, Collected: ${o.moneyCollected}, Unpaid: ${o.unpaidAmount}, Status: ${o.paymentStatus}`);
  }
});
