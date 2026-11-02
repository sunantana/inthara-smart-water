const fs = require('fs');

const appPath = 'd:/13. Antigravity/Sunan/Inthara_program_develop/public/app.js';
let appContent = fs.readFileSync(appPath, 'utf8');

// 1. Update recalcCustomerDepositTotal
const oldRecalc = `function recalcCustomerDepositTotal() {
  const b = Math.max(0, Number(document.getElementById('custFormDepositBottles')?.value || 0));
  const r = Math.max(0, Number(document.getElementById('custFormDepositRate')?.value || 200));
  const total = b * r;
  const totalEl = document.getElementById('custFormDepositAmount');
  if (totalEl) totalEl.value = total;
}`;

const newRecalc = `function recalcCustomerDepositTotal() {
  const bVal = document.getElementById('custFormDepositBottles')?.value;
  const rVal = document.getElementById('custFormDepositRate')?.value;
  const b = Number(bVal || 0);
  const r = Number(rVal !== '' && rVal !== undefined ? rVal : 200);
  const totalEl = document.getElementById('custFormDepositAmount');
  if (totalEl) {
    if (!bVal || b === 0) {
      totalEl.value = '';
    } else {
      totalEl.value = b * r;
    }
  }
}`;

if (appContent.includes(oldRecalc)) {
  appContent = appContent.replace(oldRecalc, newRecalc);
  console.log('✓ Successfully updated recalcCustomerDepositTotal in app.js');
} else {
  console.error('Could not find oldRecalc');
}

// 2. Update editCustomerRecord deposit and zero clearance
const oldEditBlock = `  const depBottles = c.depositBottles ?? (c.bottleDeposit ? Math.round(c.bottleDeposit / (c.depositRate || 200)) : 0);
  const depRate = c.depositRate ?? 200;
  document.getElementById('custFormDepositBottles').value = depBottles;
  document.getElementById('custFormDepositRate').value = depRate;
  document.getElementById('custFormDepositAmount').value = c.bottleDeposit ?? (depBottles * depRate);
  document.getElementById('custFormCreditLimit').value = c.creditLimit ?? 0;
  document.getElementById('custFormCreditBalance').value = c.creditBalance ?? 0;
  document.getElementById('custFormBottlesHeld').value = c.OutstandingBottles ?? 0;`;

const newEditBlock = `  const depBottles = c.depositBottles ?? (c.bottleDeposit ? Math.round(c.bottleDeposit / (c.depositRate || 200)) : 0);
  const depRate = c.depositRate ?? 200;
  const depAmount = c.bottleDeposit ?? (depBottles * depRate);
  document.getElementById('custFormDepositBottles').value = depBottles > 0 ? depBottles : '';
  document.getElementById('custFormDepositRate').value = depRate ? depRate : '200';
  document.getElementById('custFormDepositAmount').value = depAmount > 0 ? depAmount : '';
  document.getElementById('custFormCreditLimit').value = (c.creditLimit && Number(c.creditLimit) > 0) ? c.creditLimit : '';
  document.getElementById('custFormCreditBalance').value = (c.creditBalance && Number(c.creditBalance) > 0) ? c.creditBalance : '';
  document.getElementById('custFormBottlesHeld').value = (c.OutstandingBottles && Number(c.OutstandingBottles) > 0) ? c.OutstandingBottles : '';`;

if (appContent.includes(oldEditBlock)) {
  appContent = appContent.replace(oldEditBlock, newEditBlock);
  console.log('✓ Successfully updated editCustomerRecord zero clearing in app.js');
} else {
  console.error('Could not find oldEditBlock');
}

fs.writeFileSync(appPath, appContent, 'utf8');
console.log('Finished updating app.js');
