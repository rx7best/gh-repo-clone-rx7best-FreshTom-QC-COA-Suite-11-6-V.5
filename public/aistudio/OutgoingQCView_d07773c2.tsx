import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  CheckCircle2,
  FileCheck2,
  Lock,
  Plus,
  Scale,
  SlidersHorizontal,
  Thermometer,
  XCircle,
} from 'lucide-react';
import {
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
  const [inspectionDate, setInspectionDate] = useState<string>('2026-11-03');
  const [inspectionTime, setInspectionTime] = useState<string>('14:15');
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
  const [mfgDate, setMfgDate] = useState<string>('2026-11-03');
  const [expDate, setExpDate] = useState<string>('2026-11-09'); // 6 วันนับจากการผลิต

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
      return {
        varietyCode: code,
        lotNumber: candidate?.lotNumber || '',
        percentage: 1,
      };
    });
  };

  const [colorMix, setColorMix] = useState<ColorMixEntry[]>(buildDefaultMix);
  const [presetMode, setPresetMode] = useState<MixPresetMode>('preset_5');
  const [customMixHint, setCustomMixHint] = useState<string>('');

  // 3. ฉลากระบุวันผลิตและวันหมดอายุ (6 วันนับจากการผลิต) + ข้อความบังคับ "ล้างก่อนรับประทาน"
  const [check3ExpiryLabel, setCheck3ExpiryLabel] = useState<boolean>(true);
  const [check3WashLabel, setCheck3WashLabel] = useState<boolean>(true);
  const [check3Note, setCheck3Note] = useState<string>(
    'ฉลากระบุวันผลิต-วันหมดอายุ (+6 วัน) และข้อความบังคับ "ล้างก่อนรับประทาน" (Wash before consumption) ชัดเจน'
  );

  // 4. น้ำหนักสุทธิ (140 กรัม)
  const [netWeightG, setNetWeightG] = useState<number>(142);
  const [check4Note, setCheck4Note] = useState<string>(
    'น้ำหนักสุทธิผ่านเกณฑ์มาตรฐาน ≥ 140 กรัม'
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

  // Inspector & Remarks (Vehicle Release Sign-off removed)
  const [oqcInspector, setOqcInspector] = useState<string>('ศิริพร รัตนวงศ์ (เจ้าหน้าที่ OQC)');
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
  const check3Pass = check3ExpiryLabel && isSixDayShelfLife && check3WashLabel;

  // Check 4: Net weight >= 140g
  const check4NetWeightPass = netWeightG >= 140;

  // Check 6: Order quantity match
  const check6QtyMatch = orderedPacks > 0 && orderedPacks === actualPacks;

  // Check 7: Room Temp 2-6 °C
  const check7RoomTempPass = roomTempC >= 2.0 && roomTempC <= 6.0;

  const passedChecklistCount = [
    check1LidSealing,
    check2MixValid,
    check3Pass,
    check4NetWeightPass,
    check5Physical,
    check6QtyMatch,
    check7RoomTempPass,
    check8CrateClean,
  ].filter(Boolean).length;

  const allEightChecksPass = passedChecklistCount === 8;

  const hasLinkedLabFail = useMemo(() => {
    return activeMixEntries.some((entry) => {
      const lab = labMap.get(entry.lotNumber);
      return !lab || lab.overallLabStatus !== 'PASS';
    });
  }, [activeMixEntries, labMap]);

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
    const cleanDate = inspectionDate.replace(/-/g, '') || '20261103';
    const yyyymm = cleanDate.slice(0, 6) || '202611';
    const prefix = `COA-MCT-${yyyymm}-`;
    let maxSeq = 0;
    for (const r of outgoingRecords) {
      if (r.coaNumber.startsWith(prefix)) {
        const n = parseInt(r.coaNumber.slice(prefix.length), 10);
        if (!Number.isNaN(n) && n > maxSeq) maxSeq = n;
      }
    }
    return `${prefix}${String(maxSeq + 1).padStart(4, '0')}`;
  }, [inspectionDate, outgoingRecords]);

  const handleMfgDateChange = (newMfg: string) => {
    setMfgDate(newMfg);
    setExpDate(addDaysToIsoDate(newMfg, 6));
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
        if (isSelected && !item.lotNumber) {
          const fallbackLot =
            lots.find(
              (l) => l.varietyCode === item.varietyCode && l.disposition !== 'REJECT'
            ) || lots.find((l) => l.varietyCode === item.varietyCode);
          return {
            ...item,
            percentage: 1,
            lotNumber: fallbackLot?.lotNumber || '',
          };
        }
        return { ...item, percentage: isSelected ? 1 : 0 };
      })
    );
  };

  const handleActivateCustomPreset = () => {
    setPresetMode('custom');
    setCustomMixHint('');
  };

  const handleToggleCustomVariety = (code: VarietyCode) => {
    if (code === 'SL' || code === 'GR') {
      setCustomMixHint(
        'บังคับต้องมีสีเขียว (กรูรามิ) คู่กับสีแดง (โซลาริโน่) เสมอตามเกณฑ์คละสี'
      );
      return;
    }

    setCustomMixHint('');
    setColorMix((prev) => {
      const currentEntry = prev.find((c) => c.varietyCode === code);
      const isCurrentlySelected = (Number(currentEntry?.percentage) || 0) > 0;
      const willBeSelected = !isCurrentlySelected;

      return prev.map((item) => {
        if (item.varietyCode !== code) return item;
        if (willBeSelected && !item.lotNumber) {
          const fallbackLot =
            lots.find(
              (l) => l.varietyCode === item.varietyCode && l.disposition !== 'REJECT'
            ) || lots.find((l) => l.varietyCode === item.varietyCode);
          return {
            ...item,
            percentage: 1,
            lotNumber: fallbackLot?.lotNumber || '',
          };
        }
        return {
          ...item,
          percentage: willBeSelected ? 1 : 0,
        };
      });
    });
    setPresetMode('custom');
  };

  const handleLoadRecord = (rec: OutgoingRecord) => {
    setEditingId(rec.id);
    setInspectionDate(rec.inspectionDate);
    setInspectionTime(rec.inspectionTime);
    setCustomerName(rec.customerName);
    setDistributionCenter(rec.distributionCenter || 'DC บางบัวทอง (BTH-DC)');
    setPoNumber(rec.poNumber);
    setProductName(rec.productName);
    setMfgDate(rec.mfgDate);
    setExpDate(rec.expDate);
    setCheck1LidSealing(rec.check1LidSealing);
    setCheck1Note(rec.check1Note);
    const clonedMix = rec.colorMix.map((c) => ({ ...c }));
    setColorMix(clonedMix);
    setPresetMode(detectMixPresetMode(clonedMix));
    setCustomMixHint('');
    setCheck3ExpiryLabel(rec.check3ExpiryLabel);
    setCheck3WashLabel(rec.check3WashLabel ?? true);
    setCheck3Note(rec.check3Note);
    setNetWeightG(rec.netWeightG);
    setCheck4Note(rec.check4Note);
    setCheck5Physical(rec.check5Physical);
    setCheck5Note(rec.check5Note);
    setOrderedPacks(rec.orderedPacks);
    setActualPacks(rec.actualPacks);
    setCrateQty(rec.crateQty);
    setRoomTempC(rec.roomTempC);
    setCheck8CrateClean(rec.check8CrateClean);
    setCheck8Note(rec.check8Note);
    setOqcInspector(rec.oqcInspector);
    setOqcRemarks(rec.oqcRemarks);
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
    setCustomerName('บริษัท ซีพี ออลล์ จำกัด (มหาชน)');
    setDistributionCenter('DC บางบัวทอง (BTH-DC)');
    setPoNumber('');
    setMfgDate('2026-11-03');
    setExpDate('2026-11-09');
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
    setCheck8CrateClean(true);
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
        'กรุณาระบุชื่อเจ้าหน้าที่ผู้ตรวจสอบ OQC',
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
      inspectionDate,
      inspectionTime,
      customerName: customerName.trim(),
      distributionCenter: distributionCenter.trim(),
      poNumber: poNumber.trim(),
      productName: productName.trim(),
      mfgDate,
      expDate,
      check1LidSealing,
      check1Note: check1Note.trim(),
      colorMix: colorMix.map((c) => ({
        ...c,
        percentage: Number(c.percentage) || 0,
        lotNumber: Number(c.percentage) > 0 ? c.lotNumber : '',
      })),
      check2MixValid,
      check3ExpiryLabel: check3ExpiryLabel && isSixDayShelfLife,
      check3WashLabel,
      check3Note: check3Note.trim(),
      netWeightG: Number(netWeightG) || 0,
      check4NetWeightPass,
      check4Note: check4Note.trim(),
      check5Physical,
      check5Note: check5Note.trim(),
      orderedPacks: Number(orderedPacks) || 0,
      actualPacks: Number(actualPacks) || 0,
      crateQty: Number(crateQty) || 0,
      check6QtyMatch,
      roomTempC: Number(roomTempC) || 0,
      check7RoomTempPass,
      check8CrateClean,
      check8Note: check8Note.trim(),
      oqcInspector: oqcInspector.trim(),
      oqcStatus,
      oqcRemarks: oqcRemarks.trim(),
    };

    onSaveOutgoing(record);
    onNotify(
      'บันทึกผลตรวจปล่อยสินค้า (OQC) เรียบร้อยแล้ว',
      `เอกสาร ${record.oqcNumber} (ใบรับรอง ${record.coaNumber}) บันทึกสำเร็จ`,
      'success'
    );
    resetForm();
  };

  return (
    <div className="space-y-8">
      <form
        onSubmit={handleSubmit}
        className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-200"
      >
        {/* Header & Order Info */}
        <div className="p-6 space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                {editingId
                  ? 'แก้ไขการควบคุมคุณภาพก่อนจัดส่ง (OQC Inspection)'
                  : 'การควบคุมคุณภาพก่อนจัดส่ง (Outgoing Quality Control — 8 เช็คลิสต์สำคัญ)'}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                ตรวจสอบความพร้อมสินค้าสำเร็จรูปครบ 8 หัวข้อมาตรฐาน (ผสมสี 3–5 สายพันธุ์ · อายุสินค้า 6 วัน · น้ำหนักสุทธิ 140 กรัม · อุณหภูมิ 2–6 °C)
              </p>
            </div>
            <div className="text-xs font-medium tabular-nums text-slate-600 shrink-0">
              เลขที่เอกสาร:{' '}
              <strong className="font-semibold text-slate-900">
                {editingId
                  ? outgoingRecords.find((r) => r.id === editingId)?.oqcNumber
                  : nextOqcNumber}
              </strong>{' '}
              · ผ่านเกณฑ์{' '}
              <strong className={allEightChecksPass ? 'text-emerald-700' : 'text-red-700'}>
                {passedChecklistCount}/8 ข้อ
              </strong>
            </div>
          </div>

          {hasLinkedLabFail && (
            <div
              role="alert"
              className="p-3.5 rounded-lg bg-sky-50 border border-sky-300 text-sky-950 text-xs font-medium flex items-center gap-2.5"
            >
              <AlertCircle className="w-4 h-4 text-sky-600 shrink-0" />
              <span>
                แจ้งเตือนสำคัญ: มีล็อตมะเขือเทศที่เลือกในสูตรผสมสีมีผลตรวจ QC LAB เป็น FAIL — ระบบจะระงับตรายางดิจิทัล QA PASSED บนใบรับรอง COA อัตโนมัติ
              </span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-3">
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
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
            <div className="md:col-span-3">
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
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
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
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
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                วันที่ตรวจปล่อย
              </label>
              <input
                type="date"
                value={inspectionDate}
                onChange={(e) => setInspectionDate(e.target.value)}
                className="w-full px-3 py-2 text-sm tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                เวลาตรวจ
              </label>
              <input
                type="time"
                value={inspectionTime}
                onChange={(e) => setInspectionTime(e.target.value)}
                className="w-full px-3 py-2 text-sm tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-6">
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                รายการสินค้าสำเร็จรูป (Finished Product Specification)
              </label>
              <input
                type="text"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                วันที่ผลิต (MFG)
              </label>
              <input
                type="date"
                value={mfgDate}
                onChange={(e) => handleMfgDateChange(e.target.value)}
                className="w-full px-3 py-2 text-sm tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
            <div className="md:col-span-3">
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-slate-700">
                  วันหมดอายุ (EXP +6 วัน)
                </label>
                {!isSixDayShelfLife && (
                  <button
                    type="button"
                    onClick={() => setExpDate(addDaysToIsoDate(mfgDate, 6))}
                    className="text-[11px] font-medium text-slate-700 underline"
                  >
                    ตั้งค่า +6 วัน
                  </button>
                )}
              </div>
              <input
                type="date"
                value={expDate}
                onChange={(e) => setExpDate(e.target.value)}
                className={`w-full px-3 py-2 text-sm tabular-nums bg-white border rounded-lg focus:outline-none focus:ring-2 ${
                  isSixDayShelfLife
                    ? 'border-slate-300 focus:ring-slate-900'
                    : 'border-red-400 text-red-700 focus:ring-red-600'
                }`}
              />
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
                onClick={() => applyMixPreset(PRESET_5_COLORS, 'preset_5')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap ${
                  presetMode === 'preset_5'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                สูตรครบ 5 สี
              </button>
              <button
                type="button"
                onClick={() => applyMixPreset(PRESET_4_GREEN_MIX, 'preset_4')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap ${
                  presetMode === 'preset_4'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                สูตร 4 สีแซมเขียว
              </button>
              <button
                type="button"
                onClick={handleActivateCustomPreset}
                className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors inline-flex items-center gap-1.5 whitespace-nowrap ${
                  presetMode === 'custom'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>สูตรเลือกสีเอง (ไม่น้อยกว่า 3 สี)</span>
              </button>
              <button
                type="button"
                onClick={() => applyMixPreset(PRESET_3_RYG, 'preset_3')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap ${
                  presetMode === 'preset_3'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                สูตร 3 สี แดง–เหลือง–เขียว
              </button>
            </div>
          </div>

          {/* Interactive Custom Mix Builder (Shown when "สูตรเลือกสีเอง (ไม่น้อยกว่า 3 สี)" is active) */}
          {presetMode === 'custom' && (
            <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2.5">
              <div className="text-xs font-semibold text-slate-800">
                กำหนดสูตรเลือกสีเอง (คละ 3–5 สี · ล็อกสีแดงคู่สีเขียวอัตโนมัติ ป้องกันเหลือง-แดง-ส้มไร้สีเขียว)
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {VARIETY_ORDER.map((code) => {
                  const v = TOMATO_VARIETIES[code];
                  const entry = colorMix.find((c) => c.varietyCode === code);
                  const isSelected = (Number(entry?.percentage) || 0) > 0;
                  const isLockedMandatory = code === 'SL' || code === 'GR';

                  return (
                    <button
                      key={code}
                      type="button"
                      onClick={() => handleToggleCustomVariety(code)}
                      className={`px-3 py-1.5 rounded-md border text-xs font-medium inline-flex items-center gap-2 transition-colors ${
                        isSelected
                          ? 'bg-white border-slate-900 text-slate-900 shadow-2xs'
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
                      {isLockedMandatory ? (
                        <span className="inline-flex items-center gap-0.5 text-[11px] text-emerald-700 font-semibold">
                          <Lock className="w-3 h-3" /> บังคับ
                        </span>
                      ) : isSelected ? (
                        <Check className="w-3.5 h-3.5 text-emerald-700" />
                      ) : null}
                    </button>
                  );
                })}
              </div>

              {customMixHint && (
                <div className="text-[11px] font-medium text-amber-800">
                  * {customMixHint}
                </div>
              )}
            </div>
          )}

          {mixValidation.isWarmTrioWithoutGreen && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-300 text-red-900 text-xs font-medium flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-700 shrink-0" />
              <span>
                ผิดเงื่อนไขการคละสี: ห้ามให้สีเหลือง (เบลนนี่) + สีแดง (โซลาริโน่) + สีส้ม (ฟลาวิโอ้) อยู่ด้วยกันโดยไม่มีสีเขียว (กรูรามิ) มาแซม
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

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
            {colorMix.map((entry, idx) => {
              const v = TOMATO_VARIETIES[entry.varietyCode];
              const availableLots = lots.filter((l) => l.varietyCode === entry.varietyCode);
              const isUsed = (Number(entry.percentage) || 0) > 0;
              const isMandatoryVariety = entry.varietyCode === 'GR' || entry.varietyCode === 'SL';
              const selectedLab = isUsed ? labMap.get(entry.lotNumber) : undefined;

              return (
                <div
                  key={entry.varietyCode}
                  className={`p-3.5 rounded-lg border space-y-2.5 transition-colors ${
                    isMandatoryVariety && !isUsed
                      ? 'border-red-300 bg-red-50/30'
                      : isUsed
                      ? 'border-slate-300 bg-slate-50/50'
                      : 'border-slate-200 bg-white opacity-65'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-xs shrink-0"
                        style={{ backgroundColor: v.swatchHex }}
                      />
                      <span className="text-xs font-semibold text-slate-900">{v.nameTh}</span>
                    </div>
                    <span className="text-[11px] text-slate-500">
                      {v.colorLabelTh}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-1">
                    {isMandatoryVariety ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        <Lock className="w-3 h-3 text-emerald-700" />
                        คละในแพ็ก (บังคับ)
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleToggleCustomVariety(entry.varietyCode)}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded border transition-colors ${
                          isUsed
                            ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
                            : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100 hover:text-slate-800'
                        }`}
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
                    )}
                  </div>

                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">
                      ล็อตที่ใช้บรรจุ {isUsed ? '*' : '(ไม่ได้ใช้)'}
                    </label>
                    <select
                      value={entry.lotNumber}
                      disabled={!isUsed}
                      onChange={(e) => {
                        const val = e.target.value;
                        setColorMix((prev) =>
                          prev.map((c, i) => (i === idx ? { ...c, lotNumber: val } : c))
                        );
                      }}
                      className="w-full px-2 py-1.5 text-xs font-medium tabular-nums bg-white disabled:bg-slate-100 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-slate-900"
                    >
                      <option value="">{isUsed ? '-- เลือกล็อต --' : '-- ไม่ได้ใช้คละในแพ็ก --'}</option>
                      {availableLots.map((lot) => {
                        const lRec = labMap.get(lot.lotNumber);
                        const labTxt = !lRec
                          ? 'รอผลตรวจ'
                          : lRec.overallLabStatus === 'PENDING'
                          ? 'รอผลตรวจ'
                          : lRec.overallLabStatus;
                        return (
                          <option key={lot.id} value={lot.lotNumber}>
                            {lot.lotNumber} [{labTxt}]
                          </option>
                        );
                      })}
                    </select>
                    {isUsed && entry.lotNumber && (
                      <div className="mt-1.5 text-[11px] tabular-nums space-y-0.5">
                        <div className="text-slate-600">
                          Lab รวม:{' '}
                          {!selectedLab || selectedLab.overallLabStatus === 'PENDING' ? (
                            <span className="text-amber-700 font-medium">
                              รอผลการตรวจสอบ
                            </span>
                          ) : selectedLab.overallLabStatus === 'PASS' ? (
                            <span className="text-emerald-700 font-semibold">
                              PASS (
                              {selectedLab.brixValue !== null
                                ? `${selectedLab.brixValue.toFixed(1)} %Brix`
                                : '-'}
                              )
                            </span>
                          ) : (
                            <span className="text-red-700 font-bold">
                              FAIL (
                              {selectedLab.brixValue !== null
                                ? `${selectedLab.brixValue.toFixed(1)} %Brix`
                                : 'ไม่ผ่าน'}
                              )
                            </span>
                          )}
                        </div>
                        <div className="font-sans text-slate-600">
                          สารตกค้างรวม:{' '}
                          {!selectedLab || selectedLab.pesticideStatus === 'PENDING' ? (
                            <span className="text-amber-700 font-medium">รอผลตรวจ</span>
                          ) : selectedLab.pesticideStatus === 'PASS' ? (
                            <span className="text-emerald-700 font-semibold">
                              ผ่านทั้ง 2 หมวด
                            </span>
                          ) : (
                            <span className="text-red-700 font-bold">ไม่ผ่าน (FAIL)</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
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
                  <CheckCircle2 className="w-3.5 h-3.5" /> ผ่านเกณฑ์ ({mixValidation.activeCount} สี · มีสีเขียวแซมคู่แดง)
                </span>
              ) : (
                <span className="text-red-700 inline-flex items-center gap-1">
                  <XCircle className="w-3.5 h-3.5" /> {mixValidation.reasons[0] || 'การผสมสีไม่ผ่านเกณฑ์'}
                </span>
              )}
            </span>
          </div>
        </div>

        {/* Remaining Checklists (1, 3, 4, 5, 6, 7, 8) */}
        <div className="p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                เช็คลิสต์ควบคุมคุณภาพก่อนจัดส่ง (ข้อที่ 1, 3, 4, 5, 6, 7 และ 8)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                ตรวจสอบความสมบูรณ์ของบรรจุภัณฑ์ ฉลากสินค้า น้ำหนักสุทธิ ลักษณะกายภาพ ยอดบรรจุ อุณหภูมิห้องตรวจ และความสะอาดตะกร้าขนส่ง
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <span className="text-xs font-medium tabular-nums text-slate-600">
                ผ่านรายการตรวจ:{' '}
                <strong
                  className={
                    [
                      check1LidSealing,
                      check3Pass,
                      check4NetWeightPass,
                      check5Physical,
                      check6QtyMatch,
                      check7RoomTempPass,
                      check8CrateClean,
                    ].every(Boolean)
                      ? 'text-emerald-700'
                      : 'text-red-700'
                  }
                >
                  {
                    [
                      check1LidSealing,
                      check3Pass,
                      check4NetWeightPass,
                      check5Physical,
                      check6QtyMatch,
                      check7RoomTempPass,
                      check8CrateClean,
                    ].filter(Boolean).length
                  }
                  /7 ข้อ
                </strong>
              </span>
              {(!check1LidSealing ||
                !check3ExpiryLabel ||
                !check3WashLabel ||
                !check5Physical ||
                !check8CrateClean) && (
                <button
                  type="button"
                  onClick={() => {
                    setCheck1LidSealing(true);
                    setCheck3ExpiryLabel(true);
                    setCheck3WashLabel(true);
                    setCheck5Physical(true);
                    setCheck8CrateClean(true);
                  }}
                  className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  ยืนยันผ่านรายการตรวจพินิจ
                </button>
              )}
            </div>
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-200 bg-white">
            {/* Desktop Table Column Header */}
            <div className="hidden lg:grid lg:grid-cols-12 gap-4 px-5 py-2.5 bg-slate-50 text-xs font-semibold text-slate-600">
              <div className="lg:col-span-4">หัวข้อการตรวจสอบและเกณฑ์มาตรฐาน</div>
              <div className="lg:col-span-6">การยืนยันผล / ค่าที่ตรวจวัดและหมายเหตุ</div>
              <div className="lg:col-span-2 text-right">สถานะผลตรวจ</div>
            </div>

            {/* Check 1: การปิดผนึกฝากล่อง */}
            <div
              className={`grid grid-cols-1 lg:grid-cols-12 gap-3.5 lg:gap-4 p-4 sm:p-5 items-start lg:items-center transition-colors ${
                check1LidSealing ? 'bg-white hover:bg-slate-50/40' : 'bg-red-50/35'
              }`}
            >
              <div className="lg:col-span-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-semibold text-sm text-slate-900">
                    <span className="tabular-nums text-slate-400 mr-1.5">1.</span>
                    การปิดผนึกฝากล่อง
                  </div>
                  <span
                    className={`lg:hidden inline-flex items-center gap-1 text-xs font-semibold shrink-0 ${
                      check1LidSealing ? 'text-emerald-700' : 'text-red-700'
                    }`}
                  >
                    {check1LidSealing ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" /> PASS
                      </>
                    ) : (
                      <>
                        <XCircle className="w-3.5 h-3.5" /> FAIL
                      </>
                    )}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  เกณฑ์: ฝากล่อง PET ปิดสนิทครบทุกมุม ไม่เผยอหรือฉีกขาด
                </p>
              </div>

              <div className="lg:col-span-6 flex flex-col sm:flex-row sm:items-center gap-2.5">
                <div className="inline-flex p-0.5 bg-slate-100 rounded-lg border border-slate-200/80 shrink-0 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setCheck1LidSealing(true)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      check1LidSealing
                        ? 'bg-white text-emerald-700 shadow-2xs font-semibold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    ปิดสนิท (ผ่าน)
                  </button>
                  <button
                    type="button"
                    onClick={() => setCheck1LidSealing(false)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      !check1LidSealing
                        ? 'bg-red-600 text-white shadow-2xs font-semibold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    ไม่ผ่าน
                  </button>
                </div>
                <input
                  type="text"
                  value={check1Note}
                  onChange={(e) => setCheck1Note(e.target.value)}
                  placeholder="บันทึกหมายเหตุการปิดผนึกฝากล่อง..."
                  className="flex-1 min-w-0 w-full px-3 py-2 text-xs bg-slate-50/70 focus:bg-white border border-slate-200 focus:border-slate-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10 transition-colors"
                />
              </div>

              <div className="hidden lg:flex lg:col-span-2 flex-col items-end text-right">
                <span
                  className={`inline-flex items-center gap-1 text-xs font-semibold ${
                    check1LidSealing ? 'text-emerald-700' : 'text-red-700'
                  }`}
                >
                  {check1LidSealing ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" /> PASS
                    </>
                  ) : (
                    <>
                      <XCircle className="w-3.5 h-3.5" /> FAIL
                    </>
                  )}
                </span>
                <span className="text-[11px] text-slate-500 mt-0.5">
                  {check1LidSealing ? 'ปิดสนิทครบทุกมุม' : 'ฝาปิดไม่สมบูรณ์'}
                </span>
              </div>
            </div>

            {/* Check 3: ฉลากระบุวันผลิต-วันหมดอายุ (+6 วัน) และข้อความบังคับ "ล้างก่อนรับประทาน" */}
            <div
              className={`grid grid-cols-1 lg:grid-cols-12 gap-3.5 lg:gap-4 p-4 sm:p-5 items-start transition-colors ${
                check3Pass ? 'bg-white hover:bg-slate-50/40' : 'bg-red-50/35'
              }`}
            >
              <div className="lg:col-span-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-semibold text-sm text-slate-900">
                    <span className="tabular-nums text-slate-400 mr-1.5">3.</span>
                    ฉลากระบุวันผลิต–วันหมดอายุ และข้อความบังคับบนฉลาก
                  </div>
                  <span
                    className={`lg:hidden inline-flex items-center gap-1 text-xs font-semibold whitespace-nowrap shrink-0 ${
                      check3Pass ? 'text-emerald-700' : 'text-red-700'
                    }`}
                  >
                    {check3Pass ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" /> PASS
                      </>
                    ) : (
                      <>
                        <XCircle className="w-3.5 h-3.5" /> FAIL
                      </>
                    )}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  เกณฑ์: อายุสินค้า 6 วันนับจากการผลิต และระบุ “ล้างก่อนรับประทาน” ชัดเจน
                </p>
              </div>

              <div className="lg:col-span-6 space-y-2.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setCheck3ExpiryLabel(!check3ExpiryLabel)}
                    className={`p-2.5 rounded-lg border text-left flex items-start gap-2.5 transition-colors ${
                      check3ExpiryLabel && isSixDayShelfLife
                        ? 'bg-slate-50/70 border-slate-300 text-slate-900 hover:bg-slate-100/70'
                        : 'bg-white border-red-300 text-red-900 hover:bg-red-50/50'
                    }`}
                  >
                    <span
                      className={`mt-0.5 w-4 h-4 rounded flex items-center justify-center shrink-0 border transition-colors ${
                        check3ExpiryLabel
                          ? 'bg-slate-900 border-slate-900 text-white'
                          : 'bg-white border-slate-300 text-transparent'
                      }`}
                    >
                      <Check className="w-3 h-3" />
                    </span>
                    <span className="min-w-0 text-xs">
                      <span className="block font-semibold">
                        ระบุวันผลิต–วันหมดอายุ (+6 วัน)
                      </span>
                      <span className="block text-[11px] text-slate-500 tabular-nums mt-0.5">
                        MFG {formatThaiDate(mfgDate)} · EXP {formatThaiDate(expDate)} (
                        {shelfLifeDays ?? '-'} วัน)
                      </span>
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCheck3WashLabel(!check3WashLabel)}
                    className={`p-2.5 rounded-lg border text-left flex items-start gap-2.5 transition-colors ${
                      check3WashLabel
                        ? 'bg-slate-50/70 border-slate-300 text-slate-900 hover:bg-slate-100/70'
                        : 'bg-white border-red-300 text-red-900 hover:bg-red-50/50'
                    }`}
                  >
                    <span
                      className={`mt-0.5 w-4 h-4 rounded flex items-center justify-center shrink-0 border transition-colors ${
                        check3WashLabel
                          ? 'bg-slate-900 border-slate-900 text-white'
                          : 'bg-white border-slate-300 text-transparent'
                      }`}
                    >
                      <Check className="w-3 h-3" />
                    </span>
                    <span className="min-w-0 text-xs">
                      <span className="block font-semibold">
                        ระบุ “ล้างก่อนรับประทาน” ชัดเจน
                      </span>
                      <span className="block text-[11px] text-slate-500 mt-0.5">
                        Wash before consumption บนฉลากทุกแพ็ค
                      </span>
                    </span>
                  </button>
                </div>

                <input
                  type="text"
                  value={check3Note}
                  onChange={(e) => setCheck3Note(e.target.value)}
                  placeholder="บันทึกหมายเหตุการตรวจฉลากสินค้า..."
                  className="w-full px-3 py-2 text-xs bg-slate-50/70 focus:bg-white border border-slate-200 focus:border-slate-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10 transition-colors"
                />
              </div>

              <div className="hidden lg:flex lg:col-span-2 flex-col items-end text-right">
                <span
                  className={`inline-flex items-center gap-1 text-xs font-semibold whitespace-nowrap ${
                    check3Pass ? 'text-emerald-700' : 'text-red-700'
                  }`}
                >
                  {check3Pass ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" /> PASS
                    </>
                  ) : (
                    <>
                      <XCircle className="w-3.5 h-3.5" /> FAIL
                    </>
                  )}
                </span>
                <span className="text-[11px] text-slate-500 tabular-nums mt-0.5">
                  {check3Pass
                    ? '+6 วัน · ครบถ้วน'
                    : !isSixDayShelfLife
                    ? `ห่าง ${shelfLifeDays ?? '-'} วัน`
                    : !check3WashLabel
                    ? 'ขาดข้อความบังคับ'
                    : 'ยังไม่ยืนยันฉลาก'}
                </span>
              </div>
            </div>

            {/* Check 4: น้ำหนักสุทธิ (140 กรัม) */}
            <div
              className={`grid grid-cols-1 lg:grid-cols-12 gap-3.5 lg:gap-4 p-4 sm:p-5 items-start lg:items-center transition-colors ${
                check4NetWeightPass ? 'bg-white hover:bg-slate-50/40' : 'bg-red-50/35'
              }`}
            >
              <div className="lg:col-span-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-semibold text-sm text-slate-900">
                    <span className="tabular-nums text-slate-400 mr-1.5">4.</span>
                    น้ำหนักสุทธิ (140 กรัม)
                  </div>
                  <span
                    className={`lg:hidden inline-flex items-center gap-1 text-xs font-semibold tabular-nums shrink-0 ${
                      check4NetWeightPass ? 'text-emerald-700' : 'text-red-700'
                    }`}
                  >
                    {check4NetWeightPass ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" /> PASS (≥ 140 กรัม)
                      </>
                    ) : (
                      <>
                        <XCircle className="w-3.5 h-3.5" /> FAIL (&lt; 140 กรัม)
                      </>
                    )}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  เกณฑ์มาตรฐาน: น้ำหนักสุทธิไม่น้อยกว่า 140 กรัมต่อแพ็ค
                </p>
              </div>

              <div className="lg:col-span-6 flex flex-col sm:flex-row sm:items-center gap-2.5">
                <div className="relative w-full sm:w-44 shrink-0">
                  <Scale className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="number"
                    min={0}
                    step="0.5"
                    value={netWeightG}
                    onChange={(e) => setNetWeightG(parseFloat(e.target.value) || 0)}
                    className={`w-full pl-8 pr-12 py-2 text-sm font-semibold tabular-nums bg-white border rounded-lg focus:outline-none focus:ring-2 ${
                      check4NetWeightPass
                        ? 'border-slate-300 focus:ring-slate-900'
                        : 'border-red-400 text-red-700 focus:ring-red-600'
                    }`}
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-slate-500">
                    กรัม
                  </span>
                </div>
                <input
                  type="text"
                  value={check4Note}
                  onChange={(e) => setCheck4Note(e.target.value)}
                  placeholder="บันทึกผลการชั่งน้ำหนักสุทธิ..."
                  className="flex-1 min-w-0 w-full px-3 py-2 text-xs bg-slate-50/70 focus:bg-white border border-slate-200 focus:border-slate-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10 transition-colors"
                />
              </div>

              <div className="hidden lg:flex lg:col-span-2 flex-col items-end text-right">
                <span
                  className={`inline-flex items-center gap-1 text-xs font-semibold ${
                    check4NetWeightPass ? 'text-emerald-700' : 'text-red-700'
                  }`}
                >
                  {check4NetWeightPass ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" /> PASS
                    </>
                  ) : (
                    <>
                      <XCircle className="w-3.5 h-3.5" /> FAIL
                    </>
                  )}
                </span>
                <span className="text-[11px] text-slate-500 tabular-nums mt-0.5">
                  {check4NetWeightPass ? '≥ 140 กรัม' : '< 140 กรัม'}
                </span>
              </div>
            </div>

            {/* Check 5: ลักษณะทางกายภาพของสินค้า */}
            <div
              className={`grid grid-cols-1 lg:grid-cols-12 gap-3.5 lg:gap-4 p-4 sm:p-5 items-start lg:items-center transition-colors ${
                check5Physical ? 'bg-white hover:bg-slate-50/40' : 'bg-red-50/35'
              }`}
            >
              <div className="lg:col-span-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-semibold text-sm text-slate-900">
                    <span className="tabular-nums text-slate-400 mr-1.5">5.</span>
                    ลักษณะทางกายภาพของสินค้า
                  </div>
                  <span
                    className={`lg:hidden inline-flex items-center gap-1 text-xs font-semibold shrink-0 ${
                      check5Physical ? 'text-emerald-700' : 'text-red-700'
                    }`}
                  >
                    {check5Physical ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" /> PASS
                      </>
                    ) : (
                      <>
                        <XCircle className="w-3.5 h-3.5" /> FAIL
                      </>
                    )}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  เกณฑ์: ผลสดตึงเงางาม ไม่มีหยดน้ำเกาะภายในกล่อง ไม่พบผลช้ำหรือเชื้อรา
                </p>
              </div>

              <div className="lg:col-span-6 flex flex-col sm:flex-row sm:items-center gap-2.5">
                <div className="inline-flex p-0.5 bg-slate-100 rounded-lg border border-slate-200/80 shrink-0 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setCheck5Physical(true)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      check5Physical
                        ? 'bg-white text-emerald-700 shadow-2xs font-semibold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    สดตึงปกติ (ผ่าน)
                  </button>
                  <button
                    type="button"
                    onClick={() => setCheck5Physical(false)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      !check5Physical
                        ? 'bg-red-600 text-white shadow-2xs font-semibold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    ไม่ผ่าน
                  </button>
                </div>
                <input
                  type="text"
                  value={check5Note}
                  onChange={(e) => setCheck5Note(e.target.value)}
                  placeholder="บันทึกผลการตรวจลักษณะทางกายภาพ..."
                  className="flex-1 min-w-0 w-full px-3 py-2 text-xs bg-slate-50/70 focus:bg-white border border-slate-200 focus:border-slate-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10 transition-colors"
                />
              </div>

              <div className="hidden lg:flex lg:col-span-2 flex-col items-end text-right">
                <span
                  className={`inline-flex items-center gap-1 text-xs font-semibold ${
                    check5Physical ? 'text-emerald-700' : 'text-red-700'
                  }`}
                >
                  {check5Physical ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" /> PASS
                    </>
                  ) : (
                    <>
                      <XCircle className="w-3.5 h-3.5" /> FAIL
                    </>
                  )}
                </span>
                <span className="text-[11px] text-slate-500 mt-0.5">
                  {check5Physical ? 'ผลสดตึง ไร้ตำหนิ' : 'พบตำหนิกายภาพ'}
                </span>
              </div>
            </div>

            {/* Check 6: จำนวนสินค้าตรงตามใบสั่งซื้อ */}
            <div
              className={`grid grid-cols-1 lg:grid-cols-12 gap-3.5 lg:gap-4 p-4 sm:p-5 items-start lg:items-center transition-colors ${
                check6QtyMatch ? 'bg-white hover:bg-slate-50/40' : 'bg-red-50/35'
              }`}
            >
              <div className="lg:col-span-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-semibold text-sm text-slate-900">
                    <span className="tabular-nums text-slate-400 mr-1.5">6.</span>
                    จำนวนสินค้าตรงตามใบสั่งซื้อ
                  </div>
                  <span
                    className={`lg:hidden inline-flex items-center gap-1 text-xs font-semibold shrink-0 ${
                      check6QtyMatch ? 'text-emerald-700' : 'text-red-700'
                    }`}
                  >
                    {check6QtyMatch ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" /> PASS
                      </>
                    ) : (
                      <>
                        <XCircle className="w-3.5 h-3.5" /> FAIL
                      </>
                    )}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  เกณฑ์: ยอดบรรจุจริงตรงตามยอดสั่งซื้อ PO และระบุจำนวนตะกร้าขนส่ง
                </p>
              </div>

              <div className="lg:col-span-6 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    ยอดสั่งซื้อ
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min={1}
                      value={orderedPacks}
                      onChange={(e) => setOrderedPacks(parseInt(e.target.value, 10) || 0)}
                      className="w-full pl-3 pr-11 py-1.5 text-xs font-semibold tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-[11px] text-slate-400">
                      แพ็ค
                    </span>
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    ยอดบรรจุจริง
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min={0}
                      value={actualPacks}
                      onChange={(e) => setActualPacks(parseInt(e.target.value, 10) || 0)}
                      className={`w-full pl-3 pr-11 py-1.5 text-xs font-semibold tabular-nums bg-white border rounded-lg focus:outline-none focus:ring-2 ${
                        check6QtyMatch
                          ? 'border-slate-300 focus:ring-slate-900'
                          : 'border-red-400 text-red-700 focus:ring-red-600'
                      }`}
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-[11px] text-slate-400">
                      แพ็ค
                    </span>
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    จำนวนตะกร้า
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min={1}
                      value={crateQty}
                      onChange={(e) => setCrateQty(parseInt(e.target.value, 10) || 0)}
                      className="w-full pl-3 pr-9 py-1.5 text-xs font-semibold tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-[11px] text-slate-400">
                      ใบ
                    </span>
                  </div>
                </div>
              </div>

              <div className="hidden lg:flex lg:col-span-2 flex-col items-end text-right">
                <span
                  className={`inline-flex items-center gap-1 text-xs font-semibold ${
                    check6QtyMatch ? 'text-emerald-700' : 'text-red-700'
                  }`}
                >
                  {check6QtyMatch ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" /> PASS
                    </>
                  ) : (
                    <>
                      <XCircle className="w-3.5 h-3.5" /> FAIL
                    </>
                  )}
                </span>
                <span className="text-[11px] text-slate-500 tabular-nums mt-0.5">
                  {check6QtyMatch
                    ? 'ตรงใบสั่งซื้อ'
                    : `ต่าง ${actualPacks - orderedPacks > 0 ? '+' : ''}${
                        actualPacks - orderedPacks
                      } แพ็ค`}
                </span>
              </div>
            </div>

            {/* Check 7: อุณหภูมิห้องขณะตรวจตามเกณฑ์ 2-6 °C */}
            <div
              className={`grid grid-cols-1 lg:grid-cols-12 gap-3.5 lg:gap-4 p-4 sm:p-5 items-start lg:items-center transition-colors ${
                check7RoomTempPass ? 'bg-white hover:bg-slate-50/40' : 'bg-red-50/35'
              }`}
            >
              <div className="lg:col-span-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-semibold text-sm text-slate-900">
                    <span className="tabular-nums text-slate-400 mr-1.5">7.</span>
                    อุณหภูมิห้องขณะตรวจตามเกณฑ์ 2–6 °C
                  </div>
                  <span
                    className={`lg:hidden inline-flex items-center gap-1 text-xs font-semibold tabular-nums shrink-0 ${
                      check7RoomTempPass ? 'text-emerald-700' : 'text-red-700'
                    }`}
                  >
                    {check7RoomTempPass ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" /> PASS (2–6 °C)
                      </>
                    ) : (
                      <>
                        <XCircle className="w-3.5 h-3.5" /> FAIL
                      </>
                    )}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  เกณฑ์ควบคุมความเย็น: 2.0 °C ถึง 6.0 °C ตลอดการตรวจปล่อยสินค้า
                </p>
              </div>

              <div className="lg:col-span-6 flex flex-col sm:flex-row sm:items-center gap-2.5">
                <div className="relative w-full sm:w-44 shrink-0">
                  <Thermometer className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="number"
                    step="0.1"
                    value={roomTempC}
                    onChange={(e) => setRoomTempC(parseFloat(e.target.value) || 0)}
                    className={`w-full pl-8 pr-10 py-2 text-sm font-semibold tabular-nums bg-white border rounded-lg focus:outline-none focus:ring-2 ${
                      check7RoomTempPass
                        ? 'border-slate-300 focus:ring-slate-900'
                        : 'border-red-400 text-red-700 focus:ring-red-600'
                    }`}
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-medium text-slate-500">
                    °C
                  </span>
                </div>

                <div className="flex-1 flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-slate-50/80 border border-slate-200 text-xs">
                  <span className="text-slate-600 tabular-nums">
                    เกณฑ์ควบคุม: 2.0 – 6.0 °C
                  </span>
                  <div className="inline-flex items-center gap-1">
                    {[3.5, 4.2, 5.0].map((presetTemp) => (
                      <button
                        key={presetTemp}
                        type="button"
                        onClick={() => setRoomTempC(presetTemp)}
                        className={`px-2 py-0.5 rounded font-medium text-[11px] tabular-nums border transition-colors ${
                          Math.abs(roomTempC - presetTemp) < 0.05
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        {presetTemp.toFixed(1)}°
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="hidden lg:flex lg:col-span-2 flex-col items-end text-right">
                <span
                  className={`inline-flex items-center gap-1 text-xs font-semibold ${
                    check7RoomTempPass ? 'text-emerald-700' : 'text-red-700'
                  }`}
                >
                  {check7RoomTempPass ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" /> PASS
                    </>
                  ) : (
                    <>
                      <XCircle className="w-3.5 h-3.5" /> FAIL
                    </>
                  )}
                </span>
                <span className="text-[11px] text-slate-500 tabular-nums mt-0.5">
                  {check7RoomTempPass ? 'อยู่ในช่วง 2–6 °C' : 'อยู่นอกเกณฑ์ควบคุม'}
                </span>
              </div>
            </div>

            {/* Check 8: ความสะอาดและความเรียบร้อยของตะกร้าขนส่ง */}
            <div
              className={`grid grid-cols-1 lg:grid-cols-12 gap-3.5 lg:gap-4 p-4 sm:p-5 items-start lg:items-center transition-colors ${
                check8CrateClean ? 'bg-white hover:bg-slate-50/40' : 'bg-red-50/35'
              }`}
            >
              <div className="lg:col-span-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-semibold text-sm text-slate-900">
                    <span className="tabular-nums text-slate-400 mr-1.5">8.</span>
                    ความสะอาดและความเรียบร้อยของตะกร้าขนส่ง
                  </div>
                  <span
                    className={`lg:hidden inline-flex items-center gap-1 text-xs font-semibold shrink-0 ${
                      check8CrateClean ? 'text-emerald-700' : 'text-red-700'
                    }`}
                  >
                    {check8CrateClean ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" /> PASS
                      </>
                    ) : (
                      <>
                        <XCircle className="w-3.5 h-3.5" /> FAIL
                      </>
                    )}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  เกณฑ์: ตะกร้าขนส่งผ่านการล้างฆ่าเชื้อ แห้งสะอาด จัดเรียงเป็นระเบียบ
                </p>
              </div>

              <div className="lg:col-span-6 flex flex-col sm:flex-row sm:items-center gap-2.5">
                <div className="inline-flex p-0.5 bg-slate-100 rounded-lg border border-slate-200/80 shrink-0 self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setCheck8CrateClean(true)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      check8CrateClean
                        ? 'bg-white text-emerald-700 shadow-2xs font-semibold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    สะอาดเรียบร้อย (ผ่าน)
                  </button>
                  <button
                    type="button"
                    onClick={() => setCheck8CrateClean(false)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                      !check8CrateClean
                        ? 'bg-red-600 text-white shadow-2xs font-semibold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    ไม่ผ่าน
                  </button>
                </div>
                <input
                  type="text"
                  value={check8Note}
                  onChange={(e) => setCheck8Note(e.target.value)}
                  placeholder="บันทึกความสะอาดและการจัดเรียงตะกร้าขนส่ง..."
                  className="flex-1 min-w-0 w-full px-3 py-2 text-xs bg-slate-50/70 focus:bg-white border border-slate-200 focus:border-slate-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900/10 transition-colors"
                />
              </div>

              <div className="hidden lg:flex lg:col-span-2 flex-col items-end text-right">
                <span
                  className={`inline-flex items-center gap-1 text-xs font-semibold ${
                    check8CrateClean ? 'text-emerald-700' : 'text-red-700'
                  }`}
                >
                  {check8CrateClean ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" /> PASS
                    </>
                  ) : (
                    <>
                      <XCircle className="w-3.5 h-3.5" /> FAIL
                    </>
                  )}
                </span>
                <span className="text-[11px] text-slate-500 mt-0.5">
                  {check8CrateClean ? 'สะอาดพร้อมจัดส่ง' : 'ตะกร้าไม่พร้อมส่ง'}
                </span>
              </div>
            </div>
          </div>

          {/* Inspector & Save Footer (Vehicle Release Sign-off removed) */}
          <div className="pt-4 border-t border-slate-200 grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
            <div className="md:col-span-4">
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                ผู้ตรวจสอบคุณภาพก่อนจัดส่ง (OQC Inspector) *
              </label>
              <input
                type="text"
                value={oqcInspector}
                onChange={(e) => setOqcInspector(e.target.value)}
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
            <div className="md:col-span-8">
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                หมายเหตุเพิ่มเติม
              </label>
              <input
                type="text"
                value={oqcRemarks}
                onChange={(e) => setOqcRemarks(e.target.value)}
                placeholder="บันทึกข้อสังเกตการตรวจ OQC (ถ้ามี)"
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3">
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
              <span>{editingId ? 'บันทึกการแก้ไข OQC' : 'บันทึกผลตรวจ OQC และออกเลข COA'}</span>
            </button>
          </div>
        </div>
      </form>

      {/* OQC Shipment History Table */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-5 border-b border-slate-200">
          <h3 className="text-base font-semibold text-slate-900">
            รายการตรวจควบคุมคุณภาพก่อนจัดส่ง ({outgoingRecords.length} รอบจัดส่ง)
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                <th className="py-3 px-4">เลขที่ OQC / COA</th>
                <th className="py-3 px-4">ลูกค้า / PO</th>
                <th className="py-3 px-4">สายพันธุ์ผสม</th>
                <th className="py-3 px-4 text-right">น้ำหนักสุทธิ</th>
                <th className="py-3 px-4 text-right">อุณหภูมิห้อง</th>
                <th className="py-3 px-4">สรุปผล OQC (8 ข้อ)</th>
                <th className="py-3 px-4 text-right">ดำเนินการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {outgoingRecords.map((rec) => {
                const usedCount = rec.colorMix.filter((c) => c.percentage > 0).length;
                return (
                  <tr key={rec.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 tabular-nums whitespace-nowrap">
                      <div className="font-semibold tracking-tight text-slate-900">{rec.oqcNumber}</div>
                      <div className="text-[11px] text-slate-500">{rec.coaNumber}</div>
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
                      {usedCount} สายพันธุ์ (คละสี)
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
                          className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors inline-flex items-center gap-1.5"
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
      </section>
    </div>
  );
};
