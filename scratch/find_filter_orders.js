const fs = require('fs');

const js = fs.readFileSync('d:/13. Antigravity/Sunan/Inthara_program_develop/public/app.js', 'utf8');
const idx = js.indexOf('function filterOrdersByCustomer');
console.log(idx !== -1 ? js.slice(idx, idx + 800) : 'filterOrdersByCustomer NOT found');
