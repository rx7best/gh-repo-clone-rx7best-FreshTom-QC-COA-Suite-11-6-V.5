export type ActiveModule = 'OVERVIEW' | 'INCOMING' | 'LAB' | 'OUTGOING' | 'COA';

export type VarietyCode = 'SL' | 'FV' | 'BL' | 'GR' | 'CM';

export interface TomatoVarietyInfo {
  code: VarietyCode;
  nameTh: string;
  nameEn: string;
  colorLabelTh: string;
  swatchHex: string;
}

export const TOMATO_VARIETIES: Record<VarietyCode, TomatoVarietyInfo> = {
  SL: {
    code: 'SL',
    nameTh: 'โซลาริโน่',
    nameEn: 'Solarino',
    colorLabelTh: 'สีแดง',
    swatchHex: '#dc2626',
  },
  FV: {
    code: 'FV',
    nameTh: 'ฟลาวิโอ้',
    nameEn: 'Flavio',
    colorLabelTh: 'สีส้ม',
    swatchHex: '#ea580c',
  },
  BL: {
    code: 'BL',
    nameTh: 'เบลนนี่',
    nameEn: 'Blenny',
    colorLabelTh: 'สีเหลือง',
    swatchHex: '#eab308',
  },
  GR: {
    code: 'GR',
    nameTh: 'กรูรามิ',
    nameEn: 'Gourami',
    colorLabelTh: 'สีเขียว',
    swatchHex: '#16a34a',
  },
  CM: {
    code: 'CM',
    nameTh: 'โครมิส',
    nameEn: 'Chromis',
    colorLabelTh: 'สีช็อคโกแลต',
    swatchHex: '#78350f',
  },
};

export const VARIETY_ORDER: VarietyCode[] = ['SL', 'FV', 'BL', 'GR', 'CM'];

export type IncomingDisposition = 'ACCEPT' | 'CONDITIONAL_ACCEPT' | 'REJECT';

export interface IncomingForeignMatter {
  noSoilResidue: boolean;
  noLiveInsects: boolean;
  noPhysicalHazard: boolean;
  noAbnormalOdor: boolean;
  cleanlinessNote: string;
}

export interface IncomingLotRecord {
  id: string;
  lotNumber: string;
  isCustomLot?: boolean;
  receivedDate: string;
  receivedTime: string;
  varietyCode: VarietyCode;
  foreignMatter: IncomingForeignMatter;
  disposition: IncomingDisposition;
  sortingPlan: string;
  sortingEstimatedLossPct: number;
  rejectReason: string;
  inspectorName: string;
  remarks: string;
}

export type LabTestStatus = 'PASS' | 'FAIL' | 'PENDING';

export interface LabRecord {
  id: string;
  lotNumber: string;
  receivedDate?: string;
  brixValue: number | null;
  colorStatus?: 'PASS' | 'FAIL';
  colorNote?: string;
  brixStatus: LabTestStatus;
  organophosphateCarbamate: LabTestStatus | null;
  organochlorinePyrethroid: LabTestStatus | null;
  pesticideNote?: string;
  pesticideStatus: LabTestStatus;
  overallLabStatus: LabTestStatus;
  analystName: string;
  labRemarks: string;
}

export interface ColorMixEntry {
  varietyCode: VarietyCode;
  lotNumber: string;
  lotNumbers?: string[];
  percentage: number;
}

export interface ChecklistDefectRecord {
  itemNumber: number;
  reason: string;
  correctiveAction: string;
  recordedAt?: string;
}

export interface OutgoingRecord {
  id: string;
  oqcNumber: string;
  coaNumber: string;
  productionLotNo?: string;
  inspectionDate: string;
  inspectionTime: string;
  customerName: string;
  distributionCenter: string;
  poNumber: string;
  productName: string;
  mfgDate: string;
  expDate: string;
  check1LidSealing: boolean;
  check1Note: string;
  colorMix: ColorMixEntry[];
  check2MixValid: boolean;
  check3ExpiryLabel: boolean;
  check3WashLabel?: boolean;
  check3Note: string;
  netWeightG: number;
  sampleWeights?: number[];
  weightSampleStatus?: 'PASS' | 'HOLD_REJECT';
  check4NetWeightPass: boolean;
  check4Note: string;
  check5Physical: boolean;
  check5Note: string;
  orderedPacks: number;
  actualPacks: number;
  crateQty: number;
  check6QtyMatch: boolean;
  roomTempC: number;
  check7RoomTempPass: boolean;
  check8CrateClean: boolean;
  check8Note: string;
  checkDefects?: Record<number, ChecklistDefectRecord>;
  oqcInspector: string;
  coaCertifier?: string;
  releaseApprover?: string;
  oqcStatus: 'PASS' | 'FAIL';
  oqcRemarks: string;
}

export interface CoaDocumentConfig {
  companyName: string;
  companyNameEn?: string;
  companyAddress?: string;
  companyContact?: string;
  packingHouseCode?: string;
  fdaNumber?: string;
  revision?: string;
  internationalStandards: string;
  coaCertifier?: string;
  releaseApprover?: string;
}

