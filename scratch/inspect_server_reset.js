const fs = require('fs');

const server = fs.readFileSync('d:/13. Antigravity/Sunan/Inthara_program_develop/server.js', 'utf8');
const idx = server.indexOf("app.post('/api/reset'");
console.log(server.slice(idx, idx + 800));
