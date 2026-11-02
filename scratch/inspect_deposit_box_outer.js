const fs = require('fs');
const html = fs.readFileSync('d:/13. Antigravity/Sunan/Inthara_program_develop/public/index.html', 'utf8');
const idx = html.indexOf('การมัดจำถัง 18.9 ลิตร');
console.log(html.slice(idx - 600, idx + 100));
