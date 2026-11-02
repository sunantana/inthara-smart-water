const fs = require('fs');

// Check index.html for custFormDepositRate
const html = fs.readFileSync('d:/13. Antigravity/Sunan/Inthara_program_develop/public/index.html', 'utf8');
const matchDep = html.match(/id="custFormDepositRate"[^>]+/);
console.log('custFormDepositRate in index.html:', matchDep ? matchDep[0] : 'not found');

// Check app.js for custFormDepositRate
const js = fs.readFileSync('d:/13. Antigravity/Sunan/Inthara_program_develop/public/app.js', 'utf8');
const lines = js.split('\n');
lines.forEach((l, i) => {
  if (l.includes('custFormDepositRate')) {
    console.log(`app.js line ${i+1}: ${l.trim()}`);
  }
});
