import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  FileSpreadsheet,
  FlaskConical,
  Gauge,
  Printer,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
  XCircle,
} from 'lucide-react';
import { exportElementToPdf, printWithClass } from '../utils/pdfExport';
import { exportLabRecordsToCsv } from '../utils/csvExport';
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
    organophosphateCarbamate: null,
    organochlorinePyrethroid: null,
    pesticideNote: '',
    pesticideStatus: 'PENDING',
    overallLabStatus: 'PENDING',
    analystName: 'น.ส.วิชุตา เหล่าศรี',
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
      const opCb =
        r.organophosphateCarbamate === 'PASS' || r.organophosphateCarbamate === 'FAIL'
          ? r.organophosphateCarbamate
          : null;
      const ocPy =
        r.organochlorinePyrethroid === 'PASS' || r.organochlorinePyrethroid === 'FAIL'
          ? r.organochlorinePyrethroid
          : null;
      const pestStatus = evaluatePesticideTwoGroups(opCb, ocPy);
      const overall = evaluateOverallLabStatus(r.brixStatus, pestStatus);
      map.set(r.lotNumber, {
        ...r,
        organophosphateCarbamate: opCb,
        organochlorinePyrethroid: ocPy,
        pesticideStatus: pestStatus,
        overallLabStatus: overall,
      });
    }
    return map;
  }, [labRecords]);

  // Main Officer Form State
  const initialSelectedLotNumber =
    preselectedLotNumber && lots.some((l) => l.lotNumber === preselectedLotNumber)
      ? preselectedLotNumber
      : '';

  const initialRecord = useMemo(() => {
    return labRecords.find((r) => r.lotNumber === initialSelectedLotNumber);
  }, [labRecords, initialSelectedLotNumber]);

  const [selectedLotNumber, setSelectedLotNumber] = useState<string>(
    initialSelectedLotNumber
  );
  const [receivedDate, setReceivedDate] = useState<string>('2026-11-03');
  const [brixInput, setBrixInput] = useState<string>('');
  const [formOpCb, setFormOpCb] = useState<LabTestStatus | null>(null);
  const [formOcPy, setFormOcPy] = useState<LabTestStatus | null>(null);
  const [formPesticideNote, setFormPesticideNote] = useState<string>('');
  const [analystName, setAnalystName] = useState<string>('น.ส.วิชุตา เหล่าศรี');
  const [labRemarks, setLabRemarks] = useState<string>('');

  // Table Filter State
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<StatusFilterMode>('ALL');
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);

  const handleExportLabPdf = async () => {
    if (isExportingPdf) return;
    setIsExportingPdf(true);
    try {
      await exportElementToPdf('lab-qc-report-sheet', {
        filename: `Lab_QC_Report_${statusFilter}_${new Date().toISOString().slice(0, 10)}.pdf`,
        captureWidth: 794,
        orientation: 'portrait',
      });
    } catch (err) {
      console.error('Failed to export Lab QC PDF:', err);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleExportLabCsv = () => {
    if (filteredRows.length === 0) {
      onNotify(
        'ไม่มีข้อมูลสำหรับส่งออก',
        'ไม่พบข้อมูลผลวิเคราะห์ทางห้องปฏิบัติการตามเงื่อนไขที่เลือกเพื่อส่งออก CSV',
        'warning'
      );
      return;
    }
    try {
      exportLabRecordsToCsv(filteredRows);
      onNotify(
        'ดาวน์โหลดไฟล์ CSV เรียบร้อยแล้ว',
        `ส่งออกข้อมูลการตรวจวิเคราะห์ทางห้องปฏิบัติการ ${filteredRows.length} รายการเป็นไฟล์ CSV ลงเครื่องเรียบร้อยแล้ว`,
        'success'
      );
    } catch (err) {
      console.error('Failed to export Lab QC CSV:', err);
      onNotify(
        'ส่งออกไฟล์ CSV ไม่สำเร็จ',
        'เกิดข้อผิดพลาดขณะส่งออกข้อมูล กรุณาลองใหม่อีกครั้ง',
        'error'
      );
    }
  };

  // Pop-up Modal State for Pesticide 2 Main Groups
  const [pesticideModalLot, setPesticideModalLot] =
    useState<IncomingLotRecord | null>(null);
  const [modalSource, setModalSource] = useState<'FORM' | 'TABLE'>('FORM');
  const [draftOpCb, setDraftOpCb] = useState<LabTestStatus | null>(null);
  const [draftOcPy, setDraftOcPy] = useState<LabTestStatus | null>(null);
  const [draftPesticideNote, setDraftPesticideNote] = useState<string>('');

  // Pop-up Modal State for Sweetness (%Brix)
  const [brixModalLot, setBrixModalLot] = useState<IncomingLotRecord | null>(null);
  const [draftBrixInput, setDraftBrixInput] = useState<string>('');
  const [draftBrixRemarks, setDraftBrixRemarks] = useState<string>('');

  // Load form values whenever a Lot Number is chosen
  const loadLotIntoForm = (lotNum: string) => {
    setSelectedLotNumber(lotNum);
    if (!lotNum) {
      setBrixInput('');
      setFormOpCb(null);
      setFormOcPy(null);
      setFormPesticideNote('');
      setLabRemarks('');
      return;
    }
    const lotObj = lots.find((l) => l.lotNumber === lotNum);
    const existing = labByLot.get(lotNum);

    if (existing) {
      setReceivedDate(existing.receivedDate || lotObj?.receivedDate || '2026-11-03');
      setBrixInput(
        existing.brixValue !== null && Number.isFinite(existing.brixValue)
          ? String(existing.brixValue)
          : ''
      );
      setFormOpCb(
        existing.organophosphateCarbamate === 'PASS' ||
          existing.organophosphateCarbamate === 'FAIL'
          ? existing.organophosphateCarbamate
          : null
      );
      setFormOcPy(
        existing.organochlorinePyrethroid === 'PASS' ||
          existing.organochlorinePyrethroid === 'FAIL'
          ? existing.organochlorinePyrethroid
          : null
      );
      setFormPesticideNote(existing.pesticideNote || '');
      setAnalystName(existing.analystName || 'น.ส.วิชุตา เหล่าศรี');
      setLabRemarks(existing.labRemarks || '');
    } else if (lotObj) {
      setReceivedDate(lotObj.receivedDate);
      setBrixInput('');
      setFormOpCb(null);
      setFormOcPy(null);
      setFormPesticideNote('');
      setAnalystName('น.ส.วิชุตา เหล่าศรี');
      setLabRemarks('');
    }
  };

  // Sync when navigated from Overview / QC Incoming with preselected lot
  useEffect(() => {
    if (
      preselectedLotNumber &&
      lots.some((l) => l.lotNumber === preselectedLotNumber)
    ) {
      loadLotIntoForm(preselectedLotNumber);
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
      analystName: analystName.trim() || 'น.ส.วิชุตา เหล่าศรี',
      labRemarks: labRemarks.trim(),
    };

    onSaveLabRecord(record);
    onNotify(
      'บันทึกผลวิเคราะห์แล็บเรียบร้อยแล้ว',
      `ล็อต ${activeLot.lotNumber} — ซิงค์ไปยังตารางสรุปผลแล็บ, FG และใบรับรอง COA ทันที (${
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
      setDraftOpCb(
        existing?.organophosphateCarbamate === 'PASS' || existing?.organophosphateCarbamate === 'FAIL'
          ? existing.organophosphateCarbamate
          : null
      );
      setDraftOcPy(
        existing?.organochlorinePyrethroid === 'PASS' || existing?.organochlorinePyrethroid === 'FAIL'
          ? existing.organochlorinePyrethroid
          : null
      );
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

  // Open Sweetness (%Brix) Pop-up (from Main Form or from Summary Table)
  const openBrixPopup = (lot: IncomingLotRecord) => {
    setBrixModalLot(lot);
    const existing = labByLot.get(lot.lotNumber);
    if (lot.lotNumber === selectedLotNumber && brixInput.trim() !== '') {
      setDraftBrixInput(brixInput);
    } else if (existing?.brixValue !== null && existing?.brixValue !== undefined) {
      setDraftBrixInput(String(existing.brixValue));
    } else {
      setDraftBrixInput('');
    }
    setDraftBrixRemarks(existing?.labRemarks || '');
  };

  // Save Sweetness (%Brix) Pop-up & Synchronize Immediately
  const handleSaveBrixPopup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!brixModalLot) return;

    const targetLot = brixModalLot;
    const existing =
      labByLot.get(targetLot.lotNumber) || createDefaultPendingLab(targetLot);

    const isCurrentFormLot = targetLot.lotNumber === selectedLotNumber;
    const parsedDraftBrix =
      draftBrixInput.trim() === '' ? null : parseFloat(draftBrixInput);
    const normalizedBrix =
      parsedDraftBrix !== null && Number.isFinite(parsedDraftBrix)
        ? Number(parsedDraftBrix.toFixed(2))
        : null;

    const nextBrixStatus = evaluateLabBrixStatus(normalizedBrix);
    const effectiveOpCb = isCurrentFormLot
      ? formOpCb
      : existing.organophosphateCarbamate;
    const effectiveOcPy = isCurrentFormLot
      ? formOcPy
      : existing.organochlorinePyrethroid;
    const effectivePestStatus = evaluatePesticideTwoGroups(
      effectiveOpCb,
      effectiveOcPy
    );
    const nextOverall = evaluateOverallLabStatus(
      nextBrixStatus,
      effectivePestStatus
    );

    if (isCurrentFormLot) {
      setBrixInput(normalizedBrix !== null ? String(normalizedBrix) : '');
    }

    const updated: LabRecord = {
      ...existing,
      lotNumber: targetLot.lotNumber,
      receivedDate: existing.receivedDate || targetLot.receivedDate,
      brixValue: normalizedBrix,
      brixStatus: nextBrixStatus,
      organophosphateCarbamate: effectiveOpCb,
      organochlorinePyrethroid: effectiveOcPy,
      pesticideStatus: effectivePestStatus,
      overallLabStatus: nextOverall,
      analystName: existing.analystName || analystName,
      labRemarks: draftBrixRemarks.trim() || existing.labRemarks,
    };

    onSaveLabRecord(updated);
    onNotify(
      'บันทึกระดับความหวาน (%Brix) เรียบร้อยแล้ว',
      `ล็อต ${targetLot.lotNumber} — ค่าความหวาน ${
        normalizedBrix !== null ? `${normalizedBrix.toFixed(1)} %Brix` : 'รอผลตรวจ'
      } (${
        nextBrixStatus === 'PASS'
          ? 'ผ่านเกณฑ์ 7-Eleven (> 6.0 %Brix)'
          : nextBrixStatus === 'FAIL'
          ? 'ไม่ผ่าน FAIL (≤ 6.0 %Brix) · ระงับตรายาง QA PASSED บน COA อัตโนมัติ'
          : 'รอผลการตรวจสอบ'
      })`,
      'success'
    );
    setBrixModalLot(null);
  };

  // Dedicated Save: Only Sweetness (%Brix) from Main Form
  const handleSaveBrixOnly = () => {
    if (!activeLot) return;
    const existing =
      labByLot.get(activeLot.lotNumber) || createDefaultPendingLab(activeLot);
    const normalizedBrix =
      parsedBrix !== null ? Number(parsedBrix.toFixed(2)) : null;
    const nextBrixStatus = evaluateLabBrixStatus(normalizedBrix);
    const effectivePestStatus = evaluatePesticideTwoGroups(formOpCb, formOcPy);
    const nextOverall = evaluateOverallLabStatus(
      nextBrixStatus,
      effectivePestStatus
    );

    const updated: LabRecord = {
      ...existing,
      lotNumber: activeLot.lotNumber,
      receivedDate: receivedDate || activeLot.receivedDate,
      brixValue: normalizedBrix,
      brixStatus: nextBrixStatus,
      organophosphateCarbamate: formOpCb,
      organochlorinePyrethroid: formOcPy,
      pesticideStatus: effectivePestStatus,
      overallLabStatus: nextOverall,
      analystName: analystName.trim() || existing.analystName,
      labRemarks: labRemarks.trim() || existing.labRemarks,
    };

    onSaveLabRecord(updated);
    onNotify(
      'บันทึกเฉพาะค่าความหวาน (%Brix) เรียบร้อยแล้ว',
      `ล็อต ${activeLot.lotNumber}: ${
        normalizedBrix !== null ? `${normalizedBrix.toFixed(1)} %Brix` : 'รอผลตรวจ'
      } (${
        nextBrixStatus === 'PASS'
          ? 'ผ่านเกณฑ์ 7-Eleven (> 6.0 %Brix)'
          : nextBrixStatus === 'FAIL'
          ? 'ไม่ผ่าน FAIL (≤ 6.0 %Brix)'
          : 'รอผลตรวจ'
      })`,
      'success'
    );
  };

  // Dedicated Save: Only Pesticide Residue from Main Form
  const handleSavePesticideOnly = () => {
    if (!activeLot) return;
    const existing =
      labByLot.get(activeLot.lotNumber) || createDefaultPendingLab(activeLot);
    const normalizedBrix =
      parsedBrix !== null
        ? Number(parsedBrix.toFixed(2))
        : existing.brixValue;
    const nextBrixStatus = evaluateLabBrixStatus(normalizedBrix);
    const nextPestStatus = evaluatePesticideTwoGroups(formOpCb, formOcPy);
    const nextOverall = evaluateOverallLabStatus(
      nextBrixStatus,
      nextPestStatus
    );

    const updated: LabRecord = {
      ...existing,
      lotNumber: activeLot.lotNumber,
      receivedDate: receivedDate || activeLot.receivedDate,
      brixValue: normalizedBrix,
      brixStatus: nextBrixStatus,
      organophosphateCarbamate: formOpCb,
      organochlorinePyrethroid: formOcPy,
      pesticideNote: formPesticideNote.trim(),
      pesticideStatus: nextPestStatus,
      overallLabStatus: nextOverall,
      analystName: analystName.trim() || existing.analystName,
      labRemarks: labRemarks.trim() || existing.labRemarks,
    };

    onSaveLabRecord(updated);
    onNotify(
      'บันทึกเฉพาะผลตรวจสารเคมีตกค้างเรียบร้อยแล้ว',
      `ล็อต ${activeLot.lotNumber}: ${
        nextPestStatus === 'PASS'
          ? 'สารตกค้างรวมผ่านครบทั้ง 2 หมวด'
          : nextPestStatus === 'FAIL'
          ? 'สารตกค้างรวมไม่ผ่าน FAIL'
          : 'รอผลตรวจ'
      }`,
      'success'
    );
  };

  // Action when clicking the 'รอผลตรวจ' button in table/cards
  const handlePendingAction = (lot: IncomingLotRecord, lab: LabRecord) => {
    loadLotIntoForm(lot.lotNumber);
    if (lab.brixStatus !== 'PASS') {
      openBrixPopup(lot);
    } else {
      openPesticidePopup(lot, 'TABLE');
    }
  };

  const renderGroupBadge = (status: LabTestStatus | null | undefined) => {
    if (status === 'FAIL') {
      return (
        <span className="inline-flex items-center gap-1 font-bold text-red-700">
          <XCircle className="w-3.5 h-3.5 shrink-0" />
          <span>ไม่ผ่าน</span>
        </span>
      );
    }
    if (status === 'PASS') {
      return (
        <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>ผ่าน</span>
        </span>
      );
    }
    return <span className="text-slate-400 font-medium text-xs">-</span>;
  };

  const renderPesticideBadge = (status: LabTestStatus | null | undefined) => {
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
    return <span className="text-slate-400 font-medium text-xs">-</span>;
  };

  const renderOverallBadge = (status: LabTestStatus | null | undefined) => {
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
      <div className="lab-qc-screen-only space-y-8">
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
                ตรวจสอบความหวานตามเกณฑ์มาตรฐาน 7-Eleven (&gt; 6.0 %Brix) แบบเรียลไทม์ พร้อมบันทึกผลตรวจสารเคมีตกค้าง 2 หมวดหลักผ่าน Pop-up เชื่อมโยงสู่ FG และใบรับรอง COA อัตโนมัติ
              </p>
            </div>

            <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center justify-between gap-3 shrink-0 w-full lg:w-auto">
              <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-medium tabular-nums text-slate-700 bg-slate-50 sm:bg-transparent p-2.5 sm:p-0 rounded-lg sm:rounded-none w-full sm:w-auto">
                <div>
                  <span className="text-slate-500 sm:inline">หวานเฉลี่ย: </span>
                  <strong className="text-slate-900">
                    {labStats.avgBrix !== null
                      ? `${labStats.avgBrix.toFixed(2)} %`
                      : '-'}
                  </strong>
                </div>
                <span className="hidden sm:inline" aria-hidden="true">·</span>
                <div>
                  <span className="text-slate-500 sm:inline">ผ่าน: </span>
                  <strong className="text-emerald-700">{labStats.passAll} ล็อต</strong>
                </div>
                <span className="hidden sm:inline" aria-hidden="true">·</span>
                <div>
                  <span className="text-slate-500 sm:inline">รอตรวจ: </span>
                  <strong className="text-amber-700">{labStats.pendingAny} ล็อต</strong>
                </div>
                <span className="hidden sm:inline" aria-hidden="true">·</span>
                <div>
                  <span className="text-slate-500 sm:inline">FAIL: </span>
                  <strong className="text-red-700">{labStats.failAny} ล็อต</strong>
                </div>
              </div>
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
                <option value="">-- กรุณากดเลือกหมายเลขล็อตที่ต้องการตรวจ --</option>
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

          {/* Row 2: Separate Recording Stations for %Brix and Pesticide Residue */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Station 1: ช่องบันทึกระดับความหวาน (%Brix) */}
            <div className="lg:col-span-6 p-5 rounded-xl border border-slate-200 bg-slate-50/70 flex flex-col justify-between space-y-4 shadow-2xs">
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 mt-0.5">
                      <Gauge className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">
                        ช่องบันทึกระดับความหวาน (%Brix)
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        เครื่องวัดดิจิทัล Refractometer · เกณฑ์ 7-Eleven: &gt; 6.0 %Brix
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {brixInput.trim() !== '' && (
                      <button
                        type="button"
                        onClick={() => setBrixInput('')}
                        className="text-[11px] text-slate-500 hover:text-slate-800 underline"
                      >
                        ล้างค่า
                      </button>
                    )}
                    <span className="shrink-0">
                      {realtimeBrixStatus === 'PASS' ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>PASS</span>
                        </span>
                      ) : realtimeBrixStatus === 'FAIL' ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-red-700">
                          <XCircle className="w-3.5 h-3.5" />
                          <span>FAIL</span>
                        </span>
                      ) : (
                        <span className="text-xs text-amber-700 font-medium">รอตรวจ</span>
                      )}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="relative">
                    <input
                      id="lab-brix-input"
                      type="number"
                      min={0}
                      max={25}
                      step="any"
                      value={brixInput}
                      onChange={(e) => setBrixInput(e.target.value)}
                      placeholder="กรอกค่า %Brix อิสระ เช่น 6.8, 7.2"
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

                  {/* Clean, Quick Preset Buttons (6.2, 6.8, 7.5) */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] text-slate-500 font-medium">ค่าสำเร็จรูป:</span>
                    {[6.2, 6.8, 7.5].map((presetVal) => {
                      const isSelected = parsedBrix !== null && Math.abs(parsedBrix - presetVal) < 0.05;
                      return (
                        <button
                          key={presetVal}
                          type="button"
                          onClick={() =>
                            setBrixInput((prev) =>
                              prev.trim() === presetVal.toFixed(1) ? '' : presetVal.toFixed(1)
                            )
                          }
                          className={`h-7 px-2.5 text-xs font-semibold tabular-nums rounded-md border transition-all inline-flex items-center gap-1 shadow-2xs ${
                            isSelected
                              ? 'bg-emerald-600 text-white border-emerald-600 ring-1 ring-emerald-600 font-bold'
                              : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                          }`}
                          title={`คลิกเพื่อใส่ค่า ${presetVal.toFixed(1)} %Brix (คลิกซ้ำเพื่อยกเลิก)`}
                        >
                          <span>{presetVal.toFixed(1)}</span>
                          <span className="text-[10px] font-normal opacity-75">°Bx</span>
                        </button>
                      );
                    })}
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
                          ระงับตรายางดิจิทัล QA PASSED บนใบรับรอง COA อัตโนมัติ
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

              {/* Dedicated Brix Actions */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-200/80">
                <span className="text-[11px] text-slate-500">
                  บันทึกแยกเฉพาะความหวานโดยไม่กระทบผลตรวจสารเคมี
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSaveBrixOnly}
                    disabled={!activeLot}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-300 rounded-lg transition-colors inline-flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>บันทึกความหวาน (%Brix)</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Station 2: ช่องบันทึกผลตรวจสารเคมีตกค้าง 2 หมวดหลัก */}
            <div className="lg:col-span-6 p-5 rounded-xl border border-slate-200 bg-slate-50/70 flex flex-col justify-between space-y-4 shadow-2xs">
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 mt-0.5">
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-slate-900">
                        ผลตรวจสารเคมีตกค้าง 2 หมวดหลัก (Pesticide Residue)
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        ชุดทดสอบ GPO-TM Kit &amp; GT Test Kit · เชื่อมโยง OQC &amp; COA
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0">
                    {renderPesticideBadge(realtimePesticideStatus)}
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
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          setFormOpCb((prev) => (prev === 'PASS' ? null : 'PASS'))
                        }
                        className={`py-2 px-2.5 rounded-lg border text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                          formOpCb === 'PASS'
                            ? 'border-emerald-700 bg-emerald-50 text-emerald-900 shadow-2xs ring-1 ring-emerald-600'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                        title="คลิกเพื่อเลือก ผ่าน (PASS) หรือคลิกซ้ำเพื่อเว้นว่างผล"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                        <span>✓ ผ่าน (PASS)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setFormOpCb((prev) => (prev === 'FAIL' ? null : 'FAIL'))
                        }
                        className={`py-2 px-2.5 rounded-lg border text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                          formOpCb === 'FAIL'
                            ? 'border-red-700 bg-red-50 text-red-900 shadow-2xs ring-1 ring-red-600'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                        title="คลิกเพื่อเลือก ไม่ผ่าน (FAIL) หรือคลิกซ้ำเพื่อเว้นว่างผล"
                      >
                        <XCircle className="w-3.5 h-3.5 text-red-700 shrink-0" />
                        <span>✕ ไม่ผ่าน (FAIL)</span>
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
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          setFormOcPy((prev) => (prev === 'PASS' ? null : 'PASS'))
                        }
                        className={`py-2 px-2.5 rounded-lg border text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                          formOcPy === 'PASS'
                            ? 'border-emerald-700 bg-emerald-50 text-emerald-900 shadow-2xs ring-1 ring-emerald-600'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                        title="คลิกเพื่อเลือก ผ่าน (PASS) หรือคลิกซ้ำเพื่อเว้นว่างผล"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                        <span>✓ ผ่าน (PASS)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setFormOcPy((prev) => (prev === 'FAIL' ? null : 'FAIL'))
                        }
                        className={`py-2 px-2.5 rounded-lg border text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                          formOcPy === 'FAIL'
                            ? 'border-red-700 bg-red-50 text-red-900 shadow-2xs ring-1 ring-red-600'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                        title="คลิกเพื่อเลือก ไม่ผ่าน (FAIL) หรือคลิกซ้ำเพื่อเว้นว่างผล"
                      >
                        <XCircle className="w-3.5 h-3.5 text-red-700 shrink-0" />
                        <span>✕ ไม่ผ่าน (FAIL)</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Dedicated Pesticide Actions */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-200/80">
                <span className="text-[11px] text-slate-500">
                  บันทึกผลเคมีแยกเฉพาะส่วน
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleSavePesticideOnly}
                    disabled={!activeLot}
                    className="px-3 py-1.5 text-xs font-semibold text-white bg-[#007a55] hover:bg-[#006848] disabled:bg-slate-300 rounded-lg transition-colors inline-flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>บันทึกผลตรวจสารเคมีทันที</span>
                  </button>
                </div>
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
              <span className="font-bold tabular-nums tracking-tight">{selectedLotNumber}</span> (เชื่อมต่อไปยัง FG และใบรับรอง COA):
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
        <div className="p-5 border-b border-slate-200 flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                ตารางสรุปผลการวิเคราะห์ทางห้องปฏิบัติการ (QC LAB Summary Table)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                แสดงผลระดับความหวาน (%Brix) และผลตรวจสารเคมีตกค้างทั้ง 2 หมวดหลักของทุกล็อต พร้อมปุ่มเปิดหน้าต่าง Pop-up บันทึกผลสารตกค้างได้โดยตรง
              </p>
            </div>

            {/* Action Buttons: ส่งออก CSV, พิมพ์รายงาน & ส่งออก PDF */}
            <div className="flex flex-wrap items-center gap-2 shrink-0 w-full sm:w-auto">
              <button
                type="button"
                onClick={handleExportLabCsv}
                disabled={filteredRows.length === 0}
                className="h-9 px-3 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50 border border-emerald-300 rounded-lg shadow-2xs transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                title="ส่งออกผลการตรวจวิเคราะห์ห้องปฏิบัติการเป็นไฟล์ CSV สำหรับ Excel / Spreadsheet"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                <span>Export to CSV</span>
              </button>
              <button
                type="button"
                onClick={() => printWithClass('printing-lab-qc')}
                className="h-9 px-3 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg shadow-2xs transition-colors inline-flex items-center justify-center gap-1.5"
                title="พิมพ์ตารางสรุปผลวิเคราะห์ทางห้องปฏิบัติการ (Print Table)"
              >
                <Printer className="w-3.5 h-3.5 text-slate-600" />
                <span>พิมพ์รายงาน</span>
              </button>
              <button
                type="button"
                disabled={isExportingPdf}
                onClick={handleExportLabPdf}
                className="h-9 px-3 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-lg shadow-2xs transition-colors inline-flex items-center justify-center gap-1.5"
                title="ส่งออกรายงานผลแล็บเป็นไฟล์ PDF"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{isExportingPdf ? 'กำลังสร้าง PDF...' : 'ส่งออก PDF'}</span>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
            <div className="relative w-full sm:w-60">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="ค้นหาเลขล็อต / สายพันธุ์..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
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
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs font-semibold'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>

        {/* Desktop Table View (md+) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="py-3 px-4 text-xs">หมายเลขล็อต</th>
                <th className="py-3 px-4 text-xs">สายพันธุ์ (สี)</th>
                <th className="py-3 px-4 text-xs">วันที่รับเข้า</th>
                <th className="py-3 px-4 text-center text-xs">ความหวาน (%Brix)</th>
                <th className="py-3 px-4 text-center text-xs">Organophosphate &amp; Carbamate</th>
                <th className="py-3 px-4 text-center text-xs">Organochlorine &amp; Pyrethroid</th>
                <th className="py-3 px-4 text-center text-xs">สถานะสารตกค้างรวม</th>
                <th className="py-3 px-4 text-center text-xs">ดำเนินการ</th>
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

                    <td className="py-3 px-4 text-center tabular-nums whitespace-nowrap">
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

                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      {renderGroupBadge(lab.organophosphateCarbamate)}
                    </td>

                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      {renderGroupBadge(lab.organochlorinePyrethroid)}
                    </td>

                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      {renderPesticideBadge(lab.pesticideStatus)}
                    </td>

                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      <div className="inline-flex items-center justify-center gap-1.5">
                        {lab.overallLabStatus !== 'PASS' ? (
                          <button
                            type="button"
                            onClick={() => handlePendingAction(lot, lab)}
                            className="h-8 px-3 text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-lg transition-colors inline-flex items-center justify-center gap-1.5 shadow-2xs"
                            title="คลิกเพื่อบันทึกผลการตรวจสอบทางห้องปฏิบัติการ"
                          >
                            <Clock className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                            <span>รอผลตรวจ</span>
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>ผ่านเกณฑ์ครบถ้วน</span>
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => loadLotIntoForm(lot.lotNumber)}
                          className={`h-8 w-[104px] px-2.5 text-xs font-medium rounded-lg border transition-colors inline-flex items-center justify-center ${
                            isSelectedInForm
                              ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs font-semibold'
                              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          {isSelectedInForm ? 'กำลังเลือก' : 'เลือกเข้าฟอร์ม'}
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
          {filteredRows.map(({ lot, lab }) => {
            const v = TOMATO_VARIETIES[lot.varietyCode];
            const isSelectedInForm = lot.lotNumber === selectedLotNumber;

            return (
              <div
                key={lot.id}
                className={`bg-white border rounded-xl p-3.5 space-y-3 shadow-2xs transition-colors ${
                  isSelectedInForm
                    ? 'border-emerald-600 ring-2 ring-emerald-600'
                    : 'border-slate-200'
                }`}
              >
                {/* Header: Lot + Variety + Overall status badge */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-xs shrink-0"
                        style={{ backgroundColor: v.swatchHex }}
                      />
                      <span className="font-bold text-sm text-slate-900 tabular-nums">
                        {lot.lotNumber}
                      </span>
                    </div>
                    <div className="text-xs text-slate-600 mt-0.5">
                      <strong>{v.nameTh}</strong> ({v.colorLabelTh}) ·{' '}
                      <span className="text-[11px] text-slate-500 tabular-nums">
                        {formatThaiDate(lab.receivedDate || lot.receivedDate)}
                      </span>
                    </div>
                  </div>

                  <div>{renderOverallBadge(lab.overallLabStatus)}</div>
                </div>

                {/* Lab Measurements Grid on Mobile */}
                <div className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-200/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">
                      ระดับความหวาน (%Brix):
                    </span>
                    <span className="tabular-nums">
                      {lab.brixValue === null ? (
                        <span className="text-amber-700 font-medium">รอผลตรวจ</span>
                      ) : lab.brixValue > 6.0 ? (
                        <span className="text-emerald-700 font-bold">
                          {lab.brixValue.toFixed(1)} %Brix (ผ่าน)
                        </span>
                      ) : (
                        <span className="text-red-700 font-bold">
                          {lab.brixValue.toFixed(1)} %Brix (ไม่ผ่าน)
                        </span>
                      )}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
                    <span className="text-slate-500 font-medium">OP / CB:</span>
                    <div>{renderGroupBadge(lab.organophosphateCarbamate)}</div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">OC / PY:</span>
                    <div>{renderGroupBadge(lab.organochlorinePyrethroid)}</div>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
                    <span className="text-slate-500 font-medium">สารตกค้างรวม:</span>
                    <div>{renderPesticideBadge(lab.pesticideStatus)}</div>
                  </div>
                </div>

                {/* Mobile Action Buttons */}
                <div className="pt-1 border-t border-slate-100">
                  {lab.overallLabStatus !== 'PASS' ? (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handlePendingAction(lot, lab)}
                        className="h-9 px-2 text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-lg transition-colors inline-flex items-center justify-center gap-1.5 shadow-2xs"
                        title="คลิกเพื่อบันทึกผลการตรวจสอบทางห้องปฏิบัติการ"
                      >
                        <Clock className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                        <span>รอผลตรวจ</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => loadLotIntoForm(lot.lotNumber)}
                        className={`h-9 px-2 text-xs font-semibold rounded-lg border transition-colors inline-flex items-center justify-center ${
                          isSelectedInForm
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                            : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        {isSelectedInForm ? '✓ กำลังเลือก' : 'เลือกเข้าฟอร์ม'}
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>ผ่านเกณฑ์มาตรฐานครบถ้วน</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => loadLotIntoForm(lot.lotNumber)}
                        className={`h-8 px-3 text-xs font-semibold rounded-lg border transition-colors inline-flex items-center justify-center ${
                          isSelectedInForm
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                            : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        {isSelectedInForm ? '✓ กำลังเลือก' : 'เลือกเข้าฟอร์ม'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* POP-UP MODAL: ช่องบันทึกระดับความหวาน (%Brix) แยกเฉพาะส่วน */}
      {brixModalLot && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="brix-modal-title"
        >
          <form
            onSubmit={handleSaveBrixPopup}
            className="bg-white border border-slate-200 rounded-xl max-w-lg w-full max-h-[92vh] overflow-y-auto shadow-lg"
          >
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                  <Gauge className="w-4 h-4" />
                </div>
                <div>
                  <h3
                    id="brix-modal-title"
                    className="text-base font-semibold text-slate-900"
                  >
                    บันทึกระดับความหวาน (%Brix)
                  </h3>
                  <p className="text-xs text-slate-500 tabular-nums mt-0.5">
                    <span className="font-semibold text-slate-700">{brixModalLot.lotNumber}</span> — สายพันธุ์
                    {TOMATO_VARIETIES[brixModalLot.varietyCode].nameTh} (
                    {TOMATO_VARIETIES[brixModalLot.varietyCode].colorLabelTh})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBrixModalLot(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
                aria-label="ปิดหน้าต่าง"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* 7-Eleven Spec Banner */}
              <div className="p-3 rounded-lg bg-amber-50/80 border border-amber-200 text-amber-950 text-xs flex items-center justify-between gap-2">
                <span className="font-medium">ข้อกำหนด 7-Eleven (Brix Spec):</span>
                <span className="font-bold tabular-nums text-amber-900">&gt; 6.0 %Brix (ต้องมากกว่า 6.0)</span>
              </div>

              {/* Number Input & Presets */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-900">
                  ค่าระดับความหวานจากเครื่อง Refractometer (%Brix) *
                </label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type="number"
                      step="any"
                      min={0}
                      max={25}
                      autoFocus
                      value={draftBrixInput}
                      onChange={(e) => setDraftBrixInput(e.target.value)}
                      placeholder="กรอกค่า %Brix อิสระ เช่น 6.8, 7.2"
                      className="w-full px-4 py-2.5 pr-16 text-lg font-bold tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-500">
                      %Brix
                    </span>
                  </div>
                  {draftBrixInput.trim() !== '' && (
                    <button
                      type="button"
                      onClick={() => setDraftBrixInput('')}
                      className="px-2.5 py-2.5 text-xs text-slate-600 hover:bg-slate-100 border border-slate-300 rounded-lg"
                    >
                      ล้างค่า
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  <span className="text-[11px] text-slate-500 font-medium">ค่าสำเร็จรูป:</span>
                  {[6.2, 6.8, 7.5].map((v) => {
                    const num = draftBrixInput.trim() === '' ? null : parseFloat(draftBrixInput);
                    const isSelected = num !== null && Math.abs(num - v) < 0.05;
                    return (
                      <button
                        key={v}
                        type="button"
                        onClick={() =>
                          setDraftBrixInput((prev) =>
                            prev.trim() === v.toFixed(1) ? '' : v.toFixed(1)
                          )
                        }
                        className={`h-7 px-2.5 text-xs font-semibold tabular-nums rounded-md border transition-all inline-flex items-center gap-1 shadow-2xs ${
                          isSelected
                            ? 'bg-emerald-600 text-white border-emerald-600 ring-1 ring-emerald-600 font-bold'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                        title={`คลิกเพื่อใส่ค่า ${v.toFixed(1)} %Brix (คลิกซ้ำเพื่อยกเลิก)`}
                      >
                        <span>{v.toFixed(1)}</span>
                        <span className="text-[10px] font-normal opacity-75">°Bx</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Real-time Evaluation Readout */}
              {(() => {
                const num = draftBrixInput.trim() === '' ? null : parseFloat(draftBrixInput);
                const isFin = num !== null && Number.isFinite(num);
                if (!isFin) {
                  return (
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 text-xs flex items-center justify-between">
                      <span>สถานะ: ยังไม่ได้ระบุค่าความหวาน</span>
                      <span className="font-semibold text-amber-700">รอผลตรวจ (PENDING)</span>
                    </div>
                  );
                }
                if (num > 6.0) {
                  return (
                    <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs space-y-1">
                      <div className="flex items-center justify-between font-bold">
                        <span className="inline-flex items-center gap-1.5 text-emerald-800">
                          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                          <span>ผ่านเกณฑ์มาตรฐาน 7-Eleven ({num.toFixed(1)} %Brix &gt; 6.0 %Brix)</span>
                        </span>
                        <span className="text-emerald-800">PASS</span>
                      </div>
                      <p className="text-[11px] text-emerald-800">
                        ค่าความหวานผ่านเกณฑ์ อนุญาตให้ประทับตรา QA PASSED ได้เมื่อผลตรวจสารเคมีผ่านครบถ้วน
                      </p>
                    </div>
                  );
                }
                return (
                  <div className="p-3 rounded-lg bg-red-50 border border-red-300 text-red-900 text-xs space-y-1">
                    <div className="flex items-center justify-between font-bold">
                      <span className="inline-flex items-center gap-1.5 text-red-700">
                        <AlertTriangle className="w-4 h-4 text-red-700 shrink-0" />
                        <span>ไม่ผ่านเกณฑ์มาตรฐาน ({num.toFixed(1)} %Brix ≤ 6.0 %Brix)</span>
                      </span>
                      <span className="text-red-700">FAIL</span>
                    </div>
                    <p className="text-[11px] text-red-800">
                      ระบบจะส่งสถานะ FAIL ไปยังตารางสรุปผลแล็บ และระงับตรายางดิจิทัล QA PASSED บนใบรับรอง COA ทันที
                    </p>
                  </div>
                );
              })()}

              {/* Optional Refractometer / Lab Remarks */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  หมายเหตุการตรวจวัด / รหัสเครื่อง Refractometer (ถ้ามี)
                </label>
                <input
                  type="text"
                  value={draftBrixRemarks}
                  onChange={(e) => setDraftBrixRemarks(e.target.value)}
                  placeholder="เช่น เครื่องวัด Atago PAL-1, สุ่มตรวจ 5 ผล..."
                  className="w-full px-3.5 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setBrixModalLot(null)}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors inline-flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>ยืนยันบันทึกค่าความหวาน (%Brix)</span>
              </button>
            </div>
          </form>
        </div>
      )}

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
            className="bg-white border border-slate-200 rounded-xl max-w-xl w-full max-h-[92vh] overflow-y-auto shadow-lg"
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
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-900">
                    หมวดที่ 1: Organophosphate &amp; Carbamate *
                  </label>
                  {renderGroupBadge(draftOpCb)}
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() =>
                      setDraftOpCb((prev) => (prev === 'PASS' ? null : 'PASS'))
                    }
                    className={`py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 whitespace-nowrap transition-colors ${
                      draftOpCb === 'PASS'
                        ? 'border-emerald-700 bg-emerald-50 text-emerald-900 ring-1 ring-emerald-600 shadow-2xs'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                    title="คลิกเพื่อเลือก ผ่าน (PASS) หรือคลิกซ้ำเพื่อเว้นว่างผล"
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                    <span>✓ ผ่าน (PASS)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDraftOpCb((prev) => (prev === 'FAIL' ? null : 'FAIL'))
                    }
                    className={`py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 whitespace-nowrap transition-colors ${
                      draftOpCb === 'FAIL'
                        ? 'border-red-700 bg-red-50 text-red-900 ring-1 ring-red-600 shadow-2xs'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                    title="คลิกเพื่อเลือก ไม่ผ่าน (FAIL) หรือคลิกซ้ำเพื่อเว้นว่างผล"
                  >
                    <XCircle className="w-4 h-4 text-red-700 shrink-0" />
                    <span>✕ ไม่ผ่าน (FAIL)</span>
                  </button>
                </div>
              </div>

              {/* Group 2: Organochlorine & Pyrethroid */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-900">
                    หมวดที่ 2: Organochlorine &amp; Pyrethroid *
                  </label>
                  {renderGroupBadge(draftOcPy)}
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() =>
                      setDraftOcPy((prev) => (prev === 'PASS' ? null : 'PASS'))
                    }
                    className={`py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 whitespace-nowrap transition-colors ${
                      draftOcPy === 'PASS'
                        ? 'border-emerald-700 bg-emerald-50 text-emerald-900 ring-1 ring-emerald-600 shadow-2xs'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                    title="คลิกเพื่อเลือก ผ่าน (PASS) หรือคลิกซ้ำเพื่อเว้นว่างผล"
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                    <span>✓ ผ่าน (PASS)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDraftOcPy((prev) => (prev === 'FAIL' ? null : 'FAIL'))
                    }
                    className={`py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 whitespace-nowrap transition-colors ${
                      draftOcPy === 'FAIL'
                        ? 'border-red-700 bg-red-50 text-red-900 ring-1 ring-red-600 shadow-2xs'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                    title="คลิกเพื่อเลือก ไม่ผ่าน (FAIL) หรือคลิกซ้ำเพื่อเว้นว่างผล"
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
                    : 'border-slate-200 bg-slate-50 text-slate-700'
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
                      : '- (เว้นว่างไว้ ยังไม่ระบุผล)'}
                  </span>
                </div>
                <p className="text-[11px] opacity-90">
                  {modalPreviewPestStatus === 'FAIL'
                    ? 'แจ้งเตือน: ระบบจะส่งสถานะ FAIL ไปยังตารางสรุปผลแล็บ, FG และระงับตรายางดิจิทัล QA PASSED บนใบรับรอง COA ทันที'
                    : modalPreviewPestStatus === 'PASS'
                    ? 'ผลลัพธ์จะเชื่อมต่อไปยังตารางสรุปผลแล็บ, FG และใบรับรอง COA ทันที'
                    : 'ยังไม่ได้ระบุผลตรวจครบถ้วน สามารถเลือกผลตรวจหรือเว้นว่างไว้ได้'}
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

      {/* Printable Sheet for Lab QC (Laboratory Test Report) */}
      <div
        id="lab-qc-report-sheet"
        className="fixed top-0 left-[-10000px] w-[794px] p-6 bg-white text-slate-900 font-sans pointer-events-none -z-50"
      >
        {/* Header */}
        <div className="border-b-2 border-slate-900 pb-3 mb-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-blue-700 text-white mb-1">
                7-ELEVEN / CP ALL LABORATORY STANDARDS
              </div>
              <h1 className="text-lg font-bold text-slate-900 leading-tight">
                รายงานผลการทดสอบทางห้องปฏิบัติการ (QC Laboratory Report)
              </h1>
              <p className="text-[11px] text-slate-600 mt-0.5">
                การวิเคราะห์ความหวาน (%Brix &gt; 6.0) และสารเคมีตกค้าง 2 หมวด (Organophosphate/Carbamate &amp; Organochlorine/Pyrethroid)
              </p>
            </div>
            <div className="text-right">
              <div className="text-xs font-bold text-slate-900 font-mono">
                DOC: LAB-{new Date().toISOString().slice(2, 10).replace(/-/g, '')}
              </div>
              <div className="text-[10px] text-slate-500">
                พิมพ์เมื่อ: {formatThaiDate(new Date().toISOString())}
              </div>
              <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-800 border border-slate-300">
                ตัวกรอง: {statusFilter === 'ALL' ? 'ทุกล็อต' : statusFilter} ({filteredRows.length} ล็อต) · ผ่าน: {labStats.passAll} ล็อต
              </div>
            </div>
          </div>
        </div>

        {/* KPI Grid */}
        <div className="grid grid-cols-5 gap-2 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs mb-4">
          <div>
            <span className="text-[10px] text-slate-500 block">ล็อตที่แสดง:</span>
            <span className="font-bold text-slate-800 text-sm">{filteredRows.length} ล็อต</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 block">ความหวานเฉลี่ย:</span>
            <span className="font-bold text-slate-800 text-sm">
              {labStats.avgBrix !== null ? `${labStats.avgBrix.toFixed(2)} %Brix` : '-'}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 block">ผ่านเกณฑ์ (PASS):</span>
            <span className="font-bold text-emerald-700 text-sm">{labStats.passAll} ล็อต</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 block">รอผลตรวจ:</span>
            <span className="font-bold text-amber-700 text-sm">{labStats.pendingAny} ล็อต</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 block">ไม่ผ่าน (FAIL):</span>
            <span className="font-bold text-red-700 text-sm">{labStats.failAny} ล็อต</span>
          </div>
        </div>

        {/* Detailed Table */}
        <div className="mb-4">
          <table className="w-full text-left border-collapse text-[10px] border border-slate-300">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-300 text-slate-700 font-semibold">
                <th className="py-1 px-2 border-r border-slate-300">หมายเลขล็อต</th>
                <th className="py-1 px-2 border-r border-slate-300">สายพันธุ์ / สี</th>
                <th className="py-1 px-2 border-r border-slate-300">วันที่รับเข้า</th>
                <th className="py-1 px-2 border-r border-slate-300 text-center">ความหวาน (%Brix)</th>
                <th className="py-1 px-2 border-r border-slate-300 text-center">หมวด 1 (OP &amp; CB)</th>
                <th className="py-1 px-2 border-r border-slate-300 text-center">หมวด 2 (OC &amp; PY)</th>
                <th className="py-1 px-2 text-center">ผลรวม</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-mono">
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-4 text-center text-slate-500 font-sans">
                    ไม่พบข้อมูลผลตรวจแล็บที่ตรงกับเงื่อนไขการค้นหา
                  </td>
                </tr>
              ) : (
                filteredRows.map(({ lot, lab }) => {
                  const v = TOMATO_VARIETIES[lot.varietyCode];
                  const brixVal = lab.brixValue;
                  const brixSt = lab.brixStatus;
                  const opCb = lab.organophosphateCarbamate;
                  const ocPy = lab.organochlorinePyrethroid;
                  const overall = lab.overallLabStatus;

                  return (
                  <tr key={lot.lotNumber} className="border-b border-slate-200">
                    <td className="py-1 px-2 font-bold text-slate-900 border-r border-slate-300">
                      {lot.lotNumber}
                    </td>
                    <td className="py-1 px-2 font-sans font-medium text-slate-800 border-r border-slate-300">
                      {v?.nameTh || lot.varietyCode} ({v?.colorLabelTh})
                    </td>
                    <td className="py-1 px-2 font-sans text-slate-600 border-r border-slate-300">
                      {formatThaiDate(lot.receivedDate)}
                    </td>
                    <td className="py-1 px-2 text-center border-r border-slate-300">
                      <span
                        className={`inline-block px-1 py-0.2 rounded font-bold ${
                          brixSt === 'PASS'
                            ? 'text-emerald-700'
                            : brixSt === 'FAIL'
                            ? 'text-red-700'
                            : 'text-amber-700'
                        }`}
                      >
                        {brixVal !== null ? `${brixVal.toFixed(1)} %` : '-'} ({brixSt})
                      </span>
                    </td>
                    <td className="py-1 px-2 text-center border-r border-slate-300">
                      <span
                        className={`font-bold ${
                          opCb === 'PASS'
                            ? 'text-emerald-700'
                            : opCb === 'FAIL'
                            ? 'text-red-700'
                            : 'text-slate-400'
                        }`}
                      >
                        {opCb || '-'}
                      </span>
                    </td>
                    <td className="py-1 px-2 text-center border-r border-slate-300">
                      <span
                        className={`font-bold ${
                          ocPy === 'PASS'
                            ? 'text-emerald-700'
                            : ocPy === 'FAIL'
                            ? 'text-red-700'
                            : 'text-slate-400'
                        }`}
                      >
                        {ocPy || '-'}
                      </span>
                    </td>
                    <td className="py-1 px-2 text-center font-sans">
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold ${
                          overall === 'PASS'
                            ? 'bg-emerald-100 text-emerald-800'
                            : overall === 'FAIL'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {overall}
                      </span>
                    </td>
                  </tr>
                );
              }))}
            </tbody>
          </table>
        </div>

        {/* Standards Criteria Footer Note */}
        <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-[10px] text-slate-600 mb-4 leading-relaxed">
          <strong>เกณฑ์การตัดสิน (Acceptance Criteria):</strong>
          <ul className="list-disc pl-4 mt-0.5 space-y-0.5">
            <li>ความหวาน (%Brix): ต้องไม่น้อยกว่า 6.0 %Brix (Refractometer Digital Brix meter)</li>
            <li>สารเคมีตกค้าง 2 หมวด: ต้องผ่าน (PASS / ไม่พบสารตกค้าง) ทั้ง 2 หมวด จึงจะถือว่าผ่านเกณฑ์เพื่อปล่อยสู่กระบวนการแพ็ค Finish Good</li>
          </ul>
        </div>

        {/* Signatures */}
        <div className="grid grid-cols-2 gap-6 pt-4 border-t border-slate-300 text-center text-xs">
          <div>
            <div className="border-b border-slate-400 w-48 mx-auto mb-1"></div>
            <p className="font-semibold text-slate-800">{analystName || 'น.ส.วิชุตา เหล่าศรี'}</p>
            <p className="text-[10px] text-slate-500">นักวิเคราะห์ห้องปฏิบัติการ (Lab Analyst)</p>
          </div>
          <div>
            <div className="border-b border-slate-400 w-48 mx-auto mb-1"></div>
            <p className="font-semibold text-slate-800">ภญ.พิมลวรรณ สิริพงษ์</p>
            <p className="text-[10px] text-slate-500">ผู้จัดการฝ่ายประกันคุณภาพ (QA Manager)</p>
          </div>
        </div>
      </div>
    </div>
  );
};
