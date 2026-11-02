const http = require('http');

function request(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

function getOrderUnpaidAmount(o, db) {
  if (!o || o.orderStatus !== 'จัดส่งสำเร็จแล้ว') return 0;
  if (o.unpaidAmount !== undefined) return Number(o.unpaidAmount || 0);
  if (o.paymentStatus === 'ชำระแล้ว') return 0;

  const tr = (db?.savedTrips || []).find(t => (o.orderId && t.orderId === o.orderId) || (o.customerId && t.customerId === o.customerId && t.date === o.deliveryDate));
  if (tr && tr.unpaidAmount !== undefined) return Number(tr.unpaidAmount || 0);

  if (o.paymentMode === 'credit') return Number(o.totalAmount || 0);
  if (o.moneyCollected !== undefined) return Math.max(0, Number(o.totalAmount || 0) - Number(o.moneyCollected));

  return 0;
}

async function verify() {
  console.log('--- VERIFYING CURRENT STATE OF ORDERS AND UNPAID COUNT ---');
  const res = await request({
    hostname: 'localhost',
    port: 3080,
    path: '/api/data',
    method: 'GET'
  });

  const state = res.data;
  const unpaidOrders = (state.orders || []).filter(o => getOrderUnpaidAmount(o, state) > 0);

  console.log('Total orders in DB:', state.orders?.length);
  console.log('Total UNPAID orders in DB:', unpaidOrders.length);
  console.log('Customers Debt:');
  state.customers.forEach(c => {
    console.log(`- ${c.name}: CreditBalance = ฿${c.creditBalance || 0}`);
  });

  if (unpaidOrders.length !== 0) {
    console.error('Expected 0 unpaid orders but got:', unpaidOrders.length);
    unpaidOrders.forEach(o => console.log(o));
    throw new Error('Unpaid orders count is not 0!');
  }

  console.log('✓ PASS: Unpaid badge will correctly show 0 (no lingering phantom count)!');
}

verify().catch(err => {
  console.error(err);
  process.exit(1);
});
