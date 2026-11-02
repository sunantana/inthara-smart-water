const fs = require('fs');

const js = fs.readFileSync('d:/13. Antigravity/Sunan/Inthara_program_develop/public/app.js', 'utf8');
const idx = js.indexOf('<tr class="hover:bg-slate-50/80 transition">');
console.log(js.slice(idx, idx + 2000));
