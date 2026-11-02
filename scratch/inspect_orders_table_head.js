const fs = require('fs');

const html = fs.readFileSync('d:/13. Antigravity/Sunan/Inthara_program_develop/public/index.html', 'utf8');
const idx = html.indexOf('id="ordersTableBody"');
console.log(html.slice(idx - 1500, idx + 200));
