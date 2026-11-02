const http = require('http');
const fs = require('fs');

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

function postJson(url, data) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const bodyStr = JSON.stringify(data);
    const req = http.request({
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr)
      }
    }, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, body });
        }
      });
    });
    req.on('error', reject);
    req.write(bodyStr);
    req.end();
  });
}

async function verify() {
  console.log('Testing Orders Enhancements...');

  // 1. Verify index.html elements
  const html = fs.readFileSync('d:/13. Antigravity/Sunan/Inthara_program_develop/public/index.html', 'utf8');
  const requiredElements = [
    'id="ordHeaderDateBadge"',
    'id="btnOrdFilterPending"',
    'id="btnOrdFilterCompleted"',
    'id="btnOrdFilterAll"',
    'id="ordDateFilterInput"',
    'onclick="setOrderFilterLatestDate()"',
    'onclick="setOrderFilterAllDates()"',
    'id="btnCancelOrderEdit"',
    'id="modalOrderSlip"',
    'id="slipOrderId"',
    'id="slipItemsTableBody"',
    'onclick="printOrderSlip()"'
  ];

  requiredElements.forEach(item => {
    if (!html.includes(item)) {
      throw new Error(`Missing expected element in index.html: ${item}`);
    }
  });
  console.log('✓ All HTML elements verified successfully');

  // 2. Verify app.js functions
  const app = fs.readFileSync('d:/13. Antigravity/Sunan/Inthara_program_develop/public/app.js', 'utf8');
  const requiredFunctions = [
    'getLatestOrderDate',
    'setOrderFilterLatestDate',
    'setOrderFilterAllDates',
    'openOrderSlipModal',
    'closeOrderSlipModal',
    'printOrderSlip',
    'cancelOrderEdit'
  ];

  requiredFunctions.forEach(fn => {
    if (!app.includes(`function ${fn}`)) {
      throw new Error(`Missing expected function in app.js: ${fn}`);
    }
  });
  console.log('✓ All JS functions verified successfully');

  // 3. Test API data & date sorting logic
  const res = await getJson('http://localhost:3080/api/data');
  const orders = res.data.orders;
  console.log(`Total orders in DB: ${orders.length}`);

  const latestDate = [...orders.map(o => o.deliveryDate).filter(Boolean)].sort().reverse()[0];
  console.log(`Latest date found: ${latestDate}`);
  if (latestDate !== '2026-10-28') {
    throw new Error(`Expected latest date 2026-10-28, got ${latestDate}`);
  }

  // 4. Test Excel Export with date filter
  const excelRes = await new Promise((resolve, reject) => {
    http.get(`http://localhost:3080/api/orders/export-excel?date=${latestDate}`, res => {
      resolve({ status: res.statusCode, type: res.headers['content-type'] });
    }).on('error', reject);
  });
  console.log(`Excel export for date ${latestDate}: status ${excelRes.status}, type: ${excelRes.type}`);
  if (excelRes.status !== 200) {
    throw new Error(`Excel export failed with status ${excelRes.status}`);
  }

  console.log('✓ All end-to-end verifications passed with 100% success!');
}

verify().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
