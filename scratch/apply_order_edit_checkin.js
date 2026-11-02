const fs = require('fs');

const appPath = 'd:/13. Antigravity/Sunan/Inthara_program_develop/public/app.js';
let content = fs.readFileSync(appPath, 'utf8');

const oldCheckinBlockStart = 'function openCheckinModal(customerId) {';
const oldCheckinBlockEnd = 'function exportFullBackup() {';

const startIndex = content.indexOf(oldCheckinBlockStart);
const endIndex = content.indexOf(oldCheckinBlockEnd);

if (startIndex === -1 || endIndex === -1) {
  console.error('Error: Could not locate checkin block in app.js');
  process.exit(1);
}

const newCheckinBlock = `function openCheckinModal(customerId) {
  const cust = appData?.customers?.find(c => c.id === customerId);
  if (!cust) return;

  const pendingOrders = (appData?.orders || []).filter(o => o.customerId === customerId && o.orderStatus !== 'จัดส่งสำเร็จแล้ว' && o.orderStatus !== 'ยกเลิก');
  const mainOrder = pendingOrders[0];

  document.getElementById('checkinCustId').value = cust.id;
  document.getElementById('checkinOrderIds').value = mainOrder ? mainOrder.orderId : pendingOrders.map(o => o.orderId).join(',');

  const badgeEl = document.getElementById('checkinOrderBadge');
  if (badgeEl) {
    badgeEl.textContent = mainOrder ? \`📋 \${mainOrder.orderId}\` : 'ไม่มีเลขออเดอร์';
  }

  const titleEl = document.getElementById('checkinCustTitle');
  if (titleEl) {
    titleEl.textContent = \`\${cust.name} (โทร: \${cust.phone || '-'})\`;
  }
  
  const subEl = document.getElementById('checkinCustSub');
  if (subEl) {
    subEl.textContent = \`โซน: \${cust.zone || 'ทั่วไป'} | ที่อยู่: \${cust.address || '-'}\`;
  }

  // Pre-fill original ordered quantity labels
  const origQty189 = mainOrder ? Number(mainOrder.qty189L || 0) : Number(cust.orderBottles189L || 0);
  const origQty350 = mainOrder ? Number(mainOrder.qty350ml || 0) : Number(cust.orderPack350ml || 0);
  const origQty600 = mainOrder ? Number(mainOrder.qty600ml || 0) : Number(cust.orderPack600ml || 0);
  const origQty1500 = mainOrder ? Number(mainOrder.qty1500ml || 0) : Number(cust.orderPack1500ml || 0);

  const orig189El = document.getElementById('checkinOrig189');
  if (orig189El) orig189El.textContent = \`สั่ง: \${origQty189}\`;
  const orig350El = document.getElementById('checkinOrig350');
  if (orig350El) orig350El.textContent = \`สั่ง: \${origQty350}\`;
  const orig600El = document.getElementById('checkinOrig600');
  if (orig600El) orig600El.textContent = \`สั่ง: \${origQty600}\`;
  const orig1500El = document.getElementById('checkinOrig1500');
  if (orig1500El) orig1500El.textContent = \`สั่ง: \${origQty1500}\`;

  // Unit price labels
  const p189 = Number(mainOrder?.unitPrice189L ?? cust.price189L ?? 15);
  const p350 = Number(mainOrder?.unitPrice350ml ?? cust.price350ml ?? 35);
  const p600 = Number(mainOrder?.unitPrice600ml ?? cust.price600ml ?? 35);
  const p1500 = Number(mainOrder?.unitPrice1500ml ?? cust.price1500ml ?? 35);

  const price189El = document.getElementById('checkinPrice189Label');
  if (price189El) price189El.textContent = \`@ ฿\${p189}\`;
  const price350El = document.getElementById('checkinPrice350Label');
  if (price350El) price350El.textContent = \`@ ฿\${p350}\`;
  const price600El = document.getElementById('checkinPrice600Label');
  if (price600El) price600El.textContent = \`@ ฿\${p600}\`;
  const price1500El = document.getElementById('checkinPrice1500Label');
  if (price1500El) price1500El.textContent = \`@ ฿\${p1500}\`;

  // Pre-fill editable inputs
  const del189Input = document.getElementById('checkinDelivered');
  const del350Input = document.getElementById('checkinPacks350');
  const del600Input = document.getElementById('checkinPacks600');
  const del1500Input = document.getElementById('checkinPacks1500');
  const retInput = document.getElementById('checkinReturned');
  const notesInput = document.getElementById('checkinNotes');

  if (del189Input) del189Input.value = (cust.deliveryStatus === 'completed' && cust.deliveredBottles !== undefined) ? cust.deliveredBottles : origQty189;
  if (del350Input) del350Input.value = origQty350;
  if (del600Input) del600Input.value = origQty600;
  if (del1500Input) del1500Input.value = origQty1500;
  if (retInput) retInput.value = (cust.deliveryStatus === 'completed' && cust.returnedBottles !== undefined) ? cust.returnedBottles : origQty189;
  if (notesInput) notesInput.value = mainOrder?.notes || '';

  recalcCheckinModalTotals();

  const modal = document.getElementById('modalCheckin');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
}

function recalcCheckinModalTotals() {
  const custId = document.getElementById('checkinCustId')?.value;
  const orderId = document.getElementById('checkinOrderIds')?.value;
  const cust = appData?.customers?.find(c => c.id === custId);
  const order = (appData?.orders || []).find(o => o.orderId === orderId);

  const p189 = Number(order?.unitPrice189L ?? cust?.price189L ?? 15);
  const p350 = Number(order?.unitPrice350ml ?? cust?.price350ml ?? 35);
  const p600 = Number(order?.unitPrice600ml ?? cust?.price600ml ?? 35);
  const p1500 = Number(order?.unitPrice1500ml ?? cust?.price1500ml ?? 35);

  const q189 = Number(document.getElementById('checkinDelivered')?.value || 0);
  const q350 = Number(document.getElementById('checkinPacks350')?.value || 0);
  const q600 = Number(document.getElementById('checkinPacks600')?.value || 0);
  const q1500 = Number(document.getElementById('checkinPacks1500')?.value || 0);
  const ret189 = Number(document.getElementById('checkinReturned')?.value || 0);

  // Calculate live total money
  const totalAmount = (q189 * p189) + (q350 * p350) + (q600 * p600) + (q1500 * p1500);
  const totalEl = document.getElementById('checkinTotalAmount');
  if (totalEl) {
    totalEl.textContent = \`฿\${totalAmount.toLocaleString()}\`;
  }

  // Calculate live bottle balance
  const prevBottles = Number(cust?.OutstandingBottles || 0);
  const newBalance = Math.max(0, prevBottles + q189 - ret189);

  const balEl = document.getElementById('checkinBottleBalance');
  if (balEl) {
    balEl.innerHTML = \`
      <div class="flex items-center justify-between font-bold">
        <span>🧮 คำนวณถังค้างสะสม:</span>
        <span class="\${newBalance > prevBottles ? 'text-amber-700 font-extrabold' : 'text-emerald-700 font-extrabold'}">\${newBalance} ใบ</span>
      </div>
      <div class="text-[10px] text-slate-500 mt-0.5">
        เดิมค้าง \${prevBottles} + ส่งจริง \${q189} - รับคืน \${ret189} = คงเหลือค้างที่ร้าน <b>\${newBalance}</b> ใบ
      </div>
    \`;
  }
}

function updateCheckinBottleBalance() {
  recalcCheckinModalTotals();
}

function closeCheckinModal() {
  document.getElementById('modalCheckin').classList.add('hidden');
  document.getElementById('modalCheckin').classList.remove('flex');
}

async function submitDriverCheckin(e) {
  e.preventDefault();
  const custId = document.getElementById('checkinCustId').value;
  const cust = appData?.customers?.find(c => c.id === custId);
  const custName = cust ? cust.name : custId;
  const orderId = document.getElementById('checkinOrderIds')?.value || '';

  const delivered189 = Number(document.getElementById('checkinDelivered').value || 0);
  const delivered350 = Number(document.getElementById('checkinPacks350').value || 0);
  const delivered600 = Number(document.getElementById('checkinPacks600').value || 0);
  const delivered1500 = Number(document.getElementById('checkinPacks1500').value || 0);
  const returnedBottles = Number(document.getElementById('checkinReturned').value || 0);
  const notes = document.getElementById('checkinNotes')?.value.trim() || '';

  const submitBtn = document.getElementById('btnCheckinSubmit');
  const origBtnText = submitBtn ? submitBtn.innerHTML : '✅ คอนเฟิร์มและบันทึกปิดงาน';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>⏳ กำลังบันทึก...</span>';
  }

  try {
    const payload = {
      customerId: custId,
      orderId: orderId,
      deliveredBottles: delivered189,
      deliveredPacks350: delivered350,
      deliveredPacks600: delivered600,
      deliveredPacks1500: delivered1500,
      returnedBottles,
      notes
    };
    const res = await fetch('/api/delivery/checkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const out = await res.json();
    if (out.ok) {
      appData = out.data;
      closeCheckinModal();

      // Mark this stop as completed in the active sequence
      const activeStop = currentOrderedStops.find(s => s.id === custId);
      if (activeStop) {
        activeStop.deliveryStatus = 'completed';
        activeStop.deliveredBottles = delivered189;
        activeStop.returnedBottles = returnedBottles;
        activeStop.orderPack350ml = delivered350;
        activeStop.orderPack600ml = delivered600;
        activeStop.orderPack1500ml = delivered1500;
      }

      recalculateCurrentRoute();
      renderAllViews();

      alert(\`✅ คอนเฟิร์มส่งน้ำร้าน [\${custName}] สำเร็จ!\\n• ปรับปรุงยอดตามจำนวนส่งจริงเรียบร้อย\\n• อัปเดตสถานะออเดอร์เป็น "จัดส่งสำเร็จแล้ว"\`);
    } else {
      alert(out.error || 'ไม่สามารถบันทึกการส่งได้');
    }
  } catch (err) {
    alert('เกิดข้อผิดพลาดในการบันทึกการส่ง');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = origBtnText;
    }
  }
}

`;

content = content.slice(0, startIndex) + newCheckinBlock + content.slice(endIndex);
fs.writeFileSync(appPath, content, 'utf8');
console.log('✓ Successfully updated checkin methods in public/app.js');
