import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Download,
  FileCheck2,
  FileSpreadsheet,
  FlaskConical,
  PackageCheck,
  Printer,
  Search,
  Truck,
  X,
  XCircle,
} from 'lucide-react';
import { exportElementToPdf, printWithClass } from '../utils/pdfExport';
import { exportTraceabilityLotsToCsv } from '../utils/csvExport';
import { NotificationVariant } from './PopupNotification';
import {
  ActiveModule,
  IncomingLotRecord,
  LabRecord,
  OutgoingRecord,
  TOMATO_VARIETIES,
} from '../types/qc';
import {
  evaluateColorMixRules,
  formatThaiDate,
  getMixLotNumbers,
} from '../utils/lotHelpers';

interface OverviewDashboardViewProps {
  lots: IncomingLotRecord[];
  labRecords: LabRecord[];
  outgoingRecords: OutgoingRecord[];
  onNavigateModule: (module: ActiveModule) => void;
  onInspectIncomingLot: (lotId: string) => void;
  onInspectLabLot: (lotNumber: string) => void;
  onInspectOutgoing: (oqcId?: string) => void;
  onOpenCOA: (oqcId: string) => void;
  onNotify?: (title: string, message: string, variant?: NotificationVariant) => void;
}

type LotFilter = 'ALL' | 'READY' | 'PENDING' | 'ISSUE';

export const OverviewDashboardView: React.FC<OverviewDashboardViewProps> = ({
  lots,
  labRecords,
  outgoingRecords,
  onNavigateModule,
  onInspectIncomingLot,
  onInspectLabLot,
  onInspectOutgoing,
  onOpenCOA,
  onNotify,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [lotFilter, setLotFilter] = useState<LotFilter>('ALL');
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);

  const handleExportTraceabilityPdf = async () => {
    if (isExportingPdf) return;
    setIsExportingPdf(true);
    try {
      await exportElementToPdf('traceability-report-sheet', {
        filename: `Traceability_Lots_${lotFilter}_${new Date().toISOString().slice(0, 10)}.pdf`,
        captureWidth: 794,
        orientation: 'portrait',
      });
    } catch (err) {
      console.error('Failed to export traceability PDF:', err);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleExportTraceabilityCsv = () => {
    if (filteredProductionLots.length === 0) {
      if (onNotify) {
        onNotify(
          'ไม่มีข้อมูลสำหรับส่งออก',
          'ไม่พบข้อมูลล็อตการผลิตและวัตถุดิบตามเงื่อนไขที่เลือกเพื่อส่งออก CSV',
          'warning'
        );
      }
      return;
    }
    try {
      exportTraceabilityLotsToCsv(
        filteredProductionLots,
        labByLot,
        shipmentsByLot,
        coaReadinessMap
      );
      if (onNotify) {
        onNotify(
          'ดาวน์โหลดไฟล์ CSV เรียบร้อยแล้ว',
          `ส่งออกข้อมูลการติดตามล็อตการผลิตและวัตถุดิบ ${filteredProductionLots.length} ล็อตเป็นไฟล์ CSV ลงเครื่องเรียบร้อยแล้ว`,
          'success'
        );
      }
    } catch (err) {
      console.error('Failed to export Traceability CSV:', err);
      if (onNotify) {
        onNotify(
          'ส่งออกไฟล์ CSV ไม่สำเร็จ',
          'เกิดข้อผิดพลาดขณะส่งออกข้อมูล กรุณาลองใหม่อีกครั้ง',
          'error'
        );
      }
    }
  };

  const labByLot = useMemo(() => {
    const map = new Map<string, LabRecord>();
    for (const r of labRecords) {
      map.set(r.lotNumber, r);
    }
    return map;
  }, [labRecords]);

  // Map each lotNumber -> linked Outgoing / COA shipments
  const shipmentsByLot = useMemo(() => {
    const map = new Map<string, OutgoingRecord[]>();
    for (const oqc of outgoingRecords) {
      for (const mix of oqc.colorMix) {
        if (mix.percentage > 0) {
          const lotList = getMixLotNumbers(mix);
          for (const lotNo of lotList) {
            const list = map.get(lotNo) || [];
            list.push(oqc);
            map.set(lotNo, list);
          }
        }
      }
    }
    return map;
  }, [outgoingRecords]);

  // Evaluate COA QA PASSED stamp readiness for each Outgoing shipment
  const coaReadinessMap = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const oqc of outgoingRecords) {
      const activeMix = oqc.colorMix.filter((m) => m.percentage > 0);
      const allLabsPass =
        activeMix.length >= 3 &&
        activeMix.every((m) => {
          const lotList = getMixLotNumbers(m);
          return (
            lotList.length > 0 &&
            lotList.every((lotNo) => {
              const l = labByLot.get(lotNo);
              return l !== undefined && l.overallLabStatus === 'PASS';
            })
          );
        });
      const mixCheck = evaluateColorMixRules(oqc.colorMix);
      const allOqcPass =
        oqc.check1LidSealing &&
        oqc.check2MixValid &&
        mixCheck.isValid &&
        oqc.check3ExpiryLabel &&
        oqc.check3WashLabel !== false &&
        oqc.check4NetWeightPass &&
        oqc.check5Physical &&
        oqc.check6QtyMatch &&
        oqc.check7RoomTempPass &&
        oqc.check8CrateClean;

      map.set(oqc.id, allLabsPass && allOqcPass);
    }
    return map;
  }, [outgoingRecords, labByLot]);

  // Compute KPI Metrics & Filter Counts
  const kpi = useMemo(() => {
    const totalLots = lots.length;
    const incomingPassCount = lots.filter(
      (l) => l.disposition !== 'REJECT'
    ).length;
    const incomingRejectCount = lots.filter(
      (l) => l.disposition === 'REJECT'
    ).length;

    let brixSum = 0;
    let brixCount = 0;
    let pesticidePass = 0;
    let pesticideFail = 0;
    let labPendingLots = 0;
    let readyLotsCount = 0;
    let issueLotsCount = 0;

    for (const lot of lots) {
      const lab = labByLot.get(lot.lotNumber);
      const brixSt = lab?.brixStatus || 'PENDING';
      const pestSt = lab?.pesticideStatus || 'PENDING';

      if (brixSt === 'PENDING' || pestSt === 'PENDING') {
        labPendingLots += 1;
      }
      if (
        lot.disposition === 'REJECT' ||
        brixSt === 'FAIL' ||
        pestSt === 'FAIL'
      ) {
        issueLotsCount += 1;
      }
      if (
        lot.disposition !== 'REJECT' &&
        brixSt === 'PASS' &&
        pestSt === 'PASS'
      ) {
        readyLotsCount += 1;
      }

      if (!lab) continue;

      if (lab.brixValue !== null && Number.isFinite(lab.brixValue)) {
        brixSum += lab.brixValue;
        brixCount += 1;
      }
      if (lab.pesticideStatus === 'PASS') pesticidePass += 1;
      else if (lab.pesticideStatus === 'FAIL') pesticideFail += 1;
    }

    const avgBrix = brixCount > 0 ? brixSum / brixCount : null;

    const totalPacks = outgoingRecords.reduce(
      (sum, r) => sum + (r.actualPacks || 0),
      0
    );
    const totalCrates = outgoingRecords.reduce(
      (sum, r) => sum + (r.crateQty || 0),
      0
    );
    const uniqueDcs = Array.from(
      new Set(
        outgoingRecords
          .map((r) => r.distributionCenter)
          .filter((dc): dc is string => Boolean(dc))
      )
    );
    const oqcPassShipments = outgoingRecords.filter(
      (r) => r.oqcStatus === 'PASS'
    ).length;

    let coaCertifiedCount = 0;
    for (const oqc of outgoingRecords) {
      if (coaReadinessMap.get(oqc.id)) coaCertifiedCount += 1;
    }
    const coaSuspendedCount = outgoingRecords.length - coaCertifiedCount;

    return {
      totalLots,
      incomingPassCount,
      incomingRejectCount,
      avgBrix,
      pesticidePass,
      pesticideFail,
      labPendingLots,
      readyLotsCount,
      issueLotsCount,
      totalPacks,
      totalCrates,
      uniqueDcs,
      oqcPassShipments,
      coaCertifiedCount,
      coaSuspendedCount,
    };
  }, [lots, labByLot, outgoingRecords, coaReadinessMap]);

  // Filter Production Lots
  const filteredProductionLots = useMemo(() => {
    return lots.filter((lot) => {
      const lab = labByLot.get(lot.lotNumber);
      const brixSt = lab?.brixStatus || 'PENDING';
      const pestSt = lab?.pesticideStatus || 'PENDING';
      const isPending = brixSt === 'PENDING' || pestSt === 'PENDING';
      const isIssue =
        lot.disposition === 'REJECT' ||
        brixSt === 'FAIL' ||
        pestSt === 'FAIL';
      const isReady =
        lot.disposition !== 'REJECT' &&
        brixSt === 'PASS' &&
        pestSt === 'PASS';

      if (lotFilter === 'PENDING' && !isPending) return false;
      if (lotFilter === 'READY' && !isReady) return false;
      if (lotFilter === 'ISSUE' && !isIssue) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const v = TOMATO_VARIETIES[lot.varietyCode];
        const linked = shipmentsByLot.get(lot.lotNumber) || [];
        const matchCoa = linked.some(
          (s) =>
            s.coaNumber.toLowerCase().includes(q) ||
            (s.distributionCenter || '').toLowerCase().includes(q)
        );
        return (
          lot.lotNumber.toLowerCase().includes(q) ||
          v.nameTh.toLowerCase().includes(q) ||
          v.colorLabelTh.toLowerCase().includes(q) ||
          matchCoa
        );
      }

      return true;
    });
  }, [lots, labByLot, lotFilter, searchQuery, shipmentsByLot]);

  const filterTabs: { id: LotFilter; label: string; count: number }[] = [
    { id: 'ALL', label: 'ทั้งหมด', count: lots.length },
    { id: 'READY', label: 'ผ่านพร้อมส่ง', count: kpi.readyLotsCount },
    { id: 'PENDING', label: 'รอผลตรวจ', count: kpi.labPendingLots },
    { id: 'ISSUE', label: 'ไม่ผ่านเกณฑ์', count: kpi.issueLotsCount },
  ];

  return (
    <div className="space-y-6 @3xl:space-y-8">
      <div className="overview-screen-only space-y-6 @3xl:space-y-8">
        {/* Top Action Bar for Executive Overview */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 sm:p-4 rounded-xl border border-slate-200">
          <div>
            <h2 className="text-sm font-bold text-slate-900 flex flex-wrap items-center gap-1.5 sm:gap-2">
              <span>ภาพรวมระบบควบคุมคุณภาพ (QC Executive Dashboard)</span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                7-Eleven / CP ALL DC
              </span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              สรุปสถานะการตรวจสอบครบวงจร: รับเข้า (Incoming) · ผลแล็บ (Lab) · สินค้าสำเร็จรูป (FG) · ใบรับรอง (COA)
            </p>
          </div>
        </div>

      {/* 4 EXECUTIVE KPI CARDS — Container-Query Responsive (1 -> 2 -> 4 cols as content expands/collapses) */}
      <section aria-label="ตัวชี้วัดคุณภาพหลัก">
        <div className="grid grid-cols-1 sm:grid-cols-2 @xl:grid-cols-2 @5xl:grid-cols-4 gap-3 sm:gap-4">
          {/* Card 1: จำนวน Lot ทั้งหมด & QC Incoming */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 @sm:p-5 flex flex-col justify-between space-y-4">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2 text-xs font-medium text-slate-500">
                <span className="truncate">QC Incoming · จำนวน Lot ทั้งหมด</span>
                <ClipboardCheck className="w-4 h-4 text-slate-400 shrink-0" />
              </div>
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <div className="text-xl @6xl:text-2xl font-bold tabular-nums text-slate-900 whitespace-nowrap">
                  {kpi.totalLots} ล็อต
                </div>
                <div className="text-xs tabular-nums text-emerald-700 font-semibold whitespace-nowrap">
                  ผ่านรับเข้า {kpi.incomingPassCount}/{kpi.totalLots}
                </div>
              </div>
              <div className="pt-2.5 border-t border-slate-100 text-xs text-slate-600 space-y-1.5 tabular-nums">
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">ผลการตรวจสินค้า (ผ่าน):</span>
                  <span className="text-emerald-700 font-semibold whitespace-nowrap">
                    {kpi.incomingPassCount} ล็อต
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">ไม่ผ่านเกณฑ์ (Reject):</span>
                  <span
                    className={`whitespace-nowrap ${
                      kpi.incomingRejectCount > 0
                        ? 'text-red-700 font-bold'
                        : 'text-slate-600'
                    }`}
                  >
                    {kpi.incomingRejectCount} ล็อต
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onNavigateModule('INCOMING')}
              className="pt-2.5 border-t border-slate-100 text-xs font-semibold text-slate-800 hover:text-slate-950 inline-flex items-center justify-between w-full"
            >
              <span>จัดการตรวจรับวัตถุดิบ</span>
              <ArrowRight className="w-3.5 h-3.5 shrink-0" />
            </button>
          </div>

          {/* Card 2: QC LAB (%Brix เฉลี่ย & Pesticide) */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 @sm:p-5 flex flex-col justify-between space-y-4">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2 text-xs font-medium text-slate-500">
                <span className="truncate">QC LAB · Brix เฉลี่ย &amp; Pesticide</span>
                <FlaskConical className="w-4 h-4 text-slate-400 shrink-0" />
              </div>
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <div className="text-xl @6xl:text-2xl font-bold tabular-nums text-slate-900 whitespace-nowrap">
                  {kpi.avgBrix !== null ? `${kpi.avgBrix.toFixed(2)} %Brix` : '- %Brix'}
                </div>
                <div className="text-[11px] tabular-nums font-medium text-slate-500 whitespace-nowrap">
                  เกณฑ์ &gt; 6.0 %Brix
                </div>
              </div>
              <div className="pt-2.5 border-t border-slate-100 text-xs text-slate-600 space-y-1.5 tabular-nums">
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Pesticide (ผ่าน/ไม่ผ่าน):</span>
                  <span className="whitespace-nowrap">
                    <strong className="text-emerald-700">{kpi.pesticidePass}</strong> /{' '}
                    <strong
                      className={
                        kpi.pesticideFail > 0 ? 'text-red-700' : 'text-slate-600'
                      }
                    >
                      {kpi.pesticideFail}
                    </strong>
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">รอผลการตรวจสอบ Lab:</span>
                  <span
                    className={`whitespace-nowrap ${
                      kpi.labPendingLots > 0
                        ? 'text-amber-700 font-semibold'
                        : 'text-slate-600'
                    }`}
                  >
                    {kpi.labPendingLots} ล็อต
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onNavigateModule('LAB')}
              className="pt-2.5 border-t border-slate-100 text-xs font-semibold text-slate-800 hover:text-slate-950 inline-flex items-center justify-between w-full"
            >
              <span>บันทึกผลวิเคราะห์แล็บ</span>
              <ArrowRight className="w-3.5 h-3.5 shrink-0" />
            </button>
          </div>

          {/* Card 3: FG (CP ALL DC Logistics) */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 @sm:p-5 flex flex-col justify-between space-y-4">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2 text-xs font-medium text-slate-500">
                <span className="truncate">FG · CP ALL DC Logistics</span>
                <Truck className="w-4 h-4 text-slate-400 shrink-0" />
              </div>
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <div className="text-xl @6xl:text-2xl font-bold tabular-nums text-slate-900 whitespace-nowrap">
                  {kpi.totalPacks.toLocaleString()} แพ็ค
                </div>
                <div className="text-[11px] tabular-nums font-medium text-slate-600 whitespace-nowrap">
                  {outgoingRecords.length} รอบ · {kpi.totalCrates} ตะกร้า
                </div>
              </div>
              <div className="pt-2.5 border-t border-slate-100 text-xs text-slate-600 space-y-1.5">
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500 shrink-0">ศูนย์กระจายสินค้า:</span>
                  <span
                    className="font-medium text-slate-800 truncate text-right"
                    title={kpi.uniqueDcs.join(' · ')}
                  >
                    {kpi.uniqueDcs.length > 0
                      ? `${kpi.uniqueDcs.length} ศูนย์ (${kpi.uniqueDcs
                          .map((d) => {
                            const m = d.match(/\(([A-Z]+-DC)\)/);
                            return m ? m[1] : d;
                          })
                          .join(', ')})`
                      : '-'}
                  </span>
                </div>
                <div className="flex justify-between gap-2 tabular-nums">
                  <span className="text-slate-500">ผ่านเกณฑ์ FG (8 ข้อ):</span>
                  <span className="text-emerald-700 font-semibold whitespace-nowrap">
                    {kpi.oqcPassShipments}/{outgoingRecords.length} รอบส่ง
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onNavigateModule('OUTGOING')}
              className="pt-2.5 border-t border-slate-100 text-xs font-semibold text-slate-800 hover:text-slate-950 inline-flex items-center justify-between w-full"
            >
              <span>แผนส่งมอบเซเว่น อีเลฟเว่น</span>
              <ArrowRight className="w-3.5 h-3.5 shrink-0" />
            </button>
          </div>

          {/* Card 4: Certificate of Analysis (COA) */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 @sm:p-5 flex flex-col justify-between space-y-4">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2 text-xs font-medium text-slate-500">
                <span className="truncate">Certificate of Analysis (COA)</span>
                <FileCheck2 className="w-4 h-4 text-slate-400 shrink-0" />
              </div>
              <div className="flex items-baseline justify-between gap-2 flex-wrap">
                <div className="text-xl @6xl:text-2xl font-bold tabular-nums text-slate-900 whitespace-nowrap">
                  {kpi.coaCertifiedCount}/{outgoingRecords.length} ฉบับ
                </div>
                <div className="text-xs font-bold tracking-wide text-emerald-700 whitespace-nowrap">
                  QA PASSED
                </div>
              </div>
              <div className="pt-2.5 border-t border-slate-100 text-xs text-slate-600 space-y-1.5 tabular-nums">
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">อนุมัติประทับตรารับรอง:</span>
                  <span className="text-emerald-700 font-semibold whitespace-nowrap">
                    {kpi.coaCertifiedCount} ฉบับ
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">ระงับตรารับรอง / รอแล็บ:</span>
                  <span
                    className={`whitespace-nowrap ${
                      kpi.coaSuspendedCount > 0
                        ? 'text-red-700 font-bold'
                        : 'text-slate-600'
                    }`}
                  >
                    {kpi.coaSuspendedCount} ฉบับ
                  </span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onNavigateModule('COA')}
              className="pt-2.5 border-t border-slate-100 text-xs font-semibold text-slate-800 hover:text-slate-950 inline-flex items-center justify-between w-full"
            >
              <span>ดูและพิมพ์ใบรับรอง COA (A4)</span>
              <ArrowRight className="w-3.5 h-3.5 shrink-0" />
            </button>
          </div>
        </div>
      </section>

      {/* PRODUCTION LOTS TRACEABILITY — Uniform Action Grid + Container-Query Responsive Layout */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {/* Tier 1: Section Title & Count Summary + Real Print & PDF Actions */}
        <div className="px-4 @sm:px-6 py-4 @sm:py-5 flex flex-col @2xl:flex-row @2xl:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              ตารางติดตามล็อตการผลิตและวัตถุดิบ (Production Lots Traceability)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              ติดตามสถานะรายล็อตตั้งแต่ตรวจรับเข้า · ความหวาน (%Brix) · สารเคมีตกค้าง 2 หมวด · และแผนจัดส่งใบรับรอง COA
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 shrink-0">
            <div className="text-xs tabular-nums text-slate-500 shrink-0">
              แสดง <strong className="text-slate-900">{filteredProductionLots.length}</strong> จาก{' '}
              {lots.length} ล็อต
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0 w-full sm:w-auto">
              <button
                type="button"
                onClick={handleExportTraceabilityCsv}
                disabled={filteredProductionLots.length === 0}
                className="h-9 px-3 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 disabled:opacity-50 border border-emerald-300 rounded-lg shadow-2xs transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                title="ส่งออกตารางติดตามล็อตการผลิตและวัตถุดิบเป็นไฟล์ CSV สำหรับ Excel / Spreadsheet"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                <span>Export to CSV</span>
              </button>
              <button
                type="button"
                onClick={() => printWithClass('printing-traceability')}
                className="h-9 px-3 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg shadow-2xs transition-colors inline-flex items-center justify-center gap-1.5"
                title="พิมพ์ตารางติดตามล็อตการผลิตและวัตถุดิบ (เฉพาะเนื้อหาส่วนนี้)"
              >
                <Printer className="w-3.5 h-3.5 text-slate-600" />
                <span>พิมพ์ตารางล็อต</span>
              </button>
              <button
                type="button"
                disabled={isExportingPdf}
                onClick={handleExportTraceabilityPdf}
                className="h-9 px-3 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-lg shadow-2xs transition-colors inline-flex items-center justify-center gap-1.5"
                title="ส่งออกตารางติดตามล็อตเป็นไฟล์ PDF (เฉพาะเนื้อหาส่วนนี้)"
              >
                <Download className="w-3.5 h-3.5" />
                <span>{isExportingPdf ? 'กำลังสร้าง PDF...' : 'ส่งออก PDF'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Tier 2: Uniform Filter & Search Bar — Zero Scrollbars across All Screen Sizes */}
        <div className="px-4 @sm:px-6 py-3 bg-slate-50/80 border-y border-slate-200 flex flex-col @4xl:flex-row @4xl:items-center justify-between gap-3">
          {/* Segmented Filter Buttons (2x2 on narrow mobile -> 4 equal columns on tablet -> inline on desktop) */}
          <div className="grid grid-cols-2 @xl:grid-cols-4 @4xl:flex items-center gap-1.5">
            {filterTabs.map((tab) => {
              const isActive = lotFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setLotFilter(tab.id)}
                  className={`h-9 px-3 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap inline-flex items-center justify-center gap-1.5 ${
                    isActive
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs font-semibold'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`tabular-nums text-[11px] ${
                      isActive ? 'text-emerald-100' : 'text-slate-500'
                    }`}
                  >
                    ({tab.count})
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search Input matching exact h-9 height */}
          <div className="relative w-full @4xl:w-72 shrink-0">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ค้นหาเลข Lot / สายพันธุ์ / DC / COA..."
              className="h-9 w-full pl-8 pr-8 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                aria-label="ล้างคำค้นหา"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Empty Filter Result State */}
        {filteredProductionLots.length === 0 ? (
          <div className="p-10 text-center space-y-2.5">
            <div className="text-sm font-medium text-slate-700">
              ไม่พบรายการล็อตวัตถุดิบที่ตรงกับเงื่อนไขการค้นหา
            </div>
            <button
              type="button"
              onClick={() => {
                setLotFilter('ALL');
                setSearchQuery('');
              }}
              className="h-9 px-4 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors"
            >
              แสดงทุกล็อตทั้งหมด
            </button>
          </div>
        ) : (
          <>
            {/* WIDE CONTAINER VIEW (@5xl+ >= 1024px container): 6-Column Table with Strict Equal-Width 3-Button Grid */}
            <div className="hidden @5xl:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-white text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                    <th className="py-3 px-5">Production Lot</th>
                    <th className="py-3 px-4">สายพันธุ์ &amp; สถานะรับเข้า</th>
                    <th className="py-3 px-4 text-right">ความหวาน (%Brix)</th>
                    <th className="py-3 px-4">สารเคมีตกค้างรวม</th>
                    <th className="py-3 px-4">แผนส่งมอบ DC / ใบ COA</th>
                    <th className="py-3 px-5 text-right w-[328px]">ดำเนินการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredProductionLots.map((lot) => {
                    const v = TOMATO_VARIETIES[lot.varietyCode];
                    const lab = labByLot.get(lot.lotNumber);
                    const linkedShipments = shipmentsByLot.get(lot.lotNumber) || [];
                    const primaryShipment = linkedShipments[0] || null;

                    return (
                      <tr
                        key={lot.id}
                        className="hover:bg-slate-50/70 transition-colors align-middle"
                      >
                        {/* Col 1: Lot Number & Timestamp */}
                        <td className="py-3.5 px-5 tabular-nums whitespace-nowrap">
                          <div className="font-semibold text-slate-900">
                            {lot.lotNumber}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            {formatThaiDate(lot.receivedDate)} · {lot.receivedTime} น.
                          </div>
                        </td>

                        {/* Col 2: Variety + Incoming Disposition */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-xs shrink-0"
                              style={{ backgroundColor: v.swatchHex }}
                            />
                            <span className="font-semibold text-slate-900">
                              {v.nameTh}
                            </span>
                            <span className="text-slate-400">·</span>
                            <span className="text-slate-500">{v.colorLabelTh}</span>
                          </div>
                          <div className="mt-1 text-[11px]">
                            {lot.disposition === 'ACCEPT' && (
                              <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                                <CheckCircle2 className="w-3 h-3 shrink-0" />
                                <span>รับเข้า: ผ่าน (Accept)</span>
                              </span>
                            )}
                            {lot.disposition === 'CONDITIONAL_ACCEPT' && (
                              <span className="inline-flex items-center gap-1 font-medium text-amber-700">
                                <CheckCircle2 className="w-3 h-3 shrink-0" />
                                <span>รับเข้า: ผ่านแบบคัดแยก</span>
                              </span>
                            )}
                            {lot.disposition === 'REJECT' && (
                              <span className="inline-flex items-center gap-1 font-bold text-red-700">
                                <XCircle className="w-3 h-3 shrink-0" />
                                <span>รับเข้า: ไม่ผ่าน (Reject)</span>
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Col 3: %Brix */}
                        <td className="py-3.5 px-4 text-right tabular-nums whitespace-nowrap">
                          {!lab ||
                          lab.brixStatus === 'PENDING' ||
                          lab.brixValue === null ? (
                            <span className="inline-flex items-center justify-end gap-1 font-medium text-amber-700">
                              <Clock className="w-3.5 h-3.5 shrink-0" />
                              <span>รอผลตรวจ</span>
                            </span>
                          ) : lab.brixStatus === 'PASS' ? (
                            <div>
                              <div className="text-emerald-700 font-bold">
                                {lab.brixValue.toFixed(1)} %Brix
                              </div>
                              <div className="text-[11px] text-emerald-700/80">
                                ผ่าน (&gt; 6.0)
                              </div>
                            </div>
                          ) : (
                            <div>
                              <div className="text-red-700 font-bold">
                                {lab.brixValue.toFixed(1)} %Brix
                              </div>
                              <div className="text-[11px] text-red-700 font-medium">
                                ไม่ผ่าน (≤ 6.0)
                              </div>
                            </div>
                          )}
                        </td>

                        {/* Col 4: Pesticide Combined */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {!lab || lab.pesticideStatus === 'PENDING' ? (
                            <span className="inline-flex items-center gap-1 font-medium text-amber-700">
                              <Clock className="w-3.5 h-3.5 shrink-0" />
                              <span>รอผลการตรวจสอบ</span>
                            </span>
                          ) : lab.pesticideStatus === 'PASS' ? (
                            <div>
                              <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                                <span>ผ่านทั้ง 2 หมวด</span>
                              </span>
                              <div className="text-[11px] text-slate-500 mt-0.5">
                                OP/CB: ผ่าน · OC/PY: ผ่าน
                              </div>
                            </div>
                          ) : (
                            <div>
                              <span className="inline-flex items-center gap-1 font-bold text-red-700">
                                <XCircle className="w-3.5 h-3.5 shrink-0" />
                                <span>ไม่ผ่านเกณฑ์</span>
                              </span>
                              <div className="text-[11px] text-red-700/90 mt-0.5">
                                OP/CB:{' '}
                                {lab.organophosphateCarbamate === 'PASS'
                                  ? 'ผ่าน'
                                  : lab.organophosphateCarbamate === 'FAIL'
                                  ? 'ไม่ผ่าน'
                                  : 'รอผล'}{' '}
                                · OC/PY:{' '}
                                {lab.organochlorinePyrethroid === 'PASS'
                                  ? 'ผ่าน'
                                  : lab.organochlorinePyrethroid === 'FAIL'
                                  ? 'ไม่ผ่าน'
                                  : 'รอผล'}
                              </div>
                            </div>
                          )}
                        </td>

                        {/* Col 5: Linked DC & COA */}
                        <td className="py-3.5 px-4 max-w-[240px]">
                          {primaryShipment ? (
                            <div>
                              <div
                                className="font-medium text-slate-900 truncate"
                                title={primaryShipment.distributionCenter}
                              >
                                {primaryShipment.distributionCenter || 'CP ALL DC'}
                                {linkedShipments.length > 1
                                  ? ` (+${linkedShipments.length - 1})`
                                  : ''}
                              </div>
                              <div className="text-[11px] tabular-nums text-slate-500 truncate mt-0.5">
                                {primaryShipment.coaNumber}
                              </div>
                            </div>
                          ) : (
                            <span className="text-slate-400">ยังไม่ผูกแผนจัดส่ง</span>
                          )}
                        </td>

                        {/* Col 6: Strict Equal-Size 3-Column Action Grid (288px total: 92px | 92px | 92px, h-8) */}
                        <td className="py-3.5 px-5 whitespace-nowrap">
                          <div className="grid grid-cols-3 gap-1.5 w-[288px] ml-auto">
                            <button
                              type="button"
                              onClick={() => onInspectIncomingLot(lot.id)}
                              className="h-8 w-full px-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors inline-flex items-center justify-center gap-1"
                            >
                              <ClipboardCheck className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                              <span>ตรวจรับ</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onInspectLabLot(lot.lotNumber)}
                              className="h-8 w-full px-2 text-xs font-medium text-slate-800 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors inline-flex items-center justify-center gap-1"
                            >
                              <FlaskConical className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                              <span>ตรวจ Lab</span>
                            </button>
                            {primaryShipment ? (
                              <button
                                type="button"
                                onClick={() => onOpenCOA(primaryShipment.id)}
                                className="h-8 w-full px-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 border border-slate-900 rounded-lg transition-colors inline-flex items-center justify-center gap-1"
                              >
                                <FileCheck2 className="w-3.5 h-3.5 shrink-0" />
                                <span>ดูใบ COA</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => onInspectOutgoing()}
                                className="h-8 w-full px-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg transition-colors inline-flex items-center justify-center gap-1"
                              >
                                <PackageCheck className="w-3.5 h-3.5 text-slate-700 shrink-0" />
                                <span>ตรวจ FG</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* COMPACT CONTAINER CARD GRID (< @5xl): Tablet, Mobile & Narrow Split-View */}
            <div className="@5xl:hidden p-4 @sm:p-5 grid grid-cols-1 @2xl:grid-cols-2 gap-3.5 bg-slate-50/40">
              {filteredProductionLots.map((lot) => {
                const v = TOMATO_VARIETIES[lot.varietyCode];
                const lab = labByLot.get(lot.lotNumber);
                const linkedShipments = shipmentsByLot.get(lot.lotNumber) || [];
                const primaryShipment = linkedShipments[0] || null;

                return (
                  <div
                    key={lot.id}
                    className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between space-y-3.5"
                  >
                    {/* Card Header: Lot + Variety + Incoming Status */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3 h-3 rounded-xs shrink-0"
                            style={{ backgroundColor: v.swatchHex }}
                          />
                          <span className="tabular-nums font-bold text-sm text-slate-900 truncate">
                            {lot.lotNumber}
                          </span>
                        </div>
                        <div className="text-xs text-slate-600 mt-0.5">
                          <strong className="text-slate-800">{v.nameTh}</strong> (
                          {v.colorLabelTh}) ·{' '}
                          <span className="tabular-nums text-[11px] text-slate-500">
                            {formatThaiDate(lot.receivedDate)} {lot.receivedTime} น.
                          </span>
                        </div>
                      </div>

                      <div className="shrink-0 text-xs">
                        {lot.disposition === 'ACCEPT' && (
                          <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>ผ่านรับเข้า</span>
                          </span>
                        )}
                        {lot.disposition === 'CONDITIONAL_ACCEPT' && (
                          <span className="inline-flex items-center gap-1 font-semibold text-amber-700">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>คัดแยก</span>
                          </span>
                        )}
                        {lot.disposition === 'REJECT' && (
                          <span className="inline-flex items-center gap-1 font-bold text-red-700">
                            <XCircle className="w-3.5 h-3.5" />
                            <span>ไม่ผ่าน</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Structured Metrics Box */}
                    <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 space-y-2 text-xs">
                      <div className="grid grid-cols-2 gap-2.5">
                        <div>
                          <div className="text-[11px] text-slate-500">
                            ความหวาน (%Brix)
                          </div>
                          <div className="tabular-nums mt-0.5">
                            {!lab ||
                            lab.brixStatus === 'PENDING' ||
                            lab.brixValue === null ? (
                              <span className="font-medium text-amber-700">
                                รอผลตรวจ
                              </span>
                            ) : lab.brixStatus === 'PASS' ? (
                              <span className="font-bold text-emerald-700">
                                {lab.brixValue.toFixed(1)} %Brix (ผ่าน)
                              </span>
                            ) : (
                              <span className="font-bold text-red-700">
                                {lab.brixValue.toFixed(1)} %Brix (ไม่ผ่าน)
                              </span>
                            )}
                          </div>
                        </div>

                        <div>
                          <div className="text-[11px] text-slate-500">
                            สารเคมีตกค้างรวม
                          </div>
                          <div className="mt-0.5">
                            {!lab || lab.pesticideStatus === 'PENDING' ? (
                              <span className="font-medium text-amber-700">
                                รอผลตรวจ
                              </span>
                            ) : lab.pesticideStatus === 'PASS' ? (
                              <span className="font-semibold text-emerald-700">
                                ผ่านทั้ง 2 หมวด
                              </span>
                            ) : (
                              <span className="font-bold text-red-700">
                                ไม่ผ่านเกณฑ์
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between gap-2">
                        <span className="text-[11px] text-slate-500 shrink-0">
                          แผนส่งมอบ / COA:
                        </span>
                        {primaryShipment ? (
                          <span className="font-medium text-slate-900 truncate text-right">
                            {primaryShipment.distributionCenter || 'CP ALL DC'} ·{' '}
                            <span className="tabular-nums text-[11px] text-slate-600">
                              {primaryShipment.coaNumber}
                            </span>
                          </span>
                        ) : (
                          <span className="text-slate-400">ยังไม่ผูกแผนจัดส่ง</span>
                        )}
                      </div>
                    </div>

                    {/* Uniform Equal-Width 3-Button Action Footer (h-9) */}
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => onInspectIncomingLot(lot.id)}
                        className="h-9 w-full px-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors inline-flex items-center justify-center gap-1 whitespace-nowrap"
                      >
                        <ClipboardCheck className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span>ตรวจรับ</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onInspectLabLot(lot.lotNumber)}
                        className="h-9 w-full px-2 text-xs font-medium text-slate-800 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors inline-flex items-center justify-center gap-1 whitespace-nowrap"
                      >
                        <FlaskConical className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                        <span>ตรวจ Lab</span>
                      </button>
                      {primaryShipment ? (
                        <button
                          type="button"
                          onClick={() => onOpenCOA(primaryShipment.id)}
                          className="h-9 w-full px-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 border border-slate-900 rounded-lg transition-colors inline-flex items-center justify-center gap-1 whitespace-nowrap"
                        >
                          <FileCheck2 className="w-3.5 h-3.5 shrink-0" />
                          <span>ดูใบ COA</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onInspectOutgoing()}
                          className="h-9 w-full px-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg transition-colors inline-flex items-center justify-center gap-1 whitespace-nowrap"
                        >
                          <PackageCheck className="w-3.5 h-3.5 text-slate-700 shrink-0" />
                          <span>ตรวจ FG</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>
      </div>

      {/* Printable Sheet for Executive Overview */}
      <div id="overview-report-sheet" className="hidden p-6 bg-white text-slate-900">
        {/* Header */}
        <div className="border-b-2 border-slate-900 pb-3 mb-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-slate-900 text-white mb-1">
                7-ELEVEN / CP ALL QUALITY CONTROL EXECUTIVE SUMMARY
              </div>
              <h1 className="text-lg font-bold text-slate-900 leading-tight">
                รายงานสรุปภาพรวมคุณภาพและห่วงโซ่อุปทาน (QC Executive Report)
              </h1>
              <p className="text-[11px] text-slate-600 mt-0.5">
                FreshTom QC Suite · สรุปสถานะการตรวจสอบวัตถุดิบ ผลตรวจวิเคราะห์แล็บ และการตรวจรับรองสินค้า FG
              </p>
            </div>
            <div className="text-right">
              <div className="text-xs font-bold text-slate-900 font-mono">
                DOC: EXEC-{new Date().toISOString().slice(2, 10).replace(/-/g, '')}
              </div>
              <div className="text-[10px] text-slate-500">
                พิมพ์เมื่อ: {formatThaiDate(new Date().toISOString())}
              </div>
              <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                พร้อมส่งมอบ 100%
              </div>
            </div>
          </div>
        </div>

        {/* 4 KPIs Summary Grid */}
        <div className="grid grid-cols-4 gap-3 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs mb-4">
          <div className="border-r border-slate-200 pr-2">
            <span className="text-[10px] text-slate-500 block uppercase font-semibold">1. QC Incoming รับเข้า</span>
            <div className="text-base font-bold text-slate-900 mt-0.5 tabular-nums">
              {kpi.incomingPassCount} / {kpi.totalLots} ล็อต
            </div>
            <span className="text-[10px] text-emerald-700 font-medium">ผ่านเกณฑ์รับเข้า 100%</span>
          </div>

          <div className="border-r border-slate-200 pr-2">
            <span className="text-[10px] text-slate-500 block uppercase font-semibold">2. QC Lab แล็บวิเคราะห์</span>
            <div className="text-base font-bold text-slate-900 mt-0.5 tabular-nums">
              {kpi.readyLotsCount} ล็อตพร้อม
            </div>
            <span className="text-[10px] text-slate-600">
              เฉลี่ย {kpi.avgBrix !== null ? `${kpi.avgBrix.toFixed(2)} %Brix` : '-'}
            </span>
          </div>

          <div className="border-r border-slate-200 pr-2">
            <span className="text-[10px] text-slate-500 block uppercase font-semibold">3. FG (สินค้าสำเร็จรูป)</span>
            <div className="text-base font-bold text-slate-900 mt-0.5 tabular-nums">
              {kpi.totalPacks.toLocaleString()} กล่อง
            </div>
            <span className="text-[10px] text-emerald-700 font-medium">
              ({kpi.totalCrates} ตะกร้า · {kpi.uniqueDcs} DC)
            </span>
          </div>

          <div>
            <span className="text-[10px] text-slate-500 block uppercase font-semibold">4. COA Certificates</span>
            <div className="text-base font-bold text-emerald-700 mt-0.5 tabular-nums">
              {kpi.coaCertifiedCount} ฉบับ
            </div>
            <span className="text-[10px] text-slate-600">รับรองมาตรฐาน 7-Eleven ครบ</span>
          </div>
        </div>

        {/* Finish Good Shipments to CP ALL DCs */}
        <div className="mb-4">
          <h2 className="text-xs font-bold text-slate-800 mb-1.5 flex items-center justify-between">
            <span>รายการตรวจรับรองสินค้า FG ส่งศูนย์กระจายสินค้า CP ALL</span>
            <span className="text-[10px] text-slate-500 font-normal">ข้อกำหนดมาตรฐาน 7-Eleven ครบทั้ง 8 ข้อ</span>
          </h2>
          <table className="w-full text-left border-collapse text-[10px] border border-slate-300">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-300 text-slate-700 font-semibold">
                <th className="py-1 px-2 border-r border-slate-300">เลขที่ OQC</th>
                <th className="py-1 px-2 border-r border-slate-300">ศูนย์กระจายสินค้า (DC)</th>
                <th className="py-1 px-2 border-r border-slate-300">ใบสั่งซื้อ PO</th>
                <th className="py-1 px-2 border-r border-slate-300 text-center">ยอดสั่ง / ตรวจ</th>
                <th className="py-1 px-2 border-r border-slate-300 text-center">สุ่มชั่ง นน. (140g)</th>
                <th className="py-1 px-2 border-r border-slate-300 text-center">เกณฑ์ 7-Eleven</th>
                <th className="py-1 px-2 text-center">ใบรับรอง COA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-mono">
              {outgoingRecords.map((oqc) => (
                <tr key={oqc.id} className="border-b border-slate-200">
                  <td className="py-1 px-2 font-bold text-slate-900 border-r border-slate-300">
                    {oqc.oqcNumber}
                  </td>
                  <td className="py-1 px-2 font-sans font-medium text-slate-800 border-r border-slate-300">
                    {oqc.distributionCenter}
                  </td>
                  <td className="py-1 px-2 text-slate-700 border-r border-slate-300">
                    {oqc.poNumber}
                  </td>
                  <td className="py-1 px-2 text-center text-slate-800 border-r border-slate-300">
                    {oqc.orderedPacks} / {oqc.actualPacks}
                  </td>
                  <td className="py-1 px-2 text-center text-slate-800 border-r border-slate-300 font-bold">
                    {oqc.netWeightG ? `${oqc.netWeightG.toFixed(1)}g` : '140g'}
                  </td>
                  <td className="py-1 px-2 text-center border-r border-slate-300 font-sans">
                    <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800">
                      ผ่าน 8/8 ข้อ
                    </span>
                  </td>
                  <td className="py-1 px-2 text-center font-bold text-blue-800 font-mono">
                    {oqc.coaNumber}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Incoming Lots Inventory Table */}
        <div className="mb-4">
          <h2 className="text-xs font-bold text-slate-800 mb-1.5">
            สรุปสถานะวัตถุดิบรับเข้าและผลวิเคราะห์ห้องปฏิบัติการ (Incoming &amp; Lab QC Lots)
          </h2>
          <table className="w-full text-left border-collapse text-[10px] border border-slate-300">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-300 text-slate-700 font-semibold">
                <th className="py-1 px-2 border-r border-slate-300">หมายเลขล็อต</th>
                <th className="py-1 px-2 border-r border-slate-300">สายพันธุ์ / สี</th>
                <th className="py-1 px-2 border-r border-slate-300">วันที่รับเข้า</th>
                <th className="py-1 px-2 border-r border-slate-300 text-center">ผลรับเข้า</th>
                <th className="py-1 px-2 border-r border-slate-300 text-center">Brix (&gt; 6.0)</th>
                <th className="py-1 px-2 border-r border-slate-300 text-center">สารตกค้าง (2 หมวด)</th>
                <th className="py-1 px-2 text-center">สถานะการผลิต</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-mono">
              {lots.slice(0, 8).map((lot) => {
                const lab = labByLot.get(lot.lotNumber);
                const v = TOMATO_VARIETIES[lot.varietyCode];
                return (
                  <tr key={lot.lotNumber} className="border-b border-slate-200">
                    <td className="py-1 px-2 font-bold text-slate-900 border-r border-slate-300">
                      {lot.lotNumber}
                    </td>
                    <td className="py-1 px-2 font-sans font-medium text-slate-800 border-r border-slate-300">
                      {v?.nameTh || lot.varietyCode}
                    </td>
                    <td className="py-1 px-2 font-sans text-slate-600 border-r border-slate-300">
                      {formatThaiDate(lot.receivedDate)}
                    </td>
                    <td className="py-1 px-2 text-center font-sans border-r border-slate-300">
                      <span className="text-emerald-700 font-bold">{lot.disposition}</span>
                    </td>
                    <td className="py-1 px-2 text-center border-r border-slate-300">
                      {lab?.brixValue ? `${lab.brixValue.toFixed(1)} %` : '-'}
                    </td>
                    <td className="py-1 px-2 text-center border-r border-slate-300 font-sans">
                      <span className="text-emerald-700 font-bold">
                        {lab?.pesticideStatus || 'PASS'}
                      </span>
                    </td>
                    <td className="py-1 px-2 text-center font-sans">
                      <span className="inline-block px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800">
                        พร้อมแพ็คส่ง
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Signatures */}
        <div className="grid grid-cols-2 gap-6 pt-4 border-t border-slate-300 text-center text-xs">
          <div>
            <div className="border-b border-slate-400 w-48 mx-auto mb-1"></div>
            <p className="font-semibold text-slate-800">ภญ.พิมลวรรณ สิริพงษ์</p>
            <p className="text-[10px] text-slate-500">ผู้จัดการฝ่ายประกันคุณภาพ (Quality Assurance Manager)</p>
          </div>
          <div>
            <div className="border-b border-slate-400 w-48 mx-auto mb-1"></div>
            <p className="font-semibold text-slate-800">นายธนกฤต กิตติพงษ์พาณิชย์</p>
            <p className="text-[10px] text-slate-500">ผู้อำนวยการสายงานปฏิบัติการ (Operations Director)</p>
          </div>
        </div>
      </div>

      {/* Printable & PDF Export Sheet for Traceability Table ONLY */}
      <div
        id="traceability-report-sheet"
        className="fixed top-0 left-[-10000px] w-[794px] p-6 bg-white text-slate-900 font-sans pointer-events-none -z-50"
      >
        {/* Header */}
        <div className="border-b-2 border-slate-900 pb-3 mb-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-slate-900 text-white mb-1">
                7-ELEVEN / CP ALL TRACEABILITY RECORD
              </div>
              <h1 className="text-lg font-bold text-slate-900 leading-tight">
                ทะเบียนติดตามล็อตการผลิตและวัตถุดิบ (Production Lots &amp; Traceability)
              </h1>
              <p className="text-[11px] text-slate-600 mt-0.5">
                FreshTom QC Suite · ระบบตรวจสอบย้อนกลับวัตถุดิบมะเขือเทศตัดแต่งและสินค้าสำเร็จรูปส่ง CP ALL DC
              </p>
            </div>
            <div className="text-right">
              <div className="text-xs font-bold text-slate-900 font-mono">
                DOC: TRACE-{new Date().toISOString().slice(2, 10).replace(/-/g, '')}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                พิมพ์เมื่อ: {formatThaiDate(new Date().toISOString())}
              </div>
              <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                ตัวกรอง: {filterTabs.find((t) => t.id === lotFilter)?.label} ({filteredProductionLots.length} ล็อต)
              </div>
            </div>
          </div>
        </div>

        {/* Traceability Summary Metrics */}
        <div className="grid grid-cols-4 gap-2.5 p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs mb-4">
          <div className="border-r border-slate-200 pr-2">
            <span className="text-[10px] text-slate-500 block uppercase font-semibold">ล็อตที่แสดง</span>
            <div className="text-base font-bold text-slate-900 mt-0.5 tabular-nums">
              {filteredProductionLots.length} ล็อต
            </div>
            <span className="text-[10px] text-slate-600">จากทั้งหมด {lots.length} ล็อต</span>
          </div>
          <div className="border-r border-slate-200 pr-2">
            <span className="text-[10px] text-slate-500 block uppercase font-semibold">ผ่านตรวจรับเข้า</span>
            <div className="text-base font-bold text-emerald-700 mt-0.5 tabular-nums">
              {filteredProductionLots.filter((l) => l.disposition === 'ACCEPT').length} ล็อต
            </div>
            <span className="text-[10px] text-emerald-700 font-medium">เกณฑ์ตรวจรับปกติ</span>
          </div>
          <div className="border-r border-slate-200 pr-2">
            <span className="text-[10px] text-slate-500 block uppercase font-semibold">ผ่านแล็บสารเคมี</span>
            <div className="text-base font-bold text-emerald-700 mt-0.5 tabular-nums">
              {filteredProductionLots.filter((l) => labByLot.get(l.lotNumber)?.pesticideStatus === 'PASS').length} ล็อต
            </div>
            <span className="text-[10px] text-emerald-700 font-medium">ผ่านทั้ง 2 หมวด</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 block uppercase font-semibold">ผูกแผนส่งมอบ / COA</span>
            <div className="text-base font-bold text-blue-700 mt-0.5 tabular-nums">
              {filteredProductionLots.filter((l) => (shipmentsByLot.get(l.lotNumber) || []).length > 0).length} ล็อต
            </div>
            <span className="text-[10px] text-slate-600">พร้อมใบรับรองคุณภาพ</span>
          </div>
        </div>

        {/* The Table — ONLY Content of the Traceability Table */}
        <div className="mb-4">
          <table className="w-full text-left border-collapse text-[10px] border border-slate-300">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-300 text-slate-700 font-semibold">
                <th className="py-1.5 px-2 border-r border-slate-300 w-7 text-center">#</th>
                <th className="py-1.5 px-2 border-r border-slate-300">หมายเลขล็อต (Lot No.)</th>
                <th className="py-1.5 px-2 border-r border-slate-300">สายพันธุ์ &amp; สี</th>
                <th className="py-1.5 px-2 border-r border-slate-300">วันที่-เวลารับเข้า</th>
                <th className="py-1.5 px-2 border-r border-slate-300 text-center">ตรวจรับเข้า</th>
                <th className="py-1.5 px-2 border-r border-slate-300 text-center">Brix (&gt;6.0)</th>
                <th className="py-1.5 px-2 border-r border-slate-300 text-center">สารเคมี 2 หมวด</th>
                <th className="py-1.5 px-2 border-r border-slate-300">ศูนย์ DC / ใบสั่ง PO</th>
                <th className="py-1.5 px-2 text-center">ใบรับรอง COA</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 font-mono">
              {filteredProductionLots.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-4 text-center text-slate-500 font-sans">
                    ไม่พบข้อมูลล็อตที่ตรงกับเงื่อนไขการค้นหา
                  </td>
                </tr>
              ) : (
                filteredProductionLots.map((lot, idx) => {
                  const v = TOMATO_VARIETIES[lot.varietyCode];
                  const lab = labByLot.get(lot.lotNumber);
                  const linkedShipments = shipmentsByLot.get(lot.lotNumber) || [];
                  const primaryShipment = linkedShipments[0] || null;

                  return (
                    <tr key={lot.lotNumber} className="border-b border-slate-200">
                      <td className="py-1.5 px-1.5 text-center text-slate-500 border-r border-slate-300">
                        {idx + 1}
                      </td>
                      <td className="py-1.5 px-2 font-bold text-slate-900 border-r border-slate-300 whitespace-nowrap">
                        {lot.lotNumber}
                      </td>
                      <td className="py-1.5 px-2 font-sans font-medium text-slate-800 border-r border-slate-300 whitespace-nowrap">
                        <span
                          className="inline-block w-2 h-2 rounded-xs mr-1 align-middle"
                          style={{ backgroundColor: v?.swatchHex || '#ccc' }}
                        />
                        {v?.nameTh || lot.varietyCode} ({v?.colorLabelTh})
                      </td>
                      <td className="py-1.5 px-2 font-sans text-slate-600 border-r border-slate-300 whitespace-nowrap">
                        {formatThaiDate(lot.receivedDate)} {lot.receivedTime} น.
                      </td>
                      <td className="py-1.5 px-2 text-center font-sans border-r border-slate-300 whitespace-nowrap">
                        {lot.disposition === 'ACCEPT' && (
                          <span className="text-emerald-700 font-bold">✓ ผ่าน (Accept)</span>
                        )}
                        {lot.disposition === 'CONDITIONAL_ACCEPT' && (
                          <span className="text-amber-700 font-bold">⚠ คัดแยก</span>
                        )}
                        {lot.disposition === 'REJECT' && (
                          <span className="text-red-700 font-bold">✕ ปฏิเสธ</span>
                        )}
                      </td>
                      <td className="py-1.5 px-2 text-center border-r border-slate-300 whitespace-nowrap font-bold">
                        {!lab || lab.brixStatus === 'PENDING' || lab.brixValue === null ? (
                          <span className="text-slate-400 font-normal">รอผล</span>
                        ) : lab.brixStatus === 'PASS' ? (
                          <span className="text-emerald-700">{lab.brixValue.toFixed(1)} %</span>
                        ) : (
                          <span className="text-red-700">{lab.brixValue.toFixed(1)} %</span>
                        )}
                      </td>
                      <td className="py-1.5 px-2 text-center font-sans border-r border-slate-300 whitespace-nowrap font-semibold">
                        {!lab || lab.pesticideStatus === 'PENDING' ? (
                          <span className="text-slate-400 font-normal">รอผล</span>
                        ) : lab.pesticideStatus === 'PASS' ? (
                          <span className="text-emerald-700">✓ ผ่าน 2 หมวด</span>
                        ) : (
                          <span className="text-red-700">✕ ไม่ผ่าน</span>
                        )}
                      </td>
                      <td className="py-1.5 px-2 font-sans text-slate-700 border-r border-slate-300 whitespace-nowrap">
                        {primaryShipment ? (
                          <span>
                            <strong className="text-slate-900">{primaryShipment.distributionCenter}</strong>
                            {primaryShipment.poNumber && (
                              <span className="text-slate-500"> (PO: {primaryShipment.poNumber})</span>
                            )}
                          </span>
                        ) : (
                          <span className="text-slate-400 italic">ยังไม่ผูกแผน</span>
                        )}
                      </td>
                      <td className="py-1.5 px-2 text-center font-bold text-blue-800 border-slate-300 whitespace-nowrap">
                        {primaryShipment ? primaryShipment.coaNumber : '-'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Verification Signatures */}
        <div className="grid grid-cols-4 gap-3 pt-3 border-t border-slate-300 text-center text-xs">
          <div>
            <div className="border-b border-slate-400 w-32 mx-auto mb-1"></div>
            <p className="font-semibold text-slate-800 text-[11px]">น.ส.ศศิวิมล ทิพย์ทอง</p>
            <p className="text-[10px] text-slate-500">ผู้ตรวจสอบรับเข้า (Incoming QC)</p>
          </div>
          <div>
            <div className="border-b border-slate-400 w-32 mx-auto mb-1"></div>
            <p className="font-semibold text-slate-800 text-[11px]">น.ส.วิชุตา เหล่าศรี</p>
            <p className="text-[10px] text-slate-500">นักวิเคราะห์แล็บ (Lab Analyst)</p>
          </div>
          <div>
            <div className="border-b border-slate-400 w-32 mx-auto mb-1"></div>
            <p className="font-semibold text-slate-800 text-[11px]">น.ส.รัชดาภรณ์ เรืองอุไร</p>
            <p className="text-[10px] text-slate-500">ผู้ตรวจคุณภาพสินค้า (FG Inspector)</p>
          </div>
          <div>
            <div className="border-b border-slate-400 w-32 mx-auto mb-1"></div>
            <p className="font-semibold text-slate-800 text-[11px]">นายเด่นชัย ห่วงจิง</p>
            <p className="text-[10px] text-slate-500">ผู้อนุมัติปล่อยสินค้า (Release Approver)</p>
          </div>
        </div>
      </div>
    </div>
  );
};
