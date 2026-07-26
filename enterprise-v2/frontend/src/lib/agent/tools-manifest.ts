/**
 * AGENT ARAÇ MANİFESTİ — LLM'in kullanabileceği tüm araçların TEK kaynağı.
 *
 * Buradaki liste hem Agent Ayarları ekranındaki "Tools" bölümünü besler (aç/kapa),
 * hem de (motor bağlandığında) LLM'e gönderilecek araç setini belirler.
 *
 * Yeni bir araç eklemek/çıkarmak = burada TEK bir satır. `id`, ilgili modülün
 * frontend bridge action handler'ındaki action tipiyle (ya da backend tool adıyla)
 * eşleşir. `impl` alanı: aracın uçtan uca çalışır olup olmadığını gösterir (Ayarlar
 * ekranında rozet). Böylece hangi fonksiyonun agenta AÇIK olduğu bir bakışta görülür.
 */

export type ToolModule = "reserve" | "cashflow" | "discount" | "data" | "global";

export interface ToolDef {
  /** Backend tool adı / frontend action tipi. Benzersiz. */
  id: string;
  module: ToolModule;
  /** Kısa insan-okur başlık. */
  title: string;
  /** LLM'e ve kullanıcıya gösterilen açıklama. */
  description: string;
  /** Salt-okuma sorgu aracı mı (state okur), yoksa modeli değiştiren aksiyon mu? */
  kind: "read" | "action";
  /** Uçtan uca çalışıyor mu? "ready" = schema+handler mevcut; "planned" = boşlukta (eklenecek). */
  impl: "ready" | "planned";
}

export const TOOL_MODULE_LABELS: Record<ToolModule, string> = {
  reserve: "Reserve",
  cashflow: "Cashflow",
  discount: "Discount",
  data: "Data",
  global: "Global",
};

export const AGENT_TOOLS: ToolDef[] = [
  // ── Reserve ─────────────────────────────────────────────────────────────────
  { id: "list_project", module: "reserve", kind: "read", impl: "ready", title: "List project", description: "Dönemleri ve branşları/modelleri listeler." },
  { id: "select_branch", module: "reserve", kind: "action", impl: "ready", title: "Select branch", description: "Belirli bir dönem/branş modelini aktif eder." },
  { id: "get_branch_state", module: "reserve", kind: "read", impl: "ready", title: "Get branch state", description: "Aktif modelin LDF/CDF/ultimate/IBNR özet durumunu döner." },
  { id: "describe_triangle", module: "reserve", kind: "read", impl: "ready", title: "Describe triangle", description: "Üçgenin boyut/granülarite/origin bilgisini döner." },
  { id: "get_analysis_state", module: "reserve", kind: "read", impl: "ready", title: "Get analysis state", description: "Seçili yöntem, pencere, eleme ve sonuç durumunu döner." },
  { id: "exclude_cells", module: "reserve", kind: "action", impl: "ready", title: "Exclude cells", description: "Belirtilen link-ratio hücrelerini elemeye alır." },
  { id: "include_cells", module: "reserve", kind: "action", impl: "ready", title: "Include cells", description: "Elenen hücreleri geri dahil eder." },
  { id: "clear_exclusions", module: "reserve", kind: "action", impl: "ready", title: "Clear exclusions", description: "Tüm elemeleri temizler." },
  { id: "exclude_outliers", module: "reserve", kind: "action", impl: "ready", title: "Exclude outliers", description: "İstatistiksel aykırı oranları otomatik eler." },
  { id: "set_method", module: "reserve", kind: "action", impl: "ready", title: "Set method", description: "LDF yöntemini değiştirir (volume/simple/geometric)." },
  { id: "set_window", module: "reserve", kind: "action", impl: "ready", title: "Set window", description: "LDF ortalama penceresini değiştirir (Last N / All)." },
  { id: "set_selected_loss_ratio", module: "reserve", kind: "action", impl: "ready", title: "Set selected LR", description: "Bir kaza yılı için seçili hasar/prim oranını girer." },
  { id: "set_selected_loss_ratios", module: "reserve", kind: "action", impl: "ready", title: "Set selected LRs (bulk)", description: "Birden çok kaza yılı için LR girer." },
  { id: "set_premium", module: "reserve", kind: "action", impl: "ready", title: "Set premium", description: "Bir kaza yılı için exposure/prim girer." },
  { id: "set_premiums", module: "reserve", kind: "action", impl: "ready", title: "Set premiums (bulk)", description: "Birden çok exposure girer." },
  { id: "set_basis", module: "reserve", kind: "action", impl: "ready", title: "Set basis", description: "Bir kaza yılı için CL/BF bazını seçer." },
  { id: "set_basis_bulk", module: "reserve", kind: "action", impl: "ready", title: "Set basis (bulk)", description: "Birden çok baz seçer." },
  { id: "set_correction", module: "reserve", kind: "action", impl: "ready", title: "Set correction", description: "Çeyreklik annualization düzeltme katsayısı girer." },
  { id: "set_corrections", module: "reserve", kind: "action", impl: "ready", title: "Set corrections (bulk)", description: "Birden çok düzeltme girer." },
  { id: "set_cdf_user_value", module: "reserve", kind: "action", impl: "ready", title: "Set CDF user value", description: "Curve'de bir gelişim adımı için kullanıcı CDF'i girer." },
  { id: "set_cdf_choice", module: "reserve", kind: "action", impl: "ready", title: "Set CDF choice", description: "Bir adım için initial/user seçimini değiştirir." },
  { id: "set_cdf_choices", module: "reserve", kind: "action", impl: "ready", title: "Set CDF choices (bulk)", description: "Birden çok adım seçimini değiştirir." },
  { id: "reset_curve", module: "reserve", kind: "action", impl: "ready", title: "Reset curve", description: "Curve seçimlerini sıfırlar." },
  { id: "simulate_bf", module: "reserve", kind: "read", impl: "ready", title: "Simulate BF", description: "Bornhuetter-Ferguson senaryosu simüle eder (yazmaz)." },
  { id: "simulate_bf_formula", module: "reserve", kind: "read", impl: "ready", title: "Simulate BF (formula)", description: "Formül tabanlı LR ile BF simüle eder." },
  { id: "run_chain_ladder", module: "reserve", kind: "read", impl: "ready", title: "Run chain ladder", description: "Chain-ladder ultimate/IBNR hesaplar." },
  { id: "simulate_frequency_severity", module: "reserve", kind: "read", impl: "ready", title: "Frequency-severity", description: "Frekans-şiddet (ACPC) yöntemini simüle eder." },
  { id: "get_ilr_triangle", module: "reserve", kind: "read", impl: "ready", title: "Get ILR triangle", description: "Incurred loss ratio üçgenini döner." },
  { id: "get_file_summary", module: "reserve", kind: "read", impl: "ready", title: "Get file summary", description: "Dosya bazlı (claim) analiz özetini döner." },
  // Desktop modelleme aksiyonları (bu oturumda uçtan uca eklendi):
  { id: "set_curve_model", module: "reserve", kind: "action", impl: "ready", title: "Set curve model", description: "Bir adım için curve modelini (Initial/exp/inv-power/power/weibull/user) seçer." },
  { id: "set_curve_include", module: "reserve", kind: "action", impl: "ready", title: "Set curve include", description: "Bir gelişim adımını tail-fit regresyonuna dahil eder/çıkarır." },
  { id: "set_karma_window", module: "reserve", kind: "action", impl: "ready", title: "Set karma window", description: "Adım-başına ayrı LDF penceresi (Karma volume)." },
  { id: "clear_karma", module: "reserve", kind: "action", impl: "ready", title: "Clear karma", description: "Karma volume ayarlarını temizler (global window'a döner)." },
  { id: "average_ldf_pair", module: "reserve", kind: "action", impl: "ready", title: "Average LDF pair", description: "Aynı satırda yan yana iki oranı ortalamayla yumuşatır/geri alır." },
  { id: "create_version", module: "reserve", kind: "action", impl: "ready", title: "Create version", description: "Aktif branşta yeni senaryo/versiyon oluşturur ve ona geçer." },
  { id: "switch_version", module: "reserve", kind: "action", impl: "ready", title: "Switch version", description: "Aktif branşta ada göre bir versiyona geçer." },
  // Henüz eklenmedi (veri/karmaşık akış):
  { id: "load_large", module: "reserve", kind: "action", impl: "planned", title: "Load large loss", description: "Large-loss ayrımını yükler/temizler." },

  // ── Cashflow ────────────────────────────────────────────────────────────────
  { id: "get_cashflow_state", module: "cashflow", kind: "read", impl: "ready", title: "Get cashflow state", description: "Nakit akışı üçgen/pattern durumunu döner." },
  { id: "get_cashflow_ldf_state", module: "cashflow", kind: "read", impl: "ready", title: "Get cashflow LDF state", description: "Nakit akışı LDF/CDF durumunu döner." },
  { id: "exclude_cashflow_cells", module: "cashflow", kind: "action", impl: "ready", title: "Exclude cashflow cells", description: "Nakit akışı LDF hücrelerini eler." },
  { id: "clear_cashflow_exclusions", module: "cashflow", kind: "action", impl: "ready", title: "Clear cashflow exclusions", description: "Nakit akışı elemelerini temizler." },
  { id: "set_cashflow_cdf_user_value", module: "cashflow", kind: "action", impl: "ready", title: "Set cashflow CDF value", description: "Nakit akışı curve kullanıcı CDF'i girer." },
  { id: "set_cashflow_window", module: "cashflow", kind: "action", impl: "ready", title: "Set cashflow window", description: "Nakit akışı LDF penceresi." },
  { id: "set_cashflow_cdf_model", module: "cashflow", kind: "action", impl: "ready", title: "Set cashflow curve model", description: "Nakit akışı curve modeli (adım)." },
  { id: "set_cashflow_cdf_model_bulk", module: "cashflow", kind: "action", impl: "ready", title: "Set cashflow curve model (bulk)", description: "Birden çok adım için curve modeli." },
  { id: "reset_cashflow_curve", module: "cashflow", kind: "action", impl: "ready", title: "Reset cashflow curve", description: "Nakit akışı curve sıfırlar." },
  { id: "get_cashflow_pattern_state", module: "cashflow", kind: "read", impl: "ready", title: "Get cashflow pattern", description: "Aylık/çeyreklik ödeme pattern'ini döner." },

  // ── Discount ────────────────────────────────────────────────────────────────
  { id: "get_discount_state", module: "discount", kind: "read", impl: "ready", title: "Get discount state", description: "İskonto girdileri/branş durumunu döner." },
  { id: "compute_discount", module: "discount", kind: "read", impl: "ready", title: "Compute discount", description: "İskonto edilmiş rezervi hesaplar." },

  // ── Data ────────────────────────────────────────────────────────────────────
  { id: "list_data_periods", module: "data", kind: "read", impl: "ready", title: "List data periods", description: "Veri modülündeki dönem/dataset'leri listeler." },

  // ── Global ──────────────────────────────────────────────────────────────────
  { id: "navigate_to", module: "global", kind: "action", impl: "ready", title: "Navigate", description: "Bir modüle (reserve/cashflow/discount/data) yönlendirir." },
  { id: "roll_forward", module: "reserve", kind: "action", impl: "ready", title: "Roll-forward", description: "Önceki dönemin aynı-isim branşındaki model varsayımlarını (eleme/curve/BF/LR/basis/correction) mevcut branşa taşır." },
  { id: "load_triangle_from_data", module: "reserve", kind: "action", impl: "ready", title: "Load triangle from data", description: "Veri modülündeki hasar kayıtlarından aktif branşın üçgenini kurar (sıfırdan veya önceki dönemden roll-forward)." },
  { id: "ask_user", module: "global", kind: "action", impl: "ready", title: "Ask user", description: "Kullanıcıya chat içi seçilebilir form sunar (modelleme ayarlarını toplamak için)." },
];

/** Varsayılan olarak açık araç id'leri (tümü). */
export function defaultEnabledToolIds(): string[] {
  return AGENT_TOOLS.filter((t) => t.impl === "ready").map((t) => t.id);
}
