async function testOrderEditCheckin() {
  const baseUrl = 'http://localhost:3080';

  console.log('--- STEP 1: Create Order with 15 bottles 18.9L and 27 packs 600ml ---');
  const orderRes = await fetch(`${baseUrl}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customerId: 'CUST-010',
      deliveryDate: '2026-10-28',
      deliveryTime: '09:00',
      qty189L: 15,
      qty350ml: 0,
      qty600ml: 27,
      qty1500ml: 0,
      unitPrice189L: 15,
      unitPrice350ml: 35,
      unitPrice600ml: 35,
      unitPrice1500ml: 35,
      orderStatus: 'ยังไม่ได้จัดส่ง',
      notes: 'ออเดอร์เดิมก่อนส่ง'
    })
  });
  const orderData = await orderRes.json();
  const createdOrder = orderData.data.orders[0];
  console.log(`✓ Order Created: ${createdOrder.orderId} | Total: ฿${createdOrder.totalAmount} (Qty 18.9L: ${createdOrder.qty189L}, 600ml: ${createdOrder.qty600ml})`);

  console.log('\n--- STEP 2: Driver Check-in with EDITED Quantities (Deliver 10 bottles 18.9L instead of 15, and 27 packs 600ml, Return 10 empties) ---');
  const checkinRes = await fetch(`${baseUrl}/api/delivery/checkin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      customerId: 'CUST-010',
      orderId: createdOrder.orderId,
      deliveredBottles: 10,
      deliveredPacks350: 0,
      deliveredPacks600: 27,
      deliveredPacks1500: 0,
      returnedBottles: 10,
      notes: 'ลูกค้าขอปรับลด 18.9L เหลือ 10 ถัง'
    })
  });
  const checkinData = await checkinRes.json();
  if (!checkinData.ok) {
    throw new Error('Checkin failed: ' + JSON.stringify(checkinData));
  }

  const updatedOrder = checkinData.data.orders.find(o => o.orderId === createdOrder.orderId);
  console.log(`✓ Updated Order Confirmed Quantities: 18.9L=${updatedOrder.qty189L}, 600ml=${updatedOrder.qty600ml}`);
  console.log(`✓ Updated Order Total Amount: ฿${updatedOrder.totalAmount} (Expected: ฿1095)`);
  console.log(`✓ Updated Order Status: ${updatedOrder.orderStatus} (completedAt: ${updatedOrder.completedAt})`);
  console.log(`✓ Notes: ${updatedOrder.notes}`);

  if (updatedOrder.qty189L !== 10) throw new Error('Expected qty189L to be 10, got: ' + updatedOrder.qty189L);
  if (updatedOrder.totalAmount !== 1095) throw new Error('Expected totalAmount to be 1095, got: ' + updatedOrder.totalAmount);
  if (updatedOrder.orderStatus !== 'จัดส่งสำเร็จแล้ว') throw new Error('Expected orderStatus to be จัดส่งสำเร็จแล้ว');

  const cust = checkinData.data.customers.find(c => c.id === 'CUST-010');
  console.log(`✓ Customer Delivery Status: ${cust.deliveryStatus}, OutstandingBottles: ${cust.OutstandingBottles}`);

  console.log('\n🎉 ALL EDIT-ORDER & CONFIRM-DELIVERY TESTS PASSED PERFECTLY!');
}

testOrderEditCheckin().catch(err => {
  console.error('Test Failed:', err);
  process.exit(1);
});
