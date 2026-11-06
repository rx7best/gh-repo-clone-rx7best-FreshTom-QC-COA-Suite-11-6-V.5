/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  ClipboardCheck,
  FileCheck2,
  FlaskConical,
  LayoutDashboard,
  Menu,
  PackageCheck,
  PanelLeftClose,
  PanelLeftOpen,
  Printer,
  RotateCcw,
  X,
} from 'lucide-react';
import {
  ActiveModule,
  CoaDocumentConfig,
  IncomingLotRecord,
  LabRecord,
  OutgoingRecord,
} from './types/qc';
import {
  DEFAULT_COA_DOC_CONFIG,
  INITIAL_INCOMING_LOTS,
  INITIAL_LAB_RECORDS,
  INITIAL_OUTGOING_RECORDS,
} from './data/initialData';
import { OverviewDashboardView } from './components/OverviewDashboardView';
import { IncomingQCView } from './components/IncomingQCView';
import { LabQCView } from './components/LabQCView';
import { OutgoingQCView } from './components/OutgoingQCView';
import { COAView } from './components/COAView';
import {
  AppNotificationPayload,
  NotificationVariant,
  PopupNotification,
} from './components/PopupNotification';

const STORAGE_KEYS = {
  LOTS: 'freshtom_qc_incoming_lots_v5',
  LABS: 'freshtom_qc_lab_records_v5',
  OQC: 'freshtom_qc_outgoing_records_v11',
  COA_DOC: 'freshtom_qc_coa_doc_config_v4',
};

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export default function App() {
  const [activeModule, setActiveModule] = useState<ActiveModule>('OVERVIEW');
  // Web (lg+): Collapsible menu — closed by default so content expands full width; click button to reveal menu
  const [isDesktopMenuOpen, setIsDesktopMenuOpen] = useState<boolean>(false);
  // Mobile/Tablet (< lg): Optional quick drawer for standards & reset demo data
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState<boolean>(false);
  // Global 5-second Auto-dismissing Pop-up Notification
  const [notification, setNotification] = useState<AppNotificationPayload | null>(
    null
  );

  const triggerNotification = (
    title: string,
    message: string,
    variant: NotificationVariant = 'success'
  ) => {
    setNotification({
      id: Date.now() + Math.random(),
      title,
      message,
      variant,
    });
  };

  const [lots, setLots] = useState<IncomingLotRecord[]>(() => {
    const loaded = loadFromStorage(STORAGE_KEYS.LOTS, INITIAL_INCOMING_LOTS);
    return loaded.map((l) => ({
      ...l,
      inspectorName:
        !l.inspectorName ||
        l.inspectorName.includes('กัญญาณี') ||
        l.inspectorName.includes('ณัฐพงศ์')
          ? 'น.ส.ศศิวิมล ทิพย์ทอง'
          : l.inspectorName,
    }));
  });
  const [labRecords, setLabRecords] = useState<LabRecord[]>(() => {
    const loaded = loadFromStorage(STORAGE_KEYS.LABS, INITIAL_LAB_RECORDS);
    return loaded.map((r) => ({
      ...r,
      analystName:
        !r.analystName || r.analystName.includes('ปิยะฉัตร')
          ? 'น.ส.วิชุตา เหล่าศรี'
          : r.analystName,
    }));
  });
  const [outgoingRecords, setOutgoingRecords] = useState<OutgoingRecord[]>(() => {
    const loaded = loadFromStorage(STORAGE_KEYS.OQC, INITIAL_OUTGOING_RECORDS);
    return loaded.map((r) => ({
      ...r,
      coaNumber: 'COA-001',
      oqcInspector:
        !r.oqcInspector || r.oqcInspector.includes('ศิริพร')
          ? 'น.ส.รัชดาภรณ์ เรืองอุไร'
          : r.oqcInspector,
      coaCertifier:
        !r.coaCertifier || r.coaCertifier === 'ฝ่ายประกันคุณภาพ (QA)'
          ? 'น.ส.พรปวีณ์ ร่วมศรี'
          : r.coaCertifier,
      releaseApprover: r.releaseApprover || 'นายเด่นชัย ห่วงจิง',
    }));
  });
  const [coaDocConfig, setCoaDocConfig] = useState<CoaDocumentConfig>(() => {
    const loaded = loadFromStorage(STORAGE_KEYS.COA_DOC, DEFAULT_COA_DOC_CONFIG);
    const companyName =
      !loaded.companyName ||
      loaded.companyName.includes('เพรชทอม') ||
      loaded.companyName.includes('เฟรชโปร')
        ? 'บริษัท เดลิช ฟู้ดส์ จำกัด'
        : loaded.companyName;
    return {
      ...DEFAULT_COA_DOC_CONFIG,
      ...loaded,
      companyName,
      companyNameEn:
        !loaded.companyNameEn || loaded.companyNameEn.includes('Fresh Pro')
          ? 'Delish Foods Co., Ltd.'
          : loaded.companyNameEn,
      companyAddress:
        !loaded.companyAddress || loaded.companyAddress.includes('บางบัวทอง')
          ? DEFAULT_COA_DOC_CONFIG.companyAddress
          : loaded.companyAddress,
      companyContact:
        !loaded.companyContact || loaded.companyContact.includes('freshpro')
          ? DEFAULT_COA_DOC_CONFIG.companyContact
          : loaded.companyContact,
      packingHouseCode: '',
      fdaNumber: '',
      revision: '',
      internationalStandards:
        loaded.internationalStandards && loaded.internationalStandards.includes('Codex')
          ? 'GHPs, HACCP, GAP'
          : loaded.internationalStandards || 'GHPs, HACCP, GAP',
      coaCertifier:
        !loaded.coaCertifier || loaded.coaCertifier === 'ฝ่ายประกันคุณภาพ (QA)'
          ? 'น.ส.พรปวีณ์ ร่วมศรี'
          : loaded.coaCertifier,
      releaseApprover: loaded.releaseApprover || 'นายเด่นชัย ห่วงจิง',
    };
  });

  const [preselectedIncomingLotId, setPreselectedIncomingLotId] = useState<
    string | null
  >(null);
  const [preselectedLabLot, setPreselectedLabLot] = useState<string | null>(null);
  const [preselectedOqcId, setPreselectedOqcId] = useState<string | null>(null);
  const [selectedCoaOqcId, setSelectedCoaOqcId] = useState<string | null>(
    INITIAL_OUTGOING_RECORDS[0]?.id ?? null
  );

  useEffect(() => {
    try {
      const search = window.location.search;
      if (!search) return;
      const params = new URLSearchParams(search);
      const tab = params.get('tab');
      const verify = params.get('verify');
      const coa = params.get('coaNumber') || params.get('coa');
      if (tab === 'coa' || verify === 'true' || coa) {
        setActiveModule('COA');
        if (coa) {
          const matched = outgoingRecords.find(
            (r) => r.coaNumber === coa || r.productionLotNo === coa || r.oqcNumber === coa
          );
          if (matched) {
            setSelectedCoaOqcId(matched.id);
          }
        }
      }
    } catch {
      // ignore
    }
  }, [outgoingRecords]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.LOTS, JSON.stringify(lots));
    } catch {
      // Ignore storage quota issues
    }
  }, [lots]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.LABS, JSON.stringify(labRecords));
    } catch {
      // Ignore storage quota issues
    }
  }, [labRecords]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.OQC, JSON.stringify(outgoingRecords));
    } catch {
      // Ignore storage quota issues
    }
  }, [outgoingRecords]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEYS.COA_DOC, JSON.stringify(coaDocConfig));
    } catch {
      // Ignore storage quota issues
    }
  }, [coaDocConfig]);

  const handleSaveLot = (record: IncomingLotRecord) => {
    setLots((prev) => {
      const exists = prev.some((l) => l.id === record.id);
      if (exists) {
        return prev.map((l) => (l.id === record.id ? record : l));
      }
      return [record, ...prev];
    });
  };

  const handleDeleteLot = (id: string) => {
    const target = lots.find((l) => l.id === id);
    setLots((prev) => prev.filter((l) => l.id !== id));
    if (target) {
      triggerNotification(
        'ลบรายการล็อตวัตถุดิบแล้ว',
        `ลบล็อต ${target.lotNumber} ออกจากรายการตรวจรับเรียบร้อยแล้ว`,
        'warning'
      );
    }
  };

  const handleSaveLabRecord = (record: LabRecord) => {
    setLabRecords((prev) => {
      const exists = prev.some((r) => r.lotNumber === record.lotNumber);
      if (exists) {
        return prev.map((r) => (r.lotNumber === record.lotNumber ? record : r));
      }
      return [record, ...prev];
    });
  };

  const handleSaveOutgoing = (record: OutgoingRecord) => {
    setOutgoingRecords((prev) => {
      const exists = prev.some((r) => r.id === record.id);
      if (exists) {
        return prev.map((r) => (r.id === record.id ? record : r));
      }
      return [record, ...prev];
    });
    setSelectedCoaOqcId(record.id);
  };

  const handleInspectIncomingLot = (lotId: string) => {
    setPreselectedIncomingLotId(lotId);
    setActiveModule('INCOMING');
  };

  const handleJumpToLab = (lotNumber: string) => {
    setPreselectedLabLot(lotNumber);
    setActiveModule('LAB');
  };

  const handleInspectOutgoing = (oqcId?: string) => {
    setPreselectedOqcId(oqcId || null);
    setActiveModule('OUTGOING');
  };

  const handleOpenCOA = (oqcId: string) => {
    setSelectedCoaOqcId(oqcId);
    setActiveModule('COA');
  };

  const handleResetDemoData = () => {
    setLots(INITIAL_INCOMING_LOTS);
    setLabRecords(INITIAL_LAB_RECORDS);
    setOutgoingRecords(INITIAL_OUTGOING_RECORDS);
    setCoaDocConfig(DEFAULT_COA_DOC_CONFIG);
    setSelectedCoaOqcId(INITIAL_OUTGOING_RECORDS[0]?.id ?? null);
    setIsMobileDrawerOpen(false);
    triggerNotification(
      'คืนค่าข้อมูลตั้งต้นเรียบร้อยแล้ว',
      'รีเซ็ตข้อมูลล็อตวัตถุดิบ ผลแล็บ แผนจัดส่ง และใบรับรอง COA กลับสู่ค่าเริ่มต้นแล้ว',
      'success'
    );
  };

  const navItems: {
    key: ActiveModule;
    label: string;
    sublabel: string;
    countText: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    {
      key: 'OVERVIEW',
      label: 'ภาพรวม (Overview)',
      sublabel: 'สรุป KPI · Production Lots',
      countText: `${lots.length} ล็อต`,
      icon: LayoutDashboard,
    },
    {
      key: 'INCOMING',
      label: 'QC Incoming',
      sublabel: 'ตรวจรับวัตถุดิบ 5 สายพันธุ์',
      countText: `${lots.length} ล็อต`,
      icon: ClipboardCheck,
    },
    {
      key: 'LAB',
      label: 'QC LAB',
      sublabel: 'ความหวาน %Brix · สารตกค้าง 2 หมวด',
      countText: `${lots.length} ล็อต`,
      icon: FlaskConical,
    },
    {
      key: 'OUTGOING',
      label: 'FG',
      sublabel: 'แผนส่งมอบ CP ALL DC · 8 ข้อ',
      countText: `${outgoingRecords.length} รอบส่ง`,
      icon: PackageCheck,
    },
    {
      key: 'COA',
      label: 'ใบรับรอง COA',
      sublabel: 'พิมพ์เอกสารรับรองขนาด A4',
      countText: 'A4 / PDF',
      icon: FileCheck2,
    },
  ];

  const moduleBreadcrumbs: Record<ActiveModule, string> = {
    OVERVIEW: 'Overview Dashboard / สรุปภาพรวมคุณภาพ · Production Lots',
    INCOMING: 'Quality Control / QC Incoming (ตรวจรับมะเขือเทศเชอร์รี่ 5 สี)',
    LAB: 'Quality Control / QC LAB (การวิเคราะห์ทางห้องปฏิบัติการ — %Brix & สารเคมีตกค้าง 2 หมวด)',
    OUTGOING: 'Quality Control / FG (สินค้าสำเร็จรูป CP ALL DC 8 ข้อกำหนด)',
    COA: 'Quality Assurance / Certificate of Analysis (ใบรับรองคุณภาพมาตรฐาน A4)',
  };

  return (
    <div className="min-h-screen flex bg-neutral-50 text-slate-900">
      {/* Global 5-Second Auto-Dismissing Pop-up Notification */}
      <PopupNotification
        notification={notification}
        onClose={() => setNotification(null)}
      />

      {/* Desktop Collapsible Sidebar Navigation (lg+) */}
      <aside
        aria-hidden={!isDesktopMenuOpen}
        className={`no-print hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 lg:left-0 z-40 bg-white border-r border-slate-200 transition-transform duration-200 ease-out ${
          isDesktopMenuOpen
            ? 'lg:translate-x-0 shadow-sm'
            : 'lg:-translate-x-full pointer-events-none'
        }`}
      >
        <div className="h-16 px-4 flex items-center justify-between border-b border-slate-200">
          <button
            type="button"
            onClick={() => setActiveModule('OVERVIEW')}
            className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap"
          >
            FreshTom QC Suite
          </button>
          <button
            type="button"
            onClick={() => setIsDesktopMenuOpen(false)}
            className="h-8 w-8 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-slate-900 inline-flex items-center justify-center transition-colors"
            title="ซ่อนแถบเมนูและขยายพื้นที่เนื้อหา"
            aria-label="ซ่อนแถบเมนู"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        </div>

        <nav className="flex-1 p-3.5 space-y-1.5 overflow-y-auto" aria-label="โมดูลหลัก">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeModule === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveModule(item.key)}
                className={`w-full text-left px-3.5 py-3 rounded-lg transition-colors flex items-start justify-between gap-2 ${
                  active
                    ? 'bg-emerald-600 text-white font-semibold shadow-xs'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <Icon
                    className={`w-4 h-4 mt-0.5 shrink-0 ${
                      active ? 'text-white' : 'text-slate-500'
                    }`}
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-semibold truncate">{item.label}</div>
                    <div
                      className={`text-[11px] truncate mt-0.5 ${
                        active ? 'text-emerald-100' : 'text-slate-500'
                      }`}
                    >
                      {item.sublabel}
                    </div>
                  </div>
                </div>
                <span
                  className={`text-[11px] font-medium tabular-nums shrink-0 ${
                    active ? 'text-emerald-100' : 'text-slate-400'
                  }`}
                >
                  {item.countText}
                </span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 space-y-3 text-xs text-slate-500">
          <div>
            <div className="font-semibold text-slate-800">เกณฑ์มาตรฐานบังคับ</div>
            <div className="mt-1.5 space-y-1 text-[11.5px] leading-relaxed tabular-nums text-slate-600">
              <div>· ความหวาน &gt; 6.0 %Brix (7-Eleven)</div>
              <div>· คละ ≥ 3 สี (บังคับเขียว+แดง)</div>
              <div>· น้ำหนักสุทธิ ≥ 140 กรัม</div>
              <div>· อุณหภูมิห้องตรวจ 2–6 °C</div>
              <div>· ฉลากระบุ &ldquo;ล้างก่อนรับประทาน&rdquo;</div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleResetDemoData}
            className="h-9 w-full px-3 text-xs font-medium text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors inline-flex items-center justify-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>คืนค่าข้อมูลตั้งต้น</span>
          </button>
        </div>
      </aside>

      {/* Mobile & Tablet Left Slide-over Menu Drawer (< lg) */}
      {isMobileDrawerOpen && (
        <div
          className="no-print fixed inset-0 z-50 lg:hidden bg-slate-900/40 backdrop-blur-2xs flex justify-start"
          role="dialog"
          aria-modal="true"
          aria-label="เมนูและเกณฑ์มาตรฐานระบบ"
          onClick={() => setIsMobileDrawerOpen(false)}
        >
          <div
            className="w-full max-w-xs bg-white h-full border-r border-slate-200 flex flex-col justify-between shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <div className="h-14 px-4 border-b border-slate-200 flex items-center justify-between">
                <span className="text-sm font-bold text-slate-900">
                  FreshTom QC Suite
                </span>
                <button
                  type="button"
                  onClick={() => setIsMobileDrawerOpen(false)}
                  className="h-8 w-8 rounded-lg border border-slate-200 bg-slate-50 text-slate-600 hover:text-slate-900 inline-flex items-center justify-center"
                  aria-label="ปิดหน้าต่างเมนู"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-3 space-y-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const active = activeModule === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => {
                        setActiveModule(item.key);
                        setIsMobileDrawerOpen(false);
                      }}
                      className={`w-full text-left px-3 py-2.5 rounded-lg flex items-center justify-between gap-2 transition-colors ${
                        active
                          ? 'bg-emerald-600 text-white font-semibold shadow-xs'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Icon
                          className={`w-4 h-4 shrink-0 ${
                            active ? 'text-white' : 'text-slate-500'
                          }`}
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold truncate">
                            {item.label}
                          </div>
                          <div
                            className={`text-[11px] truncate ${
                              active ? 'text-emerald-100' : 'text-slate-500'
                            }`}
                          >
                            {item.sublabel}
                          </div>
                        </div>
                      </div>
                      <span
                        className={`text-[11px] font-medium tabular-nums shrink-0 ${
                          active ? 'text-emerald-100' : 'text-slate-400'
                        }`}
                      >
                        {item.countText}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 space-y-3 text-xs text-slate-600 bg-slate-50/60">
              <div>
                <div className="font-semibold text-slate-900">เกณฑ์มาตรฐานบังคับ</div>
                <div className="mt-1.5 space-y-1 text-[11.5px] leading-relaxed tabular-nums text-slate-600">
                  <div>· ความหวาน &gt; 6.0 %Brix (7-Eleven)</div>
                  <div>· คละ ≥ 3 สี (บังคับเขียว+แดง)</div>
                  <div>· น้ำหนักสุทธิ ≥ 140 กรัม</div>
                  <div>· อุณหภูมิห้องตรวจ 2–6 °C</div>
                  <div>· ฉลากระบุ &ldquo;ล้างก่อนรับประทาน&rdquo;</div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleResetDemoData}
                className="h-9 w-full px-3 text-xs font-semibold text-slate-800 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg transition-colors inline-flex items-center justify-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>คืนค่าข้อมูลตั้งต้น</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Shell — Expands smoothly when Desktop Menu is closed */}
      <div
        className={`flex-1 flex flex-col min-w-0 transition-[padding] duration-200 ease-out ${
          isDesktopMenuOpen ? 'lg:pl-64' : 'lg:pl-0'
        }`}
      >
        {/* Top Bar Contract: Left Menu Button + Brand/Breadcrumb + COA Action on COA Page Only */}
        <header className="no-print sticky top-0 z-30 bg-white/95 backdrop-blur-xs border-b border-slate-200">
          {/* Header Row */}
          <div className="h-14 sm:h-16 px-3.5 sm:px-6 lg:px-8 flex items-center justify-between gap-2.5 sm:gap-3">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              {/* Desktop Click-to-Toggle Menu Button (lg+) */}
              <button
                type="button"
                onClick={() => setIsDesktopMenuOpen((prev) => !prev)}
                className={`hidden lg:inline-flex h-9 px-3 rounded-lg border text-xs font-semibold items-center gap-2 transition-colors shrink-0 ${
                  isDesktopMenuOpen
                    ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
                    : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-50'
                }`}
                aria-expanded={isDesktopMenuOpen}
                aria-label="เปิดหรือซ่อนเมนูระบบ"
              >
                {isDesktopMenuOpen ? (
                  <>
                    <PanelLeftClose className="w-4 h-4 shrink-0" />
                    <span>ซ่อนเมนู</span>
                  </>
                ) : (
                  <>
                    <PanelLeftOpen className="w-4 h-4 shrink-0" />
                    <span>เมนู</span>
                  </>
                )}
              </button>

              {/* Brand Title & Active Module */}
              <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
                <button
                  type="button"
                  onClick={() => setActiveModule('OVERVIEW')}
                  className={`${
                    isDesktopMenuOpen ? 'lg:hidden' : 'inline-flex'
                  } text-sm sm:text-base font-bold tracking-tight text-slate-900 truncate min-w-0 items-center`}
                >
                  <span className="truncate">FreshTom QC</span>
                </button>

                <span
                  className="text-slate-300 shrink-0 text-xs sm:text-sm"
                  aria-hidden="true"
                >
                  /
                </span>

                <div className="text-xs sm:text-sm font-semibold text-slate-700 truncate max-w-[150px] sm:max-w-none">
                  <span className="sm:hidden">
                    {activeModule === 'OVERVIEW' && 'ภาพรวม'}
                    {activeModule === 'INCOMING' && 'QC Incoming'}
                    {activeModule === 'LAB' && 'QC LAB'}
                    {activeModule === 'OUTGOING' && 'FG'}
                    {activeModule === 'COA' && 'ใบรับรอง COA'}
                  </span>
                  <span className="hidden sm:inline">
                    {moduleBreadcrumbs[activeModule]}
                  </span>
                </div>
              </div>
            </div>

            {/* Right Controls: 'ออกใบรับรอง COA' on COA Page Only */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {activeModule === 'COA' && (
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="h-9 px-2.5 sm:px-4 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 shadow-2xs"
                >
                  <Printer className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden sm:inline">ออกใบรับรอง COA</span>
                  <span className="sm:hidden">พิมพ์ COA</span>
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Active Workspace Viewport — pb-24 ensures sticky mobile bottom nav never covers content */}
        <main className="@container flex-1 min-w-0 overflow-x-clip p-3 sm:p-6 lg:p-8 pb-24 sm:pb-24 lg:pb-8 max-w-[1680px] w-full mx-auto">
          {activeModule === 'OVERVIEW' && (
            <OverviewDashboardView
              lots={lots}
              labRecords={labRecords}
              outgoingRecords={outgoingRecords}
              onNavigateModule={setActiveModule}
              onInspectIncomingLot={handleInspectIncomingLot}
              onInspectLabLot={handleJumpToLab}
              onInspectOutgoing={handleInspectOutgoing}
              onOpenCOA={handleOpenCOA}
              onNotify={triggerNotification}
            />
          )}

          {activeModule === 'INCOMING' && (
            <IncomingQCView
              lots={lots}
              labRecords={labRecords}
              preselectedLotId={preselectedIncomingLotId}
              onSaveLot={handleSaveLot}
              onDeleteLot={handleDeleteLot}
              onJumpToLab={handleJumpToLab}
              onNotify={triggerNotification}
            />
          )}

          {activeModule === 'LAB' && (
            <LabQCView
              lots={lots}
              labRecords={labRecords}
              preselectedLotNumber={preselectedLabLot}
              onSaveLabRecord={handleSaveLabRecord}
              onNotify={triggerNotification}
            />
          )}

          {activeModule === 'OUTGOING' && (
            <OutgoingQCView
              lots={lots}
              labRecords={labRecords}
              outgoingRecords={outgoingRecords}
              preselectedOqcId={preselectedOqcId}
              onSaveOutgoing={handleSaveOutgoing}
              onOpenCOA={handleOpenCOA}
              onNotify={triggerNotification}
            />
          )}

          {activeModule === 'COA' && (
            <COAView
              lots={lots}
              labRecords={labRecords}
              outgoingRecords={outgoingRecords}
              selectedOqcId={selectedCoaOqcId}
              onSelectOqcId={setSelectedCoaOqcId}
              docConfig={coaDocConfig}
              onUpdateDocConfig={setCoaDocConfig}
              onUpdateOutgoingRecord={handleSaveOutgoing}
              onNotify={triggerNotification}
            />
          )}
        </main>

        {/* Mobile Fixed Bottom Navigation Bar (< lg): Thumb-zone Ergonomics (44px+ hitboxes) */}
        <nav
          className="no-print fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 lg:hidden px-2 pt-1 pb-[calc(0.25rem+env(safe-area-inset-bottom,0px))] shadow-lg shadow-slate-900/10"
          aria-label="การนำทางบนมือถือ"
        >
          <div className="grid grid-cols-5 items-center gap-1 max-w-md mx-auto">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = activeModule === item.key;
              const shortLabels: Record<ActiveModule, string> = {
                OVERVIEW: 'ภาพรวม',
                INCOMING: 'ตรวจรับ',
                LAB: 'QC LAB',
                OUTGOING: 'FG',
                COA: 'ใบ COA',
              };

              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    setActiveModule(item.key);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className={`flex flex-col items-center justify-center min-h-[48px] py-1 px-0.5 rounded-xl transition-all ${
                    active
                      ? 'bg-emerald-600 text-white shadow-xs font-bold'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-medium'
                  }`}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon
                    className={`w-4 h-4 mb-0.5 shrink-0 ${
                      active ? 'text-white' : 'text-slate-500'
                    }`}
                  />
                  <span className="text-[10px] leading-tight truncate w-full text-center">
                    {shortLabels[item.key]}
                  </span>
                </button>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
