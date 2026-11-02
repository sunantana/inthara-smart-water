const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'inthara_db.json');
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

// 1. Update AST-VEH-001 in db.assets
const astVeh = db.assets.find(a => a.id === 'AST-VEH-001' || a.category === 'vehicle');
if (astVeh) {
  astVeh.id = 'AST-VEH-001';
  astVeh.name = 'รถกระบะ Chevrolet Colorado ปี 2012 (สายท่าปลา-จริม)';
  astVeh.category = 'vehicle';
  astVeh.categoryName = '🚚 ยานพาหนะ (รถส่งน้ำ)';
  astVeh.brand = 'Chevrolet';
  astVeh.model = 'Colorado ปี 2012, Duramax 2.5 ลิตร: 4 สูบ 150 แรงม้า รุ่นย่อยแบบ แค็บ';
  astVeh.serialNo = 'ผอ-4568 ชลบุรี';
  astVeh.location = 'ลานจอดรถขนส่ง โรงงานน้ำดื่มอินธารา';
  astVeh.assignedEmployeeId = 'EMP-02';
  astVeh.assignedEmployeeName = 'นายสุนัน ต๊ะนา';
  astVeh.status = 'in_use';
  astVeh.linkedRefId = 'VEH-01';
  astVeh.notes = 'รถกระบะส่งน้ำหลัก ประจำสาย อ.ท่าปลา - ต.จริม';
}

// 2. Update db.vehicles linked 1:1 with real asset AST-VEH-001
db.vehicles = [
  {
    id: 'VEH-01',
    assetId: 'AST-VEH-001',
    plate: 'ผอ-4568 ชลบุรี',
    name: 'Chevrolet Colorado ปี 2012 (สายท่าปลา-จริม)',
    brand: 'Chevrolet',
    model: 'Colorado Duramax 2.5L แค็บ',
    maxBottles189L: 120,
    maxPacks: 150,
    fuelRateKmPerLiter: 10.5,
    dieselPricePerLiter: 32.5,
    status: 'available',
    defaultDriverId: 'EMP-02',
    defaultDriverName: 'นายสุนัน ต๊ะนา'
  }
];

// 3. Update EMP-02 vehicle linkage
if (Array.isArray(db.employees)) {
  const emp2 = db.employees.find(e => e.id === 'EMP-02');
  if (emp2) {
    emp2.vehicleId = 'VEH-01';
    emp2.vehiclePlate = 'ผอ-4568 ชลบุรี';
  }
}

// 4. Update savedTrips
if (Array.isArray(db.savedTrips)) {
  db.savedTrips.forEach(t => {
    if (t.vehicleId === 'VEH-01') {
      t.vehiclePlate = 'ผอ-4568 ชลบุรี';
      t.vehicleName = 'ผอ-4568 ชลบุรี (นายสุนัน ต๊ะนา)';
      t.driverId = t.driverId || 'EMP-02';
      t.driverName = t.driverName || 'นายสุนัน ต๊ะนา';
    }
  });
}

fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
console.log('✅ Updated inthara_db.json successfully:');
console.log('Vehicles:', JSON.stringify(db.vehicles, null, 2));
console.log('Vehicle Asset:', JSON.stringify(db.assets.find(a => a.id === 'AST-VEH-001'), null, 2));
