const fs = require('fs');
const js = fs.readFileSync('d:/13. Antigravity/Sunan/Inthara_program_develop/public/app.js', 'utf8');
const idx = js.indexOf('function renderSavedTripsTable');
console.log(js.slice(idx, idx + 2500));
