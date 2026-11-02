const fs = require('fs');
const html = fs.readFileSync('d:/13. Antigravity/Sunan/Inthara_program_develop/public/index.html', 'utf8');
const lines = html.split('\n');
const startLine = lines.findIndex(l => l.includes('id="modalCheckin"'));
console.log('modalCheckin starts at line:', startLine + 1);
const endLine = lines.findIndex((l, i) => i > startLine && l.includes('</div><!-- end modalCheckin -->') || (i > startLine && l.includes('id="modalOrderSlip"')));
console.log('modalCheckin ends around line:', endLine + 1);
console.log(lines.slice(startLine, startLine + 120).join('\n'));
