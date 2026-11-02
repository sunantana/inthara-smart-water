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
    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function runTests() {
  console.log('--- STARTING CUSTOMER DEPOSIT & CHECKIN TEST ---');

  // 1. Get initial state
  const stateRes = await request({
    hostname: 'localhost',
    port: 3080,
    path: '/api/data',
    method: 'GET'
  });
  const state = stateRes.data;

  // Pick a customer with a valid phone or set a valid phone
  let testCust = state.customers.find(c => c.phone && c.phone.replace(/\D/g, '').length >= 9) || state.customers[0];
  if (!testCust.phone || testCust.phone.replace(/\D/g, '').length < 9) {
    testCust.phone = '0852798343';
  }
  console.log(`Using customer: ${testCust.name} (ID: ${testCust.id}, Initial Credit Balance: ฿${testCust.creditBalance || 0})`);

  // 2. Update Customer with Deposit bottles & rate
  const initialCredit = Number(testCust.creditBalance) || 0;
  const updatePayload = {
    ...testCust,
    depositBottles: 15,
    depositRate: 200,
    bottleDeposit: 3000,
    creditLimit: 10000,
    creditBalance: initialCredit,
    OutstandingBottles: 12
  };

  const custSaveRes = await request({
    hostname: 'localhost',
    port: 3080,
    path: '/api/customers',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, updatePayload);

  console.log('2. Customer update status:', custSaveRes.status);
  if (!custSaveRes.data.ok) {
    console.error('Error saving customer:', custSaveRes.data);
    throw new Error('Save customer failed');
  }

  const updatedCust = custSaveRes.data.data.customers.find(c => c.id === testCust.id);
  console.log(`   Saved Customer: ${updatedCust.name}`);
  console.log(`   Deposit Bottles: ${updatedCust.depositBottles}, Rate: ${updatedCust.depositRate}, Total: ฿${updatedCust.bottleDeposit}`);
  console.log(`   Outstanding Bottles: ${updatedCust.OutstandingBottles}`);

  if (updatedCust.bottleDeposit !== 3000 || updatedCust.depositBottles !== 15) {
    throw new Error('Customer deposit calculation or persistence mismatch!');
  }

  // 3. Test Check-in with Credit (Down on account / เครดิต)
  const creditCheckinPayload = {
    customerId: testCust.id,
    deliveredBottles: 10,
    deliveredPacks350: 0,
    deliveredPacks600: 0,
    deliveredPacks1500: 0,
    returnedBottles: 10,
    paymentMode: 'credit',
    moneyReceived: 0,
    notes: 'ส่งเรียบร้อย - ลงบัญชีเครดิตตามรอบวางบิล'
  };

  const checkinRes = await request({
    hostname: 'localhost',
    port: 3080,
    path: '/api/delivery/checkin',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, creditCheckinPayload);

  console.log('3. Credit Checkin status:', checkinRes.status);
  const updatedDb = checkinRes.data.data;
  const refreshedCust = updatedDb.customers.find(c => c.id === testCust.id);
  const expectedCredit = initialCredit + 150; // 10 bottles * 15 baht = 150
  console.log(`   Customer ${refreshedCust.name} new Credit Balance: ฿${refreshedCust.creditBalance} (Expected: ฿${expectedCredit})`);

  const savedTrip = updatedDb.savedTrips[0];
  console.log(`   Saved Trip recorded: TripId: ${savedTrip.tripId}, Payment Mode: ${savedTrip.paymentMode}, Unpaid: ฿${savedTrip.unpaidAmount}, Collected: ฿${savedTrip.moneyCollected}`);

  if (refreshedCust.creditBalance !== expectedCredit) {
    throw new Error(`Credit balance mismatch! Got ${refreshedCust.creditBalance}, expected ${expectedCredit}`);
  }

  if (savedTrip.paymentMode !== 'credit' || savedTrip.unpaidAmount !== 150 || savedTrip.moneyCollected !== 0) {
    throw new Error('Saved Trip payment details mismatch!');
  }

  // 4. Test Check-in with Cash (ชำระเงินสด / โอนแล้ว)
  const cashCheckinPayload = {
    customerId: testCust.id,
    deliveredBottles: 5,
    deliveredPacks350: 0,
    deliveredPacks600: 0,
    deliveredPacks1500: 0,
    returnedBottles: 5,
    paymentMode: 'cash',
    moneyReceived: 75, // 5 * 15 = 75
    notes: 'จ่ายเงินสดเรียบร้อย'
  };

  const cashCheckinRes = await request({
    hostname: 'localhost',
    port: 3080,
    path: '/api/delivery/checkin',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, cashCheckinPayload);

  console.log('4. Cash Checkin status:', cashCheckinRes.status);
  const cashUpdatedDb = cashCheckinRes.data.data;
  const custAfterCash = cashUpdatedDb.customers.find(c => c.id === testCust.id);
  console.log(`   Customer ${custAfterCash.name} Credit Balance after cash payment: ฿${custAfterCash.creditBalance} (Should remain ฿${expectedCredit})`);

  const cashTrip = cashUpdatedDb.savedTrips[0];
  console.log(`   Cash Trip recorded: TripId: ${cashTrip.tripId}, Payment Mode: ${cashTrip.paymentMode}, Collected: ฿${cashTrip.moneyCollected}, Unpaid: ฿${cashTrip.unpaidAmount}`);

  if (custAfterCash.creditBalance !== expectedCredit) {
    throw new Error('Credit balance changed unexpectedly after cash payment!');
  }
  if (cashTrip.paymentMode !== 'cash' || cashTrip.moneyCollected !== 75 || cashTrip.unpaidAmount !== 0) {
    throw new Error('Cash trip details mismatch!');
  }

  console.log('--- ALL TESTS PASSED PERFECTLY! ---');
}

runTests().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
