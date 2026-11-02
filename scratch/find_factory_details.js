const fs = require('fs');
const path = require('path');

const rootDir = 'd:/13. Antigravity/Sunan/Inthara_program_develop';
const filesToCheck = [
  'public/index.html',
  'public/app.js',
  'server.js',
  'data/inthara_db.json'
];

filesToCheck.forEach(relPath => {
  const fullPath = path.join(rootDir, relPath);
  if (!fs.existsSync(fullPath)) return;
  const content = fs.readFileSync(fullPath, 'utf8');
  const lines = content.split('\n');
  lines.forEach((l, i) => {
    if (l.includes('บริษัท น้ำดื่ม') || l.includes('บริษัทน้ำดื่ม') || l.includes('บริษัท') || l.includes('factory')) {
      if (l.includes('factory') || l.includes('บริษัท')) {
        console.log(`[${relPath}:${i+1}] ${l.trim()}`);
      }
    }
  });
});
