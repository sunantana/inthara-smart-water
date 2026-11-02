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

async function runTest() {
  console.log('--- STARTING BILLING SETTLEMENT TEST ---');

  // 1. Get current data
  const dataRes = await request({
    hostname: 'localhost',
    port: 3080,
    path: '/api/data',
    method: 'GET'
  });

  const state = dataRes.data;
  const sunan = state.customers.find(c => c.name === 'Sunan' || c.id === 'CUST-010');
  console.log('1. Customer:', sunan.name, 'Credit Balance before settlement:', sunan.creditBalance);

  // Find an unpaid order for Sunan
  const unpaidOrder = state.orders.find(o => (o.customerId === sunan.id || o.customerName === sunan.name) && (o.unpaidAmount > 0 || o.paymentStatus === 'ค้างชำระ'));
  console.log('2. Unpaid order found:', unpaidOrder ? `${unpaidOrder.orderId} (Unpaid: ฿${unpaidOrder.unpaidAmount})` : 'None, testing customer settlement');

  const settlePayload = {
    customerId: sunan.id,
    orderId: unpaidOrder ? unpaidOrder.orderId : '',
    amount: 150,
    paymentMethod: 'โอนเงินผ่านธนาคาร / พร้อมเพย์',
    paidDate: new Date().toISOString().slice(0, 10),
    notes: 'ทดสอบตัดยอดบิลโอนเงินผ่านพร้อมเพย์'
  };

  const initialDebt = Number(sunan.creditBalance || 0);

  const settleRes = await request({
    hostname: 'localhost',
    port: 3080,
    path: '/api/billing/settle',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, settlePayload);

  console.log('3. Settle API status:', settleRes.status);
  console.log('   Receipt issued:', settleRes.data.receipt?.receiptNo, 'Amount:', settleRes.data.receipt?.amount);

  if (settleRes.status !== 200 || !settleRes.data.ok) {
    throw new Error('Settle API failed: ' + JSON.stringify(settleRes.data));
  }

  // Check state after settlement
  const afterRes = await request({
    hostname: 'localhost',
    port: 3080,
    path: '/api/data',
    method: 'GET'
  });

  const updatedSunan = afterRes.data.customers.find(c => c.id === sunan.id);
  const expectedDebt = Math.max(0, initialDebt - 150);
  console.log(`4. Customer Debt after settlement: ฿${updatedSunan.creditBalance} (Expected: ฿${expectedDebt})`);

  if (updatedSunan.creditBalance !== expectedDebt) {
    throw new Error(`Debt balance mismatch! Got ${updatedSunan.creditBalance}, expected ${expectedDebt}`);
  }

  if (unpaidOrder) {
    const updatedOrder = afterRes.data.orders.find(o => o.orderId === unpaidOrder.orderId);
    console.log(`   Order ${updatedOrder.orderId} new payment status:`, updatedOrder.paymentStatus, 'Unpaid amount:', updatedOrder.unpaidAmount);
  }

  console.log('--- BILLING SETTLEMENT TEST PASSED PERFECTLY! ---');
}

runTest().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
