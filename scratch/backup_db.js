const fs = require('fs');
const path = require('path');

const dbPath = 'd:/13. Antigravity/Sunan/Inthara_program_develop/data/inthara_db.json';
const backupPath = 'd:/13. Antigravity/Sunan/Inthara_program_develop/data/inthara_db.backup_' + Date.now() + '.json';

const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

// Backup
fs.writeFileSync(backupPath, JSON.stringify(db, null, 2), 'utf8');
console.log('✓ Backup created at:', backupPath);

console.log('Current db status:');
console.log('- Orders count:', (db.orders || []).length);
console.log('- Saved trips count:', (db.savedTrips || []).length);
console.log('- Payment receipts count:', (db.paymentReceipts || []).length);
console.log('- Customers count:', (db.customers || []).length);
