const fs = require('fs');

const indexPath = 'd:/13. Antigravity/Sunan/Inthara_program_develop/public/index.html';
const appPath = 'd:/13. Antigravity/Sunan/Inthara_program_develop/public/app.js';

let indexContent = fs.readFileSync(indexPath, 'utf8');
let appContent = fs.readFileSync(appPath, 'utf8');

console.log('--- APPLYING ENHANCEMENTS ---');

// ========================================================
// 1. UPDATE MODAL CHECKIN BANNER IN index.html
// ========================================================
const oldCustBanner = `        <!-- Customer Banner (Compact 1-liner) -->
        <div class="bg-sky-50/70 border border-sky-200 rounded-lg px-2.5 py-1.5 flex items-center justify-between gap-2">
          <div class="truncate">
            <span id="checkinCustTitle" class="font-bold text-sky-950 text-xs"></span>
            <span id="checkinCustSub" class="text-[11px] text-slate-500 ml-1.5"></span>
          </div>
          <span id="checkinCustTermBadge" class="text-[10px] font-bold shrink-0 px-2 py-0.5 rounded-full"></span>
        </div>`;

const newCustBanner = `        <!-- Customer Banner: Full Details, No Truncation -->
        <div class="bg-sky-50/70 border border-sky-200 rounded-lg px-2.5 py-1.5 space-y-0.5">
          <div class="flex items-center justify-between">
            <div id="checkinCustTitle" class="font-bold text-sky-950 text-xs"></div>
            <span id="checkinCustTermBadge" class="hidden"></span>
          </div>
          <div id="checkinCustSub" class="text-[10.5px] text-slate-600 leading-tight break-words"></div>
        </div>`;

if (indexContent.includes(oldCustBanner)) {
  indexContent = indexContent.replace(oldCustBanner, newCustBanner);
  console.log('✓ Updated Customer Banner in modalCheckin (index.html)');
} else {
  console.log('⚠ oldCustBanner not found, using regex');
  indexContent = indexContent.replace(
    /<!-- Customer Banner[\s\S]*?id="checkinCustTermBadge"[\s\S]*?<\/div>/,
    newCustBanner
  );
  console.log('✓ Replaced Customer Banner using regex');
}

// ========================================================
// 2. UPDATE CUSTOMER FORM DEPOSIT & CREDIT BOX COLORS IN index.html
// ========================================================
const oldDepositBox = `                <!-- มัดจำถัง 18.9L (จำนวนถัง x ค่ามัดจำต่อใบ = ยอดเงินมัดจำรวม) -->
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
                    <label class="block text-slate-500 mb-0.5 text-[10px]">วงเงินเครดิต (฿)</label>
                    <input id="custFormCreditLimit" type="number" min="0" class="w-full border border-slate-200 bg-white rounded-lg px-2 py-1 text-xs text-slate-800 text-center font-semibold font-mono" value="0" />
                  </div>
                  <div>
                    <label class="block text-slate-500 mb-0.5 text-[10px]">ค้างชำระจริง (฿)</label>
                    <input id="custFormCreditBalance" type="number" min="0" class="w-full border border-slate-200 bg-white rounded-lg px-2 py-1 text-xs text-slate-800 text-center font-semibold font-mono" value="0" />
                  </div>
                  <div>
                    <label class="block text-slate-500 mb-0.5 text-[10px]">ถังค้างร้าน (ใบ)</label>
                    <input id="custFormBottlesHeld" type="number" min="0" class="w-full border border-slate-200 bg-white rounded-lg px-2 py-1 text-xs text-slate-800 text-center font-semibold font-mono" value="0" />
                  </div>
                </div>`;

const newDepositBox = `                <!-- มัดจำถัง 18.9L (โทนสีกลมกลืนกับฟอร์ม เคลียร์เลข 0 เริ่มต้น) -->
                <div class="bg-slate-50/80 border border-slate-200 rounded-xl p-2.5 mt-2.5 space-y-1.5">
                  <div class="flex items-center justify-between">
                    <span class="text-[11px] font-bold text-slate-700 flex items-center gap-1">
                      <span>🪣</span> <span>การมัดจำถัง 18.9 ลิตร</span>
                    </span>
                    <span class="text-[10px] text-slate-400 font-medium">คำนวณเงินมัดจำอัตโนมัติ</span>
                  </div>
                  <div class="grid grid-cols-3 gap-2 items-center">
                    <div>
                      <label class="block text-slate-500 mb-0.5 text-[10px]">จำนวนถังมัดจำ (ใบ)</label>
                      <input id="custFormDepositBottles" oninput="recalcCustomerDepositTotal()" type="number" min="0" placeholder="0" class="w-full border border-slate-200 bg-white rounded-lg px-2 py-1 text-slate-800 text-xs text-center font-bold font-mono focus:border-sky-400" value="" />
                    </div>
                    <div>
                      <label class="block text-slate-500 mb-0.5 text-[10px]">ค่ามัดจำ/ถัง (฿)</label>
                      <input id="custFormDepositRate" oninput="recalcCustomerDepositTotal()" type="number" min="0" step="10" placeholder="200" class="w-full border border-slate-200 bg-white rounded-lg px-2 py-1 text-slate-800 text-xs text-center font-bold font-mono focus:border-sky-400" value="" />
                    </div>
                    <div>
                      <label class="block text-slate-700 mb-0.5 text-[10px] font-semibold">เงินมัดจำรวม (฿)</label>
                      <input id="custFormDepositAmount" readonly tabindex="-1" type="number" placeholder="0" class="w-full border border-slate-200 bg-slate-100 text-slate-900 rounded-lg px-2 py-1 text-xs text-center font-black font-mono cursor-not-allowed select-none" value="" />
                    </div>
                  </div>
                </div>

                <!-- เครดิต & ยอดคงค้างจริงในระบบ (วงเงิน, ค้างชำระ, ถังค้างร้าน - เคลียร์เลข 0) -->
                <div class="grid grid-cols-3 gap-2 mt-2">
                  <div>
                    <label class="block text-slate-500 mb-0.5 text-[10px]">วงเงินเครดิต (฿)</label>
                    <input id="custFormCreditLimit" type="number" min="0" placeholder="0" class="w-full border border-slate-200 bg-white rounded-lg px-2 py-1 text-xs text-slate-800 text-center font-semibold font-mono" value="" />
                  </div>
                  <div>
                    <label class="block text-slate-500 mb-0.5 text-[10px]">ค้างชำระจริง (฿)</label>
                    <input id="custFormCreditBalance" type="number" min="0" placeholder="0" class="w-full border border-slate-200 bg-white rounded-lg px-2 py-1 text-xs text-slate-800 text-center font-semibold font-mono" value="" />
                  </div>
                  <div>
                    <label class="block text-slate-500 mb-0.5 text-[10px]">ถังค้างร้าน (ใบ)</label>
                    <input id="custFormBottlesHeld" type="number" min="0" placeholder="0" class="w-full border border-slate-200 bg-white rounded-lg px-2 py-1 text-xs text-slate-800 text-center font-semibold font-mono" value="" />
                  </div>
                </div>`;

if (indexContent.includes(oldDepositBox)) {
  indexContent = indexContent.replace(oldDepositBox, newDepositBox);
  console.log('✓ Updated Deposit Box harmonized colors in index.html');
} else {
  console.log('⚠ oldDepositBox not found exactly, using regex');
  indexContent = indexContent.replace(
    /<!-- มัดจำถัง 18\.9L[\s\S]*?id="custFormBottlesHeld"[\s\S]*?<\/div>\s*<\/div>/,
    newDepositBox
  );
  console.log('✓ Replaced Deposit Box using regex');
}

// ========================================================
// 3. UPDATE SAVED TRIPS TABLE HEADERS IN index.html
// ========================================================
const oldSavedTripsThead = `<th class="p-2.5 font-bold">รหัสสายส่ง/รหัสงาน</th>
                  <th class="p-2.5 font-bold">วันที่ / เวลา</th>
                  <th class="p-2.5 font-bold">รถ / จุดส่ง</th>
                  <th class="p-2.5 text-center font-bold">จุดส่ง</th>
                  <th class="p-2.5 text-right font-bold">ระยะทาง</th>
                  <th class="p-2.5 text-right font-bold">สินค้าที่ส่ง</th>
                  <th class="p-2.5 text-right font-bold">ค่าน้ำมัน</th>
                  <th class="p-2.5 text-right font-bold">ยอดเงิน</th>
                  <th class="p-2.5 text-center font-bold">สถานะ</th>
                  <th class="p-2.5 text-center font-bold whitespace-nowrap">จัดการ / ดูบิล</th>`;

const newSavedTripsThead = `<th class="p-2.5 font-bold">รหัสสายส่ง/รหัสงาน</th>
                  <th class="p-2.5 font-bold">วันที่ / เวลา</th>
                  <th class="p-2.5 font-bold">รถ / ลูกค้า / จุดส่ง</th>
                  <th class="p-2.5 text-center font-bold">จุดส่ง</th>
                  <th class="p-2.5 text-right font-bold">ระยะทาง</th>
                  <th class="p-2.5 text-right font-bold">สินค้าที่ส่ง</th>
                  <th class="p-2.5 text-right font-bold">ยอดเงินรวม</th>
                  <th class="p-2.5 text-center font-bold">การชำระ / ค้างชำระ</th>
                  <th class="p-2.5 text-center font-bold">สถานะ</th>
                  <th class="p-2.5 text-center font-bold whitespace-nowrap">จัดการ / ดูบิล</th>`;

if (indexContent.includes(oldSavedTripsThead)) {
  indexContent = indexContent.replace(oldSavedTripsThead, newSavedTripsThead);
  console.log('✓ Updated Saved Trips Thead in index.html');
}

// ========================================================
// 4. UPDATE MODAL ORDER SLIP FOOTER IN index.html
// ========================================================
const oldSlipFoot = `          <tfoot>
            <tr class="bg-slate-50 font-bold border-t border-slate-200">
              <td colspan="3" class="p-2 text-right">ยอดรวมสุทธิทั้งสิ้น:</td>
              <td id="slipTotalAmount" class="p-2 text-right font-mono text-teal-800 text-sm"></td>
            </tr>
          </tfoot>`;

const newSlipFoot = `          <tfoot id="slipTableTfoot">
            <tr class="bg-slate-50 font-bold border-t border-slate-200">
              <td colspan="3" class="p-2 text-right">ยอดรวมสุทธิทั้งสิ้น:</td>
              <td id="slipTotalAmount" class="p-2 text-right font-mono text-teal-800 text-sm"></td>
            </tr>
            <tr id="slipPaidRow" class="text-xs text-slate-700">
              <td colspan="3" class="p-1.5 text-right">ชำระแล้ว / รับเงินจริง:</td>
              <td id="slipPaidAmount" class="p-1.5 text-right font-mono font-bold text-slate-800"></td>
            </tr>
            <tr id="slipUnpaidRow" class="text-xs text-amber-900 bg-amber-50/70 border-t border-amber-200 font-bold">
              <td colspan="3" class="p-1.5 text-right">ยอดค้างชำระ (ลงบัญชี):</td>
              <td id="slipUnpaidAmount" class="p-1.5 text-right font-mono font-black text-rose-700"></td>
            </tr>
          </tfoot>`;

if (indexContent.includes(oldSlipFoot)) {
  indexContent = indexContent.replace(oldSlipFoot, newSlipFoot);
  console.log('✓ Updated Order Slip Tfoot with Payment/Debt breakdown in index.html');
}

fs.writeFileSync(indexPath, indexContent, 'utf8');

// ========================================================
// 5. UPDATE app.js: openCheckinModal, resetCustomerMasterForm, editCustomerRecord, recalcCustomerDepositTotal, populateAndShowOrderSlip, printOrderSlip, renderSavedTripsTable
// ========================================================

// Update openCheckinModal in app.js
const oldOpenCheckinText = `  const titleEl = document.getElementById('checkinCustTitle');
  if (titleEl) {
    titleEl.textContent = \`\${cust.name} (โทร: \${cust.phone || '-'})\`;
  }
  
  const subEl = document.getElementById('checkinCustSub');
  if (subEl) {
    subEl.textContent = \`โซน: \${cust.zone || 'ทั่วไป'} | ที่อยู่: \${cust.address || '-'}\`;
  }`;

const newOpenCheckinText = `  const titleEl = document.getElementById('checkinCustTitle');
  if (titleEl) {
    titleEl.textContent = \`👤 \${cust.name} (โทร: \${cust.phone || '-'})\`;
  }
  
  const subEl = document.getElementById('checkinCustSub');
  if (subEl) {
    const fullAddr = cust.address ? cust.address : \`บ้านเลขที่ \${cust.houseNo || '-'} \${cust.moo || ''} ต.\${cust.subdistrict || ''} อ.\${cust.district || ''} จ.\${cust.province || ''} \${cust.postalCode || ''}\`.trim();
    subEl.textContent = \`📍 ที่อยู่: \${fullAddr} [\${cust.zone || 'ทั่วไป'}]\`;
  }`;

if (appContent.includes(oldOpenCheckinText)) {
  appContent = appContent.replace(oldOpenCheckinText, newOpenCheckinText);
  console.log('✓ Updated openCheckinModal address display in app.js');
}

// Update resetCustomerMasterForm in app.js
const oldResetCustForm = `  document.getElementById('custFormDepositBottles').value = '0';
  document.getElementById('custFormDepositRate').value = '200';
  document.getElementById('custFormDepositAmount').value = '0';
  document.getElementById('custFormCreditLimit').value = '0';
  document.getElementById('custFormCreditBalance').value = '0';
  document.getElementById('custFormBottlesHeld').value = '0';`;

const newResetCustForm = `  document.getElementById('custFormDepositBottles').value = '';
  document.getElementById('custFormDepositRate').value = '';
  document.getElementById('custFormDepositAmount').value = '';
  document.getElementById('custFormCreditLimit').value = '';
  document.getElementById('custFormCreditBalance').value = '';
  document.getElementById('custFormBottlesHeld').value = '';`;

if (appContent.includes(oldResetCustForm)) {
  appContent = appContent.replace(oldResetCustForm, newResetCustForm);
  console.log('✓ Cleared default zero values in resetCustomerMasterForm (app.js)');
}

// Update editCustomerRecord in app.js
const oldEditCustForm = `  document.getElementById('custFormDepositBottles').value = c.depositBottles ?? (c.bottleDeposit ? Math.round(c.bottleDeposit / (c.depositRate || 200)) : 0);
  document.getElementById('custFormDepositRate').value = c.depositRate || 200;
  document.getElementById('custFormDepositAmount').value = c.bottleDeposit ?? (Number(c.depositBottles || 0) * Number(c.depositRate || 200));
  document.getElementById('custFormCreditLimit').value = c.creditLimit || 0;
  document.getElementById('custFormCreditBalance').value = c.creditBalance || 0;
  document.getElementById('custFormBottlesHeld').value = c.OutstandingBottles || 0;`;

const newEditCustForm = `  const depBottles = c.depositBottles ?? (c.bottleDeposit ? Math.round(c.bottleDeposit / (c.depositRate || 200)) : 0);
  const depRate = c.depositRate || 200;
  const depAmount = c.bottleDeposit ?? (Number(depBottles || 0) * Number(depRate || 200));
  document.getElementById('custFormDepositBottles').value = depBottles > 0 ? depBottles : '';
  document.getElementById('custFormDepositRate').value = depRate || '200';
  document.getElementById('custFormDepositAmount').value = depAmount > 0 ? depAmount : '';
  document.getElementById('custFormCreditLimit').value = (c.creditLimit && c.creditLimit > 0) ? c.creditLimit : '';
  document.getElementById('custFormCreditBalance').value = (c.creditBalance && c.creditBalance > 0) ? c.creditBalance : '';
  document.getElementById('custFormBottlesHeld').value = (c.OutstandingBottles && c.OutstandingBottles > 0) ? c.OutstandingBottles : '';`;

if (appContent.includes(oldEditCustForm)) {
  appContent = appContent.replace(oldEditCustForm, newEditCustForm);
  console.log('✓ Updated editCustomerRecord to clear zeros in app.js');
}

// Update recalcCustomerDepositTotal in app.js
const oldRecalcDeposit = `function recalcCustomerDepositTotal() {
  const bottles = Number(document.getElementById('custFormDepositBottles')?.value || 0);
  const rate = Number(document.getElementById('custFormDepositRate')?.value || 200);
  const amountEl = document.getElementById('custFormDepositAmount');
  if (amountEl) {
    amountEl.value = bottles * rate;
  }
}`;

const newRecalcDeposit = `function recalcCustomerDepositTotal() {
  const bInput = document.getElementById('custFormDepositBottles')?.value;
  const rInput = document.getElementById('custFormDepositRate')?.value;
  const bottles = Number(bInput || 0);
  const rate = Number(rInput !== '' && rInput !== undefined ? rInput : 200);
  const amountEl = document.getElementById('custFormDepositAmount');
  if (amountEl) {
    if (!bInput || bottles === 0) {
      amountEl.value = '';
    } else {
      amountEl.value = bottles * rate;
    }
  }
}`;

if (appContent.includes(oldRecalcDeposit)) {
  appContent = appContent.replace(oldRecalcDeposit, newRecalcDeposit);
  console.log('✓ Updated recalcCustomerDepositTotal in app.js');
}

// Update populateAndShowOrderSlip in app.js to show unpaid amount & payments
const oldSlipPopulateEnd = `  const totalEl = document.getElementById('slipTotalAmount');
  if (totalEl) {
    totalEl.textContent = \`฿\${Number(ord.totalAmount || 0).toLocaleString()} บาท\`;
  }

  modal.classList.remove('hidden');
  modal.classList.add('flex');`;

const newSlipPopulateEnd = `  const totalAmt = Number(ord.totalAmount || 0);
  const totalEl = document.getElementById('slipTotalAmount');
  if (totalEl) {
    totalEl.textContent = \`฿\${totalAmt.toLocaleString(undefined, {minimumFractionDigits: 2})} บาท\`;
  }

  // Find trip payment data if order is missing them
  let collected = ord.moneyCollected;
  let unpaid = ord.unpaidAmount;
  let payMode = ord.paymentMode;

  if (collected === undefined || unpaid === undefined) {
    const matchedTrip = (appData?.savedTrips || []).find(t => (ord.orderId && t.orderId === ord.orderId) || (ord.customerId && t.customerId === ord.customerId && t.date === ord.deliveryDate));
    if (matchedTrip) {
      collected = matchedTrip.moneyCollected;
      unpaid = matchedTrip.unpaidAmount;
      payMode = matchedTrip.paymentMode;
    }
  }

  const isDelivered = (ord.orderStatus === 'จัดส่งสำเร็จแล้ว');
  const paidRow = document.getElementById('slipPaidRow');
  const unpaidRow = document.getElementById('slipUnpaidRow');
  const paidAmountEl = document.getElementById('slipPaidAmount');
  const unpaidAmountEl = document.getElementById('slipUnpaidAmount');

  if (isDelivered || collected !== undefined || unpaid !== undefined) {
    const actCollected = Number(collected !== undefined ? collected : (payMode === 'credit' ? 0 : totalAmt));
    const actUnpaid = Number(unpaid !== undefined ? unpaid : (payMode === 'credit' ? totalAmt : Math.max(0, totalAmt - actCollected)));

    if (paidRow && paidAmountEl) {
      paidRow.classList.remove('hidden');
      paidAmountEl.textContent = \`฿\${actCollected.toLocaleString(undefined, {minimumFractionDigits: 2})} บาท\` + (payMode === 'credit' && actCollected === 0 ? ' (ลงบัญชีเครดิต)' : '');
    }

    if (unpaidRow && unpaidAmountEl) {
      if (actUnpaid > 0) {
        unpaidRow.classList.remove('hidden');
        unpaidAmountEl.textContent = \`฿\${actUnpaid.toLocaleString(undefined, {minimumFractionDigits: 2})} บาท (ยังไม่ได้รับ)\`;
      } else {
        unpaidRow.classList.add('hidden');
      }
    }
  } else {
    if (paidRow) paidRow.classList.add('hidden');
    if (unpaidRow) unpaidRow.classList.add('hidden');
  }

  modal.classList.remove('hidden');
  modal.classList.add('flex');`;

if (appContent.includes(oldSlipPopulateEnd)) {
  appContent = appContent.replace(oldSlipPopulateEnd, newSlipPopulateEnd);
  console.log('✓ Updated populateAndShowOrderSlip with paid/unpaid rows in app.js');
}

// Update printOrderSlip to render unpaid amount and payment details in printed slip
const oldPrintTfoot = `      <tfoot>
        <tr style="background: #f1f5f9; font-weight: bold; font-size: 13px;">
          <td colspan="4" style="text-align: right; border: 1px solid #94a3b8; padding: 7px 8px;">
            ยอดรวมสุทธิทั้งสิ้น (Grand Total):
          </td>
          <td style="text-align: right; border: 1px solid #94a3b8; padding: 7px 8px; font-size: 14px; color: #047857; font-family: monospace;">
            ฿\${Number(ord.totalAmount || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}
          </td>
        </tr>
      </tfoot>`;

const newPrintTfoot = `      <tfoot>
        <tr style="background: #f1f5f9; font-weight: bold; font-size: 13px;">
          <td colspan="4" style="text-align: right; border: 1px solid #94a3b8; padding: 7px 8px;">
            ยอดรวมสุทธิทั้งสิ้น (Grand Total):
          </td>
          <td style="text-align: right; border: 1px solid #94a3b8; padding: 7px 8px; font-size: 14px; color: #047857; font-family: monospace;">
            ฿\${Number(ord.totalAmount || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}
          </td>
        </tr>
        \${(() => {
          let col = ord.moneyCollected;
          let unp = ord.unpaidAmount;
          let pm = ord.paymentMode;
          if (col === undefined || unp === undefined) {
            const tr = (appData?.savedTrips || []).find(t => (ord.orderId && t.orderId === ord.orderId) || (ord.customerId && t.customerId === ord.customerId && t.date === ord.deliveryDate));
            if (tr) { col = tr.moneyCollected; unp = tr.unpaidAmount; pm = tr.paymentMode; }
          }
          if (col !== undefined || unp !== undefined || ord.orderStatus === 'จัดส่งสำเร็จแล้ว') {
            const tot = Number(ord.totalAmount || 0);
            const actCol = Number(col !== undefined ? col : (pm === 'credit' ? 0 : tot));
            const actUnp = Number(unp !== undefined ? unp : (pm === 'credit' ? tot : Math.max(0, tot - actCol)));
            return \`
              <tr style="font-size: 12px; color: #1e293b;">
                <td colspan="4" style="text-align: right; border: 1px solid #94a3b8; padding: 5px 8px;">
                  ชำระแล้ว / รับเงินจริง:
                </td>
                <td style="text-align: right; border: 1px solid #94a3b8; padding: 5px 8px; font-family: monospace; font-weight: bold;">
                  ฿\${actCol.toLocaleString(undefined, {minimumFractionDigits: 2})} \${pm === 'credit' && actCol === 0 ? '<span style="color:#d97706; font-size:11px;">(ลงบัญชีเครดิต)</span>' : ''}
                </td>
              </tr>
              \${actUnp > 0 ? \`
              <tr style="background: #fff7ed; font-size: 12.5px; font-weight: bold; color: #b91c1c;">
                <td colspan="4" style="text-align: right; border: 1px solid #94a3b8; padding: 6px 8px;">
                  ยอดค้างชำระ (ลงบัญชี / Balance Due):
                </td>
                <td style="text-align: right; border: 1px solid #94a3b8; padding: 6px 8px; font-size: 13px; font-family: monospace; color: #dc2626;">
                  ฿\${actUnp.toLocaleString(undefined, {minimumFractionDigits: 2})}
                </td>
              </tr>
              \` : ''}
            \`;
          }
          return '';
        })()}
      </tfoot>`;

if (appContent.includes(oldPrintTfoot)) {
  appContent = appContent.replace(oldPrintTfoot, newPrintTfoot);
  console.log('✓ Updated printOrderSlip tfoot with paid/unpaid in app.js');
}

// Update renderSavedTripsTable in app.js to show unpaid amount column & summary
const oldSavedTripsRowCode = `tbody.innerHTML = filteredTrips.map(t => {
    const timeDisplay = t.time ? \`<span class="text-[10px] text-slate-400 block font-normal">🕒 \${t.time}</span>\` : '';
    const orderIdDisplay = t.orderId ? \`<span class="bg-sky-50 text-sky-800 border border-sky-200 px-1.5 py-0.2 rounded text-[10px] font-mono font-bold block mt-0.5 max-w-fit">📋 \${t.orderId}</span>\` : '';
    return \`
      <tr class="hover:bg-slate-50 transition">
        <td class="p-2.5 font-mono font-bold text-sky-700 text-xs">
          \${t.tripId}
          \${orderIdDisplay}
        </td>
        <td class="p-2.5 font-medium text-slate-700">
          \${t.date}
          \${timeDisplay}
        </td>
        <td class="p-2.5 font-semibold text-slate-800">\${t.vehicleName}</td>
        <td class="p-2.5 text-center font-bold text-slate-700">\${t.stopsCount} จุด</td>
        <td class="p-2.5 text-right font-medium text-slate-600">\${Number(t.totalDistanceKm || 0).toFixed(1)} กม.</td>
        <td class="p-2.5 text-right font-semibold text-slate-800">
          <span class="text-sky-800">\${t.totalBottles189L || 0} ถัง</span> / <span class="text-amber-800">\${t.totalPacks || 0} แพ็ค</span>
        </td>
        <td class="p-2.5 text-right font-medium text-rose-600">฿\${Number(t.estimatedFuelCost || 0).toLocaleString()}</td>
        <td class="p-2.5 text-right font-black text-slate-900">฿\${Number(t.totalRevenue || 0).toLocaleString()}</td>
        <td class="p-2.5 text-center">
          <span class="bg-emerald-100 text-emerald-800 text-[11px] font-bold px-2.5 py-0.5 rounded-full shadow-2xs">\${t.status || 'ส่งสำเร็จ'}</span>
        </td>
        <td class="p-2.5 text-center whitespace-nowrap">
          <button type="button" onclick="openOrderSlipFromTrip('\${t.tripId}')" class="bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 font-bold px-2.5 py-1 rounded text-xs transition shadow-2xs inline-flex items-center gap-1" title="ดูบิลและพิมพ์ใบส่งของ">
            <span>📄</span> <span>ดูบิล</span>
          </button>
        </td>
      </tr>
    \`;
  }).join('');`;

const newSavedTripsRowCode = `  // Calculate summary values including Collected & Unpaid
  const totalBottles = filteredTrips.reduce((s, t) => s + Number(t.totalBottles189L || 0), 0);
  const totalPacks = filteredTrips.reduce((s, t) => s + Number(t.totalPacks || 0), 0);
  const totalRevenue = filteredTrips.reduce((s, t) => s + Number(t.totalRevenue || 0), 0);
  const totalCollected = filteredTrips.reduce((s, t) => {
    const col = t.moneyCollected !== undefined ? Number(t.moneyCollected) : (t.paymentMode === 'credit' ? 0 : Number(t.totalRevenue || 0));
    return s + col;
  }, 0);
  const totalUnpaid = filteredTrips.reduce((s, t) => {
    const unp = t.unpaidAmount !== undefined ? Number(t.unpaidAmount) : (t.paymentMode === 'credit' ? Number(t.totalRevenue || 0) : Math.max(0, Number(t.totalRevenue || 0) - Number(t.moneyCollected || 0)));
    return s + unp;
  }, 0);

  // Render Daily Summary Cards for Selected Date
  if (summaryEl) {
    summaryEl.innerHTML = \`
      <div class="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
        <div class="bg-white border border-slate-200 rounded-lg p-2.5 shadow-2xs">
          <div class="text-[10px] text-slate-500 font-medium">งานปิดแล้ว</div>
          <div class="font-black text-slate-800 text-sm mt-0.5">\${filteredTrips.length} รายการ</div>
        </div>
        <div class="bg-white border border-slate-200 rounded-lg p-2.5 shadow-2xs">
          <div class="text-[10px] text-sky-700 font-medium">ส่งสำเร็จรวม</div>
          <div class="font-black text-sky-900 text-sm mt-0.5">\${totalBottles} ถัง / \${totalPacks} แพ็ค</div>
        </div>
        <div class="bg-white border border-slate-200 rounded-lg p-2.5 shadow-2xs">
          <div class="text-[10px] text-slate-700 font-medium">ยอดเงินรวม</div>
          <div class="font-black text-slate-900 text-sm mt-0.5">฿\${totalRevenue.toLocaleString()}</div>
        </div>
        <div class="bg-white border border-emerald-200 bg-emerald-50/30 rounded-lg p-2.5 shadow-2xs">
          <div class="text-[10px] text-emerald-800 font-bold">รับเงินสด/โอนแล้ว</div>
          <div class="font-black text-emerald-900 text-sm mt-0.5">฿\${totalCollected.toLocaleString()}</div>
        </div>
        <div class="bg-white border \${totalUnpaid > 0 ? 'border-amber-300 bg-amber-50/50' : 'border-slate-200'} rounded-lg p-2.5 shadow-2xs">
          <div class="text-[10px] \${totalUnpaid > 0 ? 'text-amber-900 font-bold' : 'text-slate-500'}">ยอดค้างชำระ/เครดิต</div>
          <div class="font-black \${totalUnpaid > 0 ? 'text-amber-900' : 'text-slate-700'} text-sm mt-0.5">฿\${totalUnpaid.toLocaleString()}</div>
        </div>
      </div>
    \`;
  }

  tbody.innerHTML = filteredTrips.map(t => {
    const timeDisplay = t.time ? \`<span class="text-[10px] text-slate-400 block font-normal">🕒 \${t.time}</span>\` : '';
    const orderIdDisplay = t.orderId ? \`<span class="bg-sky-50 text-sky-800 border border-sky-200 px-1.5 py-0.2 rounded text-[10px] font-mono font-bold block mt-0.5 max-w-fit">📋 \${t.orderId}</span>\` : '';
    
    const tot = Number(t.totalRevenue || 0);
    const col = Number(t.moneyCollected !== undefined ? t.moneyCollected : (t.paymentMode === 'credit' ? 0 : tot));
    const unp = Number(t.unpaidAmount !== undefined ? t.unpaidAmount : (t.paymentMode === 'credit' ? tot : Math.max(0, tot - col)));
    const isCred = (t.paymentMode === 'credit');

    let paymentBadge = '';
    if (unp > 0) {
      paymentBadge = \`
        <div class="leading-tight">
          <span class="bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-full font-bold text-[10px] inline-block shadow-2xs">
            \${isCred ? '💳 เครดิต' : '⚠️ ค้างชำระ'} ฿\${unp.toLocaleString()}
          </span>
          \${col > 0 ? \`<div class="text-[10px] text-emerald-700 font-medium mt-0.5">รับเงิน ฿\${col.toLocaleString()}</div>\` : ''}
        </div>
      \`;
    } else {
      paymentBadge = \`
        <span class="bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-full font-bold text-[10px] inline-block">
          ✓ จ่ายครบ ฿\${col.toLocaleString()}
        </span>
      \`;
    }

    return \`
      <tr class="hover:bg-slate-50 transition">
        <td class="p-2.5 font-mono font-bold text-sky-700 text-xs">
          \${t.tripId}
          \${orderIdDisplay}
        </td>
        <td class="p-2.5 font-medium text-slate-700">
          \${t.date}
          \${timeDisplay}
        </td>
        <td class="p-2.5 font-semibold text-slate-800">
          <div>\${t.customerName || t.vehicleName}</div>
          \${t.customerName && t.vehicleName !== t.customerName ? \`<div class="text-[10px] text-slate-400 font-normal">\${t.vehicleName}</div>\` : ''}
        </td>
        <td class="p-2.5 text-center font-bold text-slate-700">\${t.stopsCount} จุด</td>
        <td class="p-2.5 text-right font-medium text-slate-600">\${Number(t.totalDistanceKm || 0).toFixed(1)} กม.</td>
        <td class="p-2.5 text-right font-semibold text-slate-800">
          <span class="text-sky-800">\${t.totalBottles189L || 0} ถัง</span> / <span class="text-amber-800">\${t.totalPacks || 0} แพ็ค</span>
        </td>
        <td class="p-2.5 text-right font-black text-slate-900">฿\${tot.toLocaleString()}</td>
        <td class="p-2.5 text-center">
          \${paymentBadge}
        </td>
        <td class="p-2.5 text-center">
          <span class="bg-emerald-100 text-emerald-800 text-[11px] font-bold px-2.5 py-0.5 rounded-full shadow-2xs">\${t.status || 'ส่งสำเร็จ'}</span>
        </td>
        <td class="p-2.5 text-center whitespace-nowrap">
          <button type="button" onclick="openOrderSlipFromTrip('\${t.tripId}')" class="bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 font-bold px-2.5 py-1 rounded text-xs transition shadow-2xs inline-flex items-center gap-1" title="ดูบิลและพิมพ์ใบส่งของ">
            <span>📄</span> <span>ดูบิล</span>
          </button>
        </td>
      </tr>
    \`;
  }).join('');`;

// In appContent, find the summary block and tbody map and replace
const summaryStart = appContent.indexOf('// Render Daily Summary Cards for Selected Date');
const tbodyMapEnd = appContent.indexOf('function renderDashboard');

if (summaryStart !== -1 && tbodyMapEnd !== -1) {
  // Cut from summaryStart to just before function renderDashboard
  const before = appContent.slice(0, summaryStart);
  const after = appContent.slice(tbodyMapEnd);
  appContent = before + newSavedTripsRowCode + '\n}\n\n// ==========================================\n// 2. ROLE-BASED CUSTOM DASHBOARD (DIFFERENT PER LEVEL)\n// ==========================================\n' + after.slice(after.indexOf('function renderDashboard'));
  console.log('✓ Successfully updated renderSavedTripsTable in app.js');
} else {
  console.log('⚠ Could not locate bounds for renderSavedTripsTable in app.js');
}

fs.writeFileSync(appPath, appContent, 'utf8');
console.log('--- ALL ENHANCEMENTS APPLIED SUCCESSFULLY ---');
