import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { domToCanvas } from 'modern-screenshot';
import { jsPDF } from 'jspdf';
import {
  Building2,
  Download,
  FileText,
  Loader2,
  Maximize2,
  Minimize2,
  Printer,
  QrCode,
  RotateCcw,
  Settings2,
  ShieldAlert,
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
} from '../types/qc';
import { CP_ALL_DC_OPTIONS } from '../data/initialData';
import {
  daysBetweenIsoDates,
  evaluateColorMixRules,
  formatThaiDate,
} from '../utils/lotHelpers';
import { NotificationVariant } from './PopupNotification';

type ColorMixEntry = OutgoingRecord['colorMix'][number];

const A4_WEB_WIDTH_PX = 794; // Exact 210mm A4 width at 96 DPI (matches Web desktop layout 1:1)
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
    },
    ref
  ) => {
    const isMixValid =
      activeOqc.check2MixValid && evaluateColorMixRules(activeOqc.colorMix).isValid;

    return (
      <article
        ref={ref}
        id={sheetId}
        className="coa-document-typography w-[794px] min-w-[794px] max-w-[794px] bg-white border border-slate-300 shadow-xs p-7 text-slate-900 space-y-4 select-text"
      >
        {/* OFFICIAL DOCUMENT HEADER & DOCUMENT CONTROL / LICENSING */}
        <header className="border-2 border-slate-900 rounded-md overflow-hidden">
          {/* Top Banner Title */}
          <div className="bg-slate-900 text-white px-4 py-3 flex flex-row items-center justify-between gap-4">
            <div>
              <h1 className="text-[17px] font-bold tracking-[-0.01em] leading-snug">
                ใบรับรองผลการตรวจวิเคราะห์คุณภาพ (Certificate of Analysis — COA)
              </h1>
            </div>
            <div className="text-[10px] font-semibold tracking-wider text-slate-300 text-right leading-snug shrink-0 max-w-[220px]">
              DOCUMENT CONTROL &amp; PACKING HOUSE LICENSING
            </div>
          </div>

          {/* Manufacturer Licensing (Left 7 cols) + Document Control Metadata (Right 5 cols) */}
          <div className="grid grid-cols-12 divide-x divide-slate-300 text-[11.5px]">
            {/* ข้อมูลผู้ผลิตและโรงคัดบรรจุ */}
            <div className="col-span-7 p-3.5 space-y-1.5 bg-white">
              <div className="text-[10.5px] font-semibold tracking-wide text-slate-500">
                ข้อมูลผู้ผลิตและโรงคัดบรรจุ (Manufacturer &amp; Licensing)
              </div>
              <div className="font-bold text-[13px] text-slate-900 leading-snug">
                {docConfig.companyName}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-0.5 text-[11px]">
                <div className="whitespace-nowrap">
                  <span className="text-slate-500">รหัสโรงคัดบรรจุ มกอช.: </span>
                  <span className="tabular-nums font-semibold text-slate-900">
                    {docConfig.packingHouseCode}
                  </span>
                </div>
                <div className="whitespace-nowrap">
                  <span className="text-slate-500">เลขสารบบอาหาร (อย.): </span>
                  <span className="tabular-nums font-semibold text-slate-900">
                    {docConfig.fdaNumber}
                  </span>
                </div>
                <div className="w-full">
                  <span className="text-slate-500">การรับรองมาตรฐานสากล: </span>
                  <span className="font-semibold text-slate-900">
                    {docConfig.internationalStandards}
                  </span>
                </div>
              </div>
            </div>

            {/* ข้อมูลควบคุมเอกสาร */}
            <div className="col-span-5 p-3.5 space-y-1.5 bg-slate-50/80 text-[11px]">
              <div className="text-[10.5px] font-semibold tracking-wide text-slate-500">
                ข้อมูลควบคุมเอกสาร (Document Control)
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-600 shrink-0">เลขที่เอกสาร (COA No.):</span>
                <span className="tabular-nums font-bold text-slate-900 text-right whitespace-nowrap">
                  {activeOqc.coaNumber}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-600 shrink-0">ฉบับปรับปรุง (Revision):</span>
                <span className="tabular-nums font-semibold text-slate-900 text-right">
                  {docConfig.revision} (อ้างอิง {activeOqc.oqcNumber})
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-600 shrink-0">วันที่ออกเอกสาร:</span>
                <span className="tabular-nums font-semibold text-slate-900 text-right whitespace-nowrap">
                  {formatThaiDate(activeOqc.inspectionDate)}
                </span>
              </div>
              <div className="flex justify-between gap-2 pt-1 border-t border-slate-200">
                <span className="text-slate-600 shrink-0">สถานะการปล่อยล็อต:</span>
                <span
                  className={`font-bold text-right ${
                    canStampPass ? 'text-emerald-700' : 'text-red-700'
                  }`}
                >
                  {releaseStatusText}
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* PARTNER / CUSTOMER & SHIPMENT SPECIFICATION BLOCK */}
        <section className="border border-slate-300 rounded-md overflow-hidden text-[11.5px]">
          <div className="bg-slate-100 border-b border-slate-300 px-3.5 py-2 font-bold text-slate-900 flex items-center justify-between gap-4">
            <span>
              ข้อมูลคู่ค้า / ลูกค้า และรายละเอียดสินค้าจัดส่ง (Partner &amp; Shipment Specification)
            </span>
            <span className="tabular-nums font-semibold text-slate-600 shrink-0 text-[11px]">
              PO No.: {activeOqc.poNumber}
            </span>
          </div>
          <div className="grid grid-cols-12 divide-x divide-slate-200 p-3 text-[11px]">
            <div className="col-span-5 pr-3 space-y-1.5">
              <div className="flex justify-between gap-2">
                <span className="text-slate-500 shrink-0">คู่ค้า / ลูกค้า:</span>
                <span className="font-semibold text-slate-900 text-right">
                  {activeOqc.customerName}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500 shrink-0">ศูนย์กระจายสินค้าปลายทาง:</span>
                <span className="font-semibold text-slate-900 text-right">
                  {activeOqc.distributionCenter || '-'}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500 shrink-0">เลขที่ใบสั่งซื้อ (PO No.):</span>
                <span className="tabular-nums font-semibold text-slate-900 text-right whitespace-nowrap">
                  {activeOqc.poNumber}
                </span>
              </div>
            </div>

            <div className="col-span-7 pl-3.5 space-y-1.5">
              <div className="flex justify-between gap-2">
                <span className="text-slate-500 shrink-0">ชื่อผลิตภัณฑ์:</span>
                <span className="font-semibold text-slate-900 text-right truncate">
                  {activeOqc.productName}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500 shrink-0">วันผลิต (MFG) / หมดอายุ (EXP):</span>
                <span className="tabular-nums font-semibold text-slate-900 text-right whitespace-nowrap">
                  {formatThaiDate(activeOqc.mfgDate)} / {formatThaiDate(activeOqc.expDate)}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-slate-500 shrink-0">ปริมาณส่ง / น้ำหนักสุทธิ / อุณหภูมิ:</span>
                <span className="tabular-nums font-semibold text-slate-900 text-right whitespace-nowrap">
                  {activeOqc.actualPacks.toLocaleString()} แพ็ค ({activeOqc.crateQty} ตะกร้า) ·{' '}
                  {activeOqc.netWeightG} ก. · {activeOqc.roomTempC.toFixed(1)} °C
                </span>
              </div>
              <div className="flex justify-between gap-2 pt-1 border-t border-slate-100">
                <span className="text-slate-500 shrink-0">ข้อความบังคับบนฉลาก:</span>
                <span
                  className={`font-semibold text-right ${
                    activeOqc.check3WashLabel !== false
                      ? 'text-emerald-800'
                      : 'text-red-700 font-bold'
                  }`}
                >
                  {activeOqc.check3WashLabel !== false
                    ? 'ระบุ "ล้างก่อนรับประทาน" (Wash before consumption) ชัดเจน'
                    : 'ไม่พบข้อความบังคับ (FAIL)'}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* QC LABORATORY ANALYSIS */}
        <section className="space-y-1.5">
          <div className="flex items-center justify-between border-b border-slate-300 pb-1.5 gap-4">
            <h2 className="text-[12.5px] font-bold text-slate-900">
              ผลการวิเคราะห์ทางห้องปฏิบัติการ — สารเคมีตกค้าง 2 หมวดหลัก และความหวาน (QC LAB)
            </h2>
            <span className="text-[11px] tabular-nums font-medium text-slate-500 text-right shrink-0">
              เกณฑ์ 7-Eleven: ความหวาน &gt; 6.0 %Brix · สารตกค้างผ่านทั้ง 2 หมวด
            </span>
          </div>

          <div className="overflow-hidden border border-slate-200 rounded-md">
            <table className="w-full text-left border-collapse text-[11px]">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200 font-semibold text-slate-700">
                  <th className="py-2 px-2.5">หมายเลขล็อต</th>
                  <th className="py-2 px-2">วันที่รับเข้า</th>
                  <th className="py-2 px-2">Organophosphate &amp; Carbamate</th>
                  <th className="py-2 px-2">Organochlorine &amp; Pyrethroid</th>
                  <th className="py-2 px-2">สถานะสารตกค้างรวม</th>
                  <th className="py-2 px-2 text-right">ความหวาน (%Brix)</th>
                  <th className="py-2 px-2.5">สรุปผลแล็บ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {activeMixItems.map((mix) => {
                  const lab = labByLot.get(mix.lotNumber);
                  const inc = incomingByLot.get(mix.lotNumber);
                  return (
                    <tr key={mix.varietyCode}>
                      <td className="py-2 px-2.5 tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                        {mix.lotNumber}
                      </td>
                      <td className="py-2 px-2 tabular-nums text-slate-700 whitespace-nowrap">
                        {lab
                          ? formatThaiDate(lab.receivedDate)
                          : inc
                          ? formatThaiDate(inc.receivedDate)
                          : '-'}
                      </td>
                      <td className="py-2 px-2 font-semibold whitespace-nowrap">
                        {!lab || lab.organophosphateCarbamate === 'PENDING' ? (
                          <span className="text-amber-700">รอผลการตรวจสอบ</span>
                        ) : lab.organophosphateCarbamate === 'PASS' ? (
                          <span className="text-emerald-700">ผ่าน (PASS)</span>
                        ) : (
                          <span className="text-red-700">ไม่ผ่าน (FAIL)</span>
                        )}
                      </td>
                      <td className="py-2 px-2 font-semibold whitespace-nowrap">
                        {!lab || lab.organochlorinePyrethroid === 'PENDING' ? (
                          <span className="text-amber-700">รอผลการตรวจสอบ</span>
                        ) : lab.organochlorinePyrethroid === 'PASS' ? (
                          <span className="text-emerald-700">ผ่าน (PASS)</span>
                        ) : (
                          <span className="text-red-700">ไม่ผ่าน (FAIL)</span>
                        )}
                      </td>
                      <td className="py-2 px-2 font-bold whitespace-nowrap">
                        {!lab || lab.pesticideStatus === 'PENDING' ? (
                          <span className="text-amber-700 font-semibold">รอผลตรวจ</span>
                        ) : lab.pesticideStatus === 'PASS' ? (
                          <span className="text-emerald-700">PASS</span>
                        ) : (
                          <span className="text-red-700">FAIL</span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-right tabular-nums whitespace-nowrap">
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
                          <span className="text-amber-700 font-semibold">รอผลตรวจ</span>
                        )}
                      </td>
                      <td className="py-2 px-2.5 font-bold whitespace-nowrap">
                        {!lab || lab.overallLabStatus === 'PENDING' ? (
                          <span className="text-amber-700 font-semibold">รอผลตรวจ</span>
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
        <section className="space-y-1.5">
          <div className="flex items-center justify-between border-b border-slate-300 pb-1.5 gap-4">
            <h2 className="text-[12.5px] font-bold text-slate-900">
              ผลการตรวจควบคุมคุณภาพก่อนจัดส่ง 8 เช็คลิสต์สำคัญ (OQC Verification)
            </h2>
            <span className="text-[11px] tabular-nums font-medium text-slate-500 shrink-0">
              เวลาตรวจ: {activeOqc.inspectionTime} น.
            </span>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-[11px] border border-slate-200 rounded-md px-3.5 py-2">
            <div className="flex items-center justify-between py-1.5 border-b border-slate-100 gap-2">
              <span className="tabular-nums">1. การปิดผนึกฝากล่อง</span>
              <span
                className={`tabular-nums font-bold shrink-0 ${
                  activeOqc.check1LidSealing ? 'text-emerald-700' : 'text-red-700'
                }`}
              >
                {activeOqc.check1LidSealing ? 'PASS' : 'FAIL'}
              </span>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-slate-100 gap-2">
              <span className="tabular-nums">2. การผสมสีครบ 3–5 สายพันธุ์ (บังคับมีสีเขียวคู่กับสีแดง/ชมพู)</span>
              <span
                className={`tabular-nums font-bold shrink-0 ${
                  isMixValid ? 'text-emerald-700' : 'text-red-700'
                }`}
              >
                {isMixValid ? `PASS (${activeMixItems.length} สี)` : 'FAIL'}
              </span>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-slate-100 gap-2">
              <span className="tabular-nums">
                3. ฉลาก MFG/EXP (+6 วัน) &amp; ระบุ &ldquo;ล้างก่อนรับประทาน&rdquo; (Wash before consumption)
              </span>
              <span
                className={`tabular-nums font-bold shrink-0 ${
                  activeOqc.check3ExpiryLabel && activeOqc.check3WashLabel !== false
                    ? 'text-emerald-700'
                    : 'text-red-700'
                }`}
              >
                {activeOqc.check3ExpiryLabel && activeOqc.check3WashLabel !== false
                  ? `PASS (${shelfDays ?? 6} วัน)`
                  : 'FAIL'}
              </span>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-slate-100 gap-2">
              <span className="tabular-nums">4. น้ำหนักสุทธิ (มาตรฐาน 140 กรัม)</span>
              <span
                className={`tabular-nums font-bold shrink-0 ${
                  activeOqc.check4NetWeightPass ? 'text-emerald-700' : 'text-red-700'
                }`}
              >
                {activeOqc.netWeightG} กรัม ({activeOqc.check4NetWeightPass ? 'PASS' : 'FAIL'})
              </span>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-slate-100 gap-2">
              <span className="tabular-nums">5. ลักษณะทางกายภาพของสินค้า</span>
              <span
                className={`tabular-nums font-bold shrink-0 ${
                  activeOqc.check5Physical ? 'text-emerald-700' : 'text-red-700'
                }`}
              >
                {activeOqc.check5Physical ? 'PASS' : 'FAIL'}
              </span>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-slate-100 gap-2">
              <span className="tabular-nums">6. จำนวนสินค้าตรงตามใบสั่งซื้อ</span>
              <span
                className={`tabular-nums font-bold shrink-0 ${
                  activeOqc.check6QtyMatch ? 'text-emerald-700' : 'text-red-700'
                }`}
              >
                {activeOqc.check6QtyMatch
                  ? `PASS (${activeOqc.actualPacks.toLocaleString()} แพ็ค)`
                  : 'FAIL'}
              </span>
            </div>
            <div className="flex items-center justify-between py-1.5 gap-2">
              <span className="tabular-nums">7. อุณหภูมิห้องขณะตรวจตามเกณฑ์ 2–6 °C</span>
              <span
                className={`tabular-nums font-bold shrink-0 ${
                  activeOqc.check7RoomTempPass ? 'text-emerald-700' : 'text-red-700'
                }`}
              >
                {activeOqc.roomTempC.toFixed(1)} °C ({activeOqc.check7RoomTempPass ? 'PASS' : 'FAIL'})
              </span>
            </div>
            <div className="flex items-center justify-between py-1.5 gap-2">
              <span className="tabular-nums">8. ความสะอาดและความเรียบร้อยของตะกร้าขนส่ง</span>
              <span
                className={`tabular-nums font-bold shrink-0 ${
                  activeOqc.check8CrateClean ? 'text-emerald-700' : 'text-red-700'
                }`}
              >
                {activeOqc.check8CrateClean ? 'PASS' : 'FAIL'}
              </span>
            </div>
          </div>
        </section>

        {/* CERTIFICATION, SIGNATURES, RED QA STAMP & QR CODE */}
        <section className="space-y-2.5 pt-0.5">
          <div className="border-b border-slate-300 pb-1.5">
            <h2 className="text-[12.5px] font-bold text-slate-900">
              คำรับรองคุณภาพ ลายมือชื่อผู้รับผิดชอบ ตรารับรองดิจิทัล และ QR Code สอบย้อนกลับ (QA Certification)
            </h2>
          </div>

          <div className="grid grid-cols-12 gap-4 items-center pt-0.5">
            {/* Sign-off Blocks */}
            <div className="col-span-5 grid grid-cols-2 gap-3 text-center text-[11px]">
              <div className="border border-slate-200 rounded-md p-2.5 space-y-3.5">
                <div className="text-slate-500 font-medium">ผู้ตรวจสอบคุณภาพ (OQC)</div>
                <div className="pt-2 border-b border-dashed border-slate-300 font-semibold text-slate-900">
                  {activeOqc.oqcInspector.split('(')[0].trim()}
                </div>
                <div className="text-[10.5px] text-slate-500 tabular-nums">
                  วันที่ {formatThaiDate(activeOqc.inspectionDate)}
                </div>
              </div>

              <div className="border border-slate-200 rounded-md p-2.5 space-y-3.5">
                <div className="text-slate-500 font-medium">ผู้รับรองผลประกันคุณภาพ (QA)</div>
                <div className="pt-2 border-b border-dashed border-slate-300 font-semibold text-slate-900">
                  ฝ่ายประกันคุณภาพ (QA)
                </div>
                <div className="text-[10.5px] text-slate-500 tabular-nums">
                  {docConfig.packingHouseCode}
                </div>
              </div>
            </div>

            {/* Official Red Digital Rubber Stamp (Suspended automatically if Lab = FAIL) */}
            <div className="col-span-4 flex flex-col items-center justify-center py-1">
              {canStampPass ? (
                <div
                  className="select-none transform -rotate-6 border-[3px] border-red-600 rounded-lg px-4 py-1.5 text-center text-red-600 bg-red-50/20"
                  aria-label="ตรายางดิจิทัลรับรองคุณภาพ QA PASSED"
                >
                  <div className="border border-red-600 rounded-xs px-3 py-1 space-y-0.5">
                    <div className="text-[9px] font-bold tracking-widest">
                      GHPs CODEX REV.5 / HACCP
                    </div>
                    <div className="text-xl font-extrabold tracking-wider leading-none py-0.5">
                      QA PASSED
                    </div>
                    <div className="text-[9px] tabular-nums font-semibold">
                      RELEASED · {activeOqc.inspectionDate}
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  className="w-full border-2 border-dashed border-slate-400 bg-slate-50 rounded-lg p-2.5 text-center space-y-1"
                  aria-label="ระงับตรายางรับรองอัตโนมัติ"
                >
                  <div className="inline-flex items-center gap-1 text-xs font-bold tracking-wide text-red-700">
                    <XCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>QA STAMP SUSPENDED</span>
                  </div>
                  <div className="text-[10.5px] text-slate-600 leading-snug">
                    ระงับตรารับรอง QA PASSED อัตโนมัติ เนื่องจากผลวิเคราะห์ห้องปฏิบัติการหรือเกณฑ์ OQC ไม่ผ่านมาตรฐาน
                  </div>
                </div>
              )}
            </div>

            {/* Traceability QR Code */}
            <div className="col-span-3 flex flex-col items-center justify-center border border-slate-200 rounded-md p-2 bg-white">
              <QRCodeSVG
                value={qrTraceabilityPayload}
                size={78}
                level="M"
                includeMargin={false}
              />
              <div className="mt-1 text-[10px] font-semibold text-slate-600 text-center">
                QR Traceability
              </div>
              <div className="text-[9.5px] tabular-nums text-slate-400 text-center">
                {activeOqc.coaNumber}
              </div>
            </div>
          </div>

          <footer className="pt-2 border-t border-slate-200 flex flex-row items-center justify-between gap-2 text-[10.5px] text-slate-500">
            <span className="tabular-nums">
              เอกสารควบคุม {activeOqc.coaNumber} ({docConfig.revision}) · ประมวลผลอัตโนมัติจาก QC Incoming, QC LAB และ QC Outgoing
            </span>
            <span className="tabular-nums font-medium shrink-0">
              มกอช. {docConfig.packingHouseCode} · อย. {docConfig.fdaNumber}
            </span>
          </footer>
        </section>
      </article>
    );
  }
);

CoaCertificateSheet.displayName = 'CoaCertificateSheet';

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
  const [isFullscreenPreview, setIsFullscreenPreview] = useState<boolean>(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState<boolean>(false);

  // Interactive Zoom State ('fit' automatically scales the 794px Web A4 sheet to fit mobile/tablet widths)
  const [zoomMode, setZoomMode] = useState<'fit' | 'custom'>('fit');
  const [customZoom, setCustomZoom] = useState<number>(1);
  const [fitScale, setFitScale] = useState<number>(1);
  const [fullscreenFitScale, setFullscreenFitScale] = useState<number>(1);
  const [sheetNaturalHeight, setSheetNaturalHeight] = useState<number>(1080);

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
      const lab = labByLot.get(mix.lotNumber);
      if (!lab || lab.overallLabStatus === 'PENDING') {
        labFailures.push(
          `${mix.lotNumber || mix.varietyCode}: อยู่ระหว่างรอผลการตรวจสอบทางห้องปฏิบัติการ (รอผลการตรวจสอบ)`
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
        labFailures.push(`${mix.lotNumber}: ${reasons.join(', ') || 'Lab FAIL'}`);
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

  const releaseStatusText = coaEvaluation.canStampPass
    ? 'อนุมัติปล่อยล็อตจัดส่ง (RELEASED)'
    : 'ระงับการปล่อยล็อต (HOLD / SUSPENDED)';

  const qrTraceabilityPayload = useMemo(() => {
    if (!activeOqc) return '';
    const lotCodes = activeMixItems
      .map((c) => `${c.varietyCode}:${c.lotNumber}`)
      .join('|');
    return JSON.stringify({
      coa: activeOqc.coaNumber,
      rev: docConfig.revision,
      issueDate: activeOqc.inspectionDate,
      acfsCode: docConfig.packingHouseCode,
      fdaNo: docConfig.fdaNumber,
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
      lots: lotCodes,
      labStatus: coaEvaluation.allLabPass ? 'PASS' : 'FAIL',
      releaseStatus: coaEvaluation.canStampPass ? 'RELEASED' : 'HOLD_SUSPENDED',
      qaStamp: coaEvaluation.canStampPass ? 'QA_PASSED' : 'STAMP_SUSPENDED',
    });
  }, [activeOqc, activeMixItems, coaEvaluation, docConfig]);

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
      const captureHeight = targetNode.offsetHeight || sheetNaturalHeight;

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
      const marginMm = 7;
      const maxContentWidthMm = pageWidthMm - marginMm * 2;
      const maxContentHeightMm = pageHeightMm - marginMm * 2;

      const aspectRatio = canvas.height / canvas.width;
      let renderWidthMm = maxContentWidthMm;
      let renderHeightMm = renderWidthMm * aspectRatio;

      // Fit cleanly onto a single official A4 sheet when within normal COA height bounds
      if (renderHeightMm > maxContentHeightMm) {
        renderHeightMm = maxContentHeightMm;
        renderWidthMm = renderHeightMm / aspectRatio;
      }

      const offsetX = (pageWidthMm - renderWidthMm) / 2;
      const offsetY = marginMm;

      pdf.addImage(
        imgData,
        'PNG',
        offsetX,
        offsetY,
        renderWidthMm,
        renderHeightMm,
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
        ยังไม่มีรายการตรวจปล่อยสินค้า (QC Outgoing) สำหรับออกใบรับรอง COA
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
    qrTraceabilityPayload,
    shelfDays,
  };

  return (
    <div className="space-y-5 min-w-0">
      {/* Offscreen Unscaled 794px Web A4 Node for Crisp 1:1 PDF Export at Any Zoom/Viewport */}
      <div
        className="no-print fixed top-0 left-[-10000px] w-[794px] pointer-events-none -z-50"
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
                เลือกใบรับรอง COA:
              </label>

              {/* Mobile Compact QR Trigger (Inline with label so Print + Download PDF stay side-by-side below) */}
              <button
                type="button"
                onClick={() => setShowQrModal(true)}
                className="sm:hidden h-7 px-2.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <QrCode className="w-3.5 h-3.5 shrink-0" />
                <span>ข้อมูล QR</span>
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
                  {r.coaNumber} ({r.oqcNumber}) — {r.customerName} · {r.distributionCenter || '-'} [PO: {r.poNumber}]
                </option>
              ))}
            </select>
          </div>

          {/* Primary Document Actions: Print + Download PDF Always Paired Side-by-Side */}
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 w-full sm:w-auto shrink-0">
            <button
              type="button"
              onClick={() => setShowQrModal(true)}
              className="hidden sm:inline-flex h-9 px-3 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors items-center justify-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <QrCode className="w-4 h-4 shrink-0" />
              <span>ข้อมูล QR</span>
            </button>

            <button
              type="button"
              onClick={handlePrintA4}
              className="h-10 sm:h-9 px-3 sm:px-4 text-xs font-semibold text-slate-900 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors inline-flex items-center justify-center gap-1.5 min-w-0"
            >
              <Printer className="w-4 h-4 shrink-0" />
              <span className="truncate">พิมพ์เอกสาร</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadPdf}
              disabled={isDownloadingPdf}
              className="h-10 sm:h-9 px-3 sm:px-4 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-60 rounded-lg transition-colors inline-flex items-center justify-center gap-1.5 min-w-0"
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
                  ? 'bg-white text-slate-900 shadow-xs ring-1 ring-slate-900/5'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">ตัวอย่างเอกสาร</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'SETTINGS'}
              onClick={() => setActiveTab('SETTINGS')}
              className={`h-9 sm:h-8 px-2.5 sm:px-4 text-xs font-semibold rounded-md transition-all inline-flex items-center justify-center gap-1.5 min-w-0 ${
                activeTab === 'SETTINGS'
                  ? 'bg-white text-slate-900 shadow-xs ring-1 ring-slate-900/5'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Settings2 className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">ตั้งค่าเอกสาร / DC</span>
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
                แก้ไขส่วนหัวเอกสาร ใบอนุญาตโรงคัดบรรจุ มกอช./อย. และข้อมูลคู่ค้า/ศูนย์กระจายสินค้า (DC)
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 text-xs">
              <div className="md:col-span-5">
                <label className="block font-medium text-slate-700 mb-1">
                  ชื่อผู้ผลิตและโรงคัดบรรจุ
                </label>
                <input
                  type="text"
                  value={docConfig.companyName}
                  onChange={(e) =>
                    onUpdateDocConfig({ ...docConfig, companyName: e.target.value })
                  }
                  className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-md"
                />
              </div>
              <div className="md:col-span-3">
                <label className="block font-medium text-slate-700 mb-1">
                  รหัสโรงคัดบรรจุมาตรฐาน มกอช.
                </label>
                <input
                  type="text"
                  value={docConfig.packingHouseCode}
                  onChange={(e) =>
                    onUpdateDocConfig({ ...docConfig, packingHouseCode: e.target.value })
                  }
                  placeholder="PH-ACFS-50-2024-0089"
                  className="w-full px-3 py-1.5 tabular-nums bg-white border border-slate-300 rounded-md"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block font-medium text-slate-700 mb-1">
                  เลขสารบบอาหาร (อย.)
                </label>
                <input
                  type="text"
                  value={docConfig.fdaNumber}
                  onChange={(e) =>
                    onUpdateDocConfig({ ...docConfig, fdaNumber: e.target.value })
                  }
                  className="w-full px-3 py-1.5 tabular-nums bg-white border border-slate-300 rounded-md"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block font-medium text-slate-700 mb-1">
                  ฉบับปรับปรุง (Revision)
                </label>
                <input
                  type="text"
                  value={docConfig.revision}
                  onChange={(e) =>
                    onUpdateDocConfig({ ...docConfig, revision: e.target.value })
                  }
                  placeholder="Rev. 02"
                  className="w-full px-3 py-1.5 tabular-nums bg-white border border-slate-300 rounded-md"
                />
              </div>

              <div className="md:col-span-4">
                <label className="block font-medium text-slate-700 mb-1">
                  การรับรองมาตรฐานสากล
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
                  placeholder="GHPs Codex Rev.5 / HACCP"
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
                        ? 'bg-slate-900 text-white border-slate-900'
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
        <div className="no-print p-4 rounded-xl bg-red-50 border border-red-300 text-red-950 flex items-start gap-3 min-w-0">
          <ShieldAlert className="w-5 h-5 text-red-700 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1 min-w-0">
            <div className="font-bold text-sm text-red-900">
              ระบบระงับตรายางดิจิทัล QA PASSED โดยอัตโนมัติ (Automatic Stamp Suspension Active)
            </div>
            <p>
              ตรวจพบผลวิเคราะห์ทางห้องปฏิบัติการ (QC LAB) ไม่ผ่านเกณฑ์มาตรฐานในล็อตที่เชื่อมโยงกับใบรับรองนี้:
            </p>
            <ul className="list-disc pl-5 tabular-nums font-medium space-y-0.5 text-red-800 break-words">
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
                      ? 'bg-slate-900 text-white border-slate-900'
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
                      ? 'bg-slate-900 text-white border-slate-900'
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
                    ? 'bg-slate-900 text-white border-slate-900'
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
                    ? 'bg-slate-900 text-white border-slate-900'
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
        <div className="no-print fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2 font-semibold text-slate-900 text-sm">
                <QrCode className="w-4 h-4 shrink-0" />
                <span>ข้อมูลดิจิทัลใน QR Code สอบย้อนกลับ ({activeOqc.coaNumber})</span>
              </div>
              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex justify-center py-2">
              <div className="p-3 border border-slate-200 rounded-lg bg-white">
                <QRCodeSVG value={qrTraceabilityPayload} size={160} level="M" />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="text-xs font-medium text-slate-700">
                ข้อมูล JSON ที่ฝังในรหัส QR เพื่อการตรวจสอบย้อนกลับและควบคุมเอกสาร:
              </div>
              <pre className="p-3 rounded-lg bg-slate-900 text-slate-100 text-xs font-mono overflow-x-auto">
                {JSON.stringify(JSON.parse(qrTraceabilityPayload), null, 2)}
              </pre>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
