const http = require('http');

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
  console.log('Testing TMS History & Checkin Logging...');
  const today = new Date().toISOString().slice(0, 10);
  console.log('Today is:', today);

  // 1. Fetch current data
  const initRes = await getJson('http://localhost:3080/api/data');
  const appData = initRes.data;
  console.log('Existing savedTrips count:', (appData.savedTrips || []).length);

  // 2. Perform a checkin for a customer to verify auto-logging
  const testCustomer = (appData.customers && appData.customers[0]) ? appData.customers[0] : { id: 'CUST-001', name: 'Test Cust' };
  console.log('Testing checkin for customer:', testCustomer.id, testCustomer.name);

  const checkinPayload = {
    customerId: testCustomer.id,
    deliveredBottles: 12,
    deliveredPacks350: 4,
    deliveredPacks600: 5,
    deliveredPacks1500: 2,
    returnedBottles: 10,
    notes: 'ทดสอบระบบประวัติสายส่งตามวันที่'
  };

  const checkinRes = await postJson('http://localhost:3080/api/delivery/checkin', checkinPayload);
  console.log('Checkin response ok:', checkinRes.data.ok);

  // 3. Verify that savedTrips now has the newly logged trip with today's date
  const updatedDataRes = await getJson('http://localhost:3080/api/data');
  const updatedData = updatedDataRes.data;
  const latestTrip = updatedData.savedTrips[0];

  console.log('Latest trip:', JSON.stringify(latestTrip, null, 2));

  if (!latestTrip) {
    throw new Error('No trip recorded in savedTrips!');
  }
  if (latestTrip.date !== today) {
    throw new Error(`Expected trip date ${today}, but got ${latestTrip.date}`);
  }
  if (latestTrip.totalBottles189L !== 12) {
    throw new Error(`Expected 12 bottles, got ${latestTrip.totalBottles189L}`);
  }
  if (latestTrip.totalPacks !== (4 + 5 + 2)) {
    throw new Error(`Expected 11 packs, got ${latestTrip.totalPacks}`);
  }

  // 4. Test date filter simulation
  const tripsToday = updatedData.savedTrips.filter(t => t.date === today);
  const tripsYesterday = updatedData.savedTrips.filter(t => t.date === '2026-10-27');
  const allTrips = updatedData.savedTrips;

  console.log(`Filter results: Today (${today}) = ${tripsToday.length}, Yesterday = ${tripsYesterday.length}, All = ${allTrips.length}`);
  console.log('✓ All verification tests passed successfully!');
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
