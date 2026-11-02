const fs = require('fs');

const indexPath = 'd:/13. Antigravity/Sunan/Inthara_program_develop/public/index.html';
const appPath = 'd:/13. Antigravity/Sunan/Inthara_program_develop/public/app.js';

let indexContent = fs.readFileSync(indexPath, 'utf8');
let appContent = fs.readFileSync(appPath, 'utf8');

console.log('--- APPLYING RESET TO 0 AND CUSTOMER ORDERS COLUMN ---');

// ========================================================
// 1. UPDATE index.html: custFormDepositRate to value="0" placeholder="0"
// ========================================================
const oldDepositBoxHtml = `<div class="grid grid-cols-3 gap-2 items-center">
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
                  </div>`;

const newDepositBoxHtml = `<div class="grid grid-cols-3 gap-2 items-center">
                    <div>
                      <label class="block text-slate-500 mb-0.5 text-[10px]">จำนวนถังมัดจำ (ใบ)</label>
                      <input id="custFormDepositBottles" oninput="recalcCustomerDepositTotal()" type="number" min="0" placeholder="0" class="w-full border border-slate-200 bg-white rounded-lg px-2 py-1 text-slate-800 text-xs text-center font-bold font-mono focus:border-sky-400" value="0" />
                    </div>
                    <div>
                      <label class="block text-slate-500 mb-0.5 text-[10px]">ค่ามัดจำ/ถัง (฿)</label>
                      <input id="custFormDepositRate" oninput="recalcCustomerDepositTotal()" type="number" min="0" step="10" placeholder="0" class="w-full border border-slate-200 bg-white rounded-lg px-2 py-1 text-slate-800 text-xs text-center font-bold font-mono focus:border-sky-400" value="0" />
                    </div>
                    <div>
                      <label class="block text-slate-700 mb-0.5 text-[10px] font-semibold">เงินมัดจำรวม (฿)</label>
                      <input id="custFormDepositAmount" readonly tabindex="-1" type="number" placeholder="0" class="w-full border border-slate-200 bg-slate-100 text-slate-900 rounded-lg px-2 py-1 text-xs text-center font-black font-mono cursor-not-allowed select-none" value="0" />
                    </div>
                  </div>`;

if (indexContent.includes(oldDepositBoxHtml)) {
  indexContent = indexContent.replace(oldDepositBoxHtml, newDepositBoxHtml);
  console.log('✓ Updated custFormDepositRate to value="0" placeholder="0" in index.html');
} else {
  console.log('⚠ oldDepositBoxHtml not found exactly, replacing using regex');
  indexContent = indexContent.replace(
    /id="custFormDepositRate"[\s\S]*?value=".*?"/g,
    'id="custFormDepositRate" oninput="recalcCustomerDepositTotal()" type="number" min="0" step="10" placeholder="0" class="w-full border border-slate-200 bg-white rounded-lg px-2 py-1 text-slate-800 text-xs text-center font-bold font-mono focus:border-sky-400" value="0"'
  );
  console.log('✓ Replaced custFormDepositRate using regex');
}

// Ensure other inputs have value="0"
indexContent = indexContent.replace('id="custFormDepositBottles" oninput="recalcCustomerDepositTotal()" type="number" min="0" placeholder="0" class="w-full border border-slate-200 bg-white rounded-lg px-2 py-1 text-slate-800 text-xs text-center font-bold font-mono focus:border-sky-400" value=""', 'id="custFormDepositBottles" oninput="recalcCustomerDepositTotal()" type="number" min="0" placeholder="0" class="w-full border border-slate-200 bg-white rounded-lg px-2 py-1 text-slate-800 text-xs text-center font-bold font-mono focus:border-sky-400" value="0"');
indexContent = indexContent.replace('id="custFormDepositAmount" readonly tabindex="-1" type="number" placeholder="0" class="w-full border border-slate-200 bg-slate-100 text-slate-900 rounded-lg px-2 py-1 text-xs text-center font-black font-mono cursor-not-allowed select-none" value=""', 'id="custFormDepositAmount" readonly tabindex="-1" type="number" placeholder="0" class="w-full border border-slate-200 bg-slate-100 text-slate-900 rounded-lg px-2 py-1 text-xs text-center font-black font-mono cursor-not-allowed select-none" value="0"');
indexContent = indexContent.replace('id="custFormCreditLimit" type="number" min="0" placeholder="0" class="w-full border border-slate-200 bg-white rounded-lg px-2 py-1 text-xs text-slate-800 text-center font-semibold font-mono" value=""', 'id="custFormCreditLimit" type="number" min="0" placeholder="0" class="w-full border border-slate-200 bg-white rounded-lg px-2 py-1 text-xs text-slate-800 text-center font-semibold font-mono" value="0"');
indexContent = indexContent.replace('id="custFormCreditBalance" type="number" min="0" placeholder="0" class="w-full border border-slate-200 bg-white rounded-lg px-2 py-1 text-xs text-slate-800 text-center font-semibold font-mono" value=""', 'id="custFormCreditBalance" type="number" min="0" placeholder="0" class="w-full border border-slate-200 bg-white rounded-lg px-2 py-1 text-xs text-slate-800 text-center font-semibold font-mono" value="0"');
indexContent = indexContent.replace('id="custFormBottlesHeld" type="number" min="0" placeholder="0" class="w-full border border-slate-200 bg-white rounded-lg px-2 py-1 text-xs text-slate-800 text-center font-semibold font-mono" value=""', 'id="custFormBottlesHeld" type="number" min="0" placeholder="0" class="w-full border border-slate-200 bg-white rounded-lg px-2 py-1 text-xs text-slate-800 text-center font-semibold font-mono" value="0"');

// ========================================================
// 2. UPDATE index.html: Add "ออเดอร์ที่เคยสั่ง" Column in Customers Master Table
// ========================================================
const oldCustThead = `<tr class="bg-slate-50 text-slate-600 border-y border-slate-200">
                <th class="p-2.5">รหัส</th>
                <th class="p-2.5">ชื่อลูกค้า / เบอร์โทร</th>
                <th class="p-2.5">ที่อยู่ & พิกัด</th>
                <th class="p-2.5 text-center">รอบวันส่ง</th>
                <th class="p-2.5 text-center">ราคา (18.9L / 350ml / 600ml / 1.5L)</th>
                <th class="p-2.5 text-right">ถังค้าง / มัดจำ</th>
                <th class="p-2.5 text-right">ค้างชำระ</th>
                <th class="p-2.5 text-center">สถานะ</th>
                <th class="p-2.5 text-center">จัดการ</th>
              </tr>`;

const newCustThead = `<tr class="bg-slate-50 text-slate-600 border-y border-slate-200">
                <th class="p-2.5">รหัส</th>
                <th class="p-2.5">ชื่อลูกค้า / เบอร์โทร</th>
                <th class="p-2.5 text-center whitespace-nowrap">ออเดอร์ที่เคยสั่ง</th>
                <th class="p-2.5">ที่อยู่ & พิกัด</th>
                <th class="p-2.5 text-center">รอบวันส่ง</th>
                <th class="p-2.5 text-center">ราคา (18.9L / 350ml / 600ml / 1.5L)</th>
                <th class="p-2.5 text-right">ถังค้าง / มัดจำ</th>
                <th class="p-2.5 text-right">ค้างชำระ</th>
                <th class="p-2.5 text-center">สถานะ</th>
                <th class="p-2.5 text-center">จัดการ</th>
              </tr>`;

if (indexContent.includes(oldCustThead)) {
  indexContent = indexContent.replace(oldCustThead, newCustThead);
  console.log('✓ Added "ออเดอร์ที่เคยสั่ง" header to Customers Table in index.html');
}

fs.writeFileSync(indexPath, indexContent, 'utf8');

// ========================================================
// 3. UPDATE app.js: resetCustomerMasterForm to set all values = '0'
// ========================================================
const oldResetBlock = `  document.getElementById('custFormPrice189').value = '0';
  if (document.getElementById('custFormPrice350')) document.getElementById('custFormPrice350').value = '0';
  document.getElementById('custFormPrice600').value = '0';
  document.getElementById('custFormPrice1500').value = '0';
  document.getElementById('custFormDepositBottles').value = '';
  document.getElementById('custFormDepositRate').value = '';
  document.getElementById('custFormDepositAmount').value = '';
  document.getElementById('custFormCreditLimit').value = '';
  document.getElementById('custFormCreditBalance').value = '';
  document.getElementById('custFormBottlesHeld').value = '';`;

const newResetBlock = `  document.getElementById('custFormPrice189').value = '0';
  if (document.getElementById('custFormPrice350')) document.getElementById('custFormPrice350').value = '0';
  document.getElementById('custFormPrice600').value = '0';
  document.getElementById('custFormPrice1500').value = '0';
  document.getElementById('custFormDepositBottles').value = '0';
  document.getElementById('custFormDepositRate').value = '0';
  document.getElementById('custFormDepositAmount').value = '0';
  document.getElementById('custFormCreditLimit').value = '0';
  document.getElementById('custFormCreditBalance').value = '0';
  document.getElementById('custFormBottlesHeld').value = '0';`;

if (appContent.includes(oldResetBlock)) {
  appContent = appContent.replace(oldResetBlock, newResetBlock);
  console.log('✓ Updated resetCustomerMasterForm to set all 0s in app.js');
}

// Update recalcCustomerDepositTotal in app.js
const oldRecalcFunc = `function recalcCustomerDepositTotal() {
  const bVal = document.getElementById('custFormDepositBottles')?.value;
  const rVal = document.getElementById('custFormDepositRate')?.value;
  const b = Number(bVal || 0);
  const r = Number(rVal !== '' && rVal !== undefined ? rVal : 200);
  const totalEl = document.getElementById('custFormDepositAmount');
  if (totalEl) {
    if (!bVal || b === 0) {
      totalEl.value = '';
    } else {
      totalEl.value = b * r;
    }
  }
}`;

const newRecalcFunc = `function recalcCustomerDepositTotal() {
  const bVal = document.getElementById('custFormDepositBottles')?.value;
  const rVal = document.getElementById('custFormDepositRate')?.value;
  const b = Number(bVal || 0);
  const r = Number(rVal || 0);
  const totalEl = document.getElementById('custFormDepositAmount');
  if (totalEl) {
    totalEl.value = b * r;
  }
}`;

if (appContent.includes(oldRecalcFunc)) {
  appContent = appContent.replace(oldRecalcFunc, newRecalcFunc);
  console.log('✓ Updated recalcCustomerDepositTotal to calculate b * r in app.js');
}

// Update editCustomerRecord in app.js
const oldEditValues = `  const depBottles = c.depositBottles ?? (c.bottleDeposit ? Math.round(c.bottleDeposit / (c.depositRate || 200)) : 0);
  const depRate = c.depositRate ?? 200;
  const depAmount = c.bottleDeposit ?? (depBottles * depRate);
  document.getElementById('custFormDepositBottles').value = depBottles > 0 ? depBottles : '';
  document.getElementById('custFormDepositRate').value = depRate ? depRate : '200';
  document.getElementById('custFormDepositAmount').value = depAmount > 0 ? depAmount : '';
  document.getElementById('custFormCreditLimit').value = (c.creditLimit && Number(c.creditLimit) > 0) ? c.creditLimit : '';
  document.getElementById('custFormCreditBalance').value = (c.creditBalance && Number(c.creditBalance) > 0) ? c.creditBalance : '';
  document.getElementById('custFormBottlesHeld').value = (c.OutstandingBottles && Number(c.OutstandingBottles) > 0) ? c.OutstandingBottles : '';`;

const newEditValues = `  const depBottles = Number(c.depositBottles ?? (c.bottleDeposit ? Math.round(c.bottleDeposit / (c.depositRate || 200)) : 0));
  const depRate = Number(c.depositRate ?? 0);
  const depAmount = Number(c.bottleDeposit ?? (depBottles * depRate));
  document.getElementById('custFormDepositBottles').value = depBottles;
  document.getElementById('custFormDepositRate').value = depRate;
  document.getElementById('custFormDepositAmount').value = depAmount;
  document.getElementById('custFormCreditLimit').value = Number(c.creditLimit || 0);
  document.getElementById('custFormCreditBalance').value = Number(c.creditBalance || 0);
  document.getElementById('custFormBottlesHeld').value = Number(c.OutstandingBottles || 0);`;

if (appContent.includes(oldEditValues)) {
  appContent = appContent.replace(oldEditValues, newEditValues);
  console.log('✓ Updated editCustomerRecord values in app.js');
}

// ========================================================
// 4. UPDATE app.js: Render Customer Table with separate "ออเดอร์ที่เคยสั่ง" Column
// ========================================================
const oldCustRowRender = `    return \`
      <tr class="hover:bg-slate-50/80 transition">
        <td class="p-2.5 align-top">
          <div class="font-mono font-semibold text-slate-700">\${c.id}</div>
          <div class="text-[11px] text-slate-400 mt-0.5">\${c.customerType || 'ร้านค้าปลีก-ส่ง / ตัวแทน'}</div>
          \${orderLinkPill}
        </td>
        <td class="p-2.5 align-top">
          <div class="font-semibold text-slate-800 text-xs">\${c.name}</div>
          <div class="text-[11px] text-slate-500 mt-0.5">👤 \${c.contactPerson || 'เจ้าของร้าน'} • 📞 \${c.phone || '-'}</div>
          \${c.taxId ? \`<div class="text-[10px] font-mono text-slate-400 mt-0.5">เลขบัตรประชาชน / เลขผู้เสียภาษี: \${c.taxId}</div>\` : ''}
          \${c.notes ? \`<div class="text-[10px] text-slate-600 bg-slate-100 inline-block px-1.5 py-0.5 rounded mt-1">📌 \${c.notes}</div>\` : ''}
        </td>
        <td class="p-2.5 align-top">`;

const newCustRowRender = `    return \`
      <tr class="hover:bg-slate-50/80 transition">
        <td class="p-2.5 align-top whitespace-nowrap">
          <div class="font-mono font-semibold text-slate-700">\${c.id}</div>
          <div class="text-[11px] text-slate-400 mt-0.5">\${c.customerType || 'ร้านค้าปลีก-ส่ง / ตัวแทน'}</div>
        </td>
        <td class="p-2.5 align-top">
          <div class="font-semibold text-slate-800 text-xs">\${c.name}</div>
          <div class="text-[11px] text-slate-500 mt-0.5">👤 \${c.contactPerson || 'เจ้าของร้าน'} • 📞 \${c.phone || '-'}</div>
          \${c.taxId ? \`<div class="text-[10px] font-mono text-slate-400 mt-0.5">เลขบัตรประชาชน / เลขผู้เสียภาษี: \${c.taxId}</div>\` : ''}
          \${c.notes ? \`<div class="text-[10px] text-slate-600 bg-slate-100 inline-block px-1.5 py-0.5 rounded mt-1">📌 \${c.notes}</div>\` : ''}
        </td>
        <td class="p-2.5 align-top text-center whitespace-nowrap">
          \${custOrders.length > 0 ? \`
            <button type="button" onclick="filterOrdersByCustomer('\${c.id}')" class="inline-flex items-center gap-1.5 bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-300 font-bold px-2.5 py-1 rounded-lg text-xs cursor-pointer transition shadow-2xs" title="คลิกเพื่อดูรายการออเดอร์ของลูกค้ารายนี้">
              <span>📜</span> <span>ออเดอร์ \${custOrders.length} ใบ</span>
            </button>
            \${pendingCustOrders.length > 0 ? \`
              <div class="mt-1">
                <span class="bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 rounded-full text-[10px] font-bold inline-block">
                  ⏳ รอส่ง \${pendingCustOrders.length} ใบ
                </span>
              </div>
            \` : \`
              <div class="text-[10px] text-emerald-700 font-medium mt-0.5">✓ ส่งสำเร็จครบ</div>
            \`}
          \` : \`
            <span class="text-[11px] text-slate-400 font-medium">- ยังไม่มี -</span>
          \`}
        </td>
        <td class="p-2.5 align-top">`;

if (appContent.includes(oldCustRowRender)) {
  appContent = appContent.replace(oldCustRowRender, newCustRowRender);
  console.log('✓ Successfully rendered separate "ออเดอร์ที่เคยสั่ง" Column in app.js');
} else {
  console.error('Could not find oldCustRowRender');
}

fs.writeFileSync(appPath, appContent, 'utf8');
console.log('--- ALL UPDATES COMPLETED SUCCESSFULLY ---');
