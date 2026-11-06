import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  FileCheck2,
  FlaskConical,
  PackageCheck,
  Search,
  Truck,
  X,
  XCircle,
} from 'lucide-react';
import {
  ActiveModule,
  IncomingLotRecord,
  LabRecord,
  OutgoingRecord,
  TOMATO_VARIETIES,
} from '../types/qc';
import { evaluateColorMixRules, formatThaiDate } from '../utils/lotHelpers';

interface OverviewDashboardViewProps {
  lots: IncomingLotRecord[];
  labRecords: LabRecord[];
  outgoingRecords: OutgoingRecord[];
  onNavigateModule: (module: ActiveModule) => void;
  onInspectIncomingLot: (lotId: string) => void;
  onInspectLabLot: (lotNumber: string) => void;
  onInspectOutgoing: (oqcId?: string) => void;
  onOpenCOA: (oqcId: string) => void;
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
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [lotFilter, setLotFilter] = useState<LotFilter>('ALL');

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
        if (mix.percentage > 0 && mix.lotNumber) {
          const list = map.get(mix.lotNumber) || [];
          list.push(oqc);
          map.set(mix.lotNumber, list);
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
          const l = labByLot.get(m.lotNumber);
          return l !== undefined && l.overallLabStatus === 'PASS';
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
      {/* 4 EXECUTIVE KPI CARDS — Container-Query Responsive (1 -> 2 -> 4 cols as content expands/collapses) */}
      <section aria-label="ตัวชี้วัดคุณภาพหลัก">
        <div className="grid grid-cols-1 @xl:grid-cols-2 @5xl:grid-cols-4 gap-4">
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

          {/* Card 3: QC Outgoing (CP ALL DC Logistics) */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 @sm:p-5 flex flex-col justify-between space-y-4">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2 text-xs font-medium text-slate-500">
                <span className="truncate">QC Outgoing · CP ALL DC Logistics</span>
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
                  <span className="text-slate-500">ผ่าน OQC ครบ 8 ข้อ:</span>
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
        {/* Tier 1: Section Title & Count Summary */}
        <div className="px-4 @sm:px-6 py-4 @sm:py-5 flex flex-col @xl:flex-row @xl:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              ตารางติดตามล็อตการผลิตและวัตถุดิบ (Production Lots Traceability)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              ติดตามสถานะรายล็อตตั้งแต่ตรวจรับเข้า · ความหวาน (%Brix) · สารเคมีตกค้าง 2 หมวด · และแผนจัดส่งใบรับรอง COA
            </p>
          </div>
          <div className="text-xs tabular-nums text-slate-500 shrink-0">
            แสดง <strong className="text-slate-900">{filteredProductionLots.length}</strong> จาก{' '}
            {lots.length} ล็อต
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
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`tabular-nums text-[11px] ${
                      isActive ? 'text-slate-300' : 'text-slate-500'
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
                                <span>จัดส่ง OQC</span>
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
                          <span>จัดส่ง OQC</span>
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
  );
};
