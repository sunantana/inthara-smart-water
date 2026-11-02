const fs = require('fs');

const html = fs.readFileSync('d:/13. Antigravity/Sunan/Inthara_program_develop/public/index.html', 'utf8');
const app = fs.readFileSync('d:/13. Antigravity/Sunan/Inthara_program_develop/public/app.js', 'utf8');
const srv = fs.readFileSync('d:/13. Antigravity/Sunan/Inthara_program_develop/server.js', 'utf8');

console.log('--- AUDITING ORDERS PAGE ---');

// 1. Check all elements in view-orders
const viewOrdersStart = html.indexOf('id="view-orders"');
const viewOrdersEnd = html.indexOf('</section>', viewOrdersStart);
const ordersHtml = html.slice(viewOrdersStart, viewOrdersEnd);

console.log('view-orders HTML length:', ordersHtml.length);

// Extract all id attributes in view-orders
const idMatches = [...ordersHtml.matchAll(/id="([^"]+)"/g)].map(m => m[1]);
console.log('IDs in view-orders:', idMatches);

// Check if any referenced IDs in app.js for orders are missing from index.html
const orderFnNames = [
  'renderOrdersView',
  'resetOrderForm',
  'editOrderRecord',
  'submitSalesOrderForm',
  'deleteOrderRecord',
  'setOrderFilterStatus',
  'populateOrderCustomerDropdown',
  'onOrderCustomerSelectChange',
  'onOrderPhoneLookupInput',
  'recalculateOrderFormTotal'
];

orderFnNames.forEach(fn => {
  const existsInApp = app.includes(`function ${fn}`);
  console.log(`Function ${fn}: ${existsInApp ? 'FOUND' : 'MISSING'}`);
});
