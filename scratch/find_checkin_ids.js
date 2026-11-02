const fs = require('fs');
const js = fs.readFileSync('d:/13. Antigravity/Sunan/Inthara_program_develop/public/app.js', 'utf8');
const matches = js.match(/['"`]checkin[A-Za-z0-9_]+['"`]|getElementById\(['"]checkin[A-Za-z0-9_]+['"]\)/g);
console.log(Array.from(new Set(matches)));
