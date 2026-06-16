"""Agent tool'ları.

Read (durum sorgulama):
    list_project, get_branch_state, describe_triangle, get_analysis_state,
    get_ilr_triangle, get_file_summary, get_cashflow_state,
    get_cashflow_ldf_state, get_cashflow_pattern_state, get_discount_state,
    list_data_periods

Scenario (durumu değiştirmeden hipotetik hesap):
    simulate_bf, simulate_bf_formula, run_chain_ladder,
    simulate_frequency_severity, compute_discount

Write (UI durumunu güncelle — kullanıcı onayı İSTENMEZ):
    select_branch, exclude_cells, include_cells, clear_exclusions,
    exclude_outliers, set_window, set_selected_loss_ratio(s), set_premium(s),
    set_basis(_bulk), set_correction(s), set_cdf_user_value, set_cdf_choice(s),
    reset_curve, cashflow karşılıkları (set_cashflow_*, exclude_cashflow_cells,
    clear_cashflow_exclusions, reset_cashflow_curve), navigate_to

Write tool'ları çıktılarında "_action" anahtarı içerir — agent loop bunu
ChatResponse.actions listesine ekler, frontend otomatik uygular.
"""

from __future__ import annotations

from typing import Any

from app.core.chain_ladder import run_chain_ladder
from app.core.frequency_severity import run_frequency_severity
from app.core.ldf import LDFMethod
from app.core.triangle import Triangle

TOOL_SCHEMAS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "list_project",
            "description": (
                "Tüm proje hiyerarşisini döner: dönemler → branşlar → her branş "
                "için temel bilgiler (id, isim, frekans, has_triangle, totals). "
                "Hangi branşlar var sorusunda ÖNCE bunu çağır. Aktif branş "
                "is_active=true ile işaretlidir."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "select_branch",
            "description": (
                "UI'da aktif branşı değiştir. Kullanıcı 'X branşına geç' "
                "derse veya yazma operasyonu için belirli bir branş "
                "hedeflemen gerekirse kullan. period_id opsiyoneldir; verilirse "
                "önce o döneme geçilir."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "branch_id": {"type": "string"},
                    "period_id": {"type": "string"},
                },
                "required": ["branch_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_branch_state",
            "description": (
                "REZERV modülü — belirli bir branşın INCURRED üçgeni analizi: per-origin "
                "satırlar (latest, exposure, correction, cdf, cl_ult, bf_ult, basis, "
                "selected_ult, ibnr, ulr), totals, selected_ldfs, effective_cdfs. "
                "SADECE rezerv soruları için kullan. Nakit akışı LDF/CDF soruları için "
                "get_cashflow_ldf_state kullan — o PAID üçgeninden hesaplar."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "branch_id": {"type": "string"},
                    "period_id": {"type": "string"},
                },
                "required": ["branch_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "describe_triangle",
            "description": "Aktif branşın üçgen boyutu + origin + gelişim dönemleri + son diagonal.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_analysis_state",
            "description": (
                "REZERV modülü — INCURRED üçgeninden hesaplanan LDF/CDF + her origin için "
                "latest/premium/pattern_ratio/selected_lr/cl_ultimate/bf_ultimate/basis/"
                "selected_ultimate/ibnr/ulr. SADECE rezerv soruları için çağır. "
                "Nakit akışı LDF/CDF soruları için get_cashflow_ldf_state kullan — "
                "o PAID üçgeninden hesaplar, değerler tamamen farklı olabilir."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "exclude_cells",
            "description": "(origin, step) hücrelerini LDF hesabından çıkar.",
            "parameters": {
                "type": "object",
                "properties": {
                    "cells": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "origin": {"type": "string"},
                                "step": {"type": "integer"},
                            },
                            "required": ["origin", "step"],
                        },
                    },
                },
                "required": ["cells"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "include_cells",
            "description": "Önceden elenmiş hücreleri geri ekle.",
            "parameters": {
                "type": "object",
                "properties": {
                    "cells": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "origin": {"type": "string"},
                                "step": {"type": "integer"},
                            },
                            "required": ["origin", "step"],
                        },
                    },
                },
                "required": ["cells"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "clear_exclusions",
            "description": "Tüm hücre elemelerini kaldır.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "exclude_outliers",
            "description": (
                "Kolon bazlı aykırı LDF'leri toplu eler. threshold_pct baseline'dan "
                "sapma yüzdesi, direction high/low/both, baseline mean/median."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "threshold_pct": {"type": "number"},
                    "direction": {"type": "string", "enum": ["high", "low", "both"]},
                    "baseline": {"type": "string", "enum": ["mean", "median"]},
                },
                "required": ["threshold_pct"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "set_window",
            "description": (
                'LDF "volume" (eski adıyla window) değiştir — son N origin'
                ' bazlı agregasyon. "4" | "5" | "7" | "all". Kullanıcı '
                '"volume" derse bu tool\'u kullan.'
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "window": {"type": "string", "enum": ["4", "5", "7", "all"]},
                },
                "required": ["window"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "set_selected_loss_ratio",
            "description": (
                "BF sekmesinde bir origin için Selected Loss Ratio ayarla. "
                "formula: sayı (0.75, 75%) veya formül — avg(2020:2022), "
                "vw(2020:2024), sum_cl(2020:2022)/sum_exp(2020:2022), "
                "avg(2020:2022)*1.1 gibi. Boş string = varsayılana dön. "
                "Bu değişiklik hem BF hem Ultimate/IBNR sekmelerini etkiler."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "origin": {"type": "string"},
                    "formula": {"type": "string"},
                },
                "required": ["origin", "formula"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "set_selected_loss_ratios",
            "description": "set_selected_loss_ratio'nun toplu versiyonu.",
            "parameters": {
                "type": "object",
                "properties": {
                    "items": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "origin": {"type": "string"},
                                "formula": {"type": "string"},
                            },
                            "required": ["origin", "formula"],
                        },
                    },
                },
                "required": ["items"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "set_premium",
            "description": "Bir origin için Exposure (kazanılan prim) ayarla.",
            "parameters": {
                "type": "object",
                "properties": {
                    "origin": {"type": "string"},
                    "value": {"type": "number"},
                },
                "required": ["origin", "value"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "set_premiums",
            "description": "set_premium toplu versiyonu.",
            "parameters": {
                "type": "object",
                "properties": {
                    "items": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "origin": {"type": "string"},
                                "value": {"type": "number"},
                            },
                            "required": ["origin", "value"],
                        },
                    },
                },
                "required": ["items"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "set_basis",
            "description": (
                "Ultimate/IBNR sekmesinde bir origin için temel seç: 'cl' veya 'bf'. "
                "Bu, o origin'in IBNR hesabında hangi Ultimate'ın kullanılacağını belirler."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "origin": {"type": "string"},
                    "basis": {"type": "string", "enum": ["cl", "bf"]},
                },
                "required": ["origin", "basis"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "set_basis_bulk",
            "description": "Birden fazla origin için basis değiştir.",
            "parameters": {
                "type": "object",
                "properties": {
                    "items": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "origin": {"type": "string"},
                                "basis": {"type": "string", "enum": ["cl", "bf"]},
                            },
                            "required": ["origin", "basis"],
                        },
                    },
                },
                "required": ["items"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "set_correction",
            "description": (
                "BF correction katsayısı (annualization). Çeyreklik modelde "
                "kaza yılı tamamlanmamış origin için (örn. 2026Q1 sadece görünüyorsa "
                "k=4; Q1+Q2 için 2; Q1-Q3 için 4/3 ≈ 1.333). value=null veya 1 → "
                "düzeltme yok. Exposure k ile çarpılır, BF Ult yıllık hesaplanır, "
                "sonra k'ya bölünerek kısmi döneme indirilir."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "origin": {"type": "string"},
                    "value": {
                        "type": ["number", "null"],
                        "description": "k katsayısı; null veya 1 = düzeltme yok",
                    },
                },
                "required": ["origin", "value"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "set_corrections",
            "description": "set_correction toplu versiyonu.",
            "parameters": {
                "type": "object",
                "properties": {
                    "items": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "origin": {"type": "string"},
                                "value": {"type": ["number", "null"]},
                            },
                            "required": ["origin", "value"],
                        },
                    },
                },
                "required": ["items"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "set_cdf_user_value",
            "description": (
                "Curve sekmesinde bir development period için User Value (manuel CDF) "
                "yaz. Tail truncation için kullan: ileri yaşları 1'e çekersin → "
                "downstream cascade hesaplar (önceki yaşlarda LDF zinciri user "
                "anchor'a kadar uygulanır). Bu tool YALNIZCA değeri yazar; aktif "
                "etmek için ayrıca set_cdf_choice çağır."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "dev_period": {"type": "string"},
                    "value": {"type": "number"},
                },
                "required": ["dev_period", "value"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "set_cdf_choice",
            "description": (
                "Curve sekmesinde bir period için aktif CDF seçimi. 'initial' = "
                "Selected CDF (LDF tab'dan türetilmiş, cascade uygulanmış). 'user' = "
                "User Value (set_cdf_user_value ile yazılan)."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "dev_period": {"type": "string"},
                    "choice": {"type": "string", "enum": ["initial", "user"]},
                },
                "required": ["dev_period", "choice"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "set_cdf_choices",
            "description": "set_cdf_choice toplu versiyonu.",
            "parameters": {
                "type": "object",
                "properties": {
                    "items": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "dev_period": {"type": "string"},
                                "choice": {
                                    "type": "string",
                                    "enum": ["initial", "user"],
                                },
                            },
                            "required": ["dev_period", "choice"],
                        },
                    },
                },
                "required": ["items"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "reset_curve",
            "description": "Curve sekmesindeki tüm User Value ve choice override'ları temizle.",
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "simulate_bf",
            "description": (
                "HİPOTETİK BF senaryosu — durumu DEĞİŞTİRMEZ. Belirli origin ve "
                "loss_ratio için BF Ultimate, IBNR, ve mevcut seçili Ultimate'tan "
                "farkı hesaplar. 'Eğer 2024 BF oranı %400 olsa ne olur' gibi "
                "sorularda KULLAN. loss_ratio: 0.7 = %70, 4.0 = %400. "
                "Formül (vw, avg vb.) kullanmak istersen simulate_bf_formula kullan. "
                "branch_id verilirse aktif branş olmasa bile o branş üzerinde çalışır — "
                "kullanıcı başka bir branş adı söylediğinde ÖNCE list_project ile branch_id "
                "bul, SONRA bu parametreyi ver. UI navigasyon gerektirmez."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "origin": {"type": "string"},
                    "loss_ratio": {"type": "number"},
                    "branch_id": {
                        "type": "string",
                        "description": (
                            "Opsiyonel. Aktif olmayan bir branş için simülasyon. "
                            "list_project'ten alınan branch_id değeri."
                        ),
                    },
                },
                "required": ["origin", "loss_ratio"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "simulate_bf_formula",
            "description": (
                "HİPOTETİK BF senaryosu — formül bazlı, durumu DEĞİŞTİRMEZ. "
                "formula olarak 'vw(2021:2023)', 'avg(2020:2022)', '0.75' veya "
                "'75%' gibi LR formüllerini destekler. Birden fazla origin için "
                "origins listesi ver (ör. BF basis'teki 3 origin için toplam etki). "
                "Hem formül değerlendirmesini hem simulate_bf'yi tek seferde yapar. "
                "'vw(2021:2023) uygulasak IBNR etkisi ne olur' gibi sorularda kullan."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "formula": {
                        "type": "string",
                        "description": (
                            "LR formülü: 'vw(2021:2023)', 'avg(2020:2022)', "
                            "'0.75', '75%', 'sum_cl(2020:2022)/sum_exp(2020:2022)'"
                        ),
                    },
                    "origin": {
                        "type": "string",
                        "description": "Tek origin için (origins verilmemişse).",
                    },
                    "origins": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": (
                            "Birden fazla origin (ör. ['2024','2025','2026']). "
                            "Verilirse her biri için ayrı hesap + toplam delta döner."
                        ),
                    },
                    "branch_id": {
                        "type": "string",
                        "description": (
                            "Opsiyonel. Aktif olmayan bir branş için simülasyon. "
                            "list_project'ten alınan branch_id değeri."
                        ),
                    },
                },
                "required": ["formula"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "run_chain_ladder",
            "description": (
                "SENARYO: CL alternatif parametrelerle. Mevcut seçimi değiştirmez."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "method": {"type": "string", "enum": [m.value for m in LDFMethod]},
                    "n_years": {"type": "integer", "minimum": 1},
                    "excluded_origins": {"type": "array", "items": {"type": "string"}},
                    "ldf_override": {"type": "array", "items": {"type": "number"}},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "simulate_frequency_severity",
            "description": (
                "SENARYO — Frekans-Şiddet (Average Cost per Claim) yöntemiyle ult hasar "
                "ve IBNR. Durumu DEĞİŞTİRMEZ. Adet üçgeni (kümülatif ihbar adedi) → CL → "
                "ult adet; şiddet üçgeni (tutar/adet) → CL → ult şiddet; ult hasar = "
                "ult adet × ult şiddet. Saf CL'den FARKLI sonuç verir — frekans ve şiddet "
                "gelişimini ayrıştırır, saf CL için makullük kontrolüdür. Aktif branşın "
                "incurred üçgeni + adet üçgeni kullanılır. Adet üçgeni yalnızca dosya "
                "bazlı (DOSYA_NO) hasar verisinden yüklenen branşlarda mevcuttur; yoksa "
                "hata döner. 'Frekans-şiddet ile IBNR ne', 'ortalama hasar maliyeti "
                "yöntemi', 'adet ve şiddeti ayrı geliştir' sorularında kullan."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "method": {
                        "type": "string",
                        "enum": [m.value for m in LDFMethod],
                        "description": "Gelişim faktörü yöntemi (varsayılan volume_weighted).",
                    },
                    "n_years": {
                        "type": "integer",
                        "minimum": 1,
                        "description": "Son N origin ile sınırla (volume seçimi).",
                    },
                    "excluded_origins": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Hesaptan dışlanacak kaza yılları.",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_ilr_triangle",
            "description": (
                "Aktif branş için ILR (Incurred Loss Ratio) üçgeni. "
                "Her (origin, gelişim adımı) hücresinde hasar / (prim × düzeltme) "
                "değerini döner. Prim girilmemiş originler null döner. "
                "'ILR ne?', 'loss ratio üçgeni', '2024 kaza yılı loss ratio' "
                "sorularında kullan."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_file_summary",
            "description": (
                "Dosya (DOSYA_NO) kırılımlı veri özeti. Son diagonal için: toplam, "
                "dosya sayısı, kaza yılı bazlı top-1/top-3 konsantrasyon ve tüm "
                "portföydeki en büyük tekil dosyalar (largest_files: origin, "
                "dosya_no, tutar, origin payı). 'Kaç dosya var?', 'en büyük dosya "
                "hangisi?', 'hangi dosyalar dikkat çekiyor?', 'konsantrasyon?' "
                "sorularında kullan. Boş dönerse sütun adı sorunu DEĞİLDİR — hata "
                "mesajındaki gerçek nedeni (hazır üçgen yüklenmiş olması) aktar."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    # ─── Cashflow tools ───────────────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "get_cashflow_state",
            "description": (
                "Tüm branşların cashflow özetini döner: has_paid_triangle, n_origins, "
                "n_developments, ldf_window, excluded_cells_count, cdf_model_overrides, "
                "has_pattern, pattern_origin_count. Hangi branşlarda cashflow mevcut, "
                "LDF penceresi ne sorularında kullan. Detaylı LDF/CDF için "
                "get_cashflow_ldf_state kullan."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_cashflow_ldf_state",
            "description": (
                "Nakit akışı modülüne ait PAID üçgeninden hesaplanan LDF/CDF durumunu döner. "
                "Rezerv modülündeki get_branch_state'ten FARKLIDIR — o incurred üçgeni kullanır, "
                "bu PAID üçgeni kullanır. Değerler farklı olabilir. "
                "Her gelişim dönemi için: selected_ldf, initial_cdf, effective_cdf, model, user_value. "
                "Ayrıca ldf_window, excluded_cells, selected_ldfs dizisi, effective_cdfs dizisi. "
                "Nakit akışı LDF/CDF sorusu geldiğinde get_branch_state DEĞİL BU TOOL'U kullan. "
                "branch_id verilmezse aktif branş varsayılır."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "branch_id": {"type": "string", "description": "Opsiyonel hedef branş."},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "exclude_cashflow_cells",
            "description": (
                "Cashflow LDF hesabından (origin, step) hücrelerini çıkar. "
                "Rezerv modülündeki exclude_cells ile aynı mantık ama cashflow paid "
                "üçgeni için. step 0-index'li: step=0 → 1.→2. gelişim dönemi geçişi. "
                "branch_id verilmezse aktif branşa uygulanır."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "cells": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "origin": {"type": "string"},
                                "step": {"type": "integer"},
                            },
                            "required": ["origin", "step"],
                        },
                    },
                    "branch_id": {"type": "string", "description": "Opsiyonel hedef branş."},
                },
                "required": ["cells"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "clear_cashflow_exclusions",
            "description": (
                "Cashflow LDF'indeki tüm hücre elemelerini kaldır. "
                "branch_id verilmezse aktif branşa uygulanır."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "branch_id": {"type": "string", "description": "Opsiyonel hedef branş."},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "set_cashflow_cdf_user_value",
            "description": (
                "Cashflow Curve sekmesinde bir development period için User Value (manuel CDF) "
                "yaz ve model=6 (User Value) olarak aktifleştir. "
                "branch_id verilmezse aktif branşa uygulanır."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "dev_period": {"type": "string", "description": "Gelişim dönemi (triangle'daki değer)."},
                    "value": {"type": "number", "description": "CDF değeri (örn. 1.05)."},
                    "branch_id": {"type": "string", "description": "Opsiyonel hedef branş."},
                },
                "required": ["dev_period", "value"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "set_cashflow_window",
            "description": (
                "Cashflow modülündeki LDF penceresini değiştir (rezerv LDF'inden bağımsız). "
                "'4' | '5' | '7' | 'all'. branch_id verilmezse aktif branşa uygulanır."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "window": {"type": "string", "enum": ["4", "5", "7", "all"]},
                    "branch_id": {"type": "string", "description": "Opsiyonel hedef branş."},
                },
                "required": ["window"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "set_cashflow_cdf_model",
            "description": (
                "Cashflow Curve sekmesinde bir gelişim dönemi için model seç. "
                "model: 1=Initial, 2=Exp Decay, 3=Inv Power, 4=Power, 5=Weibull, 6=User Value. "
                "branch_id verilmezse aktif branşa uygulanır."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "dev_period": {"type": "string"},
                    "model": {"type": "integer", "enum": [1, 2, 3, 4, 5, 6]},
                    "branch_id": {"type": "string", "description": "Opsiyonel hedef branş."},
                },
                "required": ["dev_period", "model"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "set_cashflow_cdf_model_bulk",
            "description": "set_cashflow_cdf_model toplu versiyonu.",
            "parameters": {
                "type": "object",
                "properties": {
                    "items": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "dev_period": {"type": "string"},
                                "model": {"type": "integer", "enum": [1, 2, 3, 4, 5, 6]},
                            },
                            "required": ["dev_period", "model"],
                        },
                    },
                    "branch_id": {"type": "string", "description": "Opsiyonel hedef branş."},
                },
                "required": ["items"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "reset_cashflow_curve",
            "description": (
                "Cashflow curve sekmesindeki tüm model/include/user value seçimlerini temizle. "
                "branch_id verilmezse aktif branşa uygulanır."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "branch_id": {"type": "string", "description": "Opsiyonel hedef branş."},
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_cashflow_pattern_state",
            "description": (
                "Nakit akışı pattern verilerini döner. Varsayılan mode='quarterly' — "
                "CF Pattern sekmesindeki çeyreklik dağılımı (period, weight) döner. "
                "mode='monthly' ile 180 aylık dağılıma geçilebilir. "
                "origin belirtilirse o kaza yılının detaylı ağırlık dizisi, "
                "belirtilmezse tüm origin'ler için özet döner. "
                "Pattern Nakit Akışı sayfasında branş açılınca otomatik hesaplanır. "
                "branch_id verilmezse aktif branş varsayılır."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "origin": {"type": "string", "description": "Kaza yılı (ör. '2024'). Boş bırakılırsa tüm origin'ler özet."},
                    "branch_id": {"type": "string", "description": "Opsiyonel hedef branş."},
                    "mode": {"type": "string", "enum": ["quarterly", "monthly"], "description": "quarterly (varsayılan) = CF Pattern sekmesi, monthly = 180 aylık Aylık Pattern."},
                },
                "required": [],
            },
        },
    },
    # ─── Discount tools ───────────────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "get_discount_state",
            "description": (
                "Tüm branşların iskonto özetini döner: Unpaid Liability, "
                "SEDDK %30 faiz ile İskontolu Unpaid, iskonto tutarı ve duration. "
                "Cashflow pattern hesaplanmamış branşlarda null döner."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "compute_discount",
            "description": (
                "Belirli bir branş için standart-bazlı iskonto hesapla. "
                "standard='ifrs4' (varsayılan): SEDDK düzenleyici iskonto — sabit "
                "faiz (2025: %30), eğri veya nominal (rate_mode='none'); Risk "
                "Adjustment yok. standard='ifrs17': bottom-up eğri (risk-free + "
                "illiquidity_premium_bps) ile BEL + Risk Adjustment = LIC. "
                "RA yöntemi: 'pct_of_bel' (BEL × yüzde, varsayılan %6) veya "
                "'cost_of_capital' (CoC × sermaye oranı × yükümlülük süresi). "
                "Sonuç: kaza yılı bazlı Unpaid, BEL/İskontolu Unpaid, RA, LIC, "
                "iskonto%, duration. Cashflow pattern eksikse hata döner. "
                "Parametre verilmezse standardın varsayılanları kullanılır."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "branch_id": {
                        "type": "string",
                        "description": "Hedef branş. Verilmezse aktif branş.",
                    },
                    "standard": {
                        "type": "string",
                        "enum": ["ifrs4", "ifrs17"],
                        "description": "Raporlama standardı. Varsayılan 'ifrs4'.",
                    },
                    "rate_mode": {
                        "type": "string",
                        "enum": ["none", "flat", "curve"],
                        "description": (
                            "'flat' = sabit faiz, 'curve' = vade yapısı, 'none' = "
                            "iskontosuz (sadece ifrs4). Verilmezse: ifrs4→flat, "
                            "ifrs17→curve (varsayılan risk-free eğri)."
                        ),
                    },
                    "flat_rate": {
                        "type": "number",
                        "description": "Yıllık faiz oranı (0.30 = %30). rate_mode='flat' için.",
                    },
                    "curve_nodes": {
                        "type": "array",
                        "description": (
                            "Eğri noktaları. rate_mode='curve' için. Verilmezse "
                            "varsayılan TL risk-free eğri kullanılır."
                        ),
                        "items": {
                            "type": "object",
                            "properties": {
                                "month": {"type": "integer"},
                                "rate": {"type": "number", "description": "Yıllık spot oran (0.25 = %25)."},
                            },
                            "required": ["month", "rate"],
                        },
                    },
                    "illiquidity_premium_bps": {
                        "type": "number",
                        "description": (
                            "IFRS 17 illikidite primi (baz puan), eğrinin üzerine "
                            "eklenir. Varsayılan 100."
                        ),
                    },
                    "risk_adjustment_method": {
                        "type": "string",
                        "enum": ["none", "pct_of_bel", "cost_of_capital"],
                        "description": "IFRS 17 RA yöntemi. Varsayılan 'pct_of_bel'.",
                    },
                    "risk_adjustment_pct": {
                        "type": "number",
                        "description": "RA = BEL × bu oran (0.06 = %6). pct_of_bel için.",
                    },
                    "coc_rate": {
                        "type": "number",
                        "description": "Cost of Capital yıllık oranı (0.06 = %6).",
                    },
                    "capital_ratio": {
                        "type": "number",
                        "description": "SCR proxy oranı: kalan yükümlülük × bu oran (0.10 = %10).",
                    },
                },
                "required": [],
            },
        },
    },
    # ─── Data tools ───────────────────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "list_data_periods",
            "description": (
                "Veri modülündeki tüm dönemleri ve dataset meta bilgilerini listele. "
                "Hangi dönemlerde hangi veriler yüklü (hasar/prim/üçgen), kayıt sayıları, "
                "branş listeleri, tarih aralıkları. Veri modülüyle ilgili her soruda kullan."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
    # ─── Navigation tools ─────────────────────────────────────────────────────
    {
        "type": "function",
        "function": {
            "name": "navigate_to",
            "description": (
                "Kullanıcıyı belirli bir modüle yönlendir. Kullanıcı 'iskonto sayfasına git', "
                "'nakit akışını aç' gibi navigasyon isteğinde bulunursa kullan. "
                "module: 'reserve' | 'cashflow' | 'discount' | 'data' | 'home'."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "module": {
                        "type": "string",
                        "enum": ["reserve", "cashflow", "discount", "data", "home"],
                    },
                },
                "required": ["module"],
            },
        },
    },
]


def get_tool_schema(name: str) -> dict[str, Any]:
    for s in TOOL_SCHEMAS:
        if s["function"]["name"] == name:
            return s
    raise KeyError(f"Tool bulunamadı: {name}")


_TRIANGLE_REQUIRED = {
    "describe_triangle",
    "exclude_cells",
    "include_cells",
    "exclude_outliers",
    "run_chain_ladder",
    "get_ilr_triangle",
    "simulate_frequency_severity",
}

# Aktif branş üzerine yazan rezerv tool'ları. Aktif branş yokken frontend bu
# action'ları sessizce düşürür (updateActiveBranch no-op) — agent'ın "yaptım"
# deyip hiçbir şeyin değişmemesi yerine burada net hata dönüyoruz.
_ACTIVE_BRANCH_WRITE = {
    "clear_exclusions",
    "set_window",
    "set_selected_loss_ratio",
    "set_selected_loss_ratios",
    "set_premium",
    "set_premiums",
    "set_basis",
    "set_basis_bulk",
    "set_correction",
    "set_corrections",
    "set_cdf_user_value",
    "set_cdf_choice",
    "set_cdf_choices",
    "reset_curve",
}


def dispatch_tool(
    name: str,
    args: dict[str, Any],
    *,
    triangle: Triangle | None = None,
    session_state: dict[str, Any] | None = None,
    count_triangle: Triangle | None = None,
) -> dict[str, Any]:
    # Triangle gerektirenler için aktif branş kontrolü
    if name in _TRIANGLE_REQUIRED and triangle is None:
        return {
            "error": (
                "Bu araç aktif bir branş gerektirir. Önce list_project ile "
                "mevcut branşları gör, sonra select_branch(branch_id) ile birini "
                "aktifleştir."
            )
        }

    # Yazma tool'ları aktif branş gerektirir (triangle yüklüyse aktif branş var
    # demektir; session_state.active da güvenilir göstergedir).
    if (
        name in _ACTIVE_BRANCH_WRITE
        and triangle is None
        and not (session_state or {}).get("active")
    ):
        return {
            "error": (
                "Aktif branş yok — bu yazma aracı aktif branş üzerinde çalışır. "
                "Önce select_branch(branch_id) ile bir branş aç (branşları "
                "list_project ile görebilirsin), sonra tekrar dene."
            )
        }

    if name == "list_project":
        return _list_project(session_state)
    if name == "select_branch":
        return _select_branch(args)
    if name == "get_branch_state":
        return _get_branch_state(session_state, args)
    if name == "describe_triangle":
        return _describe_triangle(triangle)  # type: ignore[arg-type]
    if name == "get_analysis_state":
        return _get_analysis_state(triangle, session_state)
    if name == "exclude_cells":
        return _exclude_cells(triangle, args, additive=True)  # type: ignore[arg-type]
    if name == "include_cells":
        return _exclude_cells(triangle, args, additive=False)  # type: ignore[arg-type]
    if name == "clear_exclusions":
        return {
            "cleared": True,
            "_action": {"type": "clear_exclusions", "payload": {}},
        }
    if name == "exclude_outliers":
        return _exclude_outliers(triangle, session_state, args)  # type: ignore[arg-type]
    if name == "set_window":
        window = str(args.get("window", "all"))
        if window not in {"4", "5", "7", "all"}:
            return {"error": f"Geçersiz window: {window}"}
        return {
            "window": window,
            "_action": {"type": "set_window", "payload": {"window": window}},
        }
    if name == "set_selected_loss_ratio":
        origin = str(args.get("origin", ""))
        formula = str(args.get("formula", ""))
        return {
            "origin": origin,
            "formula": formula,
            "_action": {
                "type": "set_selected_loss_ratio",
                "payload": {"origin": origin, "formula": formula},
            },
        }
    if name == "set_selected_loss_ratios":
        items = args.get("items", []) or []
        clean = [
            {"origin": str(i.get("origin", "")), "formula": str(i.get("formula", ""))}
            for i in items
            if i.get("origin")
        ]
        return {
            "applied": clean,
            "count": len(clean),
            "_action": {
                "type": "set_selected_loss_ratios",
                "payload": {"items": clean},
            },
        }
    if name == "set_premium":
        origin = str(args.get("origin", ""))
        try:
            value = float(args.get("value", 0))
        except (TypeError, ValueError):
            return {"error": "Geçersiz value"}
        return {
            "origin": origin,
            "value": value,
            "_action": {
                "type": "set_premium",
                "payload": {"origin": origin, "value": value},
            },
        }
    if name == "set_premiums":
        items = args.get("items", []) or []
        clean: list[dict[str, Any]] = []
        for i in items:
            o = str(i.get("origin", ""))
            try:
                v = float(i.get("value", 0))
            except (TypeError, ValueError):
                continue
            if o:
                clean.append({"origin": o, "value": v})
        return {
            "applied": clean,
            "count": len(clean),
            "_action": {"type": "set_premiums", "payload": {"items": clean}},
        }
    if name == "set_basis":
        origin = str(args.get("origin", ""))
        basis = str(args.get("basis", ""))
        if basis not in {"cl", "bf"}:
            return {"error": f"Geçersiz basis: {basis}"}
        return {
            "origin": origin,
            "basis": basis,
            "_action": {
                "type": "set_basis",
                "payload": {"origin": origin, "basis": basis},
            },
        }
    if name == "set_basis_bulk":
        items = args.get("items", []) or []
        clean: list[dict[str, Any]] = []
        for i in items:
            o = str(i.get("origin", ""))
            b = str(i.get("basis", ""))
            if o and b in {"cl", "bf"}:
                clean.append({"origin": o, "basis": b})
        return {
            "applied": clean,
            "count": len(clean),
            "_action": {"type": "set_basis_bulk", "payload": {"items": clean}},
        }
    if name == "set_correction":
        origin = str(args.get("origin", ""))
        raw = args.get("value")
        try:
            value = None if raw is None else float(raw)
        except (TypeError, ValueError):
            return {"error": "Geçersiz value"}
        return {
            "origin": origin,
            "value": value,
            "_action": {
                "type": "set_correction",
                "payload": {"origin": origin, "value": value},
            },
        }
    if name == "set_corrections":
        items = args.get("items", []) or []
        clean: list[dict[str, Any]] = []
        for i in items:
            o = str(i.get("origin", ""))
            raw = i.get("value")
            try:
                v = None if raw is None else float(raw)
            except (TypeError, ValueError):
                continue
            if o:
                clean.append({"origin": o, "value": v})
        return {
            "applied": clean,
            "count": len(clean),
            "_action": {"type": "set_corrections", "payload": {"items": clean}},
        }
    if name == "set_cdf_user_value":
        dev = str(args.get("dev_period", ""))
        try:
            v = float(args.get("value", 1))
        except (TypeError, ValueError):
            return {"error": "Geçersiz value"}
        return {
            "dev_period": dev,
            "value": v,
            "_action": {
                "type": "set_cdf_user_value",
                "payload": {"dev_period": dev, "value": v},
            },
        }
    if name == "set_cdf_choice":
        dev = str(args.get("dev_period", ""))
        choice = str(args.get("choice", ""))
        if choice not in {"initial", "user"}:
            return {"error": f"Geçersiz choice: {choice}"}
        return {
            "dev_period": dev,
            "choice": choice,
            "_action": {
                "type": "set_cdf_choice",
                "payload": {"dev_period": dev, "choice": choice},
            },
        }
    if name == "set_cdf_choices":
        items = args.get("items", []) or []
        clean = [
            {"dev_period": str(i.get("dev_period", "")), "choice": str(i.get("choice", ""))}
            for i in items
            if i.get("dev_period") and i.get("choice") in {"initial", "user"}
        ]
        return {
            "applied": clean,
            "count": len(clean),
            "_action": {"type": "set_cdf_choices", "payload": {"items": clean}},
        }
    if name == "reset_curve":
        return {"cleared": True, "_action": {"type": "reset_curve", "payload": {}}}
    if name == "simulate_bf":
        return _simulate_bf(session_state, args)
    if name == "simulate_bf_formula":
        return _simulate_bf_formula(session_state, args)
    if name == "run_chain_ladder":
        return _run_chain_ladder(triangle, args)
    if name == "simulate_frequency_severity":
        return _simulate_frequency_severity(triangle, count_triangle, args)  # type: ignore[arg-type]
    if name == "get_ilr_triangle":
        return _get_ilr_triangle(triangle, session_state)  # type: ignore[arg-type]
    if name == "get_file_summary":
        return _get_file_summary(session_state)
    # ─── Cashflow ─────────────────────────────────────────────────────────────
    if name == "get_cashflow_state":
        return _get_cashflow_state(session_state)
    if name == "get_cashflow_ldf_state":
        return _get_cashflow_ldf_state(session_state, args)
    if name == "get_cashflow_pattern_state":
        return _get_cashflow_pattern_state(session_state, args)
    if name == "exclude_cashflow_cells":
        cells = args.get("cells", []) or []
        clean = [{"origin": str(c.get("origin", "")), "step": int(c.get("step", 0))} for c in cells if c.get("origin") is not None]
        branch_id = args.get("branch_id")
        payload: dict[str, Any] = {"cells": clean}
        if branch_id:
            payload["branch_id"] = str(branch_id)
        if not clean:
            return {"error": "cells boş — en az bir hücre belirt."}
        return {"applied": clean, "count": len(clean), "_action": {"type": "exclude_cashflow_cells", "payload": payload, "module": "cashflow"}}
    if name == "clear_cashflow_exclusions":
        branch_id = args.get("branch_id")
        payload = {}
        if branch_id:
            payload["branch_id"] = str(branch_id)
        return {"cleared": True, "_action": {"type": "clear_cashflow_exclusions", "payload": payload, "module": "cashflow"}}
    if name == "set_cashflow_cdf_user_value":
        dev = str(args.get("dev_period", ""))
        try:
            v = float(args.get("value", 1))
        except (TypeError, ValueError):
            return {"error": "Geçersiz value"}
        branch_id = args.get("branch_id")
        payload = {"dev_period": dev, "value": v}
        if branch_id:
            payload["branch_id"] = str(branch_id)
        return {"dev_period": dev, "value": v, "_action": {"type": "set_cashflow_cdf_user_value", "payload": payload, "module": "cashflow"}}
    if name == "set_cashflow_window":
        window = str(args.get("window", "all"))
        if window not in {"4", "5", "7", "all"}:
            return {"error": f"Geçersiz window: {window}"}
        branch_id = args.get("branch_id")
        payload: dict[str, Any] = {"window": window}
        if branch_id:
            payload["branch_id"] = str(branch_id)
        return {"window": window, "_action": {"type": "set_cashflow_window", "payload": payload, "module": "cashflow"}}
    if name == "set_cashflow_cdf_model":
        dev = str(args.get("dev_period", ""))
        model = int(args.get("model", 1))
        if model not in {1, 2, 3, 4, 5, 6}:
            return {"error": f"Geçersiz model: {model}"}
        branch_id = args.get("branch_id")
        payload = {"dev_period": dev, "model": model}
        if branch_id:
            payload["branch_id"] = str(branch_id)
        return {"dev_period": dev, "model": model, "_action": {"type": "set_cashflow_cdf_model", "payload": payload, "module": "cashflow"}}
    if name == "set_cashflow_cdf_model_bulk":
        items = args.get("items", []) or []
        clean = [{"dev_period": str(i.get("dev_period", "")), "model": int(i.get("model", 1))} for i in items if i.get("dev_period") and int(i.get("model", 0)) in {1, 2, 3, 4, 5, 6}]
        branch_id = args.get("branch_id")
        payload = {"items": clean}
        if branch_id:
            payload["branch_id"] = str(branch_id)
        return {"applied": clean, "count": len(clean), "_action": {"type": "set_cashflow_cdf_model_bulk", "payload": payload, "module": "cashflow"}}
    if name == "reset_cashflow_curve":
        branch_id = args.get("branch_id")
        payload = {}
        if branch_id:
            payload["branch_id"] = str(branch_id)
        return {"cleared": True, "_action": {"type": "reset_cashflow_curve", "payload": payload, "module": "cashflow"}}
    # ─── Discount ─────────────────────────────────────────────────────────────
    if name == "get_discount_state":
        return _get_discount_state(session_state)
    if name == "compute_discount":
        return _compute_discount(session_state, args)
    # ─── Data ─────────────────────────────────────────────────────────────────
    if name == "list_data_periods":
        return _list_data_periods(session_state)
    # ─── Navigation ───────────────────────────────────────────────────────────
    if name == "navigate_to":
        module = str(args.get("module", ""))
        valid = {"reserve", "cashflow", "discount", "data", "home"}
        if module not in valid:
            return {"error": f"Geçersiz module: {module}. Seçenekler: {valid}"}
        return {"module": module, "_action": {"type": "navigate_to", "payload": {"module": module}, "module": "navigation"}}
    raise KeyError(f"Tool bulunamadı: {name}")


_BRANCH_VERBOSE_FIELDS = {"per_origin", "formula_context", "selected_ldfs", "effective_cdfs"}


def _list_project(session_state: dict[str, Any] | None) -> dict[str, Any]:
    if not session_state:
        return {"periods": [], "active": None, "totals_all_branches": {}}
    # Strip verbose LDF/CDF arrays — agent must call get_analysis_state/get_branch_state
    # for those. Leaving them here causes the agent to skip proper tool calls and read
    # incurred triangle LDFs as if they were cashflow paid LDFs.
    periods = [
        {
            **{k: v for k, v in p.items() if k != "branches"},
            "branches": [
                {k: v for k, v in b.items() if k not in _BRANCH_VERBOSE_FIELDS}
                for b in p.get("branches", [])
            ],
        }
        for p in (session_state.get("periods") or [])
    ]
    return {
        "active": session_state.get("active"),
        "periods": periods,
        "totals_all_branches": session_state.get("totals_all_branches", {}),
    }


def _select_branch(args: dict[str, Any]) -> dict[str, Any]:
    branch_id = str(args.get("branch_id", ""))
    period_id = args.get("period_id")
    if not branch_id:
        return {"error": "branch_id zorunlu"}
    payload: dict[str, Any] = {"branch_id": branch_id}
    if period_id:
        payload["period_id"] = str(period_id)
    return {
        "branch_id": branch_id,
        "period_id": period_id,
        "_action": {"type": "select_branch", "payload": payload},
    }


def _get_branch_state(
    session_state: dict[str, Any] | None, args: dict[str, Any]
) -> dict[str, Any]:
    if not session_state:
        return {"error": "Proje state'i yok."}
    branch_id = str(args.get("branch_id", ""))
    if not branch_id:
        return {"error": "branch_id zorunlu"}
    for p in session_state.get("periods", []):
        for b in p.get("branches", []):
            if b.get("id") == branch_id:
                return {
                    "period_id": p.get("id"),
                    "period_label": p.get("label"),
                    "branch": b,
                }
    return {"error": f"branch_id bulunamadı: {branch_id}"}


def _describe_triangle(triangle: Triangle) -> dict[str, Any]:
    latest = triangle.latest_diagonal()
    return {
        "triangle_type": triangle.triangle_type.value,
        "origin_granularity": triangle.origin_granularity.value,
        "development_granularity": triangle.development_granularity.value,
        "n_origins": triangle.n_origins,
        "n_developments": triangle.n_developments,
        "origin_periods": list(triangle.origin_periods),
        "development_periods": list(triangle.development_periods),
        "latest_diagonal": latest,
        "total_latest": sum(latest),
    }


def _get_analysis_state(
    triangle: Triangle | None, session_state: dict[str, Any] | None
) -> dict[str, Any]:
    if not session_state:
        return {"error": "Session state yok."}
    if triangle is None and not session_state.get("active"):
        return {
            "error": (
                "Aktif branş yok. list_project ile mevcut branşları gör; "
                "select_branch(branch_id) ile birini aç."
            )
        }
    excluded_cells = session_state.get("excluded_cells", []) or []
    return {
        "window": session_state.get("window"),
        "excluded_cells_count": len(excluded_cells),
        "excluded_cells": excluded_cells[:50],
        "selected_ldfs": session_state.get("selected_ldfs", []),
        "cdfs": session_state.get("cdfs", []),
        "per_origin": session_state.get("per_origin", []),
        "curve_state": session_state.get("curve_state", {}),
        "project_context": session_state.get("project_context"),
        "total_latest": session_state.get("total_latest"),
        "total_exposure": session_state.get("total_exposure"),
        "total_cl_ultimate": session_state.get("total_ultimate"),
        "total_bf_ultimate": session_state.get("total_bf_ultimate"),
        "total_selected_ultimate": session_state.get("total_selected_ultimate"),
        "total_selected_ibnr": session_state.get(
            "total_selected_ibnr", session_state.get("total_ibnr")
        ),
        "triangle_type": triangle.triangle_type.value if triangle else None,
        "origin_granularity": triangle.origin_granularity.value if triangle else None,
        "development_granularity": triangle.development_granularity.value if triangle else None,
    }


def _find_branch_per_origin(
    session_state: dict[str, Any], branch_id: str
) -> list[dict[str, Any]] | None:
    """branch_id ile session_state.periods içindeki branşın per_origin'ini bul."""
    for p in session_state.get("periods", []):
        for b in p.get("branches", []):
            if b.get("id") == branch_id:
                return b.get("per_origin") or []
    return None


def _simulate_bf(
    session_state: dict[str, Any] | None, args: dict[str, Any]
) -> dict[str, Any]:
    if not session_state:
        return {"error": "Session state yok."}
    origin = str(args.get("origin", ""))
    try:
        loss_ratio = float(args.get("loss_ratio", 0))
    except (TypeError, ValueError):
        return {"error": "Geçersiz loss_ratio"}

    # branch_id verilmişse o branşın per_origin'ini kullan
    branch_id = args.get("branch_id")
    if branch_id:
        per = _find_branch_per_origin(session_state, str(branch_id))
        if per is None:
            return {"error": f"branch_id bulunamadı: {branch_id}"}
    else:
        per = session_state.get("per_origin", []) or []

    norm_origin = _norm_origin(origin)
    entry = next(
        (p for p in per if _norm_origin(str(p.get("origin", ""))) == norm_origin),
        None,
    )
    if entry is None:
        available = [str(p.get("origin", "")) for p in per]
        return {"error": f"Origin bulunamadı: {origin!r}. Mevcut originler: {available}"}

    latest = float(entry.get("latest", 0) or 0)
    cdf = float(entry.get("cdf", 1) or 1)
    premium = float(entry.get("premium", 0) or 0)
    # Correction (annualization) katsayısı — BranchOriginRow: "correction"
    k = float(entry.get("correction") or 1) or 1
    # Yıllık exposure: premium_annual varsa kullan, yoksa premium × k
    premium_annual_raw = entry.get("premium_annual")
    premium_annual = (
        float(premium_annual_raw) if premium_annual_raw is not None else premium * k
    )
    current_selected = float(
        entry.get("selected_ultimate", entry.get("ultimate", 0)) or 0
    )
    current_ibnr = float(entry.get("ibnr", 0) or 0)
    current_basis = entry.get("basis", "cl")

    pct_dev = 1 / cdf if cdf else 1
    unreported = 1 - pct_dev
    # BF formülü correction-aware:
    #   bf_ult_annual = latest + loss_ratio × premium_annual × unreported
    #   bf_ult (kısmi) = bf_ult_annual / k
    bf_ult_annual = latest + loss_ratio * premium_annual * unreported
    new_bf_ult = bf_ult_annual / k
    new_bf_ibnr = new_bf_ult - latest

    return {
        "origin": origin,
        "loss_ratio": loss_ratio,
        "loss_ratio_pct": loss_ratio * 100,
        "inputs": {
            "latest": latest,
            "premium": premium,
            "premium_annual": premium_annual,
            "correction_k": k,
            "cdf": cdf,
            "pct_developed": pct_dev,
            "pct_unreported": unreported,
        },
        "current": {
            "basis": current_basis,
            "selected_ultimate": current_selected,
            "ibnr": current_ibnr,
        },
        "scenario_bf": {
            "bf_ultimate": new_bf_ult,
            "bf_ibnr": new_bf_ibnr,
        },
        "delta_vs_current": {
            "ultimate": new_bf_ult - current_selected,
            "ibnr": new_bf_ibnr - current_ibnr,
        },
    }


def _norm_origin(o: str) -> str:
    """'2022.0' → '2022': Excel float-as-string origin normalization."""
    s = o.strip()
    if s.endswith(".0") and s[:-2].isdigit():
        return s[:-2]
    return s


def _evaluate_lr_formula(
    formula: str,
    per_origin: list[dict[str, Any]],
    formula_context: dict[str, Any] | None = None,
) -> float:
    """LR formül sözdizimini değerlendir ve float döner.

    Frontend'deki formula.ts ile aynı gramer:
      * Sayı: 0.75, 75%
      * Fonksiyonlar: vw(...), avg(...), sum_cl(...), sum_exp(...), pattern(y)
        — argümanlar yıl listesi/aralığı: "2020:2022", "2020, 2022"
      * Aritmetik: + - * / ve parantez — örn. avg(2020:2022)*1.1,
        sum_cl(2020:2022)/sum_exp(2020:2022)

    formula_context (öncelikli): frontend'in evalFormula ile ürettiği cl_ult,
    exposure, pattern haritaları — bunlar CDF cascade uygulanmış, kesin doğru
    değerlerdir. Yoksa per_origin'den fallback hesap yapılır.
    """
    import re

    f = formula.strip()
    if not f:
        raise ValueError("Boş formül")

    # Hızlı yol — tek yüzde: "75%"
    if f.endswith("%"):
        try:
            return float(f[:-1]) / 100
        except ValueError:
            pass

    # Hızlı yol — tek sayı: "0.75" (>5 ise yüzde varsay: "75" → 0.75)
    try:
        v = float(f)
        return v / 100 if v > 5 else v
    except ValueError:
        pass

    # formula_context varsa (frontend'den gelen kesin değerler) — normalize keys
    cl_ult_map: dict[str, float] = {}
    exp_map: dict[str, float] = {}
    pat_map: dict[str, float] = {}
    if formula_context:
        cl_ult_map = {_norm_origin(k): float(v) for k, v in (formula_context.get("cl_ult") or {}).items()}
        exp_map = {_norm_origin(k): float(v) for k, v in (formula_context.get("exposure") or {}).items()}
        pat_map = {_norm_origin(k): float(v) for k, v in (formula_context.get("pattern") or {}).items()}

    # per_origin fallback: formula_context yoksa buradan al — normalize origins
    origins_list = [_norm_origin(o.get("origin", "")) for o in per_origin]

    # Merged lookup list: per_origin origins + formula_context keys (for range resolution)
    all_origins_ordered: list[str] = list(dict.fromkeys(
        origins_list
        + [_norm_origin(k) for k in cl_ult_map]
        + [_norm_origin(k) for k in exp_map]
    ))

    def _range_origins(y1: str, y2: str) -> list[str]:
        """y1:y2 aralığındaki origin string listesi."""
        n1, n2 = _norm_origin(y1), _norm_origin(y2)
        lookup = all_origins_ordered if all_origins_ordered else origins_list
        if n1 in lookup and n2 in lookup:
            i1, i2 = lookup.index(n1), lookup.index(n2)
            lo, hi = min(i1, i2), max(i1, i2)
            return lookup[lo : hi + 1]
        missing = [y for y, n in [(y1, n1), (y2, n2)] if n not in lookup]
        raise ValueError(f"Origin bulunamadı: {', '.join(repr(m) for m in missing)}")

    def _parse_year_list(inner: str) -> list[str]:
        """'2021:2023' veya '2021, 2022, 2024' veya karışık → origin string listesi."""
        out: list[str] = []
        for part in inner.split(","):
            part = part.strip()
            if not part:
                continue
            if ":" in part:
                ends = [p.strip() for p in part.split(":", 1)]
                out.extend(_range_origins(ends[0], ends[1]))
            else:
                n = _norm_origin(part)
                lookup = all_origins_ordered if all_origins_ordered else origins_list
                if n not in lookup:
                    raise ValueError(f"Origin bulunamadı: '{part}'")
                out.append(n)
        return out

    def _cl_for(o: str) -> float:
        n = _norm_origin(o)
        if n in cl_ult_map:
            return cl_ult_map[n]
        entry = next((e for e in per_origin if _norm_origin(e.get("origin", "")) == n), None)
        if entry is None:
            return 0.0
        return float(entry.get("cl_ultimate") or entry.get("cl_ult") or 0)

    def _exp_for(o: str) -> float:
        n = _norm_origin(o)
        if n in exp_map:
            return exp_map[n]
        entry = next((e for e in per_origin if _norm_origin(e.get("origin", "")) == n), None)
        if entry is None:
            return 0.0
        v = entry.get("premium_annual") or entry.get("exposure_annual")
        if v is not None:
            return float(v)
        prem = float(entry.get("premium") or 0)
        k = float(entry.get("correction") or 1) or 1
        return prem * k

    def _pat_for(o: str) -> float | None:
        n = _norm_origin(o)
        if n in pat_map:
            return pat_map[n]
        exp = _exp_for(o)
        cl = _cl_for(o)
        return cl / exp if exp > 0 else None

    def _eval_func(fname: str, inner: str) -> float:
        ors = _parse_year_list(inner.strip())
        if fname == "vw":
            sum_cl = sum(_cl_for(o) for o in ors)
            sum_exp = sum(_exp_for(o) for o in ors)
            if sum_exp == 0:
                raise ValueError(
                    f"Exposure sıfır: vw({inner.strip()}) hesaplanamıyor. "
                    "BF sekmesinden bu yıllar için prim girdiniz mi?"
                )
            return sum_cl / sum_exp
        if fname == "avg":
            ratios: list[float] = [p for o in ors if (p := _pat_for(o)) is not None]
            if not ratios:
                raise ValueError("Pattern ratio hesaplanamadı")
            return sum(ratios) / len(ratios)
        if fname == "sum_cl":
            return sum(_cl_for(o) for o in ors)
        if fname in {"sum_exp", "sum_exposure"}:
            return sum(_exp_for(o) for o in ors)
        if fname == "pattern":
            if len(ors) != 1:
                raise ValueError("pattern(y) tek bir origin alır")
            p = _pat_for(ors[0])
            if p is None:
                raise ValueError(
                    f"Pattern ratio hesaplanamadı: '{ors[0]}' (exposure sıfır olabilir)"
                )
            return p
        raise ValueError(f"Bilinmeyen fonksiyon: {fname}")

    # Fonksiyon çağrılarını sayıya indir (argümanlarda parantez olmaz),
    # kalan ifadeyi saf aritmetik olarak değerlendir:
    # avg(2020:2022)*1.1, sum_cl(2020:2022)/sum_exp(2020:2022) vb.
    func_re = re.compile(
        r"\b(vw|avg|sum_cl|sum_exposure|sum_exp|pattern)\s*\(([^()]*)\)",
        re.IGNORECASE,
    )
    # Not: :.12f — repr bilimsel gösterim (1e-05) üretebilir, tokenizer tanımaz
    expr = func_re.sub(
        lambda m: f"({_eval_func(m.group(1).lower(), m.group(2)):.12f})", f
    )
    return _eval_arithmetic(expr, original=formula)


def _eval_arithmetic(expr: str, *, original: str) -> float:
    """Saf aritmetik ifade değerlendirici: sayı, %, + - * / ve parantez.
    eval kullanılmaz; tanınmayan karakterde anlaşılır hata verir."""
    import re

    def _unrecognized() -> ValueError:
        return ValueError(
            f"Formül tanınamadı: '{original}'. Desteklenen: sayı (0.75 veya 75%), "
            "vw(2021:2023), avg(2021, 2023), sum_cl(...), sum_exp(...), pattern(y) "
            "ve bunların + - * / kombinasyonları (örn. avg(2020:2022)*1.1)."
        )

    token_re = re.compile(r"\s*(?:(\d+\.?\d*|\.\d+)(%?)|([()+\-*/]))")
    tokens: list[float | str] = []
    pos = 0
    stripped = expr.strip()
    while pos < len(stripped):
        m = token_re.match(stripped, pos)
        if not m:
            raise _unrecognized()
        if m.group(1) is not None:
            num = float(m.group(1))
            tokens.append(num / 100 if m.group(2) else num)
        else:
            tokens.append(m.group(3))
        pos = m.end()

    i = 0

    def peek() -> float | str | None:
        return tokens[i] if i < len(tokens) else None

    def parse_expr() -> float:
        nonlocal i
        val = parse_term()
        while peek() in {"+", "-"}:
            op = tokens[i]
            i += 1
            rhs = parse_term()
            val = val + rhs if op == "+" else val - rhs
        return val

    def parse_term() -> float:
        nonlocal i
        val = parse_factor()
        while peek() in {"*", "/"}:
            op = tokens[i]
            i += 1
            rhs = parse_factor()
            if op == "*":
                val *= rhs
            else:
                if rhs == 0:
                    raise ValueError(f"Sıfıra bölme: '{original}'")
                val /= rhs
        return val

    def parse_factor() -> float:
        nonlocal i
        t = peek()
        if t == "-":
            i += 1
            return -parse_factor()
        if t == "+":
            i += 1
            return parse_factor()
        if t == "(":
            i += 1
            v = parse_expr()
            if peek() != ")":
                raise _unrecognized()
            i += 1
            return v
        if isinstance(t, float):
            i += 1
            return t
        raise _unrecognized()

    try:
        result = parse_expr()
    except RecursionError as e:  # aşırı iç içe parantez
        raise _unrecognized() from e
    if i != len(tokens):
        raise _unrecognized()
    return result


def _simulate_bf_formula(
    session_state: dict[str, Any] | None, args: dict[str, Any]
) -> dict[str, Any]:
    """Formül bazlı BF senaryo — tek veya çok origin, durumu değiştirmez."""
    if not session_state:
        return {"error": "Session state yok."}

    formula = str(args.get("formula", "")).strip()
    if not formula:
        return {"error": "formula zorunlu"}

    # branch_id verilmişse o branşın per_origin ve formula_context'ini kullan
    branch_id = args.get("branch_id")
    if branch_id:
        branch_snap = None
        for p in session_state.get("periods", []):
            for b in p.get("branches", []):
                if b.get("id") == str(branch_id):
                    branch_snap = b
                    break
            if branch_snap:
                break
        if branch_snap is None:
            return {"error": f"branch_id bulunamadı: {branch_id}"}
        per = branch_snap.get("per_origin") or []
        fctx = branch_snap.get("formula_context") or None
    else:
        per = session_state.get("per_origin", []) or []
        # Frontend'in CDF-cascade uygulanmış kesin değerleri (varsa öncelikli)
        fctx = session_state.get("formula_context") or None

    try:
        lr = _evaluate_lr_formula(formula, per, formula_context=fctx)
    except ValueError as e:
        return {"error": str(e)}

    def _current_lr_info(entry: dict[str, Any]) -> dict[str, Any]:
        return {
            "current_lr_input": entry.get("selected_lr_input"),
            "current_lr": round(float(entry.get("selected_lr") or 0) * 100, 4),
            "current_ibnr": float(entry.get("ibnr") or 0),
            "current_selected_ult": float(entry.get("selected_ultimate") or 0),
            "basis": entry.get("basis", "cl"),
        }

    sim_base = {"origin": "", "loss_ratio": lr}
    if branch_id:
        sim_base["branch_id"] = str(branch_id)

    # Çok origin
    raw_origins = args.get("origins")
    if raw_origins and isinstance(raw_origins, list):
        results: list[dict[str, Any]] = []
        total_delta_ibnr = 0.0
        total_delta_ult = 0.0
        errors: list[str] = []
        for o in raw_origins:
            norm_o = _norm_origin(str(o))
            entry = next((e for e in per if _norm_origin(str(e.get("origin", ""))) == norm_o), None)
            r = _simulate_bf(session_state, {**sim_base, "origin": str(o)})
            if "error" in r:
                errors.append(f"{o}: {r['error']}")
                continue
            if entry:
                r["baseline"] = _current_lr_info(entry)
            total_delta_ibnr += float(r["delta_vs_current"]["ibnr"])
            total_delta_ult += float(r["delta_vs_current"]["ultimate"])
            results.append(r)
        out: dict[str, Any] = {
            "formula": formula,
            "evaluated_lr": lr,
            "evaluated_lr_pct": round(lr * 100, 4),
            "origins": results,
            "total_delta_ibnr": total_delta_ibnr,
            "total_delta_ultimate": total_delta_ult,
            "interpretation": (
                f"Bu senaryo, belirtilen origin'lerin BF Loss Ratio'sunu "
                f"%{round(lr*100,2):.2f} olarak alır ve mevcut selected_ultimate "
                f"ile karşılaştırır. Pozitif delta = IBNR artar; negatif = azalır."
            ),
        }
        if errors:
            out["errors"] = errors
        return out

    # Tek origin
    origin = str(args.get("origin", ""))
    if not origin:
        return {
            "error": "origin veya origins gerekli (ör. origin='2024' ya da origins=['2024','2025'])"
        }
    norm_o = _norm_origin(origin)
    entry = next((e for e in per if _norm_origin(str(e.get("origin", ""))) == norm_o), None)
    r = _simulate_bf(session_state, {**sim_base, "origin": origin})
    r["formula"] = formula
    r["evaluated_lr"] = lr
    r["evaluated_lr_pct"] = round(lr * 100, 4)
    if entry:
        r["baseline"] = _current_lr_info(entry)
    return r


def _exclude_cells(
    triangle: Triangle, args: dict[str, Any], *, additive: bool
) -> dict[str, Any]:
    raw_cells = args.get("cells", []) or []
    origins_idx = {o: i for i, o in enumerate(triangle.origin_periods)}
    max_step = triangle.n_developments - 1
    valid: list[dict[str, Any]] = []
    invalid: list[dict[str, Any]] = []
    for c in raw_cells:
        origin = str(c.get("origin", ""))
        try:
            step = int(c.get("step", -1))
        except (TypeError, ValueError):
            step = -1
        if origin not in origins_idx or not (0 <= step < max_step):
            invalid.append({"origin": origin, "step": step, "reason": "out_of_range"})
            continue
        # LDF için her iki uçta da değer olmalı; aksi halde "phantom" eleme yaratır
        i = origins_idx[origin]
        a = triangle.values[i][step]
        b = triangle.values[i][step + 1]
        if a is None or b is None:
            invalid.append(
                {"origin": origin, "step": step, "reason": "no_ldf_data"}
            )
            continue
        valid.append({"origin": origin, "step": step})
    action_type = "exclude_cells" if additive else "include_cells"
    result: dict[str, Any] = {
        "applied": valid,
        "count": len(valid),
        "invalid": invalid,
    }
    if not valid:
        # Boş action göndermek frontend'de spurious history yaratıyordu.
        # Agent'a hatayı net göster — origin/step uyumsuz.
        result["error"] = (
            f"Hiçbir hücre eşleşmedi. Mevcut origin'ler: "
            f"{list(triangle.origin_periods)[:8]}{'...' if len(triangle.origin_periods) > 8 else ''}. "
            f"Step 0-indexli (step=0 → 1→2 geçişi); valid range 0..{max_step - 1}."
        )
        return result
    result["_action"] = {"type": action_type, "payload": {"cells": valid}}
    return result


def _exclude_outliers(
    triangle: Triangle,
    session_state: dict[str, Any] | None,
    args: dict[str, Any],
) -> dict[str, Any]:
    threshold = float(args.get("threshold_pct", 10)) / 100
    direction = args.get("direction", "both")
    baseline = args.get("baseline", "median")

    excluded_keys: set[str] = set()
    for c in (session_state or {}).get("excluded_cells", []) or []:
        excluded_keys.add(f"{c.get('origin')}|{c.get('step')}")

    steps = triangle.n_developments - 1
    matches: list[dict[str, Any]] = []
    for j in range(steps):
        ratios: list[tuple[str, float]] = []
        for i, origin in enumerate(triangle.origin_periods):
            a = triangle.values[i][j]
            b = triangle.values[i][j + 1]
            if a is None or b is None or a == 0:
                continue
            key = f"{origin}|{j}"
            if key in excluded_keys:
                continue
            ratios.append((origin, b / a))
        if not ratios:
            continue
        vals = [v for _, v in ratios]
        if baseline == "mean":
            ref = sum(vals) / len(vals)
        else:
            sorted_vals = sorted(vals)
            ref = sorted_vals[len(sorted_vals) // 2]
        upper = ref * (1 + threshold)
        lower = ref * (1 - threshold)
        for origin, v in ratios:
            high = v > upper
            low = v < lower
            if (
                (direction == "both" and (high or low))
                or (direction == "high" and high)
                or (direction == "low" and low)
            ):
                matches.append(
                    {
                        "origin": origin,
                        "step": j,
                        "value": round(v, 6),
                        "baseline": round(ref, 6),
                        "deviation_pct": round((v - ref) / ref * 100, 2),
                    }
                )
    action_cells = [{"origin": m["origin"], "step": m["step"]} for m in matches]
    return {
        "matched": matches[:100],
        "count": len(matches),
        "threshold_pct": threshold * 100,
        "baseline": baseline,
        "direction": direction,
        "_action": {"type": "exclude_cells", "payload": {"cells": action_cells}},
    }


def _get_ilr_triangle(
    triangle: Triangle, session_state: dict[str, Any] | None
) -> dict[str, Any]:
    per = (session_state or {}).get("per_origin", []) or []
    prem_map: dict[str, float] = {}
    correction_map: dict[str, float] = {}
    for entry in per:
        o = _norm_origin(str(entry.get("origin", "")))
        prem_map[o] = float(entry.get("premium", 0) or 0)
        correction_map[o] = float(entry.get("correction") or 1) or 1

    rows = []
    for i, origin in enumerate(triangle.origin_periods):
        norm_o = _norm_origin(origin)
        prem = prem_map.get(norm_o, 0)
        k = correction_map.get(norm_o, 1)
        adj_prem = prem * k
        ilr_row: list[float | None] = []
        for v in triangle.values[i]:
            if v is None or adj_prem == 0:
                ilr_row.append(None)
            else:
                ilr_row.append(round(v / adj_prem * 100, 2))
        rows.append({
            "origin": origin,
            "premium": prem,
            "adj_premium": round(adj_prem, 2),
            "correction_k": k,
            "ilr_pct": ilr_row,
        })
    return {
        "development_periods": list(triangle.development_periods),
        "rows": rows,
        "note": "ilr_pct = hasar / (prim × k) × 100. null = veri yok veya prim girilmemiş.",
    }


def _get_file_summary(session_state: dict[str, Any] | None) -> dict[str, Any]:
    if not session_state:
        return {"error": "Session state yok."}
    summary = session_state.get("file_data_summary")
    if not summary:
        return {
            "error": (
                "Bu branşta dosya bazlı kırılım yok. Sütun adı sorun değil — "
                "'Dosya No', 'DOSYA_NO' vb. otomatik tanınır. En olası neden: "
                "üçgen, dosya bazlı hasar verisinden değil, hazır/toplulaştırılmış "
                "bir üçgen dosyasından yüklenmiş; o formatta tekil dosya kırılımı "
                "bulunmaz. Dosya analizi için Veri modülünden DOSYA_NO içeren hasar "
                "veri setini yükleyip üçgeni oradan türetmek gerekir."
            )
        }
    return summary


def _get_cashflow_state(session_state: dict[str, Any] | None) -> dict[str, Any]:
    if not session_state:
        return {"branches": [], "note": "Cashflow verisi henüz yüklenmemiş."}
    periods = session_state.get("periods", [])
    totals = session_state.get("totals", {})
    active_id = session_state.get("active_branch_id")

    branches_summary = []
    for p in periods:
        for b in p.get("branches", []):
            branches_summary.append({
                "branch_id": b.get("id"),
                "branch_name": b.get("name"),
                "period_id": p.get("id"),
                "period_label": p.get("label"),
                "frequency": b.get("frequency"),
                "is_active": b.get("is_active"),
                "has_paid_triangle": b.get("has_paid_triangle"),
                "n_origins": b.get("n_origins"),
                "n_developments": b.get("n_developments"),
                "ldf_window": b.get("ldf_window"),
                "excluded_cells_count": b.get("excluded_cells_count"),
                "cdf_model_overrides": b.get("cdf_model_overrides", []),
                "cdf_user_values": b.get("cdf_user_values", []),
                "has_pattern": b.get("has_pattern"),
                "pattern_origin_count": b.get("pattern_origin_count"),
            })

    return {
        "active_branch_id": active_id,
        "branches": branches_summary,
        "totals": totals,
        "note": "Detaylı LDF/CDF için get_cashflow_ldf_state kullanın.",
    }


def _get_cashflow_ldf_state(
    session_state: dict[str, Any] | None, args: dict[str, Any]
) -> dict[str, Any]:
    if not session_state:
        return {"error": "Session state yok."}
    branch_id = args.get("branch_id")
    target: dict[str, Any] | None = None
    for p in session_state.get("periods", []):
        for b in p.get("branches", []):
            if branch_id:
                if b.get("id") == str(branch_id):
                    target = b
                    break
            elif b.get("is_active"):
                target = b
                break
        if target:
            break
    if target is None:
        if branch_id:
            return {"error": f"branch_id bulunamadı: {branch_id}"}
        return {"error": "Aktif branş yok. branch_id belirtin veya önce select_branch kullanın."}
    return {
        "branch_id": target.get("id"),
        "branch_name": target.get("name"),
        "n_origins": target.get("n_origins"),
        "n_developments": target.get("n_developments"),
        "ldf_window": target.get("ldf_window"),
        "excluded_cells_count": target.get("excluded_cells_count"),
        "excluded_cells": target.get("excluded_cells", [])[:50],
        "selected_ldfs": target.get("selected_ldfs", []),
        "effective_cdfs": target.get("effective_cdfs", []),
        "per_dev": target.get("per_dev", []),
        "cdf_model_overrides": target.get("cdf_model_overrides", []),
        "cdf_user_values": target.get("cdf_user_values", []),
    }


def _get_cashflow_pattern_state(
    session_state: dict[str, Any] | None, args: dict[str, Any]
) -> dict[str, Any]:
    if not session_state:
        return {"error": "Session state yok."}
    branch_id = args.get("branch_id")
    target: dict[str, Any] | None = None
    for p in session_state.get("periods", []):
        for b in p.get("branches", []):
            if branch_id:
                if b.get("id") == str(branch_id):
                    target = b
                    break
            elif b.get("is_active"):
                target = b
                break
        if target:
            break
    if target is None:
        if branch_id:
            return {"error": f"branch_id bulunamadı: {branch_id}"}
        return {"error": "Aktif branş yok. branch_id belirtin."}

    quarterly_pattern: dict[str, Any] = target.get("quarterly_pattern") or {}
    monthly_pattern: dict[str, Any] = target.get("monthly_pattern") or {}
    origin_req = args.get("origin")
    mode = str(args.get("mode", "quarterly"))  # "quarterly" | "monthly"

    if origin_req:
        pattern = quarterly_pattern if mode == "quarterly" else monthly_pattern
        weights = pattern.get(str(origin_req))
        if weights is None:
            available = list(quarterly_pattern.keys()) or list(monthly_pattern.keys())
            return {"error": f"Origin '{origin_req}' için {mode} pattern yok. Mevcut: {available}"}
        total = sum(w.get("weight", 0) for w in weights)
        period_key = "period" if mode == "quarterly" else "month"
        last_period = max((w.get(period_key, 0) for w in weights), default=0)
        return {
            "branch_id": target.get("id"),
            "branch_name": target.get("name"),
            "origin": origin_req,
            "mode": mode,
            "periods_count": len(weights),
            "last_period": last_period,
            "weight_sum": round(total, 6),
            "weights": weights,
        }

    # Özet: tüm originler, quarterly öncelikli
    use_pattern = quarterly_pattern if quarterly_pattern else monthly_pattern
    use_mode = "quarterly" if quarterly_pattern else "monthly"
    period_key = "period" if use_mode == "quarterly" else "month"
    summary_rows = []
    for orig, weights in use_pattern.items():
        if not weights:
            continue
        total = sum(w.get("weight", 0) for w in weights)
        peak = max(weights, key=lambda w: w.get("weight", 0))
        summary_rows.append({
            "origin": orig,
            "periods_count": len(weights),
            "weight_sum": round(total, 6),
            "peak_period": peak.get(period_key),
            "peak_weight": round(peak.get("weight", 0), 6),
        })
    return {
        "branch_id": target.get("id"),
        "branch_name": target.get("name"),
        "has_pattern": target.get("has_pattern"),
        "pattern_origin_count": target.get("pattern_origin_count"),
        "mode": use_mode,
        "origins": summary_rows,
        "note": (
            "Belirli bir kaza yılı için origin='2024' parametresiyle tekrar çağırın. "
            "mode='monthly' ekleyerek 180 aylık dağılıma geçebilirsiniz."
        ),
    }


def _get_discount_state(session_state: dict[str, Any] | None) -> dict[str, Any]:
    if not session_state:
        return {"error": "Session state yok."}
    branches = session_state.get("branches")
    if not branches:
        return {"branches": [], "note": "İskonto verisi henüz yüklenmemiş."}
    return {
        "active_branch_id": session_state.get("active_branch_id"),
        "branches": branches,
        "note": session_state.get("note"),
    }


# IFRS 17 bottom-up varsayılan TL risk-free eğrisi (frontend ile aynı).
_DEFAULT_RISK_FREE_CURVE = [
    {"month": 12, "rate": 0.28},
    {"month": 36, "rate": 0.25},
    {"month": 60, "rate": 0.22},
    {"month": 120, "rate": 0.20},
]
_SEDDK_FLAT_RATE = 0.30


def _compute_discount(
    session_state: dict[str, Any] | None, args: dict[str, Any]
) -> dict[str, Any]:
    """Standart-bazlı iskonto — discount snapshot'ındaki branş başına per_origin
    (unpaid + ağırlıklı ortalama ödeme ayı) üzerinden hesaplar.

    IFRS 4: nominal / sabit (SEDDK) / eğri; RA yok.
    IFRS 17: eğri (veya sabit) + illikidite primi → BEL; üzerine Risk
    Adjustment (pct_of_bel veya cost_of_capital) → LIC = BEL + RA.
    Not: tek-nokta (avg_month) yaklaşımı kullanılır; tam aylık hesap İskonto
    modülündedir.
    """
    if not session_state:
        return {"error": "Session state yok."}

    standard = str(args.get("standard", "ifrs4"))
    if standard not in {"ifrs4", "ifrs17"}:
        return {"error": f"Geçersiz standard: {standard}. 'ifrs4' veya 'ifrs17' olmalı."}

    # rate_mode varsayılanı standarda göre
    default_mode = "flat" if standard == "ifrs4" else "curve"
    rate_mode = str(args.get("rate_mode", default_mode))
    if rate_mode not in {"none", "flat", "curve"}:
        return {"error": f"Geçersiz rate_mode: {rate_mode}. 'none', 'flat' veya 'curve' olmalı."}
    if rate_mode == "none" and standard == "ifrs17":
        return {"error": "IFRS 17'de iskontosuz (rate_mode='none') hesap yapılmaz — BEL iskontolu tanımlıdır."}

    # Hedef branşı discount snapshot'ından bul (anahtar: branch_id)
    branch_id = args.get("branch_id")
    branches = session_state.get("branches", []) or []
    target_branch: dict[str, Any] | None = None
    for b in branches:
        if branch_id:
            if b.get("branch_id") == str(branch_id):
                target_branch = b
                break
        elif b.get("is_active"):
            target_branch = b
            break

    if target_branch is None:
        if branch_id:
            return {"error": f"branch_id bulunamadı: {branch_id}"}
        return {"error": "Aktif branş yok. branch_id belirtin."}

    if not target_branch.get("has_cashflow_pattern"):
        return {
            "error": (
                f"'{target_branch.get('branch_name')}' branşında cashflow pattern hesaplanmamış. "
                "Nakit Akışı modülünde bu branşı açın (pattern otomatik hesaplanır)."
            )
        }

    per_origin = target_branch.get("per_origin", []) or []
    if not per_origin:
        return {"error": "Bu branş için iskonto edilecek ödeme satırı yok."}

    # İskonto oranı fonksiyonu — IFRS 17'de illikidite primi spread olarak eklenir
    spread = (
        float(args.get("illiquidity_premium_bps", 100)) / 10000
        if standard == "ifrs17"
        else 0.0
    )

    if rate_mode == "none":
        rate_label = "Nominal (iskontosuz)"

        def rate_at(_month: float) -> float:
            return 0.0
    elif rate_mode == "flat":
        flat_rate = float(args.get("flat_rate", _SEDDK_FLAT_RATE))
        rate_label = f"%{flat_rate * 100:.1f} sabit"
        if spread:
            rate_label += f" + {spread * 10000:.0f}bp illikidite"

        def rate_at(_month: float) -> float:
            return flat_rate + spread
    else:
        curve_nodes = args.get("curve_nodes") or _DEFAULT_RISK_FREE_CURVE
        sorted_nodes = sorted(curve_nodes, key=lambda x: x.get("month", 0))
        rate_label = f"Eğri ({len(curve_nodes)} nokta)"
        if spread:
            rate_label += f" + {spread * 10000:.0f}bp illikidite"

        def rate_at(month: float) -> float:
            rate = sorted_nodes[0].get("rate", 0.3)
            for node in sorted_nodes:
                if month >= node.get("month", 0):
                    rate = node.get("rate", 0.3)
            return rate + spread

    # Risk Adjustment konfigürasyonu — sadece IFRS 17
    ra_method = str(args.get("risk_adjustment_method", "pct_of_bel"))
    if ra_method not in {"none", "pct_of_bel", "cost_of_capital"}:
        return {"error": f"Geçersiz risk_adjustment_method: {ra_method}"}
    if standard == "ifrs4":
        ra_method = "none"
    ra_pct = float(args.get("risk_adjustment_pct", 0.06))
    coc_rate = float(args.get("coc_rate", 0.06))
    capital_ratio = float(args.get("capital_ratio", 0.10))

    def risk_adjustment_for(discounted: float, month: float) -> float:
        if ra_method == "pct_of_bel":
            return discounted * ra_pct
        if ra_method == "cost_of_capital":
            # Outstanding-yıl proxy'si: Σ tutar × t = toplam × avg_month
            return coc_rate * capital_ratio * discounted * (month / 12)
        return 0.0

    results = []
    total_unpaid = 0.0
    total_discounted = 0.0
    total_ra = 0.0
    max_month = 0.0

    for row in per_origin:
        origin = str(row.get("origin", ""))
        unpaid = float(row.get("unpaid", 0) or 0)
        if unpaid <= 0:
            continue
        # avg_month = ağırlıklı ortalama ödeme ayı (gerçek aylık pattern'den, frontend hesaplar)
        month = float(row.get("avg_month", 0) or 0)
        r = rate_at(month)
        v = 1 / ((1 + r) ** (month / 12)) if month > 0 else 1.0
        discounted = unpaid * v
        discount_amt = unpaid - discounted
        ra_amt = risk_adjustment_for(discounted, month)

        entry: dict[str, Any] = {
            "origin": origin,
            "unpaid_liability": round(unpaid),
            "avg_payment_month": round(month, 1),
            "discount_factor": round(v, 4),
            "discounted_unpaid": round(discounted),
            "discount_amount": round(discount_amt),
            "discount_pct": round(discount_amt / unpaid * 100, 2) if unpaid > 0 else 0,
        }
        if standard == "ifrs17":
            entry["risk_adjustment"] = round(ra_amt)
            entry["lic"] = round(discounted + ra_amt)
        results.append(entry)
        total_unpaid += unpaid
        total_discounted += discounted
        total_ra += ra_amt
        max_month = max(max_month, month)

    total_discount = total_unpaid - total_discounted
    total_discount_pct = total_discount / total_unpaid * 100 if total_unpaid > 0 else 0

    totals: dict[str, Any] = {
        "unpaid_liability": round(total_unpaid),
        "discounted_unpaid": round(total_discounted),
        "discount_amount": round(total_discount),
        "discount_pct": round(total_discount_pct, 2),
        "max_payment_month": round(max_month, 1),
    }
    if standard == "ifrs17":
        totals["risk_adjustment"] = round(total_ra)
        totals["lic"] = round(total_discounted + total_ra)

    ra_label = {
        "none": "yok",
        "pct_of_bel": f"BEL × %{ra_pct * 100:.1f}",
        "cost_of_capital": f"CoC %{coc_rate * 100:.1f} × sermaye %{capital_ratio * 100:.0f}",
    }[ra_method]

    return {
        "branch": target_branch.get("branch_name"),
        "branch_id": target_branch.get("branch_id"),
        "standard": standard,
        "rate_mode": rate_mode,
        "rate_label": rate_label,
        "risk_adjustment_method": ra_method,
        "risk_adjustment_label": ra_label,
        "totals": totals,
        "by_origin": results,
        "note": (
            ("IFRS 17: LIC = BEL + Risk Adjustment. " if standard == "ifrs17" else "")
            + "Her kaza yılı, gerçek aylık pattern'den türetilen ağırlıklı ortalama "
            "ödeme ayında tek noktadan iskonto edilir (konveksite nedeniyle tam aylık "
            "hesaba göre iskontoyu hafif eksik tahmin eder). Tam aylık hesap için "
            "navigate_to(module='discount') ile İskonto modülüne gidin."
        ),
    }


def _list_data_periods(session_state: dict[str, Any] | None) -> dict[str, Any]:
    if not session_state:
        return {"error": "Session state yok."}
    periods = session_state.get("periods")
    if not periods:
        return {"periods": [], "note": "Veri modülü verisi henüz yüklenmemiş."}
    return {
        "active_period_id": session_state.get("active_period_id"),
        "periods": periods,
        "note": session_state.get("note"),
    }


def _simulate_frequency_severity(
    amount: Triangle,
    count: Triangle | None,
    args: dict[str, Any],
) -> dict[str, Any]:
    if count is None:
        return {
            "error": (
                "Adet üçgeni yok. Frekans-Şiddet yalnızca dosya bazlı (DOSYA_NO kolonlu) "
                "hasar verisinden yüklenen branşlarda kullanılabilir. Bu branş doğrudan "
                "üçgen yüklemesiyle oluşturulmuş olabilir."
            )
        }
    method_str = args.get("method", LDFMethod.VOLUME_WEIGHTED.value)
    try:
        method = LDFMethod(method_str)
    except ValueError as e:
        return {"error": f"Geçersiz method: {method_str} ({e})"}

    try:
        result = run_frequency_severity(
            amount,
            count,
            method=method,
            n_years=args.get("n_years"),
            excluded_origins={str(o) for o in args["excluded_origins"]}
            if args.get("excluded_origins")
            else None,
        )
    except ValueError as e:
        return {"error": str(e)}

    return result.summary()


def _run_chain_ladder(triangle: Triangle, args: dict[str, Any]) -> dict[str, Any]:
    method_str = args.get("method", LDFMethod.VOLUME_WEIGHTED.value)
    try:
        method = LDFMethod(method_str)
    except ValueError as e:
        return {"error": f"Geçersiz method: {method_str} ({e})"}

    try:
        result = run_chain_ladder(
            triangle,
            method=method,
            n_years=args.get("n_years"),
            excluded_origins={str(o) for o in args["excluded_origins"]}
            if args.get("excluded_origins")
            else None,
            ldf_override=args.get("ldf_override"),
        )
    except ValueError as e:
        return {"error": str(e)}

    return result.summary()
