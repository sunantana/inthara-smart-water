const fs = require('fs');

const indexPath = 'd:/13. Antigravity/Sunan/Inthara_program_develop/public/index.html';
const appPath = 'd:/13. Antigravity/Sunan/Inthara_program_develop/public/app.js';

let indexContent = fs.readFileSync(indexPath, 'utf8');
let appContent = fs.readFileSync(appPath, 'utf8');

// 1. Replace modalCheckin in index.html
const startModalStr = '<div id="modalCheckin"';
const endModalStr = '<!-- MODAL: Record Machine Maintenance -->';

const startIdx = indexContent.indexOf(startModalStr);
const endIdx = indexContent.indexOf(endModalStr);

if (startIdx === -1 || endIdx === -1) {
  console.error('Could not find modalCheckin bounds in index.html!');
  process.exit(1);
}

const compactModalHtml = `  <!-- MODAL: Compact Driver Check-in -->
  <div id="modalCheckin" class="fixed inset-0 bg-slate-900/60 hidden items-center justify-center z-50 p-3">
    <div class="bg-white rounded-2xl max-w-md w-full p-4 shadow-2xl space-y-2.5 max-h-[95vh] overflow-y-auto">
      
      <!-- Header: Simply "ใบปิดงาน" -->
      <div class="flex items-center justify-between border-b pb-2">
        <div class="flex items-center gap-1.5">
          <span class="w-6 h-6 rounded-lg bg-emerald-600 text-white font-bold text-xs flex items-center justify-center">✓</span>
          <h3 class="font-bold text-slate-800 text-base">ใบปิดงาน</h3>
          <span id="checkinOrderBadge" class="bg-slate-100 text-slate-700 font-mono text-[10px] px-1.5 py-0.5 rounded font-semibold ml-1"></span>
        </div>
        <button type="button" onclick="closeCheckinModal()" class="text-slate-400 hover:text-slate-600 text-lg font-bold leading-none">✕</button>
      </div>

      <form onsubmit="submitDriverCheckin(event)" class="space-y-2.5 text-xs">
        <input type="hidden" id="checkinCustId" />
        <input type="hidden" id="checkinOrderIds" />
        
        <!-- Customer Banner (Compact 1-liner) -->
        <div class="bg-sky-50/70 border border-sky-200 rounded-lg px-2.5 py-1.5 flex items-center justify-between gap-2">
          <div class="truncate">
            <span id="checkinCustTitle" class="font-bold text-sky-950 text-xs"></span>
            <span id="checkinCustSub" class="text-[11px] text-slate-500 ml-1.5"></span>
          </div>
          <span id="checkinCustTermBadge" class="text-[10px] font-bold shrink-0 px-2 py-0.5 rounded-full"></span>
        </div>

        <!-- Section: Delivered & Returned Products (Compact Grid) -->
        <div class="rounded-lg border border-slate-200 bg-slate-50/50 p-2 space-y-1.5">
          <div class="text-[11px] font-bold text-slate-700 flex items-center justify-between">
            <span>📦 จำนวนที่ส่งจริง</span>
            <span class="text-[10px] font-normal text-slate-400">แก้ไขจำนวนได้ตามจริง</span>
          </div>

          <div class="grid grid-cols-2 gap-1.5">
            <!-- 18.9L -->
            <div class="bg-white px-2 py-1.5 rounded-lg border border-slate-200 flex items-center justify-between gap-1 shadow-2xs">
              <div class="leading-tight">
                <div class="font-bold text-sky-800 text-[11px]">💧 18.9 ลิตร</div>
                <div class="text-[9px] text-slate-400"><span id="checkinOrig189">สั่ง: 0</span> • <span id="checkinPrice189Label">@฿15</span></div>
              </div>
              <div class="flex items-center gap-1 shrink-0">
                <input id="checkinDelivered" type="number" min="0" required oninput="recalcCheckinModalTotals()" class="w-14 border border-sky-300 bg-sky-50/30 rounded px-1 py-0.5 text-sm font-bold text-sky-800 text-center focus:bg-white" />
                <span class="text-[10px] text-slate-500">ถัง</span>
              </div>
            </div>

            <!-- Returned Empty Bottles (Placed directly next to 18.9L) -->
            <div class="bg-white px-2 py-1.5 rounded-lg border border-emerald-200 flex items-center justify-between gap-1 shadow-2xs">
              <div class="leading-tight">
                <div class="font-bold text-emerald-800 text-[11px]">🪣 คืนถังเปล่า</div>
                <div class="text-[9px] text-slate-400">รับคืนรอบนี้</div>
              </div>
              <div class="flex items-center gap-1 shrink-0">
                <input id="checkinReturned" type="number" min="0" required oninput="recalcCheckinModalTotals()" class="w-14 border border-emerald-300 bg-emerald-50/30 rounded px-1 py-0.5 text-sm font-bold text-emerald-800 text-center focus:bg-white" />
                <span class="text-[10px] text-slate-500">ใบ</span>
              </div>
            </div>

            <!-- 350ml -->
            <div class="bg-white px-2 py-1.5 rounded-lg border border-slate-200 flex items-center justify-between gap-1 shadow-2xs">
              <div class="leading-tight">
                <div class="font-bold text-slate-700 text-[11px]">🧃 350 ml</div>
                <div class="text-[9px] text-slate-400"><span id="checkinOrig350">สั่ง: 0</span> • <span id="checkinPrice350Label">@฿35</span></div>
              </div>
              <div class="flex items-center gap-1 shrink-0">
                <input id="checkinPacks350" type="number" min="0" value="0" oninput="recalcCheckinModalTotals()" class="w-14 border border-slate-300 rounded px-1 py-0.5 text-sm font-bold text-slate-800 text-center focus:bg-white" />
                <span class="text-[10px] text-slate-500">แพ็ค</span>
              </div>
            </div>

            <!-- 600ml -->
            <div class="bg-white px-2 py-1.5 rounded-lg border border-slate-200 flex items-center justify-between gap-1 shadow-2xs">
              <div class="leading-tight">
                <div class="font-bold text-slate-700 text-[11px]">🧃 600 ml</div>
                <div class="text-[9px] text-slate-400"><span id="checkinOrig600">สั่ง: 0</span> • <span id="checkinPrice600Label">@฿35</span></div>
              </div>
              <div class="flex items-center gap-1 shrink-0">
                <input id="checkinPacks600" type="number" min="0" value="0" oninput="recalcCheckinModalTotals()" class="w-14 border border-slate-300 rounded px-1 py-0.5 text-sm font-bold text-slate-800 text-center focus:bg-white" />
                <span class="text-[10px] text-slate-500">แพ็ค</span>
              </div>
            </div>

            <!-- 1500ml -->
            <div class="bg-white px-2 py-1.5 rounded-lg border border-slate-200 flex items-center justify-between gap-1 shadow-2xs col-span-2">
              <div class="leading-tight">
                <div class="font-bold text-slate-700 text-[11px]">🧃 1.5 L (ขวดใหญ่)</div>
                <div class="text-[9px] text-slate-400"><span id="checkinOrig1500">สั่ง: 0</span> • <span id="checkinPrice1500Label">@฿35</span></div>
              </div>
              <div class="flex items-center gap-1 shrink-0">
                <input id="checkinPacks1500" type="number" min="0" value="0" oninput="recalcCheckinModalTotals()" class="w-14 border border-slate-300 rounded px-1 py-0.5 text-sm font-bold text-slate-800 text-center focus:bg-white" />
                <span class="text-[10px] text-slate-500">แพ็ค</span>
              </div>
            </div>
          </div>

          <!-- Live Bottle Balance Strip -->
          <div id="checkinBottleBalance"></div>
        </div>

        <!-- Section: Payment & Total (Compact) -->
        <div class="rounded-lg border border-slate-200 bg-white p-2.5 space-y-2 shadow-2xs">
          <!-- Total and Payment Mode Radios -->
          <div class="flex items-center justify-between pb-1 border-b border-slate-100">
            <span class="text-[11px] font-bold text-slate-700">💵 ยอดเรียกเก็บรอบนี้:</span>
            <span id="checkinTotalAmount" class="font-black text-emerald-800 text-sm">฿0</span>
          </div>

          <div class="grid grid-cols-2 gap-1.5 text-xs">
            <label class="cursor-pointer border-2 border-emerald-500 bg-emerald-50/80 rounded-lg p-2 flex items-center gap-1.5 transition" id="lblCheckinPayCash">
              <input type="radio" name="checkinPaymentMode" id="checkinPayCash" value="cash" checked onchange="onCheckinPaymentModeChange()" class="text-emerald-600 focus:ring-emerald-500 shrink-0" />
              <div class="font-bold text-emerald-950 text-xs">🟢 รับเงินสด / โอน</div>
            </label>

            <label class="cursor-pointer border-2 border-slate-200 hover:border-amber-400 bg-white rounded-lg p-2 flex items-center gap-1.5 transition" id="lblCheckinPayCredit">
              <input type="radio" name="checkinPaymentMode" id="checkinPayCredit" value="credit" onchange="onCheckinPaymentModeChange()" class="text-amber-600 focus:ring-amber-500 shrink-0" />
              <div class="font-bold text-amber-950 text-xs">🟡 ลงบัญชี / เครดิต</div>
            </label>
          </div>

          <!-- Money Received Input & Notice in 1 Row -->
          <div class="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 gap-2">
            <div class="truncate">
              <span class="text-[10px] text-slate-500 block">เงินรับจริง:</span>
              <span id="checkinPayNotice" class="text-[10px] text-emerald-700 font-bold truncate block">รับครบเต็มจำนวน</span>
            </div>
            <div class="flex items-center gap-1 shrink-0">
              <span class="text-xs font-bold text-slate-400">฿</span>
              <input id="checkinMoneyReceived" type="number" min="0" step="1" oninput="onCheckinMoneyReceivedInput()" class="w-24 border border-slate-300 bg-white rounded px-2 py-0.5 text-xs font-bold text-slate-900 text-right font-mono" />
            </div>
          </div>
        </div>

        <!-- Note Input -->
        <input id="checkinNotes" type="text" placeholder="หมายเหตุ (ถ้ามี)..." class="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 bg-slate-50 focus:bg-white" />

        <!-- Action Buttons -->
        <div class="flex justify-end gap-2 pt-1 border-t border-slate-100">
          <button type="button" onclick="closeCheckinModal()" class="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-600 font-semibold text-xs hover:bg-slate-50 transition">ยกเลิก</button>
          <button type="submit" id="btnCheckinSubmit" class="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition flex items-center gap-1">
            <span>✅</span> <span>บันทึกปิดงาน</span>
          </button>
        </div>
      </form>
    </div>
  </div>

  `;

indexContent = indexContent.slice(0, startIdx) + compactModalHtml + indexContent.slice(endIdx);
fs.writeFileSync(indexPath, indexContent, 'utf8');
console.log('✓ Successfully updated modalCheckin in index.html');

// 2. Update app.js: onCheckinPaymentModeChange classes and balEl.innerHTML
const oldBalCode = `balEl.innerHTML = \`
      <div class="flex items-center justify-between font-bold">
        <span>🧮 คำนวณถังค้างสะสม:</span>
        <span class="\${newBalance > prevBottles ? 'text-amber-700 font-extrabold' : 'text-emerald-700 font-extrabold'}">\${newBalance} ใบ</span>
      </div>
      <div class="text-[10px] text-slate-500 mt-0.5">
        เดิมค้าง \${prevBottles} + ส่งจริง \${q189} - รับคืน \${ret189} = คงเหลือค้างที่ร้าน <b>\${newBalance}</b> ใบ
      </div>
    \`;`;

const newBalCode = `balEl.innerHTML = \`
      <div class="flex items-center justify-between text-[11px] py-1 px-2 rounded-lg bg-amber-50/80 border border-amber-200">
        <span class="text-slate-600">ถังค้างสะสม (เดิม \${prevBottles} + ส่ง \${q189} - คืน \${ret189}):</span>
        <span class="font-bold \${newBalance > prevBottles ? 'text-amber-800' : 'text-emerald-800'}">\${newBalance} ใบ</span>
      </div>
    \`;`;

if (appContent.includes(oldBalCode)) {
  appContent = appContent.replace(oldBalCode, newBalCode);
  console.log('✓ Successfully updated balEl.innerHTML in app.js');
} else {
  console.log('Notice: oldBalCode not found exactly in app.js, checking with regex');
  appContent = appContent.replace(/balEl\.innerHTML\s*=\s*`[\s\S]*?`\s*;/g, newBalCode);
  console.log('✓ Replaced balEl.innerHTML with regex');
}

// Update onCheckinPaymentModeChange classes in app.js
const oldOnChangeCode = `function onCheckinPaymentModeChange() {
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
}`;

const newOnChangeCode = `function onCheckinPaymentModeChange() {
  const isCredit = document.getElementById('checkinPayCredit')?.checked;
  const lblCash = document.getElementById('lblCheckinPayCash');
  const lblCredit = document.getElementById('lblCheckinPayCredit');
  const moneyInput = document.getElementById('checkinMoneyReceived');

  if (isCredit) {
    if (lblCredit) lblCredit.className = 'cursor-pointer border-2 border-amber-500 bg-amber-50/80 rounded-lg p-2 flex items-center gap-1.5 transition';
    if (lblCash) lblCash.className = 'cursor-pointer border-2 border-slate-200 hover:border-emerald-400 bg-white rounded-lg p-2 flex items-center gap-1.5 transition';
  } else {
    if (lblCash) lblCash.className = 'cursor-pointer border-2 border-emerald-500 bg-emerald-50/80 rounded-lg p-2 flex items-center gap-1.5 transition';
    if (lblCredit) lblCredit.className = 'cursor-pointer border-2 border-slate-200 hover:border-amber-400 bg-white rounded-lg p-2 flex items-center gap-1.5 transition';
  }

  if (moneyInput) delete moneyInput.dataset.manualEdit;
  recalcCheckinModalTotals();
}`;

if (appContent.includes(oldOnChangeCode)) {
  appContent = appContent.replace(oldOnChangeCode, newOnChangeCode);
  console.log('✓ Successfully updated onCheckinPaymentModeChange in app.js');
}

fs.writeFileSync(appPath, appContent, 'utf8');
console.log('--- MODAL COMPACT UPDATES COMPLETED ---');
