const fs = require('fs');

const server = fs.readFileSync('d:/13. Antigravity/Sunan/Inthara_program_develop/server.js', 'utf8');
const idx = server.indexOf('DB_FILE');
console.log(server.slice(idx - 50, idx + 200));
