async function runTest() {
  const baseUrl = 'http://localhost:3080';

  console.log('--- TEST 1: Create a new Sales Order for customer CUST-010 ---');
  const createOrderRes = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customerId: 'CUST-010',
      deliveryDate: '2026-10-28',
      deliveryTime: '10:00',
      qty189L: 8,
      qty350ml: 2,
      qty600ml: 3,
      qty1500ml: 0,
      unitPrice189L: 15,
      unitPrice350ml: 35,
      unitPrice600ml: 35,
      unitPrice1500ml: 35,
      orderStatus: 'ยังไม่ได้จัดส่ง',
      notes: 'ทดสอบเชื่อมโยง TMS กับสั่งน้ำดื่ม'
    })
  });
  const createOrderData = await createOrderRes.json();
  if (!createOrderData.ok) {
    throw new Error('Create order failed: ' + JSON.stringify(createOrderData));
  }

  const latestOrder = createOrderData.data.orders[0];
  console.log(`✓ Order Created: ${latestOrder.orderId} | Status: ${latestOrder.orderStatus} | Total: ฿${latestOrder.totalAmount}`);

  const custAfterOrder = createOrderData.data.customers.find(c => c.id === 'CUST-010');
  console.log(`✓ Customer TMS sync: selectedForRoute=${custAfterOrder.selectedForRoute}, deliveryStatus=${custAfterOrder.deliveryStatus}, orderBottles189L=${custAfterOrder.orderBottles189L}`);

  if (custAfterOrder.deliveryStatus !== 'pending') {
    throw new Error(`Expected deliveryStatus to be 'pending', got: ${custAfterOrder.deliveryStatus}`);
  }

  console.log('\n--- TEST 2: Driver Check-in via TMS (/api/delivery/checkin) ---');
  const checkinRes = await fetch(`${baseUrl}/api/delivery/checkin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customerId: 'CUST-010',
      deliveredBottles: 8,
      returnedBottles: 8
    })
  });
  const checkinData = await checkinRes.json();
  if (!checkinData.ok) {
    throw new Error('Checkin failed: ' + JSON.stringify(checkinData));
  }

  const checkedOrder = checkinData.data.orders.find(o => o.orderId === latestOrder.orderId);
  console.log(`✓ Order Status after check-in: ${checkedOrder.orderStatus} (completedAt: ${checkedOrder.completedAt})`);
  if (checkedOrder.orderStatus !== 'จัดส่งสำเร็จแล้ว') {
    throw new Error(`Expected orderStatus to be 'จัดส่งสำเร็จแล้ว', got: ${checkedOrder.orderStatus}`);
  }

  const custAfterCheckin = checkinData.data.customers.find(c => c.id === 'CUST-010');
  console.log(`✓ Customer status after check-in: deliveryStatus=${custAfterCheckin.deliveryStatus}, OutstandingBottles=${custAfterCheckin.OutstandingBottles}`);

  console.log('\n--- TEST 3: Close Route Trip (/api/trips) ---');
  const tripRes = await fetch(`${baseUrl}/api/trips`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tripId: 'TRIP-TEST-01',
      date: '2026-10-28',
      vehicleId: 'VEH-01',
      vehicleName: 'บท-1122 อุตรดิตถ์ (สมชาย ใจดี)',
      stopsCount: 1,
      totalDistanceKm: 12.5,
      estimatedTimeMin: 35,
      estimatedFuelCost: 150,
      totalBottles189L: 8,
      totalPacks: 5,
      totalRevenue: 295,
      status: 'บันทึกสายส่ง & ตัดค่าน้ำมันแล้ว',
      stopCustomerIds: ['CUST-010']
    })
  });
  const tripData = await tripRes.json();
  if (!tripData.ok) {
    throw new Error('Trip save failed: ' + JSON.stringify(tripData));
  }
  console.log(`✓ Trip saved: ${tripData.data.savedTrips[0].tripId} | Total Trips: ${tripData.data.savedTrips.length}`);
  const fuelExpense = tripData.data.expenses.find(e => e.date === '2026-10-28' && e.category === 'ค่าน้ำมันขนส่ง');
  console.log(`✓ Fuel expense recorded: ${fuelExpense?.id} ฿${fuelExpense?.amount}`);

  console.log('\n🎉 ALL TMS & SALES ORDER LINKING TESTS PASSED PERFECTLY!');
}

runTest().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
