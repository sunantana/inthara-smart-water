const fs = require('fs');

const html = fs.readFileSync('d:/13. Antigravity/Sunan/Inthara_program_develop/public/index.html', 'utf8');
const lines = html.split('\n');
lines.forEach((l, i) => {
  if (l.includes('resetCustomerMasterForm') || (l.includes('ยกเลิก') && l.includes('Customer'))) {
    console.log(`line ${i+1}: ${l.trim()}`);
  }
});
