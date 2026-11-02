const fs = require('fs');
const html = fs.readFileSync('d:/13. Antigravity/Sunan/Inthara_program_develop/public/index.html', 'utf8');
console.log({
  slipPaidRow: html.includes('id="slipPaidRow"'),
  slipUnpaidRow: html.includes('id="slipUnpaidRow"'),
  slipPaidAmount: html.includes('id="slipPaidAmount"'),
  slipUnpaidAmount: html.includes('id="slipUnpaidAmount"')
});
