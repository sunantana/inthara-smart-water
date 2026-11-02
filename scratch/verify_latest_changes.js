const fs = require('fs');

const html = fs.readFileSync('d:/13. Antigravity/Sunan/Inthara_program_develop/public/index.html', 'utf8');
const js = fs.readFileSync('d:/13. Antigravity/Sunan/Inthara_program_develop/public/app.js', 'utf8');

console.log('Verifying index.html:');
console.log('- Header has "ออเดอร์ที่เคยสั่ง":', html.includes('<th class="p-2.5 text-center whitespace-nowrap">ออเดอร์ที่เคยสั่ง</th>'));
console.log('- Deposit rate input value is 0:', html.includes('id="custFormDepositRate"') && html.includes('placeholder="0" class="w-full border border-slate-200 bg-white rounded-lg px-2 py-1 text-slate-800 text-xs text-center font-bold font-mono focus:border-sky-400" value="0"'));

console.log('\nVerifying app.js:');
console.log('- resetCustomerMasterForm sets custFormDepositRate to 0:', js.includes("document.getElementById('custFormDepositRate').value = '0';"));
console.log('- resetCustomerMasterForm sets custFormDepositBottles to 0:', js.includes("document.getElementById('custFormDepositBottles').value = '0';"));
console.log('- resetCustomerMasterForm sets custFormDepositAmount to 0:', js.includes("document.getElementById('custFormDepositAmount').value = '0';"));
console.log('- Customer Table renders separate column with filterOrdersByCustomer:', js.includes("filterOrdersByCustomer('${c.id}')"));
console.log('- Customer ID column no longer contains orderLinkPill:', !js.includes('${c.customerType || \'ร้านค้าปลีก-ส่ง / ตัวแทน\'}</div>\n          ${orderLinkPill}'));

console.log('\n--- VERIFICATION FINISHED SUCCESSFULLY ---');
