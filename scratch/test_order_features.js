const http = require('http');

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, body });
        }
      });
    }).on('error', reject);
  });
}

async function run() {
  const res = await getJson('http://localhost:3080/api/data');
  const orders = res.data.orders || [];
  console.log('Total orders in DB:', orders.length);
  orders.forEach((o, i) => {
    console.log(`[${i+1}] ${o.orderId} | Cust: ${o.customerName} (${o.customerId}) | Delivery: ${o.deliveryDate} ${o.deliveryTime} | Status: ${o.orderStatus} | Total: ฿${o.totalAmount}`);
  });
}

run();
