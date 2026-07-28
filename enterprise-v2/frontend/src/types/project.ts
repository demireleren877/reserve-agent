import type { FileData, Granularity, LDFMethod, Triangle, TriangleType } from "./triangle";

export type Frequency = "yearly" | "quarterly";

export interface UploadSettings {
  triangleType: TriangleType;
  originGranularity: Granularity;
  devGranularity: Granularity;
  cumulative: boolean;
}
export type Window = number | "all";

export type ChangeSource = "user" | "agent";

export interface HistoryEntry {
  id: string;
  timestamp: string;
  action: string;
  source?: ChangeSource;
  /** İşlemi başlatan oturum kullanıcısı; agent işleminde agent'ı çalıştıran kişi. */
  actorName?: string;
  details?: Record<string, unknown>;
}

export interface Branch {
  id: string;
  name: string;
  frequency: Frequency;
  createdAt: string;
  updatedAt: string;

  triangle: Triangle | null;
  triangleFileName?: string | null;
  fileData?: FileData;

  /** Ödeme (paid) üçgeni — DataTab görünümü ve Muallak hesabı için */
  paidTriangle?: Triangle | null;
  /** Gerçekleşen (incurred) üçgeni — DataTab görünümü ve Muallak hesabı için */
  incurredTriangle?: Triangle | null;

  /** Kümülatif ihbar adedi üçgeni — Frekans-Şiddet için. Yalnızca DOSYA_NO'lu
   *  hasar verisinden yüklenen branşlarda dolu olur. */
  countTriangle?: Triangle | null;

  /** LARGE-LOSS ayrımı (opsiyonel). Yüklenirse ana model ATTRITIONAL =
   *  GROSS − LARGE üzerinde çalışır; LARGE ayrıca modellenir. Yoksa bugünkü
   *  davranış (tek segment) aynen sürer — geriye tam uyumlu. */
  largePaidTriangle?: Triangle | null;
  largeIncurredTriangle?: Triangle | null;
  largeFileData?: FileData;
  /** @deprecated largeModel.window kullanılıyor. */
  largeWindow?: Window;
  /** LARGE segmentinin BAĞIMSIZ model parametreleri (Faz 2). Attritional ana
   *  parametreleri Branch'in kendi alanlarında; Large kendi setini burada tutar. */
  largeModel?: LargeModel;
  /** GROSS segmentinin BAĞIMSIZ model parametreleri. Gross = tüm veri (attritional+large
   *  ayrımı yapılmadan) doğrudan modellenir; Attritional/Large'dan bağımsız param seti. */
  grossModel?: LargeModel;

  /** Roll-forward'da uygulanan dosya-bazlı düzeltmeler (non-destructive, denetlenebilir).
   *  Key = dosya_no. Roll sırasında o dosyanın ödeme/muallağı bu değerlerle değiştirilir. */
  rollAdjustments?: Record<string, ClaimAdjustment>;
  /** LARGE roll-forward düzeltmeleri (gross'tan ayrı). */
  largeRollAdjustments?: Record<string, ClaimAdjustment>;
  /** Roll-forward'da TEMEL (önceki) döneme uygulanan dosya düzeltmeleri. Temel üçgene
   *  delta-yama olarak uygulanır (o dönemin origin diagonaline). Key = dosya_no. */
  baseRollAdjustments?: Record<string, ClaimAdjustment>;
  /** LARGE temel dönem düzeltmeleri. */
  largeBaseRollAdjustments?: Record<string, ClaimAdjustment>;

  method: LDFMethod;
  window: Window;
  /** LDF tablosundaki düzenlenebilir volume presetleri (varsayılan [4,5,6,7]).
   *  Branşa özel — cihaz değil. "All" ayrı, sabit. */
  ldfWindowPresets?: number[];
  excludedCells: string[];
  /** LDF yumuşatma: aynı kaza yılında yan yana iki oranı (j, j+1) ortalamayla değiştir.
   *  Anahtar `origin|j` = çiftin sol hücresi. Elemeden bağımsız; long-press ile aç/kapat. */
  ldfAvgPairs?: string[];

  premiums: Record<string, number>;
  lrInputPerOrigin: Record<string, string>;
  basisPerOrigin: Record<string, "cl" | "bf">;

  /** Çeyreklik modellerde kaza yılı tamamlanmamış origin'ler için
   *  annualization katsayısı. Örn. sadece Q1 görünüyorsa 4, Q1+Q2 için 2.
   *  Missing / 1 → düzeltme yok. BF hesabında exposure bu katsayıyla
   *  çarpılarak yıllığa tamamlanır; IBNR hesabında ultimate bu katsayıya
   *  bölünerek kısmi döneme geri indirilir. */
  correctionPerOrigin: Record<string, number>;

  /** User-entered CDF per development period (stringified). Missing key → 1. */
  cdfInitial: Record<string, number>;
  /** Per-period choice: "initial" uses Selected CDF from LDF tab,
   *  "user" uses the typed User Value. Missing key → "initial".
   *  @deprecated Use cdfModelPerPeriod instead. */
  cdfChoicePerPeriod: Record<string, "initial" | "user">;
  /** Per-period model selection: 1=Initial, 2=Exp Decay, 3=Inv Power, 4=Power, 5=Weibull, 6=User Value. Missing → 1. */
  cdfModelPerPeriod: Record<string, 1 | 2 | 3 | 4 | 5 | 6>;
  /** Whether the period is included in the tail curve regression. Missing → true. */
  curveIncludePerPeriod: Record<string, boolean>;

  history: HistoryEntry[];

  uploadSettings: UploadSettings;

  /** Karma Volume: her dev step için ayrı window. Key = step index (string).
   *  Boş ise karma devre dışı, global `window` kullanılır. */
  karmaWindowPerStep?: Record<string, Window>;

  /** Cashflow modülüne ait LDF seçimleri — rezerv LDF'inden bağımsız */
  cashflowLdfWindow?: Window;
  cashflowLdfExcludedCells?: string[];
  /** Cashflow Karma Volume */
  cashflowKarmaWindowPerStep?: Record<string, Window>;

  /** Cashflow Curve tab seçimleri — rezerv curve'den bağımsız */
  cashflowCdfModelPerPeriod?: Record<string, 1 | 2 | 3 | 4 | 5 | 6>;
  cashflowCurveIncludePerPeriod?: Record<string, boolean>;
  cashflowCdfInitial?: Record<string, number>;

  /** Cashflow'dan hesaplanan aylık dağılım — iskonto için kullanılır.
   *  Key: origin period string. Value: { month (1-based offset), weight }[] sums to 1. */
  cashflowMonthlyPattern?: Record<string, { month: number; weight: number }[]>;

  /** Model VERSİYONLARI (senaryolar). Her versiyon assumption alanlarının adlandırılmış
   *  bir snapshot'ıdır; VERİ (üçgen/fileData/rollAdjustments) tüm versiyonlarca paylaşılır.
   *  Yaşayan branch alanları = AKTİF versiyonun çalışma durumu. Versiyon değiştirince
   *  yaşayan assumption alanları hedef versiyonun snapshot'ıyla değişir (veri korunur).
   *  Yoksa (eski proje) tek örtük versiyon gibi davranılır; yüklemede "Base" oluşturulur. */
  versions?: ModelVersion[];
  activeVersionId?: string;
}

/** Bir versiyonun (senaryonun) sakladığı assumption alan kümesi — Branch alt-kümesi.
 *  VERİ alanları (üçgen, fileData, rollAdjustments) buraya dahil DEĞİL (paylaşılır). */
export const ASSUMPTION_KEYS = [
  "method", "window", "excludedCells", "ldfAvgPairs",
  "premiums", "lrInputPerOrigin", "basisPerOrigin", "correctionPerOrigin",
  "cdfInitial", "cdfChoicePerPeriod", "cdfModelPerPeriod", "curveIncludePerPeriod",
  "karmaWindowPerStep", "largeWindow", "largeModel", "grossModel",
  "cashflowLdfWindow", "cashflowLdfExcludedCells", "cashflowKarmaWindowPerStep",
  "cashflowCdfModelPerPeriod", "cashflowCurveIncludePerPeriod", "cashflowCdfInitial",
  "cashflowMonthlyPattern",
] as const satisfies readonly (keyof Branch)[];

export type AssumptionKey = (typeof ASSUMPTION_KEYS)[number];
export type Assumptions = Pick<Branch, AssumptionKey>;

export interface ModelVersion extends Assumptions {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

/** Bir branch'ten yaşayan assumption alanlarının snapshot'ını alır. */
export function snapshotAssumptions(branch: Branch): Assumptions {
  const out = {} as Record<AssumptionKey, unknown>;
  for (const k of ASSUMPTION_KEYS) out[k] = branch[k];
  return out as Assumptions;
}

/** Yaşayan assumption alanlarını bir versiyonun snapshot'ıyla değiştirmek için partial üretir. */
export function assumptionsFromVersion(v: Assumptions): Partial<Branch> {
  const out: Partial<Branch> = {};
  for (const k of ASSUMPTION_KEYS) (out as Record<string, unknown>)[k] = v[k];
  return out;
}

export function makeVersion(name: string, base: Assumptions): ModelVersion {
  const now = new Date().toISOString();
  return { id: newId(), name, createdAt: now, updatedAt: now, ...base };
}

/** Roll-forward'da bir dosyaya (claim) uygulanan düzeltme. Alan verilmezse orijinal kalır. */
export interface ClaimAdjustment {
  /** Düzeltilmiş toplam muallak (stok). */
  muallak?: number;
  /** Düzeltilmiş toplam ödeme. */
  odeme?: number;
  /** Not/gerekçe (denetim için). */
  note?: string;
}

/** LARGE segmentinin bağımsız model parametre seti (Branch param alt-kümesi). */
export interface LargeModel {
  method?: LDFMethod;
  window?: Window;
  excludedCells?: string[];
  ldfAvgPairs?: string[];
  karmaWindowPerStep?: Record<string, Window>;
  premiums?: Record<string, number>;
  lrInputPerOrigin?: Record<string, string>;
  basisPerOrigin?: Record<string, "cl" | "bf">;
  correctionPerOrigin?: Record<string, number>;
  cdfInitial?: Record<string, number>;
  cdfChoicePerPeriod?: Record<string, "initial" | "user">;
  cdfModelPerPeriod?: Record<string, 1 | 2 | 3 | 4 | 5 | 6>;
  curveIncludePerPeriod?: Record<string, boolean>;
}

export interface Period {
  id: string;
  label: string;
  createdAt: string;
  branches: Branch[];
}

export interface Project {
  periods: Period[];
  activePeriodId: string | null;
  activeFrequency: Frequency | null;
  activeBranchId: string | null;
}

export type NavLevel = "root" | "period" | "frequency" | "branch";

export function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function makeBranch(name: string, frequency: Frequency): Branch {
  const now = new Date().toISOString();
  const b: Branch = {
    id: newId(),
    name,
    frequency,
    createdAt: now,
    updatedAt: now,
    triangle: null,
    paidTriangle: null,
    incurredTriangle: null,
    method: "volume_weighted",
    window: "all",
    excludedCells: [],
    premiums: {},
    lrInputPerOrigin: {},
    basisPerOrigin: {},
    correctionPerOrigin: {},
    cdfInitial: {},
    cdfChoicePerPeriod: {},
    cdfModelPerPeriod: {},
    curveIncludePerPeriod: {},
    uploadSettings: {
      triangleType: "paid",
      originGranularity: "yearly",
      devGranularity: "quarterly",
      cumulative: true,
    },
    history: [
      {
        id: newId(),
        timestamp: now,
        action: "branch_created",
        source: "user",
        details: { name, frequency },
      },
    ],
  };
  const base = makeVersion("Base", snapshotAssumptions(b));
  b.versions = [base];
  b.activeVersionId = base.id;
  return b;
}

/** Eski/versiyonsuz branch'e Base versiyon ekler (idempotent). Migrasyon + güvenlik ağı. */
export function ensureBranchVersions(branch: Branch): Branch {
  if (branch.versions && branch.versions.length > 0) {
    if (branch.activeVersionId && branch.versions.some((v) => v.id === branch.activeVersionId)) {
      return branch;
    }
    return { ...branch, activeVersionId: branch.versions[0].id };
  }
  const base = makeVersion("Base", snapshotAssumptions(branch));
  return { ...branch, versions: [base], activeVersionId: base.id };
}

export function makePeriod(label: string): Period {
  return {
    id: newId(),
    label,
    createdAt: new Date().toISOString(),
    branches: [],
  };
}
