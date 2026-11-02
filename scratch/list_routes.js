const fs = require('fs');
const content = fs.readFileSync('d:/13. Antigravity/Sunan/Inthara_program_develop/server.js', 'utf8');
const matches = content.match(/app\.(get|post|put|delete)\(['"][^'"]+/g);
console.log(matches);
