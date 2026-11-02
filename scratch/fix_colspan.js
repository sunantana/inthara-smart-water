const fs = require('fs');

const js = fs.readFileSync('d:/13. Antigravity/Sunan/Inthara_program_develop/public/app.js', 'utf8');
const appPath = 'd:/13. Antigravity/Sunan/Inthara_program_develop/public/app.js';

if (js.includes('colspan="10" class="p-8 text-center text-xs text-slate-400')) {
  const updatedJs = js.replace('colspan="10" class="p-8 text-center text-xs text-slate-400', 'colspan="11" class="p-8 text-center text-xs text-slate-400');
  fs.writeFileSync(appPath, updatedJs, 'utf8');
  console.log('✓ Updated colspan from 10 to 11 in orders table empty state');
} else {
  console.log('Notice: colspan check passed');
}
