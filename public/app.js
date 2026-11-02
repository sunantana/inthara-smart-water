// Inthara Smart Water ERP — Frontend Application Logic (GPS TMS, OSRM Routing, CMMS, Production, Costing)
let appData = {
  factory: {
    lat: 17.816882513503195,
    lng: 100.36169257553256,
    name: 'น้ำดื่มอินธารา',
    address: '121 หมู่ 4 ต.จริม อ.ท่าปลา จ.อุตรดิตถ์ 53150'
  },
  customers: [],
  machines: [],
  maintenanceLogs: [],
  productionLots: [],
  inventory: [],
  vehicles: [],
  expenses: [],
  savedTrips: [],
  orders: [],
  employees: [],
  assets: [],
  packagingLots: []
};
let map = null;
let routeLayerGroup = null;
let markersLayerGroup = null;
let currentOrderedStops = [];
let currentRouteStats = {
  distanceKm: 0,
  durationMin: 0,
  fuelCost: 0,
  totalBottles189L: 0,
  totalPacks: 0,
  totalRevenue: 0
};

let currentUser = {
  username: 'owner_inthara',
  displayName: 'นางมัณฑนา โนราช (ผู้บริหารสูงสุด)',
  role: 'executive',
  roleName: 'ผู้บริหารสูงสุด / เจ้าของกิจการ (Executive / Owner)',
  permissions: {
    allowedTabs: ['dashboard', 'customers', 'orders', 'tms', 'production', 'cmms', 'inventory', 'costing', 'security']
  }
};
let authToken = localStorage.getItem('inthara_auth_token') || null;
let currentThemeMode = 'dark';

function setThemeMode(mode) {
  currentThemeMode = mode === 'light' ? 'light' : 'dark';
  const htmlEl = document.documentElement;
  const btnDark = document.getElementById('btnThemeDark');
  const btnLight = document.getElementById('btnThemeLight');

  if (currentThemeMode === 'dark') {
    htmlEl.classList.add('dark');
    if (btnDark) btnDark.className = 'h-full px-2 rounded-md font-semibold transition flex items-center gap-1 bg-sky-600 text-white shadow-xs text-[11px]';
    if (btnLight) btnLight.className = 'h-full px-2 rounded-md font-semibold transition flex items-center gap-1 text-slate-400 hover:text-white text-[11px]';
  } else {
    htmlEl.classList.remove('dark');
    if (btnLight) btnLight.className = 'h-full px-2 rounded-md font-semibold transition flex items-center gap-1 bg-amber-400 text-slate-950 shadow-xs text-[11px]';
    if (btnDark) btnDark.className = 'h-full px-2 rounded-md font-semibold transition flex items-center gap-1 text-slate-400 hover:text-white text-[11px]';
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  try { setThemeMode('dark'); } catch (e) { console.warn('setThemeMode error:', e); }
  try { initMap(); } catch (e) { console.warn('initMap error:', e); }
  try { initThaiAddressDropdowns(); } catch (e) { console.warn('initThaiAddressDropdowns error:', e); }
  try { initCustomerPickerMap(); } catch (e) { console.warn('initCustomerPickerMap error:', e); }
  
  // Critical: Always fetch and render all ERP data
  try {
    await fetchAllData();
  } catch (e) {
    console.error('fetchAllData error:', e);
  }
  
  try { await fetchSecurityAudit(); } catch (e) { console.warn('fetchSecurityAudit error:', e); }

  const params = new URLSearchParams(window.location.search);
  const roleParam = params.get('role');
  if (roleParam) {
    applyQuickRoleMode(roleParam);
  }
});

function toggleMobileMenu(show) {
  const modal = document.getElementById('mobileMenuModal');
  if (!modal) return;
  if (show) {
    modal.classList.remove('hidden');
  } else {
    modal.classList.add('hidden');
  }
}

function switchTab(tabName) {
  const allTabs = ['dashboard', 'customers', 'orders', 'tms', 'production', 'cmms', 'inventory', 'costing', 'employees', 'assets', 'security'];
  const isExecutive = currentUser?.role === 'executive' || currentUser?.username === 'owner_inthara';
  const allowed = isExecutive ? allTabs : (currentUser?.permissions?.allowedTabs || allTabs);
  if (!allowed.includes(tabName)) {
    alert(`🔒 จำกัดสิทธิ์การเข้าถึง: ระดับสิทธิ์ของคุณ (${currentUser.roleName}) ไม่ได้รับอนุญาตให้เข้าถึงเมนูนี้`);
    return;
  }
  const tabs = allTabs;
  tabs.forEach(t => {
    const viewEl = document.getElementById(`view-${t}`);
    const btnEl = document.getElementById(`tab-${t}`);
    if (!viewEl || !btnEl) return;
    if (t === tabName) {
      viewEl.classList.remove('hidden');
      btnEl.classList.add('active');
      try {
        btnEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      } catch (e) {}
    } else {
      viewEl.classList.add('hidden');
      btnEl.classList.remove('active');
    }
  });
  if (tabName === 'tms' && map) {
    setTimeout(() => map.invalidateSize(), 150);
  }
  if (tabName === 'customers') {
    renderCustomersMasterView();
    if (custPickerMap) {
      setTimeout(() => custPickerMap.invalidateSize(), 150);
    }
  }
  if (tabName === 'orders') {
    resetOrderForm();
    setOrderFilterStatus('pending');
  }
  if (tabName === 'employees') {
    renderEmployeesView();
  }
  if (tabName === 'assets') {
    renderAssetsView();
  }
  if (tabName === 'production') {
    renderProductionView();
    generateAndSetAutoLotNo();
  }
  if (tabName === 'security') {
    fetchSecurityAudit();
  }
}

async function fetchAllData() {
  try {
    const res = await fetch('/api/data?t=' + Date.now());
    appData = await res.json();
    renderAllViews();
  } catch (err) {
    console.error('Failed to load ERP data:', err);
  }
}

function renderAllViews() {
  if (!appData) return;
  populateVehicleSelect();
  populateDriverSelect();
  populateTmsZoneFilterDropdown();
  currentOrderedStops = appData.customers.filter(c => c.selectedForRoute);
  syncRouteStopsFromOrders();
  optimizeRoute('nearest');
  renderSavedTripsTable();
  renderDashboard();
  renderCustomersMasterView();
  renderOrdersView();
  renderProductionView();
  renderCmmsView();
  renderInventoryView();
  renderCostingView();
  renderEmployeesView();
  renderAssetsView();
}

// ==========================================
// 1. TMS & GPS ROUTE OPTIMIZATION ENGINE
// ==========================================
function initMap() {
  const fLat = appData?.factory?.lat || 17.816882513503195;
  const fLng = appData?.factory?.lng || 100.36169257553256;
  map = L.map('tmsMap').setView([fLat, fLng], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap • Inthara Water GPS TMS'
  }).addTo(map);

  routeLayerGroup = L.layerGroup().addTo(map);
  markersLayerGroup = L.layerGroup().addTo(map);

  // Click on map to pick coordinates for new customer stop
  map.on('click', (e) => {
    const lat = e.latlng.lat.toFixed(4);
    const lng = e.latlng.lng.toFixed(4);
    document.getElementById('mapClickCoordHint').textContent = `พิกัดที่คลิกบนแผนที่: ${lat}, ${lng}`;
    const latInput = document.getElementById('newCustLat');
    const lngInput = document.getElementById('newCustLng');
    if (latInput && lngInput) {
      latInput.value = lat;
      lngInput.value = lng;
    }
  });
}

let currentDeliveryDriverId = 'EMP-02';

function populateVehicleSelect() {
  const sel = document.getElementById('vehicleSelect');
  if (!sel) return;
  const currentVal = sel.value;
  const vehicles = appData.vehicles || [];

  if (vehicles.length === 0) {
    sel.innerHTML = '<option value="">ไม่มีข้อมูลรถ</option>';
    updateVehicleAssetBadge();
    return;
  }

  sel.innerHTML = vehicles.map(v => {
    const linkedAsset = (appData.assets || []).find(a => a.id === v.assetId || a.linkedRefId === v.id);
    const assetStr = linkedAsset ? ` [${linkedAsset.id}]` : (v.assetId ? ` [${v.assetId}]` : '');
    const tip = `${v.name || ''} (จุ ${v.maxBottles189L || 0} ถัง)${assetStr}`;
    // แสดงเฉพาะทะเบียนรถตามที่ผู้ใช้ต้องการ เพื่อความกระชับ ไม่เกะกะ
    return `<option value="${v.id}" title="${tip}">${v.plate || v.name}</option>`;
  }).join('');

  if (currentVal && vehicles.some(v => v.id === currentVal)) {
    sel.value = currentVal;
  } else {
    sel.value = vehicles[0].id;
  }
  updateVehicleAssetBadge();
}

function populateDriverSelect() {
  const sel = document.getElementById('driverSelect');
  if (!sel) return;
  const currentVal = sel.value || currentDeliveryDriverId;
  const emps = appData.employees || [];

  if (emps.length === 0) {
    sel.innerHTML = '<option value="EMP-02">นายสุนัน ต๊ะนา</option>';
    currentDeliveryDriverId = 'EMP-02';
    return;
  }

  sel.innerHTML = emps.map(emp => {
    const roleDesc = emp.position || emp.department || '';
    // แสดงชื่อผู้ส่งน้ำแบบกระชับ ให้อยู่บรรทัดเดียวกันได้พอดี
    return `<option value="${emp.id}" title="${roleDesc}">${emp.name}</option>`;
  }).join('');

  if (currentVal && emps.some(e => e.id === currentVal)) {
    sel.value = currentVal;
  } else {
    const emp2 = emps.find(e => e.id === 'EMP-02');
    sel.value = emp2 ? 'EMP-02' : emps[0].id;
  }
  currentDeliveryDriverId = sel.value;
}

function onVehicleSelectChange() {
  const sel = document.getElementById('vehicleSelect');
  const vehId = sel?.value;
  const veh = (appData.vehicles || []).find(v => v.id === vehId);

  // Auto-sync default driver if assigned and available in employees
  if (veh && veh.defaultDriverId) {
    const driverSel = document.getElementById('driverSelect');
    if (driverSel && (appData.employees || []).some(e => e.id === veh.defaultDriverId)) {
      driverSel.value = veh.defaultDriverId;
      currentDeliveryDriverId = veh.defaultDriverId;
    }
  }

  updateVehicleAssetBadge();
  recalculateCurrentRoute();
}

function onDriverSelectChange() {
  const sel = document.getElementById('driverSelect');
  if (sel) {
    currentDeliveryDriverId = sel.value;
    recalculateCurrentRoute();
  }
}

function updateVehicleAssetBadge() {
  const sel = document.getElementById('vehicleSelect');
  const badge = document.getElementById('currentVehicleAssetBadge');
  if (!sel || !badge) return;
  const veh = (appData.vehicles || []).find(v => v.id === sel.value);
  const assetId = veh?.assetId || 'AST-VEH-001';
  badge.textContent = assetId;
}

function openCurrentVehicleAsset() {
  const sel = document.getElementById('vehicleSelect');
  const veh = (appData.vehicles || []).find(v => v.id === sel?.value);
  const assetId = veh?.assetId || 'AST-VEH-001';
  switchTab('assets');
  setAssetCategoryFilter('vehicle');
  setTimeout(() => {
    if (typeof openAssetModal === 'function') openAssetModal(assetId);
  }, 120);
}

// Haversine formula (in km)
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// 2-Opt + Nearest Neighbor VRP Solver starting from Inthara Factory
function optimizeRoute(mode = 'nearest') {
  if (!appData) return;
  const selected = appData.customers.filter(c => c.selectedForRoute);
  if (selected.length === 0) {
    currentOrderedStops = [];
    recalculateCurrentRoute();
    return;
  }

  const factory = appData.factory;
  const remaining = [...selected];
  const ordered = [];
  let currLat = factory.lat;
  let currLng = factory.lng;

  // Step 1: Nearest Neighbor Greedy
  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineKm(currLat, currLng, remaining[i].lat, remaining[i].lng);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    const nextStop = remaining.splice(bestIdx, 1)[0];
    ordered.push(nextStop);
    currLat = nextStop.lat;
    currLng = nextStop.lng;
  }

  // Step 2: 2-Opt Local Search improvement
  const returnToFactory = document.getElementById('returnToFactoryChk')?.checked ?? true;
  function routeTotalDist(seq) {
    let total = 0;
    let pLat = factory.lat, pLng = factory.lng;
    for (const s of seq) {
      total += haversineKm(pLat, pLng, s.lat, s.lng);
      pLat = s.lat;
      pLng = s.lng;
    }
    if (returnToFactory && seq.length > 0) {
      total += haversineKm(pLat, pLng, factory.lat, factory.lng);
    }
    return total;
  }

  let improved = true;
  while (improved && ordered.length >= 4) {
    improved = false;
    for (let i = 0; i < ordered.length - 1; i++) {
      for (let k = i + 1; k < ordered.length; k++) {
        const candidate = [
          ...ordered.slice(0, i),
          ...ordered.slice(i, k + 1).reverse(),
          ...ordered.slice(k + 1)
        ];
        if (routeTotalDist(candidate) + 0.01 < routeTotalDist(ordered)) {
          ordered.splice(0, ordered.length, ...candidate);
          improved = true;
        }
      }
    }
  }

  currentOrderedStops = ordered;
  recalculateCurrentRoute();
}

function moveStopOrder(index, direction) {
  const targetIdx = index + direction;
  if (targetIdx < 0 || targetIdx >= currentOrderedStops.length) return;
  const temp = currentOrderedStops[index];
  currentOrderedStops[index] = currentOrderedStops[targetIdx];
  currentOrderedStops[targetIdx] = temp;
  recalculateCurrentRoute();
}


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
  // Deprecated: ฟังก์ชัน "เพิ่มร้านในสายส่ง" ถูกนำออกแล้วตามคำขอ
}

function toggleCustomerInRoute(customerId, include) {
  const cust = appData.customers.find(c => c.id === customerId);
  if (!cust) return;
  cust.selectedForRoute = include;
  if (include) {
    // Sync quantities from any active pending orders in Sales Order system
    const pendingOrders = (appData.orders || []).filter(o => o.customerId === customerId && o.orderStatus !== 'จัดส่งสำเร็จแล้ว' && o.orderStatus !== 'ยกเลิก');
    if (pendingOrders.length > 0) {
      cust.orderBottles189L = pendingOrders.reduce((s, o) => s + Number(o.qty189L || 0), 0);
      cust.orderPack350ml = pendingOrders.reduce((s, o) => s + Number(o.qty350ml || 0), 0);
      cust.orderPack600ml = pendingOrders.reduce((s, o) => s + Number(o.qty600ml || 0), 0);
      cust.orderPack1500ml = pendingOrders.reduce((s, o) => s + Number(o.qty1500ml || 0), 0);
    }
    if (!currentOrderedStops.some(s => s.id === customerId)) {
      currentOrderedStops.push(cust);
    }
  } else {
    currentOrderedStops = currentOrderedStops.filter(s => s.id !== customerId);
  }
  recalculateCurrentRoute();
}

function selectAllStops(includeAll) {
  appData.customers.forEach(c => { c.selectedForRoute = includeAll; });
  currentOrderedStops = includeAll ? [...appData.customers] : [];
  optimizeRoute('nearest');
}

function addAllPendingOrdersToRoute() {
  if (!appData || !Array.isArray(appData.customers)) return;
  const pendingOrders = (appData.orders || []).filter(o => o.orderStatus !== 'จัดส่งสำเร็จแล้ว' && o.orderStatus !== 'ยกเลิก');
  const pendingCustIds = new Set(pendingOrders.map(o => o.customerId));
  
  appData.customers.forEach(c => {
    if ((Number(c.orderBottles189L || 0) > 0 || Number(c.orderPack350ml || 0) > 0 || Number(c.orderPack600ml || 0) > 0 || Number(c.orderPack1500ml || 0) > 0) && c.deliveryStatus !== 'completed') {
      pendingCustIds.add(c.id);
    }
  });

  if (pendingCustIds.size === 0) {
    alert('ℹ️ ไม่มีออเดอร์ที่สถานะ "ยังไม่ได้จัดส่ง" ในระบบ');
    return;
  }

  let count = 0;
  pendingCustIds.forEach(cId => {
    const cust = appData.customers.find(c => c.id === cId);
    if (cust) {
      cust.selectedForRoute = true;
      const custOrders = pendingOrders.filter(o => o.customerId === cId);
      if (custOrders.length > 0) {
        cust.orderBottles189L = custOrders.reduce((sum, o) => sum + Number(o.qty189L || 0), 0);
        cust.orderPack350ml = custOrders.reduce((sum, o) => sum + Number(o.qty350ml || 0), 0);
        cust.orderPack600ml = custOrders.reduce((sum, o) => sum + Number(o.qty600ml || 0), 0);
        cust.orderPack1500ml = custOrders.reduce((sum, o) => sum + Number(o.qty1500ml || 0), 0);
      }
      if (!currentOrderedStops.some(s => s.id === cId)) {
        currentOrderedStops.push(cust);
        count++;
      }
    }
  });

  optimizeRoute('nearest');
  setTmsQueueTab('inRoute');
  alert(`✅ เพิ่ม ${pendingCustIds.size} ร้านที่มีออเดอร์เข้าสายส่ง และจัดลำดับเส้นทางให้อัตโนมัติแล้ว`);
}

async function recalculateCurrentRoute() {
  if (!appData || !map) return;
  routeLayerGroup.clearLayers();
  markersLayerGroup.clearLayers();

  const factory = appData.factory;
  const returnToFactory = document.getElementById('returnToFactoryChk')?.checked ?? true;

  // Draw Factory Marker
  const factoryIcon = L.divIcon({
    className: '',
    html: `<div class="custom-marker bg-rose-600 w-9 h-9 text-sm">🏭</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18]
  });
  L.marker([factory.lat, factory.lng], { icon: factoryIcon })
    .bindPopup(`
      <div class="text-xs font-sans">
        <div class="font-bold text-rose-700 text-sm">${factory.name}</div>
        <div class="text-slate-600">${factory.address}</div>
        <div class="mt-1 text-emerald-700 font-semibold">กำลังผลิต RO 24,000 ลิตร/วัน</div>
      </div>
    `)
    .addTo(markersLayerGroup);

  // Draw Ordered Stop Markers
  let legDistancesKm = [];
  let prevLat = factory.lat;
  let prevLng = factory.lng;

  currentOrderedStops.forEach((stop, idx) => {
    const seqNum = idx + 1;
    const legDist = haversineKm(prevLat, prevLng, stop.lat, stop.lng) * 1.24; // road winding factor fallback
    legDistancesKm.push(legDist);
    prevLat = stop.lat;
    prevLng = stop.lng;

    const bgColor = stop.deliveryStatus === 'completed' ? 'bg-emerald-600' : 'bg-sky-600';
    const stopIcon = L.divIcon({
      className: '',
      html: `<div class="custom-marker ${bgColor} w-8 h-8 text-xs">${seqNum}</div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });

    const navUrl = `https://www.google.com/maps/dir/?api=1&destination=${stop.lat},${stop.lng}&travelmode=driving`;
    const pendingOrdersForStop = (appData.orders || []).filter(o => o.customerId === stop.id && o.orderStatus !== 'จัดส่งสำเร็จแล้ว' && o.orderStatus !== 'ยกเลิก');
    const orderBadgesInPopup = pendingOrdersForStop.length > 0
      ? `<div class="bg-amber-50 border border-amber-200 rounded p-1 text-[11px] text-amber-900 font-bold">📋 ออเดอร์รอส่ง: ${pendingOrdersForStop.map(o => o.orderId).join(', ')}</div>`
      : (stop.deliveryStatus === 'completed' ? '<div class="bg-emerald-50 border border-emerald-200 rounded p-1 text-[11px] text-emerald-800 font-bold">✓ จัดส่งสำเร็จแล้ว</div>' : '');

    L.marker([stop.lat, stop.lng], { icon: stopIcon })
      .bindPopup(`
        <div class="text-xs space-y-1.5 font-sans min-w-[220px]">
          <div class="flex items-center justify-between">
            <span class="font-bold text-sky-800 text-sm">จุดที่ ${seqNum}: ${stop.name}</span>
            <span class="bg-slate-100 text-slate-700 text-[10px] px-1 rounded">${stop.zone || 'ทั่วไป'}</span>
          </div>
          <div class="text-slate-500 text-[11px]">${stop.address || '-'} (${stop.phone || 'ไม่มีเบอร์'})</div>
          ${orderBadgesInPopup}
          <div class="bg-slate-50 p-1.5 rounded border border-slate-200 text-slate-800 text-[11px] font-medium space-y-0.5">
            <div>• ถัง 18.9L: <b>${stop.deliveryStatus === 'completed' ? (stop.deliveredBottles || stop.orderBottles189L) : stop.orderBottles189L}</b> ถัง</div>
            <div>• รวมแพ็ค: <b>${Number(stop.orderPack350ml || 0) + Number(stop.orderPack600ml || 0) + Number(stop.orderPack1500ml || 0)}</b> แพ็ค</div>
            <div>• ถังค้างสะสม: <b class="text-amber-700">${stop.OutstandingBottles || 0} ใบ</b></div>
          </div>
          <div class="pt-1 grid grid-cols-2 gap-1.5">
            <a href="${navUrl}" target="_blank" class="bg-sky-600 hover:bg-sky-700 text-white px-2 py-1 rounded text-center font-bold text-xs">🧭 นำทาง GPS</a>
            <button type="button" onclick="openCheckinModal('${stop.id}')" class="bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-1 rounded text-center font-bold text-xs">${stop.deliveryStatus === 'completed' ? '✓ แก้ไขการส่ง' : '✅ ส่งสำเร็จ'}</button>
          </div>
        </div>
      `)
      .addTo(markersLayerGroup);
  });

  // Query real road geometry from OSRM Public API
  let totalDistKm = 0;
  let drivingMinutes = 0;
  let usedOsrm = false;

  if (currentOrderedStops.length > 0) {
    const waypoints = [
      [factory.lng, factory.lat],
      ...currentOrderedStops.map(s => [s.lng, s.lat])
    ];
    if (returnToFactory) {
      waypoints.push([factory.lng, factory.lat]);
    }
    const coordString = waypoints.map(p => `${p[0]},${p[1]}`).join(';');
    try {
      const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${coordString}?overview=full&geometries=geojson`;
      const res = await fetch(osrmUrl);
      if (res.ok) {
        const data = await res.json();
        if (data.routes && data.routes.length > 0) {
          const route = data.routes[0];
          totalDistKm = route.distance / 1000;
          drivingMinutes = Math.round(route.duration / 60);
          usedOsrm = true;

          // Update individual leg distances from OSRM legs
          if (route.legs && route.legs.length >= currentOrderedStops.length) {
            legDistancesKm = route.legs.slice(0, currentOrderedStops.length).map(l => l.distance / 1000);
          }

          const latLngs = route.geometry.coordinates.map(c => [c[1], c[0]]);
          L.polyline(latLngs, {
            color: '#0284c7',
            weight: 5,
            opacity: 0.85
          }).addTo(routeLayerGroup);
        }
      }
    } catch (e) {
      // Fallback to straight/road-factor polyline if offline
    }

    if (!usedOsrm) {
      const fallbackCoords = [
        [factory.lat, factory.lng],
        ...currentOrderedStops.map(s => [s.lat, s.lng])
      ];
      if (returnToFactory) fallbackCoords.push([factory.lat, factory.lng]);
      L.polyline(fallbackCoords, {
        color: '#0284c7',
        weight: 4,
        dashArray: '8, 6',
        opacity: 0.85
      }).addTo(routeLayerGroup);

      totalDistKm = legDistancesKm.reduce((a, b) => a + b, 0);
      if (returnToFactory) {
        const last = currentOrderedStops[currentOrderedStops.length - 1];
        totalDistKm += haversineKm(last.lat, last.lng, factory.lat, factory.lng) * 1.24;
      }
      drivingMinutes = Math.round((totalDistKm / 45) * 60);
    }

    const bounds = L.latLngBounds([
      [factory.lat, factory.lng],
      ...currentOrderedStops.map(s => [s.lat, s.lng])
    ]);
    map.fitBounds(bounds, { padding: [35, 35] });
  }

  // Update Route KPIs & Cost Calculations
  const serviceTimeMinutes = currentOrderedStops.length * 10; // 10 mins per stop for unloading & collecting empty bottles
  const totalDurationMin = drivingMinutes + serviceTimeMinutes;

  const vehId = document.getElementById('vehicleSelect').value;
  const vehicle = appData.vehicles.find(v => v.id === vehId) || appData.vehicles[0];
  const litersUsed = totalDistKm / (vehicle?.fuelRateKmPerLiter || 10);
  const fuelCost = Math.round(litersUsed * (vehicle?.dieselPricePerLiter || 32.5));

  const totalBottles189L = currentOrderedStops.reduce((sum, s) => {
    const qty = (s.deliveryStatus === 'completed' && s.deliveredBottles !== undefined) 
      ? Number(s.deliveredBottles) 
      : Number(s.orderBottles189L || 0);
    return sum + qty;
  }, 0);
  const totalPacks350 = currentOrderedStops.reduce((sum, s) => sum + Number(s.orderPack350ml || 0), 0);
  const totalPacks600 = currentOrderedStops.reduce((sum, s) => sum + Number(s.orderPack600ml || 0), 0);
  const totalPacks1500 = currentOrderedStops.reduce((sum, s) => sum + Number(s.orderPack1500ml || 0), 0);
  const totalPacks = totalPacks350 + totalPacks600 + totalPacks1500;
  
  const totalRevenue = currentOrderedStops.reduce((sum, s) => {
    const custOrders = (appData?.orders || []).filter(o => o.customerId === s.id && o.orderStatus !== 'ยกเลิก');
    if (custOrders.length > 0) {
      return sum + custOrders.reduce((ordSum, o) => ordSum + Number(o.totalAmount || 0), 0);
    }
    const q189 = (s.deliveryStatus === 'completed' && s.deliveredBottles !== undefined) ? Number(s.deliveredBottles) : Number(s.orderBottles189L || 0);
    const p189 = Number(s.price189L ?? 15);
    const pPacks = (Number(s.orderPack350ml || 0) * Number(s.price350ml ?? 35)) +
                   (Number(s.orderPack600ml || 0) * Number(s.price600ml ?? 35)) +
                   (Number(s.orderPack1500ml || 0) * Number(s.price1500ml ?? 35));
    return sum + (q189 * p189) + pPacks;
  }, 0);

  currentRouteStats = {
    distanceKm: Number(totalDistKm.toFixed(1)),
    durationMin: totalDurationMin,
    fuelCost,
    totalBottles189L,
    totalPacks,
    totalRevenue
  };

  const totalStops = currentOrderedStops.length;
  const doneStops = currentOrderedStops.filter(s => s.deliveryStatus === 'completed').length;
  const stopProgressPct = totalStops > 0 ? Math.round((doneStops / totalStops) * 100) : 0;

  const kpiStopsEl = document.getElementById('tmsKpiStops');
  if (kpiStopsEl) kpiStopsEl.textContent = `${totalStops} ร้าน${doneStops > 0 ? ` (ส่งแล้ว ${doneStops})` : ''}`;
  
  const progBar = document.getElementById('tmsProgressBar');
  if (progBar) progBar.style.width = `${stopProgressPct}%`;
  
  const progText = document.getElementById('tmsProgressText');
  if (progText) progText.textContent = totalStops > 0 ? `ส่งแล้ว ${doneStops}/${totalStops} ร้าน (${stopProgressPct}%)` : 'ส่งแล้ว 0/0 ร้าน';

  // Highlight 3-Step Guide banners depending on current state
  const step1 = document.getElementById('tmsStep1');
  const step2 = document.getElementById('tmsStep2');
  const step3 = document.getElementById('tmsStep3');
  if (step1 && step2 && step3) {
    if (totalStops === 0) {
      step1.className = 'rounded-lg border px-2.5 py-1.5 flex items-center gap-2 bg-sky-50 border-sky-300 text-sky-900 font-semibold shadow-xs';
      step2.className = 'rounded-lg border px-2.5 py-1.5 flex items-center gap-2 bg-slate-50 border-slate-200 text-slate-400';
      step3.className = 'rounded-lg border px-2.5 py-1.5 flex items-center gap-2 bg-slate-50 border-slate-200 text-slate-400';
    } else if (doneStops < totalStops) {
      step1.className = 'rounded-lg border px-2.5 py-1.5 flex items-center gap-2 bg-slate-50 border-slate-200 text-slate-600';
      step2.className = 'rounded-lg border px-2.5 py-1.5 flex items-center gap-2 bg-amber-50 border-amber-300 text-amber-900 font-semibold shadow-xs';
      step3.className = 'rounded-lg border px-2.5 py-1.5 flex items-center gap-2 bg-slate-50 border-slate-200 text-slate-400';
    } else {
      step1.className = 'rounded-lg border px-2.5 py-1.5 flex items-center gap-2 bg-slate-50 border-slate-200 text-slate-600';
      step2.className = 'rounded-lg border px-2.5 py-1.5 flex items-center gap-2 bg-slate-50 border-slate-200 text-slate-600';
      step3.className = 'rounded-lg border px-2.5 py-1.5 flex items-center gap-2 bg-emerald-50 border-emerald-300 text-emerald-900 font-bold shadow-xs';
    }
  }

  document.getElementById('tmsKpiDistance').textContent = `${totalDistKm.toFixed(1)} กม.`;
  document.getElementById('tmsKpiRouteMode').textContent = usedOsrm ? '✓ คำนวณตามเส้นทางถนนจริง (OSRM)' : 'คำนวณระยะทางพิกัด GPS';
  document.getElementById('tmsKpiDuration').textContent = `${totalDurationMin} นาที`;
  document.getElementById('tmsKpiFuel').textContent = `฿${fuelCost.toLocaleString()}`;
  const driverSel = document.getElementById('driverSelect');
  const driverObj = (appData.employees || []).find(e => e.id === (driverSel?.value || currentDeliveryDriverId));
  const driverName = driverObj ? driverObj.name : 'นายสุนัน ต๊ะนา';
  const fuelPlate = vehicle ? vehicle.plate : 'ผอ-4568 ชลบุรี';
  document.getElementById('tmsKpiFuelDetail').textContent = `ใช้น้ำมัน ~${litersUsed.toFixed(1)} ลิตร (${fuelPlate}) • ผู้ส่ง: ${driverName}`;
  document.getElementById('tmsKpiLoad').textContent = `${totalBottles189L} ถัง / ${totalPacks} แพ็ค`;

  // Update Capacity Bar & Warning
  const capBar = document.getElementById('tmsCapacityProgressBar');
  const capEl = document.getElementById('tmsKpiCapacityWarn');
  const maxCap = Number(vehicle?.maxBottles189L || 100);
  const capPct = Math.min(100, Math.round((totalBottles189L / maxCap) * 100));

  if (capBar) {
    capBar.style.width = `${capPct}%`;
    if (totalBottles189L > maxCap) {
      capBar.className = 'bg-rose-500 h-full rounded-full transition-all duration-300';
    } else if (capPct >= 85) {
      capBar.className = 'bg-amber-500 h-full rounded-full transition-all duration-300';
    } else {
      capBar.className = 'bg-emerald-500 h-full rounded-full transition-all duration-300';
    }
  }

  if (capEl) {
    if (totalBottles189L > maxCap) {
      capEl.textContent = `⚠️ เกินจุรถ (+${totalBottles189L - maxCap} ถัง)`;
      capEl.className = 'text-[10px] text-rose-600 font-bold mt-0.5 truncate';
    } else if (capPct >= 85) {
      capEl.textContent = `⚡ เกือบเต็ม (${totalBottles189L}/${maxCap} ถัง - ${capPct}%)`;
      capEl.className = 'text-[10px] text-amber-700 font-semibold mt-0.5 truncate';
    } else {
      capEl.textContent = `✓ ปลอดภัย (${totalBottles189L}/${maxCap} ถัง - ${capPct}%)`;
      capEl.className = 'text-[10px] text-emerald-700 font-medium mt-0.5 truncate';
    }
  }

  document.getElementById('tmsKpiRevenue').textContent = `฿${totalRevenue.toLocaleString()}`;
  document.getElementById('tmsKpiNetProfit').textContent = `เหลือหลังหักน้ำมัน ฿${(totalRevenue - fuelCost).toLocaleString()}`;

  renderOrderedStopsCards(legDistancesKm);
}

function renderOrderedStopsCards(legDistancesKm) {
  const listEl = document.getElementById('orderedStopsList');
  const badgeCount = document.getElementById('badgeTmsInRouteCount');
  if (badgeCount) badgeCount.textContent = `${currentOrderedStops.length} ร้าน`;

  let cumulativeKm = 0;

  if (currentOrderedStops.length === 0) {
    listEl.innerHTML = `
      <div class="p-8 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200 space-y-2">
        <div class="text-3xl">🚚</div>
        <div class="font-bold text-slate-700 text-sm">ไม่มีร้านที่ต้องไปส่งน้ำในขณะนี้</div>
        <p class="text-[11px] text-slate-500 max-w-xs mx-auto">เมื่อมีใบสั่งซื้อใหม่จากหน้า "สั่งน้ำดื่ม" ร้านค้าจะปรากฏในรายการนี้อัตโนมัติ</p>
        <button type="button" onclick="switchTab('orders')" class="mt-2 text-xs bg-sky-600 hover:bg-sky-700 text-white font-bold px-3.5 py-2 rounded-xl transition inline-flex items-center gap-1.5 shadow-sm">
          <span>🛒</span> ไปหน้าสั่งน้ำดื่ม
        </button>
      </div>`;
  } else {
    listEl.innerHTML = currentOrderedStops.map((stop, idx) => {
      const legKm = legDistancesKm[idx] || 0;
      cumulativeKm += legKm;
      const singleNavUrl = `https://www.google.com/maps/dir/?api=1&destination=${stop.lat},${stop.lng}&travelmode=driving`;
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
        orderPillHtml = pendingOrders.map(o => `
          <span class="inline-flex items-center gap-1 bg-amber-50 text-amber-900 border border-amber-300 px-1.5 py-0.5 rounded text-[10px] font-bold" title="ออเดอร์รอจัดส่ง">
            📋 ${o.orderId}
          </span>
        `).join(' ');
      } else if (isDone) {
        orderPillHtml = `
          <span class="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 border border-emerald-300 px-1.5 py-0.5 rounded text-[10px] font-bold">
            ✓ ปิดงานออเดอร์แล้ว
          </span>
        `;
      } else {
        orderPillHtml = `
          <span class="text-[10px] text-slate-400">ไม่มีเลขออเดอร์ค้าง</span>
        `;
      }

      return `
        <div class="p-3 rounded-xl border ${isDone ? 'bg-emerald-50/80 border-emerald-300 shadow-xs' : 'bg-white hover:bg-slate-50/70 border-slate-200 shadow-xs'} transition flex flex-col gap-2">
          <!-- Card Header -->
          <div class="flex items-start justify-between gap-2">
            <div class="flex items-start gap-2.5 min-w-0">
              <span class="w-7 h-7 rounded-xl ${isDone ? 'bg-emerald-600' : 'bg-sky-600'} text-white font-black text-xs flex items-center justify-center shrink-0 shadow-xs">
                ${isDone ? '✓' : idx + 1}
              </span>
              <div class="min-w-0">
                <div class="font-bold text-slate-800 text-xs flex items-center gap-1.5 flex-wrap">
                  <span class="truncate">${stop.name}</span>
                  <span class="bg-slate-100 text-slate-700 text-[10px] px-1.5 py-0.2 rounded font-medium border border-slate-200">${stop.zone || 'ทั่วไป'}</span>
                  ${isDone ? '<span class="bg-emerald-600 text-white text-[10px] px-2 py-0.5 rounded-full font-bold shadow-xs">✓ ส่งเรียบร้อย</span>' : ''}
                </div>
                <div class="flex items-center gap-1.5 mt-1 flex-wrap">
                  ${orderPillHtml}
                </div>
                <div class="text-[11px] text-slate-500 flex items-center gap-2 mt-1 flex-wrap">
                  ${stop.phone ? `<a href="tel:${stop.phone}" class="text-sky-700 hover:underline font-mono font-medium inline-flex items-center gap-0.5">📞 ${stop.phone}</a>` : '<span class="text-slate-400">ไม่มีเบอร์โทร</span>'}
                  <span class="text-slate-300">•</span>
                  <span class="text-slate-600 truncate max-w-[220px]" title="${stop.address || '-'}">${stop.address || '-'}</span>
                </div>
              </div>
            </div>

            <!-- Up / Down / Remove Controls -->
            <div class="flex items-center gap-0.5 shrink-0">
              <button type="button" onclick="moveStopOrder(${idx}, -1)" title="เลื่อนขึ้น" class="w-6 h-6 flex items-center justify-center text-xs bg-white border border-slate-200 rounded hover:bg-slate-100 text-slate-600 font-bold transition">↑</button>
              <button type="button" onclick="moveStopOrder(${idx}, 1)" title="เลื่อนลง" class="w-6 h-6 flex items-center justify-center text-xs bg-white border border-slate-200 rounded hover:bg-slate-100 text-slate-600 font-bold transition">↓</button>
              <button type="button" onclick="toggleCustomerInRoute('${stop.id}', false)" title="นำออกจากสายส่งวันนี้" class="w-6 h-6 flex items-center justify-center text-xs bg-white border border-rose-200 rounded hover:bg-rose-50 text-rose-600 font-bold transition">✕</button>
            </div>
          </div>

          <!-- Product Badges & Stats Row -->
          <div class="flex flex-wrap items-center justify-between gap-1.5 bg-slate-50/80 p-2 rounded-lg border border-slate-200/80 text-[11px]">
            <div class="flex flex-wrap items-center gap-1.5 font-semibold">
              <span class="bg-sky-100 text-sky-800 px-2 py-0.5 rounded text-[11px]">ถัง 18.9L: <b>${q189}</b> ถัง</span>
              ${q350 > 0 ? `<span class="bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded text-[10px]">350ml: <b>${q350}</b></span>` : ''}
              ${q600 > 0 ? `<span class="bg-blue-100 text-blue-900 px-1.5 py-0.5 rounded text-[10px]">600ml: <b>${q600}</b></span>` : ''}
              ${q1500 > 0 ? `<span class="bg-indigo-100 text-indigo-900 px-1.5 py-0.5 rounded text-[10px]">1.5L: <b>${q1500}</b></span>` : ''}
            </div>
            <div class="flex items-center gap-2 text-[10px] text-slate-500 font-medium">
              <span>ถังค้างเดิม: <b class="text-amber-700">${stop.OutstandingBottles || 0} ใบ</b></span>
              <span class="text-sky-700 font-bold">+${legKm.toFixed(1)} กม.</span>
            </div>
          </div>

          <!-- Action Buttons Row -->
          <div class="grid grid-cols-2 gap-2 pt-0.5">
            <a href="${singleNavUrl}" target="_blank" class="bg-white hover:bg-sky-50 text-sky-700 border border-sky-300 font-bold text-xs py-1.5 px-2 rounded-lg text-center transition flex items-center justify-center gap-1 shadow-xs">
              <span>🧭</span> นำทาง GPS
            </a>
            <button type="button" onclick="openCheckinModal('${stop.id}')" class="${isDone ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-emerald-500 hover:bg-emerald-600 text-slate-950'} font-bold text-xs py-1.5 px-2 rounded-lg transition flex items-center justify-center gap-1 shadow-xs">
              <span>${isDone ? '✓' : '📦'}</span> <span>${isDone ? `ส่ง ${stop.deliveredBottles || q189} / คืน ${stop.returnedBottles || 0} (แก้ไข)` : '✅ ส่งสำเร็จ'}</span>
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  populateTmsAddCustomerDropdown();
}

function setTmsQueueTab() {
  // Tabs removed for simplicity
}

function setTmsQueueTab(tabName) {
  const btnInRoute = document.getElementById('btnTmsTabInRoute');
  const btnStandby = document.getElementById('btnTmsTabStandby');
  const cInRoute = document.getElementById('tmsInRouteContainer');
  const cStandby = document.getElementById('tmsStandbyContainer');

  if (tabName === 'inRoute') {
    if (btnInRoute) btnInRoute.className = 'px-2.5 py-1 rounded-lg text-xs font-bold transition bg-white text-sky-800 shadow-xs flex items-center gap-1';
    if (btnStandby) btnStandby.className = 'px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 transition flex items-center gap-1';
    if (cInRoute) cInRoute.classList.remove('hidden');
    if (cStandby) cStandby.classList.add('hidden');
  } else {
    if (btnInRoute) btnInRoute.className = 'px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-600 hover:text-slate-900 transition flex items-center gap-1';
    if (btnStandby) btnStandby.className = 'px-2.5 py-1 rounded-lg text-xs font-bold transition bg-white text-sky-800 shadow-xs flex items-center gap-1';
    if (cInRoute) cInRoute.classList.add('hidden');
    if (cStandby) cStandby.classList.remove('hidden');
  }
}

function toggleSavedTripsAccordion() {
  const content = document.getElementById('savedTripsContent');
  const icon = document.getElementById('savedTripsToggleIcon');
  if (!content) return;
  const isHidden = content.classList.contains('hidden');
  if (isHidden) {
    content.classList.remove('hidden');
    if (icon) icon.textContent = '▴ ซ่อน';
  } else {
    content.classList.add('hidden');
    if (icon) icon.textContent = '▾ แสดง';
  }
}

function populateTmsZoneFilterDropdown() {
  const sel = document.getElementById('tmsZoneFilterSelect');
  if (!sel || !appData || !Array.isArray(appData.customers)) return;
  const currentVal = sel.value;
  const zones = Array.from(new Set(appData.customers.map(c => c.zone).filter(Boolean)));
  sel.innerHTML = '<option value="ALL">โซนทั้งหมด</option>' + zones.map(z => `<option value="${z}">${z}</option>`).join('');
  if (zones.includes(currentVal)) {
    sel.value = currentVal;
  }
}

function filterTmsCustomersList() {
  const search = (document.getElementById('tmsCustomerSearchInput')?.value || '').trim().toLowerCase();
  const zone = document.getElementById('tmsZoneFilterSelect')?.value || 'ALL';

  // Filter cards
  const inRouteCards = document.querySelectorAll('#orderedStopsList > div');
  inRouteCards.forEach(card => {
    const text = card.textContent.toLowerCase();
    const matchSearch = !search || text.includes(search);
    const matchZone = zone === 'ALL' || text.includes(zone.toLowerCase());
    card.style.display = (matchSearch && matchZone) ? '' : 'none';
  });
}


// Open full multi-stop route in Google Maps Navigation
function openFullRouteInGoogleMaps() {
  if (!appData || currentOrderedStops.length === 0) return;
  const f = appData.factory;
  const returnToFactory = document.getElementById('returnToFactoryChk')?.checked ?? true;
  const origin = `${f.lat},${f.lng}`;
  const destination = returnToFactory
    ? `${f.lat},${f.lng}`
    : `${currentOrderedStops[currentOrderedStops.length - 1].lat},${currentOrderedStops[currentOrderedStops.length - 1].lng}`;

  const waypointsList = returnToFactory
    ? currentOrderedStops.map(s => `${s.lat},${s.lng}`)
    : currentOrderedStops.slice(0, -1).map(s => `${s.lat},${s.lng}`);

  const waypointsParam = waypointsList.length > 0 ? `&waypoints=${encodeURIComponent(waypointsList.join('|'))}` : '';
  const url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}${waypointsParam}&travelmode=driving`;
  window.open(url, '_blank');
}

async function saveCurrentTripRecord() {
  if (currentOrderedStops.length === 0) {
    alert('⚠️ ไม่มีจุดส่งในสายส่ง');
    return;
  }
  const vehId = document.getElementById('vehicleSelect').value;
  const vehicle = appData.vehicles.find(v => v.id === vehId) || appData.vehicles[0];

  const uncompletedStops = currentOrderedStops.filter(s => s.deliveryStatus !== 'completed');
  if (uncompletedStops.length > 0) {
    const conf = confirm(`⚠️ ยังมีอีก ${uncompletedStops.length} จุดส่งที่ยังไม่ได้กดยืนยันส่งสำเร็จทีละร้าน\nต้องการปิดสายส่งเลยหรือไม่?\n(ระบบจะบันทึกใบคุมสายส่ง, ตัดค่าน้ำมัน ฿${currentRouteStats.fuelCost.toLocaleString()} และอัปเดตออเดอร์ทั้งหมดในสายนี้เป็น "จัดส่งสำเร็จแล้ว")`);
    if (!conf) return;
  } else {
    const conf = confirm(`🏁 ยืนยันปิดสายส่งวันนี้?\n(ระบบจะบันทึกใบคุมสายส่ง ตัดค่าน้ำมัน ฿${currentRouteStats.fuelCost.toLocaleString()} เข้าบัญชีค่าใช้จ่าย และล้างสายส่งวันนี้)`);
    if (!conf) return;
  }

  const driverSel = document.getElementById('driverSelect');
  const driverObj = (appData.employees || []).find(e => e.id === (driverSel?.value || currentDeliveryDriverId)) || { id: 'EMP-02', name: 'นายสุนัน ต๊ะนา' };

  const tripPayload = {
    tripId: 'TRIP-' + new Date().toISOString().slice(2, 10).replace(/-/g, '') + '-' + String((appData.savedTrips?.length || 0) + 1).padStart(2, '0'),
    date: new Date().toISOString().slice(0, 10),
    time: new Date().toTimeString().slice(0, 5),
    vehicleId: vehicle.id,
    vehiclePlate: vehicle.plate,
    vehicleName: `${vehicle.plate} (ผู้ส่ง: ${driverObj.name})`,
    vehicleAssetId: vehicle.assetId || 'AST-VEH-001',
    driverId: driverObj.id,
    driverName: driverObj.name,
    stopsCount: currentOrderedStops.length,
    totalDistanceKm: currentRouteStats.distanceKm,
    estimatedTimeMin: currentRouteStats.durationMin,
    estimatedFuelCost: currentRouteStats.fuelCost,
    totalBottles189L: currentRouteStats.totalBottles189L,
    totalPacks: currentRouteStats.totalPacks,
    totalRevenue: currentRouteStats.totalRevenue,
    status: 'บันทึกสายส่ง & ตัดค่าน้ำมันแล้ว',
    stopCustomerIds: currentOrderedStops.map(s => s.id)
  };

  const res = await fetch('/api/trips', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(tripPayload)
  });
  const out = await res.json();
  if (out.ok) {
    appData = out.data;
    // Clear route sequence and reset selected stops when trip is completed & saved
    currentOrderedStops = [];
    if (appData && Array.isArray(appData.customers)) {
      appData.customers.forEach(c => { c.selectedForRoute = false; });
    }
    recalculateCurrentRoute();
    renderAllViews();
    alert(`🏁 ปิดสายส่งเรียบร้อยแล้ว!\n• บันทึกใบคุมสายส่ง: ${tripPayload.tripId}\n• อัปเดตออเดอร์ทั้งหมดเป็น "จัดส่งสำเร็จแล้ว"\n• บันทึกตัดค่าน้ำมัน ฿${tripPayload.estimatedFuelCost.toLocaleString()}`);
  }
}

function setSavedTripsFilterToday() {
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


function getOrderUnpaidAmount(o) {
  if (!o || o.orderStatus !== 'จัดส่งสำเร็จแล้ว') return 0;
  if (o.unpaidAmount !== undefined) return Number(o.unpaidAmount || 0);
  if (o.paymentStatus === 'ชำระแล้ว') return 0;

  const tr = (appData?.savedTrips || []).find(t => (o.orderId && t.orderId === o.orderId) || (o.customerId && t.customerId === o.customerId && t.date === o.deliveryDate));
  if (tr && tr.unpaidAmount !== undefined) return Number(tr.unpaidAmount || 0);

  if (o.paymentMode === 'credit') return Number(o.totalAmount || 0);
  if (o.moneyCollected !== undefined) return Math.max(0, Number(o.totalAmount || 0) - Number(o.moneyCollected));

  return 0;
}

function getTripUnpaidAmount(t) {
  if (!t) return 0;
  if (t.unpaidAmount !== undefined) return Number(t.unpaidAmount || 0);
  if (t.paymentStatus === 'ชำระแล้ว') return 0;
  if (t.paymentMode === 'credit') return Number(t.totalRevenue || 0);
  if (t.moneyCollected !== undefined) return Math.max(0, Number(t.totalRevenue || 0) - Number(t.moneyCollected));
  return 0;
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
      countBadge.textContent = `${filteredTrips.length} รายการ (วันนี้)`;
      countBadge.className = 'bg-emerald-100 text-emerald-800 text-xs font-bold px-2.5 py-0.5 rounded-full';
    } else if (selectedDate) {
      countBadge.textContent = `${filteredTrips.length} รายการ (${selectedDate})`;
      countBadge.className = 'bg-sky-100 text-sky-800 text-xs font-bold px-2.5 py-0.5 rounded-full';
    } else {
      countBadge.textContent = `${filteredTrips.length} รายการ (ทั้งหมด)`;
      countBadge.className = 'bg-slate-100 text-slate-700 text-xs font-bold px-2.5 py-0.5 rounded-full';
    }
  }

    // Calculate summary values including Collected & Unpaid
  const totalBottles = filteredTrips.reduce((s, t) => s + Number(t.totalBottles189L || 0), 0);
  const totalPacks = filteredTrips.reduce((s, t) => s + Number(t.totalPacks || 0), 0);
  const totalRevenue = filteredTrips.reduce((s, t) => s + Number(t.totalRevenue || 0), 0);
  const totalCollected = filteredTrips.reduce((s, t) => {
    const col = t.moneyCollected !== undefined ? Number(t.moneyCollected) : (t.paymentMode === 'credit' ? 0 : Number(t.totalRevenue || 0));
    return s + col;
  }, 0);
  const totalUnpaid = filteredTrips.reduce((s, t) => s + getTripUnpaidAmount(t), 0);

  // Render Daily Summary Cards for Selected Date
  if (summaryEl) {
    summaryEl.innerHTML = `
      <div class="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
        <div class="bg-white border border-slate-200 rounded-lg p-2.5 shadow-2xs">
          <div class="text-[10px] text-slate-500 font-medium">งานปิดแล้ว</div>
          <div class="font-black text-slate-800 text-sm mt-0.5">${filteredTrips.length} รายการ</div>
        </div>
        <div class="bg-white border border-slate-200 rounded-lg p-2.5 shadow-2xs">
          <div class="text-[10px] text-sky-700 font-medium">ส่งสำเร็จรวม</div>
          <div class="font-black text-sky-900 text-sm mt-0.5">${totalBottles} ถัง / ${totalPacks} แพ็ค</div>
        </div>
        <div class="bg-white border border-slate-200 rounded-lg p-2.5 shadow-2xs">
          <div class="text-[10px] text-slate-700 font-medium">ยอดเงินรวม</div>
          <div class="font-black text-slate-900 text-sm mt-0.5">฿${totalRevenue.toLocaleString()}</div>
        </div>
        <div class="bg-white border border-emerald-200 bg-emerald-50/30 rounded-lg p-2.5 shadow-2xs">
          <div class="text-[10px] text-emerald-800 font-bold">รับเงินสด/โอนแล้ว</div>
          <div class="font-black text-emerald-900 text-sm mt-0.5">฿${totalCollected.toLocaleString()}</div>
        </div>
        <div class="bg-white border ${totalUnpaid > 0 ? 'border-amber-300 bg-amber-50/50' : 'border-slate-200'} rounded-lg p-2.5 shadow-2xs">
          <div class="text-[10px] ${totalUnpaid > 0 ? 'text-amber-900 font-bold' : 'text-slate-500'}">ยอดค้างชำระ/เครดิต</div>
          <div class="font-black ${totalUnpaid > 0 ? 'text-amber-900' : 'text-slate-700'} text-sm mt-0.5">฿${totalUnpaid.toLocaleString()}</div>
        </div>
      </div>
    `;
  }

  tbody.innerHTML = filteredTrips.map(t => {
    const timeDisplay = t.time ? `<span class="text-[10px] text-slate-400 block font-normal">🕒 ${t.time}</span>` : '';
    const orderIdDisplay = t.orderId ? `<span class="bg-sky-50 text-sky-800 border border-sky-200 px-1.5 py-0.2 rounded text-[10px] font-mono font-bold block mt-0.5 max-w-fit">📋 ${t.orderId}</span>` : '';
    
    const tot = Number(t.totalRevenue || 0);
    const unp = getTripUnpaidAmount(t);
    const col = Number(t.moneyCollected !== undefined ? t.moneyCollected : (tot - unp));
    const isCred = (t.paymentMode === 'credit');

    let paymentBadge = '';
    if (unp > 0) {
      paymentBadge = `
        <div class="leading-tight">
          <span class="bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-full font-bold text-[10px] inline-block shadow-2xs">
            ${isCred ? '💳 เครดิต' : '⚠️ ค้างชำระ'} ฿${unp.toLocaleString()}
          </span>
          ${col > 0 ? `<div class="text-[10px] text-emerald-700 font-medium mt-0.5">รับเงิน ฿${col.toLocaleString()}</div>` : ''}
        </div>
      `;
    } else {
      paymentBadge = `
        <span class="bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-full font-bold text-[10px] inline-block">
          ✓ จ่ายครบ ฿${col.toLocaleString()}
        </span>
      `;
    }

    return `
      <tr class="hover:bg-slate-50 transition">
        <td class="p-2.5 font-mono font-bold text-sky-700 text-xs">
          ${t.tripId}
          ${orderIdDisplay}
        </td>
        <td class="p-2.5 font-medium text-slate-700">
          ${t.date}
          ${timeDisplay}
        </td>
        <td class="p-2.5 font-semibold text-slate-800">
          <div>${t.customerName || t.vehiclePlate || t.vehicleName}</div>
          <div class="text-[11px] text-slate-500 font-normal flex items-center gap-1.5 flex-wrap mt-0.5">
            ${t.vehiclePlate ? `<span class="bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded font-mono text-[10px] font-bold">🚚 ${t.vehiclePlate}</span>` : ''}
            ${t.vehicleAssetId ? `<span class="bg-indigo-50 text-indigo-700 border border-indigo-200 px-1 py-0.2 rounded font-mono text-[10px] font-bold">🔗 ${t.vehicleAssetId}</span>` : ''}
            ${t.driverName ? `<span class="bg-sky-50 text-sky-800 border border-sky-200 px-1.5 py-0.2 rounded text-[10px] font-medium">👤 ${t.driverName}</span>` : ''}
          </div>
        </td>
        <td class="p-2.5 text-center font-bold text-slate-700">${t.stopsCount} จุด</td>
        <td class="p-2.5 text-right font-medium text-slate-600">${Number(t.totalDistanceKm || 0).toFixed(1)} กม.</td>
        <td class="p-2.5 text-right font-semibold text-slate-800">
          <span class="text-sky-800">${t.totalBottles189L || 0} ถัง</span> / <span class="text-amber-800">${t.totalPacks || 0} แพ็ค</span>
        </td>
        <td class="p-2.5 text-right font-black text-slate-900">฿${tot.toLocaleString()}</td>
        <td class="p-2.5 text-center">
          ${paymentBadge}
        </td>
        <td class="p-2.5 text-center">
          <span class="bg-emerald-100 text-emerald-800 text-[11px] font-bold px-2.5 py-0.5 rounded-full shadow-2xs">${t.status || 'ส่งสำเร็จ'}</span>
        </td>
        <td class="p-2.5 text-center whitespace-nowrap">
          <button type="button" onclick="openOrderSlipFromTrip('${t.tripId}')" class="bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 font-bold px-2.5 py-1 rounded text-xs transition shadow-2xs inline-flex items-center gap-1" title="ดูบิลและพิมพ์ใบส่งของ">
            <span>📄</span> <span>ดูบิล</span>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// ==========================================
// 2. ROLE-BASED CUSTOM DASHBOARD (DIFFERENT PER LEVEL)
// ==========================================
function renderDashboard() {
  if (!appData) return;
  const role = currentUser?.role || 'executive';
  const fg189 = appData.inventory.find(i => i.sku === 'FG-189L')?.stock || 0;
  const fg350 = appData.inventory.find(i => i.sku === 'FG-350ML')?.stock || 0;
  const fg600 = appData.inventory.find(i => i.sku === 'FG-600ML')?.stock || 0;
  const fg1500 = appData.inventory.find(i => i.sku === 'FG-1500ML')?.stock || 0;
  const empty189 = appData.inventory.find(i => i.sku === 'RET-189L-EMPTY')?.stock || 0;
  const totalOutBottles = appData.customers.reduce((s, c) => s + Number(c.OutstandingBottles || 0), 0);
  const dueMachines = appData.machines.filter(m => m.status !== 'normal');
  const totalExpenses = appData.expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const totalTripRev = appData.savedTrips.reduce((s, t) => s + Number(t.totalRevenue || 0), 0) + currentRouteStats.totalRevenue;
  const latestLot = appData.productionLots[0] || {};

  const badgeEl = document.getElementById('dashboardRoleBadge');
  const titleEl = document.getElementById('dashboardTitleText');
  const subEl = document.getElementById('dashboardSubtitleText');
  const btnEl = document.getElementById('dashboardActionButtons');
  const grid = document.getElementById('dashboardKpiGrid');
  const panels = document.getElementById('dashboardCustomPanels');

  const lineFlowHtml = `
    <div class="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
      <h3 class="font-bold text-slate-800 mb-3">🌊 สถานะสายการผลิตน้ำดื่มอินธารา (Real-time Line Status ตามมาตรฐาน อย.)</h3>
      <div class="grid grid-cols-1 md:grid-cols-6 gap-3 text-xs">
        <div class="bg-sky-50 border border-sky-200 rounded-xl p-3">
          <div class="font-bold text-sky-800 mb-1">สูบน้ำดิบบาดาล</div>
          <p class="text-slate-600">ITR-SP-001 (1.5 HP)</p>
          <p class="mt-2 text-emerald-700 font-semibold">● ปกติ (ถังน้ำดิบเต็ม)</p>
        </div>
        <div class="bg-teal-50 border border-teal-200 rounded-xl p-3">
          <div class="font-bold text-teal-800 mb-1">กรอง Pre-treatment</div>
          <p class="text-slate-600">ITR-MP-001 + ถังกรองแมงกานีส/คาร์บอน/เรซิน</p>
          <p class="mt-2 text-amber-700 font-semibold">▲ เตือนล้างเรซินด้วยเกลือ</p>
        </div>
        <div class="bg-amber-50 border border-amber-200 rounded-xl p-3">
          <div class="font-bold text-amber-800 mb-1">ระบบกรองหลัก RO</div>
          <p class="text-slate-600">ITR-RO-001 (2,000 L/ชม.)</p>
          <p class="mt-2 text-emerald-700 font-semibold">● TDS น้ำดี ${latestLot.tdsRo || 7.8} ppm</p>
        </div>
        <div class="bg-purple-50 border border-purple-200 rounded-xl p-3">
          <div class="font-bold text-purple-800 mb-1">กรอง 5u & ฆ่าเชื้อ UV</div>
          <p class="text-slate-600">ITR-MP-003 + ITR-UV-001</p>
          <p class="mt-2 text-emerald-700 font-semibold">● หลอด UV ปกติ</p>
        </div>
        <div class="bg-indigo-50 border border-indigo-200 rounded-xl p-3">
          <div class="font-bold text-indigo-800 mb-1">ล้างและบรรจุปิดฝา</div>
          <p class="text-slate-600">ITR-WE/WI/WB + CS-001/002</p>
          <p class="mt-2 text-emerald-700 font-semibold">● เดินสายถัง 18.9L & ขวด</p>
        </div>
        <div class="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
          <div class="font-bold text-emerald-800 mb-1">คลังสินค้า & จัดส่ง GPS</div>
          <p class="text-slate-600">ผ่าน QC เช็ครอยรั่ว/ฉลาก</p>
          <p class="mt-2 text-emerald-700 font-semibold">● พร้อมจัดส่งตามสาย</p>
        </div>
      </div>
    </div>
  `;

  if (role === 'executive') {
    badgeEl.textContent = '👑 ระดับที่ 1: แดชบอร์ดผู้บริหารสูงสุด (Full Executive View)';
    badgeEl.className = 'inline-flex items-center gap-1.5 bg-indigo-100 text-indigo-800 text-xs font-bold px-3 py-0.5 rounded-full mb-1';
    titleEl.textContent = '📊 แดชบอร์ดผู้บริหารสูงสุด — ภาพรวมธุรกิจ การเงิน การผลิต และขนส่งครบวงจร';
    subEl.textContent = 'แสดงผลกำไร-ขาดทุนสุทธิ, ต้นทุนการผลิต, สถานะเครื่องจักร 16 รายการ, สต็อกถังหมุนเวียน และสิทธิ์ความปลอดภัย';
    btnEl.innerHTML = `
      <button onclick="switchTab('customers')" class="bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold px-3 py-2 rounded-xl transition">👥 ทะเบียนลูกค้า</button>
      <button onclick="switchTab('orders')" class="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-2 rounded-xl transition">🛒 สั่งออเดอร์น้ำดื่ม</button>
      <button onclick="switchTab('tms')" class="bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium px-3 py-2 rounded-xl transition">🚚 วางแผนขนส่ง GPS</button>
      <button onclick="switchTab('production')" class="bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-3 py-2 rounded-xl transition">🏭 การผลิต & QC</button>
      <button onclick="switchTab('cmms')" class="bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold px-3 py-2 rounded-xl transition">🔧 ซ่อมบำรุง CMMS</button>
      <button onclick="switchTab('costing')" class="bg-rose-600 hover:bg-rose-700 text-white text-xs font-medium px-3.5 py-2 rounded-xl transition">💰 ค่าใช้จ่าย & ต้นทุน</button>
      <button onclick="switchTab('security')" class="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium px-3.5 py-2 rounded-xl transition">🛡️ รหัสผ่าน Excel</button>
    `;
    grid.innerHTML = `
      <div class="bg-gradient-to-br from-emerald-600 to-teal-700 text-white p-5 rounded-2xl shadow-sm">
        <div class="text-xs text-emerald-100">รายรับรวมสายส่ง vs ค่าใช้จ่ายสะสม</div>
        <div class="text-2xl font-bold mt-1">฿${totalTripRev.toLocaleString()}</div>
        <div class="text-xs text-emerald-100 mt-1">ค่าใช้จ่ายรวม: ฿${totalExpenses.toLocaleString()}</div>
      </div>
      <div class="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
        <div class="text-xs text-slate-500">สต็อกน้ำดื่มพร้อมจำหน่าย</div>
        <div class="text-2xl font-bold text-sky-700 mt-1">${fg189.toLocaleString()} ถัง</div>
        <div class="text-xs text-slate-500 mt-1">แพ็คขวด: ${(fg350 + fg600 + fg1500).toLocaleString()} แพ็ค</div>
      </div>
      <div class="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
        <div class="text-xs text-slate-500">ถังหมุนเวียน 18.9L ค้างที่ลูกค้า</div>
        <div class="text-2xl font-bold text-amber-600 mt-1">${totalOutBottles.toLocaleString()} ถัง</div>
        <div class="text-xs text-slate-500 mt-1">ถังเปล่ารอล้างในโรงงาน: ${empty189} ถัง</div>
      </div>
      <div class="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
        <div class="text-xs text-slate-500">ความพร้อมเครื่องจักร 16 เครื่อง</div>
        <div class="text-2xl font-bold text-rose-600 mt-1">${16 - dueMachines.length}/16 ปกติ</div>
        <div class="text-xs text-rose-600 mt-1">แจ้งเตือนถึงรอบ PM ${dueMachines.length} เครื่อง</div>
      </div>
    `;
    panels.innerHTML = lineFlowHtml;

  } else if (role === 'admin') {
    badgeEl.textContent = '🏢 ระดับที่ 2: แดชบอร์ดแอดมินโรงงาน & ฝ่ายวางแผนบัญชี';
    badgeEl.className = 'inline-flex items-center gap-1.5 bg-sky-100 text-sky-800 text-xs font-bold px-3 py-0.5 rounded-full mb-1';
    titleEl.textContent = '📋 แดชบอร์ดแอดมินสำนักงาน — การจัดสายส่ง สต็อกถังหมุนเวียน และบัญชีรายวัน';
    subEl.textContent = 'เน้นการบริหารคำสั่งซื้อลูกค้า การจัดรถขนส่ง GPS ยอดเงินค้างชำระ และทะเบียนคุมถังน้ำ 18.9 ลิตร';
    btnEl.innerHTML = `
      <button onclick="switchTab('customers')" class="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl shadow transition">👥 เพิ่ม/แก้ไขทะเบียนลูกค้า</button>
      <button onclick="switchTab('tms')" class="bg-sky-600 hover:bg-sky-700 text-white text-xs font-medium px-3.5 py-2 rounded-xl transition">🚚 จัดสายส่งน้ำ GPS วันนี้</button>
      <button onclick="switchTab('inventory')" class="bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-xs px-3.5 py-2 rounded-xl transition">🔄 ตรวจยอดถังค้างลูกค้า</button>
    `;
    const totalCredit = appData.customers.reduce((s, c) => s + Number(c.creditBalance || 0), 0);
    grid.innerHTML = `
      <div class="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
        <div class="text-xs text-slate-500">จุดส่งที่รอดำเนินการวันนี้</div>
        <div class="text-2xl font-bold text-sky-700 mt-1">${currentOrderedStops.length} ร้านค้า</div>
        <div class="text-xs text-slate-500 mt-1">ระยะทางรวม ${currentRouteStats.distanceKm} กม.</div>
      </div>
      <div class="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
        <div class="text-xs text-slate-500">ยอดขายสายส่งรอบนี้</div>
        <div class="text-2xl font-bold text-emerald-600 mt-1">฿${currentRouteStats.totalRevenue.toLocaleString()}</div>
        <div class="text-xs text-rose-600 mt-1">ค่าน้ำมันประเมิน ฿${currentRouteStats.fuelCost}</div>
      </div>
      <div class="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
        <div class="text-xs text-slate-500">ถังหมุนเวียน 18.9L ค้างที่ร้านค้า</div>
        <div class="text-2xl font-bold text-amber-600 mt-1">${totalOutBottles.toLocaleString()} ถัง</div>
        <div class="text-xs text-slate-500 mt-1">ยอดบิลเครดิตค้างชำระ: ฿${totalCredit.toLocaleString()}</div>
      </div>
      <div class="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
        <div class="text-xs text-slate-500">สต็อกพร้อมขึ้นรถส่ง</div>
        <div class="text-2xl font-bold text-indigo-700 mt-1">${fg189} ถัง</div>
        <div class="text-xs text-slate-500 mt-1">ขวดแพ็คพร้อมส่ง: ${fg350 + fg600 + fg1500} แพ็ค</div>
      </div>
    `;
    panels.innerHTML = lineFlowHtml;

  } else if (role === 'production_qc') {
    badgeEl.textContent = '🔬 ระดับที่ 3: แดชบอร์ดฝ่ายผลิต & ควบคุมคุณภาพน้ำ (Production & QC View)';
    badgeEl.className = 'inline-flex items-center gap-1.5 bg-emerald-100 text-emerald-800 text-xs font-bold px-3 py-0.5 rounded-full mb-1';
    titleEl.textContent = '🏭 แดชบอร์ดฝ่ายผลิตและควบคุมคุณภาพน้ำ (RO / UV / มอก. 257)';
    subEl.textContent = 'แสดงเฉพาะพารามิเตอร์คุณภาพน้ำดื่ม ยอดการผลิตรายกะ และสต็อกภาชนะบรรจุ (ซ่อนข้อมูลการเงินและบัญชี)';
    btnEl.innerHTML = `
      <button onclick="switchTab('production')" class="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium px-3.5 py-2 rounded-xl transition">+ บันทึกผลตรวจค่าน้ำ & ล็อตผลิต</button>
    `;
    grid.innerHTML = `
      <div class="bg-emerald-50 p-5 rounded-2xl shadow-sm border border-emerald-200">
        <div class="text-xs text-emerald-800">ค่าความบริสุทธิ์น้ำดี RO ล่าสุด (TDS)</div>
        <div class="text-2xl font-bold text-emerald-700 mt-1">${latestLot.tdsRo || 7.8} ppm</div>
        <div class="text-xs text-emerald-600 mt-1">น้ำดิบ ${latestLot.tdsRaw || 238} ppm • ค่า pH ${latestLot.phValue || 7.3}</div>
      </div>
      <div class="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
        <div class="text-xs text-slate-500">ยอดผลิตล็อตล่าสุด (${latestLot.lotNo || '-'})</div>
        <div class="text-2xl font-bold text-sky-700 mt-1">${latestLot.bottle18_9L || 420} ถัง</div>
        <div class="text-xs text-slate-500 mt-1">ขวดแพ็ค: ${(Number(latestLot.pack350ml || 0) + Number(latestLot.pack600ml || 0) + Number(latestLot.pack1500ml || 0))} แพ็ค</div>
      </div>
      <div class="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
        <div class="text-xs text-slate-500">ถังเปล่า 18.9L รอซักล้างและบรรจุ</div>
        <div class="text-2xl font-bold text-indigo-700 mt-1">${empty189.toLocaleString()} ถัง</div>
        <div class="text-xs text-slate-500 mt-1">ฝาถังคงเหลือ: ${(appData.inventory.find(i => i.sku === 'RM-CAP-189')?.stock || 0).toLocaleString()} ฝา</div>
      </div>
      <div class="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
        <div class="text-xs text-slate-500">แรงดันเครื่อง RO & หลอดฆ่าเชื้อ UV</div>
        <div class="text-2xl font-bold text-teal-700 mt-1">${latestLot.roPressurePsi || 148} PSI</div>
        <div class="text-xs text-emerald-600 mt-1">● หลอด UV-001 (36-40W) ปกติ</div>
      </div>
    `;
    panels.innerHTML = lineFlowHtml;

  } else if (role === 'technician') {
    badgeEl.textContent = '🔧 ระดับที่ 4: แดชบอร์ดช่างเทคนิคและซ่อมบำรุงเครื่องจักร (CMMS View)';
    badgeEl.className = 'inline-flex items-center gap-1.5 bg-amber-100 text-amber-800 text-xs font-bold px-3 py-0.5 rounded-full mb-1';
    titleEl.textContent = '🛠️ แดชบอร์ดวิศวกรรมซ่อมบำรุงเครื่องจักร 16 รายการ (Preventive Maintenance)';
    subEl.textContent = 'แสดงเฉพาะเครื่องจักรที่ถึงกำหนดล้างสารกรอง/เปลี่ยนไส้กรอง ชั่วโมงเดินเครื่องสะสม และสต็อกอะไหล่';
    btnEl.innerHTML = `
      <button onclick="switchTab('cmms')" class="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs px-3.5 py-2 rounded-xl transition">🔧 ไปหน้าบันทึกซ่อมบำรุง 16 เครื่อง</button>
    `;
    grid.innerHTML = `
      <div class="bg-rose-50 p-5 rounded-2xl shadow-sm border border-rose-200">
        <div class="text-xs text-rose-800">เครื่องจักรถึงกำหนด PM / เตือนตรวจเช็ค</div>
        <div class="text-2xl font-bold text-rose-600 mt-1">${dueMachines.length} เครื่อง</div>
        <div class="text-xs text-rose-700 mt-1">${dueMachines.map(m => m.code).join(', ') || 'ปกติครบทุกเครื่อง'}</div>
      </div>
      <div class="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
        <div class="text-xs text-slate-500">เครื่องจักรสถานะปกติพร้อมเดินสายผลิต</div>
        <div class="text-2xl font-bold text-emerald-600 mt-1">${16 - dueMachines.length} / 16 เครื่อง</div>
        <div class="text-xs text-slate-500 mt-1">กำลังไฟฟ้ารวม 11,956 W (~12 kW)</div>
      </div>
      <div class="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
        <div class="text-xs text-slate-500">สต็อกเกลือล้างเรซิน & ไส้กรอง 5u</div>
        <div class="text-2xl font-bold text-sky-700 mt-1">${appData.inventory.find(i => i.sku === 'RM-SALT')?.stock || 0} ถุง</div>
        <div class="text-xs text-slate-500 mt-1">ไส้กรอง PP 5 ไมครอน: ${appData.inventory.find(i => i.sku === 'RM-FILTER-5U')?.stock || 0} แท่ง</div>
      </div>
      <div class="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
        <div class="text-xs text-slate-500">ชั่วโมงสะสมหลอด UV (ITR-UV-001)</div>
        <div class="text-2xl font-bold text-purple-700 mt-1">${appData.machines.find(m => m.code === 'ITR-UV-001')?.runHours || 4200} ชม.</div>
        <div class="text-xs text-slate-500 mt-1">รอบเปลี่ยนหลอดที่ 8,000 ชม.</div>
      </div>
    `;
    panels.innerHTML = `
      <div class="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
        <h3 class="font-bold text-rose-700 mb-3">⚠️ รายการเครื่องจักรที่ต้องดำเนินการบำรุงรักษาด่วน (Action Required)</h3>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
          ${dueMachines.map(m => `
            <div class="p-3.5 rounded-xl border border-amber-300 bg-amber-50/70 flex flex-col justify-between gap-2">
              <div>
                <div class="font-mono font-bold text-rose-700">${m.code} — ${m.name}</div>
                <div class="text-slate-600 mt-1">ชั่วโมงสะสม: <b>${m.runHours} / ${m.pmIntervalHours} ชม.</b></div>
                <div class="text-sky-900 font-semibold mt-1">งานที่ต้องทำ: ${m.nextPmTask}</div>
              </div>
              <button onclick="openMaintenanceModal('${m.code}')" class="bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold py-1.5 px-3 rounded-lg text-center">
                🔧 บันทึกซ่อม/ล้างทันที
              </button>
            </div>
          `).join('')}
        </div>
      </div>
    `;

  } else if (role === 'driver') {
    badgeEl.textContent = '🚚 ระดับที่ 5: แดชบอร์ดพนักงานขับรถส่งน้ำ & นำทาง GPS (Driver View)';
    badgeEl.className = 'inline-flex items-center gap-1.5 bg-teal-100 text-teal-800 text-xs font-bold px-3 py-0.5 rounded-full mb-1';
    titleEl.textContent = '🧭 แดชบอร์ดภารกิจจัดส่งน้ำดื่มประจำวัน & นำทาง GPS';
    subEl.textContent = 'แสดงเฉพาะจำนวนจุดส่งวันนี้ ระยะทางรวม จำนวนน้ำขึ้นรถ และปุ่มกดนำทาง Google Maps (ปิดกั้นข้อมูลต้นทุนและงบการเงินโรงงาน)';
    btnEl.innerHTML = `
      <button onclick="openFullRouteInGoogleMaps()" class="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-4 py-2 rounded-xl shadow transition">🗺️ กดเปิดนำทาง Google Maps ทั้งสายทันที</button>
      <button onclick="switchTab('tms')" class="bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs px-4 py-2 rounded-xl shadow transition">📋 ดูแผนที่ & เช็คอินจุดส่ง</button>
    `;
    const doneStops = currentOrderedStops.filter(s => s.deliveryStatus === 'completed').length;
    grid.innerHTML = `
      <div class="bg-teal-600 text-white p-5 rounded-2xl shadow-sm">
        <div class="text-xs text-teal-100">ภารกิจจุดส่งน้ำวันนี้</div>
        <div class="text-2xl font-bold mt-1">${doneStops} / ${currentOrderedStops.length} จุด</div>
        <div class="text-xs text-teal-100 mt-1">ส่งสำเร็จแล้ว ${doneStops} ร้านค้า</div>
      </div>
      <div class="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
        <div class="text-xs text-slate-500">ระยะทางวิ่งรถและเวลาคาดการณ์</div>
        <div class="text-2xl font-bold text-sky-700 mt-1">${currentRouteStats.distanceKm} กม.</div>
        <div class="text-xs text-slate-500 mt-1">เวลาเดินทางรวม ~${currentRouteStats.durationMin} นาที</div>
      </div>
      <div class="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
        <div class="text-xs text-slate-500">จำนวนน้ำขึ้นรถรวมรอบนี้</div>
        <div class="text-2xl font-bold text-indigo-700 mt-1">${currentRouteStats.totalBottles189L} ถัง</div>
        <div class="text-xs text-slate-500 mt-1">ขวดแพ็ครวม: ${currentRouteStats.totalPacks} แพ็ค</div>
      </div>
      <div class="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
        <div class="text-xs text-slate-500">ถังเปล่าที่ต้องเก็บคืนจากร้านค้า</div>
        <div class="text-2xl font-bold text-amber-600 mt-1">${totalOutBottles} ถัง</div>
        <div class="text-xs text-slate-500 mt-1">กรุณาบันทึกยอดเก็บถังทุกจุดส่ง</div>
      </div>
    `;
    panels.innerHTML = `
      <div class="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
        <h3 class="font-bold text-slate-800 mb-3">📍 ลำดับจุดส่งน้ำดื่มของคุณในทริปนี้ (กดนำทาง GPS ได้ทันที)</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          ${currentOrderedStops.map((s, idx) => `
            <div class="p-3 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-between gap-2">
              <div>
                <div class="font-bold text-slate-800">จุดที่ ${idx + 1}: ${s.name}</div>
                <div class="text-slate-500">${s.address} • ส่ง ${s.orderBottles189L} ถัง / ${Number(s.orderPack350ml || 0) + Number(s.orderPack600ml || 0) + Number(s.orderPack1500ml || 0)} แพ็ค</div>
              </div>
              <div class="flex gap-1.5 shrink-0">
                <a href="https://www.google.com/maps/dir/?api=1&destination=${s.lat},${s.lng}&travelmode=driving" target="_blank" class="bg-sky-600 text-white px-3 py-1.5 rounded-lg font-semibold">🧭 นำทาง</a>
                <button onclick="openCheckinModal('${s.id}')" class="bg-emerald-500 text-slate-950 px-3 py-1.5 rounded-lg font-semibold">📦 ส่งน้ำ</button>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }
}

// ==========================================
// 3. PRODUCTION & QC (GMP)
// ==========================================
// ==========================================
// 3. PRODUCTION & QC (e-GMP LOGBOOK)
// ==========================================
function generateAndSetAutoLotNo() {
  const dateInput = document.getElementById('prodDate');
  const lotInput = document.getElementById('prodLotNo');
  if (!dateInput || !lotInput) return;
  if (!dateInput.value) {
    dateInput.value = new Date().toISOString().split('T')[0];
  }
  const d = new Date(dateInput.value);
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const prefix = `LOT-${yy}${mm}${dd}-`;

  const existingLotNos = new Set((appData?.productionLots || []).map(l => (l.lotNo || '').trim()));
  let counter = 1;
  let candidate = `${prefix}${String(counter).padStart(2, '0')}`;
  while (existingLotNos.has(candidate)) {
    counter++;
    candidate = `${prefix}${String(counter).padStart(2, '0')}`;
  }
  lotInput.value = candidate;
}

function populateProdInspectorSelect() {
  const sel = document.getElementById('prodInspector');
  if (!sel) return;
  const emps = appData?.employees || [];
  const currentVal = sel.value;
  if (emps.length === 0) {
    sel.innerHTML = '<option value="มัณฑนา โนราช">มัณฑนา โนราช</option>';
    return;
  }
  sel.innerHTML = emps.map(e => {
    const pos = e.position ? ` (${e.position})` : '';
    return `<option value="${e.name}">${e.name}${pos}</option>`;
  }).join('');

  if (currentVal && emps.some(e => e.name === currentVal)) {
    sel.value = currentVal;
  } else {
    const mantana = emps.find(e => e.name.includes('มัณฑนา'));
    sel.value = mantana ? mantana.name : emps[0].name;
  }
}

function updateQcParameterColors() {
  // 1. TDS น้ำดี RO: Standard < 10 ppm
  const elTdsRo = document.getElementById('prodTdsRo');
  const badgeTdsRo = document.getElementById('badgeTdsRo');
  if (elTdsRo) {
    const val = Number(elTdsRo.value);
    if (!isNaN(val) && val > 0 && val <= 10) {
      elTdsRo.className = 'w-full border-2 border-emerald-400 rounded-lg px-2.5 py-1.5 font-mono font-bold text-emerald-700 bg-emerald-50/30';
      if (badgeTdsRo) {
        badgeTdsRo.className = 'text-[10px] text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded';
        badgeTdsRo.innerHTML = '🟢 ปกติ (&lt; 10 ppm)';
      }
    } else {
      elTdsRo.className = 'w-full border-2 border-rose-500 rounded-lg px-2.5 py-1.5 font-mono font-bold text-rose-600 bg-rose-50';
      if (badgeTdsRo) {
        badgeTdsRo.className = 'text-[10px] text-rose-700 font-bold bg-rose-100 border border-rose-300 px-1.5 py-0.5 rounded animate-pulse';
        badgeTdsRo.innerHTML = '🔴 เกินเกณฑ์ (&gt; 10 ppm)';
      }
    }
  }

  // 2. pH น้ำดื่ม: Standard 6.5 - 8.5
  const elPh = document.getElementById('prodPh');
  const badgePh = document.getElementById('badgePh');
  if (elPh) {
    const val = Number(elPh.value);
    if (!isNaN(val) && val >= 6.5 && val <= 8.5) {
      elPh.className = 'w-full border-2 border-emerald-400 rounded-lg px-2.5 py-1.5 font-mono font-bold text-emerald-700 bg-emerald-50/30';
      if (badgePh) {
        badgePh.className = 'text-[10px] text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded';
        badgePh.innerHTML = '🟢 ปกติ (6.5 - 8.5)';
      }
    } else {
      elPh.className = 'w-full border-2 border-rose-500 rounded-lg px-2.5 py-1.5 font-mono font-bold text-rose-600 bg-rose-50';
      if (badgePh) {
        badgePh.className = 'text-[10px] text-rose-700 font-bold bg-rose-100 border border-rose-300 px-1.5 py-0.5 rounded animate-pulse';
        badgePh.innerHTML = '🔴 เกินเกณฑ์ (6.5-8.5)';
      }
    }
  }

  // 3. แรงดัน RO: Standard 120 - 160 PSI
  const elPressure = document.getElementById('prodPressure');
  const badgePressure = document.getElementById('badgePressure');
  if (elPressure) {
    const val = Number(elPressure.value);
    if (!isNaN(val) && val >= 120 && val <= 160) {
      elPressure.className = 'w-full border-2 border-emerald-400 rounded-lg px-2.5 py-1.5 font-mono font-bold text-emerald-700 bg-emerald-50/30';
      if (badgePressure) {
        badgePressure.className = 'text-[10px] text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded';
        badgePressure.innerHTML = '🟢 ปกติ (120-160 PSI)';
      }
    } else {
      elPressure.className = 'w-full border-2 border-rose-500 rounded-lg px-2.5 py-1.5 font-mono font-bold text-rose-600 bg-rose-50';
      if (badgePressure) {
        badgePressure.className = 'text-[10px] text-rose-700 font-bold bg-rose-100 border border-rose-300 px-1.5 py-0.5 rounded animate-pulse';
        badgePressure.innerHTML = '🔴 นอกเกณฑ์ (120-160)';
      }
    }
  }

  // 4. TDS น้ำดิบ: Standard ~150 - 300 ppm (<= 350 ppm)
  const elTdsRaw = document.getElementById('prodTdsRaw');
  const badgeTdsRaw = document.getElementById('badgeTdsRaw');
  if (elTdsRaw) {
    const val = Number(elTdsRaw.value);
    if (!isNaN(val) && val <= 350) {
      elTdsRaw.className = 'w-full border-2 border-emerald-400 rounded-lg px-2.5 py-1.5 font-mono font-bold text-emerald-700 bg-emerald-50/30';
      if (badgeTdsRaw) {
        badgeTdsRaw.className = 'text-[10px] text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded';
        badgeTdsRaw.innerHTML = '🟢 ปกติ (~150-300 ppm)';
      }
    } else {
      elTdsRaw.className = 'w-full border-2 border-rose-500 rounded-lg px-2.5 py-1.5 font-mono font-bold text-rose-600 bg-rose-50';
      if (badgeTdsRaw) {
        badgeTdsRaw.className = 'text-[10px] text-rose-700 font-bold bg-rose-100 border border-rose-300 px-1.5 py-0.5 rounded';
        badgeTdsRaw.innerHTML = '🔴 สูงกว่าเกณฑ์ (&gt; 350 ppm)';
      }
    }
  }
}

function renderProductionView() {
  // 1. Live Machine Readiness Badge
  const machines = appData.machines || [];
  const dueOrMnt = machines.filter(m => m.status === 'due' || m.status === 'maintenance');
  const summaryTextEl = document.getElementById('prodMachineSummaryText');
  if (summaryTextEl) {
    if (dueOrMnt.length > 0) {
      summaryTextEl.className = 'text-xs font-semibold bg-amber-50 text-amber-800 px-3 py-1 rounded-lg border border-amber-200';
      summaryTextEl.textContent = `⚠️ เครื่องจักรมีรายการต้องตรวจเช็ค ${dueOrMnt.length} เครื่อง`;
    } else {
      summaryTextEl.className = 'text-xs font-semibold bg-emerald-50 text-emerald-800 px-3 py-1 rounded-lg border border-emerald-200';
      summaryTextEl.textContent = `🟢 เครื่องจักรพร้อมเดินระบบ 16 เครื่อง`;
    }
  }

  // 2. สินค้าสำเร็จรูปคงคลัง (Finished Goods พร้อมส่ง)
  const inv = appData.inventory || [];
  const fg189 = inv.find(i => i.sku === 'FG-189L')?.stock || 0;
  const fg350 = inv.find(i => i.sku === 'FG-350ML')?.stock || 0;
  const fg600 = inv.find(i => i.sku === 'FG-600ML')?.stock || 0;
  const fg1500 = inv.find(i => i.sku === 'FG-1500ML')?.stock || 0;

  const elFg189 = document.getElementById('fgStock189');
  const elFg350 = document.getElementById('fgStock350');
  const elFg600 = document.getElementById('fgStock600');
  const elFg1500 = document.getElementById('fgStock1500');

  if (elFg189) elFg189.textContent = `${fg189.toLocaleString()} ถัง`;
  if (elFg350) elFg350.textContent = `${fg350.toLocaleString()} แพ็ค`;
  if (elFg600) elFg600.textContent = `${fg600.toLocaleString()} แพ็ค`;
  if (elFg1500) elFg1500.textContent = `${fg1500.toLocaleString()} แพ็ค`;

  // 3. สต็อกบรรจุภัณฑ์พร้อมผลิต (ภาษากระชับ ดูง่าย)
  const sEmpty189 = inv.find(i => i.sku === 'RET-189L-EMPTY')?.stock || 0;
  const sBtl350 = inv.find(i => i.sku === 'RM-BTL-350')?.stock || 0;
  const sBtl600 = inv.find(i => i.sku === 'RM-BTL-600')?.stock || 0;
  const sBtl1500 = inv.find(i => i.sku === 'RM-BTL-1500')?.stock || 0;

  const packs350 = Math.floor(sBtl350 / 12);
  const packs600 = Math.floor(sBtl600 / 12);
  const packs1500 = Math.floor(sBtl1500 / 6);

  const elEmpty189 = document.getElementById('prodStockEmpty189');
  const elBtl350 = document.getElementById('prodStockBtl350');
  const elBtl600 = document.getElementById('prodStockBtl600');
  const elBtl1500 = document.getElementById('prodStockBtl1500');

  if (elEmpty189) elEmpty189.textContent = `${sEmpty189.toLocaleString()} ใบ`;
  if (elBtl350) elBtl350.innerHTML = `<span>${sBtl350.toLocaleString()} ขวด</span> <span class="text-slate-400 font-normal">(${packs350.toLocaleString()} พ.)</span>`;
  if (elBtl600) elBtl600.innerHTML = `<span>${sBtl600.toLocaleString()} ขวด</span> <span class="text-slate-400 font-normal">(${packs600.toLocaleString()} พ.)</span>`;
  if (elBtl1500) elBtl1500.innerHTML = `<span>${sBtl1500.toLocaleString()} ขวด</span> <span class="text-slate-400 font-normal">(${packs1500.toLocaleString()} พ.)</span>`;

  // วัสดุประกอบ subline
  const cap189 = inv.find(i => i.sku === 'RM-CAP-189')?.stock || 0;
  const capPet = inv.find(i => i.sku === 'RM-CAP-PET')?.stock || 0;
  const lblPet = inv.find(i => i.sku === 'RM-LABEL-PET')?.stock || 0;
  const shrink = inv.find(i => i.sku === 'RM-SHRINK')?.stock || 0;
  const elMatSubline = document.getElementById('prodStockMaterialsSubline');
  if (elMatSubline) {
    elMatSubline.innerHTML = `ฝาถัง: <b>${cap189.toLocaleString()}</b> ฝา &nbsp;|&nbsp; ฝาขวด: <b>${capPet.toLocaleString()}</b> ฝา &nbsp;|&nbsp; ฉลาก: <b>${lblPet.toLocaleString()}</b> ชิ้น &nbsp;|&nbsp; ฟิล์มหด: <b>${shrink.toLocaleString()}</b> ชิ้น`;
  }

  // Auto Lot No. & QC Inspector initialization
  const dateInput = document.getElementById('prodDate');
  if (dateInput && !dateInput.value) {
    dateInput.value = new Date().toISOString().split('T')[0];
  }
  const lotInput = document.getElementById('prodLotNo');
  if (lotInput && !lotInput.value) {
    generateAndSetAutoLotNo();
  }
  populateProdInspectorSelect();
  updateQcParameterColors();

  // 4. Production Lots History Table
  const tbody = document.getElementById('productionTableBody');
  const badgeCount = document.getElementById('prodLogCountBadge');
  const lots = appData.productionLots || [];
  if (badgeCount) badgeCount.textContent = `${lots.length} รอบผลิต`;
  if (!tbody) return;

  if (lots.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="p-8 text-center text-slate-400">
          <div class="text-3xl mb-1">📦</div>
          <div class="font-semibold text-slate-600 text-sm">ยังไม่มีประวัติการผลิตในระบบ</div>
          <div class="text-[11px] text-slate-400 mt-0.5">เริ่มบันทึกรอบการผลิตและผลตรวจคุณภาพน้ำจากแบบฟอร์มด้านบน</div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = lots.map(l => {
    const tdsRoNum = Number(l.tdsRo);
    const phNum = Number(l.phValue);
    const pressNum = Number(l.roPressurePsi);

    const isTdsRoOk = !isNaN(tdsRoNum) && tdsRoNum > 0 && tdsRoNum <= 10;
    const isPhOk = !isNaN(phNum) && phNum >= 6.5 && phNum <= 8.5;
    const isPressOk = !isNaN(pressNum) && pressNum >= 120 && pressNum <= 160;

    const isCompliant = isTdsRoOk && isPhOk && (l.compliance?.status !== 'failed');
    const compBadge = isCompliant 
      ? '<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">🟢 ผ่านมาตรฐาน</span>'
      : '<span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 animate-pulse">🔴 ไม่ผ่านเกณฑ์</span>';

    const b189 = Number(l.bottle18_9L || 0);
    const plan189 = Number(l.planBottle18_9L ?? b189);
    const p350 = Number(l.pack350ml || 0);
    const plan350 = Number(l.planPack350ml ?? p350);
    const p600 = Number(l.pack600ml || 0);
    const plan600 = Number(l.planPack600ml ?? p600);
    const p1500 = Number(l.pack1500ml || 0);
    const plan1500 = Number(l.planPack1500ml ?? p1500);

    const tdsRoHtml = isTdsRoOk 
      ? `<span class="font-bold text-emerald-700 font-mono">${tdsRoNum} ppm</span>`
      : `<span class="font-bold text-rose-600 font-mono bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded">⚠️ ${tdsRoNum} ppm (เกิน)</span>`;

    const phHtml = isPhOk
      ? `<span class="font-bold text-emerald-700 font-mono">${phNum}</span>`
      : `<span class="font-bold text-rose-600 font-mono bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded">⚠️ ${phNum}</span>`;

    const pressHtml = isPressOk
      ? `<span class="font-bold text-emerald-700 font-mono">${pressNum} PSI</span>`
      : `<span class="font-bold text-rose-600 font-mono bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded">⚠️ ${pressNum} PSI</span>`;

    return `
      <tr class="hover:bg-slate-50 transition border-b border-slate-100">
        <td class="p-2.5">
          <div class="font-bold text-sky-700 font-mono">${l.lotNo}</div>
          <div class="text-[11px] text-slate-400">${l.date}</div>
        </td>
        <td class="p-2.5 text-center">
          <div class="font-bold text-slate-800">${b189.toLocaleString()} ถัง</div>
          <div class="text-[10px] text-slate-400">แผน: ${plan189.toLocaleString()}</div>
        </td>
        <td class="p-2.5 text-center">
          <div class="font-semibold text-slate-700">${p350.toLocaleString()} พ.</div>
          <div class="text-[10px] text-slate-400">แผน: ${plan350.toLocaleString()}</div>
        </td>
        <td class="p-2.5 text-center">
          <div class="font-semibold text-slate-700">${p600.toLocaleString()} พ.</div>
          <div class="text-[10px] text-slate-400">แผน: ${plan600.toLocaleString()}</div>
        </td>
        <td class="p-2.5 text-center">
          <div class="font-semibold text-slate-700">${p1500.toLocaleString()} พ.</div>
          <div class="text-[10px] text-slate-400">แผน: ${plan1500.toLocaleString()}</div>
        </td>
        <td class="p-2.5 text-center">
          <span class="text-slate-500 font-mono">${l.tdsRaw}</span> → ${tdsRoHtml}
        </td>
        <td class="p-2.5 text-center">${phHtml}</td>
        <td class="p-2.5 text-center">${pressHtml}</td>
        <td class="p-2.5 text-center">
          <div>${compBadge}</div>
          <div class="text-[11px] text-slate-600 font-medium mt-0.5">${l.qcInspector || '-'}</div>
        </td>
      </tr>
    `;
  }).join('');
}

async function submitProductionLot(e) {
  e.preventDefault();
  const payload = {
    lotNo: document.getElementById('prodLotNo').value.trim(),
    date: document.getElementById('prodDate').value || new Date().toISOString().split('T')[0],
    shift: 'กะปกติ (08:00-17:00)',
    planBottle18_9L: Number(document.getElementById('plan189')?.value || 0),
    planPack350ml: Number(document.getElementById('plan350')?.value || 0),
    planPack600ml: Number(document.getElementById('plan600')?.value || 0),
    planPack1500ml: Number(document.getElementById('plan1500')?.value || 0),
    bottle18_9L: Number(document.getElementById('prod189').value || 0),
    pack350ml: Number(document.getElementById('prod350')?.value || 0),
    pack600ml: Number(document.getElementById('prod600').value || 0),
    pack1500ml: Number(document.getElementById('prod1500').value || 0),
    tdsRaw: Number(document.getElementById('prodTdsRaw').value || 0),
    tdsRo: Number(document.getElementById('prodTdsRo').value || 0),
    phValue: Number(document.getElementById('prodPh').value || 7.2),
    roPressurePsi: Number(document.getElementById('prodPressure').value || 145),
    defectCount: Number(document.getElementById('prodDefect').value || 0),
    qcInspector: document.getElementById('prodInspector')?.value || 'มัณฑนา โนราช',
    uvStatus: 'ปกติ (ผ่านเกณฑ์)'
  };

  try {
    const res = await fetch('/api/production', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const out = await res.json();
    if (out.ok) {
      appData = out.data;
      // Reset plan & actual production numbers to 0
      ['plan189', 'plan350', 'plan600', 'plan1500', 'prod189', 'prod350', 'prod600', 'prod1500', 'prodDefect'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '0';
      });
      renderAllViews();
      // Generate next automatic lot number immediately
      generateAndSetAutoLotNo();
      alert(`✅ บันทึกรอบการผลิต [${out.lot?.lotNo || payload.lotNo}] สำเร็จ!\n- สต็อกสินค้าสำเร็จรูปเพิ่มขึ้นเรียบร้อย\n- ตัดสต็อกบรรจุภัณฑ์/ขวด/ฝา/ฟิล์มตามเกณฑ์ FIFO อัตโนมัติ\n- อัปเดตชั่วโมงสะสมเครื่องจักรเรียบร้อย`);
    } else {
      alert('เกิดข้อผิดพลาด: ' + (out.error || 'ไม่สามารถบันทึกรอบผลิตได้'));
    }
  } catch (err) {
    alert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์: ' + err.message);
  }
}

// ==========================================
// 4. CMMS (16 MACHINES MAINTENANCE)
// ==========================================
function renderCmmsView() {
  const grid = document.getElementById('machinesGrid');
  if (!grid) return;

  grid.innerHTML = (appData.machines || []).map(m => {
    const pct = Math.min(100, Math.round((m.runHours / m.pmIntervalHours) * 100));
    let badgeHtml = `<span class="bg-emerald-100 text-emerald-800 text-[11px] px-2 py-0.5 rounded-full font-medium">● ปกติ</span>`;
    let barColor = 'bg-emerald-500';
    if (m.status === 'due') {
      badgeHtml = `<span class="bg-rose-100 text-rose-800 text-[11px] px-2 py-0.5 rounded-full font-semibold animate-pulse">⚠️ ถึงรอบ PM</span>`;
      barColor = 'bg-rose-500';
    } else if (m.status === 'warning') {
      badgeHtml = `<span class="bg-amber-100 text-amber-800 text-[11px] px-2 py-0.5 rounded-full font-semibold">▲ ใกล้ครบกำหนด</span>`;
      barColor = 'bg-amber-500';
    } else if (m.status === 'maintenance') {
      badgeHtml = `<span class="bg-rose-100 text-rose-800 text-[11px] px-2 py-0.5 rounded-full font-bold animate-pulse">🛑 ซ่อมบำรุง/หยุดเดินเครื่อง</span>`;
      barColor = 'bg-rose-600';
    }

    const linkedAsset = (appData.assets || []).find(a => a.linkedRefId === m.code || a.id === m.assetId);
    const assetIdStr = linkedAsset ? linkedAsset.id : `AST-MAC-${m.code.slice(-3)}`;
    const assetBadge = linkedAsset 
      ? `<button onclick="switchTab('assets'); setTimeout(() => openAssetModal('${linkedAsset.id}'), 100);" title="เปิดดูทะเบียนสินทรัพย์" class="inline-flex items-center gap-1 font-mono text-[10px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-1.5 py-0.5 rounded cursor-pointer transition">🔗 ${linkedAsset.id}</button>`
      : `<span class="text-[10px] text-slate-400 font-mono">🔗 ${assetIdStr}</span>`;

    return `
      <div class="bg-white rounded-xl p-4 shadow-sm border border-slate-200 flex flex-col justify-between gap-2.5 hover:border-slate-300 transition">
        <div>
          <div class="flex items-center justify-between gap-1 mb-1">
            <div class="flex items-center gap-1.5">
              <span class="font-mono font-bold text-xs bg-slate-100 text-slate-800 px-2 py-0.5 rounded border border-slate-300">${m.code}</span>
              ${assetBadge}
            </div>
            ${badgeHtml}
          </div>
          <h4 class="font-bold text-slate-800 text-sm">${m.name}</h4>
          <p class="text-[11px] text-slate-500">${m.category} • กำลังไฟ ${m.watts} W</p>
        </div>

        <div class="space-y-1 text-xs">
          <div class="flex justify-between text-[11px]">
            <span class="text-slate-500">ชั่วโมงสะสมรอบนี้:</span>
            <span class="font-semibold">${m.runHours} / ${m.pmIntervalHours} ชม. (${pct}%)</span>
          </div>
          <div class="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
            <div class="${barColor} h-2 rounded-full" style="width:${pct}%"></div>
          </div>
          <p class="text-[11px] text-sky-800 bg-sky-50 p-1.5 rounded border border-sky-100 mt-1">
            <b>งาน PM ถัดไป:</b> ${m.nextPmTask}
          </p>
        </div>

        <div class="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px] gap-1">
          <button onclick="reportMachineBreakdown('${m.code}')" title="แจ้งเหตุขัดข้อง/เครื่องหยุดทำงาน" class="px-2 py-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-[10px] border border-rose-200 transition flex items-center gap-0.5">
            🚨 แจ้งซ่อมด่วน
          </button>
          <button onclick="openMaintenanceModal('${m.code}')" class="px-2.5 py-1 rounded bg-sky-600 hover:bg-sky-500 text-white font-bold text-[11px] transition flex items-center gap-1 shadow-xs">
            🔧 บันทึกซ่อม/ล้าง
          </button>
        </div>
      </div>
    `;
  }).join('');

  const tbody = document.getElementById('maintenanceTableBody');
  if (!tbody) return;

  tbody.innerHTML = (appData.maintenanceLogs || []).map(log => `
    <tr class="hover:bg-slate-50 transition border-b border-slate-100">
      <td class="p-2.5 font-mono text-xs text-slate-600">${log.id}</td>
      <td class="p-2.5">${log.date}</td>
      <td class="p-2.5 font-mono font-bold text-sky-700">${log.machineCode}</td>
      <td class="p-2.5"><span class="bg-amber-100 text-amber-800 text-xs px-2 py-0.5 rounded-full">${log.type}</span></td>
      <td class="p-2.5">${log.action}</td>
      <td class="p-2.5">${log.technician}</td>
      <td class="p-2.5 text-right font-semibold">฿${Number(log.cost).toLocaleString()}</td>
    </tr>
  `).join('');
}

async function reportMachineBreakdown(machineCode) {
  const m = (appData.machines || []).find(x => x.code === machineCode);
  const name = m ? m.name : machineCode;
  if (!confirm(`🚨 ยืนยันแจ้งเครื่องจักรขัดข้อง/หยุดทำงานฉุกเฉินสำหรับ:\n[${machineCode}] ${name}\n\nระบบจะปรับสถานะเครื่องจักรและสินทรัพย์เป็น 'ซ่อมบำรุง' ทันที`)) return;

  try {
    const res = await fetch(`/api/machines/${encodeURIComponent(machineCode)}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'maintenance' })
    });
    const out = await res.json();
    if (out.ok) {
      appData = out.data;
      renderAllViews();
      alert(`⚠️ บันทึกสถานะเครื่องจักร ${machineCode} เป็น 'ซ่อมบำรุง (Maintenance)' เรียบร้อยแล้ว ระบบสินทรัพย์และสายการผลิตได้รับการแจ้งเตือนแล้ว`);
    } else {
      alert('เกิดข้อผิดพลาด: ' + (out.error || 'ไม่สามารถอัปเดตสถานะได้'));
    }
  } catch (err) {
    alert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์: ' + err.message);
  }
}

function openMaintenanceModal(machineCode) {
  const sel = document.getElementById('mntMachineSelect');
  if (sel) {
    sel.innerHTML = (appData.machines || []).map(m =>
      `<option value="${m.code}">${m.code} — ${m.name}</option>`
    ).join('');
    if (machineCode) sel.value = machineCode;
    const m = (appData.machines || []).find(x => x.code === sel.value);
    if (m && document.getElementById('mntAction')) document.getElementById('mntAction').value = m.nextPmTask;
  }

  // Populate spare parts dropdown
  const spareSel = document.getElementById('mntSparePartSku');
  if (spareSel) {
    const spareItems = (appData.inventory || []).filter(i => i.category === 'spare_part' || i.category === 'raw_material' || i.sku.startsWith('RM-'));
    let html = '<option value="" data-cost="0">-- ไม่ได้เบิกอะไหล่/สารกรอง --</option>';
    spareItems.forEach(i => {
      html += `<option value="${i.sku}" data-cost="${i.unitCost || 0}">[${i.sku}] ${i.name} (คงเหลือ ${i.stock} ${i.unit}) [฿${i.unitCost}/${i.unit}]</option>`;
    });
    spareSel.innerHTML = html;
    spareSel.value = '';
  }

  const qtyInput = document.getElementById('mntSparePartQty');
  if (qtyInput) qtyInput.value = '0';
  const costInput = document.getElementById('mntCost');
  if (costInput) costInput.value = '0';

  const modal = document.getElementById('modalMaintenance');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
}

function closeMaintenanceModal() {
  const modal = document.getElementById('modalMaintenance');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

function onSelectMntSparePart() {
  const spareSel = document.getElementById('mntSparePartSku');
  const qtyInput = document.getElementById('mntSparePartQty');
  const costInput = document.getElementById('mntCost');
  if (!spareSel || !qtyInput || !costInput) return;

  const opt = spareSel.options[spareSel.selectedIndex];
  const unitCost = Number(opt?.getAttribute('data-cost') || 0);
  const qty = Number(qtyInput.value || 0);
  
  if (spareSel.value && qty > 0) {
    costInput.value = Math.round(unitCost * qty);
  } else if (!spareSel.value && Number(costInput.value) <= 0) {
    costInput.value = 0;
  }
}

async function submitMaintenanceLog(e) {
  e.preventDefault();
  const spareSku = document.getElementById('mntSparePartSku')?.value || '';
  const spareQty = Number(document.getElementById('mntSparePartQty')?.value || 0);

  const payload = {
    id: 'MNT-' + Date.now().toString().slice(-6),
    machineCode: document.getElementById('mntMachineSelect').value,
    date: document.getElementById('mntDate').value || new Date().toISOString().split('T')[0],
    type: document.getElementById('mntType').value,
    action: document.getElementById('mntAction').value,
    technician: document.getElementById('mntTech').value,
    cost: Number(document.getElementById('mntCost').value),
    sparePartSku: spareSku,
    sparePartQty: spareQty,
    status: 'completed'
  };

  try {
    const res = await fetch('/api/maintenance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const out = await res.json();
    if (out.ok) {
      appData = out.data;
      closeMaintenanceModal();
      renderAllViews();
      alert(`✅ บันทึกการบำรุงรักษา ${payload.machineCode} สำเร็จ! รีเซ็ตชั่วโมงเครื่องจักร และอัปเดตสถานะสินทรัพย์เรียบร้อยแล้ว`);
    } else {
      alert('เกิดข้อผิดพลาด: ' + (out.error || 'ไม่สามารถบันทึกได้'));
    }
  } catch (err) {
    alert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์: ' + err.message);
  }
}

// ==========================================
// 5. INVENTORY & PACKAGING LOTS & 18.9L BOTTLE TRACKING
// ==========================================
let currentInventorySubTab = 'goods';

function setInventorySubTab(subTab) {
  currentInventorySubTab = subTab;
  ['goods', 'lots', 'carboy'].forEach(tab => {
    const btn = document.getElementById(`btn-inv-sub-${tab}`);
    const view = document.getElementById(`subview-inv-${tab}`);
    if (btn) {
      if (tab === subTab) {
        btn.classList.remove('bg-white', 'text-slate-700', 'border', 'border-slate-200');
        btn.classList.add('bg-slate-900', 'text-white');
      } else {
        btn.classList.remove('bg-slate-900', 'text-white');
        btn.classList.add('bg-white', 'text-slate-700', 'border', 'border-slate-200');
      }
    }
    if (view) {
      if (tab === subTab) view.classList.remove('hidden');
      else view.classList.add('hidden');
    }
  });

  if (subTab === 'lots') {
    renderPackagingLotsView();
  }
}

function renderPackagingLotsView() {
  const lots = appData.packagingLots || [];

  // Update badge count
  const countBadge = document.getElementById('countPkgLots');
  if (countBadge) countBadge.textContent = lots.length;

  // Calculate KPIs
  let carboyTotal = 0;
  let bottlesTotal = 0;
  let capsTotal = 0;
  let valueTotal = 0;

  lots.forEach(lot => {
    const rem = Number(lot.remainingQty || 0);
    const cost = Number(lot.totalCost || 0);
    valueTotal += cost;

    if (lot.itemType === 'bottle_189L') {
      carboyTotal += rem;
    } else if (lot.itemType.startsWith('bottle_')) {
      bottlesTotal += rem;
    } else if (lot.itemType.startsWith('cap_') || lot.itemType === 'film_label') {
      capsTotal += rem;
    }
  });

  const elCarboy = document.getElementById('kpiPkgCarboyTotal');
  const elBottles = document.getElementById('kpiPkgBottlesTotal');
  const elCaps = document.getElementById('kpiPkgCapsTotal');
  const elValue = document.getElementById('kpiPkgValueTotal');

  if (elCarboy) elCarboy.textContent = carboyTotal.toLocaleString() + ' ถัง';
  if (elBottles) elBottles.textContent = bottlesTotal.toLocaleString() + ' ใบ';
  if (elCaps) elCaps.textContent = capsTotal.toLocaleString() + ' ชิ้น';
  if (elValue) elValue.textContent = '฿' + valueTotal.toLocaleString();

  // Render Table
  const tbody = document.getElementById('packagingLotsTableBody');
  if (!tbody) return;

  if (lots.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" class="text-center py-8 text-slate-400">
          <div class="text-2xl mb-1">📦</div>
          <div>ยังไม่มีประวัติการสั่งซื้อล็อตบรรจุภัณฑ์</div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = lots.map(lot => {
    let typeBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">บรรจุภัณฑ์</span>';
    if (lot.itemType === 'bottle_189L') typeBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-100 text-cyan-800">💧 ถัง 18.9L (สินทรัพย์)</span>';
    else if (lot.itemType === 'bottle_350ml') typeBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">🍾 ขวด 350ml</span>';
    else if (lot.itemType === 'bottle_600ml') typeBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">🍾 ขวด 600ml</span>';
    else if (lot.itemType === 'bottle_1500ml') typeBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">🍾 ขวด 1,500ml</span>';
    else if (lot.itemType.startsWith('cap_')) typeBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800">🏷️ ฝาขวด</span>';
    else if (lot.itemType === 'film_label') typeBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800">🏷️ ฟิล์มหด/ฉลาก</span>';

    let assetLinkHtml = '<span class="text-slate-400 text-xs">วัตถุดิบคลัง (FIFO)</span>';
    if (lot.assetLinked && lot.assetId) {
      assetLinkHtml = `
        <button onclick="switchTab('assets'); setTimeout(() => openAssetModal('${lot.assetId}'), 100);" title="เปิดดูในทะเบียนสินทรัพย์โรงงาน" class="inline-flex items-center gap-1 font-mono text-xs font-bold text-sky-800 hover:text-sky-950 bg-sky-50 hover:bg-sky-100 border border-sky-300 px-2 py-0.5 rounded cursor-pointer transition">
          💧 ${lot.assetId}
        </button>
      `;
    }

    const isDepleted = Number(lot.remainingQty || 0) <= 0;
    const statusBadge = isDepleted
      ? '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500">⚪ หมดสต็อก</span>'
      : '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">🟢 ใช้งานอยู่</span>';

    return `
      <tr class="hover:bg-slate-50 transition border-b border-slate-100">
        <td class="p-2.5 font-mono font-bold text-sky-800">${lot.lotNo}</td>
        <td class="p-2.5 font-mono text-slate-600">${lot.purchaseDate || '-'}</td>
        <td class="p-2.5">
          <div class="font-bold text-slate-900">${lot.itemName}</div>
          <div class="mt-0.5">${typeBadge}</div>
        </td>
        <td class="p-2.5 text-right font-mono font-bold text-slate-800">${Number(lot.quantity || 0).toLocaleString()} ${lot.unit}</td>
        <td class="p-2.5 text-right font-mono font-bold ${isDepleted ? 'text-slate-400' : 'text-emerald-700'}">${Number(lot.remainingQty || 0).toLocaleString()} ${lot.unit}</td>
        <td class="p-2.5 text-right font-mono text-slate-600">฿${Number(lot.unitCost || 0).toFixed(2)}</td>
        <td class="p-2.5 text-right font-mono font-bold text-slate-900">฿${Number(lot.totalCost || 0).toLocaleString()}</td>
        <td class="p-2.5 text-center">${assetLinkHtml}</td>
        <td class="p-2.5 text-slate-600 text-xs">${lot.supplier || '-'}</td>
        <td class="p-2.5 text-center">${statusBadge}</td>
      </tr>
    `;
  }).join('');
}

function openPackagingLotModal() {
  const d = new Date();
  const yymm = `${String(d.getFullYear()).slice(-2)}${String(d.getMonth() + 1).padStart(2, '0')}`;
  const nextNum = String((appData.packagingLots || []).length + 1).padStart(2, '0');
  
  const elLot = document.getElementById('pkgLotNo');
  const elDate = document.getElementById('pkgLotDate');
  const elType = document.getElementById('pkgLotItemType');
  const elQty = document.getElementById('pkgLotQty');
  const elCost = document.getElementById('pkgLotUnitCost');
  const elSup = document.getElementById('pkgLotSupplier');
  const elNotes = document.getElementById('pkgLotNotes');

  if (elDate) elDate.value = d.toISOString().split('T')[0];
  if (elType) elType.value = 'bottle_189L';
  if (elLot) elLot.value = `LOT-TNK-${yymm}-${nextNum}`;
  if (elQty) elQty.value = '500';
  if (elCost) elCost.value = '185';
  if (elSup) elSup.value = 'บริษัท ไทยโพลีคาร์บอเนต คอนเทนเนอร์ จำกัด';
  if (elNotes) elNotes.value = 'สกรีนตราน้ำดื่มอินธารา Food Grade รับประกันรั่วซึม';
  
  onPackagingTypeChange();
  calcPkgLotTotal();

  const modal = document.getElementById('modalPackagingLot');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
}

function closePackagingLotModal() {
  const modal = document.getElementById('modalPackagingLot');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

function onPackagingTypeChange() {
  const type = document.getElementById('pkgLotItemType')?.value || 'bottle_189L';
  const unitText = document.getElementById('pkgLotUnitText');
  const assetCheckbox = document.getElementById('pkgLotAssetLinked');
  const assetBlock = document.getElementById('pkgAssetLinkBlock');
  const lotInput = document.getElementById('pkgLotNo');
  const costInput = document.getElementById('pkgLotUnitCost');

  const d = new Date();
  const yymm = `${String(d.getFullYear()).slice(-2)}${String(d.getMonth() + 1).padStart(2, '0')}`;
  const nextNum = String((appData.packagingLots || []).length + 1).padStart(2, '0');

  if (type === 'bottle_189L') {
    if (unitText) unitText.textContent = 'ถัง';
    if (assetCheckbox) { assetCheckbox.checked = true; assetCheckbox.disabled = false; }
    if (assetBlock) assetBlock.classList.remove('opacity-50');
    if (costInput && (!costInput.value || Number(costInput.value) === 0)) costInput.value = '185';
    if (lotInput) lotInput.value = `LOT-TNK-${yymm}-${nextNum}`;
  } else if (type.startsWith('bottle_')) {
    if (unitText) unitText.textContent = 'ขวด';
    if (assetCheckbox) { assetCheckbox.checked = false; assetCheckbox.disabled = true; }
    if (assetBlock) assetBlock.classList.add('opacity-50');
    if (lotInput) lotInput.value = `LOT-BTL-${yymm}-${nextNum}`;
    if (costInput && (!costInput.value || Number(costInput.value) === 0)) {
      if (type === 'bottle_350ml') costInput.value = '1.15';
      else if (type === 'bottle_600ml') costInput.value = '1.35';
      else if (type === 'bottle_1500ml') costInput.value = '2.10';
    }
  } else {
    if (unitText) unitText.textContent = 'ชิ้น/ฝา';
    if (assetCheckbox) { assetCheckbox.checked = false; assetCheckbox.disabled = true; }
    if (assetBlock) assetBlock.classList.add('opacity-50');
    if (lotInput) lotInput.value = `LOT-PKG-${yymm}-${nextNum}`;
    if (costInput && (!costInput.value || Number(costInput.value) === 0)) {
      if (type === 'cap_189L') costInput.value = '1.20';
      else if (type === 'cap_pet') costInput.value = '0.35';
      else if (type === 'film_label') costInput.value = '0.35';
    }
  }
  calcPkgLotTotal();
}

function calcPkgLotTotal() {
  const qty = Number(document.getElementById('pkgLotQty')?.value || 0);
  const cost = Number(document.getElementById('pkgLotUnitCost')?.value || 0);
  const total = qty * cost;
  const display = document.getElementById('pkgLotTotalCostDisplay');
  if (display) {
    display.textContent = '฿' + total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}

async function submitPackagingLot(e) {
  e.preventDefault();
  const itemType = document.getElementById('pkgLotItemType').value;
  const lotNo = document.getElementById('pkgLotNo').value.trim();
  const purchaseDate = document.getElementById('pkgLotDate').value;
  const quantity = Number(document.getElementById('pkgLotQty').value);
  const unitCost = Number(document.getElementById('pkgLotUnitCost').value);
  const totalCost = quantity * unitCost;
  const supplier = document.getElementById('pkgLotSupplier').value.trim();
  const assetLinked = document.getElementById('pkgLotAssetLinked').checked;
  const notes = document.getElementById('pkgLotNotes').value.trim();

  const typeNames = {
    bottle_189L: 'ถังน้ำดื่ม PC 18.9 ลิตร (Food Grade ตราอินธารา)',
    bottle_350ml: 'ขวดเปล่า PET 350 ml (อินธารา)',
    bottle_600ml: 'ขวดเปล่า PET 600 ml (อินธารา)',
    bottle_1500ml: 'ขวดเปล่า PET 1,500 ml (อินธารา)',
    cap_189L: 'ฝาถังน้ำดื่ม 18.9 ลิตร สีฟ้า (Food Grade)',
    cap_pet: 'ฝาเกลียวขวดน้ำดื่ม PET 28/30mm (Food Grade)',
    film_label: 'ฟิล์มหดซีลฝาถังและคอขวด (สกรีนอินธารา)'
  };

  const payload = {
    lotNo,
    purchaseDate,
    itemType,
    itemName: typeNames[itemType] || 'บรรจุภัณฑ์',
    quantity,
    unitCost,
    totalCost,
    supplier,
    assetLinked,
    notes
  };

  try {
    const res = await fetch('/api/packaging-lots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const out = await res.json();
    if (out.ok) {
      appData = out.data;
      closePackagingLotModal();
      renderAllViews();
      setInventorySubTab('lots');
      let msg = `✅ บันทึกรับเข้าล็อต ${payload.lotNo} สำเร็จ!\n- สต็อกคลังสินค้าเพิ่มขึ้น ${quantity.toLocaleString()} หน่วย`;
      if (out.lot?.assetId) {
        msg += `\n- ผูกกับรหัสสินทรัพย์โรงงาน: ${out.lot.assetId} (คำนวณค่าเสื่อมราคา 3 ปี)`;
      }
      alert(msg);
    } else {
      alert('เกิดข้อผิดพลาด: ' + (out.error || 'ไม่สามารถบันทึกได้'));
    }
  } catch (err) {
    alert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์: ' + err.message);
  }
}

function renderInventoryView() {
  const invBody = document.getElementById('inventoryTableBody');
  if (invBody) {
    invBody.innerHTML = (appData.inventory || []).map(item => {
      const low = item.stock <= item.minStock;
      return `
        <tr class="hover:bg-slate-50 transition border-b border-slate-100">
          <td class="p-2.5 font-mono text-xs font-semibold text-slate-600">${item.sku}</td>
          <td class="p-2.5 font-medium text-slate-800">${item.name}</td>
          <td class="p-2.5 text-xs text-slate-500">${item.category}</td>
          <td class="p-2.5 text-right font-bold ${low ? 'text-rose-600' : 'text-emerald-700'}">${item.stock.toLocaleString()} ${item.unit}</td>
          <td class="p-2.5 text-right text-xs">฿${item.unitPrice} <span class="text-slate-400">(ทุน ฿${item.unitCost})</span></td>
          <td class="p-2.5 text-center">
            ${low
              ? '<span class="bg-rose-100 text-rose-800 text-xs px-2 py-0.5 rounded-full font-semibold animate-pulse">ใกล้หมด</span>'
              : '<span class="bg-emerald-100 text-emerald-800 text-xs px-2 py-0.5 rounded-full font-semibold">เพียงพอ</span>'}
          </td>
        </tr>
      `;
    }).join('');
  }

  const badgeEl = document.getElementById('invTotalBadge');
  if (badgeEl) {
    badgeEl.textContent = `${(appData.inventory || []).length} รายการ`;
  }

  renderPackagingLotsView();

  const bottleBody = document.getElementById('bottleLedgerTableBody');
  if (bottleBody) {
    bottleBody.innerHTML = (appData.customers || []).map(c => `
      <tr class="hover:bg-slate-50 transition border-b border-slate-100">
        <td class="p-2.5">
          <div class="font-bold text-slate-800">${c.name}</div>
          <div class="text-[11px] text-slate-400">${c.zone}</div>
        </td>
        <td class="p-2.5 text-center font-bold text-amber-700">${c.OutstandingBottles} ถัง</td>
        <td class="p-2.5 text-right font-semibold ${c.creditBalance > 0 ? 'text-rose-600' : 'text-slate-500'}">฿${Number(c.creditBalance).toLocaleString()}</td>
        <td class="p-2.5 text-center">
          <button onclick="openCheckinModal('${c.id}')" class="text-xs bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 px-2.5 py-1 rounded-lg">
            รับคืนถัง
          </button>
        </td>
      </tr>
    `).join('');
  }
}

// ==========================================
// 6. COSTING & EXPENSES
// ==========================================
function renderCostingView() {
  const totalExp = appData.expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const fuelExp = appData.expenses.filter(e => e.category.includes('น้ำมัน')).reduce((s, e) => s + Number(e.amount || 0), 0);
  const prodExp = appData.expenses.filter(e => e.category.includes('ไฟฟ้า') || e.category.includes('วัตถุดิบ')).reduce((s, e) => s + Number(e.amount || 0), 0);

  document.getElementById('costSummaryCards').innerHTML = `
    <div class="bg-rose-50 border border-rose-200 p-4 rounded-xl">
      <div class="text-xs text-rose-700">ค่าใช้จ่ายรวมทั้งหมด</div>
      <div class="text-2xl font-bold text-rose-700 mt-1">฿${totalExp.toLocaleString()}</div>
    </div>
    <div class="bg-sky-50 border border-sky-200 p-4 rounded-xl">
      <div class="text-xs text-sky-700">ต้นทุนการผลิต & วัตถุดิบ</div>
      <div class="text-2xl font-bold text-sky-800 mt-1">฿${prodExp.toLocaleString()}</div>
    </div>
    <div class="bg-amber-50 border border-amber-200 p-4 rounded-xl">
      <div class="text-xs text-amber-800">ต้นทุนน้ำมันขนส่งสะสม</div>
      <div class="text-2xl font-bold text-amber-800 mt-1">฿${fuelExp.toLocaleString()}</div>
    </div>
  `;

  const tbody = document.getElementById('expensesTableBody');
  tbody.innerHTML = appData.expenses.map(e => `
    <tr class="hover:bg-slate-50">
      <td class="p-2.5 font-mono text-xs text-slate-500">${e.id}</td>
      <td class="p-2.5">${e.date}</td>
      <td class="p-2.5"><span class="bg-slate-100 text-slate-700 text-xs px-2 py-0.5 rounded-full">${e.category}</span></td>
      <td class="p-2.5 font-mono text-xs text-sky-700">${e.refId || '-'}</td>
      <td class="p-2.5">${e.description}</td>
      <td class="p-2.5 text-right font-bold text-rose-600">฿${Number(e.amount).toLocaleString()}</td>
    </tr>
  `).join('');
}

async function submitExpense(e) {
  e.preventDefault();
  const payload = {
    date: document.getElementById('expDate').value,
    category: document.getElementById('expCat').value,
    refId: document.getElementById('expRef').value,
    description: document.getElementById('expDesc').value,
    amount: Number(document.getElementById('expAmount').value)
  };
  const res = await fetch('/api/expenses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const out = await res.json();
  if (out.ok) {
    appData = out.data;
    document.getElementById('expDesc').value = '';
    document.getElementById('expAmount').value = '';
    renderAllViews();
  }
}

// ==========================================
// MODALS: ADD STOP & DRIVER CHECK-IN
// ==========================================
function openAddStopModal() {
  document.getElementById('modalAddStop').classList.remove('hidden');
  document.getElementById('modalAddStop').classList.add('flex');
}

function closeAddStopModal() {
  document.getElementById('modalAddStop').classList.add('hidden');
  document.getElementById('modalAddStop').classList.remove('flex');
}

async function submitNewCustomerStop(e) {
  e.preventDefault();
  const payload = {
    name: document.getElementById('newCustName').value,
    zone: document.getElementById('newCustZone').value,
    phone: document.getElementById('newCustPhone').value,
    address: document.getElementById('newCustAddr').value,
    lat: Number(document.getElementById('newCustLat').value),
    lng: Number(document.getElementById('newCustLng').value),
    orderBottles189L: Number(document.getElementById('newCust189').value),
    orderPack350ml: Number(document.getElementById('newCust350')?.value || 0),
    orderPack600ml: Number(document.getElementById('newCust600').value),
    orderPack1500ml: Number(document.getElementById('newCust1500').value),
    OutstandingBottles: 20,
    creditBalance: 0,
    selectedForRoute: true,
    deliveryStatus: 'pending'
  };
  const res = await fetch('/api/customers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const out = await res.json();
  if (out.ok) {
    appData = out.data;
    closeAddStopModal();
    renderAllViews();
  }
}

function openCheckinModal(customerId) {
  const cust = appData?.customers?.find(c => c.id === customerId);
  if (!cust) return;

  const pendingOrders = (appData?.orders || []).filter(o => o.customerId === customerId && o.orderStatus !== 'จัดส่งสำเร็จแล้ว' && o.orderStatus !== 'ยกเลิก');
  const mainOrder = pendingOrders[0];

  document.getElementById('checkinCustId').value = cust.id;
  document.getElementById('checkinOrderIds').value = mainOrder ? mainOrder.orderId : pendingOrders.map(o => o.orderId).join(',');

  const badgeEl = document.getElementById('checkinOrderBadge');
  if (badgeEl) {
    badgeEl.textContent = mainOrder ? `📋 ${mainOrder.orderId}` : 'ไม่มีเลขออเดอร์';
  }

  const titleEl = document.getElementById('checkinCustTitle');
  if (titleEl) {
    titleEl.textContent = `👤 ${cust.name} (โทร: ${cust.phone || '-'})`;
  }
  
  const subEl = document.getElementById('checkinCustSub');
  if (subEl) {
    const fullAddr = cust.address ? cust.address : `บ้านเลขที่ ${cust.houseNo || '-'} ${cust.moo || ''} ต.${cust.subdistrict || ''} อ.${cust.district || ''} จ.${cust.province || ''} ${cust.postalCode || ''}`.trim();
    subEl.textContent = `📍 ที่อยู่: ${fullAddr} [${cust.zone || 'ทั่วไป'}]`;
  }

  // Pre-fill original ordered quantity labels
  const origQty189 = mainOrder ? Number(mainOrder.qty189L || 0) : Number(cust.orderBottles189L || 0);
  const origQty350 = mainOrder ? Number(mainOrder.qty350ml || 0) : Number(cust.orderPack350ml || 0);
  const origQty600 = mainOrder ? Number(mainOrder.qty600ml || 0) : Number(cust.orderPack600ml || 0);
  const origQty1500 = mainOrder ? Number(mainOrder.qty1500ml || 0) : Number(cust.orderPack1500ml || 0);

  const orig189El = document.getElementById('checkinOrig189');
  if (orig189El) orig189El.textContent = `สั่ง: ${origQty189}`;
  const orig350El = document.getElementById('checkinOrig350');
  if (orig350El) orig350El.textContent = `สั่ง: ${origQty350}`;
  const orig600El = document.getElementById('checkinOrig600');
  if (orig600El) orig600El.textContent = `สั่ง: ${origQty600}`;
  const orig1500El = document.getElementById('checkinOrig1500');
  if (orig1500El) orig1500El.textContent = `สั่ง: ${origQty1500}`;

  // Unit price labels
  const p189 = Number(mainOrder?.unitPrice189L ?? cust.price189L ?? 15);
  const p350 = Number(mainOrder?.unitPrice350ml ?? cust.price350ml ?? 35);
  const p600 = Number(mainOrder?.unitPrice600ml ?? cust.price600ml ?? 35);
  const p1500 = Number(mainOrder?.unitPrice1500ml ?? cust.price1500ml ?? 35);

  const price189El = document.getElementById('checkinPrice189Label');
  if (price189El) price189El.textContent = `@ ฿${p189}`;
  const price350El = document.getElementById('checkinPrice350Label');
  if (price350El) price350El.textContent = `@ ฿${p350}`;
  const price600El = document.getElementById('checkinPrice600Label');
  if (price600El) price600El.textContent = `@ ฿${p600}`;
  const price1500El = document.getElementById('checkinPrice1500Label');
  if (price1500El) price1500El.textContent = `@ ฿${p1500}`;

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

  // Pre-select payment mode based on customer term
  const termBadge = document.getElementById('checkinCustTermBadge');
  const payCashRadio = document.getElementById('checkinPayCash');
  const payCreditRadio = document.getElementById('checkinPayCredit');
  const moneyInput = document.getElementById('checkinMoneyReceived');
  if (moneyInput) delete moneyInput.dataset.manualEdit;

  const isCreditCust = String(cust.paymentTerm || '').includes('เครดิต');
  if (termBadge) {
    termBadge.textContent = isCreditCust ? `💳 ลูกค้าเครดิต (${cust.paymentTerm})` : `💵 ลูกค้าเงินสด (${cust.paymentTerm || 'เงินสด / โอนเงิน'})`;
    termBadge.className = isCreditCust ? 'text-[10px] font-bold text-amber-800 bg-amber-100 px-2.5 py-0.5 rounded-full' : 'text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2.5 py-0.5 rounded-full';
  }

  if (isCreditCust) {
    if (payCreditRadio) payCreditRadio.checked = true;
    onCheckinPaymentModeChange();
  } else {
    if (payCashRadio) payCashRadio.checked = true;
    onCheckinPaymentModeChange();
  }

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
    totalEl.textContent = `฿${totalAmount.toLocaleString()}`;
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
        payNotice.textContent = `🟡 ลงบัญชี/เครดิต: ยอดหนี้ค้างชำระเพิ่ม +฿${unpaid.toLocaleString()}`;
        payNotice.className = 'text-[10px] text-amber-800 font-bold';
      } else {
        payNotice.textContent = '🟢 ชำระครบเต็มจำนวนแล้ว';
        payNotice.className = 'text-[10px] text-emerald-700 font-bold';
      }
    } else {
      if (unpaid > 0) {
        payNotice.textContent = `รับเงิน ฿${received.toLocaleString()} • ยอดหนี้ค้างชำระเพิ่ม +฿${unpaid.toLocaleString()}`;
        payNotice.className = 'text-[10px] text-amber-800 font-bold';
      } else {
        payNotice.textContent = '🟢 รับเงินสด/โอนครบเต็มจำนวน (ไม่เพิ่มยอดหนี้ค้าง)';
        payNotice.className = 'text-[10px] text-emerald-700 font-bold';
      }
    }
  }

  // Calculate live bottle balance
  const prevBottles = Number(cust?.OutstandingBottles || 0);
  const newBalance = Math.max(0, prevBottles + q189 - ret189);

  const balEl = document.getElementById('checkinBottleBalance');
  if (balEl) {
    balEl.innerHTML = `
      <div class="flex items-center justify-between text-[11px] py-1 px-2 rounded-lg bg-amber-50/80 border border-amber-200">
        <span class="text-slate-600">ถังค้างสะสม (เดิม ${prevBottles} + ส่ง ${q189} - คืน ${ret189}):</span>
        <span class="font-bold ${newBalance > prevBottles ? 'text-amber-800' : 'text-emerald-800'}">${newBalance} ใบ</span>
      </div>
    `;
  }
}

function onCheckinPaymentModeChange() {
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
}

function onCheckinMoneyReceivedInput() {
  const moneyInput = document.getElementById('checkinMoneyReceived');
  if (moneyInput) moneyInput.dataset.manualEdit = 'true';
  recalcCheckinModalTotals();
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
    const isCreditMode = document.getElementById('checkinPayCredit')?.checked;
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

      alert(`✅ คอนเฟิร์มส่งน้ำร้าน [${custName}] สำเร็จ!\n• ปรับปรุงยอดตามจำนวนส่งจริงเรียบร้อย\n• อัปเดตสถานะออเดอร์เป็น "จัดส่งสำเร็จแล้ว"`);
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

function exportFullBackup() {
  if (!appData) return;
  const blob = new Blob([JSON.stringify(appData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `inthara_erp_backup_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
}

async function syncCloudNow() {
  const btn = document.getElementById('btnCloudSync');
  const txt = document.getElementById('cloudStatusText');
  const dot = document.getElementById('cloudStatusDot');
  if (btn) btn.innerHTML = '<span>⏳</span> <span>กำลังซิงค์...</span>';
  if (txt) txt.textContent = 'กำลังอัปโหลด...';
  if (dot) dot.className = 'w-2 h-2 rounded-full bg-amber-400 animate-ping';

  try {
    const res = await fetch('/api/cloud/sync', { method: 'POST' });
    const out = await res.json();
    if (out.ok) {
      if (btn) btn.innerHTML = '<span>✅</span> <span>ซิงค์สำเร็จ!</span>';
      if (txt) txt.textContent = `☁️ ซิงค์แล้ว (${new Date().toLocaleTimeString('th-TH')})`;
      if (dot) dot.className = 'w-2 h-2 rounded-full bg-emerald-400 animate-pulse';
      setTimeout(() => { if (btn) btn.innerHTML = '<span>☁️</span> <span>ซิงค์ไดรฟ์</span>'; }, 2500);
    } else {
      if (btn) btn.innerHTML = '<span>⚠️</span> <span>ขัดข้อง</span>';
      if (dot) dot.className = 'w-2 h-2 rounded-full bg-rose-500';
    }
  } catch (e) {
    if (btn) btn.innerHTML = '<span>⚠️</span> <span>ขัดข้อง</span>';
  }
}

// ==========================================
// 7. MULTI-LEVEL SECURITY, LOGIN GATE & EXCEL PASSWORD EDITOR
// ==========================================
let cachedExcelUsers = [];

function logoutAndShowLoginGate() {
  authToken = null;
  localStorage.removeItem('inthara_auth_token');
  const gate = document.getElementById('loginGateScreen');
  if (gate) gate.classList.remove('hidden');
}

function hideLoginGate() {
  const gate = document.getElementById('loginGateScreen');
  if (gate) gate.classList.add('hidden');
}

function fillLoginPreset(username, fallbackPassword) {
  const matched = cachedExcelUsers.find(u => u.username === username);
  const actualPassword = matched?.passwordPlain || fallbackPassword;
  const loginUserEl = document.getElementById('loginUsername');
  const loginPassEl = document.getElementById('loginPassword');
  const resetUserEl = document.getElementById('resetUsername');
  if (loginUserEl) loginUserEl.value = username;
  if (loginPassEl) loginPassEl.value = actualPassword;
  if (resetUserEl) resetUserEl.value = username;
  toggleResetPasswordPanel(false);
}

function toggleResetPasswordPanel(showReset) {
  const signInBox = document.getElementById('signInFormContainer');
  const resetBox = document.getElementById('resetPasswordContainer');
  const statusEl = document.getElementById('resetStatusMsg');
  if (statusEl) statusEl.classList.add('hidden');
  if (showReset) {
    if (signInBox) signInBox.classList.add('hidden');
    if (resetBox) resetBox.classList.remove('hidden');
    const currentLoginUser = document.getElementById('loginUsername')?.value?.trim();
    const resetUserEl = document.getElementById('resetUsername');
    if (currentLoginUser && resetUserEl) {
      resetUserEl.value = currentLoginUser;
    }
  } else {
    if (resetBox) resetBox.classList.add('hidden');
    if (signInBox) signInBox.classList.remove('hidden');
  }
}

async function submitLogin(e) {
  e.preventDefault();
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginErrorMsg');
  errEl.classList.add('hidden');

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const out = await res.json();
    if (!out.ok) {
      errEl.textContent = out.error || 'เข้าสู่ระบบไม่สำเร็จ';
      errEl.classList.remove('hidden');
      await fetchSecurityAudit();
      return;
    }

    authToken = out.token;
    currentUser = out.user;
    localStorage.setItem('inthara_auth_token', authToken);
    hideLoginGate();
    applyUserPermissionsUI();
    renderDashboard();
    await fetchSecurityAudit();
  } catch (err) {
    errEl.textContent = 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์ความปลอดภัย';
    errEl.classList.remove('hidden');
  }
}

async function submitResetPasswordByPin(e) {
  e.preventDefault();
  const username = document.getElementById('resetUsername').value.trim();
  const pin = document.getElementById('resetPin').value.trim();
  const newPassword = document.getElementById('resetNewPassword').value;
  const statusEl = document.getElementById('resetStatusMsg');
  statusEl.classList.add('hidden');

  try {
    const res = await fetch('/api/auth/reset-password-by-pin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, pin, newPassword })
    });
    const out = await res.json();
    if (!out.ok) {
      statusEl.className = 'text-xs font-semibold rounded-xl p-2.5 border bg-rose-50 border-rose-200 text-rose-700';
      statusEl.textContent = `❌ ${out.error || 'ไม่สามารถเปลี่ยนรหัสผ่านได้'}`;
      statusEl.classList.remove('hidden');
      await fetchSecurityAudit();
      return;
    }

    statusEl.className = 'text-xs font-semibold rounded-xl p-2.5 border bg-emerald-50 border-emerald-200 text-emerald-800';
    statusEl.textContent = `✅ ${out.message}`;
    statusEl.classList.remove('hidden');

    document.getElementById('loginUsername').value = username;
    document.getElementById('loginPassword').value = newPassword;
    document.getElementById('resetPin').value = '';
    document.getElementById('resetNewPassword').value = '';
    await fetchSecurityAudit();

    setTimeout(() => {
      toggleResetPasswordPanel(false);
    }, 1800);
  } catch (err) {
    statusEl.className = 'text-xs font-medium rounded-lg px-3 py-2 border bg-rose-500/20 border-rose-400/50 text-rose-200';
    statusEl.textContent = '❌ เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์';
    statusEl.classList.remove('hidden');
  }
}

function applyUserPermissionsUI() {
  const roleBadge = document.getElementById('activeUserRoleText');
  if (roleBadge && currentUser) {
    roleBadge.textContent = `${currentUser.displayName}`;
  }
  const allTabs = ['dashboard', 'customers', 'orders', 'tms', 'production', 'cmms', 'inventory', 'costing', 'security'];
  const isExecutive = currentUser?.role === 'executive' || currentUser?.username === 'owner_inthara';
  const allowed = isExecutive
    ? allTabs
    : (currentUser?.permissions?.allowedTabs || allTabs);

  if (isExecutive && currentUser) {
    currentUser.permissions = {
      ...(currentUser.permissions || {}),
      allowedTabs: allTabs,
      canWriteProduction: true,
      canWriteMaintenance: true,
      canWriteTms: true,
      canWriteExpenses: true,
      canManageUsers: true
    };
  }

  allTabs.forEach(t => {
    const btn = document.getElementById(`tab-${t}`);
    if (!btn) return;
    if (allowed.includes(t)) {
      btn.classList.remove('hidden');
    } else {
      btn.classList.add('hidden');
    }
  });
  // Adjust grid columns dynamically so visible buttons stretch full width without scrolling
  const navGrid = document.getElementById('mainNavGrid');
  if (navGrid) {
    navGrid.style.gridTemplateColumns = `repeat(${allowed.length}, minmax(0, 1fr))`;
  }
  // Always open role-specific Dashboard after login
  switchTab('dashboard');
}

async function applyQuickRoleMode(roleKey) {
  const presetMap = {
    executive: ['owner_inthara', 'Inthara@Owner2026!'],
    admin: ['admin_office', 'Inthara@Admin2026!'],
    production_qc: ['qc_production', 'Inthara@QC2026!'],
    technician: ['tech_cmms', 'Inthara@Tech2026!'],
    driver: ['driver_gps', 'Inthara@Driver2026!']
  };
  const preset = presetMap[roleKey];
  if (!preset) return;
  const [username, fallbackPassword] = preset;
  const matched = cachedExcelUsers.find(u => u.username === username);
  const password = matched?.passwordPlain || fallbackPassword;
  fillLoginPreset(username, password);
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const out = await res.json();
  if (out.ok) {
    authToken = out.token;
    currentUser = out.user;
    hideLoginGate();
    applyUserPermissionsUI();
    renderDashboard();
  }
}

async function fetchSecurityAudit() {
  try {
    const res = await fetch('/api/security/audit');
    const out = await res.json();
    if (!out.ok) return;

    cachedExcelUsers = out.users || [];
    const excelBody = document.getElementById('excelUsersEditableBody');
    if (excelBody) {
      excelBody.innerHTML = cachedExcelUsers.map((u, idx) => `
        <tr class="hover:bg-slate-50">
          <td class="p-2 text-center font-bold text-indigo-700">${u.level || (idx + 1)}</td>
          <td class="p-2 font-mono font-bold text-slate-800">${u.username}</td>
          <td class="p-2">
            <input type="text" id="edit_disp_${idx}" value="${u.displayName}" class="w-full border border-slate-300 rounded-lg px-2 py-1 text-xs" />
          </td>
          <td class="p-2">
            <input type="text" id="edit_pass_${idx}" value="${u.passwordPlain}" class="w-full border border-emerald-300 bg-emerald-50/40 rounded-lg px-2 py-1 font-mono font-bold text-emerald-800 text-xs" />
          </td>
          <td class="p-2 text-center">
            <input type="text" id="edit_pin_${idx}" maxlength="4" value="${u.pin}" class="w-20 border border-amber-300 bg-amber-50/40 rounded-lg px-2 py-1 font-mono font-bold text-center text-amber-900 text-xs" />
          </td>
          <td class="p-2 text-[11px] text-slate-500">${u.dashboardNote || u.roleName}</td>
        </tr>
      `).join('');
    }

    const auditBody = document.getElementById('securityAuditTableBody');
    if (auditBody) {
      auditBody.innerHTML = out.auditLogs.map(log => {
        const isOk = log.status === 'SUCCESS';
        return `
          <tr class="hover:bg-slate-50">
            <td class="p-2.5 font-mono text-slate-500">${log.id}</td>
            <td class="p-2.5 text-slate-600">${new Date(log.timestamp).toLocaleString('th-TH')}</td>
            <td class="p-2.5 font-mono font-bold text-slate-800">${log.username}</td>
            <td class="p-2.5"><span class="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[11px]">${log.role}</span></td>
            <td class="p-2.5 font-mono font-semibold text-indigo-700">${log.action}</td>
            <td class="p-2.5">${log.detail}</td>
            <td class="p-2.5 text-center">
              <span class="${isOk ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'} text-[11px] px-2 py-0.5 rounded-full font-semibold">
                ${log.status}
              </span>
            </td>
          </tr>
        `;
      }).join('');
    }
  } catch (e) {
    console.error('Failed to load security audit:', e);
  }
}

async function saveEditableExcelTable() {
  const btn = document.getElementById('btnSaveExcelUsers');
  if (btn) btn.textContent = '⏳ กำลังบันทึกลง Excel & Google Drive...';
  const updated = cachedExcelUsers.map((u, idx) => ({
    ...u,
    displayName: document.getElementById(`edit_disp_${idx}`)?.value || u.displayName,
    passwordPlain: document.getElementById(`edit_pass_${idx}`)?.value || u.passwordPlain,
    pin: document.getElementById(`edit_pin_${idx}`)?.value || u.pin
  }));

  try {
    const res = await fetch('/api/security/update-users-excel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ users: updated })
    });
    const out = await res.json();
    if (out.ok) {
      if (btn) btn.textContent = '✅ บันทึกไฟล์ Excel & ซิงค์คลาวด์สำเร็จ!';
      await fetchSecurityAudit();
      setTimeout(() => { if (btn) btn.textContent = '💾 บันทึกการแก้ไขลงไฟล์ Excel & Google Drive'; }, 2500);
    }
  } catch (e) {
    if (btn) btn.textContent = '⚠️ บันทึกไม่สำเร็จ';
  }
}

async function pullExcelPasswordsFromDrive() {
  try {
    const res = await fetch('/api/security/pull-excel-drive', { method: 'POST' });
    const out = await res.json();
    if (out.ok) {
      await fetchSecurityAudit();
      alert('✅ ดึงข้อมูลรหัสผ่านจากไฟล์ Excel บน Google Drive เรียบร้อยแล้ว');
    }
  } catch (e) {
    alert('⚠️ ไม่สามารถดึงไฟล์ Excel จากคลาวด์ได้');
  }
}

// ==========================================
// 8. CLOUD STORAGE INSPECTOR (BYPASS FORTIGATE)
// ==========================================
function openCloudInspectorModal() {
  document.getElementById('modalCloudInspector').classList.remove('hidden');
  document.getElementById('modalCloudInspector').classList.add('flex');
  loadCloudFilesList();
}

function closeCloudInspectorModal() {
  document.getElementById('modalCloudInspector').classList.add('hidden');
  document.getElementById('modalCloudInspector').classList.remove('flex');
}

async function loadCloudFilesList() {
  const tbody = document.getElementById('cloudFilesTableBody');
  const statusEl = document.getElementById('cloudModalSyncStatus');
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-slate-400">⏳ กำลังดึงรายการไฟล์จาก Google Drive API หลังบ้าน...</td></tr>`;
  try {
    const res = await fetch('/api/cloud/files');
    const out = await res.json();
    if (!out.ok || !Array.isArray(out.files)) {
      tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-rose-600">ไม่สามารถโหลดรายการไฟล์ได้</td></tr>`;
      return;
    }
    if (statusEl && out.cloudSync?.lastSyncTime) {
      statusEl.textContent = `ซิงค์สำเร็จล่าสุดเมื่อ ${new Date(out.cloudSync.lastSyncTime).toLocaleString('th-TH')}`;
    }
    tbody.innerHTML = out.files.map(f => {
      const kb = f.size ? (Number(f.size) / 1024).toFixed(1) + ' KB' : '-';
      const mod = f.modifiedTime ? new Date(f.modifiedTime).toLocaleString('th-TH') : '-';
      return `
        <tr class="hover:bg-slate-50">
          <td class="p-2.5 font-mono font-bold text-sky-800">${f.name}</td>
          <td class="p-2.5 text-slate-500">${f.mimeType}</td>
          <td class="p-2.5 text-right font-semibold">${kb}</td>
          <td class="p-2.5 text-right text-slate-600">${mod}</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-rose-600">เกิดข้อผิดพลาดในการเชื่อมต่อ API</td></tr>`;
  }
}

async function pullDatabaseFromCloud() {
  const statusEl = document.getElementById('cloudModalSyncStatus');
  if (statusEl) statusEl.textContent = '⏳ กำลังดึงข้อมูลล่าสุดจาก Google Drive ลงเครื่อง...';
  try {
    const res = await fetch('/api/cloud/pull', { method: 'POST' });
    const out = await res.json();
    if (out.ok) {
      appData = out.data;
      renderAllViews();
      if (statusEl) statusEl.textContent = `✅ ดึงข้อมูลจากคลาวด์สำเร็จ (${new Date().toLocaleTimeString('th-TH')})`;
      await loadCloudFilesList();
    }
  } catch (e) {
    if (statusEl) statusEl.textContent = '⚠️ ไม่สามารถดึงข้อมูลจากคลาวด์ได้';
  }
}

// ==========================================
// 9. CUSTOMER MASTER DATA, THA PLA (7 TAMBONS + MOOS) & ACCURATE AUTO-PIN MAP
// ==========================================
const THAI_ADDRESS_DB = {
  'อุตรดิตถ์': {
    'ท่าปลา': [
      {
        subdistrict: 'จริม',
        zip: '53150',
        lat: 17.7915,
        lng: 100.3782,
        moos: [
          { moo: 'หมู่ 1', lat: 17.7962, lng: 100.3865 },
          { moo: 'หมู่ 2', lat: 17.7810, lng: 100.3690 },
          { moo: 'หมู่ 3', lat: 17.7725, lng: 100.3995 },
          { moo: 'หมู่ 4', lat: 17.7915, lng: 100.3782 },
          { moo: 'หมู่ 5', lat: 17.8045, lng: 100.3820 },
          { moo: 'หมู่ 6', lat: 17.8110, lng: 100.3710 },
          { moo: 'หมู่ 7', lat: 17.8180, lng: 100.3620 },
          { moo: 'หมู่ 8', lat: 17.7880, lng: 100.3925 },
          { moo: 'หมู่ 9', lat: 17.7995, lng: 100.3905 },
          { moo: 'หมู่ 10', lat: 17.8020, lng: 100.3790 },
          { moo: 'หมู่ 11', lat: 17.7850, lng: 100.3740 },
          { moo: 'หมู่ 12', lat: 17.7940, lng: 100.3835 },
          { moo: 'หมู่ 13', lat: 17.7985, lng: 100.3855 }
        ]
      },
      {
        subdistrict: 'ท่าปลา',
        zip: '53150',
        lat: 17.7918,
        lng: 100.4435,
        moos: [
          { moo: 'หมู่ 1', lat: 17.7918, lng: 100.4435 },
          { moo: 'หมู่ 2', lat: 17.7865, lng: 100.4310 },
          { moo: 'หมู่ 3', lat: 17.7952, lng: 100.4512 },
          { moo: 'หมู่ 4', lat: 17.8015, lng: 100.4480 },
          { moo: 'หมู่ 5', lat: 17.7820, lng: 100.4390 },
          { moo: 'หมู่ 6', lat: 17.7785, lng: 100.4560 },
          { moo: 'หมู่ 7', lat: 17.8090, lng: 100.4350 },
          { moo: 'หมู่ 8', lat: 17.8140, lng: 100.4610 },
          { moo: 'หมู่ 9', lat: 17.7895, lng: 100.4470 },
          { moo: 'หมู่ 10', lat: 17.7975, lng: 100.4410 },
          { moo: 'หมู่ 11', lat: 17.7935, lng: 100.4360 },
          { moo: 'หมู่ 12', lat: 17.7960, lng: 100.4450 }
        ]
      },
      {
        subdistrict: 'หาดล้า',
        zip: '53150',
        lat: 17.7520,
        lng: 100.4120,
        moos: [
          { moo: 'หมู่ 1', lat: 17.7520, lng: 100.4120 },
          { moo: 'หมู่ 2', lat: 17.7460, lng: 100.4210 },
          { moo: 'หมู่ 3', lat: 17.7590, lng: 100.4050 },
          { moo: 'หมู่ 4', lat: 17.7395, lng: 100.4180 },
          { moo: 'หมู่ 5', lat: 17.7640, lng: 100.4250 },
          { moo: 'หมู่ 6', lat: 17.7485, lng: 100.3980 },
          { moo: 'หมู่ 7', lat: 17.7565, lng: 100.4150 },
          { moo: 'หมู่ 8', lat: 17.7430, lng: 100.4090 },
          { moo: 'หมู่ 9', lat: 17.7505, lng: 100.4290 }
        ]
      },
      {
        subdistrict: 'ผาเลือด',
        zip: '53150',
        lat: 17.7642,
        lng: 100.5618,
        moos: [
          { moo: 'หมู่ 1', lat: 17.7580, lng: 100.5420 },
          { moo: 'หมู่ 2', lat: 17.7490, lng: 100.5310 },
          { moo: 'หมู่ 3', lat: 17.7695, lng: 100.5510 },
          { moo: 'หมู่ 4', lat: 17.7410, lng: 100.5590 },
          { moo: 'หมู่ 5', lat: 17.7730, lng: 100.5380 },
          { moo: 'หมู่ 6', lat: 17.7642, lng: 100.5618 },
          { moo: 'หมู่ 7', lat: 17.7620, lng: 100.5480 },
          { moo: 'หมู่ 8', lat: 17.7540, lng: 100.5680 },
          { moo: 'หมู่ 9', lat: 17.7680, lng: 100.5720 },
          { moo: 'หมู่ 10', lat: 17.7595, lng: 100.5550 },
          { moo: 'หมู่ 11', lat: 17.7520, lng: 100.5630 },
          { moo: 'หมู่ 12', lat: 17.7600, lng: 100.5700 },
          { moo: 'หมู่ 13', lat: 17.7660, lng: 100.5750 }
        ]
      },
      {
        subdistrict: 'ร่วมจิต',
        zip: '53190',
        lat: 17.7340,
        lng: 100.3520,
        moos: [
          { moo: 'หมู่ 1', lat: 17.7340, lng: 100.3520 },
          { moo: 'หมู่ 2', lat: 17.7285, lng: 100.3450 },
          { moo: 'หมู่ 3', lat: 17.7410, lng: 100.3610 },
          { moo: 'หมู่ 4', lat: 17.7210, lng: 100.3580 },
          { moo: 'หมู่ 5', lat: 17.7380, lng: 100.3410 },
          { moo: 'หมู่ 6', lat: 17.7460, lng: 100.3550 },
          { moo: 'หมู่ 7', lat: 17.7160, lng: 100.3490 },
          { moo: 'หมู่ 8', lat: 17.7310, lng: 100.3660 },
          { moo: 'หมู่ 9', lat: 17.7365, lng: 100.3505 },
          { moo: 'หมู่ 10', lat: 17.7250, lng: 100.3390 },
          { moo: 'หมู่ 11', lat: 17.7435, lng: 100.3480 }
        ]
      },
      {
        subdistrict: 'น้ำหมัน',
        zip: '53150',
        lat: 17.8520,
        lng: 100.3410,
        moos: [
          { moo: 'หมู่ 1', lat: 17.8520, lng: 100.3410 },
          { moo: 'หมู่ 2', lat: 17.8610, lng: 100.3350 },
          { moo: 'หมู่ 3', lat: 17.8440, lng: 100.3490 },
          { moo: 'หมู่ 4', lat: 17.8580, lng: 100.3520 },
          { moo: 'หมู่ 5', lat: 17.8390, lng: 100.3380 },
          { moo: 'หมู่ 6', lat: 17.8475, lng: 100.3435 },
          { moo: 'หมู่ 7', lat: 17.8680, lng: 100.3460 },
          { moo: 'หมู่ 8', lat: 17.8540, lng: 100.3290 },
          { moo: 'หมู่ 9', lat: 17.8635, lng: 100.3590 },
          { moo: 'หมู่ 10', lat: 17.8740, lng: 100.3390 },
          { moo: 'หมู่ 11', lat: 17.8495, lng: 100.3560 },
          { moo: 'หมู่ 12', lat: 17.8550, lng: 100.3450 }
        ]
      },
      {
        subdistrict: 'นางพญา',
        zip: '53150',
        lat: 17.8350,
        lng: 100.5100,
        moos: [
          { moo: 'หมู่ 1', lat: 17.8350, lng: 100.5100 },
          { moo: 'หมู่ 2', lat: 17.8420, lng: 100.5020 },
          { moo: 'หมู่ 3', lat: 17.8280, lng: 100.5180 },
          { moo: 'หมู่ 4', lat: 17.8510, lng: 100.5290 },
          { moo: 'หมู่ 5', lat: 17.8390, lng: 100.5150 },
          { moo: 'หมู่ 6', lat: 17.8315, lng: 100.5060 }
        ]
      }
    ]
  }
};

// Known landmarks in Amphoe Tha Pla for exact pinpoint accuracy
const THAPLA_LANDMARKS = [
  { keywords: ['อินธารา', '121'], subdistrict: 'จริม', moo: 'หมู่ 4', lat: 17.816882513503195, lng: 100.36169257553256, label: 'โรงงานน้ำดื่มอินธารา (121 หมู่ 4 ต.จริม)' },
  { keywords: ['เขื่อนสิริกิติ์', 'สวัสดิการเขื่อน'], subdistrict: 'ผาเลือด', moo: 'หมู่ 6', lat: 17.7642, lng: 100.5618, label: 'เขื่อนสิริกิติ์ ต.ผาเลือด' },
  { keywords: ['ตลาดสดเทศบาล', 'ตลาดท่าปลา'], subdistrict: 'ท่าปลา', moo: 'หมู่ 1', lat: 17.7918, lng: 100.4435, label: 'ตลาดสดเทศบาลตำบลท่าปลา' },
  { keywords: ['โรงเรียนท่าปลาอนุสรณ์', 'ท่าปลาอนุสรณ์'], subdistrict: 'ท่าปลา', moo: 'หมู่ 2', lat: 17.7865, lng: 100.4310, label: 'โรงเรียนท่าปลาอนุสรณ์ 1' },
  { keywords: ['อบต.จริม', 'องค์การบริหารส่วนตำบลจริม'], subdistrict: 'จริม', moo: 'หมู่ 9', lat: 17.7980, lng: 100.3910, label: 'องค์การบริหารส่วนตำบลจริม' },
  { keywords: ['โรงพยาบาลท่าปลา', 'รพ.ท่าปลา'], subdistrict: 'ท่าปลา', moo: 'หมู่ 3', lat: 17.7952, lng: 100.4512, label: 'โรงพยาบาลท่าปลา' }
];

let custPickerMap = null;
let custPickerMarker = null;
let custMapTileHybrid = null;
let custMapTileStreet = null;
let geocodeDebounceTimer = null;

function initCustomerPickerMap() {
  const mapEl = document.getElementById('custPickerMap');
  if (!mapEl || custPickerMap) return;

  const initLat = appData?.factory?.lat || 17.816882513503195;
  const initLng = appData?.factory?.lng || 100.36169257553256;
  custPickerMap = L.map('custPickerMap').setView([initLat, initLng], 16);

  // Google Maps Hybrid (Satellite + Roads + Thai Place/Shop Names) & Google Streets
  custMapTileHybrid = L.tileLayer('https://mt1.google.com/vt/lyrs=y&hl=th&x={x}&y={y}&z={z}', {
    maxZoom: 20,
    attribution: '© Google Maps Hybrid'
  });
  custMapTileStreet = L.tileLayer('https://mt1.google.com/vt/lyrs=m&hl=th&x={x}&y={y}&z={z}', {
    maxZoom: 20,
    attribution: '© Google Maps'
  });

  // Default to Google Hybrid so user sees real roofs, roads, and Google shop pins
  custMapTileHybrid.addTo(custPickerMap);

  custPickerMarker = L.marker([initLat, initLng], { draggable: true }).addTo(custPickerMap);
  custPickerMarker.bindPopup('📍 หมุดที่อยู่ลูกค้า (คลิกจุดหลังคาบ้านหรือลากหมุดได้)').openPopup();

  custPickerMarker.on('dragend', () => {
    const pos = custPickerMarker.getLatLng();
    setCustomerLatLngInputs(pos.lat, pos.lng, 'กำหนดตำแหน่งจากการลากหมุดบนแผนที่');
  });

  custPickerMap.on('click', (e) => {
    const { lat, lng } = e.latlng;
    custPickerMarker.setLatLng([lat, lng]);
    setCustomerLatLngInputs(lat, lng, 'กำหนดตำแหน่งจากการคลิกบนแผนที่');
  });
}

function switchCustomerMapLayer(mode) {
  if (!custPickerMap || !custMapTileHybrid || !custMapTileStreet) return;
  const btnHybrid = document.getElementById('btnMapLayerHybrid');
  const btnStreet = document.getElementById('btnMapLayerStreet');
  if (mode === 'street') {
    if (custPickerMap.hasLayer(custMapTileHybrid)) custPickerMap.removeLayer(custMapTileHybrid);
    custMapTileStreet.addTo(custPickerMap);
    if (btnStreet) btnStreet.className = 'text-[11px] bg-sky-600 text-white px-2.5 py-0.5 rounded font-medium';
    if (btnHybrid) btnHybrid.className = 'text-[11px] bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded font-medium';
  } else {
    if (custPickerMap.hasLayer(custMapTileStreet)) custPickerMap.removeLayer(custMapTileStreet);
    custMapTileHybrid.addTo(custPickerMap);
    if (btnHybrid) btnHybrid.className = 'text-[11px] bg-sky-600 text-white px-2.5 py-0.5 rounded font-medium';
    if (btnStreet) btnStreet.className = 'text-[11px] bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded font-medium';
  }
}

function setCustomerLatLngInputs(lat, lng, reasonText = '') {
  const latEl = document.getElementById('custFormLat');
  const lngEl = document.getElementById('custFormLng');
  const statusEl = document.getElementById('custMapPinStatusText');
  if (latEl) latEl.value = Number(lat).toFixed(6);
  if (lngEl) lngEl.value = Number(lng).toFixed(6);
  if (statusEl && reasonText) {
    statusEl.textContent = `📍 ${reasonText} (${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)})`;
  }
}

function setCustomerPickerCoords(lat, lng, pan = true, zoom = 17, reasonText = '') {
  const numLat = Number(lat || 17.7915);
  const numLng = Number(lng || 100.3782);
  setCustomerLatLngInputs(numLat, numLng, reasonText);
  if (custPickerMarker && custPickerMap) {
    custPickerMarker.setLatLng([numLat, numLng]);
    const addrPreview = document.getElementById('custFormAddress')?.value || '';
    if (addrPreview) {
      custPickerMarker.bindPopup(`<b>📍 พิกัดที่อยู่ลูกค้า</b><br><span style="font-size:11px">${addrPreview}</span>`).openPopup();
    }
    if (pan) {
      custPickerMap.setView([numLat, numLng], zoom);
    }
  }
}

// Open Google Maps search in a new tab so user can right-click exact place and copy coordinates or URL
function openSearchInGoogleMaps() {
  const name = (document.getElementById('custFormName')?.value || '').trim();
  const houseNo = (document.getElementById('custFormHouseNo')?.value || '').trim();
  const moo = document.getElementById('custFormMoo')?.value || '';
  const sub = document.getElementById('custFormSubdistrict')?.value || 'จริม';
  const query = name
    ? `${name} ต.${sub} อ.ท่าปลา จ.อุตรดิตถ์`
    : `${houseNo} ${moo} ต.${sub} อ.ท่าปลา จ.อุตรดิตถ์`;
  window.open(`https://www.google.com/maps/search/${encodeURIComponent(query)}`, '_blank');
}

// Parse coordinates or URL copied from Google Maps
function parseGoogleMapsCoordsSync(raw) {
  if (!raw) return null;
  const text = String(raw).trim();

  // 1. Google Maps URL exact pin: !3d17.791528!4d100.378214
  const mPlace = text.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (mPlace) {
    return { lat: parseFloat(mPlace[1]), lng: parseFloat(mPlace[2]) };
  }

  // 2. Google Maps URL query: ?q=17.791528,100.378214 or ll=17.791528,100.378214
  const mQ = text.match(/[?&](?:q|ll|query|destination)=(-?\d+\.\d+)[,\s+]+(-?\d+\.\d+)/);
  if (mQ) {
    return { lat: parseFloat(mQ[1]), lng: parseFloat(mQ[2]) };
  }

  // 3. Google Maps URL viewport: @17.791528,100.378214
  const mAt = text.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (mAt) {
    return { lat: parseFloat(mAt[1]), lng: parseFloat(mAt[2]) };
  }

  // 4. DMS format: 17°47'29.5"N 100°22'41.6"E
  const mDms = text.match(/(\d+)[°\s]+(\d+)['\s]+(\d+(?:\.\d+)?)["\s]*([NS])[,\s]+(\d+)[°\s]+(\d+)['\s]+(\d+(?:\.\d+)?)["\s]*([EW])/i);
  if (mDms) {
    let lat = Number(mDms[1]) + Number(mDms[2]) / 60 + Number(mDms[3]) / 3600;
    if (mDms[4].toUpperCase() === 'S') lat = -lat;
    let lng = Number(mDms[5]) + Number(mDms[6]) / 60 + Number(mDms[7]) / 3600;
    if (mDms[8].toUpperCase() === 'W') lng = -lng;
    return { lat, lng };
  }

  // 5. Direct decimal pair: "17.791528, 100.378214" or "(17.791528, 100.378214)"
  const mPair = text.match(/(-?\d{1,2}\.\d{3,})[,\s/]+(-?\d{2,3}\.\d{3,})/);
  if (mPair) {
    const a = parseFloat(mPair[1]);
    const b = parseFloat(mPair[2]);
    if (a >= 5 && a <= 22 && b >= 97 && b <= 106) {
      return { lat: a, lng: b };
    }
    if (b >= 5 && b <= 22 && a >= 97 && a <= 106) {
      return { lat: b, lng: a };
    }
    return { lat: a, lng: b };
  }

  return null;
}

async function handleGoogleMapsPaste(rawText) {
  const text = String(rawText || '').trim();
  if (!text) return;

  const parsed = parseGoogleMapsCoordsSync(text);
  if (parsed && !isNaN(parsed.lat) && !isNaN(parsed.lng)) {
    setCustomerPickerCoords(parsed.lat, parsed.lng, true, 18, '✅ ดึงพิกัดตรงจาก Google Maps สำเร็จ');
    return;
  }

  // If it's a shortened Google Maps link (https://maps.app.goo.gl/... or https://goo.gl/maps/...)
  if (text.startsWith('http://') || text.startsWith('https://')) {
    const statusEl = document.getElementById('custMapPinStatusText');
    if (statusEl) statusEl.textContent = '⏳ กำลังแปลงลิงก์ Google Maps เป็นพิกัด...';
    try {
      const res = await fetch('/api/resolve-gmaps-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: text })
      });
      const out = await res.json();
      if (out.ok && out.lat && out.lng) {
        setCustomerPickerCoords(out.lat, out.lng, true, 18, '✅ ดึงพิกัดจากลิงก์แชร์ Google Maps สำเร็จ');
        return;
      }
      if (out.finalUrl) {
        const fromFinal = parseGoogleMapsCoordsSync(out.finalUrl);
        if (fromFinal) {
          setCustomerPickerCoords(fromFinal.lat, fromFinal.lng, true, 18, '✅ ดึงพิกัดจากลิงก์ Google Maps สำเร็จ');
          return;
        }
      }
      if (statusEl) statusEl.textContent = '⚠️ ไม่พบตัวเลขพิกัดในลิงก์นี้ แนะนำให้คลิกขวาจุดร้านใน Google Maps แล้วคลิกคัดลอกตัวเลขพิกัดบรรทัดแรก';
    } catch (e) {
      if (statusEl) statusEl.textContent = '⚠️ ไม่สามารถอ่านลิงก์ได้ แนะนำให้คัดลอกตัวเลขพิกัด เช่น 17.7915, 100.3782 มาวาง';
    }
  }
}

async function pasteFromClipboardToMap() {
  const inputEl = document.getElementById('custGoogleMapsPasteInput');
  try {
    const clipText = await navigator.clipboard.readText();
    if (clipText && inputEl) {
      inputEl.value = clipText.trim();
      await handleGoogleMapsPaste(clipText.trim());
    } else if (inputEl && inputEl.value.trim()) {
      await handleGoogleMapsPaste(inputEl.value.trim());
    } else {
      inputEl?.focus();
    }
  } catch (err) {
    if (inputEl && inputEl.value.trim()) {
      await handleGoogleMapsPaste(inputEl.value.trim());
    } else {
      inputEl?.focus();
    }
  }
}

function onManualLatLngInput() {
  const lat = parseFloat(document.getElementById('custFormLat')?.value);
  const lng = parseFloat(document.getElementById('custFormLng')?.value);
  if (!isNaN(lat) && !isNaN(lng) && custPickerMarker && custPickerMap) {
    custPickerMarker.setLatLng([lat, lng]);
    custPickerMap.panTo([lat, lng]);
  }
}

function initThaiAddressDropdowns() {
  const provEl = document.getElementById('custFormProvince');
  if (!provEl) return;
  const provinces = Object.keys(THAI_ADDRESS_DB);
  provEl.innerHTML = provinces.map(p => `<option value="${p}">${p}</option>`).join('');
  provEl.value = 'อุตรดิตถ์';
  onCustProvinceChange(false);
}

function onCustProvinceChange(panMap = true) {
  const prov = document.getElementById('custFormProvince')?.value || 'อุตรดิตถ์';
  const distEl = document.getElementById('custFormDistrict');
  if (!distEl) return;

  const districtsObj = THAI_ADDRESS_DB[prov] || THAI_ADDRESS_DB['อุตรดิตถ์'];
  const districts = Object.keys(districtsObj);
  distEl.innerHTML = districts.map(d => `<option value="${d}">${d}</option>`).join('');
  distEl.value = 'ท่าปลา';
  onCustDistrictChange(panMap);
}

function onCustDistrictChange(panMap = true) {
  const prov = document.getElementById('custFormProvince')?.value || 'อุตรดิตถ์';
  const dist = document.getElementById('custFormDistrict')?.value || 'ท่าปลา';
  const subEl = document.getElementById('custFormSubdistrict');
  if (!subEl) return;

  const subList = (THAI_ADDRESS_DB[prov] && THAI_ADDRESS_DB[prov][dist]) || [];
  subEl.innerHTML = subList.map(s => `<option value="${s.subdistrict}">ต.${s.subdistrict}</option>`).join('');
  onCustSubdistrictChange(panMap);
}

function onCustSubdistrictChange(panMap = true) {
  const prov = document.getElementById('custFormProvince')?.value || 'อุตรดิตถ์';
  const dist = document.getElementById('custFormDistrict')?.value || 'ท่าปลา';
  const sub = document.getElementById('custFormSubdistrict')?.value || 'จริม';
  const zipEl = document.getElementById('custFormPostalCode');
  const mooEl = document.getElementById('custFormMoo');
  const zoneEl = document.getElementById('custFormZone');

  const subList = (THAI_ADDRESS_DB[prov] && THAI_ADDRESS_DB[prov][dist]) || [];
  const matchedSub = subList.find(s => s.subdistrict === sub) || subList[0];

  if (zipEl && matchedSub) {
    zipEl.innerHTML = `<option value="${matchedSub.zip}">${matchedSub.zip}</option>`;
    zipEl.value = matchedSub.zip;
  }

  // Sync Delivery Zone automatically with the selected Tha Pla Tambon
  if (zoneEl && matchedSub) {
    zoneEl.value = `โซนท่าปลา - ต.${matchedSub.subdistrict}`;
  }

  // Populate Moos (หมู่ที่) for this Tambon
  if (mooEl && matchedSub && Array.isArray(matchedSub.moos)) {
    mooEl.innerHTML = matchedSub.moos.map(m =>
      `<option value="${m.moo}">${m.moo}</option>`
    ).join('');
    // Default to หมู่ 4 if ต.จริม, otherwise หมู่ 1
    if (matchedSub.subdistrict === 'จริม' && matchedSub.moos.some(m => m.moo === 'หมู่ 4')) {
      mooEl.value = 'หมู่ 4';
    } else {
      mooEl.value = matchedSub.moos[0].moo;
    }
  }

  onCustMooChange(panMap);
}

function onCustMooChange(panMap = true) {
  updateFullAddressPreview();
  if (panMap) {
    locateAddressOnMap(false);
  }
}

function onAddressDetailChange() {
  updateFullAddressPreview();
}

// Automatically pinpoint the map marker to match the specified Moo and Subdistrict (or exact landmark)
async function locateAddressOnMap(forceNominatim = false) {
  const name = (document.getElementById('custFormName')?.value || '').trim();
  const houseNo = (document.getElementById('custFormHouseNo')?.value || '').trim();
  const moo = document.getElementById('custFormMoo')?.value || 'หมู่ 1';
  const sub = document.getElementById('custFormSubdistrict')?.value || 'จริม';
  const dist = document.getElementById('custFormDistrict')?.value || 'ท่าปลา';
  const prov = document.getElementById('custFormProvince')?.value || 'อุตรดิตถ์';

  updateFullAddressPreview();

  // If user already pasted coordinates in the Google Maps paste box, don't overwrite them unless Moo/Tambon changed
  const pasteBoxVal = (document.getElementById('custGoogleMapsPasteInput')?.value || '').trim();
  if (pasteBoxVal) {
    const parsed = parseGoogleMapsCoordsSync(pasteBoxVal);
    if (parsed) {
      setCustomerPickerCoords(parsed.lat, parsed.lng, true, 18, 'ปักหมุดตามพิกัดที่วางจาก Google Maps');
      return;
    }
  }

  // 1. Check known exact landmarks in Amphoe Tha Pla first
  const combinedText = `${name} ${houseNo} ${moo} ${sub}`;
  const landmark = THAPLA_LANDMARKS.find(lm =>
    lm.subdistrict === sub && lm.keywords.some(kw => combinedText.includes(kw))
  );
  if (landmark) {
    setCustomerPickerCoords(landmark.lat, landmark.lng, true, 17, `พิกัดสถานที่: ${landmark.label}`);
    return;
  }

  // 2. Find Village (Moo) center coordinates inside Amphoe Tha Pla
  const subList = THAI_ADDRESS_DB[prov]?.[dist] || [];
  const matchedSub = subList.find(s => s.subdistrict === sub) || subList[0];
  const matchedMoo = matchedSub?.moos?.find(m => m.moo === moo) || matchedSub?.moos?.[0];

  const targetLat = matchedMoo ? matchedMoo.lat : (matchedSub?.lat || 17.7915);
  const targetLng = matchedMoo ? matchedMoo.lng : (matchedSub?.lng || 100.3782);
  const mooLabel = matchedMoo ? matchedMoo.moo : moo;

  setCustomerPickerCoords(
    targetLat,
    targetLng,
    true,
    17,
    `พิกัดโซน ${mooLabel} ต.${sub} (คลิกหลังคาบ้านบนแผนที่ หรือคัดลอกพิกัดจาก Google Maps มาวางได้เลย)`
  );
}

function setAddressDropdownValues(province, district, subdistrict, moo, postalCode) {
  const provEl = document.getElementById('custFormProvince');
  const distEl = document.getElementById('custFormDistrict');
  const subEl = document.getElementById('custFormSubdistrict');
  const mooEl = document.getElementById('custFormMoo');
  const zipEl = document.getElementById('custFormPostalCode');
  const zoneEl = document.getElementById('custFormZone');
  if (!provEl || !distEl || !subEl || !mooEl || !zipEl) return;

  provEl.value = 'อุตรดิตถ์';
  const districtsObj = THAI_ADDRESS_DB['อุตรดิตถ์'];
  distEl.innerHTML = `<option value="ท่าปลา">ท่าปลา</option>`;
  distEl.value = 'ท่าปลา';

  const subList = districtsObj['ท่าปลา'] || [];
  subEl.innerHTML = subList.map(s => `<option value="${s.subdistrict}">ต.${s.subdistrict}</option>`).join('');
  const matchedSub = subList.find(s => s.subdistrict === subdistrict) || subList[0];
  subEl.value = matchedSub.subdistrict;

  if (zoneEl) {
    zoneEl.value = `โซนท่าปลา - ต.${matchedSub.subdistrict}`;
  }

  const moosList = matchedSub.moos || [];
  mooEl.innerHTML = moosList.map(m => `<option value="${m.moo}">${m.moo}</option>`).join('');
  const cleanMoo = (moo || 'หมู่ 1').trim();
  if (moosList.some(m => m.moo === cleanMoo)) {
    mooEl.value = cleanMoo;
  } else if (cleanMoo) {
    const opt = document.createElement('option');
    opt.value = cleanMoo;
    opt.textContent = cleanMoo;
    mooEl.appendChild(opt);
    mooEl.value = cleanMoo;
  } else {
    mooEl.value = moosList[0]?.moo || 'หมู่ 1';
  }

  zipEl.innerHTML = `<option value="${matchedSub.zip}">${matchedSub.zip}</option>`;
  zipEl.value = postalCode || matchedSub.zip || '53150';

  updateFullAddressPreview();
}

function updateFullAddressPreview() {
  const houseNo = (document.getElementById('custFormHouseNo')?.value || '').trim();
  const moo = document.getElementById('custFormMoo')?.value || 'หมู่ 1';
  const sub = document.getElementById('custFormSubdistrict')?.value || 'จริม';
  const dist = document.getElementById('custFormDistrict')?.value || 'ท่าปลา';
  const prov = document.getElementById('custFormProvince')?.value || 'อุตรดิตถ์';
  const zip = document.getElementById('custFormPostalCode')?.value || '53150';
  const addrEl = document.getElementById('custFormAddress');
  if (addrEl) {
    addrEl.value = houseNo
      ? `บ้านเลขที่ ${houseNo} ${moo} ต.${sub} อ.${dist} จ.${prov} ${zip}`.trim()
      : `${moo} ต.${sub} อ.${dist} จ.${prov} ${zip}`.trim();
  }
}

function renderCustomersMasterView() {
  if (!appData || !Array.isArray(appData.customers)) return;
  populateCustomerPriceTierDropdown();
  const customers = appData.customers;

  // Update KPI Cards
  const activeCount = customers.filter(c => (c.status || 'active') === 'active').length;
  const totalCredit = customers.reduce((s, c) => s + Number(c.creditBalance || 0), 0);
  const totalCreditLimit = customers.reduce((s, c) => s + Number(c.creditLimit || 5000), 0);
  const totalBottles = customers.reduce((s, c) => s + Number(c.OutstandingBottles || 0), 0);
  const totalDeposit = customers.reduce((s, c) => s + Number(c.bottleDeposit ?? (Number(c.OutstandingBottles || 0) * 100)), 0);

  const elTotal = document.getElementById('crmKpiTotalCustomers');
  const elActiveSub = document.getElementById('crmKpiActiveSub');
  const elCredit = document.getElementById('crmKpiTotalCredit');
  const elLimitSub = document.getElementById('crmKpiCreditLimitSub');
  const elBottles = document.getElementById('crmKpiTotalBottles');
  const elDeposit = document.getElementById('crmKpiTotalDeposit');

  if (elTotal) elTotal.textContent = `${customers.length} ราย`;
  if (elActiveSub) elActiveSub.textContent = `บัญชีใช้งานปกติ ${activeCount} ราย`;
  if (elCredit) elCredit.textContent = `฿${totalCredit.toLocaleString()}`;
  if (elLimitSub) elLimitSub.textContent = `วงเงินเครดิตรวมทั้งระบบ ฿${totalCreditLimit.toLocaleString()}`;
  if (elBottles) elBottles.textContent = `${totalBottles.toLocaleString()} ถัง`;
  if (elDeposit) elDeposit.textContent = `฿${totalDeposit.toLocaleString()}`;

  // Filter table rows
  const q = (document.getElementById('custSearchInput')?.value || '').trim().toLowerCase();
  const zoneFilter = document.getElementById('custZoneFilter')?.value || 'ALL';
  const typeFilter = document.getElementById('custTypeFilter')?.value || 'ALL';

  const filtered = customers.filter(c => {
    const matchZone = zoneFilter === 'ALL' || c.zone === zoneFilter;
    const matchType = typeFilter === 'ALL' || (c.customerType || 'ร้านค้าปลีก-ส่ง / ตัวแทน') === typeFilter;
    const text = `${c.id} ${c.name} ${c.contactPerson || ''} ${c.phone || ''} ${c.taxId || ''} ${c.address || ''}`.toLowerCase();
    const matchSearch = !q || text.includes(q);
    return matchZone && matchType && matchSearch;
  });

  const tbody = document.getElementById('customersMasterTableBody');
  if (!tbody) return;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" class="p-6 text-center text-slate-400">ไม่พบข้อมูลลูกค้าตามเงื่อนไขที่ค้นหา</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(c => {
    const status = c.status || 'active';
    const statusBadge = status === 'active'
      ? `<span class="bg-teal-50 text-teal-700 border border-teal-100 px-2 py-0.5 rounded-full text-[11px] font-medium">ปกติ</span>`
      : status === 'suspended'
        ? `<span class="bg-amber-50 text-amber-700 border border-amber-100 px-2 py-0.5 rounded-full text-[11px] font-medium">ระงับชั่วคราว</span>`
        : `<span class="bg-rose-50 text-rose-600 border border-rose-100 px-2 py-0.5 rounded-full text-[11px] font-medium">ปิดบัญชี</span>`;

    const p189 = Number(c.price189L ?? 0);
    const p350 = Number(c.price350ml ?? 0);
    const p600 = Number(c.price600ml ?? 0);
    const p1500 = Number(c.price1500ml ?? 0);
    const deposit = Number(c.bottleDeposit ?? (Number(c.OutstandingBottles || 0) * 100));
    const creditBal = Number(c.creditBalance || 0);
    const creditLim = Number(c.creditLimit || 0);

    const custOrders = (appData?.orders || []).filter(o => o.customerId === c.id);
    const pendingCustOrders = custOrders.filter(o => o.orderStatus !== 'จัดส่งสำเร็จแล้ว');
    const orderLinkPill = pendingCustOrders.length > 0
      ? `<div class="mt-1"><button type="button" onclick="filterOrdersByCustomer('${c.id}')" class="inline-flex items-center gap-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 px-1.5 py-0.5 rounded text-[10px] font-bold cursor-pointer transition" title="คลิกเพื่อดูใบสั่งออเดอร์ของลูกค้ารายนี้">⏳ ค้างส่ง ${pendingCustOrders.length} ใบ</button></div>`
      : custOrders.length > 0
        ? `<div class="mt-1"><button type="button" onclick="filterOrdersByCustomer('${c.id}')" class="inline-flex items-center gap-1 bg-slate-50 hover:bg-slate-100 text-slate-500 border border-slate-200 px-1.5 py-0.5 rounded text-[10px] cursor-pointer transition" title="คลิกเพื่อดูประวัติออเดอร์ทั้งหมด">📜 ออเดอร์ ${custOrders.length} ใบ</button></div>`
        : `<div class="mt-1 text-[10px] text-slate-400">ยังไม่มีออเดอร์</div>`;

    const deliveryDaysPills = c.deliveryDays
      ? c.deliveryDays.split(',').map(d => `<span class="bg-sky-50 text-sky-700 border border-sky-100 px-1.5 py-0.5 rounded text-[11px] font-medium whitespace-nowrap">${d.trim()}</span>`).join('')
      : '<span class="text-slate-400 text-[11px]">-</span>';

    return `
      <tr class="hover:bg-slate-50/80 transition">
        <td class="p-2.5 align-top whitespace-nowrap">
          <div class="font-mono font-semibold text-slate-700">${c.id}</div>
          <div class="text-[11px] text-slate-400 mt-0.5">${c.customerType || 'ร้านค้าปลีก-ส่ง / ตัวแทน'}</div>
        </td>
        <td class="p-2.5 align-top">
          <div class="font-semibold text-slate-800 text-xs">${c.name}</div>
          <div class="text-[11px] text-slate-500 mt-0.5">👤 ${c.contactPerson || 'เจ้าของร้าน'} • 📞 ${c.phone || '-'}</div>
          ${c.taxId ? `<div class="text-[10px] font-mono text-slate-400 mt-0.5">เลขบัตรประชาชน / เลขผู้เสียภาษี: ${c.taxId}</div>` : ''}
          ${c.notes ? `<div class="text-[10px] text-slate-600 bg-slate-100 inline-block px-1.5 py-0.5 rounded mt-1">📌 ${c.notes}</div>` : ''}
        </td>
        <td class="p-2.5 align-top text-center whitespace-nowrap">
          ${custOrders.length > 0 ? `
            <button type="button" onclick="filterOrdersByCustomer('${c.id}')" class="inline-flex items-center gap-1.5 bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-300 font-bold px-2.5 py-1 rounded-lg text-xs cursor-pointer transition shadow-2xs" title="คลิกเพื่อดูรายการออเดอร์ของลูกค้ารายนี้">
              <span>📜</span> <span>ออเดอร์ ${custOrders.length} ใบ</span>
            </button>
            ${pendingCustOrders.length > 0 ? `
              <div class="mt-1">
                <span class="bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 rounded-full text-[10px] font-bold inline-block">
                  ⏳ รอส่ง ${pendingCustOrders.length} ใบ
                </span>
              </div>
            ` : `
              <div class="text-[10px] text-emerald-700 font-medium mt-0.5">✓ ส่งสำเร็จครบ</div>
            `}
          ` : `
            <span class="text-[11px] text-slate-400 font-medium">- ยังไม่มี -</span>
          `}
        </td>
        <td class="p-2.5 align-top">
          <span class="bg-sky-50 text-sky-700 border border-sky-100 text-[11px] font-medium px-2 py-0.5 rounded">${c.zone}</span>
          <div class="text-[11px] text-slate-600 mt-1">${c.address || '-'}</div>
          <a href="https://www.google.com/maps?q=${c.lat},${c.lng}" target="_blank" class="text-[10px] font-mono text-sky-600 hover:underline inline-block mt-0.5">
            📍 ${Number(c.lat).toFixed(4)}, ${Number(c.lng).toFixed(4)}
          </a>
        </td>
        <td class="p-2.5 align-top text-center">
          <div class="inline-flex flex-wrap items-center justify-center gap-1 max-w-[130px]">
            ${deliveryDaysPills}
          </div>
        </td>
        <td class="p-2.5 align-top text-center">
          <div class="font-medium text-slate-700">${c.paymentTerm || 'เงินสด / โอนเงิน'}</div>
          <div class="text-[11px] font-mono font-semibold text-slate-600 mt-0.5">฿${p189} / ฿${p350} / ฿${p600} / ฿${p1500}</div>
          <div class="text-[10px] text-slate-400">${c.priceTier || 'ราคาส่งร้านค้า'}</div>
        </td>
        <td class="p-2.5 align-top text-right">
          <div class="font-semibold text-slate-700">${c.OutstandingBottles || 0} ถัง</div>
          <div class="text-[11px] text-teal-600">มัดจำ ฿${deposit.toLocaleString()}</div>
        </td>
        <td class="p-2.5 align-top text-right">
          <div class="font-semibold ${creditBal > 0 ? 'text-amber-700' : 'text-slate-600'}">฿${creditBal.toLocaleString()}</div>
          <div class="text-[10px] text-slate-400">วงเงิน ฿${creditLim.toLocaleString()}</div>
        </td>
        <td class="p-2.5 align-top text-center">
          ${statusBadge}
        </td>
        <td class="p-2.5 align-top text-center">
          <div class="flex items-center justify-center gap-1">
            <button type="button" onclick="openCustomerSecurityModal('${c.id}')" title="จัดการรหัส PIN และ LINE ของลูกค้า" class="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-medium px-2 py-1 rounded-lg text-[11px] transition flex items-center gap-0.5">
              <span>🔐</span><span>PIN</span>
            </button>
            <button type="button" onclick="editCustomerRecord('${c.id}')" class="bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium px-2 py-1 rounded-lg text-[11px] transition">
              แก้ไข
            </button>
            <button type="button" onclick="deleteCustomerRecord('${c.id}')" class="bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-600 border border-slate-200 font-medium px-2 py-1 rounded-lg text-[11px] transition">
              ลบ
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function onCustDeliveryDayToggle() {
  const checked = Array.from(document.querySelectorAll('input[name="custDeliveryDay"]:checked')).map(cb => cb.value);
  const hiddenInput = document.getElementById('custFormDeliveryDays');
  if (hiddenInput) {
    hiddenInput.value = checked.join(', ');
  }
}

function setDeliveryDaysCheckboxes(daysStr) {
  const days = (daysStr || '').split(',').map(s => s.trim()).filter(Boolean);
  document.querySelectorAll('input[name="custDeliveryDay"]').forEach(cb => {
    cb.checked = days.includes(cb.value);
  });
  const hiddenInput = document.getElementById('custFormDeliveryDays');
  if (hiddenInput) {
    hiddenInput.value = days.join(', ');
  }
}

// ==========================================
// PRICE TIER MANAGEMENT & CUSTOMER PRESETS
// ==========================================
let workingPriceTiers = [];

function getAppPriceTiers() {
  if (Array.isArray(appData?.priceTiers) && appData.priceTiers.length > 0) {
    return appData.priceTiers;
  }
  return [
    { id: 'tier-custom', name: 'กำหนดราคาเอง', price189L: 0, price350ml: 0, price600ml: 0, price1500ml: 0 },
    { id: 'tier-wholesale', name: 'ราคาส่งร้านค้า', price189L: 15, price350ml: 32, price600ml: 35, price1500ml: 35 },
    { id: 'tier-vip', name: 'ราคาตัวแทนจำหน่าย VIP', price189L: 12, price350ml: 30, price600ml: 32, price1500ml: 32 },
    { id: 'tier-gov', name: 'ราคาหน่วยงานราชการ', price189L: 12, price350ml: 30, price600ml: 32, price1500ml: 32 },
    { id: 'tier-retail', name: 'ราคาปลีกมาตรฐาน', price189L: 20, price350ml: 35, price600ml: 40, price1500ml: 40 }
  ];
}

function populateCustomerPriceTierDropdown(preferredTier) {
  const select = document.getElementById('custFormPriceTier');
  if (!select) return;

  const tiers = getAppPriceTiers();
  const currentVal = preferredTier !== undefined ? preferredTier : select.value;

  select.innerHTML = tiers.map(t => {
    const isCustom = t.id === 'tier-custom' || t.name === 'กำหนดราคาเอง';
    const label = isCustom 
      ? `${t.name} (0 / 0 / 0 / 0)`
      : `${t.name} (${t.price189L} / ${t.price350ml ?? 0} / ${t.price600ml} / ${t.price1500ml})`;
    return `<option value="${t.name}">${label}</option>`;
  }).join('') + '<option value="__MANAGE__">⚙️ [+ แก้ไข/เพิ่มระดับราคาในระบบ...]</option>';

  const hasVal = Array.from(select.options).some(o => o.value === currentVal);
  if (hasVal) {
    select.value = currentVal;
  } else if (tiers.length > 0) {
    select.value = tiers[0].name;
  }
}

function applyCustomerPriceTierPreset() {
  const select = document.getElementById('custFormPriceTier');
  if (!select) return;
  const tierName = select.value;

  if (tierName === '__MANAGE__') {
    select.value = 'กำหนดราคาเอง';
    openPriceTierManagerModal();
    return;
  }

  const p189 = document.getElementById('custFormPrice189');
  const p350 = document.getElementById('custFormPrice350');
  const p600 = document.getElementById('custFormPrice600');
  const p1500 = document.getElementById('custFormPrice1500');

  const tiers = getAppPriceTiers();
  const matched = tiers.find(t => t.name === tierName);

  if (matched) {
    if (p189) p189.value = matched.price189L ?? 0;
    if (p350) p350.value = matched.price350ml ?? 0;
    if (p600) p600.value = matched.price600ml ?? 0;
    if (p1500) p1500.value = matched.price1500ml ?? 0;
  } else if (tierName === 'กำหนดราคาเอง') {
    if (p189) p189.value = 0;
    if (p350) p350.value = 0;
    if (p600) p600.value = 0;
    if (p1500) p1500.value = 0;
  }
}

function onCustomerPriceInputChange() {
  const select = document.getElementById('custFormPriceTier');
  if (!select) return;

  const currentTier = select.value;
  if (currentTier === 'กำหนดราคาเอง' || currentTier === '__MANAGE__') return;

  const p189 = Number(document.getElementById('custFormPrice189')?.value || 0);
  const p350 = Number(document.getElementById('custFormPrice350')?.value || 0);
  const p600 = Number(document.getElementById('custFormPrice600')?.value || 0);
  const p1500 = Number(document.getElementById('custFormPrice1500')?.value || 0);

  const tiers = getAppPriceTiers();
  const matched = tiers.find(t => t.name === currentTier);

  if (matched) {
    if (p189 !== (matched.price189L ?? 0) ||
        p350 !== (matched.price350ml ?? 0) ||
        p600 !== (matched.price600ml ?? 0) ||
        p1500 !== (matched.price1500ml ?? 0)) {
      select.value = 'กำหนดราคาเอง';
    }
  }
}

function openPriceTierManagerModal() {
  const modal = document.getElementById('modal-price-tiers');
  if (!modal) return;

  const tiers = getAppPriceTiers();
  workingPriceTiers = JSON.parse(JSON.stringify(tiers));

  renderPriceTierManagerRows();
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closePriceTierManagerModal() {
  const modal = document.getElementById('modal-price-tiers');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

function renderPriceTierManagerRows() {
  const tbody = document.getElementById('priceTierManagerTableBody');
  if (!tbody) return;

  tbody.innerHTML = workingPriceTiers.map((t, idx) => {
    const isCustom = t.id === 'tier-custom' || t.name === 'กำหนดราคาเอง';
    return `
      <tr class="hover:bg-slate-50">
        <td class="p-2">
          <input type="text" value="${t.name || ''}" onchange="updateWorkingTierField(${idx}, 'name', this.value)"
            class="w-full border border-slate-300 rounded px-2 py-1 text-xs font-semibold text-slate-800"
            placeholder="ชื่อระดับราคา" ${isCustom ? 'readonly' : ''} />
        </td>
        <td class="p-2 text-center">
          <input type="number" step="0.5" value="${t.price189L ?? 0}" onchange="updateWorkingTierField(${idx}, 'price189L', this.value)"
            class="w-20 border border-slate-300 rounded px-2 py-1 text-xs text-center font-mono font-semibold" ${isCustom ? 'readonly' : ''} />
        </td>
        <td class="p-2 text-center">
          <input type="number" step="0.5" value="${t.price350ml ?? 0}" onchange="updateWorkingTierField(${idx}, 'price350ml', this.value)"
            class="w-20 border border-slate-300 rounded px-2 py-1 text-xs text-center font-mono font-semibold" ${isCustom ? 'readonly' : ''} />
        </td>
        <td class="p-2 text-center">
          <input type="number" step="0.5" value="${t.price600ml ?? 0}" onchange="updateWorkingTierField(${idx}, 'price600ml', this.value)"
            class="w-20 border border-slate-300 rounded px-2 py-1 text-xs text-center font-mono font-semibold" ${isCustom ? 'readonly' : ''} />
        </td>
        <td class="p-2 text-center">
          <input type="number" step="0.5" value="${t.price1500ml ?? 0}" onchange="updateWorkingTierField(${idx}, 'price1500ml', this.value)"
            class="w-20 border border-slate-300 rounded px-2 py-1 text-xs text-center font-mono font-semibold" ${isCustom ? 'readonly' : ''} />
        </td>
        <td class="p-2 text-center">
          ${isCustom ? '<span class="text-[11px] text-slate-400 font-medium">ค่าเริ่มต้น</span>' : `
            <button type="button" onclick="deletePriceTierRow(${idx})" class="text-rose-500 hover:text-rose-700 p-1 text-xs font-bold" title="ลบระดับราคานี้">
              🗑️
            </button>
          `}
        </td>
      </tr>
    `;
  }).join('');
}

function updateWorkingTierField(idx, field, val) {
  if (!workingPriceTiers[idx]) return;
  if (field === 'name') {
    workingPriceTiers[idx].name = val.trim();
  } else {
    workingPriceTiers[idx][field] = Number(val) || 0;
  }
}

function addNewPriceTierRow() {
  const newId = 'tier-' + Date.now();
  workingPriceTiers.push({
    id: newId,
    name: 'ระดับราคาใหม่ ' + (workingPriceTiers.length + 1),
    price189L: 15,
    price350ml: 32,
    price600ml: 35,
    price1500ml: 35
  });
  renderPriceTierManagerRows();
}

function deletePriceTierRow(idx) {
  if (!confirm(`ต้องการลบระดับราคา "${workingPriceTiers[idx]?.name}" หรือไม่?`)) return;
  workingPriceTiers.splice(idx, 1);
  renderPriceTierManagerRows();
}

async function savePriceTiersFromModal() {
  for (let i = 0; i < workingPriceTiers.length; i++) {
    const t = workingPriceTiers[i];
    if (!t.name || !t.name.trim()) {
      alert(`กรุณาระบุชื่อระดับราคาในแถวที่ ${i + 1}`);
      return;
    }
  }

  try {
    const res = await fetch('/api/price-tiers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceTiers: workingPriceTiers })
    });
    const out = await res.json();
    if (out.ok) {
      if (appData) {
        appData.priceTiers = out.data;
      }
      populateCustomerPriceTierDropdown();
      applyCustomerPriceTierPreset();
      closePriceTierManagerModal();
      alert('✅ บันทึกระดับราคาเรียบร้อยแล้ว');
    } else {
      alert(out.error || 'เกิดข้อผิดพลาดในการบันทึกระดับราคา');
    }
  } catch (err) {
    console.error('Failed to save price tiers:', err);
    alert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
  }
}

function previewCustomerFormGps() {
  const lat = document.getElementById('custFormLat')?.value || 17.7915;
  const lng = document.getElementById('custFormLng')?.value || 100.3782;
  window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank');
}

function recalcCustomerDepositTotal() {
  const bVal = document.getElementById('custFormDepositBottles')?.value;
  const rVal = document.getElementById('custFormDepositRate')?.value;
  const b = Number(bVal || 0);
  const r = Number(rVal || 0);
  const totalEl = document.getElementById('custFormDepositAmount');
  if (totalEl) {
    totalEl.value = b * r;
  }
}

function resetCustomerMasterForm() {
  const card = document.getElementById('customerMasterFormCard');
  const badge = document.getElementById('custFormModeBadge');
  const title = document.getElementById('custFormTitle');
  const btn = document.getElementById('btnSubmitCustomerForm');
  const msg = document.getElementById('custFormFeedbackMsg');
  const pasteEl = document.getElementById('custGoogleMapsPasteInput');

  if (card) card.className = 'bg-white rounded-xl p-5 shadow-sm border border-slate-200 space-y-4';
  if (badge) {
    badge.className = 'bg-white/20 text-white border border-white/30 text-xs font-semibold px-2.5 py-0.5 rounded-full';
    badge.textContent = 'เพิ่มลูกค้าใหม่';
  }
  if (title) title.textContent = '👥 ทะเบียนลูกค้า';
  if (btn) btn.textContent = '💾 บันทึกข้อมูลลูกค้า';
  if (msg) msg.classList.add('hidden');
  if (pasteEl) pasteEl.value = '';
  const phoneWarn = document.getElementById('custPhoneDuplicateWarning');
  if (phoneWarn) phoneWarn.classList.add('hidden');

  document.getElementById('custFormId').value = '';
  document.getElementById('custFormType').value = 'ร้านค้าปลีก-ส่ง / ตัวแทน';
  document.getElementById('custFormName').value = '';
  document.getElementById('custFormContact').value = '';
  document.getElementById('custFormPhone').value = '';
  document.getElementById('custFormTaxId').value = '';
  if (document.getElementById('custFormBranch')) document.getElementById('custFormBranch').value = '';
  document.getElementById('custFormStatus').value = 'active';
  document.getElementById('custFormHouseNo').value = '';
  setAddressDropdownValues('อุตรดิตถ์', 'ท่าปลา', 'จริม', 'หมู่ 1', '53150');
  setCustomerPickerCoords(appData?.factory?.lat || 17.816882513503195, appData?.factory?.lng || 100.36169257553256, true, 16, 'พิกัดเริ่มต้น: โรงงานน้ำดื่มอินธารา');
  setDeliveryDaysCheckboxes('');
  document.getElementById('custFormPriority').value = 'normal';
  document.getElementById('custFormPaymentTerm').value = 'เงินสด / โอนเงิน';
  populateCustomerPriceTierDropdown('กำหนดราคาเอง');
  document.getElementById('custFormPrice189').value = '0';
  if (document.getElementById('custFormPrice350')) document.getElementById('custFormPrice350').value = '0';
  document.getElementById('custFormPrice600').value = '0';
  document.getElementById('custFormPrice1500').value = '0';
  document.getElementById('custFormDepositBottles').value = '0';
  document.getElementById('custFormDepositRate').value = '0';
  document.getElementById('custFormDepositAmount').value = '0';
  document.getElementById('custFormCreditLimit').value = '0';
  document.getElementById('custFormCreditBalance').value = '0';
  document.getElementById('custFormBottlesHeld').value = '0';
  document.getElementById('custFormNotes').value = '';
}

function editCustomerRecord(custId) {
  if (!appData || !Array.isArray(appData.customers)) return;
  const c = appData.customers.find(item => item.id === custId);
  if (!c) return;

  const card = document.getElementById('customerMasterFormCard');
  const badge = document.getElementById('custFormModeBadge');
  const title = document.getElementById('custFormTitle');
  const btn = document.getElementById('btnSubmitCustomerForm');
  const msg = document.getElementById('custFormFeedbackMsg');
  const pasteEl = document.getElementById('custGoogleMapsPasteInput');

  if (card) card.className = 'bg-white rounded-xl p-5 shadow-sm border border-amber-300 space-y-4';
  if (badge) {
    badge.className = 'bg-amber-300 text-slate-950 text-xs font-bold px-2.5 py-0.5 rounded-full shadow-sm';
    badge.textContent = `แก้ไข [${c.id}]`;
  }
  if (title) title.textContent = `👥 ${c.name} (${c.id})`;
  if (btn) btn.textContent = `💾 บันทึกการแก้ไข (${c.id})`;
  if (msg) msg.classList.add('hidden');
  if (pasteEl) pasteEl.value = `${Number(c.lat ?? 17.7915).toFixed(6)}, ${Number(c.lng ?? 100.3782).toFixed(6)}`;
  const phoneWarn = document.getElementById('custPhoneDuplicateWarning');
  if (phoneWarn) phoneWarn.classList.add('hidden');

  document.getElementById('custFormId').value = c.id;
  document.getElementById('custFormType').value = c.customerType || 'ร้านค้าปลีก-ส่ง / ตัวแทน';
  document.getElementById('custFormName').value = c.name || '';
  document.getElementById('custFormContact').value = c.contactPerson || '';
  document.getElementById('custFormPhone').value = c.phone || '';
  document.getElementById('custFormTaxId').value = c.taxId || '';
  if (document.getElementById('custFormBranch')) document.getElementById('custFormBranch').value = c.branchType || 'สำนักงานใหญ่';
  document.getElementById('custFormStatus').value = c.status || 'active';
  document.getElementById('custFormHouseNo').value = c.houseNo || '';

  setAddressDropdownValues(
    'อุตรดิตถ์',
    'ท่าปลา',
    c.subdistrict || 'จริม',
    c.moo || 'หมู่ 1',
    c.postalCode || '53150'
  );
  if (c.zone) {
    document.getElementById('custFormZone').value = c.zone;
  }
  setCustomerPickerCoords(c.lat ?? 17.7915, c.lng ?? 100.3782, true, 18, `พิกัดปัจจุบันของ ${c.name}`);

  setDeliveryDaysCheckboxes(c.deliveryDays || '');
  document.getElementById('custFormPriority').value = c.priority || 'normal';
  document.getElementById('custFormPaymentTerm').value = c.paymentTerm || 'เงินสด / โอนเงิน';
  populateCustomerPriceTierDropdown(c.priceTier || 'ราคาส่งร้านค้า');
  document.getElementById('custFormPrice189').value = c.price189L ?? 0;
  if (document.getElementById('custFormPrice350')) document.getElementById('custFormPrice350').value = c.price350ml ?? 0;
  document.getElementById('custFormPrice600').value = c.price600ml ?? 0;
  document.getElementById('custFormPrice1500').value = c.price1500ml ?? 0;
  const depBottles = Number(c.depositBottles ?? (c.bottleDeposit ? Math.round(c.bottleDeposit / (c.depositRate || 200)) : 0));
  const depRate = Number(c.depositRate ?? 0);
  const depAmount = Number(c.bottleDeposit ?? (depBottles * depRate));
  document.getElementById('custFormDepositBottles').value = depBottles;
  document.getElementById('custFormDepositRate').value = depRate;
  document.getElementById('custFormDepositAmount').value = depAmount;
  document.getElementById('custFormCreditLimit').value = Number(c.creditLimit || 0);
  document.getElementById('custFormCreditBalance').value = Number(c.creditBalance || 0);
  document.getElementById('custFormBottlesHeld').value = Number(c.OutstandingBottles || 0);
  document.getElementById('custFormNotes').value = c.notes || '';

  if (card) {
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function checkCustomerPhoneDuplicateHint() {
  const phoneEl = document.getElementById('custFormPhone');
  const warnEl = document.getElementById('custPhoneDuplicateWarning');
  const existingId = document.getElementById('custFormId')?.value?.trim() || '';
  if (!phoneEl || !warnEl || !appData || !Array.isArray(appData.customers)) return null;

  const digits = phoneEl.value.replace(/\D/g, '');
  if (digits.length < 9) {
    warnEl.classList.add('hidden');
    return null;
  }

  const dup = appData.customers.find(c => {
    if (existingId && c.id === existingId) return false;
    return String(c.phone || '').replace(/\D/g, '') === digits;
  });

  if (dup) {
    warnEl.innerHTML = `⚠️ เบอร์นี้ลงทะเบียนไว้แล้วกับ <strong>[${dup.id}] ${dup.name}</strong> (1 เจ้า / 1 เบอร์เท่านั้น) <button type="button" onclick="editCustomerRecord('${dup.id}')" class="underline font-bold ml-1 text-sky-600">คลิกเพื่อแก้ไขลูกค้ารายเดิม</button>`;
    warnEl.classList.remove('hidden');
    return dup;
  } else {
    warnEl.classList.add('hidden');
    return null;
  }
}

async function submitCustomerMasterForm(e) {
  e.preventDefault();
  updateFullAddressPreview();
  const existingId = document.getElementById('custFormId').value.trim();

  // Check duplicate phone before submitting
  const dupCust = checkCustomerPhoneDuplicateHint();
  if (dupCust) {
    alert(`ไม่สามารถลงทะเบียนซ้ำได้: เบอร์โทรศัพท์นี้ถูกลงทะเบียนไว้แล้วกับลูกค้า [${dupCust.id}] "${dupCust.name}"\n\n(ลูกค้า 1 เจ้า สามารถลงทะเบียนได้แค่ 1 เบอร์โทรศัพท์เท่านั้น หากต้องการเปลี่ยนเบอร์กรุณากดแก้ไขข้อมูลลูกค้ารายเดิม)`);
    return;
  }

  const payload = {
    id: existingId || undefined,
    customerType: document.getElementById('custFormType').value,
    name: document.getElementById('custFormName').value.trim(),
    contactPerson: document.getElementById('custFormContact').value.trim(),
    phone: document.getElementById('custFormPhone').value.trim(),
    taxId: document.getElementById('custFormTaxId').value.trim(),
    branchType: document.getElementById('custFormBranch')?.value?.trim() || 'สำนักงานใหญ่',
    status: document.getElementById('custFormStatus').value,
    zone: document.getElementById('custFormZone').value,
    houseNo: document.getElementById('custFormHouseNo').value.trim(),
    moo: document.getElementById('custFormMoo').value,
    province: document.getElementById('custFormProvince').value,
    district: document.getElementById('custFormDistrict').value,
    subdistrict: document.getElementById('custFormSubdistrict').value,
    postalCode: document.getElementById('custFormPostalCode').value,
    address: document.getElementById('custFormAddress').value.trim(),
    lat: Number(document.getElementById('custFormLat').value),
    lng: Number(document.getElementById('custFormLng').value),
    deliveryDays: (document.getElementById('custFormDeliveryDays')?.value || '').trim(),
    priority: document.getElementById('custFormPriority').value,
    paymentTerm: document.getElementById('custFormPaymentTerm').value,
    priceTier: document.getElementById('custFormPriceTier').value,
    price189L: Number(document.getElementById('custFormPrice189').value),
    price350ml: Number(document.getElementById('custFormPrice350')?.value || 0),
    price600ml: Number(document.getElementById('custFormPrice600').value),
    price1500ml: Number(document.getElementById('custFormPrice1500').value),
    depositBottles: Number(document.getElementById('custFormDepositBottles')?.value || 0),
    depositRate: Number(document.getElementById('custFormDepositRate')?.value || 200),
    bottleDeposit: Number(document.getElementById('custFormDepositAmount')?.value || 0),
    creditLimit: Number(document.getElementById('custFormCreditLimit')?.value || 0),
    creditBalance: Number(document.getElementById('custFormCreditBalance')?.value || 0),
    OutstandingBottles: Number(document.getElementById('custFormBottlesHeld')?.value || 0),
    notes: document.getElementById('custFormNotes').value.trim()
  };

  try {
    const res = await fetch('/api/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const out = await res.json();
    if (out.ok) {
      appData = out.data;
      renderAllViews();
      resetCustomerMasterForm();
      const msg = document.getElementById('custFormFeedbackMsg');
      if (msg) {
        msg.textContent = existingId
          ? `✅ บันทึกการแก้ไขข้อมูลลูกค้า [${existingId}] "${payload.name}" เรียบร้อยแล้ว`
          : `✅ เพิ่มลูกค้าใหม่ "${payload.name}" เข้าสู่ระบบและอัปเดตจุดส่ง GPS เรียบร้อยแล้ว`;
        msg.classList.remove('hidden');
      }
    } else {
      alert(out.error || 'ไม่สามารถบันทึกข้อมูลลูกค้าได้');
    }
  } catch (err) {
    alert('เกิดข้อผิดพลาดในการบันทึกข้อมูลลูกค้า');
  }
}

async function deleteCustomerRecord(custId) {
  const c = appData?.customers?.find(item => item.id === custId);
  if (!c) return;
  if (!confirm(`ยืนยันการลบข้อมูลลูกค้า [${c.id}] "${c.name}" ออกจากระบบ?`)) return;

  try {
    const res = await fetch(`/api/customers/${encodeURIComponent(custId)}`, { method: 'DELETE' });
    const out = await res.json();
    if (out.ok) {
      appData = out.data;
      renderAllViews();
    }
  } catch (err) {
    alert('ไม่สามารถลบข้อมูลลูกค้าได้');
  }
}

// ==========================================
// 10. SALES ORDER FORM & ORDER MANAGEMENT (SEPARATE FROM CUSTOMER DB)
// ==========================================
let currentOrderStatusFilter = 'all'; // Default: แสดงทั้งหมด หรือเลือกตามสถานะได้ ('all', 'pending', 'completed')

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
  currentOrderStatusFilter = (status === 'completed' || status === 'pending' || status === 'unpaid' || status === 'all') ? status : 'all';

  // If clicking "unpaid" tab, clear the date filter so staff can see all unpaid bills across any date!
  if (status === 'unpaid') {
    const dateInput = document.getElementById('ordDateFilterInput');
    if (dateInput) dateInput.value = '';
  }

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
      `<option value="${c.id}">${c.id} — ${c.name} (${c.zone})</option>`
    ).join('');
  }

  if (selName) {
    selName.innerHTML = defaultOption + appData.customers.map(c =>
      `<option value="${c.id}">${c.name} [${c.id}] — 📞 ${c.phone || '-'}</option>`
    ).join('');
  }

  if (selPhone) {
    selPhone.innerHTML = defaultOption + appData.customers.map(c =>
      `<option value="${c.id}">${c.phone || '-'} — ${c.name} [${c.id}]</option>`
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
    addrInfo.innerHTML = `📍 ที่อยู่จัดส่ง: <strong class="text-slate-800">${c.address || '-'}</strong> <span class="text-slate-400">(${c.zone})</span> • รอบส่ง: <span class="text-sky-700 font-semibold">${c.deliveryDays || '-'}</span>`;
  }
  if (priceInfo) {
    const bottlesHeld = c.OutstandingBottles || 0;
    const creditBal = Number(c.creditBalance || 0);
    const creditLim = Number(c.creditLimit || 0);
    priceInfo.innerHTML = `💳 เงื่อนไข: <strong class="text-slate-800">${c.paymentTerm || 'เงินสด / โอนเงิน'}</strong> • ระดับราคา: <strong class="text-indigo-700">${c.priceTier || 'ราคาส่งร้านค้า'}</strong> • ถังค้างเดิม: <strong class="text-amber-700">${bottlesHeld} ถัง</strong> • เครดิตค้าง: <strong class="${creditBal > 0 ? 'text-rose-600' : 'text-emerald-600'}">฿${creditBal.toLocaleString()}</strong> (วงเงิน ฿${creditLim.toLocaleString()})`;
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

  if (s189El) s189El.textContent = `฿${sub189.toLocaleString()}`;
  if (s350El) s350El.textContent = `฿${sub350.toLocaleString()}`;
  if (s600El) s600El.textContent = `฿${sub600.toLocaleString()}`;
  if (s1500El) s1500El.textContent = `฿${sub1500.toLocaleString()}`;
  if (totalDisplay) totalDisplay.textContent = `฿${grandTotal.toLocaleString()}`;

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
  const unpaidOrders = orders.filter(o => getOrderUnpaidAmount(o) > 0);

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
      dateBadge.textContent = `📅 วันที่ ${selectedDate} (ล่าสุด)`;
      dateBadge.className = 'bg-white/20 text-white text-xs font-bold px-2.5 py-0.5 rounded-full shadow-2xs';
    } else if (selectedDate) {
      dateBadge.textContent = `📅 วันที่ ${selectedDate}`;
      dateBadge.className = 'bg-white/20 text-white text-xs font-bold px-2.5 py-0.5 rounded-full shadow-2xs';
    } else {
      dateBadge.textContent = '📅 ทั้งหมด (ทุกวันที่)';
      dateBadge.className = 'bg-white/20 text-white text-xs font-bold px-2.5 py-0.5 rounded-full shadow-2xs';
    }
  }

  if (btnExport) {
    btnExport.href = selectedDate ? `/api/orders/export-excel?date=${selectedDate}` : '/api/orders/export-excel';
  }

  // Filter according to status & date & search
  const q = (document.getElementById('ordSearchInput')?.value || '').trim().toLowerCase();

  const filtered = orders.filter(o => {
    // Status filter
    if (currentOrderStatusFilter === 'pending') {
      if (o.orderStatus === 'จัดส่งสำเร็จแล้ว') return false;
    } else if (currentOrderStatusFilter === 'completed') {
      if (o.orderStatus !== 'จัดส่งสำเร็จแล้ว') return false;
    } else if (currentOrderStatusFilter === 'unpaid') {
      if (o.orderStatus !== 'จัดส่งสำเร็จแล้ว') return false;
      const actUnpaid = getOrderUnpaidAmount(o);
      if (actUnpaid <= 0) return false;
    }

    // Date filter: if selected, match deliveryDate exactly
    if (selectedDate && o.deliveryDate !== selectedDate) {
      return false;
    }

    // Search query
    if (q) {
      const cust = appData.customers?.find(c => c.id === o.customerId);
      const phone = o.customerPhone || cust?.phone || '';
      const txt = `${o.orderId} ${o.customerId} ${o.customerName} ${phone} ${o.zone || ''} ${o.deliveryDate || ''} ${o.notes || ''}`.toLowerCase();
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
  if (sumTotalAmountEl) sumTotalAmountEl.textContent = `฿${sumFilteredAmount.toLocaleString()}`;
  if (sumLoadEl) sumLoadEl.textContent = `${sumBottles.toLocaleString()} ถัง / ${sumPacks.toLocaleString()} แพ็ค`;

  const tbody = document.getElementById('ordersTableBody');
  if (!tbody) return;

  if (filtered.length === 0) {
    const dateNotice = selectedDate ? `ในวันที่ ${selectedDate}` : '';
    const statusNotice = currentOrderStatusFilter === 'pending' ? 'ที่ยังไม่ได้จัดส่ง' : (currentOrderStatusFilter === 'completed' ? 'ที่จัดส่งสำเร็จแล้ว' : '');
    tbody.innerHTML = `<tr><td colspan="11" class="p-8 text-center text-xs text-slate-400 bg-slate-50/50">ℹ️ ไม่มีใบสั่งออเดอร์น้ำดื่ม ${statusNotice} ${dateNotice} (กดปุ่ม "ทุกวัน" เพื่อดูทั้งหมด หรือเลือกวันที่อื่นด้านบน)</td></tr>`;
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

    const completedInfo = (isDone && o.completedAt) ? `<span class="text-[10px] text-emerald-600 block font-normal">✓ ปิดงานเมื่อ ${new Date(o.completedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.</span>` : '';

    return `
      <tr class="hover:bg-slate-50/80 transition">
        <td class="p-2 font-mono font-bold text-slate-800 text-xs whitespace-nowrap">
          ${o.orderId}
        </td>
        <td class="p-2">
          <div class="font-bold text-slate-800 text-xs truncate max-w-[200px]" title="${o.customerName} (${o.address || ''})">
            <span class="hover:text-teal-700 cursor-pointer" onclick="viewCustomerFromOrder('${o.customerId}')" title="คลิกเพื่อดูข้อมูลลูกค้าในทะเบียนลูกค้า">${o.customerName}</span>
            <span onclick="viewCustomerFromOrder('${o.customerId}')" class="font-normal text-sky-600 hover:text-sky-800 font-mono text-[10px] cursor-pointer hover:underline" title="คลิกเพื่อดูข้อมูลลูกค้าในทะเบียนลูกค้า">[${o.customerId}]</span>
          </div>
          <div class="text-[11px] text-slate-500 font-mono">
            📞 ${custPhone} <span class="text-slate-400 font-sans">• ${o.zone || '-'}</span>
          </div>
        </td>
        <td class="p-2 whitespace-nowrap">
          <div class="font-bold font-mono text-slate-700 text-xs">📅 ${o.deliveryDate || '-'}</div>
          <div class="text-[10px] font-mono text-slate-500">🕒 ${o.deliveryTime || '09:00'} น.</div>
          ${completedInfo}
        </td>
        <td class="p-2 text-center whitespace-nowrap">
          ${q189 > 0 ? `<div class="font-bold text-slate-800 text-xs">${q189}</div><div class="text-[9px] text-slate-400">@฿${o.unitPrice189L || 15}</div>` : '<div class="text-slate-300 text-xs">-</div>'}
        </td>
        <td class="p-2 text-center whitespace-nowrap">
          ${q350 > 0 ? `<div class="font-bold text-slate-800 text-xs">${q350}</div><div class="text-[9px] text-slate-400">@฿${o.unitPrice350ml || 35}</div>` : '<div class="text-slate-300 text-xs">-</div>'}
        </td>
        <td class="p-2 text-center whitespace-nowrap">
          ${q600 > 0 ? `<div class="font-bold text-slate-800 text-xs">${q600}</div><div class="text-[9px] text-slate-400">@฿${o.unitPrice600ml || 35}</div>` : '<div class="text-slate-300 text-xs">-</div>'}
        </td>
        <td class="p-2 text-center whitespace-nowrap">
          ${q1500 > 0 ? `<div class="font-bold text-slate-800 text-xs">${q1500}</div><div class="text-[9px] text-slate-400">@฿${o.unitPrice1500ml || 35}</div>` : '<div class="text-slate-300 text-xs">-</div>'}
        </td>
        <td class="p-2 text-right font-mono font-bold text-teal-800 text-xs whitespace-nowrap">
          ฿${Number(o.totalAmount || 0).toLocaleString()}
        </td>
        <td class="p-2 text-center whitespace-nowrap">
          ${(() => {
            if (!isDone) {
              return '<span class="text-slate-400 text-[11px]">- รอส่ง -</span>';
            }
            const tot = Number(o.totalAmount || 0);
            const actUnp = getOrderUnpaidAmount(o);
            const actCol = Number(o.moneyCollected !== undefined ? o.moneyCollected : (tot - actUnp));
            const isCred = (o.paymentMode === 'credit');

            if (actUnp > 0) {
              return `
                <div class="leading-tight">
                  <span class="bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-full font-bold text-[10px] inline-block shadow-2xs">
                    ${isCred ? '💳 เครดิต' : '⚠️ ค้างชำระ'} ฿${actUnp.toLocaleString()}
                  </span>
                  <div class="mt-1">
                    <button type="button" onclick="openBillPaymentModal('${o.orderId}')" class="bg-amber-500 hover:bg-amber-600 text-white font-bold px-2 py-0.5 rounded text-[10px] shadow-2xs transition inline-flex items-center gap-1 cursor-pointer">
                      <span>💵</span> <span>รับชำระบิล</span>
                    </button>
                  </div>
                </div>
              `;
            } else {
              return `
                <span class="bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-full font-bold text-[10px] inline-block">
                  ✓ จ่ายครบ ฿${tot.toLocaleString()}
                </span>
              `;
            }
          })()}
        </td>
        <td class="p-2 text-center whitespace-nowrap">
          ${isDone ? `
            <span class="bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-full text-[10px] font-bold">
              ✓ จัดส่งสำเร็จแล้ว
            </span>
          ` : `
            <span class="bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full text-[10px] font-semibold">
              ⏳ ยังไม่ได้จัดส่ง
            </span>
          `}
        </td>
        <td class="p-2 text-center whitespace-nowrap">
          <div class="flex items-center justify-center gap-1">
            <button type="button" onclick="openOrderSlipModal('${o.orderId}')" class="bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200 font-bold px-2 py-0.5 rounded text-[11px] transition shadow-2xs" title="พิมพ์ใบส่งของ / ใบเสร็จรับเงิน">
              📄 ดูบิล
            </button>
            ${isDone ? `
              <button type="button" disabled class="bg-slate-100 text-slate-400 border border-slate-200 font-medium px-2 py-0.5 rounded text-[11px] cursor-not-allowed" title="จัดส่งสำเร็จแล้ว ไม่อนุญาตให้แก้ไขข้อมูล">
                <span>🔒</span> ส่งแล้ว
              </button>
            ` : `
              <button type="button" onclick="editOrderRecord('${o.orderId}')" class="bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold px-2 py-0.5 rounded text-[11px] transition">
                แก้ไข
              </button>
            `}
            <button type="button" onclick="deleteOrderRecord('${o.orderId}')" class="bg-white hover:bg-rose-50 text-slate-400 hover:text-rose-600 border border-slate-200 font-medium px-2 py-0.5 rounded text-[11px] transition">
              ลบ
            </button>
          </div>
        </td>
      </tr>
    `;
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
    alert(`⚠️ ออเดอร์ [${ord.orderId}] นี้จัดส่งสำเร็จแล้ว ไม่สามารถแก้ไขข้อมูลได้ เพื่อรักษาความถูกต้องของข้อมูลสต็อกและบัญชี`);
    return;
  }

  const badge = document.getElementById('ordFormModeBadge');
  const title = document.getElementById('ordFormTitle');
  const btn = document.getElementById('btnSubmitOrderForm');
  const cancelBtn = document.getElementById('btnCancelOrderEdit');
  const msg = document.getElementById('ordFormFeedbackMsg');

  if (badge) {
    badge.className = 'bg-amber-300 text-slate-950 text-xs font-bold px-2.5 py-0.5 rounded-full shadow-sm';
    badge.textContent = `แก้ไข [${ord.orderId}]`;
  }
  if (title) title.textContent = `🛒 แก้ไขใบสั่งออเดอร์: ${ord.orderId} — ${ord.customerName}`;
  if (btn) btn.textContent = `💾 บันทึกการแก้ไขออเดอร์ (${ord.orderId})`;
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
        msg.textContent = `✅ บันทึกใบสั่งออเดอร์สำเร็จ และอัปเดตยอดส่งเข้าแผนที่สายส่ง GPS เรียบร้อยแล้ว`;
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
  if (!confirm(`ยืนยันการลบใบสั่งออเดอร์ [${orderId}] ?`)) return;
  try {
    const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, { method: 'DELETE' });
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
let currentSlipOrder = null;

function populateAndShowOrderSlip(ord) {
  currentSlipOrder = ord;
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
    items.push({ name: 'น้ำดื่มถัง 18.9 ลิตร (ฝาปิดมาตรฐาน)', qty: Number(ord.qty189L), unit: 'ถัง', price: Number(ord.unitPrice189L || 15) });
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

  // Fallback if items were not individually recorded
  if (items.length === 0 && Number(ord.totalAmount || 0) > 0) {
    items.push({ name: 'สินค้าจัดส่งตามสายส่ง', qty: 1, unit: 'รอบ', price: Number(ord.totalAmount) });
  }

  const tbody = document.getElementById('slipItemsTableBody');
  if (tbody) {
    tbody.innerHTML = items.map((it, idx) => `
      <tr>
        <td class="p-2">${idx + 1}. ${it.name}</td>
        <td class="p-2 text-center font-bold">${it.qty} ${it.unit}</td>
        <td class="p-2 text-right font-mono">฿${it.price.toLocaleString()}</td>
        <td class="p-2 text-right font-mono font-bold">฿${(it.qty * it.price).toLocaleString()}</td>
      </tr>
    `).join('');
  }

  const totalAmt = Number(ord.totalAmount || 0);
  const totalEl = document.getElementById('slipTotalAmount');
  if (totalEl) {
    totalEl.textContent = `฿${totalAmt.toLocaleString(undefined, {minimumFractionDigits: 2})} บาท`;
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
      paidAmountEl.textContent = `฿${actCollected.toLocaleString(undefined, {minimumFractionDigits: 2})} บาท` + (payMode === 'credit' && actCollected === 0 ? ' (ลงบัญชีเครดิต)' : '');
    }

    if (unpaidRow && unpaidAmountEl) {
      if (actUnpaid > 0) {
        unpaidRow.classList.remove('hidden');
        unpaidAmountEl.textContent = `฿${actUnpaid.toLocaleString(undefined, {minimumFractionDigits: 2})} บาท (ยังไม่ได้รับ)`;
      } else {
        unpaidRow.classList.add('hidden');
      }
    }
  } else {
    if (paidRow) paidRow.classList.add('hidden');
    if (unpaidRow) unpaidRow.classList.add('hidden');
  }

  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function openOrderSlipModal(orderId) {
  const ord = (appData?.orders || []).find(o => o.orderId === orderId);
  if (!ord) return alert('ไม่พบข้อมูลออเดอร์นี้');
  populateAndShowOrderSlip(ord);
}

function openOrderSlipFromTrip(tripId) {
  const trip = (appData?.savedTrips || []).find(t => t.tripId === tripId);
  if (!trip) return alert('ไม่พบข้อมูลประวัติสายส่งนี้');

  let ord = null;
  if (trip.orderId) {
    ord = (appData?.orders || []).find(o => o.orderId === trip.orderId);
  }
  if (!ord && trip.customerId) {
    ord = (appData?.orders || []).find(o => o.customerId === trip.customerId && o.deliveryDate === trip.date);
  }

  if (!ord) {
    // Synthesize slip from trip data
    const cust = (appData?.customers || []).find(c => c.id === trip.customerId) || {};
    const b189 = Number(trip.totalBottles189L || 0);
    const pTotal = Number(trip.totalPacks || 0);
    const p189Price = Number(cust.price189L || 15);
    const p600Price = Number(cust.price600ml || 35);
    const totalRev = Number(trip.totalRevenue || (b189 * p189Price + pTotal * p600Price));

    ord = {
      orderId: trip.orderId || trip.tripId,
      customerId: trip.customerId || cust.id || '-',
      customerName: trip.customerName || cust.name || trip.vehicleName || 'ลูกค้าสายส่ง',
      customerPhone: cust.phone || '-',
      zone: cust.zone || '-',
      address: cust.address || '-',
      deliveryDate: trip.date,
      deliveryTime: trip.time || '09:00',
      qty189L: b189,
      qty350ml: 0,
      qty600ml: pTotal,
      qty1500ml: 0,
      unitPrice189L: p189Price,
      unitPrice600ml: p600Price,
      totalAmount: totalRev,
      paymentTerm: cust.paymentTerm || 'เงินสด / โอนเงิน',
      orderStatus: trip.status || 'จัดส่งสำเร็จแล้ว',
      notes: `อ้างอิงรหัสสายส่ง: ${trip.tripId}`
    };
  }

  populateAndShowOrderSlip(ord);
}

function closeOrderSlipModal() {
  const modal = document.getElementById('modalOrderSlip');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

function printOrderSlip(targetOrderId) {
  let ord = null;
  if (targetOrderId) {
    ord = (appData?.orders || []).find(o => o.orderId === targetOrderId);
  }
  if (!ord && currentSlipOrder) {
    ord = currentSlipOrder;
  }
  if (!ord) {
    const orderId = document.getElementById('slipOrderId')?.textContent?.trim();
    if (orderId) ord = (appData?.orders || []).find(o => o.orderId === orderId);
  }

  if (!ord) {
    window.print();
    return;
  }

  const cust = (appData?.customers || []).find(c => c.id === ord.customerId) || {};

  // Build items array
  const items = [];
  if (Number(ord.qty189L || 0) > 0) {
    items.push({ name: 'น้ำดื่มถัง 18.9 ลิตร (ฝาปิดมาตรฐาน)', qty: Number(ord.qty189L), unit: 'ถัง', price: Number(ord.unitPrice189L || 15) });
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
  if (items.length === 0 && Number(ord.totalAmount || 0) > 0) {
    items.push({ name: 'สินค้าจัดส่งตามสายส่ง', qty: 1, unit: 'รอบ', price: Number(ord.totalAmount) });
  }

  const itemsHtml = items.map((it, idx) => `
    <tr>
      <td style="text-align: center; border: 1px solid #94a3b8; padding: 6px 8px;">${idx + 1}</td>
      <td style="border: 1px solid #94a3b8; padding: 6px 8px;"><b>${it.name}</b></td>
      <td style="text-align: center; border: 1px solid #94a3b8; padding: 6px 8px; font-weight: bold;">${it.qty} ${it.unit}</td>
      <td style="text-align: right; border: 1px solid #94a3b8; padding: 6px 8px; font-family: monospace;">฿${Number(it.price).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
      <td style="text-align: right; border: 1px solid #94a3b8; padding: 6px 8px; font-weight: bold; font-family: monospace;">฿${Number(it.qty * it.price).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
    </tr>
  `).join('');

  // Remove existing print iframe if any
  let iframe = document.getElementById('printDeliverySlipIframe');
  if (iframe) iframe.remove();

  iframe = document.createElement('iframe');
  iframe.id = 'printDeliverySlipIframe';
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.style.visibility = 'hidden';
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow.document;
  doc.open();
  doc.write(`
<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <title>ใบส่งของ_${ord.orderId}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 10mm 12mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #0f172a;
      font-family: 'Prompt', 'Sarabun', 'Segoe UI', Tahoma, sans-serif;
      font-size: 13px;
      line-height: 1.35;
    }
    .slip-container {
      width: 100%;
      max-width: 186mm;
      margin: 0 auto;
      border: 1.5px solid #0284c7;
      border-radius: 8px;
      padding: 16px 20px;
      page-break-inside: avoid;
      page-break-after: avoid;
    }
    .header-table {
      width: 100%;
      border-bottom: 2px solid #0284c7;
      padding-bottom: 8px;
      margin-bottom: 10px;
    }
    .company-title {
      font-size: 18px;
      font-weight: 800;
      color: #0369a1;
      margin: 0 0 2px 0;
    }
    .doc-badge {
      display: inline-block;
      background: #0284c7;
      color: #ffffff;
      padding: 4px 14px;
      border-radius: 6px;
      font-size: 15px;
      font-weight: bold;
      letter-spacing: 0.5px;
    }
    .info-box {
      width: 100%;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      background: #f8fafc;
      padding: 9px 12px;
      margin-bottom: 12px;
      font-size: 12.5px;
    }
    .info-table {
      width: 100%;
      border-collapse: collapse;
    }
    .info-table td {
      padding: 3px 6px;
      vertical-align: top;
    }
    table.data-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 10px;
      font-size: 12.5px;
    }
    table.data-table th {
      background: #e2e8f0;
      color: #1e293b;
      font-weight: bold;
      border: 1px solid #94a3b8;
      padding: 6px 8px;
    }
    table.data-table td {
      padding: 6px 8px;
      border: 1px solid #94a3b8;
    }
    .signatures-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 14px;
      padding-top: 10px;
      border-top: 1px solid #cbd5e1;
      text-align: center;
      font-size: 11.5px;
      page-break-inside: avoid;
    }
    .signatures-table td {
      padding: 10px 15px 0 15px;
      vertical-align: top;
    }
    .sig-dots {
      border-bottom: 1px dashed #64748b;
      height: 38px;
      width: 170px;
      margin: 0 auto 6px auto;
    }
    .footer-note {
      text-align: center;
      font-size: 10.5px;
      color: #64748b;
      margin-top: 12px;
      border-top: 1px dashed #cbd5e1;
      padding-top: 6px;
    }
  </style>
</head>
<body>
  <div class="slip-container">
    <!-- Header -->
    <table class="header-table">
      <tr>
        <td style="vertical-align: top;">
          <div class="company-title">💧 น้ำดื่มอินธารา</div>
          <div style="font-size: 11px; color: #475569;">โรงงานผลิตและจำหน่ายน้ำดื่มมาตรฐาน สะอาด ปลอดภัย</div>
          <div style="font-size: 11px; color: #64748b;">121 หมู่ 4 ต.จริม อ.ท่าปลา จ.อุตรดิตถ์ 53150 • โทร. 085-279-8343</div>
        </td>
        <td style="text-align: right; vertical-align: top;">
          <div class="doc-badge">ใบส่งของ / ใบเสร็จรับเงิน</div>
          <div style="font-size: 13px; font-weight: bold; font-family: monospace; color: #0284c7; margin-top: 4px;">
            เลขที่: ${ord.orderId}
          </div>
        </td>
      </tr>
    </table>

    <!-- Info Box -->
    <div class="info-box">
      <table class="info-table">
        <tr>
          <td style="width: 50%;">
            <b>ชื่อลูกค้า:</b> <span style="font-size: 13px; font-weight: bold; color: #0f172a;">${ord.customerName || cust.name || '-'}</span> 
            <span style="color: #64748b; font-size: 11px;">[${ord.customerId}]</span>
          </td>
          <td style="width: 50%;">
            <b>วันที่จัดส่ง:</b> <span style="font-weight: bold;">${ord.deliveryDate || '-'}</span> 
            <b>เวลา:</b> ${ord.deliveryTime || '09:00'} น.
          </td>
        </tr>
        <tr>
          <td>
            <b>เบอร์โทรศัพท์:</b> <span style="font-family: monospace;">${ord.customerPhone || cust.phone || '-'}</span>
          </td>
          <td>
            <b>โซนจัดส่ง:</b> ${ord.zone || cust.zone || '-'}
          </td>
        </tr>
        <tr>
          <td colspan="2" style="border-top: 1px dashed #cbd5e1; padding-top: 4px; margin-top: 2px;">
            <b>สถานที่จัดส่ง:</b> ${ord.address || cust.address || '-'}
          </td>
        </tr>
      </table>
    </div>

    <!-- Items Table -->
    <table class="data-table">
      <thead>
        <tr>
          <th style="width: 40px; text-align: center;">ลำดับ</th>
          <th>รายการสินค้า</th>
          <th style="width: 100px; text-align: center;">จำนวน</th>
          <th style="width: 110px; text-align: right;">ราคา/หน่วย</th>
          <th style="width: 120px; text-align: right;">รวมเงิน (บาท)</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
      <tfoot>
        <tr style="background: #f1f5f9; font-weight: bold; font-size: 13px;">
          <td colspan="4" style="text-align: right; border: 1px solid #94a3b8; padding: 7px 8px;">
            ยอดรวมสุทธิทั้งสิ้น (Grand Total):
          </td>
          <td style="text-align: right; border: 1px solid #94a3b8; padding: 7px 8px; font-size: 14px; color: #047857; font-family: monospace;">
            ฿${Number(ord.totalAmount || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}
          </td>
        </tr>
        ${(() => {
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
            return `
              <tr style="font-size: 12px; color: #1e293b;">
                <td colspan="4" style="text-align: right; border: 1px solid #94a3b8; padding: 5px 8px;">
                  ชำระแล้ว / รับเงินจริง:
                </td>
                <td style="text-align: right; border: 1px solid #94a3b8; padding: 5px 8px; font-family: monospace; font-weight: bold;">
                  ฿${actCol.toLocaleString(undefined, {minimumFractionDigits: 2})} ${pm === 'credit' && actCol === 0 ? '<span style="color:#d97706; font-size:11px;">(ลงบัญชีเครดิต)</span>' : ''}
                </td>
              </tr>
              ${actUnp > 0 ? `
              <tr style="background: #fff7ed; font-size: 12.5px; font-weight: bold; color: #b91c1c;">
                <td colspan="4" style="text-align: right; border: 1px solid #94a3b8; padding: 6px 8px;">
                  ยอดค้างชำระ (ลงบัญชี / Balance Due):
                </td>
                <td style="text-align: right; border: 1px solid #94a3b8; padding: 6px 8px; font-size: 13px; font-family: monospace; color: #dc2626;">
                  ฿${actUnp.toLocaleString(undefined, {minimumFractionDigits: 2})}
                </td>
              </tr>
              ` : ''}
            `;
          }
          return '';
        })()}
      </tfoot>
    </table>

    <!-- Payment & Status -->
    <table style="width: 100%; font-size: 12px; margin-bottom: 8px;">
      <tr>
        <td style="width: 50%;">
          <b>เงื่อนไขการชำระเงิน:</b> ${ord.paymentTerm || cust.paymentTerm || 'เงินสด / โอนเงิน'}
        </td>
        <td style="width: 50%; text-align: right;">
          <b>สถานะออเดอร์:</b> <span style="font-weight: bold; color: ${ord.orderStatus === 'จัดส่งสำเร็จแล้ว' ? '#047857' : '#b45309'};">${ord.orderStatus || 'ยังไม่ได้จัดส่ง'}</span>
        </td>
      </tr>
      ${ord.notes ? `<tr><td colspan="2" style="padding-top: 3px; color: #475569;"><b>หมายเหตุ:</b> ${ord.notes}</td></tr>` : ''}
    </table>

    <!-- Signatures -->
    <table class="signatures-table">
      <tr>
        <td style="width: 50%;">
          <div class="sig-dots"></div>
          <div>ลงชื่อ .................................................... ผู้รับสินค้า / ลูกค้า</div>
          <div style="font-size: 10.5px; color: #64748b; margin-top: 3px;">วันที่ ..... / ..... / ..........</div>
        </td>
        <td style="width: 50%;">
          <div class="sig-dots"></div>
          <div>ลงชื่อ .................................................... ผู้ส่งสินค้า / พนักงาน</div>
          <div style="font-size: 10.5px; color: #64748b; margin-top: 3px;">วันที่ ..... / ..... / ..........</div>
        </td>
      </tr>
    </table>

    <!-- Footer Note -->
    <div class="footer-note">
      ได้รับสินค้าตามรายการข้างต้นถูกต้อง ครบถ้วน และอยู่ในสภาพสมบูรณ์เรียบร้อยแล้ว • ขอบพระคุณที่ไว้วางใจน้ำดื่มอินธารา
    </div>
  </div>
</body>
</html>
  `);
  doc.close();

  // Trigger print after iframe renders
  setTimeout(() => {
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
  }, 250);
}
// ==========================================
// CUSTOMER SECURITY & ACCESS MANAGEMENT (STAFF MODAL - PIN 6 DIGITS)
// ==========================================
async function openCustomerSecurityModal(custId) {
  const cust = (appData?.customers || []).find(c => c.id === custId);
  if (!cust) return alert('ไม่พบข้อมูลลูกค้า');

  const modal = document.getElementById('modalCustomerSecurity');
  if (!modal) return;

  document.getElementById('secModalCustId').value = cust.id;
  document.getElementById('secModalCustName').textContent = `จัดการรหัส PIN: ${cust.name}`;
  document.getElementById('secModalCustSub').textContent = `รหัส: ${cust.id} | โทร: ${cust.phone || '-'} | โซน: ${cust.zone || '-'}`;
  document.getElementById('secModalPinStatus').innerHTML = '<span class="text-slate-400">⏳ กำลังตรวจสอบ...</span>';
  document.getElementById('secModalCustomPin').value = '';
  document.getElementById('secModalNewPinBanner').classList.add('hidden');
  const lockedBox = document.getElementById('secModalLockedAlert');
  if (lockedBox) lockedBox.classList.add('hidden');

  modal.classList.remove('hidden');
  modal.classList.add('flex');

  await refreshCustomerSecurityStatus(cust.id);
}

function closeCustomerSecurityModal() {
  const modal = document.getElementById('modalCustomerSecurity');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

async function refreshCustomerSecurityStatus(custId) {
  try {
    const res = await fetch(`/api/customers/${encodeURIComponent(custId)}/access-status`, {
      headers: {
        'Authorization': `Bearer ${authToken || localStorage.getItem('inthara_auth_token') || ''}`
      }
    });
    const out = await res.json();
    if (!out.ok) {
      document.getElementById('secModalPinStatus').innerHTML = `<span class="text-rose-500 text-[11px]">${out.error || 'ตรวจสอบไม่สำเร็จ'}</span>`;
      return;
    }

    // PIN status
    const pinEl = document.getElementById('secModalPinStatus');
    const lockedBox = document.getElementById('secModalLockedAlert');

    if (out.locked) {
      pinEl.innerHTML = `<span class="text-rose-600 font-bold flex items-center gap-1">⛔ ระงับชั่วคราว</span>`;
      if (lockedBox) lockedBox.classList.remove('hidden');
    } else {
      if (lockedBox) lockedBox.classList.add('hidden');
      if (out.hasPin) {
        pinEl.innerHTML = `<span class="text-emerald-700 font-bold flex items-center gap-1">✅ ตั้งรหัส PIN เรียบร้อยแล้ว</span>`;
      } else {
        pinEl.innerHTML = `<span class="text-amber-600 font-medium flex items-center gap-1">⚠️ ยังไม่ได้ตั้งรหัส PIN</span>`;
      }
    }
  } catch (err) {
    console.error('Error fetching customer access status:', err);
  }
}

async function submitCustomerPinReset() {
  const custId = document.getElementById('secModalCustId').value;
  if (!custId) return;
  const customPin = document.getElementById('secModalCustomPin').value.trim();
  if (customPin && !/^\d{6}$/.test(customPin)) {
    return alert('หากกำหนด PIN เอง กรุณากรอกตัวเลข 6 หลักให้ถูกต้อง');
  }

  try {
    const res = await fetch(`/api/customers/${encodeURIComponent(custId)}/reset-pin`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken || localStorage.getItem('inthara_auth_token') || ''}`
      },
      body: JSON.stringify({ customPin })
    });
    const out = await res.json();
    if (!out.ok) {
      return alert(out.error || 'ไม่สามารถตั้งรหัส PIN ได้');
    }

    // Show banner with new PIN
    const banner = document.getElementById('secModalNewPinBanner');
    const pinText = document.getElementById('secModalGeneratedPinText');
    pinText.textContent = out.pin;
    banner.classList.remove('hidden');

    await refreshCustomerSecurityStatus(custId);
  } catch (err) {
    alert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
  }
}

function copyCustomerSecurityPin() {
  const pin = document.getElementById('secModalGeneratedPinText')?.textContent;
  if (!pin) return;
  navigator.clipboard.writeText(pin).then(() => {
    alert(`คัดลอกรหัส PIN ${pin} แล้ว! นำไปแจ้งลูกค้าได้ทันที`);
  }).catch(() => {
    alert(`รหัส PIN คือ: ${pin}`);
  });
}

async function submitUnlockCustomerAccount() {
  const custId = document.getElementById('secModalCustId').value;
  if (!custId) return;
  try {
    const res = await fetch(`/api/customers/${encodeURIComponent(custId)}/unlock`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken || localStorage.getItem('inthara_auth_token') || ''}`
      }
    });
    const out = await res.json();
    if (out.ok) {
      alert('ปลดล็อกบัญชีลูกค้าเรียบร้อยแล้ว ลูกค้าสามารถเข้าสู่ระบบด้วย PIN เดิมได้ทันที');
      await refreshCustomerSecurityStatus(custId);
    } else {
      alert(out.error || 'ไม่สามารถปลดล็อกได้');
    }
  } catch (err) {
    alert('เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์');
  }
}


function clearCurrentRouteSequence() {
  if (currentOrderedStops.length === 0) return;
  if (!confirm('ต้องการเคลียร์ลำดับการเดินรถและจุดส่งทั้งหมดใช่หรือไม่?')) return;
  currentOrderedStops = [];
  if (appData && Array.isArray(appData.customers)) {
    appData.customers.forEach(c => { c.selectedForRoute = false; });
  }
  recalculateCurrentRoute();
}


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

  if (titleEl) titleEl.innerHTML = `<span>👤 ${targetCust.name} [${targetCust.id}]</span> <span class="text-slate-400 font-normal">• 📞 ${targetCust.phone || '-'}</span>`;
  if (subEl) subEl.textContent = `ที่อยู่: ${targetCust.address || '-'} (${targetCust.zone || 'ทั่วไป'})`;
  if (totalDebtEl) totalDebtEl.textContent = `฿${Number(targetCust.creditBalance || 0).toLocaleString()}`;

  // Find all unpaid orders of this customer
  const custOrders = (appData?.orders || []).filter(o => o.customerId === targetCust.id && o.orderStatus === 'จัดส่งสำเร็จแล้ว');
  
  currentBillPayOrders = custOrders.filter(o => getOrderUnpaidAmount(o) > 0);

  const countNotice = document.getElementById('billPayOrdersCountNotice');
  if (countNotice) countNotice.textContent = `พบบิลค้างชำระ ${currentBillPayOrders.length} รายการ`;

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

        return `
          <tr class="hover:bg-amber-50/50 cursor-pointer transition" onclick="selectBillPayOrder('${ord.orderId}', ${actUnp})">
            <td class="p-2 text-center">
              <input type="radio" name="billPaySelectedOrderRadio" id="radioBill_${ord.orderId}" value="${ord.orderId}" ${isChecked ? 'checked' : ''} onchange="selectBillPayOrder('${ord.orderId}', ${actUnp})" class="text-amber-600 focus:ring-amber-500" />
            </td>
            <td class="p-2">
              <div class="font-bold text-slate-800 font-mono text-xs">${ord.orderId}</div>
              <div class="text-[10px] text-slate-500">📅 ${ord.deliveryDate || '-'}</div>
            </td>
            <td class="p-2 text-right font-mono font-semibold text-slate-700">฿${tot.toLocaleString()}</td>
            <td class="p-2 text-right font-mono text-slate-500">฿${actCol.toLocaleString()}</td>
            <td class="p-2 text-right font-mono font-black text-rose-700 text-xs">฿${actUnp.toLocaleString()}</td>
          </tr>
        `;
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
    const firstRadio = document.getElementById(`radioBill_${firstOrd.orderId}`);
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
  const radio = document.getElementById(`radioBill_${orderId}`);
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

    alert(`✅ บันทึกรับชำระเงินเรียบร้อยแล้ว!\n- เลขที่ใบเสร็จ: ${result.receipt?.receiptNo}\n- จำนวนเงิน: ฿${amount.toLocaleString()} บาท\n- ช่องทาง: ${paymentMethod}`);

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

// ==========================================
// 10. EMPLOYEE & STAFF DIRECTORY MODULE
// ==========================================
let currentEmpPhoto = '';
let currentEmpIdCard = null; // { name, type, data, uploadedAt }
let currentEmpLicense = null; // { name, type, data, uploadedAt }
let currentViewingDoc = null; // for modalViewDoc

// Helper: Compress image before storing
function compressImageFile(file, maxWidth = 1200, maxHeight = 1200, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (w > maxWidth || h > maxHeight) {
          if (w > h) {
            h = Math.round((h * maxWidth) / w);
            w = maxWidth;
          } else {
            w = Math.round((w * maxHeight) / h);
            h = maxHeight;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// 1. Photo Handlers
async function handleEmpPhotoUpload(input) {
  const file = input.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    alert('กรุณาเลือกไฟล์รูปภาพเท่านั้น (JPG, PNG)');
    return;
  }
  try {
    const compressed = await compressImageFile(file, 600, 600, 0.85);
    currentEmpPhoto = compressed;
    const preview = document.getElementById('empPhotoPreview');
    const placeholder = document.getElementById('empPhotoPlaceholder');
    const btnRemove = document.getElementById('btnRemoveEmpPhoto');
    if (preview) {
      preview.src = compressed;
      preview.classList.remove('hidden');
    }
    if (placeholder) placeholder.classList.add('hidden');
    if (btnRemove) btnRemove.classList.remove('hidden');
  } catch (err) {
    console.error('Error compressing photo:', err);
    alert('เกิดข้อผิดพลาดในการโหลดรูปถ่าย');
  }
}

function removeEmpPhoto() {
  currentEmpPhoto = '';
  const preview = document.getElementById('empPhotoPreview');
  const placeholder = document.getElementById('empPhotoPlaceholder');
  const btnRemove = document.getElementById('btnRemoveEmpPhoto');
  const input = document.getElementById('empPhotoInput');
  if (preview) {
    preview.src = '';
    preview.classList.add('hidden');
  }
  if (placeholder) placeholder.classList.remove('hidden');
  if (btnRemove) btnRemove.classList.add('hidden');
  if (input) input.value = '';
}

// 2. ID Card Handlers
async function handleEmpIdCardUpload(input) {
  const file = input.files?.[0];
  if (!file) return;

  const isPdf = file.type === 'application/pdf' || file.name.endsWith('.pdf');
  const isImg = file.type.startsWith('image/');
  if (!isPdf && !isImg) {
    alert('กรุณาแนบไฟล์รูปภาพ (JPG, PNG) หรือไฟล์ PDF เท่านั้น');
    return;
  }

  try {
    let dataUrl = '';
    if (isImg) {
      dataUrl = await compressImageFile(file, 1400, 1400, 0.82);
    } else {
      dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }

    currentEmpIdCard = {
      name: file.name,
      type: file.type || (isPdf ? 'application/pdf' : 'image/jpeg'),
      data: dataUrl,
      uploadedAt: new Date().toISOString()
    };

    updateIdCardUI();
  } catch (err) {
    console.error('Error uploading ID card:', err);
    alert('เกิดข้อผิดพลาดในการแนบเอกสารบัตร ปชช.');
  }
}

function updateIdCardUI() {
  const preview = document.getElementById('empIdCardPreview');
  const pdfIcon = document.getElementById('empIdCardPdfIcon');
  const placeholder = document.getElementById('empIdCardPlaceholder');
  const btnView = document.getElementById('btnViewIdCard');
  const btnRemove = document.getElementById('btnRemoveIdCard');

  if (currentEmpIdCard && currentEmpIdCard.data) {
    const isPdf = currentEmpIdCard.type === 'application/pdf';
    if (placeholder) placeholder.classList.add('hidden');
    if (isPdf) {
      if (preview) preview.classList.add('hidden');
      if (pdfIcon) {
        pdfIcon.classList.remove('hidden');
        pdfIcon.classList.add('flex');
      }
    } else {
      if (pdfIcon) {
        pdfIcon.classList.add('hidden');
        pdfIcon.classList.remove('flex');
      }
      if (preview) {
        preview.src = currentEmpIdCard.data;
        preview.classList.remove('hidden');
      }
    }
    if (btnView) btnView.classList.remove('hidden');
    if (btnRemove) btnRemove.classList.remove('hidden');
  } else {
    if (preview) {
      preview.src = '';
      preview.classList.add('hidden');
    }
    if (pdfIcon) {
      pdfIcon.classList.add('hidden');
      pdfIcon.classList.remove('flex');
    }
    if (placeholder) placeholder.classList.remove('hidden');
    if (btnView) btnView.classList.add('hidden');
    if (btnRemove) btnRemove.classList.add('hidden');
    const input = document.getElementById('empIdCardInput');
    if (input) input.value = '';
  }
}

function removeEmpIdCard() {
  currentEmpIdCard = null;
  updateIdCardUI();
}

// 3. Driver License / Other Doc Handlers
async function handleEmpLicenseUpload(input) {
  const file = input.files?.[0];
  if (!file) return;

  const isPdf = file.type === 'application/pdf' || file.name.endsWith('.pdf');
  const isImg = file.type.startsWith('image/');
  if (!isPdf && !isImg) {
    alert('กรุณาแนบไฟล์รูปภาพ (JPG, PNG) หรือไฟล์ PDF เท่านั้น');
    return;
  }

  try {
    let dataUrl = '';
    if (isImg) {
      dataUrl = await compressImageFile(file, 1400, 1400, 0.82);
    } else {
      dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }

    currentEmpLicense = {
      name: file.name,
      type: file.type || (isPdf ? 'application/pdf' : 'image/jpeg'),
      data: dataUrl,
      uploadedAt: new Date().toISOString()
    };

    updateLicenseUI();
  } catch (err) {
    console.error('Error uploading license:', err);
    alert('เกิดข้อผิดพลาดในการแนบเอกสาร');
  }
}

function updateLicenseUI() {
  const preview = document.getElementById('empLicensePreview');
  const pdfIcon = document.getElementById('empLicensePdfIcon');
  const placeholder = document.getElementById('empLicensePlaceholder');
  const btnView = document.getElementById('btnViewLicense');
  const btnRemove = document.getElementById('btnRemoveLicense');

  if (currentEmpLicense && currentEmpLicense.data) {
    const isPdf = currentEmpLicense.type === 'application/pdf';
    if (placeholder) placeholder.classList.add('hidden');
    if (isPdf) {
      if (preview) preview.classList.add('hidden');
      if (pdfIcon) {
        pdfIcon.classList.remove('hidden');
        pdfIcon.classList.add('flex');
      }
    } else {
      if (pdfIcon) {
        pdfIcon.classList.add('hidden');
        pdfIcon.classList.remove('flex');
      }
      if (preview) {
        preview.src = currentEmpLicense.data;
        preview.classList.remove('hidden');
      }
    }
    if (btnView) btnView.classList.remove('hidden');
    if (btnRemove) btnRemove.classList.remove('hidden');
  } else {
    if (preview) {
      preview.src = '';
      preview.classList.add('hidden');
    }
    if (pdfIcon) {
      pdfIcon.classList.add('hidden');
      pdfIcon.classList.remove('flex');
    }
    if (placeholder) placeholder.classList.remove('hidden');
    if (btnView) btnView.classList.add('hidden');
    if (btnRemove) btnRemove.classList.add('hidden');
    const input = document.getElementById('empLicenseInput');
    if (input) input.value = '';
  }
}

function removeEmpLicense() {
  currentEmpLicense = null;
  updateLicenseUI();
}

// 4. Document Viewer Functions
function viewDocFromForm(docType) {
  const empName = document.getElementById('empFormName')?.value.trim() || 'พนักงาน';
  if (docType === 'idCard' && currentEmpIdCard) {
    openDocViewerModal({
      title: `สำเนาบัตรประชาชน — ${empName}`,
      subtitle: `ไฟล์: ${currentEmpIdCard.name} • วันที่แนบ: ${new Date(currentEmpIdCard.uploadedAt || Date.now()).toLocaleDateString('th-TH')}`,
      type: currentEmpIdCard.type,
      data: currentEmpIdCard.data,
      name: currentEmpIdCard.name || 'idcard.jpg'
    });
  } else if (docType === 'license' && currentEmpLicense) {
    openDocViewerModal({
      title: `สำเนาใบขับขี่ / เอกสารเพิ่มเติม — ${empName}`,
      subtitle: `ไฟล์: ${currentEmpLicense.name} • วันที่แนบ: ${new Date(currentEmpLicense.uploadedAt || Date.now()).toLocaleDateString('th-TH')}`,
      type: currentEmpLicense.type,
      data: currentEmpLicense.data,
      name: currentEmpLicense.name || 'license.jpg'
    });
  }
}

function viewEmployeeDocById(empId, docType) {
  const emp = (appData.employees || []).find(e => e.id === empId);
  if (!emp) return;

  if (docType === 'idCard') {
    if (!emp.idCardDoc || !emp.idCardDoc.data) {
      alert(`พนักงาน "${emp.name}" ยังไม่ได้แนบไฟล์รูปถ่ายบัตรประชาชน`);
      return;
    }
    openDocViewerModal({
      title: `สำเนาบัตรประชาชน — ${emp.name} (${emp.id})`,
      subtitle: `เลขประจำตัว ปชช: ${emp.idCard || '-'} • วันที่แนบ: ${new Date(emp.idCardDoc.uploadedAt || Date.now()).toLocaleDateString('th-TH')}`,
      type: emp.idCardDoc.type,
      data: emp.idCardDoc.data,
      name: emp.idCardDoc.name || `idcard_${emp.id}.jpg`
    });
  } else if (docType === 'license') {
    if (!emp.driverLicenseDoc || !emp.driverLicenseDoc.data) {
      alert(`พนักงาน "${emp.name}" ยังไม่ได้แนบเอกสารใบขับขี่`);
      return;
    }
    openDocViewerModal({
      title: `สำเนาใบขับขี่ / เอกสารเพิ่มเติม — ${emp.name} (${emp.id})`,
      subtitle: `ใบขับขี่: ${emp.driverLicense || '-'} • วันที่แนบ: ${new Date(emp.driverLicenseDoc.uploadedAt || Date.now()).toLocaleDateString('th-TH')}`,
      type: emp.driverLicenseDoc.type,
      data: emp.driverLicenseDoc.data,
      name: emp.driverLicenseDoc.name || `license_${emp.id}.jpg`
    });
  } else if (docType === 'photo') {
    if (!emp.photo) {
      alert(`พนักงาน "${emp.name}" ยังไม่ได้แนบรูปถ่ายหน้าตรง`);
      return;
    }
    openDocViewerModal({
      title: `รูปถ่ายหน้าตรงพนักงาน — ${emp.name} (${emp.id})`,
      subtitle: `ตำแหน่ง: ${emp.position} • แผนก: ${emp.department}`,
      type: 'image/jpeg',
      data: emp.photo,
      name: `photo_${emp.id}.jpg`
    });
  }
}

let currentDocBlobUrl = null;

function base64ToBlobUrl(dataUrl, defaultMime = 'application/pdf') {
  try {
    if (!dataUrl) return null;
    if (dataUrl.startsWith('blob:')) return dataUrl;

    let mime = defaultMime;
    let b64 = dataUrl;

    if (dataUrl.includes(';base64,')) {
      const parts = dataUrl.split(';base64,');
      const mimeMatch = parts[0].match(/data:(.*)/);
      if (mimeMatch) mime = mimeMatch[1];
      b64 = parts[1];
    } else if (dataUrl.startsWith('data:')) {
      const commaIdx = dataUrl.indexOf(',');
      if (commaIdx !== -1) {
        const header = dataUrl.slice(0, commaIdx);
        const mimeMatch = header.match(/data:(.*?)(;|$)/);
        if (mimeMatch) mime = mimeMatch[1];
        b64 = dataUrl.slice(commaIdx + 1);
      }
    }

    const binaryStr = atob(b64);
    const len = binaryStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: mime });
    return URL.createObjectURL(blob);
  } catch (err) {
    console.error('Error generating blob URL from base64:', err);
    return null;
  }
}

function openDocViewerModal(doc) {
  // Revoke previous blob URL if any
  if (currentDocBlobUrl) {
    try { URL.revokeObjectURL(currentDocBlobUrl); } catch (e) {}
    currentDocBlobUrl = null;
  }

  currentViewingDoc = doc;
  const modal = document.getElementById('modalViewDoc');
  const title = document.getElementById('docViewerTitle');
  const subtitle = document.getElementById('docViewerSubtitle');
  const imgEl = document.getElementById('docViewerImage');
  const pdfEl = document.getElementById('docViewerPdf');
  const emptyEl = document.getElementById('docViewerEmpty');
  const btnDownload = document.getElementById('btnDownloadDoc');
  const btnOpenTab = document.getElementById('btnDocOpenTab');
  const btnOpenTabFooter = document.getElementById('btnDocOpenTabFooter');

  if (!modal) return;

  if (title) title.textContent = doc.title || 'เอกสารพนักงาน';
  if (subtitle) subtitle.textContent = doc.subtitle || '';

  const isPdf = (doc.type === 'application/pdf') || (doc.name && doc.name.toLowerCase().endsWith('.pdf'));

  if (doc.data) {
    if (emptyEl) emptyEl.classList.add('hidden');

    currentDocBlobUrl = base64ToBlobUrl(doc.data, isPdf ? 'application/pdf' : 'image/jpeg');
    const targetUrl = currentDocBlobUrl || doc.data;

    if (btnDownload) {
      btnDownload.href = targetUrl;
      btnDownload.download = doc.name || (isPdf ? 'document.pdf' : 'document.jpg');
    }

    if (btnOpenTab) {
      btnOpenTab.href = targetUrl;
      btnOpenTab.classList.remove('hidden');
    }
    if (btnOpenTabFooter) {
      btnOpenTabFooter.href = targetUrl;
      btnOpenTabFooter.classList.remove('hidden');
    }

    if (isPdf) {
      if (imgEl) {
        imgEl.src = '';
        imgEl.classList.add('hidden');
      }
      if (pdfEl) {
        pdfEl.src = targetUrl;
        pdfEl.classList.remove('hidden');
      }
    } else {
      if (pdfEl) {
        pdfEl.src = '';
        pdfEl.classList.add('hidden');
      }
      if (imgEl) {
        imgEl.src = doc.data;
        imgEl.classList.remove('hidden');
      }
    }
  } else {
    if (imgEl) { imgEl.src = ''; imgEl.classList.add('hidden'); }
    if (pdfEl) { pdfEl.src = ''; pdfEl.classList.add('hidden'); }
    if (emptyEl) emptyEl.classList.remove('hidden');
    if (btnOpenTab) btnOpenTab.classList.add('hidden');
    if (btnOpenTabFooter) btnOpenTabFooter.classList.add('hidden');
  }

  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeDocViewerModal() {
  const modal = document.getElementById('modalViewDoc');
  const imgEl = document.getElementById('docViewerImage');
  const pdfEl = document.getElementById('docViewerPdf');
  if (imgEl) imgEl.src = '';
  if (pdfEl) pdfEl.src = '';
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
  if (currentDocBlobUrl) {
    try { URL.revokeObjectURL(currentDocBlobUrl); } catch (e) {}
    currentDocBlobUrl = null;
  }
  currentViewingDoc = null;
}

function printCurrentDocument() {
  if (!currentViewingDoc || !currentViewingDoc.data) return;

  const isPdf = (currentViewingDoc.type === 'application/pdf') || (currentViewingDoc.name && currentViewingDoc.name.toLowerCase().endsWith('.pdf'));

  if (isPdf) {
    const targetUrl = currentDocBlobUrl || base64ToBlobUrl(currentViewingDoc.data, 'application/pdf');
    if (targetUrl) {
      const pWin = window.open(targetUrl, '_blank');
      if (pWin) pWin.focus();
    }
    return;
  }

  const w = window.open('', '_blank');
  w.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>${currentViewingDoc.title || 'พิมพ์เอกสาร'}</title>
      <style>
        body { margin: 0; padding: 20px; text-align: center; font-family: sans-serif; background: #fff; }
        h2 { font-size: 16px; color: #1e293b; margin-bottom: 5px; }
        p { font-size: 12px; color: #64748b; margin-bottom: 15px; }
        img { max-width: 95%; max-height: 85vh; object-fit: contain; border: 1px solid #e2e8f0; border-radius: 8px; }
        @media print { body { padding: 0; } img { max-width: 100%; border: none; } }
      </style>
    </head>
    <body>
      <h2>${currentViewingDoc.title || 'เอกสารพนักงาน'}</h2>
      <p>${currentViewingDoc.subtitle || ''}</p>
      <img src="${currentViewingDoc.data}" onload="window.print();" />
    </body>
    </html>
  `);
  w.document.close();
}

// 4.5 Employee Responsibilities Handlers
let currentEmpResponsibilities = [];

function renderEmpResponsibilitiesUI() {
  const container = document.getElementById('empRespContainer');
  if (!container) return;

  if (!currentEmpResponsibilities || currentEmpResponsibilities.length === 0) {
    container.innerHTML = `<span class="text-slate-400 text-xs italic py-1">ยังไม่มีหน้าที่รับผิดชอบ (เลือกจากข้อแนะนำด่วนด้านล่าง หรือพิมพ์แล้วกด + เพิ่ม)</span>`;
    return;
  }

  container.innerHTML = currentEmpResponsibilities.map((resp, idx) => `
    <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs bg-sky-50 text-sky-800 border border-sky-200 shadow-2xs group">
      <span class="font-medium">${resp}</span>
      <button type="button" onclick="editEmpResponsibilityItem(${idx})" class="text-sky-500 hover:text-sky-800 text-[10px] ml-1 p-0.5 rounded hover:bg-sky-100" title="นำข้อความกลับมาแก้ไข">✏️</button>
      <button type="button" onclick="removeEmpResponsibilityItem(${idx})" class="text-slate-400 hover:text-rose-600 font-bold ml-0.5 text-xs p-0.5 rounded hover:bg-rose-50" title="ลบหน้าที่นี้">✕</button>
    </span>
  `).join('');
}

function addEmpResponsibilityItem(text) {
  if (!text || typeof text !== 'string') return;
  const cleaned = text.trim();
  if (!cleaned) return;
  if (!currentEmpResponsibilities) currentEmpResponsibilities = [];
  if (!currentEmpResponsibilities.includes(cleaned)) {
    currentEmpResponsibilities.push(cleaned);
    renderEmpResponsibilitiesUI();
  }
}

function addEmpResponsibilityFromInput() {
  const input = document.getElementById('inputNewResp');
  if (!input) return;
  const val = input.value.trim();
  if (!val) return;
  addEmpResponsibilityItem(val);
  input.value = '';
  input.focus();
}

function removeEmpResponsibilityItem(index) {
  if (currentEmpResponsibilities && index >= 0 && index < currentEmpResponsibilities.length) {
    currentEmpResponsibilities.splice(index, 1);
    renderEmpResponsibilitiesUI();
  }
}

function editEmpResponsibilityItem(index) {
  if (currentEmpResponsibilities && index >= 0 && index < currentEmpResponsibilities.length) {
    const item = currentEmpResponsibilities[index];
    const input = document.getElementById('inputNewResp');
    if (input) {
      input.value = item;
      input.focus();
    }
    currentEmpResponsibilities.splice(index, 1);
    renderEmpResponsibilitiesUI();
  }
}

// 5. Employee Directory Render
function renderEmployeesView() {
  if (!appData || !Array.isArray(appData.employees)) return;

  const emps = appData.employees;
  const total = emps.length;
  const active = emps.filter(e => e.status === 'active').length;
  const drivers = emps.filter(e => e.department === 'ขนส่ง & โลจิสติกส์').length;
  const prodTech = emps.filter(e => e.department === 'ฝ่ายผลิต & คุณภาพน้ำ' || e.department === 'ซ่อมบำรุง (CMMS)').length;
  
  // Calculate approximate monthly payroll
  const totalSalary = emps.reduce((sum, e) => {
    if (e.status !== 'active') return sum;
    if (e.salaryType === 'รายวัน') return sum + ((e.salary || 350) * 26);
    return sum + Number(e.salary || 0);
  }, 0);

  // Update KPI counters
  const elTotal = document.getElementById('kpiEmpTotal');
  const elActive = document.getElementById('kpiEmpActive');
  const elDrivers = document.getElementById('kpiEmpDrivers');
  const elProdTech = document.getElementById('kpiEmpProdTech');
  const elSalary = document.getElementById('kpiEmpSalary');
  const elBadge = document.getElementById('empTotalBadge');

  if (elTotal) elTotal.textContent = total.toLocaleString();
  if (elActive) elActive.textContent = `ปฏิบัติงาน ${active} คน`;
  if (elDrivers) elDrivers.textContent = drivers.toLocaleString();
  if (elProdTech) elProdTech.textContent = prodTech.toLocaleString();
  if (elSalary) elSalary.textContent = `฿${totalSalary.toLocaleString()}`;
  if (elBadge) elBadge.textContent = `${total} คน`;

  filterEmployees();
}

function filterEmployees() {
  if (!appData || !Array.isArray(appData.employees)) return;

  const search = (document.getElementById('empSearchInput')?.value || '').toLowerCase().trim();
  const deptFilter = document.getElementById('empDeptFilter')?.value || 'all';
  const statusFilter = document.getElementById('empStatusFilter')?.value || 'all';

  const filtered = appData.employees.filter(e => {
    if (deptFilter !== 'all' && e.department !== deptFilter) return false;
    if (statusFilter !== 'all' && e.status !== statusFilter) return false;
    if (search) {
      const matchName = (e.name || '').toLowerCase().includes(search);
      const matchNick = (e.nickname || '').toLowerCase().includes(search);
      const matchPhone = (e.phone || '').includes(search);
      const matchId = (e.id || '').toLowerCase().includes(search);
      const matchPos = (e.position || '').toLowerCase().includes(search);
      const matchPlate = (e.vehiclePlate || '').toLowerCase().includes(search);
      const matchResp = Array.isArray(e.responsibilities) && e.responsibilities.some(r => r.toLowerCase().includes(search));
      if (!matchName && !matchNick && !matchPhone && !matchId && !matchPos && !matchPlate && !matchResp) return false;
    }
    return true;
  });

  const elShowing = document.getElementById('empShowingCount');
  const elTotalFilt = document.getElementById('empTotalFiltered');
  if (elShowing) elShowing.textContent = filtered.length;
  if (elTotalFilt) elTotalFilt.textContent = appData.employees.length;

  const tbody = document.getElementById('employeesTableBody');
  if (!tbody) return;

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="12" class="text-center py-8 text-slate-400">
          <div class="text-2xl mb-1">👔</div>
          <div>ไม่พบข้อมูลพนักงานที่ตรงกับเงื่อนไขการค้นหา</div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(e => {
    let statusBadge = '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">🟢 ปฏิบัติงานปกติ</span>';
    if (e.status === 'leave') {
      statusBadge = '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">🟡 ลาพัก/พักงาน</span>';
    } else if (e.status === 'resigned') {
      statusBadge = '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">🔴 ลาออก</span>';
    }

    // Avatar or real uploaded photo
    let avatarHtml = `<div class="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-lg shrink-0">${e.gender === 'หญิง' ? '👩‍💼' : '👨‍💼'}</div>`;
    if (e.photo) {
      avatarHtml = `
        <div class="relative cursor-pointer group shrink-0" onclick="viewEmployeeDocById('${e.id}', 'photo')" title="คลิกดูรูปพนักงานขนาดเต็ม">
          <img src="${e.photo}" alt="${e.name}" class="w-10 h-10 rounded-full object-cover border-2 border-sky-400 shadow-xs group-hover:scale-105 transition" />
        </div>
      `;
    }

    // Document badges (ID Card & Driver License)
    let docBadges = [];
    if (e.idCardDoc && e.idCardDoc.data) {
      docBadges.push(`
        <button onclick="viewEmployeeDocById('${e.id}', 'idCard')" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 transition shadow-xs" title="คลิกดูสำเนาบัตรประชาชน">
          <span>💳</span> <span>บัตร ปชช.</span>
        </button>
      `);
    }
    if (e.driverLicenseDoc && e.driverLicenseDoc.data) {
      docBadges.push(`
        <button onclick="viewEmployeeDocById('${e.id}', 'license')" class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-200 transition shadow-xs" title="คลิกดูสำเนาใบขับขี่ / เอกสาร">
          <span>🪪</span> <span>ใบขับขี่</span>
        </button>
      `);
    }
    const docDisplay = docBadges.length > 0 
      ? `<div class="flex flex-wrap items-center justify-center gap-1">${docBadges.join('')}</div>`
      : '<span class="text-slate-400 text-[10px] italic">ไม่มีเอกสาร</span>';

    const salaryDisplay = e.salary ? `฿${Number(e.salary).toLocaleString()} <span class="text-[10px] text-slate-400">(${e.salaryType || 'รายเดือน'})</span>` : '-';
    const vehicleDisplay = e.vehiclePlate && e.vehiclePlate !== '-' ? `<span class="font-mono text-sky-800 font-semibold bg-sky-50 px-1.5 py-0.5 rounded border border-sky-200">${e.vehiclePlate}</span>` : '<span class="text-slate-400">-</span>';
    const userDisplay = e.username && e.username !== '-' ? `<span class="font-mono text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">👤 ${e.username}</span>` : '<span class="text-slate-400">-</span>';

    // Responsibilities badges
    let respDisplay = '<span class="text-slate-400 text-[10px] italic">- ยังไม่ได้ระบุ -</span>';
    if (Array.isArray(e.responsibilities) && e.responsibilities.length > 0) {
      respDisplay = `
        <div class="flex flex-wrap gap-1 max-w-[280px]">
          ${e.responsibilities.map(r => `
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-medium bg-slate-100 text-slate-700 border border-slate-200/80 leading-tight">
              <span class="text-sky-600 font-bold">•</span> <span>${r}</span>
            </span>
          `).join('')}
        </div>
      `;
    }

    return `
      <tr class="hover:bg-slate-50 transition border-b border-slate-100">
        <td class="p-3 font-mono font-bold text-sky-700">${e.id}</td>
        <td class="p-3">
          <div class="flex items-center gap-2.5">
            ${avatarHtml}
            <div>
              <div class="font-bold text-slate-900">${e.name} ${e.nickname ? `<span class="text-slate-500 font-normal">(${e.nickname})</span>` : ''}</div>
              <div class="text-[11px] text-slate-400">${e.gender || '-'} • รหัสบัตร: ${e.idCard ? e.idCard.slice(0, 5) + '...' : '-'}</div>
            </div>
          </div>
        </td>
        <td class="p-3">
          <div class="font-medium text-slate-800">${e.position}</div>
          <div class="text-[11px] text-slate-500">${e.department}</div>
        </td>
        <td class="p-3">
          ${respDisplay}
        </td>
        <td class="p-3">
          <div class="font-mono font-bold text-slate-800">📞 ${e.phone || '-'}</div>
          ${e.emergencyContact && e.emergencyContact !== '-' ? `<div class="text-[10px] text-slate-400">ฉุกเฉิน: ${e.emergencyContact}</div>` : ''}
        </td>
        <td class="p-3 text-center whitespace-nowrap">${docDisplay}</td>
        <td class="p-3 font-mono font-semibold">${salaryDisplay}</td>
        <td class="p-3 font-mono text-slate-600">${e.startDate || '-'}</td>
        <td class="p-3">
          <div>${vehicleDisplay}</div>
          ${e.driverLicense && e.driverLicense !== '-' ? `<div class="text-[10px] text-slate-500 mt-0.5">${e.driverLicense}</div>` : ''}
        </td>
        <td class="p-3">${userDisplay}</td>
        <td class="p-3 text-center">${statusBadge}</td>
        <td class="p-3 text-center">
          <div class="flex items-center justify-center gap-1">
            <button onclick="openEmployeeModal('${e.id}')" title="แก้ไขข้อมูลพนักงาน" class="p-1.5 rounded-lg bg-sky-50 text-sky-700 hover:bg-sky-100 transition">
              ✏️
            </button>
            <button onclick="deleteEmployee('${e.id}')" title="ลบข้อมูลพนักงาน" class="p-1.5 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 transition">
              🗑️
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function openEmployeeModal(empId = null) {
  const modal = document.getElementById('modalEmployeeForm');
  const title = document.getElementById('modalEmpTitle');
  if (!modal) return;

  const vehSelect = document.getElementById('empFormVehicleId');
  if (vehSelect) {
    let html = '<option value="-">-- ไม่มี / ไม่ได้ประจำรถ --</option>';
    (appData.vehicles || []).forEach(v => {
      const astStr = v.assetId ? ` [${v.assetId}]` : '';
      html += `<option value="${v.id}">${v.id}: ${v.plate} — ${v.name}${astStr}</option>`;
    });
    vehSelect.innerHTML = html;
  }

  if (empId) {
    const emp = (appData.employees || []).find(e => e.id === empId);
    if (!emp) return;
    if (title) title.textContent = `แก้ไขข้อมูลพนักงาน (${emp.id} - ${emp.name})`;
    document.getElementById('empFormId').value = emp.id;
    document.getElementById('empFormName').value = emp.name || '';
    document.getElementById('empFormNickname').value = emp.nickname || '';
    document.getElementById('empFormGender').value = emp.gender || 'ชาย';
    document.getElementById('empFormDepartment').value = emp.department || 'ขนส่ง & โลจิสติกส์';
    document.getElementById('empFormPosition').value = emp.position || '';
    document.getElementById('empFormPhone').value = emp.phone || '';
    document.getElementById('empFormIdCard').value = emp.idCard || '';
    document.getElementById('empFormStartDate').value = emp.startDate || '';
    document.getElementById('empFormSalaryType').value = emp.salaryType || 'รายเดือน';
    document.getElementById('empFormSalary').value = emp.salary || '';
    document.getElementById('empFormStatus').value = emp.status || 'active';
    document.getElementById('empFormDriverLicense').value = emp.driverLicense || '';
    document.getElementById('empFormDriverLicenseExpiry').value = emp.driverLicenseExpiry || '';
    document.getElementById('empFormVehicleId').value = emp.vehicleId || '-';
    document.getElementById('empFormUsername').value = emp.username || '-';
    document.getElementById('empFormEmergencyContact').value = emp.emergencyContact || '';
    document.getElementById('empFormAddress').value = emp.address || '';
    document.getElementById('empFormNotes').value = emp.notes || '';

    // Load photo
    currentEmpPhoto = emp.photo || '';
    const photoPreview = document.getElementById('empPhotoPreview');
    const photoPlaceholder = document.getElementById('empPhotoPlaceholder');
    const btnRemovePhoto = document.getElementById('btnRemoveEmpPhoto');
    if (currentEmpPhoto) {
      if (photoPreview) {
        photoPreview.src = currentEmpPhoto;
        photoPreview.classList.remove('hidden');
      }
      if (photoPlaceholder) photoPlaceholder.classList.add('hidden');
      if (btnRemovePhoto) btnRemovePhoto.classList.remove('hidden');
    } else {
      if (photoPreview) {
        photoPreview.src = '';
        photoPreview.classList.add('hidden');
      }
      if (photoPlaceholder) photoPlaceholder.classList.remove('hidden');
      if (btnRemovePhoto) btnRemovePhoto.classList.add('hidden');
    }

    // Load ID card doc
    currentEmpIdCard = emp.idCardDoc || null;
    updateIdCardUI();

    // Load Driver license doc
    currentEmpLicense = emp.driverLicenseDoc || null;
    updateLicenseUI();

    // Load responsibilities
    currentEmpResponsibilities = Array.isArray(emp.responsibilities) 
      ? [...emp.responsibilities] 
      : (emp.responsibilities ? String(emp.responsibilities).split('\n').map(r => r.trim()).filter(Boolean) : []);
    renderEmpResponsibilitiesUI();
    const inputResp = document.getElementById('inputNewResp');
    if (inputResp) inputResp.value = '';
  } else {
    if (title) title.textContent = 'เพิ่มข้อมูลพนักงานใหม่';
    document.getElementById('formEmployee').reset();
    document.getElementById('empFormId').value = '';
    document.getElementById('empFormStartDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('empFormStatus').value = 'active';

    currentEmpResponsibilities = [];
    renderEmpResponsibilitiesUI();
    const inputResp = document.getElementById('inputNewResp');
    if (inputResp) inputResp.value = '';

    removeEmpPhoto();
    removeEmpIdCard();
    removeEmpLicense();
  }

  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeEmployeeModal() {
  const modal = document.getElementById('modalEmployeeForm');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

async function saveEmployee(event) {
  event.preventDefault();
  const id = document.getElementById('empFormId').value.trim();
  const vehicleSelect = document.getElementById('empFormVehicleId');
  const vehicleId = vehicleSelect.value;
  const matchedVeh = (appData.vehicles || []).find(v => v.id === vehicleId);
  const vehiclePlate = matchedVeh ? matchedVeh.plate : '-';

  const payload = {
    name: document.getElementById('empFormName').value.trim(),
    nickname: document.getElementById('empFormNickname').value.trim(),
    gender: document.getElementById('empFormGender').value,
    department: document.getElementById('empFormDepartment').value,
    position: document.getElementById('empFormPosition').value.trim(),
    phone: document.getElementById('empFormPhone').value.trim(),
    idCard: document.getElementById('empFormIdCard').value.trim(),
    startDate: document.getElementById('empFormStartDate').value,
    salaryType: document.getElementById('empFormSalaryType').value,
    salary: Number(document.getElementById('empFormSalary').value || 0),
    status: document.getElementById('empFormStatus').value,
    driverLicense: document.getElementById('empFormDriverLicense').value.trim() || '-',
    driverLicenseExpiry: document.getElementById('empFormDriverLicenseExpiry').value || '-',
    vehicleId,
    vehiclePlate,
    username: document.getElementById('empFormUsername').value,
    emergencyContact: document.getElementById('empFormEmergencyContact').value.trim(),
    address: document.getElementById('empFormAddress').value.trim(),
    notes: document.getElementById('empFormNotes').value.trim(),
    responsibilities: currentEmpResponsibilities,
    photo: currentEmpPhoto || '',
    idCardDoc: currentEmpIdCard || null,
    driverLicenseDoc: currentEmpLicense || null
  };

  try {
    const isEdit = Boolean(id);
    const url = isEdit ? `/api/employees/${id}` : '/api/employees';
    const method = isEdit ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'บันทึกข้อมูลพนักงานไม่สำเร็จ');

    appData.employees = data.employees;
    closeEmployeeModal();
    renderEmployeesView();
    alert(`✅ บันทึกข้อมูลพนักงาน "${payload.name}" เรียบร้อยแล้ว`);
  } catch (err) {
    console.error('Error saving employee:', err);
    alert('เกิดข้อผิดพลาด: ' + err.message);
  }
}

async function deleteEmployee(empId) {
  const emp = (appData.employees || []).find(e => e.id === empId);
  if (!emp) return;

  if (!confirm(`⚠️ คุณแน่ใจหรือไม่ว่าต้องการลบข้อมูลพนักงาน:\n"${emp.id} - ${emp.name}" ?`)) {
    return;
  }

  try {
    const res = await fetch(`/api/employees/${empId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'ลบข้อมูลไม่สำเร็จ');

    appData.employees = data.employees;
    renderEmployeesView();
    alert(`🗑️ ลบข้อมูลพนักงาน "${emp.name}" เรียบร้อยแล้ว`);
  } catch (err) {
    console.error('Error deleting employee:', err);
    alert('เกิดข้อผิดพลาด: ' + err.message);
  }
}

// ==========================================
// 11. FIXED ASSETS MODULE (ทะเบียนสินทรัพย์และครุภัณฑ์)
// ==========================================
let currentAssetCategory = 'all';

function renderAssetsView() {
  if (!appData || !Array.isArray(appData.assets)) return;

  const assets = appData.assets;
  const totalCount = assets.length;

  const totalCost = assets.reduce((sum, a) => sum + Number(a.cost || 0), 0);
  const totalDeprec = assets.reduce((sum, a) => sum + Number(a.accumulatedDepreciation || 0), 0);
  const totalBookVal = assets.reduce((sum, a) => sum + Number(a.currentValue || 0), 0);

  const vehCount = assets.filter(a => a.category === 'vehicle').length;
  const machCount = assets.filter(a => a.category === 'machine').length;
  const itCount = assets.filter(a => a.category === 'it_computer').length;
  const offCount = assets.filter(a => a.category === 'office').length;
  const equipCount = assets.filter(a => a.category === 'factory_equip').length;
  const tankCount = assets.filter(a => a.category === 'container_tank').length;

  // Update KPI counters
  const elCost = document.getElementById('kpiAssetCost');
  const elCount = document.getElementById('kpiAssetCount');
  const elDeprec = document.getElementById('kpiAssetDeprec');
  const elBookVal = document.getElementById('kpiAssetBookVal');
  const elVehMac = document.getElementById('kpiAssetVehMac');
  const elBadge = document.getElementById('assetTotalBadge');

  if (elCost) elCost.textContent = `฿${totalCost.toLocaleString()}`;
  if (elCount) elCount.textContent = `${totalCount} รายการ`;
  if (elDeprec) elDeprec.textContent = `฿${totalDeprec.toLocaleString()}`;
  if (elBookVal) elBookVal.textContent = `฿${totalBookVal.toLocaleString()}`;
  if (elVehMac) elVehMac.textContent = `${vehCount} คัน / ${machCount} เครื่อง`;
  if (elBadge) elBadge.textContent = `${totalCount} รายการ`;

  // Update category tab count badges
  const cAll = document.getElementById('catCountAll');
  const cVeh = document.getElementById('catCountVehicle');
  const cMac = document.getElementById('catCountMachine');
  const cIt = document.getElementById('catCountIt');
  const cOff = document.getElementById('catCountOffice');
  const cEq = document.getElementById('catCountEquip');
  const cTank = document.getElementById('catCountContainerTank');

  if (cAll) cAll.textContent = totalCount;
  if (cVeh) cVeh.textContent = vehCount;
  if (cMac) cMac.textContent = machCount;
  if (cIt) cIt.textContent = itCount;
  if (cOff) cOff.textContent = offCount;
  if (cEq) cEq.textContent = equipCount;
  if (cTank) cTank.textContent = tankCount;

  filterAssets();
}

function setAssetCategoryFilter(category) {
  currentAssetCategory = category;

  // Update tab button styles
  const allBtns = document.querySelectorAll('.asset-cat-btn');
  allBtns.forEach(btn => {
    btn.classList.remove('bg-slate-900', 'text-white');
    btn.classList.add('bg-white', 'text-slate-700', 'border', 'border-slate-200');
  });

  const activeBtn = document.getElementById(`btn-asset-cat-${category}`);
  if (activeBtn) {
    activeBtn.classList.remove('bg-white', 'text-slate-700', 'border', 'border-slate-200');
    activeBtn.classList.add('bg-slate-900', 'text-white');
  }

  filterAssets();
}

function filterAssets() {
  if (!appData || !Array.isArray(appData.assets)) return;

  const search = (document.getElementById('assetSearchInput')?.value || '').toLowerCase().trim();
  const statusFilter = document.getElementById('assetStatusFilter')?.value || 'all';

  const filtered = appData.assets.filter(a => {
    if (currentAssetCategory !== 'all' && a.category !== currentAssetCategory) return false;
    if (statusFilter !== 'all' && a.status !== statusFilter) return false;
    if (search) {
      const matchName = (a.name || '').toLowerCase().includes(search);
      const matchBrand = (a.brand || '').toLowerCase().includes(search);
      const matchModel = (a.model || '').toLowerCase().includes(search);
      const matchSerial = (a.serialNo || '').toLowerCase().includes(search);
      const matchLoc = (a.location || '').toLowerCase().includes(search);
      const matchId = (a.id || '').toLowerCase().includes(search);
      const matchEmp = (a.assignedEmployeeName || '').toLowerCase().includes(search);
      const matchRef = (a.linkedRefId || '').toLowerCase().includes(search);
      if (!matchName && !matchBrand && !matchModel && !matchSerial && !matchLoc && !matchId && !matchEmp && !matchRef) return false;
    }
    return true;
  });

  const elShowing = document.getElementById('assetShowingCount');
  const elTotalFilt = document.getElementById('assetTotalFiltered');
  if (elShowing) elShowing.textContent = filtered.length;
  if (elTotalFilt) elTotalFilt.textContent = appData.assets.length;

  const tbody = document.getElementById('assetsTableBody');
  if (!tbody) return;

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="11" class="text-center py-8 text-slate-400">
          <div class="text-2xl mb-1">🏢</div>
          <div>ไม่พบข้อมูลสินทรัพย์ที่ตรงกับเงื่อนไขการค้นหา</div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(a => {
    let catBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">อุปกรณ์</span>';
    if (a.category === 'vehicle') catBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800">🚚 รถส่งน้ำ</span>';
    else if (a.category === 'machine') catBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-800">⚙️ เครื่องจักร</span>';
    else if (a.category === 'it_computer') catBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800">💻 ไอที/คอมฯ</span>';
    else if (a.category === 'office') catBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">🏢 สำนักงาน</span>';
    else if (a.category === 'factory_equip') catBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-teal-100 text-teal-800">🔧 อุปกรณ์โรงงาน</span>';
    else if (a.category === 'container_tank') catBadge = '<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-100 text-cyan-800">💧 ถังหมุนเวียน 18.9L</span>';

    let statusBadge = '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">🟢 ใช้งานปกติ</span>';
    if (a.status === 'maintenance') {
      statusBadge = '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">🟡 ซ่อมบำรุง</span>';
    } else if (a.status === 'standby') {
      statusBadge = '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800">🔵 สำรอง</span>';
    } else if (a.status === 'disposed') {
      statusBadge = '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">🔴 จำหน่ายออก</span>';
    }

    const assignedDisplay = a.assignedEmployeeName && a.assignedEmployeeName !== '-' 
      ? `<span class="text-slate-800 font-medium">👤 ${a.assignedEmployeeName}</span>` 
      : '<span class="text-slate-400">ส่วนกลาง</span>';

    let linkedBadge = '';
    if (a.linkedRefId) {
      if (a.linkedRefId.startsWith('ITR-')) {
        linkedBadge = `<span class="inline-flex items-center gap-0.5 text-[10px] bg-indigo-50 text-indigo-700 px-1.5 py-0.5 rounded font-mono font-bold border border-indigo-200">⚙️ ${a.linkedRefId}</span>`;
      } else if (a.linkedRefId.startsWith('LOT-')) {
        linkedBadge = `<span class="inline-flex items-center gap-0.5 text-[10px] bg-sky-50 text-sky-700 px-1.5 py-0.5 rounded font-mono font-bold border border-sky-200">🏷️ ${a.linkedRefId}</span>`;
      } else if (a.linkedRefId.startsWith('VEH-')) {
        linkedBadge = `<span class="inline-flex items-center gap-0.5 text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded font-mono font-bold border border-amber-200">🚚 ${a.linkedRefId}</span>`;
      }
    }

    return `
      <tr class="hover:bg-slate-50 transition border-b border-slate-100">
        <td class="p-3 font-mono font-bold text-indigo-700">${a.id}</td>
        <td class="p-3 whitespace-nowrap">${catBadge}</td>
        <td class="p-3">
          <div class="flex items-center gap-1.5 flex-wrap">
            <span class="font-bold text-slate-900">${a.name}</span>
            ${linkedBadge}
          </div>
          <div class="text-[11px] text-slate-500">${a.brand || '-'} ${a.model ? `• ${a.model}` : ''}</div>
        </td>
        <td class="p-3 font-mono font-semibold text-slate-700">${a.serialNo || '-'}</td>
        <td class="p-3 text-slate-600">${a.location || '-'}</td>
        <td class="p-3 whitespace-nowrap">${assignedDisplay}</td>
        <td class="p-3 text-right font-mono font-bold text-slate-800">฿${Number(a.cost || 0).toLocaleString()}</td>
        <td class="p-3 text-right font-mono text-amber-700 font-semibold">฿${Number(a.accumulatedDepreciation || 0).toLocaleString()}</td>
        <td class="p-3 text-right font-mono font-black text-emerald-700">฿${Number(a.currentValue || 0).toLocaleString()}</td>
        <td class="p-3 text-center whitespace-nowrap">${statusBadge}</td>
        <td class="p-3 text-center">
          <div class="flex items-center justify-center gap-1">
            <button onclick="openAssetModal('${a.id}')" title="แก้ไขสินทรัพย์" class="p-1.5 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition">
              ✏️
            </button>
            <button onclick="deleteAsset('${a.id}')" title="ลบสินทรัพย์" class="p-1.5 rounded-lg bg-rose-50 text-rose-700 hover:bg-rose-100 transition">
              🗑️
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function calculateDepreciationInForm() {
  const cost = Number(document.getElementById('assetFormCost')?.value || 0);
  const usefulLife = Number(document.getElementById('assetFormUsefulLife')?.value || 5);
  const salvage = Number(document.getElementById('assetFormSalvageValue')?.value || 0);
  const acqDate = document.getElementById('assetFormAcquisitionDate')?.value;

  const depPerYear = usefulLife > 0 ? Math.round(Math.max(0, cost - salvage) / usefulLife) : 0;
  
  let yearsPassed = 0;
  if (acqDate) {
    const acqYear = new Date(acqDate).getFullYear() || 2024;
    const currentYear = new Date().getFullYear();
    yearsPassed = Math.max(0, currentYear - acqYear);
  }

  const accumDep = Math.min(Math.max(0, cost - salvage), Math.round(depPerYear * yearsPassed));
  const netBookValue = Math.max(salvage, cost - accumDep);

  const elDepPerYear = document.getElementById('previewDepPerYear');
  const elAccumDep = document.getElementById('previewAccumDep');
  const elNetBookVal = document.getElementById('previewNetBookValue');

  if (elDepPerYear) elDepPerYear.textContent = `฿${depPerYear.toLocaleString()}/ปี`;
  if (elAccumDep) elAccumDep.textContent = `฿${accumDep.toLocaleString()}`;
  if (elNetBookVal) elNetBookVal.textContent = `฿${netBookValue.toLocaleString()}`;
}

function populateAssetEmployeeDropdown(selectedEmpId = '-') {
  const sel = document.getElementById('assetFormAssignedEmp');
  if (!sel) return;

  const emps = appData?.employees || [];
  let html = '<option value="-">-- ไม่มีผู้รับผิดชอบเจาะจง / ใช้ส่วนกลาง --</option>';
  emps.forEach(e => {
    const isSel = e.id === selectedEmpId ? 'selected' : '';
    html += `<option value="${e.id}" ${isSel}>${e.id}: ${e.name} (${e.department})</option>`;
  });
  sel.innerHTML = html;
}

function openAssetModal(assetId = null) {
  const modal = document.getElementById('modalAssetForm');
  const title = document.getElementById('modalAssetTitle');
  if (!modal) return;

  if (assetId) {
    const asset = (appData.assets || []).find(a => a.id === assetId);
    if (!asset) return;
    if (title) title.textContent = `แก้ไขสินทรัพย์ (${asset.id} - ${asset.name})`;
    document.getElementById('assetFormId').value = asset.id;
    document.getElementById('assetFormCategory').value = asset.category || 'other';
    document.getElementById('assetFormName').value = asset.name || '';
    document.getElementById('assetFormBrand').value = asset.brand || '';
    document.getElementById('assetFormModel').value = asset.model || '';
    document.getElementById('assetFormSerialNo').value = asset.serialNo || '';
    document.getElementById('assetFormLocation').value = asset.location || '';
    document.getElementById('assetFormAcquisitionDate').value = asset.acquisitionDate || '';
    document.getElementById('assetFormStatus').value = asset.status || 'in_use';
    document.getElementById('assetFormCost').value = asset.cost || '';
    document.getElementById('assetFormUsefulLife').value = asset.usefulLifeYears || 5;
    document.getElementById('assetFormSalvageValue').value = asset.salvageValue || 0;
    populateAssetEmployeeDropdown(asset.assignedEmployeeId);
    document.getElementById('assetFormLinkedRef').value = asset.linkedRefId || '';
    document.getElementById('assetFormNotes').value = asset.notes || '';
    calculateDepreciationInForm();
  } else {
    if (title) title.textContent = 'เพิ่มสินทรัพย์ / ครุภัณฑ์ใหม่';
    document.getElementById('formAsset').reset();
    document.getElementById('assetFormId').value = '';
    document.getElementById('assetFormAcquisitionDate').value = new Date().toISOString().split('T')[0];
    document.getElementById('assetFormUsefulLife').value = 5;
    document.getElementById('assetFormSalvageValue').value = 0;
    document.getElementById('assetFormStatus').value = 'in_use';
    populateAssetEmployeeDropdown('-');
    calculateDepreciationInForm();
  }

  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeAssetModal() {
  const modal = document.getElementById('modalAssetForm');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

async function saveAsset(event) {
  event.preventDefault();
  const id = document.getElementById('assetFormId').value.trim();
  const empSelect = document.getElementById('assetFormAssignedEmp');
  const assignedEmployeeId = empSelect.value;
  let assignedEmployeeName = '-';
  if (assignedEmployeeId && assignedEmployeeId !== '-') {
    const foundEmp = (appData.employees || []).find(e => e.id === assignedEmployeeId);
    if (foundEmp) assignedEmployeeName = foundEmp.name;
  }

  const cost = Number(document.getElementById('assetFormCost').value || 0);
  const usefulLifeYears = Number(document.getElementById('assetFormUsefulLife').value || 5);
  const salvageValue = Number(document.getElementById('assetFormSalvageValue').value || 0);
  const acquisitionDate = document.getElementById('assetFormAcquisitionDate').value;

  const payload = {
    category: document.getElementById('assetFormCategory').value,
    name: document.getElementById('assetFormName').value.trim(),
    brand: document.getElementById('assetFormBrand').value.trim(),
    model: document.getElementById('assetFormModel').value.trim(),
    serialNo: document.getElementById('assetFormSerialNo').value.trim(),
    location: document.getElementById('assetFormLocation').value.trim(),
    acquisitionDate,
    status: document.getElementById('assetFormStatus').value,
    cost,
    usefulLifeYears,
    salvageValue,
    assignedEmployeeId,
    assignedEmployeeName,
    linkedRefId: document.getElementById('assetFormLinkedRef').value.trim() || '-',
    notes: document.getElementById('assetFormNotes').value.trim()
  };

  try {
    const isEdit = Boolean(id);
    const url = isEdit ? `/api/assets/${id}` : '/api/assets';
    const method = isEdit ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'บันทึกข้อมูลสินทรัพย์ไม่สำเร็จ');

    appData.assets = data.assets;
    closeAssetModal();
    renderAssetsView();
    alert(`✅ บันทึกสินทรัพย์ "${payload.name}" เรียบร้อยแล้ว`);
  } catch (err) {
    console.error('Error saving asset:', err);
    alert('เกิดข้อผิดพลาด: ' + err.message);
  }
}

async function deleteAsset(assetId) {
  const asset = (appData.assets || []).find(a => a.id === assetId);
  if (!asset) return;

  if (!confirm(`⚠️ คุณแน่ใจหรือไม่ว่าต้องการลบข้อมูลสินทรัพย์:\n"${asset.id} - ${asset.name}" ?`)) {
    return;
  }

  try {
    const res = await fetch(`/api/assets/${assetId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'ลบข้อมูลสินทรัพย์ไม่สำเร็จ');

    appData.assets = data.assets;
    renderAssetsView();
    alert(`🗑️ ลบข้อมูลสินทรัพย์ "${asset.name}" เรียบร้อยแล้ว`);
  } catch (err) {
    console.error('Error deleting asset:', err);
    alert('เกิดข้อผิดพลาด: ' + err.message);
  }
}
