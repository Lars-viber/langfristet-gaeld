import type Decimal from 'decimal.js';
import { D } from '../domain/decimal';

const DANISH_NUMBER = /^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d+)?$/;

/** Parse an unsigned Danish decimal without rounding or native number conversion. */
export function parseDanishNumber(raw: string): Decimal | null {
  if (raw.length > 2048) return null;
  const text = raw.trim();
  if (!DANISH_NUMBER.test(text)) return null;
  const value = new D(text.replaceAll('.', '').replace(',', '.'));
  return value.isFinite() ? value : null;
}
