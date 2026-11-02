const fs = require('fs');

// ========================================================
// 1. UPDATE public/index.html
// ========================================================
const htmlPath = 'd:/13. Antigravity/Sunan/Inthara_program_develop/public/index.html';
let htmlContent = fs.readFileSync(htmlPath, 'utf8');

const tmsSectionStart = '<section id="view-tms" class="hidden space-y-3">';
const tmsSectionEnd = '<!-- 3. Closed Trips History -->';

const startIndex = htmlContent.indexOf(tmsSectionStart);
const endIndex = htmlContent.indexOf(tmsSectionEnd);

if (startIndex === -1 || endIndex === -1) {
  console.error('Error: Could not locate TMS section in index.html');
  process.exit(1);
}

const simplifiedTmsHtml = `<section id="view-tms" class="hidden space-y-3">
      <!-- 1. Header: Simple Title + Vehicle + Main Actions (No ปิดสายส่ง / No ล้างสาย) -->
      <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-3.5 space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex flex-wrap items-center gap-3">
            <div class="flex items-center gap-2.5">
              <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-600 to-sky-800 text-white flex items-center justify-center font-bold text-lg shadow-sm">🚚</div>
              <div>
                <h2 class="text-sm font-bold text-slate-800 leading-tight">แผนที่และเส้นทางส่งน้ำดื่ม (GPS)</h2>
                <p class="text-[11px] text-slate-500">นำทางและบันทึกส่งสำเร็จทีละร้าน อัปเดตออเดอร์อัตโนมัติ</p>
              </div>
            </div>
            <div class="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
              <span class="text-xs text-slate-600 font-semibold">รถส่งน้ำ:</span>
              <select id="vehicleSelect" onchange="recalculateCurrentRoute()" class="text-xs bg-transparent font-bold text-slate-800 outline-none cursor-pointer"></select>
              <label class="inline-flex items-center gap-1 text-[11px] text-slate-600 cursor-pointer ml-1 pl-2 border-l border-slate-200">
                <input type="checkbox" id="returnToFactoryChk" checked onchange="recalculateCurrentRoute()" class="rounded text-sky-600 focus:ring-0" />
                <span class="font-medium">วนกลับโรงงาน</span>
              </label>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <button type="button" onclick="optimizeRoute('nearest')" class="bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-bold px-3 py-1.5 rounded-lg text-xs transition flex items-center gap-1.5 shadow-xs" title="จัดเรียงร้านที่ใกล้ที่สุดก่อนอัตโนมัติ">
              <span>⚡</span> <span>จัดลำดับใกล้-ไกล</span>
            </button>
            <button type="button" onclick="openFullRouteInGoogleMaps()" class="bg-sky-600 hover:bg-sky-700 text-white font-bold px-3.5 py-1.5 rounded-lg text-xs shadow-sm transition flex items-center gap-1.5" title="เปิด Google Maps นำทางต่อเนื่องทุกจุด">
              <span>🧭</span> <span>เปิดแผนที่นำทางทุกร้าน</span>
            </button>
            <button type="button" onclick="switchTab('orders')" class="text-xs font-semibold text-teal-700 hover:text-teal-900 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg px-2.5 py-1.5 transition whitespace-nowrap" title="ไปหน้าสั่งออเดอร์น้ำดื่ม">
              🛒 สั่งน้ำดื่ม
            </button>
          </div>
        </div>

        <!-- KPI Strip (5 cards, simple everyday language) -->
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 pt-2 border-t border-slate-100">
          <div class="bg-sky-50/80 border border-sky-100 rounded-xl p-2.5">
            <div class="text-[10px] text-sky-800 font-bold">📍 จุดส่งน้ำวันนี้</div>
            <div id="tmsKpiStops" class="text-base font-black text-sky-950 leading-tight">0 ร้าน</div>
            <div class="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden mt-1">
              <div id="tmsProgressBar" class="bg-emerald-500 h-full rounded-full transition-all duration-300" style="width: 0%"></div>
            </div>
            <div id="tmsProgressText" class="text-[10px] text-slate-500 mt-0.5 truncate">ส่งแล้ว 0/0 ร้าน</div>
          </div>

          <div class="bg-emerald-50/80 border border-emerald-100 rounded-xl p-2.5">
            <div class="text-[10px] text-emerald-800 font-bold">🛣️ ระยะทาง / เวลา</div>
            <div class="text-base font-black text-emerald-950 leading-tight"><span id="tmsKpiDistance">0.0 กม.</span> <span class="text-xs font-bold text-slate-500">· <span id="tmsKpiDuration">0 นาที</span></span></div>
            <div id="tmsKpiRouteMode" class="text-[10px] text-emerald-700 truncate">คำนวณถนนจริง</div>
          </div>

          <div class="bg-rose-50/80 border border-rose-100 rounded-xl p-2.5">
            <div class="text-[10px] text-rose-800 font-bold">⛽ ค่าน้ำมันประเมิน</div>
            <div id="tmsKpiFuel" class="text-base font-black text-rose-950 leading-tight">฿0</div>
            <div id="tmsKpiFuelDetail" class="text-[10px] text-slate-500 truncate">ตามอัตราสิ้นเปลืองรถ</div>
          </div>

          <div class="bg-amber-50/80 border border-amber-100 rounded-xl p-2.5">
            <div class="flex items-center justify-between gap-1">
              <span class="text-[10px] text-amber-900 font-bold">📦 ของบนรถ</span>
              <span id="tmsKpiLoad" class="text-xs font-bold text-slate-800 truncate">0 ถัง / 0 แพ็ค</span>
            </div>
            <div class="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden mt-1.5">
              <div id="tmsCapacityProgressBar" class="bg-emerald-500 h-full rounded-full transition-all duration-300" style="width: 0%"></div>
            </div>
            <div id="tmsKpiCapacityWarn" class="text-[10px] text-emerald-700 font-medium mt-0.5 truncate">อยู่ในเกณฑ์ความจุรถ</div>
          </div>

          <div class="bg-teal-50/80 border border-teal-100 rounded-xl p-2.5">
            <div class="text-[10px] text-teal-800 font-bold">💰 ยอดเงินรวม</div>
            <div id="tmsKpiRevenue" class="text-base font-black text-teal-950 leading-tight">฿0</div>
            <div id="tmsKpiNetProfit" class="text-[10px] text-teal-700 truncate">เหลือหลังหักน้ำมัน</div>
          </div>
        </div>
      </div>

      <!-- 2. Workspace: Stop List (left, clean queue) + Map (right) -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-3">
        <!-- Stop List: Clean Single Queue (No tabs!) -->
        <div class="lg:col-span-5 bg-white rounded-2xl shadow-sm border border-slate-200 p-3.5 flex flex-col">
          <div class="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 gap-2">
            <div class="flex items-center gap-2">
              <span class="font-bold text-slate-800 text-xs md:text-sm">📋 รายการร้านที่ต้องไปส่ง</span>
              <span id="badgeTmsInRouteCount" class="bg-sky-100 text-sky-800 text-xs px-2 py-0.5 rounded-full font-bold">0 ร้าน</span>
            </div>
            <div>
              <select id="tmsAddCustomerQuickSelect" onchange="onQuickAddCustomerToRoute(this.value); this.value='';" class="text-[11px] font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded-lg px-2 py-1 transition cursor-pointer">
                <option value="">+ เพิ่มร้านในสายส่ง...</option>
              </select>
            </div>
          </div>

          <div class="mb-2.5 flex items-center gap-2">
            <input type="text" id="tmsCustomerSearchInput" oninput="filterTmsCustomersList()" placeholder="🔍 ค้นหาชื่อร้าน / เบอร์โทร / เลขออเดอร์..." class="flex-1 border border-slate-200 rounded-lg px-3 py-1 text-xs text-slate-700 bg-slate-50 focus:bg-white focus:outline-sky-500 font-medium" />
            <select id="tmsZoneFilterSelect" onchange="filterTmsCustomersList()" class="border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-700 bg-slate-50 font-medium">
              <option value="ALL">โซนทั้งหมด</option>
            </select>
          </div>

          <div id="tmsInRouteContainer">
            <div id="orderedStopsList" class="space-y-2 max-h-[560px] overflow-y-auto pr-1"></div>
          </div>
        </div>

        <!-- Map -->
        <div class="lg:col-span-7 bg-white rounded-2xl shadow-sm border border-slate-200 p-3.5 flex flex-col">
          <div class="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
            <span class="font-bold text-slate-800 text-xs md:text-sm">🗺️ แผนที่เส้นทางส่งน้ำ</span>
            <div class="flex items-center gap-2.5 text-[11px] text-slate-600">
              <span class="inline-flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-full bg-rose-600 inline-block"></span> โรงงาน</span>
              <span class="inline-flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-full bg-sky-600 inline-block"></span> รอส่ง</span>
              <span class="inline-flex items-center gap-1"><span class="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block"></span> ส่งแล้ว</span>
            </div>
          </div>
          <div id="tmsMap" class="w-full rounded-xl border border-slate-200 overflow-hidden flex-1 min-h-[560px]"></div>
        </div>
      </div>
      
      `;

htmlContent = htmlContent.slice(0, startIndex) + simplifiedTmsHtml + htmlContent.slice(endIndex);

// Also update modalCheckin title and submit button in index.html
const oldModalCheckinHeader = '<h3 class="font-bold text-slate-800">✅ ปิดงานจุดส่ง</h3>';
const newModalCheckinHeader = '<h3 class="font-bold text-slate-800 text-sm">✅ บันทึกส่งน้ำและรับถังคืน (ปิดงานร้านนี้)</h3>';
if (htmlContent.includes(oldModalCheckinHeader)) {
  htmlContent = htmlContent.replace(oldModalCheckinHeader, newModalCheckinHeader);
}

fs.writeFileSync(htmlPath, htmlContent, 'utf8');
console.log('✓ Successfully updated public/index.html');


// ========================================================
// 2. UPDATE public/app.js
// ========================================================
const appPath = 'd:/13. Antigravity/Sunan/Inthara_program_develop/public/app.js';
let appContent = fs.readFileSync(appPath, 'utf8');

// A. Add syncRouteStopsFromOrders and onQuickAddCustomerToRoute
const syncStopsFunction = `
function syncRouteStopsFromOrders() {
  if (!appData || !Array.isArray(appData.customers)) return;
  const pendingOrders = (appData.orders || []).filter(o => o.orderStatus !== 'จัดส่งสำเร็จแล้ว' && o.orderStatus !== 'ยกเลิก');
  const pendingCustIds = new Set(pendingOrders.map(o => o.customerId));

  // Customers with pending orders or order quantities
  appData.customers.forEach(c => {
    if (c.selectedForRoute || Number(c.orderBottles189L || 0) > 0 || Number(c.orderPack350ml || 0) > 0 || Number(c.orderPack600ml || 0) > 0 || Number(c.orderPack1500ml || 0) > 0) {
      pendingCustIds.add(c.id);
    }
  });

  // Ensure each of these customers is in currentOrderedStops
  pendingCustIds.forEach(cId => {
    const cust = appData.customers.find(c => c.id === cId);
    if (cust) {
      cust.selectedForRoute = true;
      const custPending = pendingOrders.filter(o => o.customerId === cId);
      if (custPending.length > 0) {
        cust.orderBottles189L = custPending.reduce((s, o) => s + Number(o.qty189L || 0), 0);
        cust.orderPack350ml = custPending.reduce((s, o) => s + Number(o.qty350ml || 0), 0);
        cust.orderPack600ml = custPending.reduce((s, o) => s + Number(o.qty600ml || 0), 0);
        cust.orderPack1500ml = custPending.reduce((s, o) => s + Number(o.qty1500ml || 0), 0);
      }
      if (!currentOrderedStops.some(s => s.id === cId)) {
        currentOrderedStops.push(cust);
      }
    }
  });
}

function onQuickAddCustomerToRoute(customerId) {
  if (!customerId) return;
  const cust = appData?.customers?.find(c => c.id === customerId);
  if (!cust) return;
  cust.selectedForRoute = true;
  if (!currentOrderedStops.some(s => s.id === customerId)) {
    currentOrderedStops.push(cust);
  }
  recalculateCurrentRoute();
}

function populateTmsAddCustomerDropdown() {
  const sel = document.getElementById('tmsAddCustomerQuickSelect');
  if (!sel || !appData || !Array.isArray(appData.customers)) return;
  const available = appData.customers.filter(c => !currentOrderedStops.some(s => s.id === c.id));
  sel.innerHTML = '<option value="">+ เพิ่มร้านในสายส่ง...</option>' + 
    available.map(c => \`<option value="\${c.id}">+ \${c.name} (\${c.zone || 'ทั่วไป'})\` + (c.phone ? \` - \${c.phone}\` : '') + \`</option>\`).join('');
}
`;

// Insert helpers before toggleCustomerInRoute
const toggleAnchor = 'function toggleCustomerInRoute(customerId, include) {';
if (appContent.includes(toggleAnchor) && !appContent.includes('function syncRouteStopsFromOrders()')) {
  appContent = appContent.replace(toggleAnchor, syncStopsFunction + '\n' + toggleAnchor);
  console.log('✓ Added syncRouteStopsFromOrders and onQuickAddCustomerToRoute');
}

// B. Update renderOrderedStopsCards to be clean and simple everyday Thai
const oldRenderCardsStart = 'function renderOrderedStopsCards(legDistancesKm) {';
const oldRenderCardsEnd = 'function setTmsQueueTab(tabName) {';

const renderCardsStartIndex = appContent.indexOf(oldRenderCardsStart);
const renderCardsEndIndex = appContent.indexOf(oldRenderCardsEnd);

if (renderCardsStartIndex !== -1 && renderCardsEndIndex !== -1) {
  const newRenderCards = `function renderOrderedStopsCards(legDistancesKm) {
  const listEl = document.getElementById('orderedStopsList');
  const badgeCount = document.getElementById('badgeTmsInRouteCount');
  if (badgeCount) badgeCount.textContent = \`\${currentOrderedStops.length} ร้าน\`;

  let cumulativeKm = 0;

  if (currentOrderedStops.length === 0) {
    listEl.innerHTML = \`
      <div class="p-8 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200 space-y-2">
        <div class="text-3xl">🚚</div>
        <div class="font-bold text-slate-700 text-sm">ไม่มีร้านที่ต้องไปส่งน้ำในขณะนี้</div>
        <p class="text-[11px] text-slate-500 max-w-xs mx-auto">เมื่อมีใบสั่งซื้อใหม่จากหน้า "สั่งน้ำดื่ม" ร้านค้าจะปรากฏที่นี่อัตโนมัติ หรือกดเลือก "+ เพิ่มร้านในสายส่ง" ด้านบน</p>
        <button type="button" onclick="switchTab('orders')" class="mt-2 text-xs bg-sky-600 hover:bg-sky-700 text-white font-bold px-3.5 py-2 rounded-xl transition inline-flex items-center gap-1.5 shadow-sm">
          <span>🛒</span> ไปหน้าสั่งน้ำดื่ม
        </button>
      </div>\`;
  } else {
    listEl.innerHTML = currentOrderedStops.map((stop, idx) => {
      const legKm = legDistancesKm[idx] || 0;
      cumulativeKm += legKm;
      const singleNavUrl = \`https://www.google.com/maps/dir/?api=1&destination=\${stop.lat},\${stop.lng}&travelmode=driving\`;
      const q189 = Number(stop.orderBottles189L || 0);
      const q350 = Number(stop.orderPack350ml || 0);
      const q600 = Number(stop.orderPack600ml || 0);
      const q1500 = Number(stop.orderPack1500ml || 0);

      // Find linked orders for this customer from Sales Order system
      const custOrders = (appData?.orders || []).filter(o => o.customerId === stop.id);
      const pendingOrders = custOrders.filter(o => o.orderStatus !== 'จัดส่งสำเร็จแล้ว' && o.orderStatus !== 'ยกเลิก');
      const hasPending = pendingOrders.length > 0;
      const isDone = stop.deliveryStatus === 'completed' && !hasPending;

      let orderPillHtml = '';
      if (pendingOrders.length > 0) {
        orderPillHtml = pendingOrders.map(o => \`
          <span class="inline-flex items-center gap-1 bg-amber-50 text-amber-900 border border-amber-300 px-1.5 py-0.5 rounded text-[10px] font-bold" title="ออเดอร์รอจัดส่ง">
            📋 \${o.orderId}
          </span>
        \`).join(' ');
      } else if (isDone) {
        orderPillHtml = \`
          <span class="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 border border-emerald-300 px-1.5 py-0.5 rounded text-[10px] font-bold">
            ✓ ปิดงานออเดอร์แล้ว
          </span>
        \`;
      } else {
        orderPillHtml = \`
          <span class="text-[10px] text-slate-400">ไม่มีเลขออเดอร์ค้าง</span>
        \`;
      }

      return \`
        <div class="p-3 rounded-xl border \${isDone ? 'bg-emerald-50/80 border-emerald-300 shadow-xs' : 'bg-white hover:bg-slate-50/70 border-slate-200 shadow-xs'} transition flex flex-col gap-2">
          <!-- Card Header -->
          <div class="flex items-start justify-between gap-2">
            <div class="flex items-start gap-2.5 min-w-0">
              <span class="w-7 h-7 rounded-xl \${isDone ? 'bg-emerald-600' : 'bg-sky-600'} text-white font-black text-xs flex items-center justify-center shrink-0 shadow-xs">
                \${isDone ? '✓' : idx + 1}
              </span>
              <div class="min-w-0">
                <div class="font-bold text-slate-800 text-xs flex items-center gap-1.5 flex-wrap">
                  <span class="truncate">\${stop.name}</span>
                  <span class="bg-slate-100 text-slate-700 text-[10px] px-1.5 py-0.2 rounded font-medium border border-slate-200">\${stop.zone || 'ทั่วไป'}</span>
                  \${isDone ? '<span class="bg-emerald-600 text-white text-[10px] px-2 py-0.5 rounded-full font-bold shadow-xs">✓ ส่งเรียบร้อย</span>' : ''}
                </div>
                <div class="flex items-center gap-1.5 mt-1 flex-wrap">
                  \${orderPillHtml}
                </div>
                <div class="text-[11px] text-slate-500 flex items-center gap-2 mt-1 flex-wrap">
                  \${stop.phone ? \`<a href="tel:\${stop.phone}" class="text-sky-700 hover:underline font-mono font-medium inline-flex items-center gap-0.5">📞 \${stop.phone}</a>\` : '<span class="text-slate-400">ไม่มีเบอร์โทร</span>'}
                  <span class="text-slate-300">•</span>
                  <span class="text-slate-600 truncate max-w-[220px]" title="\${stop.address || '-'}">\${stop.address || '-'}</span>
                </div>
              </div>
            </div>

            <!-- Up / Down / Remove Controls -->
            <div class="flex items-center gap-0.5 shrink-0">
              <button type="button" onclick="moveStopOrder(\${idx}, -1)" title="เลื่อนขึ้น" class="w-6 h-6 flex items-center justify-center text-xs bg-white border border-slate-200 rounded hover:bg-slate-100 text-slate-600 font-bold transition">↑</button>
              <button type="button" onclick="moveStopOrder(\${idx}, 1)" title="เลื่อนลง" class="w-6 h-6 flex items-center justify-center text-xs bg-white border border-slate-200 rounded hover:bg-slate-100 text-slate-600 font-bold transition">↓</button>
              <button type="button" onclick="toggleCustomerInRoute('\${stop.id}', false)" title="นำออกจากสายส่งวันนี้" class="w-6 h-6 flex items-center justify-center text-xs bg-white border border-rose-200 rounded hover:bg-rose-50 text-rose-600 font-bold transition">✕</button>
            </div>
          </div>

          <!-- Product Badges & Stats Row -->
          <div class="flex flex-wrap items-center justify-between gap-1.5 bg-slate-50/80 p-2 rounded-lg border border-slate-200/80 text-[11px]">
            <div class="flex flex-wrap items-center gap-1.5 font-semibold">
              <span class="bg-sky-100 text-sky-800 px-2 py-0.5 rounded text-[11px]">ถัง 18.9L: <b>\${q189}</b> ถัง</span>
              \${q350 > 0 ? \`<span class="bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded text-[10px]">350ml: <b>\${q350}</b></span>\` : ''}
              \${q600 > 0 ? \`<span class="bg-blue-100 text-blue-900 px-1.5 py-0.5 rounded text-[10px]">600ml: <b>\${q600}</b></span>\` : ''}
              \${q1500 > 0 ? \`<span class="bg-indigo-100 text-indigo-900 px-1.5 py-0.5 rounded text-[10px]">1.5L: <b>\${q1500}</b></span>\` : ''}
            </div>
            <div class="flex items-center gap-2 text-[10px] text-slate-500 font-medium">
              <span>ถังค้างเดิม: <b class="text-amber-700">\${stop.OutstandingBottles || 0} ใบ</b></span>
              <span class="text-sky-700 font-bold">+\${legKm.toFixed(1)} กม.</span>
            </div>
          </div>

          <!-- Action Buttons Row -->
          <div class="grid grid-cols-2 gap-2 pt-0.5">
            <a href="\${singleNavUrl}" target="_blank" class="bg-white hover:bg-sky-50 text-sky-700 border border-sky-300 font-bold text-xs py-1.5 px-2 rounded-lg text-center transition flex items-center justify-center gap-1 shadow-xs">
              <span>🧭</span> นำทาง GPS
            </a>
            <button type="button" onclick="openCheckinModal('\${stop.id}')" class="\${isDone ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-emerald-500 hover:bg-emerald-600 text-slate-950'} font-bold text-xs py-1.5 px-2 rounded-lg transition flex items-center justify-center gap-1 shadow-xs">
              <span>\${isDone ? '✓' : '📦'}</span> <span>\${isDone ? \`ส่ง \${stop.deliveredBottles || q189} / คืน \${stop.returnedBottles || 0} (แก้ไข)\` : '✅ ส่งสำเร็จ'}</span>
            </button>
          </div>
        </div>
      \`;
    }).join('');
  }

  populateTmsAddCustomerDropdown();
}

function setTmsQueueTab() {
  // Tabs removed for simplicity
}
`;

  appContent = appContent.slice(0, renderCardsStartIndex) + newRenderCards + '\n' + appContent.slice(renderCardsEndIndex);
  console.log('✓ Successfully updated renderOrderedStopsCards');
}

// C. In recalculateCurrentRoute, update KPI labels to say "ร้าน"
appContent = appContent.replace(
  "kpiStopsEl.textContent = `${totalStops} จุดส่ง${doneStops > 0 ? ` (เสร็จ ${doneStops})` : ''}`;",
  "kpiStopsEl.textContent = `${totalStops} ร้าน${doneStops > 0 ? ` (ส่งแล้ว ${doneStops})` : ''}`;"
);

appContent = appContent.replace(
  "progText.textContent = totalStops > 0 ? `ส่งแล้ว ${doneStops}/${totalStops} จุด (${stopProgressPct}%)` : 'ส่งแล้ว 0/0 จุด';",
  "progText.textContent = totalStops > 0 ? `ส่งแล้ว ${doneStops}/${totalStops} ร้าน (${stopProgressPct}%)` : 'ส่งแล้ว 0/0 ร้าน';"
);

// D. Inside renderAllViews or loadAppData, ensure syncRouteStopsFromOrders is invoked
if (appContent.includes('currentOrderedStops = appData.customers.filter(c => c.selectedForRoute);')) {
  appContent = appContent.replace(
    'currentOrderedStops = appData.customers.filter(c => c.selectedForRoute);',
    'currentOrderedStops = appData.customers.filter(c => c.selectedForRoute);\n  syncRouteStopsFromOrders();'
  );
  console.log('✓ Wired syncRouteStopsFromOrders into loadAppData');
}

fs.writeFileSync(appPath, appContent, 'utf8');
console.log('✓ Successfully updated public/app.js');
