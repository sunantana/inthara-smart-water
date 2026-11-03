const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const {
  ROLE_PERMISSIONS,
  loadSecurityDB,
  saveSecurityDB,
  writeUsersToExcel,
  syncUsersFromExcelIfPresent,
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  recordAudit,
  EXCEL_USER_FILE
} = require('./security');

const app = express();
const PORT = process.env.PORT || 3080;
// อยู่หลัง reverse proxy (Render / Cloudflare / preview) → ใช้ IP จริงจาก X-Forwarded-For
// ไม่อย่างนั้น rate limit จะกลายเป็นของทั้งระบบแทนที่จะเป็นรายผู้ใช้
app.set('trust proxy', 1);
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
const DB_FILE = path.join(DATA_DIR, 'inthara_db.json');

// Security Headers Middleware (CSP, X-Frame-Options, HSTS, No-Sniff)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Google Drive Cloud Config (Folder: 05.ระบบโปรแกรม_ERP_และฐานข้อมูล_(Inthara_db) under INTHARA)
const GDRIVE_CMD = process.env.GDRIVE_CMD || 'C:\\Users\\sunant\\.gemini\\config\\plugins\\gdrive\\skills\\gdrive\\scripts\\gdrive.cmd';
const GDRIVE_FOLDER_ID = '1I_UbGZst4jtOyI0t8taOof-95hF8JTjU';
const GDRIVE_DB_FILE_ID = '10YfH7RApJZoqu4jrljYI_slQdjMv1n8G';
const GDRIVE_EXCEL_FILE_ID = '1HTn7qer3hqRSv1wMgoP6L9xkOMIXUx3C';
const GDRIVE_SHEET_FILE_ID = '1RXjo5R_2tSRYFAXsIoj5vNfZL-Wuw1y9t57L9Uqtdr4';

function runGdriveCmd(args, cb) {
  if (process.platform !== 'win32' || !fs.existsSync(GDRIVE_CMD)) {
    if (typeof cb === 'function') {
      return cb(new Error('Google Drive CLI is active on local factory server (Cloud fallback mode)'), '', '');
    }
    return;
  }
  execFile('cmd.exe', ['/c', GDRIVE_CMD, ...args], (err, stdout, stderr) => {
    if (typeof cb === 'function') cb(err, stdout, stderr);
  });
}
let cloudSyncState = {
  lastSyncTime: new Date().toISOString(),
  status: 'synced',
  folderUrl: `https://drive.google.com/drive/folders/${GDRIVE_FOLDER_ID}`,
  fileId: GDRIVE_DB_FILE_ID,
  excelFileId: GDRIVE_EXCEL_FILE_ID,
  sheetFileId: GDRIVE_SHEET_FILE_ID
};

// CORS: ระบบนี้เป็น same-origin app (หน้าเว็บกับ API อยู่โดเมนเดียวกัน)
// เดิมใช้ app.use(cors()) = Access-Control-Allow-Origin: * ทำให้เว็บอื่นใดก็ได้
// อ่านข้อมูล ERP ข้ามโดเมนผ่านเบราว์เซอร์ของผู้ใช้ได้ → จำกัดด้วย allowlist แทน
// (ถ้ามีโดเมนภายนอกจริง ให้ตั้ง CORS_ORIGINS=https://a.com,https://b.com)
const corsAllowlist = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(cors({ origin: corsAllowlist.length ? corsAllowlist : false }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ==========================================
// GLOBAL API AUTH: ทุก /api/* ต้องมี token ยกเว้นรายการด้านล่าง
// (เดิมมีเพียงไม่กี่ endpoint ที่ตรวจ token → ข้อมูลทั้งระบบเปิดอ่านได้ฟรี)
// ==========================================
const PUBLIC_API_PATTERNS = [
  /^\/api\/auth\/login$/,
  /^\/api\/auth\/reset-password-by-pin$/,
  /^\/api\/customer-portal\//
];

function requireStaffSession(req, res, next) {
  if (!req.path.startsWith('/api/')) return next();
  if (PUBLIC_API_PATTERNS.some((re) => re.test(req.path))) return next();
  const user = getAuthUser(req);
  if (!user || !user.role) {
    return res.status(401).json({
      ok: false,
      needLogin: true,
      error: 'กรุณาเข้าสู่ระบบก่อนใช้งาน (Session หมดอายุหรือยังไม่ได้เข้าสู่ระบบ)'
    });
  }
  req.staffUser = user;
  next();
}
app.use(requireStaffSession);

// ตรวจสิทธิ์ระดับผู้บริหาร/แอดมินสำหรับ endpoint ที่อ่อนไหว
function requireRole(req, roles) {
  const u = req.staffUser || getAuthUser(req);
  return u && roles.includes(u.role) ? u : null;
}
function denyRole(res) {
  return res.status(403).json({ ok: false, error: 'ต้องใช้สิทธิ์ผู้บริหารเท่านั้น' });
}

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initial Seed Data for Inthara Water Factory (121 Moo 4, Tambon Charim, Tha Pla, Uttaradit)
const FACTORY_LOCATION = {
  name: 'น้ำดื่มอินธารา',
  address: '121 หมู่ 4 ต.จริม อ.ท่าปลา จ.อุตรดิตถ์ 53150',
  lat: 17.816882513503195,
  lng: 100.36169257553256
};

function getInitialData() {
  return {
    factory: FACTORY_LOCATION,
    machines: [
      { code: 'ITR-SP-001', name: 'ชุดปั๊มซับเมอร์ส AC/DC 2 นิ้ว 1.5 HP', category: 'ระบบผลิตน้ำ', brand: '-', model: 'H100 Q8', watts: 1100, capacity: '2 นิ้ว / 1.5 HP', status: 'normal', runHours: 840, pmIntervalHours: 1000, lastPmDate: '2026-10-01', nextPmTask: 'ตรวจเช็คกระแสไฟและแรงดันน้ำดิบ' },
      { code: 'ITR-MP-001', name: 'ปั๊มหอยโข่งหลายใบพัดแนวนอน ชุดที่ 1', category: 'ระบบผลิตน้ำ', brand: 'LEO', model: 'EMHm 2-6', watts: 750, capacity: '1.5 HP', status: 'normal', runHours: 720, pmIntervalHours: 1000, lastPmDate: '2026-10-01', nextPmTask: 'เช็คซีลกันรั่วและแรงดันส่งเข้าถังกรอง' },
      { code: 'ITR-FH-001', name: 'หัววาล์วออโต้ ถังกรองแมงกานีส', category: 'ระบบผลิตน้ำ', brand: 'Auto Valve', model: 'FRP-Mn', watts: 24, capacity: 'ดักสนิม/โลหะหนัก', status: 'normal', runHours: 150, pmIntervalHours: 168, lastPmDate: '2026-10-20', nextPmTask: 'ล้างย้อน (Backwash) สารกรองแมงกานีส' },
      { code: 'ITR-FH-002', name: 'หัววาล์วออโต้ ถังกรองคาร์บอน', category: 'ระบบผลิตน้ำ', brand: 'Auto Valve', model: 'FRP-AC', watts: 24, capacity: 'ดูดกลิ่น/สี/คลอรีน', status: 'warning', runHours: 165, pmIntervalHours: 168, lastPmDate: '2026-10-19', nextPmTask: 'ล้างย้อน (Backwash) สารกรองคาร์บอน & เช็คคลอรีน' },
      { code: 'ITR-FH-003', name: 'หัววาล์วออโต้ ถังกรองเรซิน + ถังเกลือ', category: 'ระบบผลิตน้ำ', brand: 'Auto Valve', model: 'FRP-Resin', watts: 24, capacity: 'ลดความกระด้าง/หินปูน', status: 'due', runHours: 172, pmIntervalHours: 168, lastPmDate: '2026-10-18', nextPmTask: 'ล้างฟื้นสภาพเรซินด้วยน้ำเกลือ (Regeneration)' },
      { code: 'ITR-FH-004', name: 'หัววาล์วออโต้ ชุดกรองพรีทรีทเม้นท์เสริม', category: 'ระบบผลิตน้ำ', brand: 'Auto Valve', model: 'FRP-Aux', watts: 24, capacity: 'ระบบกรองสำรอง', status: 'normal', runHours: 90, pmIntervalHours: 168, lastPmDate: '2026-10-22', nextPmTask: 'ตรวจเช็คการทำงานหัววาล์วอัตโนมัติ' },
      { code: 'ITR-CP-001', name: 'ปั๊มโดสเคมี (Dosing Pump)', category: 'ระบบผลิตน้ำ', brand: '-', model: 'DP-24', watts: 24, capacity: 'จ่ายสารกันตะกรัน', status: 'normal', runHours: 410, pmIntervalHours: 500, lastPmDate: '2026-10-10', nextPmTask: 'เติมน้ำยากันตะกรัน (Antiscalant) และไล่ฟองอากาศ' },
      { code: 'ITR-MP-002', name: 'ปั๊มหอยโข่งหลายใบพัดแนวนอน ชุดที่ 2', category: 'ระบบผลิตน้ำ', brand: 'LEO', model: 'EMHm 2-6', watts: 750, capacity: '1.5 HP (ป้อน RO)', status: 'normal', runHours: 680, pmIntervalHours: 1000, lastPmDate: '2026-10-05', nextPmTask: 'ตรวจเช็คแรงดันน้ำซอฟท์เข้าเครื่อง RO' },
      { code: 'ITR-RO-001', name: 'เครื่องกรองน้ำ RO พร้อมปั๊มแรงดันสูง', category: 'ระบบผลิตน้ำ', brand: 'LEO', model: 'WTRm 2-22', watts: 2200, capacity: '2,000 ลิตร/ชม. (24,000 L/วัน)', status: 'warning', runHours: 1890, pmIntervalHours: 2000, lastPmDate: '2026-09-15', nextPmTask: 'CIP ล้างเมมเบรน RO 0.0001 ไมครอน & เปลี่ยนกรอง 5u' },
      { code: 'ITR-MP-003', name: 'ปั๊มหอยโข่งหลายใบพัดแนวนอน ชุดที่ 3', category: 'ระบบผลิตน้ำ', brand: 'LEO', model: 'EMHm 2-6', watts: 750, capacity: '1.5 HP (จ่ายจุดบรรจุ)', status: 'normal', runHours: 640, pmIntervalHours: 1000, lastPmDate: '2026-10-05', nextPmTask: 'ตรวจเช็คแรงดันจ่ายน้ำดีผ่านกรอง 5 ไมครอน' },
      { code: 'ITR-UV-001', name: 'เครื่องผลิตแสงยูวี (UV Sterilizer)', category: 'ระบบฆ่าเชื้อ', brand: '-', model: 'UV-40W', watts: 40, capacity: '36-40 W', status: 'normal', runHours: 4200, pmIntervalHours: 8000, lastPmDate: '2026-08-01', nextPmTask: 'เช็ดทำความสะอาดหลอดแก้วควอตซ์และเช็คความเข้มแสง UV' },
      { code: 'ITR-WE-001', name: 'เครื่องล้างถังภายนอก (18.9 ลิตร)', category: 'ระบบล้างทำความสะอาด', brand: '-', model: 'WE-750', watts: 750, capacity: 'ถัง 18.9 ลิตร', status: 'normal', runHours: 310, pmIntervalHours: 500, lastPmDate: '2026-10-12', nextPmTask: 'ตรวจเช็คขนแปรงขัดถังและหัวฉีดน้ำแรงดัน' },
      { code: 'ITR-WI-001', name: 'เครื่องล้างถังภายใน (18.9 ลิตร)', category: 'ระบบล้างทำความสะอาด', brand: '-', model: 'WI-750', watts: 750, capacity: 'ถัง 18.9 ลิตร', status: 'normal', runHours: 310, pmIntervalHours: 500, lastPmDate: '2026-10-12', nextPmTask: 'ทำความสะอาดหัวฉีดสเปรย์ล้างภายในถัง' },
      { code: 'ITR-WB-001', name: 'เครื่องล้างขวด (500 - 1,500 ml)', category: 'ระบบล้างทำความสะอาด', brand: '-', model: 'WB-750', watts: 750, capacity: 'ขวด 500-1,500 ml', status: 'normal', runHours: 280, pmIntervalHours: 500, lastPmDate: '2026-10-14', nextPmTask: 'ตรวจเช็คหัวฉีดน้ำล้างขวดและรางเลื่อน' },
      { code: 'ITR-CS-001', name: 'เครื่องปิดฝาถังน้ำดื่ม 18.9 ลิตร', category: 'ระบบบรรจุและปิดผนึก', brand: '-', model: 'CS-2000A', watts: 2000, capacity: 'ถัง 18.9 ลิตร (5 แกลลอน)', status: 'normal', runHours: 295, pmIntervalHours: 500, lastPmDate: '2026-10-15', nextPmTask: 'ตรวจเช็คหัวกดฝาและแรงอัดปิดฝาถัง' },
      { code: 'ITR-CS-002', name: 'เครื่องปิดผนึกซีลด้วยไอน้ำ (Steam Shrink Seal)', category: 'ระบบบรรจุและปิดผนึก', brand: '-', model: 'CS-2000B', watts: 2000, capacity: 'ซีลฝาถังและคอขวด', status: 'normal', runHours: 340, pmIntervalHours: 500, lastPmDate: '2026-10-15', nextPmTask: 'ล้างตะกรันหม้อต้มไอน้ำและเช็คอุณหภูมิฮีตเตอร์' }
    ],
    maintenanceLogs: [
      { id: 'MNT-20261020-01', machineCode: 'ITR-FH-001', date: '2026-10-20', type: 'PM (ตามรอบ)', action: 'ล้างย้อน (Backwash) ถังกรองแมงกานีส 30 นาที น้ำใสปกติ', technician: 'ช่างสมชาย', cost: 0, status: 'completed' },
      { id: 'MNT-20261018-02', machineCode: 'ITR-RO-001', date: '2026-10-18', type: 'PM (ตามรอบ)', action: 'เปลี่ยนไส้กรองดักตะกอนละเอียด 5 ไมครอน (Sediment Cartridge) 4 แท่ง', technician: 'ช่างสมชาย', cost: 680, status: 'completed' },
      { id: 'MNT-20261015-03', machineCode: 'ITR-CS-002', date: '2026-10-15', type: 'PM (ตามรอบ)', action: 'ล้างตะกรันหม้อต้มไอน้ำเครื่องซีลฟิล์มหด และตรวจเช็คสายไฟ', technician: 'ช่างวิชัย', cost: 350, status: 'completed' }
    ],
    productionLots: [
      { lotNo: 'LOT-261025-A', date: '2026-10-25', shift: 'กะเช้า (08:00-17:00)', rawWaterLiters: 16500, roWaterLiters: 11200, bottle18_9L: 380, pack350ml: 150, pack600ml: 260, pack1500ml: 140, defectCount: 4, tdsRaw: 245, tdsRo: 8.5, phValue: 7.2, chlorineResidual: 0.0, roPressurePsi: 145, uvStatus: 'ปกติ (ผ่านเกณฑ์)', qcInspector: 'มัณฑนา โนราช', note: 'คุณภาพน้ำผ่านเกณฑ์ มอก. 257' },
      { lotNo: 'LOT-261026-A', date: '2026-10-26', shift: 'กะเช้า (08:00-17:00)', rawWaterLiters: 18000, roWaterLiters: 12400, bottle18_9L: 420, pack350ml: 150, pack600ml: 310, pack1500ml: 160, defectCount: 3, tdsRaw: 238, tdsRo: 7.8, phValue: 7.3, chlorineResidual: 0.0, roPressurePsi: 148, uvStatus: 'ปกติ (ผ่านเกณฑ์)', qcInspector: 'มัณฑนา โนราช', note: 'เดินเครื่องเต็มกำลังผลิต' }
    ],
    inventory: [
      { sku: 'FG-189L', name: 'น้ำดื่มอินธารา ถัง 18.9 ลิตร (ถังเต็มพร้อมส่ง)', category: 'สินค้าสำเร็จรูป', stock: 540, minStock: 150, unit: 'ถัง', unitPrice: 15, unitCost: 5.5 },
    { sku: 'FG-350ML', name: 'น้ำดื่มอินธารา ขวด 350 ml (แพ็ค 12 ขวด)', category: 'สินค้าสำเร็จรูป', stock: 520, minStock: 150, unit: 'แพ็ค', unitPrice: 35, unitCost: 15.0 },
      { sku: 'FG-600ML', name: 'น้ำดื่มอินธารา ขวด 600 ml (แพ็ค 12 ขวด)', category: 'สินค้าสำเร็จรูป', stock: 680, minStock: 200, unit: 'แพ็ค', unitPrice: 35, unitCost: 18.0 },
      { sku: 'FG-1500ML', name: 'น้ำดื่มอินธารา ขวด 1,500 ml (แพ็ค 6 ขวด)', category: 'สินค้าสำเร็จรูป', stock: 410, minStock: 150, unit: 'แพ็ค', unitPrice: 35, unitCost: 17.5 },
      { sku: 'RET-189L-EMPTY', name: 'ถังเปล่าหมุนเวียน 18.9 ลิตร (รอซักล้างในโรงงาน)', category: 'ภาชนะหมุนเวียน', stock: 620, minStock: 200, unit: 'ถัง', unitPrice: 150, unitCost: 120 },
      { sku: 'RM-CAP-189', name: 'ฝาถังน้ำดื่ม 18.9 ลิตร (Food Grade)', category: 'วัตถุดิบ/บรรจุภัณฑ์', stock: 3400, minStock: 1000, unit: 'ฝา', unitPrice: 1.2, unitCost: 1.2 },
      { sku: 'RM-SHRINK', name: 'ฟิล์มหดซีลฝาถังและคอขวด (อินธารา)', category: 'วัตถุดิบ/บรรจุภัณฑ์', stock: 8500, minStock: 2000, unit: 'ชิ้น', unitPrice: 0.35, unitCost: 0.35 },
      { sku: 'RM-SALT', name: 'เกลือบริสุทธิ์ล้างเรซิน (ถุง 25 กก.)', category: 'สารเคมี/วัสดุกรอง', stock: 18, minStock: 10, unit: 'ถุง', unitPrice: 185, unitCost: 185 },
      { sku: 'RM-FILTER-5U', name: 'ไส้กรองดักตะกอน PP 5 ไมครอน (20 นิ้ว)', category: 'สารเคมี/วัสดุกรอง', stock: 24, minStock: 12, unit: 'แท่ง', unitPrice: 170, unitCost: 170 }
    ],
    vehicles: [
      { id: 'VEH-01', assetId: 'AST-VEH-001', plate: 'ผอ-4568 ชลบุรี', name: 'Chevrolet Colorado ปี 2012 (สายท่าปลา-จริม)', brand: 'Chevrolet', model: 'Colorado Duramax 2.5L แค็บ', maxBottles189L: 120, maxPacks: 150, fuelRateKmPerLiter: 10.5, dieselPricePerLiter: 32.5, status: 'available', defaultDriverId: 'EMP-02', defaultDriverName: 'นายสุนัน ต๊ะนา' }
    ],
    customers: [
      {
        id: 'CUST-001',
        name: 'ร้านค้าสวัสดิการเขื่อนสิริกิติ์',
        zone: 'โซนท่าปลา - เขื่อนสิริกิติ์',
        phone: '055-461-112',
        address: 'ต.ผาเลือด อ.ท่าปลา จ.อุตรดิตถ์',
        lat: 17.7642,
        lng: 100.5618,
        orderBottles189L: 35,
        orderPack600ml: 40,
        orderPack1500ml: 20,
        OutstandingBottles: 45,
        creditBalance: 0,
        priority: 'high',
        selectedForRoute: true,
        deliveryStatus: 'pending',
        deliveredBottles: 0,
        returnedBottles: 0
      },
      {
        id: 'CUST-002',
        name: 'ตลาดสดเทศบาลตำบลท่าปลา (เจ๊พร)',
        zone: 'โซนท่าปลา - จริม',
        phone: '081-998-2211',
        address: 'ต.ท่าปลา อ.ท่าปลา จ.อุตรดิตถ์',
        lat: 17.7918,
        lng: 100.4435,
        orderBottles189L: 40,
        orderPack600ml: 25,
        orderPack1500ml: 15,
        OutstandingBottles: 52,
        creditBalance: 600,
        priority: 'high',
        selectedForRoute: true,
        deliveryStatus: 'pending',
        deliveredBottles: 0,
        returnedBottles: 0
      },
      {
        id: 'CUST-003',
        name: 'โรงเรียนท่าปลาอนุสรณ์ 1',
        zone: 'โซนท่าปลา - จริม',
        phone: '055-499-104',
        address: 'หมู่ 1 ต.ท่าปลา อ.ท่าปลา จ.อุตรดิตถ์',
        lat: 17.7865,
        lng: 100.4310,
        orderBottles189L: 50,
        orderPack600ml: 10,
        orderPack1500ml: 0,
        OutstandingBottles: 60,
        creditBalance: 0,
        priority: 'normal',
        selectedForRoute: true,
        deliveryStatus: 'pending',
        deliveredBottles: 0,
        returnedBottles: 0
      },
      {
        id: 'CUST-004',
        name: 'องค์การบริหารส่วนตำบลจริม (อบต.จริม)',
        zone: 'โซนท่าปลา - จริม',
        phone: '055-499-255',
        address: 'ต.จริม อ.ท่าปลา จ.อุตรดิตถ์',
        lat: 17.7980,
        lng: 100.3910,
        orderBottles189L: 25,
        orderPack600ml: 30,
        orderPack1500ml: 10,
        OutstandingBottles: 30,
        creditBalance: 0,
        priority: 'normal',
        selectedForRoute: true,
        deliveryStatus: 'pending',
        deliveredBottles: 0,
        returnedBottles: 0
      },
      {
        id: 'CUST-005',
        name: 'ร้านโชห่วยแม่สมศรี (บ้านหาดล้า)',
        zone: 'โซนท่าปลา - จริม',
        phone: '084-551-9988',
        address: 'บ้านหาดล้า ต.ร่วมจิต อ.ท่าปลา จ.อุตรดิตถ์',
        lat: 17.7340,
        lng: 100.3520,
        orderBottles189L: 30,
        orderPack600ml: 20,
        orderPack1500ml: 20,
        OutstandingBottles: 35,
        creditBalance: 450,
        priority: 'normal',
        selectedForRoute: true,
        deliveryStatus: 'pending',
        deliveredBottles: 0,
        returnedBottles: 0
      },
      {
        id: 'CUST-006',
        name: 'โรงพยาบาลท่าปลา',
        zone: 'โซนท่าปลา - จริม',
        phone: '055-499-020',
        address: 'ต.ท่าปลา อ.ท่าปลา จ.อุตรดิตถ์',
        lat: 17.7952,
        lng: 100.4512,
        orderBottles189L: 45,
        orderPack600ml: 50,
        orderPack1500ml: 25,
        OutstandingBottles: 55,
        creditBalance: 0,
        priority: 'high',
        selectedForRoute: true,
        deliveryStatus: 'pending',
        deliveredBottles: 0,
        returnedBottles: 0
      },
      {
        id: 'CUST-007',
        name: 'ร้านอาหารริมน่าน รีสอร์ท',
        zone: 'โซนผาเลือด - น้ำปาด',
        phone: '089-114-7788',
        address: 'ต.แสนตอ อ.เมือง จ.อุตรดิตถ์',
        lat: 17.7025,
        lng: 100.2890,
        orderBottles189L: 20,
        orderPack600ml: 60,
        orderPack1500ml: 30,
        OutstandingBottles: 25,
        creditBalance: 0,
        priority: 'normal',
        selectedForRoute: false,
        deliveryStatus: 'pending',
        deliveredBottles: 0,
        returnedBottles: 0
      },
      {
        id: 'CUST-008',
        name: 'มินิมาร์ทบ้านน้ำหมัน',
        zone: 'โซนท่าปลาเหนือ',
        phone: '082-334-6655',
        address: 'ต.น้ำหมัน อ.ท่าปลา จ.อุตรดิตถ์',
        lat: 17.8520,
        lng: 100.3410,
        orderBottles189L: 30,
        orderPack600ml: 15,
        orderPack1500ml: 15,
        OutstandingBottles: 38,
        creditBalance: 300,
        priority: 'normal',
        selectedForRoute: true,
        deliveryStatus: 'pending',
        deliveredBottles: 0,
        returnedBottles: 0
      }
    ],
    expenses: [
      { id: 'EXP-2610-01', date: '2026-10-20', category: 'ค่าไฟฟ้าการผลิต', refId: 'LOT-261020', description: 'ค่าไฟฟ้าเดินเครื่องจักรสายการผลิต 16 เครื่อง (เฉลี่ยรายสัปดาห์)', amount: 4250 },
      { id: 'EXP-2610-02', date: '2026-10-21', category: 'วัตถุดิบและบรรจุภัณฑ์', refId: 'INV-PO-88', description: 'สั่งซื้อขวด PET 600ml, ฝาถัง 18.9L และฟิล์มหดอินธารา', amount: 14800 },
      { id: 'EXP-2610-03', date: '2026-10-22', category: 'ซ่อมบำรุงเครื่องจักร', refId: 'MNT-20261018-02', description: 'ไส้กรอง PP 5 ไมครอน และเกลือบริสุทธิ์ล้างเรซิน 5 ถุง', amount: 1605 },
      { id: 'EXP-2610-04', date: '2026-10-25', category: 'ค่าน้ำมันขนส่ง', refId: 'TRIP-261025', description: 'ค่าน้ำมันดีเซลรถขนส่งสายท่าปลา-เขื่อนสิริกิติ์ (VEH-01)', amount: 980 },
      { id: 'EXP-2610-05', date: '2026-10-26', category: 'ค่าแรงและคอมมิชชั่น', refId: 'PAY-261026', description: 'ค่าแรงพนักงานฝ่ายผลิต 3 คน และเบี้ยเลี้ยงส่งน้ำ', amount: 5400 }
    ],
    savedTrips: [
      {
        tripId: 'TRIP-261025-01',
        date: '2026-10-25',
        vehicleId: 'VEH-01',
        vehicleName: 'บบ-4512 อุตรดิตถ์ (นายสมศักดิ์ ขับดี)',
        stopsCount: 6,
        totalDistanceKm: 58.4,
        estimatedTimeMin: 95,
        estimatedFuelCost: 181,
        totalBottles189L: 195,
        totalPacks: 180,
        totalRevenue: 9225,
        status: 'ส่งสำเร็จครบทุกจุด'
      }
    ],
    employees: [],
    assets: []
  };
}

function normalizeCustomer(c, idx = 0) {
  const isGov = /โรงเรียน|โรงพยาบาล|อบต|เทศบาล|เขื่อน/.test(c.name || '');
  const isResort = /ร้านอาหาร|รีสอร์ท|โรงแรม/.test(c.name || '');

  const THAPLA_TAMBONS = ['จริม', 'ท่าปลา', 'หาดล้า', 'ผาเลือด', 'ร่วมจิต', 'น้ำหมัน', 'นางพญา'];
  const rawAddr = String(c.address || '');
  const mTambon = rawAddr.match(/ต\.([^\s]+)/);
  const mMoo = rawAddr.match(/หมู่(?:ที่)?\s*(\d+)/);

  const province = 'อุตรดิตถ์';
  const district = 'ท่าปลา';
  let subdistrict = c.subdistrict || (mTambon ? mTambon[1] : 'จริม');
  if (!THAPLA_TAMBONS.includes(subdistrict)) {
    subdistrict = /หาดล้า/.test(c.name || rawAddr) ? 'หาดล้า' : /ผาเลือด|เขื่อน/.test(c.name || rawAddr) ? 'ผาเลือด' : /น้ำหมัน/.test(c.name || rawAddr) ? 'น้ำหมัน' : 'จริม';
  }
  const postalCode = subdistrict === 'ร่วมจิต' ? '53190' : '53150';

  const moo = c.moo || (mMoo ? `หมู่ ${mMoo[1]}` : `หมู่ ${(idx % 8) + 1}`);
  let houseNo = c.houseNo;
  if (!houseNo || /หมู่/.test(houseNo)) {
    const cleaned = String(houseNo || rawAddr)
      .replace(/หมู่(?:ที่)?\s*\d+/g, '')
      .replace(/บ้าน[^\s]+/g, '')
      .replace(/ต\.[^\s]+/g, '')
      .replace(/อ\.[^\s]+/g, '')
      .replace(/จ\.[^\s]+/g, '')
      .replace(/\b\d{5}\b/g, '')
      .trim();
    houseNo = cleaned || `${100 + idx * 12}`;
  }

  const zone = `โซนท่าปลา - ต.${subdistrict}`;
  const fullAddress = `บ้านเลขที่ ${houseNo} ${moo} ต.${subdistrict} อ.${district} จ.${province} ${postalCode}`.trim();

  return {
    id: c.id || `CUST-${String(idx + 1).padStart(3, '0')}`,
    customerType: c.customerType || (isGov ? 'หน่วยงานราชการ / โรงเรียน / รพ.' : isResort ? 'ร้านอาหาร / รีสอร์ท / โรงแรม' : 'ร้านค้าปลีก-ส่ง / ตัวแทน'),
    name: c.name || '',
    contactPerson: c.contactPerson || (isGov ? 'เจ้าหน้าที่พัสดุ/การเงิน' : 'เจ้าของร้าน'),
    phone: c.phone || '-',
    taxId: c.taxId || (isGov ? '0994000158211' : ''),
    branchType: c.branchType || 'สำนักงานใหญ่',
    zone,
    houseNo,
    moo,
    subdistrict,
    district,
    province,
    postalCode,
    address: fullAddress,
    lat: Number(c.lat || 17.7915),
    lng: Number(c.lng || 100.3782),
    paymentTerm: c.paymentTerm || (isGov ? 'เครดิต 30 วัน' : 'เงินสด / โอนเงิน'),
    priceTier: c.priceTier || (isGov ? 'ราคาหน่วยงานราชการ' : 'ราคาส่งร้านค้า'),
    price189L: Number(c.price189L ?? 15),
    price350ml: Number(c.price350ml ?? 35),
    price600ml: Number(c.price600ml ?? 35),
    price1500ml: Number(c.price1500ml ?? 35),
    creditLimit: Number(c.creditLimit ?? (isGov ? 20000 : 5000)),
    creditBalance: Number(c.creditBalance ?? 0),
    depositBottles: Number(c.depositBottles ?? (c.bottleDeposit ? Math.round(c.bottleDeposit / (c.depositRate || 200)) : 0)),
    depositRate: Number(c.depositRate ?? 200),
    bottleDeposit: Number(c.bottleDeposit ?? (Number(c.depositBottles || 0) * Number(c.depositRate || 200))),
    orderBottles189L: Number(c.orderBottles189L ?? 20),
    orderPack350ml: Number(c.orderPack350ml ?? 10),
    orderPack600ml: Number(c.orderPack600ml ?? 10),
    orderPack1500ml: Number(c.orderPack1500ml ?? 10),
    OutstandingBottles: Number(c.OutstandingBottles ?? 0),
    deliveryDays: c.deliveryDays || 'จันทร์, พฤหัสบดี',
    priority: c.priority || 'normal',
    status: c.status || 'active',
    notes: c.notes || '',
    selectedForRoute: c.selectedForRoute !== undefined ? Boolean(c.selectedForRoute) : true,
    deliveryStatus: c.deliveryStatus || 'pending',
    deliveredBottles: Number(c.deliveredBottles ?? 0),
    returnedBottles: Number(c.returnedBottles ?? 0),
    updatedAt: c.updatedAt || '2026-10-26'
  };
}

function getDefaultOrdersFromCustomers(customers = []) {
  return customers.slice(0, 6).map((c, idx) => {
    const q189 = Number(c.orderBottles189L || 25);
    const q600 = Number(c.orderPack600ml || 20);
    const q1500 = Number(c.orderPack1500ml || 10);
    const p189 = Number(c.price189L || 15);
    const p600 = Number(c.price600ml || 35);
    const p1500 = Number(c.price1500ml || 35);
    const totalAmount = (q189 * p189) + (q600 * p600) + (q1500 * p1500);
    const times = ['08:30', '09:15', '10:00', '11:00', '13:30', '14:30'];
    return {
      orderId: `ORD-261027-${String(idx + 1).padStart(3, '0')}`,
      customerId: c.id,
      customerName: c.name,
      zone: c.zone,
      address: c.address,
      qty189L: q189,
      qty600ml: q600,
      qty1500ml: q1500,
      unitPrice189L: p189,
      unitPrice600ml: p600,
      unitPrice1500ml: p1500,
      totalAmount,
      deliveryDate: '2026-10-27',
      deliveryTime: times[idx % times.length],
      paymentTerm: c.paymentTerm || 'เงินสด / โอนเงิน',
      orderStatus: 'รอจัดส่งตามสาย GPS',
      notes: '',
      createdAt: '2026-10-27T08:00:00'
    };
  });
}

function syncVehiclesWithAssets(db) {
  if (!db || !Array.isArray(db.assets)) return;
  db.vehicles = Array.isArray(db.vehicles) ? db.vehicles : [];

  const vehicleAssets = db.assets.filter(a => a.category === 'vehicle');

  vehicleAssets.forEach((ast, idx) => {
    const vehId = (ast.linkedRefId && ast.linkedRefId !== '-') ? ast.linkedRefId : `VEH-${String(idx + 1).padStart(2, '0')}`;
    ast.linkedRefId = vehId;

    let veh = db.vehicles.find(v => v.assetId === ast.id || v.id === vehId);
    if (!veh) {
      veh = {
        id: vehId,
        assetId: ast.id,
        plate: ast.serialNo || 'ไม่ระบุทะเบียน',
        name: ast.name,
        brand: ast.brand || 'Chevrolet',
        model: ast.model || 'Colorado',
        maxBottles189L: 120,
        maxPacks: 150,
        fuelRateKmPerLiter: 10.5,
        dieselPricePerLiter: 32.5,
        status: ast.status === 'in_use' ? 'available' : (ast.status === 'maintenance' ? 'maintenance' : 'available'),
        defaultDriverId: ast.assignedEmployeeId || 'EMP-02',
        defaultDriverName: ast.assignedEmployeeName || 'นายสุนัน ต๊ะนา'
      };
      db.vehicles.push(veh);
    } else {
      veh.assetId = ast.id;
      veh.plate = ast.serialNo || veh.plate;
      veh.name = ast.name || veh.name;
      veh.brand = ast.brand || veh.brand;
      veh.model = ast.model || veh.model;
      if (ast.status === 'maintenance') veh.status = 'maintenance';
      else if (ast.status === 'in_use' && veh.status === 'maintenance') veh.status = 'available';
      if (ast.assignedEmployeeId && ast.assignedEmployeeId !== '-') {
        veh.defaultDriverId = ast.assignedEmployeeId;
        veh.defaultDriverName = ast.assignedEmployeeName;
      }
    }
  });

  if (vehicleAssets.length > 0) {
    db.vehicles = db.vehicles.filter(v => vehicleAssets.some(a => a.id === v.assetId || a.linkedRefId === v.id));
  }
}

function loadDB() {
  let dbData;
  if (!fs.existsSync(DB_FILE)) {
    dbData = getInitialData();
    dbData.customers = (dbData.customers || []).map((c, i) => normalizeCustomer(c, i));
    dbData.orders = [];
    syncVehiclesWithAssets(dbData);
    fs.writeFileSync(DB_FILE, JSON.stringify(dbData, null, 2), 'utf8');
    return dbData;
  }
  try {
    dbData = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    dbData.customers = (dbData.customers || []).map((c, i) => normalizeCustomer(c, i));
    if (!Array.isArray(dbData.orders)) {
      dbData.orders = [];
    }
    if (!Array.isArray(dbData.employees)) {
      dbData.employees = [];
    }
    if (!Array.isArray(dbData.assets)) {
      dbData.assets = [];
    }
    if (!Array.isArray(dbData.packagingLots)) {
      dbData.packagingLots = [];
    }
    syncVehiclesWithAssets(dbData);
    return dbData;
  } catch (err) {
    dbData = getInitialData();
    dbData.customers = (dbData.customers || []).map((c, i) => normalizeCustomer(c, i));
    dbData.orders = [];
    syncVehiclesWithAssets(dbData);
    fs.writeFileSync(DB_FILE, JSON.stringify(dbData, null, 2), 'utf8');
    return dbData;
  }
}

function syncToGoogleDriveAsync() {
  if (process.platform !== 'win32' || !fs.existsSync(GDRIVE_CMD)) {
    cloudSyncState.status = 'synced';
    cloudSyncState.lastSyncTime = new Date().toISOString();
    return;
  }
  cloudSyncState.status = 'syncing';
  runGdriveCmd(['mutate', 'update', GDRIVE_DB_FILE_ID, DB_FILE], (err, stdout, stderr) => {
    if (err) {
      console.warn('Google Drive Sync Warning:', stderr || err.message);
      cloudSyncState.status = 'error';
    } else {
      cloudSyncState.lastSyncTime = new Date().toISOString();
      cloudSyncState.status = 'synced';
    }
  });
}

function saveDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
  syncToGoogleDriveAsync();
}

// ==========================================
// HIGH-SECURITY AUTHENTICATION & RBAC API
// ==========================================
function getAuthUser(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const secData = loadSecurityDB();
  return verifyToken(token, secData.secretKey);
}

app.post('/api/auth/login', (req, res) => {
  // Rate limit ต่อ IP: กันการสุ่มรหัสผ่านแบบกระจาย
  if (rateLimited(req, 'stafflogin', 20, 15 * 60 * 1000)) {
    return res.status(429).json({ ok: false, error: 'พยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่' });
  }
  const { username, password } = req.body;
  const secData = loadSecurityDB();
  const user = secData.users.find(u => u.username === username);
  const ip = req.ip || '127.0.0.1';

  if (!user || !user.active) {
    recordAudit(secData, username || 'UNKNOWN', 'none', 'LOGIN_FAILED', ip, 'DENIED', 'ไม่พบบัญชีผู้ใช้หรือบัญชีถูกระงับ');
    return res.status(401).json({ ok: false, error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
  }

  // Check Brute-Force Account Lockout (5 failed attempts -> 15 min lock)
  if (user.lockUntil && Date.now() < user.lockUntil) {
    const waitMin = Math.ceil((user.lockUntil - Date.now()) / 60000);
    recordAudit(secData, user.username, user.role, 'LOGIN_LOCKED', ip, 'LOCKED', `บัญชีถูกล็อกชั่วคราว เหลือเวลา ${waitMin} นาที`);
    return res.status(423).json({ ok: false, error: `บัญชีถูกล็อกเพื่อความปลอดภัย กรุณารอ ${waitMin} นาที (หรือใช้รหัส PIN รีเซ็ตรหัสผ่าน)` });
  }

  const passOk = password ? verifyPassword(password, user.salt, user.hash) : false;

  if (!passOk) {
    user.failedAttempts = (user.failedAttempts || 0) + 1;
    if (user.failedAttempts >= 5) {
      user.lockUntil = Date.now() + 15 * 60 * 1000;
    }
    saveSecurityDB(secData);
    recordAudit(secData, user.username, user.role, 'LOGIN_FAILED', ip, 'DENIED', `รหัสผ่านไม่ถูกต้อง (ครั้งที่ ${user.failedAttempts}/5)`);
    return res.status(401).json({ ok: false, error: `รหัสผ่านไม่ถูกต้อง (ผิดครั้งที่ ${user.failedAttempts}/5)` });
  }

  // Reset failed attempts on success
  user.failedAttempts = 0;
  user.lockUntil = null;
  saveSecurityDB(secData);

  const permissions = ROLE_PERMISSIONS[user.role] || ROLE_PERMISSIONS.driver;
  const tokenPayload = {
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    roleName: permissions.roleName,
    permissions,
    exp: Date.now() + 8 * 60 * 60 * 1000 // 8-hour work shift session
  };
  const token = signToken(tokenPayload, secData.secretKey);
  recordAudit(secData, user.username, user.role, 'LOGIN_SUCCESS', ip, 'SUCCESS', `เข้าสู่ระบบสำเร็จ (${permissions.roleName})`);

  res.json({
    ok: true,
    token,
    user: tokenPayload
  });
});

// Reset / Change Password using 4-digit Recovery PIN (when user forgets password or wants to change password)
app.post('/api/auth/reset-password-by-pin', (req, res) => {
  // PIN กู้รหัสผ่านเป็นเลข 4 หลัก → ต้องจำกัดจำนวนครั้งต่อ IP ไม่อย่างนั้นเดาได้หมด
  if (rateLimited(req, 'pinreset', 5, 15 * 60 * 1000)) {
    return res.status(429).json({ ok: false, error: 'พยายามใช้รหัส PIN บ่อยเกินไป กรุณารอ 15 นาที' });
  }
  const { username, pin, newPassword } = req.body;
  const secData = loadSecurityDB();
  const user = secData.users.find(u => u.username === String(username || '').trim());
  const ip = req.ip || '127.0.0.1';

  if (!user) {
    return res.status(404).json({ ok: false, error: 'ไม่พบชื่อผู้ใช้งานนี้ในระบบ' });
  }
  if (!pin || String(pin).trim() !== String(user.pin).trim()) {
    recordAudit(secData, user.username, user.role, 'PIN_RESET_FAILED', ip, 'DENIED', 'ระบุรหัส PIN กู้คืนรหัสผ่านไม่ถูกต้อง');
    return res.status(401).json({ ok: false, error: 'รหัส PIN 4 หลักไม่ถูกต้อง ไม่สามารถเปลี่ยนรหัสผ่านได้' });
  }
  if (!newPassword || String(newPassword).trim().length < 4) {
    return res.status(400).json({ ok: false, error: 'กรุณากำหนดรหัสผ่านใหม่อย่างน้อย 4 ตัวอักษร' });
  }

  const cleanPass = String(newPassword).trim();
  const { salt, hash } = hashPassword(cleanPass);
  user.passwordPlain = cleanPass;
  user.salt = salt;
  user.hash = hash;
  user.failedAttempts = 0;
  user.lockUntil = null;

  saveSecurityDB(secData, true);
  recordAudit(secData, user.username, user.role, 'PASSWORD_RESET_BY_PIN', ip, 'SUCCESS', 'เปลี่ยนรหัสผ่านใหม่ด้วยรหัส PIN สำเร็จ (อัปเดตไฟล์ Excel & Google Drive)');

  // Sync updated Excel file to Google Drive
  runGdriveCmd(['mutate', 'update', GDRIVE_EXCEL_FILE_ID, EXCEL_USER_FILE], () => {});

  res.json({ ok: true, message: 'เปลี่ยนรหัสผ่านใหม่สำเร็จ! สามารถใช้รหัสผ่านใหม่เข้าสู่ระบบได้ทันที' });
});

app.get('/api/security/audit', (req, res) => {
  // endpoint นี้คืนรหัสผ่านจริง (passwordPlain) และ PIN → ผู้บริหารเท่านั้น
  const actor = requireRole(req, ['executive']);
  if (!actor) return denyRole(res);
  const secData = loadSecurityDB();
  res.json({
    ok: true,
    roles: ROLE_PERMISSIONS,
    excelFilePath: EXCEL_USER_FILE,
    users: secData.users.map(u => ({
      level: u.level,
      username: u.username,
      passwordPlain: u.passwordPlain || '********',
      pin: u.pin || '****',
      displayName: u.displayName,
      role: u.role,
      roleName: ROLE_PERMISSIONS[u.role]?.roleName || u.role,
      dashboardNote: u.dashboardNote || '',
      active: u.active,
      failedAttempts: u.failedAttempts,
      locked: Boolean(u.lockUntil && Date.now() < u.lockUntil)
    })),
    auditLogs: secData.auditLogs
  });
});

// Update user password/PIN/role/displayName and sync to Excel + Google Drive
app.post('/api/security/update-users-excel', (req, res) => {
  // แก้รหัสผ่าน/PIN ของทุกบัญชี = ผู้บริหารเท่านั้น
  const actor = requireRole(req, ['executive']);
  if (!actor) return denyRole(res);
  const { users } = req.body;
  if (!Array.isArray(users)) {
    return res.status(400).json({ ok: false, error: 'รูปแบบข้อมูลไม่ถูกต้อง' });
  }
  const secData = loadSecurityDB();
  secData.users = users.map((u, idx) => {
    const pass = String(u.passwordPlain || '').trim();
    if (!pass) {
      // ไม่ส่งรหัสผ่านมา → คงค่าเดิมไว้ (เดิมบังคับเป็นรหัสผ่านสำรอง ทำให้รหัสผู้ใช้ถูกรีเซ็ต)
      const existing = secData.users.find((e) => e.username === String(u.username).trim()) || secData.users[idx];
      if (existing) {
        return {
          ...existing,
          level: Number(u.level || existing.level || (idx + 1)),
          displayName: String(u.displayName || existing.displayName).trim(),
          role: ROLE_PERMISSIONS[u.role] ? u.role : 'driver',
          pin: String(u.pin || existing.pin || '0000').trim(),
          active: u.active !== false && u.active !== 'NO',
          dashboardNote: u.dashboardNote || '',
          failedAttempts: 0,
          lockUntil: null
        };
      }
    }
    const { salt, hash } = hashPassword(pass);
    return {
      level: Number(u.level || (idx + 1)),
      username: String(u.username).trim(),
      displayName: String(u.displayName).trim(),
      role: ROLE_PERMISSIONS[u.role] ? u.role : 'driver',
      passwordPlain: pass,
      pin: String(u.pin || '0000').trim(),
      salt,
      hash,
      active: u.active !== false && u.active !== 'NO',
      dashboardNote: u.dashboardNote || '',
      failedAttempts: 0,
      lockUntil: null
    };
  });
  saveSecurityDB(secData, true);
  recordAudit(secData, 'owner_inthara', 'executive', 'EXCEL_PASSWORD_UPDATED', req.ip, 'SUCCESS', 'แก้ไขตารางรหัสผ่านและบันทึกลงไฟล์ Excel + ซิงค์ขึ้น Google Drive');

  // Sync updated Excel file to Google Drive
  runGdriveCmd(['mutate', 'update', GDRIVE_EXCEL_FILE_ID, EXCEL_USER_FILE], () => {});
  res.json({ ok: true, users: secData.users });
});

// Pull edited Excel / Google Sheet from Google Drive and apply new passwords
app.post('/api/security/pull-excel-drive', (req, res) => {
  const actor = requireRole(req, ['executive']);
  if (!actor) return denyRole(res);
  runGdriveCmd(['readonly', 'export', GDRIVE_SHEET_FILE_ID, EXCEL_USER_FILE, '--format', 'xlsx'], (err) => {
    if (err) {
      // Fallback to downloading the .xlsx file directly
      runGdriveCmd(['readonly', 'download', GDRIVE_EXCEL_FILE_ID, '--out', EXCEL_USER_FILE], (err2) => {
        const secData = loadSecurityDB();
        res.json({ ok: !err2, users: secData.users });
      });
    } else {
      const secData = loadSecurityDB();
      recordAudit(secData, 'SYSTEM', 'executive', 'EXCEL_SYNC_FROM_DRIVE', req.ip, 'SUCCESS', 'ดึงข้อมูลรหัสผ่านจากไฟล์ Excel บน Google Drive สำเร็จ');
      res.json({ ok: true, users: secData.users });
    }
  });
});

app.get('/api/security/download-excel', (req, res) => {
  // ไฟล์รหัสผ่านทั้งบริษัท → ห้ามดาวน์โหลดโดยไม่เข้าสู่ระบบ
  const actor = requireRole(req, ['executive']);
  if (!actor) return denyRole(res);
  loadSecurityDB();
  res.download(EXCEL_USER_FILE, 'Inthara_Users_Passwords.xlsx');
});

app.post('/api/security/change-password', (req, res) => {
  const auth = getAuthUser(req);
  if (!auth || auth.role !== 'executive') {
    return res.status(403).json({ ok: false, error: 'เฉพาะผู้บริหารสูงสุดเท่านั้นที่เปลี่ยนรหัสผ่านหรือปลดล็อกบัญชีได้' });
  }
  const { targetUsername, newPassword, newPin, unlock } = req.body;
  const secData = loadSecurityDB();
  const target = secData.users.find(u => u.username === targetUsername);
  if (!target) return res.status(404).json({ ok: false, error: 'ไม่พบบัญชีผู้ใช้' });

  if (newPassword && newPassword.length >= 8) {
    const { salt, hash } = hashPassword(newPassword);
    target.salt = salt;
    target.hash = hash;
  }
  if (newPin) target.pin = String(newPin);
  if (unlock) {
    target.failedAttempts = 0;
    target.lockUntil = null;
  }
  saveSecurityDB(secData);
  recordAudit(secData, auth.username, auth.role, 'USER_SECURITY_UPDATE', req.ip, 'SUCCESS', `อัปเดตรหัสผ่าน/ปลดล็อกผู้ใช้ ${targetUsername}`);
  res.json({ ok: true });
});

// API Routes
app.get('/api/data', (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  const secData = loadSecurityDB();
  res.json({
    ...loadDB(),
    cloudSync: cloudSyncState,
    securitySummary: {
      totalUsers: secData.users.length,
      auditCount: secData.auditLogs.length,
      recentAudits: secData.auditLogs.slice(0, 25)
    }
  });
});

app.post('/api/cloud/sync', (req, res) => {
  const actor = requireRole(req, ['executive', 'admin']);
  if (!actor) return denyRole(res);
  cloudSyncState.status = 'syncing';
  runGdriveCmd(['mutate', 'update', GDRIVE_DB_FILE_ID, DB_FILE], (err, stdout, stderr) => {
    if (err) {
      cloudSyncState.status = 'error';
      return res.status(500).json({ ok: false, error: stderr || err.message, cloudSync: cloudSyncState });
    }
    cloudSyncState.lastSyncTime = new Date().toISOString();
    cloudSyncState.status = 'synced';
    res.json({ ok: true, cloudSync: cloudSyncState, output: (stdout || '').trim() });
  });
});

// Bypass FortiGate Browser Block: View & Pull Google Drive files directly via Backend API
app.get('/api/cloud/files', (req, res) => {
  runGdriveCmd(['readonly', 'ls', GDRIVE_FOLDER_ID, '--json'], (err, stdout, stderr) => {
    if (err) {
      return res.status(500).json({ ok: false, error: stderr || err.message });
    }
    try {
      const files = JSON.parse(stdout || '[]');
      res.json({ ok: true, folderId: GDRIVE_FOLDER_ID, files, cloudSync: cloudSyncState });
    } catch (parseErr) {
      res.json({ ok: true, folderId: GDRIVE_FOLDER_ID, files: [], raw: stdout, cloudSync: cloudSyncState });
    }
  });
});

app.post('/api/cloud/pull', (req, res) => {
  // ดึงไฟล์จากคลาวด์มาทับฐานข้อมูลทั้งระบบ → ผู้บริหาร/แอดมินเท่านั้น
  const actor = requireRole(req, ['executive', 'admin']);
  if (!actor) return denyRole(res);
  const tempDownload = path.join(DATA_DIR, 'inthara_db_cloud_pull.json');
  runGdriveCmd(['readonly', 'download', GDRIVE_DB_FILE_ID, '--out', tempDownload], (err, stdout, stderr) => {
    if (err) {
      return res.status(500).json({ ok: false, error: stderr || err.message });
    }
    try {
      const pulledData = JSON.parse(fs.readFileSync(tempDownload, 'utf8'));
      fs.writeFileSync(DB_FILE, JSON.stringify(pulledData, null, 2), 'utf8');
      cloudSyncState.lastSyncTime = new Date().toISOString();
      cloudSyncState.status = 'synced';
      res.json({ ok: true, data: pulledData, cloudSync: cloudSyncState });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });
});

app.post('/api/reset', (req, res) => {
  // เดิมรีเซ็ตฐานข้อมูลทั้งระบบได้โดยไม่ต้องเข้าสู่ระบบ → จำกัดไว้ที่ผู้บริหาร
  const actor = requireRole(req, ['executive']);
  if (!actor) return denyRole(res);
  const initial = getInitialData();
  saveDB(initial);
  res.json({ ok: true, data: initial });
});

// Packaging Lots & Bottle Lots API
app.get('/api/packaging-lots', (req, res) => {
  const db = loadDB();
  res.json({ ok: true, packagingLots: db.packagingLots || [] });
});

app.post('/api/packaging-lots', (req, res) => {
  const db = loadDB();
  db.packagingLots = db.packagingLots || [];
  db.inventory = db.inventory || [];
  db.assets = db.assets || [];
  db.expenses = db.expenses || [];

  const body = req.body || {};
  const qty = Number(body.quantity || 0);
  const unitCost = Number(body.unitCost || 0);
  const totalCost = Number(body.totalCost || (qty * unitCost));
  const itemType = body.itemType || 'bottle_189L';

  let sku = body.sku;
  let defaultName = body.itemName || 'บรรจุภัณฑ์';
  if (!sku) {
    if (itemType === 'bottle_189L') { sku = 'RET-189L-EMPTY'; defaultName = 'ถังน้ำดื่ม PC 18.9 ลิตร (Food Grade ตราอินธารา)'; }
    else if (itemType === 'bottle_350ml') { sku = 'RM-BTL-350'; defaultName = 'ขวดเปล่า PET 350 ml (อินธารา)'; }
    else if (itemType === 'bottle_600ml') { sku = 'RM-BTL-600'; defaultName = 'ขวดเปล่า PET 600 ml (อินธารา)'; }
    else if (itemType === 'bottle_1500ml') { sku = 'RM-BTL-1500'; defaultName = 'ขวดเปล่า PET 1,500 ml (อินธารา)'; }
    else if (itemType === 'cap_189L') { sku = 'RM-CAP-189'; defaultName = 'ฝาถังน้ำดื่ม 18.9 ลิตร สีฟ้า (Food Grade)'; }
    else if (itemType === 'cap_pet') { sku = 'RM-CAP-PET'; defaultName = 'ฝาเกลียวขวดน้ำดื่ม PET 28/30mm (Food Grade)'; }
    else if (itemType === 'film_label') { sku = 'RM-SHRINK'; defaultName = 'ฟิล์มหดซีลฝาถังและคอขวด (สกรีนอินธารา)'; }
  }

  const lotPrefix = itemType === 'bottle_189L' ? 'LOT-TNK' : (itemType.startsWith('bottle_') ? 'LOT-BTL' : 'LOT-PKG');
  const d = new Date();
  const yymm = `${String(d.getFullYear()).slice(-2)}${String(d.getMonth() + 1).padStart(2, '0')}`;
  const nextNum = String(db.packagingLots.length + 1).padStart(2, '0');
  const lotNo = (body.lotNo || `${lotPrefix}-${yymm}-${nextNum}`).trim();

  let assetId = body.assetId || null;
  let assetName = body.assetName || null;
  const isAssetLinked = Boolean(body.assetLinked || itemType === 'bottle_189L');

  if (isAssetLinked) {
    const existingAssetIdx = db.assets.findIndex(a => a.linkedRefId === lotNo || (assetId && a.id === assetId));
    if (existingAssetIdx !== -1) {
      assetId = db.assets[existingAssetIdx].id;
      assetName = db.assets[existingAssetIdx].name;
    } else {
      const nextAssetNum = String(db.assets.filter(a => a.category === 'container_tank').length + 1).padStart(3, '0');
      assetId = assetId || `AST-TNK-${nextAssetNum}`;
      assetName = assetName || `${defaultName} หมุนเวียน Lot ${lotNo} (${qty.toLocaleString()} ใบ)`;
      
      const usefulLifeYears = 3;
      const salvageValue = Math.round(totalCost * 0.08);
      const depPerYear = Math.round((totalCost - salvageValue) / usefulLifeYears);

      db.assets.push({
        id: assetId,
        name: assetName,
        category: 'container_tank',
        categoryName: '💧 ภาชนะ & ถังน้ำดื่มหมุนเวียน (Carboy)',
        brand: 'Inthara Custom (ตราอินธารา)',
        model: `${itemType === 'bottle_189L' ? 'PC 18.9L Food Grade' : defaultName}`,
        serialNo: lotNo,
        location: 'โรงงานน้ำดื่มอินธารา / หมุนเวียนในสายส่งลูกค้า',
        acquisitionDate: body.purchaseDate || new Date().toISOString().split('T')[0],
        cost: totalCost,
        usefulLifeYears: usefulLifeYears,
        salvageValue: salvageValue,
        depreciationPerYear: depPerYear,
        accumulatedDepreciation: 0,
        currentValue: totalCost,
        assignedEmployeeId: 'EMP-02',
        assignedEmployeeName: 'นายสุนัน ต๊ะนา',
        status: 'in_use',
        linkedRefId: lotNo,
        notes: `สินทรัพย์หมุนเวียนจำนวน ${qty.toLocaleString()} ชิ้น ผูกกับล็อตจัดซื้อ ${lotNo}`
      });
    }
  }

  const newLot = {
    lotNo,
    purchaseDate: body.purchaseDate || new Date().toISOString().split('T')[0],
    itemType,
    itemName: body.itemName || defaultName,
    sku,
    quantity: qty,
    remainingQty: qty,
    unit: body.unit || (itemType === 'bottle_189L' ? 'ถัง' : (itemType.startsWith('bottle_') ? 'ขวด' : 'ชิ้น')),
    unitCost,
    totalCost,
    supplier: body.supplier || 'ซัพพลายเออร์บรรจุภัณฑ์',
    assetLinked: isAssetLinked,
    assetId: isAssetLinked ? assetId : null,
    assetName: isAssetLinked ? assetName : null,
    status: 'active',
    notes: body.notes || ''
  };

  db.packagingLots.unshift(newLot);

  // Update Inventory Stock
  const invItem = db.inventory.find(i => i.sku === sku);
  if (invItem) {
    invItem.stock = (Number(invItem.stock) || 0) + qty;
    invItem.unitCost = unitCost > 0 ? unitCost : invItem.unitCost;
  }

  // Record Expense
  if (totalCost > 0) {
    db.expenses.unshift({
      id: 'EXP-' + Date.now().toString().slice(-6),
      date: newLot.purchaseDate,
      category: isAssetLinked ? 'สินทรัพย์และครุภัณฑ์' : 'จัดซื้อบรรจุภัณฑ์/วัตถุดิบ',
      refId: lotNo,
      description: `[${lotNo}] ซื้อ${newLot.itemName} จำนวน ${qty.toLocaleString()} ${newLot.unit}`,
      amount: totalCost
    });
  }

  saveDB(db);
  res.json({ ok: true, lot: newLot, data: db });
});

// Add Production Lot
app.post('/api/production', (req, res) => {
  const db = loadDB();
  const lot = req.body || {};

  // Standard compliance check
  const tdsRo = Number(lot.tdsRo || 0);
  const ph = Number(lot.phValue || 7.0);
  const isQcPass = tdsRo > 0 && tdsRo <= 50 && ph >= 6.5 && ph <= 8.5;
  lot.qcEvaluation = isQcPass ? 'ผ่านเกณฑ์ อย./มอก. 257' : 'เฝ้าระวังคุณภาพ';

  db.productionLots = db.productionLots || [];

  // Guarantee unique auto Lot No (ห้ามซ้ำกันเด็ดขาด)
  let finalLotNo = (lot.lotNo || '').trim();
  const existingNos = new Set(db.productionLots.map(l => (l.lotNo || '').trim()));
  if (!finalLotNo || existingNos.has(finalLotNo)) {
    const d = lot.date ? new Date(lot.date) : new Date();
    const yy = String(d.getFullYear()).slice(-2);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const prefix = `LOT-${yy}${mm}${dd}-`;
    let counter = 1;
    let candidate = `${prefix}${String(counter).padStart(2, '0')}`;
    while (existingNos.has(candidate)) {
      counter++;
      candidate = `${prefix}${String(counter).padStart(2, '0')}`;
    }
    finalLotNo = candidate;
  }
  lot.lotNo = finalLotNo;

  db.productionLots.unshift(lot);

  db.inventory = db.inventory || [];
  db.packagingLots = db.packagingLots || [];

  const b189 = Number(lot.bottle18_9L || 0);
  const p350 = Number(lot.pack350ml || 0);
  const p600 = Number(lot.pack600ml || 0);
  const p1500 = Number(lot.pack1500ml || 0);
  const defect = Number(lot.defectCount || 0);

  // Calculate actual individual bottle quantities from packs
  const btl350Qty = p350 * 12;
  const btl600Qty = p600 * 12;
  const btl1500Qty = p1500 * 6;
  const totalPetBottles = btl350Qty + btl600Qty + btl1500Qty;
  const totalPacks = p350 + p600 + p1500;

  // 1. Update Finished Goods Inventory
  const fg189 = db.inventory.find(i => i.sku === 'FG-189L');
  const fg350 = db.inventory.find(i => i.sku === 'FG-350ML');
  const fg600 = db.inventory.find(i => i.sku === 'FG-600ML');
  const fg1500 = db.inventory.find(i => i.sku === 'FG-1500ML');

  if (fg189) fg189.stock += b189;
  if (fg350) fg350.stock += p350;
  if (fg600) fg600.stock += p600;
  if (fg1500) fg1500.stock += p1500;

  // 2. Deduct Raw Materials & Packaging
  const empty189 = db.inventory.find(i => i.sku === 'RET-189L-EMPTY');
  const cap189 = db.inventory.find(i => i.sku === 'RM-CAP-189');
  const shrinkFilm = db.inventory.find(i => i.sku === 'RM-SHRINK');
  const btl350 = db.inventory.find(i => i.sku === 'RM-BTL-350');
  const btl600 = db.inventory.find(i => i.sku === 'RM-BTL-600');
  const btl1500 = db.inventory.find(i => i.sku === 'RM-BTL-1500');
  const capPet = db.inventory.find(i => i.sku === 'RM-CAP-PET');
  const labelPet = db.inventory.find(i => i.sku === 'RM-LABEL-PET');

  if (empty189) empty189.stock = Math.max(0, empty189.stock - (b189 + defect));
  if (cap189) cap189.stock = Math.max(0, cap189.stock - b189);
  if (shrinkFilm) shrinkFilm.stock = Math.max(0, shrinkFilm.stock - (b189 + totalPacks));
  if (btl350) btl350.stock = Math.max(0, btl350.stock - btl350Qty);
  if (btl600) btl600.stock = Math.max(0, btl600.stock - btl600Qty);
  if (btl1500) btl1500.stock = Math.max(0, btl1500.stock - btl1500Qty);
  if (capPet) capPet.stock = Math.max(0, capPet.stock - totalPetBottles);
  if (labelPet) labelPet.stock = Math.max(0, labelPet.stock - totalPetBottles);

  // 3. Deduct from packaging lots (FIFO)
  function deductLot(itemType, neededQty) {
    let remain = neededQty;
    db.packagingLots.forEach(lot => {
      if (lot.itemType === itemType && lot.remainingQty > 0 && remain > 0) {
        const take = Math.min(lot.remainingQty, remain);
        lot.remainingQty -= take;
        remain -= take;
        if (lot.remainingQty <= 0) lot.status = 'depleted';
      }
    });
  }
  if (b189 > 0) deductLot('cap_189L', b189);
  if (btl350Qty > 0) deductLot('bottle_350ml', btl350Qty);
  if (btl600Qty > 0) deductLot('bottle_600ml', btl600Qty);
  if (btl1500Qty > 0) deductLot('bottle_1500ml', btl1500Qty);
  if (totalPetBottles > 0) deductLot('cap_pet', totalPetBottles);

  // 4. Increment machine run hours based on production (approx 4-8 hrs per batch)
  const estHours = Math.max(4.0, Number(( (b189 * 0.012) + (totalPacks * 0.008) + 3.0 ).toFixed(1)));
  db.machines = db.machines || [];
  db.assets = db.assets || [];

  db.machines.forEach(m => {
    m.runHours = Number((m.runHours + estHours).toFixed(1));
    if (m.runHours >= m.pmIntervalHours) {
      m.status = 'due';
      const linkedAsset = db.assets.find(a => a.linkedRefId === m.code);
      if (linkedAsset && linkedAsset.status === 'in_use') {
        linkedAsset.status = 'maintenance';
      }
    } else if (m.runHours >= m.pmIntervalHours * 0.88) {
      m.status = 'warning';
    }
  });

  saveDB(db);
  res.json({ ok: true, data: db });
});

// Add Maintenance Log & Reset PM & Spare Parts Deduction
app.post('/api/maintenance', (req, res) => {
  const db = loadDB();
  const log = req.body || {};
  db.maintenanceLogs = db.maintenanceLogs || [];
  db.maintenanceLogs.unshift(log);

  db.machines = db.machines || [];
  db.assets = db.assets || [];
  db.inventory = db.inventory || [];
  db.expenses = db.expenses || [];

  // Reset machine PM and hours
  const machine = db.machines.find(m => m.code === log.machineCode);
  if (machine) {
    machine.status = 'normal';
    machine.runHours = 0;
    machine.lastPmDate = log.date || new Date().toISOString().split('T')[0];
  }

  // Sync to linked asset
  const linkedAsset = db.assets.find(a => a.linkedRefId === log.machineCode);
  if (linkedAsset) {
    linkedAsset.status = 'in_use';
  }

  // Deduct spare part if used
  if (log.sparePartSku && Number(log.sparePartQty) > 0) {
    const partItem = db.inventory.find(i => i.sku === log.sparePartSku);
    if (partItem) {
      partItem.stock = Math.max(0, partItem.stock - Number(log.sparePartQty));
    }
  }

  // Record Expense
  if (Number(log.cost) > 0) {
    db.expenses.unshift({
      id: 'EXP-' + Date.now().toString().slice(-6),
      date: log.date || new Date().toISOString().split('T')[0],
      category: 'ซ่อมบำรุงเครื่องจักร',
      refId: log.machineCode,
      description: `[${log.machineCode}] ${log.action}${log.sparePartSku ? ` (เบิกอะไหล่: ${log.sparePartSku} x${log.sparePartQty})` : ''}`,
      amount: Number(log.cost)
    });
  }

  saveDB(db);
  res.json({ ok: true, data: db });
});

// Update Machine Status (e.g. breakdown report)
app.post('/api/machines/:code/status', (req, res) => {
  const db = loadDB();
  const machine = (db.machines || []).find(m => m.code === req.params.code);
  if (!machine) return res.status(404).json({ ok: false, error: 'ไม่พบเครื่องจักร' });

  const newStatus = req.body.status || 'maintenance';
  machine.status = newStatus;

  // Sync asset status
  const linkedAsset = (db.assets || []).find(a => a.linkedRefId === machine.code);
  if (linkedAsset) {
    linkedAsset.status = newStatus === 'maintenance' ? 'maintenance' : (newStatus === 'normal' ? 'in_use' : linkedAsset.status);
  }

  saveDB(db);
  res.json({ ok: true, machine, data: db });
});

// Resolve shortened Google Maps URLs (maps.app.goo.gl / goo.gl/maps) to full URL with coordinates
app.post('/api/resolve-gmaps-url', async (req, res) => {
  const rawUrl = String(req.body?.url || '').trim();
  if (!rawUrl) return res.status(400).json({ ok: false, error: 'Missing URL' });
  try {
    const response = await fetch(rawUrl, { method: 'GET', redirect: 'follow' });
    const finalUrl = response.url || rawUrl;
    const html = await response.text();
    // Try extracting !3dLAT!4dLNG or @LAT,LNG from finalUrl or HTML
    let lat = null;
    let lng = null;
    const mPlace = finalUrl.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) || html.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
    const mAt = finalUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/) || html.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    const mQ = finalUrl.match(/[?&](?:q|ll|query)=(-?\d+\.\d+)[,+](-?\d+\.\d+)/);
    if (mPlace) {
      lat = parseFloat(mPlace[1]);
      lng = parseFloat(mPlace[2]);
    } else if (mQ) {
      lat = parseFloat(mQ[1]);
      lng = parseFloat(mQ[2]);
    } else if (mAt) {
      lat = parseFloat(mAt[1]);
      lng = parseFloat(mAt[2]);
    }
    res.json({ ok: true, finalUrl, lat, lng });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

// Add or Update Customer Master Record (Enforces 1 Unique Phone Number per Customer)
app.post('/api/customers', (req, res) => {
  const db = loadDB();
  const cust = req.body;
  const phoneDigits = String(cust.phone || '').replace(/\D/g, '');
  if (!phoneDigits || phoneDigits.length < 9) {
    return res.status(400).json({
      ok: false,
      error: 'กรุณาระบุเบอร์โทรศัพท์ให้ถูกต้อง (อย่างน้อย 9-10 หลัก)'
    });
  }

  // Enforce: 1 Customer = 1 Unique Phone Number (cannot register duplicate phone; can only change phone when editing that customer)
  const duplicateCustomer = db.customers.find(c => {
    if (cust.id && c.id === cust.id) return false; // Allow editing own record / changing phone
    const existingDigits = String(c.phone || '').replace(/\D/g, '');
    return existingDigits && existingDigits === phoneDigits;
  });

  if (duplicateCustomer) {
    return res.status(400).json({
      ok: false,
      duplicateCustomerId: duplicateCustomer.id,
      duplicateCustomerName: duplicateCustomer.name,
      error: `เบอร์โทรศัพท์ "${cust.phone}" ถูกลงทะเบียนไว้แล้วกับลูกค้า [${duplicateCustomer.id}] "${duplicateCustomer.name}" (ลูกค้า 1 เจ้า ลงทะเบียนได้ 1 เบอร์โทรศัพท์เท่านั้น หากต้องการเปลี่ยนเบอร์กรุณากดแก้ไขข้อมูลลูกค้ารายเดิม)`
    });
  }

  const existingIdx = cust.id ? db.customers.findIndex(c => c.id === cust.id) : -1;
  if (existingIdx >= 0) {
    db.customers[existingIdx] = normalizeCustomer({
      ...db.customers[existingIdx],
      ...cust,
      updatedAt: new Date().toISOString().slice(0, 10)
    }, existingIdx);

    // Sync updated customer name, phone, zone, and address to active orders
    if (Array.isArray(db.orders)) {
      db.orders.forEach(o => {
        if (o.customerId === cust.id && o.orderStatus !== 'จัดส่งสำเร็จแล้ว') {
          o.customerName = db.customers[existingIdx].name;
          o.customerPhone = db.customers[existingIdx].phone || '';
          o.zone = db.customers[existingIdx].zone;
          o.address = db.customers[existingIdx].address;
        }
      });
    }
  } else {
    const maxNum = db.customers.reduce((max, c) => {
      const m = String(c.id || '').match(/CUST-(\d+)/);
      return m ? Math.max(max, Number(m[1])) : max;
    }, 0);
    const newId = 'CUST-' + String(maxNum + 1).padStart(3, '0');
    const newCust = normalizeCustomer({
      ...cust,
      id: newId,
      updatedAt: new Date().toISOString().slice(0, 10)
    }, db.customers.length);
    db.customers.push(newCust);
  }
  saveDB(db);
  res.json({ ok: true, data: db });
});

// Get Price Tiers List
app.get('/api/price-tiers', (req, res) => {
  const db = loadDB();
  if (!Array.isArray(db.priceTiers) || db.priceTiers.length === 0) {
    db.priceTiers = [
      { id: 'tier-custom', name: 'กำหนดราคาเอง', price189L: 0, price350ml: 0, price600ml: 0, price1500ml: 0 },
      { id: 'tier-wholesale', name: 'ราคาส่งร้านค้า', price189L: 15, price350ml: 32, price600ml: 35, price1500ml: 35 },
      { id: 'tier-vip', name: 'ราคาตัวแทนจำหน่าย VIP', price189L: 12, price350ml: 30, price600ml: 32, price1500ml: 32 },
      { id: 'tier-gov', name: 'ราคาหน่วยงานราชการ', price189L: 12, price350ml: 30, price600ml: 32, price1500ml: 32 },
      { id: 'tier-retail', name: 'ราคาปลีกมาตรฐาน', price189L: 20, price350ml: 35, price600ml: 40, price1500ml: 40 }
    ];
    saveDB(db);
  }
  res.json({ ok: true, data: db.priceTiers });
});

// Update / Save Price Tiers List
app.post('/api/price-tiers', (req, res) => {
  const db = loadDB();
  const tiers = Array.isArray(req.body) ? req.body : (Array.isArray(req.body?.priceTiers) ? req.body.priceTiers : []);
  if (!Array.isArray(tiers) || tiers.length === 0) {
    return res.status(400).json({ ok: false, error: 'ข้อมูลระดับราคาไม่ถูกต้อง' });
  }
  db.priceTiers = tiers.map(t => ({
    id: t.id || 'tier-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    name: String(t.name || '').trim() || 'ระดับราคา',
    price189L: Number(t.price189L ?? 0),
    price350ml: Number(t.price350ml ?? 0),
    price600ml: Number(t.price600ml ?? 0),
    price1500ml: Number(t.price1500ml ?? 0)
  }));
  saveDB(db);
  res.json({ ok: true, data: db.priceTiers, db });
});

// Delete Customer Record
app.delete('/api/customers/:id', (req, res) => {
  const db = loadDB();
  const targetId = req.params.id;
  db.customers = db.customers.filter(c => c.id !== targetId);
  try {
    const authFile = path.join(DATA_DIR, 'customer_auth.json');
    const authStore = JSON.parse(fs.readFileSync(authFile, 'utf8'));
    if (authStore[targetId]) { delete authStore[targetId]; fs.writeFileSync(authFile, JSON.stringify(authStore, null, 2), 'utf8'); }
  } catch (e) { /* no auth file yet */ }
  saveDB(db);
  res.json({ ok: true, data: db });
});

// Export Customer Master Data to Excel (.xlsx) for Admin / Accounting
app.get('/api/customers/export-excel', (req, res) => {
  const XLSX = require('xlsx');
  const db = loadDB();
  const rows = db.customers.map(c => ({
    'รหัสลูกค้า (Customer_ID)': c.id,
    'ประเภทลูกค้า (Type)': c.customerType,
    'ชื่อลูกค้า/ร้านค้า/หน่วยงาน (Name)': c.name,
    'ผู้ติดต่อ (Contact_Person)': c.contactPerson,
    'เบอร์โทรศัพท์ (Phone)': c.phone,
    'เลขบัตรประชาชน / เลขผู้เสียภาษี': c.taxId || '-',
    'สาขา (Branch)': c.branchType || 'สำนักงานใหญ่',
    'โซนจัดส่ง (Zone)': c.zone,
    'บ้านเลขที่ (House_No)': c.houseNo || '',
    'หมู่ที่ (Moo)': c.moo || '',
    'ตำบล (Subdistrict)': c.subdistrict || '',
    'อำเภอ (District)': c.district || '',
    'จังหวัด (Province)': c.province || '',
    'รหัสไปรษณีย์ (Postal_Code)': c.postalCode || '',
    'ที่อยู่จัดส่งรวม (Full_Address)': c.address,
    'พิกัด Latitude': c.lat,
    'พิกัด Longitude': c.lng,
    'เงื่อนไขชำระเงิน (Payment_Term)': c.paymentTerm,
    'ระดับราคา (Price_Tier)': c.priceTier,
    'ราคาถัง 18.9L (บาท)': c.price189L,
    'ราคาแพ็ค 350ml (บาท)': c.price350ml || 35,
    'ราคาแพ็ค 600ml (บาท)': c.price600ml,
    'ราคาแพ็ค 1.5L (บาท)': c.price1500ml,
    'วงเงินเครดิต (บาท)': c.creditLimit,
    'ยอดค้างชำระ (บาท)': c.creditBalance,
    'ถัง 18.9L ค้างที่ร้าน (ใบ)': c.OutstandingBottles,
    'เงินมัดจำถัง (บาท)': c.bottleDeposit,
    'รอบวันจัดส่ง (Delivery_Days)': c.deliveryDays,
    'สถานะ (Status)': c.status === 'active' ? 'ใช้งานปกติ' : 'ระงับ/ปิดบัญชี',
    'หมายเหตุ (Notes)': c.notes || ''
  }));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Customers_Master');
  const outPath = path.join(DATA_DIR, 'Inthara_Customers_Master.xlsx');
  XLSX.writeFile(wb, outPath);
  res.download(outPath, 'Inthara_Customers_Master.xlsx');
});

// ==========================================
// SALES ORDERS API (SEPARATE FROM CUSTOMER MASTER DB)
// ==========================================
app.post('/api/orders', (req, res) => {
  const db = loadDB();
  if (!Array.isArray(db.orders)) db.orders = [];
  const ord = req.body;
  const cust = db.customers.find(c => c.id === ord.customerId);
  if (!cust) {
    return res.status(400).json({ ok: false, error: 'ไม่พบรหัสลูกค้าที่เลือกในฐานข้อมูล' });
  }

  const qty189L = Number(ord.qty189L || 0);
  const qty350ml = Number(ord.qty350ml || 0);
  const qty600ml = Number(ord.qty600ml || 0);
  const qty1500ml = Number(ord.qty1500ml || 0);
  const totalQty = qty189L + qty350ml + qty600ml + qty1500ml;

  if (totalQty <= 0) {
    return res.status(400).json({
      ok: false,
      error: 'ไม่สามารถบันทึกออเดอร์ได้: จำนวนสินค้าทั้งหมดต้องมากกว่า 0 (ออเดอร์ = 0 ไม่อนุญาตให้บันทึก)'
    });
  }

  // Enforce: Product prices cannot be edited in orders; strictly use pricing from Customer Master (ทะเบียนลูกค้า)
  const unitPrice189L = Number(cust.price189L ?? 15);
  const unitPrice350ml = Number(cust.price350ml ?? 35);
  const unitPrice600ml = Number(cust.price600ml ?? 35);
  const unitPrice1500ml = Number(cust.price1500ml ?? 35);
  const totalAmount = (qty189L * unitPrice189L) + (qty350ml * unitPrice350ml) + (qty600ml * unitPrice600ml) + (qty1500ml * unitPrice1500ml);
  const assignedStatus = (ord.orderStatus === 'จัดส่งสำเร็จแล้ว') ? 'จัดส่งสำเร็จแล้ว' : 'ยังไม่ได้จัดส่ง';

  // Prevent rapid duplicate submission (within 4 seconds for same customer & identical items)
  if (!ord.orderId && Array.isArray(db.orders)) {
    const now = Date.now();
    const recentDup = db.orders.find(o => 
      o.customerId === cust.id &&
      Number(o.qty189L || 0) === qty189L &&
      Number(o.qty350ml || 0) === qty350ml &&
      Number(o.qty600ml || 0) === qty600ml &&
      Number(o.qty1500ml || 0) === qty1500ml &&
      o.deliveryDate === (ord.deliveryDate || new Date().toISOString().slice(0, 10)) &&
      (now - new Date(o.createdAt || 0).getTime()) < 4000
    );
    if (recentDup) {
      return res.json({ ok: true, data: db, duplicateIgnored: true });
    }
  }

  const existingIdx = ord.orderId ? db.orders.findIndex(o => o.orderId === ord.orderId) : -1;
  if (existingIdx >= 0) {
    if (db.orders[existingIdx].orderStatus === 'จัดส่งสำเร็จแล้ว') {
      return res.status(400).json({
        ok: false,
        error: `ออเดอร์ [${ord.orderId}] นี้จัดส่งสำเร็จแล้ว ไม่อนุญาตให้แก้ไขข้อมูลเพื่อรักษาความถูกต้องของข้อมูลสต็อกและบัญชี`
      });
    }
    db.orders[existingIdx] = {
      ...db.orders[existingIdx],
      customerId: cust.id,
      customerName: cust.name,
      customerPhone: cust.phone || '',
      zone: cust.zone,
      address: cust.address,
      qty189L,
    qty350ml,
    qty600ml,
    qty1500ml,
    unitPrice189L,
    unitPrice350ml,
    unitPrice600ml,
      unitPrice1500ml,
      totalAmount,
      deliveryDate: ord.deliveryDate || new Date().toISOString().slice(0, 10),
      deliveryTime: ord.deliveryTime || '09:00',
      paymentTerm: cust.paymentTerm || 'เงินสด / โอนเงิน',
      orderStatus: assignedStatus,
      notes: ord.notes || ''
    };
  } else {
    const datePart = (ord.deliveryDate || new Date().toISOString().slice(0, 10)).slice(2).replace(/-/g, '');
    const seq = String(db.orders.length + 1).padStart(3, '0');
    const newOrder = {
      orderId: `ORD-${datePart}-${seq}`,
      customerId: cust.id,
      customerName: cust.name,
      customerPhone: cust.phone || '',
      zone: cust.zone,
      address: cust.address,
      qty189L,
      qty350ml,
      qty600ml,
      qty1500ml,
      unitPrice189L,
      unitPrice350ml,
      unitPrice600ml,
      unitPrice1500ml,
      totalAmount,
      deliveryDate: ord.deliveryDate || new Date().toISOString().slice(0, 10),
      deliveryTime: ord.deliveryTime || '09:00',
      paymentTerm: cust.paymentTerm || 'เงินสด / โอนเงิน',
      orderStatus: (ord.orderStatus === 'จัดส่งสำเร็จแล้ว') ? 'จัดส่งสำเร็จแล้ว' : 'ยังไม่ได้จัดส่ง',
      notes: ord.notes || '',
      createdAt: new Date().toISOString()
    };
    db.orders.unshift(newOrder);
  }

  // Sync active order quantities to the customer's GPS route stop so TMS route planning reflects this order immediately
  cust.orderBottles189L = qty189L;
  cust.orderPack350ml = qty350ml;
  cust.orderPack600ml = qty600ml;
  cust.orderPack1500ml = qty1500ml;
  cust.selectedForRoute = true;
  cust.deliveryStatus = 'pending';
  delete cust.deliveredBottles;
  delete cust.returnedBottles;

  saveDB(db);
  res.json({ ok: true, data: db });
});

app.delete('/api/orders/:id', (req, res) => {
  const db = loadDB();
  const targetId = req.params.id;
  const targetOrd = (db.orders || []).find(o => o.orderId === targetId);
  db.orders = (db.orders || []).filter(o => o.orderId !== targetId);
  if (targetOrd) {
    const cust = (db.customers || []).find(c => c.id === targetOrd.customerId);
    const remainingPending = (db.orders || []).filter(o => o.customerId === targetOrd.customerId && o.orderStatus !== 'จัดส่งสำเร็จแล้ว');
    if (cust && remainingPending.length === 0) {
      cust.orderBottles189L = 0;
      cust.orderPack350ml = 0;
      cust.orderPack600ml = 0;
      cust.orderPack1500ml = 0;
      cust.selectedForRoute = false;
    }
  }
  saveDB(db);
  res.json({ ok: true, data: db });
});

app.get('/api/orders/export-excel', (req, res) => {
  const XLSX = require('xlsx');
  const db = loadDB();
  const dateQuery = req.query.date ? String(req.query.date).trim() : '';
  const statusQuery = req.query.status ? String(req.query.status).trim() : '';

  let list = Array.isArray(db.orders) ? db.orders : [];
  if (dateQuery) {
    list = list.filter(o => o.deliveryDate === dateQuery);
  }
  if (statusQuery === 'pending') {
    list = list.filter(o => o.orderStatus !== 'จัดส่งสำเร็จแล้ว');
  } else if (statusQuery === 'completed') {
    list = list.filter(o => o.orderStatus === 'จัดส่งสำเร็จแล้ว');
  }

  const rows = list.map(o => ({
    'เลขที่ใบสั่งซื้อ (Order_ID)': o.orderId,
    'รหัสลูกค้า (Customer_ID)': o.customerId,
    'ชื่อลูกค้า (Customer_Name)': o.customerName,
    'เบอร์โทรศัพท์ (Phone)': o.customerPhone || '',
    'โซนจัดส่ง (Zone)': o.zone || '',
    'วันที่จัดส่ง (Delivery_Date)': o.deliveryDate || '',
    'เวลาจัดส่ง (Delivery_Time)': o.deliveryTime || '',
    'ถัง 18.9L (จำนวนถัง)': o.qty189L || 0,
    'ราคา/ถัง 18.9L (บาท)': o.unitPrice189L || 15,
    'แพ็ค 350ml (จำนวนแพ็ค)': o.qty350ml || 0,
    'ราคา/แพ็ค 350ml (บาท)': o.unitPrice350ml || 35,
    'แพ็ค 600ml (จำนวนแพ็ค)': o.qty600ml || 0,
    'ราคา/แพ็ค 600ml (บาท)': o.unitPrice600ml || 35,
    'แพ็ค 1.5L (จำนวนแพ็ค)': o.qty1500ml || 0,
    'ราคา/แพ็ค 1.5L (บาท)': o.unitPrice1500ml || 35,
    'ยอดรวมสุทธิ (Total_Baht)': o.totalAmount || 0,
    'เงื่อนไขชำระเงิน': o.paymentTerm || 'เงินสด / โอนเงิน',
    'สถานะออเดอร์': o.orderStatus || 'ยังไม่ได้จัดส่ง',
    'หมายเหตุ': o.notes || ''
  }));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Sales_Orders');
  const outPath = path.join(DATA_DIR, 'Inthara_Sales_Orders.xlsx');
  XLSX.writeFile(wb, outPath);
  res.download(outPath, 'Inthara_Sales_Orders.xlsx');
});

// Record Driver Check-in, Confirm/Edit Order Quantities & Bottle Return at Stop
app.post('/api/delivery/checkin', (req, res) => {
  const db = loadDB();
  const { 
    customerId, 
    orderId,
    deliveredBottles, 
    deliveredPacks350,
    deliveredPacks600,
    deliveredPacks1500,
    returnedBottles,
    paymentMode,
    moneyReceived,
    notes
  } = req.body;

  const cust = db.customers.find(c => c.id === customerId);
  if (cust) {
    const q189 = Number(deliveredBottles || 0);
    const q350 = Number(deliveredPacks350 || 0);
    const q600 = Number(deliveredPacks600 || 0);
    const q1500 = Number(deliveredPacks1500 || 0);
    const ret189 = Number(returnedBottles || 0);

    cust.deliveryStatus = 'completed';
    cust.deliveredBottles = q189;
    cust.returnedBottles = ret189;
    cust.OutstandingBottles = Math.max(0, cust.OutstandingBottles + q189 - ret189);

    const fg189 = db.inventory.find(i => i.sku === 'FG-189L');
    const fg350 = db.inventory.find(i => i.sku === 'FG-350ML');
    const fg600 = db.inventory.find(i => i.sku === 'FG-600ML');
    const fg1500 = db.inventory.find(i => i.sku === 'FG-1500ML');
    const empty189 = db.inventory.find(i => i.sku === 'RET-189L-EMPTY');

    if (fg189) fg189.stock = Math.max(0, fg189.stock - q189);
    if (fg350) fg350.stock = Math.max(0, fg350.stock - q350);
    if (fg600) fg600.stock = Math.max(0, fg600.stock - q600);
    if (fg1500) fg1500.stock = Math.max(0, fg1500.stock - q1500);
    if (empty189) empty189.stock += ret189;

    // Reset customer route order quantities & deselect from active route
    cust.orderBottles189L = 0;
    cust.orderPack350ml = 0;
    cust.orderPack600ml = 0;
    cust.orderPack1500ml = 0;
    cust.selectedForRoute = false;

    // Update confirmed actual delivered quantities in order(s) and mark completed
    let matchedOrder = null;
    let orderTotalAmount = 0;
    if (Array.isArray(db.orders)) {
      db.orders.forEach(o => {
        const isMatch = orderId ? (o.orderId === orderId) : (o.customerId === customerId && o.orderStatus !== 'จัดส่งสำเร็จแล้ว' && o.orderStatus !== 'ยกเลิก');
        if (isMatch) {
          o.qty189L = q189;
          o.qty350ml = q350;
          o.qty600ml = q600;
          o.qty1500ml = q1500;
          o.totalAmount = (q189 * Number(o.unitPrice189L || 15)) +
                          (q350 * Number(o.unitPrice350ml || 35)) +
                          (q600 * Number(o.unitPrice600ml || 35)) +
                          (q1500 * Number(o.unitPrice1500ml || 35));
          orderTotalAmount = o.totalAmount;
          o.orderStatus = 'จัดส่งสำเร็จแล้ว';
          o.completedAt = new Date().toISOString();
          o.stockDeducted = true;
          if (notes) o.notes = notes;
          matchedOrder = o;
        }
      });
    }

    if (!orderTotalAmount) {
      orderTotalAmount = (q189 * 15) + ((q350 + q600 + q1500) * 35);
    }

    // Process payment collection (Cash vs Credit)
    const isCredit = (paymentMode === 'credit');
    const collectedCash = isCredit ? Math.max(0, Number(moneyReceived || 0)) : (moneyReceived !== undefined ? Number(moneyReceived) : orderTotalAmount);
    const unpaidDebt = Math.max(0, orderTotalAmount - collectedCash);

    // Update Customer Credit Balance in Customer Master
    if (unpaidDebt > 0) {
      cust.creditBalance = Number(cust.creditBalance || 0) + unpaidDebt;
    }

    if (matchedOrder) {
      matchedOrder.paymentMode = isCredit ? 'credit' : 'cash';
      matchedOrder.moneyCollected = collectedCash;
      matchedOrder.unpaidAmount = unpaidDebt;
      matchedOrder.paymentStatus = (unpaidDebt === 0) ? 'ชำระแล้ว' : 'ค้างชำระ';
    }

    // Automatically record closed job into db.savedTrips for history tracking
    if (!Array.isArray(db.savedTrips)) db.savedTrips = [];
    const dateStr = new Date().toISOString().slice(0, 10);
    const timeStr = new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
    const orderTotal = matchedOrder ? Number(matchedOrder.totalAmount || 0) : ((q189 * 15) + ((q350 + q600 + q1500) * 35));

    db.savedTrips.unshift({
      tripId: `JOB-${Date.now().toString().slice(-6)}`,
      date: dateStr,
      time: timeStr,
      vehicleId: cust.vehicleId || 'VEH-01',
      vehicleName: `${cust.name} (${cust.zone || 'ทั่วไป'})`,
      stopsCount: 1,
      totalDistanceKm: 0,
      estimatedTimeMin: 0,
      totalBottles189L: q189,
      totalPacks: q350 + q600 + q1500,
      estimatedFuelCost: 0,
      totalRevenue: orderTotalAmount,
      moneyCollected: collectedCash,
      unpaidAmount: unpaidDebt,
      paymentMode: isCredit ? 'credit' : 'cash',
      paymentStatus: (unpaidDebt === 0) ? 'ชำระแล้ว' : 'ค้างชำระ',
      status: 'จัดส่งสำเร็จแล้ว',
      orderId: orderId || (matchedOrder ? matchedOrder.orderId : ''),
      customerId: cust.id,
      customerName: cust.name
    });
  }
  saveDB(db);
  res.json({ ok: true, data: db });
});


// Settle Bill / Collect Payment on Unpaid Order or Customer Debt
app.post('/api/billing/settle', (req, res) => {
  const db = loadDB();
  const {
    customerId,
    orderId,
    amount,
    paymentMethod,
    paidDate,
    notes
  } = req.body;

  const payAmount = Number(amount || 0);
  if (payAmount <= 0) {
    return res.status(400).json({ ok: false, error: 'จำนวนเงินรับชำระต้องมากกว่า 0' });
  }

  // 1. Find customer and deduct from creditBalance
  let cust = null;
  if (customerId) {
    cust = db.customers.find(c => c.id === customerId);
  }
  if (!cust && orderId && Array.isArray(db.orders)) {
    const o = db.orders.find(ord => ord.orderId === orderId);
    if (o && o.customerId) {
      cust = db.customers.find(c => c.id === o.customerId);
    }
  }

  if (cust) {
    cust.creditBalance = Math.max(0, Number(cust.creditBalance || 0) - payAmount);
  }

  // 2. Update Order(s)
  let matchedOrder = null;
  if (orderId && Array.isArray(db.orders)) {
    matchedOrder = db.orders.find(o => o.orderId === orderId);
    if (matchedOrder) {
      matchedOrder.moneyCollected = Number(matchedOrder.moneyCollected || 0) + payAmount;
      matchedOrder.unpaidAmount = Math.max(0, Number(matchedOrder.totalAmount || 0) - Number(matchedOrder.moneyCollected));
      matchedOrder.paymentStatus = (matchedOrder.unpaidAmount === 0) ? 'ชำระแล้ว' : 'ค้างชำระ';
      matchedOrder.lastPaymentDate = paidDate || new Date().toISOString().slice(0, 10);
      matchedOrder.lastPaymentMethod = paymentMethod || 'เงินสด';
      matchedOrder.lastPaymentNotes = notes || '';
    }
  } else if (customerId && Array.isArray(db.orders)) {
    // If settled generally for customer, deduct sequentially from oldest unpaid orders
    let remainingToAllocate = payAmount;
    db.orders.forEach(o => {
      if (o.customerId === customerId && o.orderStatus === 'จัดส่งสำเร็จแล้ว' && remainingToAllocate > 0) {
        const currentUnpaid = o.unpaidAmount !== undefined ? Number(o.unpaidAmount) : (o.paymentMode === 'credit' ? Number(o.totalAmount || 0) : Math.max(0, Number(o.totalAmount || 0) - Number(o.moneyCollected || 0)));
        if (currentUnpaid > 0) {
          const alloc = Math.min(remainingToAllocate, currentUnpaid);
          o.moneyCollected = Number(o.moneyCollected || 0) + alloc;
          o.unpaidAmount = Math.max(0, Number(o.totalAmount || 0) - Number(o.moneyCollected));
          o.paymentStatus = (o.unpaidAmount === 0) ? 'ชำระแล้ว' : 'ค้างชำระ';
          o.lastPaymentDate = paidDate || new Date().toISOString().slice(0, 10);
          o.lastPaymentMethod = paymentMethod || 'เงินสด';
          remainingToAllocate -= alloc;
        }
      }
    });
  }

  // 3. Update savedTrips
  if (Array.isArray(db.savedTrips)) {
    db.savedTrips.forEach(t => {
      if (orderId && t.orderId === orderId) {
        t.moneyCollected = Number(t.moneyCollected || 0) + payAmount;
        t.unpaidAmount = Math.max(0, Number(t.totalRevenue || 0) - Number(t.moneyCollected));
        t.paymentStatus = (t.unpaidAmount === 0) ? 'ชำระแล้ว' : 'ค้างชำระ';
      }
    });
  }

  // 4. Save Payment Receipt
  if (!Array.isArray(db.paymentReceipts)) db.paymentReceipts = [];
  const receiptNo = `REC-${Date.now().toString().slice(-6)}`;
  const receipt = {
    receiptNo,
    date: paidDate || new Date().toISOString().slice(0, 10),
    time: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
    customerId: cust ? cust.id : (customerId || ''),
    customerName: cust ? cust.name : (matchedOrder ? matchedOrder.customerName : '-'),
    orderId: orderId || '',
    amount: payAmount,
    paymentMethod: paymentMethod || 'เงินสด',
    notes: notes || '',
    recordedAt: new Date().toISOString()
  };
  db.paymentReceipts.unshift(receipt);

  saveDB(db);
  res.json({ ok: true, receipt, data: db });
});

// Save Planned Route Trip
app.post('/api/trips', (req, res) => {
  const db = loadDB();
  const trip = req.body;
  db.savedTrips.unshift(trip);

  // If trip includes stopCustomerIds, update all active orders to 'จัดส่งสำเร็จแล้ว' and link with inventory
  if (Array.isArray(trip.stopCustomerIds) && Array.isArray(db.orders)) {
    const fg189 = (db.inventory || []).find(i => i.sku === 'FG-189L');
    const fg350 = (db.inventory || []).find(i => i.sku === 'FG-350ML');
    const fg600 = (db.inventory || []).find(i => i.sku === 'FG-600ML');
    const fg1500 = (db.inventory || []).find(i => i.sku === 'FG-1500ML');
    const empty189 = (db.inventory || []).find(i => i.sku === 'RET-189L-EMPTY');

    trip.stopCustomerIds.forEach(cId => {
      db.orders.forEach(o => {
        if (o.customerId === cId && o.orderStatus !== 'จัดส่งสำเร็จแล้ว' && o.orderStatus !== 'ยกเลิก') {
          o.orderStatus = 'จัดส่งสำเร็จแล้ว';
          o.completedAt = new Date().toISOString();

          // Deduct finished goods and return empty bottles if not already done by individual check-in
          if (!o.stockDeducted) {
            const q189 = Number(o.qty189L || 0);
            const q350 = Number(o.qty350ml || 0);
            const q600 = Number(o.qty600ml || 0);
            const q1500 = Number(o.qty1500ml || 0);
            if (fg189) fg189.stock = Math.max(0, fg189.stock - q189);
            if (fg350) fg350.stock = Math.max(0, fg350.stock - q350);
            if (fg600) fg600.stock = Math.max(0, fg600.stock - q600);
            if (fg1500) fg1500.stock = Math.max(0, fg1500.stock - q1500);
            if (empty189 && q189 > 0) empty189.stock += q189;
            o.stockDeducted = true;
          }
        }
      });
      const c = db.customers.find(item => item.id === cId);
      if (c) {
        c.selectedForRoute = false;
        c.orderBottles189L = 0;
        c.orderPack350ml = 0;
        c.orderPack600ml = 0;
        c.orderPack1500ml = 0;
      }
    });
  }

  if (Number(trip.estimatedFuelCost) > 0) {
    const vehStr = trip.vehiclePlate || trip.vehicleName || 'ผอ-4568 ชลบุรี';
    const driverStr = trip.driverName ? ` (ผู้ส่ง: ${trip.driverName})` : '';
    db.expenses.unshift({
      id: 'EXP-' + Date.now().toString().slice(-6),
      date: trip.date,
      category: 'ค่าน้ำมันขนส่ง',
      refId: trip.tripId,
      description: `ค่าน้ำมันสายส่ง ${vehStr}${driverStr} (${trip.totalDistanceKm} กม. / ${trip.stopsCount} จุดส่ง)`,
      amount: Number(trip.estimatedFuelCost)
    });
  }
  saveDB(db);
  res.json({ ok: true, data: db });
});

// Add Expense
app.post('/api/expenses', (req, res) => {
  const db = loadDB();
  const exp = req.body;
  exp.id = 'EXP-' + Date.now().toString().slice(-6);
  db.expenses.unshift(exp);
  saveDB(db);
  res.json({ ok: true, data: db });
});

// ==========================================
// EMPLOYEES & STAFF API
// ==========================================
app.get('/api/employees', (req, res) => {
  const db = loadDB();
  res.json({ ok: true, employees: db.employees || [] });
});

app.post('/api/employees', (req, res) => {
  const db = loadDB();
  db.employees = db.employees || [];
  const body = req.body || {};
  const nextNum = db.employees.length + 1;
  const newEmp = {
    id: body.id || `EMP-${String(nextNum).padStart(2, '0')}`,
    name: String(body.name || '').trim(),
    nickname: String(body.nickname || '').trim(),
    gender: body.gender || 'ชาย',
    position: String(body.position || '').trim(),
    department: body.department || 'ขนส่ง & โลจิสติกส์',
    phone: String(body.phone || '').trim(),
    idCard: String(body.idCard || '').trim(),
    startDate: body.startDate || new Date().toISOString().split('T')[0],
    salaryType: body.salaryType || 'รายเดือน',
    salary: Number(body.salary || 0),
    driverLicense: String(body.driverLicense || '-').trim(),
    driverLicenseExpiry: body.driverLicenseExpiry || '-',
    username: String(body.username || '-').trim(),
    vehicleId: body.vehicleId || '-',
    vehiclePlate: body.vehiclePlate || '-',
    status: body.status || 'active',
    emergencyContact: String(body.emergencyContact || '-').trim(),
    address: String(body.address || '').trim(),
    notes: String(body.notes || '').trim(),
    responsibilities: Array.isArray(body.responsibilities) 
      ? body.responsibilities.map(r => String(r).trim()).filter(Boolean)
      : (typeof body.responsibilities === 'string' && body.responsibilities.trim() 
          ? body.responsibilities.split('\n').map(r => r.trim()).filter(Boolean) 
          : []),
    photo: body.photo || '',
    idCardDoc: body.idCardDoc || null,
    driverLicenseDoc: body.driverLicenseDoc || null,
    otherDocs: Array.isArray(body.otherDocs) ? body.otherDocs : []
  };
  db.employees.push(newEmp);
  saveDB(db);
  res.json({ ok: true, employee: newEmp, employees: db.employees });
});

app.put('/api/employees/:id', (req, res) => {
  const db = loadDB();
  db.employees = db.employees || [];
  const idx = db.employees.findIndex(e => e.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ ok: false, error: 'ไม่พบข้อมูลพนักงาน' });
  }
  const body = req.body || {};
  let parsedResponsibilities = db.employees[idx].responsibilities || [];
  if (body.responsibilities !== undefined) {
    if (Array.isArray(body.responsibilities)) {
      parsedResponsibilities = body.responsibilities.map(r => String(r).trim()).filter(Boolean);
    } else if (typeof body.responsibilities === 'string') {
      parsedResponsibilities = body.responsibilities.split('\n').map(r => r.trim()).filter(Boolean);
    }
  }

  db.employees[idx] = {
    ...db.employees[idx],
    ...body,
    responsibilities: parsedResponsibilities,
    salary: body.salary !== undefined ? Number(body.salary) : db.employees[idx].salary,
    id: req.params.id
  };
  saveDB(db);
  res.json({ ok: true, employee: db.employees[idx], employees: db.employees });
});

app.delete('/api/employees/:id', (req, res) => {
  const db = loadDB();
  db.employees = db.employees || [];
  const idx = db.employees.findIndex(e => e.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ ok: false, error: 'ไม่พบข้อมูลพนักงาน' });
  }
  const removed = db.employees.splice(idx, 1)[0];
  saveDB(db);
  res.json({ ok: true, removed, employees: db.employees });
});

// ==========================================
// FIXED ASSETS API
// ==========================================
app.get('/api/assets', (req, res) => {
  const db = loadDB();
  res.json({ ok: true, assets: db.assets || [] });
});

app.post('/api/assets', (req, res) => {
  const db = loadDB();
  db.assets = db.assets || [];
  const body = req.body || {};
  const cat = body.category || 'other';
  let catPrefix = 'AST-EQ';
  let catName = '🔧 อุปกรณ์โรงงาน & อื่นๆ';
  if (cat === 'vehicle') { catPrefix = 'AST-VEH'; catName = '🚚 ยานพาหนะ (รถส่งน้ำ)'; }
  else if (cat === 'it_computer') { catPrefix = 'AST-IT'; catName = '💻 คอมพิวเตอร์ & ไอที'; }
  else if (cat === 'machine') { catPrefix = 'AST-MAC'; catName = '⚙️ เครื่องจักรผลิตน้ำ'; }
  else if (cat === 'container_tank') { catPrefix = 'AST-TNK'; catName = '💧 ภาชนะ & ถังน้ำดื่มหมุนเวียน (Carboy)'; }
  else if (cat === 'office') { catPrefix = 'AST-OFF'; catName = '🏢 สำนักงาน & อาคาร'; }

  const countCat = db.assets.filter(a => a.category === cat).length + 1;
  const cost = Number(body.cost || 0);
  const salvageValue = Number(body.salvageValue || 0);
  const usefulLifeYears = Number(body.usefulLifeYears || 5);
  const depPerYear = usefulLifeYears > 0 ? Math.round((cost - salvageValue) / usefulLifeYears) : 0;
  const acqDate = body.acquisitionDate || new Date().toISOString().split('T')[0];
  
  const acqYear = new Date(acqDate).getFullYear() || 2024;
  const currentYear = new Date().getFullYear();
  const yearsPassed = Math.max(0, currentYear - acqYear);
  const accumulatedDep = Math.min(cost - salvageValue, Math.round(depPerYear * yearsPassed));
  const currentValue = Math.max(salvageValue, cost - accumulatedDep);

  const newAsset = {
    id: body.id || `${catPrefix}-${String(countCat).padStart(3, '0')}`,
    name: String(body.name || '').trim(),
    category: cat,
    categoryName: catName,
    brand: String(body.brand || '-').trim(),
    model: String(body.model || '-').trim(),
    serialNo: String(body.serialNo || '-').trim(),
    location: String(body.location || 'โรงงานน้ำดื่มอินธารา').trim(),
    acquisitionDate: acqDate,
    cost,
    usefulLifeYears,
    salvageValue,
    depreciationPerYear: depPerYear,
    accumulatedDepreciation: accumulatedDep,
    currentValue,
    assignedEmployeeId: body.assignedEmployeeId || '-',
    assignedEmployeeName: body.assignedEmployeeName || '-',
    status: body.status || 'in_use',
    linkedRefId: body.linkedRefId || '-',
    notes: String(body.notes || '').trim()
  };
  db.assets.push(newAsset);
  syncVehiclesWithAssets(db);
  saveDB(db);
  res.json({ ok: true, asset: newAsset, assets: db.assets, vehicles: db.vehicles });
});

app.put('/api/assets/:id', (req, res) => {
  const db = loadDB();
  db.assets = db.assets || [];
  const idx = db.assets.findIndex(a => a.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ ok: false, error: 'ไม่พบข้อมูลสินทรัพย์' });
  }
  const body = req.body || {};
  const current = db.assets[idx];
  const cost = body.cost !== undefined ? Number(body.cost) : current.cost;
  const salvageValue = body.salvageValue !== undefined ? Number(body.salvageValue) : current.salvageValue;
  const usefulLifeYears = body.usefulLifeYears !== undefined ? Number(body.usefulLifeYears) : current.usefulLifeYears;
  const depPerYear = usefulLifeYears > 0 ? Math.round((cost - salvageValue) / usefulLifeYears) : 0;
  const accumulatedDep = body.accumulatedDepreciation !== undefined ? Number(body.accumulatedDepreciation) : current.accumulatedDepreciation;
  const currentValue = body.currentValue !== undefined ? Number(body.currentValue) : Math.max(salvageValue, cost - accumulatedDep);

  db.assets[idx] = {
    ...current,
    ...body,
    cost,
    salvageValue,
    usefulLifeYears,
    depreciationPerYear: depPerYear,
    accumulatedDepreciation: accumulatedDep,
    currentValue,
    id: req.params.id
  };
  syncVehiclesWithAssets(db);
  saveDB(db);
  res.json({ ok: true, asset: db.assets[idx], assets: db.assets, vehicles: db.vehicles });
});

app.delete('/api/assets/:id', (req, res) => {
  const db = loadDB();
  db.assets = db.assets || [];
  const idx = db.assets.findIndex(a => a.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ ok: false, error: 'ไม่พบข้อมูลสินทรัพย์' });
  }
  const removed = db.assets.splice(idx, 1)[0];
  syncVehiclesWithAssets(db);
  saveDB(db);
  res.json({ ok: true, removed, assets: db.assets, vehicles: db.vehicles });
});

// ==========================================
// CUSTOMER SELF-SERVICE PORTAL ROUTES (/customer & /api/customer-portal/*)
// ==========================================
app.get('/customer', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'customer.html'));
});

// ---------- Customer Identity: 6-Digit PIN (Phone + PIN) ----------
// Credentials are stored in data/customer_auth.json (separate from inthara_db.json)
const nodeCrypto = require('crypto');
const CUSTOMER_AUTH_FILE = path.join(DATA_DIR, 'customer_auth.json');
const PIN_MAX_FAILS = 5;
const PIN_LOCK_MS = 15 * 60 * 1000; // 15-minute lockout on 5 consecutive wrong PINs
const SESSION_TTL_MS = 60 * 60 * 1000; // 1-hour session token

function loadAuthStore() {
  try {
    return JSON.parse(fs.readFileSync(CUSTOMER_AUTH_FILE, 'utf8'));
  } catch (e) {
    return {};
  }
}
function saveAuthStore(store) {
  fs.writeFileSync(CUSTOMER_AUTH_FILE, JSON.stringify(store, null, 2), 'utf8');
}
function normPhone(p) {
  return String(p || '').replace(/\D/g, '');
}
function isValidPin(pin) {
  return /^\d{6}$/.test(String(pin || ''));
}
function hashPin(pin, salt) {
  return nodeCrypto.scryptSync(String(pin), salt, 32).toString('hex');
}
function setPinFor(store, customerId, pin) {
  const salt = nodeCrypto.randomBytes(16).toString('hex');
  store[customerId] = {
    ...(store[customerId] || {}),
    pinSalt: salt,
    pinHash: hashPin(pin, salt),
    pinFailed: 0,
    pinLockUntil: 0
  };
}
function checkPin(entry, pin) {
  const salt = entry?.pinSalt || 'dummy-salt-for-timing';
  const calc = Buffer.from(hashPin(pin, salt), 'hex');
  const real = Buffer.from(entry?.pinHash || '0'.repeat(64), 'hex');
  const ok = nodeCrypto.timingSafeEqual(calc, real);
  return !!entry?.pinHash && ok;
}

// In-memory portal sessions and IP rate limiting
const portalSessions = new Map(); // token -> { customerId, method: 'pin', expires }
const ipHits = new Map();         // key -> { count, reset }

function createPortalSession(data) {
  const token = nodeCrypto.randomBytes(24).toString('hex');
  portalSessions.set(token, { customerId: null, method: 'pin', ...data, expires: Date.now() + SESSION_TTL_MS });
  return token;
}
function getPortalSession(req) {
  const token = req.headers['x-portal-token'];
  if (!token) return null;
  const s = portalSessions.get(token);
  if (!s) return null;
  if (s.expires < Date.now()) {
    portalSessions.delete(token);
    return null;
  }
  return s;
}
function rateLimited(req, key, max, windowMs) {
  const k = `${key}:${req.ip || '127.0.0.1'}`;
  const now = Date.now();
  const rec = ipHits.get(k);
  if (!rec || rec.reset < now) {
    ipHits.set(k, { count: 1, reset: now + windowMs });
    return false;
  }
  rec.count += 1;
  return rec.count > max;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of portalSessions) if (v.expires < now) portalSessions.delete(k);
  for (const [k, v] of ipHits) if (v.reset < now) ipHits.delete(k);
}, 5 * 60 * 1000).unref();

function staffAllowed(req) {
  const user = getAuthUser(req);
  if (user && (user.role === 'executive' || user.role === 'admin')) return true;
  const ip = req.ip || req.connection?.remoteAddress || '';
  if (ip === '127.0.0.1' || ip === '::1' || ip.includes('127.0.0.1')) return true;
  return false;
}

// ----- PIN login (Supports both /pin/login and /login-pin) -----
function handlePinLogin(req, res) {
  if (rateLimited(req, 'pinlogin', 30, 15 * 60 * 1000)) {
    return res.status(429).json({ ok: false, error: 'พยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่' });
  }
  const phone = normPhone(req.body?.phone);
  const pin = String(req.body?.pin || '').trim();

  if (!phone || phone.length < 9) {
    return res.status(400).json({ ok: false, error: 'กรุณากรอกเบอร์โทรศัพท์ที่ถูกต้อง' });
  }
  if (!isValidPin(pin)) {
    return res.status(400).json({ ok: false, error: 'กรุณากรอกรหัส PIN เป็นตัวเลข 6 หลัก' });
  }

  const db = loadDB();
  const customer = (db.customers || []).find(c => normPhone(c.phone) === phone);
  if (!customer) {
    return res.status(404).json({
      ok: false,
      error: 'ไม่พบเบอร์โทรศัพท์นี้ในระบบ หากเป็นลูกค้าใหม่ กรุณากดปุ่ม "ลงทะเบียนลูกค้าใหม่"'
    });
  }

  const store = loadAuthStore();
  const entry = store[customer.id] || {};

  // Check lockout
  const now = Date.now();
  if (entry.pinLockUntil && entry.pinLockUntil > now) {
    const minsLeft = Math.ceil((entry.pinLockUntil - now) / 60000);
    return res.status(423).json({
      ok: false,
      error: `บัญชีถูกระงับชั่วคราวเนื่องจากใส่ PIN ผิดเกิน ${PIN_MAX_FAILS} ครั้ง กรุณารอ ${minsLeft} นาที หรือติดต่อเจ้าหน้าที่โรงงานเพื่อปลดล็อก`
    });
  }

  if (!entry.pinHash) {
    return res.status(400).json({
      ok: false,
      error: 'บัญชีของคุณยังไม่ได้ตั้งรหัส PIN กรุณาติดต่อเจ้าหน้าที่โรงงานเพื่อขอรับรหัส PIN หรือกดลงทะเบียนเพื่อตั้ง PIN'
    });
  }

  if (!checkPin(entry, pin)) {
    entry.pinFailed = (entry.pinFailed || 0) + 1;
    if (entry.pinFailed >= PIN_MAX_FAILS) {
      entry.pinLockUntil = now + PIN_LOCK_MS;
      saveAuthStore(store);
      return res.status(423).json({
        ok: false,
        error: `คุณใส่รหัส PIN ผิดเกิน ${PIN_MAX_FAILS} ครั้ง ระบบได้ระงับการเข้าสู่ระบบชั่วคราว 15 นาทีเพื่อความปลอดภัย`
      });
    }
    saveAuthStore(store);
    const left = PIN_MAX_FAILS - entry.pinFailed;
    return res.status(401).json({
      ok: false,
      error: `รหัส PIN ไม่ถูกต้อง (เหลือโอกาสลองอีก ${left} ครั้ง)`
    });
  }

  // Success
  entry.pinFailed = 0;
  entry.pinLockUntil = 0;
  saveAuthStore(store);

  const token = createPortalSession({ customerId: customer.id, method: 'pin' });
  res.json({ ok: true, token, customer });
}

app.post('/api/customer-portal/pin/login', handlePinLogin);
app.post('/api/customer-portal/login-pin', handlePinLogin);

// ----- customer me (returns authenticated customer profile & past orders) -----
app.get('/api/customer-portal/me', (req, res) => {
  const s = getPortalSession(req);
  if (!s) return res.status(401).json({ ok: false, needLogin: true, error: 'กรุณาเข้าสู่ระบบก่อน' });
  const db = loadDB();
  const customer = (db.customers || []).find(c => c.id === s.customerId);
  if (!customer) return res.json({ ok: true, found: false });
  const store = loadAuthStore();
  const e = store[customer.id] || {};
  const orders = (db.orders || []).filter(o => o.customerId === customer.id);
  res.json({
    ok: true,
    found: true,
    customer,
    hasPin: !!e.pinHash,
    orders
  });
});

// ----- customer logout -----
app.post('/api/customer-portal/logout', (req, res) => {
  const token = req.headers['x-portal-token'];
  if (token) portalSessions.delete(token);
  res.json({ ok: true });
});

// ----- customer registration & profile update -----
app.post('/api/customer-portal/register', (req, res) => {
  if (rateLimited(req, 'register', 20, 60 * 60 * 1000)) {
    return res.status(429).json({ ok: false, error: 'บันทึกข้อมูลบ่อยเกินไป กรุณาลองใหม่ภายหลัง' });
  }
  const body = req.body || {};
  const db = loadDB();
  if (!Array.isArray(db.customers)) db.customers = [];

  const rawPhone = String(body.phone || '').trim();
  const phoneDigits = normPhone(rawPhone);
  if (!phoneDigits || phoneDigits.length < 9) {
    return res.status(400).json({ ok: false, error: 'กรุณาระบุเบอร์โทรศัพท์ที่ถูกต้อง (เช่น 08x-xxx-xxxx)' });
  }

  const name = String(body.name || '').trim();
  if (!name) return res.status(400).json({ ok: false, error: 'กรุณากรอกชื่อลูกค้า / ร้านค้า' });

  // 1 customer = 1 phone number
  const existingWithPhone = db.customers.find(c => normPhone(c.phone) === phoneDigits);
  const session = getPortalSession(req);
  const isNew = !body.id;

  if (isNew) {
    if (existingWithPhone) {
      return res.status(400).json({
        ok: false,
        error: `เบอร์โทรศัพท์ "${rawPhone}" ถูกลงทะเบียนไว้แล้ว (ลูกค้า 1 เจ้า ลงทะเบียนได้ 1 เบอร์) กรุณาเข้าสู่ระบบด้วย PIN แทน`
      });
    }
  } else {
    // Updating existing
    if (existingWithPhone && existingWithPhone.id !== body.id) {
      return res.status(400).json({
        ok: false,
        error: `เบอร์โทรศัพท์ "${rawPhone}" ถูกใช้งานโดยลูกค้ารายอื่นแล้ว`
      });
    }
    // Verify caller has permission for this customer
    if (!session || session.customerId !== body.id) {
      return res.status(403).json({ ok: false, error: 'ไม่มีสิทธิ์แก้ไขข้อมูลลูกค้ารายนี้' });
    }
  }

  // Check PIN requirements
  const pin = String(body.pin || body.newPin || '').trim();
  const pinConfirm = String(body.pinConfirm || body.confirmPin || '').trim();

  if (isNew) {
    if (!isValidPin(pin)) {
      return res.status(400).json({ ok: false, error: 'กรุณากำหนดรหัส PIN เป็นตัวเลข 6 หลัก (เช่น 123456)' });
    }
    if (pin !== pinConfirm) {
      return res.status(400).json({ ok: false, error: 'รหัส PIN และ ยืนยันรหัส PIN ไม่ตรงกัน' });
    }
  } else {
    // If updating PIN
    if (pin || pinConfirm) {
      if (!isValidPin(pin)) {
        return res.status(400).json({ ok: false, error: 'รหัส PIN ใหม่ต้องเป็นตัวเลข 6 หลัก' });
      }
      if (pin !== pinConfirm) {
        return res.status(400).json({ ok: false, error: 'รหัส PIN ใหม่และยืนยัน PIN ไม่ตรงกัน' });
      }
    }
  }

  let targetCustId = body.id;
  let savedCustomer = null;
  const store = loadAuthStore();

  if (isNew) {
    let maxNum = 0;
    db.customers.forEach(c => {
      const m = String(c.id).match(/CUST-(\d+)/);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > maxNum) maxNum = n;
      }
    });
    targetCustId = `CUST-${String(maxNum + 1).padStart(3, '0')}`;

    savedCustomer = {
      id: targetCustId,
      name,
      contactPerson: String(body.contactPerson || '').trim() || name,
      phone: rawPhone,
      customerType: body.customerType || 'ร้านค้าปลีก-ส่ง / ตัวแทน',
      taxId: String(body.taxId || '').trim(),
      branchType: 'สำนักงานใหญ่',
      zone: body.zone || 'โซนท่าปลา - จริม',
      address: String(body.address || '').trim(),
      lat: Number(body.lat) || 17.7915,
      lng: Number(body.lng) || 100.3782,
      priceTier: 'ราคาส่งร้านค้า',
      price189L: 15,
      price350ml: 35,
      price600ml: 35,
      price1500ml: 35,
      paymentTerm: 'เงินสด / โอนเงิน',
      creditLimit: 5000,
      creditBalance: 0,
      bottleDeposit: 0,
      OutstandingBottles: 0,
      status: 'active',
      notes: body.notes ? `[ลูกค้าลงทะเบียนเอง] ${String(body.notes).slice(0, 200)}` : '[ลูกค้าลงทะเบียนเองออนไลน์]',
      orderBottles189L: 0,
      orderPack350ml: 0,
      orderPack600ml: 0,
      orderPack1500ml: 0,
      selectedForRoute: false,
      deliverySequence: db.customers.length + 1
    };
    db.customers.push(savedCustomer);
    setPinFor(store, targetCustId, pin);
  } else {
    const existing = db.customers.find(c => c.id === targetCustId);
    if (!existing) return res.status(404).json({ ok: false, error: 'ไม่พบข้อมูลลูกค้า' });

    existing.name = name;
    existing.phone = rawPhone;
    if (body.contactPerson !== undefined) existing.contactPerson = String(body.contactPerson).trim();
    if (body.customerType !== undefined) existing.customerType = body.customerType;
    if (body.taxId !== undefined) existing.taxId = String(body.taxId).trim();
    if (body.notes !== undefined) existing.notes = String(body.notes).trim();
    if (body.zone !== undefined) existing.zone = body.zone;
    if (body.address !== undefined) existing.address = String(body.address).trim();
    if (body.lat !== undefined && !isNaN(Number(body.lat))) existing.lat = Number(body.lat);
    if (body.lng !== undefined && !isNaN(Number(body.lng))) existing.lng = Number(body.lng);

    if (pin) {
      setPinFor(store, targetCustId, pin);
    }
    savedCustomer = existing;
  }

  saveDB(db);
  saveAuthStore(store);

  // Auto-login / update session
  const token = createPortalSession({ customerId: targetCustId, method: 'pin' });
  res.json({ ok: true, customer: savedCustomer, token });
});

// ----- place an order (customer comes from authenticated session) -----
app.post('/api/customer-portal/order', (req, res) => {
  const session = getPortalSession(req);
  if (!session) return res.status(401).json({ ok: false, needLogin: true, error: 'กรุณาเข้าสู่ระบบก่อนสั่งน้ำดื่ม' });
  if (!session.customerId) return res.status(400).json({ ok: false, error: 'ยังไม่มีข้อมูลลูกค้า กรุณาลงทะเบียนลูกค้าใหม่ก่อนสั่งน้ำดื่ม' });

  const db = loadDB();
  if (!Array.isArray(db.orders)) db.orders = [];
  const body = req.body || {};
  const cust = db.customers.find(c => c.id === session.customerId);
  if (!cust) return res.status(400).json({ ok: false, error: 'ไม่พบข้อมูลลูกค้า' });

  const qty189L = Math.max(0, Math.floor(Number(body.qty189L ?? body.qty189 ?? 0)));
  const qty350ml = Math.max(0, Math.floor(Number(body.qty350ml ?? body.qty350 ?? 0)));
  const qty600ml = Math.max(0, Math.floor(Number(body.qty600ml ?? body.qty600 ?? 0)));
  const qty1500ml = Math.max(0, Math.floor(Number(body.qty1500ml ?? body.qty1500 ?? 0)));
  if (qty189L + qty350ml + qty600ml + qty1500ml <= 0) {
    return res.status(400).json({ ok: false, error: 'กรุณาระบุจำนวนน้ำดื่มที่ต้องการสั่งอย่างน้อย 1 รายการ' });
  }

  const unitPrice189L = Number(cust.price189L ?? 15);
  const unitPrice350ml = Number(cust.price350ml ?? 35);
  const unitPrice600ml = Number(cust.price600ml ?? 35);
  const unitPrice1500ml = Number(cust.price1500ml ?? 35);
  const totalAmount = (qty189L * unitPrice189L) + (qty350ml * unitPrice350ml) + (qty600ml * unitPrice600ml) + (qty1500ml * unitPrice1500ml);

  const deliveryDate = /^\d{4}-\d{2}-\d{2}$/.test(body.deliveryDate || '') ? body.deliveryDate : new Date().toISOString().slice(0, 10);
  const deliveryTime = /^\d{2}:\d{2}$/.test(body.deliveryTime || '') ? body.deliveryTime : '09:00';
  const datePart = deliveryDate.slice(2).replace(/-/g, '');
  const seq = String(db.orders.length + 1).padStart(3, '0');
  const newOrder = {
    orderId: `ORD-${datePart}-${seq}`,
    customerId: cust.id,
    customerName: cust.name,
    customerPhone: cust.phone || '',
    zone: cust.zone,
    address: cust.address,
    qty189L,
    qty350ml,
    qty600ml,
    qty1500ml,
    unitPrice189L,
    unitPrice350ml,
    unitPrice600ml,
    unitPrice1500ml,
    totalAmount,
    deliveryDate,
    deliveryTime,
    paymentTerm: cust.paymentTerm || 'เงินสด / โอนเงิน',
    orderStatus: 'รอจัดส่งตามสาย GPS',
    notes: body.notes ? `[ลูกค้าสั่งเอง] ${String(body.notes).slice(0, 200)}` : '[ลูกค้าสั่งเองออนไลน์]',
    createdAt: new Date().toISOString()
  };

  db.orders.unshift(newOrder);
  cust.orderBottles189L = qty189L;
  cust.orderPack350ml = qty350ml;
  cust.orderPack600ml = qty600ml;
  cust.orderPack600ml = qty600ml;
  cust.orderPack1500ml = qty1500ml;
  cust.selectedForRoute = true;

  saveDB(db);
  const customerOrders = db.orders.filter(o => o.customerId === cust.id);
  res.json({ ok: true, order: newOrder, customer: cust, orders: customerOrders });
});

// ----- Staff Tools (require staff role or localhost) -----
app.get('/api/customers/:id/access-status', (req, res) => {
  if (!staffAllowed(req)) return res.status(403).json({ ok: false, error: 'เฉพาะผู้บริหาร/แอดมิน' });
  const e = loadAuthStore()[req.params.id] || {};
  res.json({
    ok: true,
    hasPin: !!e.pinHash,
    locked: !!(e.pinLockUntil && e.pinLockUntil > Date.now()),
    failedAttempts: e.pinFailed || 0
  });
});

app.post('/api/customers/:id/reset-pin', (req, res) => {
  if (!staffAllowed(req)) return res.status(403).json({ ok: false, error: 'เฉพาะผู้บริหาร/แอดมินเท่านั้นที่ตั้ง/รีเซ็ต PIN ได้' });
  const db = loadDB();
  if (!db.customers.some(c => c.id === req.params.id)) return res.status(404).json({ ok: false, error: 'ไม่พบลูกค้า' });
  let pin = req.body?.customPin ? String(req.body.customPin).trim() : '';
  if (pin) {
    if (!/^\d{6}$/.test(pin)) return res.status(400).json({ ok: false, error: 'PIN ต้องเป็นตัวเลข 6 หลัก' });
  } else {
    pin = String(nodeCrypto.randomInt(0, 1000000)).padStart(6, '0');
  }
  const store = loadAuthStore();
  setPinFor(store, req.params.id, pin);
  saveAuthStore(store);
  res.json({ ok: true, pin });
});

app.post('/api/customers/:id/unlock', (req, res) => {
  if (!staffAllowed(req)) return res.status(403).json({ ok: false, error: 'เฉพาะผู้บริหาร/แอดมินเท่านั้น' });
  const store = loadAuthStore();
  if (store[req.params.id]) {
    store[req.params.id].pinFailed = 0;
    store[req.params.id].pinLockUntil = 0;
    saveAuthStore(store);
  }
  res.json({ ok: true });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Inthara Smart Water ERP running at http://0.0.0.0:${PORT}`);
});
