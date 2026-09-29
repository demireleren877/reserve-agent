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
  { id: "list_project", module: "reserve", kind: "read", impl: "ready", title: "List project", description: "Lists periods and branches/models." },
  { id: "select_branch", module: "reserve", kind: "action", impl: "ready", title: "Select branch", description: "Activates a model for a specific period and branch." },
  { id: "get_branch_state", module: "reserve", kind: "read", impl: "ready", title: "Get branch state", description: "Returns the active model's LDF/CDF/ultimate/IBNR summary." },
  { id: "describe_triangle", module: "reserve", kind: "read", impl: "ready", title: "Describe triangle", description: "Returns triangle dimensions, granularity, and origin details." },
  { id: "get_analysis_state", module: "reserve", kind: "read", impl: "ready", title: "Get analysis state", description: "Returns the selected method, window, exclusions, and result state." },
  { id: "exclude_cells", module: "reserve", kind: "action", impl: "ready", title: "Exclude cells", description: "Excludes the specified link-ratio cells." },
  { id: "include_cells", module: "reserve", kind: "action", impl: "ready", title: "Include cells", description: "Includes previously excluded cells again." },
  { id: "clear_exclusions", module: "reserve", kind: "action", impl: "ready", title: "Clear exclusions", description: "Clears all exclusions." },
  { id: "exclude_outliers", module: "reserve", kind: "action", impl: "ready", title: "Exclude outliers", description: "Automatically excludes statistical outlier ratios." },
  { id: "set_method", module: "reserve", kind: "action", impl: "ready", title: "Set method", description: "Changes the LDF method (volume/simple/geometric)." },
  { id: "set_window", module: "reserve", kind: "action", impl: "ready", title: "Set window", description: "Changes the LDF averaging window (Last N / All)." },
  { id: "set_selected_loss_ratio", module: "reserve", kind: "action", impl: "ready", title: "Set selected LR", description: "Sets the selected loss ratio for an accident year." },
  { id: "set_selected_loss_ratios", module: "reserve", kind: "action", impl: "ready", title: "Set selected LRs (bulk)", description: "Sets LRs for multiple accident years." },
  { id: "set_premium", module: "reserve", kind: "action", impl: "ready", title: "Set premium", description: "Sets exposure/premium for an accident year." },
  { id: "set_premiums", module: "reserve", kind: "action", impl: "ready", title: "Set premiums (bulk)", description: "Sets exposure for multiple years." },
  { id: "set_basis", module: "reserve", kind: "action", impl: "ready", title: "Set basis", description: "Selects the CL/BF basis for an accident year." },
  { id: "set_basis_bulk", module: "reserve", kind: "action", impl: "ready", title: "Set basis (bulk)", description: "Selects bases for multiple years." },
  { id: "set_correction", module: "reserve", kind: "action", impl: "ready", title: "Set correction", description: "Sets the quarterly annualization correction factor." },
  { id: "set_corrections", module: "reserve", kind: "action", impl: "ready", title: "Set corrections (bulk)", description: "Sets multiple correction factors." },
  { id: "set_cdf_user_value", module: "reserve", kind: "action", impl: "ready", title: "Set CDF user value", description: "Sets a user CDF for a development step in Curve." },
  { id: "set_cdf_choice", module: "reserve", kind: "action", impl: "ready", title: "Set CDF choice", description: "Changes the initial/user choice for a step." },
  { id: "set_cdf_choices", module: "reserve", kind: "action", impl: "ready", title: "Set CDF choices (bulk)", description: "Changes choices for multiple steps." },
  { id: "reset_curve", module: "reserve", kind: "action", impl: "ready", title: "Reset curve", description: "Resets Curve selections." },
  { id: "simulate_bf", module: "reserve", kind: "read", impl: "ready", title: "Simulate BF", description: "Simulates a Bornhuetter-Ferguson scenario (read-only)." },
  { id: "simulate_bf_formula", module: "reserve", kind: "read", impl: "ready", title: "Simulate BF (formula)", description: "Simulates BF using a formula-based LR." },
  { id: "run_chain_ladder", module: "reserve", kind: "read", impl: "ready", title: "Run chain ladder", description: "Chain-ladder ultimate/IBNR hesaplar." },
  { id: "simulate_frequency_severity", module: "reserve", kind: "read", impl: "ready", title: "Frequency-severity", description: "Simulates the frequency-severity (ACPC) method." },
  { id: "get_ilr_triangle", module: "reserve", kind: "read", impl: "ready", title: "Get ILR triangle", description: "Returns the incurred loss-ratio triangle." },
  { id: "get_file_summary", module: "reserve", kind: "read", impl: "ready", title: "Get file summary", description: "Returns a claim-level analysis summary." },
  // Desktop modelleme aksiyonları (bu oturumda uçtan uca eklendi):
  { id: "set_curve_model", module: "reserve", kind: "action", impl: "ready", title: "Set curve model", description: "Selects the curve model (Initial/exp/inv-power/power/weibull/user) for a step." },
  { id: "set_curve_include", module: "reserve", kind: "action", impl: "ready", title: "Set curve include", description: "Includes or removes a development step from tail-fit regression." },
  { id: "set_karma_window", module: "reserve", kind: "action", impl: "ready", title: "Set karma window", description: "Sets a separate LDF window per step (mixed volume)." },
  { id: "clear_karma", module: "reserve", kind: "action", impl: "ready", title: "Clear karma", description: "Clears mixed-volume settings and returns to the global window." },
  { id: "average_ldf_pair", module: "reserve", kind: "action", impl: "ready", title: "Average LDF pair", description: "Smooths or restores two adjacent ratios in the same row by averaging." },
  { id: "create_version", module: "reserve", kind: "action", impl: "ready", title: "Create version", description: "Creates and switches to a new scenario/version on the active branch." },
  { id: "switch_version", module: "reserve", kind: "action", impl: "ready", title: "Switch version", description: "Switches to a version by name on the active branch." },
  // Henüz eklenmedi (veri/karmaşık akış):
  { id: "load_large", module: "reserve", kind: "action", impl: "planned", title: "Load large loss", description: "Loads or clears the large-loss split." },

  // ── Cashflow ────────────────────────────────────────────────────────────────
  { id: "get_cashflow_state", module: "cashflow", kind: "read", impl: "ready", title: "Get cashflow state", description: "Returns the cashflow triangle/pattern state." },
  { id: "get_cashflow_ldf_state", module: "cashflow", kind: "read", impl: "ready", title: "Get cashflow LDF state", description: "Returns the cashflow LDF/CDF state." },
  { id: "exclude_cashflow_cells", module: "cashflow", kind: "action", impl: "ready", title: "Exclude cashflow cells", description: "Excludes cashflow LDF cells." },
  { id: "clear_cashflow_exclusions", module: "cashflow", kind: "action", impl: "ready", title: "Clear cashflow exclusions", description: "Clears cashflow exclusions." },
  { id: "set_cashflow_cdf_user_value", module: "cashflow", kind: "action", impl: "ready", title: "Set cashflow CDF value", description: "Sets a user CDF value for a cashflow curve step." },
  { id: "set_cashflow_window", module: "cashflow", kind: "action", impl: "ready", title: "Set cashflow window", description: "Sets the cashflow LDF window." },
  { id: "set_cashflow_cdf_model", module: "cashflow", kind: "action", impl: "ready", title: "Set cashflow curve model", description: "Sets the cashflow curve model for a step." },
  { id: "set_cashflow_cdf_model_bulk", module: "cashflow", kind: "action", impl: "ready", title: "Set cashflow curve model (bulk)", description: "Sets curve models for multiple steps." },
  { id: "reset_cashflow_curve", module: "cashflow", kind: "action", impl: "ready", title: "Reset cashflow curve", description: "Resets the cashflow curve." },
  { id: "get_cashflow_pattern_state", module: "cashflow", kind: "read", impl: "ready", title: "Get cashflow pattern", description: "Returns the monthly/quarterly payment pattern." },

  // ── Discount ────────────────────────────────────────────────────────────────
  { id: "get_discount_state", module: "discount", kind: "read", impl: "ready", title: "Get discount state", description: "Returns discount inputs and branch state." },
  { id: "compute_discount", module: "discount", kind: "read", impl: "ready", title: "Compute discount", description: "Calculates the discounted reserve." },

  // ── Data ────────────────────────────────────────────────────────────────────
  { id: "list_data_periods", module: "data", kind: "read", impl: "ready", title: "List data periods", description: "Lists periods and datasets in the Data module." },

  // ── Global ──────────────────────────────────────────────────────────────────
  { id: "navigate_to", module: "global", kind: "action", impl: "ready", title: "Navigate", description: "Navigates to a module (reserve/cashflow/discount/data)." },
  { id: "roll_forward", module: "reserve", kind: "action", impl: "ready", title: "Roll-forward", description: "Carries model assumptions (exclusions/curve/BF/LR/basis/correction) from the prior same-name branch into the current branch." },
  { id: "load_triangle_from_data", module: "reserve", kind: "action", impl: "ready", title: "Load triangle from data", description: "Builds the active branch triangle from claim records (from scratch or by rolling forward the prior period)." },
  { id: "ask_user", module: "global", kind: "action", impl: "ready", title: "Ask user", description: "Presents a selectable in-chat form to collect modelling settings." },
];

/** Varsayılan olarak açık araç id'leri (tümü). */
export function defaultEnabledToolIds(): string[] {
  return AGENT_TOOLS.filter((t) => t.impl === "ready").map((t) => t.id);
}
