import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FlaskConical,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
  XCircle,
} from 'lucide-react';
import {
  IncomingLotRecord,
  LabRecord,
  LabTestStatus,
  TOMATO_VARIETIES,
} from '../types/qc';
import {
  evaluateLabBrixStatus,
  evaluateOverallLabStatus,
  evaluatePesticideTwoGroups,
  formatThaiDate,
} from '../utils/lotHelpers';

import { NotificationVariant } from './PopupNotification';

interface LabQCViewProps {
  lots: IncomingLotRecord[];
  labRecords: LabRecord[];
  preselectedLotNumber: string | null;
  onSaveLabRecord: (record: LabRecord) => void;
  onNotify: (title: string, message: string, variant?: NotificationVariant) => void;
}

type StatusFilterMode = 'ALL' | 'PASS' | 'FAIL' | 'PENDING';

function createDefaultPendingLab(lot: IncomingLotRecord): LabRecord {
  return {
    id: `lab-${lot.lotNumber}`,
    lotNumber: lot.lotNumber,
    receivedDate: lot.receivedDate,
    brixValue: null,
    colorStatus: 'PASS',
    colorNote: '',
    brixStatus: 'PENDING',
    organophosphateCarbamate: 'PENDING',
    organochlorinePyrethroid: 'PENDING',
    pesticideNote: '',
    pesticideStatus: 'PENDING',
    overallLabStatus: 'PENDING',
    analystName: 'ดร.ปิยะฉัตร วรโชติ',
    labRemarks: '',
  };
}

export const LabQCView: React.FC<LabQCViewProps> = ({
  lots,
  labRecords,
  preselectedLotNumber,
  onSaveLabRecord,
  onNotify,
}) => {
  const labByLot = useMemo(() => {
    const map = new Map<string, LabRecord>();
    for (const r of labRecords) {
      map.set(r.lotNumber, r);
    }
    return map;
  }, [labRecords]);

  // Main Officer Form State
  const initialSelectedLotNumber =
    preselectedLotNumber && lots.some((l) => l.lotNumber === preselectedLotNumber)
      ? preselectedLotNumber
      : lots[0]?.lotNumber || '';

  const [selectedLotNumber, setSelectedLotNumber] = useState<string>(
    initialSelectedLotNumber
  );
  const [receivedDate, setReceivedDate] = useState<string>('2026-11-03');
  const [brixInput, setBrixInput] = useState<string>('7.4');
  const [formOpCb, setFormOpCb] = useState<LabTestStatus>('PENDING');
  const [formOcPy, setFormOcPy] = useState<LabTestStatus>('PENDING');
  const [formPesticideNote, setFormPesticideNote] = useState<string>('');
  const [analystName, setAnalystName] = useState<string>('ดร.ปิยะฉัตร วรโชติ');
  const [labRemarks, setLabRemarks] = useState<string>('');

  // Table Filter State
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<StatusFilterMode>('ALL');

  // Pop-up Modal State for Pesticide 2 Main Groups
  const [pesticideModalLot, setPesticideModalLot] =
    useState<IncomingLotRecord | null>(null);
  const [modalSource, setModalSource] = useState<'FORM' | 'TABLE'>('FORM');
  const [draftOpCb, setDraftOpCb] = useState<LabTestStatus>('PENDING');
  const [draftOcPy, setDraftOcPy] = useState<LabTestStatus>('PENDING');
  const [draftPesticideNote, setDraftPesticideNote] = useState<string>('');

  // Load form values whenever a Lot Number is chosen
  const loadLotIntoForm = (lotNum: string) => {
    setSelectedLotNumber(lotNum);
    const lotObj = lots.find((l) => l.lotNumber === lotNum);
    const existing = labByLot.get(lotNum);

    if (existing) {
      setReceivedDate(existing.receivedDate || lotObj?.receivedDate || '2026-11-03');
      setBrixInput(
        existing.brixValue !== null && Number.isFinite(existing.brixValue)
          ? String(existing.brixValue)
          : ''
      );
      setFormOpCb(existing.organophosphateCarbamate);
      setFormOcPy(existing.organochlorinePyrethroid);
      setFormPesticideNote(existing.pesticideNote || '');
      setAnalystName(existing.analystName || 'ดร.ปิยะฉัตร วรโชติ');
      setLabRemarks(existing.labRemarks || '');
    } else if (lotObj) {
      setReceivedDate(lotObj.receivedDate);
      setBrixInput('');
      setFormOpCb('PENDING');
      setFormOcPy('PENDING');
      setFormPesticideNote('');
      setAnalystName('ดร.ปิยะฉัตร วรโชติ');
      setLabRemarks('');
    }
  };

  // Sync on initial mount or when navigated from Overview / QC Incoming
  useEffect(() => {
    if (
      preselectedLotNumber &&
      lots.some((l) => l.lotNumber === preselectedLotNumber)
    ) {
      loadLotIntoForm(preselectedLotNumber);
    } else if (selectedLotNumber) {
      loadLotIntoForm(selectedLotNumber);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectedLotNumber]);

  const activeLot = useMemo(
    () => lots.find((l) => l.lotNumber === selectedLotNumber) || null,
    [lots, selectedLotNumber]
  );

  // Real-time %Brix evaluation against 7-Eleven standard (> 6.0 %Brix)
  const parsedBrix: number | null = useMemo(() => {
    const trimmed = brixInput.trim();
    if (trimmed === '') return null;
    const num = parseFloat(trimmed);
    return Number.isFinite(num) ? num : null;
  }, [brixInput]);

  const realtimeBrixStatus: LabTestStatus = useMemo(
    () => evaluateLabBrixStatus(parsedBrix),
    [parsedBrix]
  );

  const realtimePesticideStatus: LabTestStatus = useMemo(
    () => evaluatePesticideTwoGroups(formOpCb, formOcPy),
    [formOpCb, formOcPy]
  );

  const realtimeOverallStatus: LabTestStatus = useMemo(
    () => evaluateOverallLabStatus(realtimeBrixStatus, realtimePesticideStatus),
    [realtimeBrixStatus, realtimePesticideStatus]
  );

  // Join all Incoming Lots with their LabRecord for the Summary Table
  const summaryRows = useMemo(() => {
    return lots.map((lot) => {
      const existing = labByLot.get(lot.lotNumber);
      const lab = existing || createDefaultPendingLab(lot);
      return { lot, lab };
    });
  }, [lots, labByLot]);

  const filteredRows = useMemo(() => {
    return summaryRows.filter(({ lot, lab }) => {
      if (statusFilter !== 'ALL' && lab.overallLabStatus !== statusFilter) {
        return false;
      }
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const v = TOMATO_VARIETIES[lot.varietyCode];
        return (
          lot.lotNumber.toLowerCase().includes(q) ||
          v.nameTh.toLowerCase().includes(q) ||
          v.colorLabelTh.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [summaryRows, statusFilter, searchTerm]);

  const labStats = useMemo(() => {
    let passAll = 0;
    let failAny = 0;
    let pendingAny = 0;
    let brixSum = 0;
    let brixCount = 0;

    for (const { lab } of summaryRows) {
      if (lab.overallLabStatus === 'PASS') passAll += 1;
      else if (lab.overallLabStatus === 'FAIL') failAny += 1;
      else pendingAny += 1;

      if (lab.brixValue !== null && Number.isFinite(lab.brixValue)) {
        brixSum += lab.brixValue;
        brixCount += 1;
      }
    }

    return {
      total: summaryRows.length,
      passAll,
      failAny,
      pendingAny,
      avgBrix: brixCount > 0 ? brixSum / brixCount : null,
    };
  }, [summaryRows]);

  // Save Main Officer Form
  const handleSaveMainForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeLot) return;

    const existing =
      labByLot.get(activeLot.lotNumber) || createDefaultPendingLab(activeLot);

    const normalizedBrix =
      parsedBrix !== null ? Number(parsedBrix.toFixed(2)) : null;
    const nextBrixStatus = evaluateLabBrixStatus(normalizedBrix);
    const nextPestStatus = evaluatePesticideTwoGroups(formOpCb, formOcPy);
    const nextOverall = evaluateOverallLabStatus(nextBrixStatus, nextPestStatus);

    const record: LabRecord = {
      ...existing,
      lotNumber: activeLot.lotNumber,
      receivedDate: receivedDate || activeLot.receivedDate,
      brixValue: normalizedBrix,
      colorStatus: existing.colorStatus === 'FAIL' ? 'FAIL' : 'PASS',
      brixStatus: nextBrixStatus,
      organophosphateCarbamate: formOpCb,
      organochlorinePyrethroid: formOcPy,
      pesticideNote: formPesticideNote.trim(),
      pesticideStatus: nextPestStatus,
      overallLabStatus: nextOverall,
      analystName: analystName.trim() || 'ดร.ปิยะฉัตร วรโชติ',
      labRemarks: labRemarks.trim(),
    };

    onSaveLabRecord(record);
    onNotify(
      'บันทึกผลวิเคราะห์แล็บเรียบร้อยแล้ว',
      `ล็อต ${activeLot.lotNumber} — ซิงค์ไปยังตารางสรุปผลแล็บ, QC Outgoing และใบรับรอง COA ทันที (${
        nextOverall === 'PASS'
          ? 'ผ่านเกณฑ์ PASS'
          : nextOverall === 'FAIL'
          ? 'ไม่ผ่าน FAIL · ระงับตรายาง QA PASSED อัตโนมัติ'
          : 'รอผลการตรวจสอบ'
      })`,
      'success'
    );
  };

  // Open Pesticide 2-Group Pop-up (from Main Form or from Summary Table)
  const openPesticidePopup = (
    lot: IncomingLotRecord,
    source: 'FORM' | 'TABLE'
  ) => {
    setPesticideModalLot(lot);
    setModalSource(source);

    if (source === 'FORM' && lot.lotNumber === selectedLotNumber) {
      setDraftOpCb(formOpCb);
      setDraftOcPy(formOcPy);
      setDraftPesticideNote(formPesticideNote);
    } else {
      const existing = labByLot.get(lot.lotNumber);
      setDraftOpCb(existing ? existing.organophosphateCarbamate : 'PENDING');
      setDraftOcPy(existing ? existing.organochlorinePyrethroid : 'PENDING');
      setDraftPesticideNote(existing?.pesticideNote || '');
    }
  };

  // Save Pesticide Pop-up & Synchronize Immediately Across Form, Summary Table, Outgoing & COA
  const handleSavePesticidePopup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pesticideModalLot) return;

    const targetLot = pesticideModalLot;
    const existing =
      labByLot.get(targetLot.lotNumber) || createDefaultPendingLab(targetLot);

    // If editing the currently loaded lot in the form, preserve unsaved Brix/date edits in the form too
    const isCurrentFormLot = targetLot.lotNumber === selectedLotNumber;
    const effectiveReceivedDate = isCurrentFormLot
      ? receivedDate || targetLot.receivedDate
      : existing.receivedDate || targetLot.receivedDate;
    const effectiveBrixValue = isCurrentFormLot
      ? parsedBrix !== null
        ? Number(parsedBrix.toFixed(2))
        : null
      : existing.brixValue;

    const nextBrixStatus = evaluateLabBrixStatus(effectiveBrixValue);
    const nextPestStatus = evaluatePesticideTwoGroups(draftOpCb, draftOcPy);
    const nextOverall = evaluateOverallLabStatus(nextBrixStatus, nextPestStatus);

    if (isCurrentFormLot) {
      setFormOpCb(draftOpCb);
      setFormOcPy(draftOcPy);
      setFormPesticideNote(draftPesticideNote);
    }

    const updated: LabRecord = {
      ...existing,
      lotNumber: targetLot.lotNumber,
      receivedDate: effectiveReceivedDate,
      brixValue: effectiveBrixValue,
      brixStatus: nextBrixStatus,
      organophosphateCarbamate: draftOpCb,
      organochlorinePyrethroid: draftOcPy,
      pesticideNote: draftPesticideNote.trim(),
      pesticideStatus: nextPestStatus,
      overallLabStatus: nextOverall,
      analystName: isCurrentFormLot
        ? analystName.trim() || existing.analystName
        : existing.analystName,
      labRemarks: isCurrentFormLot ? labRemarks.trim() : existing.labRemarks,
    };

    onSaveLabRecord(updated);
    onNotify(
      'บันทึกผลตรวจสารเคมีตกค้าง 2 หมวดเรียบร้อยแล้ว',
      `ล็อต ${targetLot.lotNumber} (${
        nextPestStatus === 'PASS'
          ? 'สารตกค้างรวม: ผ่านทั้ง 2 หมวด'
          : nextPestStatus === 'FAIL'
          ? 'สารตกค้างรวม: ไม่ผ่าน FAIL — ระงับตรายาง QA PASSED บน COA อัตโนมัติ'
          : 'รอผลการตรวจสอบ'
      })`,
      'success'
    );
    setPesticideModalLot(null);
  };

  const renderGroupBadge = (status: LabTestStatus) => {
    if (status === 'PASS') {
      return (
        <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>ผ่าน</span>
        </span>
      );
    }
    if (status === 'FAIL') {
      return (
        <span className="inline-flex items-center gap-1 font-bold text-red-700">
          <XCircle className="w-3.5 h-3.5 shrink-0" />
          <span>ไม่ผ่าน</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 font-medium text-amber-700">
        <Clock className="w-3.5 h-3.5 shrink-0" />
        <span>รอผลการตรวจสอบ</span>
      </span>
    );
  };

  const renderOverallBadge = (status: LabTestStatus) => {
    if (status === 'PASS') {
      return (
        <span className="inline-flex items-center gap-1 font-bold tracking-tight text-emerald-700">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>PASS</span>
        </span>
      );
    }
    if (status === 'FAIL') {
      return (
        <span className="inline-flex items-center gap-1 font-bold tracking-tight text-red-700">
          <XCircle className="w-3.5 h-3.5 shrink-0" />
          <span>FAIL</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 font-medium text-amber-700">
        <Clock className="w-3.5 h-3.5 shrink-0" />
        <span>รอผลการตรวจสอบ</span>
      </span>
    );
  };

  const modalPreviewPestStatus = evaluatePesticideTwoGroups(draftOpCb, draftOcPy);

  return (
    <div className="space-y-8">
      {/* MAIN OFFICER LAB ENTRY FORM */}
      <form
        onSubmit={handleSaveMainForm}
        className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-200"
      >
        {/* Header & Live KPI Summary */}
        <div className="p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              QC LAB (การวิเคราะห์ทางห้องปฏิบัติการ) — ฟอร์มบันทึกผลหลักสำหรับเจ้าหน้าที่
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              ตรวจสอบความหวานตามเกณฑ์มาตรฐาน 7-Eleven (&gt; 6.0 %Brix) แบบเรียลไทม์ พร้อมบันทึกผลตรวจสารเคมีตกค้าง 2 หมวดหลักผ่าน Pop-up เชื่อมโยงสู่ QC Outgoing และใบรับรอง COA อัตโนมัติ
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs font-medium tabular-nums text-slate-700 shrink-0">
            <span>
              ความหวานเฉลี่ย:{' '}
              <strong className="text-slate-900">
                {labStats.avgBrix !== null
                  ? `${labStats.avgBrix.toFixed(2)} %Brix`
                  : '-'}
              </strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              ผ่านเกณฑ์:{' '}
              <strong className="text-emerald-700">{labStats.passAll}</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              รอผลตรวจ:{' '}
              <strong className="text-amber-700">{labStats.pendingAny}</strong>
            </span>
            <span aria-hidden="true">·</span>
            <span>
              ไม่ผ่าน (FAIL):{' '}
              <strong className="text-red-700">{labStats.failAny}</strong>
            </span>
          </div>
        </div>

        {/* Form Fields */}
        <div className="p-6 space-y-6">

          {/* Row 1: Lot Number Selector + Auto-synced Variety/Source Info + Received Date */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* 1. หมายเลขล็อต (Lot Number) */}
            <div className="lg:col-span-5">
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                หมายเลขล็อต (Lot Number) *
              </label>
              <select
                value={selectedLotNumber}
                onChange={(e) => loadLotIntoForm(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm font-semibold tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              >
                {lots.map((lot) => {
                  const v = TOMATO_VARIETIES[lot.varietyCode];
                  const lRec = labByLot.get(lot.lotNumber);
                  const stLabel =
                    !lRec || lRec.overallLabStatus === 'PENDING'
                      ? 'รอผลตรวจ'
                      : lRec.overallLabStatus;
                  return (
                    <option key={lot.id} value={lot.lotNumber}>
                      {lot.lotNumber} — {v.nameTh} ({v.colorLabelTh}) [{stLabel}]
                    </option>
                  );
                })}
              </select>
              <p className="text-[11px] text-slate-500 mt-1">
                เลือกล็อตจากรายการรับเข้าเพื่อดึงข้อมูลสายพันธุ์และวันที่รับเข้าอัตโนมัติ
              </p>
            </div>

            {/* Auto-synced Variety & Incoming Lot Metadata Readout */}
            <div className="lg:col-span-4">
              <span className="block text-xs font-semibold text-slate-700 mb-1.5">
                ข้อมูลสายพันธุ์และการรับเข้า (ซิงค์อัตโนมัติ)
              </span>
              {activeLot ? (
                <div className="px-3.5 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 font-semibold text-slate-900">
                      <span
                        className="w-3 h-3 rounded-xs shrink-0"
                        style={{
                          backgroundColor:
                            TOMATO_VARIETIES[activeLot.varietyCode].swatchHex,
                        }}
                      />
                      <span>
                        สายพันธุ์{TOMATO_VARIETIES[activeLot.varietyCode].nameTh} (
                        {TOMATO_VARIETIES[activeLot.varietyCode].colorLabelTh})
                      </span>
                    </div>
                    <span className="text-[11px] font-semibold tracking-tight text-slate-500">
                      {activeLot.varietyCode}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-600">
                    <span>
                      สถานะ QC Incoming:{' '}
                      <strong className="text-slate-800">
                        {activeLot.disposition === 'ACCEPT'
                          ? 'ผ่าน (Accept)'
                          : activeLot.disposition === 'CONDITIONAL_ACCEPT'
                          ? 'รับแบบคัดแยก 100%'
                          : 'ไม่ผ่าน (Reject)'}
                      </strong>
                    </span>
                    <span>ผู้รับ: {activeLot.inspectorName}</span>
                  </div>
                </div>
              ) : (
                <div className="px-3.5 py-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-500">
                  ยังไม่มีรายการล็อตรับเข้า
                </div>
              )}
            </div>

            {/* 2. วันที่รับเข้า (Received Date) */}
            <div className="lg:col-span-3">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-700">
                  วันที่รับเข้า (Received Date) *
                </label>
                {activeLot && receivedDate !== activeLot.receivedDate && (
                  <button
                    type="button"
                    onClick={() => setReceivedDate(activeLot.receivedDate)}
                    className="text-[11px] text-slate-700 underline inline-flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>ซิงค์ตามล็อต</span>
                  </button>
                )}
              </div>
              <input
                type="date"
                value={receivedDate}
                onChange={(e) => setReceivedDate(e.target.value)}
                className="w-full px-3.5 py-2 text-sm tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                ซิงค์ตามล็อตอัตโนมัติ ({formatThaiDate(receivedDate)}) แก้ไขได้
              </p>
            </div>
          </div>

          {/* Row 2: Real-time %Brix Check (> 6.0 %Brix) + Pesticide 2-Group Pop-up Launcher */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* 3. ระดับความหวาน (%Brix) */}
            <div className="lg:col-span-6 p-5 rounded-xl border border-slate-200 bg-slate-50/60 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <label
                    htmlFor="lab-brix-input"
                    className="text-sm font-semibold text-slate-900"
                  >
                    ระดับความหวาน (%Brix)
                  </label>
                  <p className="text-xs text-slate-500 mt-0.5">
                    เกณฑ์มาตรฐาน 7-Eleven: ต้องมากกว่า 6.0 %Brix (&gt; 6.0 %Brix)
                  </p>
                </div>
                {brixInput.trim() !== '' && (
                  <button
                    type="button"
                    onClick={() => setBrixInput('')}
                    className="text-[11px] text-slate-500 hover:text-slate-800 underline"
                  >
                    ล้างค่าเป็นรอผลตรวจ
                  </button>
                )}
              </div>

              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <input
                    id="lab-brix-input"
                    type="number"
                    min={0}
                    max={25}
                    step="0.1"
                    value={brixInput}
                    onChange={(e) => setBrixInput(e.target.value)}
                    placeholder="กรอกค่า %Brix เช่น 7.2"
                    className={`w-full px-4 py-2.5 pr-16 text-base font-bold tabular-nums bg-white border rounded-lg focus:outline-none focus:ring-2 ${
                      realtimeBrixStatus === 'FAIL'
                        ? 'border-red-500 text-red-700 focus:ring-red-600'
                        : realtimeBrixStatus === 'PASS'
                        ? 'border-emerald-600 text-slate-900 focus:ring-slate-900'
                        : 'border-slate-300 text-slate-900 focus:ring-slate-900'
                    }`}
                  />
                  <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500">
                    %Brix
                  </span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {[5.8, 6.8, 7.5].map((presetVal) => (
                    <button
                      key={presetVal}
                      type="button"
                      onClick={() => setBrixInput(presetVal.toFixed(1))}
                      className="px-2.5 py-2 text-xs font-semibold tabular-nums bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg transition-colors"
                      title={`ทดสอบค่า ${presetVal.toFixed(1)} %Brix`}
                    >
                      {presetVal.toFixed(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Real-time %Brix Verdict Alert */}
              {realtimeBrixStatus === 'PASS' && parsedBrix !== null && (
                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-semibold tabular-nums">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                    <span>
                      ผ่านเกณฑ์มาตรฐาน 7-Eleven ({parsedBrix.toFixed(1)} %Brix &gt; 6.0 %Brix)
                    </span>
                  </div>
                  <span className="font-bold tracking-tight text-emerald-800">PASS</span>
                </div>
              )}

              {realtimeBrixStatus === 'FAIL' && parsedBrix !== null && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-300 text-red-900 text-xs flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold tabular-nums">
                        สถานะ FAIL ทันที — ค่าความหวาน {parsedBrix.toFixed(1)} %Brix ไม่ผ่านเกณฑ์ (≤ 6.0 %Brix)
                      </div>
                      <div className="text-[11px] text-red-800 mt-0.5">
                        ต่ำกว่าหรือเท่ากับ 6.0 %Brix ระบบจะระงับตรายางดิจิทัล QA PASSED บนใบรับรอง COA อัตโนมัติ
                      </div>
                    </div>
                  </div>
                  <span className="font-bold tracking-tight text-red-700 shrink-0">
                    FAIL
                  </span>
                </div>
              )}

              {realtimeBrixStatus === 'PENDING' && (
                <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 font-medium">
                    <Clock className="w-4 h-4 text-amber-700 shrink-0" />
                    <span>ยังไม่ได้ระบุค่า %Brix — สถานะรอผลการตรวจสอบ</span>
                  </div>
                  <span className="font-semibold tracking-tight text-amber-800">
                    PENDING
                  </span>
                </div>
              )}
            </div>

            {/* 4. ส่วนผลตรวจสารเคมีตกค้าง 2 หมวดหลัก + ปุ่มเปิด Pop-up */}
            <div className="lg:col-span-6 p-5 rounded-xl border border-slate-200 bg-slate-50/60 flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">
                      ผลตรวจสารเคมีตกค้าง 2 หมวดหลัก (Pesticide Residue)
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      บันทึกและประมวลผลแยก 2 หมวดผ่านหน้าต่าง Pop-up พร้อมเชื่อมต่อไปยัง OQC และใบรับรอง COA
                    </p>
                  </div>
                  <div className="shrink-0">
                    {renderOverallBadge(realtimePesticideStatus)}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  {/* Group 1 */}
                  <div className="p-3 rounded-lg bg-white border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="font-semibold text-slate-800 truncate">
                        1. Organophosphate &amp; Carbamate
                      </span>
                      {renderGroupBadge(formOpCb)}
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      <button
                        type="button"
                        onClick={() => setFormOpCb('PASS')}
                        className={`py-1.5 px-2 rounded-md border text-[11px] font-semibold transition-colors flex items-center justify-center gap-1 ${
                          formOpCb === 'PASS'
                            ? 'border-emerald-700 bg-emerald-50 text-emerald-900 shadow-2xs'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                        title="กำหนดผลตรวจเป็น ผ่าน (PASS)"
                      >
                        <CheckCircle2 className="w-3 h-3 text-emerald-700 shrink-0" />
                        <span>✓ ผ่าน</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormOpCb('PENDING')}
                        className={`py-1.5 px-2 rounded-md border text-[11px] font-semibold transition-colors flex items-center justify-center gap-1 ${
                          formOpCb === 'PENDING'
                            ? 'border-amber-600 bg-amber-50 text-amber-900 shadow-2xs'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                        title="กำหนดผลตรวจเป็น รอผลตรวจ (PENDING)"
                      >
                        <Clock className="w-3 h-3 text-amber-700 shrink-0" />
                        <span>⏳ รอผล</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormOpCb('FAIL')}
                        className={`py-1.5 px-2 rounded-md border text-[11px] font-semibold transition-colors flex items-center justify-center gap-1 ${
                          formOpCb === 'FAIL'
                            ? 'border-red-700 bg-red-50 text-red-900 shadow-2xs'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                        title="กำหนดผลตรวจเป็น ไม่ผ่าน (FAIL)"
                      >
                        <XCircle className="w-3 h-3 text-red-700 shrink-0" />
                        <span>✕ ไม่ผ่าน</span>
                      </button>
                    </div>
                  </div>

                  {/* Group 2 */}
                  <div className="p-3 rounded-lg bg-white border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="font-semibold text-slate-800 truncate">
                        2. Organochlorine &amp; Pyrethroid
                      </span>
                      {renderGroupBadge(formOcPy)}
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      <button
                        type="button"
                        onClick={() => setFormOcPy('PASS')}
                        className={`py-1.5 px-2 rounded-md border text-[11px] font-semibold transition-colors flex items-center justify-center gap-1 ${
                          formOcPy === 'PASS'
                            ? 'border-emerald-700 bg-emerald-50 text-emerald-900 shadow-2xs'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                        title="กำหนดผลตรวจเป็น ผ่าน (PASS)"
                      >
                        <CheckCircle2 className="w-3 h-3 text-emerald-700 shrink-0" />
                        <span>✓ ผ่าน</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormOcPy('PENDING')}
                        className={`py-1.5 px-2 rounded-md border text-[11px] font-semibold transition-colors flex items-center justify-center gap-1 ${
                          formOcPy === 'PENDING'
                            ? 'border-amber-600 bg-amber-50 text-amber-900 shadow-2xs'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                        title="กำหนดผลตรวจเป็น รอผลตรวจ (PENDING)"
                      >
                        <Clock className="w-3 h-3 text-amber-700 shrink-0" />
                        <span>⏳ รอผล</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormOcPy('FAIL')}
                        className={`py-1.5 px-2 rounded-md border text-[11px] font-semibold transition-colors flex items-center justify-center gap-1 ${
                          formOcPy === 'FAIL'
                            ? 'border-red-700 bg-red-50 text-red-900 shadow-2xs'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                        title="กำหนดผลตรวจเป็น ไม่ผ่าน (FAIL)"
                      >
                        <XCircle className="w-3 h-3 text-red-700 shrink-0" />
                        <span>✕ ไม่ผ่าน</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                <div className="text-xs text-slate-600">
                  สถานะสารตกค้างรวม:{' '}
                  <strong
                    className={
                      realtimePesticideStatus === 'PASS'
                        ? 'text-emerald-700'
                        : realtimePesticideStatus === 'FAIL'
                        ? 'text-red-700'
                        : 'text-amber-700'
                    }
                  >
                    {realtimePesticideStatus === 'PASS'
                      ? 'ผ่านครบทั้ง 2 หมวด (PASS)'
                      : realtimePesticideStatus === 'FAIL'
                      ? 'ไม่ผ่านเกณฑ์ (FAIL)'
                      : 'รอผลการตรวจสอบ'}
                  </strong>
                </div>

                {activeLot && (
                  <button
                    type="button"
                    onClick={() => openPesticidePopup(activeLot, 'FORM')}
                    className="px-4 py-2.5 text-xs font-semibold text-slate-900 bg-white hover:bg-slate-100 border border-slate-900 rounded-lg transition-colors inline-flex items-center justify-center gap-2 shrink-0"
                  >
                    <ShieldCheck className="w-4 h-4 text-slate-900" />
                    <span>บันทึกผลตรวจสารเคมีตกค้าง (Pop-up)</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Row 3: Analyst, Remarks & Overall Form Verdict Footer */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
            <div className="md:col-span-4">
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                เจ้าหน้าที่วิเคราะห์ผลแล็บ (Lab Analyst)
              </label>
              <input
                type="text"
                value={analystName}
                onChange={(e) => setAnalystName(e.target.value)}
                placeholder="ระบุชื่อผู้ตรวจวิเคราะห์..."
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>

            <div className="md:col-span-5">
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                หมายเหตุห้องปฏิบัติการ (Lab Remarks)
              </label>
              <input
                type="text"
                value={labRemarks}
                onChange={(e) => setLabRemarks(e.target.value)}
                placeholder="ระบุรายละเอียดเพิ่มเติม (ถ้ามี)..."
                className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>

            <div className="md:col-span-3 flex justify-end">
              <button
                type="submit"
                disabled={!activeLot}
                className="w-full px-5 py-2.5 text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:bg-slate-400 rounded-lg transition-colors inline-flex items-center justify-center gap-2"
              >
                <FlaskConical className="w-4 h-4" />
                <span>บันทึกผลวิเคราะห์แล็บ</span>
              </button>
            </div>
          </div>

          {/* Real-time Combined Lab Status Strip */}
          <div
            className={`p-3.5 rounded-lg border text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
              realtimeOverallStatus === 'PASS'
                ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                : realtimeOverallStatus === 'FAIL'
                ? 'bg-red-50/80 border-red-300 text-red-950'
                : 'bg-amber-50/70 border-amber-200 text-amber-950'
            }`}
          >
            <div className="font-medium">
              สรุปสถานะผลแล็บรวมของล็อต{' '}
              <span className="font-bold tabular-nums tracking-tight">{selectedLotNumber}</span> (เชื่อมต่อไปยัง QC Outgoing และใบรับรอง COA):
            </div>
            <div className="font-bold">
              {realtimeOverallStatus === 'PASS'
                ? 'PASS — ผ่านเกณฑ์ครบถ้วน อนุญาตประทับตรา QA PASSED'
                : realtimeOverallStatus === 'FAIL'
                ? 'FAIL — ไม่ผ่านเกณฑ์ ระบบระงับตรายาง QA PASSED อัตโนมัติ'
                : 'PENDING — รอผลการตรวจสอบให้ครบทุกหมวด'}
            </div>
          </div>
        </div>
      </form>

      {/* LAB SUMMARY TABLE (ตารางสรุปผลการวิเคราะห์ทางห้องปฏิบัติการ) */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              ตารางสรุปผลการวิเคราะห์ทางห้องปฏิบัติการ (QC LAB Summary Table)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              แสดงผลระดับความหวาน (%Brix) และผลตรวจสารเคมีตกค้างทั้ง 2 หมวดหลักของทุกล็อต พร้อมปุ่มเปิดหน้าต่าง Pop-up บันทึกผลสารตกค้างได้โดยตรง
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="ค้นหาเลขล็อต / สายพันธุ์..."
                className="pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900 w-52"
              />
            </div>

            {(
              [
                { id: 'ALL', label: `ทั้งหมด (${summaryRows.length})` },
                { id: 'PASS', label: `ผ่าน PASS (${labStats.passAll})` },
                { id: 'FAIL', label: `ไม่ผ่าน FAIL (${labStats.failAny})` },
                { id: 'PENDING', label: `รอผลตรวจ (${labStats.pendingAny})` },
              ] as { id: StatusFilterMode; label: string }[]
            ).map((btn) => (
              <button
                key={btn.id}
                type="button"
                onClick={() => setStatusFilter(btn.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                  statusFilter === btn.id
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                <th className="py-3 px-4">หมายเลขล็อต</th>
                <th className="py-3 px-4">สายพันธุ์ (สี)</th>
                <th className="py-3 px-4">วันที่รับเข้า</th>
                <th className="py-3 px-4 text-right">ความหวาน (%Brix)</th>
                <th className="py-3 px-4">Organophosphate &amp; Carbamate</th>
                <th className="py-3 px-4">Organochlorine &amp; Pyrethroid</th>
                <th className="py-3 px-4">สถานะสารตกค้างรวม</th>
                <th className="py-3 px-4">สรุปผลแล็บ</th>
                <th className="py-3 px-4 text-right">ดำเนินการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {filteredRows.map(({ lot, lab }) => {
                const v = TOMATO_VARIETIES[lot.varietyCode];
                const isSelectedInForm = lot.lotNumber === selectedLotNumber;

                return (
                  <tr
                    key={lot.id}
                    className={`hover:bg-slate-50/80 transition-colors ${
                      isSelectedInForm ? 'bg-slate-50' : ''
                    }`}
                  >
                    <td className="py-3 px-4 font-semibold tabular-nums tracking-tight text-slate-900 whitespace-nowrap">
                      {lot.lotNumber}
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-xs shrink-0"
                          style={{ backgroundColor: v.swatchHex }}
                        />
                        <span className="font-medium text-slate-900">{v.nameTh}</span>
                        <span className="text-slate-400">·</span>
                        <span className="text-slate-500">{v.colorLabelTh}</span>
                      </div>
                    </td>

                    <td className="py-3 px-4 tabular-nums text-slate-600 whitespace-nowrap">
                      {formatThaiDate(lab.receivedDate || lot.receivedDate)}
                    </td>

                    <td className="py-3 px-4 text-right tabular-nums whitespace-nowrap">
                      {lab.brixValue === null ? (
                        <span className="text-amber-700 font-medium">
                          รอผลการตรวจสอบ
                        </span>
                      ) : lab.brixValue > 6.0 ? (
                        <span className="text-emerald-700 font-semibold">
                          {lab.brixValue.toFixed(1)} %Brix (PASS)
                        </span>
                      ) : (
                        <span className="text-red-700 font-bold">
                          {lab.brixValue.toFixed(1)} %Brix (FAIL)
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap">
                      {renderGroupBadge(lab.organophosphateCarbamate)}
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap">
                      {renderGroupBadge(lab.organochlorinePyrethroid)}
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap">
                      {renderOverallBadge(lab.pesticideStatus)}
                    </td>

                    <td className="py-3 px-4 whitespace-nowrap">
                      {renderOverallBadge(lab.overallLabStatus)}
                    </td>

                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => loadLotIntoForm(lot.lotNumber)}
                          className={`h-8 w-[104px] px-2.5 text-xs font-medium rounded-lg border transition-colors inline-flex items-center justify-center ${
                            isSelectedInForm
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          {isSelectedInForm ? 'กำลังเลือก' : 'เลือกเข้าฟอร์ม'}
                        </button>
                        <button
                          type="button"
                          onClick={() => openPesticidePopup(lot, 'TABLE')}
                          className="h-8 px-3 text-xs font-semibold text-slate-900 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors inline-flex items-center justify-center gap-1.5"
                        >
                          <ShieldCheck className="w-3.5 h-3.5 text-slate-700 shrink-0" />
                          <span>บันทึกผลตรวจสารเคมีตกค้าง (Pop-up)</span>
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

      {/* POP-UP MODAL: บันทึกผลตรวจสารเคมีตกค้าง 2 หมวดหลัก */}
      {pesticideModalLot && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pesticide-two-group-modal-title"
        >
          <form
            onSubmit={handleSavePesticidePopup}
            className="bg-white border border-slate-200 rounded-xl max-w-xl w-full overflow-hidden shadow-lg"
          >
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
              <div>
                <h3
                  id="pesticide-two-group-modal-title"
                  className="text-base font-semibold text-slate-900"
                >
                  หน้าต่างบันทึกผลตรวจสารเคมีตกค้าง 2 หมวดหลัก
                </h3>
                <p className="text-xs text-slate-500 tabular-nums mt-0.5">
                  <span className="font-semibold text-slate-700">{pesticideModalLot.lotNumber}</span> — สายพันธุ์
                  {TOMATO_VARIETIES[pesticideModalLot.varietyCode].nameTh} (
                  {TOMATO_VARIETIES[pesticideModalLot.varietyCode].colorLabelTh}) ·{' '}
                  {modalSource === 'FORM' ? 'เปิดจากฟอร์มหลัก' : 'เปิดจากตารางสรุปผลแล็บ'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPesticideModalLot(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
                aria-label="ปิดหน้าต่าง"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Group 1: Organophosphate & Carbamate */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-900">
                  หมวดที่ 1: Organophosphate &amp; Carbamate *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setDraftOpCb('PASS')}
                    className={`py-2.5 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 whitespace-nowrap transition-colors ${
                      draftOpCb === 'PASS'
                        ? 'border-emerald-700 bg-emerald-50 text-emerald-900 shadow-2xs'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                    <span>✓ ผ่าน (PASS)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDraftOpCb('PENDING')}
                    className={`py-2.5 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 whitespace-nowrap transition-colors ${
                      draftOpCb === 'PENDING'
                        ? 'border-amber-600 bg-amber-50 text-amber-900 shadow-2xs'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Clock className="w-4 h-4 text-amber-700 shrink-0" />
                    <span>⏳ รอผลตรวจ</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDraftOpCb('FAIL')}
                    className={`py-2.5 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 whitespace-nowrap transition-colors ${
                      draftOpCb === 'FAIL'
                        ? 'border-red-700 bg-red-50 text-red-900 shadow-2xs'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <XCircle className="w-4 h-4 text-red-700 shrink-0" />
                    <span>✕ ไม่ผ่าน (FAIL)</span>
                  </button>
                </div>
              </div>

              {/* Group 2: Organochlorine & Pyrethroid */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-900">
                  หมวดที่ 2: Organochlorine &amp; Pyrethroid *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setDraftOcPy('PASS')}
                    className={`py-2.5 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 whitespace-nowrap transition-colors ${
                      draftOcPy === 'PASS'
                        ? 'border-emerald-700 bg-emerald-50 text-emerald-900 shadow-2xs'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                    <span>✓ ผ่าน (PASS)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDraftOcPy('PENDING')}
                    className={`py-2.5 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 whitespace-nowrap transition-colors ${
                      draftOcPy === 'PENDING'
                        ? 'border-amber-600 bg-amber-50 text-amber-900 shadow-2xs'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Clock className="w-4 h-4 text-amber-700 shrink-0" />
                    <span>⏳ รอผลตรวจ</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDraftOcPy('FAIL')}
                    className={`py-2.5 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 whitespace-nowrap transition-colors ${
                      draftOcPy === 'FAIL'
                        ? 'border-red-700 bg-red-50 text-red-900 shadow-2xs'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <XCircle className="w-4 h-4 text-red-700 shrink-0" />
                    <span>✕ ไม่ผ่าน (FAIL)</span>
                  </button>
                </div>
              </div>

              {/* Optional Pesticide Test Note */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  หมายเหตุผลตรวจสารตกค้าง (ถ้ามี)
                </label>
                <input
                  type="text"
                  value={draftPesticideNote}
                  onChange={(e) => setDraftPesticideNote(e.target.value)}
                  placeholder="เช่น ชุดทดสอบ GT-Test ไม่พบการยับยั้งเอนไซม์..."
                  className="w-full px-3.5 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              {/* Real-time Combined Pesticide Status Readout */}
              <div
                className={`p-3.5 rounded-lg border text-xs space-y-1 ${
                  modalPreviewPestStatus === 'PASS'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
                    : modalPreviewPestStatus === 'FAIL'
                    ? 'border-red-300 bg-red-50 text-red-950'
                    : 'border-amber-200 bg-amber-50 text-amber-950'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold">
                    ประมวลผลสถานะสารตกค้างรวมอัตโนมัติ:
                  </span>
                  <span className="font-bold">
                    {modalPreviewPestStatus === 'PASS'
                      ? 'ผ่านทั้ง 2 หมวด (PASS)'
                      : modalPreviewPestStatus === 'FAIL'
                      ? 'ไม่ผ่านเกณฑ์ (FAIL)'
                      : 'รอผลการตรวจสอบ'}
                  </span>
                </div>
                <p className="text-[11px] opacity-90">
                  {modalPreviewPestStatus === 'FAIL'
                    ? 'แจ้งเตือน: ระบบจะส่งสถานะ FAIL ไปยังตารางสรุปผลแล็บ, QC Outgoing และระงับตรายางดิจิทัล QA PASSED บนใบรับรอง COA ทันที'
                    : 'ผลลัพธ์จะเชื่อมต่อไปยังตารางสรุปผลแล็บ, QC Outgoing และใบรับรอง COA ทันที'}
                </p>
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setPesticideModalLot(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg"
              >
                ยืนยันบันทึกผลสารเคมีตกค้าง
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
