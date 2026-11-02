const fs = require('fs');

const appPath = 'd:/13. Antigravity/Sunan/Inthara_program_develop/public/app.js';
let appContent = fs.readFileSync(appPath, 'utf8');

console.log('--- REFACTORING UNPAID CALCULATION IN APP.JS ---');

// 1. Add getOrderUnpaidAmount and getTripUnpaidAmount helpers right above renderSavedTripsTable or at top
const helperCode = `
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
`;

if (!appContent.includes('function getOrderUnpaidAmount')) {
  const insertIdx = appContent.indexOf('function renderSavedTripsTable()');
  if (insertIdx !== -1) {
    appContent = appContent.slice(0, insertIdx) + helperCode + '\n' + appContent.slice(insertIdx);
    console.log('✓ Added getOrderUnpaidAmount & getTripUnpaidAmount helpers in app.js');
  }
}

// 2. Update renderSavedTripsTable summary and row rendering to use getTripUnpaidAmount
const oldTripSummaryCalc = `  const totalUnpaid = filteredTrips.reduce((s, t) => {
    const unp = t.unpaidAmount !== undefined ? Number(t.unpaidAmount) : (t.paymentMode === 'credit' ? Number(t.totalRevenue || 0) : Math.max(0, Number(t.totalRevenue || 0) - Number(t.moneyCollected || 0)));
    return s + unp;
  }, 0);`;

const newTripSummaryCalc = `  const totalUnpaid = filteredTrips.reduce((s, t) => s + getTripUnpaidAmount(t), 0);`;

if (appContent.includes(oldTripSummaryCalc)) {
  appContent = appContent.replace(oldTripSummaryCalc, newTripSummaryCalc);
  console.log('✓ Updated totalUnpaid in renderSavedTripsTable');
}

const oldTripRowUnp = `    const tot = Number(t.totalRevenue || 0);
    const col = Number(t.moneyCollected !== undefined ? t.moneyCollected : (t.paymentMode === 'credit' ? 0 : tot));
    const unp = Number(t.unpaidAmount !== undefined ? t.unpaidAmount : (t.paymentMode === 'credit' ? tot : Math.max(0, tot - col)));
    const isCred = (t.paymentMode === 'credit');`;

const newTripRowUnp = `    const tot = Number(t.totalRevenue || 0);
    const unp = getTripUnpaidAmount(t);
    const col = Number(t.moneyCollected !== undefined ? t.moneyCollected : (tot - unp));
    const isCred = (t.paymentMode === 'credit');`;

if (appContent.includes(oldTripRowUnp)) {
  appContent = appContent.replace(oldTripRowUnp, newTripRowUnp);
  console.log('✓ Updated trip row unp in renderSavedTripsTable');
}

// 3. Update setOrderFilterStatus to clear date filter on unpaid tab click
const oldSetFilterStatus = `function setOrderFilterStatus(status) {
  currentOrderStatusFilter = (status === 'completed' || status === 'pending' || status === 'unpaid' || status === 'all') ? status : 'all';

  const btnPending = document.getElementById('btnOrdFilterPending');
  const btnCompleted = document.getElementById('btnOrdFilterCompleted');
  const btnUnpaid = document.getElementById('btnOrdFilterUnpaid');
  const btnAll = document.getElementById('btnOrdFilterAll');`;

const newSetFilterStatus = `function setOrderFilterStatus(status) {
  currentOrderStatusFilter = (status === 'completed' || status === 'pending' || status === 'unpaid' || status === 'all') ? status : 'all';

  // If clicking "unpaid" tab, clear the date filter so staff can see all unpaid bills across any date!
  if (status === 'unpaid') {
    const dateInput = document.getElementById('ordDateFilterInput');
    if (dateInput) dateInput.value = '';
  }

  const btnPending = document.getElementById('btnOrdFilterPending');
  const btnCompleted = document.getElementById('btnOrdFilterCompleted');
  const btnUnpaid = document.getElementById('btnOrdFilterUnpaid');
  const btnAll = document.getElementById('btnOrdFilterAll');`;

if (appContent.includes(oldSetFilterStatus)) {
  appContent = appContent.replace(oldSetFilterStatus, newSetFilterStatus);
  console.log('✓ Updated setOrderFilterStatus to clear date filter for unpaid');
}

// 4. Update renderOrdersView unpaid calculation and filtering
const oldUnpaidFilterBlock = `  const unpaidOrders = orders.filter(o => {
    if (o.orderStatus !== 'จัดส่งสำเร็จแล้ว') return false;
    let unp = o.unpaidAmount;
    if (unp === undefined) {
      const tr = (appData?.savedTrips || []).find(t => (o.orderId && t.orderId === o.orderId) || (o.customerId && t.customerId === o.customerId && t.date === o.deliveryDate));
      if (tr) unp = tr.unpaidAmount;
    }
    const actUnpaid = Number(unp !== undefined ? unp : (o.paymentMode === 'credit' ? Number(o.totalAmount || 0) : Math.max(0, Number(o.totalAmount || 0) - Number(o.moneyCollected || 0))));
    return actUnpaid > 0;
  });`;

const newUnpaidFilterBlock = `  const unpaidOrders = orders.filter(o => getOrderUnpaidAmount(o) > 0);`;

if (appContent.includes(oldUnpaidFilterBlock)) {
  appContent = appContent.replace(oldUnpaidFilterBlock, newUnpaidFilterBlock);
  console.log('✓ Updated unpaidOrders calculation in renderOrdersView');
}

const oldFilterUnpaidCheck = `    } else if (currentOrderStatusFilter === 'unpaid') {
      if (o.orderStatus !== 'จัดส่งสำเร็จแล้ว') return false;
      let unp = o.unpaidAmount;
      if (unp === undefined) {
        const tr = (appData?.savedTrips || []).find(t => (o.orderId && t.orderId === o.orderId) || (o.customerId && t.customerId === o.customerId && t.date === o.deliveryDate));
        if (tr) unp = tr.unpaidAmount;
      }
      const actUnpaid = Number(unp !== undefined ? unp : (o.paymentMode === 'credit' ? Number(o.totalAmount || 0) : Math.max(0, Number(o.totalAmount || 0) - Number(o.moneyCollected || 0))));
      if (actUnpaid <= 0) return false;
    }`;

const newFilterUnpaidCheck = `    } else if (currentOrderStatusFilter === 'unpaid') {
      if (o.orderStatus !== 'จัดส่งสำเร็จแล้ว') return false;
      const actUnpaid = getOrderUnpaidAmount(o);
      if (actUnpaid <= 0) return false;
    }`;

if (appContent.includes(oldFilterUnpaidCheck)) {
  appContent = appContent.replace(oldFilterUnpaidCheck, newFilterUnpaidCheck);
  console.log('✓ Updated currentOrderStatusFilter unpaid check in app.js');
}

// 5. Update Orders Row rendering to use getOrderUnpaidAmount
const oldOrderRowUnp = `          \${(() => {
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
            const isCred = (pm === 'credit');`;

const newOrderRowUnp = `          \${(() => {
            if (!isDone) {
              return '<span class="text-slate-400 text-[11px]">- รอส่ง -</span>';
            }
            const tot = Number(o.totalAmount || 0);
            const actUnp = getOrderUnpaidAmount(o);
            const actCol = Number(o.moneyCollected !== undefined ? o.moneyCollected : (tot - actUnp));
            const isCred = (o.paymentMode === 'credit');`;

if (appContent.includes(oldOrderRowUnp)) {
  appContent = appContent.replace(oldOrderRowUnp, newOrderRowUnp);
  console.log('✓ Updated Orders Table row payment cell in app.js');
}

// 6. Update openBillPaymentModal to use getOrderUnpaidAmount
const oldBillPayModalFilter = `  currentBillPayOrders = custOrders.filter(o => {
    let unp = o.unpaidAmount;
    if (unp === undefined) {
      const tr = (appData?.savedTrips || []).find(t => (o.orderId && t.orderId === o.orderId) || (o.customerId && t.customerId === o.customerId && t.date === o.deliveryDate));
      if (tr) unp = tr.unpaidAmount;
    }
    const actUnp = Number(unp !== undefined ? unp : (o.paymentMode === 'credit' ? Number(o.totalAmount || 0) : Math.max(0, Number(o.totalAmount || 0) - Number(o.moneyCollected || 0))));
    return actUnp > 0;
  });`;

const newBillPayModalFilter = `  currentBillPayOrders = custOrders.filter(o => getOrderUnpaidAmount(o) > 0);`;

if (appContent.includes(oldBillPayModalFilter)) {
  appContent = appContent.replace(oldBillPayModalFilter, newBillPayModalFilter);
  console.log('✓ Updated openBillPaymentModal order filter in app.js');
}

fs.writeFileSync(appPath, appContent, 'utf8');
console.log('--- REFACTORING COMPLETED SUCCESSFULLY ---');
