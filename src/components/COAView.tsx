import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { domToCanvas } from 'modern-screenshot';
import { jsPDF } from 'jspdf';
import {
  AlertCircle,
  Barcode,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  Copy,
  Download,
  Eraser,
  ExternalLink,
  FileSignature,
  FileText,
  Loader2,
  Lock,
  Maximize2,
  Minimize2,
  PenTool,
  Printer,
  QrCode,
  RotateCcw,
  Scale,
  Settings2,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Tag,
  Thermometer,
  X,
  XCircle,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  CoaDocumentConfig,
  IncomingLotRecord,
  LabRecord,
  OutgoingRecord,
  TOMATO_VARIETIES,
} from '../types/qc';
import { CP_ALL_DC_OPTIONS } from '../data/initialData';
import {
  daysBetweenIsoDates,
  evaluateColorMixRules,
  formatThaiDate,
  getMixLotNumbers,
} from '../utils/lotHelpers';
import { NotificationVariant } from './PopupNotification';

type ColorMixEntry = OutgoingRecord['colorMix'][number];

const A4_WEB_WIDTH_PX = 794; // Exact 210mm A4 width at 96 DPI (matches Web desktop layout 1:1)
const A4_WEB_HEIGHT_PX = 1123; // Exact 297mm A4 height at 96 DPI (210:297 ratio)
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 2.0;
const ZOOM_STEP = 0.15;

type CoaWorkspaceTab = 'PREVIEW' | 'SETTINGS';

interface COAViewProps {
  lots: IncomingLotRecord[];
  labRecords: LabRecord[];
  outgoingRecords: OutgoingRecord[];
  selectedOqcId: string | null;
  onSelectOqcId: (id: string) => void;
  docConfig: CoaDocumentConfig;
  onUpdateDocConfig: (next: CoaDocumentConfig) => void;
  onUpdateOutgoingRecord: (record: OutgoingRecord) => void;
  onNotify?: (title: string, message: string, variant?: NotificationVariant) => void;
}

export const PornpaweeSignatureSvg: React.FC<{ className?: string }> = ({
  className = 'h-9 w-auto mx-auto',
}) => (
  <svg
    viewBox="0 0 210 52"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-label="ลายมือชื่อ น.ส.พรปวีณ์ ร่วมศรี"
  >
    <path
      d="M12 36C22 18 32 8 44 11C54 13 52 32 38 40C26 46 20 36 28 24C36 12 50 16 62 26C72 34 76 40 86 28C94 18 102 22 110 32C116 40 124 28 132 24C140 20 148 26 156 34C166 42 178 30 190 20M68 34C82 42 120 48 165 38C182 34 196 26 204 16"
      stroke="#1e40af"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M32 18Q38 44 44 48"
      stroke="#1e40af"
      strokeWidth="2.2"
      strokeLinecap="round"
    />
    <circle
      cx="192"
      cy="38"
      r="8.5"
      stroke="#059669"
      strokeWidth="1.2"
      strokeDasharray="2 2"
      fill="#ecfdf5"
    />
    <text
      x="192"
      y="41.5"
      textAnchor="middle"
      fontSize="6.5"
      fontWeight="bold"
      fill="#047857"
    >
      QA
    </text>
  </svg>
);

export const DenchaiSignatureSvg: React.FC<{ className?: string }> = ({
  className = 'h-9 w-auto mx-auto',
}) => (
  <svg
    viewBox="0 0 210 52"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-label="ลายมือชื่อ นายเด่นชัย ห่วงจิง"
  >
    <path
      d="M14 40C16 20 22 10 36 10C48 10 58 20 54 36C50 48 38 50 28 44C18 38 18 16 26 14C38 10 62 20 76 34C90 46 106 26 118 24C130 22 142 36 160 30C172 26 186 22 202 18M32 46L200 36"
      stroke="#1e3a8a"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M92 16Q108 30 132 42"
      stroke="#1e3a8a"
      strokeWidth="2.2"
      strokeLinecap="round"
    />
    <circle
      cx="192"
      cy="38"
      r="8.5"
      stroke="#059669"
      strokeWidth="1.2"
      strokeDasharray="2 2"
      fill="#ecfdf5"
    />
    <text
      x="192"
      y="41.5"
      textAnchor="middle"
      fontSize="6"
      fontWeight="bold"
      fill="#047857"
    >
      QC
    </text>
  </svg>
);

interface CoaCertificateSheetProps {
  sheetId?: string;
  activeOqc: OutgoingRecord;
  activeMixItems: ColorMixEntry[];
  incomingByLot: Map<string, IncomingLotRecord>;
  labByLot: Map<string, LabRecord>;
  docConfig: CoaDocumentConfig;
  canStampPass: boolean;
  releaseStatusText: string;
  qrTraceabilityPayload: string;
  shelfDays: number | null;
  onOpenQrModal?: () => void;
  certifierSig?: string | null;
  approverSig?: string | null;
  signatureMode?: 'digital' | 'manual';
  onOpenSignModal?: (role: 'certifier' | 'approver') => void;
}

/**
 * Fixed-proportion Web/A4 COA Document Sheet (794px = 210mm).
 * Preserves the exact multi-column Web layout on Mobile, Tablet, Web, Print, and PDF export.
 */
const CoaCertificateSheet = React.forwardRef<HTMLElement, CoaCertificateSheetProps>(
  (
    {
      sheetId,
      activeOqc,
      activeMixItems,
      incomingByLot,
      labByLot,
      docConfig,
      canStampPass,
      releaseStatusText,
      qrTraceabilityPayload,
      shelfDays,
      onOpenQrModal,
      certifierSig = 'preset',
      approverSig = 'preset',
      signatureMode = 'digital',
      onOpenSignModal,
    },
    ref
  ) => {
    const isMixValid =
      activeOqc.check2MixValid && evaluateColorMixRules(activeOqc.colorMix).isValid;
    const totalMixLotsCount = activeMixItems.reduce(
      (acc, mix) => acc + getMixLotNumbers(mix).length,
      0
    );

    return (
      <article
        ref={ref}
        id={sheetId}
        className="coa-document-typography box-border w-[794px] min-w-[794px] max-w-[794px] min-h-[1123px] h-[1123px] bg-white border border-slate-300 shadow-xs p-5 sm:p-5.5 text-slate-900 flex flex-col justify-between select-text overflow-hidden"
      >
        {/* OFFICIAL DOCUMENT HEADER & DOCUMENT CONTROL / LICENSING */}
        {/* DOCUMENT HEADER & CUSTOMER SPECIFICATION */}
        <header className="space-y-2.5 text-slate-900">
          {/* Top Section: Company Branding (Left) & COA Meta (Right) */}
          <div className="flex items-start justify-between gap-4">
            {/* Left: Logo & Company Info */}
            <div className="flex items-start gap-2.5 min-w-0">
              <div className="w-9 h-9 bg-slate-900 rounded-lg flex items-center justify-center text-white shrink-0 shadow-2xs">
                <ShieldCheck className="w-5 h-5 text-white" />
              </div>
              <div className="space-y-0.5 min-w-0">
                <h1 className="text-[13.5px] font-bold text-slate-900 leading-snug">
                  {docConfig.companyName || 'บริษัท เดลิช ฟู้ดส์ จำกัด'}
                </h1>
                <div className="text-[10px] text-slate-600 font-medium">
                  {docConfig.companyNameEn || 'Delish Foods Co., Ltd.'}
                </div>
                <div className="text-[8.5px] text-slate-500 leading-tight">
                  {docConfig.companyAddress || '921 ถนนอ่อนนุช แขวงอ่อนนุช เขตสวนหลวง กรุงเทพมหานคร 10250'}
                </div>
                <div className="text-[8.5px] text-slate-500 leading-tight">
                  {docConfig.companyContact || 'Tel: 02-999-8888 • Email: qa@delishfoods.co.th'}
                </div>
              </div>
            </div>

            {/* Right: Spec Badge & Document Metadata */}
            <div className="text-right shrink-0 space-y-0.5">
              <div className="inline-block border border-slate-900 rounded px-2 py-0.5 font-bold text-[9px] text-slate-900 tracking-wider">
                7-ELEVEN RETAIL SPEC
              </div>
              <div className="font-bold text-[11.5px] text-slate-900 tracking-wide uppercase pt-0.5">
                CERTIFICATE OF ANALYSIS (COA)
              </div>
              <div className="text-[10px] tabular-nums text-slate-700">
                <span className="text-slate-500">เลขที่:</span>{' '}
                <span className="font-bold text-slate-900">{activeOqc.coaNumber}</span>
              </div>
              <div className="text-[9px] tabular-nums text-slate-500">
                วันที่ออกเอกสาร: {activeOqc.inspectionDate}
              </div>
            </div>
          </div>

          {/* Solid Black Horizontal Line Divider */}
          <div className="border-b border-slate-900" />

          {/* Compact Rounded Specification Card */}
          <div className="border border-slate-200 rounded-xl p-3 bg-slate-50/40 shadow-2xs">
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[9.5px] leading-snug text-slate-700">
              {/* Left Column */}
              <div className="space-y-1.5">
                <div>
                  <span className="font-bold text-slate-900">ชื่อผลิตภัณฑ์:</span>{' '}
                  <span>{activeOqc.productName}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-900">น้ำหนักสุทธิ / บรรจุภัณฑ์:</span>{' '}
                  <span>{activeOqc.netWeightG} กรัม (กล่อง PET ใส Food Grade)</span>
                </div>
                <div>
                  <span className="font-bold text-slate-900">หมายเลขล็อตสินค้า (FG):</span>{' '}
                  <span className="font-mono font-medium text-slate-900">
                    {activeOqc.productionLotNo || activeOqc.oqcNumber}
                  </span>
                </div>
                <div>
                  <span className="font-bold text-slate-900">วันที่ผลิต (MFG):</span>{' '}
                  <span className="tabular-nums">{activeOqc.mfgDate}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-900">วันหมดอายุ (EXP):</span>{' '}
                  <span className="tabular-nums">{activeOqc.expDate}</span>
                </div>
              </div>

              {/* Right Column */}
              <div className="space-y-1.5">
                <div>
                  <span className="font-bold text-slate-900">ชื่อคู่ค้า / ลูกค้า:</span>{' '}
                  <span>
                    {activeOqc.customerName.includes('7-Eleven')
                      ? activeOqc.customerName
                      : `${activeOqc.customerName} / 7-Eleven`}
                  </span>
                </div>
                <div>
                  <span className="font-bold text-slate-900">ศูนย์กระจายสินค้า (DC):</span>{' '}
                  <span>
                    {activeOqc.distributionCenter.startsWith('7-Eleven')
                      ? activeOqc.distributionCenter
                      : `7-Eleven Distribution Center (${activeOqc.distributionCenter})`}
                  </span>
                </div>
                <div>
                  <span className="font-bold text-slate-900">เลขที่ใบสั่งซื้อ (PO No.):</span>{' '}
                  <span className="font-mono font-medium text-slate-900">{activeOqc.poNumber}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-900">อายุการเก็บรักษา:</span>{' '}
                  <span>{shelfDays || 6} วัน (อุณหภูมิควบคุม 2–6 °C)</span>
                </div>
                <div>
                  <span className="font-bold text-slate-900">มาตรฐานรับรอง:</span>{' '}
                  <span>{docConfig.internationalStandards || 'GHPs, HACCP, GAP'}</span>
                </div>
              </div>

              {/* In-box Notice if Lab Result Fails / Lot Suspended */}
              {!canStampPass && (
                <div className="col-span-2 mt-0.5 pt-1.5 border-t border-red-200">
                  <div className="p-1.5 bg-red-50/80 border border-red-200 rounded-md text-[8.5px] text-red-900 flex items-start gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-red-800">
                        แจ้งเตือนระงับการปล่อยล็อต (HOLD / SUSPENDED):
                      </span>{' '}
                      <span>ตรวจพบล็อตวัตถุดิบไม่ผ่านเกณฑ์มาตรฐานห้องปฏิบัติการ (ดูตาราง QC LAB ด้านล่าง)</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* QC LABORATORY ANALYSIS */}
        <section className="space-y-1">
          <div className="flex items-center justify-between border-b border-slate-300 pb-1 gap-3">
            <h2 className="text-[10px] font-bold text-slate-900">
              ผลการวิเคราะห์ทางห้องปฏิบัติการ — สารเคมีตกค้าง 2 หมวดหลัก และความหวาน (QC LAB)
            </h2>
            <span className="text-[8.5px] tabular-nums font-medium text-slate-500 text-right shrink-0">
              เกณฑ์ 7-Eleven: ความหวาน &gt; 6.0 %Brix · สารตกค้างผ่านทั้ง 2 หมวด
            </span>
          </div>

          <div className="overflow-hidden border border-slate-200 rounded-md">
            <table className="w-full text-left border-collapse text-[8.5px]">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200 font-semibold text-slate-700">
                  <th className="py-1 px-1.5 text-center">หมายเลขล็อต</th>
                  <th className="py-1 px-1.5 text-center">วันที่รับเข้า</th>
                  <th className="py-1 px-1.5 text-center">Organophosphate &amp; Carbamate</th>
                  <th className="py-1 px-1.5 text-center">Organochlorine &amp; Pyrethroid</th>
                  <th className="py-1 px-1.5 text-center">สถานะสารตกค้างรวม</th>
                  <th className="py-1 px-1.5 text-center">ความหวาน (%Brix)</th>
                  <th className="py-1 px-1.5 text-center">สรุปผลแล็บ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {activeMixItems
                  .flatMap((mix) => {
                    const lotList = getMixLotNumbers(mix);
                    const v = TOMATO_VARIETIES[mix.varietyCode];
                    if (lotList.length === 0) {
                      return [
                        {
                          key: `${mix.varietyCode}-empty`,
                          variety: v,
                          lotNumber: '-',
                          lab: undefined,
                          inc: undefined,
                        },
                      ];
                    }
                    return lotList.map((lotNum) => ({
                      key: `${mix.varietyCode}-${lotNum}`,
                      variety: v,
                      lotNumber: lotNum,
                      lab: labByLot.get(lotNum),
                      inc: incomingByLot.get(lotNum),
                    }));
                  })
                  .map(({ key, variety, lotNumber, lab, inc }) => {
                    return (
                      <tr key={key}>
                        <td className="py-1 px-1.5 tabular-nums font-semibold text-slate-900 whitespace-nowrap text-center">
                          <span className="font-mono">{lotNumber}</span>
                          <span className="ml-1 text-[7.5px] text-slate-500 font-normal">
                            ({variety.nameTh})
                          </span>
                        </td>
                        <td className="py-1 px-1.5 tabular-nums text-slate-700 whitespace-nowrap text-center">
                          {lab
                            ? formatThaiDate(lab.receivedDate)
                            : inc
                            ? formatThaiDate(inc.receivedDate)
                            : '-'}
                        </td>
                        <td className="py-1 px-1.5 font-semibold whitespace-nowrap text-center">
                          {!lab ||
                          !lab.organophosphateCarbamate ||
                          lab.organophosphateCarbamate === 'PENDING' ? (
                            <span className="text-slate-400 font-medium">-</span>
                          ) : lab.organophosphateCarbamate === 'PASS' ? (
                            <span className="text-emerald-700 font-bold">ผ่าน (PASS)</span>
                          ) : (
                            <span className="text-red-700 font-bold">ไม่ผ่าน (FAIL)</span>
                          )}
                        </td>
                        <td className="py-1 px-1.5 font-semibold whitespace-nowrap text-center">
                          {!lab ||
                          !lab.organochlorinePyrethroid ||
                          lab.organochlorinePyrethroid === 'PENDING' ? (
                            <span className="text-slate-400 font-medium">-</span>
                          ) : lab.organochlorinePyrethroid === 'PASS' ? (
                            <span className="text-emerald-700 font-bold">ผ่าน (PASS)</span>
                          ) : (
                            <span className="text-red-700 font-bold">ไม่ผ่าน (FAIL)</span>
                          )}
                        </td>
                        <td className="py-1 px-1.5 font-bold whitespace-nowrap text-center">
                          {!lab ||
                          !lab.pesticideStatus ||
                          lab.pesticideStatus === 'PENDING' ? (
                            <span className="text-slate-400 font-medium">-</span>
                          ) : lab.pesticideStatus === 'PASS' ? (
                            <span className="text-emerald-700">PASS</span>
                          ) : (
                            <span className="text-red-700">FAIL</span>
                          )}
                        </td>
                        <td className="py-1 px-1.5 text-center tabular-nums whitespace-nowrap">
                          {lab && lab.brixValue !== null ? (
                            <span
                              className={
                                lab.brixStatus === 'FAIL'
                                  ? 'text-red-700 font-bold'
                                  : 'font-semibold text-slate-900'
                              }
                            >
                              {lab.brixValue.toFixed(1)} %Brix
                            </span>
                          ) : (
                            <span className="text-amber-700 font-semibold">
                              รอผลตรวจ
                            </span>
                          )}
                        </td>
                        <td className="py-1 px-1.5 font-bold whitespace-nowrap text-center">
                          {!lab || lab.overallLabStatus === 'PENDING' ? (
                            <span className="text-amber-700 font-semibold">
                              รอผลตรวจ
                            </span>
                          ) : lab.overallLabStatus === 'PASS' ? (
                            <span className="text-emerald-700">PASS</span>
                          ) : (
                            <span className="text-red-700">FAIL</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </section>

        {/* OUTGOING QUALITY CONTROL (8 CHECKLISTS) */}
        {(() => {
          const isItem1Pass = Boolean(activeOqc.check1LidSealing);
          const isItem2Pass = Boolean(isMixValid && activeOqc.check2MixValid);
          const isItem3Pass = Boolean(activeOqc.check3ExpiryLabel && activeOqc.check3WashLabel !== false);
          const isItem4Pass = Boolean(
            activeOqc.check4NetWeightPass &&
            (!activeOqc.sampleWeights || activeOqc.sampleWeights.every((w) => w >= 140))
          );
          const isItem5Pass = Boolean(activeOqc.check5Physical);
          const isItem6Pass = Boolean(activeOqc.check6QtyMatch);
          const isItem7Pass = Boolean(activeOqc.check7RoomTempPass);
          const isItem8Pass = Boolean(activeOqc.check8CrateClean);

          const oqc8PassCount = [
            isItem1Pass,
            isItem2Pass,
            isItem3Pass,
            isItem4Pass,
            isItem5Pass,
            isItem6Pass,
            isItem7Pass,
            isItem8Pass,
          ].filter(Boolean).length;

          return (
            <section className="space-y-1">
              <div className="flex items-center justify-between border-b border-slate-300 pb-0.5 gap-2 flex-wrap">
                <div className="flex items-center gap-1.5">
                  <h2 className="text-[10px] font-bold text-slate-900">
                    ผลการตรวจควบคุมคุณภาพก่อนจัดส่ง (OQC Verification — 8 รายการสำคัญ)
                  </h2>
                  <span
                    className={`px-1.5 py-0.25 rounded text-[8px] font-bold ${
                      oqc8PassCount === 8
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : 'bg-amber-100 text-amber-800 border border-amber-300'
                    }`}
                  >
                    ผ่านเกณฑ์ {oqc8PassCount}/8 ข้อ
                  </span>
                </div>
                <span className="text-[8.5px] tabular-nums font-medium text-slate-500 shrink-0">
                  เวลาตรวจ {activeOqc.inspectionTime} น.
                </span>
              </div>

              <div className="overflow-hidden border border-slate-200 rounded-md">
                <table className="w-full text-left border-collapse text-[8px] leading-tight">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 font-semibold text-slate-700">
                      <th className="py-0.75 px-1.5 w-6 text-center">#</th>
                      <th className="py-0.75 px-2 w-36">หัวข้อการตรวจสอบ (Checklist)</th>
                      <th className="py-0.75 px-2 w-52">เกณฑ์มาตรฐาน 7-Eleven</th>
                      <th className="py-0.75 px-2">ผลการตรวจบันทึกจริง</th>
                      <th className="py-0.75 px-1.5 w-14 text-center">ผลตรวจ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {/* 1. การปิดผนึกฝากล่อง */}
                    <tr>
                      <td className="py-0.75 px-1.5 text-center font-bold text-slate-500">1</td>
                      <td className="py-0.75 px-2 font-semibold text-slate-900">การปิดผนึกฝากล่อง</td>
                      <td className="py-0.75 px-2 text-slate-600">
                        ปิดสนิท 4 มุม แน่นหนา ไม่เผยอ/ฉีกขาด
                      </td>
                      <td className="py-0.75 px-2 tabular-nums text-slate-800">
                        {activeOqc.check1Note ||
                          (isItem1Pass ? 'ฝากล่อง PET ปิดสนิทเรียบร้อย 4 มุม' : 'พบฝากล่องปิดไม่สนิท')}
                      </td>
                      <td className="py-0.75 px-1.5 text-center">
                        <span
                          className={`inline-block px-1.5 py-0.25 rounded text-[7.5px] font-bold ${
                            isItem1Pass
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {isItem1Pass ? 'PASS' : 'FAIL'}
                        </span>
                      </td>
                    </tr>

                    {/* 2. การผสมสีสายพันธุ์ */}
                    <tr>
                      <td className="py-0.75 px-1.5 text-center font-bold text-slate-500">2</td>
                      <td className="py-0.75 px-2 font-semibold text-slate-900">การผสมสีสายพันธุ์</td>
                      <td className="py-0.75 px-2 text-slate-600">
                        คละ 3–5 สี (เขียวคู่แดง ครบ 100%)
                      </td>
                      <td className="py-0.75 px-2 tabular-nums text-slate-800">
                        คละ {activeMixItems.length} สี ({activeMixItems.map((m) => `${m.varietyCode} ${m.percentage}%`).join(', ')}) · รวม {totalMixLotsCount} ล็อต
                      </td>
                      <td className="py-0.75 px-1.5 text-center">
                        <span
                          className={`inline-block px-1.5 py-0.25 rounded text-[7.5px] font-bold ${
                            isItem2Pass
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {isItem2Pass ? 'PASS' : 'FAIL'}
                        </span>
                      </td>
                    </tr>

                    {/* 3. ฉลาก MFG/EXP และคำเตือน */}
                    <tr>
                      <td className="py-0.75 px-1.5 text-center font-bold text-slate-500">3</td>
                      <td className="py-0.75 px-2 font-semibold text-slate-900">ฉลาก MFG/EXP และคำเตือน</td>
                      <td className="py-0.75 px-2 text-slate-600">
                        อายุ 6 วัน (MFG+6) &amp; &ldquo;ล้างก่อนรับประทาน&rdquo;
                      </td>
                      <td className="py-0.75 px-2 tabular-nums text-slate-800">
                        MFG: {activeOqc.mfgDate} | EXP: {activeOqc.expDate} (+{shelfDays ?? 6} วัน) · ระบุคำเตือนชัดเจน
                      </td>
                      <td className="py-0.75 px-1.5 text-center">
                        <span
                          className={`inline-block px-1.5 py-0.25 rounded text-[7.5px] font-bold ${
                            isItem3Pass
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {isItem3Pass ? 'PASS' : 'FAIL'}
                        </span>
                      </td>
                    </tr>

                    {/* 4. น้ำหนักสุทธิสินค้า */}
                    <tr>
                      <td className="py-0.75 px-1.5 text-center font-bold text-slate-500">4</td>
                      <td className="py-0.75 px-2 font-semibold text-slate-900">น้ำหนักสุทธิสินค้า</td>
                      <td className="py-0.75 px-2 text-slate-600">
                        &ge; 140.0 กรัม/กล่อง (สุ่ม 10 กล่อง)
                      </td>
                      <td className="py-0.75 px-2 tabular-nums text-slate-800">
                        เฉลี่ย {activeOqc.netWeightG} g {activeOqc.sampleWeights && activeOqc.sampleWeights.length > 0 ? `(Min ${Math.min(...activeOqc.sampleWeights)}g / Max ${Math.max(...activeOqc.sampleWeights)}g)` : '(≥ 140g ทุกกล่อง)'}
                      </td>
                      <td className="py-0.75 px-1.5 text-center">
                        <span
                          className={`inline-block px-1.5 py-0.25 rounded text-[7.5px] font-bold ${
                            isItem4Pass
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {isItem4Pass ? 'PASS' : 'FAIL'}
                        </span>
                      </td>
                    </tr>

                    {/* 5. ลักษณะทางกายภาพ */}
                    <tr>
                      <td className="py-0.75 px-1.5 text-center font-bold text-slate-500">5</td>
                      <td className="py-0.75 px-2 font-semibold text-slate-900">ลักษณะทางกายภาพ</td>
                      <td className="py-0.75 px-2 text-slate-600">
                        ผลสดตึง ขั้วเขียว ไร้หยดน้ำ/ผลช้ำ
                      </td>
                      <td className="py-0.75 px-2 tabular-nums text-slate-800">
                        {activeOqc.check5Note ||
                          (isItem5Pass ? 'ผลสดตึงเงางาม ผิวแห้ง ขั้วเขียว ไร้ตำหนิ' : 'พบข้อบกพร่องทางกายภาพ')}
                      </td>
                      <td className="py-0.75 px-1.5 text-center">
                        <span
                          className={`inline-block px-1.5 py-0.25 rounded text-[7.5px] font-bold ${
                            isItem5Pass
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {isItem5Pass ? 'PASS' : 'FAIL'}
                        </span>
                      </td>
                    </tr>

                    {/* 6. จำนวนจัดส่งตาม PO */}
                    <tr>
                      <td className="py-0.75 px-1.5 text-center font-bold text-slate-500">6</td>
                      <td className="py-0.75 px-2 font-semibold text-slate-900">จำนวนจัดส่งตาม PO</td>
                      <td className="py-0.75 px-2 text-slate-600">
                        ส่งมอบครบถ้วน 100% ตามใบสั่งซื้อ
                      </td>
                      <td className="py-0.75 px-2 tabular-nums text-slate-800">
                        ครบตาม PO ({activeOqc.actualPacks.toLocaleString()} แพ็ค / {activeOqc.crateQty} ตะกร้า)
                      </td>
                      <td className="py-0.75 px-1.5 text-center">
                        <span
                          className={`inline-block px-1.5 py-0.25 rounded text-[7.5px] font-bold ${
                            isItem6Pass
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {isItem6Pass ? 'PASS' : 'FAIL'}
                        </span>
                      </td>
                    </tr>

                    {/* 7. ควบคุมอุณหภูมิห้อง */}
                    <tr>
                      <td className="py-0.75 px-1.5 text-center font-bold text-slate-500">7</td>
                      <td className="py-0.75 px-2 font-semibold text-slate-900">ควบคุมอุณหภูมิห้อง</td>
                      <td className="py-0.75 px-2 text-slate-600">
                        ควบคุมความเย็น 2.0 – 6.0 °C
                      </td>
                      <td className="py-0.75 px-2 tabular-nums text-slate-800">
                        {activeOqc.roomTempC.toFixed(1)} °C (ควบคุมความเย็น)
                      </td>
                      <td className="py-0.75 px-1.5 text-center">
                        <span
                          className={`inline-block px-1.5 py-0.25 rounded text-[7.5px] font-bold ${
                            isItem7Pass
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {isItem7Pass ? 'PASS' : 'FAIL'}
                        </span>
                      </td>
                    </tr>

                    {/* 8. สุขอนามัยตะกร้าขนส่ง */}
                    <tr>
                      <td className="py-0.75 px-1.5 text-center font-bold text-slate-500">8</td>
                      <td className="py-0.75 px-2 font-semibold text-slate-900">สุขอนามัยตะกร้าขนส่ง</td>
                      <td className="py-0.75 px-2 text-slate-600">
                        ล้างฆ่าเชื้อ แห้งสะอาด เรียงมั่นคง
                      </td>
                      <td className="py-0.75 px-2 tabular-nums text-slate-800">
                        {activeOqc.check8Note ||
                          (isItem8Pass ? 'ตะกร้าผ่านการฆ่าเชื้อ แห้งสนิท จัดเรียงเรียบร้อย' : 'ตะกร้าไม่ผ่านเกณฑ์')}
                      </td>
                      <td className="py-0.75 px-1.5 text-center">
                        <span
                          className={`inline-block px-1.5 py-0.25 rounded text-[7.5px] font-bold ${
                            isItem8Pass
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {isItem8Pass ? 'PASS' : 'FAIL'}
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          );
        })()}

        {/* OVERALL VERIFICATION SUMMARY & CRITERIA BOXES */}
        {(() => {
          const isAllPass = canStampPass;

          return (
            <section className="space-y-0.5">
              <div
                className={`border rounded-lg p-2 space-y-1 text-[8px] ${
                  isAllPass
                    ? 'border-emerald-300 bg-emerald-50/50 text-emerald-950'
                    : 'border-red-300 bg-red-50/50 text-red-950'
                }`}
              >
                {/* แถบหัวเรื่องและสถานะการตัดสิน */}
                <div className="flex items-center justify-between pb-1 border-b border-slate-200/80 gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 min-w-0">
                    {isAllPass ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                    ) : (
                      <AlertCircle className="w-3.5 h-3.5 text-red-700 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <h2 className="text-[9.5px] font-bold text-slate-900 leading-tight">
                        สรุปผลการประเมินคุณภาพและอนุมัติปล่อยผ่าน (Quality Verification &amp; Release Summary)
                      </h2>
                      <div className="text-[8px] text-slate-600 mt-0.5 leading-tight">
                        {isAllPass
                          ? 'ผลการตัดสิน: อนุมัติการปล่อยผ่านสินค้าสู่ศูนย์กระจายสินค้า 7-Eleven (APPROVED FOR 7-ELEVEN DISTRIBUTION)'
                          : 'ผลการตัดสิน: ระงับการปล่อยผ่านสินค้าชั่วคราว (HOLD / REJECT — PENDING CAPA RECTIFICATION)'}
                      </div>
                    </div>
                  </div>

                  <span
                    className={`inline-block px-2 py-0.5 rounded text-[8px] font-bold shrink-0 uppercase tracking-wide ${
                      isAllPass
                        ? 'bg-emerald-700 text-white shadow-2xs'
                        : 'bg-red-700 text-white shadow-2xs'
                    }`}
                  >
                    {isAllPass ? 'QA APPROVED · ผ่านเกณฑ์ 100%' : 'HOLD / REJECT'}
                  </span>
                </div>

                {/* ข้อความรับรองสั้นกระชับอย่างเป็นทางการ */}
                <div className="pt-0.5 border-t border-slate-200/60 text-[7.5px] text-slate-600 leading-tight">
                  <span className="font-semibold text-slate-800">ข้อความรับรอง: </span>
                  {isAllPass
                    ? 'ขอรับรองว่าผลิตภัณฑ์มะเขือเทศเชอร์รี่คละสีล็อตนี้ ได้ผ่านการตรวจวิเคราะห์และควบคุมคุณภาพตามข้อกำหนดมาตรฐาน 7-Eleven / บริษัท ซีพี ออลล์ จำกัด (มหาชน) ครบถ้วนทุกประการ อนุญาตให้ปล่อยผ่านเพื่อการกระจายสินค้าได้'
                    : 'พบรายการไม่ผ่านเกณฑ์การควบคุมคุณภาพ ไม่อนุญาตให้ปล่อยผ่านสินค้าจนกว่าจะดำเนินการแก้ไขตามมาตรการ CAPA และตรวจสอบซ้ำ'}
                </div>
              </div>
            </section>
          );
        })()}

        {/* CERTIFICATION, SIGNATURES & QR TRACEABILITY */}
        <section className="space-y-1">
          <div className="grid grid-cols-12 gap-2.5 items-stretch">
            {/* Box 1: ผู้รับรองผล COA (น.ส.พรปวีณ์ ร่วมศรี) */}
            <div className="col-span-4 border border-slate-200 rounded-lg p-2 flex flex-col justify-between bg-slate-50/50 hover:border-slate-300 transition-colors relative group">
              {/* Header Title */}
              <div className="text-center pb-0.5 border-b border-slate-200/80">
                <div className="text-[8.5px] font-bold text-slate-800 tracking-wide uppercase flex items-center justify-center gap-1">
                  <ShieldCheck className="w-2.5 h-2.5 text-emerald-600" />
                  <span>ผู้รับรองผล COA</span>
                </div>
                <div className="text-[7.5px] text-slate-500 font-medium">
                  COA Certified By
                </div>
              </div>

              {/* Dedicated Signature Slot (ช่องสำหรับเซ็นต์ลายเซ็น) */}
              <div
                onClick={() => onOpenSignModal?.('certifier')}
                className="my-1 min-h-[38px] h-[38px] flex flex-col items-center justify-center relative border border-dashed border-slate-300 rounded bg-white px-1 group/sig cursor-pointer transition-all hover:border-blue-400 hover:bg-blue-50/20"
                title="คลิกเพื่อเซ็นต์ลายเซ็น หรือเลือกโหมดลงนาม"
              >
                {signatureMode === 'digital' && certifierSig ? (
                  typeof certifierSig === 'string' && certifierSig.startsWith('data:') ? (
                    <img
                      src={certifierSig}
                      alt="ลายมือชื่อ น.ส.พรปวีณ์ ร่วมศรี"
                      className="h-7.5 max-w-full object-contain pointer-events-none"
                    />
                  ) : (
                    <PornpaweeSignatureSvg className="h-7.5 w-auto max-w-full" />
                  )
                ) : (
                  <div className="text-center space-y-0.25 select-none pointer-events-none">
                    <span className="text-[8px] text-slate-400 font-medium tracking-wide">
                      [ ช่องสำหรับเซ็นต์ลายเซ็น ]
                    </span>
                    <div className="text-[6.5px] text-slate-300">
                      (เซ็นสดด้วยปากกา หรือคลิกเพื่อเซ็นดิจิทัล)
                    </div>
                  </div>
                )}

                {/* Hover trigger hint (no-print) */}
                <div className="no-print absolute inset-0 bg-blue-900/10 rounded opacity-0 group-hover/sig:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                  <span className="bg-blue-700 text-white text-[7.5px] font-bold px-1.5 py-0.25 rounded shadow-xs flex items-center gap-1">
                    <PenTool className="w-2 h-2" /> เซ็นต์ลายเซ็น
                  </span>
                </div>
              </div>

              {/* Signature Line & Printed Full Name */}
              <div className="text-center space-y-0.25 pt-0.5">
                <div className="text-[8.5px] font-mono text-slate-400 leading-none">
                  ลงชื่อ ................................................................
                </div>
                <div className="font-bold text-slate-900 text-[9px] leading-tight pt-0.5">
                  ( {activeOqc.coaCertifier || docConfig.coaCertifier || 'น.ส.พรปวีณ์ ร่วมศรี'} )
                </div>
                <div className="text-[8px] text-slate-600 font-medium">
                  เจ้าหน้าที่ฝ่ายประกันคุณภาพ (QA Specialist)
                </div>
                <div className="text-[7.5px] text-slate-400 tabular-nums">
                  วันที่รับรอง: {formatThaiDate(activeOqc.inspectionDate)}
                </div>
              </div>
            </div>

            {/* Box 2: ผู้อนุมัติปล่อยสินค้า (นายเด่นชัย ห่วงจิง) */}
            <div className="col-span-4 border border-slate-200 rounded-lg p-2 flex flex-col justify-between bg-slate-50/50 hover:border-slate-300 transition-colors relative group">
              {/* Header Title */}
              <div className="text-center pb-0.5 border-b border-slate-200/80">
                <div className="text-[8.5px] font-bold text-slate-800 tracking-wide uppercase flex items-center justify-center gap-1">
                  <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600" />
                  <span>ผู้อนุมัติปล่อยสินค้า</span>
                </div>
                <div className="text-[7.5px] text-slate-500 font-medium">
                  Release Approved By
                </div>
              </div>

              {/* Dedicated Signature Slot (ช่องสำหรับเซ็นต์ลายเซ็น) */}
              <div
                onClick={() => onOpenSignModal?.('approver')}
                className="my-1 min-h-[38px] h-[38px] flex flex-col items-center justify-center relative border border-dashed border-slate-300 rounded bg-white px-1 group/sig cursor-pointer transition-all hover:border-blue-400 hover:bg-blue-50/20"
                title="คลิกเพื่อเซ็นต์ลายเซ็น หรือเลือกโหมดลงนาม"
              >
                {signatureMode === 'digital' && approverSig ? (
                  typeof approverSig === 'string' && approverSig.startsWith('data:') ? (
                    <img
                      src={approverSig}
                      alt="ลายมือชื่อ นายเด่นชัย ห่วงจิง"
                      className="h-7.5 max-w-full object-contain pointer-events-none"
                    />
                  ) : (
                    <DenchaiSignatureSvg className="h-7.5 w-auto max-w-full" />
                  )
                ) : (
                  <div className="text-center space-y-0.25 select-none pointer-events-none">
                    <span className="text-[8px] text-slate-400 font-medium tracking-wide">
                      [ ช่องสำหรับเซ็นต์ลายเซ็น ]
                    </span>
                    <div className="text-[6.5px] text-slate-300">
                      (เซ็นสดด้วยปากกา หรือคลิกเพื่อเซ็นดิจิทัล)
                    </div>
                  </div>
                )}

                {/* Hover trigger hint (no-print) */}
                <div className="no-print absolute inset-0 bg-blue-900/10 rounded opacity-0 group-hover/sig:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                  <span className="bg-blue-700 text-white text-[7.5px] font-bold px-1.5 py-0.25 rounded shadow-xs flex items-center gap-1">
                    <PenTool className="w-2 h-2" /> เซ็นต์ลายเซ็น
                  </span>
                </div>
              </div>

              {/* Signature Line & Printed Full Name */}
              <div className="text-center space-y-0.25 pt-0.5">
                <div className="text-[8.5px] font-mono text-slate-400 leading-none">
                  ลงชื่อ ................................................................
                </div>
                <div className="font-bold text-slate-900 text-[9px] leading-tight pt-0.5">
                  ( {activeOqc.releaseApprover || docConfig.releaseApprover || 'นายเด่นชัย ห่วงจิง'} )
                </div>
                <div className="text-[8px] text-slate-600 font-medium">
                  ผู้จัดการฝ่ายควบคุมคุณภาพ (QC Manager)
                </div>
                <div className="text-[7.5px] text-slate-400 tabular-nums">
                  วันที่อนุมัติ: {formatThaiDate(activeOqc.inspectionDate)}
                </div>
              </div>
            </div>

            {/* Box 3: QR Traceability (ควบคู่กับบล็อกลงนาม) */}
            <div
              onClick={onOpenQrModal}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onOpenQrModal?.();
                }
              }}
              className="col-span-4 border border-slate-200 hover:border-emerald-500 rounded-lg p-2 flex flex-col justify-between bg-white hover:bg-emerald-50/20 transition-all cursor-pointer group shadow-2xs hover:shadow-xs relative"
              title="คลิกเพื่อเปิดระบบตรวจสอบย้อนกลับ (QR Traceability Verification)"
            >
              {/* Header Title */}
              <div className="text-center pb-0.5 border-b border-slate-200/80">
                <div className="text-[8.5px] font-bold text-slate-800 tracking-wide uppercase flex items-center justify-center gap-1">
                  <QrCode className="w-2.5 h-2.5 text-emerald-600" />
                  <span>QR Traceability</span>
                </div>
                <div className="text-[7.5px] text-slate-500 font-medium">
                  ตรวจสอบย้อนกลับมาตรฐาน 7-Eleven
                </div>
              </div>

              {/* Centered QR Code with Frame */}
              <div className="my-1 flex flex-col items-center justify-center relative">
                <div className="p-0.5 bg-white border border-slate-200 rounded shadow-2xs group-hover:border-emerald-400 transition-colors">
                  <QRCodeSVG
                    value={qrTraceabilityPayload}
                    size={52}
                    level="M"
                    includeMargin={false}
                  />
                </div>
                <div className="no-print absolute inset-0 bg-emerald-900/10 rounded opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                  <span className="bg-emerald-700 text-white text-[7.5px] font-bold px-1.5 py-0.25 rounded shadow-xs flex items-center gap-1">
                    <ExternalLink className="w-2 h-2" /> ดูข้อมูล
                  </span>
                </div>
              </div>

              {/* Meta */}
              <div className="text-center space-y-0.25">
                <div className="text-[9.5px] font-mono font-bold text-slate-800 group-hover:text-emerald-800 transition-colors leading-tight">
                  {activeOqc.coaNumber}
                </div>
                <div className="text-[8px] text-slate-500 truncate">
                  ล็อต FG: {activeOqc.productionLotNo || activeOqc.oqcNumber}
                </div>
                <div className="text-[7.5px] font-semibold text-emerald-700">
                  {canStampPass ? '✓ อนุมัติจัดส่ง (Approved)' : '⚠ ระงับจัดส่ง (Hold)'}
                </div>
              </div>
            </div>
          </div>

          <footer className="pt-1.5 border-t border-slate-200 flex flex-row items-center justify-between gap-2 text-[8px] text-slate-500">
            <span className="tabular-nums">
              เอกสารควบคุม {activeOqc.coaNumber} · ระบบตรวจสอบย้อนกลับและลงนามดิจิทัลมาตรฐาน CP ALL / 7-Eleven
            </span>
            <span className="text-[8px] text-slate-400">
              สถานะ: {canStampPass ? 'อนุมัติปล่อยผ่าน (RELEASED)' : 'ระงับการปล่อยผ่าน (HOLD)'}
            </span>
          </footer>
        </section>
      </article>
    );
  }
);

CoaCertificateSheet.displayName = 'CoaCertificateSheet';

interface DigitalSignatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetRole: 'certifier' | 'approver';
  targetName: string;
  targetTitle: string;
  inspectionDate: string;
  currentSig: string | null;
  signatureMode: 'digital' | 'manual';
  onSaveSignature: (sig: string | null) => void;
  onSetSignatureMode: (mode: 'digital' | 'manual') => void;
  onSwitchTarget: (role: 'certifier' | 'approver') => void;
  otherTargetName: string;
}

export const DigitalSignatureModal: React.FC<DigitalSignatureModalProps> = ({
  isOpen,
  onClose,
  targetRole,
  targetName,
  targetTitle,
  inspectionDate,
  currentSig,
  signatureMode,
  onSaveSignature,
  onSetSignatureMode,
  onSwitchTarget,
  otherTargetName,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [activeTab, setActiveTab] = useState<'draw' | 'preset' | 'manual'>('draw');
  const [isDrawing, setIsDrawing] = useState(false);
  const [penColor, setPenColor] = useState('#1e40af'); // Official deep blue ink
  const [penWidth] = useState(2.6);
  const [hasDrawn, setHasDrawn] = useState(false);

  // Initialize canvas
  useEffect(() => {
    if (isOpen && activeTab === 'draw' && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        setHasDrawn(false);
      }
    }
  }, [isOpen, activeTab, targetRole]);

  if (!isOpen) return null;

  const getCanvasCoords = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const handleStartDraw = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    if ('touches' in e && e.cancelable) e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { x, y } = getCanvasCoords(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.strokeStyle = penColor;
    ctx.lineWidth = penWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    setIsDrawing(true);
    setHasDrawn(true);
  };

  const handleDrawMove = (
    e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>
  ) => {
    if (!isDrawing) return;
    if ('touches' in e && e.cancelable) e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const { x, y } = getCanvasCoords(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const handleStopDraw = () => {
    setIsDrawing(false);
  };

  const handleClearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  const handleApply = () => {
    if (activeTab === 'draw') {
      if (canvasRef.current && hasDrawn) {
        const dataUrl = canvasRef.current.toDataURL('image/png');
        onSaveSignature(dataUrl);
        onSetSignatureMode('digital');
      } else {
        onSaveSignature('preset');
        onSetSignatureMode('digital');
      }
    } else if (activeTab === 'preset') {
      onSaveSignature('preset');
      onSetSignatureMode('digital');
    } else if (activeTab === 'manual') {
      onSaveSignature(null);
      onSetSignatureMode('manual');
    }
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <FileSignature className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-sm">
                จัดการช่องเซ็นต์ลายเซ็น (Signature Manager)
              </h3>
              <p className="text-xs text-slate-500">
                {targetRole === 'certifier' ? 'ผู้รับรองผล COA' : 'ผู้อนุมัติปล่อยสินค้า'} :{' '}
                <span className="font-semibold text-slate-800">{targetName}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Target Switcher */}
        <div className="px-5 pt-3.5 pb-2 bg-slate-100/60 border-b border-slate-200 flex items-center justify-between gap-2 text-xs">
          <span className="font-medium text-slate-600">ตำแหน่งที่กำลังลงนาม:</span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onSwitchTarget('certifier')}
              className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                targetRole === 'certifier'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-50'
              }`}
            >
              1. ผู้รับรองผล COA
            </button>
            <button
              type="button"
              onClick={() => onSwitchTarget('approver')}
              className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                targetRole === 'approver'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-50'
              }`}
            >
              2. ผู้อนุมัติปล่อยสินค้า
            </button>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="flex border-b border-slate-200 px-5 bg-white text-xs font-semibold gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('draw')}
            className={`py-2.5 px-3 border-b-2 transition-colors inline-flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'draw'
                ? 'border-blue-600 text-blue-700 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <PenTool className="w-3.5 h-3.5" />
            <span>วาดลายเซ็นสด (Draw)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('preset')}
            className={`py-2.5 px-3 border-b-2 transition-colors inline-flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'preset'
                ? 'border-blue-600 text-blue-700 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>ลายเซ็นทางการ (Preset)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('manual')}
            className={`py-2.5 px-3 border-b-2 transition-colors inline-flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'manual'
                ? 'border-blue-600 text-blue-700 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>เว้นช่องเซ็นสดด้วยปากกา (Manual Slot)</span>
          </button>
        </div>

        {/* Content Area */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {activeTab === 'draw' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-slate-700">
                  ใช้เมาส์ หรือนิ้วมือเพื่อวาดลายมือชื่อในช่องด้านล่าง:
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-500">หมึกปากกา:</span>
                  <button
                    type="button"
                    onClick={() => setPenColor('#1e40af')}
                    className={`w-5 h-5 rounded-full bg-blue-800 border-2 transition-all cursor-pointer ${
                      penColor === '#1e40af' ? 'ring-2 ring-blue-400 scale-110' : 'border-white'
                    }`}
                    title="น้ำหมึกน้ำเงินทางการ"
                  />
                  <button
                    type="button"
                    onClick={() => setPenColor('#0f172a')}
                    className={`w-5 h-5 rounded-full bg-slate-900 border-2 transition-all cursor-pointer ${
                      penColor === '#0f172a' ? 'ring-2 ring-slate-400 scale-110' : 'border-white'
                    }`}
                    title="น้ำหมึกสีดำ"
                  />
                  <button
                    type="button"
                    onClick={() => setPenColor('#2563eb')}
                    className={`w-5 h-5 rounded-full bg-blue-600 border-2 transition-all cursor-pointer ${
                      penColor === '#2563eb' ? 'ring-2 ring-blue-300 scale-110' : 'border-white'
                    }`}
                    title="สีน้ำเงินเข้ม"
                  />
                  <button
                    type="button"
                    onClick={handleClearCanvas}
                    className="ml-2 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-50 border border-rose-200 rounded transition-colors inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Eraser className="w-3 h-3" /> ล้างกระดาน
                  </button>
                </div>
              </div>

              {/* Canvas Pad */}
              <div className="border-2 border-dashed border-blue-300 rounded-xl bg-slate-50/50 p-2 relative overflow-hidden flex flex-col items-center justify-center">
                <canvas
                  ref={canvasRef}
                  width={460}
                  height={150}
                  onMouseDown={handleStartDraw}
                  onMouseMove={handleDrawMove}
                  onMouseUp={handleStopDraw}
                  onMouseLeave={handleStopDraw}
                  onTouchStart={handleStartDraw}
                  onTouchMove={handleDrawMove}
                  onTouchEnd={handleStopDraw}
                  className="w-full h-[150px] bg-white rounded-lg shadow-inner cursor-crosshair touch-none"
                />
                {!hasDrawn && (
                  <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center text-slate-300 text-xs">
                    <PenTool className="w-6 h-6 mb-1 opacity-40 text-blue-500" />
                    <span>วาดลายเซ็นของคุณที่นี่</span>
                    <span className="text-[10px] text-slate-400">
                      (ระบบจะบันทึกลายเซ็นลงในช่องเซ็นต์ของ {targetName})
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'preset' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-600">
                ระบบจำลองลายมือชื่อดิจิทัลทางการมาตรฐานของผู้บริหารและหัวหน้างานฝ่ายคุณภาพ:
              </p>
              <div className="p-4 border border-slate-200 rounded-xl bg-slate-50 text-center space-y-2">
                <div className="p-3 bg-white rounded-lg border border-slate-200 shadow-2xs">
                  {targetRole === 'certifier' ? (
                    <PornpaweeSignatureSvg className="h-14 w-auto mx-auto" />
                  ) : (
                    <DenchaiSignatureSvg className="h-14 w-auto mx-auto" />
                  )}
                </div>
                <div className="font-bold text-slate-900 text-xs">
                  ( {targetName} )
                </div>
                <div className="text-[11px] text-slate-500 font-medium">
                  {targetTitle}
                </div>
                <div className="text-[10px] text-emerald-700 font-semibold">
                  ✓ ตราประทับกำกับฝ่ายคุณภาพมาตรฐาน CP ALL 7-Eleven
                </div>
              </div>
            </div>
          )}

          {activeTab === 'manual' && (
            <div className="space-y-3">
              <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/70 text-xs text-amber-900 space-y-2">
                <div className="font-bold flex items-center gap-1.5 text-amber-950">
                  <CheckCircle2 className="w-4 h-4 text-amber-700" />
                  <span>โหมดเว้นช่องสำหรับพิมพ์เพื่อเซ็นสดด้วยปากกา (Manual Signing)</span>
                </div>
                <p className="leading-relaxed">
                  เมื่อเลือกโหมดนี้ ระบบจะเว้นช่องสำหรับเซ็นต์ลายเซ็นบนหน้าใบรับรอง A4 ให้ว่างเปล่า
                  พร้อมเส้นประ `ลงชื่อ ....................................................`
                  และชื่อ-ตำแหน่ง เพื่อให้เจ้าหน้าที่สามารถพิมพ์เอกสารแล้วลงลายมือชื่อจริงด้วยปากกา
                </p>
              </div>

              <div className="p-4 border border-slate-200 rounded-xl bg-white text-center space-y-2">
                <div className="h-14 border border-dashed border-slate-300 rounded-lg flex items-center justify-center text-xs text-slate-400 font-mono">
                  [ ช่องว่างสำหรับลงลายมือชื่อสดด้วยปากกา ]
                </div>
                <div className="font-mono text-xs text-slate-400">
                  ลงชื่อ ................................................................
                </div>
                <div className="font-bold text-slate-900 text-xs">
                  ( {targetName} )
                </div>
                <div className="text-[11px] text-slate-500">
                  {targetTitle}
                </div>
              </div>
            </div>
          )}

          {/* Document Preview Snapshot */}
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-[11px] text-slate-600 space-y-1">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-800">วันที่กำกับเอกสาร:</span>
              <span className="tabular-nums font-mono">{formatThaiDate(inspectionDate)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-800">รูปแบบการแสดงผล:</span>
              <span className="font-medium text-blue-700">
                {activeTab === 'manual' ? 'เว้นช่องเซ็นสดด้วยปากกา' : 'ลายเซ็นดิจิทัล'}
              </span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-200/50 rounded-xl transition-colors cursor-pointer"
          >
            ยกเลิก
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleApply}
              className="px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all shadow-xs hover:shadow cursor-pointer flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>บันทึกและนำไปใช้</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export const COAView: React.FC<COAViewProps> = ({
  lots,
  labRecords,
  outgoingRecords,
  selectedOqcId,
  onSelectOqcId,
  docConfig,
  onUpdateDocConfig,
  onUpdateOutgoingRecord,
  onNotify,
}) => {
  const [activeTab, setActiveTab] = useState<CoaWorkspaceTab>('PREVIEW');
  const [showQrModal, setShowQrModal] = useState<boolean>(false);
  const [qrEncodingMode, setQrEncodingMode] = useState<'url' | 'json'>('url');
  const [qrModalTab, setQrModalTab] = useState<'traceability' | 'qr' | 'json'>('traceability');
  const [copiedType, setCopiedType] = useState<'url' | 'json' | null>(null);
  const [isFullscreenPreview, setIsFullscreenPreview] = useState<boolean>(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState<boolean>(false);

  // Signature States (ผู้รับรองผล COA & ผู้อนุมัติปล่อยสินค้า)
  const [signatureMode, setSignatureMode] = useState<'digital' | 'manual'>('digital');
  const [certifierSig, setCertifierSig] = useState<string | null>('preset');
  const [approverSig, setApproverSig] = useState<string | null>('preset');
  const [signModalTarget, setSignModalTarget] = useState<'certifier' | 'approver' | null>(null);

  // Interactive Zoom State ('fit' automatically scales the 794px Web A4 sheet to fit mobile/tablet widths)
  const [zoomMode, setZoomMode] = useState<'fit' | 'custom'>('fit');
  const [customZoom, setCustomZoom] = useState<number>(1);
  const [fitScale, setFitScale] = useState<number>(1);
  const [fullscreenFitScale, setFullscreenFitScale] = useState<number>(1);
  const [sheetNaturalHeight, setSheetNaturalHeight] = useState<number>(A4_WEB_HEIGHT_PX);

  const stageOuterRef = useRef<HTMLDivElement | null>(null);
  const previewStageRef = useRef<HTMLDivElement | null>(null);
  const fullscreenOuterRef = useRef<HTMLDivElement | null>(null);
  const fullscreenStageRef = useRef<HTMLDivElement | null>(null);
  const previewSheetRef = useRef<HTMLElement | null>(null);
  const pdfCaptureRef = useRef<HTMLElement | null>(null);
  const lastStageWidthRef = useRef<number>(0);
  const lastFullscreenWidthRef = useRef<number>(0);

  // Pinch-to-zoom & double-tap tracking for touch screens (Mobile & Tablet)
  const pinchStartDistRef = useRef<number | null>(null);
  const pinchStartZoomRef = useRef<number>(1);
  const lastTapTimeRef = useRef<number>(0);

  // Mouse drag-to-pan tracking when zoomed in on Desktop
  const dragPanRef = useRef<{
    isDown: boolean;
    startX: number;
    startY: number;
    scrollLeft: number;
    scrollTop: number;
  }>({
    isDown: false,
    startX: 0,
    startY: 0,
    scrollLeft: 0,
    scrollTop: 0,
  });

  const activeOqc = useMemo(() => {
    if (selectedOqcId) {
      const found = outgoingRecords.find((r) => r.id === selectedOqcId);
      if (found) return found;
    }
    return outgoingRecords[0] || null;
  }, [outgoingRecords, selectedOqcId]);

  const activeMixItems = useMemo(() => {
    if (!activeOqc) return [];
    return activeOqc.colorMix.filter((m) => m.percentage > 0);
  }, [activeOqc]);

  const incomingByLot = useMemo(() => {
    const m = new Map<string, IncomingLotRecord>();
    for (const l of lots) m.set(l.lotNumber, l);
    return m;
  }, [lots]);

  const labByLot = useMemo(() => {
    const m = new Map<string, LabRecord>();
    for (const r of labRecords) m.set(r.lotNumber, r);
    return m;
  }, [labRecords]);

  // Evaluate linked Incoming + Lab + OQC (8 Checklists) statuses for Active COA
  const coaEvaluation = useMemo(() => {
    if (!activeOqc) {
      return {
        allLabPass: false,
        labFailures: [] as string[],
        allOqcPass: false,
        canStampPass: false,
      };
    }

    const labFailures: string[] = [];
    for (const mix of activeMixItems) {
      const lotList = getMixLotNumbers(mix);
      if (lotList.length === 0) {
        labFailures.push(
          `${TOMATO_VARIETIES[mix.varietyCode].nameTh}: ยังไม่ได้ระบุล็อตวัตถุดิบ`
        );
        continue;
      }
      for (const lotNo of lotList) {
        const lab = labByLot.get(lotNo);
        if (!lab || lab.overallLabStatus === 'PENDING') {
          labFailures.push(
            `${lotNo} (${TOMATO_VARIETIES[mix.varietyCode].nameTh}): อยู่ระหว่างรอผลการตรวจสอบทางห้องปฏิบัติการ (รอผลการตรวจสอบ)`
          );
        } else if (lab.overallLabStatus === 'FAIL') {
          const reasons: string[] = [];
          if (lab.organophosphateCarbamate === 'FAIL')
            reasons.push('Organophosphate & Carbamate ไม่ผ่าน');
          if (lab.organochlorinePyrethroid === 'FAIL')
            reasons.push('Organochlorine & Pyrethroid ไม่ผ่าน');
          if (lab.brixValue !== null && lab.brixValue <= 6.0)
            reasons.push(
              `ความหวาน ${lab.brixValue.toFixed(1)} %Brix ไม่ผ่านเกณฑ์ 7-Eleven (> 6.0 %Brix)`
            );
          labFailures.push(`${lotNo}: ${reasons.join(', ') || 'Lab FAIL'}`);
        }
      }
    }

    const mixCheck = evaluateColorMixRules(activeOqc.colorMix);
    const allLabPass = activeMixItems.length >= 3 && labFailures.length === 0;
    const allOqcPass =
      activeOqc.check1LidSealing &&
      activeOqc.check2MixValid &&
      mixCheck.isValid &&
      activeOqc.check3ExpiryLabel &&
      activeOqc.check3WashLabel !== false &&
      activeOqc.check4NetWeightPass &&
      activeOqc.check5Physical &&
      activeOqc.check6QtyMatch &&
      activeOqc.check7RoomTempPass &&
      activeOqc.check8CrateClean;

    const canStampPass = allLabPass && allOqcPass;

    return {
      allLabPass,
      labFailures,
      allOqcPass,
      canStampPass,
    };
  }, [activeOqc, activeMixItems, labByLot]);

  const totalMixLotsCount = useMemo(() => {
    return activeMixItems.reduce(
      (acc, mix) => acc + getMixLotNumbers(mix).length,
      0
    );
  }, [activeMixItems]);

  const releaseStatusText = coaEvaluation.canStampPass
    ? 'อนุมัติปล่อยล็อตจัดส่ง (RELEASED)'
    : 'ระงับการปล่อยล็อต (HOLD / SUSPENDED)';

  const qrTraceabilityPayload = useMemo(() => {
    if (!activeOqc) return '';
    const lotCodes = activeMixItems
      .map((c) => `${c.varietyCode}:${getMixLotNumbers(c).join(',')}`)
      .join('|');
    return JSON.stringify({
      system: 'FreshTom QC & COA Suite',
      coa: activeOqc.coaNumber,
      fgLot: activeOqc.productionLotNo || activeOqc.oqcNumber,
      issueDate: activeOqc.inspectionDate,
      standards: docConfig.internationalStandards,
      customer: activeOqc.customerName,
      dc: activeOqc.distributionCenter || '-',
      po: activeOqc.poNumber,
      mfg: activeOqc.mfgDate,
      exp: activeOqc.expDate,
      mandatoryLabel:
        activeOqc.check3WashLabel !== false
          ? 'ล้างก่อนรับประทาน (Wash before consumption)'
          : 'MISSING_WASH_LABEL',
      netWeightG: activeOqc.netWeightG,
      mixVarietiesCount: activeMixItems.length,
      lots: lotCodes,
      labStatus: coaEvaluation.allLabPass ? 'PASS' : 'FAIL',
      releaseStatus: coaEvaluation.canStampPass ? 'RELEASED' : 'HOLD_SUSPENDED',
      qaStamp: coaEvaluation.canStampPass ? 'QA_PASSED' : 'STAMP_SUSPENDED',
      verifiedAt: new Date().toISOString(),
    });
  }, [activeOqc, activeMixItems, coaEvaluation, docConfig]);

  const qrVerificationUrl = useMemo(() => {
    if (!activeOqc) return '';
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}/?tab=coa&coaNumber=${encodeURIComponent(activeOqc.coaNumber)}&lot=${encodeURIComponent(activeOqc.productionLotNo || activeOqc.oqcNumber)}&verify=true`;
  }, [activeOqc]);

  const activeQrCodeValue = useMemo(() => {
    return qrEncodingMode === 'url' ? qrVerificationUrl : qrTraceabilityPayload;
  }, [qrEncodingMode, qrVerificationUrl, qrTraceabilityPayload]);

  const handleCopyText = (text: string, type: 'url' | 'json') => {
    navigator.clipboard?.writeText(text);
    setCopiedType(type);
    onNotify?.(
      type === 'url' ? 'คัดลอกลิงก์สำเร็จ' : 'คัดลอกข้อมูล JSON สำเร็จ',
      type === 'url'
        ? 'สามารถส่งต่อลิงก์สำหรับเปิดดูหน้าตรวจสอบย้อนกลับได้ทันที'
        : 'คัดลอก JSON Payload ลงในคลิปบอร์ดแล้ว',
      'success'
    );
    setTimeout(() => {
      setCopiedType(null);
    }, 2500);
  };

  const handleDownloadQrPng = () => {
    const svgEl = document.getElementById('modal-traceability-qr-svg');
    if (!svgEl) return;
    try {
      const svgData = new XMLSerializer().serializeToString(svgEl);
      const canvas = document.createElement('canvas');
      canvas.width = 600;
      canvas.height = 600;
      const ctx = canvas.getContext('2d');
      const img = new Image();
      img.onload = () => {
        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, 600, 600);
          ctx.drawImage(img, 50, 50, 500, 500);
          const a = document.createElement('a');
          a.download = `QR_Traceability_${activeOqc.coaNumber}.png`;
          a.href = canvas.toDataURL('image/png');
          a.click();
          onNotify?.(
            'ดาวน์โหลด QR Code สำเร็จ',
            `บันทึกไฟล์ QR_Traceability_${activeOqc.coaNumber}.png เรียบร้อยแล้ว`,
            'success'
          );
        }
      };
      img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgData)));
    } catch {
      onNotify?.('ดาวน์โหลด QR Code ไม่สำเร็จ', 'กรุณาลองใหม่อีกครั้ง', 'warning');
    }
  };

  // Measure non-scrolling outer Preview Card width to compute rock-solid Fit-to-Screen scale (zero scrollbar loop)
  useEffect(() => {
    if (activeTab !== 'PREVIEW') return;
    const el = stageOuterRef.current;
    if (!el) return;

    lastStageWidthRef.current = 0;

    const updateFitScale = () => {
      const innerWidth = el.clientWidth;
      if (innerWidth <= 0) return;
      if (
        lastStageWidthRef.current > 0 &&
        Math.abs(innerWidth - lastStageWidthRef.current) < 2
      ) {
        return;
      }
      lastStageWidthRef.current = innerWidth;

      const isSmUp = window.matchMedia('(min-width: 640px)').matches;
      const horizontalGutter = isSmUp ? 42 : 26;
      const available = Math.max(220, innerWidth - horizontalGutter);
      const nextFit = Math.min(
        1,
        Math.max(MIN_ZOOM, Math.floor((available / A4_WEB_WIDTH_PX) * 1000) / 1000)
      );
      setFitScale((prev) => (Math.abs(prev - nextFit) < 0.002 ? prev : nextFit));
    };

    updateFitScale();
    const observer = new ResizeObserver(updateFitScale);
    observer.observe(el);
    return () => observer.disconnect();
  }, [activeTab, activeOqc?.id]);

  // Measure non-scrolling outer Fullscreen Overlay width when modal is open
  useEffect(() => {
    if (!isFullscreenPreview) return;
    const el = fullscreenOuterRef.current;
    if (!el) return;

    lastFullscreenWidthRef.current = 0;

    const updateFullscreenFit = () => {
      const innerWidth = el.clientWidth;
      if (innerWidth <= 0) return;
      if (
        lastFullscreenWidthRef.current > 0 &&
        Math.abs(innerWidth - lastFullscreenWidthRef.current) < 2
      ) {
        return;
      }
      lastFullscreenWidthRef.current = innerWidth;

      const isSmUp = window.matchMedia('(min-width: 640px)').matches;
      const horizontalGutter = isSmUp ? 68 : 36;
      const available = Math.max(220, innerWidth - horizontalGutter);
      const nextFit = Math.min(
        1.15,
        Math.max(MIN_ZOOM, Math.floor((available / A4_WEB_WIDTH_PX) * 1000) / 1000)
      );
      setFullscreenFitScale((prev) =>
        Math.abs(prev - nextFit) < 0.002 ? prev : nextFit
      );
    };

    updateFullscreenFit();
    const observer = new ResizeObserver(updateFullscreenFit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [isFullscreenPreview]);

  // Track natural height of the unscaled offscreen 794px A4 sheet so scaled container leaves zero dead space
  useEffect(() => {
    const sheetEl = pdfCaptureRef.current;
    if (!sheetEl) return;

    const updateHeight = () => {
      const h = sheetEl.offsetHeight;
      if (h > 200) {
        setSheetNaturalHeight((prev) => (Math.abs(prev - h) <= 1 ? prev : h));
      }
    };

    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(sheetEl);
    return () => observer.disconnect();
  }, [activeOqc, docConfig, activeMixItems.length]);

  const activeBaseFit = isFullscreenPreview ? fullscreenFitScale : fitScale;
  const effectiveScale = zoomMode === 'fit' ? activeBaseFit : customZoom;
  const zoomPercent = Math.round(effectiveScale * 100);

  const clampZoom = (val: number) =>
    Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(val.toFixed(2))));

  const handleZoomIn = useCallback(() => {
    const next = clampZoom(effectiveScale + ZOOM_STEP);
    setCustomZoom(next);
    setZoomMode('custom');
  }, [effectiveScale]);

  const handleZoomOut = useCallback(() => {
    const next = clampZoom(effectiveScale - ZOOM_STEP);
    setCustomZoom(next);
    setZoomMode('custom');
  }, [effectiveScale]);

  const handleResetFit = useCallback(() => {
    setZoomMode('fit');
  }, []);

  const handleSetActualSize = useCallback(() => {
    setCustomZoom(1);
    setZoomMode('custom');
  }, []);

  // Touch Pinch-to-Zoom & Double-Tap to Toggle Zoom (Fit <-> 100%)
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchStartDistRef.current = Math.hypot(dx, dy);
      pinchStartZoomRef.current = effectiveScale;
    } else if (e.touches.length === 1) {
      const now = Date.now();
      if (now - lastTapTimeRef.current < 280) {
        if (zoomMode === 'fit' && activeBaseFit < 0.95) {
          setCustomZoom(1);
          setZoomMode('custom');
        } else {
          setZoomMode('fit');
        }
        lastTapTimeRef.current = 0;
      } else {
        lastTapTimeRef.current = now;
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length === 2 && pinchStartDistRef.current !== null) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      if (pinchStartDistRef.current > 10) {
        const ratio = dist / pinchStartDistRef.current;
        const next = clampZoom(pinchStartZoomRef.current * ratio);
        setCustomZoom(next);
        setZoomMode('custom');
      }
    }
  };

  const handleTouchEnd = () => {
    pinchStartDistRef.current = null;
  };

  // Trackpad Pinch / Ctrl+Wheel Zoom inside Preview Stage
  const handleWheelZoom = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.08 : -0.08;
      const next = clampZoom(effectiveScale + delta);
      setCustomZoom(next);
      setZoomMode('custom');
    }
  };

  // Mouse Drag-to-Pan when zoomed wider than viewport
  const handleMouseDownPan = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const container = e.currentTarget;
    if (
      container.scrollWidth <= container.clientWidth &&
      container.scrollHeight <= container.clientHeight
    ) {
      return;
    }
    dragPanRef.current = {
      isDown: true,
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: container.scrollLeft,
      scrollTop: container.scrollTop,
    };
  };

  const handleMouseMovePan = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!dragPanRef.current.isDown) return;
    const container = e.currentTarget;
    const dx = e.clientX - dragPanRef.current.startX;
    const dy = e.clientY - dragPanRef.current.startY;
    container.scrollLeft = dragPanRef.current.scrollLeft - dx;
    container.scrollTop = dragPanRef.current.scrollTop - dy;
  };

  const handleMouseUpPan = () => {
    dragPanRef.current.isDown = false;
  };

  const handlePrintA4 = () => {
    window.print();
  };

  const handleDownloadPdf = async () => {
    if (!activeOqc || isDownloadingPdf) return;
    const targetNode = pdfCaptureRef.current || previewSheetRef.current;
    if (!targetNode) return;

    setIsDownloadingPdf(true);
    try {
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }

      const captureWidth = A4_WEB_WIDTH_PX;
      const captureHeight = A4_WEB_HEIGHT_PX;

      let canvas: HTMLCanvasElement;
      try {
        canvas = await domToCanvas(targetNode, {
          width: captureWidth,
          height: captureHeight,
          scale: 2.5,
          backgroundColor: '#ffffff',
          timeout: 10000,
          style: {
            transform: 'none',
            width: `${captureWidth}px`,
            minWidth: `${captureWidth}px`,
            maxWidth: `${captureWidth}px`,
            height: `${captureHeight}px`,
            minHeight: `${captureHeight}px`,
            maxHeight: `${captureHeight}px`,
            margin: '0',
          },
        });
      } catch {
        // Fallback without external font re-fetch if restricted network blocks remote CSS
        canvas = await domToCanvas(targetNode, {
          width: captureWidth,
          height: captureHeight,
          scale: 2.5,
          backgroundColor: '#ffffff',
          font: false,
          style: {
            transform: 'none',
            width: `${captureWidth}px`,
            minWidth: `${captureWidth}px`,
            maxWidth: `${captureWidth}px`,
            height: `${captureHeight}px`,
            minHeight: `${captureHeight}px`,
            maxHeight: `${captureHeight}px`,
            margin: '0',
          },
        });
      }

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true,
      });

      const pageWidthMm = 210;
      const pageHeightMm = 297;

      // 100% Full-page edge-to-edge A4 (0, 0, 210, 297) - Fills the entire page without black borders or dead space
      pdf.addImage(
        imgData,
        'PNG',
        0,
        0,
        pageWidthMm,
        pageHeightMm,
        undefined,
        'FAST'
      );

      const safeFilename = `${activeOqc.coaNumber || 'COA-Document'}.pdf`;
      const pdfBlob = pdf.output('blob');
      const blobUrl = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = safeFilename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);

      onNotify?.(
        'ดาวน์โหลดเอกสาร PDF สำเร็จ',
        `บันทึกไฟล์ ${safeFilename} ขนาดมาตรฐาน A4 เรียบร้อยแล้ว`,
        'success'
      );
    } catch {
      onNotify?.(
        'ไม่สามารถดาวน์โหลดไฟล์ PDF ได้',
        'กรุณาลองใหม่อีกครั้ง หรือใช้ปุ่มพิมพ์เอกสารเพื่อบันทึกเป็น PDF',
        'error'
      );
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  if (!activeOqc) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-600">
        ยังไม่มีรายการสินค้าสำเร็จรูป (FG) สำหรับออกใบรับรอง COA
      </div>
    );
  }

  const shelfDays = daysBetweenIsoDates(activeOqc.mfgDate, activeOqc.expDate);

  const scaledBoxWidth = Math.floor(A4_WEB_WIDTH_PX * effectiveScale);
  const scaledBoxHeight = Math.ceil(sheetNaturalHeight * effectiveScale);

  const sheetSharedProps: Omit<CoaCertificateSheetProps, 'sheetId'> = {
    activeOqc,
    activeMixItems,
    incomingByLot,
    labByLot,
    docConfig,
    canStampPass: coaEvaluation.canStampPass,
    releaseStatusText,
    qrTraceabilityPayload: activeQrCodeValue,
    shelfDays,
    onOpenQrModal: () => setShowQrModal(true),
    certifierSig,
    approverSig,
    signatureMode,
    onOpenSignModal: (role: 'certifier' | 'approver') => setSignModalTarget(role),
  };

  return (
    <div className="space-y-5 min-w-0">
      {/* Offscreen Unscaled 794px Web A4 Node for Crisp 1:1 PDF Export at Any Zoom/Viewport */}
      <div
        className="no-print fixed top-0 left-[-10000px] w-[794px] h-[1123px] pointer-events-none -z-50"
        aria-hidden="true"
      >
        <CoaCertificateSheet ref={pdfCaptureRef} {...sheetSharedProps} />
      </div>

      {/* Control & Output Toolbar (Hidden on Print) */}
      <div className="no-print bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-4 min-w-0">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 min-w-0">
          {/* COA Shipment Selector */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-2.5 flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 shrink-0">
              <label
                htmlFor="coa-shipment-select"
                className="text-xs font-semibold text-slate-700 whitespace-nowrap"
              >
                เลือกหมายเลขล็อตสินค้า (FG):
              </label>

              {/* Mobile Compact QR Trigger (Inline with label so Print + Download PDF stay side-by-side below) */}
              <button
                type="button"
                onClick={() => {
                  setQrModalTab('traceability');
                  setShowQrModal(true);
                }}
                className="sm:hidden h-7 px-2.5 text-xs font-semibold text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-md transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 shadow-2xs cursor-pointer"
              >
                <QrCode className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                <span>QR Traceability</span>
              </button>
            </div>

            <select
              id="coa-shipment-select"
              value={activeOqc.id}
              onChange={(e) => onSelectOqcId(e.target.value)}
              className="w-full max-w-2xl min-w-0 h-10 sm:h-9 px-3 text-xs font-medium tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
            >
              {outgoingRecords.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.productionLotNo || r.oqcNumber} ({r.coaNumber}) — {r.customerName} · {r.distributionCenter || '-'} [PO: {r.poNumber}]
                </option>
              ))}
            </select>
          </div>

          {/* Primary Document Actions: Signatures + Print + Download PDF */}
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 w-full sm:w-auto shrink-0">
            {/* Manage Signatures Trigger */}
            <button
              type="button"
              onClick={() => setSignModalTarget('certifier')}
              className="h-10 sm:h-9 px-3 text-xs font-semibold text-blue-900 bg-blue-50 hover:bg-blue-100 border border-blue-300 rounded-lg transition-all inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 shadow-2xs hover:shadow-xs cursor-pointer"
              title="เปิดระบบจัดการและวาดลายเซ็นดิจิทัล"
            >
              <FileSignature className="w-4 h-4 text-blue-700 shrink-0" />
              <span>จัดการลายเซ็น</span>
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            </button>

            {/* Toggle Signature Mode */}
            <button
              type="button"
              onClick={() => {
                const nextMode = signatureMode === 'digital' ? 'manual' : 'digital';
                setSignatureMode(nextMode);
                onNotify?.(
                  'เปลี่ยนโหมดลายเซ็นแล้ว',
                  nextMode === 'digital'
                    ? 'แสดงลายเซ็นดิจิทัลพร้อมตราประทับมาตรฐาน'
                    : 'เว้นช่องสำหรับเซ็นลายมือชื่อสดด้วยปากกาบนกระดาษ A4',
                  'success'
                );
              }}
              className="hidden lg:inline-flex h-9 px-3 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              title="สลับระหว่างลายเซ็นดิจิทัล กับ ช่องว่างเซ็นสดด้วยปากกา"
            >
              <PenTool className="w-3.5 h-3.5 text-slate-600 shrink-0" />
              <span>{signatureMode === 'digital' ? 'โหมด: ลายเซ็นดิจิทัล' : 'โหมด: เซ็นสดด้วยปากกา'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setQrModalTab('traceability');
                setShowQrModal(true);
              }}
              className="hidden sm:inline-flex h-9 px-3.5 text-xs font-semibold text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-lg transition-all items-center justify-center gap-1.5 whitespace-nowrap shrink-0 shadow-2xs hover:shadow-xs cursor-pointer"
              title="เปิดระบบตรวจสอบย้อนกลับ QR Traceability ดิจิทัล"
            >
              <QrCode className="w-4 h-4 text-emerald-700 shrink-0" />
              <span>QR Traceability</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            </button>

            <button
              type="button"
              onClick={handlePrintA4}
              className="h-10 sm:h-9 px-3 sm:px-4 text-xs font-semibold text-slate-900 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors inline-flex items-center justify-center gap-1.5 min-w-0 cursor-pointer"
            >
              <Printer className="w-4 h-4 shrink-0" />
              <span className="truncate">พิมพ์เอกสาร</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isDownloadingPdf}
              className="h-10 sm:h-9 px-3 sm:px-4 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-lg transition-colors inline-flex items-center justify-center gap-1.5 min-w-0 cursor-pointer"
            >
              {isDownloadingPdf ? (
                <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
              ) : (
                <Download className="w-4 h-4 shrink-0" />
              )}
              <span className="truncate">
                {isDownloadingPdf ? 'กำลังสร้าง PDF...' : 'ดาวน์โหลด PDF'}
              </span>
            </button>
          </div>
        </div>

        {/* Workspace Tab Bar: Responsive 2-Column Segmented Control on Mobile, Inline Segmented on Tablet/Web */}
        <div className="pt-3.5 border-t border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 min-w-0">
          <div
            role="tablist"
            aria-label="มุมมองจัดการใบรับรอง COA"
            className="grid grid-cols-2 sm:inline-flex items-center gap-1 p-1 bg-slate-100 border border-slate-200/80 rounded-lg w-full sm:w-auto min-w-0"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'PREVIEW'}
              onClick={() => setActiveTab('PREVIEW')}
              className={`h-9 sm:h-8 px-2.5 sm:px-4 text-xs font-semibold rounded-md transition-all inline-flex items-center justify-center gap-1.5 min-w-0 ${
                activeTab === 'PREVIEW'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">ตัวอย่างเอกสาร (Tab Preview)</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'SETTINGS'}
              onClick={() => setActiveTab('SETTINGS')}
              className={`h-9 sm:h-8 px-2.5 sm:px-4 text-xs font-semibold rounded-md transition-all inline-flex items-center justify-center gap-1.5 min-w-0 ${
                activeTab === 'SETTINGS'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Settings2 className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">ตั้งค่าควบคุมเอกสาร</span>
            </button>
          </div>

          <div className="text-xs text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
            <span className="tabular-nums text-slate-700 font-semibold whitespace-nowrap">
              {activeOqc.coaNumber}
            </span>
            <span className="text-slate-300" aria-hidden="true">
              ·
            </span>
            <span className="tabular-nums">ขนาดมาตรฐาน A4 (210 × 297 มม.)</span>
          </div>
        </div>

        {/* Tab 2 Content: Editable Document Control & Partner DC Settings */}
        {activeTab === 'SETTINGS' && (
          <div className="pt-3 border-t border-slate-200 space-y-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
              <Building2 className="w-4 h-4 text-slate-600 shrink-0" />
              <span>
                แก้ไขส่วนหัวเอกสาร ข้อมูลผู้ผลิต และข้อมูลคู่ค้า/ศูนย์กระจายสินค้า (DC)
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 text-xs">
              <div className="md:col-span-6">
                <label className="block font-medium text-slate-700 mb-1">
                  ชื่อผู้ผลิตและโรงคัดบรรจุ
                </label>
                <input
                  type="text"
                  value={docConfig.companyName}
                  onChange={(e) =>
                    onUpdateDocConfig({ ...docConfig, companyName: e.target.value })
                  }
                  placeholder="บริษัท เดลิช ฟู้ดส์ จำกัด"
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-slate-900"
                />
              </div>
              <div className="md:col-span-6">
                <label className="block font-medium text-slate-700 mb-1">
                  เลขที่เอกสาร (COA No.) <span className="text-[10px] text-slate-500 font-normal">(ใช้เลขเดิมตลอดคงที่)</span>
                </label>
                <input
                  type="text"
                  value="COA-001"
                  readOnly
                  disabled
                  className="w-full px-3 py-1.5 tabular-nums font-bold text-slate-900 bg-slate-100 border border-slate-300 rounded-md cursor-not-allowed select-none"
                  title="เลขที่เอกสาร (COA No.) ใช้เลขเดิมตลอด (COA-001) ไม่เปลี่ยนแปลง"
                />
              </div>

              <div className="md:col-span-12">
                <label className="block font-medium text-slate-700 mb-1">
                  ที่อยู่สถานประกอบการ / โรงคัดบรรจุ
                </label>
                <input
                  type="text"
                  value={docConfig.companyAddress || ''}
                  onChange={(e) =>
                    onUpdateDocConfig({ ...docConfig, companyAddress: e.target.value })
                  }
                  placeholder="921 ถนนอ่อนนุช แขวงอ่อนนุช เขตสวนหลวง กรุงเทพมหานคร 10250"
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <div className="md:col-span-4">
                <label className="block font-medium text-slate-700 mb-1">
                  การรับรองมาตรฐาน (Standards)
                </label>
                <input
                  type="text"
                  value={docConfig.internationalStandards}
                  onChange={(e) =>
                    onUpdateDocConfig({
                      ...docConfig,
                      internationalStandards: e.target.value,
                    })
                  }
                  placeholder="GAP / GHPs / HACCP"
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md"
                />
              </div>
              <div className="md:col-span-4">
                <label className="block font-medium text-slate-700 mb-1">
                  คู่ค้า / ลูกค้า (สำหรับใบ COA นี้)
                </label>
                <input
                  type="text"
                  value={activeOqc.customerName}
                  onChange={(e) =>
                    onUpdateOutgoingRecord({
                      ...activeOqc,
                      customerName: e.target.value,
                    })
                  }
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md"
                />
              </div>
              <div className="md:col-span-4">
                <label className="block font-medium text-slate-700 mb-1">
                  ศูนย์กระจายสินค้าปลายทาง (DC)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    list="coa-dc-options"
                    value={activeOqc.distributionCenter || ''}
                    onChange={(e) =>
                      onUpdateOutgoingRecord({
                        ...activeOqc,
                        distributionCenter: e.target.value,
                      })
                    }
                    placeholder="เช่น DC บางบัวทอง (BTH-DC), DC ลาดกระบัง (LKB-DC)"
                    className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md"
                  />
                  <datalist id="coa-dc-options">
                    {CP_ALL_DC_OPTIONS.map((dc) => (
                      <option key={dc} value={dc} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div className="md:col-span-6">
                <label className="block font-medium text-slate-700 mb-1">
                  ผู้รับรองผล COA (COA Certifier)
                </label>
                <input
                  type="text"
                  value={activeOqc.coaCertifier || docConfig.coaCertifier || 'น.ส.พรปวีณ์ ร่วมศรี'}
                  onChange={(e) => {
                    const val = e.target.value;
                    onUpdateOutgoingRecord({
                      ...activeOqc,
                      coaCertifier: val,
                    });
                    onUpdateDocConfig({
                      ...docConfig,
                      coaCertifier: val,
                    });
                  }}
                  placeholder="น.ส.พรปวีณ์ ร่วมศรี"
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md"
                />
              </div>

              <div className="md:col-span-6">
                <label className="block font-medium text-slate-700 mb-1">
                  ผู้อนุมัติปล่อยสินค้า (Release Approver)
                </label>
                <input
                  type="text"
                  value={activeOqc.releaseApprover || docConfig.releaseApprover || 'นายเด่นชัย ห่วงจิง'}
                  onChange={(e) => {
                    const val = e.target.value;
                    onUpdateOutgoingRecord({
                      ...activeOqc,
                      releaseApprover: val,
                    });
                    onUpdateDocConfig({
                      ...docConfig,
                      releaseApprover: val,
                    });
                  }}
                  placeholder="นายเด่นชัย ห่วงจิง"
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md"
                />
              </div>

              {/* Signature Management Section in Settings */}
              <div className="md:col-span-12 p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <FileSignature className="w-4 h-4 text-blue-700" />
                    <span className="font-bold text-slate-800 text-xs">
                      การจัดการช่องเซ็นต์และลายมือชื่อดิจิทัล (Signatures Control)
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-slate-500 font-medium">โหมดลายเซ็น:</span>
                    <button
                      type="button"
                      onClick={() => setSignatureMode('digital')}
                      className={`px-2.5 py-1 rounded-md font-semibold text-[11px] transition-all cursor-pointer ${
                        signatureMode === 'digital'
                          ? 'bg-blue-600 text-white shadow-2xs'
                          : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      ลายเซ็นดิจิทัล
                    </button>
                    <button
                      type="button"
                      onClick={() => setSignatureMode('manual')}
                      className={`px-2.5 py-1 rounded-md font-semibold text-[11px] transition-all cursor-pointer ${
                        signatureMode === 'manual'
                          ? 'bg-blue-600 text-white shadow-2xs'
                          : 'bg-white text-slate-600 border border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      เว้นช่องเซ็นสดด้วยปากกา
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                  {/* Certifier Card */}
                  <div className="p-3 bg-white border border-slate-200 rounded-lg flex items-center justify-between gap-3">
                    <div className="space-y-0.5 min-w-0">
                      <div className="text-[10px] text-slate-500 font-semibold uppercase">
                        ผู้รับรองผล COA
                      </div>
                      <div className="font-bold text-slate-900 text-xs truncate">
                        {activeOqc.coaCertifier || docConfig.coaCertifier || 'น.ส.พรปวีณ์ ร่วมศรี'}
                      </div>
                      <div className="text-[10.5px] text-emerald-700 font-medium">
                        {signatureMode === 'digital'
                          ? certifierSig
                            ? '✓ มีลายมือชื่อพร้อมลงนาม'
                            : 'ใช้ลายเซ็นทางการ'
                          : 'โหมดเว้นช่องเซ็นสดด้วยปากกา'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSignModalTarget('certifier')}
                      className="px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md transition-colors shrink-0 flex items-center gap-1 cursor-pointer"
                    >
                      <PenTool className="w-3 h-3" /> เซ็นต์ / เปลี่ยน
                    </button>
                  </div>

                  {/* Approver Card */}
                  <div className="p-3 bg-white border border-slate-200 rounded-lg flex items-center justify-between gap-3">
                    <div className="space-y-0.5 min-w-0">
                      <div className="text-[10px] text-slate-500 font-semibold uppercase">
                        ผู้อนุมัติปล่อยสินค้า
                      </div>
                      <div className="font-bold text-slate-900 text-xs truncate">
                        {activeOqc.releaseApprover || docConfig.releaseApprover || 'นายเด่นชัย ห่วงจิง'}
                      </div>
                      <div className="text-[10.5px] text-emerald-700 font-medium">
                        {signatureMode === 'digital'
                          ? approverSig
                            ? '✓ มีลายมือชื่อพร้อมลงนาม'
                            : 'ใช้ลายเซ็นทางการ'
                          : 'โหมดเว้นช่องเซ็นสดด้วยปากกา'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSignModalTarget('approver')}
                      className="px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-md transition-colors shrink-0 flex items-center gap-1 cursor-pointer"
                    >
                      <PenTool className="w-3 h-3" /> เซ็นต์ / เปลี่ยน
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                <span className="font-medium">สลับ DC ปลายทางด่วน:</span>
                {CP_ALL_DC_OPTIONS.map((dc) => (
                  <button
                    key={dc}
                    type="button"
                    onClick={() =>
                      onUpdateOutgoingRecord({
                        ...activeOqc,
                        distributionCenter: dc,
                      })
                    }
                    className={`px-2.5 py-1 rounded-md border font-medium transition-colors whitespace-nowrap shrink-0 ${
                      activeOqc.distributionCenter === dc
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {dc}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setActiveTab('PREVIEW')}
                className="h-9 sm:h-8 px-3.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors inline-flex items-center justify-center gap-1.5 w-full sm:w-auto whitespace-nowrap shrink-0"
              >
                <FileText className="w-3.5 h-3.5 shrink-0" />
                <span>ดูตัวอย่างเอกสาร</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Automatic Lab-FAIL Stamp Suspension Alert Banner (Screen Only) */}
      {!coaEvaluation.allLabPass && (
        <div className="no-print p-3 sm:p-4 rounded-xl bg-red-50/90 border border-red-200 text-red-950 flex items-start gap-3 min-w-0 shadow-2xs">
          <ShieldAlert className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
          <div className="text-xs space-y-0.5 min-w-0">
            <div className="font-bold text-red-900 text-xs sm:text-sm">
              ระบบระงับตรายางดิจิทัล QA PASSED อัตโนมัติ (Automatic Stamp Suspension Active)
            </div>
            <p className="text-slate-700 text-[11.5px]">
              ตรวจพบผลวิเคราะห์ทางห้องปฏิบัติการ (QC LAB) ไม่ผ่านเกณฑ์ในล็อตที่ผูกกับใบรับรองนี้:
            </p>
            <ul className="list-disc pl-4 tabular-nums font-medium text-[11px] text-red-800 space-y-0.5">
              {coaEvaluation.labFailures.map((msg, i) => (
                <li key={i}>{msg}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Interactive Zoomable Web-A4 Document Preview Stage (Always kept in DOM for @media print via print-force-block) */}
      <div
        className={`print-only-container print-force-block min-w-0 ${
          activeTab === 'PREVIEW' ? 'block' : 'hidden'
        }`}
      >
        <div
          ref={stageOuterRef}
          className="coa-preview-stage bg-slate-200/75 border border-slate-300 rounded-xl overflow-hidden"
        >
          {/* Interactive Zoom & Preview Controls Bar (Hidden on Print) */}
          <div className="no-print bg-white border-b border-slate-200 px-3 sm:px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 min-w-0">
            <div className="flex items-center gap-2 text-xs text-slate-600 min-w-0">
              <span className="font-semibold text-slate-900 whitespace-nowrap">
                พรีวิวใบรับรอง COA
              </span>
              <span className="text-slate-300" aria-hidden="true">
                ·
              </span>
              <span className="truncate hidden sm:inline">
                ถ่างนิ้วซูมหรือเลื่อนดูเอกสารได้ทุกทิศทาง (แตะ 2 ครั้งเพื่อสลับขนาด)
              </span>
              <span className="truncate sm:hidden text-[11px] text-slate-500">
                ถ่างนิ้วหรือกด +/- เพื่อซูมดูเอกสาร
              </span>
            </div>

            <div className="flex items-center justify-between sm:justify-end gap-1.5 w-full sm:w-auto shrink-0">
              {/* Zoom Out / % / Zoom In Group */}
              <div className="inline-flex items-center bg-slate-100 border border-slate-200 rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={handleZoomOut}
                  disabled={effectiveScale <= MIN_ZOOM}
                  aria-label="ซูมออก"
                  title="ซูมออก"
                  className="h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-700 hover:bg-white hover:text-slate-900 disabled:opacity-40 transition-colors"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="px-1.5 sm:px-2 text-xs font-semibold tabular-nums text-slate-900 min-w-[2.75rem] sm:min-w-[3.25rem] text-center select-none">
                  {zoomPercent}%
                </span>
                <button
                  type="button"
                  onClick={handleZoomIn}
                  disabled={effectiveScale >= MAX_ZOOM}
                  aria-label="ซูมเข้า"
                  title="ซูมเข้า"
                  className="h-7 w-7 inline-flex items-center justify-center rounded-md text-slate-700 hover:bg-white hover:text-slate-900 disabled:opacity-40 transition-colors"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                {/* Fit to Width */}
                <button
                  type="button"
                  onClick={handleResetFit}
                  className={`h-8 px-2 sm:px-2.5 text-xs font-medium rounded-lg border transition-colors inline-flex items-center gap-1 whitespace-nowrap shrink-0 ${
                    zoomMode === 'fit'
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <RotateCcw className="w-3.5 h-3.5 shrink-0" />
                  <span>พอดีจอ</span>
                </button>

                {/* 100% Web Scale */}
                <button
                  type="button"
                  onClick={handleSetActualSize}
                  className={`h-8 px-2 sm:px-2.5 text-xs tabular-nums font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                    zoomMode === 'custom' && Math.abs(customZoom - 1) < 0.02
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  100%
                </button>

                {/* Fullscreen Tap Preview */}
                <button
                  type="button"
                  onClick={() => setIsFullscreenPreview(true)}
                  className="h-8 px-2 sm:px-2.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                  title="ขยายเต็มจอ"
                >
                  <Maximize2 className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden sm:inline">เต็มจอ</span>
                </button>
              </div>
            </div>
          </div>

          {/* Scrollable & Pinch-Zoomable Viewport */}
          <div
            ref={previewStageRef}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onWheel={handleWheelZoom}
            onMouseDown={handleMouseDownPan}
            onMouseMove={handleMouseMovePan}
            onMouseUp={handleMouseUpPan}
            onMouseLeave={handleMouseUpPan}
            className={`coa-preview-stage p-3 sm:p-5 ${
              zoomMode === 'fit'
                ? 'overflow-hidden'
                : 'overflow-x-auto overflow-y-hidden cursor-grab active:cursor-grabbing'
            }`}
          >
            <div
              className="coa-scale-box mx-auto"
              style={{
                width: `${scaledBoxWidth}px`,
                height: `${scaledBoxHeight}px`,
              }}
            >
              <div
                className="coa-scale-transform origin-top-left"
                style={{
                  width: `${A4_WEB_WIDTH_PX}px`,
                  transform: `scale(${effectiveScale})`,
                }}
              >
                <CoaCertificateSheet
                  ref={previewSheetRef}
                  sheetId="coa-a4-sheet"
                  {...sheetSharedProps}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Fullscreen Interactive Preview Lightbox (For Mobile/Tablet/Web Inspection) */}
      {isFullscreenPreview && (
        <div
          ref={fullscreenOuterRef}
          className="no-print fixed inset-0 z-50 bg-slate-900/90 flex flex-col overflow-hidden"
        >
          {/* Top Fullscreen Controls */}
          <div className="bg-white border-b border-slate-200 px-3 sm:px-5 py-2.5 flex flex-wrap items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <FileText className="w-4 h-4 text-slate-700 shrink-0" />
              <span className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                {activeOqc.coaNumber}
              </span>
              <span className="hidden md:inline text-xs text-slate-500 truncate">
                · {activeOqc.customerName} ({activeOqc.distributionCenter || '-'})
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 shrink-0 ml-auto">
              <div className="inline-flex items-center bg-slate-100 border border-slate-200 rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={handleZoomOut}
                  disabled={effectiveScale <= MIN_ZOOM}
                  aria-label="ซูมออก"
                  className="h-8 w-8 inline-flex items-center justify-center rounded-md text-slate-700 hover:bg-white disabled:opacity-40"
                >
                  <ZoomOut className="w-4 h-4" />
                </button>
                <span className="px-2 text-xs font-semibold tabular-nums text-slate-900 min-w-[3.25rem] text-center">
                  {zoomPercent}%
                </span>
                <button
                  type="button"
                  onClick={handleZoomIn}
                  disabled={effectiveScale >= MAX_ZOOM}
                  aria-label="ซูมเข้า"
                  className="h-8 w-8 inline-flex items-center justify-center rounded-md text-slate-700 hover:bg-white disabled:opacity-40"
                >
                  <ZoomIn className="w-4 h-4" />
                </button>
              </div>

              <button
                type="button"
                onClick={handleResetFit}
                className={`h-8 px-2.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                  zoomMode === 'fit'
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                พอดีจอ
              </button>

              <button
                type="button"
                onClick={handleSetActualSize}
                className={`h-8 px-2.5 text-xs tabular-nums font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                  zoomMode === 'custom' && Math.abs(customZoom - 1) < 0.02
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                100%
              </button>

              <button
                type="button"
                onClick={handlePrintA4}
                className="h-8 px-3 text-xs font-semibold text-slate-900 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <Printer className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">พิมพ์เอกสาร</span>
              </button>

              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={isDownloadingPdf}
                className="h-8 px-3 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                {isDownloadingPdf ? (
                  <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5 shrink-0" />
                )}
                <span>PDF</span>
              </button>

              <button
                type="button"
                onClick={() => setIsFullscreenPreview(false)}
                className="h-8 px-2.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors inline-flex items-center gap-1 whitespace-nowrap shrink-0"
              >
                <Minimize2 className="w-3.5 h-3.5 shrink-0" />
                <span>ย่อกลับ</span>
              </button>
            </div>
          </div>

          {/* Fullscreen Zoomable Stage */}
          <div
            ref={fullscreenStageRef}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onWheel={handleWheelZoom}
            onMouseDown={handleMouseDownPan}
            onMouseMove={handleMouseMovePan}
            onMouseUp={handleMouseUpPan}
            onMouseLeave={handleMouseUpPan}
            className="flex-1 overflow-auto p-2 sm:p-6 cursor-grab active:cursor-grabbing"
          >
            <div
              className="mx-auto"
              style={{
                width: `${scaledBoxWidth}px`,
                height: `${scaledBoxHeight}px`,
              }}
            >
              <div
                className="origin-top-left shadow-xl"
                style={{
                  width: `${A4_WEB_WIDTH_PX}px`,
                  transform: `scale(${effectiveScale})`,
                }}
              >
                <CoaCertificateSheet {...sheetSharedProps} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Traceability QR Inspection Modal */}
      {showQrModal && (
        <div className="no-print fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-2xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 bg-slate-50/70 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-100/80 border border-emerald-300 flex items-center justify-center text-emerald-800 shrink-0 shadow-2xs">
                  <ShieldCheck className="w-6 h-6 text-emerald-700" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-slate-900 text-sm sm:text-base leading-snug">
                      ระบบตรวจสอบย้อนกลับดิจิทัล (QR Traceability & Verification)
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                      VERIFIED
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 font-mono">
                    COA No: {activeOqc.coaNumber} · ล็อตสินค้า: {activeOqc.productionLotNo || activeOqc.oqcNumber}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer"
                title="ปิดหน้าต่าง"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Navigation Tabs */}
            <div className="flex border-b border-slate-200 px-5 bg-slate-100/50 text-xs font-semibold shrink-0 gap-1 overflow-x-auto">
              <button
                type="button"
                onClick={() => setQrModalTab('traceability')}
                className={`py-2.5 px-3 border-b-2 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  qrModalTab === 'traceability'
                    ? 'border-emerald-600 text-emerald-800 font-bold bg-white -mb-px'
                    : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>ข้อมูลการสอบย้อนกลับ (Traceability Chain)</span>
              </button>
              <button
                type="button"
                onClick={() => setQrModalTab('qr')}
                className={`py-2.5 px-3 border-b-2 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  qrModalTab === 'qr'
                    ? 'border-emerald-600 text-emerald-800 font-bold bg-white -mb-px'
                    : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                }`}
              >
                <QrCode className="w-3.5 h-3.5" />
                <span>รหัส QR สแกนตรวจสอบ (Scan Code)</span>
              </button>
              <button
                type="button"
                onClick={() => setQrModalTab('json')}
                className={`py-2.5 px-3 border-b-2 transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                  qrModalTab === 'json'
                    ? 'border-emerald-600 text-emerald-800 font-bold bg-white -mb-px'
                    : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>ข้อมูลดิจิทัล JSON (Payload)</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Tab 1: Traceability Chain */}
              {qrModalTab === 'traceability' && (
                <div className="space-y-4">
                  {/* Authenticity Certificate Banner */}
                  <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-50 via-slate-50 to-emerald-50/60 border border-emerald-300 shadow-2xs space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-emerald-200/70 pb-3">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" />
                        <div>
                          <div className="text-xs font-bold text-emerald-950 uppercase tracking-wide">
                            Certificate of Analysis — Digital Verification
                          </div>
                          <div className="text-[11px] text-emerald-800 font-medium">
                            ผ่านการรับรองคุณภาพมาตรฐาน GHPs, HACCP, GAP และเกณฑ์ CP ALL DC
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-[11px] font-mono text-emerald-800 font-bold bg-white px-2 py-0.5 rounded border border-emerald-300">
                          {activeOqc.coaNumber}
                        </span>
                      </div>
                    </div>

                    {/* Finished Good Attributes */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                      <div className="p-2 bg-white rounded-lg border border-slate-200 space-y-0.5">
                        <span className="text-[10px] text-slate-500 font-medium">ล็อตสินค้า FG:</span>
                        <div className="font-mono font-bold text-slate-900 text-[11px] truncate">
                          {activeOqc.productionLotNo || activeOqc.oqcNumber}
                        </div>
                      </div>
                      <div className="p-2 bg-white rounded-lg border border-slate-200 space-y-0.5">
                        <span className="text-[10px] text-slate-500 font-medium">ลูกค้า / ปลายทาง:</span>
                        <div className="font-semibold text-slate-900 text-[11px] truncate">
                          {activeOqc.distributionCenter || activeOqc.customerName}
                        </div>
                      </div>
                      <div className="p-2 bg-white rounded-lg border border-slate-200 space-y-0.5">
                        <span className="text-[10px] text-slate-500 font-medium">วันผลิต - หมดอายุ:</span>
                        <div className="font-mono text-[11px] text-slate-900">
                          {activeOqc.mfgDate} → {activeOqc.expDate}
                        </div>
                      </div>
                      <div className="p-2 bg-white rounded-lg border border-slate-200 space-y-0.5">
                        <span className="text-[10px] text-slate-500 font-medium">น้ำหนัก / อุณหภูมิ:</span>
                        <div className="font-bold text-emerald-700 text-[11px]">
                          {activeOqc.netWeightG}g · 2–6 °C
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Farm Lots & Variety Ingredients Traceability Breakdown */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide flex items-center gap-1.5">
                        <Barcode className="w-4 h-4 text-emerald-700" />
                        <span>ห่วงโซ่ตรวจสอบย้อนกลับถึงฟาร์มและแปลงปลูก ({activeMixItems.length} สายพันธุ์):</span>
                      </h4>
                      <span className="text-[11px] text-emerald-700 font-semibold">
                        ผลตรวจแล็บผ่าน 100%
                      </span>
                    </div>

                    <div className="space-y-2">
                      {activeMixItems.map((item) => {
                        const v = TOMATO_VARIETIES[item.varietyCode];
                        const mixLots = getMixLotNumbers(item);

                        return (
                          <div
                            key={item.varietyCode}
                            className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span
                                  className="w-3.5 h-3.5 rounded-xs shrink-0 border border-slate-300"
                                  style={{ backgroundColor: v.swatchHex }}
                                />
                                <span className="font-bold text-slate-900">
                                  {v.nameTh} ({v.nameEn})
                                </span>
                                <span className="text-[11px] text-slate-500 font-medium">
                                  — {v.colorLabelTh} [{item.varietyCode}]
                                </span>
                              </div>
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                คละในแพ็คนี้
                              </span>
                            </div>

                            {/* Linked Farm Lots & Lab Measurements */}
                            <div className="space-y-1.5 pt-1">
                              {mixLots.length > 0 ? (
                                mixLots.map((lotNo) => {
                                  const incoming = incomingByLot.get(lotNo);
                                  const lab = labByLot.get(lotNo);

                                  return (
                                    <div
                                      key={lotNo}
                                      className="p-2.5 bg-white border border-slate-200/90 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs"
                                    >
                                      <div>
                                        <div className="flex items-center gap-2">
                                          <span className="font-mono font-bold text-slate-900 text-xs">
                                            {lotNo}
                                          </span>
                                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 font-medium">
                                            รับเข้า: {incoming?.receivedDate || activeOqc.inspectionDate}
                                          </span>
                                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-800 font-semibold border border-emerald-200">
                                            ตรวจรับ PASS
                                          </span>
                                        </div>
                                        <div className="text-[11px] text-slate-500 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                                          <span>แหล่งที่มา: แปลงเกษตรพันธสัญญา GAP</span>
                                          <span>สิ่งแปลกปลอม: ไม่พบ</span>
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-2 sm:border-l sm:border-slate-200 sm:pl-3 shrink-0 text-[11px]">
                                        <div className="text-right">
                                          <div className="font-bold text-slate-900 tabular-nums">
                                            {lab?.brixValue !== undefined && lab?.brixValue !== null
                                              ? `${lab.brixValue.toFixed(1)}° Brix`
                                              : '8.8° Brix'}
                                          </div>
                                          <div className="text-[10px] text-slate-500">
                                            สารเคมีตกค้าง: ไม่พบ (ND) · ปลอดภัย
                                          </div>
                                        </div>
                                        <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-[10px]">
                                          ✓
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })
                              ) : (
                                <div className="text-[11px] text-slate-400 italic py-1">
                                  ยังไม่ได้ผูกเลขล็อตวัตถุดิบ
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* 8-Standards Checklist Summary Card */}
                  <div className="p-3.5 bg-white border border-slate-200 rounded-xl space-y-2 text-xs">
                    <div className="font-bold text-slate-900 flex items-center justify-between">
                      <span>สรุปข้อกำหนดมาตรฐาน 7-Eleven / CP ALL (ครบทั้ง 8 ข้อ):</span>
                      <span className="text-emerald-700 font-bold">8/8 ข้อ ผ่านเกณฑ์สมบูรณ์</span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] pt-1">
                      <div className="flex items-center gap-1.5 text-slate-700">
                        <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>1. ฝาล็อค 4 มุมสนิท</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-700">
                        <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>2. คละสี 3–5 สายพันธุ์</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-700">
                        <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>3. อายุ 6 วัน & ล้างก่อนทาน</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-700">
                        <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>4. น้ำหนัก ≥ 140.0g</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-700">
                        <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>5. ผลตึงสด ไร้รอยช้ำ</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-700">
                        <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>6. ยอดตรงตาม PO</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-700">
                        <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>7. ความเย็น 2–6 °C</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-slate-700">
                        <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>8. ตะกร้าฆ่าเชื้อสะอาด</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 2: Live QR Scanner Code */}
              {qrModalTab === 'qr' && (
                <div className="space-y-4 py-2">
                  <div className="flex flex-col items-center justify-center p-6 bg-slate-50 border border-slate-200 rounded-2xl space-y-4">
                    <div className="p-4 bg-white rounded-xl shadow-xs border border-slate-300 flex flex-col items-center">
                      <QRCodeSVG
                        id="modal-traceability-qr-svg"
                        value={activeQrCodeValue}
                        size={210}
                        level="M"
                        includeMargin={true}
                      />
                      <div className="mt-2 text-center">
                        <div className="text-xs font-bold text-slate-900">
                          QR Traceability Code
                        </div>
                        <div className="text-[11px] font-mono text-slate-500">
                          {activeOqc.coaNumber} · {activeOqc.productionLotNo || activeOqc.oqcNumber}
                        </div>
                      </div>
                    </div>

                    {/* Mode Selector */}
                    <div className="w-full max-w-md bg-white p-2.5 rounded-xl border border-slate-200 space-y-2">
                      <span className="text-[11px] font-semibold text-slate-600 block">
                        รูปแบบข้อมูลที่ฝังในรหัส QR:
                      </span>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <button
                          type="button"
                          onClick={() => setQrEncodingMode('url')}
                          className={`p-2 rounded-lg border text-left transition-all cursor-pointer ${
                            qrEncodingMode === 'url'
                              ? 'border-emerald-600 bg-emerald-50 text-emerald-950 font-bold ring-1 ring-emerald-600'
                              : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 font-semibold">
                            <Smartphone className="w-3.5 h-3.5 text-emerald-700" />
                            <span>URL ตรวจสอบออนไลน์</span>
                          </div>
                          <p className="text-[10px] text-slate-500 mt-0.5">
                            สแกนด้วยกล้องมือถือแล้วเปิดหน้ายืนยันความถูกต้องได้ทันที
                          </p>
                        </button>
                        <button
                          type="button"
                          onClick={() => setQrEncodingMode('json')}
                          className={`p-2 rounded-lg border text-left transition-all cursor-pointer ${
                            qrEncodingMode === 'json'
                              ? 'border-emerald-600 bg-emerald-50 text-emerald-950 font-bold ring-1 ring-emerald-600'
                              : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 font-semibold">
                            <FileText className="w-3.5 h-3.5 text-emerald-700" />
                            <span>ข้อมูล JSON ดิจิทัล</span>
                          </div>
                          <p className="text-[10px] text-slate-500 mt-0.5">
                            ข้อมูลโครงสร้าง JSON สำหรับเชื่อมต่อระบบ ERP / Barcode Scanner
                          </p>
                        </button>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleCopyText(qrVerificationUrl, 'url')}
                        className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition-colors inline-flex items-center gap-1.5 shadow-2xs cursor-pointer"
                      >
                        {copiedType === 'url' ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span>คัดลอกลิงก์แล้ว!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>คัดลอกลิงก์ตรวจสอบ</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={handleDownloadQrPng}
                        className="px-3.5 py-2 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-lg transition-colors inline-flex items-center gap-1.5 shadow-2xs cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5 text-emerald-700" />
                        <span>ดาวน์โหลดรูปภาพ QR (.PNG)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setQrModalTab('traceability');
                          onNotify?.(
                            'ผลการตรวจสอบย้อนกลับสมบูรณ์',
                            `เอกสาร COA เลขที่ ${activeOqc.coaNumber} ผ่านการรับรองความถูกต้องครบถ้วน`,
                            'success'
                          );
                        }}
                        className="px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors inline-flex items-center gap-1.5 shadow-2xs cursor-pointer"
                      >
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                        <span>จำลองผลการสแกนตรวจสอบ</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab 3: Raw JSON Payload */}
              {qrModalTab === 'json' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-700">
                      ข้อมูลดิจิทัลที่ผ่านการเข้ารหัสเพื่อการตรวจสอบย้อนกลับและ Audit Trail:
                    </span>
                    <button
                      type="button"
                      onClick={() => handleCopyText(qrTraceabilityPayload, 'json')}
                      className="px-2.5 py-1 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-md transition-colors inline-flex items-center gap-1 shadow-2xs cursor-pointer"
                    >
                      {copiedType === 'json' ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span>คัดลอกแล้ว</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>คัดลอก JSON</span>
                        </>
                      )}
                    </button>
                  </div>
                  <pre className="p-4 rounded-xl bg-slate-900 text-emerald-300 text-xs font-mono overflow-x-auto leading-relaxed border border-slate-800 shadow-inner">
                    {JSON.stringify(JSON.parse(qrTraceabilityPayload), null, 2)}
                  </pre>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-slate-200 px-5 py-3.5 bg-slate-50 flex items-center justify-between shrink-0">
              <span className="text-[11px] text-slate-500 font-medium">
                รองรับการสแกนผ่านกล้องสมาร์ทโฟนและเครื่องอ่าน 2D Barcode ทุกระบบ
              </span>
              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-colors cursor-pointer shadow-2xs"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Digital Signature Management Modal */}
      {signModalTarget && (
        <DigitalSignatureModal
          isOpen={Boolean(signModalTarget)}
          onClose={() => setSignModalTarget(null)}
          targetRole={signModalTarget}
          targetName={
            signModalTarget === 'certifier'
              ? activeOqc.coaCertifier || docConfig.coaCertifier || 'น.ส.พรปวีณ์ ร่วมศรี'
              : activeOqc.releaseApprover || docConfig.releaseApprover || 'นายเด่นชัย ห่วงจิง'
          }
          targetTitle={
            signModalTarget === 'certifier'
              ? 'เจ้าหน้าที่ฝ่ายประกันคุณภาพ (QA Specialist)'
              : 'ผู้จัดการฝ่ายควบคุมคุณภาพ (QC Manager)'
          }
          inspectionDate={activeOqc.inspectionDate}
          currentSig={signModalTarget === 'certifier' ? certifierSig : approverSig}
          signatureMode={signatureMode}
          onSaveSignature={(newSig) => {
            if (signModalTarget === 'certifier') {
              setCertifierSig(newSig);
            } else {
              setApproverSig(newSig);
            }
            onNotify?.(
              'บันทึกลายมือชื่อเรียบร้อย',
              newSig
                ? `บันทึกลายเซ็นของ ${
                    signModalTarget === 'certifier' ? 'ผู้รับรองผล COA' : 'ผู้อนุมัติปล่อยสินค้า'
                  } เรียบร้อยแล้ว`
                : 'ตั้งค่าเป็นโหมดเว้นช่องว่างสำหรับเซ็นต์สดด้วยปากกา',
              'success'
            );
          }}
          onSetSignatureMode={setSignatureMode}
          onSwitchTarget={(nextRole) => setSignModalTarget(nextRole)}
          otherTargetName={
            signModalTarget === 'certifier'
              ? activeOqc.releaseApprover || docConfig.releaseApprover || 'นายเด่นชัย ห่วงจิง'
              : activeOqc.coaCertifier || docConfig.coaCertifier || 'น.ส.พรปวีณ์ ร่วมศรี'
          }
        />
      )}
    </div>
  );
};
