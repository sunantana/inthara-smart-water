const fs = require('fs');

// 1. UPDATE public/index.html
const htmlPath = 'd:/13. Antigravity/Sunan/Inthara_program_develop/public/index.html';
let html = fs.readFileSync(htmlPath, 'utf8');

const oldHistoryStart = '<!-- 3. Closed Trips History -->';
const oldHistoryEnd = '</section>';

const hStart = html.indexOf(oldHistoryStart);
const hEnd = html.indexOf(oldHistoryEnd, hStart);

if (hStart === -1 || hEnd === -1) {
  console.error('Error: Could not locate history section in index.html');
  process.exit(1);
}

const newHistoryHtml = `<!-- 3. Closed Trips History (Date Filterable, Default to Today) -->
      <div class="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <!-- Header Bar: Title + Date Filter + Toggle -->
        <div class="px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-100 bg-slate-50/70">
          <div class="flex items-center gap-2">
            <span class="font-bold text-slate-800 text-xs md:text-sm">🕒 ประวัติสายส่งที่ปิดงานแล้ว</span>
            <span id="savedTripsCountBadge" class="bg-emerald-100 text-emerald-800 text-xs font-bold px-2 py-0.5 rounded-full">0 รายการ</span>
          </div>

          <!-- Date Picker Controls -->
          <div class="flex flex-wrap items-center gap-2">
            <div class="flex items-center gap-1.5 bg-white border border-slate-300 rounded-lg px-2.5 py-1 shadow-2xs">
              <span class="text-[11px] text-slate-500 font-semibold">📅 วันที่:</span>
              <input type="date" id="savedTripsDateFilter" onchange="renderSavedTripsTable()" class="text-xs font-bold text-slate-800 outline-none cursor-pointer bg-transparent" />
            </div>
            <button type="button" onclick="setSavedTripsFilterToday()" class="bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 font-bold px-2.5 py-1 rounded-lg text-xs transition shadow-2xs">
              วันนี้
            </button>
            <button type="button" onclick="setSavedTripsFilterAll()" class="bg-slate-100 hover:bg-slate-200 text-slate-600 font-medium px-2.5 py-1 rounded-lg text-xs transition">
              ทุกวัน
            </button>
            <button type="button" onclick="toggleSavedTripsAccordion()" class="ml-1 text-slate-600 hover:text-slate-900 text-xs font-bold px-2.5 py-1 rounded-lg border border-slate-200 bg-white shadow-2xs flex items-center gap-1">
              <span id="savedTripsToggleIcon">▴ ซ่อนตาราง</span>
            </button>
          </div>
        </div>

        <!-- Content Body (Open by default to show today) -->
        <div id="savedTripsContent" class="border-t border-slate-200 p-3.5 space-y-3">
          <!-- Daily Summary Strip for Selected Date -->
          <div id="savedTripsDailySummary"></div>

          <!-- Trips Table -->
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse text-xs">
              <thead>
                <tr class="bg-slate-100 text-slate-600 border-b border-slate-200">
                  <th class="p-2.5 font-bold">รหัสสายส่ง/รหัสงาน</th>
                  <th class="p-2.5 font-bold">วันที่ / เวลา</th>
                  <th class="p-2.5 font-bold">รถ / จุดส่ง</th>
                  <th class="p-2.5 text-center font-bold">จุดส่ง</th>
                  <th class="p-2.5 text-right font-bold">ระยะทาง</th>
                  <th class="p-2.5 text-right font-bold">สินค้าที่ส่ง</th>
                  <th class="p-2.5 text-right font-bold">ค่าน้ำมัน</th>
                  <th class="p-2.5 text-right font-bold">ยอดเงิน</th>
                  <th class="p-2.5 text-center font-bold">สถานะ</th>
                </tr>
              </thead>
              <tbody id="savedTripsTableBody" class="divide-y divide-slate-200"></tbody>
            </table>
          </div>
        </div>
      </div>
      `;

html = html.slice(0, hStart) + newHistoryHtml + html.slice(hEnd);
fs.writeFileSync(htmlPath, html, 'utf8');
console.log('✓ Successfully updated public/index.html history section');


// 2. UPDATE public/app.js
const appPath = 'd:/13. Antigravity/Sunan/Inthara_program_develop/public/app.js';
let app = fs.readFileSync(appPath, 'utf8');

const oldTripsFnStart = 'function renderSavedTripsTable() {';
const oldTripsFnEnd = '// ==========================================';

const tStart = app.indexOf(oldTripsFnStart);
const tEnd = app.indexOf(oldTripsFnEnd, tStart);

if (tStart === -1 || tEnd === -1) {
  console.error('Error: Could not locate renderSavedTripsTable in app.js');
  process.exit(1);
}

const newTripsLogic = `function setSavedTripsFilterToday() {
  const dateInput = document.getElementById('savedTripsDateFilter');
  if (dateInput) {
    dateInput.value = new Date().toISOString().slice(0, 10);
  }
  renderSavedTripsTable();
}

function setSavedTripsFilterAll() {
  const dateInput = document.getElementById('savedTripsDateFilter');
  if (dateInput) {
    dateInput.value = '';
  }
  renderSavedTripsTable();
}

function toggleSavedTripsAccordion() {
  const content = document.getElementById('savedTripsContent');
  const icon = document.getElementById('savedTripsToggleIcon');
  if (!content) return;
  const isHidden = content.classList.contains('hidden');
  if (isHidden) {
    content.classList.remove('hidden');
    if (icon) icon.textContent = '▴ ซ่อนตาราง';
  } else {
    content.classList.add('hidden');
    if (icon) icon.textContent = '▾ แสดงตาราง';
  }
}

function renderSavedTripsTable() {
  const tbody = document.getElementById('savedTripsTableBody');
  const countBadge = document.getElementById('savedTripsCountBadge');
  const dateInput = document.getElementById('savedTripsDateFilter');
  const summaryEl = document.getElementById('savedTripsDailySummary');

  // Default to CURRENT DATE (Today) first always
  const todayStr = new Date().toISOString().slice(0, 10);
  if (dateInput && !dateInput.value) {
    dateInput.value = todayStr;
  }

  const selectedDate = dateInput ? dateInput.value : todayStr;
  const allTrips = appData?.savedTrips || [];

  // Filter by selected date (if empty, show all)
  const filteredTrips = selectedDate 
    ? allTrips.filter(t => t.date === selectedDate) 
    : allTrips;

  if (countBadge) {
    if (selectedDate === todayStr) {
      countBadge.textContent = \`\${filteredTrips.length} รายการ (วันนี้)\`;
      countBadge.className = 'bg-emerald-100 text-emerald-800 text-xs font-bold px-2.5 py-0.5 rounded-full';
    } else if (selectedDate) {
      countBadge.textContent = \`\${filteredTrips.length} รายการ (\${selectedDate})\`;
      countBadge.className = 'bg-sky-100 text-sky-800 text-xs font-bold px-2.5 py-0.5 rounded-full';
    } else {
      countBadge.textContent = \`\${filteredTrips.length} รายการ (ทั้งหมด)\`;
      countBadge.className = 'bg-slate-100 text-slate-700 text-xs font-bold px-2.5 py-0.5 rounded-full';
    }
  }

  // Render Daily Summary Cards for Selected Date
  if (summaryEl) {
    const totalBottles = filteredTrips.reduce((s, t) => s + Number(t.totalBottles189L || 0), 0);
    const totalPacks = filteredTrips.reduce((s, t) => s + Number(t.totalPacks || 0), 0);
    const totalFuel = filteredTrips.reduce((s, t) => s + Number(t.estimatedFuelCost || 0), 0);
    const totalRevenue = filteredTrips.reduce((s, t) => s + Number(t.totalRevenue || 0), 0);

    summaryEl.innerHTML = \`
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <div class="bg-white border border-slate-200 rounded-lg p-2.5 shadow-2xs">
          <div class="text-[10px] text-slate-500 font-medium">รายการสายส่งที่ปิด</div>
          <div class="font-black text-slate-800 text-sm mt-0.5">\${filteredTrips.length} รายการ</div>
        </div>
        <div class="bg-white border border-slate-200 rounded-lg p-2.5 shadow-2xs">
          <div class="text-[10px] text-sky-700 font-medium">ส่งสำเร็จรวม</div>
          <div class="font-black text-sky-900 text-sm mt-0.5">\${totalBottles} ถัง / \${totalPacks} แพ็ค</div>
        </div>
        <div class="bg-white border border-slate-200 rounded-lg p-2.5 shadow-2xs">
          <div class="text-[10px] text-rose-600 font-medium">ค่าน้ำมันรวม</div>
          <div class="font-black text-rose-700 text-sm mt-0.5">฿\${totalFuel.toLocaleString()}</div>
        </div>
        <div class="bg-white border border-slate-200 rounded-lg p-2.5 shadow-2xs">
          <div class="text-[10px] text-emerald-700 font-medium">ยอดเงินรวม</div>
          <div class="font-black text-emerald-800 text-sm mt-0.5">฿\${totalRevenue.toLocaleString()}</div>
        </div>
      </div>
    \`;
  }

  if (!tbody) return;
  if (filteredTrips.length === 0) {
    const dateNotice = selectedDate ? \`ในวันที่ \${selectedDate}\` : '';
    tbody.innerHTML = \`<tr><td colspan="9" class="p-6 text-center text-xs text-slate-400 bg-slate-50/50">ℹ️ ไม่มีประวัติสายส่งที่ปิดงาน \${dateNotice} (กดปุ่ม "ทุกวัน" เพื่อดูประวัติทั้งหมด หรือเลือกวันที่อื่นด้านบน)</td></tr>\`;
    return;
  }

  tbody.innerHTML = filteredTrips.map(t => {
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
      </tr>
    \`;
  }).join('');
}

`;

app = app.slice(0, tStart) + newTripsLogic + app.slice(tEnd);
fs.writeFileSync(appPath, app, 'utf8');
console.log('✓ Successfully updated public/app.js renderSavedTripsTable');


// 3. UPDATE server.js /api/delivery/checkin to automatically log closed delivery job to db.savedTrips
const serverPath = 'd:/13. Antigravity/Sunan/Inthara_program_develop/server.js';
let srv = fs.readFileSync(serverPath, 'utf8');

const checkinSaveMarker = 'saveDB(db);\n  res.json({ ok: true, data: db });';
const oldCheckinSave = `    // Update confirmed actual delivered quantities in order(s) and mark completed
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
        }
      });
    }
  }
  saveDB(db);`;

const newCheckinSave = `    // Update confirmed actual delivered quantities in order(s) and mark completed
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
    }

    // Automatically record closed job into db.savedTrips for history tracking
    if (!Array.isArray(db.savedTrips)) db.savedTrips = [];
    const dateStr = new Date().toISOString().slice(0, 10);
    const timeStr = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    const orderTotal = matchedOrder ? Number(matchedOrder.totalAmount || 0) : ((q189 * 15) + ((q350 + q600 + q1500) * 35));

    db.savedTrips.unshift({
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
    });
  }
  saveDB(db);`;

if (srv.includes(oldCheckinSave)) {
  srv = srv.replace(oldCheckinSave, newCheckinSave);
  fs.writeFileSync(serverPath, srv, 'utf8');
  console.log('✓ Successfully updated server.js to log closed delivery jobs to db.savedTrips');
} else {
  console.log('Note: oldCheckinSave pattern not matched in server.js, skipping server edit');
}
