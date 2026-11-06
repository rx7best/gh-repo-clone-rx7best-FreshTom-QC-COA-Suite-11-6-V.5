import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Barcode,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Download,
  Edit,
  ExternalLink,
  FileCheck2,
  FileSpreadsheet,
  Info,
  Lock,
  MessageSquare,
  PackageCheck,
  Plus,
  Printer,
  RotateCcw,
  Scale,
  ShieldAlert,
  SlidersHorizontal,
  Thermometer,
  X,
  XCircle,
} from 'lucide-react';
import { exportElementToPdf, printWithClass } from '../utils/pdfExport';
import { exportOutgoingRecordsToCsv } from '../utils/csvExport';
import {
  ChecklistDefectRecord,
  ColorMixEntry,
  IncomingLotRecord,
  LabRecord,
  OutgoingRecord,
  TOMATO_VARIETIES,
  VARIETY_ORDER,
  VarietyCode,
} from '../types/qc';
import {
  addDaysToIsoDate,
  daysBetweenIsoDates,
  evaluateColorMixRules,
  formatDateToYYMMDD,
  formatThaiDate,
  getCurrentTimeHHMM,
  getMixLotNumbers,
  getTodayIsoDate,
} from '../utils/lotHelpers';
import { CP_ALL_DC_OPTIONS } from '../data/initialData';

import { NotificationVariant } from './PopupNotification';

interface OutgoingQCViewProps {
  lots: IncomingLotRecord[];
  labRecords: LabRecord[];
  outgoingRecords: OutgoingRecord[];
  preselectedOqcId?: string | null;
  onSaveOutgoing: (record: OutgoingRecord) => void;
  onOpenCOA: (oqcId: string) => void;
  onNotify: (title: string, message: string, variant?: NotificationVariant) => void;
}

type MixPresetMode = 'preset_5' | 'preset_4' | 'preset_3' | 'custom';

const PRESET_5_COLORS: VarietyCode[] = ['SL', 'FV', 'BL', 'GR', 'CM'];
const PRESET_4_GREEN_MIX: VarietyCode[] = ['SL', 'FV', 'BL', 'GR'];
const PRESET_3_RYG: VarietyCode[] = ['SL', 'BL', 'GR'];

function matchesPreset(
  mix: ColorMixEntry[],
  target: VarietyCode[]
): boolean {
  const activeCodes = mix
    .filter((m) => (Number(m.percentage) || 0) > 0)
    .map((m) => m.varietyCode);
  if (activeCodes.length !== target.length) return false;
  return target.every((code) => activeCodes.includes(code));
}

function detectMixPresetMode(mix: ColorMixEntry[]): MixPresetMode {
  if (matchesPreset(mix, PRESET_5_COLORS)) return 'preset_5';
  if (matchesPreset(mix, PRESET_4_GREEN_MIX)) return 'preset_4';
  if (matchesPreset(mix, PRESET_3_RYG)) return 'preset_3';
  return 'custom';
}

interface ChecklistStandardMeta {
  itemNumber: number;
  title: string;
  categoryTag: string;
  criterion7Eleven: string;
  criterionSummary: string;
  commonReasons: string[];
  commonActions: string[];
}

export const CHECKLIST_STANDARDS: Record<number, ChecklistStandardMeta> = {
  1: {
    itemNumber: 1,
    title: 'การปิดผนึกฝากล่อง (Lid Sealing)',
    categoryTag: 'ตรวจพินิจ (Visual)',
    criterion7Eleven: 'ฝาล็อคสนิท 4 มุม แน่นหนา ไม่เผยอ/ฉีกขาด',
    criterionSummary: 'ฝากล่อง PET ล็อคสนิทครบ 4 มุม ไม่เผยอ',
    commonReasons: [
      'ฝากล่องปิดไม่สนิท มีมุมเผยอ 1-2 ด้าน',
      'สลักล็อคฝากล่องหักชำรุด',
      'ฝากล่องฉีกขาดจากการกดทับ',
      'กล่องบิดเบี้ยวทำให้ฝาปิดไม่เข้าล็อค',
    ],
    commonActions: [
      'คัดแยกกล่องที่ฝาเผยอออกและเปลี่ยนกล่อง PET ใหม่ทันที',
      'ตรวจสอบเครื่องรีดล็อคฝาและปรับแรงกดให้เข้าล็อคสนิท',
      'ตรวจสอบซ้ำ 100% ในรอบบรรจุนี้ก่อนปล่อยจัดส่ง',
      'อบรมพนักงานบรรจุให้ตรวจสอบเสียงคลิกล็อคทุกกล่อง',
    ],
  },
  2: {
    itemNumber: 2,
    title: 'การผสมสี 3–5 สายพันธุ์ (Color Mix 3–5 Varieties)',
    categoryTag: 'คละสี (Variety Mix)',
    criterion7Eleven: 'คละ 3–5 สี บังคับเขียวคู่แดง รวมครบ 100%',
    criterionSummary: 'คละ 3-5 สี บังคับเขียวคู่แดง สัดส่วนรวม 100%',
    commonReasons: [
      'คละสีไม่ครบ 3 สายพันธุ์ (คละได้เพียง 1-2 สี)',
      'ขาดสีบังคับ (ไม่มีสีเขียวกรูรามิ หรือไม่มีสีแดง/ชมพูโซลาริโน่)',
      'ผลรวมสัดส่วนเปอร์เซ็นต์ไม่ครบ 100%',
      'ล็อตวัตถุดิบสีที่ใช้ไม่ผ่านเกณฑ์ผลวิเคราะห์แล็บ',
    ],
    commonActions: [
      'ปรับสูตรสัดส่วนการผสมสีให้ครบ 3-5 สี และผลรวมเท่ากับ 100%',
      'เติมมะเขือเทศสีเขียว (Green Ruby) หรือสีแดง (Sweet Lucy) ให้ครบตามเกณฑ์บังคับ',
      'สลับเปลี่ยนไปใช้ล็อตวัตถุดิบที่ผ่านผลวิเคราะห์แล็บ 100%',
      'ตรวจสอบและชั่งคัดแยกสีซ้ำก่อนบรรจุลงกล่อง',
    ],
  },
  3: {
    itemNumber: 3,
    title: 'ฉลาก MFG/EXP (+6 วัน) & ข้อความ "ล้างก่อนรับประทาน"',
    categoryTag: 'ตรวจฉลาก (Label)',
    criterion7Eleven: 'อายุ 6 วัน (MFG+6) & ระบุ "ล้างก่อนรับประทาน"',
    criterionSummary: 'อายุสินค้า 6 วันนับจากผลิต & ระบุ "ล้างก่อนรับประทาน"',
    commonReasons: [
      'วันหมดอายุบนฉลากคำนวณเกิน 6 วันจากวันผลิต',
      'ตกหล่นข้อความบังคับ "ล้างก่อนรับประทาน"',
      'ตัวพิมพ์วันที่บนฉลากเลือนราง ไม่ชัดเจน',
      'ติดฉลากกลับด้านหรือฉลากยับย่นบดบังข้อความ',
    ],
    commonActions: [
      'สั่งพิมพ์ฉลากใหม่ที่ระบุวันผลิตและ EXP +6 วันถูกต้อง และติดทับทันที',
      'แก้ไขแบบฉลากให้มีข้อความ "ล้างก่อนรับประทาน" และพิมพ์ติดใหม่ทุกแพ็ค',
      'เปลี่ยนตลับหมึกเครื่องพิมพ์ฉลากและทดสอบความคมชัด',
      'กักสินค้าและตรวจสอบฉลาก 100% ก่อนยกเลิกการ HOLD',
    ],
  },
  4: {
    itemNumber: 4,
    title: 'น้ำหนักสุทธิสินค้า (Net Weight)',
    categoryTag: 'ชั่งวัด (Weight)',
    criterion7Eleven: 'น้ำหนักสุทธิ ≥ 140.0 g/กล่อง ทุกแพ็ค',
    criterionSummary: 'น้ำหนักสุทธิ ≥ 140.0 กรัมต่อแพ็ค',
    commonReasons: [
      'น้ำหนักสุทธิสุ่มตรวจได้ต่ำกว่า 140 กรัม (เช่น 136-138 กรัม)',
      'การตั้งค่าน้ำหนักบนเครื่องชั่งคัดแยกเบี่ยงเบน',
      'ขนาดผลมะเขือเทศคละไม่ได้สัดส่วนน้ำหนักตามเกณฑ์',
      'ความคลาดเคลื่อนของเครื่องชั่งดิจิทัล',
    ],
    commonActions: [
      'ชั่งตรวจสอบ 100% และเติมผลมะเขือเทศให้ได้น้ำหนัก ≥ 140 กรัมทุกแพ็ค',
      'ปรับเทียบ (Calibrate) เครื่องชั่งดิจิทัลด้วยตุ้มน้ำหนักมาตรฐาน 200 กรัม',
      'คัดแยกแพ็คที่น้ำหนักต่ำกว่าเกณฑ์ออกเพื่อบรรจุใหม่',
      'เพิ่มความถี่ในการสุ่มตรวจน้ำหนักระหว่างบรรจุเป็นทุกๆ 50 แพ็ค',
    ],
  },
  5: {
    itemNumber: 5,
    title: 'ลักษณะทางกายภาพของสินค้า (Physical Quality)',
    categoryTag: 'ตรวจพินิจ (Physical)',
    criterion7Eleven: 'ผลสดตึง ขั้วเขียว ไร้หยดน้ำ/ผลช้ำ สิ่งแปลกปลอม 0%',
    criterionSummary: 'ผลสดตึง ไร้หยดน้ำ ไม่พบผลช้ำหรือเชื้อรา',
    commonReasons: [
      'พบหยดน้ำเกาะภายในกล่องบรรจุภัณฑ์เนื่องจากอุณหภูมิเปลี่ยนเฉียบพลัน',
      'พบผลแตกหรือช้ำบริเวณขั้วผล',
      'มีผลเหี่ยวหรือสีไม่สม่ำเสมอในแพ็ค',
      'พบขั้วหลุดเกิน 10% หรือขั้วแห้งดำ',
    ],
    commonActions: [
      'คัดแยกผลที่มีรอยแตกหรือช้ำออก 100% และบรรจุผลสดใหม่ทดแทน',
      'เปิดระบายอากาศและเช็ดแห้งในห้องควบคุมความเย็นเพื่อป้องกันหยดน้ำ',
      'ปรับลดแรงกระแทกระหว่างสายพานลำเลียงบรรจุ',
      'สุ่มตรวจเข้มงวด 2 เท่าก่อนนำจัดเรียงลงตะกร้าขนส่ง',
    ],
  },
  6: {
    itemNumber: 6,
    title: 'จำนวนสินค้าตรงตามใบสั่งซื้อ (Order & Actual Quantity)',
    categoryTag: 'ยอดส่งมอบ (Delivery)',
    criterion7Eleven: 'ยอดส่งมอบตรงตาม PO ครบ 100% ไม่ขาดส่ง',
    criterionSummary: 'ยอดบรรจุจริงตรงตาม PO ครบ 100% ขาดไม่ได้',
    commonReasons: [
      'ยอดบรรจุจริงไม่ครบตามจำนวนสั่งซื้อในใบ PO (ยอดขาด)',
      'จำนวนตะกร้าขนส่งไม่สัมพันธ์กับยอดแพ็คที่บรรจุ',
      'สินค้าชำรุดระหว่างบรรจุทำให้ยอดรวมไม่ครบ',
      'การนับจำนวนแพ็คต่อตะกร้าคลาดเคลื่อน',
    ],
    commonActions: [
      'เร่งบรรจุสินค้าเพิ่มเติมให้ครบตามจำนวนใบสั่งซื้อ PO ก่อนเวลาตัดรอบขนส่ง',
      'ตรวจนับจำนวนแพ็คต่อตะกร้าใหม่ทุกใบและบันทึกยอดจริง',
      'ประสานงานฝ่ายผลิตเพื่อเสริมวัตถุดิบเร่งด่วน',
      'ติดป้ายระบุจำนวนแพ็คที่แน่นอนบนตะกร้าขนส่งทุกใบ',
    ],
  },
  7: {
    itemNumber: 7,
    title: 'อุณหภูมิห้องขณะตรวจ/พักสินค้า (Room Temperature 2–6 °C)',
    categoryTag: 'ควบคุมความเย็น (Cold Chain)',
    criterion7Eleven: 'รักษาอุณหภูมิควบคุมความเย็น 2.0 – 6.0 °C',
    criterionSummary: 'ควบคุมความเย็น 2.0 – 6.0 °C ตลอดการตรวจ',
    commonReasons: [
      'อุณหภูมิห้องตรวจวัดได้สูงกว่า 6.0 °C (เช่น 7.5 °C)',
      'ประตูห้องควบคุมความเย็นเปิดค้างขณะลำเลียงสินค้า',
      'ระบบทำความเย็นห้องตรวจมีปัญหาหรืออยู่ในช่วง Defrost',
      'ตำแหน่งวัดอุณหภูมิใกล้ทางเข้า-ออกหรือจุดรับแดด',
    ],
    commonActions: [
      'ปรับตั้งค่าเครื่องทำความเย็นและรอให้อุณหภูมิลดลงสู่ 2.0-6.0 °C ก่อนปล่อยสินค้า',
      'ปิดม่านริ้วพลาสติกและประตูกันความเย็นทันทีเพื่อรักษาอุณหภูมิ',
      'ย้ายสินค้าไปพักในห้องเย็นหลัก (Cold Storage) ที่มีอุณหภูมิ 3-4 °C ทันที',
      'แจ้งฝ่ายช่างซ่อมบำรุงตรวจสอบระบบทำความเย็นฉุกเฉิน',
    ],
  },
  8: {
    itemNumber: 8,
    title: 'ความสะอาดและความเรียบร้อยของตะกร้าขนส่ง (Crate Sanitization)',
    categoryTag: 'สุขอนามัย (Sanitation)',
    criterion7Eleven: 'ตะกร้าล้างฆ่าเชื้อ แห้งสะอาด เรียงซ้อนมั่นคง',
    criterionSummary: 'ตะกร้าผ่านการล้างฆ่าเชื้อ แห้งสะอาด เรียงซ้อนมั่นคง',
    commonReasons: [
      'พบฝุ่นหรือคราบดินติดบริเวณก้นหรือขอบตะกร้าขนส่ง',
      'ตะกร้ายังมีความชื้นหรือเปียกน้ำจากการล้าง',
      'พบตะกร้ามีรอยแตกหรือบิดเบี้ยวทำให้ซ้อนไม่ลงล็อค',
      'ไม่มีป้ายระบุสถานะผ่านการล้างฆ่าเชื้อ (Sanitized)',
    ],
    commonActions: [
      'เปลี่ยนตะกร้าขนส่งใบใหม่ที่ผ่านการล้างฆ่าเชื้อและแห้งสะอาดทันที',
      'นำตะกร้าที่มีคราบสกปรกกลับไปล้างทำความสะอาดและอบแห้งใหม่',
      'คัดแยกตะกร้าที่แตกหักหรือชำรุดออกจากวงจรการใช้งาน',
      'จัดเรียงตะกร้าซ้อนล็อคให้มั่นคงและติดสายรัดป้องกันการเอียงล้ม',
    ],
  },
};

export const OutgoingQCView: React.FC<OutgoingQCViewProps> = ({
  lots,
  labRecords,
  outgoingRecords,
  preselectedOqcId,
  onSaveOutgoing,
  onOpenCOA,
  onNotify,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isDateManual, setIsDateManual] = useState<boolean>(false);
  const [inspectionDate, setInspectionDate] = useState<string>(() => getTodayIsoDate());
  const [inspectionTime, setInspectionTime] = useState<string>(() => getCurrentTimeHHMM());
  const [isTimeManual, setIsTimeManual] = useState<boolean>(false);

  // Keep inspectionTime synchronized to live clock in real-time when drafting new FG inspections
  useEffect(() => {
    if (editingId || isTimeManual) return;
    setInspectionTime(getCurrentTimeHHMM());
    const interval = setInterval(() => {
      setInspectionTime(getCurrentTimeHHMM());
    }, 10000);
    return () => clearInterval(interval);
  }, [editingId, isTimeManual]);

  // Keep dates synchronized to real-time today when drafting new FG inspections
  useEffect(() => {
    if (editingId || isDateManual) return;
    const today = getTodayIsoDate();
    setInspectionDate(today);
    setMfgDate(today);
    setExpDate(addDaysToIsoDate(today, 6));
  }, [editingId, isDateManual]);

  const [customerName, setCustomerName] = useState<string>(
    'บริษัท ซีพี ออลล์ จำกัด (มหาชน)'
  );
  const [distributionCenter, setDistributionCenter] = useState<string>(
    'DC บางบัวทอง (BTH-DC)'
  );
  const [poNumber, setPoNumber] = useState<string>('');
  const [productName, setProductName] = useState<string>(
    'มะเขือเทศเชอร์รี่คละสีคัดพิเศษ (Medley Cherry Tomato 140 กรัม)'
  );
  const [mfgDate, setMfgDate] = useState<string>(() => getTodayIsoDate());
  const [expDate, setExpDate] = useState<string>(() => addDaysToIsoDate(getTodayIsoDate(), 6)); // 6 วันนับจากการผลิต
  const [productionLotNo, setProductionLotNo] = useState<string>('');

  // 8 OQC Checklists
  // 1. การปิดผนึกฝากล่อง
  const [check1LidSealing, setCheck1LidSealing] = useState<boolean>(true);
  const [check1Note, setCheck1Note] = useState<string>(
    'ฝากล่อง PET ปิดสนิทครบทุกมุม ไม่เผยอหรือฉีกขาด'
  );

  // 2. การผสมสีครบ 3-5 สายพันธุ์ (บังคับมีสีเขียวคู่กับสีแดง/ชมพู)
  const buildDefaultMix = (): ColorMixEntry[] => {
    return VARIETY_ORDER.map((code) => {
      const candidate =
        lots.find((l) => l.varietyCode === code && l.disposition !== 'REJECT') ||
        lots.find((l) => l.varietyCode === code);
      const defaultLots = candidate ? [candidate.lotNumber] : [];
      return {
        varietyCode: code,
        lotNumber: defaultLots.join(', '),
        lotNumbers: defaultLots,
        percentage: 1,
      };
    });
  };

  const [colorMix, setColorMix] = useState<ColorMixEntry[]>(buildDefaultMix);
  const [presetMode, setPresetMode] = useState<MixPresetMode | null>(null);
  const [customMixHint, setCustomMixHint] = useState<string>('');
  const [check2Note, setCheck2Note] = useState<string>(
    'คละ 3-5 สายพันธุ์/สี สัดส่วนครบ 100% บังคับเขียวกรูรามิคู่กับโซลาริโน่แดง'
  );

  // 3. ฉลากระบุวันผลิตและวันหมดอายุ (6 วันนับจากการผลิต) + ข้อความบังคับ "ล้างก่อนรับประทาน"
  const [check3ExpiryLabel, setCheck3ExpiryLabel] = useState<boolean>(true);
  const [check3WashLabel, setCheck3WashLabel] = useState<boolean>(true);
  const [check3Note, setCheck3Note] = useState<string>(
    'ฉลากระบุวันผลิต-วันหมดอายุ (+6 วัน) และข้อความบังคับ "ล้างก่อนรับประทาน" (Wash before consumption) ชัดเจน'
  );

  // 4. น้ำหนักสุทธิ (140 กรัม) และสุ่มชั่งน้ำหนัก 10–20 กล่อง
  const [netWeightG, setNetWeightG] = useState<number>(142);
  const [sampleWeights, setSampleWeights] = useState<number[]>([
    142.5, 143.0, 142.8, 144.0, 143.5, 142.0, 144.2, 143.1, 142.9, 143.5,
  ]);
  const [weightSampleStatus, setWeightSampleStatus] = useState<'PASS' | 'HOLD_REJECT'>('PASS');
  const [isWeightSamplingModalOpen, setIsWeightSamplingModalOpen] = useState<boolean>(false);
  const [sampleCountInput, setSampleCountInput] = useState<number>(10);
  const [tempSampleWeights, setTempSampleWeights] = useState<number[]>([]);
  const [check4Note, setCheck4Note] = useState<string>(
    'สุ่มตรวจ 10 กล่อง ค่าเฉลี่ย 143.0 กรัม (ทุกกล่อง ≥ 140.0g) — ผ่านเกณฑ์'
  );

  // 5. ลักษณะทางกายภาพของสินค้า
  const [check5Physical, setCheck5Physical] = useState<boolean>(true);
  const [check5Note, setCheck5Note] = useState<string>(
    'ผลสดตึงเงางาม ไม่มีหยดน้ำเกาะภายในกล่อง ไม่พบผลช้ำหรือเชื้อรา'
  );

  // 6. จำนวนสินค้าตรงตามใบสั่งซื้อ
  const [orderedPacks, setOrderedPacks] = useState<number>(600);
  const [actualPacks, setActualPacks] = useState<number>(600);
  const [crateQty, setCrateQty] = useState<number>(25);

  // 7. อุณหภูมิห้องขณะตรวจตามเกณฑ์ 2-6 °C
  const [roomTempC, setRoomTempC] = useState<number>(4.2);

  // 8. ความสะอาดและความเรียบร้อยของตะกร้าขนส่ง
  const [check8CrateClean, setCheck8CrateClean] = useState<boolean>(true);
  const [check8Note, setCheck8Note] = useState<string>(
    'ตะกร้าขนส่งผ่านการล้างฆ่าเชื้อ แห้งสะอาด จัดเรียงเป็นระเบียบ'
  );

  // Defect Tracking state for Checklists 1–8
  // Checklist item decision status: null = not selected yet (not pre-selected)
  const [checklistDecisions, setChecklistDecisions] = useState<Record<number, 'PASS' | 'FAIL' | null>>({});
  const [checkDefects, setCheckDefects] = useState<Record<number, ChecklistDefectRecord>>({});
  const [activeDefectModal, setActiveDefectModal] = useState<number | null>(null);
  const [defectReasonInput, setDefectReasonInput] = useState<string>('');
  const [defectActionInput, setDefectActionInput] = useState<string>('');
  const [defectModalError, setDefectModalError] = useState<string | null>(null);
  const [activeSpecDetailItem, setActiveSpecDetailItem] = useState<number | null>(null);
  const [checklistFilter, setChecklistFilter] = useState<'all' | 'pass' | 'fail' | 'pending'>('all');

  // Inspector & Signatories & Remarks
  const [oqcInspector, setOqcInspector] = useState<string>('น.ส.รัชดาภรณ์ เรืองอุไร');
  const [coaCertifier, setCoaCertifier] = useState<string>('น.ส.พรปวีณ์ ร่วมศรี');
  const [releaseApprover, setReleaseApprover] = useState<string>('นายเด่นชัย ห่วงจิง');
  const [oqcRemarks, setOqcRemarks] = useState<string>('');

  const labMap = useMemo(() => {
    const m = new Map<string, LabRecord>();
    for (const r of labRecords) m.set(r.lotNumber, r);
    return m;
  }, [labRecords]);

  // Checklist Auto-Evaluations (8 Checklists)
  const mixValidation = useMemo(() => evaluateColorMixRules(colorMix), [colorMix]);

  const activeMixEntries = useMemo(
    () => colorMix.filter((c) => Number(c.percentage) > 0),
    [colorMix]
  );

  const check2MixValid = mixValidation.isValid;

  // Check 3: Shelf life must be 6 days from MFG + label checkbox checked
  const shelfLifeDays = useMemo(
    () => daysBetweenIsoDates(mfgDate, expDate),
    [mfgDate, expDate]
  );
  const isSixDayShelfLife = shelfLifeDays === 6;
  const rawCheck3Pass = check3ExpiryLabel && isSixDayShelfLife && check3WashLabel;

  // Raw checks
  const hasUnderweightSample = Boolean(
    sampleWeights && sampleWeights.length > 0 && sampleWeights.some((w) => w < 140.0)
  );
  const rawCheck4NetWeightPass = netWeightG >= 140.0 && !hasUnderweightSample;
  const rawCheck6QtyMatch = orderedPacks > 0 && orderedPacks === actualPacks;
  const rawCheck7RoomTempPass = roomTempC >= 2.0 && roomTempC <= 6.0;

  // Item decisions: true if user selected PASS, false if FAIL, or null if unselected
  const isItem1Pass = checklistDecisions[1] === 'PASS';
  const isItem2Pass = checklistDecisions[2] === 'PASS';
  const isItem3Pass = checklistDecisions[3] === 'PASS';
  const isItem4Pass = checklistDecisions[4] === 'PASS';
  const isItem5Pass = checklistDecisions[5] === 'PASS';
  const isItem6Pass = checklistDecisions[6] === 'PASS';
  const isItem7Pass = checklistDecisions[7] === 'PASS';
  const isItem8Pass = checklistDecisions[8] === 'PASS';

  const isItem1Fail = checklistDecisions[1] === 'FAIL';
  const isItem2Fail = checklistDecisions[2] === 'FAIL';
  const isItem3Fail = checklistDecisions[3] === 'FAIL';
  const isItem4Fail = checklistDecisions[4] === 'FAIL';
  const isItem5Fail = checklistDecisions[5] === 'FAIL';
  const isItem6Fail = checklistDecisions[6] === 'FAIL';
  const isItem7Fail = checklistDecisions[7] === 'FAIL';
  const isItem8Fail = checklistDecisions[8] === 'FAIL';

  const passedChecklistCount = [
    isItem1Pass,
    isItem2Pass,
    isItem3Pass,
    isItem4Pass,
    isItem5Pass,
    isItem6Pass,
    isItem7Pass,
    isItem8Pass,
  ].filter(Boolean).length;

  const failedChecklistCount = [
    isItem1Fail,
    isItem2Fail,
    isItem3Fail,
    isItem4Fail,
    isItem5Fail,
    isItem6Fail,
    isItem7Fail,
    isItem8Fail,
  ].filter(Boolean).length;

  const pendingChecklistCount = 8 - passedChecklistCount - failedChecklistCount;
  const allEightChecksPass = passedChecklistCount === 8;

  const isRowVisible = (itemNum: number) => {
    const status = checklistDecisions[itemNum] ?? null;
    if (checklistFilter === 'all') return true;
    if (checklistFilter === 'pass') return status === 'PASS';
    if (checklistFilter === 'fail') return status === 'FAIL';
    if (checklistFilter === 'pending') return status === null;
    return true;
  };

  const handleToggleItemStatus = (itemNumber: number, target: 'PASS' | 'FAIL') => {
    const current = checklistDecisions[itemNumber] ?? null;
    if (current === target) {
      // Toggle off -> reset back to unselected
      setChecklistDecisions((prev) => {
        const next = { ...prev };
        delete next[itemNumber];
        return next;
      });
      setCheckDefects((prev) => {
        const next = { ...prev };
        delete next[itemNumber];
        return next;
      });
      onNotify('ยกเลิกการเลือก', `ยกเลิกการเลือกรายการที่ ${itemNumber} (กลับสู่สถานะยังไม่ตรวจ)`, 'warning');
      return;
    }

    setChecklistDecisions((prev) => ({
      ...prev,
      [itemNumber]: target,
    }));

    if (target === 'PASS') {
      setCheckDefects((prev) => {
        const next = { ...prev };
        delete next[itemNumber];
        return next;
      });
      switch (itemNumber) {
        case 1:
          setCheck1LidSealing(true);
          break;
        case 2:
          setPresetMode('preset_5');
          setColorMix(buildDefaultMix());
          break;
        case 3:
          setCheck3ExpiryLabel(true);
          setCheck3WashLabel(true);
          if (shelfLifeDays !== 6) {
            setExpDate(addDaysToIsoDate(mfgDate, 6));
          }
          break;
        case 4:
          setNetWeightG(143.0);
          setSampleWeights([142.5, 143.0, 142.8, 144.0, 143.5, 142.0, 144.2, 143.1, 142.9, 143.5]);
          setWeightSampleStatus('PASS');
          setCheck4Note('สุ่มตรวจ 10 กล่อง ค่าเฉลี่ย 143.0 กรัม (ทุกกล่อง ≥ 140.0g) — ผ่านเกณฑ์');
          break;
        case 5:
          setCheck5Physical(true);
          break;
        case 6:
          setActualPacks(orderedPacks);
          break;
        case 7:
          if (roomTempC < 2.0 || roomTempC > 6.0) {
            setRoomTempC(4.2);
          }
          break;
        case 8:
          setCheck8CrateClean(true);
          break;
      }
      onNotify('เลือก PASS', `รายการที่ ${itemNumber} ผ่านเกณฑ์มาตรฐาน 7-Eleven`, 'success');
    } else {
      // target === 'FAIL'
      const std = CHECKLIST_STANDARDS[itemNumber];
      setCheckDefects((prev) => {
        if (prev[itemNumber]) return prev;
        return {
          ...prev,
          [itemNumber]: {
            itemNumber,
            reason: std?.commonReasons[0] || 'พบข้อบกพร่องตามเกณฑ์ 7-Eleven',
            correctiveAction: std?.commonActions[0] || 'ประสานงานฝ่ายผลิตดำเนินการแก้ไขและคัดแยกทันที',
            recordedAt: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
          },
        };
      });
      switch (itemNumber) {
        case 1:
          setCheck1LidSealing(false);
          break;
        case 3:
          setCheck3ExpiryLabel(false);
          break;
        case 4:
          setWeightSampleStatus('HOLD_REJECT');
          break;
        case 5:
          setCheck5Physical(false);
          break;
        case 8:
          setCheck8CrateClean(false);
          break;
      }
      onNotify('เลือก FAIL', `รายการที่ ${itemNumber} ไม่ผ่านเกณฑ์ (สามารถกดแก้ไข CAPA ได้)`, 'warning');
    }
  };

  const handleSetItemPass = (itemNumber: number) => {
    handleToggleItemStatus(itemNumber, 'PASS');
  };

  const handleOpenFailModal = (itemNumber: number) => {
    const existing = checkDefects[itemNumber];
    const std = CHECKLIST_STANDARDS[itemNumber];
    setActiveDefectModal(itemNumber);
    setDefectReasonInput(existing?.reason || std?.commonReasons[0] || '');
    setDefectActionInput(existing?.correctiveAction || std?.commonActions[0] || '');
    setDefectModalError(null);
  };

  const handleConfirmFailModal = () => {
    if (!activeDefectModal) return;
    const reasonTrimmed = defectReasonInput.trim();
    const actionTrimmed = defectActionInput.trim();

    if (!reasonTrimmed || !actionTrimmed) {
      setDefectModalError(
        'กรุณากรอกข้อมูลให้ครบถ้วนทั้ง 2 ช่อง: สาเหตุที่ไม่ผ่านเกณฑ์ และ วิธีแก้ไข (Corrective Action)'
      );
      return;
    }

    const itemNum = activeDefectModal;
    setChecklistDecisions((prev) => ({
      ...prev,
      [itemNum]: 'FAIL',
    }));
    setCheckDefects((prev) => ({
      ...prev,
      [itemNum]: {
        itemNumber: itemNum,
        reason: reasonTrimmed,
        correctiveAction: actionTrimmed,
        recordedAt: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
      },
    }));

    switch (itemNum) {
      case 1:
        setCheck1LidSealing(false);
        break;
      case 3:
        setCheck3ExpiryLabel(false);
        break;
      case 4:
        setWeightSampleStatus('HOLD_REJECT');
        break;
      case 5:
        setCheck5Physical(false);
        break;
      case 8:
        setCheck8CrateClean(false);
        break;
    }

    setActiveDefectModal(null);
    setDefectModalError(null);
    onNotify(
      'บันทึกข้อบกพร่อง & วิธีแก้ไขเรียบร้อยแล้ว',
      `รายการที่ ${itemNum} ถูกบันทึกเป็น FAIL พร้อมข้อมูล CAPA`,
      'warning'
    );
  };

  const handlePassAllTableItems = () => {
    const allPass: Record<number, 'PASS' | 'FAIL' | null> = {};
    for (let i = 1; i <= 8; i++) allPass[i] = 'PASS';
    setChecklistDecisions(allPass);
    setCheck1LidSealing(true);
    setPresetMode('preset_5');
    setColorMix(buildDefaultMix());
    setCheck3ExpiryLabel(true);
    setCheck3WashLabel(true);
    if (shelfLifeDays !== 6) {
      setExpDate(addDaysToIsoDate(mfgDate, 6));
    }
    setNetWeightG(143.0);
    setSampleWeights([142.5, 143.0, 142.8, 144.0, 143.5, 142.0, 144.2, 143.1, 142.9, 143.5]);
    setWeightSampleStatus('PASS');
    setCheck4Note('สุ่มตรวจ 10 กล่อง ค่าเฉลี่ย 143.0 กรัม (ทุกกล่อง ≥ 140.0g) — ผ่านเกณฑ์');
    setCheck5Physical(true);
    setActualPacks(orderedPacks);
    if (roomTempC < 2.0 || roomTempC > 6.0) setRoomTempC(4.2);
    setCheck8CrateClean(true);
    setCheckDefects({});
    onNotify(
      'ยืนยันผ่านเกณฑ์ทั้งหมด',
      'ปรับสถานะข้อกำหนด 7-Eleven ทั้ง 8 ข้อเป็น PASS (8/8 ข้อ) เรียบร้อยแล้ว',
      'success'
    );
  };

  const handleResetAllChecklistItems = () => {
    setChecklistDecisions({});
    setCheckDefects({});
    setColorMix(
      VARIETY_ORDER.map((code) => ({
        varietyCode: code,
        lotNumber: '',
        lotNumbers: [],
        percentage: 0,
      }))
    );
    setPresetMode('custom');
    setCustomMixHint('ล้างการเลือกทั้งหมดเรียบร้อยแล้ว — สามารถเลือกข้อกำหนด สายพันธุ์ และล็อตได้อย่างอิสระ 100%');
    onNotify(
      'ล้างการเลือกทั้งหมด',
      'รีเซ็ตผลการตรวจ 8 ข้อ พร้อมล้างสายพันธุ์และล็อตทั้งหมดแล้ว (สามารถเลือกได้อย่างอิสระ)',
      'warning'
    );
  };

  // Net Weight Sampling Pop-up modal helpers
  const handleOpenWeightSamplingModal = () => {
    const current = sampleWeights && sampleWeights.length >= 10
      ? [...sampleWeights]
      : [142.5, 143.0, 142.8, 144.0, 143.5, 142.0, 144.2, 143.1, 142.9, 143.5];
    setTempSampleWeights(current);
    setSampleCountInput(current.length);
    setIsWeightSamplingModalOpen(true);
  };

  const handleChangeSampleCount = (count: number) => {
    const targetCount = Math.max(10, Math.min(20, count));
    setSampleCountInput(targetCount);
    setTempSampleWeights((prev) => {
      const next = [...prev];
      if (next.length < targetCount) {
        while (next.length < targetCount) {
          next.push(142.0 + Math.round((Math.random() * 2 - 0.5) * 10) / 10);
        }
      } else if (next.length > targetCount) {
        return next.slice(0, targetCount);
      }
      return next;
    });
  };

  const handleQuickFillStandard = () => {
    const standardSamples = [
      142.5, 143.2, 141.8, 144.0, 142.8, 143.5, 142.0, 143.8, 142.6, 143.1,
      144.2, 142.4, 143.6, 142.1, 143.9, 142.7, 144.1, 142.3, 143.4, 142.9,
    ];
    setTempSampleWeights(standardSamples.slice(0, sampleCountInput));
  };

  const handleQuickFillUnderweightDemo = () => {
    const underweightSamples = [
      142.5, 138.2, 141.8, 144.0, 142.8, 137.9, 142.0, 143.8, 142.6, 143.1,
      144.2, 142.4, 143.6, 142.1, 143.9, 142.7, 144.1, 142.3, 143.4, 142.9,
    ];
    setTempSampleWeights(underweightSamples.slice(0, sampleCountInput));
  };

  const handleSaveWeightSamplingModal = () => {
    if (tempSampleWeights.length < 10) return;
    const sum = tempSampleWeights.reduce((a, b) => a + (Number(b) || 0), 0);
    const avg = Math.round((sum / tempSampleWeights.length) * 10) / 10;
    const min = Math.min(...tempSampleWeights);
    const max = Math.max(...tempSampleWeights);
    const failBoxes = tempSampleWeights
      .map((w, idx) => ({ index: idx + 1, weight: w }))
      .filter((b) => b.weight < 140.0);

    setSampleWeights([...tempSampleWeights]);
    setNetWeightG(avg);

    if (failBoxes.length > 0 || avg < 140.0) {
      setWeightSampleStatus('HOLD_REJECT');
      const failDetails = failBoxes
        .slice(0, 3)
        .map((b) => `กล่องที่ ${b.index} (${b.weight.toFixed(1)}g)`)
        .join(', ');
      setCheckDefects((prev) => ({
        ...prev,
        4: {
          itemNumber: 4,
          reason: `สุ่มตรวจ ${tempSampleWeights.length} กล่อง พบ ${failBoxes.length} กล่องน้ำหนักน้อยกว่า 140.0g [${failDetails}] ต่ำสุด ${min}g — ต้อง HOLD สินค้าเพื่อแก้ไข หรือ REJECT`,
          correctiveAction: 'กักสินค้า (HOLD) เพื่อคัดแยกกล่องน้ำหนักต่ำกว่าเกณฑ์ออก นำกลับไปบรรจุเพิ่มให้ได้น้ำหนัก ≥ 140.0g ทุกกล่อง และสุ่มตรวจซ้ำ 100% ก่อนอนุมัติปล่อยส่งมอบ',
          recordedAt: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
        },
      }));
      setCheck4Note(`สุ่มตรวจ ${tempSampleWeights.length} กล่อง เฉลี่ย ${avg}g (Min ${min}g, Max ${max}g) — พบ ${failBoxes.length} กล่อง < 140g: HOLD / REJECT`);
      onNotify(
        '⚠️ ตรวจพบล็อตน้ำหนักไม่ได้มาตรฐาน',
        `พบ ${failBoxes.length} กล่องที่น้ำหนัก < 140.0g — ระบบกำหนดสถานะ HOLD สินค้าเพื่อแก้ไข หรือ REJECT ทันที`,
        'warning'
      );
    } else {
      setWeightSampleStatus('PASS');
      setCheckDefects((prev) => {
        const next = { ...prev };
        delete next[4];
        return next;
      });
      setCheck4Note(`สุ่มตรวจ ${tempSampleWeights.length} กล่อง ค่าเฉลี่ย ${avg}g (Min ${min}g, Max ${max}g) — ผ่านเกณฑ์ทุกกล่อง`);
      onNotify(
        'บันทึกผลการสุ่มชั่งน้ำหนักเรียบร้อย',
        `สุ่มตรวจ ${tempSampleWeights.length} กล่อง ทุกกล่อง ≥ 140.0g (เฉลี่ย ${avg} กรัม)`,
        'success'
      );
    }
    setIsWeightSamplingModalOpen(false);
  };

  const hasLinkedLabFail = useMemo(() => {
    return activeMixEntries.some((entry) => {
      const lotsList = getMixLotNumbers(entry);
      if (lotsList.length === 0) return true;
      return lotsList.some((lotNo) => {
        const lab = labMap.get(lotNo);
        return !lab || lab.overallLabStatus !== 'PASS';
      });
    });
  }, [activeMixEntries, labMap]);

  const totalSelectedLotsCount = useMemo(() => {
    return activeMixEntries.reduce(
      (acc, entry) => acc + getMixLotNumbers(entry).length,
      0
    );
  }, [activeMixEntries]);

  const nextOqcNumber = useMemo(() => {
    const yymmdd = formatDateToYYMMDD(inspectionDate);
    const prefix = `OQC-${yymmdd}-`;
    let maxSeq = 0;
    for (const r of outgoingRecords) {
      if (r.oqcNumber.startsWith(prefix)) {
        const n = parseInt(r.oqcNumber.slice(prefix.length), 10);
        if (!Number.isNaN(n) && n > maxSeq) maxSeq = n;
      }
    }
    return `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;
  }, [inspectionDate, outgoingRecords]);

  const nextCoaNumber = useMemo(() => {
    const prefix = 'COA-';
    let maxSeq = 0;
    for (const r of outgoingRecords) {
      if (r.coaNumber.startsWith(prefix)) {
        const n = parseInt(r.coaNumber.slice(prefix.length), 10);
        if (!Number.isNaN(n) && n > maxSeq) maxSeq = n;
      }
    }
    return `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;
  }, [outgoingRecords]);

  const nextFgLotNumber = useMemo(() => {
    const yymmdd = formatDateToYYMMDD(inspectionDate);
    const prefix = `LOT-FG-${yymmdd}-`;
    let maxSeq = 0;
    for (const r of outgoingRecords) {
      const lot = r.productionLotNo || '';
      if (lot.startsWith(prefix)) {
        const n = parseInt(lot.slice(prefix.length), 10);
        if (!Number.isNaN(n) && n > maxSeq) maxSeq = n;
      }
    }
    return `${prefix}${String(maxSeq + 1).padStart(3, '0')}`;
  }, [inspectionDate, outgoingRecords]);

  const activeFgLotNumber = productionLotNo.trim() || nextFgLotNumber;

  const handleMfgDateChange = (newMfg: string) => {
    setMfgDate(newMfg);
    setExpDate(addDaysToIsoDate(newMfg, 6));
  };

  const handleToggleLotForVariety = (
    varietyCode: VarietyCode,
    lotNumber: string
  ) => {
    setColorMix((prev) =>
      prev.map((entry) => {
        if (entry.varietyCode !== varietyCode) return entry;
        const currentLots = getMixLotNumbers(entry);
        const exists = currentLots.includes(lotNumber);
        const nextLots = exists
          ? currentLots.filter((l) => l !== lotNumber)
          : [...currentLots, lotNumber];
        return {
          ...entry,
          percentage: nextLots.length > 0 ? (Number(entry.percentage) > 0 ? entry.percentage : 1) : entry.percentage,
          lotNumbers: nextLots,
          lotNumber: nextLots.join(', '),
        };
      })
    );
  };

  const handleSelectAllLotsForVariety = (
    varietyCode: VarietyCode,
    allLots: string[]
  ) => {
    setColorMix((prev) =>
      prev.map((entry) => {
        if (entry.varietyCode !== varietyCode) return entry;
        return {
          ...entry,
          percentage: allLots.length > 0 ? (Number(entry.percentage) > 0 ? entry.percentage : 1) : entry.percentage,
          lotNumbers: allLots,
          lotNumber: allLots.join(', '),
        };
      })
    );
  };

  const handleClearLotsForVariety = (varietyCode: VarietyCode) => {
    setColorMix((prev) =>
      prev.map((entry) => {
        if (entry.varietyCode !== varietyCode) return entry;
        return {
          ...entry,
          lotNumbers: [],
          lotNumber: '',
        };
      })
    );
  };

  const handleClearAllMixSelections = () => {
    setColorMix(
      VARIETY_ORDER.map((code) => ({
        varietyCode: code,
        lotNumber: '',
        lotNumbers: [],
        percentage: 0,
      }))
    );
    setPresetMode('custom');
    setCustomMixHint('ล้างการเลือกสายพันธุ์และทุกล็อตเรียบร้อยแล้ว — สามารถเลือกสีและเลือกล็อตได้อย่างอิสระ 100%');
    onNotify('ล้างการเลือกทั้งหมดเรียบร้อย', 'ล้างการเลือกล็อตและสายพันธุ์ทั้งหมดแล้ว สามารถเลือกได้อย่างอิสระ', 'warning');
  };

  const applyMixPreset = (
    activeCodes: VarietyCode[],
    mode: MixPresetMode
  ) => {
    setPresetMode(mode);
    setCustomMixHint('');
    setColorMix((prev) =>
      prev.map((item) => {
        const isSelected = activeCodes.includes(item.varietyCode);
        const currentLots = getMixLotNumbers(item);
        if (isSelected && currentLots.length === 0) {
          const fallbackLot =
            lots.find(
              (l) => l.varietyCode === item.varietyCode && l.disposition !== 'REJECT'
            ) || lots.find((l) => l.varietyCode === item.varietyCode);
          const initialLots = fallbackLot ? [fallbackLot.lotNumber] : [];
          return {
            ...item,
            percentage: 1,
            lotNumbers: initialLots,
            lotNumber: initialLots.join(', '),
          };
        }
        return {
          ...item,
          percentage: isSelected ? 1 : 0,
          lotNumbers: isSelected ? currentLots : [],
          lotNumber: isSelected ? currentLots.join(', ') : '',
        };
      })
    );
  };

  const handleActivateCustomPreset = () => {
    setPresetMode('custom');
    setCustomMixHint('');
  };

  const handleToggleCustomVariety = (code: VarietyCode) => {
    setCustomMixHint('');
    setColorMix((prev) => {
      const currentEntry = prev.find((c) => c.varietyCode === code);
      const isCurrentlySelected = (Number(currentEntry?.percentage) || 0) > 0;
      const willBeSelected = !isCurrentlySelected;

      return prev.map((item) => {
        if (item.varietyCode !== code) return item;
        const currentLots = getMixLotNumbers(item);
        if (willBeSelected && currentLots.length === 0) {
          const fallbackLot =
            lots.find(
              (l) => l.varietyCode === item.varietyCode && l.disposition !== 'REJECT'
            ) || lots.find((l) => l.varietyCode === item.varietyCode);
          const initialLots = fallbackLot ? [fallbackLot.lotNumber] : [];
          return {
            ...item,
            percentage: 1,
            lotNumbers: initialLots,
            lotNumber: initialLots.join(', '),
          };
        }
        return {
          ...item,
          percentage: willBeSelected ? 1 : 0,
          lotNumbers: willBeSelected ? currentLots : [],
          lotNumber: willBeSelected ? currentLots.join(', ') : '',
        };
      });
    });
    setPresetMode('custom');
  };

  const handleLoadRecord = (rec: OutgoingRecord) => {
    setEditingId(rec.id);
    setInspectionDate(rec.inspectionDate);
    setIsTimeManual(true);
    setInspectionTime(rec.inspectionTime);
    setCustomerName(rec.customerName);
    setDistributionCenter(rec.distributionCenter || 'DC บางบัวทอง (BTH-DC)');
    setPoNumber(rec.poNumber);
    setProductName(rec.productName);
    setMfgDate(rec.mfgDate);
    setExpDate(rec.expDate);
    setCheck1LidSealing(rec.check1LidSealing);
    setCheck1Note(rec.check1Note);
    const clonedMix = rec.colorMix.map((c) => {
      const arr = getMixLotNumbers(c);
      return {
        ...c,
        lotNumbers: arr,
        lotNumber: arr.join(', '),
      };
    });
    setColorMix(clonedMix);
    setPresetMode(detectMixPresetMode(clonedMix));
    setCustomMixHint('');
    setCheck3ExpiryLabel(rec.check3ExpiryLabel);
    setCheck3WashLabel(rec.check3WashLabel ?? true);
    setCheck3Note(rec.check3Note);
    setNetWeightG(rec.netWeightG);
    setSampleWeights(
      rec.sampleWeights && rec.sampleWeights.length >= 10
        ? rec.sampleWeights
        : [142.5, 143.0, 142.8, 144.0, 143.5, 142.0, 144.2, 143.1, 142.9, 143.5]
    );
    setWeightSampleStatus(rec.weightSampleStatus || 'PASS');
    setCheck4Note(rec.check4Note);
    setCheck5Physical(rec.check5Physical);
    setCheck5Note(rec.check5Note);
    setOrderedPacks(rec.orderedPacks);
    setActualPacks(rec.actualPacks);
    setCrateQty(rec.crateQty);
    setRoomTempC(rec.roomTempC);
    setCheck8CrateClean(rec.check8CrateClean);
    setCheck8Note(rec.check8Note);
    setCheckDefects(rec.checkDefects || {});
    const loadedDecisions: Record<number, 'PASS' | 'FAIL' | null> = {
      1: rec.check1LidSealing ? 'PASS' : 'FAIL',
      2: rec.check2MixValid ? 'PASS' : 'FAIL',
      3: rec.check3ExpiryLabel ? 'PASS' : 'FAIL',
      4: rec.check4NetWeightPass ? 'PASS' : 'FAIL',
      5: rec.check5Physical ? 'PASS' : 'FAIL',
      6: rec.check6QtyMatch ? 'PASS' : 'FAIL',
      7: rec.check7RoomTempPass ? 'PASS' : 'FAIL',
      8: rec.check8CrateClean ? 'PASS' : 'FAIL',
    };
    if (rec.checkDefects) {
      for (const k of Object.keys(rec.checkDefects)) {
        loadedDecisions[Number(k)] = 'FAIL';
      }
    }
    setChecklistDecisions(loadedDecisions);
    setOqcInspector(rec.oqcInspector || 'น.ส.รัชดาภรณ์ เรืองอุไร');
    setCoaCertifier(rec.coaCertifier || 'น.ส.พรปวีณ์ ร่วมศรี');
    setReleaseApprover(rec.releaseApprover || 'นายเด่นชัย ห่วงจิง');
    setOqcRemarks(rec.oqcRemarks);
    setProductionLotNo(rec.productionLotNo || '');
  };

  useEffect(() => {
    if (preselectedOqcId) {
      const target = outgoingRecords.find((r) => r.id === preselectedOqcId);
      if (target) {
        handleLoadRecord(target);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectedOqcId]);

  const resetForm = () => {
    setEditingId(null);
    setIsTimeManual(false);
    setIsDateManual(false);
    const today = getTodayIsoDate();
    setInspectionDate(today);
    setInspectionTime(getCurrentTimeHHMM());
    setCustomerName('บริษัท ซีพี ออลล์ จำกัด (มหาชน)');
    setDistributionCenter('DC บางบัวทอง (BTH-DC)');
    setPoNumber('');
    setProductionLotNo('');
    setMfgDate(today);
    setExpDate(addDaysToIsoDate(today, 6));
    setCheck1LidSealing(true);
    setColorMix(buildDefaultMix());
    setPresetMode('preset_5');
    setCustomMixHint('');
    setCheck3ExpiryLabel(true);
    setCheck3WashLabel(true);
    setNetWeightG(142);
    setCheck5Physical(true);
    setOrderedPacks(600);
    setActualPacks(600);
    setCrateQty(25);
    setRoomTempC(4.2);
    setChecklistDecisions({});
    setCheckDefects({});
    setCheck8CrateClean(true);
    setCheckDefects({});
    setOqcInspector('น.ส.รัชดาภรณ์ เรืองอุไร');
    setCoaCertifier('น.ส.พรปวีณ์ ร่วมศรี');
    setReleaseApprover('นายเด่นชัย ห่วงจิง');
    setOqcRemarks('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!customerName.trim() || !distributionCenter.trim() || !poNumber.trim()) {
      onNotify(
        'กรุณากรอกข้อมูลคู่ค้าให้ครบถ้วน',
        'กรุณาระบุชื่อคู่ค้า/ลูกค้า ศูนย์กระจายสินค้าปลายทาง (DC) และเลขที่ใบสั่งซื้อ (PO No.)',
        'error'
      );
      return;
    }

    if (!oqcInspector.trim()) {
      onNotify(
        'ข้อมูลไม่ครบถ้วน',
        'กรุณาระบุชื่อเจ้าหน้าที่ผู้ตรวจสอบ FG',
        'error'
      );
      return;
    }

    const activeWithNoLots = activeMixEntries.filter(
      (entry) => getMixLotNumbers(entry).length === 0
    );
    if (activeWithNoLots.length > 0) {
      onNotify(
        'ยังไม่ได้เลือกล็อตวัตถุดิบ',
        `กรุณาเลือกล็อตอย่างน้อย 1 ล็อตสำหรับสี: ${activeWithNoLots
          .map((m) => TOMATO_VARIETIES[m.varietyCode].nameTh)
          .join(', ')}`,
        'error'
      );
      return;
    }

    const existing = outgoingRecords.find((r) => r.id === editingId);
    const oqcStatus = allEightChecksPass ? 'PASS' : 'FAIL';

    const record: OutgoingRecord = {
      id: editingId || `oqc-${Date.now()}`,
      oqcNumber: existing?.oqcNumber || nextOqcNumber,
      coaNumber: existing?.coaNumber || nextCoaNumber,
      productionLotNo: activeFgLotNumber,
      inspectionDate,
      inspectionTime,
      customerName: customerName.trim(),
      distributionCenter: distributionCenter.trim(),
      poNumber: poNumber.trim(),
      productName: productName.trim(),
      mfgDate,
      expDate,
      check1LidSealing: isItem1Pass,
      check1Note: check1Note.trim(),
      colorMix: colorMix.map((c) => {
        const isSelected = (Number(c.percentage) || 0) > 0;
        const lotsArr = isSelected ? getMixLotNumbers(c) : [];
        return {
          ...c,
          percentage: isSelected ? Number(c.percentage) || 1 : 0,
          lotNumbers: lotsArr,
          lotNumber: lotsArr.join(', '),
        };
      }),
      check2MixValid,
      check3ExpiryLabel: isItem3Pass,
      check3WashLabel,
      check3Note: check3Note.trim(),
      netWeightG: Number(netWeightG) || 0,
      sampleWeights,
      weightSampleStatus,
      check4NetWeightPass: isItem4Pass,
      check4Note: check4Note.trim(),
      check5Physical: isItem5Pass,
      check5Note: check5Note.trim(),
      orderedPacks: Number(orderedPacks) || 0,
      actualPacks: Number(actualPacks) || 0,
      crateQty: Number(crateQty) || 0,
      check6QtyMatch: isItem6Pass,
      roomTempC: Number(roomTempC) || 0,
      check7RoomTempPass: isItem7Pass,
      check8CrateClean: isItem8Pass,
      check8Note: check8Note.trim(),
      checkDefects,
      oqcInspector: oqcInspector.trim() || 'น.ส.รัชดาภรณ์ เรืองอุไร',
      coaCertifier: coaCertifier.trim() || 'น.ส.พรปวีณ์ ร่วมศรี',
      releaseApprover: releaseApprover.trim() || 'นายเด่นชัย ห่วงจิง',
      oqcStatus,
      oqcRemarks: oqcRemarks.trim(),
    };

    onSaveOutgoing(record);
    onNotify(
      'บันทึกผลตรวจสินค้าสำเร็จรูป (FG) เรียบร้อยแล้ว',
      `เอกสาร ${record.oqcNumber} (ใบรับรอง ${record.coaNumber}) บันทึกสำเร็จ`,
      'success'
    );
    resetForm();
  };

  const handleExportCsv = () => {
    if (outgoingRecords.length === 0) {
      onNotify('ไม่มีข้อมูลสำหรับส่งออก', 'ไม่พบประวัติการตรวจคุณภาพสินค้าสำเร็จรูป FG เพื่อส่งออก CSV', 'warning');
      return;
    }

    try {
      exportOutgoingRecordsToCsv(outgoingRecords);
      onNotify(
        'ดาวน์โหลดไฟล์ CSV เรียบร้อยแล้ว',
        `ส่งออกข้อมูลการตรวจปล่อยสินค้าสำเร็จรูป FG (${outgoingRecords.length} รอบจัดส่ง) เป็นไฟล์ CSV ลงเครื่องเรียบร้อยแล้ว`,
        'success'
      );
    } catch (err) {
      console.error('Failed to export FG CSV:', err);
      onNotify(
        'ส่งออกไฟล์ CSV ไม่สำเร็จ',
        'เกิดข้อผิดพลาดขณะส่งออกข้อมูล กรุณาลองใหม่อีกครั้ง',
        'error'
      );
    }
  };

  return (
    <div className="space-y-8">
      <form
        onSubmit={handleSubmit}
        className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-200"
      >
        {/* Header & Order Info */}
        <div className="p-6 space-y-5">
          {/* Top Title & Action Bar */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5">
                <span className="inline-flex items-center justify-center p-2 rounded-xl bg-emerald-100/90 text-emerald-800 border border-emerald-300 shadow-2xs">
                  <PackageCheck className="w-5 h-5 text-emerald-700 shrink-0" />
                </span>
                <h2 className="text-lg md:text-xl font-bold text-slate-900 tracking-tight leading-snug">
                  {editingId
                    ? 'แก้ไขการตรวจคุณภาพสินค้าสำเร็จรูป FG (FG Inspection)'
                    : 'การตรวจคุณภาพสินค้าสำเร็จรูป FG (8 ข้อกำหนดมาตรฐาน CP ALL DC)'}
                </h2>
              </div>
              <p className="text-xs md:text-sm text-slate-500 mt-1 pl-11">
                ตรวจสอบความพร้อมสินค้าสำเร็จรูปครบ 8 ข้อกำหนดมาตรฐาน (ผสมสี 3–5 สี · อายุสินค้า 6 วัน · น้ำหนักสุทธิ 140g · ควบคุมความเย็น 2–6 °C)
              </p>
            </div>

            {/* Status Badge & Document Action Buttons */}
            <div className="flex flex-wrap items-center gap-2.5 shrink-0 pl-11 lg:pl-0 outgoing-qc-screen-only">
              <div className="inline-flex items-center gap-2 text-xs font-medium tabular-nums bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700">
                <span>
                  เลขที่เอกสาร:{' '}
                  <strong className="font-semibold text-slate-900">
                    {editingId
                      ? outgoingRecords.find((r) => r.id === editingId)?.oqcNumber
                      : nextOqcNumber}
                  </strong>
                </span>
                <span className="text-slate-300">|</span>
                <span>
                  ผ่านเกณฑ์{' '}
                  <strong
                    className={
                      allEightChecksPass
                        ? 'text-emerald-700 font-bold'
                        : 'text-red-700 font-bold'
                    }
                  >
                    {passedChecklistCount}/8 ข้อ
                  </strong>
                </span>
              </div>
              <button
                type="button"
                onClick={() => {
                  const targetId = editingId || outgoingRecords[0]?.id;
                  if (targetId) {
                    onOpenCOA(targetId);
                  } else {
                    onNotify(
                      'ยังไม่มีข้อมูล COA',
                      'กรุณาบันทึกผลการตรวจ FG ก่อนเพื่อดูใบรับรอง COA',
                      'warning'
                    );
                  }
                }}
                className="px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-lg shadow-2xs transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                title="เปิดดูใบรับรองผลวิเคราะห์ COA"
              >
                <FileCheck2 className="w-3.5 h-3.5 text-emerald-700" />
                <span>ไปยังหน้าใบรับรอง COA</span>
                <ExternalLink className="w-3 h-3 text-emerald-600" />
              </button>
              <button
                type="button"
                onClick={() => printWithClass('printing-outgoing-qc')}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg shadow-2xs transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                title="พิมพ์รายงานการตรวจคุณภาพสินค้าสำเร็จรูป (FG)"
              >
                <Printer className="w-3.5 h-3.5 text-slate-600" />
                <span>พิมพ์รายงาน (Print)</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  exportElementToPdf('outgoing-qc-report-sheet', {
                    filename: `FG_Report_${
                      editingId
                        ? outgoingRecords.find((r) => r.id === editingId)
                            ?.oqcNumber
                        : nextOqcNumber
                    }.pdf`,
                    orientation: 'portrait',
                  })
                }
                className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-2xs transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                title="ส่งออกรายงานผลตรวจ FG เป็นไฟล์ PDF"
              >
                <Download className="w-3.5 h-3.5" />
                <span>ส่งออก PDF</span>
              </button>
              <button
                type="button"
                onClick={handleExportCsv}
                disabled={outgoingRecords.length === 0}
                className="px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50 border border-emerald-300 rounded-lg shadow-2xs transition-colors inline-flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                title="ส่งออกประวัติการตรวจคุณภาพ FG เป็นไฟล์ CSV สำหรับ Excel"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                <span>Export CSV</span>
              </button>
            </div>
          </div>

          {hasLinkedLabFail && (
            <div
              role="alert"
              className="p-3.5 rounded-lg bg-sky-50 border border-sky-300 text-sky-950 text-xs font-medium flex items-center gap-2.5"
            >
              <AlertCircle className="w-4 h-4 text-sky-600 shrink-0" />
              <span>
                แจ้งเตือนสำคัญ: มีล็อตมะเขือเทศที่เลือกในสูตรผสมสีมีผลตรวจ QC LAB
                เป็น FAIL — ระบบจะระงับตรายางดิจิทัล QA PASSED บนใบรับรอง COA
                อัตโนมัติ
              </span>
            </div>
          )}

          {/* FG Identification & Finished Product Specification Card */}
          <div className="bg-gradient-to-r from-emerald-50/70 via-slate-50 to-blue-50/60 border border-emerald-200/90 rounded-xl p-4 sm:p-5 shadow-2xs space-y-4">
            {/* Card Row 1: FG Lot No. & Document References */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
              {/* Field 1: Production Lot No. */}
              <div className="lg:col-span-7">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-800 flex items-center gap-1.5">
                    <Barcode className="w-4 h-4 text-emerald-600" />
                    <span>รหัสล็อตการผลิตสินค้าสำเร็จรูป (FG Lot No.) *</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setProductionLotNo(nextFgLotNumber)}
                    className="text-[11px] text-emerald-700 hover:text-emerald-800 font-medium underline inline-flex items-center gap-0.5 cursor-pointer"
                    title="สร้างรหัสล็อตอัตโนมัติตามวันที่ผลิตและลำดับ"
                  >
                    <span>ใช้รหัสออโต้ ({nextFgLotNumber})</span>
                  </button>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    value={productionLotNo}
                    onChange={(e) =>
                      setProductionLotNo(e.target.value.toUpperCase())
                    }
                    placeholder={nextFgLotNumber}
                    className="w-full pl-3 pr-24 py-2 text-sm font-semibold tracking-wider font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600 placeholder:text-slate-400"
                  />
                  <div className="absolute inset-y-0 right-2 flex items-center">
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-emerald-100/80 text-emerald-800 border border-emerald-300">
                      {productionLotNo.trim()
                        ? 'กำหนดเอง'
                        : 'ค่าเริ่มต้นอัตโนมัติ'}
                    </span>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 mt-1 flex items-center justify-between">
                  <span>
                    รูปแบบมาตรฐาน: LOT-FG-YYMMDD-XXX (พิมพ์บนกล่องสินค้า/ใบ COA)
                  </span>
                  <span className="font-mono text-slate-700 font-medium">
                    ปัจจุบัน: {activeFgLotNumber}
                  </span>
                </p>
              </div>

              {/* Field 2: OQC & Linked COA Numbers + Link Button */}
              <div className="lg:col-span-5 bg-white/90 border border-slate-200/90 rounded-lg p-3 flex flex-col justify-between gap-2 shadow-2xs">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 font-medium">
                    เลขที่เอกสารตรวจปล่อย (OQC No.):
                  </span>
                  <span className="font-mono font-semibold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                    {editingId
                      ? outgoingRecords.find((r) => r.id === editingId)
                          ?.oqcNumber || nextOqcNumber
                      : nextOqcNumber}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs pt-1.5 border-t border-slate-100">
                  <span className="text-slate-500 font-medium">
                    ใบรับรองผลวิเคราะห์ (COA Reference):
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      {editingId
                        ? outgoingRecords.find((r) => r.id === editingId)
                            ?.coaNumber || nextCoaNumber
                        : nextCoaNumber}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const targetId = editingId || outgoingRecords[0]?.id;
                        if (targetId) {
                          onOpenCOA(targetId);
                        } else {
                          onNotify(
                            'ยังไม่มีข้อมูล COA',
                            'กรุณาบันทึกผลการตรวจ FG ก่อนเพื่อดูใบรับรอง COA',
                            'warning'
                          );
                        }
                      }}
                      className="text-[11px] text-emerald-700 hover:text-emerald-800 font-medium underline inline-flex items-center gap-0.5 cursor-pointer ml-1"
                      title="เปิดดูใบรับรอง COA"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>เปิด COA</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Card Row 2: Finished Product Specification, MFG Date, and EXP Date (+6 Days) */}
            <div className="pt-3 border-t border-emerald-200/60 grid grid-cols-1 md:grid-cols-12 gap-3.5 items-end">
              {/* Product Name */}
              <div className="md:col-span-6">
                <label className="block text-xs font-semibold text-slate-800 mb-1.5">
                  รายการสินค้าสำเร็จรูป (Finished Product Specification) *
                </label>
                <input
                  type="text"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm font-medium bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              {/* MFG Date */}
              <div className="md:col-span-3">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-800">
                    วันที่ผลิต (MFG) *
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsDateManual(false);
                      handleMfgDateChange(getTodayIsoDate());
                    }}
                    className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 transition-colors inline-flex items-center gap-1 cursor-pointer"
                    title="ปรับเทียบเป็นวันที่ปัจจุบันแบบเรียลไทม์"
                  >
                    <Calendar className="w-3 h-3 shrink-0" />
                    <span>วันนี้ (เรียลไทม์)</span>
                  </button>
                </div>
                <input
                  type="date"
                  value={mfgDate}
                  onChange={(e) => {
                    setIsDateManual(true);
                    handleMfgDateChange(e.target.value);
                  }}
                  className="w-full px-3 py-2 text-sm tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600"
                />
              </div>

              {/* EXP Date (+6 Days) */}
              <div className="md:col-span-3">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-800">
                    วันหมดอายุ (EXP +6 วัน) *
                  </label>
                  {isSixDayShelfLife ? (
                    <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-100/90 px-1.5 py-0.5 rounded border border-emerald-300 inline-flex items-center gap-0.5">
                      ✓ เรียลไทม์ +6 วัน
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setExpDate(addDaysToIsoDate(mfgDate, 6))}
                      className="text-[11px] font-semibold text-amber-700 hover:text-amber-800 underline cursor-pointer"
                      title="คำนวณวันหมดอายุอัตโนมัติ +6 วันนับจากวันผลิต"
                    >
                      ตั้งค่า +6 วัน
                    </button>
                  )}
                </div>
                <input
                  type="date"
                  value={expDate}
                  onChange={(e) => {
                    setIsDateManual(true);
                    setExpDate(e.target.value);
                  }}
                  className={`w-full px-3 py-2 text-sm tabular-nums bg-white border rounded-lg focus:outline-none focus:ring-2 ${
                    isSixDayShelfLife
                      ? 'border-slate-300 focus:ring-emerald-600'
                      : 'border-red-400 text-red-700 focus:ring-red-600'
                  }`}
                />
              </div>
            </div>
          </div>

          {/* Customer & Order Delivery Section */}
          <div className="bg-slate-50/70 border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4">
            <div className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <span>ข้อมูลการสั่งซื้อและศูนย์กระจายสินค้า (Order & Delivery Information)</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              <div className="md:col-span-4">
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  ชื่อคู่ค้า / ลูกค้า *
                </label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="บริษัท ซีพี ออลล์ จำกัด (มหาชน)"
                  className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
              <div className="md:col-span-4">
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  ศูนย์กระจายสินค้า (DC) *
                </label>
                <input
                  type="text"
                  list="cpall-dc-list"
                  value={distributionCenter}
                  onChange={(e) => setDistributionCenter(e.target.value)}
                  placeholder="DC บางบัวทอง (BTH-DC)"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
                <datalist id="cpall-dc-list">
                  {CP_ALL_DC_OPTIONS.map((dc) => (
                    <option key={dc} value={dc} />
                  ))}
                </datalist>
              </div>
              <div className="md:col-span-4">
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  เลขที่ใบสั่งซื้อ (PO No.) *
                </label>
                <input
                  type="text"
                  value={poNumber}
                  onChange={(e) => setPoNumber(e.target.value)}
                  placeholder="PO-7ELEVEN-XXXX"
                  className="w-full px-3 py-2 text-sm font-medium tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
            </div>

            {/* Quick Destination DC Selector Row */}
            <div className="flex flex-wrap items-center gap-2 pt-1 pb-1">
              <span className="text-xs font-semibold text-slate-700">
                เลือกศูนย์กระจายสินค้าปลายทาง (DC):
              </span>
              <div className="flex flex-wrap gap-2 items-center">
                {CP_ALL_DC_OPTIONS.map((dc) => {
                  const isSelected = distributionCenter === dc;
                  return (
                    <button
                      key={dc}
                      type="button"
                      onClick={() => setDistributionCenter(isSelected ? '' : dc)}
                      className={`px-3 py-1.5 text-xs rounded-lg transition-colors border cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-600 text-white border-emerald-600 font-semibold shadow-xs'
                          : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300 font-medium'
                      }`}
                      title={isSelected ? 'คลิกซ้ำเพื่อยกเลิกการเลือก' : `เลือก ${dc}`}
                    >
                      {dc}
                    </button>
                  );
                })}
                {distributionCenter && (
                  <button
                    type="button"
                    onClick={() => setDistributionCenter('')}
                    className="px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg border border-dashed border-slate-300 transition-colors inline-flex items-center gap-1 cursor-pointer"
                    title="ล้างการเลือกศูนย์กระจายสินค้า"
                  >
                    <X className="w-3 h-3" />
                    <span>ล้างค่า DC</span>
                  </button>
                )}
              </div>
            </div>

            {/* Inspection Date & Inspection Time Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-200">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-700">
                    วันที่ตรวจปล่อย (Inspection Date)
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsDateManual(false);
                      setInspectionDate(getTodayIsoDate());
                    }}
                    className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 transition-colors inline-flex items-center gap-1 cursor-pointer"
                    title="ตั้งเป็นวันที่ปัจจุบันแบบเรียลไทม์"
                  >
                    <Calendar className="w-3 h-3 shrink-0" />
                    <span>วันนี้ (เรียลไทม์)</span>
                  </button>
                </div>
                <input
                  type="date"
                  value={inspectionDate}
                  onChange={(e) => {
                    setIsDateManual(true);
                    setInspectionDate(e.target.value);
                  }}
                  className="w-full px-3 py-2 text-sm tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold text-slate-700">
                    เวลาตรวจปล่อย (Inspection Time)
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setInspectionTime(getCurrentTimeHHMM());
                      setIsTimeManual(false);
                    }}
                    className={`text-[11px] font-semibold transition-colors inline-flex items-center gap-1 cursor-pointer ${
                      !isTimeManual && !editingId
                        ? 'text-emerald-700 hover:text-emerald-800'
                        : 'text-slate-500 hover:text-slate-900 underline'
                    }`}
                    title="คลิกเพื่อปรับเทียบเวลาปัจจุบันแบบเรียลไทม์"
                  >
                    <Clock className="w-3 h-3 shrink-0" />
                    <span>{!isTimeManual && !editingId ? 'เรียลไทม์' : 'เวลาปัจจุบัน'}</span>
                  </button>
                </div>
                <input
                  type="time"
                  value={inspectionTime}
                  onChange={(e) => {
                    setInspectionTime(e.target.value);
                    setIsTimeManual(true);
                  }}
                  className="w-full px-3 py-2 text-sm tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
            </div>
          </div>

          {/* Mandatory Label Requirement Callout */}
          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <div className="text-slate-700">
              <span className="font-semibold text-slate-900">
                ข้อความบังคับบนฉลากสินค้า:
              </span>{' '}
              ต้องระบุข้อความ{' '}
              <strong className="text-slate-900 font-semibold">
                &ldquo;ล้างก่อนรับประทาน&rdquo; (Wash before consumption)
              </strong>{' '}
              บนฉลากบรรจุภัณฑ์อย่างชัดเจนทุกแพ็ค
            </div>
            <span
              className={`font-semibold shrink-0 ${
                check3WashLabel ? 'text-emerald-700' : 'text-red-700'
              }`}
            >
              {check3WashLabel ? '✓ ยืนยันระบุชัดเจน' : '✗ ยังไม่ยืนยันข้อความบังคับ'}
            </span>
          </div>
        </div>

        {/* Checklist #2 (Featured Full-Width): 3-5 Varieties Color Mix = 100% with Mandatory Green + Red Rule */}
        <div className="p-6 space-y-4">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                เช็คลิสต์ข้อที่ 2: การผสมสีครบ 3–5 สายพันธุ์ (บังคับมีสีเขียวคู่กับสีแดง/ชมพู)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                ต้องคละอย่างต่ำ 3 สีขึ้นไป (บังคับต้องมีสีเขียว กรูรามิ คู่กับสีแดง โซลาริโน่) ห้ามให้สีเหลือง แดง ส้ม อยู่ด้วยกันโดยไม่มีสีเขียวมาแซม
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() =>
                  presetMode === 'preset_5'
                    ? setPresetMode(null)
                    : applyMixPreset(PRESET_5_COLORS, 'preset_5')
                }
                className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap cursor-pointer ${
                  presetMode === 'preset_5'
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs font-semibold'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                สูตรครบ 5 สี
              </button>
              <button
                type="button"
                onClick={() =>
                  presetMode === 'preset_4'
                    ? setPresetMode(null)
                    : applyMixPreset(PRESET_4_GREEN_MIX, 'preset_4')
                }
                className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap cursor-pointer ${
                  presetMode === 'preset_4'
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs font-semibold'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                สูตร 4 สีแซมเขียว
              </button>
              <button
                type="button"
                onClick={() =>
                  presetMode === 'custom'
                    ? setPresetMode(null)
                    : handleActivateCustomPreset()
                }
                className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  presetMode === 'custom'
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs font-semibold'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>สูตรเลือกสีเองอิสระ</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  presetMode === 'preset_3'
                    ? setPresetMode(null)
                    : applyMixPreset(PRESET_3_RYG, 'preset_3')
                }
                className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap cursor-pointer ${
                  presetMode === 'preset_3'
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs font-semibold'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                สูตร 3 สี แดง–เหลือง–เขียว
              </button>
              <button
                type="button"
                onClick={handleClearAllMixSelections}
                className="px-3 py-1.5 text-xs font-semibold rounded-md border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 hover:text-slate-900 transition-colors whitespace-nowrap inline-flex items-center gap-1.5 shadow-2xs cursor-pointer"
                title="ล้างการเลือกสายพันธุ์และล็อตทั้งหมด เพื่อเริ่มเลือกใหม่อย่างอิสระ"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                <span>ล้างการเลือกทั้งหมด (Reset)</span>
              </button>
            </div>
          </div>

          {/* Interactive Custom Mix Builder (Shown when "สูตรเลือกสีเองอิสระ" is active) */}
          {presetMode === 'custom' && (
            <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold text-slate-800">
                  กำหนดสูตรเลือกสีเองได้อย่างอิสระ (คลิกเลือกหรือยกเลิกได้ทุกสีตามต้องการ)
                </div>
                <button
                  type="button"
                  onClick={handleClearAllMixSelections}
                  className="text-[11px] font-semibold text-slate-600 hover:text-slate-900 underline inline-flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3 text-slate-500" />
                  <span>ล้างการเลือกทั้งหมด</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {VARIETY_ORDER.map((code) => {
                  const v = TOMATO_VARIETIES[code];
                  const entry = colorMix.find((c) => c.varietyCode === code);
                  const isSelected = (Number(entry?.percentage) || 0) > 0;

                  return (
                    <button
                      key={code}
                      type="button"
                      onClick={() => handleToggleCustomVariety(code)}
                      className={`px-3 py-1.5 rounded-md border text-xs font-medium inline-flex items-center gap-2 transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-50 border-emerald-600 text-emerald-900 ring-1 ring-emerald-600 shadow-2xs font-semibold'
                          : 'bg-white/60 border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-800'
                      }`}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-xs shrink-0"
                        style={{ backgroundColor: v.swatchHex }}
                      />
                      <span>
                        {v.nameTh} ({v.colorLabelTh})
                      </span>
                      {isSelected ? (
                        <Check className="w-3.5 h-3.5 text-emerald-700" />
                      ) : (
                        <Plus className="w-3 h-3 text-slate-400" />
                      )}
                    </button>
                  );
                })}
              </div>

              {customMixHint && (
                <div className="text-[11px] font-medium text-emerald-800">
                  * {customMixHint}
                </div>
              )}
            </div>
          )}

          {mixValidation.isWarmTrioWithoutGreen && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-300 text-red-900 text-xs font-medium flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-700 shrink-0" />
              <span>
                ข้อสังเกต: หากมีสีเหลือง + แดง + ส้ม ร่วมกัน แนะนำให้มีสีเขียว (กรูรามิ) มาแซมเพื่อความสมดุลตามเกณฑ์ CP ALL DC
              </span>
            </div>
          )}

          {/* Segmented Visual Bar */}
          <div className="h-3 w-full rounded-md overflow-hidden bg-slate-100 flex border border-slate-200">
            {activeMixEntries.map((entry) => {
              const v = TOMATO_VARIETIES[entry.varietyCode];
              return (
                <div
                  key={entry.varietyCode}
                  className="h-full flex-1 transition-all"
                  style={{ backgroundColor: v.swatchHex }}
                  title={`${v.nameTh} (${v.colorLabelTh})`}
                />
              );
            })}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5 sm:gap-3">
            {colorMix.map((entry) => {
              const v = TOMATO_VARIETIES[entry.varietyCode];
              const availableLots = lots.filter(
                (l) => l.varietyCode === entry.varietyCode
              );
              const isUsed = (Number(entry.percentage) || 0) > 0;
              const selectedLots = getMixLotNumbers(entry);
              const allSelectedPass =
                selectedLots.length > 0 &&
                selectedLots.every(
                  (lNo) => labMap.get(lNo)?.overallLabStatus === 'PASS'
                );
              const failingLots = selectedLots.filter(
                (lNo) => labMap.get(lNo)?.overallLabStatus === 'FAIL'
              );
              const pendingLots = selectedLots.filter(
                (lNo) =>
                  !labMap.get(lNo) ||
                  labMap.get(lNo)?.overallLabStatus === 'PENDING'
              );

              return (
                <div
                  key={entry.varietyCode}
                  className={`p-3.5 rounded-lg border space-y-2.5 transition-colors ${
                    isUsed
                      ? 'border-slate-300 bg-slate-50/50 shadow-2xs'
                      : 'border-slate-200 bg-white opacity-65'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-xs shrink-0"
                        style={{ backgroundColor: v.swatchHex }}
                      />
                      <span className="text-xs font-semibold text-slate-900">
                        {v.nameTh}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-500">
                      {v.colorLabelTh}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-1">
                    <button
                      type="button"
                      onClick={() => handleToggleCustomVariety(entry.varietyCode)}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded border transition-colors cursor-pointer ${
                        isUsed
                          ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
                          : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100 hover:text-slate-800'
                      }`}
                      title={isUsed ? 'คลิกเพื่อยกเลิกการคละสีนี้' : 'คลิกเพื่อเลือกคละสีนี้'}
                    >
                      {isUsed ? (
                        <>
                          <Check className="w-3 h-3" /> คละในแพ็กนี้
                        </>
                      ) : (
                        <>
                          <Plus className="w-3 h-3" /> คลิกเพื่อเพิ่มคละ
                        </>
                      )}
                    </button>
                    {entry.varietyCode === 'GR' ? (
                      <span className="text-[10px] text-emerald-700 font-medium bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                        สีเขียว
                      </span>
                    ) : entry.varietyCode === 'SL' ? (
                      <span className="text-[10px] text-rose-700 font-medium bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200">
                        สีแดง
                      </span>
                    ) : null}
                  </div>

                  {isUsed ? (
                    <div className="space-y-2 pt-1 border-t border-slate-200">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-semibold text-slate-800">
                          ล็อตที่ใช้บรรจุ:
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold tabular-nums ${
                            selectedLots.length > 0
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {selectedLots.length > 0
                            ? `เลือก ${selectedLots.length} ล็อต`
                            : 'ยังไม่เลือก'}
                        </span>
                      </div>

                      {availableLots.length > 0 ? (
                        <>
                          <div className="flex items-center justify-between text-[10px] text-slate-500">
                            <span>ล็อตพร้อมใช้ ({availableLots.length})</span>
                            <div className="flex items-center gap-1.5 font-medium">
                              <button
                                type="button"
                                onClick={() =>
                                  handleSelectAllLotsForVariety(
                                    entry.varietyCode,
                                    availableLots.map((l) => l.lotNumber)
                                  )
                                }
                                className="text-slate-700 hover:text-slate-900 underline"
                              >
                                เลือกทั้งหมด
                              </button>
                              <span>·</span>
                              <button
                                type="button"
                                onClick={() =>
                                  handleClearLotsForVariety(entry.varietyCode)
                                }
                                className="text-slate-700 hover:text-slate-900 underline"
                              >
                                ล้าง
                              </button>
                            </div>
                          </div>

                          <div className="space-y-1 max-h-36 overflow-y-auto pr-0.5 border border-slate-200 rounded-md p-1.5 bg-white">
                            {availableLots.map((lot) => {
                              const isChecked = selectedLots.includes(
                                lot.lotNumber
                              );
                              const lRec = labMap.get(lot.lotNumber);
                              const labStatus = lRec?.overallLabStatus;
                              const brixText =
                                lRec?.brixValue !== null &&
                                lRec?.brixValue !== undefined
                                  ? `${lRec.brixValue.toFixed(1)}°`
                                  : null;

                              return (
                                <label
                                  key={lot.id}
                                  className={`flex items-start gap-1.5 p-1.5 rounded text-xs cursor-pointer transition-colors border ${
                                    isChecked
                                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs font-semibold'
                                      : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-800'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() =>
                                      handleToggleLotForVariety(
                                        entry.varietyCode,
                                        lot.lotNumber
                                      )
                                    }
                                    className="mt-0.5 rounded text-emerald-600 focus:ring-0 shrink-0"
                                  />
                                  <div className="min-w-0 flex-1">
                                    <div className="font-mono text-[10.5px] font-bold leading-tight truncate">
                                      {lot.lotNumber}
                                    </div>
                                    <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                                      {labStatus === 'PASS' ? (
                                        <span
                                          className={`text-[9px] font-semibold px-1 rounded ${
                                            isChecked
                                              ? 'bg-emerald-800 text-emerald-100'
                                              : 'bg-emerald-100 text-emerald-800'
                                          }`}
                                        >
                                          PASS {brixText ? `(${brixText})` : ''}
                                        </span>
                                      ) : labStatus === 'FAIL' ? (
                                        <span
                                          className={`text-[9px] font-bold px-1 rounded ${
                                            isChecked
                                              ? 'bg-red-800 text-red-100'
                                              : 'bg-red-100 text-red-800'
                                          }`}
                                        >
                                          FAIL
                                        </span>
                                      ) : (
                                        <span
                                          className={`text-[9px] px-1 rounded ${
                                            isChecked
                                              ? 'bg-amber-800 text-amber-100'
                                              : 'bg-amber-100 text-amber-800'
                                          }`}
                                        >
                                          รอผลตรวจ
                                        </span>
                                      )}
                                      {lot.disposition ===
                                        'CONDITIONAL_ACCEPT' && (
                                        <span
                                          className={`text-[9px] px-1 rounded ${
                                            isChecked
                                              ? 'bg-slate-700 text-slate-200'
                                              : 'bg-slate-200 text-slate-700'
                                          }`}
                                        >
                                          คัด100%
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </label>
                              );
                            })}
                          </div>

                          {selectedLots.length > 0 && (
                            <div className="flex flex-wrap gap-1 pt-1">
                              {selectedLots.map((lNo) => (
                                <span
                                  key={lNo}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 border border-slate-300 text-[10px] font-mono font-medium text-slate-800"
                                >
                                  <span>{lNo}</span>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleToggleLotForVariety(
                                        entry.varietyCode,
                                        lNo
                                      )
                                    }
                                    className="hover:text-red-600 transition-colors"
                                    title="ลบล็อตนี้ออกจากการคละ"
                                  >
                                    <X className="w-2.5 h-2.5" />
                                  </button>
                                </span>
                              ))}
                            </div>
                          )}

                          <div className="text-[10px] pt-1 border-t border-slate-200">
                            {selectedLots.length === 0 ? (
                              <div className="text-red-600 font-medium">
                                * กรุณาเลือกอย่างน้อย 1 ล็อต
                              </div>
                            ) : allSelectedPass ? (
                              <div className="text-emerald-700 font-semibold flex items-center gap-1">
                                <Check className="w-3 h-3 shrink-0" />
                                <span>ผ่าน Lab ครบ {selectedLots.length} ล็อต</span>
                              </div>
                            ) : failingLots.length > 0 ? (
                              <div className="text-red-700 font-bold flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3 shrink-0" />
                                <span className="truncate">
                                  Lab FAIL: {failingLots.join(', ')}
                                </span>
                              </div>
                            ) : (
                              <div className="text-amber-700 font-medium flex items-center gap-1">
                                <span>
                                  รอผลแล็บ: {pendingLots.length} ล็อต
                                </span>
                              </div>
                            )}
                          </div>
                        </>
                      ) : (
                        <div className="text-[11px] text-slate-400 italic py-2 text-center bg-white rounded border border-dashed border-slate-200">
                          ไม่พบล็อตวัตถุดิบสีนี้
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-400 italic py-2 text-center bg-slate-50/50 rounded border border-dashed border-slate-200">
                      ไม่ได้ใช้คละในแพ็กนี้
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs tabular-nums pt-1">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>
                จำนวนสีที่คละ:{' '}
                <strong
                  className={
                    mixValidation.activeCount >= 3 && mixValidation.activeCount <= 5
                      ? 'text-emerald-700'
                      : 'text-red-700'
                  }
                >
                  {mixValidation.activeCount} สี (ขั้นต่ำ 3 สี)
                </strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                รวมล็อตที่ใช้:{' '}
                <strong
                  className={
                    totalSelectedLotsCount >= mixValidation.activeCount &&
                    totalSelectedLotsCount > 0
                      ? 'text-emerald-700'
                      : 'text-red-700'
                  }
                >
                  {totalSelectedLotsCount} ล็อต
                </strong>
              </span>
              <span aria-hidden="true">·</span>
              <span>
                สีบังคับ:{' '}
                <strong
                  className={
                    mixValidation.hasGreen && mixValidation.hasRedOrPink
                      ? 'text-emerald-700'
                      : 'text-red-700'
                  }
                >
                  เขียว {mixValidation.hasGreen ? '✓' : '✗'} / แดง {mixValidation.hasRedOrPink ? '✓' : '✗'}
                </strong>
              </span>
            </div>
            <span className="font-semibold">
              {check2MixValid ? (
                <span className="text-emerald-700 inline-flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> ผ่านเกณฑ์ ({mixValidation.activeCount} สี · {totalSelectedLotsCount} ล็อต · มีสีเขียวแซมคู่แดง)
                </span>
              ) : (
                <span className="text-red-700 inline-flex items-center gap-1">
                  <XCircle className="w-3.5 h-3.5" /> {mixValidation.reasons[0] || 'การผสมสีไม่ผ่านเกณฑ์'}
                </span>
              )}
            </span>
          </div>
        </div>

        {/* Checklists 1–8: 7-Eleven Quality Standards Table */}
        <div className="p-6 space-y-4 bg-transparent">
          {/* Header Card with Progress, Stats & Fast Pass Action */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-4 md:p-5 shadow-xs space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                    7-Eleven Quality Standards
                  </span>
                  <h3 className="text-sm md:text-base font-bold text-slate-900">
                    ตารางตรวจสอบข้อกำหนดมาตรฐาน 7-Eleven / CP ALL (ครบทั้ง 8 ข้อ)
                  </h3>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  ระบุข้อกำหนดมาตรฐาน 7-Eleven ครบ 8 เช็คลิสต์ พร้อมระบบสุ่มชั่งน้ำหนัก 10–20 กล่อง (Hold/Reject) และบันทึกข้อบกพร่อง/CAPA
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={handlePassAllTableItems}
                  className="px-3.5 py-2 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-xl transition-all whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 shadow-2xs hover:shadow-xs active:scale-[0.99] cursor-pointer"
                  title="คลิกเพื่อตั้งค่าให้ผ่านเกณฑ์ทั้ง 8 ข้อพร้อมกัน"
                >
                  <Check className="w-4 h-4 text-emerald-700" />
                  <span>เลือกผ่านทั้งหมด (Pass All 8/8)</span>
                </button>
                <button
                  type="button"
                  onClick={handleResetAllChecklistItems}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-xl transition-all whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 shadow-2xs hover:shadow-xs active:scale-[0.99] cursor-pointer"
                  title="ล้างผลการตรวจทั้งหมดเป็นสถานะยังไม่เลือก เพื่อให้เลือกเองได้อิสระ"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                  <span>ล้างการเลือกทั้งหมด (Reset)</span>
                </button>
              </div>
            </div>

            {/* Progress Bar & Filter Tabs */}
            <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-[240px] max-w-md w-full">
                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      allEightChecksPass ? 'bg-emerald-600' : 'bg-amber-500'
                    }`}
                    style={{ width: `${(passedChecklistCount / 8) * 100}%` }}
                  />
                </div>
                <span className="text-xs font-semibold tabular-nums text-slate-700 whitespace-nowrap">
                  ผ่านแล้ว{' '}
                  <strong className={allEightChecksPass ? 'text-emerald-700' : 'text-amber-700'}>
                    {passedChecklistCount}/8 ข้อ
                  </strong>{' '}
                  ({Math.round((passedChecklistCount / 8) * 100)}%)
                </span>
              </div>

              {/* Filter Tabs */}
              <div className="inline-flex items-center p-1 bg-slate-100/90 rounded-xl border border-slate-200/80 text-xs shrink-0 self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => setChecklistFilter('all')}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                    checklistFilter === 'all'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  ทั้งหมด (8)
                </button>
                <button
                  type="button"
                  onClick={() => setChecklistFilter('pass')}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                    checklistFilter === 'pass'
                      ? 'bg-white text-emerald-800 shadow-2xs'
                      : 'text-slate-600 hover:text-emerald-800'
                  }`}
                >
                  ผ่านเกณฑ์ ({passedChecklistCount})
                </button>
                <button
                  type="button"
                  onClick={() => setChecklistFilter('fail')}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                    checklistFilter === 'fail'
                      ? 'bg-white text-rose-800 shadow-2xs'
                      : 'text-slate-600 hover:text-rose-800'
                  }`}
                >
                  ไม่ผ่าน ({failedChecklistCount})
                </button>
                <button
                  type="button"
                  onClick={() => setChecklistFilter('pending')}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                    checklistFilter === 'pending'
                      ? 'bg-white text-amber-800 shadow-2xs'
                      : 'text-slate-600 hover:text-amber-800'
                  }`}
                >
                  ยังไม่เลือก ({pendingChecklistCount})
                </button>
              </div>
            </div>
          </div>

          {/* Mobile Checklist Cards View (< md) */}
          <div className="md:hidden space-y-4">
            {/* Card 1: การปิดผนึกฝากล่อง */}
            {isRowVisible(1) && (
              <div
                className={`bg-white border rounded-2xl p-4 sm:p-5 space-y-3.5 shadow-xs transition-all ${
                  isItem1Pass
                    ? 'border-emerald-300/80 bg-gradient-to-b from-emerald-50/20 via-white to-white'
                    : isItem1Fail
                    ? 'border-red-300/90 bg-gradient-to-b from-red-50/25 via-white to-white'
                    : 'border-slate-200/90 hover:border-slate-300'
                }`}
              >
                {/* Top Meta Bar */}
                <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`inline-flex items-center justify-center w-6 h-6 rounded-lg font-bold text-xs shrink-0 shadow-2xs transition-colors ${
                        isItem1Pass
                          ? 'bg-emerald-600 text-white'
                          : isItem1Fail
                          ? 'bg-red-600 text-white'
                          : 'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}
                    >
                      {isItem1Pass ? <Check className="w-3.5 h-3.5 stroke-[2.5]" /> : isItem1Fail ? <X className="w-3.5 h-3.5 stroke-[2.5]" /> : '1'}
                    </span>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200/70 truncate">
                      {CHECKLIST_STANDARDS[1].categoryTag}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setActiveSpecDetailItem(1)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-emerald-800 hover:text-emerald-950 bg-white hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 rounded-lg transition-all shrink-0 active:scale-95 shadow-2xs"
                  >
                    <Info className="w-3.5 h-3.5 text-emerald-600" />
                    <span>เกณฑ์ข้อกำหนด</span>
                  </button>
                </div>

                {/* Title & Standard Requirement */}
                <div className="space-y-0.5">
                  <h4 className="font-bold text-[14px] text-slate-900 leading-snug">
                    {CHECKLIST_STANDARDS[1].title}
                  </h4>
                  <p className="text-[12px] text-slate-500 leading-relaxed">
                    {CHECKLIST_STANDARDS[1].criterion7Eleven}
                  </p>
                </div>

                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-50 text-[11px] font-medium text-slate-700 border border-slate-200/80">
                      <Check className="w-3 h-3 text-emerald-600" />
                      กล่อง PET ล็อค 4 มุม
                    </span>
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-50 text-[11px] font-medium text-slate-700 border border-slate-200/80">
                      <Check className="w-3 h-3 text-emerald-600" />
                      ตรวจสัมผัสและแรงกด
                    </span>
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-50 text-[11px] font-medium text-slate-700 border border-slate-200/80">
                      <Check className="w-3 h-3 text-emerald-600" />
                      ไม่เผยอหรือฉีกขาด
                    </span>
                  </div>
                  <input
                    type="text"
                    value={check1Note}
                    onChange={(e) => setCheck1Note(e.target.value)}
                    placeholder="บันทึกผลการปิดผนึกฝากล่อง (ไม่บังคับ)..."
                    className="w-full px-3.5 py-2 text-xs bg-slate-50/80 focus:bg-white border border-slate-200 focus:border-emerald-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all placeholder:text-slate-400"
                  />
                </div>

                <div className="pt-2.5 border-t border-slate-100 space-y-2.5">
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => handleToggleItemStatus(1, 'PASS')}
                      className={`min-h-[44px] px-3 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 border cursor-pointer active:scale-98 ${
                        isItem1Pass
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm ring-2 ring-emerald-500/30'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-emerald-50/50 hover:border-emerald-300'
                      }`}
                      title="กดเลือก PASS (กดซ้ำเพื่อยกเลิก)"
                    >
                      <CheckCircle2 className={`w-4 h-4 shrink-0 ${isItem1Pass ? 'text-white' : 'text-emerald-600'}`} />
                      <span>PASS ผ่านเกณฑ์</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleItemStatus(1, 'FAIL')}
                      className={`min-h-[44px] px-3 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 border cursor-pointer active:scale-98 ${
                        isItem1Fail
                          ? 'bg-red-600 text-white border-red-600 shadow-sm ring-2 ring-red-500/30'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-red-50/50 hover:border-red-300'
                      }`}
                      title="กดเลือก FAIL (กดซ้ำเพื่อยกเลิก)"
                    >
                      <XCircle className={`w-4 h-4 shrink-0 ${isItem1Fail ? 'text-white' : 'text-red-600'}`} />
                      <span>FAIL ไม่ผ่าน</span>
                    </button>
                  </div>

                  {isItem1Pass ? (
                    <div className="flex items-center justify-between gap-2 text-emerald-800 font-medium py-2 px-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                        <span className="truncate text-[11px] font-semibold">ผ่านเกณฑ์: ฝาปิดสนิทครบ 4 มุม ไม่เผยอ</span>
                      </div>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase bg-emerald-600 text-white tracking-wide shrink-0">PASS</span>
                    </div>
                  ) : isItem1Fail ? (
                    <div className="p-3 rounded-xl bg-red-50/90 border border-red-300 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-red-800 flex items-center gap-1.5">
                          <AlertCircle className="w-3.5 h-3.5 text-red-600" /> ไม่ผ่านเกณฑ์ (FAIL)
                        </span>
                        <button
                          type="button"
                          onClick={() => handleOpenFailModal(1)}
                          className="text-[11px] font-bold text-red-700 hover:text-red-900 underline flex items-center gap-1"
                        >
                          <Edit className="w-3 h-3" /> แก้ไข CAPA
                        </button>
                      </div>
                      <div className="text-red-900 bg-white/80 p-2 rounded-lg border border-red-200">
                        <strong>สาเหตุ:</strong> {checkDefects[1]?.reason || 'ยังไม่ได้ระบุสาเหตุ'}
                      </div>
                      <div className="text-blue-900 bg-white/80 p-2 rounded-lg border border-blue-200">
                        <strong>วิธีแก้ไข:</strong> {checkDefects[1]?.correctiveAction || 'ยังไม่ได้ระบุวิธีแก้ไข'}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-slate-500 py-2 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                      <span className="w-2 h-2 rounded-full bg-slate-300 shrink-0" />
                      <span className="text-[11px]">ยังไม่ได้เลือกผลตรวจ (กด PASS หรือ FAIL เพื่อบันทึก)</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Card 2: การผสมสี 3–5 สายพันธุ์ */}
            {isRowVisible(2) && (
              <div
                className={`bg-white border rounded-2xl p-4 sm:p-5 space-y-3.5 shadow-xs transition-all ${
                  isItem2Pass
                    ? 'border-emerald-300/80 bg-gradient-to-b from-emerald-50/20 via-white to-white'
                    : isItem2Fail
                    ? 'border-red-300/90 bg-gradient-to-b from-red-50/25 via-white to-white'
                    : 'border-slate-200/90 hover:border-slate-300'
                }`}
              >
                {/* Top Meta Bar */}
                <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`inline-flex items-center justify-center w-6 h-6 rounded-lg font-bold text-xs shrink-0 shadow-2xs transition-colors ${
                        isItem2Pass
                          ? 'bg-emerald-600 text-white'
                          : isItem2Fail
                          ? 'bg-red-600 text-white'
                          : 'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}
                    >
                      {isItem2Pass ? <Check className="w-3.5 h-3.5 stroke-[2.5]" /> : isItem2Fail ? <X className="w-3.5 h-3.5 stroke-[2.5]" /> : '2'}
                    </span>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200/70 truncate">
                      {CHECKLIST_STANDARDS[2].categoryTag}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setActiveSpecDetailItem(2)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-emerald-800 hover:text-emerald-950 bg-white hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 rounded-lg transition-all shrink-0 active:scale-95 shadow-2xs"
                  >
                    <Info className="w-3.5 h-3.5 text-emerald-600" />
                    <span>เกณฑ์ข้อกำหนด</span>
                  </button>
                </div>

                {/* Title & Standard Requirement */}
                <div className="space-y-0.5">
                  <h4 className="font-bold text-[14px] text-slate-900 leading-snug">
                    {CHECKLIST_STANDARDS[2].title}
                  </h4>
                  <p className="text-[12px] text-slate-500 leading-relaxed">
                    {CHECKLIST_STANDARDS[2].criterion7Eleven}
                  </p>
                </div>

                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold ${
                        check2MixValid
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : 'bg-red-100 text-red-800 border border-red-300'
                      }`}
                    >
                      {check2MixValid ? (
                        <Check className="w-3 h-3 text-emerald-700" />
                      ) : (
                        <AlertCircle className="w-3 h-3 text-red-700" />
                      )}
                      {check2MixValid ? 'คละ 3–5 สี สัดส่วนครบ 100%' : 'สัดส่วนไม่ครบ หรือขาดสายพันธุ์บังคับ'}
                    </span>
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-50 text-[11px] text-slate-700 border border-slate-200/80 font-medium">
                      คละ {colorMix.filter((c) => c.percentage > 0).length} สายพันธุ์
                    </span>
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-[11px] text-emerald-800 border border-emerald-200 font-medium">
                      ✓ มีกรูรามิเขียว + แดง/ชมพู
                    </span>
                  </div>
                  <input
                    type="text"
                    value={check2Note}
                    onChange={(e) => setCheck2Note(e.target.value)}
                    placeholder="บันทึกผลการคละสีและสายพันธุ์..."
                    className="w-full px-3.5 py-2 text-xs bg-slate-50/80 focus:bg-white border border-slate-200 focus:border-emerald-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all placeholder:text-slate-400"
                  />
                </div>

                <div className="pt-2.5 border-t border-slate-100 space-y-2.5">
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => handleToggleItemStatus(2, 'PASS')}
                      className={`min-h-[44px] px-3 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 border cursor-pointer active:scale-98 ${
                        isItem2Pass
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm ring-2 ring-emerald-500/30'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-emerald-50/50 hover:border-emerald-300'
                      }`}
                      title="กดเลือก PASS (กดซ้ำเพื่อยกเลิก)"
                    >
                      <CheckCircle2 className={`w-4 h-4 shrink-0 ${isItem2Pass ? 'text-white' : 'text-emerald-600'}`} />
                      <span>PASS ผ่านเกณฑ์</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleItemStatus(2, 'FAIL')}
                      className={`min-h-[44px] px-3 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 border cursor-pointer active:scale-98 ${
                        isItem2Fail
                          ? 'bg-red-600 text-white border-red-600 shadow-sm ring-2 ring-red-500/30'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-red-50/50 hover:border-red-300'
                      }`}
                      title="กดเลือก FAIL (กดซ้ำเพื่อยกเลิก)"
                    >
                      <XCircle className={`w-4 h-4 shrink-0 ${isItem2Fail ? 'text-white' : 'text-red-600'}`} />
                      <span>FAIL ไม่ผ่าน</span>
                    </button>
                  </div>

                  {isItem2Pass ? (
                    <div className="flex items-center justify-between gap-2 text-emerald-800 font-medium py-2 px-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                        <span className="truncate text-[11px] font-semibold">ผ่านเกณฑ์: คละ 3–5 สี สัดส่วนครบ 100% บังคับเขียวกรูรามิ+แดง</span>
                      </div>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase bg-emerald-600 text-white tracking-wide shrink-0">PASS</span>
                    </div>
                  ) : isItem2Fail ? (
                    <div className="p-3 rounded-xl bg-red-50/90 border border-red-300 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-red-800 flex items-center gap-1.5">
                          <AlertCircle className="w-3.5 h-3.5 text-red-600" /> ไม่ผ่านเกณฑ์ (FAIL)
                        </span>
                        <button
                          type="button"
                          onClick={() => handleOpenFailModal(2)}
                          className="text-[11px] font-bold text-red-700 hover:text-red-900 underline flex items-center gap-1"
                        >
                          <Edit className="w-3 h-3" /> แก้ไข CAPA
                        </button>
                      </div>
                      <div className="text-red-900 bg-white/80 p-2 rounded-lg border border-red-200">
                        <strong>สาเหตุ:</strong> {checkDefects[2]?.reason || 'สัดส่วนไม่ครบ 100% หรือขาดสายพันธุ์บังคับ'}
                      </div>
                      <div className="text-blue-900 bg-white/80 p-2 rounded-lg border border-blue-200">
                        <strong>วิธีแก้ไข:</strong> {checkDefects[2]?.correctiveAction || 'ยังไม่ได้ระบุวิธีแก้ไข'}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-slate-500 py-2 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                      <span className="w-2 h-2 rounded-full bg-slate-300 shrink-0" />
                      <span className="text-[11px]">ยังไม่ได้เลือกผลตรวจ (กด PASS หรือ FAIL เพื่อบันทึก)</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Card 3: ฉลากระบุวันผลิต-วันหมดอายุ (+6 วัน) & ล้างก่อนรับประทาน */}
            {isRowVisible(3) && (
              <div
                className={`bg-white border rounded-2xl p-4 sm:p-5 space-y-3.5 shadow-xs transition-all ${
                  isItem3Pass
                    ? 'border-emerald-300/80 bg-gradient-to-b from-emerald-50/20 via-white to-white'
                    : isItem3Fail
                    ? 'border-red-300/90 bg-gradient-to-b from-red-50/25 via-white to-white'
                    : 'border-slate-200/90 hover:border-slate-300'
                }`}
              >
                {/* Top Meta Bar */}
                <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`inline-flex items-center justify-center w-6 h-6 rounded-lg font-bold text-xs shrink-0 shadow-2xs transition-colors ${
                        isItem3Pass
                          ? 'bg-emerald-600 text-white'
                          : isItem3Fail
                          ? 'bg-red-600 text-white'
                          : 'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}
                    >
                      {isItem3Pass ? <Check className="w-3.5 h-3.5 stroke-[2.5]" /> : isItem3Fail ? <X className="w-3.5 h-3.5 stroke-[2.5]" /> : '3'}
                    </span>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200/70 truncate">
                      {CHECKLIST_STANDARDS[3].categoryTag}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setActiveSpecDetailItem(3)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-emerald-800 hover:text-emerald-950 bg-white hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 rounded-lg transition-all shrink-0 active:scale-95 shadow-2xs"
                  >
                    <Info className="w-3.5 h-3.5 text-emerald-600" />
                    <span>เกณฑ์ข้อกำหนด</span>
                  </button>
                </div>

                {/* Title & Standard Requirement */}
                <div className="space-y-0.5">
                  <h4 className="font-bold text-[14px] text-slate-900 leading-snug">
                    {CHECKLIST_STANDARDS[3].title}
                  </h4>
                  <p className="text-[12px] text-slate-500 leading-relaxed">
                    {CHECKLIST_STANDARDS[3].criterion7Eleven}
                  </p>
                </div>

                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-800 border border-blue-200 text-[11px] font-mono font-medium">
                      MFG {formatThaiDate(mfgDate)} → EXP {formatThaiDate(expDate)} ({shelfLifeDays ?? '-'} วัน)
                    </span>
                    <span
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold ${
                        isSixDayShelfLife ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-red-100 text-red-800 border border-red-200'
                      }`}
                    >
                      {isSixDayShelfLife ? '✓ ตรงเกณฑ์ 6 วัน' : '✗ ไม่ตรง 6 วัน'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-2">
                    <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200 hover:bg-slate-100/80 cursor-pointer transition-colors text-xs">
                      <input
                        type="checkbox"
                        checked={check3ExpiryLabel}
                        onChange={(e) => setCheck3ExpiryLabel(e.target.checked)}
                        className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="text-slate-800 font-medium">
                        ระบุ วันผลิต-หมดอายุ (+6 วัน) ถูกต้อง
                      </span>
                    </label>
                    <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200 hover:bg-slate-100/80 cursor-pointer transition-colors text-xs">
                      <input
                        type="checkbox"
                        checked={check3WashLabel}
                        onChange={(e) => setCheck3WashLabel(e.target.checked)}
                        className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="text-slate-800 font-medium">
                        ระบุ &ldquo;ล้างก่อนรับประทาน&rdquo; ชัดเจน
                      </span>
                    </label>
                  </div>

                  <input
                    type="text"
                    value={check3Note}
                    onChange={(e) => setCheck3Note(e.target.value)}
                    placeholder="บันทึกผลการตรวจสอบฉลาก..."
                    className="w-full px-3.5 py-2 text-xs bg-slate-50/80 focus:bg-white border border-slate-200 focus:border-emerald-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all placeholder:text-slate-400"
                  />
                </div>

                <div className="pt-2.5 border-t border-slate-100 space-y-2.5">
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => handleToggleItemStatus(3, 'PASS')}
                      className={`min-h-[44px] px-3 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 border cursor-pointer active:scale-98 ${
                        isItem3Pass
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm ring-2 ring-emerald-500/30'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-emerald-50/50 hover:border-emerald-300'
                      }`}
                      title="กดเลือก PASS (กดซ้ำเพื่อยกเลิก)"
                    >
                      <CheckCircle2 className={`w-4 h-4 shrink-0 ${isItem3Pass ? 'text-white' : 'text-emerald-600'}`} />
                      <span>PASS ผ่านเกณฑ์</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleItemStatus(3, 'FAIL')}
                      className={`min-h-[44px] px-3 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 border cursor-pointer active:scale-98 ${
                        isItem3Fail
                          ? 'bg-red-600 text-white border-red-600 shadow-sm ring-2 ring-red-500/30'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-red-50/50 hover:border-red-300'
                      }`}
                      title="กดเลือก FAIL (กดซ้ำเพื่อยกเลิก)"
                    >
                      <XCircle className={`w-4 h-4 shrink-0 ${isItem3Fail ? 'text-white' : 'text-red-600'}`} />
                      <span>FAIL ไม่ผ่าน</span>
                    </button>
                  </div>

                  {isItem3Pass ? (
                    <div className="flex items-center justify-between gap-2 text-emerald-800 font-medium py-2 px-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                        <span className="truncate text-[11px] font-semibold">ผ่านเกณฑ์: อายุ 6 วัน & ระบุ &ldquo;ล้างก่อนรับประทาน&rdquo;</span>
                      </div>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase bg-emerald-600 text-white tracking-wide shrink-0">PASS</span>
                    </div>
                  ) : isItem3Fail ? (
                    <div className="p-3 rounded-xl bg-red-50/90 border border-red-300 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-red-800 flex items-center gap-1.5">
                          <AlertCircle className="w-3.5 h-3.5 text-red-600" /> ไม่ผ่านเกณฑ์ (FAIL)
                        </span>
                        <button
                          type="button"
                          onClick={() => handleOpenFailModal(3)}
                          className="text-[11px] font-bold text-red-700 hover:text-red-900 underline flex items-center gap-1"
                        >
                          <Edit className="w-3 h-3" /> แก้ไข CAPA
                        </button>
                      </div>
                      <div className="text-red-900 bg-white/80 p-2 rounded-lg border border-red-200">
                        <strong>สาเหตุ:</strong> {checkDefects[3]?.reason || 'อายุสินค้าไม่ตรง 6 วัน หรือตกหล่นข้อความบังคับ'}
                      </div>
                      <div className="text-blue-900 bg-white/80 p-2 rounded-lg border border-blue-200">
                        <strong>วิธีแก้ไข:</strong> {checkDefects[3]?.correctiveAction || 'ยังไม่ได้ระบุวิธีแก้ไข'}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-slate-500 py-2 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                      <span className="w-2 h-2 rounded-full bg-slate-300 shrink-0" />
                      <span className="text-[11px]">ยังไม่ได้เลือกผลตรวจ (กด PASS หรือ FAIL เพื่อบันทึก)</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Card 4: น้ำหนักสุทธิสินค้า */}
            {isRowVisible(4) && (
              <div
                className={`bg-white border rounded-2xl p-4 sm:p-5 space-y-3.5 shadow-xs transition-all ${
                  isItem4Pass
                    ? 'border-emerald-300/80 bg-gradient-to-b from-emerald-50/20 via-white to-white'
                    : isItem4Fail
                    ? 'border-red-300/90 bg-gradient-to-b from-red-50/25 via-white to-white'
                    : 'border-slate-200/90 hover:border-slate-300'
                }`}
              >
                {/* Top Meta Bar */}
                <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`inline-flex items-center justify-center w-6 h-6 rounded-lg font-bold text-xs shrink-0 shadow-2xs transition-colors ${
                        isItem4Pass
                          ? 'bg-emerald-600 text-white'
                          : isItem4Fail
                          ? 'bg-red-600 text-white'
                          : 'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}
                    >
                      {isItem4Pass ? <Check className="w-3.5 h-3.5 stroke-[2.5]" /> : isItem4Fail ? <X className="w-3.5 h-3.5 stroke-[2.5]" /> : '4'}
                    </span>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200/70 truncate">
                      {CHECKLIST_STANDARDS[4].categoryTag}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setActiveSpecDetailItem(4)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-emerald-800 hover:text-emerald-950 bg-white hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 rounded-lg transition-all shrink-0 active:scale-95 shadow-2xs"
                  >
                    <Info className="w-3.5 h-3.5 text-emerald-600" />
                    <span>เกณฑ์ข้อกำหนด</span>
                  </button>
                </div>

                {/* Title & Standard Requirement */}
                <div className="space-y-0.5">
                  <h4 className="font-bold text-[14px] text-slate-900 leading-snug">
                    {CHECKLIST_STANDARDS[4].title}
                  </h4>
                  <p className="text-[12px] text-slate-500 leading-relaxed">
                    {CHECKLIST_STANDARDS[4].criterion7Eleven}
                  </p>
                </div>

                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative flex-1 min-w-[120px]">
                      <Scale className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="number"
                        min={0}
                        step="0.1"
                        value={netWeightG}
                        onChange={(e) => setNetWeightG(parseFloat(e.target.value) || 0)}
                        className={`w-full pl-9 pr-9 py-2 text-xs font-bold tabular-nums bg-white border rounded-xl focus:outline-none focus:ring-2 ${
                          rawCheck4NetWeightPass
                            ? 'border-slate-300 focus:ring-emerald-500/20 focus:border-emerald-500'
                            : 'border-red-400 text-red-700 focus:ring-red-500/20 focus:border-red-500'
                        }`}
                      />
                      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-slate-400 font-medium">
                        กรัม
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={handleOpenWeightSamplingModal}
                      className="px-3 py-2 text-xs font-semibold text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl transition-all inline-flex items-center gap-1.5 shadow-2xs active:scale-95 shrink-0"
                    >
                      <Scale className="w-3.5 h-3.5 text-blue-600" />
                      <span>สุ่มชั่ง 10–20 กล่อง</span>
                    </button>
                  </div>

                  {hasUnderweightSample && (
                    <div className="p-2.5 bg-red-100/90 border border-red-300 text-red-900 rounded-xl text-xs font-bold flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                      <span>🚨 ตรวจพบกล่องน้ำหนัก &lt; 140.0g ({sampleWeights.filter((w) => w < 140).length} กล่อง): HOLD หรือ REJECT!</span>
                    </div>
                  )}

                  {sampleWeights && sampleWeights.length > 0 && (
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-600 font-medium">สุ่มตรวจ {sampleWeights.length} กล่อง:</span>
                        <span className="tabular-nums text-slate-800 font-mono font-bold">
                          เฉลี่ย {netWeightG.toFixed(1)}g
                        </span>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                        hasUnderweightSample ? 'bg-red-600 text-white' : 'bg-emerald-600 text-white'
                      }`}>
                        {hasUnderweightSample ? 'HOLD / REJECT' : 'PASS'}
                      </span>
                    </div>
                  )}

                  <input
                    type="text"
                    value={check4Note}
                    onChange={(e) => setCheck4Note(e.target.value)}
                    placeholder="บันทึกผลการชั่งน้ำหนักสุทธิ..."
                    className="w-full px-3.5 py-2 text-xs bg-slate-50/80 focus:bg-white border border-slate-200 focus:border-emerald-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all placeholder:text-slate-400"
                  />
                </div>

                <div className="pt-2.5 border-t border-slate-100 space-y-2.5">
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => handleToggleItemStatus(4, 'PASS')}
                      className={`min-h-[44px] px-3 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 border cursor-pointer active:scale-98 ${
                        isItem4Pass
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm ring-2 ring-emerald-500/30'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-emerald-50/50 hover:border-emerald-300'
                      }`}
                      title="กดเลือก PASS (กดซ้ำเพื่อยกเลิก)"
                    >
                      <CheckCircle2 className={`w-4 h-4 shrink-0 ${isItem4Pass ? 'text-white' : 'text-emerald-600'}`} />
                      <span>PASS ผ่านเกณฑ์</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleItemStatus(4, 'FAIL')}
                      className={`min-h-[44px] px-3 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 border cursor-pointer active:scale-98 ${
                        isItem4Fail
                          ? 'bg-red-600 text-white border-red-600 shadow-sm ring-2 ring-red-500/30'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-red-50/50 hover:border-red-300'
                      }`}
                      title="กดเลือก FAIL (กดซ้ำเพื่อยกเลิก)"
                    >
                      <XCircle className={`w-4 h-4 shrink-0 ${isItem4Fail ? 'text-white' : 'text-red-600'}`} />
                      <span>FAIL ไม่ผ่าน</span>
                    </button>
                  </div>

                  {isItem4Pass ? (
                    <div className="flex items-center justify-between gap-2 text-emerald-800 font-medium py-2 px-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                        <span className="truncate text-[11px] font-semibold">ผ่านเกณฑ์: น้ำหนักเฉลี่ย {netWeightG.toFixed(1)}g (≥ 140g ทุกกล่อง)</span>
                      </div>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase bg-emerald-600 text-white tracking-wide shrink-0">PASS</span>
                    </div>
                  ) : isItem4Fail ? (
                    <div className="p-3 rounded-xl bg-red-50/90 border border-red-300 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-red-800 flex items-center gap-1.5">
                          <AlertCircle className="w-3.5 h-3.5 text-red-600" /> ไม่ผ่านเกณฑ์ (FAIL)
                        </span>
                        <button
                          type="button"
                          onClick={() => handleOpenFailModal(4)}
                          className="text-[11px] font-bold text-red-700 hover:text-red-900 underline flex items-center gap-1"
                        >
                          <Edit className="w-3 h-3" /> แก้ไข CAPA
                        </button>
                      </div>
                      <div className="text-red-900 bg-white/80 p-2 rounded-lg border border-red-200">
                        <strong>สาเหตุ:</strong> {checkDefects[4]?.reason || 'มีกล่องน้ำหนักต่ำกว่า 140 กรัม'}
                      </div>
                      <div className="text-blue-900 bg-white/80 p-2 rounded-lg border border-blue-200">
                        <strong>วิธีแก้ไข:</strong> {checkDefects[4]?.correctiveAction || 'ยังไม่ได้ระบุวิธีแก้ไข'}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-slate-500 py-2 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                      <span className="w-2 h-2 rounded-full bg-slate-300 shrink-0" />
                      <span className="text-[11px]">ยังไม่ได้เลือกผลตรวจ (กด PASS หรือ FAIL เพื่อบันทึก)</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Card 5: ลักษณะทางกายภาพของสินค้า */}
            {isRowVisible(5) && (
              <div
                className={`bg-white border rounded-2xl p-4 sm:p-5 space-y-3.5 shadow-xs transition-all ${
                  isItem5Pass
                    ? 'border-emerald-300/80 bg-gradient-to-b from-emerald-50/20 via-white to-white'
                    : isItem5Fail
                    ? 'border-red-300/90 bg-gradient-to-b from-red-50/25 via-white to-white'
                    : 'border-slate-200/90 hover:border-slate-300'
                }`}
              >
                {/* Top Meta Bar */}
                <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`inline-flex items-center justify-center w-6 h-6 rounded-lg font-bold text-xs shrink-0 shadow-2xs transition-colors ${
                        isItem5Pass
                          ? 'bg-emerald-600 text-white'
                          : isItem5Fail
                          ? 'bg-red-600 text-white'
                          : 'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}
                    >
                      {isItem5Pass ? <Check className="w-3.5 h-3.5 stroke-[2.5]" /> : isItem5Fail ? <X className="w-3.5 h-3.5 stroke-[2.5]" /> : '5'}
                    </span>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200/70 truncate">
                      {CHECKLIST_STANDARDS[5].categoryTag}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setActiveSpecDetailItem(5)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-emerald-800 hover:text-emerald-950 bg-white hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 rounded-lg transition-all shrink-0 active:scale-95 shadow-2xs"
                  >
                    <Info className="w-3.5 h-3.5 text-emerald-600" />
                    <span>เกณฑ์ข้อกำหนด</span>
                  </button>
                </div>

                {/* Title & Standard Requirement */}
                <div className="space-y-0.5">
                  <h4 className="font-bold text-[14px] text-slate-900 leading-snug">
                    {CHECKLIST_STANDARDS[5].title}
                  </h4>
                  <p className="text-[12px] text-slate-500 leading-relaxed">
                    {CHECKLIST_STANDARDS[5].criterion7Eleven}
                  </p>
                </div>

                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-50 text-[11px] font-medium text-slate-700 border border-slate-200/80">
                      <Check className="w-3 h-3 text-emerald-600" />
                      ผลสดตึงเงางาม
                    </span>
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-50 text-[11px] font-medium text-slate-700 border border-slate-200/80">
                      <Check className="w-3 h-3 text-emerald-600" />
                      ขั้วเขียวสด
                    </span>
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-50 text-[11px] font-medium text-slate-700 border border-slate-200/80">
                      <Check className="w-3 h-3 text-emerald-600" />
                      ไร้หยดน้ำในกล่อง
                    </span>
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-50 text-[11px] font-medium text-slate-700 border border-slate-200/80">
                      <Check className="w-3 h-3 text-emerald-600" />
                      ไม่มีผลแตก/ช้ำ
                    </span>
                  </div>
                  <input
                    type="text"
                    value={check5Note}
                    onChange={(e) => setCheck5Note(e.target.value)}
                    placeholder="บันทึกผลการตรวจลักษณะทางกายภาพ..."
                    className="w-full px-3.5 py-2 text-xs bg-slate-50/80 focus:bg-white border border-slate-200 focus:border-emerald-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all placeholder:text-slate-400"
                  />
                </div>

                <div className="pt-2.5 border-t border-slate-100 space-y-2.5">
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => handleToggleItemStatus(5, 'PASS')}
                      className={`min-h-[44px] px-3 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 border cursor-pointer active:scale-98 ${
                        isItem5Pass
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm ring-2 ring-emerald-500/30'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-emerald-50/50 hover:border-emerald-300'
                      }`}
                      title="กดเลือก PASS (กดซ้ำเพื่อยกเลิก)"
                    >
                      <CheckCircle2 className={`w-4 h-4 shrink-0 ${isItem5Pass ? 'text-white' : 'text-emerald-600'}`} />
                      <span>PASS ผ่านเกณฑ์</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleItemStatus(5, 'FAIL')}
                      className={`min-h-[44px] px-3 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 border cursor-pointer active:scale-98 ${
                        isItem5Fail
                          ? 'bg-red-600 text-white border-red-600 shadow-sm ring-2 ring-red-500/30'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-red-50/50 hover:border-red-300'
                      }`}
                      title="กดเลือก FAIL (กดซ้ำเพื่อยกเลิก)"
                    >
                      <XCircle className={`w-4 h-4 shrink-0 ${isItem5Fail ? 'text-white' : 'text-red-600'}`} />
                      <span>FAIL ไม่ผ่าน</span>
                    </button>
                  </div>

                  {isItem5Pass ? (
                    <div className="flex items-center justify-between gap-2 text-emerald-800 font-medium py-2 px-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                        <span className="truncate text-[11px] font-semibold">ผ่านเกณฑ์: ผลสดตึงเงางาม ไร้หยดน้ำเกาะกล่อง</span>
                      </div>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase bg-emerald-600 text-white tracking-wide shrink-0">PASS</span>
                    </div>
                  ) : isItem5Fail ? (
                    <div className="p-3 rounded-xl bg-red-50/90 border border-red-300 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-red-800 flex items-center gap-1.5">
                          <AlertCircle className="w-3.5 h-3.5 text-red-600" /> ไม่ผ่านเกณฑ์ (FAIL)
                        </span>
                        <button
                          type="button"
                          onClick={() => handleOpenFailModal(5)}
                          className="text-[11px] font-bold text-red-700 hover:text-red-900 underline flex items-center gap-1"
                        >
                          <Edit className="w-3 h-3" /> แก้ไข CAPA
                        </button>
                      </div>
                      <div className="text-red-900 bg-white/80 p-2 rounded-lg border border-red-200">
                        <strong>สาเหตุ:</strong> {checkDefects[5]?.reason || 'ยังไม่ได้ระบุสาเหตุ'}
                      </div>
                      <div className="text-blue-900 bg-white/80 p-2 rounded-lg border border-blue-200">
                        <strong>วิธีแก้ไข:</strong> {checkDefects[5]?.correctiveAction || 'ยังไม่ได้ระบุวิธีแก้ไข'}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-slate-500 py-2 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                      <span className="w-2 h-2 rounded-full bg-slate-300 shrink-0" />
                      <span className="text-[11px]">ยังไม่ได้เลือกผลตรวจ (กด PASS หรือ FAIL เพื่อบันทึก)</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Card 6: จำนวนสินค้าตรงตามใบสั่งซื้อ */}
            {isRowVisible(6) && (
              <div
                className={`bg-white border rounded-2xl p-4 sm:p-5 space-y-3.5 shadow-xs transition-all ${
                  isItem6Pass
                    ? 'border-emerald-300/80 bg-gradient-to-b from-emerald-50/20 via-white to-white'
                    : isItem6Fail
                    ? 'border-red-300/90 bg-gradient-to-b from-red-50/25 via-white to-white'
                    : 'border-slate-200/90 hover:border-slate-300'
                }`}
              >
                {/* Top Meta Bar */}
                <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`inline-flex items-center justify-center w-6 h-6 rounded-lg font-bold text-xs shrink-0 shadow-2xs transition-colors ${
                        isItem6Pass
                          ? 'bg-emerald-600 text-white'
                          : isItem6Fail
                          ? 'bg-red-600 text-white'
                          : 'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}
                    >
                      {isItem6Pass ? <Check className="w-3.5 h-3.5 stroke-[2.5]" /> : isItem6Fail ? <X className="w-3.5 h-3.5 stroke-[2.5]" /> : '6'}
                    </span>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200/70 truncate">
                      {CHECKLIST_STANDARDS[6].categoryTag}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setActiveSpecDetailItem(6)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-emerald-800 hover:text-emerald-950 bg-white hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 rounded-lg transition-all shrink-0 active:scale-95 shadow-2xs"
                  >
                    <Info className="w-3.5 h-3.5 text-emerald-600" />
                    <span>เกณฑ์ข้อกำหนด</span>
                  </button>
                </div>

                {/* Title & Standard Requirement */}
                <div className="space-y-0.5">
                  <h4 className="font-bold text-[14px] text-slate-900 leading-snug">
                    {CHECKLIST_STANDARDS[6].title}
                  </h4>
                  <p className="text-[12px] text-slate-500 leading-relaxed">
                    {CHECKLIST_STANDARDS[6].criterion7Eleven}
                  </p>
                </div>

                <div className="space-y-2.5">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                      <span className="block text-[10px] text-slate-500 mb-0.5 font-medium">ยอดสั่งซื้อ PO</span>
                      <span className="font-bold text-xs text-slate-800 tabular-nums">{orderedPacks.toLocaleString()} แพ็ค</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                      <span className="block text-[10px] text-slate-500 mb-0.5 font-medium">ส่งจริง</span>
                      <span className="font-bold text-xs text-emerald-700 tabular-nums">{actualPacks.toLocaleString()} แพ็ค</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                      <span className="block text-[10px] text-slate-500 mb-0.5 font-medium">จำนวนตะกร้า</span>
                      <span className="font-bold text-xs text-slate-800 tabular-nums">{crateQty} ตะกร้า</span>
                    </div>
                  </div>

                  <span
                    className={`inline-block text-[11px] font-semibold px-2.5 py-1 rounded-lg ${
                      rawCheck6QtyMatch
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        : 'bg-amber-100 text-amber-800 border border-amber-200'
                    }`}
                  >
                    {rawCheck6QtyMatch
                      ? '✓ จำนวนแพ็คตรงตามใบสั่งซื้อ 100%'
                      : `⚠ จำนวนส่ง (${actualPacks}) ไม่ตรงกับยอดสั่ง (${orderedPacks})`}
                  </span>
                </div>

                <div className="pt-2.5 border-t border-slate-100 space-y-2.5">
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => handleToggleItemStatus(6, 'PASS')}
                      className={`min-h-[44px] px-3 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 border cursor-pointer active:scale-98 ${
                        isItem6Pass
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm ring-2 ring-emerald-500/30'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-emerald-50/50 hover:border-emerald-300'
                      }`}
                      title="กดเลือก PASS (กดซ้ำเพื่อยกเลิก)"
                    >
                      <CheckCircle2 className={`w-4 h-4 shrink-0 ${isItem6Pass ? 'text-white' : 'text-emerald-600'}`} />
                      <span>PASS ผ่านเกณฑ์</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleItemStatus(6, 'FAIL')}
                      className={`min-h-[44px] px-3 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 border cursor-pointer active:scale-98 ${
                        isItem6Fail
                          ? 'bg-red-600 text-white border-red-600 shadow-sm ring-2 ring-red-500/30'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-red-50/50 hover:border-red-300'
                      }`}
                      title="กดเลือก FAIL (กดซ้ำเพื่อยกเลิก)"
                    >
                      <XCircle className={`w-4 h-4 shrink-0 ${isItem6Fail ? 'text-white' : 'text-red-600'}`} />
                      <span>FAIL ไม่ผ่าน</span>
                    </button>
                  </div>

                  {isItem6Pass ? (
                    <div className="flex items-center justify-between gap-2 text-emerald-800 font-medium py-2 px-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                        <span className="truncate text-[11px] font-semibold">ผ่านเกณฑ์: ครบถ้วนตาม PO {poNumber || '-'}</span>
                      </div>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase bg-emerald-600 text-white tracking-wide shrink-0">PASS</span>
                    </div>
                  ) : isItem6Fail ? (
                    <div className="p-3 rounded-xl bg-red-50/90 border border-red-300 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-red-800 flex items-center gap-1.5">
                          <AlertCircle className="w-3.5 h-3.5 text-red-600" /> ไม่ผ่านเกณฑ์ (FAIL)
                        </span>
                        <button
                          type="button"
                          onClick={() => handleOpenFailModal(6)}
                          className="text-[11px] font-bold text-red-700 hover:text-red-900 underline flex items-center gap-1"
                        >
                          <Edit className="w-3 h-3" /> แก้ไข CAPA
                        </button>
                      </div>
                      <div className="text-red-900 bg-white/80 p-2 rounded-lg border border-red-200">
                        <strong>สาเหตุ:</strong> {checkDefects[6]?.reason || 'จำนวนบรรจุจริงไม่ตรงตามยอดสั่งซื้อ'}
                      </div>
                      <div className="text-blue-900 bg-white/80 p-2 rounded-lg border border-blue-200">
                        <strong>วิธีแก้ไข:</strong> {checkDefects[6]?.correctiveAction || 'ยังไม่ได้ระบุวิธีแก้ไข'}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-slate-500 py-2 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                      <span className="w-2 h-2 rounded-full bg-slate-300 shrink-0" />
                      <span className="text-[11px]">ยังไม่ได้เลือกผลตรวจ (กด PASS หรือ FAIL เพื่อบันทึก)</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Card 7: อุณหภูมิห้องขณะตรวจตามเกณฑ์ 2-6 °C */}
            {isRowVisible(7) && (
              <div
                className={`bg-white border rounded-2xl p-4 sm:p-5 space-y-3.5 shadow-xs transition-all ${
                  isItem7Pass
                    ? 'border-emerald-300/80 bg-gradient-to-b from-emerald-50/20 via-white to-white'
                    : isItem7Fail
                    ? 'border-red-300/90 bg-gradient-to-b from-red-50/25 via-white to-white'
                    : 'border-slate-200/90 hover:border-slate-300'
                }`}
              >
                {/* Top Meta Bar */}
                <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`inline-flex items-center justify-center w-6 h-6 rounded-lg font-bold text-xs shrink-0 shadow-2xs transition-colors ${
                        isItem7Pass
                          ? 'bg-emerald-600 text-white'
                          : isItem7Fail
                          ? 'bg-red-600 text-white'
                          : 'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}
                    >
                      {isItem7Pass ? <Check className="w-3.5 h-3.5 stroke-[2.5]" /> : isItem7Fail ? <X className="w-3.5 h-3.5 stroke-[2.5]" /> : '7'}
                    </span>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200/70 truncate">
                      {CHECKLIST_STANDARDS[7].categoryTag}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setActiveSpecDetailItem(7)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-emerald-800 hover:text-emerald-950 bg-white hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 rounded-lg transition-all shrink-0 active:scale-95 shadow-2xs"
                  >
                    <Info className="w-3.5 h-3.5 text-emerald-600" />
                    <span>เกณฑ์ข้อกำหนด</span>
                  </button>
                </div>

                {/* Title & Standard Requirement */}
                <div className="space-y-0.5">
                  <h4 className="font-bold text-[14px] text-slate-900 leading-snug">
                    {CHECKLIST_STANDARDS[7].title}
                  </h4>
                  <p className="text-[12px] text-slate-500 leading-relaxed">
                    {CHECKLIST_STANDARDS[7].criterion7Eleven}
                  </p>
                </div>

                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative flex-1 min-w-[120px]">
                      <Thermometer className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        type="number"
                        step="0.1"
                        value={roomTempC}
                        onChange={(e) => setRoomTempC(parseFloat(e.target.value) || 0)}
                        className={`w-full pl-9 pr-8 py-2 text-xs font-bold tabular-nums bg-white border rounded-xl focus:outline-none focus:ring-2 ${
                          rawCheck7RoomTempPass
                            ? 'border-slate-300 focus:ring-emerald-500/20 focus:border-emerald-500'
                            : 'border-red-400 text-red-700 focus:ring-red-500/20 focus:border-red-500'
                        }`}
                      />
                      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-slate-400 font-medium">
                        °C
                      </span>
                    </div>

                    <div className="inline-flex items-center gap-1.5 shrink-0">
                      {[3.5, 4.2, 5.0].map((presetTemp) => {
                        const isSelected = Math.abs(roomTempC - presetTemp) < 0.05;
                        return (
                          <button
                            key={presetTemp}
                            type="button"
                            onClick={() => setRoomTempC(isSelected ? 0 : presetTemp)}
                            className={`px-3 py-2 rounded-xl text-xs font-mono font-bold border transition-all cursor-pointer active:scale-95 ${
                              isSelected
                                ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-slate-300'
                            }`}
                            title={isSelected ? 'คลิกซ้ำเพื่อยกเลิก' : `ตั้งค่า ${presetTemp.toFixed(1)}°C`}
                          >
                            {presetTemp.toFixed(1)}°
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <span
                    className={`inline-block text-[11px] font-semibold px-2.5 py-1 rounded-lg ${
                      rawCheck7RoomTempPass
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                        : 'bg-red-100 text-red-800 border border-red-200'
                    }`}
                  >
                    {rawCheck7RoomTempPass
                      ? '✓ อยู่ในช่วงควบคุม 2.0 – 6.0 °C'
                      : '⚠ อยู่นอกเกณฑ์อุณหภูมิควบคุม!'}
                  </span>
                </div>

                <div className="pt-2.5 border-t border-slate-100 space-y-2.5">
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => handleToggleItemStatus(7, 'PASS')}
                      className={`min-h-[44px] px-3 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 border cursor-pointer active:scale-98 ${
                        isItem7Pass
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm ring-2 ring-emerald-500/30'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-emerald-50/50 hover:border-emerald-300'
                      }`}
                      title="กดเลือก PASS (กดซ้ำเพื่อยกเลิก)"
                    >
                      <CheckCircle2 className={`w-4 h-4 shrink-0 ${isItem7Pass ? 'text-white' : 'text-emerald-600'}`} />
                      <span>PASS ผ่านเกณฑ์</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleItemStatus(7, 'FAIL')}
                      className={`min-h-[44px] px-3 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 border cursor-pointer active:scale-98 ${
                        isItem7Fail
                          ? 'bg-red-600 text-white border-red-600 shadow-sm ring-2 ring-red-500/30'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-red-50/50 hover:border-red-300'
                      }`}
                      title="กดเลือก FAIL (กดซ้ำเพื่อยกเลิก)"
                    >
                      <XCircle className={`w-4 h-4 shrink-0 ${isItem7Fail ? 'text-white' : 'text-red-600'}`} />
                      <span>FAIL ไม่ผ่าน</span>
                    </button>
                  </div>

                  {isItem7Pass ? (
                    <div className="flex items-center justify-between gap-2 text-emerald-800 font-medium py-2 px-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                        <span className="truncate text-[11px] font-semibold">ผ่านเกณฑ์: {roomTempC.toFixed(1)} °C (เกณฑ์ 2.0–6.0 °C)</span>
                      </div>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase bg-emerald-600 text-white tracking-wide shrink-0">PASS</span>
                    </div>
                  ) : isItem7Fail ? (
                    <div className="p-3 rounded-xl bg-red-50/90 border border-red-300 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-red-800 flex items-center gap-1.5">
                          <AlertCircle className="w-3.5 h-3.5 text-red-600" /> ไม่ผ่านเกณฑ์ (FAIL)
                        </span>
                        <button
                          type="button"
                          onClick={() => handleOpenFailModal(7)}
                          className="text-[11px] font-bold text-red-700 hover:text-red-900 underline flex items-center gap-1"
                        >
                          <Edit className="w-3 h-3" /> แก้ไข CAPA
                        </button>
                      </div>
                      <div className="text-red-900 bg-white/80 p-2 rounded-lg border border-red-200">
                        <strong>สาเหตุ:</strong> {checkDefects[7]?.reason || 'อุณหภูมิห้องตรวจอยู่นอกเกณฑ์ควบคุม'}
                      </div>
                      <div className="text-blue-900 bg-white/80 p-2 rounded-lg border border-blue-200">
                        <strong>วิธีแก้ไข:</strong> {checkDefects[7]?.correctiveAction || 'ยังไม่ได้ระบุวิธีแก้ไข'}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-slate-500 py-2 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                      <span className="w-2 h-2 rounded-full bg-slate-300 shrink-0" />
                      <span className="text-[11px]">ยังไม่ได้เลือกผลตรวจ (กด PASS หรือ FAIL เพื่อบันทึก)</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Card 8: ความสะอาดและความเรียบร้อยของตะกร้าขนส่ง */}
            {isRowVisible(8) && (
              <div
                className={`bg-white border rounded-2xl p-4 sm:p-5 space-y-3.5 shadow-xs transition-all ${
                  isItem8Pass
                    ? 'border-emerald-300/80 bg-gradient-to-b from-emerald-50/20 via-white to-white'
                    : isItem8Fail
                    ? 'border-red-300/90 bg-gradient-to-b from-red-50/25 via-white to-white'
                    : 'border-slate-200/90 hover:border-slate-300'
                }`}
              >
                {/* Top Meta Bar */}
                <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`inline-flex items-center justify-center w-6 h-6 rounded-lg font-bold text-xs shrink-0 shadow-2xs transition-colors ${
                        isItem8Pass
                          ? 'bg-emerald-600 text-white'
                          : isItem8Fail
                          ? 'bg-red-600 text-white'
                          : 'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}
                    >
                      {isItem8Pass ? <Check className="w-3.5 h-3.5 stroke-[2.5]" /> : isItem8Fail ? <X className="w-3.5 h-3.5 stroke-[2.5]" /> : '8'}
                    </span>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200/70 truncate">
                      {CHECKLIST_STANDARDS[8].categoryTag}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setActiveSpecDetailItem(8)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-emerald-800 hover:text-emerald-950 bg-white hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 rounded-lg transition-all shrink-0 active:scale-95 shadow-2xs"
                  >
                    <Info className="w-3.5 h-3.5 text-emerald-600" />
                    <span>เกณฑ์ข้อกำหนด</span>
                  </button>
                </div>

                {/* Title & Standard Requirement */}
                <div className="space-y-0.5">
                  <h4 className="font-bold text-[14px] text-slate-900 leading-snug">
                    {CHECKLIST_STANDARDS[8].title}
                  </h4>
                  <p className="text-[12px] text-slate-500 leading-relaxed">
                    {CHECKLIST_STANDARDS[8].criterion7Eleven}
                  </p>
                </div>

                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-50 text-[11px] font-medium text-slate-700 border border-slate-200/80">
                      <Check className="w-3 h-3 text-emerald-600" />
                      ตะกร้าสะอาด ไร้ฝุ่นคราบ
                    </span>
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-50 text-[11px] font-medium text-slate-700 border border-slate-200/80">
                      <Check className="w-3 h-3 text-emerald-600" />
                      มีแผ่นรอง/ตาข่ายคลุมมิดชิด
                    </span>
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-50 text-[11px] font-medium text-slate-700 border border-slate-200/80">
                      <Check className="w-3 h-3 text-emerald-600" />
                      ติดแท็กระบุปลายทาง DC
                    </span>
                  </div>
                  <input
                    type="text"
                    value={check8Note}
                    onChange={(e) => setCheck8Note(e.target.value)}
                    placeholder="บันทึกผลการตรวจสอบตะกร้าขนส่ง..."
                    className="w-full px-3.5 py-2 text-xs bg-slate-50/80 focus:bg-white border border-slate-200 focus:border-emerald-500 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all placeholder:text-slate-400"
                  />
                </div>

                <div className="pt-2.5 border-t border-slate-100 space-y-2.5">
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => handleToggleItemStatus(8, 'PASS')}
                      className={`min-h-[44px] px-3 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 border cursor-pointer active:scale-98 ${
                        isItem8Pass
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm ring-2 ring-emerald-500/30'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-emerald-50/50 hover:border-emerald-300'
                      }`}
                      title="กดเลือก PASS (กดซ้ำเพื่อยกเลิก)"
                    >
                      <CheckCircle2 className={`w-4 h-4 shrink-0 ${isItem8Pass ? 'text-white' : 'text-emerald-600'}`} />
                      <span>PASS ผ่านเกณฑ์</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleItemStatus(8, 'FAIL')}
                      className={`min-h-[44px] px-3 py-2 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 border cursor-pointer active:scale-98 ${
                        isItem8Fail
                          ? 'bg-red-600 text-white border-red-600 shadow-sm ring-2 ring-red-500/30'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-red-50/50 hover:border-red-300'
                      }`}
                      title="กดเลือก FAIL (กดซ้ำเพื่อยกเลิก)"
                    >
                      <XCircle className={`w-4 h-4 shrink-0 ${isItem8Fail ? 'text-white' : 'text-red-600'}`} />
                      <span>FAIL ไม่ผ่าน</span>
                    </button>
                  </div>

                  {isItem8Pass ? (
                    <div className="flex items-center justify-between gap-2 text-emerald-800 font-medium py-2 px-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                        <span className="truncate text-[11px] font-semibold">ผ่านเกณฑ์: ตะกร้าสะอาด ติดแท็ก DC ครบถ้วน</span>
                      </div>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase bg-emerald-600 text-white tracking-wide shrink-0">PASS</span>
                    </div>
                  ) : isItem8Fail ? (
                    <div className="p-3 rounded-xl bg-red-50/90 border border-red-300 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-red-800 flex items-center gap-1.5">
                          <AlertCircle className="w-3.5 h-3.5 text-red-600" /> ไม่ผ่านเกณฑ์ (FAIL)
                        </span>
                        <button
                          type="button"
                          onClick={() => handleOpenFailModal(8)}
                          className="text-[11px] font-bold text-red-700 hover:text-red-900 underline flex items-center gap-1"
                        >
                          <Edit className="w-3 h-3" /> แก้ไข CAPA
                        </button>
                      </div>
                      <div className="text-red-900 bg-white/80 p-2 rounded-lg border border-red-200">
                        <strong>สาเหตุ:</strong> {checkDefects[8]?.reason || 'ยังไม่ได้ระบุสาเหตุ'}
                      </div>
                      <div className="text-blue-900 bg-white/80 p-2 rounded-lg border border-blue-200">
                        <strong>วิธีแก้ไข:</strong> {checkDefects[8]?.correctiveAction || 'ยังไม่ได้ระบุวิธีแก้ไข'}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-slate-500 py-2 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                      <span className="w-2 h-2 rounded-full bg-slate-300 shrink-0" />
                      <span className="text-[11px]">ยังไม่ได้เลือกผลตรวจ (กด PASS หรือ FAIL เพื่อบันทึก)</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Empty state for mobile filter */}
            {checklistFilter === 'fail' && failedChecklistCount === 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-2 shadow-2xs">
                <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
                <p className="font-bold text-sm text-slate-800">
                  ยอดเยี่ยม! ผ่านเกณฑ์มาตรฐาน 7-Eleven ครบทั้ง 8 ข้อแล้ว
                </p>
                <p className="text-xs text-slate-400">
                  ไม่มีรายการที่ไม่ผ่าน หรือต้องระบุ CAPA
                </p>
              </div>
            )}

            {checklistFilter === 'pass' && passedChecklistCount === 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-2 shadow-2xs">
                <AlertCircle className="w-10 h-10 text-amber-500 mx-auto" />
                <p className="font-bold text-sm text-slate-800">
                  ยังไม่มีรายการที่เลือกผ่านเกณฑ์
                </p>
              </div>
            )}

            {checklistFilter === 'pending' && pendingChecklistCount === 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-2 shadow-2xs">
                <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
                <p className="font-bold text-sm text-slate-800">
                  เลือกผลตรวจครบทั้ง 8 ข้อแล้ว
                </p>
                <p className="text-xs text-slate-400">
                  ไม่มีรายการคงค้างรอเลือกผลตรวจ
                </p>
              </div>
            )}
          </div>

          {/* Desktop Table View (md+) */}
          <div className="hidden md:block overflow-x-auto bg-white rounded-2xl border border-slate-200/90 shadow-xs">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/90 border-b border-slate-200 text-xs font-semibold text-slate-700 tracking-wide">
                  <th className="py-3.5 px-4 w-52 font-semibold">ลำดับ & หัวข้อการตรวจ</th>
                  <th className="py-3.5 px-4 w-64 font-semibold">ข้อกำหนดมาตรฐาน 7-Eleven</th>
                  <th className="py-3.5 px-4 min-w-[320px] font-semibold">ข้อมูลบันทึกจริง / การตรวจวัด</th>
                  <th className="py-3.5 px-4 w-40 text-center font-semibold">สถานะผลตรวจ</th>
                  <th className="py-3.5 px-4 min-w-[260px] font-semibold">สรุปผล & CAPA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {/* Row 1: การปิดผนึกฝากล่อง */}
                {isRowVisible(1) && (
                  <tr
                    className={`transition-colors border-l-4 ${
                      isItem1Pass
                        ? 'border-l-emerald-500 bg-emerald-50/20 hover:bg-emerald-50/40'
                        : isItem1Fail
                        ? 'border-l-rose-500 bg-rose-50/35 hover:bg-rose-50/50'
                        : 'border-l-slate-300 hover:bg-slate-50/60'
                    }`}>
                    <td className="py-4 px-4 align-top">
                      <div className="flex items-start gap-2.5">
                        <span
                          className={`flex items-center justify-center w-7 h-7 rounded-lg font-bold text-xs shrink-0 mt-0.5 ${
                            isItem1Pass
                              ? 'bg-emerald-100 text-emerald-800'
                              : isItem1Fail
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          1
                        </span>
                        <div className="space-y-1">
                          <div className="font-bold text-slate-900 leading-snug">
                            {CHECKLIST_STANDARDS[1].title}
                          </div>
                          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200/80">
                            {CHECKLIST_STANDARDS[1].categoryTag}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4 align-top">
                      <button
                        type="button"
                        onClick={() => setActiveSpecDetailItem(1)}
                        className="w-full text-left p-1.5 rounded-lg hover:bg-slate-100/70 transition-colors group space-y-1"
                        title="คลิกเพื่อดูรายละเอียดข้อกำหนด 7-Eleven"
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-semibold text-xs text-slate-800 flex items-center gap-1.5">
                            <Info className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-600 transition-colors shrink-0" />
                            รายละเอียดข้อกำหนด
                          </span>
                          <span className="text-[10px] text-emerald-700 font-medium underline group-hover:text-emerald-800">
                            ดูเกณฑ์
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-600 line-clamp-2 leading-relaxed">
                          {CHECKLIST_STANDARDS[1].criterion7Eleven}
                        </div>
                      </button>
                    </td>
                    <td className="py-4 px-4 align-top">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 text-[11px] text-slate-700 font-medium border border-slate-200">
                            <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            กล่อง PET ล็อค 4 มุม
                          </span>
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 text-[11px] text-slate-700 font-medium border border-slate-200">
                            <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            ตรวจสัมผัสและแรงกด
                          </span>
                        </div>
                        <input
                          type="text"
                          value={check1Note}
                          onChange={(e) => setCheck1Note(e.target.value)}
                          placeholder="บันทึกผลการปิดผนึกฝากล่อง..."
                          className="w-full px-3 py-1.5 text-xs bg-slate-50/70 focus:bg-white border border-slate-200 focus:border-slate-400 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900 transition-colors"
                        />
                      </div>
                    </td>
                    <td className="py-4 px-4 align-top text-center">
                        <div className="inline-flex flex-col gap-1.5 items-center">
                          <div className="inline-flex p-1 bg-slate-100 rounded-lg border border-slate-200/90 shadow-2xs">
                            <button
                              type="button"
                              onClick={() => handleToggleItemStatus(1, 'PASS')}
                              className={`px-3.5 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
                                isItem1Pass
                                  ? 'bg-emerald-600 text-white shadow-xs'
                                  : 'text-slate-600 hover:text-emerald-700 hover:bg-emerald-50'
                              }`}
                              title="กดเลือก PASS (กดซ้ำเพื่อยกเลิก)"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>PASS</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleItemStatus(1, 'FAIL')}
                              className={`px-3.5 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
                                isItem1Fail
                                  ? 'bg-rose-600 text-white shadow-xs'
                                  : 'text-slate-600 hover:text-rose-700 hover:bg-rose-50'
                              }`}
                              title="กดเลือก FAIL (กดซ้ำเพื่อยกเลิก)"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>FAIL</span>
                            </button>
                          </div>
                          <span
                            className={`text-[11px] font-semibold ${
                              isItem1Pass
                                ? 'text-emerald-700'
                                : isItem1Fail
                                ? 'text-rose-700'
                                : 'text-slate-400 font-normal italic'
                            }`}
                          >
                            {isItem1Pass ? 'ผ่านเกณฑ์' : isItem1Fail ? 'ไม่ผ่านเกณฑ์' : 'รอเลือกผลตรวจ'}
                          </span>
                        </div>
                      </td>
                    <td className="py-4 px-4 align-top">
                      {isItem1Pass ? (
                        <div className="inline-flex items-center gap-1.5 text-emerald-700 font-semibold text-xs py-1.5 px-3 rounded-lg bg-emerald-50 border border-emerald-200">
                          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                          <span>ผ่านเกณฑ์: ฝาปิดสนิทครบ 4 มุม ไม่เผยอ</span>
                        </div>
                      ) : isItem1Fail ? (
                        <div className="p-3 rounded-xl bg-rose-50/80 border border-rose-200 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-rose-800 flex items-center gap-1">
                              <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" /> ไม่ผ่านเกณฑ์ (FAIL)
                            </span>
                            <button
                              type="button"
                              onClick={() => handleOpenFailModal(1)}
                              className="text-[11px] font-bold text-rose-700 hover:text-rose-900 underline flex items-center gap-1"
                            >
                              <Edit className="w-3 h-3" /> แก้ไข CAPA
                            </button>
                          </div>
                          <div className="text-xs text-rose-950">
                            <span className="font-bold text-rose-900">สาเหตุ:</span> {checkDefects[1]?.reason || 'ยังไม่ได้ระบุสาเหตุ'}
                          </div>
                          <div className="text-xs text-blue-950 bg-white/80 p-2 rounded-lg border border-blue-200">
                            <span className="font-bold text-blue-900">วิธีแก้ไข:</span>{' '}
                            {checkDefects[1]?.correctiveAction || 'ยังไม่ได้ระบุวิธีแก้ไข'}
                          </div>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1.5 text-slate-500 text-xs py-1.5 px-3 rounded-lg bg-slate-50 border border-slate-200/80">
                          <span className="w-2 h-2 rounded-full bg-slate-300 shrink-0" />
                          <span>ยังไม่ได้ระบุผล (กด PASS หรือ FAIL เพื่อเลือก)</span>
                        </div>
                      )}</td>
                  </tr>
                )}

                  {/* Row 2: การผสมสี 3–5 สายพันธุ์ */}
                  {isRowVisible(2) && (
                    <tr
                    className={`transition-colors border-l-4 ${
                      isItem2Pass
                        ? 'border-l-emerald-500 bg-emerald-50/20 hover:bg-emerald-50/40'
                        : isItem2Fail
                        ? 'border-l-rose-500 bg-rose-50/35 hover:bg-rose-50/50'
                        : 'border-l-slate-300 hover:bg-slate-50/60'
                    }`}>
                      <td className="py-4 px-4 align-top">
                        <div className="flex items-start gap-2.5">
                          <span
                          className={`flex items-center justify-center w-7 h-7 rounded-lg font-bold text-xs shrink-0 mt-0.5 ${
                            isItem2Pass
                              ? 'bg-emerald-100 text-emerald-800'
                              : isItem2Fail
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          2
                        </span>
                          <div className="space-y-1">
                            <div className="font-bold text-slate-900 leading-snug">
                              {CHECKLIST_STANDARDS[2].title}
                            </div>
                            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200/80">
                              {CHECKLIST_STANDARDS[2].categoryTag}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4 align-top">
                        <button
                          type="button"
                          onClick={() => setActiveSpecDetailItem(2)}
                          className="w-full text-left p-1.5 rounded-lg hover:bg-slate-100/70 transition-colors group space-y-1"
                          title="คลิกเพื่อดูรายละเอียดข้อกำหนด 7-Eleven"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-semibold text-xs text-slate-800 flex items-center gap-1.5">
                              <Info className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-600 transition-colors shrink-0" />
                              รายละเอียดข้อกำหนด
                            </span>
                            <span className="text-[10px] text-emerald-700 font-medium underline group-hover:text-emerald-800">
                              ดูเกณฑ์
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-600 line-clamp-2 leading-relaxed">
                            {CHECKLIST_STANDARDS[2].criterion7Eleven}
                          </div>
                        </button>
                      </td>
                      <td className="py-4 px-4 align-top">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold ${
                                check2MixValid
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                  : 'bg-rose-100 text-rose-800 border border-rose-300'
                              }`}
                            >
                              {check2MixValid ? (
                                <Check className="w-3.5 h-3.5 text-emerald-700" />
                              ) : (
                                <AlertCircle className="w-3.5 h-3.5 text-rose-700" />
                              )}
                              {check2MixValid ? 'คละ 3–5 สี สัดส่วนครบ 100%' : 'สัดส่วนไม่ครบ หรือขาดสายพันธุ์บังคับ'}
                            </span>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-[11px] text-slate-700 font-medium border border-slate-200">
                              คละ {colorMix.filter((c) => c.percentage > 0).length} สายพันธุ์
                            </span>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-[10px] text-emerald-800 font-medium border border-emerald-200">
                              ✓ มีกรูรามิเขียว + แดง/ชมพู
                            </span>
                          </div>
                          <input
                            type="text"
                            value={check2Note}
                            onChange={(e) => setCheck2Note(e.target.value)}
                            placeholder="บันทึกผลการคละสีและสายพันธุ์..."
                            className="w-full px-3 py-1.5 text-xs bg-slate-50/70 focus:bg-white border border-slate-200 focus:border-slate-400 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900 transition-colors"
                          />
                        </div>
                      </td>
                      <td className="py-4 px-4 align-top text-center">
                        <div className="inline-flex flex-col gap-1.5 items-center">
                          <div className="inline-flex p-1 bg-slate-100 rounded-lg border border-slate-200/90 shadow-2xs">
                            <button
                              type="button"
                              onClick={() => handleToggleItemStatus(2, 'PASS')}
                              className={`px-3.5 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
                                isItem2Pass
                                  ? 'bg-emerald-600 text-white shadow-xs'
                                  : 'text-slate-600 hover:text-emerald-700 hover:bg-emerald-50'
                              }`}
                              title="กดเลือก PASS (กดซ้ำเพื่อยกเลิก)"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>PASS</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleItemStatus(2, 'FAIL')}
                              className={`px-3.5 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
                                isItem2Fail
                                  ? 'bg-rose-600 text-white shadow-xs'
                                  : 'text-slate-600 hover:text-rose-700 hover:bg-rose-50'
                              }`}
                              title="กดเลือก FAIL (กดซ้ำเพื่อยกเลิก)"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>FAIL</span>
                            </button>
                          </div>
                          <span
                            className={`text-[11px] font-semibold ${
                              isItem2Pass
                                ? 'text-emerald-700'
                                : isItem2Fail
                                ? 'text-rose-700'
                                : 'text-slate-400 font-normal italic'
                            }`}
                          >
                            {isItem2Pass ? 'ผ่านเกณฑ์' : isItem2Fail ? 'ไม่ผ่านเกณฑ์' : 'รอเลือกผลตรวจ'}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-4 align-top">
                        {isItem2Pass ? (
                          <div className="inline-flex items-center gap-1.5 text-emerald-700 font-semibold text-xs py-1.5 px-3 rounded-lg bg-emerald-50 border border-emerald-200">
                            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                            <span>ผ่านเกณฑ์: คละ 3–5 สี สัดส่วนครบ 100% บังคับเขียวกรูรามิ+แดง</span>
                          </div>
                        ) : isItem2Fail ? (
                          <div className="p-3 rounded-xl bg-rose-50/80 border border-rose-200 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-rose-800 flex items-center gap-1">
                                <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" /> ไม่ผ่านเกณฑ์ (FAIL)
                              </span>
                              <button
                                type="button"
                                onClick={() => handleOpenFailModal(2)}
                                className="text-[11px] font-bold text-rose-700 hover:text-rose-900 underline flex items-center gap-1"
                              >
                                <Edit className="w-3 h-3" /> แก้ไข CAPA
                              </button>
                            </div>
                            <div className="text-xs text-rose-950">
                              <span className="font-bold text-rose-900">สาเหตุ:</span> {checkDefects[2]?.reason || 'สัดส่วนไม่ครบ 100% หรือขาดสายพันธุ์บังคับ'}
                            </div>
                            <div className="text-xs text-blue-950 bg-white/80 p-2 rounded-lg border border-blue-200">
                              <span className="font-bold text-blue-900">วิธีแก้ไข:</span>{' '}
                              {checkDefects[2]?.correctiveAction || 'ยังไม่ได้ระบุวิธีแก้ไข'}
                            </div>
                          </div>
                        ) : (
                        <div className="inline-flex items-center gap-1.5 text-slate-500 text-xs py-1.5 px-3 rounded-lg bg-slate-50 border border-slate-200/80">
                          <span className="w-2 h-2 rounded-full bg-slate-300 shrink-0" />
                          <span>ยังไม่ได้ระบุผล (กด PASS หรือ FAIL เพื่อเลือก)</span>
                        </div>
                      )}</td>
                    </tr>
                  )}

                  {/* Row 3: ฉลากระบุวันผลิต-วันหมดอายุ (+6 วัน) & ล้างก่อนรับประทาน */}
                  {isRowVisible(3) && (
                    <tr
                    className={`transition-colors border-l-4 ${
                      isItem3Pass
                        ? 'border-l-emerald-500 bg-emerald-50/20 hover:bg-emerald-50/40'
                        : isItem3Fail
                        ? 'border-l-rose-500 bg-rose-50/35 hover:bg-rose-50/50'
                        : 'border-l-slate-300 hover:bg-slate-50/60'
                    }`}>
                      <td className="py-4 px-4 align-top">
                        <div className="flex items-start gap-2.5">
                          <span
                          className={`flex items-center justify-center w-7 h-7 rounded-lg font-bold text-xs shrink-0 mt-0.5 ${
                            isItem3Pass
                              ? 'bg-emerald-100 text-emerald-800'
                              : isItem3Fail
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          3
                        </span>
                          <div className="space-y-1">
                            <div className="font-bold text-slate-900 leading-snug">
                              {CHECKLIST_STANDARDS[3].title}
                            </div>
                            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200/80">
                              {CHECKLIST_STANDARDS[3].categoryTag}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4 align-top">
                        <button
                          type="button"
                          onClick={() => setActiveSpecDetailItem(3)}
                          className="w-full text-left p-1.5 rounded-lg hover:bg-slate-100/70 transition-colors group space-y-1"
                          title="คลิกเพื่อดูรายละเอียดข้อกำหนด 7-Eleven"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-semibold text-xs text-slate-800 flex items-center gap-1.5">
                              <Info className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-600 transition-colors shrink-0" />
                              รายละเอียดข้อกำหนด
                            </span>
                            <span className="text-[10px] text-emerald-700 font-medium underline group-hover:text-emerald-800">
                              ดูเกณฑ์
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-600 line-clamp-2 leading-relaxed">
                            {CHECKLIST_STANDARDS[3].criterion7Eleven}
                          </div>
                        </button>
                      </td>
                      <td className="py-4 px-4 align-top">
                        <div className="space-y-2.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="px-2.5 py-1 rounded-md bg-blue-50 text-blue-800 border border-blue-200 text-[11px] font-mono font-medium">
                              MFG {formatThaiDate(mfgDate)} → EXP {formatThaiDate(expDate)} ({shelfLifeDays ?? '-'} วัน)
                            </span>
                            <span
                              className={`px-2.5 py-1 rounded-md text-[11px] font-bold ${
                                isSixDayShelfLife
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {isSixDayShelfLife ? '✓ ตรงเกณฑ์ 6 วัน' : '✗ ไม่ตรง 6 วัน'}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200 hover:bg-slate-100 cursor-pointer transition-colors">
                              <input
                                type="checkbox"
                                checked={check3ExpiryLabel}
                                onChange={(e) => setCheck3ExpiryLabel(e.target.checked)}
                                className="rounded text-slate-900 focus:ring-slate-900 w-3.5 h-3.5"
                              />
                              <span className="text-[11px] text-slate-700 font-medium">
                                ระบุ MFG/EXP (+6 วัน)
                              </span>
                            </label>

                            <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200 hover:bg-slate-100 cursor-pointer transition-colors">
                              <input
                                type="checkbox"
                                checked={check3WashLabel}
                                onChange={(e) => setCheck3WashLabel(e.target.checked)}
                                className="rounded text-slate-900 focus:ring-slate-900 w-3.5 h-3.5"
                              />
                              <span className="text-[11px] text-slate-700 font-medium">
                                ระบุ "ล้างก่อนรับประทาน"
                              </span>
                            </label>
                          </div>

                          <input
                            type="text"
                            value={check3Note}
                            onChange={(e) => setCheck3Note(e.target.value)}
                            placeholder="บันทึกหมายเหตุการตรวจฉลากสินค้า..."
                            className="w-full px-3 py-1.5 text-xs bg-slate-50/70 focus:bg-white border border-slate-200 focus:border-slate-400 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900 transition-colors"
                          />
                        </div>
                      </td>
                      <td className="py-4 px-4 align-top text-center">
                        <div className="inline-flex flex-col gap-1.5 items-center">
                          <div className="inline-flex p-1 bg-slate-100 rounded-lg border border-slate-200/90 shadow-2xs">
                            <button
                              type="button"
                              onClick={() => handleToggleItemStatus(3, 'PASS')}
                              className={`px-3.5 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
                                isItem3Pass
                                  ? 'bg-emerald-600 text-white shadow-xs'
                                  : 'text-slate-600 hover:text-emerald-700 hover:bg-emerald-50'
                              }`}
                              title="กดเลือก PASS (กดซ้ำเพื่อยกเลิก)"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>PASS</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleItemStatus(3, 'FAIL')}
                              className={`px-3.5 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
                                isItem3Fail
                                  ? 'bg-rose-600 text-white shadow-xs'
                                  : 'text-slate-600 hover:text-rose-700 hover:bg-rose-50'
                              }`}
                              title="กดเลือก FAIL (กดซ้ำเพื่อยกเลิก)"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>FAIL</span>
                            </button>
                          </div>
                          <span
                            className={`text-[11px] font-semibold ${
                              isItem3Pass
                                ? 'text-emerald-700'
                                : isItem3Fail
                                ? 'text-rose-700'
                                : 'text-slate-400 font-normal italic'
                            }`}
                          >
                            {isItem3Pass ? 'ผ่านเกณฑ์' : isItem3Fail ? 'ไม่ผ่านเกณฑ์' : 'รอเลือกผลตรวจ'}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-4 align-top">
                        {isItem3Pass ? (
                          <div className="inline-flex items-center gap-1.5 text-emerald-700 font-semibold text-xs py-1.5 px-3 rounded-lg bg-emerald-50 border border-emerald-200">
                            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                            <span>ผ่านเกณฑ์: Shelf-life 6 วัน + ระบุล้างก่อนรับประทานครบถ้วน</span>
                          </div>
                        ) : isItem3Fail ? (
                          <div className="p-3 rounded-xl bg-rose-50/80 border border-rose-200 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-rose-800 flex items-center gap-1">
                                <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" /> ไม่ผ่านเกณฑ์ (FAIL)
                              </span>
                              <button
                                type="button"
                                onClick={() => handleOpenFailModal(3)}
                                className="text-[11px] font-bold text-rose-700 hover:text-rose-900 underline flex items-center gap-1"
                              >
                                <Edit className="w-3 h-3" /> แก้ไข CAPA
                              </button>
                            </div>
                            <div className="text-xs text-rose-950">
                              <span className="font-bold text-rose-900">สาเหตุ:</span> {checkDefects[3]?.reason || 'ยังไม่ได้ระบุสาเหตุ'}
                            </div>
                            <div className="text-xs text-blue-950 bg-white/80 p-2 rounded-lg border border-blue-200">
                              <span className="font-bold text-blue-900">วิธีแก้ไข:</span>{' '}
                              {checkDefects[3]?.correctiveAction || 'ยังไม่ได้ระบุวิธีแก้ไข'}
                            </div>
                          </div>
                        ) : (
                        <div className="inline-flex items-center gap-1.5 text-slate-500 text-xs py-1.5 px-3 rounded-lg bg-slate-50 border border-slate-200/80">
                          <span className="w-2 h-2 rounded-full bg-slate-300 shrink-0" />
                          <span>ยังไม่ได้ระบุผล (กด PASS หรือ FAIL เพื่อเลือก)</span>
                        </div>
                      )}</td>
                    </tr>
                  )}

                  {/* Row 4: น้ำหนักสุทธิสินค้า */}
                  {isRowVisible(4) && (
                    <tr
                    className={`transition-colors border-l-4 ${
                      isItem4Pass
                        ? 'border-l-emerald-500 bg-emerald-50/20 hover:bg-emerald-50/40'
                        : isItem4Fail
                        ? 'border-l-rose-500 bg-rose-50/35 hover:bg-rose-50/50'
                        : 'border-l-slate-300 hover:bg-slate-50/60'
                    }`}>
                      <td className="py-4 px-4 align-top">
                        <div className="flex items-start gap-2.5">
                          <span
                          className={`flex items-center justify-center w-7 h-7 rounded-lg font-bold text-xs shrink-0 mt-0.5 ${
                            isItem4Pass
                              ? 'bg-emerald-100 text-emerald-800'
                              : isItem4Fail
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          4
                        </span>
                          <div className="space-y-1">
                            <div className="font-bold text-slate-900 leading-snug">
                              {CHECKLIST_STANDARDS[4].title}
                            </div>
                            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200/80">
                              {CHECKLIST_STANDARDS[4].categoryTag}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4 align-top">
                        <button
                          type="button"
                          onClick={() => setActiveSpecDetailItem(4)}
                          className="w-full text-left p-1.5 rounded-lg hover:bg-slate-100/70 transition-colors group space-y-1"
                          title="คลิกเพื่อดูรายละเอียดข้อกำหนด 7-Eleven"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-semibold text-xs text-slate-800 flex items-center gap-1.5">
                              <Info className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-600 transition-colors shrink-0" />
                              รายละเอียดข้อกำหนด
                            </span>
                            <span className="text-[10px] text-emerald-700 font-medium underline group-hover:text-emerald-800">
                              ดูเกณฑ์
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-600 line-clamp-2 leading-relaxed">
                            {CHECKLIST_STANDARDS[4].criterion7Eleven}
                          </div>
                        </button>
                      </td>
                      <td className="py-4 px-4 align-top">
                        <div className="space-y-2.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="relative w-36 shrink-0">
                              <Scale className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                              <input
                                type="number"
                                min={0}
                                step="0.1"
                                value={netWeightG}
                                onChange={(e) => setNetWeightG(parseFloat(e.target.value) || 0)}
                                className={`w-full pl-8 pr-11 py-1.5 text-xs font-semibold tabular-nums bg-white border rounded-lg focus:outline-none focus:ring-1 ${
                                  rawCheck4NetWeightPass
                                    ? 'border-slate-300 focus:ring-slate-900'
                                    : 'border-rose-400 text-rose-700 focus:ring-rose-600'
                                }`}
                              />
                              <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-[11px] text-slate-400 font-medium">
                                กรัม
                              </span>
                            </div>

                            <button
                              type="button"
                              onClick={handleOpenWeightSamplingModal}
                              className="px-3 py-1.5 text-xs font-semibold text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors inline-flex items-center gap-1.5 shadow-2xs"
                            >
                              <Scale className="w-3.5 h-3.5 text-blue-700" />
                              <span>สุ่มชั่ง 10–20 กล่อง</span>
                            </button>

                            <span
                              className={`text-[11px] font-semibold px-2.5 py-1 rounded-md ${
                                rawCheck4NetWeightPass
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {rawCheck4NetWeightPass
                                ? `เฉลี่ย ${netWeightG.toFixed(1)}g (≥ 140g)`
                                : `ต่ำกว่าเกณฑ์ หรือมีกล่องไม่ได้น้ำหนัก`}
                            </span>
                          </div>

                          {/* Underweight Alert Banner */}
                          {hasUnderweightSample && (
                            <div className="p-2.5 bg-rose-50 border border-rose-300 text-rose-900 rounded-lg text-xs font-bold flex items-center gap-2">
                              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                              <span>
                                🚨 ตรวจพบกล่องน้ำหนัก &lt; 140.0g ({sampleWeights.filter((w) => w < 140).length} กล่อง): HOLD สินค้าเพื่อแก้ไข หรือ REJECT ทันที!
                              </span>
                            </div>
                          )}

                          {/* Sample summary chips */}
                          {sampleWeights && sampleWeights.length > 0 && (
                            <div className="flex flex-wrap items-center gap-2 text-[11px] bg-slate-50 p-2 rounded-lg border border-slate-200">
                              <span className="text-slate-600 font-medium">
                                สุ่มตรวจ {sampleWeights.length} กล่อง:
                              </span>
                              <span className="tabular-nums text-slate-800 font-mono">
                                ค่าเฉลี่ย: <strong>{netWeightG.toFixed(1)}g</strong>
                              </span>
                              <span className="tabular-nums text-slate-600 font-mono">
                                ต่ำสุด: {Math.min(...sampleWeights).toFixed(1)}g
                              </span>
                              <span className="tabular-nums text-slate-600 font-mono">
                                สูงสุด: {Math.max(...sampleWeights).toFixed(1)}g
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                                  hasUnderweightSample
                                    ? 'bg-rose-600 text-white'
                                    : 'bg-emerald-600 text-white'
                                }`}
                              >
                                {hasUnderweightSample ? 'HOLD / REJECT' : 'PASS'}
                              </span>
                            </div>
                          )}

                          <input
                            type="text"
                            value={check4Note}
                            onChange={(e) => setCheck4Note(e.target.value)}
                            placeholder="บันทึกผลการชั่งน้ำหนักสุทธิ..."
                            className="w-full px-3 py-1.5 text-xs bg-slate-50/70 focus:bg-white border border-slate-200 focus:border-slate-400 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900 transition-colors"
                          />
                        </div>
                      </td>
                      <td className="py-4 px-4 align-top text-center">
                        <div className="inline-flex flex-col gap-1.5 items-center">
                          <div className="inline-flex p-1 bg-slate-100 rounded-lg border border-slate-200/90 shadow-2xs">
                            <button
                              type="button"
                              onClick={() => handleToggleItemStatus(4, 'PASS')}
                              className={`px-3.5 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
                                isItem4Pass
                                  ? 'bg-emerald-600 text-white shadow-xs'
                                  : 'text-slate-600 hover:text-emerald-700 hover:bg-emerald-50'
                              }`}
                              title="กดเลือก PASS (กดซ้ำเพื่อยกเลิก)"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>PASS</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleItemStatus(4, 'FAIL')}
                              className={`px-3.5 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
                                isItem4Fail
                                  ? 'bg-rose-600 text-white shadow-xs'
                                  : 'text-slate-600 hover:text-rose-700 hover:bg-rose-50'
                              }`}
                              title="กดเลือก FAIL (กดซ้ำเพื่อยกเลิก)"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>FAIL</span>
                            </button>
                          </div>
                          <span
                            className={`text-[11px] font-semibold ${
                              isItem4Pass
                                ? 'text-emerald-700'
                                : isItem4Fail
                                ? 'text-rose-700'
                                : 'text-slate-400 font-normal italic'
                            }`}
                          >
                            {isItem4Pass ? 'ผ่านเกณฑ์' : isItem4Fail ? 'ไม่ผ่านเกณฑ์' : 'รอเลือกผลตรวจ'}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-4 align-top">
                        {hasUnderweightSample ? (
                          <div className="p-3 rounded-xl bg-rose-50 border border-rose-300 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-rose-900 flex items-center gap-1">
                                <AlertCircle className="w-3.5 h-3.5 text-rose-700 shrink-0" />
                                HOLD สินค้าเพื่อแก้ไข หรือ REJECT
                              </span>
                              <button
                                type="button"
                                onClick={() => handleOpenFailModal(4)}
                                className="text-[11px] font-bold text-rose-700 hover:text-rose-900 underline"
                              >
                                บันทึก CAPA
                              </button>
                            </div>
                            <p className="text-xs text-rose-800 leading-relaxed">
                              ตรวจพบตัวอย่างน้ำหนัก &lt; 140.0g ({sampleWeights.filter((w) => w < 140).length} กล่อง) — ต้อง Hold สินค้าเพื่อแก้ไข หรือ Reject ตามเกณฑ์ 7-Eleven
                            </p>
                          </div>
                        ) : isItem4Pass ? (
                          <div className="inline-flex items-center gap-1.5 text-emerald-700 font-semibold text-xs py-1.5 px-3 rounded-lg bg-emerald-50 border border-emerald-200">
                            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                            <span>ผ่านเกณฑ์: เฉลี่ย {netWeightG.toFixed(1)} กรัม (ทุกกล่อง ≥ 140.0g)</span>
                          </div>
                        ) : isItem4Fail ? (
                          <div className="p-3 rounded-xl bg-rose-50/80 border border-rose-200 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-rose-800 flex items-center gap-1">
                                <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" /> ไม่ผ่านเกณฑ์ (FAIL)
                              </span>
                              <button
                                type="button"
                                onClick={() => handleOpenFailModal(4)}
                                className="text-[11px] font-bold text-rose-700 hover:text-rose-900 underline flex items-center gap-1"
                              >
                                <Edit className="w-3 h-3" /> แก้ไข CAPA
                              </button>
                            </div>
                            <div className="text-xs text-rose-950">
                              <span className="font-bold text-rose-900">สาเหตุ:</span> {checkDefects[4]?.reason || 'น้ำหนักต่ำกว่าเกณฑ์ 140.0 กรัม'}
                            </div>
                            <div className="text-xs text-blue-950 bg-white/80 p-2 rounded-lg border border-blue-200">
                              <span className="font-bold text-blue-900">วิธีแก้ไข:</span>{' '}
                              {checkDefects[4]?.correctiveAction || 'ยังไม่ได้ระบุวิธีแก้ไข'}
                            </div>
                          </div>
                        ) : (
                        <div className="inline-flex items-center gap-1.5 text-slate-500 text-xs py-1.5 px-3 rounded-lg bg-slate-50 border border-slate-200/80">
                          <span className="w-2 h-2 rounded-full bg-slate-300 shrink-0" />
                          <span>ยังไม่ได้ระบุผล (กด PASS หรือ FAIL เพื่อเลือก)</span>
                        </div>
                      )}</td>
                    </tr>
                  )}

                  {/* Row 5: ลักษณะทางกายภาพของสินค้า */}
                  {isRowVisible(5) && (
                    <tr
                    className={`transition-colors border-l-4 ${
                      isItem5Pass
                        ? 'border-l-emerald-500 bg-emerald-50/20 hover:bg-emerald-50/40'
                        : isItem5Fail
                        ? 'border-l-rose-500 bg-rose-50/35 hover:bg-rose-50/50'
                        : 'border-l-slate-300 hover:bg-slate-50/60'
                    }`}>
                      <td className="py-4 px-4 align-top">
                        <div className="flex items-start gap-2.5">
                          <span
                          className={`flex items-center justify-center w-7 h-7 rounded-lg font-bold text-xs shrink-0 mt-0.5 ${
                            isItem5Pass
                              ? 'bg-emerald-100 text-emerald-800'
                              : isItem5Fail
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          5
                        </span>
                          <div className="space-y-1">
                            <div className="font-bold text-slate-900 leading-snug">
                              {CHECKLIST_STANDARDS[5].title}
                            </div>
                            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200/80">
                              {CHECKLIST_STANDARDS[5].categoryTag}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4 align-top">
                        <button
                          type="button"
                          onClick={() => setActiveSpecDetailItem(5)}
                          className="w-full text-left p-1.5 rounded-lg hover:bg-slate-100/70 transition-colors group space-y-1"
                          title="คลิกเพื่อดูรายละเอียดข้อกำหนด 7-Eleven"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-semibold text-xs text-slate-800 flex items-center gap-1.5">
                              <Info className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-600 transition-colors shrink-0" />
                              รายละเอียดข้อกำหนด
                            </span>
                            <span className="text-[10px] text-emerald-700 font-medium underline group-hover:text-emerald-800">
                              ดูเกณฑ์
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-600 line-clamp-2 leading-relaxed">
                            {CHECKLIST_STANDARDS[5].criterion7Eleven}
                          </div>
                        </button>
                      </td>
                      <td className="py-4 px-4 align-top">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 text-[11px] text-slate-700 font-medium border border-slate-200">
                              <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              ผลสดตึงเงางาม
                            </span>
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 text-[11px] text-slate-700 font-medium border border-slate-200">
                              <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              ขั้วเขียวสด
                            </span>
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 text-[11px] text-slate-700 font-medium border border-slate-200">
                              <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              ไร้หยดน้ำในกล่อง
                            </span>
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 text-[11px] text-slate-700 font-medium border border-slate-200">
                              <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              ไม่มีผลแตก/ช้ำ
                            </span>
                          </div>
                          <input
                            type="text"
                            value={check5Note}
                            onChange={(e) => setCheck5Note(e.target.value)}
                            placeholder="บันทึกผลการตรวจลักษณะทางกายภาพ..."
                            className="w-full px-3 py-1.5 text-xs bg-slate-50/70 focus:bg-white border border-slate-200 focus:border-slate-400 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900 transition-colors"
                          />
                        </div>
                      </td>
                      <td className="py-4 px-4 align-top text-center">
                        <div className="inline-flex flex-col gap-1.5 items-center">
                          <div className="inline-flex p-1 bg-slate-100 rounded-lg border border-slate-200/90 shadow-2xs">
                            <button
                              type="button"
                              onClick={() => handleToggleItemStatus(5, 'PASS')}
                              className={`px-3.5 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
                                isItem5Pass
                                  ? 'bg-emerald-600 text-white shadow-xs'
                                  : 'text-slate-600 hover:text-emerald-700 hover:bg-emerald-50'
                              }`}
                              title="กดเลือก PASS (กดซ้ำเพื่อยกเลิก)"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>PASS</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleItemStatus(5, 'FAIL')}
                              className={`px-3.5 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
                                isItem5Fail
                                  ? 'bg-rose-600 text-white shadow-xs'
                                  : 'text-slate-600 hover:text-rose-700 hover:bg-rose-50'
                              }`}
                              title="กดเลือก FAIL (กดซ้ำเพื่อยกเลิก)"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>FAIL</span>
                            </button>
                          </div>
                          <span
                            className={`text-[11px] font-semibold ${
                              isItem5Pass
                                ? 'text-emerald-700'
                                : isItem5Fail
                                ? 'text-rose-700'
                                : 'text-slate-400 font-normal italic'
                            }`}
                          >
                            {isItem5Pass ? 'ผ่านเกณฑ์' : isItem5Fail ? 'ไม่ผ่านเกณฑ์' : 'รอเลือกผลตรวจ'}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-4 align-top">
                        {isItem5Pass ? (
                          <div className="inline-flex items-center gap-1.5 text-emerald-700 font-semibold text-xs py-1.5 px-3 rounded-lg bg-emerald-50 border border-emerald-200">
                            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                            <span>ผ่านเกณฑ์: ผลสดตึงเงางาม ไร้หยดน้ำเกาะกล่อง</span>
                          </div>
                        ) : isItem5Fail ? (
                          <div className="p-3 rounded-xl bg-rose-50/80 border border-rose-200 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-rose-800 flex items-center gap-1">
                                <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" /> ไม่ผ่านเกณฑ์ (FAIL)
                              </span>
                              <button
                                type="button"
                                onClick={() => handleOpenFailModal(5)}
                                className="text-[11px] font-bold text-rose-700 hover:text-rose-900 underline flex items-center gap-1"
                              >
                                <Edit className="w-3 h-3" /> แก้ไข CAPA
                              </button>
                            </div>
                            <div className="text-xs text-rose-950">
                              <span className="font-bold text-rose-900">สาเหตุ:</span> {checkDefects[5]?.reason || 'ยังไม่ได้ระบุสาเหตุ'}
                            </div>
                            <div className="text-xs text-blue-950 bg-white/80 p-2 rounded-lg border border-blue-200">
                              <span className="font-bold text-blue-900">วิธีแก้ไข:</span>{' '}
                              {checkDefects[5]?.correctiveAction || 'ยังไม่ได้ระบุวิธีแก้ไข'}
                            </div>
                          </div>
                        ) : (
                        <div className="inline-flex items-center gap-1.5 text-slate-500 text-xs py-1.5 px-3 rounded-lg bg-slate-50 border border-slate-200/80">
                          <span className="w-2 h-2 rounded-full bg-slate-300 shrink-0" />
                          <span>ยังไม่ได้ระบุผล (กด PASS หรือ FAIL เพื่อเลือก)</span>
                        </div>
                      )}</td>
                    </tr>
                  )}

                  {/* Row 6: จำนวนสินค้าตรงตามใบสั่งซื้อ */}
                  {isRowVisible(6) && (
                    <tr
                    className={`transition-colors border-l-4 ${
                      isItem6Pass
                        ? 'border-l-emerald-500 bg-emerald-50/20 hover:bg-emerald-50/40'
                        : isItem6Fail
                        ? 'border-l-rose-500 bg-rose-50/35 hover:bg-rose-50/50'
                        : 'border-l-slate-300 hover:bg-slate-50/60'
                    }`}>
                      <td className="py-4 px-4 align-top">
                        <div className="flex items-start gap-2.5">
                          <span
                          className={`flex items-center justify-center w-7 h-7 rounded-lg font-bold text-xs shrink-0 mt-0.5 ${
                            isItem6Pass
                              ? 'bg-emerald-100 text-emerald-800'
                              : isItem6Fail
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          6
                        </span>
                          <div className="space-y-1">
                            <div className="font-bold text-slate-900 leading-snug">
                              {CHECKLIST_STANDARDS[6].title}
                            </div>
                            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200/80">
                              {CHECKLIST_STANDARDS[6].categoryTag}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4 align-top">
                        <button
                          type="button"
                          onClick={() => setActiveSpecDetailItem(6)}
                          className="w-full text-left p-1.5 rounded-lg hover:bg-slate-100/70 transition-colors group space-y-1"
                          title="คลิกเพื่อดูรายละเอียดข้อกำหนด 7-Eleven"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-semibold text-xs text-slate-800 flex items-center gap-1.5">
                              <Info className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-600 transition-colors shrink-0" />
                              รายละเอียดข้อกำหนด
                            </span>
                            <span className="text-[10px] text-emerald-700 font-medium underline group-hover:text-emerald-800">
                              ดูเกณฑ์
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-600 line-clamp-2 leading-relaxed">
                            {CHECKLIST_STANDARDS[6].criterion7Eleven}
                          </div>
                        </button>
                      </td>
                      <td className="py-4 px-4 align-top">
                        <div className="space-y-2">
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <span className="block text-[10px] font-medium text-slate-600 mb-0.5">
                                ยอดสั่งซื้อ PO
                              </span>
                              <div className="relative">
                                <input
                                  type="number"
                                  min={1}
                                  value={orderedPacks}
                                  onChange={(e) => setOrderedPacks(parseInt(e.target.value, 10) || 0)}
                                  className="w-full pl-2.5 pr-8 py-1.5 text-xs font-semibold tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
                                />
                                <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[10px] text-slate-400">
                                  แพ็ค
                                </span>
                              </div>
                            </div>
                            <div>
                              <span className="block text-[10px] font-medium text-slate-600 mb-0.5">
                                ยอดบรรจุจริง
                              </span>
                              <div className="relative">
                                <input
                                  type="number"
                                  min={0}
                                  value={actualPacks}
                                  onChange={(e) => setActualPacks(parseInt(e.target.value, 10) || 0)}
                                  className={`w-full pl-2.5 pr-8 py-1.5 text-xs font-semibold tabular-nums bg-white border rounded-lg focus:outline-none focus:ring-1 ${
                                    rawCheck6QtyMatch
                                      ? 'border-slate-300 focus:ring-slate-900'
                                      : 'border-rose-400 text-rose-700 focus:ring-rose-600'
                                  }`}
                                />
                                <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[10px] text-slate-400">
                                  แพ็ค
                                </span>
                              </div>
                            </div>
                            <div>
                              <span className="block text-[10px] font-medium text-slate-600 mb-0.5">
                                ตะกร้าขนส่ง
                              </span>
                              <div className="relative">
                                <input
                                  type="number"
                                  min={1}
                                  value={crateQty}
                                  onChange={(e) => setCrateQty(parseInt(e.target.value, 10) || 0)}
                                  className="w-full pl-2.5 pr-7 py-1.5 text-xs font-semibold tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
                                />
                                <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-[10px] text-slate-400">
                                  ใบ
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="text-[11px] flex items-center justify-between">
                            <span
                              className={`font-semibold ${
                                rawCheck6QtyMatch ? 'text-emerald-700' : 'text-rose-700'
                              }`}
                            >
                              {rawCheck6QtyMatch
                                ? '✓ ยอดบรรจุตรงตามใบสั่งซื้อ ครบ 100%'
                                : `✗ ขาด ${orderedPacks - actualPacks} แพ็ค จากยอด PO`}
                            </span>
                            <span className="text-slate-500 text-[10px]">
                              เฉลี่ย ~{(actualPacks / (crateQty || 1)).toFixed(0)} แพ็ค/ตะกร้า
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4 align-top text-center">
                        <div className="inline-flex flex-col gap-1.5 items-center">
                          <div className="inline-flex p-1 bg-slate-100 rounded-lg border border-slate-200/90 shadow-2xs">
                            <button
                              type="button"
                              onClick={() => handleToggleItemStatus(6, 'PASS')}
                              className={`px-3.5 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
                                isItem6Pass
                                  ? 'bg-emerald-600 text-white shadow-xs'
                                  : 'text-slate-600 hover:text-emerald-700 hover:bg-emerald-50'
                              }`}
                              title="กดเลือก PASS (กดซ้ำเพื่อยกเลิก)"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>PASS</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleItemStatus(6, 'FAIL')}
                              className={`px-3.5 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
                                isItem6Fail
                                  ? 'bg-rose-600 text-white shadow-xs'
                                  : 'text-slate-600 hover:text-rose-700 hover:bg-rose-50'
                              }`}
                              title="กดเลือก FAIL (กดซ้ำเพื่อยกเลิก)"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>FAIL</span>
                            </button>
                          </div>
                          <span
                            className={`text-[11px] font-semibold ${
                              isItem6Pass
                                ? 'text-emerald-700'
                                : isItem6Fail
                                ? 'text-rose-700'
                                : 'text-slate-400 font-normal italic'
                            }`}
                          >
                            {isItem6Pass ? 'ผ่านเกณฑ์' : isItem6Fail ? 'ไม่ผ่านเกณฑ์' : 'รอเลือกผลตรวจ'}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-4 align-top">
                        {isItem6Pass ? (
                          <div className="inline-flex items-center gap-1.5 text-emerald-700 font-semibold text-xs py-1.5 px-3 rounded-lg bg-emerald-50 border border-emerald-200">
                            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                            <span>
                              ผ่านเกณฑ์: ครบ 100% ({actualPacks} แพ็ค ใน {crateQty} ตะกร้า)
                            </span>
                          </div>
                        ) : isItem6Fail ? (
                          <div className="p-3 rounded-xl bg-rose-50/80 border border-rose-200 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-rose-800 flex items-center gap-1">
                                <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" /> ไม่ผ่านเกณฑ์ (FAIL)
                              </span>
                              <button
                                type="button"
                                onClick={() => handleOpenFailModal(6)}
                                className="text-[11px] font-bold text-rose-700 hover:text-rose-900 underline flex items-center gap-1"
                              >
                                <Edit className="w-3 h-3" /> แก้ไข CAPA
                              </button>
                            </div>
                            <div className="text-xs text-rose-950">
                              <span className="font-bold text-rose-900">สาเหตุ:</span> {checkDefects[6]?.reason || 'ยังไม่ได้ระบุสาเหตุ'}
                            </div>
                            <div className="text-xs text-blue-950 bg-white/80 p-2 rounded-lg border border-blue-200">
                              <span className="font-bold text-blue-900">วิธีแก้ไข:</span>{' '}
                              {checkDefects[6]?.correctiveAction || 'ยังไม่ได้ระบุวิธีแก้ไข'}
                            </div>
                          </div>
                        ) : (
                        <div className="inline-flex items-center gap-1.5 text-slate-500 text-xs py-1.5 px-3 rounded-lg bg-slate-50 border border-slate-200/80">
                          <span className="w-2 h-2 rounded-full bg-slate-300 shrink-0" />
                          <span>ยังไม่ได้ระบุผล (กด PASS หรือ FAIL เพื่อเลือก)</span>
                        </div>
                      )}</td>
                    </tr>
                  )}

                  {/* Row 7: อุณหภูมิห้องขณะตรวจตามเกณฑ์ 2-6 °C */}
                  {isRowVisible(7) && (
                    <tr
                    className={`transition-colors border-l-4 ${
                      isItem7Pass
                        ? 'border-l-emerald-500 bg-emerald-50/20 hover:bg-emerald-50/40'
                        : isItem7Fail
                        ? 'border-l-rose-500 bg-rose-50/35 hover:bg-rose-50/50'
                        : 'border-l-slate-300 hover:bg-slate-50/60'
                    }`}>
                      <td className="py-4 px-4 align-top">
                        <div className="flex items-start gap-2.5">
                          <span
                          className={`flex items-center justify-center w-7 h-7 rounded-lg font-bold text-xs shrink-0 mt-0.5 ${
                            isItem7Pass
                              ? 'bg-emerald-100 text-emerald-800'
                              : isItem7Fail
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          7
                        </span>
                          <div className="space-y-1">
                            <div className="font-bold text-slate-900 leading-snug">
                              {CHECKLIST_STANDARDS[7].title}
                            </div>
                            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200/80">
                              {CHECKLIST_STANDARDS[7].categoryTag}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4 align-top">
                        <button
                          type="button"
                          onClick={() => setActiveSpecDetailItem(7)}
                          className="w-full text-left p-1.5 rounded-lg hover:bg-slate-100/70 transition-colors group space-y-1"
                          title="คลิกเพื่อดูรายละเอียดข้อกำหนด 7-Eleven"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-semibold text-xs text-slate-800 flex items-center gap-1.5">
                              <Info className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-600 transition-colors shrink-0" />
                              รายละเอียดข้อกำหนด
                            </span>
                            <span className="text-[10px] text-emerald-700 font-medium underline group-hover:text-emerald-800">
                              ดูเกณฑ์
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-600 line-clamp-2 leading-relaxed">
                            {CHECKLIST_STANDARDS[7].criterion7Eleven}
                          </div>
                        </button>
                      </td>
                      <td className="py-4 px-4 align-top">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="relative w-36 shrink-0">
                              <Thermometer className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                              <input
                                type="number"
                                step="0.1"
                                value={roomTempC}
                                onChange={(e) => setRoomTempC(parseFloat(e.target.value) || 0)}
                                className={`w-full pl-8 pr-9 py-1.5 text-xs font-semibold tabular-nums bg-white border rounded-lg focus:outline-none focus:ring-1 ${
                                  rawCheck7RoomTempPass
                                    ? 'border-slate-300 focus:ring-slate-900'
                                    : 'border-rose-400 text-rose-700 focus:ring-rose-600'
                                }`}
                              />
                              <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-[11px] font-medium text-slate-500">
                                °C
                              </span>
                            </div>

                            <div className="inline-flex items-center gap-1">
                              {[3.5, 4.2, 5.0].map((presetTemp) => {
                                const isSelected = Math.abs(roomTempC - presetTemp) < 0.05;
                                return (
                                  <button
                                    key={presetTemp}
                                    type="button"
                                    onClick={() => setRoomTempC(isSelected ? 0 : presetTemp)}
                                    className={`px-2 py-1 rounded text-[11px] font-mono font-medium border transition-colors cursor-pointer ${
                                      isSelected
                                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs font-semibold'
                                        : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                                    }`}
                                    title={isSelected ? 'คลิกซ้ำเพื่อยกเลิก' : `ตั้งค่า ${presetTemp.toFixed(1)}°C`}
                                  >
                                    {presetTemp.toFixed(1)}°
                                  </button>
                                );
                              })}
                            </div>

                            <span
                              className={`text-[11px] font-semibold px-2.5 py-1 rounded-md ${
                                rawCheck7RoomTempPass
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {rawCheck7RoomTempPass
                                ? 'อยู่ในช่วงควบคุม 2.0-6.0 °C'
                                : 'อยู่นอกเกณฑ์อุณหภูมิ!'}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4 align-top text-center">
                        <div className="inline-flex flex-col gap-1.5 items-center">
                          <div className="inline-flex p-1 bg-slate-100 rounded-lg border border-slate-200/90 shadow-2xs">
                            <button
                              type="button"
                              onClick={() => handleToggleItemStatus(7, 'PASS')}
                              className={`px-3.5 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
                                isItem7Pass
                                  ? 'bg-emerald-600 text-white shadow-xs'
                                  : 'text-slate-600 hover:text-emerald-700 hover:bg-emerald-50'
                              }`}
                              title="กดเลือก PASS (กดซ้ำเพื่อยกเลิก)"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>PASS</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleItemStatus(7, 'FAIL')}
                              className={`px-3.5 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
                                isItem7Fail
                                  ? 'bg-rose-600 text-white shadow-xs'
                                  : 'text-slate-600 hover:text-rose-700 hover:bg-rose-50'
                              }`}
                              title="กดเลือก FAIL (กดซ้ำเพื่อยกเลิก)"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>FAIL</span>
                            </button>
                          </div>
                          <span
                            className={`text-[11px] font-semibold ${
                              isItem7Pass
                                ? 'text-emerald-700'
                                : isItem7Fail
                                ? 'text-rose-700'
                                : 'text-slate-400 font-normal italic'
                            }`}
                          >
                            {isItem7Pass ? 'ผ่านเกณฑ์' : isItem7Fail ? 'ไม่ผ่านเกณฑ์' : 'รอเลือกผลตรวจ'}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-4 align-top">
                        {isItem7Pass ? (
                          <div className="inline-flex items-center gap-1.5 text-emerald-700 font-semibold text-xs py-1.5 px-3 rounded-lg bg-emerald-50 border border-emerald-200">
                            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                            <span>ผ่านเกณฑ์: {roomTempC.toFixed(1)} °C (ควบคุมช่วง 2.0–6.0 °C)</span>
                          </div>
                        ) : isItem7Fail ? (
                          <div className="p-3 rounded-xl bg-rose-50/80 border border-rose-200 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-rose-800 flex items-center gap-1">
                                <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" /> ไม่ผ่านเกณฑ์ (FAIL)
                              </span>
                              <button
                                type="button"
                                onClick={() => handleOpenFailModal(7)}
                                className="text-[11px] font-bold text-rose-700 hover:text-rose-900 underline flex items-center gap-1"
                              >
                                <Edit className="w-3 h-3" /> แก้ไข CAPA
                              </button>
                            </div>
                            <div className="text-xs text-rose-950">
                              <span className="font-bold text-rose-900">สาเหตุ:</span> {checkDefects[7]?.reason || 'ยังไม่ได้ระบุสาเหตุ'}
                            </div>
                            <div className="text-xs text-blue-950 bg-white/80 p-2 rounded-lg border border-blue-200">
                              <span className="font-bold text-blue-900">วิธีแก้ไข:</span>{' '}
                              {checkDefects[7]?.correctiveAction || 'ยังไม่ได้ระบุวิธีแก้ไข'}
                            </div>
                          </div>
                        ) : (
                        <div className="inline-flex items-center gap-1.5 text-slate-500 text-xs py-1.5 px-3 rounded-lg bg-slate-50 border border-slate-200/80">
                          <span className="w-2 h-2 rounded-full bg-slate-300 shrink-0" />
                          <span>ยังไม่ได้ระบุผล (กด PASS หรือ FAIL เพื่อเลือก)</span>
                        </div>
                      )}</td>
                    </tr>
                  )}

                  {/* Row 8: ความสะอาดและความเรียบร้อยของตะกร้าขนส่ง */}
                  {isRowVisible(8) && (
                    <tr
                    className={`transition-colors border-l-4 ${
                      isItem8Pass
                        ? 'border-l-emerald-500 bg-emerald-50/20 hover:bg-emerald-50/40'
                        : isItem8Fail
                        ? 'border-l-rose-500 bg-rose-50/35 hover:bg-rose-50/50'
                        : 'border-l-slate-300 hover:bg-slate-50/60'
                    }`}>
                      <td className="py-4 px-4 align-top">
                        <div className="flex items-start gap-2.5">
                          <span
                          className={`flex items-center justify-center w-7 h-7 rounded-lg font-bold text-xs shrink-0 mt-0.5 ${
                            isItem8Pass
                              ? 'bg-emerald-100 text-emerald-800'
                              : isItem8Fail
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          8
                        </span>
                          <div className="space-y-1">
                            <div className="font-bold text-slate-900 leading-snug">
                              {CHECKLIST_STANDARDS[8].title}
                            </div>
                            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 border border-slate-200/80">
                              {CHECKLIST_STANDARDS[8].categoryTag}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-4 align-top">
                        <button
                          type="button"
                          onClick={() => setActiveSpecDetailItem(8)}
                          className="w-full text-left p-1.5 rounded-lg hover:bg-slate-100/70 transition-colors group space-y-1"
                          title="คลิกเพื่อดูรายละเอียดข้อกำหนด 7-Eleven"
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="font-semibold text-xs text-slate-800 flex items-center gap-1.5">
                              <Info className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-600 transition-colors shrink-0" />
                              รายละเอียดข้อกำหนด
                            </span>
                            <span className="text-[10px] text-emerald-700 font-medium underline group-hover:text-emerald-800">
                              ดูเกณฑ์
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-600 line-clamp-2 leading-relaxed">
                            {CHECKLIST_STANDARDS[8].criterion7Eleven}
                          </div>
                        </button>
                      </td>
                      <td className="py-4 px-4 align-top">
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 text-[11px] text-slate-700 font-medium border border-slate-200">
                              <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              ผ่านการล้างฆ่าเชื้อ
                            </span>
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 text-[11px] text-slate-700 font-medium border border-slate-200">
                              <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              แห้งสนิท ไร้คราบฝุ่น
                            </span>
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 text-[11px] text-slate-700 font-medium border border-slate-200">
                              <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              จัดเรียงซ้อนล็อคมั่นคง
                            </span>
                          </div>
                          <input
                            type="text"
                            value={check8Note}
                            onChange={(e) => setCheck8Note(e.target.value)}
                            placeholder="บันทึกความสะอาดและการจัดเรียงตะกร้าขนส่ง..."
                            className="w-full px-3 py-1.5 text-xs bg-slate-50/70 focus:bg-white border border-slate-200 focus:border-slate-400 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900 transition-colors"
                          />
                        </div>
                      </td>
                      <td className="py-4 px-4 align-top text-center">
                        <div className="inline-flex flex-col gap-1.5 items-center">
                          <div className="inline-flex p-1 bg-slate-100 rounded-lg border border-slate-200/90 shadow-2xs">
                            <button
                              type="button"
                              onClick={() => handleToggleItemStatus(8, 'PASS')}
                              className={`px-3.5 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
                                isItem8Pass
                                  ? 'bg-emerald-600 text-white shadow-xs'
                                  : 'text-slate-600 hover:text-emerald-700 hover:bg-emerald-50'
                              }`}
                              title="กดเลือก PASS (กดซ้ำเพื่อยกเลิก)"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>PASS</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleItemStatus(8, 'FAIL')}
                              className={`px-3.5 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
                                isItem8Fail
                                  ? 'bg-rose-600 text-white shadow-xs'
                                  : 'text-slate-600 hover:text-rose-700 hover:bg-rose-50'
                              }`}
                              title="กดเลือก FAIL (กดซ้ำเพื่อยกเลิก)"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              <span>FAIL</span>
                            </button>
                          </div>
                          <span
                            className={`text-[11px] font-semibold ${
                              isItem8Pass
                                ? 'text-emerald-700'
                                : isItem8Fail
                                ? 'text-rose-700'
                                : 'text-slate-400 font-normal italic'
                            }`}
                          >
                            {isItem8Pass ? 'ผ่านเกณฑ์' : isItem8Fail ? 'ไม่ผ่านเกณฑ์' : 'รอเลือกผลตรวจ'}
                          </span>
                        </div>
                      </td>
                      <td className="py-4 px-4 align-top">
                        {isItem8Pass ? (
                          <div className="inline-flex items-center gap-1.5 text-emerald-700 font-semibold text-xs py-1.5 px-3 rounded-lg bg-emerald-50 border border-emerald-200">
                            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
                            <span>ผ่านเกณฑ์: ตะกร้าผ่านการฆ่าเชื้อ สะอาดพร้อมจัดส่ง</span>
                          </div>
                        ) : isItem8Fail ? (
                          <div className="p-3 rounded-xl bg-rose-50/80 border border-rose-200 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-bold text-rose-800 flex items-center gap-1">
                                <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" /> ไม่ผ่านเกณฑ์ (FAIL)
                              </span>
                              <button
                                type="button"
                                onClick={() => handleOpenFailModal(8)}
                                className="text-[11px] font-bold text-rose-700 hover:text-rose-900 underline flex items-center gap-1"
                              >
                                <Edit className="w-3 h-3" /> แก้ไข CAPA
                              </button>
                            </div>
                            <div className="text-xs text-rose-950">
                              <span className="font-bold text-rose-900">สาเหตุ:</span> {checkDefects[8]?.reason || 'ยังไม่ได้ระบุสาเหตุ'}
                            </div>
                            <div className="text-xs text-blue-950 bg-white/80 p-2 rounded-lg border border-blue-200">
                              <span className="font-bold text-blue-900">วิธีแก้ไข:</span>{' '}
                              {checkDefects[8]?.correctiveAction || 'ยังไม่ได้ระบุวิธีแก้ไข'}
                            </div>
                          </div>
                        ) : (
                        <div className="inline-flex items-center gap-1.5 text-slate-500 text-xs py-1.5 px-3 rounded-lg bg-slate-50 border border-slate-200/80">
                          <span className="w-2 h-2 rounded-full bg-slate-300 shrink-0" />
                          <span>ยังไม่ได้ระบุผล (กด PASS หรือ FAIL เพื่อเลือก)</span>
                        </div>
                      )}</td>
                    </tr>
                  )}

                  {/* Empty state when filter matches no rows */}
                  {checklistFilter === 'fail' && failedChecklistCount === 0 && (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-500">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <CheckCircle2 className="w-10 h-10 text-emerald-600" />
                          <span className="font-bold text-sm text-slate-800">
                            ยอดเยี่ยม! ผ่านเกณฑ์มาตรฐาน 7-Eleven ครบทั้ง 8 ข้อแล้ว
                          </span>
                          <span className="text-xs text-slate-400">
                            ไม่มีรายการที่ไม่ผ่าน หรือต้องระบุ CAPA
                          </span>
                        </div>
                      </td>
                    </tr>
                  )}

                  {checklistFilter === 'pass' && passedChecklistCount === 0 && (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-500">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <AlertCircle className="w-10 h-10 text-amber-500" />
                          <span className="font-bold text-sm text-slate-800">
                            ยังไม่มีรายการที่เลือกผ่านเกณฑ์
                          </span>
                        </div>
                      </td>
                    </tr>
                  )}

                  {checklistFilter === 'pending' && pendingChecklistCount === 0 && (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-slate-500">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <CheckCircle2 className="w-10 h-10 text-emerald-600" />
                          <span className="font-bold text-sm text-slate-800">
                            เลือกผลตรวจครบทั้ง 8 ข้อแล้ว
                          </span>
                          <span className="text-xs text-slate-400">
                            ไม่มีรายการคงค้างรอเลือกผลตรวจ
                          </span>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        <div className="p-6 space-y-4">
          {/* Inspector & Signatories & Save Footer */}
          <div className="pt-4 border-t border-slate-200 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  ผู้ตรวจสอบคุณภาพสินค้า (FG Inspector) *
                </label>
                <input
                  type="text"
                  value={oqcInspector}
                  onChange={(e) => setOqcInspector(e.target.value)}
                  placeholder="น.ส.รัชดาภรณ์ เรืองอุไร"
                  className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  ผู้รับรองผล COA (COA Certifier) *
                </label>
                <input
                  type="text"
                  value={coaCertifier}
                  onChange={(e) => setCoaCertifier(e.target.value)}
                  placeholder="น.ส.พรปวีณ์ ร่วมศรี"
                  className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  ผู้อนุมัติปล่อยสินค้า (Release Approver) *
                </label>
                <input
                  type="text"
                  value={releaseApprover}
                  onChange={(e) => setReleaseApprover(e.target.value)}
                  placeholder="นายเด่นชัย ห่วงจิง"
                  className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                หมายเหตุเพิ่มเติม
              </label>
              <input
                type="text"
                value={oqcRemarks}
                onChange={(e) => setOqcRemarks(e.target.value)}
                placeholder="บันทึกข้อสังเกตการตรวจ FG (ถ้ามี)"
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                const targetId = editingId || outgoingRecords[0]?.id;
                if (targetId) {
                  onOpenCOA(targetId);
                } else {
                  onNotify('ยังไม่มีข้อมูล COA', 'กรุณาบันทึกผลการตรวจ FG ก่อนเพื่อดูใบรับรอง COA', 'warning');
                }
              }}
              className="px-3.5 py-2 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-lg transition-colors inline-flex items-center gap-1.5 shadow-2xs"
            >
              <FileCheck2 className="w-3.5 h-3.5 text-emerald-700" />
              <span>ไปยังหน้าใบรับรอง COA</span>
              <ExternalLink className="w-3 h-3 text-emerald-600" />
            </button>

            <div className="flex items-center gap-3 ml-auto">
              {editingId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-4 py-2.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                >
                  ยกเลิกการแก้ไข
                </button>
              )}
              <button
                type="submit"
                className="px-5 py-2.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors inline-flex items-center gap-2 whitespace-nowrap shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>{editingId ? 'บันทึกการแก้ไข FG' : 'บันทึกผล FG และออกเลข COA'}</span>
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* OQC Shipment History Table */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              รายการตรวจควบคุมคุณภาพสินค้าสำเร็จรูป FG ({outgoingRecords.length} รอบจัดส่ง)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              ประวัติการตรวจปล่อยสินค้าสำเร็จรูป 8 ข้อกำหนดมาตรฐาน CP ALL DC พร้อมรหัสล็อต FG และเลขที่ COA
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={outgoingRecords.length === 0}
              className="h-9 px-3.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50 border border-emerald-300 rounded-lg transition-colors inline-flex items-center justify-center gap-2 shadow-2xs cursor-pointer disabled:cursor-not-allowed"
              title="ดาวน์โหลดข้อมูลประวัติการตรวจ FG ย้อนหลังเป็นไฟล์ CSV (Excel)"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
              <span>Export to CSV</span>
            </button>
          </div>
        </div>
        {/* Desktop Table View (md+) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                <th className="py-3 px-4">เลขที่ OQC / COA / Lot No.</th>
                <th className="py-3 px-4">ลูกค้า / PO</th>
                <th className="py-3 px-4">สายพันธุ์ผสม</th>
                <th className="py-3 px-4 text-right">น้ำหนักสุทธิ</th>
                <th className="py-3 px-4 text-right">อุณหภูมิห้อง</th>
                <th className="py-3 px-4">สรุปผล FG (8 ข้อ)</th>
                <th className="py-3 px-4 text-right">ดำเนินการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {outgoingRecords.map((rec) => {
                const usedCount = rec.colorMix.filter((c) => c.percentage > 0).length;
                const totalLotsInRec = rec.colorMix
                  .filter((c) => c.percentage > 0)
                  .reduce((acc, c) => acc + getMixLotNumbers(c).length, 0);
                return (
                  <tr key={rec.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 tabular-nums whitespace-nowrap">
                      <div className="font-semibold tracking-tight text-slate-900">{rec.oqcNumber}</div>
                      <div className="text-[11px] text-slate-500">{rec.coaNumber}</div>
                      {rec.productionLotNo && (
                        <div className="text-[10px] font-mono font-medium text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded mt-0.5 border border-emerald-200 inline-block">
                          Lot: {rec.productionLotNo}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4 max-w-xs">
                      <div className="font-medium text-slate-900 truncate">
                        {rec.customerName} · {rec.distributionCenter || '-'}
                      </div>
                      <div className="text-[11px] text-slate-500 tabular-nums">
                        PO: {rec.poNumber} · EXP: {formatThaiDate(rec.expDate)}
                      </div>
                    </td>
                    <td className="py-3 px-4 tabular-nums whitespace-nowrap">
                      <div className="font-semibold text-slate-800">{usedCount} สายพันธุ์ (คละสี)</div>
                      <div className="text-[11px] text-slate-500">{totalLotsInRec} ล็อตที่ใช้บรรจุ</div>
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums whitespace-nowrap">
                      <span
                        className={
                          rec.check4NetWeightPass
                            ? 'text-emerald-700 font-semibold'
                            : 'text-red-700 font-bold'
                        }
                      >
                        {rec.netWeightG} กรัม
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums whitespace-nowrap">
                      <span
                        className={
                          rec.check7RoomTempPass
                            ? 'text-emerald-700 font-semibold'
                            : 'text-red-700 font-bold'
                        }
                      >
                        {rec.roomTempC.toFixed(1)} °C
                      </span>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap font-semibold tabular-nums">
                      {rec.oqcStatus === 'PASS' ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>PASS (8/8)</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-red-700">
                          <XCircle className="w-3.5 h-3.5" />
                          <span>FAIL</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onOpenCOA(rec.id)}
                          className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors inline-flex items-center gap-1.5 shadow-2xs"
                        >
                          <FileCheck2 className="w-3.5 h-3.5" />
                          <span>ดูใบรับรอง COA</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleLoadRecord(rec)}
                          className="px-2 py-1 text-xs text-slate-600 hover:text-slate-900 underline"
                        >
                          แก้ไข
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Mobile Card View (< md) */}
        <div className="md:hidden divide-y divide-slate-200 bg-slate-50/40 p-3 space-y-3">
          {outgoingRecords.map((rec) => {
            const usedCount = rec.colorMix.filter((c) => c.percentage > 0).length;
            const totalLotsInRec = rec.colorMix
              .filter((c) => c.percentage > 0)
              .reduce((acc, c) => acc + getMixLotNumbers(c).length, 0);

            return (
              <div
                key={rec.id}
                className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-3 shadow-2xs"
              >
                {/* Header: OQC Number + Status */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-bold text-sm text-slate-900 tabular-nums">
                      {rec.oqcNumber}
                    </div>
                    <div className="text-xs text-blue-700 font-semibold tabular-nums mt-0.5">
                      {rec.coaNumber}
                    </div>
                    {rec.productionLotNo && (
                      <div className="text-[10px] font-mono font-medium text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded mt-1 border border-emerald-200 inline-block">
                        Lot: {rec.productionLotNo}
                      </div>
                    )}
                  </div>

                  <div>
                    {rec.oqcStatus === 'PASS' ? (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>ผ่าน 8/8 ข้อ</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-red-700 bg-red-50 px-2.5 py-1 rounded-lg border border-red-200">
                        <XCircle className="w-3.5 h-3.5" />
                        <span>ไม่ผ่านเกณฑ์</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Details Breakdown */}
                <div className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-100 space-y-1.5 tabular-nums">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">ศูนย์กระจายสินค้า:</span>
                    <strong className="text-slate-900 truncate max-w-[190px]">
                      {rec.distributionCenter || '-'}
                    </strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">ใบสั่งซื้อ PO / EXP:</span>
                    <span className="text-slate-700">
                      PO: {rec.poNumber} · EXP: {formatThaiDate(rec.expDate)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
                    <span className="text-slate-500 font-medium">สัดส่วนคละสี:</span>
                    <span className="font-semibold text-slate-800">
                      {usedCount} สี ({totalLotsInRec} ล็อต)
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">น้ำหนัก / ห้องตรวจ:</span>
                    <span>
                      <strong className={rec.check4NetWeightPass ? 'text-emerald-700' : 'text-red-700'}>
                        {rec.netWeightG}g
                      </strong>{' '}
                      ·{' '}
                      <strong className={rec.check7RoomTempPass ? 'text-emerald-700' : 'text-red-700'}>
                        {rec.roomTempC.toFixed(1)}°C
                      </strong>
                    </span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => onOpenCOA(rec.id)}
                    className="h-9 px-3 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors inline-flex items-center justify-center gap-1.5 shadow-2xs"
                  >
                    <FileCheck2 className="w-3.5 h-3.5" />
                    <span>เปิดใบรับรอง COA</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLoadRecord(rec)}
                    className="h-9 px-3 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors inline-flex items-center justify-center"
                  >
                    แก้ไขบันทึก
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Defect & Corrective Action Pop-up Modal */}
      {activeDefectModal !== null && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 bg-red-50/70 flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-xl bg-red-100 text-red-700 border border-red-200 shrink-0 mt-0.5">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-red-950">
                    บันทึกข้อบกพร่องที่ไม่ผ่านเกณฑ์ & วิธีแก้ไข (Corrective Action)
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs font-semibold text-slate-800">
                      รายการที่ {activeDefectModal}: {CHECKLIST_STANDARDS[activeDefectModal]?.title}
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-200 text-red-900">
                      {CHECKLIST_STANDARDS[activeDefectModal]?.categoryTag}
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveDefectModal(null);
                  setDefectModalError(null);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors"
                title="ปิดหน้าต่าง"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 overflow-y-auto text-xs">
              {/* 7-Eleven Standard Box */}
              <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200 text-slate-800 space-y-1">
                <div className="text-[11px] font-bold text-emerald-900 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                  <span>ข้อกำหนดมาตรฐาน 7-Eleven</span>
                </div>
                <p className="text-xs text-slate-700 leading-relaxed pl-5">
                  {CHECKLIST_STANDARDS[activeDefectModal]?.criterion7Eleven}
                </p>
              </div>

              {/* Error Notice */}
              {defectModalError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-300 text-red-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <div className="font-medium text-xs">{defectModalError}</div>
                </div>
              )}

              {/* Field 1: สาเหตุที่ไม่ผ่านเกณฑ์ (บังคับ) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-900 text-xs flex items-center gap-1">
                    <span>1. สาเหตุที่ไม่ผ่านเกณฑ์ (Failure Reason / Non-Conformance)</span>
                    <span className="text-red-600 font-bold">* บังคับ</span>
                  </label>
                  <span className="text-[10px] text-slate-400">เลือกตัวเลือกด่วนหรือพิมพ์ระบุ</span>
                </div>

                {/* Quick Presets for Reason */}
                <div className="flex flex-wrap gap-1.5 p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-[10px] font-semibold text-slate-500 w-full mb-0.5">
                    คลิกตัวเลือกด่วนเพื่อใส่สาเหตุพบบ่อย:
                  </span>
                  {CHECKLIST_STANDARDS[activeDefectModal]?.commonReasons.map((reasonText, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setDefectReasonInput(reasonText);
                        if (defectModalError) setDefectModalError(null);
                      }}
                      className={`px-2.5 py-1 rounded-full text-[11px] border text-left transition-colors ${
                        defectReasonInput === reasonText
                          ? 'bg-amber-600 text-white border-amber-600 font-medium shadow-2xs'
                          : 'bg-white text-slate-700 border-slate-300 hover:border-amber-400 hover:bg-amber-50/70'
                      }`}
                    >
                      {reasonText}
                    </button>
                  ))}
                </div>

                <textarea
                  rows={2}
                  value={defectReasonInput}
                  onChange={(e) => {
                    setDefectReasonInput(e.target.value);
                    if (defectModalError) setDefectModalError(null);
                  }}
                  placeholder="พิมพ์ระบุสาเหตุที่ไม่ผ่านเกณฑ์โดยละเอียด..."
                  className={`w-full p-2.5 text-xs bg-white border rounded-lg focus:outline-none focus:ring-2 transition-colors ${
                    !defectReasonInput.trim() && defectModalError
                      ? 'border-red-400 focus:ring-red-500 bg-red-50/30'
                      : 'border-slate-300 focus:ring-slate-900'
                  }`}
                />
              </div>

              {/* Field 2: วิธีแก้ไข / การแก้ไข (บังคับ) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-bold text-slate-900 text-xs flex items-center gap-1">
                    <span>2. วิธีแก้ไข / การแก้ไข (Corrective Action / CAPA)</span>
                    <span className="text-red-600 font-bold">* บังคับ</span>
                  </label>
                  <span className="text-[10px] text-slate-400">เลือกตัวเลือกด่วนหรือพิมพ์ระบุ</span>
                </div>

                {/* Quick Presets for Corrective Action */}
                <div className="flex flex-wrap gap-1.5 p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-[10px] font-semibold text-slate-500 w-full mb-0.5">
                    คลิกตัวเลือกด่วนเพื่อใส่มาตรการแก้ไข:
                  </span>
                  {CHECKLIST_STANDARDS[activeDefectModal]?.commonActions.map((actionText, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setDefectActionInput(actionText);
                        if (defectModalError) setDefectModalError(null);
                      }}
                      className={`px-2.5 py-1 rounded-full text-[11px] border text-left transition-colors ${
                        defectActionInput === actionText
                          ? 'bg-blue-600 text-white border-blue-600 font-medium shadow-2xs'
                          : 'bg-white text-slate-700 border-slate-300 hover:border-blue-400 hover:bg-blue-50/70'
                      }`}
                    >
                      {actionText}
                    </button>
                  ))}
                </div>

                <textarea
                  rows={2}
                  value={defectActionInput}
                  onChange={(e) => {
                    setDefectActionInput(e.target.value);
                    if (defectModalError) setDefectModalError(null);
                  }}
                  placeholder="พิมพ์ระบุขั้นตอนการแก้ไข ปรับปรุง หรือจัดการสินค้าที่ไม่ผ่านเกณฑ์..."
                  className={`w-full p-2.5 text-xs bg-white border rounded-lg focus:outline-none focus:ring-2 transition-colors ${
                    !defectActionInput.trim() && defectModalError
                      ? 'border-red-400 focus:ring-red-500 bg-red-50/30'
                      : 'border-slate-300 focus:ring-slate-900'
                  }`}
                />
              </div>

              <div className="p-3 rounded-lg bg-amber-50/80 border border-amber-200 text-amber-900 text-[11px] leading-relaxed">
                <strong>หมายเหตุความปลอดภัยอาหาร:</strong> เมื่อบันทึกผลเป็น FAIL
                ระบบจะกำหนดให้รายการตรวจนี้ไม่ผ่านเกณฑ์ และต้องดำเนินการตามวิธีแก้ไข (Corrective
                Action) ที่บันทึกไว้ก่อนจะสามารถปรับสถานะกลับเป็น PASS ได้
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setActiveDefectModal(null);
                  setDefectModalError(null);
                }}
                className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-200/80 rounded-lg transition-colors"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmFailModal}
                className="px-5 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors shadow-2xs inline-flex items-center gap-1.5"
              >
                <XCircle className="w-3.5 h-3.5" />
                <span>ยืนยันบันทึกผล FAIL & วิธีแก้ไข</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POP-UP MODAL: Net Weight Sampling (10–20 กล่อง) with Hold / Reject Evaluation */}
      {isWeightSamplingModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto"
        >
          <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-6">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-200 bg-linear-to-r from-blue-900 to-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center">
                  <Scale className="w-5 h-5 text-blue-300" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span>สุ่มชั่งน้ำหนักสินค้ามาตรฐาน 7-Eleven / CP ALL</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-400 text-slate-900">
                      10–20 กล่อง
                    </span>
                  </h3>
                  <p className="text-xs text-blue-200 mt-0.5">
                    ข้อกำหนด: น้ำหนักสุทธิต่อแพ็คไม่น้อยกว่า 140.0 กรัม (หากกล่องใดกล่องหนึ่ง &lt; 140g ต้อง Hold สินค้าเพื่อแก้ไข หรือ Reject)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsWeightSamplingModalOpen(false)}
                className="p-1 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
              {/* Sample Size Controls & Quick Buttons */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-900 block">
                      จำนวนกล่องที่สุ่มตรวจ (10 – 20 กล่อง):
                    </label>
                    <span className="text-[11px] text-slate-500">
                      เลือกจำนวนตัวอย่างตามระดับการสุ่มตรวจประจำกะ
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {[10, 12, 15, 20].map((count) => (
                      <button
                        key={count}
                        type="button"
                        onClick={() => handleChangeSampleCount(count)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                          sampleCountInput === count
                            ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                            : 'bg-white text-slate-700 border-slate-300 hover:border-blue-400 hover:bg-blue-50/50'
                        }`}
                      >
                        {count} กล่อง
                      </button>
                    ))}
                    <div className="relative w-20">
                      <input
                        type="number"
                        min={10}
                        max={20}
                        value={sampleCountInput}
                        onChange={(e) => {
                          const val = parseInt(e.target.value, 10);
                          if (!isNaN(val)) handleChangeSampleCount(val);
                        }}
                        className="w-full px-2 py-1.5 text-xs text-center font-bold bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-600"
                      />
                    </div>
                  </div>
                </div>

                {/* Quick Demo Data Buttons */}
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200">
                  <span className="text-[11px] font-semibold text-slate-500">เครื่องมือจำลองผลตรวจ:</span>
                  <button
                    type="button"
                    onClick={handleQuickFillStandard}
                    className="px-2.5 py-1 text-[11px] font-medium text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-md transition-colors inline-flex items-center gap-1"
                  >
                    <Check className="w-3 h-3 text-emerald-600" />
                    <span>กรอกค่ามาตรฐานสุ่มตัวอย่าง (142–145g ผ่านเกณฑ์)</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleQuickFillUnderweightDemo}
                    className="px-2.5 py-1 text-[11px] font-medium text-red-800 bg-red-50 hover:bg-red-100 border border-red-300 rounded-md transition-colors inline-flex items-center gap-1"
                  >
                    <AlertTriangle className="w-3 h-3 text-red-600" />
                    <span>จำลองพบกล่อง &lt; 140g (ทดสอบ Hold / Reject)</span>
                  </button>
                </div>
              </div>

              {/* Statistics & Hold/Reject Alert */}
              {(() => {
                const count = tempSampleWeights.length;
                const sum = tempSampleWeights.reduce((acc, w) => acc + (w || 0), 0);
                const avg = count > 0 ? sum / count : 0;
                const min = count > 0 ? Math.min(...tempSampleWeights) : 0;
                const max = count > 0 ? Math.max(...tempSampleWeights) : 0;
                const underweightBoxes = tempSampleWeights.filter((w) => w < 140.0);
                const hasUnderweight = underweightBoxes.length > 0;

                return (
                  <div className="space-y-3">
                    {/* Live Stats Row */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                        <span className="text-[10px] font-semibold text-slate-500 block uppercase">
                          จำนวนตัวอย่าง
                        </span>
                        <div className="text-lg font-bold text-slate-900 tabular-nums">
                          {count} <span className="text-xs font-normal text-slate-500">กล่อง</span>
                        </div>
                      </div>

                      <div
                        className={`p-3 rounded-xl border ${
                          avg >= 140.0
                            ? 'bg-emerald-50/60 border-emerald-200'
                            : 'bg-red-50/60 border-red-200'
                        }`}
                      >
                        <span className="text-[10px] font-semibold text-slate-600 block uppercase">
                          ค่าน้ำหนักเฉลี่ย
                        </span>
                        <div
                          className={`text-lg font-bold tabular-nums ${
                            avg >= 140.0 ? 'text-emerald-700' : 'text-red-700'
                          }`}
                        >
                          {avg.toFixed(1)}{' '}
                          <span className="text-xs font-normal">กรัม</span>
                        </div>
                      </div>

                      <div
                        className={`p-3 rounded-xl border ${
                          min >= 140.0
                            ? 'bg-slate-50 border-slate-200'
                            : 'bg-red-100/70 border-red-300'
                        }`}
                      >
                        <span className="text-[10px] font-semibold text-slate-600 block uppercase">
                          น้ำหนักต่ำสุด (Min)
                        </span>
                        <div
                          className={`text-lg font-bold tabular-nums ${
                            min >= 140.0 ? 'text-slate-900' : 'text-red-700'
                          }`}
                        >
                          {min.toFixed(1)}{' '}
                          <span className="text-xs font-normal">กรัม</span>
                        </div>
                      </div>

                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                        <span className="text-[10px] font-semibold text-slate-500 block uppercase">
                          น้ำหนักสูงสุด (Max)
                        </span>
                        <div className="text-lg font-bold text-slate-900 tabular-nums">
                          {max.toFixed(1)}{' '}
                          <span className="text-xs font-normal text-slate-500">กรัม</span>
                        </div>
                      </div>
                    </div>

                    {/* Prominent Status Banner */}
                    {hasUnderweight ? (
                      <div className="p-3.5 rounded-xl bg-red-100 border-2 border-red-500 text-red-950 space-y-1.5 shadow-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold flex items-center gap-2 text-red-900">
                            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
                            🚨 ตรวจพบกล่องน้ำหนัก &lt; 140.0g: HOLD สินค้าเพื่อแก้ไข หรือ REJECT!
                          </span>
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-600 text-white shadow-2xs">
                            พบ {underweightBoxes.length} กล่องไม่ได้เกณฑ์
                          </span>
                        </div>
                        <p className="text-xs text-red-800 leading-relaxed">
                          ตามข้อกำหนดมาตรฐาน 7-Eleven / CP ALL: แม้ค่าน้ำหนักเฉลี่ยจะถึง 140g แต่หากพบกล่องใดกล่องหนึ่งมีน้ำหนักน้อยกว่า 140.0 กรัม ให้ทำการ <strong>Hold สินค้าเพื่อแก้ไข (รื้อชั่งใหม่ 100%) หรือ Reject ล็อตการผลิต</strong>
                        </p>
                      </div>
                    ) : (
                      <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-950 flex items-center justify-between shadow-2xs">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                          <span className="text-xs font-bold text-emerald-900">
                            ✓ ผ่านเกณฑ์มาตรฐาน 7-Eleven: ทุกกล่องมีน้ำหนัก ≥ 140.0 กรัม (ค่าเฉลี่ย {avg.toFixed(1)}g)
                          </span>
                        </div>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-600 text-white">
                          PASS 100%
                        </span>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Sample Box Inputs Grid */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-900 block">
                  กรอกค่าน้ำหนักแต่ละกล่องที่สุ่มตรวจ (หน่วย: กรัม):
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                  {tempSampleWeights.map((weight, idx) => {
                    const isUnder = weight < 140.0;
                    return (
                      <div
                        key={idx}
                        className={`p-2.5 rounded-xl border transition-all ${
                          isUnder
                            ? 'bg-red-50/80 border-red-400 ring-1 ring-red-400'
                            : 'bg-white border-slate-200 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500'
                        }`}
                      >
                        <div className="flex items-center justify-between text-[10px] mb-1">
                          <span className="font-semibold text-slate-500">
                            กล่องที่ #{idx + 1}
                          </span>
                          {isUnder ? (
                            <span className="text-[10px] font-bold text-red-600">
                              &lt; 140g
                            </span>
                          ) : (
                            <span className="text-[10px] font-medium text-emerald-600">
                              ≥ 140g
                            </span>
                          )}
                        </div>
                        <div className="relative">
                          <input
                            type="number"
                            step="0.1"
                            min={0}
                            value={weight || ''}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value) || 0;
                              setTempSampleWeights((prev) => {
                                const next = [...prev];
                                next[idx] = val;
                                return next;
                              });
                            }}
                            className={`w-full pr-7 py-1 text-xs font-bold tabular-nums rounded focus:outline-none ${
                              isUnder ? 'text-red-700 bg-transparent' : 'text-slate-900'
                            }`}
                          />
                          <span className="pointer-events-none absolute right-0 inset-y-0 flex items-center text-[10px] text-slate-400 font-normal">
                            g
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                สุ่มตรวจทั้งหมด {tempSampleWeights.length} กล่อง
              </span>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsWeightSamplingModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-200/80 rounded-lg transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={handleSaveWeightSamplingModal}
                  className="px-5 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors shadow-2xs inline-flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>บันทึกผลการสุ่มชั่ง ({tempSampleWeights.length} กล่อง)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* POP-UP MODAL: รายละเอียดข้อกำหนดมาตรฐาน 7-Eleven / CP ALL (ครบ 8 หัวข้อ) */}
      {activeSpecDetailItem !== null && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setActiveSpecDetailItem(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-lg w-full border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="px-5 sm:px-6 py-4 border-b border-slate-200 bg-emerald-50/80 flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="flex items-center justify-center w-7 h-7 rounded-full bg-emerald-600 text-white font-bold text-xs shrink-0 mt-0.5">
                  {activeSpecDetailItem}
                </span>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 leading-snug">
                    {CHECKLIST_STANDARDS[activeSpecDetailItem]?.title}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                      {CHECKLIST_STANDARDS[activeSpecDetailItem]?.categoryTag}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      ข้อกำหนดข้อที่ {activeSpecDetailItem} จาก 8 ข้อ
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveSpecDetailItem(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors shrink-0"
                title="ปิดหน้าต่าง"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 sm:p-6 overflow-y-auto space-y-4 text-xs">
              <div className="p-3.5 rounded-xl bg-emerald-50/90 border border-emerald-300 space-y-1.5">
                <div className="font-bold text-emerald-900 text-xs flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-600" />
                  <span>ข้อกำหนดมาตรฐาน 7-Eleven / CP ALL:</span>
                </div>
                <p className="text-slate-800 leading-relaxed text-[13px] font-medium">
                  {CHECKLIST_STANDARDS[activeSpecDetailItem]?.criterion7Eleven}
                </p>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-slate-700">
                <div className="font-semibold text-slate-900 mb-0.5">เกณฑ์สรุปการตรวจประเมิน:</div>
                <div className="text-[12px]">{CHECKLIST_STANDARDS[activeSpecDetailItem]?.criterionSummary}</div>
              </div>

              {CHECKLIST_STANDARDS[activeSpecDetailItem]?.commonReasons?.length > 0 && (
                <div className="space-y-1.5">
                  <div className="font-bold text-red-800 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                    <span>ข้อบกพร่องที่พบบ่อย (Common Defects):</span>
                  </div>
                  <ul className="list-disc list-inside space-y-1 pl-1 text-slate-700 text-[11.5px] leading-relaxed">
                    {CHECKLIST_STANDARDS[activeSpecDetailItem].commonReasons.map((reason, idx) => (
                      <li key={idx}>{reason}</li>
                    ))}
                  </ul>
                </div>
              )}

              {CHECKLIST_STANDARDS[activeSpecDetailItem]?.commonActions?.length > 0 && (
                <div className="space-y-1.5">
                  <div className="font-bold text-blue-800 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span>แนวทางแก้ไขและป้องกัน (Corrective Action / CAPA):</span>
                  </div>
                  <ul className="list-disc list-inside space-y-1 pl-1 text-slate-700 text-[11.5px] leading-relaxed">
                    {CHECKLIST_STANDARDS[activeSpecDetailItem].commonActions.map((action, idx) => (
                      <li key={idx}>{action}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-5 sm:px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <span className="text-[11px] text-slate-500">
                ระบบประกันคุณภาพ FreshTom QC
              </span>
              <button
                type="button"
                onClick={() => setActiveSpecDetailItem(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition-colors shadow-2xs"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Printable Sheet for Outgoing QC (OQC Report) */}
      <div id="outgoing-qc-report-sheet" className="hidden p-6 bg-white text-slate-900">
        {/* Header */}
        <div className="border-b-2 border-slate-900 pb-3 mb-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-700 text-white mb-1">
                7-ELEVEN / CP ALL QUALITY CONTROL SPECIFICATION
              </div>
              <h1 className="text-lg font-bold text-slate-900 leading-tight">
                รายงานการตรวจคุณภาพสินค้าสำเร็จรูป FG (FG Report)
              </h1>
              <p className="text-[11px] text-slate-600 mt-0.5">
                ศูนย์กระจายสินค้า CP ALL DC · มะเขือเทศเชอร์รี่คละสายพันธุ์ 140 กรัม
              </p>
            </div>
            <div className="text-right">
              <div className="text-xs font-bold text-slate-900 font-mono">
                {editingId
                  ? outgoingRecords.find((r) => r.id === editingId)?.oqcNumber
                  : nextOqcNumber}
              </div>
              <div className="text-[10px] text-slate-500">
                พิมพ์เมื่อ: {formatThaiDate(new Date().toISOString())}
              </div>
              <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-800 border border-slate-300">
                สถานะ 7-Eleven: {passedChecklistCount}/8 ข้อ
              </div>
            </div>
          </div>
        </div>

        {/* Info Grid */}
        <div className="grid grid-cols-4 gap-2 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs mb-4">
          <div>
            <span className="text-[10px] text-slate-500 block">ลูกค้า:</span>
            <span className="font-semibold text-slate-800">{customerName}</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 block">ปลายทาง DC:</span>
            <span className="font-semibold text-slate-800">{distributionCenter}</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 block">ใบสั่งซื้อ (PO):</span>
            <span className="font-semibold font-mono text-slate-800">{poNumber}</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 block">จำนวนสั่ง / ตรวจจริง:</span>
            <span className="font-semibold font-mono text-slate-800">
              {orderedPacks} / {actualPacks} กล่อง
            </span>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 block">วันผลิต (MFG):</span>
            <span className="font-semibold text-slate-800">{formatThaiDate(mfgDate)}</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 block">วันหมดอายุ (EXP):</span>
            <span className="font-semibold text-slate-800">{formatThaiDate(expDate)} (+6 วัน)</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 block">อุณหภูมิห้องตรวจ:</span>
            <span className="font-semibold font-mono text-slate-800">{roomTempC.toFixed(1)} °C</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 block">ผู้ตรวจสอบ FG:</span>
            <span className="font-semibold text-slate-800">{oqcInspector}</span>
          </div>
        </div>

        {/* 8 Checklist Table */}
        <div className="mb-4">
          <h2 className="text-xs font-bold text-slate-800 mb-1.5">
            ผลการตรวจสอบข้อกำหนดมาตรฐาน 7-Eleven (ครบทั้ง 8 ข้อ)
          </h2>
          <table className="w-full text-left border-collapse text-[11px] border border-slate-300">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-300 text-slate-700">
                <th className="py-1 px-2 w-8 text-center border-r border-slate-300">#</th>
                <th className="py-1 px-2 w-36 border-r border-slate-300">หัวข้อการตรวจสอบ</th>
                <th className="py-1 px-2 border-r border-slate-300">ข้อกำหนดมาตรฐาน 7-Eleven</th>
                <th className="py-1 px-2 w-48 border-r border-slate-300">ค่าตรวจบันทึกจริง</th>
                <th className="py-1 px-2 w-16 text-center">ผลตรวจ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {[
                {
                  no: 1,
                  title: CHECKLIST_STANDARDS[1].title,
                  spec: CHECKLIST_STANDARDS[1].criterion7Eleven,
                  data: check1Note || 'ฝาล็อคสนิท 4 มุม ปิดแน่นหนา ไม่เผยอ',
                  pass: isItem1Pass,
                },
                {
                  no: 2,
                  title: CHECKLIST_STANDARDS[2].title,
                  spec: CHECKLIST_STANDARDS[2].criterion7Eleven,
                  data: `คละ ${colorMix.filter((c) => c.percentage > 0).length} สี (สัดส่วนครบ 100%) บังคับเขียวกรูรามิ+แดง`,
                  pass: isItem2Pass,
                },
                {
                  no: 3,
                  title: CHECKLIST_STANDARDS[3].title,
                  spec: CHECKLIST_STANDARDS[3].criterion7Eleven,
                  data: `MFG+6 วัน (${shelfLifeDays} วัน) · ล้างก่อนรับประทาน: ครบถ้วน`,
                  pass: isItem3Pass,
                },
                {
                  no: 4,
                  title: CHECKLIST_STANDARDS[4].title,
                  spec: CHECKLIST_STANDARDS[4].criterion7Eleven,
                  data: `สุ่ม ${sampleWeights.length} กล่อง เฉลี่ย ${netWeightG.toFixed(1)}g (Min: ${Math.min(...sampleWeights).toFixed(1)}g, Max: ${Math.max(...sampleWeights).toFixed(1)}g)${hasUnderweightSample ? ' [HOLD/REJECT]' : ''}`,
                  pass: isItem4Pass,
                },
                {
                  no: 5,
                  title: CHECKLIST_STANDARDS[5].title,
                  spec: CHECKLIST_STANDARDS[5].criterion7Eleven,
                  data: check5Note || 'ผลสดตึง เงางาม ขั้วเขียวสด ไร้หยดน้ำ ไร้รอยแตก/ช้ำ สิ่งแปลกปลอม 0%',
                  pass: isItem5Pass,
                },
                {
                  no: 6,
                  title: CHECKLIST_STANDARDS[6].title,
                  spec: CHECKLIST_STANDARDS[6].criterion7Eleven,
                  data: `ตรงตาม PO: สั่ง ${orderedPacks} กล่อง / ตรวจจริง ${actualPacks} กล่อง (100%)`,
                  pass: isItem6Pass,
                },
                {
                  no: 7,
                  title: CHECKLIST_STANDARDS[7].title,
                  spec: CHECKLIST_STANDARDS[7].criterion7Eleven,
                  data: `อุณหภูมิห้อง ${roomTempC.toFixed(1)} °C (เกณฑ์ควบคุม 2.0 - 6.0 °C)`,
                  pass: isItem7Pass,
                },
                {
                  no: 8,
                  title: CHECKLIST_STANDARDS[8].title,
                  spec: CHECKLIST_STANDARDS[8].criterion7Eleven,
                  data: check8Note || 'ตะกร้าสะอาด ผ่านการฆ่าเชื้อ แห้งสนิท เรียงซ้อนมั่นคง',
                  pass: isItem8Pass,
                },
              ].map((row) => (
                <tr key={row.no} className="border-b border-slate-200">
                  <td className="py-1 px-2 text-center font-bold border-r border-slate-300">
                    {row.no}
                  </td>
                  <td className="py-1 px-2 font-semibold text-slate-800 border-r border-slate-300">
                    {row.title}
                  </td>
                  <td className="py-1 px-2 text-slate-600 border-r border-slate-300">
                    {row.spec}
                  </td>
                  <td className="py-1 px-2 text-slate-800 border-r border-slate-300 font-mono text-[10px]">
                    {row.data}
                  </td>
                  <td className="py-1 px-2 text-center">
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        row.pass ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {row.pass ? 'PASS' : 'FAIL'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Net Weight Sampling Breakdown */}
        {sampleWeights && sampleWeights.length > 0 && (
          <div className="mb-4 p-2.5 rounded-lg border border-slate-300 bg-slate-50 text-[10px]">
            <div className="font-bold text-slate-800 mb-1 flex items-center justify-between">
              <span>ผลการสุ่มชั่งน้ำหนัก 10–20 กล่อง (Sample Net Weights)</span>
              <span className={hasUnderweightSample ? 'text-red-700 font-bold' : 'text-emerald-700 font-bold'}>
                {hasUnderweightSample ? '⚠️ HOLD สินค้าเพื่อแก้ไข หรือ REJECT' : '✓ ทุกกล่อง ≥ 140.0g ผ่านเกณฑ์'}
              </span>
            </div>
            <div className="grid grid-cols-10 gap-1 font-mono text-center mb-1.5">
              {sampleWeights.map((w, i) => (
                <div
                  key={i}
                  className={`p-1 rounded border ${
                    w < 140.0
                      ? 'bg-red-100 border-red-400 text-red-800 font-bold'
                      : 'bg-white border-slate-200 text-slate-700'
                  }`}
                >
                  <div className="text-[9px] text-slate-400">#{i + 1}</div>
                  <div>{w.toFixed(1)}g</div>
                </div>
              ))}
            </div>
            <div className="flex justify-between text-slate-600 pt-1 border-t border-slate-200">
              <span>จำนวนตัวอย่าง: {sampleWeights.length} กล่อง</span>
              <span>ค่าเฉลี่ย: <strong>{netWeightG.toFixed(1)}g</strong></span>
              <span>ต่ำสุด: {Math.min(...sampleWeights).toFixed(1)}g</span>
              <span>สูงสุด: {Math.max(...sampleWeights).toFixed(1)}g</span>
            </div>
          </div>
        )}

        {/* Signatures */}
        <div className="grid grid-cols-3 gap-4 pt-4 border-t border-slate-300 text-center text-xs">
          <div>
            <div className="border-b border-slate-400 w-36 mx-auto mb-1"></div>
            <p className="font-semibold text-slate-800">{oqcInspector || 'น.ส.รัชดาภรณ์ เรืองอุไร'}</p>
            <p className="text-[10px] text-slate-500">ผู้ตรวจสอบคุณภาพสินค้า (FG Inspector)</p>
          </div>
          <div>
            <div className="border-b border-slate-400 w-36 mx-auto mb-1"></div>
            <p className="font-semibold text-slate-800">{coaCertifier || 'น.ส.พรปวีณ์ ร่วมศรี'}</p>
            <p className="text-[10px] text-slate-500">ผู้รับรองผล COA (QA Specialist)</p>
          </div>
          <div>
            <div className="border-b border-slate-400 w-36 mx-auto mb-1"></div>
            <p className="font-semibold text-slate-800">{releaseApprover || 'นายเด่นชัย ห่วงจิง'}</p>
            <p className="text-[10px] text-slate-500">ผู้อนุมัติปล่อยสินค้า (Release Approver)</p>
          </div>
        </div>
      </div>
    </div>
  );
};
