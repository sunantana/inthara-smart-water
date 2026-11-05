/**
 * รายการเมนู 16 โมดูลตาม docs/specs/01_SRS_ความต้องการระบบ.md หัวข้อ 3
 * ใช้ร่วมกันระหว่าง sidebar และหน้า placeholder ของแต่ละโมดูล
 */
export type ModuleCode =
  | 'AUTH'
  | 'CRM'
  | 'PRC'
  | 'ORD'
  | 'DLV'
  | 'FIN'
  | 'TMS'
  | 'PRD'
  | 'INV'
  | 'MNT'
  | 'AST'
  | 'EMP'
  | 'EXP'
  | 'PORTAL'
  | 'RPT'
  | 'BKP';

export interface ModuleMeta {
  /** รหัสโมดูลตาม SRS */
  code: ModuleCode;
  /** ชื่อเมนูภาษาไทย */
  label: string;
  /** route หลักของโมดูล */
  path: string;
  /** หัวข้อใน SRS ที่เป็นความต้องการของโมดูลนี้ */
  srsSection: string;
  /** คำอธิบายสั้นว่าหน้านี้จะทำอะไร */
  description: string;
}

export const MODULES: ModuleMeta[] = [
  {
    code: 'RPT',
    label: 'แดชบอร์ด & รายงาน',
    path: '/dashboard',
    srsSection: '3.15',
    description: 'สรุปยอดขาย/สต็อก/แจ้งเตือนในหน้าเดียว และรายงานยอดขายตามช่วงเวลา',
  },
  {
    code: 'CRM',
    label: 'ทะเบียนลูกค้า',
    path: '/customers',
    srsSection: '3.2',
    description: 'ข้อมูลลูกค้า ที่อยู่ พิกัด ราคาต่อราย และยอดถังค้าง/มัดจำ',
  },
  {
    code: 'PRC',
    label: 'ราคา & Price Tier',
    path: '/price-tiers',
    srsSection: '3.3',
    description: 'ชุดราคาตามกลุ่มลูกค้า และราคาเฉพาะรายต่อ SKU',
  },
  {
    code: 'ORD',
    label: 'ออเดอร์',
    path: '/orders',
    srsSection: '3.4',
    description: 'สร้าง/แก้/ยืนยัน/ยกเลิกออเดอร์ พร้อมใบเส้นทางส่งของรายวัน',
  },
  {
    code: 'DLV',
    label: 'ส่งของ & Check-in',
    path: '/checkins',
    srsSection: '3.5',
    description: 'ปิดงานส่งของหน้างาน: ตัดสต็อก รับถังคืน เก็บเงิน และออกใบเสร็จในครั้งเดียว',
  },
  {
    code: 'FIN',
    label: 'การเงิน & ปิดบิล',
    path: '/billing',
    srsSection: '3.6',
    description: 'รายการค้างชำระ อายุหนี้ ปิดยอดแบบ FIFO และสลิปเก็บเงิน',
  },
  {
    code: 'TMS',
    label: 'เส้นทางรถส่ง',
    path: '/tms',
    srsSection: '3.7',
    description: 'วางแผนเส้นทางบนแผนที่ บันทึกเที่ยว ระยะทาง น้ำมัน และลำดับป้าย',
  },
  {
    code: 'PRD',
    label: 'ผลิต & คุณภาพน้ำ',
    path: '/production',
    srsSection: '3.8',
    description: 'แผนผลิตรายกะ ค่า TDS/pH การตรวจ QA และการรับ FG เข้าสต็อก',
  },
  {
    code: 'INV',
    label: 'สต็อก & บรรจุภัณฑ์',
    path: '/inventory',
    srsSection: '3.9',
    description: 'สต็อกคงเหลือทุก SKU ประวัติ movement และ lot บรรจุภัณฑ์แบบ FIFO',
  },
  {
    code: 'MNT',
    label: 'เครื่องจักร & ซ่อมบำรุง',
    path: '/maintenance',
    srsSection: '3.10',
    description: 'ทะเบียนเครื่องจักร ประวัติซ่อม/PM และแจ้งเตือนถึงกำหนด PM',
  },
  {
    code: 'AST',
    label: 'สินทรัพย์ & ค่าเสื่อมราคา',
    path: '/assets',
    srsSection: '3.11',
    description: 'ทะเบียนสินทรัพย์ รถส่งของ และการคำนวณค่าเสื่อมตามวันที่',
  },
  {
    code: 'EMP',
    label: 'พนักงาน',
    path: '/employees',
    srsSection: '3.12',
    description: 'ข้อมูลพนักงาน ค่าจ้าง ใบขับขี่ และการแจ้งเตือนใบขับขี่ใกล้หมดอายุ',
  },
  {
    code: 'EXP',
    label: 'ค่าใช้จ่าย & ต้นทุน',
    path: '/expenses',
    srsSection: '3.13',
    description: 'บันทึกค่าใช้จ่ายทุกประเภท และต้นทุนต่อเที่ยว/ต่อเครื่อง',
  },
  {
    code: 'PORTAL',
    label: 'พอร์ทัลลูกค้า (จัดการ)',
    path: '/portal-admin',
    srsSection: '3.14',
    description: 'ลงทะเบียน/รีเซ็ต PIN ให้ลูกค้า และตรวจสถานะการเข้าใช้พอร์ทัล',
  },
  {
    code: 'AUTH',
    label: 'ผู้ใช้ & ความปลอดภัย',
    path: '/users',
    srsSection: '3.1',
    description: 'จัดการผู้ใช้ บทบาท การปลดล็อกบัญชี และดู audit log',
  },
  {
    code: 'BKP',
    label: 'สำรองข้อมูล',
    path: '/backup',
    srsSection: '3.16',
    description: 'สำรอง/กู้คืนฐานข้อมูล และดูประวัติการสำรองล่าสุด',
  },
];

export function findModule(code: ModuleCode): ModuleMeta {
  const found = MODULES.find((module) => module.code === code);
  if (!found) throw new Error(`ไม่พบโมดูลรหัส ${code}`);
  return found;
}
