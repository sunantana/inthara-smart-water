const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const DATA_DIR = path.join(__dirname, 'data');
const SEC_FILE = path.join(DATA_DIR, 'security_auth.json');
const EXCEL_USER_FILE = path.join(__dirname, 'Inthara_Users_Passwords.xlsx');
const EXCEL_DATA_COPY = path.join(DATA_DIR, 'Inthara_Users_Passwords.xlsx');

// PBKDF2-SHA512 Configuration (High Security)
const ITERATIONS = 100000;
const KEYLEN = 64;
const DIGEST = 'sha512';

// Role Permissions Matrix (RBAC) — Different Tabs & Different Dashboard Widgets per Role
const ROLE_PERMISSIONS = {
  executive: {
    roleName: 'ผู้บริหารสูงสุด / เจ้าของกิจการ (Executive / Owner)',
    allowedTabs: ['dashboard', 'customers', 'orders', 'tms', 'production', 'cmms', 'inventory', 'costing', 'employees', 'assets', 'security'],
    dashboardSections: ['exec_finance', 'prod_qc', 'cmms_status', 'inv_bottles', 'tms_summary', 'line_flow'],
    canWriteProduction: true,
    canWriteMaintenance: true,
    canWriteTms: true,
    canWriteExpenses: true,
    canManageUsers: true
  },
  admin: {
    roleName: 'แอดมินโรงงาน / ฝ่ายวางแผนและบัญชี (Factory Admin)',
    allowedTabs: ['dashboard', 'customers', 'orders', 'tms', 'production', 'cmms', 'inventory', 'costing', 'employees', 'assets'],
    dashboardSections: ['exec_finance', 'inv_bottles', 'tms_summary', 'prod_qc', 'line_flow'],
    canWriteProduction: true,
    canWriteMaintenance: true,
    canWriteTms: true,
    canWriteExpenses: true,
    canManageUsers: false
  },
  production_qc: {
    roleName: 'หัวหน้าฝ่ายผลิต & ควบคุมคุณภาพน้ำ (Production & QC)',
    allowedTabs: ['dashboard', 'production', 'cmms', 'inventory', 'assets'],
    dashboardSections: ['prod_qc', 'line_flow', 'inv_bottles', 'cmms_status'],
    canWriteProduction: true,
    canWriteMaintenance: true,
    canWriteTms: false,
    canWriteExpenses: false,
    canManageUsers: false
  },
  technician: {
    roleName: 'ช่างเทคนิค & ซ่อมบำรุงเครื่องจักร (CMMS Technician)',
    allowedTabs: ['dashboard', 'cmms', 'production', 'assets'],
    dashboardSections: ['cmms_status', 'line_flow', 'prod_qc'],
    canWriteProduction: false,
    canWriteMaintenance: true,
    canWriteTms: false,
    canWriteExpenses: false,
    canManageUsers: false
  },
  driver: {
    roleName: 'พนักงานขับรถส่งน้ำ & เก็บถังคืน (GPS Driver)',
    allowedTabs: ['dashboard', 'tms', 'inventory'],
    dashboardSections: ['tms_summary', 'inv_bottles'],
    canWriteProduction: false,
    canWriteMaintenance: false,
    canWriteTms: true,
    canWriteExpenses: false,
    canManageUsers: false
  }
};

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.pbkdf2Sync(String(password), salt, ITERATIONS, KEYLEN, DIGEST).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, expectedHash) {
  const hash = crypto.pbkdf2Sync(String(password), salt, ITERATIONS, KEYLEN, DIGEST).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(expectedHash, 'hex'));
}

function getDefaultUsersPlain() {
  return [
    {
      level: 1,
      username: 'owner_inthara',
      passwordPlain: 'Inthara@Owner2026!',
      pin: '1988',
      displayName: 'นางมัณฑนา โนราช (ผู้บริหารสูงสุด)',
      role: 'executive',
      active: 'YES',
      dashboardNote: 'เห็นข้อมูลครบทุกมิติ: การเงิน/กำไรสุทธิ, การผลิต, ซ่อมบำรุง 16 เครื่อง, สต็อก/ถังหมุนเวียน, ขนส่ง GPS และความปลอดภัย'
    },
    {
      level: 2,
      username: 'admin_office',
      passwordPlain: 'Inthara@Admin2026!',
      pin: '2200',
      displayName: 'แอดมินสำนักงาน (จัดสายส่ง & บัญชี)',
      role: 'admin',
      active: 'YES',
      dashboardNote: 'เห็นแดชบอร์ดยอดขาย-ค่าใช้จ่าย, สต็อกถังหมุนเวียน, สายส่ง GPS และภาพรวมการผลิต (ไม่เห็นหน้าจัดการรหัสผ่าน)'
    },
    {
      level: 3,
      username: 'qc_production',
      passwordPlain: 'Inthara@QC2026!',
      pin: '3300',
      displayName: 'ฝ่ายผลิต & ควบคุมคุณภาพน้ำ (QC/GMP)',
      role: 'production_qc',
      active: 'YES',
      dashboardNote: 'เห็นเฉพาะแดชบอร์ดการผลิต RO/UV, คุณภาพน้ำ TDS/pH, สถานะสายการผลิต และสต็อกน้ำดื่ม (ไม่เห็นงบการเงินและต้นทุน)'
    },
    {
      level: 4,
      username: 'tech_cmms',
      passwordPlain: 'Inthara@Tech2026!',
      pin: '4400',
      displayName: 'ช่างสมชาย (ฝ่ายซ่อมบำรุงเครื่องจักร 16 เครื่อง)',
      role: 'technician',
      active: 'YES',
      dashboardNote: 'เห็นเฉพาะแดชบอร์ดสถานะเครื่องจักร 16 เครื่อง, แจ้งเตือนชั่วโมง PM/การล้างสารกรอง และผังสายการผลิต (ไม่เห็นข้อมูลการเงิน/ลูกค้า)'
    },
    {
      level: 5,
      username: 'driver_gps',
      passwordPlain: 'Inthara@Driver2026!',
      pin: '5500',
      displayName: 'นายสมศักดิ์ ขับดี (พนักงานขับรถส่งน้ำ GPS)',
      role: 'driver',
      active: 'YES',
      dashboardNote: 'เห็นเฉพาะแดชบอร์ดภารกิจจัดส่งน้ำประจำวัน, ระยะทาง GPS, จำนวนถังขึ้นรถ และยอดถังค้างรายร้าน (ไม่เห็นข้อมูลการเงิน/ต้นทุน)'
    }
  ];
}

// Export users list to Excel (.xlsx) so user can view & edit in Excel or Google Sheets
function writeUsersToExcel(usersList) {
  const rows = usersList.map((u, idx) => ({
    'ลำดับระดับ (Level)': u.level || (idx + 1),
    'ชื่อผู้ใช้ (Username)': u.username,
    'รหัสผ่าน (Password_แก้ไขได้)': u.passwordPlain || 'Inthara@2026!',
    'รหัส_PIN_4_หลัก (PIN_แก้ไขได้)': String(u.pin || '0000'),
    'ชื่อแสดงในระบบ (Display_Name)': u.displayName,
    'รหัสสิทธิ์ (Role_Key)': u.role,
    'สถานะเปิดใช้งาน (Active_YES_NO)': u.active === false || u.active === 'NO' ? 'NO' : 'YES',
    'การแสดงผลหน้าแดชบอร์ด (Dashboard_Scope)': u.dashboardNote || ROLE_PERMISSIONS[u.role]?.roleName || ''
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [
    { wch: 18 },
    { wch: 20 },
    { wch: 24 },
    { wch: 24 },
    { wch: 42 },
    { wch: 16 },
    { wch: 24 },
    { wch: 70 }
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'Users_Passwords');
  XLSX.writeFile(wb, EXCEL_USER_FILE);
  if (fs.existsSync(DATA_DIR)) {
    XLSX.writeFile(wb, EXCEL_DATA_COPY);
  }
}

// Read users from Excel (.xlsx) if modified by user, and sync into PBKDF2 security store
function syncUsersFromExcelIfPresent(secData) {
  const targetExcel = fs.existsSync(EXCEL_USER_FILE)
    ? EXCEL_USER_FILE
    : (fs.existsSync(EXCEL_DATA_COPY) ? EXCEL_DATA_COPY : null);

  if (!targetExcel) {
    writeUsersToExcel(secData.users);
    return secData;
  }

  try {
    const wb = XLSX.readFile(targetExcel);
    const sheetName = wb.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]);
    if (!rows || rows.length === 0) return secData;

    const updatedUsers = rows.map((r, idx) => {
      const username = String(r['ชื่อผู้ใช้ (Username)'] || '').trim();
      const passwordPlain = String(r['รหัสผ่าน (Password_แก้ไขได้)'] || '').trim();
      const pin = String(r['รหัส_PIN_4_หลัก (PIN_แก้ไขได้)'] || '').trim();
      const displayName = String(r['ชื่อแสดงในระบบ (Display_Name)'] || username).trim();
      const role = String(r['รหัสสิทธิ์ (Role_Key)'] || 'driver').trim();
      const activeStr = String(r['สถานะเปิดใช้งาน (Active_YES_NO)'] || 'YES').trim().toUpperCase();
      const dashboardNote = String(r['การแสดงผลหน้าแดชบอร์ด (Dashboard_Scope)'] || '').trim();

      const existing = secData.users.find(u => u.username === username);
      const { salt, hash } = hashPassword(passwordPlain);

      return {
        level: Number(r['ลำดับระดับ (Level)'] || (idx + 1)),
        username,
        displayName,
        role: ROLE_PERMISSIONS[role] ? role : 'driver',
        pin,
        passwordPlain,
        salt,
        hash,
        active: activeStr !== 'NO',
        dashboardNote,
        failedAttempts: existing ? existing.failedAttempts : 0,
        lockUntil: existing ? existing.lockUntil : null
      };
    }).filter(u => u.username);

    if (updatedUsers.length > 0) {
      secData.users = updatedUsers;
      fs.writeFileSync(SEC_FILE, JSON.stringify(secData, null, 2), 'utf8');
    }
  } catch (err) {
    console.error('Excel read warning:', err.message);
  }
  return secData;
}

function getInitialSecurityData() {
  const secretKey = crypto.randomBytes(32).toString('hex');
  const plainDefaults = getDefaultUsersPlain();
  const defaultUsers = plainDefaults.map(u => ({
    ...u,
    ...hashPassword(u.passwordPlain),
    active: true,
    failedAttempts: 0,
    lockUntil: null
  }));

  return {
    secretKey,
    users: defaultUsers,
    auditLogs: [
      {
        id: 'SEC-INIT',
        timestamp: new Date().toISOString(),
        username: 'SYSTEM',
        role: 'executive',
        action: 'EXCEL_AUTH_INITIALIZED',
        ip: '127.0.0.1',
        status: 'SUCCESS',
        detail: 'สร้างและเชื่อมต่อไฟล์ Excel เก็บรหัสผ่าน (Inthara_Users_Passwords.xlsx) พร้อมระบบ PBKDF2-SHA512'
      }
    ]
  };
}

function loadSecurityDB() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  let secData;
  if (!fs.existsSync(SEC_FILE)) {
    secData = getInitialSecurityData();
    fs.writeFileSync(SEC_FILE, JSON.stringify(secData, null, 2), 'utf8');
    writeUsersToExcel(secData.users);
  } else {
    try {
      secData = JSON.parse(fs.readFileSync(SEC_FILE, 'utf8'));
    } catch (e) {
      secData = getInitialSecurityData();
    }
  }
  // Always ensure Excel file exists and sync any external Excel edits
  if (!fs.existsSync(EXCEL_USER_FILE)) {
    writeUsersToExcel(secData.users);
  } else {
    secData = syncUsersFromExcelIfPresent(secData);
  }
  return secData;
}

function saveSecurityDB(secData, alsoWriteExcel = true) {
  fs.writeFileSync(SEC_FILE, JSON.stringify(secData, null, 2), 'utf8');
  if (alsoWriteExcel) {
    writeUsersToExcel(secData.users);
  }
}

function signToken(payload, secretKey) {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secretKey).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verifyToken(token, secretKey) {
  if (!token || !token.includes('.')) return null;
  const [data, sig] = token.split('.');
  const expectedSig = crypto.createHmac('sha256', secretKey).update(data).digest('base64url');
  if (sig !== expectedSig) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

function recordAudit(secData, username, role, action, ip, status, detail) {
  secData.auditLogs.unshift({
    id: 'AUD-' + Date.now().toString().slice(-6),
    timestamp: new Date().toISOString(),
    username,
    role,
    action,
    ip: ip || '127.0.0.1',
    status,
    detail
  });
  if (secData.auditLogs.length > 250) {
    secData.auditLogs = secData.auditLogs.slice(0, 250);
  }
  saveSecurityDB(secData, false);
}

module.exports = {
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
  SEC_FILE,
  EXCEL_USER_FILE,
  EXCEL_DATA_COPY
};
