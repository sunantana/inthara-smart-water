const fs = require('fs');

const db = JSON.parse(fs.readFileSync('d:/13. Antigravity/Sunan/Inthara_program_develop/data/inthara_db.json', 'utf8'));
console.log(db.inventory);
