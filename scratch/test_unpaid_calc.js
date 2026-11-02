const fs = require('fs');

const db = JSON.parse(fs.readFileSync('d:/13. Antigravity/Sunan/Inthara_program_develop/data/inthara_db.json', 'utf8'));

function getOrderUnpaid(o) {
  if (o.orderStatus !== 'จัดส่งสำเร็จแล้ว') return 0;
  if (o.unpaidAmount !== undefined) return Number(o.unpaidAmount || 0);
  if (o.paymentStatus === 'ชำระแล้ว') return 0;

  const tr = (db.savedTrips || []).find(t => (o.orderId && t.orderId === o.orderId) || (o.customerId && t.customerId === o.customerId && t.date === o.deliveryDate));
  if (tr && tr.unpaidAmount !== undefined) return Number(tr.unpaidAmount || 0);

  if (o.paymentMode === 'credit') return Number(o.totalAmount || 0);
  if (o.moneyCollected !== undefined) return Math.max(0, Number(o.totalAmount || 0) - Number(o.moneyCollected));
  
  return 0;
}

const orders = db.orders || [];
const unpaid = orders.filter(o => getOrderUnpaid(o) > 0);
console.log('Total unpaid orders across all dates:', unpaid.length);

unpaid.forEach(o => {
  console.log(`- ${o.orderId} (${o.deliveryDate}): ฿${getOrderUnpaid(o)}`);
});
