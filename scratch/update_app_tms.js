const fs = require('fs');
const path = 'd:/13. Antigravity/Sunan/Inthara_program_develop/public/app.js';

let content = fs.readFileSync(path, 'utf8');

// 1. Update toggleCustomerInRoute & add addAllPendingOrdersToRoute
const oldToggle = `function toggleCustomerInRoute(customerId, include) {
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
}`;

const newToggle = `function toggleCustomerInRoute(customerId, include) {
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
  alert(\`✅ เพิ่ม \${pendingCustIds.size} ร้านที่มีออเดอร์เข้าสายส่ง และจัดลำดับเส้นทางให้อัตโนมัติแล้ว\`);
}`;

if (!content.includes(oldToggle)) {
  console.error('Error: oldToggle not found in app.js');
  process.exit(1);
}
content = content.replace(oldToggle, newToggle);
console.log('1. Updated toggleCustomerInRoute & addAllPendingOrdersToRoute successfully.');

// 2. Update Map Marker Popup
const oldPopup = `    const navUrl = \`https://www.google.com/maps/dir/?api=1&destination=\${stop.lat},\${stop.lng}&travelmode=driving\`;
    L.marker([stop.lat, stop.lng], { icon: stopIcon })
      .bindPopup(\`
        <div class="text-xs space-y-1 font-sans min-w-[200px]">
          <div class="font-bold text-sky-800 text-sm">จุดที่ \${seqNum}: \${stop.name}</div>
          <div class="text-slate-500">\${stop.address} (\${stop.phone})</div>
          <div class="bg-slate-100 p-1.5 rounded text-slate-800 font-medium">
            • ถัง 18.9L: <b>\${stop.orderBottles189L}</b> ถัง<br/>
            • แพ็ค 350ml: <b>\${stop.orderPack350ml || 0}</b> | 600ml: <b>\${stop.orderPack600ml || 0}</b> | 1.5L: <b>\${stop.orderPack1500ml || 0}</b> แพ็ค<br/>
            • ถังค้างสะสมที่ร้าน: <b class="text-amber-700">\${stop.OutstandingBottles} ใบ</b>
          </div>
          <div class="pt-1 flex gap-1.5">
            <a href="\${navUrl}" target="_blank" class="bg-sky-600 text-white px-2.5 py-1 rounded text-center font-semibold flex-1">📍 นำทาง Google Maps</a>
          </div>
        </div>
      \`)
      .addTo(markersLayerGroup);`;

const newPopup = `    const navUrl = \`https://www.google.com/maps/dir/?api=1&destination=\${stop.lat},\${stop.lng}&travelmode=driving\`;
    const pendingOrdersForStop = (appData.orders || []).filter(o => o.customerId === stop.id && o.orderStatus !== 'จัดส่งสำเร็จแล้ว' && o.orderStatus !== 'ยกเลิก');
    const orderBadgesInPopup = pendingOrdersForStop.length > 0
      ? \`<div class="bg-amber-50 border border-amber-200 rounded p-1 text-[11px] text-amber-900 font-bold">📋 ออเดอร์รอส่ง: \${pendingOrdersForStop.map(o => o.orderId).join(', ')}</div>\`
      : (stop.deliveryStatus === 'completed' ? '<div class="bg-emerald-50 border border-emerald-200 rounded p-1 text-[11px] text-emerald-800 font-bold">✓ จัดส่งสำเร็จแล้ว</div>' : '');

    L.marker([stop.lat, stop.lng], { icon: stopIcon })
      .bindPopup(\`
        <div class="text-xs space-y-1.5 font-sans min-w-[220px]">
          <div class="flex items-center justify-between">
            <span class="font-bold text-sky-800 text-sm">จุดที่ \${seqNum}: \${stop.name}</span>
            <span class="bg-slate-100 text-slate-700 text-[10px] px-1 rounded">\${stop.zone || 'ทั่วไป'}</span>
          </div>
          <div class="text-slate-500 text-[11px]">\${stop.address || '-'} (\${stop.phone || 'ไม่มีเบอร์'})</div>
          \${orderBadgesInPopup}
          <div class="bg-slate-50 p-1.5 rounded border border-slate-200 text-slate-800 text-[11px] font-medium space-y-0.5">
            <div>• ถัง 18.9L: <b>\${stop.deliveryStatus === 'completed' ? (stop.deliveredBottles || stop.orderBottles189L) : stop.orderBottles189L}</b> ถัง</div>
            <div>• รวมแพ็ค: <b>\${Number(stop.orderPack350ml || 0) + Number(stop.orderPack600ml || 0) + Number(stop.orderPack1500ml || 0)}</b> แพ็ค</div>
            <div>• ถังค้างสะสม: <b class="text-amber-700">\${stop.OutstandingBottles || 0} ใบ</b></div>
          </div>
          <div class="pt-1 grid grid-cols-2 gap-1.5">
            <a href="\${navUrl}" target="_blank" class="bg-sky-600 hover:bg-sky-700 text-white px-2 py-1 rounded text-center font-bold text-xs">🧭 นำทาง GPS</a>
            <button type="button" onclick="openCheckinModal('\${stop.id}')" class="bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-1 rounded text-center font-bold text-xs">\${stop.deliveryStatus === 'completed' ? '✓ แก้ไขการส่ง' : '✅ ส่งสำเร็จ'}</button>
          </div>
        </div>
      \`)
      .addTo(markersLayerGroup);`;

if (!content.includes(oldPopup)) {
  console.error('Error: oldPopup not found in app.js');
  process.exit(1);
}
content = content.replace(oldPopup, newPopup);
console.log('2. Updated map marker popups successfully.');

// 3. Update Route KPIs, Progress Bar & Step Guide
const oldKpiSection = `  const totalBottles189L = currentOrderedStops.reduce((sum, s) => sum + Number(s.orderBottles189L || 0), 0);
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

  document.getElementById('tmsKpiStops').textContent = \`\${currentOrderedStops.length} จุดส่ง\`;
  document.getElementById('tmsKpiDistance').textContent = \`\${totalDistKm.toFixed(1)} กม.\`;
  document.getElementById('tmsKpiRouteMode').textContent = usedOsrm ? '✓ คำนวณตามเส้นทางถนนจริง (OSRM)' : 'คำนวณระยะทางพิกัด GPS';
  document.getElementById('tmsKpiDuration').textContent = \`\${totalDurationMin} นาที\`;
  document.getElementById('tmsKpiFuel').textContent = \`฿\${fuelCost.toLocaleString()}\`;
  document.getElementById('tmsKpiFuelDetail').textContent = \`ใช้น้ำมัน ~\${litersUsed.toFixed(1)} ลิตร (\${vehicle.plate})\`;
  document.getElementById('tmsKpiLoad').textContent = \`\${totalBottles189L} ถัง / \${totalPacks} แพ็ค\`;

  // Update Capacity Bar & Warning
  const capBar = document.getElementById('tmsCapacityProgressBar');
  const capEl = document.getElementById('tmsKpiCapacityWarn');
  const maxCap = Number(vehicle?.maxBottles189L || 100);
  const capPct = Math.min(100, Math.round((totalBottles189L / maxCap) * 100));

  if (capBar) {
    capBar.style.width = \`\${capPct}%\`;
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
      capEl.textContent = \`⚠️ เกินจุรถ (+\${totalBottles189L - maxCap} ถัง)\`;
      capEl.className = 'text-[10px] text-rose-600 font-bold mt-0.5 truncate';
    } else if (capPct >= 85) {
      capEl.textContent = \`⚡ เกือบเต็ม (\${totalBottles189L}/\${maxCap} ถัง - \${capPct}%)\`;
      capEl.className = 'text-[10px] text-amber-700 font-semibold mt-0.5 truncate';
    } else {
      capEl.textContent = \`✓ ปลอดภัย (\${totalBottles189L}/\${maxCap} ถัง - \${capPct}%)\`;
      capEl.className = 'text-[10px] text-emerald-700 font-medium mt-0.5 truncate';
    }
  }

  document.getElementById('tmsKpiRevenue').textContent = \`฿\${totalRevenue.toLocaleString()}\`;
  document.getElementById('tmsKpiNetProfit').textContent = \`เหลือหลังหักน้ำมัน ฿\${(totalRevenue - fuelCost).toLocaleString()}\`;

  renderOrderedStopsCards(legDistancesKm);`;

const newKpiSection = `  const totalBottles189L = currentOrderedStops.reduce((sum, s) => {
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
  if (kpiStopsEl) kpiStopsEl.textContent = \`\${totalStops} จุดส่ง\${doneStops > 0 ? \` (เสร็จ \${doneStops})\` : ''}\`;
  
  const progBar = document.getElementById('tmsProgressBar');
  if (progBar) progBar.style.width = \`\${stopProgressPct}%\`;
  
  const progText = document.getElementById('tmsProgressText');
  if (progText) progText.textContent = totalStops > 0 ? \`ส่งแล้ว \${doneStops}/\${totalStops} จุด (\${stopProgressPct}%)\` : 'ส่งแล้ว 0/0 จุด';

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

  document.getElementById('tmsKpiDistance').textContent = \`\${totalDistKm.toFixed(1)} กม.\`;
  document.getElementById('tmsKpiRouteMode').textContent = usedOsrm ? '✓ คำนวณตามเส้นทางถนนจริง (OSRM)' : 'คำนวณระยะทางพิกัด GPS';
  document.getElementById('tmsKpiDuration').textContent = \`\${totalDurationMin} นาที\`;
  document.getElementById('tmsKpiFuel').textContent = \`฿\${fuelCost.toLocaleString()}\`;
  document.getElementById('tmsKpiFuelDetail').textContent = \`ใช้น้ำมัน ~\${litersUsed.toFixed(1)} ลิตร (\${vehicle.plate})\`;
  document.getElementById('tmsKpiLoad').textContent = \`\${totalBottles189L} ถัง / \${totalPacks} แพ็ค\`;

  // Update Capacity Bar & Warning
  const capBar = document.getElementById('tmsCapacityProgressBar');
  const capEl = document.getElementById('tmsKpiCapacityWarn');
  const maxCap = Number(vehicle?.maxBottles189L || 100);
  const capPct = Math.min(100, Math.round((totalBottles189L / maxCap) * 100));

  if (capBar) {
    capBar.style.width = \`\${capPct}%\`;
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
      capEl.textContent = \`⚠️ เกินจุรถ (+\${totalBottles189L - maxCap} ถัง)\`;
      capEl.className = 'text-[10px] text-rose-600 font-bold mt-0.5 truncate';
    } else if (capPct >= 85) {
      capEl.textContent = \`⚡ เกือบเต็ม (\${totalBottles189L}/\${maxCap} ถัง - \${capPct}%)\`;
      capEl.className = 'text-[10px] text-amber-700 font-semibold mt-0.5 truncate';
    } else {
      capEl.textContent = \`✓ ปลอดภัย (\${totalBottles189L}/\${maxCap} ถัง - \${capPct}%)\`;
      capEl.className = 'text-[10px] text-emerald-700 font-medium mt-0.5 truncate';
    }
  }

  document.getElementById('tmsKpiRevenue').textContent = \`฿\${totalRevenue.toLocaleString()}\`;
  document.getElementById('tmsKpiNetProfit').textContent = \`เหลือหลังหักน้ำมัน ฿\${(totalRevenue - fuelCost).toLocaleString()}\`;

  renderOrderedStopsCards(legDistancesKm);`;

if (!content.includes(oldKpiSection)) {
  console.error('Error: oldKpiSection not found in app.js');
  process.exit(1);
}
content = content.replace(oldKpiSection, newKpiSection);
console.log('3. Updated Route KPIs & Progress Bar successfully.');

// 4. Update renderOrderedStopsCards and renderUnselectedStopsChips
const oldCardsSection = `function renderOrderedStopsCards(legDistancesKm) {
  const listEl = document.getElementById('orderedStopsList');
  const badgeCount = document.getElementById('badgeTmsInRouteCount');
  if (badgeCount) badgeCount.textContent = currentOrderedStops.length;

  let cumulativeKm = 0;

  if (currentOrderedStops.length === 0) {
    listEl.innerHTML = \`
      <div class="p-8 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200 space-y-2">
        <div class="text-2xl">🚚</div>
        <div class="font-medium text-slate-600">ยังไม่มีจุดส่งในสายส่งนี้</div>
        <p class="text-[11px] text-slate-400">กดแท็บ "รอจัดสาย/ทั้งหมด" เพื่อเลือกจุดส่ง หรือกดปุ่ม "+ เลือกทั้งหมด"</p>
        <button type="button" onclick="setTmsQueueTab('standby')" class="mt-2 text-xs bg-sky-600 hover:bg-sky-700 text-white font-semibold px-3 py-1.5 rounded-lg transition inline-flex items-center gap-1">
          <span>📋</span> เลือกจุดส่งเข้าสาย
        </button>
      </div>\`;
  } else {
    listEl.innerHTML = currentOrderedStops.map((stop, idx) => {
      const legKm = legDistancesKm[idx] || 0;
      cumulativeKm += legKm;
      const isDone = stop.deliveryStatus === 'completed';
      const singleNavUrl = \`https://www.google.com/maps/dir/?api=1&destination=\${stop.lat},\${stop.lng}&travelmode=driving\`;
      const q189 = Number(stop.orderBottles189L || 0);
      const q350 = Number(stop.orderPack350ml || 0);
      const q600 = Number(stop.orderPack600ml || 0);
      const q1500 = Number(stop.orderPack1500ml || 0);

      return \`
        <div class="p-2.5 rounded-xl border \${isDone ? 'bg-emerald-50/70 border-emerald-300' : 'bg-slate-50/90 hover:bg-white border-slate-200 shadow-xs'} transition flex flex-col gap-1.5">
          <!-- Card Header -->
          <div class="flex items-start justify-between gap-2">
            <div class="flex items-start gap-2 min-w-0">
              <span class="w-6 h-6 rounded-lg \${isDone ? 'bg-emerald-600' : 'bg-sky-600'} text-white font-extrabold text-xs flex items-center justify-center shrink-0 shadow-xs">
                \${idx + 1}
              </span>
              <div class="min-w-0">
                <div class="font-bold text-slate-800 text-xs flex items-center gap-1.5 flex-wrap">
                  <span class="truncate">\${stop.name}</span>
                  <span class="bg-slate-200/80 text-slate-700 text-[10px] px-1.5 py-0.2 rounded font-medium">\${stop.zone || 'ทั่วไป'}</span>
                  \${isDone ? '<span class="bg-emerald-600 text-white text-[10px] px-1.5 py-0.2 rounded-full font-bold">✓ ส่งแล้ว</span>' : ''}
                </div>
                <div class="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5 flex-wrap">
                  \${stop.phone ? \`<a href="tel:\${stop.phone}" class="text-sky-700 hover:underline font-mono inline-flex items-center gap-0.5">📞 \${stop.phone}</a>\` : '<span class="text-slate-400">ไม่มีเบอร์โทร</span>'}
                  <span class="text-slate-300">•</span>
                  <span class="text-slate-600 truncate max-w-[200px]">\${stop.address || '-'}</span>
                </div>
              </div>
            </div>

            <!-- Up / Down / Remove Controls -->
            <div class="flex items-center gap-0.5 shrink-0">
              <button type="button" onclick="moveStopOrder(\${idx}, -1)" title="เลื่อนลำดับขึ้น" class="w-6 h-6 flex items-center justify-center text-xs bg-white border border-slate-200 rounded hover:bg-slate-100 text-slate-600 font-bold">↑</button>
              <button type="button" onclick="moveStopOrder(\${idx}, 1)" title="เลื่อนลำดับลง" class="w-6 h-6 flex items-center justify-center text-xs bg-white border border-slate-200 rounded hover:bg-slate-100 text-slate-600 font-bold">↓</button>
              <button type="button" onclick="toggleCustomerInRoute('\${stop.id}', false)" title="นำออกจากสายส่งนี้" class="w-6 h-6 flex items-center justify-center text-xs bg-white border border-rose-200 rounded hover:bg-rose-50 text-rose-600 font-bold">✕</button>
            </div>
          </div>

          <!-- Product Badges & Stats Row -->
          <div class="flex flex-wrap items-center justify-between gap-1 bg-white p-1.5 rounded-lg border border-slate-200/80 text-[11px]">
            <div class="flex flex-wrap items-center gap-1 font-semibold">
              <span class="bg-sky-100 text-sky-800 px-1.5 py-0.5 rounded text-[10px]">18.9L: <b>\${q189}</b> ถัง</span>
              \${q350 > 0 ? \`<span class="bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded text-[10px]">350ml: <b>\${q350}</b></span>\` : ''}
              \${q600 > 0 ? \`<span class="bg-blue-100 text-blue-900 px-1.5 py-0.5 rounded text-[10px]">600ml: <b>\${q600}</b></span>\` : ''}
              \${q1500 > 0 ? \`<span class="bg-indigo-100 text-indigo-900 px-1.5 py-0.5 rounded text-[10px]">1.5L: <b>\${q1500}</b></span>\` : ''}
            </div>
            <div class="flex items-center gap-2 text-[10px] text-slate-500 font-medium">
              <span>ถังค้าง: <b class="text-amber-700">\${stop.OutstandingBottles || 0}</b></span>
              <span class="text-sky-700 font-bold">+\${legKm.toFixed(1)} กม.</span>
            </div>
          </div>

          <!-- Action Buttons Row -->
          <div class="grid grid-cols-2 gap-1.5 pt-0.5">
            <a href="\${singleNavUrl}" target="_blank" class="bg-white hover:bg-sky-50 text-sky-700 border border-sky-300 font-bold text-[11px] py-1 px-2 rounded-lg text-center transition flex items-center justify-center gap-1">
              <span>🧭</span> นำทาง GPS
            </a>
            <button type="button" onclick="openCheckinModal('\${stop.id}')" class="\${isDone ? 'bg-emerald-600 text-white' : 'bg-emerald-500 hover:bg-emerald-600 text-slate-950'} font-bold text-[11px] py-1 px-2 rounded-lg transition flex items-center justify-center gap-1 shadow-xs">
              <span>📦</span> \${isDone ? \`✓ ส่ง \${stop.deliveredBottles || q189} / คืน \${stop.returnedBottles || 0}\` : 'บันทึกส่งสำเร็จ'}
            </button>
          </div>
        </div>
      \`;
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
    unselEl.innerHTML = \`<div class="p-6 text-center text-xs text-slate-400 bg-slate-50 rounded-xl">✓ ลูกค้าทั้งหมดถูกจัดเข้าสายส่งแล้ว</div>\`;
    return;
  }

  unselEl.innerHTML = unselected.map(c => {
    const q189 = Number(c.orderBottles189L || 0);
    const q350 = Number(c.orderPack350ml || 0);
    const q600 = Number(c.orderPack600ml || 0);
    const q1500 = Number(c.orderPack1500ml || 0);
    const totalP = q350 + q600 + q1500;
    return \`
      <div class="p-2 rounded-xl bg-slate-50 hover:bg-white border border-slate-200 transition flex items-center justify-between gap-2 text-xs">
        <div class="min-w-0">
          <div class="font-bold text-slate-800 flex items-center gap-1.5">
            <span class="truncate">\${c.name}</span>
            <span class="bg-slate-200 text-slate-700 text-[10px] px-1.5 py-0.2 rounded font-medium">\${c.zone || 'ทั่วไป'}</span>
          </div>
          <div class="text-[10px] text-slate-500 mt-0.5">
            สั่ง: <b class="text-sky-700">\${q189}</b> ถัง • <b class="text-slate-700">\${totalP}</b> แพ็ค • ถังค้าง: <b class="text-amber-700">\${c.OutstandingBottles || 0}</b>
          </div>
        </div>
        <button type="button" onclick="toggleCustomerInRoute('\${c.id}', true)" class="bg-sky-600 hover:bg-sky-700 text-white font-bold text-[11px] px-2.5 py-1 rounded-lg transition shrink-0 flex items-center gap-0.5">
          <span>+</span> เข้าสาย
        </button>
      </div>
    \`;
  }).join('');
}`;

const newCardsSection = `function renderOrderedStopsCards(legDistancesKm) {
  const listEl = document.getElementById('orderedStopsList');
  const badgeCount = document.getElementById('badgeTmsInRouteCount');
  if (badgeCount) badgeCount.textContent = currentOrderedStops.length;

  let cumulativeKm = 0;

  if (currentOrderedStops.length === 0) {
    listEl.innerHTML = \`
      <div class="p-8 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200 space-y-2">
        <div class="text-3xl">🚚</div>
        <div class="font-bold text-slate-700 text-sm">ยังไม่มีจุดส่งในสายส่งนี้</div>
        <p class="text-[11px] text-slate-500 max-w-xs mx-auto">กดแท็บ "📋 ออเดอร์รอจัดสาย" ด้านบน เพื่อเลือกจุดส่งที่มีออเดอร์เข้าสาย หรือกดปุ่มด้านล่าง</p>
        <button type="button" onclick="setTmsQueueTab('standby')" class="mt-2 text-xs bg-sky-600 hover:bg-sky-700 text-white font-bold px-3.5 py-2 rounded-xl transition inline-flex items-center gap-1.5 shadow-sm">
          <span>📋</span> ไปเลือกออเดอร์รอจัดสาย
        </button>
      </div>\`;
  } else {
    listEl.innerHTML = currentOrderedStops.map((stop, idx) => {
      const legKm = legDistancesKm[idx] || 0;
      cumulativeKm += legKm;
      const isDone = stop.deliveryStatus === 'completed';
      const singleNavUrl = \`https://www.google.com/maps/dir/?api=1&destination=\${stop.lat},\${stop.lng}&travelmode=driving\`;
      const q189 = Number(stop.orderBottles189L || 0);
      const q350 = Number(stop.orderPack350ml || 0);
      const q600 = Number(stop.orderPack600ml || 0);
      const q1500 = Number(stop.orderPack1500ml || 0);

      // Find linked orders for this customer from Sales Order system
      const custOrders = (appData?.orders || []).filter(o => o.customerId === stop.id);
      const pendingOrders = custOrders.filter(o => o.orderStatus !== 'จัดส่งสำเร็จแล้ว' && o.orderStatus !== 'ยกเลิก');

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
          <span class="text-[10px] text-slate-400 italic">ไม่มีเลขออเดอร์ค้าง</span>
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
                  \${isDone ? '<span class="bg-emerald-600 text-white text-[10px] px-2 py-0.5 rounded-full font-bold shadow-xs">✓ ส่งแล้ว</span>' : ''}
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
              <button type="button" onclick="moveStopOrder(\${idx}, -1)" title="เลื่อนลำดับขึ้น" class="w-6 h-6 flex items-center justify-center text-xs bg-white border border-slate-200 rounded hover:bg-slate-100 text-slate-600 font-bold transition">↑</button>
              <button type="button" onclick="moveStopOrder(\${idx}, 1)" title="เลื่อนลำดับลง" class="w-6 h-6 flex items-center justify-center text-xs bg-white border border-slate-200 rounded hover:bg-slate-100 text-slate-600 font-bold transition">↓</button>
              <button type="button" onclick="toggleCustomerInRoute('\${stop.id}', false)" title="นำออกจากสายส่งนี้" class="w-6 h-6 flex items-center justify-center text-xs bg-white border border-rose-200 rounded hover:bg-rose-50 text-rose-600 font-bold transition">✕</button>
            </div>
          </div>

          <!-- Product Badges & Stats Row -->
          <div class="flex flex-wrap items-center justify-between gap-1.5 bg-slate-50/80 p-2 rounded-lg border border-slate-200/80 text-[11px]">
            <div class="flex flex-wrap items-center gap-1.5 font-semibold">
              <span class="bg-sky-100 text-sky-800 px-2 py-0.5 rounded text-[11px]">18.9L: <b>\${q189}</b> ถัง</span>
              \${q350 > 0 ? \`<span class="bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded text-[10px]">350ml: <b>\${q350}</b></span>\` : ''}
              \${q600 > 0 ? \`<span class="bg-blue-100 text-blue-900 px-1.5 py-0.5 rounded text-[10px]">600ml: <b>\${q600}</b></span>\` : ''}
              \${q1500 > 0 ? \`<span class="bg-indigo-100 text-indigo-900 px-1.5 py-0.5 rounded text-[10px]">1.5L: <b>\${q1500}</b></span>\` : ''}
            </div>
            <div class="flex items-center gap-2 text-[10px] text-slate-500 font-medium">
              <span>ถังค้างเดิม: <b class="text-amber-700">\${stop.OutstandingBottles || 0}</b></span>
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

  // Render Standby / Available Stops
  renderUnselectedStopsChips();
}

function renderUnselectedStopsChips() {
  const unselEl = document.getElementById('unselectedStopsList');
  const badgeCount = document.getElementById('badgeTmsStandbyCount');
  if (!appData || !Array.isArray(appData.customers)) return;

  const unselected = appData.customers.filter(c => !currentOrderedStops.some(s => s.id === c.id));
  
  // Separate into: (1) Customers with pending orders or order quantities, (2) Other registered customers
  const withOrders = [];
  const withoutOrders = [];

  unselected.forEach(c => {
    const pendingOrders = (appData.orders || []).filter(o => o.customerId === c.id && o.orderStatus !== 'จัดส่งสำเร็จแล้ว' && o.orderStatus !== 'ยกเลิก');
    const hasQty = (Number(c.orderBottles189L || 0) > 0 || Number(c.orderPack350ml || 0) > 0 || Number(c.orderPack600ml || 0) > 0 || Number(c.orderPack1500ml || 0) > 0) && c.deliveryStatus !== 'completed';
    if (pendingOrders.length > 0 || hasQty) {
      withOrders.push({ cust: c, orders: pendingOrders });
    } else {
      withoutOrders.push(c);
    }
  });

  if (badgeCount) badgeCount.textContent = withOrders.length;
  if (!unselEl) return;

  if (unselected.length === 0) {
    unselEl.innerHTML = \`<div class="p-6 text-center text-xs text-slate-400 bg-slate-50 rounded-xl">✓ ลูกค้าทั้งหมดถูกจัดเข้าสายส่งแล้ว</div>\`;
    return;
  }

  let html = '';

  if (withOrders.length > 0) {
    html += \`
      <div class="text-[11px] font-bold text-slate-700 pb-1 mb-1 border-b border-slate-200 flex items-center justify-between">
        <span>📋 ร้านที่มีออเดอร์รอส่ง (\${withOrders.length} ร้าน)</span>
        <span class="text-[10px] text-amber-700 font-semibold">แนะนำให้ใส่เข้าสาย</span>
      </div>
      <div class="space-y-2 mb-3">
    \`;

    html += withOrders.map(({ cust: c, orders }) => {
      let q189 = orders.reduce((s, o) => s + Number(o.qty189L || 0), 0) || Number(c.orderBottles189L || 0);
      let q350 = orders.reduce((s, o) => s + Number(o.qty350ml || 0), 0) || Number(c.orderPack350ml || 0);
      let q600 = orders.reduce((s, o) => s + Number(o.qty600ml || 0), 0) || Number(c.orderPack600ml || 0);
      let q1500 = orders.reduce((s, o) => s + Number(o.qty1500ml || 0), 0) || Number(c.orderPack1500ml || 0);
      let totalAmount = orders.reduce((s, o) => s + Number(o.totalAmount || 0), 0);

      const orderBadges = orders.map(o => \`
        <span class="font-mono bg-sky-100 text-sky-900 border border-sky-300 px-1.5 py-0.2 rounded text-[10px] font-bold">
          \${o.orderId}
        </span>
      \`).join(' ');

      return \`
        <div class="p-2.5 rounded-xl bg-white hover:bg-sky-50/50 border-2 border-sky-200 shadow-xs transition flex flex-col gap-1.5">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <div class="font-bold text-slate-800 text-xs flex items-center gap-1.5 flex-wrap">
                <span class="truncate">\${c.name}</span>
                <span class="bg-slate-100 text-slate-700 text-[10px] px-1.5 py-0.2 rounded font-medium border border-slate-200">\${c.zone || 'ทั่วไป'}</span>
              </div>
              <div class="flex items-center gap-1 mt-1 flex-wrap">
                \${orderBadges || '<span class="text-[10px] text-amber-700 font-semibold">มีรายการสั่งส่ง</span>'}
              </div>
              <div class="text-[11px] text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
                \${c.phone ? \`<span class="font-mono">📞 \${c.phone}</span>\` : ''}
                <span class="text-slate-600 truncate max-w-[200px]">\${c.address || '-'}</span>
              </div>
            </div>
            <button type="button" onclick="toggleCustomerInRoute('\${c.id}', true)" class="bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs px-3 py-1.5 rounded-lg transition shrink-0 flex items-center gap-1 shadow-xs">
              <span>+</span> ใส่เข้าสาย
            </button>
          </div>
          <div class="flex items-center justify-between text-[11px] bg-slate-50 p-1.5 rounded-lg border border-slate-100">
            <div class="flex items-center gap-1.5 font-semibold">
              <span class="text-sky-800">18.9L: <b>\${q189}</b> ถัง</span>
              \${(q350 + q600 + q1500) > 0 ? \`<span class="text-amber-800">• แพ็ค: <b>\${q350 + q600 + q1500}</b></span>\` : ''}
              \${totalAmount > 0 ? \`<span class="text-slate-600 font-bold">• ฿\${totalAmount.toLocaleString()}</span>\` : ''}
            </div>
            <div class="text-[10px] text-slate-500">
              ถังค้าง: <b class="text-amber-700">\${c.OutstandingBottles || 0}</b>
            </div>
          </div>
        </div>
      \`;
    }).join('');

    html += \`</div>\`;
  } else {
    html += \`
      <div class="p-4 text-center text-xs text-slate-400 bg-slate-50 rounded-xl mb-3">
        ℹ️ ไม่มีออเดอร์ใหม่รอจัดสาย (ออเดอร์ทั้งหมดถูกจัดส่งแล้วหรือยังไม่มีการสั่ง)
      </div>
    \`;
  }

  if (withoutOrders.length > 0) {
    html += \`
      <details class="text-xs group">
        <summary class="font-semibold text-slate-600 cursor-pointer p-1.5 hover:bg-slate-100 rounded-lg flex items-center justify-between">
          <span>👥 เลือกลูกค้าอื่นๆ ในระบบ (\${withoutOrders.length} ร้าน)</span>
          <span class="text-[10px] text-slate-400 group-open:rotate-180 transition">▼</span>
        </summary>
        <div class="space-y-1.5 pt-2 max-h-56 overflow-y-auto">
          \${withoutOrders.map(c => \`
            <div class="p-2 rounded-lg bg-slate-50 hover:bg-white border border-slate-200 transition flex items-center justify-between gap-2 text-xs">
              <div class="min-w-0">
                <div class="font-medium text-slate-800 truncate">\${c.name} <span class="text-[10px] text-slate-500">(\${c.zone || 'ทั่วไป'})</span></div>
                <div class="text-[10px] text-slate-400">ถังค้าง: \${c.OutstandingBottles || 0} ถัง</div>
              </div>
              <button type="button" onclick="toggleCustomerInRoute('\${c.id}', true)" class="bg-white hover:bg-sky-50 text-sky-700 border border-sky-300 font-semibold text-[11px] px-2 py-0.5 rounded transition shrink-0">
                + เข้าสาย
              </button>
            </div>
          \`).join('')}
        </div>
      </details>
    \`;
  }

  unselEl.innerHTML = html;
}`;

if (!content.includes(oldCardsSection)) {
  console.error('Error: oldCardsSection not found in app.js');
  process.exit(1);
}
content = content.replace(oldCardsSection, newCardsSection);
console.log('4. Updated renderOrderedStopsCards & renderUnselectedStopsChips successfully.');

// 5. Update saveCurrentTripRecord
const oldSaveTrip = `async function saveCurrentTripRecord() {
  if (currentOrderedStops.length === 0) return;
  const vehId = document.getElementById('vehicleSelect').value;
  const vehicle = appData.vehicles.find(v => v.id === vehId) || appData.vehicles[0];
  const tripPayload = {
    tripId: 'TRIP-' + new Date().toISOString().slice(2, 10).replace(/-/g, '') + '-' + String(appData.savedTrips.length + 1).padStart(2, '0'),
    date: new Date().toISOString().slice(0, 10),
    vehicleId: vehicle.id,
    vehicleName: \`\${vehicle.plate} (\${vehicle.driver})\`,
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
}`;

const newSaveTrip = `async function saveCurrentTripRecord() {
  if (currentOrderedStops.length === 0) {
    alert('⚠️ ไม่มีจุดส่งในสายส่ง');
    return;
  }
  const vehId = document.getElementById('vehicleSelect').value;
  const vehicle = appData.vehicles.find(v => v.id === vehId) || appData.vehicles[0];

  const uncompletedStops = currentOrderedStops.filter(s => s.deliveryStatus !== 'completed');
  if (uncompletedStops.length > 0) {
    const conf = confirm(\`⚠️ ยังมีอีก \${uncompletedStops.length} จุดส่งที่ยังไม่ได้กดยืนยันส่งสำเร็จทีละร้าน\\nต้องการปิดสายส่งเลยหรือไม่?\\n(ระบบจะบันทึกใบคุมสายส่ง, ตัดค่าน้ำมัน ฿\${currentRouteStats.fuelCost.toLocaleString()} และอัปเดตออเดอร์ทั้งหมดในสายนี้เป็น "จัดส่งสำเร็จแล้ว")\`);
    if (!conf) return;
  } else {
    const conf = confirm(\`🏁 ยืนยันปิดสายส่งวันนี้?\\n(ระบบจะบันทึกใบคุมสายส่ง ตัดค่าน้ำมัน ฿\${currentRouteStats.fuelCost.toLocaleString()} เข้าบัญชีค่าใช้จ่าย และล้างสายส่งวันนี้)\`);
    if (!conf) return;
  }

  const tripPayload = {
    tripId: 'TRIP-' + new Date().toISOString().slice(2, 10).replace(/-/g, '') + '-' + String((appData.savedTrips?.length || 0) + 1).padStart(2, '0'),
    date: new Date().toISOString().slice(0, 10),
    vehicleId: vehicle.id,
    vehicleName: \`\${vehicle.plate} (\${vehicle.driver})\`,
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
    alert(\`🏁 ปิดสายส่งเรียบร้อยแล้ว!\\n• บันทึกใบคุมสายส่ง: \${tripPayload.tripId}\\n• อัปเดตออเดอร์ทั้งหมดเป็น "จัดส่งสำเร็จแล้ว"\\n• บันทึกตัดค่าน้ำมัน ฿\${tripPayload.estimatedFuelCost.toLocaleString()}\`);
  }
}`;

if (!content.includes(oldSaveTrip)) {
  console.error('Error: oldSaveTrip not found in app.js');
  process.exit(1);
}
content = content.replace(oldSaveTrip, newSaveTrip);
console.log('5. Updated saveCurrentTripRecord successfully.');

// 6. Update openCheckinModal, closeCheckinModal, submitDriverCheckin & updateCheckinBottleBalance
const oldCheckin = `function openCheckinModal(customerId) {
  const cust = appData.customers.find(c => c.id === customerId);
  if (!cust) return;
  document.getElementById('checkinCustId').value = cust.id;
  document.getElementById('checkinCustTitle').textContent = \`\${cust.name} (ถังค้างเดิม \${cust.OutstandingBottles} ถัง)\`;
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
}`;

const newCheckin = `function openCheckinModal(customerId) {
  const cust = appData?.customers?.find(c => c.id === customerId);
  if (!cust) return;

  const pendingOrders = (appData?.orders || []).filter(o => o.customerId === customerId && o.orderStatus !== 'จัดส่งสำเร็จแล้ว' && o.orderStatus !== 'ยกเลิก');
  
  document.getElementById('checkinCustId').value = cust.id;
  document.getElementById('checkinOrderIds').value = pendingOrders.map(o => o.orderId).join(',');

  const titleEl = document.getElementById('checkinCustTitle');
  if (titleEl) {
    titleEl.textContent = \`\${cust.name} (โทร: \${cust.phone || '-'})\`;
  }
  
  const subEl = document.getElementById('checkinCustSub');
  if (subEl) {
    subEl.textContent = \`โซน: \${cust.zone || 'ทั่วไป'} | ที่อยู่: \${cust.address || '-'}\`;
  }

  // Populate Order Box
  const ordersBox = document.getElementById('checkinOrdersBox');
  if (ordersBox) {
    if (pendingOrders.length > 0) {
      ordersBox.innerHTML = \`
        <div class="flex items-center justify-between pb-1 border-b border-slate-200 text-[11px]">
          <span class="font-bold text-sky-900 flex items-center gap-1">📋 ออเดอร์ที่เชื่อมโยง (\${pendingOrders.length} ใบ):</span>
          <span class="text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">จะปิดงานอัตโนมัติ</span>
        </div>
        <div class="space-y-1.5 max-h-36 overflow-y-auto pt-1">
          \${pendingOrders.map(o => \`
            <div class="bg-white border border-slate-200 rounded-lg p-2 text-[11px] space-y-0.5">
              <div class="flex items-center justify-between">
                <span class="font-mono font-bold text-sky-800">\${o.orderId}</span>
                <span class="font-bold text-slate-800">฿\${Number(o.totalAmount || 0).toLocaleString()}</span>
              </div>
              <div class="text-slate-600 flex items-center gap-2 flex-wrap text-[10px]">
                <span>📅 ส่ง: \${o.deliveryDate || '-'}</span>
                <span>•</span>
                <span class="bg-sky-50 text-sky-800 px-1 rounded font-semibold">18.9L: \${o.qty189L || 0} ถัง</span>
                \${(o.qty350ml || 0) + (o.qty600ml || 0) + (o.qty1500ml || 0) > 0 ? \`<span class="bg-amber-50 text-amber-800 px-1 rounded font-semibold">แพ็ค: \${(o.qty350ml || 0) + (o.qty600ml || 0) + (o.qty1500ml || 0)}</span>\` : ''}
              </div>
            </div>
          \`).join('')}
        </div>
      \`;
    } else {
      ordersBox.innerHTML = \`
        <div class="text-slate-500 text-[11px] p-1 flex items-center gap-1.5">
          <span>ℹ️</span> <span>ไม่มีใบสั่งออเดอร์ค้างในระบบ (บันทึกจัดส่งเฉพาะจุดส่งนี้)</span>
        </div>
      \`;
    }
  }

  // Pre-fill quantities: use total from pending orders if available, else cust.orderBottles189L
  const totalOrd189 = pendingOrders.reduce((sum, o) => sum + Number(o.qty189L || 0), 0);
  const defaultDelivered = (totalOrd189 > 0) ? totalOrd189 : Number(cust.orderBottles189L || 0);

  const delInput = document.getElementById('checkinDelivered');
  const retInput = document.getElementById('checkinReturned');

  if (delInput) delInput.value = (cust.deliveryStatus === 'completed' && cust.deliveredBottles !== undefined) ? cust.deliveredBottles : defaultDelivered;
  if (retInput) retInput.value = (cust.deliveryStatus === 'completed' && cust.returnedBottles !== undefined) ? cust.returnedBottles : defaultDelivered;

  updateCheckinBottleBalance();

  const modal = document.getElementById('modalCheckin');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
}

function updateCheckinBottleBalance() {
  const custId = document.getElementById('checkinCustId')?.value;
  const cust = appData?.customers?.find(c => c.id === custId);
  const prevBottles = Number(cust?.OutstandingBottles || 0);
  const delivered = Number(document.getElementById('checkinDelivered')?.value || 0);
  const returned = Number(document.getElementById('checkinReturned')?.value || 0);
  const newBalance = Math.max(0, prevBottles + delivered - returned);

  const balEl = document.getElementById('checkinBottleBalance');
  if (balEl) {
    balEl.innerHTML = \`
      <div class="flex items-center justify-between font-semibold">
        <span>🧮 คำนวณถังค้างสะสม:</span>
        <span class="\${newBalance > prevBottles ? 'text-amber-700 font-bold' : 'text-emerald-700 font-bold'}">\${newBalance} ถัง</span>
      </div>
      <div class="text-[10px] text-slate-500 mt-0.5">
        เดิมค้าง \${prevBottles} + ส่งใหม่ \${delivered} - รับคืน \${returned} = คงเหลือค้างที่ร้าน \${newBalance} ถัง
      </div>
    \`;
  }
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
  const deliveredBottles = Number(document.getElementById('checkinDelivered').value || 0);
  const returnedBottles = Number(document.getElementById('checkinReturned').value || 0);
  const orderIdsStr = document.getElementById('checkinOrderIds')?.value || '';

  const submitBtn = document.getElementById('btnCheckinSubmit');
  const origBtnText = submitBtn ? submitBtn.innerHTML : '✅ ยืนยันส่งสำเร็จ';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>⏳ กำลังบันทึก...</span>';
  }

  try {
    const payload = {
      customerId: custId,
      deliveredBottles,
      returnedBottles,
      orderIds: orderIdsStr ? orderIdsStr.split(',').filter(Boolean) : []
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
        activeStop.deliveredBottles = deliveredBottles;
        activeStop.returnedBottles = returnedBottles;
      }

      recalculateCurrentRoute();
      renderAllViews();

      const linkedCount = payload.orderIds.length;
      const orderNotice = linkedCount > 0 ? \` พร้อมปิดงานออเดอร์ \${linkedCount} ใบเรียบร้อยแล้ว\` : '';
      alert(\`✅ บันทึกส่งสำเร็จร้าน [\${custName}]\${orderNotice}\`);
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
}`;

if (!content.includes(oldCheckin)) {
  console.error('Error: oldCheckin not found in app.js');
  process.exit(1);
}
content = content.replace(oldCheckin, newCheckin);
console.log('6. Updated checkin modal methods successfully.');

// Backup and write
fs.writeFileSync('d:/13. Antigravity/Sunan/Inthara_program_develop/scratch/app.backup.js', fs.readFileSync(path));
fs.writeFileSync(path, content, 'utf8');
console.log('All changes written to app.js successfully!');
