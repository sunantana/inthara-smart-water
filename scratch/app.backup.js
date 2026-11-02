// Inthara Smart Water ERP — Frontend Application Logic (GPS TMS, OSRM Routing, CMMS, Production, Costing)
let appData = {
  factory: {
    lat: 17.816882513503195,
    lng: 100.36169257553256,
    name: 'โรงงานน้ำดื่มอินธารา (สำนักงานใหญ่)',
    address: '121 หมู่ 4 ต.จริม อ.ท่าปลา จ.อุตรดิตถ์'
  },
  customers: [],
  machines: [],
  maintenanceLogs: [],
  productionLots: [],
  inventory: [],
  vehicles: [],
  expenses: [],
  savedTrips: [],
  orders: []
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

function switchTab(tabName) {
  const allTabs = ['dashboard', 'customers', 'orders', 'tms', 'production', 'cmms', 'inventory', 'costing', 'security'];
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
  populateTmsZoneFilterDropdown();
  currentOrderedStops = appData.customers.filter(c => c.selectedForRoute);
  optimizeRoute('nearest');
  renderSavedTripsTable();
  renderDashboard();
  renderCustomersMasterView();
  renderOrdersView();
  renderProductionView();
  renderCmmsView();
  renderInventoryView();
  renderCostingView();
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

function populateVehicleSelect() {
  const sel = document.getElementById('vehicleSelect');
  const currentVal = sel.value;
  sel.innerHTML = appData.vehicles.map(v =>
    `<option value="${v.id}">🚚 ${v.plate} — ${v.driver} (จุ ${v.maxBottles189L} ถัง)</option>`
  ).join('');
  if (currentVal && appData.vehicles.some(v => v.id === currentVal)) {
    sel.value = currentVal;
  }
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

function toggleCustomerInRoute(customerId, include) {
  const cust = appData.customers.find(c => c.id === customerId);
  if (!cust) return;
  cust.selectedForRoute = include;
  if (include) {
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
    L.marker([stop.lat, stop.lng], { icon: stopIcon })
      .bindPopup(`
        <div class="text-xs space-y-1 font-sans min-w-[200px]">
          <div class="font-bold text-sky-800 text-sm">จุดที่ ${seqNum}: ${stop.name}</div>
          <div class="text-slate-500">${stop.address} (${stop.phone})</div>
          <div class="bg-slate-100 p-1.5 rounded text-slate-800 font-medium">
            • ถัง 18.9L: <b>${stop.orderBottles189L}</b> ถัง<br/>
            • แพ็ค 350ml: <b>${stop.orderPack350ml || 0}</b> | 600ml: <b>${stop.orderPack600ml || 0}</b> | 1.5L: <b>${stop.orderPack1500ml || 0}</b> แพ็ค<br/>
            • ถังค้างสะสมที่ร้าน: <b class="text-amber-700">${stop.OutstandingBottles} ใบ</b>
          </div>
          <div class="pt-1 flex gap-1.5">
            <a href="${navUrl}" target="_blank" class="bg-sky-600 text-white px-2.5 py-1 rounded text-center font-semibold flex-1">📍 นำทาง Google Maps</a>
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

  const totalBottles189L = currentOrderedStops.reduce((sum, s) => sum + Number(s.orderBottles189L || 0), 0);
  const totalPacks350 = currentOrderedStops.reduce((sum, s) => sum + Number(s.orderPack350ml || 0), 0);
  const totalPacks600 = currentOrderedStops.reduce((sum, s) => sum + Number(s.orderPack600ml || 0), 0);
  const totalPacks1500 = currentOrderedStops.reduce((sum, s) => sum + Number(s.orderPack1500ml || 0), 0);
  const totalPacks = totalPacks350 + totalPacks600 + totalPacks1500;
  const totalRevenue = (totalBottles189L * 15) + (totalPacks * 35);

  currentRouteStats = {
    distanceKm: Number(totalDistKm.toFixed(1)),
    durationMin: totalDurationMin,
    fuelCost,
    totalBottles189L,
    totalPacks,
    totalRevenue
  };

  document.getElementById('tmsKpiStops').textContent = `${currentOrderedStops.length} จุดส่ง`;
  document.getElementById('tmsKpiDistance').textContent = `${totalDistKm.toFixed(1)} กม.`;
  document.getElementById('tmsKpiRouteMode').textContent = usedOsrm ? '✓ คำนวณตามเส้นทางถนนจริง (OSRM)' : 'คำนวณระยะทางพิกัด GPS';
  document.getElementById('tmsKpiDuration').textContent = `${totalDurationMin} นาที`;
  document.getElementById('tmsKpiFuel').textContent = `฿${fuelCost.toLocaleString()}`;
  document.getElementById('tmsKpiFuelDetail').textContent = `ใช้น้ำมัน ~${litersUsed.toFixed(1)} ลิตร (${vehicle.plate})`;
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
  if (badgeCount) badgeCount.textContent = currentOrderedStops.length;

  let cumulativeKm = 0;

  if (currentOrderedStops.length === 0) {
    listEl.innerHTML = `
      <div class="p-8 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200 space-y-2">
        <div class="text-2xl">🚚</div>
        <div class="font-medium text-slate-600">ยังไม่มีจุดส่งในสายส่งนี้</div>
        <p class="text-[11px] text-slate-400">กดแท็บ "รอจัดสาย/ทั้งหมด" เพื่อเลือกจุดส่ง หรือกดปุ่ม "+ เลือกทั้งหมด"</p>
        <button type="button" onclick="setTmsQueueTab('standby')" class="mt-2 text-xs bg-sky-600 hover:bg-sky-700 text-white font-semibold px-3 py-1.5 rounded-lg transition inline-flex items-center gap-1">
          <span>📋</span> เลือกจุดส่งเข้าสาย
        </button>
      </div>`;
  } else {
    listEl.innerHTML = currentOrderedStops.map((stop, idx) => {
      const legKm = legDistancesKm[idx] || 0;
      cumulativeKm += legKm;
      const isDone = stop.deliveryStatus === 'completed';
      const singleNavUrl = `https://www.google.com/maps/dir/?api=1&destination=${stop.lat},${stop.lng}&travelmode=driving`;
      const q189 = Number(stop.orderBottles189L || 0);
      const q350 = Number(stop.orderPack350ml || 0);
      const q600 = Number(stop.orderPack600ml || 0);
      const q1500 = Number(stop.orderPack1500ml || 0);

      return `
        <div class="p-2.5 rounded-xl border ${isDone ? 'bg-emerald-50/70 border-emerald-300' : 'bg-slate-50/90 hover:bg-white border-slate-200 shadow-xs'} transition flex flex-col gap-1.5">
          <!-- Card Header -->
          <div class="flex items-start justify-between gap-2">
            <div class="flex items-start gap-2 min-w-0">
              <span class="w-6 h-6 rounded-lg ${isDone ? 'bg-emerald-600' : 'bg-sky-600'} text-white font-extrabold text-xs flex items-center justify-center shrink-0 shadow-xs">
                ${idx + 1}
              </span>
              <div class="min-w-0">
                <div class="font-bold text-slate-800 text-xs flex items-center gap-1.5 flex-wrap">
                  <span class="truncate">${stop.name}</span>
                  <span class="bg-slate-200/80 text-slate-700 text-[10px] px-1.5 py-0.2 rounded font-medium">${stop.zone || 'ทั่วไป'}</span>
                  ${isDone ? '<span class="bg-emerald-600 text-white text-[10px] px-1.5 py-0.2 rounded-full font-bold">✓ ส่งแล้ว</span>' : ''}
                </div>
                <div class="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5 flex-wrap">
                  ${stop.phone ? `<a href="tel:${stop.phone}" class="text-sky-700 hover:underline font-mono inline-flex items-center gap-0.5">📞 ${stop.phone}</a>` : '<span class="text-slate-400">ไม่มีเบอร์โทร</span>'}
                  <span class="text-slate-300">•</span>
                  <span class="text-slate-600 truncate max-w-[200px]">${stop.address || '-'}</span>
                </div>
              </div>
            </div>

            <!-- Up / Down / Remove Controls -->
            <div class="flex items-center gap-0.5 shrink-0">
              <button type="button" onclick="moveStopOrder(${idx}, -1)" title="เลื่อนลำดับขึ้น" class="w-6 h-6 flex items-center justify-center text-xs bg-white border border-slate-200 rounded hover:bg-slate-100 text-slate-600 font-bold">↑</button>
              <button type="button" onclick="moveStopOrder(${idx}, 1)" title="เลื่อนลำดับลง" class="w-6 h-6 flex items-center justify-center text-xs bg-white border border-slate-200 rounded hover:bg-slate-100 text-slate-600 font-bold">↓</button>
              <button type="button" onclick="toggleCustomerInRoute('${stop.id}', false)" title="นำออกจากสายส่งนี้" class="w-6 h-6 flex items-center justify-center text-xs bg-white border border-rose-200 rounded hover:bg-rose-50 text-rose-600 font-bold">✕</button>
            </div>
          </div>

          <!-- Product Badges & Stats Row -->
          <div class="flex flex-wrap items-center justify-between gap-1 bg-white p-1.5 rounded-lg border border-slate-200/80 text-[11px]">
            <div class="flex flex-wrap items-center gap-1 font-semibold">
              <span class="bg-sky-100 text-sky-800 px-1.5 py-0.5 rounded text-[10px]">18.9L: <b>${q189}</b> ถัง</span>
              ${q350 > 0 ? `<span class="bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded text-[10px]">350ml: <b>${q350}</b></span>` : ''}
              ${q600 > 0 ? `<span class="bg-blue-100 text-blue-900 px-1.5 py-0.5 rounded text-[10px]">600ml: <b>${q600}</b></span>` : ''}
              ${q1500 > 0 ? `<span class="bg-indigo-100 text-indigo-900 px-1.5 py-0.5 rounded text-[10px]">1.5L: <b>${q1500}</b></span>` : ''}
            </div>
            <div class="flex items-center gap-2 text-[10px] text-slate-500 font-medium">
              <span>ถังค้าง: <b class="text-amber-700">${stop.OutstandingBottles || 0}</b></span>
              <span class="text-sky-700 font-bold">+${legKm.toFixed(1)} กม.</span>
            </div>
          </div>

          <!-- Action Buttons Row -->
          <div class="grid grid-cols-2 gap-1.5 pt-0.5">
            <a href="${singleNavUrl}" target="_blank" class="bg-white hover:bg-sky-50 text-sky-700 border border-sky-300 font-bold text-[11px] py-1 px-2 rounded-lg text-center transition flex items-center justify-center gap-1">
              <span>🧭</span> นำทาง GPS
            </a>
            <button type="button" onclick="openCheckinModal('${stop.id}')" class="${isDone ? 'bg-emerald-600 text-white' : 'bg-emerald-500 hover:bg-emerald-600 text-slate-950'} font-bold text-[11px] py-1 px-2 rounded-lg transition flex items-center justify-center gap-1 shadow-xs">
              <span>📦</span> ${isDone ? `✓ ส่ง ${stop.deliveredBottles || q189} / คืน ${stop.returnedBottles || 0}` : 'บันทึกส่งสำเร็จ'}
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  // Render Standby / Available Stops
  renderUnselectedStopsChips();
}

function renderUnselectedStopsChips() {
  const unselEl = document.getElementById('unselectedStopsList');
  const badgeCount = document.getElementById('badgeTmsStandbyCount');
  if (!appData || !Array.isArray(appData.customers)) return;

  const unselected = appData.customers.filter(c => !currentOrderedStops.some(s => s.id === c.id));
  if (badgeCount) badgeCount.textContent = unselected.length;

  if (!unselEl) return;
  if (unselected.length === 0) {
    unselEl.innerHTML = `<div class="p-6 text-center text-xs text-slate-400 bg-slate-50 rounded-xl">✓ ลูกค้าทั้งหมดถูกจัดเข้าสายส่งแล้ว</div>`;
    return;
  }

  unselEl.innerHTML = unselected.map(c => {
    const q189 = Number(c.orderBottles189L || 0);
    const q350 = Number(c.orderPack350ml || 0);
    const q600 = Number(c.orderPack600ml || 0);
    const q1500 = Number(c.orderPack1500ml || 0);
    const totalP = q350 + q600 + q1500;
    return `
      <div class="p-2 rounded-xl bg-slate-50 hover:bg-white border border-slate-200 transition flex items-center justify-between gap-2 text-xs">
        <div class="min-w-0">
          <div class="font-bold text-slate-800 flex items-center gap-1.5">
            <span class="truncate">${c.name}</span>
            <span class="bg-slate-200 text-slate-700 text-[10px] px-1.5 py-0.2 rounded font-medium">${c.zone || 'ทั่วไป'}</span>
          </div>
          <div class="text-[10px] text-slate-500 mt-0.5">
            สั่ง: <b class="text-sky-700">${q189}</b> ถัง • <b class="text-slate-700">${totalP}</b> แพ็ค • ถังค้าง: <b class="text-amber-700">${c.OutstandingBottles || 0}</b>
          </div>
        </div>
        <button type="button" onclick="toggleCustomerInRoute('${c.id}', true)" class="bg-sky-600 hover:bg-sky-700 text-white font-bold text-[11px] px-2.5 py-1 rounded-lg transition shrink-0 flex items-center gap-0.5">
          <span>+</span> เข้าสาย
        </button>
      </div>
    `;
  }).join('');
}

// Queue Tabs & Search/Filter Controls for TMS
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

  // Filter in-route cards
  const inRouteCards = document.querySelectorAll('#orderedStopsList > div');
  inRouteCards.forEach(card => {
    const text = card.textContent.toLowerCase();
    const matchSearch = !search || text.includes(search);
    const matchZone = zone === 'ALL' || text.includes(zone.toLowerCase());
    card.style.display = (matchSearch && matchZone) ? '' : 'none';
  });

  // Filter standby items
  const standbyCards = document.querySelectorAll('#unselectedStopsList > div');
  standbyCards.forEach(card => {
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
  if (currentOrderedStops.length === 0) return;
  const vehId = document.getElementById('vehicleSelect').value;
  const vehicle = appData.vehicles.find(v => v.id === vehId) || appData.vehicles[0];
  const tripPayload = {
    tripId: 'TRIP-' + new Date().toISOString().slice(2, 10).replace(/-/g, '') + '-' + String(appData.savedTrips.length + 1).padStart(2, '0'),
    date: new Date().toISOString().slice(0, 10),
    vehicleId: vehicle.id,
    vehicleName: `${vehicle.plate} (${vehicle.driver})`,
    stopsCount: currentOrderedStops.length,
    totalDistanceKm: currentRouteStats.distanceKm,
    estimatedTimeMin: currentRouteStats.durationMin,
    estimatedFuelCost: currentRouteStats.fuelCost,
    totalBottles189L: currentRouteStats.totalBottles189L,
    totalPacks: currentRouteStats.totalPacks,
    totalRevenue: currentRouteStats.totalRevenue,
    status: 'บันทึกสายส่ง & ตัดค่าน้ำมันแล้ว'
  };

  tripPayload.stopCustomerIds = currentOrderedStops.map(s => s.id);
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
    renderSavedTripsTable();
    renderCostingView();
    renderDashboard();
    alert('✅ บันทึกใบคุมสายส่งและเคลียร์ลำดับการเดินรถเรียบร้อยแล้ว');
  }
}

function renderSavedTripsTable() {
  const tbody = document.getElementById('savedTripsTableBody');
  const countBadge = document.getElementById('savedTripsCountBadge');
  const trips = appData?.savedTrips || [];
  if (countBadge) countBadge.textContent = `${trips.length} ทริป`;
  if (!tbody) return;
  if (trips.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="p-4 text-center text-slate-400">ยังไม่มีประวัติใบคุมสายส่ง</td></tr>';
    return;
  }
  tbody.innerHTML = trips.map(t => `
    <tr class="hover:bg-slate-50">
      <td class="p-2.5 font-mono font-semibold text-sky-700">${t.tripId}</td>
      <td class="p-2.5">${t.date}</td>
      <td class="p-2.5 font-medium">${t.vehicleName}</td>
      <td class="p-2.5 text-center">${t.stopsCount} จุด</td>
      <td class="p-2.5 text-right font-semibold text-emerald-700">${t.totalDistanceKm} กม. (${t.estimatedTimeMin} นาที)</td>
      <td class="p-2.5 text-right">${t.totalBottles189L} ถัง / ${t.totalPacks} แพ็ค</td>
      <td class="p-2.5 text-right text-rose-600 font-medium">฿${Number(t.estimatedFuelCost).toLocaleString()}</td>
      <td class="p-2.5 text-right font-bold text-slate-800">฿${Number(t.totalRevenue).toLocaleString()}</td>
      <td class="p-2.5 text-center"><span class="bg-emerald-100 text-emerald-800 text-xs px-2.5 py-0.5 rounded-full">${t.status}</span></td>
    </tr>
  `).join('');
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
function renderProductionView() {
  const tbody = document.getElementById('productionTableBody');
  tbody.innerHTML = appData.productionLots.map(l => `
    <tr class="hover:bg-slate-50">
      <td class="p-2.5">
        <div class="font-bold text-sky-700">${l.lotNo}</div>
        <div class="text-[11px] text-slate-400">${l.date}</div>
      </td>
      <td class="p-2.5 text-right font-bold text-slate-800">${l.bottle18_9L} ถัง</td>
      <td class="p-2.5 text-right">${l.pack600ml} แพ็ค</td>
      <td class="p-2.5 text-right">${l.pack1500ml} แพ็ค</td>
      <td class="p-2.5 text-center">
        <span class="text-slate-500">${l.tdsRaw}</span> → <span class="font-bold text-emerald-700">${l.tdsRo} ppm</span>
      </td>
      <td class="p-2.5 text-center font-medium">${l.phValue}</td>
      <td class="p-2.5 text-center">${l.roPressurePsi} PSI</td>
      <td class="p-2.5">
        <div class="text-emerald-700 font-semibold">${l.uvStatus}</div>
        <div class="text-[11px] text-slate-400">ผู้ตรวจ: ${l.qcInspector}</div>
      </td>
    </tr>
  `).join('');
}

async function submitProductionLot(e) {
  e.preventDefault();
  const payload = {
    lotNo: document.getElementById('prodLotNo').value,
    date: document.getElementById('prodDate').value,
    shift: 'กะปกติ (08:00-17:00)',
    bottle18_9L: Number(document.getElementById('prod189').value),
    pack350ml: Number(document.getElementById('prod350')?.value || 0),
    pack600ml: Number(document.getElementById('prod600').value),
    pack1500ml: Number(document.getElementById('prod1500').value),
    tdsRaw: Number(document.getElementById('prodTdsRaw').value),
    tdsRo: Number(document.getElementById('prodTdsRo').value),
    phValue: Number(document.getElementById('prodPh').value),
    roPressurePsi: Number(document.getElementById('prodPressure').value),
    defectCount: Number(document.getElementById('prodDefect').value),
    qcInspector: document.getElementById('prodInspector').value,
    uvStatus: 'ปกติ (ผ่านเกณฑ์)'
  };
  const res = await fetch('/api/production', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const out = await res.json();
  if (out.ok) {
    appData = out.data;
    renderAllViews();
  }
}

// ==========================================
// 4. CMMS (16 MACHINES MAINTENANCE)
// ==========================================
function renderCmmsView() {
  const grid = document.getElementById('machinesGrid');
  grid.innerHTML = appData.machines.map(m => {
    const pct = Math.min(100, Math.round((m.runHours / m.pmIntervalHours) * 100));
    let badgeHtml = `<span class="bg-emerald-100 text-emerald-800 text-[11px] px-2 py-0.5 rounded-full font-medium">● ปกติ</span>`;
    let barColor = 'bg-emerald-500';
    if (m.status === 'due') {
      badgeHtml = `<span class="bg-rose-100 text-rose-800 text-[11px] px-2 py-0.5 rounded-full font-semibold animate-pulse">⚠️ ถึงรอบ PM</span>`;
      barColor = 'bg-rose-500';
    } else if (m.status === 'warning') {
      badgeHtml = `<span class="bg-amber-100 text-amber-800 text-[11px] px-2 py-0.5 rounded-full font-semibold">▲ ใกล้ครบกำหนด</span>`;
      barColor = 'bg-amber-500';
    }

    return `
      <div class="bg-white rounded-xl p-4 shadow-sm border border-slate-200 flex flex-col justify-between gap-2.5">
        <div>
          <div class="flex items-center justify-between gap-1 mb-1">
            <span class="font-mono font-bold text-xs bg-slate-100 text-slate-800 px-2 py-0.5 rounded border border-slate-300">${m.code}</span>
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

        <div class="flex items-center justify-between pt-1 border-t border-slate-100 text-[11px]">
          <span class="text-slate-400">PM ล่าสุด: ${m.lastPmDate}</span>
          <button onclick="openMaintenanceModal('${m.code}')" class="text-sky-600 hover:text-sky-800 font-semibold">
            🔧 บันทึกซ่อม/ล้าง
          </button>
        </div>
      </div>
    `;
  }).join('');

  const tbody = document.getElementById('maintenanceTableBody');
  tbody.innerHTML = appData.maintenanceLogs.map(log => `
    <tr class="hover:bg-slate-50">
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

function openMaintenanceModal(machineCode) {
  const sel = document.getElementById('mntMachineSelect');
  sel.innerHTML = appData.machines.map(m =>
    `<option value="${m.code}">${m.code} — ${m.name}</option>`
  ).join('');
  if (machineCode) sel.value = machineCode;
  const m = appData.machines.find(x => x.code === sel.value);
  if (m) document.getElementById('mntAction').value = m.nextPmTask;
  document.getElementById('modalMaintenance').classList.remove('hidden');
  document.getElementById('modalMaintenance').classList.add('flex');
}

function closeMaintenanceModal() {
  document.getElementById('modalMaintenance').classList.add('hidden');
  document.getElementById('modalMaintenance').classList.remove('flex');
}

async function submitMaintenanceLog(e) {
  e.preventDefault();
  const payload = {
    id: 'MNT-' + Date.now().toString().slice(-6),
    machineCode: document.getElementById('mntMachineSelect').value,
    date: document.getElementById('mntDate').value,
    type: document.getElementById('mntType').value,
    action: document.getElementById('mntAction').value,
    technician: document.getElementById('mntTech').value,
    cost: Number(document.getElementById('mntCost').value),
    status: 'completed'
  };
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
  }
}

// ==========================================
// 5. INVENTORY & 18.9L BOTTLE TRACKING
// ==========================================
function renderInventoryView() {
  const invBody = document.getElementById('inventoryTableBody');
  invBody.innerHTML = appData.inventory.map(item => {
    const low = item.stock <= item.minStock;
    return `
      <tr class="hover:bg-slate-50">
        <td class="p-2.5 font-mono text-xs font-semibold text-slate-600">${item.sku}</td>
        <td class="p-2.5 font-medium text-slate-800">${item.name}</td>
        <td class="p-2.5 text-xs text-slate-500">${item.category}</td>
        <td class="p-2.5 text-right font-bold ${low ? 'text-rose-600' : 'text-emerald-700'}">${item.stock.toLocaleString()} ${item.unit}</td>
        <td class="p-2.5 text-right text-xs">฿${item.unitPrice} <span class="text-slate-400">(ทุน ฿${item.unitCost})</span></td>
        <td class="p-2.5 text-center">
          ${low
            ? '<span class="bg-rose-100 text-rose-800 text-xs px-2 py-0.5 rounded-full">ใกล้หมด</span>'
            : '<span class="bg-emerald-100 text-emerald-800 text-xs px-2 py-0.5 rounded-full">เพียงพอ</span>'}
        </td>
      </tr>
    `;
  }).join('');

  const bottleBody = document.getElementById('bottleLedgerTableBody');
  bottleBody.innerHTML = appData.customers.map(c => `
    <tr class="hover:bg-slate-50">
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
  const cust = appData.customers.find(c => c.id === customerId);
  if (!cust) return;
  document.getElementById('checkinCustId').value = cust.id;
  document.getElementById('checkinCustTitle').textContent = `${cust.name} (ถังค้างเดิม ${cust.OutstandingBottles} ถัง)`;
  document.getElementById('checkinDelivered').value = cust.orderBottles189L;
  document.getElementById('checkinReturned').value = cust.orderBottles189L;
  document.getElementById('modalCheckin').classList.remove('hidden');
  document.getElementById('modalCheckin').classList.add('flex');
}

function closeCheckinModal() {
  document.getElementById('modalCheckin').classList.add('hidden');
  document.getElementById('modalCheckin').classList.remove('flex');
}

async function submitDriverCheckin(e) {
  e.preventDefault();
  const custId = document.getElementById('checkinCustId').value;
  const payload = {
    customerId: custId,
    deliveredBottles: Number(document.getElementById('checkinDelivered').value),
    returnedBottles: Number(document.getElementById('checkinReturned').value)
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
    // Clear completed stop from active route sequence so remaining stops advance
    currentOrderedStops = currentOrderedStops.filter(s => s.id !== custId);
    recalculateCurrentRoute();
    renderAllViews();
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
          { moo: 'หมู่ 12', lat: 17.7940, lng: 100.3835 }
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
          { moo: 'หมู่ 11', lat: 17.7935, lng: 100.4360 }
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
          { moo: 'หมู่ 10', lat: 17.7595, lng: 100.5550 }
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
          { moo: 'หมู่ 11', lat: 17.8495, lng: 100.3560 }
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
        <td class="p-2.5 align-top">
          <div class="font-mono font-semibold text-slate-700">${c.id}</div>
          <div class="text-[11px] text-slate-400 mt-0.5">${c.customerType || 'ร้านค้าปลีก-ส่ง / ตัวแทน'}</div>
          ${orderLinkPill}
        </td>
        <td class="p-2.5 align-top">
          <div class="font-semibold text-slate-800 text-xs">${c.name}</div>
          <div class="text-[11px] text-slate-500 mt-0.5">👤 ${c.contactPerson || 'เจ้าของร้าน'} • 📞 ${c.phone || '-'}</div>
          ${c.taxId ? `<div class="text-[10px] font-mono text-slate-400 mt-0.5">เลขบัตรประชาชน / เลขผู้เสียภาษี: ${c.taxId}</div>` : ''}
          ${c.notes ? `<div class="text-[10px] text-slate-600 bg-slate-100 inline-block px-1.5 py-0.5 rounded mt-1">📌 ${c.notes}</div>` : ''}
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
  document.getElementById('custFormCreditLimit').value = '0';
  document.getElementById('custFormCreditBalance').value = '0';
  document.getElementById('custFormDeposit').value = '0';
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
  document.getElementById('custFormCreditLimit').value = c.creditLimit ?? 0;
  document.getElementById('custFormCreditBalance').value = c.creditBalance ?? 0;
  document.getElementById('custFormDeposit').value = c.bottleDeposit ?? ((c.OutstandingBottles || 0) * 100);
  document.getElementById('custFormBottlesHeld').value = c.OutstandingBottles ?? 0;
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
    creditLimit: Number(document.getElementById('custFormCreditLimit').value),
    creditBalance: Number(document.getElementById('custFormCreditBalance').value),
    bottleDeposit: Number(document.getElementById('custFormDeposit').value),
    OutstandingBottles: Number(document.getElementById('custFormBottlesHeld').value),
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
let currentOrderStatusFilter = 'pending'; // Default: ยังไม่ได้จัดส่ง (มีแค่ 2 สถานะ)

function setOrderFilterStatus(status) {
  currentOrderStatusFilter = (status === 'completed') ? 'completed' : 'pending';

  const btnPending = document.getElementById('btnOrdFilterPending');
  const btnCompleted = document.getElementById('btnOrdFilterCompleted');

  const activeCls = 'px-3 py-1 rounded-md text-xs font-bold transition flex items-center gap-1.5 shadow-xs bg-sky-700 text-white';
  const inactiveCls = 'px-3 py-1 rounded-md text-xs font-semibold text-slate-600 hover:text-slate-900 transition flex items-center gap-1.5 bg-transparent';

  if (btnPending) btnPending.className = currentOrderStatusFilter === 'pending' ? activeCls : inactiveCls;
  if (btnCompleted) btnCompleted.className = currentOrderStatusFilter === 'completed' ? activeCls : inactiveCls;

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

  // Calculate counts for the 2 statuses
  const pendingOrders = orders.filter(o => o.orderStatus !== 'จัดส่งสำเร็จแล้ว');
  const completedOrders = orders.filter(o => o.orderStatus === 'จัดส่งสำเร็จแล้ว');

  const pendingCount = pendingOrders.length;
  const completedCount = completedOrders.length;

  const pendingBottles = pendingOrders.reduce((sum, o) => sum + Number(o.qty189L || 0), 0);
  const pendingPacks = pendingOrders.reduce((sum, o) => sum + Number(o.qty350ml || 0) + Number(o.qty600ml || 0) + Number(o.qty1500ml || 0), 0);

  // Update Tab Badges
  const badgePending = document.getElementById('badgeOrdPendingTab');
  const badgeCompleted = document.getElementById('badgeOrdCompletedTab');
  if (badgePending) badgePending.textContent = pendingCount;
  if (badgeCompleted) badgeCompleted.textContent = completedCount;

  // Filter according to the 2 statuses (Default = 'pending')
  const q = (document.getElementById('ordSearchInput')?.value || '').trim().toLowerCase();
  const dateFilter = document.getElementById('ordDateFilterSelect')?.value || 'ALL';
  const todayStr = new Date().toISOString().slice(0, 10);

  const filtered = orders.filter(o => {
    // 2 Status filter
    if (currentOrderStatusFilter === 'completed') {
      if (o.orderStatus !== 'จัดส่งสำเร็จแล้ว') return false;
    } else {
      if (o.orderStatus === 'จัดส่งสำเร็จแล้ว') return false;
    }

    // Date filter
    if (dateFilter === 'TODAY' && o.deliveryDate !== todayStr) return false;
    if (dateFilter === 'UPCOMING' && o.deliveryDate < todayStr) return false;

    // Search query
    if (q) {
      const cust = appData.customers?.find(c => c.id === o.customerId);
      const phone = o.customerPhone || cust?.phone || '';
      const txt = `${o.orderId} ${o.customerId} ${o.customerName} ${phone} ${o.zone || ''} ${o.deliveryDate || ''}`.toLowerCase();
      if (!txt.includes(q)) return false;
    }

    return true;
  });

  // Update Summary Pill in toolbar
  const sumFiltered = filtered.reduce((sum, o) => sum + Number(o.totalAmount || 0), 0);
  const sumTotalCountEl = document.getElementById('ordSummaryTotalCount');
  const sumTotalAmountEl = document.getElementById('ordSummaryTotalAmount');
  const sumLoadEl = document.getElementById('ordSummaryLoad');

  if (sumTotalCountEl) sumTotalCountEl.textContent = filtered.length;
  if (sumTotalAmountEl) sumTotalAmountEl.textContent = `฿${sumFiltered.toLocaleString()}`;
  if (sumLoadEl) sumLoadEl.textContent = `${pendingBottles.toLocaleString()} ถัง / ${pendingPacks.toLocaleString()} แพ็ค`;

  const tbody = document.getElementById('ordersTableBody');
  if (!tbody) return;

  if (filtered.length === 0) {
    const emptyMsg = currentOrderStatusFilter === 'pending'
      ? '✓ ไม่มีออเดอร์ค้างส่ง (จัดส่งครบเรียบร้อยแล้ว)'
      : 'ยังไม่มีรายการที่จัดส่งสำเร็จ';
    tbody.innerHTML = `<tr><td colspan="10" class="p-6 text-center text-xs text-slate-400 bg-slate-50/50">${emptyMsg}</td></tr>`;
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
          <div class="font-mono text-slate-700 text-xs">${o.deliveryDate || '-'}</div>
          <div class="text-[10px] font-mono text-slate-400">${o.deliveryTime || '09:00'} น.</div>
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


function resetOrderForm() {
  const badge = document.getElementById('ordFormModeBadge');
  const title = document.getElementById('ordFormTitle');
  const btn = document.getElementById('btnSubmitOrderForm');
  const msg = document.getElementById('ordFormFeedbackMsg');

  if (badge) {
    badge.className = 'bg-white/20 text-white border border-white/30 text-xs font-semibold px-2.5 py-0.5 rounded-full';
    badge.textContent = 'สร้างออเดอร์ใหม่';
  }
  if (title) title.textContent = '🛒 บันทึกคำสั่งซื้อน้ำดื่ม (Sales Order)';
  if (btn) btn.textContent = '💾 บันทึกออเดอร์';
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
  const msg = document.getElementById('ordFormFeedbackMsg');

  if (badge) {
    badge.className = 'bg-amber-300 text-slate-950 text-xs font-bold px-2.5 py-0.5 rounded-full shadow-sm';
    badge.textContent = `แก้ไข [${ord.orderId}]`;
  }
  if (title) title.textContent = `🛒 แก้ไขใบสั่งออเดอร์: ${ord.orderId} — ${ord.customerName}`;
  if (btn) btn.textContent = `💾 บันทึกการแก้ไขออเดอร์ (${ord.orderId})`;
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
    deliveryDate: document.getElementById('ordFormDeliveryDate').value,
    deliveryTime: document.getElementById('ordFormDeliveryTime').value,
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
