/** Indian mobile numbers in E.164 (+91 then 10 digits starting 6–9). */
const INDIAN_MOBILE = /^\+91[6-9]\d{9}$/;
/** Synthetic numbers used in dev and tests (tools/seed). No real mobile starts with 5. */
export const SYNTHETIC_PREFIX = '+9155';
const SYNTHETIC = /^\+9155\d{8}$/;

/** Accepts common spellings ("98765 43210", "+91-98765-43210", "09876543210") → E.164. */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/[\s()-]/g, '');
  let e164: string;
  if (/^\+91\d{10}$/.test(digits)) e164 = digits;
  else if (/^91\d{10}$/.test(digits)) e164 = `+${digits}`;
  else if (/^0\d{10}$/.test(digits)) e164 = `+91${digits.slice(1)}`;
  else if (/^\d{10}$/.test(digits)) e164 = `+91${digits}`;
  else return null;
  return INDIAN_MOBILE.test(e164) || SYNTHETIC.test(e164) ? e164 : null;
}

export const isSyntheticPhone = (e164: string): boolean => SYNTHETIC.test(e164);
