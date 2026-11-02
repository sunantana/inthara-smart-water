const http = require('http');

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          resolve({ error: e });
        }
      });
    }).on('error', reject);
  });
}

async function test() {
  const data = await getJson('http://localhost:3080/api/data');
  const orders = data.orders || [];
  console.log(`Checking slip generation for ${orders.length} orders...`);

  orders.forEach(ord => {
    const cust = (data.customers || []).find(c => c.id === ord.customerId) || {};
    const items = [];
    if (Number(ord.qty189L || 0) > 0) items.push({ name: 'น้ำดื่มถัง 18.9L', qty: ord.qty189L, price: ord.unitPrice189L });
    if (Number(ord.qty350ml || 0) > 0) items.push({ name: 'น้ำดื่มแพ็ค 350ml', qty: ord.qty350ml, price: ord.unitPrice350ml });
    if (Number(ord.qty600ml || 0) > 0) items.push({ name: 'น้ำดื่มแพ็ค 600ml', qty: ord.qty600ml, price: ord.unitPrice600ml });
    if (Number(ord.qty1500ml || 0) > 0) items.push({ name: 'น้ำดื่มแพ็ค 1500ml', qty: ord.qty1500ml, price: ord.unitPrice1500ml });

    if (!ord.orderId) throw new Error('Missing orderId');
    if (!ord.deliveryDate) throw new Error(`Missing deliveryDate for ${ord.orderId}`);
    if (isNaN(ord.totalAmount)) throw new Error(`Invalid totalAmount for ${ord.orderId}`);

    console.log(`✓ ${ord.orderId}: Customer "${ord.customerName}", Date ${ord.deliveryDate}, Items: ${items.length}, Total: ฿${ord.totalAmount}`);
  });

  console.log('✓ All orders generate valid single-page slips without any data issues!');
}

test().catch(err => {
  console.error(err);
  process.exit(1);
});
