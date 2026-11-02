const http = require('http');

http.get('http://localhost:3080/api/data', res => {
  let body = '';
  res.on('data', c => body += c);
  res.on('end', () => {
    const data = JSON.parse(body);
    console.log('API /api/data Verification:');
    console.log('- Orders count:', (data.orders || []).length);
    console.log('- Saved trips count:', (data.savedTrips || []).length);
    console.log('- Payment receipts count:', (data.paymentReceipts || []).length);
    console.log('- Customers count:', (data.customers || []).length);
    data.customers.forEach(c => {
      console.log(`  * ${c.name} [${c.id}]: Debt = ฿${c.creditBalance}, HeldBottles = ${c.OutstandingBottles}`);
    });
  });
}).on('error', console.error);
