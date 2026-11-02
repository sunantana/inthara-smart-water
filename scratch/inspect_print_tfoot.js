const fs = require('fs');
const js = fs.readFileSync('d:/13. Antigravity/Sunan/Inthara_program_develop/public/app.js', 'utf8');
const idx = js.indexOf('table.data-table');
const nextTfoot = js.indexOf('</tfoot>', idx);
console.log(js.slice(idx, nextTfoot + 300));
