const fs = require('fs');

const db = JSON.parse(fs.readFileSync('d:/13. Antigravity/Sunan/Inthara_program_develop/data/inthara_db.json', 'utf8'));

console.log('Total orders in db:', db.orders ? db.orders.length : 0);
console.log('Orders with status completed:', db.orders ? db.orders.filter(o => o.orderStatus === 'จัดส่งสำเร็จแล้ว').length : 0);

if (Array.isArray(db.orders)) {
  const unpaidOrders = db.orders.filter(o => {
    let unp = o.unpaidAmount;
    if (unp === undefined) {
      const tr = (db.savedTrips || []).find(t => (o.orderId && t.orderId === o.orderId) || (o.customerId && t.customerId === o.customerId && t.date === o.deliveryDate));
      if (tr) unp = tr.unpaidAmount;
    }
    const actUnp = Number(unp !== undefined ? unp : (o.paymentMode === 'credit' ? Number(o.totalAmount || 0) : Math.max(0, Number(o.totalAmount || 0) - Number(o.moneyCollected || 0))));
    return actUnp > 0;
  });
  console.log('\n--- UNPAID ORDERS (Count: ' + unpaidOrders.length + ') ---');
  unpaidOrders.forEach(o => {
    console.log(`- Order: ${o.orderId}, Cust: ${o.customerName} [${o.customerId}], Date: ${o.deliveryDate}, Total: ${o.totalAmount}, Collected: ${o.moneyCollected}, Unpaid: ${o.unpaidAmount}, PaymentMode: ${o.paymentMode}, PaymentStatus: ${o.paymentStatus}`);
  });
}

console.log('\n--- CUSTOMERS ---');
(db.customers || []).forEach(c => {
  console.log(`- ${c.name} (${c.id}): CreditBalance = ${c.creditBalance}, OutstandingBottles = ${c.OutstandingBottles}`);
});

console.log('\n--- SAVED TRIPS (Total: ' + (db.savedTrips || []).length + ') ---');
(db.savedTrips || []).slice(0, 10).forEach(t => {
  console.log(`- Trip: ${t.tripId}, Order: ${t.orderId}, Customer: ${t.customerName}, Date: ${t.date}, Unpaid: ${t.unpaidAmount}, Mode: ${t.paymentMode}`);
});
