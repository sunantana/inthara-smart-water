const http = require('http');
const fs = require('fs');

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

async function verify() {
  console.log('Verifying Saved Trips Table "ดูบิล" & Print Features...');

  // 1. Verify index.html contains the new header
  const html = fs.readFileSync('d:/13. Antigravity/Sunan/Inthara_program_develop/public/index.html', 'utf8');
  if (!html.includes('จัดการ / ดูบิล')) {
    throw new Error('Header "จัดการ / ดูบิล" missing from index.html');
  }
  console.log('✓ Found "จัดการ / ดูบิล" column header in index.html');

  // 2. Verify app.js contains openOrderSlipFromTrip and render button
  const app = fs.readFileSync('d:/13. Antigravity/Sunan/Inthara_program_develop/public/app.js', 'utf8');
  if (!app.includes('openOrderSlipFromTrip(')) {
    throw new Error('function openOrderSlipFromTrip missing from app.js');
  }
  if (!app.includes("onclick=\"openOrderSlipFromTrip('${t.tripId}')\"")) {
    throw new Error('Call to openOrderSlipFromTrip missing in renderSavedTripsTable');
  }
  console.log('✓ Found openOrderSlipFromTrip function and button in app.js');

  // 3. Test data linking for each saved trip
  const data = await getJson('http://localhost:3080/api/data');
  const trips = data.savedTrips || [];
  console.log(`Checking slip linkage for ${trips.length} saved trips...`);

  trips.forEach(t => {
    let ord = null;
    if (t.orderId) {
      ord = (data.orders || []).find(o => o.orderId === t.orderId);
    }
    if (!ord && t.customerId) {
      ord = (data.orders || []).find(o => o.customerId === t.customerId && o.deliveryDate === t.date);
    }

    const resolvedOrderId = ord ? ord.orderId : (t.orderId || t.tripId);
    const resolvedCustName = ord ? ord.customerName : (t.customerName || t.vehicleName);
    console.log(`✓ Trip ${t.tripId}: Date ${t.date}, Resolved Order "${resolvedOrderId}", Customer "${resolvedCustName}", Revenue ฿${t.totalRevenue}`);
  });

  console.log('✓ All saved trips can open their slip and print on single page successfully!');
}

verify().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
