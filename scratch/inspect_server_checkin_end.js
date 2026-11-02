const fs = require('fs');

const serverJs = fs.readFileSync('d:/13. Antigravity/Sunan/Inthara_program_develop/server.js', 'utf8');
const idx = serverJs.indexOf("app.post('/api/delivery/checkin'");
const endIdx = serverJs.indexOf("app.post('/api/trips'", idx);
console.log('checkin endpoint ends around:', endIdx);
console.log(serverJs.slice(endIdx - 200, endIdx + 200));
