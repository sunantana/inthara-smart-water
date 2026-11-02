const fs = require('fs');

const serverPath = 'd:/13. Antigravity/Sunan/Inthara_program_develop/server.js';
const indexPath = 'd:/13. Antigravity/Sunan/Inthara_program_develop/public/index.html';
const appPath = 'd:/13. Antigravity/Sunan/Inthara_program_develop/public/app.js';

let serverContent = fs.readFileSync(serverPath, 'utf8');
let indexContent = fs.readFileSync(indexPath, 'utf8');
let appContent = fs.readFileSync(appPath, 'utf8');

console.log('--- IMPLEMENTING UNPAID BILL MANAGEMENT SYSTEM ---');

// ========================================================
// 1. ADD /api/billing/settle ENDPOINT IN server.js
// ========================================================
const settleEndpointCode = `
// Settle Bill / Collect Payment on Unpaid Order or Customer Debt
app.post('/api/billing/settle', (req, res) => {
  const db = loadDB();
  const {
    customerId,
    orderId,
    amount,
    paymentMethod,
    paidDate,
    notes
  } = req.body;

  const payAmount = Number(amount || 0);
  if (payAmount <= 0) {
    return res.status(400).json({ ok: false, error: 'จำนวนเงินรับชำระต้องมากกว่า 0' });
  }

  // 1. Find customer and deduct from creditBalance
  let cust = null;
  if (customerId) {
    cust = db.customers.find(c => c.id === customerId);
  }
  if (!cust && orderId && Array.isArray(db.orders)) {
    const o = db.orders.find(ord => ord.orderId === orderId);
    if (o && o.customerId) {
      cust = db.customers.find(c => c.id === o.customerId);
    }
  }

  if (cust) {
    cust.creditBalance = Math.max(0, Number(cust.creditBalance || 0) - payAmount);
  }

  // 2. Update Order(s)
  let matchedOrder = null;
  if (orderId && Array.isArray(db.orders)) {
    matchedOrder = db.orders.find(o => o.orderId === orderId);
    if (matchedOrder) {
      matchedOrder.moneyCollected = Number(matchedOrder.moneyCollected || 0) + payAmount;
      matchedOrder.unpaidAmount = Math.max(0, Number(matchedOrder.totalAmount || 0) - Number(matchedOrder.moneyCollected));
      matchedOrder.paymentStatus = (matchedOrder.unpaidAmount === 0) ? 'ชำระแล้ว' : 'ค้างชำระ';
      matchedOrder.lastPaymentDate = paidDate || new Date().toISOString().slice(0, 10);
      matchedOrder.lastPaymentMethod = paymentMethod || 'เงินสด';
      matchedOrder.lastPaymentNotes = notes || '';
    }
  } else if (customerId && Array.isArray(db.orders)) {
    // If settled generally for customer, deduct sequentially from oldest unpaid orders
    let remainingToAllocate = payAmount;
    db.orders.forEach(o => {
      if (o.customerId === customerId && o.orderStatus === 'จัดส่งสำเร็จแล้ว' && remainingToAllocate > 0) {
        const currentUnpaid = o.unpaidAmount !== undefined ? Number(o.unpaidAmount) : (o.paymentMode === 'credit' ? Number(o.totalAmount || 0) : Math.max(0, Number(o.totalAmount || 0) - Number(o.moneyCollected || 0)));
        if (currentUnpaid > 0) {
          const alloc = Math.min(remainingToAllocate, currentUnpaid);
          o.moneyCollected = Number(o.moneyCollected || 0) + alloc;
          o.unpaidAmount = Math.max(0, Number(o.totalAmount || 0) - Number(o.moneyCollected));
          o.paymentStatus = (o.unpaidAmount === 0) ? 'ชำระแล้ว' : 'ค้างชำระ';
          o.lastPaymentDate = paidDate || new Date().toISOString().slice(0, 10);
          o.lastPaymentMethod = paymentMethod || 'เงินสด';
          remainingToAllocate -= alloc;
        }
      }
    });
  }

  // 3. Update savedTrips
  if (Array.isArray(db.savedTrips)) {
    db.savedTrips.forEach(t => {
      if (orderId && t.orderId === orderId) {
        t.moneyCollected = Number(t.moneyCollected || 0) + payAmount;
        t.unpaidAmount = Math.max(0, Number(t.totalRevenue || 0) - Number(t.moneyCollected));
        t.paymentStatus = (t.unpaidAmount === 0) ? 'ชำระแล้ว' : 'ค้างชำระ';
      }
    });
  }

  // 4. Save Payment Receipt
  if (!Array.isArray(db.paymentReceipts)) db.paymentReceipts = [];
  const receiptNo = \`REC-\${Date.now().toString().slice(-6)}\`;
  const receipt = {
    receiptNo,
    date: paidDate || new Date().toISOString().slice(0, 10),
    time: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
    customerId: cust ? cust.id : (customerId || ''),
    customerName: cust ? cust.name : (matchedOrder ? matchedOrder.customerName : '-'),
    orderId: orderId || '',
    amount: payAmount,
    paymentMethod: paymentMethod || 'เงินสด',
    notes: notes || '',
    recordedAt: new Date().toISOString()
  };
  db.paymentReceipts.unshift(receipt);

  saveDB(db);
  res.json({ ok: true, receipt, data: db });
});
`;

if (!serverContent.includes("app.post('/api/billing/settle'")) {
  const tripHookIdx = serverContent.indexOf("// Save Planned Route Trip");
  if (tripHookIdx !== -1) {
    serverContent = serverContent.slice(0, tripHookIdx) + settleEndpointCode + '\n' + serverContent.slice(tripHookIdx);
    fs.writeFileSync(serverPath, serverContent, 'utf8');
    console.log('✓ Added /api/billing/settle endpoint to server.js');
  } else {
    console.error('Could not find anchor for /api/billing/settle in server.js');
  }
} else {
  console.log('Notice: /api/billing/settle already present in server.js');
}

// ========================================================
// 2. UPDATE index.html: Add Unpaid Tab & Payment Column & modalBillPayment
// ========================================================

// 2.1 Update Status Filter Tabs in Orders View
const oldTabsHtml = `<button type="button" id="btnOrdFilterCompleted" onclick="setOrderFilterStatus('completed')" class="px-3 py-1 rounded-md text-xs font-semibold text-slate-600 hover:text-slate-900 transition flex items-center gap-1.5 bg-transparent">
              <span>✅ จัดส่งสำเร็จแล้ว</span>
              <span id="badgeOrdCompletedTab" class="bg-slate-300 text-slate-700 text-[10px] px-1.5 py-0.2 rounded-full font-bold">0</span>
            </button>
            <button type="button" id="btnOrdFilterAll" onclick="setOrderFilterStatus('all')" class="px-3 py-1 rounded-md text-xs font-semibold text-slate-600 hover:text-slate-900 transition flex items-center gap-1.5 bg-transparent">
              <span>📋 ทั้งหมด</span>
              <span id="badgeOrdAllTab" class="bg-slate-300 text-slate-700 text-[10px] px-1.5 py-0.2 rounded-full font-bold">0</span>
            </button>`;

const newTabsHtml = `<button type="button" id="btnOrdFilterCompleted" onclick="setOrderFilterStatus('completed')" class="px-3 py-1 rounded-md text-xs font-semibold text-slate-600 hover:text-slate-900 transition flex items-center gap-1.5 bg-transparent">
              <span>✅ จัดส่งสำเร็จแล้ว</span>
              <span id="badgeOrdCompletedTab" class="bg-slate-300 text-slate-700 text-[10px] px-1.5 py-0.2 rounded-full font-bold">0</span>
            </button>
            <button type="button" id="btnOrdFilterUnpaid" onclick="setOrderFilterStatus('unpaid')" class="px-3 py-1 rounded-md text-xs font-semibold text-slate-600 hover:text-amber-800 transition flex items-center gap-1.5 bg-transparent">
              <span>⚠️ ค้างชำระ</span>
              <span id="badgeOrdUnpaidTab" class="bg-amber-200 text-amber-900 text-[10px] px-1.5 py-0.2 rounded-full font-bold">0</span>
            </button>
            <button type="button" id="btnOrdFilterAll" onclick="setOrderFilterStatus('all')" class="px-3 py-1 rounded-md text-xs font-semibold text-slate-600 hover:text-slate-900 transition flex items-center gap-1.5 bg-transparent">
              <span>📋 ทั้งหมด</span>
              <span id="badgeOrdAllTab" class="bg-slate-300 text-slate-700 text-[10px] px-1.5 py-0.2 rounded-full font-bold">0</span>
            </button>`;

if (indexContent.includes(oldTabsHtml)) {
  indexContent = indexContent.replace(oldTabsHtml, newTabsHtml);
  console.log('✓ Added "⚠️ ค้างชำระ" tab in Orders Filter Bar (index.html)');
}

// 2.2 Add "💳 จัดการบิลค้างชำระ" button in Orders Summary Strip
const oldOrdSummaryHtml = `<div class="flex flex-wrap items-center gap-2.5 text-xs text-slate-600">
            <span>รวม: <b id="ordSummaryCount" class="text-slate-900">0</b> รายการ</span>
            <span class="text-slate-300">|</span>
            <span>ยอดเงิน: <b id="ordSummaryTotalAmount" class="text-emerald-700 font-mono">฿0</b></span>
            <span class="text-slate-300">|</span>
            <span>สินค้าในตาราง: <b id="ordSummaryLoad" class="text-slate-800">0 ถัง / 0 แพ็ค</b></span>
          </div>`;

const newOrdSummaryHtml = `<div class="flex flex-wrap items-center justify-between gap-2.5 text-xs text-slate-600">
          <div class="flex flex-wrap items-center gap-2.5">
            <span>รวม: <b id="ordSummaryCount" class="text-slate-900">0</b> รายการ</span>
            <span class="text-slate-300">|</span>
            <span>ยอดเงิน: <b id="ordSummaryTotalAmount" class="text-emerald-700 font-mono">฿0</b></span>
            <span class="text-slate-300">|</span>
            <span>สินค้าในตาราง: <b id="ordSummaryLoad" class="text-slate-800">0 ถัง / 0 แพ็ค</b></span>
          </div>
          <button type="button" onclick="openBillPaymentModal()" class="bg-amber-500 hover:bg-amber-600 text-white font-bold px-3 py-1 rounded-lg text-xs shadow-xs transition inline-flex items-center gap-1.5 cursor-pointer">
            <span>💳</span> <span>ระบบจัดการบิลค้างชำระ</span>
          </button>
        </div>`;

if (indexContent.includes(oldOrdSummaryHtml)) {
  indexContent = indexContent.replace(oldOrdSummaryHtml, newOrdSummaryHtml);
  console.log('✓ Added "💳 จัดการบิลค้างชำระ" button to Orders Summary Strip in index.html');
}

// 2.3 Add "การชำระ / ค้างชำระ" Column to Orders Table <thead>
const oldOrdersThead = `<th class="p-2 text-right font-bold whitespace-nowrap">รวมเงิน</th>
                <th class="p-2 text-center font-bold whitespace-nowrap">สถานะ</th>
                <th class="p-2 text-center font-bold whitespace-nowrap">จัดการ</th>`;

const newOrdersThead = `<th class="p-2 text-right font-bold whitespace-nowrap">รวมเงิน</th>
                <th class="p-2 text-center font-bold whitespace-nowrap">การชำระ / ค้างชำระ</th>
                <th class="p-2 text-center font-bold whitespace-nowrap">สถานะ</th>
                <th class="p-2 text-center font-bold whitespace-nowrap">จัดการ</th>`;

if (indexContent.includes(oldOrdersThead)) {
  indexContent = indexContent.replace(oldOrdersThead, newOrdersThead);
  console.log('✓ Added "การชำระ / ค้างชำระ" header to Orders Table in index.html');
}

// 2.4 Add modalBillPayment in index.html right before modalOrderSlip
const modalBillPaymentHtml = `
  <!-- MODAL: Bill Payment & Settlement Manager -->
  <div id="modalBillPayment" class="fixed inset-0 bg-slate-900/60 hidden items-center justify-center z-50 p-4">
    <div class="bg-white rounded-2xl max-w-xl w-full p-5 shadow-2xl space-y-3.5 max-h-[92vh] overflow-y-auto">
      
      <!-- Header -->
      <div class="flex items-center justify-between border-b pb-2.5">
        <div class="flex items-center gap-2">
          <span class="w-8 h-8 rounded-lg bg-amber-500 text-white font-black text-base flex items-center justify-center shadow-2xs">💳</span>
          <div>
            <h3 class="font-bold text-slate-800 text-sm">ระบบจัดการบิลและรับชำระค้างชำระ</h3>
            <p class="text-[11px] text-slate-500">บันทึกรับเงินชำระหนี้ / ตัดยอดบิลค้างชำระ</p>
          </div>
        </div>
        <button type="button" onclick="closeBillPaymentModal()" class="text-slate-400 hover:text-slate-600 text-xl font-bold p-1">✕</button>
      </div>

      <!-- Customer Summary Card -->
      <div class="bg-amber-50/80 border border-amber-200 rounded-xl p-3 flex items-center justify-between">
        <div>
          <div class="font-bold text-amber-950 text-xs flex items-center gap-1.5" id="billPayCustTitle">
            <span>👤 เลือกข้อมูลลูกค้า...</span>
          </div>
          <div class="text-[11px] text-slate-600 mt-0.5" id="billPayCustSub">-</div>
        </div>
        <div class="text-right">
          <span class="text-[10px] text-slate-500 block">ยอดหนี้ค้างสะสมรวม:</span>
          <span class="text-base font-black text-rose-700 font-mono" id="billPayCustTotalDebt">฿0</span>
        </div>
      </div>

      <!-- Unpaid Orders Table / Selector -->
      <div class="rounded-xl border border-slate-200 bg-slate-50/50 p-3 space-y-2">
        <div class="flex items-center justify-between text-xs font-bold text-slate-700">
          <span>📋 รายการบิลที่ค้างชำระ</span>
          <span class="text-[10px] font-normal text-slate-500" id="billPayOrdersCountNotice"></span>
        </div>
        
        <div class="max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-2xs">
          <table class="w-full text-left text-xs border-collapse">
            <thead>
              <tr class="bg-slate-100 text-slate-600 border-b border-slate-200 text-[11px]">
                <th class="p-2 text-center w-10">เลือก</th>
                <th class="p-2">เลขที่บิล / วันที่</th>
                <th class="p-2 text-right">ยอดบิล</th>
                <th class="p-2 text-right">จ่ายแล้ว</th>
                <th class="p-2 text-right font-bold text-rose-700">ค้างชำระ</th>
              </tr>
            </thead>
            <tbody id="billPayOrdersTableBody" class="divide-y divide-slate-100"></tbody>
          </table>
        </div>
      </div>

      <!-- Payment Form -->
      <form onsubmit="submitBillPayment(event)" class="space-y-3 text-xs">
        <input type="hidden" id="billPayCustomerId" />
        <input type="hidden" id="billPayOrderId" />

        <div class="rounded-xl border border-slate-200 bg-white p-3 space-y-2.5 shadow-2xs">
          <div class="font-bold text-slate-800 text-xs flex items-center gap-1.5 pb-1 border-b border-slate-100">
            <span>💵</span> <span>รายละเอียดการรับเงินชำระ</span>
          </div>

          <div class="grid grid-cols-2 gap-2.5">
            <!-- Amount Input -->
            <div>
              <label class="block text-slate-600 font-semibold mb-1">ยอดเงินที่รับชำระจริง (บาท) *</label>
              <div class="flex items-center gap-1">
                <span class="font-bold text-slate-400 text-sm">฿</span>
                <input id="billPayAmount" type="number" min="1" step="1" required class="w-full border border-emerald-300 bg-emerald-50/20 rounded-lg px-2.5 py-1.5 text-base font-black text-emerald-800 text-right font-mono focus:bg-white" />
              </div>
            </div>

            <!-- Payment Method -->
            <div>
              <label class="block text-slate-600 font-semibold mb-1">ช่องทางรับเงิน *</label>
              <select id="billPayMethod" required class="w-full border border-slate-300 rounded-lg px-2.5 py-2 font-medium bg-white">
                <option value="เงินสด">🟢 เงินสด (Cash)</option>
                <option value="โอนเงินผ่านธนาคาร / พร้อมเพย์">🔵 โอนเงินผ่านธนาคาร / พร้อมเพย์</option>
                <option value="เช็ค / ตั๋วสัญญาใช้เงิน">⚪ เช็คธนาคาร / วางบิล</option>
              </select>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-2.5 pt-1">
            <!-- Payment Date -->
            <div>
              <label class="block text-slate-600 font-semibold mb-1">วันที่รับชำระ *</label>
              <input id="billPayDate" type="date" required class="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-medium bg-white" />
            </div>

            <!-- Notes / Slip Ref -->
            <div>
              <label class="block text-slate-600 font-semibold mb-1">หมายเหตุ / อ้างอิงสลิป</label>
              <input id="billPayNotes" type="text" placeholder="เช่น สลิปโอนเงิน, รับเงินสดที่โรงงาน..." class="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 bg-slate-50 focus:bg-white" />
            </div>
          </div>
        </div>

        <!-- Buttons -->
        <div class="flex items-center justify-between pt-1 border-t border-slate-100">
          <button type="button" onclick="closeBillPaymentModal()" class="px-4 py-2 rounded-xl border border-slate-300 text-slate-600 font-semibold text-xs hover:bg-slate-50 transition">ยกเลิก</button>
          <button type="submit" id="btnSubmitBillPayment" class="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition flex items-center gap-1.5">
            <span>✅</span> <span>บันทึกรับเงินชำระหนี้</span>
          </button>
        </div>
      </form>
    </div>
  </div>
`;

if (!indexContent.includes('id="modalBillPayment"')) {
  const insertModalIdx = indexContent.indexOf('<!-- MODAL: View / Print Order & Delivery Slip -->');
  if (insertModalIdx !== -1) {
    indexContent = indexContent.slice(0, insertModalIdx) + modalBillPaymentHtml + '\n  ' + indexContent.slice(insertModalIdx);
    console.log('✓ Added modalBillPayment to index.html');
  } else {
    console.error('Could not find anchor for modalBillPayment in index.html');
  }
}

fs.writeFileSync(indexPath, indexContent, 'utf8');

// ========================================================
// 3. UPDATE app.js: Orders Table Rendering, Debt Link, and Bill Payment Functions
// ========================================================

// 3.1 Update setOrderFilterStatus in app.js
const oldSetFilterCode = `function setOrderFilterStatus(status) {
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
}`;

const newSetFilterCode = `function setOrderFilterStatus(status) {
  currentOrderStatusFilter = (status === 'completed' || status === 'pending' || status === 'unpaid' || status === 'all') ? status : 'all';

  const btnPending = document.getElementById('btnOrdFilterPending');
  const btnCompleted = document.getElementById('btnOrdFilterCompleted');
  const btnUnpaid = document.getElementById('btnOrdFilterUnpaid');
  const btnAll = document.getElementById('btnOrdFilterAll');

  const activeCls = 'px-3 py-1 rounded-md text-xs font-bold transition flex items-center gap-1.5 shadow-xs bg-sky-700 text-white';
  const activeUnpaidCls = 'px-3 py-1 rounded-md text-xs font-bold transition flex items-center gap-1.5 shadow-xs bg-amber-600 text-white';
  const inactiveCls = 'px-3 py-1 rounded-md text-xs font-semibold text-slate-600 hover:text-slate-900 transition flex items-center gap-1.5 bg-transparent';

  if (btnPending) btnPending.className = currentOrderStatusFilter === 'pending' ? activeCls : inactiveCls;
  if (btnCompleted) btnCompleted.className = currentOrderStatusFilter === 'completed' ? activeCls : inactiveCls;
  if (btnUnpaid) btnUnpaid.className = currentOrderStatusFilter === 'unpaid' ? activeUnpaidCls : inactiveCls;
  if (btnAll) btnAll.className = currentOrderStatusFilter === 'all' ? activeCls : inactiveCls;

  renderOrdersView();
}`;

if (appContent.includes(oldSetFilterCode)) {
  appContent = appContent.replace(oldSetFilterCode, newSetFilterCode);
  console.log('✓ Updated setOrderFilterStatus in app.js');
}

// 3.2 Update renderOrdersView counts and filtering for unpaid in app.js
const oldCountsCode = `  const pendingOrders = orders.filter(o => o.orderStatus !== 'จัดส่งสำเร็จแล้ว');
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
  if (badgeAll) badgeAll.textContent = totalOrdersCount;`;

const newCountsCode = `  const pendingOrders = orders.filter(o => o.orderStatus !== 'จัดส่งสำเร็จแล้ว');
  const completedOrders = orders.filter(o => o.orderStatus === 'จัดส่งสำเร็จแล้ว');
  const unpaidOrders = orders.filter(o => {
    if (o.orderStatus !== 'จัดส่งสำเร็จแล้ว') return false;
    let unp = o.unpaidAmount;
    if (unp === undefined) {
      const tr = (appData?.savedTrips || []).find(t => (o.orderId && t.orderId === o.orderId) || (o.customerId && t.customerId === o.customerId && t.date === o.deliveryDate));
      if (tr) unp = tr.unpaidAmount;
    }
    const actUnpaid = Number(unp !== undefined ? unp : (o.paymentMode === 'credit' ? Number(o.totalAmount || 0) : Math.max(0, Number(o.totalAmount || 0) - Number(o.moneyCollected || 0))));
    return actUnpaid > 0;
  });

  const pendingCount = pendingOrders.length;
  const completedCount = completedOrders.length;
  const unpaidCount = unpaidOrders.length;
  const totalOrdersCount = orders.length;

  // Update Tab Badges
  const badgePending = document.getElementById('badgeOrdPendingTab');
  const badgeCompleted = document.getElementById('badgeOrdCompletedTab');
  const badgeUnpaid = document.getElementById('badgeOrdUnpaidTab');
  const badgeAll = document.getElementById('badgeOrdAllTab');
  if (badgePending) badgePending.textContent = pendingCount;
  if (badgeCompleted) badgeCompleted.textContent = completedCount;
  if (badgeUnpaid) badgeUnpaid.textContent = unpaidCount;
  if (badgeAll) badgeAll.textContent = totalOrdersCount;`;

if (appContent.includes(oldCountsCode)) {
  appContent = appContent.replace(oldCountsCode, newCountsCode);
  console.log('✓ Updated Order Tab counts in app.js');
}

// 3.3 Update Filter Logic in renderOrdersView
const oldFilterCondition = `    // Status filter
    if (currentOrderStatusFilter === 'pending') {
      if (o.orderStatus === 'จัดส่งสำเร็จแล้ว') return false;
    } else if (currentOrderStatusFilter === 'completed') {
      if (o.orderStatus !== 'จัดส่งสำเร็จแล้ว') return false;
    }`;

const newFilterCondition = `    // Status filter
    if (currentOrderStatusFilter === 'pending') {
      if (o.orderStatus === 'จัดส่งสำเร็จแล้ว') return false;
    } else if (currentOrderStatusFilter === 'completed') {
      if (o.orderStatus !== 'จัดส่งสำเร็จแล้ว') return false;
    } else if (currentOrderStatusFilter === 'unpaid') {
      if (o.orderStatus !== 'จัดส่งสำเร็จแล้ว') return false;
      let unp = o.unpaidAmount;
      if (unp === undefined) {
        const tr = (appData?.savedTrips || []).find(t => (o.orderId && t.orderId === o.orderId) || (o.customerId && t.customerId === o.customerId && t.date === o.deliveryDate));
        if (tr) unp = tr.unpaidAmount;
      }
      const actUnpaid = Number(unp !== undefined ? unp : (o.paymentMode === 'credit' ? Number(o.totalAmount || 0) : Math.max(0, Number(o.totalAmount || 0) - Number(o.moneyCollected || 0))));
      if (actUnpaid <= 0) return false;
    }`;

if (appContent.includes(oldFilterCondition)) {
  appContent = appContent.replace(oldFilterCondition, newFilterCondition);
  console.log('✓ Updated Order Status Filter condition for unpaid in app.js');
}

// 3.4 Update Orders Table Row generation to include "การชำระ / ค้างชำระ" column
const oldOrderRowCells = `        <td class="p-2 text-right font-mono font-bold text-teal-800 text-xs whitespace-nowrap">
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
        </td>`;

const newOrderRowCells = `        <td class="p-2 text-right font-mono font-bold text-teal-800 text-xs whitespace-nowrap">
          ฿\${Number(o.totalAmount || 0).toLocaleString()}
        </td>
        <td class="p-2 text-center whitespace-nowrap">
          \${(() => {
            if (!isDone) {
              return '<span class="text-slate-400 text-[11px]">- รอส่ง -</span>';
            }
            let col = o.moneyCollected;
            let unp = o.unpaidAmount;
            let pm = o.paymentMode;
            if (col === undefined || unp === undefined) {
              const tr = (appData?.savedTrips || []).find(t => (o.orderId && t.orderId === o.orderId) || (o.customerId && t.customerId === o.customerId && t.date === o.deliveryDate));
              if (tr) { col = tr.moneyCollected; unp = tr.unpaidAmount; pm = tr.paymentMode; }
            }
            const tot = Number(o.totalAmount || 0);
            const actCol = Number(col !== undefined ? col : (pm === 'credit' ? 0 : tot));
            const actUnp = Number(unp !== undefined ? unp : (pm === 'credit' ? tot : Math.max(0, tot - actCol)));
            const isCred = (pm === 'credit');

            if (actUnp > 0) {
              return \`
                <div class="leading-tight">
                  <span class="bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-full font-bold text-[10px] inline-block shadow-2xs">
                    \${isCred ? '💳 เครดิต' : '⚠️ ค้างชำระ'} ฿\${actUnp.toLocaleString()}
                  </span>
                  <div class="mt-1">
                    <button type="button" onclick="openBillPaymentModal('\${o.orderId}')" class="bg-amber-500 hover:bg-amber-600 text-white font-bold px-2 py-0.5 rounded text-[10px] shadow-2xs transition inline-flex items-center gap-1 cursor-pointer">
                      <span>💵</span> <span>รับชำระบิล</span>
                    </button>
                  </div>
                </div>
              \`;
            } else {
              return \`
                <span class="bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-full font-bold text-[10px] inline-block">
                  ✓ จ่ายครบ ฿\${tot.toLocaleString()}
                </span>
              \`;
            }
          })()}
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
        </td>`;

if (appContent.includes(oldOrderRowCells)) {
  appContent = appContent.replace(oldOrderRowCells, newOrderRowCells);
  console.log('✓ Added "การชำระ / ค้างชำระ" column in Orders Table row rendering (app.js)');
}

// 3.5 Update Customer Master table ค้างชำระ cell to link to Bill Manager
const oldCustDebtCell = `        <td class="p-2.5 align-top text-right">
          <div class="font-bold text-slate-900 font-mono">฿\${creditBal.toLocaleString()}</div>
          <div class="text-[10px] text-slate-400">วงเงิน ฿\${creditLim.toLocaleString()}</div>
        </td>`;

const newCustDebtCell = `        <td class="p-2.5 align-top text-right">
          <div class="\${creditBal > 0 ? 'font-black text-rose-700' : 'font-bold text-slate-900'} font-mono">฿\${creditBal.toLocaleString()}</div>
          <div class="text-[10px] text-slate-400">วงเงิน ฿\${creditLim.toLocaleString()}</div>
          \${creditBal > 0 ? \`
            <div class="mt-1">
              <button type="button" onclick="openBillPaymentModal(null, '\${c.id}')" class="bg-amber-100 hover:bg-amber-200 text-amber-900 border border-amber-300 font-bold px-1.5 py-0.5 rounded text-[10px] transition shadow-2xs inline-flex items-center gap-1 cursor-pointer" title="จัดการบิลและรับชำระหนี้ของ \${c.name}">
                <span>💳</span> <span>รับชำระหนี้</span>
              </button>
            </div>
          \` : ''}
        </td>`;

if (appContent.includes(oldCustDebtCell)) {
  appContent = appContent.replace(oldCustDebtCell, newCustDebtCell);
  console.log('✓ Updated Customer Master Debt Cell with "รับชำระหนี้" link in app.js');
}

// 3.6 Append Bill Payment Management Logic at the bottom of app.js
const billManagerFunctions = `
// ==========================================
// BILL PAYMENT & DEBT SETTLEMENT SYSTEM
// ==========================================
let currentBillPayOrders = [];

function openBillPaymentModal(orderId = null, customerId = null) {
  const modal = document.getElementById('modalBillPayment');
  if (!modal) return;

  let targetCust = null;
  let targetOrder = null;

  if (orderId) {
    targetOrder = (appData?.orders || []).find(o => o.orderId === orderId);
    if (targetOrder && targetOrder.customerId) {
      targetCust = (appData?.customers || []).find(c => c.id === targetOrder.customerId);
    }
  }

  if (!targetCust && customerId) {
    targetCust = (appData?.customers || []).find(c => c.id === customerId);
  }

  // If still not found, pick the first customer with debt
  if (!targetCust) {
    targetCust = (appData?.customers || []).find(c => Number(c.creditBalance || 0) > 0) || (appData?.customers || [])[0];
  }

  if (!targetCust) {
    alert('ไม่พบข้อมูลลูกค้าสำหรับจัดการบิล');
    return;
  }

  document.getElementById('billPayCustomerId').value = targetCust.id;
  document.getElementById('billPayOrderId').value = targetOrder ? targetOrder.orderId : '';

  // Customer Summary
  const titleEl = document.getElementById('billPayCustTitle');
  const subEl = document.getElementById('billPayCustSub');
  const totalDebtEl = document.getElementById('billPayCustTotalDebt');

  if (titleEl) titleEl.innerHTML = \`<span>👤 \${targetCust.name} [\${targetCust.id}]</span> <span class="text-slate-400 font-normal">• 📞 \${targetCust.phone || '-'}</span>\`;
  if (subEl) subEl.textContent = \`ที่อยู่: \${targetCust.address || '-'} (\${targetCust.zone || 'ทั่วไป'})\`;
  if (totalDebtEl) totalDebtEl.textContent = \`฿\${Number(targetCust.creditBalance || 0).toLocaleString()}\`;

  // Find all unpaid orders of this customer
  const custOrders = (appData?.orders || []).filter(o => o.customerId === targetCust.id && o.orderStatus === 'จัดส่งสำเร็จแล้ว');
  
  currentBillPayOrders = custOrders.filter(o => {
    let unp = o.unpaidAmount;
    if (unp === undefined) {
      const tr = (appData?.savedTrips || []).find(t => (o.orderId && t.orderId === o.orderId) || (o.customerId && t.customerId === o.customerId && t.date === o.deliveryDate));
      if (tr) unp = tr.unpaidAmount;
    }
    const actUnp = Number(unp !== undefined ? unp : (o.paymentMode === 'credit' ? Number(o.totalAmount || 0) : Math.max(0, Number(o.totalAmount || 0) - Number(o.moneyCollected || 0))));
    return actUnp > 0;
  });

  const countNotice = document.getElementById('billPayOrdersCountNotice');
  if (countNotice) countNotice.textContent = \`พบบิลค้างชำระ \${currentBillPayOrders.length} รายการ\`;

  const tbody = document.getElementById('billPayOrdersTableBody');
  if (tbody) {
    if (currentBillPayOrders.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="p-4 text-center text-slate-400 text-xs">✓ ไม่พบบิลค้างชำระของลูกค้ารายนี้ (ชำระครบถ้วนแล้ว)</td></tr>';
    } else {
      tbody.innerHTML = currentBillPayOrders.map(ord => {
        let col = ord.moneyCollected;
        let unp = ord.unpaidAmount;
        let pm = ord.paymentMode;
        if (col === undefined || unp === undefined) {
          const tr = (appData?.savedTrips || []).find(t => (ord.orderId && t.orderId === ord.orderId) || (ord.customerId && t.customerId === ord.customerId && t.date === ord.deliveryDate));
          if (tr) { col = tr.moneyCollected; unp = tr.unpaidAmount; pm = tr.paymentMode; }
        }
        const tot = Number(ord.totalAmount || 0);
        const actCol = Number(col !== undefined ? col : (pm === 'credit' ? 0 : tot));
        const actUnp = Number(unp !== undefined ? unp : (pm === 'credit' ? tot : Math.max(0, tot - actCol)));

        const isChecked = targetOrder ? (ord.orderId === targetOrder.orderId) : false;

        return \`
          <tr class="hover:bg-amber-50/50 cursor-pointer transition" onclick="selectBillPayOrder('\${ord.orderId}', \${actUnp})">
            <td class="p-2 text-center">
              <input type="radio" name="billPaySelectedOrderRadio" id="radioBill_\${ord.orderId}" value="\${ord.orderId}" \${isChecked ? 'checked' : ''} onchange="selectBillPayOrder('\${ord.orderId}', \${actUnp})" class="text-amber-600 focus:ring-amber-500" />
            </td>
            <td class="p-2">
              <div class="font-bold text-slate-800 font-mono text-xs">\${ord.orderId}</div>
              <div class="text-[10px] text-slate-500">📅 \${ord.deliveryDate || '-'}</div>
            </td>
            <td class="p-2 text-right font-mono font-semibold text-slate-700">฿\${tot.toLocaleString()}</td>
            <td class="p-2 text-right font-mono text-slate-500">฿\${actCol.toLocaleString()}</td>
            <td class="p-2 text-right font-mono font-black text-rose-700 text-xs">฿\${actUnp.toLocaleString()}</td>
          </tr>
        \`;
      }).join('');
    }
  }

  // Pre-fill amount
  let defaultAmount = 0;
  if (targetOrder) {
    let unp = targetOrder.unpaidAmount;
    if (unp === undefined) {
      const tr = (appData?.savedTrips || []).find(t => (targetOrder.orderId && t.orderId === targetOrder.orderId) || (targetOrder.customerId && t.customerId === targetOrder.customerId && t.date === targetOrder.deliveryDate));
      if (tr) unp = tr.unpaidAmount;
    }
    defaultAmount = Number(unp !== undefined ? unp : (targetOrder.paymentMode === 'credit' ? Number(targetOrder.totalAmount || 0) : Math.max(0, Number(targetOrder.totalAmount || 0) - Number(targetOrder.moneyCollected || 0))));
  } else if (currentBillPayOrders.length > 0) {
    const firstOrd = currentBillPayOrders[0];
    let unp = firstOrd.unpaidAmount;
    defaultAmount = Number(unp !== undefined ? unp : (firstOrd.paymentMode === 'credit' ? Number(firstOrd.totalAmount || 0) : Math.max(0, Number(firstOrd.totalAmount || 0) - Number(firstOrd.moneyCollected || 0))));
    const firstRadio = document.getElementById(\`radioBill_\${firstOrd.orderId}\`);
    if (firstRadio) firstRadio.checked = true;
    document.getElementById('billPayOrderId').value = firstOrd.orderId;
  } else {
    defaultAmount = Number(targetCust.creditBalance || 0);
  }

  const amtInput = document.getElementById('billPayAmount');
  if (amtInput) amtInput.value = defaultAmount > 0 ? defaultAmount : '';

  const dateInput = document.getElementById('billPayDate');
  if (dateInput) dateInput.value = new Date().toISOString().slice(0, 10);

  const notesInput = document.getElementById('billPayNotes');
  if (notesInput) notesInput.value = '';

  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function selectBillPayOrder(orderId, unpaidAmount) {
  document.getElementById('billPayOrderId').value = orderId;
  const amtInput = document.getElementById('billPayAmount');
  if (amtInput && unpaidAmount > 0) {
    amtInput.value = unpaidAmount;
  }
  const radio = document.getElementById(\`radioBill_\${orderId}\`);
  if (radio) radio.checked = true;
}

function closeBillPaymentModal() {
  const modal = document.getElementById('modalBillPayment');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

async function submitBillPayment(event) {
  event.preventDefault();
  const customerId = document.getElementById('billPayCustomerId')?.value;
  const orderId = document.getElementById('billPayOrderId')?.value;
  const amount = Number(document.getElementById('billPayAmount')?.value || 0);
  const paymentMethod = document.getElementById('billPayMethod')?.value || 'เงินสด';
  const paidDate = document.getElementById('billPayDate')?.value || new Date().toISOString().slice(0, 10);
  const notes = document.getElementById('billPayNotes')?.value || '';

  if (amount <= 0) {
    alert('กรุณาระบุยอดเงินที่รับชำระให้ถูกต้อง');
    return;
  }

  const btn = document.getElementById('btnSubmitBillPayment');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ กำลังบันทึก...';
  }

  try {
    const res = await fetch('/api/billing/settle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerId,
        orderId,
        amount,
        paymentMethod,
        paidDate,
        notes
      })
    });

    const result = await res.json();
    if (!result.ok) {
      throw new Error(result.error || 'บันทึกรับชำระเงินไม่สำเร็จ');
    }

    alert(\`✅ บันทึกรับชำระเงินเรียบร้อยแล้ว!\\n- เลขที่ใบเสร็จ: \${result.receipt?.receiptNo}\\n- จำนวนเงิน: ฿\${amount.toLocaleString()} บาท\\n- ช่องทาง: \${paymentMethod}\`);

    // Update local state
    if (result.data) {
      appData = result.data;
    }

    closeBillPaymentModal();
    renderOrdersView();
    renderCustomersMasterView();
    renderSavedTripsTable();

  } catch (err) {
    console.error('Error settling bill:', err);
    alert('เกิดข้อผิดพลาด: ' + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<span>✅</span> <span>บันทึกรับเงินชำระหนี้</span>';
    }
  }
}
`;

if (!appContent.includes('function openBillPaymentModal')) {
  appContent += '\n' + billManagerFunctions;
  console.log('✓ Appended Bill Payment Management Functions to app.js');
}

fs.writeFileSync(appPath, appContent, 'utf8');
console.log('--- ALL UPDATES COMPLETED SUCCESSFULLY ---');
