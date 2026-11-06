/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ColorMixEntry,
  IncomingLotRecord,
  LabTestStatus,
  VarietyCode,
} from '../types/qc';

const THAI_MONTHS_SHORT = [
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
];

/**
 * Format ISO date string (YYYY-MM-DD or full ISO) to Thai Buddhist Era date string (e.g., "3 พ.ย. 2569")
 */
export function formatThaiDate(isoDate?: string | null): string {
  if (!isoDate) return '-';
  try {
    const raw = isoDate.slice(0, 10);
    const parts = raw.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      if (!isNaN(year) && !isNaN(month) && !isNaN(day) && month >= 0 && month < 12) {
        const thaiYear = year + 543;
        return `${day} ${THAI_MONTHS_SHORT[month]} ${thaiYear}`;
      }
    }
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return isoDate;
    const day = d.getDate();
    const month = THAI_MONTHS_SHORT[d.getMonth()];
    const thaiYear = d.getFullYear() + 543;
    return `${day} ${month} ${thaiYear}`;
  } catch {
    return isoDate || '-';
  }
}

/**
 * Returns current local date in YYYY-MM-DD format (e.g. '2026-11-06')
 */
export function getTodayIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Converts an ISO date string (YYYY-MM-DD) to YYMMDD format (e.g., '2026-11-03' -> '261103')
 */
export function formatDateToYYMMDD(isoDate: string): string {
  if (!isoDate) return '';
  const clean = isoDate.slice(0, 10).replace(/[^0-9]/g, '');
  if (clean.length === 8) {
    return clean.slice(2);
  }
  return clean;
}

/**
 * Adds a given number of days to an ISO date string (YYYY-MM-DD)
 */
export function addDaysToIsoDate(isoDate: string, days: number): string {
  if (!isoDate) return '';
  try {
    const [year, month, day] = isoDate.slice(0, 10).split('-').map(Number);
    const d = new Date(year, month - 1, day);
    d.setDate(d.getDate() + days);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dt = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dt}`;
  } catch {
    return isoDate;
  }
}

/**
 * Calculates number of days between two ISO date strings (date2 - date1)
 */
export function daysBetweenIsoDates(date1: string, date2: string): number {
  if (!date1 || !date2) return 0;
  try {
    const [y1, m1, d1] = date1.slice(0, 10).split('-').map(Number);
    const [y2, m2, d2] = date2.slice(0, 10).split('-').map(Number);
    const t1 = new Date(y1, m1 - 1, d1).getTime();
    const t2 = new Date(y2, m2 - 1, d2).getTime();
    return Math.round((t2 - t1) / (1000 * 60 * 60 * 24));
  } catch {
    return 0;
  }
}

/**
 * Extracts an array of lot numbers from a color mix entry
 */
export function getMixLotNumbers(
  entry?: { lotNumbers?: string[]; lotNumber?: string } | null
): string[] {
  if (!entry) return [];
  if (Array.isArray(entry.lotNumbers) && entry.lotNumbers.length > 0) {
    return entry.lotNumbers.map((s) => String(s).trim()).filter(Boolean);
  }
  if (typeof entry.lotNumber === 'string' && entry.lotNumber.trim()) {
    return entry.lotNumber
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * Generates the next sequential incoming lot number in format LOT-YYMMDD-VV###
 */
export function generateNextLotNumber(
  receivedDate: string,
  varietyCode: VarietyCode | string,
  existingLots: IncomingLotRecord[] | { lotNumber: string }[] = [],
  offset: number = 0
): string {
  const yymmdd = formatDateToYYMMDD(
    receivedDate || new Date().toISOString().slice(0, 10)
  );
  const prefix = `LOT-${yymmdd}-${varietyCode}`;
  let maxSeq = 0;
  for (const lot of existingLots) {
    if (lot.lotNumber && lot.lotNumber.startsWith(prefix)) {
      const seqStr = lot.lotNumber.slice(prefix.length);
      const num = parseInt(seqStr, 10);
      if (!isNaN(num) && num > maxSeq) {
        maxSeq = num;
      }
    }
  }
  const nextSeq = maxSeq + 1 + (offset || 0);
  return `${prefix}${String(nextSeq).padStart(3, '0')}`;
}

/**
 * Evaluates Brix sweetness level (> 6.0 is PASS)
 */
export function evaluateLabBrixStatus(
  brixValue: number | null | undefined
): LabTestStatus {
  if (brixValue === null || brixValue === undefined || isNaN(brixValue)) {
    return 'PENDING';
  }
  return brixValue > 6.0 ? 'PASS' : 'FAIL';
}

/**
 * Evaluates the two pesticide test groups (Organophosphate/Carbamate & Organochlorine/Pyrethroid)
 */
export function evaluatePesticideTwoGroups(
  opCb: LabTestStatus | null | undefined,
  ocPy: LabTestStatus | null | undefined
): LabTestStatus {
  if (opCb === 'FAIL' || ocPy === 'FAIL') return 'FAIL';
  if (opCb === 'PASS' && ocPy === 'PASS') return 'PASS';
  return 'PENDING';
}

/**
 * Evaluates overall lab status from Brix and pesticide test results
 */
export function evaluateOverallLabStatus(
  brixStatus: LabTestStatus | null | undefined,
  pesticideStatus: LabTestStatus | null | undefined
): LabTestStatus {
  if (brixStatus === 'FAIL' || pesticideStatus === 'FAIL') return 'FAIL';
  if (brixStatus === 'PASS' && pesticideStatus === 'PASS') return 'PASS';
  return 'PENDING';
}

export interface ColorMixValidationResult {
  isValid: boolean;
  activeCount: number;
  hasGreen: boolean;
  hasRedOrPink: boolean;
  isWarmTrioWithoutGreen: boolean;
  reasons: string[];
  totalPercentage: number;
}

/**
 * Evaluates CP ALL 7-Eleven Cherry Tomato 5-Variety Color Mix Rules:
 * 1. Minimum 3 varieties required (3 to 5 colors)
 * 2. Must contain Green (GR - Gourami)
 * 3. Must contain Red (SL - Solarino)
 * 4. Must NOT have warm trio (Yellow BL + Red SL + Orange FV) without Green (GR)
 */
export function evaluateColorMixRules(
  colorMix: (ColorMixEntry | { varietyCode: VarietyCode | string; percentage: number | string })[] = []
): ColorMixValidationResult {
  const activeEntries = colorMix.filter((c) => Number(c.percentage) > 0);
  const activeCodes = new Set(activeEntries.map((c) => c.varietyCode));
  const activeCount = activeEntries.length;
  const totalPercentage = activeEntries.reduce(
    (acc, c) => acc + (Number(c.percentage) || 0),
    0
  );

  const hasGreen = activeCodes.has('GR');
  const hasRedOrPink = activeCodes.has('SL');
  const hasOrange = activeCodes.has('FV');
  const hasYellow = activeCodes.has('BL');

  const isWarmTrioWithoutGreen =
    hasYellow && hasRedOrPink && hasOrange && !hasGreen;

  const reasons: string[] = [];
  if (activeCount < 3) {
    reasons.push(
      `ต้องคละสีขั้นต่ำ 3 สายพันธุ์ขึ้นไป (ปัจจุบันเลือกไว้ ${activeCount} สี)`
    );
  }
  if (!hasGreen) {
    reasons.push('ต้องมีสีเขียว (กรูรามิ - GR) แซมในส่วนผสมตามมาตรฐาน');
  }
  if (!hasRedOrPink) {
    reasons.push('ต้องมีสีแดง (โซลาริโน่ - SL) เป็นสีหลัก');
  }
  if (isWarmTrioWithoutGreen) {
    reasons.push(
      'ผิดเงื่อนไขการคละสี: ห้ามมีสีเหลือง (BL) + แดง (SL) + ส้ม (FV) ร่วมกันโดยไม่มีสีเขียว (GR) มาแซม'
    );
  }

  const isValid =
    activeCount >= 3 &&
    activeCount <= 5 &&
    hasGreen &&
    hasRedOrPink &&
    !isWarmTrioWithoutGreen;

  return {
    isValid,
    activeCount,
    hasGreen,
    hasRedOrPink,
    isWarmTrioWithoutGreen,
    reasons,
    totalPercentage,
  };
}

/**
 * Returns current local time in HH:mm format (e.g. '14:25')
 */
export function getCurrentTimeHHMM(): string {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}
