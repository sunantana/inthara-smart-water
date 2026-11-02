const fs = require('fs');

const js = fs.readFileSync('d:/13. Antigravity/Sunan/Inthara_program_develop/public/app.js', 'utf8');
const lines = js.split('\n');
lines.forEach((l, i) => {
  if (l.includes('resetCustomerMasterForm') || l.includes('cancelCustomerEdit')) {
    console.log(`line ${i+1}: ${l.trim()}`);
  }
});
