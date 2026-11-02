const fs = require('fs');
const js = fs.readFileSync('d:/13. Antigravity/Sunan/Inthara_program_develop/public/app.js', 'utf8');
const lines = js.split('\n');
lines.forEach((l, i) => {
  if (l.includes("switchTab('orders')")) console.log(i + 1, l.trim());
});
