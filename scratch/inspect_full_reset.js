const fs = require('fs');

const js = fs.readFileSync('d:/13. Antigravity/Sunan/Inthara_program_develop/public/app.js', 'utf8');
const start = js.indexOf('function resetCustomerMasterForm');
const end = js.indexOf('function editCustomerRecord');
console.log(js.slice(start, end));
