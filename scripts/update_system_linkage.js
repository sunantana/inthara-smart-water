const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '../data/inthara_db.json');
const db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

// 1. Ensure inventory has all bottle sizes and packaging raw materials
const requiredInventory = [
  {
    sku: 'RM-BTL-350',
    name: 'ขวดเปล่า PET 350 ml (อินธารา)',
    category: 'วัตถุดิบ/บรรจุภัณฑ์',
    stock: 4500,
    minStock: 1200,
    unit: 'ขวด',
    unitPrice: 1.10,
    unitCost: 1.10
  },
  {
    sku: 'RM-BTL-600',
    name: 'ขวดเปล่า PET 600 ml (อินธารา)',
    category: 'วัตถุดิบ/บรรจุภัณฑ์',
    stock: 8000,
    minStock: 2400,
    unit: 'ขวด',
    unitPrice: 1.25,
    unitCost: 1.25
  },
  {
    sku: 'RM-BTL-1500',
    name: 'ขวดเปล่า PET 1,500 ml (อินธารา)',
    category: 'วัตถุดิบ/บรรจุภัณฑ์',
    stock: 3500,
    minStock: 1200,
    unit: 'ขวด',
    unitPrice: 1.80,
    unitCost: 1.80
  },
  {
    sku: 'RM-CAP-PET',
    name: 'ฝาเกลียวขวดน้ำดื่ม PET 28/30mm (คละสีขาว-น้ำเงิน Food Grade)',
    category: 'วัตถุดิบ/บรรจุภัณฑ์',
    stock: 12000,
    minStock: 3000,
    unit: 'ฝา',
    unitPrice: 0.28,
    unitCost: 0.28
  },
  {
    sku: 'RM-LABEL-PET',
    name: 'ฉลากฟิล์มขวดน้ำดื่มอินธารา (คละขนาด 350/600/1500 ml)',
    category: 'วัตถุดิบ/บรรจุภัณฑ์',
    stock: 15000,
    minStock: 3000,
    unit: 'ชิ้น',
    unitPrice: 0.30,
    unitCost: 0.30
  }
];

requiredInventory.forEach(item => {
  const existing = db.inventory.find(i => i.sku === item.sku);
  if (!existing) {
    db.inventory.push(item);
  }
});

// 2. Initialize packagingLots
if (!Array.isArray(db.packagingLots) || db.packagingLots.length === 0) {
  db.packagingLots = [
    {
      lotNo: 'LOT-TNK-2410-01',
      purchaseDate: '2024-10-15',
      itemType: 'bottle_189L',
      itemName: 'ถังน้ำดื่ม PC 18.9 ลิตร (Food Grade ตราอินธารา)',
      sku: 'RET-189L-EMPTY',
      quantity: 500,
      remainingQty: 500,
      unit: 'ถัง',
      unitCost: 135,
      totalCost: 67500,
      supplier: 'บริษัท ไทยโพลีคาร์บอเนต คอนเทนเนอร์ จำกัด',
      assetLinked: true,
      assetId: 'AST-TNK-001',
      assetName: 'ถังน้ำดื่ม PC 18.9 ลิตร หมุนเวียน Lot 2410-01 (500 ใบ)',
      status: 'active',
      notes: 'ถังสีฟ้าใสเกรด A พร้อมสกรีนโลโก้น้ำดื่มอินธารา (ตัดค่าเสื่อม 3 ปี)'
    },
    {
      lotNo: 'LOT-BTL600-2410-01',
      purchaseDate: '2024-10-18',
      itemType: 'bottle_600ml',
      itemName: 'ขวดเปล่า PET 600 ml (อินธารา)',
      sku: 'RM-BTL-600',
      quantity: 10000,
      remainingQty: 8000,
      unit: 'ขวด',
      unitCost: 1.25,
      totalCost: 12500,
      supplier: 'โรงงานบรรจุภัณฑ์พลาสติกภาคเหนือ',
      assetLinked: false,
      status: 'active',
      notes: 'สั่งซื้อสำหรับรอบการผลิตเดือนตุลาคม'
    },
    {
      lotNo: 'LOT-BTL350-2410-01',
      purchaseDate: '2024-10-18',
      itemType: 'bottle_350ml',
      itemName: 'ขวดเปล่า PET 350 ml (อินธารา)',
      sku: 'RM-BTL-350',
      quantity: 6000,
      remainingQty: 4500,
      unit: 'ขวด',
      unitCost: 1.10,
      totalCost: 6600,
      supplier: 'โรงงานบรรจุภัณฑ์พลาสติกภาคเหนือ',
      assetLinked: false,
      status: 'active',
      notes: 'ขวดไซต์เล็กงานจัดเลี้ยง/ประชุม'
    },
    {
      lotNo: 'LOT-BTL1500-2410-01',
      purchaseDate: '2024-10-18',
      itemType: 'bottle_1500ml',
      itemName: 'ขวดเปล่า PET 1,500 ml (อินธารา)',
      sku: 'RM-BTL-1500',
      quantity: 4000,
      remainingQty: 3500,
      unit: 'ขวด',
      unitCost: 1.80,
      totalCost: 7200,
      supplier: 'โรงงานบรรจุภัณฑ์พลาสติกภาคเหนือ',
      assetLinked: false,
      status: 'active',
      notes: 'ขวดขนาดใหญ่ 1.5 ลิตร'
    },
    {
      lotNo: 'LOT-CAP189-2410-01',
      purchaseDate: '2024-10-20',
      itemType: 'cap_189L',
      itemName: 'ฝาถังน้ำดื่ม 18.9 ลิตร สีฟ้า (Food Grade)',
      sku: 'RM-CAP-189',
      quantity: 3000,
      remainingQty: 2200,
      unit: 'ฝา',
      unitCost: 1.20,
      totalCost: 3600,
      supplier: 'บริษัท ยูเนี่ยนพลาสติกแพ็คเกจจิ้ง จำกัด',
      assetLinked: false,
      status: 'active',
      notes: 'ฝาเกรดนำเข้า สำหรับถัง 18.9L'
    },
    {
      lotNo: 'LOT-CAPPET-2410-01',
      purchaseDate: '2024-10-20',
      itemType: 'cap_pet',
      itemName: 'ฝาเกลียวขวดน้ำดื่ม PET 28/30mm (Food Grade)',
      sku: 'RM-CAP-PET',
      quantity: 15000,
      remainingQty: 12000,
      unit: 'ฝา',
      unitCost: 0.28,
      totalCost: 4200,
      supplier: 'บริษัท ยูเนี่ยนพลาสติกแพ็คเกจจิ้ง จำกัด',
      assetLinked: false,
      status: 'active',
      notes: 'ฝาเกลียวมาตรฐานขวด 350, 600, 1500ml'
    },
    {
      lotNo: 'LOT-SHRINK-2410-01',
      purchaseDate: '2024-10-20',
      itemType: 'film_label',
      itemName: 'ฟิล์มหดซีลฝาถังและคอขวด (สกรีนอินธารา)',
      sku: 'RM-SHRINK',
      quantity: 10000,
      remainingQty: 8500,
      unit: 'ชิ้น',
      unitCost: 0.35,
      totalCost: 3500,
      supplier: 'สยามฟิล์มแอนด์เลเบิล จำกัด',
      assetLinked: false,
      status: 'active',
      notes: 'ฟิล์มความร้อนซีลฝากันปลอมแปลง'
    }
  ];
}

// 3. Ensure AST-TNK-001 (18.9L circulating tank asset) exists in db.assets
db.assets = db.assets || [];
if (!db.assets.some(a => a.id === 'AST-TNK-001')) {
  db.assets.push({
    id: 'AST-TNK-001',
    name: 'ถังน้ำดื่ม PC 18.9 ลิตร หมุนเวียน Lot 2410-01 (500 ใบ)',
    category: 'container_tank',
    categoryName: '💧 ภาชนะ & ถังน้ำดื่มหมุนเวียน (Carboy)',
    brand: 'Inthara Custom (ตราอินธารา)',
    model: 'PC 18.9L Food Grade (Blue Polycarbonate)',
    serialNo: 'LOT-TNK-2410-01',
    location: 'โรงงานน้ำดื่มอินธารา / หมุนเวียนในสายส่งลูกค้า',
    acquisitionDate: '2024-10-15',
    cost: 67500,
    usefulLifeYears: 3,
    salvageValue: 5000,
    depreciationPerYear: 20833,
    accumulatedDepreciation: 0,
    currentValue: 67500,
    assignedEmployeeId: 'EMP-02',
    assignedEmployeeName: 'นายสุนัน ต๊ะนา',
    status: 'in_use',
    linkedRefId: 'LOT-TNK-2410-01',
    notes: 'สินทรัพย์ถังหมุนเวียน 500 ใบ เชื่อมโยงกับล็อตสั่งซื้อและสต็อกโรงงาน'
  });
}

// 4. Ensure all 16 machines are mapped in db.assets
const machineAssetCatalog = [
  { code: 'ITR-SP-001', name: 'ชุดปั๊มซับเมอร์ส AC/DC 2 นิ้ว 1.5 HP', cost: 42000, life: 5, salvage: 2000, model: 'Handuro H100 Q8' },
  { code: 'ITR-MP-001', name: 'ปั๊มหอยโข่งหลายใบพัดแนวนอน ชุดที่ 1', cost: 18500, life: 5, salvage: 1000, model: 'LEO EMHm 2-6' },
  { code: 'ITR-FH-001', name: 'หัววาล์วออโต้ ถังกรองแมงกานีส', cost: 15000, life: 5, salvage: 500, model: 'Auto Valve FRP-Mn' },
  { code: 'ITR-FH-002', name: 'หัววาล์วออโต้ ถังกรองคาร์บอน', cost: 15000, life: 5, salvage: 500, model: 'Auto Valve FRP-AC' },
  { code: 'ITR-FH-003', name: 'หัววาล์วออโต้ ถังกรองเรซิน + ถังเกลือ', cost: 18000, life: 5, salvage: 500, model: 'Auto Valve FRP-Resin' },
  { code: 'ITR-FH-004', name: 'หัววาล์วออโต้ ชุดกรองพรีทรีทเม้นท์เสริม', cost: 15000, life: 5, salvage: 500, model: 'Auto Valve FRP-Aux' },
  { code: 'ITR-CP-001', name: 'ปั๊มโดสเคมี (Dosing Pump)', cost: 12000, life: 5, salvage: 500, model: 'DP-24' },
  { code: 'ITR-MP-002', name: 'ปั๊มหอยโข่งหลายใบพัดแนวนอน ชุดที่ 2', cost: 18500, life: 5, salvage: 1000, model: 'LEO EMHm 2-6' },
  { code: 'ITR-RO-001', name: 'เครื่องกรองน้ำ RO พร้อมปั๊มแรงดันสูง 24,000L/วัน', cost: 185000, life: 7, salvage: 10000, model: 'WTRm 2-22 (RO-4040)' },
  { code: 'ITR-MP-003', name: 'ปั๊มหอยโข่งหลายใบพัดแนวนอน ชุดที่ 3', cost: 18500, life: 5, salvage: 1000, model: 'LEO EMHm 2-6' },
  { code: 'ITR-UV-001', name: 'เครื่องผลิตแสงยูวี (UV Sterilizer 30 GPM)', cost: 24000, life: 5, salvage: 1000, model: 'UV-40W S304' },
  { code: 'ITR-WE-001', name: 'เครื่องล้างถังภายนอก (18.9 ลิตร)', cost: 35000, life: 5, salvage: 2000, model: 'WE-750 Stainless' },
  { code: 'ITR-WI-001', name: 'เครื่องล้างถังภายใน (18.9 ลิตร)', cost: 38000, life: 5, salvage: 2000, model: 'WI-750 Stainless' },
  { code: 'ITR-WB-001', name: 'เครื่องล้างขวด (500 - 1,500 ml)', cost: 32000, life: 5, salvage: 1500, model: 'WB-750 Semi-Auto' },
  { code: 'ITR-CS-001', name: 'เครื่องปิดฝาถังน้ำดื่ม 18.9 ลิตร', cost: 45000, life: 5, salvage: 2000, model: 'CS-2000A Pneumatic' },
  { code: 'ITR-CS-002', name: 'เครื่องปิดผนึกซีลด้วยไอน้ำ (Steam Shrink Seal)', cost: 28000, life: 5, salvage: 1000, model: 'CS-2000B Steam Heat' }
];

machineAssetCatalog.forEach((mc, idx) => {
  const existingAsset = db.assets.find(a => a.linkedRefId === mc.code);
  const astId = 'AST-MAC-' + String(idx + 1).padStart(3, '0');
  const depPerYear = Math.round((mc.cost - mc.salvage) / mc.life);
  const accumDep = Math.round(depPerYear * 0.7);
  const curVal = mc.cost - accumDep;

  if (existingAsset) {
    existingAsset.linkedRefId = mc.code;
    existingAsset.name = mc.name;
    existingAsset.category = 'machine';
    existingAsset.categoryName = '⚙️ เครื่องจักรผลิตน้ำ';
  } else {
    db.assets.push({
      id: astId,
      name: mc.name,
      category: 'machine',
      categoryName: '⚙️ เครื่องจักรผลิตน้ำ',
      brand: 'Inthara Machinery',
      model: mc.model,
      serialNo: mc.code,
      location: 'ห้องระบบผลิตน้ำดื่ม โรงงานน้ำดื่มอินธารา',
      acquisitionDate: '2024-01-15',
      cost: mc.cost,
      usefulLifeYears: mc.life,
      salvageValue: mc.salvage,
      depreciationPerYear: depPerYear,
      accumulatedDepreciation: accumDep,
      currentValue: curVal,
      assignedEmployeeId: 'EMP-02',
      assignedEmployeeName: 'นายสุนัน ต๊ะนา',
      status: 'in_use',
      linkedRefId: mc.code,
      notes: `เครื่องจักรในสายการผลิต รหัส ${mc.code} เชื่อมโยงระบบ CMMS และระบบบันทึกการผลิต`
    });
  }
});

fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
console.log('Database updated successfully! Assets count:', db.assets.length, 'Packaging lots count:', db.packagingLots.length, 'Inventory items count:', db.inventory.length);
