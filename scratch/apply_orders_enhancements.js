const fs = require('fs');

const htmlPath = 'd:/13. Antigravity/Sunan/Inthara_program_develop/public/index.html';
const appPath = 'd:/13. Antigravity/Sunan/Inthara_program_develop/public/app.js';
const serverPath = 'd:/13. Antigravity/Sunan/Inthara_program_develop/server.js';

let html = fs.readFileSync(htmlPath, 'utf8');
let app = fs.readFileSync(appPath, 'utf8');
let srv = fs.readFileSync(serverPath, 'utf8');

// ========================================================
// 1. UPDATE public/index.html
// ========================================================
console.log('1. Updating index.html...');

// 1.1 Fix hardcoded value="2026-10-27" in ordFormDeliveryDate
html = html.replace(
  '<input id="ordFormDeliveryDate" type="date" required class="w-full border border-slate-200 bg-white rounded-lg px-2.5 py-2 text-slate-800" value="2026-10-27" />',
  '<input id="ordFormDeliveryDate" type="date" required class="w-full border border-slate-200 bg-white rounded-lg px-2.5 py-2 text-slate-800 font-bold" />'
);

// 1.2 Add Cancel Edit Button in Order Form
const oldFormButtons = `<button type="button" onclick="resetOrderForm()" class="px-3.5 py-2 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold transition flex items-center gap-1"><span>🧹</span> <span>ล้างฟอร์ม</span></button>
              <button type="submit" id="btnSubmitOrderForm"`;

const newFormButtons = `<button type="button" id="btnCancelOrderEdit" onclick="cancelOrderEdit()" class="hidden px-3.5 py-2 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold transition flex items-center gap-1"><span>✕</span> <span>ยกเลิกแก้ไข</span></button>
              <button type="button" onclick="resetOrderForm()" class="px-3.5 py-2 rounded-lg border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold transition flex items-center gap-1"><span>🧹</span> <span>ล้างฟอร์ม</span></button>
              <button type="submit" id="btnSubmitOrderForm"`;

if (html.includes(oldFormButtons)) {
  html = html.replace(oldFormButtons, newFormButtons);
  console.log('✓ Added btnCancelOrderEdit');
}

// 1.3 Update Card 2 (Sales Orders Table Header & Toolbar)
const oldCard2HeaderStart = '<!-- Card 2: Sales Orders Table';
const oldCard2HeaderEnd = '<tbody id="ordersTableBody"';

const c2Start = html.indexOf(oldCard2HeaderStart);
const c2End = html.indexOf(oldCard2HeaderEnd, c2Start);

if (c2Start !== -1 && c2End !== -1) {
  const newCard2HeaderHtml = `<!-- Card 2: Sales Orders Table (Compact, Date-Filterable, Default to Latest Date) -->
      <div class="bg-white rounded-xl p-4 shadow-sm border border-slate-200 space-y-3">
        <!-- Header Bar with Title, Active Date Badge & Excel Export -->
        <div class="-mx-4 -mt-4 px-4 py-2.5 rounded-t-xl bg-gradient-to-r from-sky-700 via-teal-700 to-emerald-700 text-white flex flex-wrap items-center justify-between gap-2 shadow-xs">
          <div class="flex items-center gap-2">
            <span class="text-base">📜</span>
            <h3 class="font-bold text-white text-xs md:text-sm tracking-wide">รายการใบสั่งออเดอร์น้ำดื่ม</h3>
            <span id="ordHeaderDateBadge" class="bg-white/20 text-white text-xs font-bold px-2.5 py-0.5 rounded-full shadow-2xs">
              📅 กำลังโหลด...
            </span>
          </div>
          <div class="flex items-center gap-2">
            <a id="btnOrdExportExcel" href="/api/orders/export-excel" target="_blank" class="bg-white/20 hover:bg-white/30 text-white border border-white/30 font-semibold px-2.5 py-1 rounded-md text-[11px] transition flex items-center gap-1" title="ส่งออกข้อมูลออเดอร์เป็นไฟล์ Excel">
              <span>📥</span> <span>ส่งออก Excel</span>
            </a>
          </div>
        </div>

        <!-- High-Efficiency Toolbar: 3 Status Tabs + Date Picker + Quick Buttons + Search + Inline Summary -->
        <div class="flex flex-wrap items-center justify-between gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
          <!-- 3 Status Filter Tabs (ยังไม่ได้จัดส่ง, จัดส่งสำเร็จแล้ว, ทั้งหมด) -->
          <div class="flex items-center gap-1 bg-slate-200/70 p-0.5 rounded-lg shrink-0">
            <button type="button" id="btnOrdFilterPending" onclick="setOrderFilterStatus('pending')" class="px-3 py-1 rounded-md text-xs font-bold transition flex items-center gap-1.5 shadow-xs bg-sky-700 text-white">
              <span>⏳ ยังไม่ได้จัดส่ง</span>
              <span id="badgeOrdPendingTab" class="bg-white/20 text-white text-[10px] px-1.5 py-0.2 rounded-full font-bold">0</span>
            </button>
            <button type="button" id="btnOrdFilterCompleted" onclick="setOrderFilterStatus('completed')" class="px-3 py-1 rounded-md text-xs font-semibold text-slate-600 hover:text-slate-900 transition flex items-center gap-1.5 bg-transparent">
              <span>✅ จัดส่งสำเร็จแล้ว</span>
              <span id="badgeOrdCompletedTab" class="bg-slate-300 text-slate-700 text-[10px] px-1.5 py-0.2 rounded-full font-bold">0</span>
            </button>
            <button type="button" id="btnOrdFilterAll" onclick="setOrderFilterStatus('all')" class="px-3 py-1 rounded-md text-xs font-semibold text-slate-600 hover:text-slate-900 transition flex items-center gap-1.5 bg-transparent">
              <span>📋 ทั้งหมด</span>
              <span id="badgeOrdAllTab" class="bg-slate-300 text-slate-700 text-[10px] px-1.5 py-0.2 rounded-full font-bold">0</span>
            </button>
          </div>

          <!-- Date Filter Controls: Date Picker + Latest Date + All Dates + Search -->
          <div class="flex flex-wrap items-center gap-1.5">
            <div class="flex items-center gap-1.5 bg-white border border-slate-300 rounded-lg px-2.5 py-1 shadow-2xs">
              <span class="text-[11px] text-slate-500 font-semibold">📅 วันที่:</span>
              <input type="date" id="ordDateFilterInput" onchange="renderOrdersView()" class="text-xs font-bold text-slate-800 outline-none cursor-pointer bg-transparent" />
            </div>
            <button type="button" onclick="setOrderFilterLatestDate()" class="bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 font-bold px-2.5 py-1 rounded-lg text-xs transition shadow-2xs" title="เลือกแสดงวันที่ล่าสุดเสมอ">
              วันล่าสุด
            </button>
            <button type="button" onclick="setOrderFilterAllDates()" class="bg-slate-100 hover:bg-slate-200 text-slate-600 font-medium px-2.5 py-1 rounded-lg text-xs transition" title="ดูออเดอร์ทั้งหมดทุกวัน">
              ทุกวัน
            </button>
            <input id="ordSearchInput" oninput="renderOrdersView()" type="text" class="border border-slate-200 bg-white text-slate-800 rounded-lg px-2.5 py-1 text-xs w-44 focus:outline-sky-500 font-medium" placeholder="🔍 ค้นหาเลขที่, ชื่อร้าน..." />
          </div>

          <!-- Compact Live Stats Pill -->
          <div class="text-[11px] font-semibold text-slate-600 bg-white border border-slate-200/90 px-3 py-1 rounded-lg flex items-center gap-2 shadow-2xs">
            <span>รวม: <b id="ordSummaryTotalCount" class="text-sky-700">0</b> รายการ</span>
            <span class="text-slate-300">|</span>
            <span>ยอดเงิน: <b id="ordSummaryTotalAmount" class="text-emerald-700 font-mono">฿0</b></span>
            <span class="text-slate-300">|</span>
            <span>สินค้าในตาราง: <b id="ordSummaryLoad" class="text-slate-800">0 ถัง / 0 แพ็ค</b></span>
          </div>
        </div>

        <!-- Orders Table (Compact, High-Density 10 Columns) -->
        <div class="overflow-x-auto">
          <table class="w-full text-left border-collapse text-xs">
            <thead>
              <tr class="bg-slate-100 text-slate-700 border-y border-slate-200">
                <th class="p-2 font-bold whitespace-nowrap">เลขที่ออเดอร์</th>
                <th class="p-2 font-bold">ลูกค้า / ข้อมูลติดต่อ</th>
                <th class="p-2 font-bold whitespace-nowrap">วัน / เวลาส่ง</th>
                <th class="p-2 text-center font-bold whitespace-nowrap">ถัง 18.9L</th>
                <th class="p-2 text-center font-bold whitespace-nowrap">แพ็ค 350ml</th>
                <th class="p-2 text-center font-bold whitespace-nowrap">แพ็ค 600ml</th>
                <th class="p-2 text-center font-bold whitespace-nowrap">แพ็ค 1.5L</th>
                <th class="p-2 text-right font-bold whitespace-nowrap">รวมเงิน</th>
                <th class="p-2 text-center font-bold whitespace-nowrap">สถานะ</th>
                <th class="p-2 text-center font-bold whitespace-nowrap">จัดการ</th>
              </tr>
            </thead>
            <tbody id="ordersTableBody"`;

  html = html.slice(0, c2Start) + newCard2HeaderHtml + html.slice(c2End + '<tbody id="ordersTableBody"'.length);
  console.log('✓ Updated Card 2 Header & Toolbar with Date Filter and 3 Status Tabs');
}

// 1.4 Add Printable Order Slip / Bill Modal (#modalOrderSlip) before </body>
if (!html.includes('id="modalOrderSlip"')) {
  const modalOrderSlipHtml = `
  <!-- MODAL: Printable Order Slip / Delivery Bill -->
  <div id="modalOrderSlip" class="fixed inset-0 bg-slate-950/70 hidden items-center justify-center z-50 p-4 backdrop-blur-sm">
    <div class="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4 border border-slate-200 max-h-[92vh] overflow-y-auto">
      <div class="flex items-start justify-between border-b pb-3">
        <div class="flex items-center gap-2">
          <span class="text-2xl">📄</span>
          <div>
            <h3 class="font-bold text-slate-900 text-base">ใบสั่งซื้อ / ใบส่งของน้ำดื่ม</h3>
            <p class="text-xs text-slate-500">Inthara Smart Water - Order & Delivery Slip</p>
          </div>
        </div>
        <button onclick="closeOrderSlipModal()" class="text-slate-400 hover:text-slate-600 text-xl font-bold p-1">✕</button>
      </div>

      <!-- Printable Area -->
      <div id="orderSlipPrintableArea" class="bg-white p-4 border border-slate-200 rounded-xl space-y-3 text-xs text-slate-800">
        <!-- Company Header -->
        <div class="text-center border-b border-slate-200 pb-2.5">
          <h2 class="text-sm font-bold text-slate-900">บริษัท น้ำดื่มอินทรา จำกัด (โรงงานผลิตน้ำดื่มมาตรฐาน)</h2>
          <p class="text-[11px] text-slate-500">ต.จริม อ.ท่าปลา จ.อุตรดิตถ์ 53150 • โทร. 085-279-8343</p>
        </div>

        <!-- Order & Customer Info Grid -->
        <div class="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-3 rounded-lg border border-slate-200">
          <div>
            <div>เลขที่เอกสาร: <strong id="slipOrderId" class="font-mono text-sky-800 text-xs"></strong></div>
            <div>วันที่ส่งสินค้า: <strong id="slipDeliveryDate" class="font-mono text-slate-800"></strong></div>
            <div>เวลาจัดส่ง: <strong id="slipDeliveryTime" class="font-mono text-slate-800"></strong></div>
            <div>สถานะ: <span id="slipStatusBadge" class="font-bold"></span></div>
          </div>
          <div>
            <div>ชื่อลูกค้า: <strong id="slipCustomerName" class="text-slate-900"></strong></div>
            <div>รหัสลูกค้า: <span id="slipCustomerId" class="font-mono text-slate-600"></span></div>
            <div>เบอร์โทรศัพท์: <span id="slipCustomerPhone" class="font-mono text-slate-700"></span></div>
            <div>โซน: <span id="slipCustomerZone" class="text-slate-700"></span></div>
          </div>
          <div class="col-span-2 pt-1 border-t border-slate-200/60 text-[11px]">
            ที่อยู่จัดส่ง: <span id="slipCustomerAddress" class="text-slate-700"></span>
          </div>
        </div>

        <!-- Items Table -->
        <table class="w-full text-left border-collapse text-xs border border-slate-200">
          <thead>
            <tr class="bg-slate-100 text-slate-700 border-b border-slate-200">
              <th class="p-2">รายการสินค้า</th>
              <th class="p-2 text-center">จำนวน</th>
              <th class="p-2 text-right">ราคา/หน่วย</th>
              <th class="p-2 text-right">จำนวนเงิน</th>
            </tr>
          </thead>
          <tbody id="slipItemsTableBody" class="divide-y divide-slate-200"></tbody>
          <tfoot>
            <tr class="bg-slate-50 font-bold border-t border-slate-200">
              <td colspan="3" class="p-2 text-right">ยอดรวมสุทธิทั้งสิ้น:</td>
              <td id="slipTotalAmount" class="p-2 text-right font-mono text-teal-800 text-sm"></td>
            </tr>
          </tfoot>
        </table>

        <!-- Payment & Notes -->
        <div class="grid grid-cols-2 gap-2 text-[11px] pt-1">
          <div>เงื่อนไขชำระเงิน: <strong id="slipPaymentTerm"></strong></div>
          <div>หมายเหตุ: <span id="slipNotes" class="text-slate-600">-</span></div>
        </div>

        <!-- Signatures Area -->
        <div class="grid grid-cols-2 gap-4 pt-6 text-center text-[11px] text-slate-600 border-t border-slate-200">
          <div>
            <div class="border-b border-slate-300 w-36 mx-auto mb-1"></div>
            <div>ลงชื่อผู้รับสินค้า / ลูกค้า</div>
            <div class="text-[10px] text-slate-400">วันที่ ...../...../..........</div>
          </div>
          <div>
            <div class="border-b border-slate-300 w-36 mx-auto mb-1"></div>
            <div>ลงชื่อผู้ส่งสินค้า / พนักงาน</div>
            <div class="text-[10px] text-slate-400">วันที่ ...../...../..........</div>
          </div>
        </div>
      </div>

      <!-- Footer Buttons -->
      <div class="flex items-center justify-between pt-2 border-t border-slate-100">
        <button type="button" onclick="printOrderSlip()" class="bg-sky-600 hover:bg-sky-700 text-white font-bold px-4 py-2 rounded-xl text-xs transition shadow-sm flex items-center gap-1.5">
          <span>🖨️</span> <span>พิมพ์เอกสารใบส่งของ</span>
        </button>
        <button type="button" onclick="closeOrderSlipModal()" class="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold text-xs transition">
          ปิดหน้าต่าง
        </button>
      </div>
    </div>
  </div>
`;

  html = html.replace('</body>', modalOrderSlipHtml + '\n</body>');
  console.log('✓ Added modalOrderSlip in index.html');
}

fs.writeFileSync(htmlPath, html, 'utf8');
console.log('✓ Successfully written index.html');


// ========================================================
// 2. UPDATE public/app.js
// ========================================================
console.log('2. Updating app.js...');

// Replace setOrderFilterStatus & renderOrdersView & resetOrderForm
const oldOrdersSectionStart = "let currentOrderStatusFilter = 'pending';";
const oldOrdersSectionEnd = "// ==========================================\n// CUSTOMER SECURITY & ACCESS MANAGEMENT";

const oStart = app.indexOf(oldOrdersSectionStart);
const oEnd = app.indexOf(oldOrdersSectionEnd, oStart);

if (oStart === -1 || oEnd === -1) {
  console.error('Error: Could not locate orders logic block in app.js');
  process.exit(1);
}

const newOrdersSection = `let currentOrderStatusFilter = 'all'; // Default: แสดงทั้งหมด หรือเลือกตามสถานะได้ ('all', 'pending', 'completed')

function getLatestOrderDate() {
  const orders = Array.isArray(appData?.orders) ? appData.orders : [];
  const today = new Date().toISOString().slice(0, 10);
  if (orders.length === 0) return today;
  const dates = orders.map(o => o.deliveryDate).filter(Boolean);
  if (dates.length === 0) return today;
  dates.sort().reverse();
  return dates[0];
}

function setOrderFilterLatestDate() {
  const dateInput = document.getElementById('ordDateFilterInput');
  const latestDate = getLatestOrderDate();
  if (dateInput) {
    dateInput.value = latestDate;
  }
  renderOrdersView();
}

function setOrderFilterAllDates() {
  const dateInput = document.getElementById('ordDateFilterInput');
  if (dateInput) {
    dateInput.value = '';
  }
  renderOrdersView();
}

function setOrderFilterStatus(status) {
  currentOrderStatusFilter = (status === 'completed' || status === 'pending' || status === 'all') ? status : 'all';

  const btnPending = document.getElementById('btnOrdFilterPending');
  const btnCompleted = document.getElementById('btnOrdFilterCompleted');
  const btnAll = document.getElementById('btnOrdFilterAll');

  const activeCls = 'px-3 py-1 rounded-md text-xs font-bold transition flex items-center gap-1.5 shadow-xs bg-sky-700 text-white';
  const inactiveCls = 'px-3 py-1 rounded-md text-xs font-semibold text-slate-600 hover:text-slate-900 transition flex items-center gap-1.5 bg-transparent';

  if (btnPending) btnPending.className = currentOrderStatusFilter === 'pending' ? activeCls : inactiveCls;
  if (btnCompleted) btnCompleted.className = currentOrderStatusFilter === 'completed' ? activeCls : inactiveCls;
  if (btnAll) btnAll.className = currentOrderStatusFilter === 'all' ? activeCls : inactiveCls;

  renderOrdersView();
}

// ------------------------------------------
// CUSTOMER LINKING & ORDER FORM LOGIC
// ------------------------------------------
function populateOrderCustomerDropdown() {
  const selId = document.getElementById('ordFormCustomerSelect');
  const selName = document.getElementById('ordFormCustomerNameSelect');
  const selPhone = document.getElementById('ordFormCustomerPhoneSelect');
  if (!appData || !Array.isArray(appData.customers)) return;

  const currentVal = selId?.value || '';
  const defaultOption = '<option value="">-- กรุณาเลือกลูกค้า --</option>';

  if (selId) {
    selId.innerHTML = defaultOption + appData.customers.map(c =>
      \`<option value="\${c.id}">\${c.id} — \${c.name} (\${c.zone})</option>\`
    ).join('');
  }

  if (selName) {
    selName.innerHTML = defaultOption + appData.customers.map(c =>
      \`<option value="\${c.id}">\${c.name} [\${c.id}] — 📞 \${c.phone || '-'}</option>\`
    ).join('');
  }

  if (selPhone) {
    selPhone.innerHTML = defaultOption + appData.customers.map(c =>
      \`<option value="\${c.id}">\${c.phone || '-'} — \${c.name} [\${c.id}]</option>\`
    ).join('');
  }

  if (currentVal && appData.customers.some(c => c.id === currentVal)) {
    if (selId) selId.value = currentVal;
    if (selName) selName.value = currentVal;
    if (selPhone) selPhone.value = currentVal;
  }
}

function onOrderCustomerSelectChange(source) {
  let custId = '';
  if (source === 'phone') {
    custId = document.getElementById('ordFormCustomerPhoneSelect')?.value;
  } else if (source === 'name') {
    custId = document.getElementById('ordFormCustomerNameSelect')?.value;
  } else {
    custId = document.getElementById('ordFormCustomerSelect')?.value;
  }

  // Synchronize all 3 dropdowns
  const selId = document.getElementById('ordFormCustomerSelect');
  const selName = document.getElementById('ordFormCustomerNameSelect');
  const selPhone = document.getElementById('ordFormCustomerPhoneSelect');
  if (selId && selId.value !== custId) selId.value = custId || '';
  if (selName && selName.value !== custId) selName.value = custId || '';
  if (selPhone && selPhone.value !== custId) selPhone.value = custId || '';

  const c = (appData?.customers || []).find(item => item.id === custId);
  const addrInfo = document.getElementById('ordFormCustomerAddressInfo');
  const priceInfo = document.getElementById('ordFormCustomerPriceInfo');

  if (!c) {
    if (addrInfo) addrInfo.textContent = '📍 ที่อยู่จัดส่ง: -';
    if (priceInfo) priceInfo.textContent = '💳 เงื่อนไขชำระเงิน: - • ระดับราคา: -';
    recalculateOrderFormTotal();
    return;
  }

  // Update quick phone lookup box
  const phoneInput = document.getElementById('ordFormCustomerPhoneInput');
  if (phoneInput && c.phone && c.phone !== '-') {
    phoneInput.value = c.phone;
  }

  // Populate Customer Master information linked into the order form
  if (addrInfo) {
    addrInfo.innerHTML = \`📍 ที่อยู่จัดส่ง: <strong class="text-slate-800">\${c.address || '-'}</strong> <span class="text-slate-400">(\${c.zone})</span> • รอบส่ง: <span class="text-sky-700 font-semibold">\${c.deliveryDays || '-'}</span>\`;
  }
  if (priceInfo) {
    const bottlesHeld = c.OutstandingBottles || 0;
    const creditBal = Number(c.creditBalance || 0);
    const creditLim = Number(c.creditLimit || 0);
    priceInfo.innerHTML = \`💳 เงื่อนไข: <strong class="text-slate-800">\${c.paymentTerm || 'เงินสด / โอนเงิน'}</strong> • ระดับราคา: <strong class="text-indigo-700">\${c.priceTier || 'ราคาส่งร้านค้า'}</strong> • ถังค้างเดิม: <strong class="text-amber-700">\${bottlesHeld} ถัง</strong> • เครดิตค้าง: <strong class="\${creditBal > 0 ? 'text-rose-600' : 'text-emerald-600'}">฿\${creditBal.toLocaleString()}</strong> (วงเงิน ฿\${creditLim.toLocaleString()})\`;
  }

  // Auto-fill Unit Prices strictly from Customer Master (Locked from editing)
  const p189El = document.getElementById('ordFormPrice189');
  const p350El = document.getElementById('ordFormPrice350');
  const p600El = document.getElementById('ordFormPrice600');
  const p1500El = document.getElementById('ordFormPrice1500');

  if (p189El) { p189El.value = c.price189L ?? 15; p189El.readOnly = true; }
  if (p350El) { p350El.value = c.price350ml ?? 35; p350El.readOnly = true; }
  if (p600El) { p600El.value = c.price600ml ?? 35; p600El.readOnly = true; }
  if (p1500El) { p1500El.value = c.price1500ml ?? 35; p1500El.readOnly = true; }

  // Auto-fill standard quantities from Customer Master if this is a fresh order and currently 0
  const q189El = document.getElementById('ordFormQty189');
  const q350El = document.getElementById('ordFormQty350');
  const q600El = document.getElementById('ordFormQty600');
  const q1500El = document.getElementById('ordFormQty1500');
  const existingOrderId = document.getElementById('ordFormOrderId')?.value?.trim();

  if (!existingOrderId) {
    const curTotalQty = Number(q189El?.value || 0) + Number(q350El?.value || 0) + Number(q600El?.value || 0) + Number(q1500El?.value || 0);
    if (curTotalQty === 0) {
      if (q189El && c.orderBottles189L > 0) q189El.value = c.orderBottles189L;
      if (q350El && c.orderPack350ml > 0) q350El.value = c.orderPack350ml;
      if (q600El && c.orderPack600ml > 0) q600El.value = c.orderPack600ml;
      if (q1500El && c.orderPack1500ml > 0) q1500El.value = c.orderPack1500ml;
    }
  }

  recalculateOrderFormTotal();
}

function onOrderPhoneLookupInput(val) {
  const q = String(val || '').trim().toLowerCase().replace(/[^0-9a-zก-๙]/g, '');
  if (!q || !appData?.customers) return;

  const found = appData.customers.find(c => {
    const cleanPhone = String(c.phone || '').replace(/[^0-9]/g, '');
    const cleanId = String(c.id || '').toLowerCase();
    const cleanName = String(c.name || '').toLowerCase();
    return cleanPhone.includes(q) || cleanId.includes(q) || cleanName.includes(q);
  });

  if (found) {
    const selId = document.getElementById('ordFormCustomerSelect');
    if (selId && selId.value !== found.id) {
      selId.value = found.id;
      onOrderCustomerSelectChange('id');
    }
  }
}

function recalculateOrderFormTotal() {
  const q189 = Math.max(0, Number(document.getElementById('ordFormQty189')?.value || 0));
  const q350 = Math.max(0, Number(document.getElementById('ordFormQty350')?.value || 0));
  const q600 = Math.max(0, Number(document.getElementById('ordFormQty600')?.value || 0));
  const q1500 = Math.max(0, Number(document.getElementById('ordFormQty1500')?.value || 0));

  const p189 = Number(document.getElementById('ordFormPrice189')?.value || 15);
  const p350 = Number(document.getElementById('ordFormPrice350')?.value || 35);
  const p600 = Number(document.getElementById('ordFormPrice600')?.value || 35);
  const p1500 = Number(document.getElementById('ordFormPrice1500')?.value || 35);

  const sub189 = q189 * p189;
  const sub350 = q350 * p350;
  const sub600 = q600 * p600;
  const sub1500 = q1500 * p1500;

  const totalQty = q189 + q350 + q600 + q1500;
  const grandTotal = sub189 + sub350 + sub600 + sub1500;

  const s189El = document.getElementById('ordFormSub189');
  const s350El = document.getElementById('ordFormSub350');
  const s600El = document.getElementById('ordFormSub600');
  const s1500El = document.getElementById('ordFormSub1500');
  const totalDisplay = document.getElementById('ordFormGrandTotalDisplay');
  const submitBtn = document.getElementById('btnSubmitOrderForm');

  if (s189El) s189El.textContent = \`฿\${sub189.toLocaleString()}\`;
  if (s350El) s350El.textContent = \`฿\${sub350.toLocaleString()}\`;
  if (s600El) s600El.textContent = \`฿\${sub600.toLocaleString()}\`;
  if (s1500El) s1500El.textContent = \`฿\${sub1500.toLocaleString()}\`;
  if (totalDisplay) totalDisplay.textContent = \`฿\${grandTotal.toLocaleString()}\`;

  if (submitBtn) {
    if (totalQty <= 0) {
      submitBtn.disabled = true;
      submitBtn.className = 'px-4 py-2 rounded-lg bg-slate-200 text-slate-400 font-semibold cursor-not-allowed transition shadow-none flex items-center gap-1';
      submitBtn.title = 'กรุณาระบุจำนวนสินค้าอย่างน้อย 1 รายการ (ออเดอร์ > 0) ก่อนบันทึก';
    } else {
      submitBtn.disabled = false;
      submitBtn.className = 'px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-semibold shadow-sm transition flex items-center gap-1 cursor-pointer';
      submitBtn.title = 'บันทึกคำสั่งซื้อเข้าระบบและอัปเดตเข้าแผนที่สายส่ง GPS';
    }
  }
}

function viewCustomerFromOrder(custId) {
  switchTab('customers');
  const searchInput = document.getElementById('custSearchInput');
  if (searchInput) {
    searchInput.value = custId;
  }
  renderCustomersMasterView();
}

function filterOrdersByCustomer(custId) {
  switchTab('orders');
  const searchInput = document.getElementById('ordSearchInput');
  if (searchInput) {
    searchInput.value = custId;
  }
  const sel = document.getElementById('ordFormCustomerSelect');
  if (sel) {
    sel.value = custId;
    onOrderCustomerSelectChange('id');
  }
  renderOrdersView();
}

function openOrderForCustomer(custId) {
  switchTab('orders');
  resetOrderForm();
  populateOrderCustomerDropdown();
  const sel = document.getElementById('ordFormCustomerSelect');
  if (sel) {
    sel.value = custId;
    onOrderCustomerSelectChange('id');
  }
  document.getElementById('salesOrderFormCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderOrdersView() {
  if (!appData) return;
  populateOrderCustomerDropdown();

  const orders = Array.isArray(appData.orders) ? appData.orders : [];

  // Calculate counts for statuses
  const pendingOrders = orders.filter(o => o.orderStatus !== 'จัดส่งสำเร็จแล้ว');
  const completedOrders = orders.filter(o => o.orderStatus === 'จัดส่งสำเร็จแล้ว');

  const pendingCount = pendingOrders.length;
  const completedCount = completedOrders.length;
  const totalOrdersCount = orders.length;

  // Update Tab Badges
  const badgePending = document.getElementById('badgeOrdPendingTab');
  const badgeCompleted = document.getElementById('badgeOrdCompletedTab');
  const badgeAll = document.getElementById('badgeOrdAllTab');
  if (badgePending) badgePending.textContent = pendingCount;
  if (badgeCompleted) badgeCompleted.textContent = completedCount;
  if (badgeAll) badgeAll.textContent = totalOrdersCount;

  // Date Filter: Defaults to LATEST DATE first always
  const dateInput = document.getElementById('ordDateFilterInput');
  const latestDate = getLatestOrderDate();
  if (dateInput && !dateInput.value) {
    dateInput.value = latestDate;
  }

  const selectedDate = dateInput ? dateInput.value : latestDate;
  const dateBadge = document.getElementById('ordHeaderDateBadge');
  const btnExport = document.getElementById('btnOrdExportExcel');

  if (dateBadge) {
    if (selectedDate === latestDate) {
      dateBadge.textContent = \`📅 วันที่ \${selectedDate} (ล่าสุด)\`;
      dateBadge.className = 'bg-white/20 text-white text-xs font-bold px-2.5 py-0.5 rounded-full shadow-2xs';
    } else if (selectedDate) {
      dateBadge.textContent = \`📅 วันที่ \${selectedDate}\`;
      dateBadge.className = 'bg-white/20 text-white text-xs font-bold px-2.5 py-0.5 rounded-full shadow-2xs';
    } else {
      dateBadge.textContent = '📅 ทั้งหมด (ทุกวันที่)';
      dateBadge.className = 'bg-white/20 text-white text-xs font-bold px-2.5 py-0.5 rounded-full shadow-2xs';
    }
  }

  if (btnExport) {
    btnExport.href = selectedDate ? \`/api/orders/export-excel?date=\${selectedDate}\` : '/api/orders/export-excel';
  }

  // Filter according to status & date & search
  const q = (document.getElementById('ordSearchInput')?.value || '').trim().toLowerCase();

  const filtered = orders.filter(o => {
    // Status filter
    if (currentOrderStatusFilter === 'pending') {
      if (o.orderStatus === 'จัดส่งสำเร็จแล้ว') return false;
    } else if (currentOrderStatusFilter === 'completed') {
      if (o.orderStatus !== 'จัดส่งสำเร็จแล้ว') return false;
    }

    // Date filter: if selected, match deliveryDate exactly
    if (selectedDate && o.deliveryDate !== selectedDate) {
      return false;
    }

    // Search query
    if (q) {
      const cust = appData.customers?.find(c => c.id === o.customerId);
      const phone = o.customerPhone || cust?.phone || '';
      const txt = \`\${o.orderId} \${o.customerId} \${o.customerName} \${phone} \${o.zone || ''} \${o.deliveryDate || ''} \${o.notes || ''}\`.toLowerCase();
      if (!txt.includes(q)) return false;
    }

    return true;
  });

  // Sort: NEWEST DATE & TIME & ORDER FIRST (วันที่ล่าสุดขึ้นก่อนเสมอ)
  filtered.sort((a, b) => {
    const dComp = (b.deliveryDate || '').localeCompare(a.deliveryDate || '');
    if (dComp !== 0) return dComp;
    const tComp = (b.deliveryTime || '').localeCompare(a.deliveryTime || '');
    if (tComp !== 0) return tComp;
    return (b.orderId || '').localeCompare(a.orderId || '');
  });

  // Update Summary Pill in toolbar
  const sumFilteredAmount = filtered.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);
  const sumBottles = filtered.reduce((sum, o) => sum + Number(o.qty189L || 0), 0);
  const sumPacks = filtered.reduce((sum, o) => sum + Number(o.qty350ml || 0) + Number(o.qty600ml || 0) + Number(o.qty1500ml || 0), 0);

  const sumTotalCountEl = document.getElementById('ordSummaryTotalCount');
  const sumTotalAmountEl = document.getElementById('ordSummaryTotalAmount');
  const sumLoadEl = document.getElementById('ordSummaryLoad');

  if (sumTotalCountEl) sumTotalCountEl.textContent = filtered.length;
  if (sumTotalAmountEl) sumTotalAmountEl.textContent = \`฿\${sumFilteredAmount.toLocaleString()}\`;
  if (sumLoadEl) sumLoadEl.textContent = \`\${sumBottles.toLocaleString()} ถัง / \${sumPacks.toLocaleString()} แพ็ค\`;

  const tbody = document.getElementById('ordersTableBody');
  if (!tbody) return;

  if (filtered.length === 0) {
    const dateNotice = selectedDate ? \`ในวันที่ \${selectedDate}\` : '';
    const statusNotice = currentOrderStatusFilter === 'pending' ? 'ที่ยังไม่ได้จัดส่ง' : (currentOrderStatusFilter === 'completed' ? 'ที่จัดส่งสำเร็จแล้ว' : '');
    tbody.innerHTML = \`<tr><td colspan="10" class="p-8 text-center text-xs text-slate-400 bg-slate-50/50">ℹ️ ไม่มีใบสั่งออเดอร์น้ำดื่ม \${statusNotice} \${dateNotice} (กดปุ่ม "ทุกวัน" เพื่อดูทั้งหมด หรือเลือกวันที่อื่นด้านบน)</td></tr>\`;
    return;
  }

  tbody.innerHTML = filtered.map(o => {
    const cust = appData.customers?.find(c => c.id === o.customerId);
    const custPhone = o.customerPhone || cust?.phone || '-';
    const isDone = o.orderStatus === 'จัดส่งสำเร็จแล้ว';
    const q189 = Number(o.qty189L || 0);
    const q350 = Number(o.qty350ml || 0);
    const q600 = Number(o.qty600ml || 0);
    const q1500 = Number(o.qty1500ml || 0);

    const completedInfo = (isDone && o.completedAt) ? \`<span class="text-[10px] text-emerald-600 block font-normal">✓ ปิดงานเมื่อ \${new Date(o.completedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.</span>\` : '';

    return \`
      <tr class="hover:bg-slate-50/80 transition">
        <td class="p-2 font-mono font-bold text-slate-800 text-xs whitespace-nowrap">
          \${o.orderId}
        </td>
        <td class="p-2">
          <div class="font-bold text-slate-800 text-xs truncate max-w-[200px]" title="\${o.customerName} (\${o.address || ''})">
            <span class="hover:text-teal-700 cursor-pointer" onclick="viewCustomerFromOrder('\${o.customerId}')" title="คลิกเพื่อดูข้อมูลลูกค้าในทะเบียนลูกค้า">\${o.customerName}</span>
            <span onclick="viewCustomerFromOrder('\${o.customerId}')" class="font-normal text-sky-600 hover:text-sky-800 font-mono text-[10px] cursor-pointer hover:underline" title="คลิกเพื่อดูข้อมูลลูกค้าในทะเบียนลูกค้า">[\${o.customerId}]</span>
          </div>
          <div class="text-[11px] text-slate-500 font-mono">
            📞 \${custPhone} <span class="text-slate-400 font-sans">• \${o.zone || '-'}</span>
          </div>
        </td>
        <td class="p-2 whitespace-nowrap">
          <div class="font-bold font-mono text-slate-700 text-xs">📅 \${o.deliveryDate || '-'}</div>
          <div class="text-[10px] font-mono text-slate-500">🕒 \${o.deliveryTime || '09:00'} น.</div>
          \${completedInfo}
        </td>
        <td class="p-2 text-center whitespace-nowrap">
          \${q189 > 0 ? \`<div class="font-bold text-slate-800 text-xs">\${q189}</div><div class="text-[9px] text-slate-400">@฿\${o.unitPrice189L || 15}</div>\` : '<div class="text-slate-300 text-xs">-</div>'}
        </td>
        <td class="p-2 text-center whitespace-nowrap">
          \${q350 > 0 ? \`<div class="font-bold text-slate-800 text-xs">\${q350}</div><div class="text-[9px] text-slate-400">@฿\${o.unitPrice350ml || 35}</div>\` : '<div class="text-slate-300 text-xs">-</div>'}
        </td>
        <td class="p-2 text-center whitespace-nowrap">
          \${q600 > 0 ? \`<div class="font-bold text-slate-800 text-xs">\${q600}</div><div class="text-[9px] text-slate-400">@฿\${o.unitPrice600ml || 35}</div>\` : '<div class="text-slate-300 text-xs">-</div>'}
        </td>
        <td class="p-2 text-center whitespace-nowrap">
          \${q1500 > 0 ? \`<div class="font-bold text-slate-800 text-xs">\${q1500}</div><div class="text-[9px] text-slate-400">@฿\${o.unitPrice1500ml || 35}</div>\` : '<div class="text-slate-300 text-xs">-</div>'}
        </td>
        <td class="p-2 text-right font-mono font-bold text-teal-800 text-xs whitespace-nowrap">
          ฿\${Number(o.totalAmount || 0).toLocaleString()}
        </td>
        <td class="p-2 text-center whitespace-nowrap">
          \${isDone ? \`
            <span class="bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-full text-[10px] font-bold">
              ✓ จัดส่งสำเร็จแล้ว
            </span>
          \` : \`
            <span class="bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full text-[10px] font-semibold">
              ⏳ ยังไม่ได้จัดส่ง
            </span>
          \`}
        </td>
        <td class="p-2 text-center whitespace-nowrap">
          <div class="flex items-center justify-center gap-1">
            <button type="button" onclick="openOrderSlipModal('\${o.orderId}')" class="bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 font-bold px-2 py-0.5 rounded text-[11px] transition shadow-2xs" title="พิมพ์ใบส่งของ / ใบเสร็จรับเงิน">
              📄 ดูบิล
            </button>
            \${isDone ? \`
              <button type="button" disabled class="bg-slate-100 text-slate-400 border border-slate-200 font-medium px-2 py-0.5 rounded text-[11px] cursor-not-allowed" title="จัดส่งสำเร็จแล้ว ไม่อนุญาตให้แก้ไขข้อมูล">
                <span>🔒</span> ส่งแล้ว
              </button>
            \` : \`
              <button type="button" onclick="editOrderRecord('\${o.orderId}')" class="bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold px-2 py-0.5 rounded text-[11px] transition">
                แก้ไข
              </button>
            \`}
            <button type="button" onclick="deleteOrderRecord('\${o.orderId}')" class="bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-600 border border-slate-200 font-medium px-2 py-0.5 rounded text-[11px] transition">
              ลบ
            </button>
          </div>
        </td>
      </tr>
    \`;
  }).join('');
}

function cancelOrderEdit() {
  resetOrderForm();
  document.getElementById('salesOrderFormCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetOrderForm() {
  const badge = document.getElementById('ordFormModeBadge');
  const title = document.getElementById('ordFormTitle');
  const btn = document.getElementById('btnSubmitOrderForm');
  const cancelBtn = document.getElementById('btnCancelOrderEdit');
  const msg = document.getElementById('ordFormFeedbackMsg');

  if (badge) {
    badge.className = 'bg-white/20 text-white border border-white/30 text-xs font-semibold px-2.5 py-0.5 rounded-full';
    badge.textContent = 'สร้างใบสั่งซื้อใหม่';
  }
  if (title) title.textContent = '🛒 สั่งออเดอร์น้ำดื่ม';
  if (btn) btn.textContent = '💾 บันทึกออเดอร์';
  if (cancelBtn) cancelBtn.classList.add('hidden');
  if (msg) msg.classList.add('hidden');

  const ordId = document.getElementById('ordFormOrderId');
  if (ordId) ordId.value = '';

  const custSel = document.getElementById('ordFormCustomerSelect');
  if (custSel) custSel.value = '';
  const custNameSel = document.getElementById('ordFormCustomerNameSelect');
  if (custNameSel) custNameSel.value = '';
  const custPhoneSel = document.getElementById('ordFormCustomerPhoneSelect');
  if (custPhoneSel) custPhoneSel.value = '';
  const phoneInput = document.getElementById('ordFormCustomerPhoneInput');
  if (phoneInput) phoneInput.value = '';

  const todayStr = new Date().toISOString().slice(0, 10);
  const delDate = document.getElementById('ordFormDeliveryDate');
  if (delDate) delDate.value = todayStr;
  const delTime = document.getElementById('ordFormDeliveryTime');
  if (delTime) delTime.value = '09:00';

  if (document.getElementById('ordFormQty189')) document.getElementById('ordFormQty189').value = '0';
  if (document.getElementById('ordFormQty350')) document.getElementById('ordFormQty350').value = '0';
  if (document.getElementById('ordFormQty600')) document.getElementById('ordFormQty600').value = '0';
  if (document.getElementById('ordFormQty1500')) document.getElementById('ordFormQty1500').value = '0';

  if (document.getElementById('ordFormPrice189')) { document.getElementById('ordFormPrice189').value = '15'; document.getElementById('ordFormPrice189').readOnly = true; }
  if (document.getElementById('ordFormPrice350')) { document.getElementById('ordFormPrice350').value = '35'; document.getElementById('ordFormPrice350').readOnly = true; }
  if (document.getElementById('ordFormPrice600')) { document.getElementById('ordFormPrice600').value = '35'; document.getElementById('ordFormPrice600').readOnly = true; }
  if (document.getElementById('ordFormPrice1500')) { document.getElementById('ordFormPrice1500').value = '35'; document.getElementById('ordFormPrice1500').readOnly = true; }

  if (document.getElementById('ordFormNotes')) document.getElementById('ordFormNotes').value = '';
  if (document.getElementById('ordFormStatus')) document.getElementById('ordFormStatus').value = 'ยังไม่ได้จัดส่ง';

  const addrInfo = document.getElementById('ordFormCustomerAddressInfo');
  if (addrInfo) addrInfo.textContent = '📍 ที่อยู่จัดส่ง: -';
  const priceInfo = document.getElementById('ordFormCustomerPriceInfo');
  if (priceInfo) priceInfo.textContent = '💳 เงื่อนไขชำระเงิน: - • ระดับราคา: -';

  recalculateOrderFormTotal();
}

function editOrderRecord(orderId) {
  const ord = appData?.orders?.find(o => o.orderId === orderId);
  if (!ord) return;

  if (ord.orderStatus === 'จัดส่งสำเร็จแล้ว') {
    alert(\`⚠️ ออเดอร์ [\${ord.orderId}] นี้จัดส่งสำเร็จแล้ว ไม่สามารถแก้ไขข้อมูลได้ เพื่อรักษาความถูกต้องของข้อมูลสต็อกและบัญชี\`);
    return;
  }

  const badge = document.getElementById('ordFormModeBadge');
  const title = document.getElementById('ordFormTitle');
  const btn = document.getElementById('btnSubmitOrderForm');
  const cancelBtn = document.getElementById('btnCancelOrderEdit');
  const msg = document.getElementById('ordFormFeedbackMsg');

  if (badge) {
    badge.className = 'bg-amber-300 text-slate-950 text-xs font-bold px-2.5 py-0.5 rounded-full shadow-sm';
    badge.textContent = \`แก้ไข [\${ord.orderId}]\`;
  }
  if (title) title.textContent = \`🛒 แก้ไขใบสั่งออเดอร์: \${ord.orderId} — \${ord.customerName}\`;
  if (btn) btn.textContent = \`💾 บันทึกการแก้ไขออเดอร์ (\${ord.orderId})\`;
  if (cancelBtn) cancelBtn.classList.remove('hidden');
  if (msg) msg.classList.add('hidden');

  document.getElementById('ordFormOrderId').value = ord.orderId;
  document.getElementById('ordFormCustomerSelect').value = ord.customerId;
  const selName = document.getElementById('ordFormCustomerNameSelect');
  if (selName) selName.value = ord.customerId;
  const selPhone = document.getElementById('ordFormCustomerPhoneSelect');
  if (selPhone) selPhone.value = ord.customerId;
  onOrderCustomerSelectChange('id');

  document.getElementById('ordFormDeliveryDate').value = ord.deliveryDate || new Date().toISOString().slice(0, 10);
  document.getElementById('ordFormDeliveryTime').value = ord.deliveryTime || '09:00';
  document.getElementById('ordFormQty189').value = ord.qty189L ?? 0;
  if (document.getElementById('ordFormQty350')) document.getElementById('ordFormQty350').value = ord.qty350ml ?? 0;
  document.getElementById('ordFormQty600').value = ord.qty600ml ?? 0;
  document.getElementById('ordFormQty1500').value = ord.qty1500ml ?? 0;

  // Prices must strictly follow the customer's master price record in ทะเบียนลูกค้า
  const custMaster = appData?.customers?.find(c => c.id === ord.customerId);
  const p189Val = custMaster ? (custMaster.price189L ?? 15) : (ord.unitPrice189L ?? 15);
  const p350Val = custMaster ? (custMaster.price350ml ?? 35) : (ord.unitPrice350ml ?? 35);
  const p600Val = custMaster ? (custMaster.price600ml ?? 35) : (ord.unitPrice600ml ?? 35);
  const p1500Val = custMaster ? (custMaster.price1500ml ?? 35) : (ord.unitPrice1500ml ?? 35);

  if (document.getElementById('ordFormPrice189')) { document.getElementById('ordFormPrice189').value = p189Val; document.getElementById('ordFormPrice189').readOnly = true; }
  if (document.getElementById('ordFormPrice350')) { document.getElementById('ordFormPrice350').value = p350Val; document.getElementById('ordFormPrice350').readOnly = true; }
  if (document.getElementById('ordFormPrice600')) { document.getElementById('ordFormPrice600').value = p600Val; document.getElementById('ordFormPrice600').readOnly = true; }
  if (document.getElementById('ordFormPrice1500')) { document.getElementById('ordFormPrice1500').value = p1500Val; document.getElementById('ordFormPrice1500').readOnly = true; }

  document.getElementById('ordFormNotes').value = ord.notes || '';
  document.getElementById('ordFormStatus').value = (ord.orderStatus === 'จัดส่งสำเร็จแล้ว') ? 'จัดส่งสำเร็จแล้ว' : 'ยังไม่ได้จัดส่ง';
  recalculateOrderFormTotal();

  document.getElementById('salesOrderFormCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

let isSubmittingSalesOrder = false;

async function submitSalesOrderForm(e) {
  e.preventDefault();
  if (isSubmittingSalesOrder) return;

  const submitBtn = document.getElementById('btnSubmitOrderForm');
  const origBtnText = submitBtn ? submitBtn.innerHTML : '💾 บันทึกออเดอร์';
  const existingOrderId = document.getElementById('ordFormOrderId').value.trim();
  const custIdVal = document.getElementById('ordFormCustomerSelect').value;
  if (!custIdVal) {
    alert('⚠️ กรุณาเลือกลูกค้าก่อนบันทึกออเดอร์');
    document.getElementById('ordFormCustomerSelect').focus();
    return;
  }
  const q189Val = Number(document.getElementById('ordFormQty189').value || 0);
  const q350Val = Number(document.getElementById('ordFormQty350')?.value || 0);
  const q600Val = Number(document.getElementById('ordFormQty600').value || 0);
  const q1500Val = Number(document.getElementById('ordFormQty1500').value || 0);
  const totalQtyOrder = q189Val + q350Val + q600Val + q1500Val;

  if (totalQtyOrder <= 0) {
    alert('⚠️ ไม่สามารถบันทึกได้: จำนวนสินค้าในออเดอร์ต้องมากกว่า 0 กรุณาระบุจำนวนน้ำดื่มก่อนบันทึก');
    document.getElementById('ordFormQty189').focus();
    return;
  }

  // Prices are strictly locked to the Customer Master
  const custRecord = (appData?.customers || []).find(c => c.id === custIdVal);
  const finalPrice189 = custRecord ? Number(custRecord.price189L ?? 15) : Number(document.getElementById('ordFormPrice189').value || 15);
  const finalPrice350 = custRecord ? Number(custRecord.price350ml ?? 35) : Number(document.getElementById('ordFormPrice350')?.value || 35);
  const finalPrice600 = custRecord ? Number(custRecord.price600ml ?? 35) : Number(document.getElementById('ordFormPrice600').value || 35);
  const finalPrice1500 = custRecord ? Number(custRecord.price1500ml ?? 35) : Number(document.getElementById('ordFormPrice1500').value || 35);

  const payload = {
    orderId: existingOrderId || undefined,
    customerId: custIdVal,
    deliveryDate: document.getElementById('ordFormDeliveryDate').value || new Date().toISOString().slice(0, 10),
    deliveryTime: document.getElementById('ordFormDeliveryTime').value || '09:00',
    qty189L: q189Val,
    qty350ml: q350Val,
    qty600ml: q600Val,
    qty1500ml: q1500Val,
    unitPrice189L: finalPrice189,
    unitPrice350ml: finalPrice350,
    unitPrice600ml: finalPrice600,
    unitPrice1500ml: finalPrice1500,
    orderStatus: document.getElementById('ordFormStatus').value || 'ยังไม่ได้จัดส่ง',
    notes: document.getElementById('ordFormNotes').value.trim()
  };

  try {
    isSubmittingSalesOrder = true;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span>⏳</span> <span>กำลังบันทึก...</span>';
    }

    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const out = await res.json();
    if (out.ok) {
      appData = out.data;
      renderAllViews();
      resetOrderForm();
      const msg = document.getElementById('ordFormFeedbackMsg');
      if (msg) {
        msg.textContent = \`✅ บันทึกใบสั่งออเดอร์สำเร็จ และอัปเดตยอดส่งเข้าแผนที่สายส่ง GPS เรียบร้อยแล้ว\`;
        msg.classList.remove('hidden');
      }
    } else {
      alert(out.error || 'ไม่สามารถบันทึกใบสั่งออเดอร์ได้');
    }
  } catch (err) {
    alert('เกิดข้อผิดพลาดในการบันทึกใบสั่งออเดอร์');
  } finally {
    isSubmittingSalesOrder = false;
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = origBtnText;
    }
  }
}

async function deleteOrderRecord(orderId) {
  if (!confirm(\`ยืนยันการลบใบสั่งออเดอร์ [\${orderId}] ?\`)) return;
  try {
    const res = await fetch(\`/api/orders/\${encodeURIComponent(orderId)}\`, { method: 'DELETE' });
    const out = await res.json();
    if (out.ok) {
      appData = out.data;
      renderAllViews();
    }
  } catch (err) {
    alert('ไม่สามารถลบใบสั่งออเดอร์ได้');
  }
}

// ------------------------------------------
// ORDER SLIP & DELIVERY BILL MODAL
// ------------------------------------------
function openOrderSlipModal(orderId) {
  const ord = (appData?.orders || []).find(o => o.orderId === orderId);
  if (!ord) return alert('ไม่พบข้อมูลออเดอร์นี้');

  const modal = document.getElementById('modalOrderSlip');
  if (!modal) return;

  const cust = (appData?.customers || []).find(c => c.id === ord.customerId) || {};

  document.getElementById('slipOrderId').textContent = ord.orderId;
  document.getElementById('slipDeliveryDate').textContent = ord.deliveryDate || '-';
  document.getElementById('slipDeliveryTime').textContent = (ord.deliveryTime || '09:00') + ' น.';
  document.getElementById('slipCustomerName').textContent = ord.customerName || cust.name || '-';
  document.getElementById('slipCustomerId').textContent = ord.customerId || '-';
  document.getElementById('slipCustomerPhone').textContent = ord.customerPhone || cust.phone || '-';
  document.getElementById('slipCustomerZone').textContent = ord.zone || cust.zone || '-';
  document.getElementById('slipCustomerAddress').textContent = ord.address || cust.address || '-';
  document.getElementById('slipPaymentTerm').textContent = ord.paymentTerm || cust.paymentTerm || 'เงินสด / โอนเงิน';
  document.getElementById('slipNotes').textContent = ord.notes || '-';

  const badgeEl = document.getElementById('slipStatusBadge');
  if (badgeEl) {
    if (ord.orderStatus === 'จัดส่งสำเร็จแล้ว') {
      badgeEl.className = 'text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded text-[10px] font-bold';
      badgeEl.textContent = '✓ จัดส่งสำเร็จแล้ว';
    } else {
      badgeEl.className = 'text-amber-800 bg-amber-100 px-2 py-0.5 rounded text-[10px] font-bold';
      badgeEl.textContent = '⏳ ยังไม่ได้จัดส่ง';
    }
  }

  // Items
  const items = [];
  if (Number(ord.qty189L || 0) > 0) {
    items.push({ name: 'น้ำดื่มถัง 18.9 ลิตร', qty: Number(ord.qty189L), unit: 'ถัง', price: Number(ord.unitPrice189L || 15) });
  }
  if (Number(ord.qty350ml || 0) > 0) {
    items.push({ name: 'น้ำดื่มแพ็ค 350 ml (12 ขวด)', qty: Number(ord.qty350ml), unit: 'แพ็ค', price: Number(ord.unitPrice350ml || 35) });
  }
  if (Number(ord.qty600ml || 0) > 0) {
    items.push({ name: 'น้ำดื่มแพ็ค 600 ml (12 ขวด)', qty: Number(ord.qty600ml), unit: 'แพ็ค', price: Number(ord.unitPrice600ml || 35) });
  }
  if (Number(ord.qty1500ml || 0) > 0) {
    items.push({ name: 'น้ำดื่มแพ็ค 1.5 ลิตร (6 ขวด)', qty: Number(ord.qty1500ml), unit: 'แพ็ค', price: Number(ord.unitPrice1500ml || 35) });
  }

  const tbody = document.getElementById('slipItemsTableBody');
  if (tbody) {
    tbody.innerHTML = items.map((it, idx) => \`
      <tr>
        <td class="p-2">\${idx + 1}. \${it.name}</td>
        <td class="p-2 text-center font-bold">\${it.qty} \${it.unit}</td>
        <td class="p-2 text-right font-mono">฿\${it.price.toLocaleString()}</td>
        <td class="p-2 text-right font-mono font-bold">฿\${(it.qty * it.price).toLocaleString()}</td>
      </tr>
    \`).join('');
  }

  const totalEl = document.getElementById('slipTotalAmount');
  if (totalEl) {
    totalEl.textContent = \`฿\${Number(ord.totalAmount || 0).toLocaleString()} บาท\`;
  }

  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeOrderSlipModal() {
  const modal = document.getElementById('modalOrderSlip');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

function printOrderSlip() {
  window.print();
}

`;

app = app.slice(0, oStart) + newOrdersSection + app.slice(oEnd);
fs.writeFileSync(appPath, app, 'utf8');
console.log('✓ Successfully written app.js');


// ========================================================
// 3. UPDATE server.js (/api/orders/export-excel date support)
// ========================================================
console.log('3. Updating server.js...');

const oldExcelExportStart = "app.get('/api/orders/export-excel', (req, res) => {";
const oldExcelExportEnd = "res.download(outPath, 'Inthara_Sales_Orders.xlsx');\n});";

const eStart = srv.indexOf(oldExcelExportStart);
const eEnd = srv.indexOf(oldExcelExportEnd, eStart);

if (eStart !== -1 && eEnd !== -1) {
  const newExcelExport = `app.get('/api/orders/export-excel', (req, res) => {
  const XLSX = require('xlsx');
  const db = loadDB();
  const dateQuery = req.query.date ? String(req.query.date).trim() : '';
  const statusQuery = req.query.status ? String(req.query.status).trim() : '';

  let list = Array.isArray(db.orders) ? db.orders : [];
  if (dateQuery) {
    list = list.filter(o => o.deliveryDate === dateQuery);
  }
  if (statusQuery === 'pending') {
    list = list.filter(o => o.orderStatus !== 'จัดส่งสำเร็จแล้ว');
  } else if (statusQuery === 'completed') {
    list = list.filter(o => o.orderStatus === 'จัดส่งสำเร็จแล้ว');
  }

  const rows = list.map(o => ({
    'เลขที่ใบสั่งซื้อ (Order_ID)': o.orderId,
    'รหัสลูกค้า (Customer_ID)': o.customerId,
    'ชื่อลูกค้า (Customer_Name)': o.customerName,
    'เบอร์โทรศัพท์ (Phone)': o.customerPhone || '',
    'โซนจัดส่ง (Zone)': o.zone || '',
    'วันที่จัดส่ง (Delivery_Date)': o.deliveryDate || '',
    'เวลาจัดส่ง (Delivery_Time)': o.deliveryTime || '',
    'ถัง 18.9L (จำนวนถัง)': o.qty189L || 0,
    'ราคา/ถัง 18.9L (บาท)': o.unitPrice189L || 15,
    'แพ็ค 350ml (จำนวนแพ็ค)': o.qty350ml || 0,
    'ราคา/แพ็ค 350ml (บาท)': o.unitPrice350ml || 35,
    'แพ็ค 600ml (จำนวนแพ็ค)': o.qty600ml || 0,
    'ราคา/แพ็ค 600ml (บาท)': o.unitPrice600ml || 35,
    'แพ็ค 1.5L (จำนวนแพ็ค)': o.qty1500ml || 0,
    'ราคา/แพ็ค 1.5L (บาท)': o.unitPrice1500ml || 35,
    'ยอดรวมสุทธิ (Total_Baht)': o.totalAmount || 0,
    'เงื่อนไขชำระเงิน': o.paymentTerm || 'เงินสด / โอนเงิน',
    'สถานะออเดอร์': o.orderStatus || 'ยังไม่ได้จัดส่ง',
    'หมายเหตุ': o.notes || ''
  }));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Sales_Orders');
  const outPath = path.join(DATA_DIR, 'Inthara_Sales_Orders.xlsx');
  XLSX.writeFile(wb, outPath);
  res.download(outPath, 'Inthara_Sales_Orders.xlsx');
});`;

  srv = srv.slice(0, eStart) + newExcelExport + srv.slice(eEnd + oldExcelExportEnd.length);
  fs.writeFileSync(serverPath, srv, 'utf8');
  console.log('✓ Successfully updated server.js Excel export endpoint with date query filter');
}

console.log('--- ALL UPDATES COMPLETED SUCCESSFULLY ---');
