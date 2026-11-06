const DECIMAL_PATTERN = /^([+-])?(\d+)(?:\.(\d*))?$/;

export function bahtToSatang(value: number | string): number {
  const raw = typeof value === 'number' ? value.toString() : value.trim().replace(/,/g, '');
  if (!raw) return 0;
  const match = DECIMAL_PATTERN.exec(raw);
  if (!match) {
    throw new Error(`จำนวนเงินไม่ถูกต้อง: ${value}`);
  }
  const [, sign, intPart, fracPart = ''] = match;
  const satangDigits = (fracPart + '00').slice(0, 2);
  const remainder = fracPart.slice(2);
  let satang = Number(intPart) * 100 + Number(satangDigits);
  if (remainder !== '' && Number(remainder[0]) >= 5) {
    satang += 1;
  }
  return sign === '-' ? (satang === 0 ? 0 : -satang) : satang;
}

export function satangToBaht(satang: number | null | undefined): number {
  if (typeof satang !== 'number' || !Number.isFinite(satang)) return 0;
  return satang / 100;
}

const bahtFormatter = new Intl.NumberFormat('th-TH', {
  numberingSystem: 'latn',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatBaht(satang: number | null | undefined, symbol = false): string {
  const text = bahtFormatter.format(satangToBaht(satang));
  return symbol ? `฿${text}` : text;
}
