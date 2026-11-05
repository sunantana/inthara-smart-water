/**
 * ตัวแปลงเงิน — ระบบเก็บเงินเป็น integer "สตางค์" ใน DB (02 §4 ข้อ 3)
 * ห้ามคำนวณเงินด้วย float โดยตรง ให้แปลงเป็นสตางค์ก่อนทุกครั้ง
 */

const DECIMAL_PATTERN = /^([+-])?(\d+)(?:\.(\d*))?$/;

/**
 * แปลงค่าที่รับมาเป็นสตริงทศนิยม (number/string เท่านั้น)
 * @param {unknown} value
 * @returns {string}
 */
function toDecimalString(value) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError(`bahtToSatang: ค่าไม่ใช่ตัวเลขที่ใช้ได้ (${String(value)})`);
    }
    return value.toString();
  }
  if (typeof value === 'string') {
    const trimmed = value.trim().replace(/,/g, '');
    if (trimmed === '') throw new TypeError('bahtToSatang: สตริงว่างไม่ใช่จำนวนเงิน');
    return trimmed;
  }
  throw new TypeError(`bahtToSatang: รับได้เฉพาะ number หรือ string (ได้ ${typeof value})`);
}

/**
 * แปลงบาท → สตางค์ (integer)
 * - ปัดเศษทศนิยมตำแหน่งที่ 3 ขึ้นเมื่อ >= 5 (half-up, ออกจากศูนย์)
 * - ใช้วิธีแปลงจากสตริงตัวเลขเพื่อไม่ให้เกิด float error (0.1 + 0.2 → 30 สตางค์)
 * - รองรับค่าลบและศูนย์
 * - ไม่รับสัญกรณ์ยกกำลัง เช่น 1e21 (โยน TypeError)
 * @param {number|string} value จำนวนเงินหน่วยบาท
 * @returns {number} จำนวนเต็มหน่วยสตางค์
 */
export function bahtToSatang(value) {
  const text = toDecimalString(value);
  const match = DECIMAL_PATTERN.exec(text);
  if (!match) {
    throw new TypeError(`bahtToSatang: รูปแบบจำนวนเงินไม่ถูกต้อง (${text})`);
  }

  const [, signText, intText, fracText = ''] = match;
  const negative = signText === '-';

  const satangDigits = (fracText + '00').slice(0, 2);
  const remainder = fracText.slice(2);

  let satang = Number(intText) * 100 + Number(satangDigits);
  if (remainder !== '' && Number(remainder[0]) >= 5) satang += 1;

  if (negative) return satang === 0 ? 0 : -satang;
  return satang;
}

/**
 * แปลงสตางค์ (integer) → บาท (number)
 * @param {number} satang
 * @returns {number}
 */
export function satangToBaht(satang) {
  if (typeof satang !== 'number' || !Number.isInteger(satang)) {
    throw new TypeError(`satangToBaht: ต้องเป็นจำนวนเต็มหน่วยสตางค์ (ได้ ${String(satang)})`);
  }
  return satang / 100;
}

const bahtFormatter = new Intl.NumberFormat('th-TH', {
  numberingSystem: 'latn',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * จัดรูปแบบสตางค์เป็นข้อความบาทที่มีตัวคั่นหลักพัน
 * @param {number} satang
 * @param {{ symbol?: boolean }} [options] symbol=true → เติม ฿ ข้างหน้า
 * @returns {string} เช่น 1234567 → "12,345.67"
 */
export function formatBaht(satang, options = {}) {
  const { symbol = false } = options;
  const text = bahtFormatter.format(satangToBaht(satang));
  return symbol ? `฿${text}` : text;
}

export default { bahtToSatang, satangToBaht, formatBaht };
