const fs = require('fs');

const htmlPath = 'd:/13. Antigravity/Sunan/Inthara_program_develop/public/index.html';
const appPath = 'd:/13. Antigravity/Sunan/Inthara_program_develop/public/app.js';
const serverPath = 'd:/13. Antigravity/Sunan/Inthara_program_develop/server.js';

let html = fs.readFileSync(htmlPath, 'utf8');
let app = fs.readFileSync(appPath, 'utf8');
let srv = fs.readFileSync(serverPath, 'utf8');

// ==========================================
// 1. UPDATE index.html
// ==========================================
console.log('1. Updating index.html...');

// 1.1 Customer Form: Redesign Deposit & Credit/Inventory section
const oldCustGridStart = '<!-- Credit Limit, Balance, Deposit, Bottles Held (4 Columns) - Default 0 -->';
const oldCustGridEnd = '<!-- Notes Row -->';

const cgStart = html.indexOf(oldCustGridStart);
const cgEnd = html.indexOf(oldCustGridEnd, cgStart);

if (cgStart === -1 || cgEnd === -1) {
  console.error('Error: Could not find oldCustGrid in index.html');
  process.exit(1);
}

const newCustGridHtml = `<!-- มัดจำถัง 18.9L (จำนวนถัง x ค่ามัดจำต่อใบ = ยอดเงินมัดจำรวม) -->
                <div class="bg-emerald-50/70 border border-emerald-200/90 rounded-xl p-2.5 mt-2.5 space-y-1.5">
                  <div class="flex items-center justify-between">
                    <span class="text-[11px] font-bold text-emerald-900 flex items-center gap-1">
                      <span>🪣</span> <span>การมัดจำถัง 18.9 ลิตร</span>
                    </span>
                    <span class="text-[10px] text-emerald-700 font-medium">คำนวณเงินมัดจำอัตโนมัติ</span>
                  </div>
                  <div class="grid grid-cols-3 gap-2 items-center">
                    <div>
                      <label class="block text-slate-500 mb-0.5 text-[10px]">จำนวนถังมัดจำ (ใบ)</label>
                      <input id="custFormDepositBottles" oninput="recalcCustomerDepositTotal()" type="number" min="0" class="w-full border border-slate-200 bg-white rounded-lg px-2 py-1 text-slate-800 text-xs text-center font-bold font-mono" value="0" />
                    </div>
                    <div>
                      <label class="block text-slate-500 mb-0.5 text-[10px]">ค่ามัดจำ/ถัง (฿)</label>
                      <input id="custFormDepositRate" oninput="recalcCustomerDepositTotal()" type="number" min="0" step="10" class="w-full border border-slate-200 bg-white rounded-lg px-2 py-1 text-slate-800 text-xs text-center font-bold font-mono" value="200" />
                    </div>
                    <div>
                      <label class="block text-emerald-800 mb-0.5 text-[10px] font-semibold">เงินมัดจำรวม (฿)</label>
                      <input id="custFormDepositAmount" readonly tabindex="-1" type="number" class="w-full border border-emerald-300 bg-emerald-100/70 text-emerald-950 rounded-lg px-2 py-1 text-xs text-center font-black font-mono cursor-not-allowed select-none" value="0" />
                    </div>
                  </div>
                </div>

                <!-- เครดิต & ยอดคงค้างจริงในระบบ (วงเงิน, ค้างชำระ, ถังค้างร้าน) -->
                <div class="grid grid-cols-3 gap-2 mt-2">
                  <div>
                    <label class="block text-slate-500 mb-1 text-[10px]">วงเงินเครดิต (฿)</label>
                    <input id="custFormCreditLimit" type="number" min="0" class="w-full border border-slate-200 bg-white rounded-lg px-2 py-1 text-slate-700 text-xs text-center font-mono font-medium" value="0" placeholder="0" />
                  </div>
                  <div>
                    <div class="flex items-center justify-between mb-1">
                      <label class="block text-slate-500 text-[10px]">ค้างชำระจริง (฿)</label>
                    </div>
                    <input id="custFormCreditBalance" type="number" class="w-full border border-slate-200 bg-slate-50 text-slate-800 rounded-lg px-2 py-1 text-xs text-center font-bold font-mono" value="0" title="ยอดเงินค้างชำระที่สะสมจากการส่งแบบเครดิต/ลงบัญชี" />
                  </div>
                  <div>
                    <div class="flex items-center justify-between mb-1">
                      <label class="block text-slate-500 text-[10px]">ถังค้างร้าน (ใบ)</label>
                    </div>
                    <input id="custFormBottlesHeld" type="number" class="w-full border border-slate-200 bg-slate-50 text-slate-800 rounded-lg px-2 py-1 text-xs text-center font-bold font-mono" value="0" title="จำนวนถัง 18.9L ที่อยู่ที่ร้าน (อัปเดตอัตโนมัติตามการส่ง-คืนถังจริง)" />
                  </div>
                </div>
                `;

html = html.slice(0, cgStart) + newCustGridHtml + html.slice(cgEnd);
console.log('✓ Successfully updated Customer Form Deposit & Debt fields');

// 1.2 modalCheckin: Add Payment Mode Selection (Cash vs Credit)
const oldCheckinTotalStart = '<!-- Total Money Summary Box -->';
const oldCheckinTotalEnd = '<!-- Bottle Return & Debt Balance Section -->';

const ctStart = html.indexOf(oldCheckinTotalStart);
const ctEnd = html.indexOf(oldCheckinTotalEnd, ctStart);

if (ctStart === -1 || ctEnd === -1) {
  console.error('Error: Could not find oldCheckinTotal in index.html');
  process.exit(1);
}

const newCheckinPaymentHtml = `<!-- Total Money Summary Box -->
          <div class="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 flex items-center justify-between text-xs mt-1">
            <span class="font-bold text-emerald-900 flex items-center gap-1">
              <span>💰</span> <span>รวมยอดเงินที่ต้องเรียกเก็บ:</span>
            </span>
            <span id="checkinTotalAmount" class="font-black text-emerald-950 text-base">฿0</span>
          </div>
        </div>

        <!-- Payment Collection Option (Cash vs Credit / ลงบัญชี) -->
        <div class="rounded-xl border border-slate-200 bg-white p-3 space-y-2.5 shadow-2xs">
          <div class="flex items-center justify-between pb-1 border-b border-slate-100">
            <span class="font-bold text-slate-800 text-xs flex items-center gap-1.5">
              <span>💵</span> <span>การชำระเงินของรอบส่งนี้</span>
            </span>
            <span id="checkinCustTermBadge" class="text-[10px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full"></span>
          </div>

          <!-- Radio Selection: Cash vs Credit -->
          <div class="grid grid-cols-2 gap-2 text-xs">
            <label class="cursor-pointer border-2 border-emerald-500 bg-emerald-50/80 rounded-xl p-2.5 flex items-start gap-2 transition" id="lblCheckinPayCash">
              <input type="radio" name="checkinPaymentMode" id="checkinPayCash" value="cash" checked onchange="onCheckinPaymentModeChange()" class="mt-0.5 text-emerald-600 focus:ring-emerald-500" />
              <div>
                <div class="font-bold text-emerald-950 text-xs flex items-center gap-1">
                  <span>🟢 รับเงินสด / โอนแล้ว</span>
                </div>
                <div class="text-[10px] text-emerald-700 mt-0.5">รับเงินเข้ากระเป๋าคนขับแล้ว (ไม่ค้างชำระ)</div>
              </div>
            </label>

            <label class="cursor-pointer border-2 border-slate-200 hover:border-amber-400 bg-white rounded-xl p-2.5 flex items-start gap-2 transition" id="lblCheckinPayCredit">
              <input type="radio" name="checkinPaymentMode" id="checkinPayCredit" value="credit" onchange="onCheckinPaymentModeChange()" class="mt-0.5 text-amber-600 focus:ring-amber-500" />
              <div>
                <div class="font-bold text-amber-950 text-xs flex items-center gap-1">
                  <span>🟡 ลงบัญชี / เครดิต</span>
                </div>
                <div class="text-[10px] text-amber-700 mt-0.5">ยังไม่จ่าย (สะสมยอดหนี้ค้างชำระ)</div>
              </div>
            </label>
          </div>

          <!-- Money Received Input & Summary -->
          <div class="bg-slate-50 border border-slate-200 rounded-lg p-2.5 flex items-center justify-between gap-2 text-xs">
            <div>
              <span class="text-[11px] text-slate-600 font-semibold block">เงินที่คนขับรับจริง (บาท):</span>
              <span id="checkinPayNotice" class="text-[10px] text-emerald-600 font-medium">รับครบเต็มจำนวน</span>
            </div>
            <div class="flex items-center gap-1">
              <span class="text-sm font-bold text-slate-500">฿</span>
              <input id="checkinMoneyReceived" type="number" min="0" step="1" oninput="onCheckinMoneyReceivedInput()" class="w-28 border border-slate-300 bg-white rounded-lg px-2.5 py-1 text-sm font-black text-slate-900 text-right font-mono" />
            </div>
          </div>
        </div>

        `;

html = html.slice(0, ctStart) + newCheckinPaymentHtml + html.slice(ctEnd);
fs.writeFileSync(htmlPath, html, 'utf8');
console.log('✓ Successfully updated modalCheckin with Payment Collection Section');


// ==========================================
// 2. UPDATE app.js
// ==========================================
console.log('2. Updating app.js...');

// 2.1 Customer Master Deposit recalculation and form handling
const oldCustFormReset = `document.getElementById('custFormCreditLimit').value = '0';
  document.getElementById('custFormCreditBalance').value = '0';
  document.getElementById('custFormDeposit').value = '0';
  document.getElementById('custFormBottlesHeld').value = '0';`;

const newCustFormReset = `document.getElementById('custFormDepositBottles').value = '0';
  document.getElementById('custFormDepositRate').value = '200';
  document.getElementById('custFormDepositAmount').value = '0';
  document.getElementById('custFormCreditLimit').value = '0';
  document.getElementById('custFormCreditBalance').value = '0';
  document.getElementById('custFormBottlesHeld').value = '0';`;

if (app.includes(oldCustFormReset)) {
  app = app.replace(oldCustFormReset, newCustFormReset);
  console.log('✓ Updated resetCustomerMasterForm in app.js');
}

const oldCustEditPopulate = `document.getElementById('custFormCreditLimit').value = c.creditLimit ?? 0;
  document.getElementById('custFormCreditBalance').value = c.creditBalance ?? 0;
  document.getElementById('custFormDeposit').value = c.bottleDeposit ?? ((c.OutstandingBottles || 0) * 100);
  document.getElementById('custFormBottlesHeld').value = c.OutstandingBottles ?? 0;`;

const newCustEditPopulate = `const depBottles = c.depositBottles ?? (c.bottleDeposit ? Math.round(c.bottleDeposit / (c.depositRate || 200)) : 0);
  const depRate = c.depositRate ?? 200;
  document.getElementById('custFormDepositBottles').value = depBottles;
  document.getElementById('custFormDepositRate').value = depRate;
  document.getElementById('custFormDepositAmount').value = c.bottleDeposit ?? (depBottles * depRate);
  document.getElementById('custFormCreditLimit').value = c.creditLimit ?? 0;
  document.getElementById('custFormCreditBalance').value = c.creditBalance ?? 0;
  document.getElementById('custFormBottlesHeld').value = c.OutstandingBottles ?? 0;`;

if (app.includes(oldCustEditPopulate)) {
  app = app.replace(oldCustEditPopulate, newCustEditPopulate);
  console.log('✓ Updated editCustomerRecord in app.js');
}

const oldCustSubmitPayload = `creditLimit: Number(document.getElementById('custFormCreditLimit').value),
    creditBalance: Number(document.getElementById('custFormCreditBalance').value),
    bottleDeposit: Number(document.getElementById('custFormDeposit').value),
    OutstandingBottles: Number(document.getElementById('custFormBottlesHeld').value),`;

const newCustSubmitPayload = `depositBottles: Number(document.getElementById('custFormDepositBottles')?.value || 0),
    depositRate: Number(document.getElementById('custFormDepositRate')?.value || 200),
    bottleDeposit: Number(document.getElementById('custFormDepositAmount')?.value || 0),
    creditLimit: Number(document.getElementById('custFormCreditLimit')?.value || 0),
    creditBalance: Number(document.getElementById('custFormCreditBalance')?.value || 0),
    OutstandingBottles: Number(document.getElementById('custFormBottlesHeld')?.value || 0),`;

if (app.includes(oldCustSubmitPayload)) {
  app = app.replace(oldCustSubmitPayload, newCustSubmitPayload);
  console.log('✓ Updated submitCustomerMasterForm payload in app.js');
}

// Add recalcCustomerDepositTotal function
if (!app.includes('function recalcCustomerDepositTotal()')) {
  const insertMarker = 'function resetCustomerMasterForm() {';
  const newDepositFn = `function recalcCustomerDepositTotal() {
  const b = Math.max(0, Number(document.getElementById('custFormDepositBottles')?.value || 0));
  const r = Math.max(0, Number(document.getElementById('custFormDepositRate')?.value || 200));
  const total = b * r;
  const totalEl = document.getElementById('custFormDepositAmount');
  if (totalEl) totalEl.value = total;
}

`;
  app = app.replace(insertMarker, newDepositFn + insertMarker);
  console.log('✓ Added recalcCustomerDepositTotal in app.js');
}

// 2.2 Update openCheckinModal, recalcCheckinModalTotals, and submitDriverCheckin
const oldCheckinTotalsFn = `  // Calculate live total money
  const totalAmount = (q189 * p189) + (q350 * p350) + (q600 * p600) + (q1500 * p1500);
  const totalEl = document.getElementById('checkinTotalAmount');
  if (totalEl) {
    totalEl.textContent = \`฿\${totalAmount.toLocaleString()}\`;
  }`;

const newCheckinTotalsFn = `  // Calculate live total money
  const totalAmount = (q189 * p189) + (q350 * p350) + (q600 * p600) + (q1500 * p1500);
  const totalEl = document.getElementById('checkinTotalAmount');
  if (totalEl) {
    totalEl.textContent = \`฿\${totalAmount.toLocaleString()}\`;
  }

  // Update Payment Mode defaults & money received
  const isCreditMode = document.getElementById('checkinPayCredit')?.checked;
  const moneyInput = document.getElementById('checkinMoneyReceived');
  const payNotice = document.getElementById('checkinPayNotice');

  if (moneyInput) {
    if (isCreditMode) {
      if (!moneyInput.dataset.manualEdit) moneyInput.value = 0;
    } else {
      if (!moneyInput.dataset.manualEdit) moneyInput.value = totalAmount;
    }
  }

  if (payNotice && moneyInput) {
    const received = Number(moneyInput.value || 0);
    const unpaid = Math.max(0, totalAmount - received);
    if (isCreditMode) {
      if (unpaid > 0) {
        payNotice.textContent = \`🟡 ลงบัญชี/เครดิต: ยอดหนี้ค้างชำระเพิ่ม +฿\${unpaid.toLocaleString()}\`;
        payNotice.className = 'text-[10px] text-amber-800 font-bold';
      } else {
        payNotice.textContent = '🟢 ชำระครบเต็มจำนวนแล้ว';
        payNotice.className = 'text-[10px] text-emerald-700 font-bold';
      }
    } else {
      if (unpaid > 0) {
        payNotice.textContent = \`รับเงิน ฿\${received.toLocaleString()} • ยอดหนี้ค้างชำระเพิ่ม +฿\${unpaid.toLocaleString()}\`;
        payNotice.className = 'text-[10px] text-amber-800 font-bold';
      } else {
        payNotice.textContent = '🟢 รับเงินสด/โอนครบเต็มจำนวน (ไม่เพิ่มยอดหนี้ค้าง)';
        payNotice.className = 'text-[10px] text-emerald-700 font-bold';
      }
    }
  }`;

if (app.includes(oldCheckinTotalsFn)) {
  app = app.replace(oldCheckinTotalsFn, newCheckinTotalsFn);
  console.log('✓ Updated recalcCheckinModalTotals in app.js');
}

// Add onCheckinPaymentModeChange & onCheckinMoneyReceivedInput
const checkinFnsMarker = 'function updateCheckinBottleBalance() {';
const newPaymentFns = `function onCheckinPaymentModeChange() {
  const isCredit = document.getElementById('checkinPayCredit')?.checked;
  const lblCash = document.getElementById('lblCheckinPayCash');
  const lblCredit = document.getElementById('lblCheckinPayCredit');
  const moneyInput = document.getElementById('checkinMoneyReceived');

  if (isCredit) {
    if (lblCredit) lblCredit.className = 'cursor-pointer border-2 border-amber-500 bg-amber-50/80 rounded-xl p-2.5 flex items-start gap-2 transition';
    if (lblCash) lblCash.className = 'cursor-pointer border-2 border-slate-200 hover:border-emerald-400 bg-white rounded-xl p-2.5 flex items-start gap-2 transition';
  } else {
    if (lblCash) lblCash.className = 'cursor-pointer border-2 border-emerald-500 bg-emerald-50/80 rounded-xl p-2.5 flex items-start gap-2 transition';
    if (lblCredit) lblCredit.className = 'cursor-pointer border-2 border-slate-200 hover:border-amber-400 bg-white rounded-xl p-2.5 flex items-start gap-2 transition';
  }

  if (moneyInput) delete moneyInput.dataset.manualEdit;
  recalcCheckinModalTotals();
}

function onCheckinMoneyReceivedInput() {
  const moneyInput = document.getElementById('checkinMoneyReceived');
  if (moneyInput) moneyInput.dataset.manualEdit = 'true';
  recalcCheckinModalTotals();
}

`;

if (!app.includes('function onCheckinPaymentModeChange()')) {
  app = app.replace(checkinFnsMarker, newPaymentFns + checkinFnsMarker);
  console.log('✓ Added onCheckinPaymentModeChange & onCheckinMoneyReceivedInput in app.js');
}

// In openCheckinModal, pre-select cash vs credit based on customer payment term
const oldCheckinPreOpen = `  if (retInput) retInput.value = (cust.deliveryStatus === 'completed' && cust.returnedBottles !== undefined) ? cust.returnedBottles : origQty189;
  if (notesInput) notesInput.value = mainOrder?.notes || '';

  recalcCheckinModalTotals();`;

const newCheckinPreOpen = `  if (retInput) retInput.value = (cust.deliveryStatus === 'completed' && cust.returnedBottles !== undefined) ? cust.returnedBottles : origQty189;
  if (notesInput) notesInput.value = mainOrder?.notes || '';

  // Pre-select payment mode based on customer term
  const termBadge = document.getElementById('checkinCustTermBadge');
  const payCashRadio = document.getElementById('checkinPayCash');
  const payCreditRadio = document.getElementById('checkinPayCredit');
  const moneyInput = document.getElementById('checkinMoneyReceived');
  if (moneyInput) delete moneyInput.dataset.manualEdit;

  const isCreditCust = String(cust.paymentTerm || '').includes('เครดิต');
  if (termBadge) {
    termBadge.textContent = isCreditCust ? \`💳 ลูกค้าเครดิต (\${cust.paymentTerm})\` : \`💵 ลูกค้าเงินสด (\${cust.paymentTerm || 'เงินสด / โอนเงิน'})\`;
    termBadge.className = isCreditCust ? 'text-[10px] font-bold text-amber-800 bg-amber-100 px-2.5 py-0.5 rounded-full' : 'text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full';
  }

  if (isCreditCust) {
    if (payCreditRadio) payCreditRadio.checked = true;
    onCheckinPaymentModeChange();
  } else {
    if (payCashRadio) payCashRadio.checked = true;
    onCheckinPaymentModeChange();
  }

  recalcCheckinModalTotals();`;

if (app.includes(oldCheckinPreOpen)) {
  app = app.replace(oldCheckinPreOpen, newCheckinPreOpen);
  console.log('✓ Updated openCheckinModal to pre-select payment mode based on customer term');
}

// Update submitDriverCheckin payload
const oldSubmitPayload = `const payload = {
      customerId: custId,
      orderId: orderId,
      deliveredBottles: delivered189,
      deliveredPacks350: delivered350,
      deliveredPacks600: delivered600,
      deliveredPacks1500: delivered1500,
      returnedBottles,
      notes
    };`;

const newSubmitPayload = `const isCreditMode = document.getElementById('checkinPayCredit')?.checked;
    const paymentMode = isCreditMode ? 'credit' : 'cash';
    const moneyReceived = Number(document.getElementById('checkinMoneyReceived')?.value || 0);

    const payload = {
      customerId: custId,
      orderId: orderId,
      deliveredBottles: delivered189,
      deliveredPacks350: delivered350,
      deliveredPacks600: delivered600,
      deliveredPacks1500: delivered1500,
      returnedBottles,
      paymentMode,
      moneyReceived,
      notes
    };`;

if (app.includes(oldSubmitPayload)) {
  app = app.replace(oldSubmitPayload, newSubmitPayload);
  console.log('✓ Updated submitDriverCheckin payload in app.js');
}

fs.writeFileSync(appPath, app, 'utf8');
console.log('✓ Successfully written app.js');


// ==========================================
// 3. UPDATE server.js
// ==========================================
console.log('3. Updating server.js /api/delivery/checkin and normalizeCustomer...');

// 3.1 In normalizeCustomer, add depositBottles and depositRate
const oldNormDeposit = `creditBalance: Number(c.creditBalance ?? 0),
    bottleDeposit: Number(c.bottleDeposit ?? (Number(c.OutstandingBottles || 0) * 100)),`;

const newNormDeposit = `creditBalance: Number(c.creditBalance ?? 0),
    depositBottles: Number(c.depositBottles ?? (c.bottleDeposit ? Math.round(c.bottleDeposit / (c.depositRate || 200)) : 0)),
    depositRate: Number(c.depositRate ?? 200),
    bottleDeposit: Number(c.bottleDeposit ?? (Number(c.depositBottles || 0) * Number(c.depositRate || 200))),`;

if (srv.includes(oldNormDeposit)) {
  srv = srv.replace(oldNormDeposit, newNormDeposit);
  console.log('✓ Updated normalizeCustomer in server.js');
}

// 3.2 In /api/delivery/checkin, handle paymentMode & moneyReceived
const oldServerCheckinStart = `  const { 
    customerId, 
    orderId,
    deliveredBottles, 
    deliveredPacks350,
    deliveredPacks600,
    deliveredPacks1500,
    returnedBottles, 
    notes
  } = req.body;`;

const newServerCheckinStart = `  const { 
    customerId, 
    orderId,
    deliveredBottles, 
    deliveredPacks350,
    deliveredPacks600,
    deliveredPacks1500,
    returnedBottles,
    paymentMode,
    moneyReceived,
    notes
  } = req.body;`;

if (srv.includes(oldServerCheckinStart)) {
  srv = srv.replace(oldServerCheckinStart, newServerCheckinStart);
  console.log('✓ Updated checkin destructuring in server.js');
}

// Update order total and customer creditBalance update
const oldServerOrderSaveStart = `// Update confirmed actual delivered quantities in order(s) and mark completed
    let matchedOrder = null;
    if (Array.isArray(db.orders)) {
      db.orders.forEach(o => {
        const isMatch = orderId ? (o.orderId === orderId) : (o.customerId === customerId && o.orderStatus !== 'จัดส่งสำเร็จแล้ว' && o.orderStatus !== 'ยกเลิก');
        if (isMatch) {
          o.qty189L = q189;
          o.qty350ml = q350;
          o.qty600ml = q600;
          o.qty1500ml = q1500;
          o.totalAmount = (q189 * Number(o.unitPrice189L || 15)) +
                          (q350 * Number(o.unitPrice350ml || 35)) +
                          (q600 * Number(o.unitPrice600ml || 35)) +
                          (q1500 * Number(o.unitPrice1500ml || 35));
          o.orderStatus = 'จัดส่งสำเร็จแล้ว';
          o.completedAt = new Date().toISOString();
          if (notes) o.notes = notes;
          matchedOrder = o;
        }
      });
    }`;

const newServerOrderSaveStart = `// Update confirmed actual delivered quantities in order(s) and mark completed
    let matchedOrder = null;
    let orderTotalAmount = 0;
    if (Array.isArray(db.orders)) {
      db.orders.forEach(o => {
        const isMatch = orderId ? (o.orderId === orderId) : (o.customerId === customerId && o.orderStatus !== 'จัดส่งสำเร็จแล้ว' && o.orderStatus !== 'ยกเลิก');
        if (isMatch) {
          o.qty189L = q189;
          o.qty350ml = q350;
          o.qty600ml = q600;
          o.qty1500ml = q1500;
          o.totalAmount = (q189 * Number(o.unitPrice189L || 15)) +
                          (q350 * Number(o.unitPrice350ml || 35)) +
                          (q600 * Number(o.unitPrice600ml || 35)) +
                          (q1500 * Number(o.unitPrice1500ml || 35));
          orderTotalAmount = o.totalAmount;
          o.orderStatus = 'จัดส่งสำเร็จแล้ว';
          o.completedAt = new Date().toISOString();
          if (notes) o.notes = notes;
          matchedOrder = o;
        }
      });
    }

    if (!orderTotalAmount) {
      orderTotalAmount = (q189 * 15) + ((q350 + q600 + q1500) * 35);
    }

    // Process payment collection (Cash vs Credit)
    const isCredit = (paymentMode === 'credit');
    const collectedCash = isCredit ? Math.max(0, Number(moneyReceived || 0)) : (moneyReceived !== undefined ? Number(moneyReceived) : orderTotalAmount);
    const unpaidDebt = Math.max(0, orderTotalAmount - collectedCash);

    // Update Customer Credit Balance in Customer Master
    if (unpaidDebt > 0) {
      cust.creditBalance = Number(cust.creditBalance || 0) + unpaidDebt;
    }

    if (matchedOrder) {
      matchedOrder.paymentMode = isCredit ? 'credit' : 'cash';
      matchedOrder.moneyCollected = collectedCash;
      matchedOrder.unpaidAmount = unpaidDebt;
      matchedOrder.paymentStatus = (unpaidDebt === 0) ? 'ชำระแล้ว' : 'ค้างชำระ';
    }`;

if (srv.includes(oldServerOrderSaveStart)) {
  srv = srv.replace(oldServerOrderSaveStart, newServerOrderSaveStart);
  console.log('✓ Updated order completion and creditBalance addition in server.js');
}

// Update savedTrips entry
const oldSavedTripEntry = `db.savedTrips.unshift({
      tripId: \`JOB-\${Date.now().toString().slice(-6)}\`,
      date: dateStr,
      time: timeStr,
      vehicleId: cust.vehicleId || 'VEH-01',
      vehicleName: \`\${cust.name} (\${cust.zone || 'ทั่วไป'})\`,
      stopsCount: 1,
      totalDistanceKm: 0,
      estimatedTimeMin: 0,
      totalBottles189L: q189,
      totalPacks: q350 + q600 + q1500,
      estimatedFuelCost: 0,
      totalRevenue: orderTotal,
      status: 'จัดส่งสำเร็จแล้ว',
      orderId: orderId || (matchedOrder ? matchedOrder.orderId : ''),
      customerId: cust.id,
      customerName: cust.name
    });`;

const newSavedTripEntry = `db.savedTrips.unshift({
      tripId: \`JOB-\${Date.now().toString().slice(-6)}\`,
      date: dateStr,
      time: timeStr,
      vehicleId: cust.vehicleId || 'VEH-01',
      vehicleName: \`\${cust.name} (\${cust.zone || 'ทั่วไป'})\`,
      stopsCount: 1,
      totalDistanceKm: 0,
      estimatedTimeMin: 0,
      totalBottles189L: q189,
      totalPacks: q350 + q600 + q1500,
      estimatedFuelCost: 0,
      totalRevenue: orderTotalAmount,
      moneyCollected: collectedCash,
      unpaidAmount: unpaidDebt,
      paymentMode: isCredit ? 'credit' : 'cash',
      paymentStatus: (unpaidDebt === 0) ? 'ชำระแล้ว' : 'ค้างชำระ',
      status: 'จัดส่งสำเร็จแล้ว',
      orderId: orderId || (matchedOrder ? matchedOrder.orderId : ''),
      customerId: cust.id,
      customerName: cust.name
    });`;

if (srv.includes(oldSavedTripEntry)) {
  srv = srv.replace(oldSavedTripEntry, newSavedTripEntry);
  console.log('✓ Updated savedTrips entry with payment collection data in server.js');
}

fs.writeFileSync(serverPath, srv, 'utf8');
console.log('✓ Successfully written server.js');
console.log('--- ALL UPDATES COMPLETED SUCCESSFULLY ---');
