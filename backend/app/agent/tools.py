"""Agent tool'ları.

Read (durum sorgulama):
    describe_triangle, get_analysis_state

Scenario (durumu değiştirmeden hipotetik hesap):
    simulate_bf, run_chain_ladder

Write (UI durumunu güncelle — kullanıcı onayı İSTENMEZ):
    exclude_cells, include_cells, clear_exclusions, exclude_outliers,
    set_method, set_window,
    set_selected_loss_ratio, set_premium, set_basis

Write tool'ları çıktılarında "_action" anahtarı içerir — agent loop bunu
ChatResponse.actions listesine ekler, frontend otomatik uygular.
"""

from __future__ import annotations

from typing import Any

from app.core.chain_ladder import run_chain_ladder
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
                "Belirli bir branşın tam analizi: per-origin satırlar (latest, "
                "exposure, correction, cdf, cl_ult, bf_ult, basis, selected_ult, "
                "ibnr, ulr), totals, selected_ldfs, effective_cdfs. Aktif branş "
                "için list_project zaten bunları içerir; başka branş için "
                "branch_id ile sor."
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
                "Mevcut analizin tam durumu: method/window/elenen hücreler + "
                "LDF/CDF + her origin için latest/premium/pattern_ratio/"
                "selected_lr/cl_ultimate/bf_ultimate/basis/selected_ultimate/"
                "ibnr/ulr. Sonuçla ilgili her soruda ÖNCE çağır."
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
                "Dosya (DOSYA_NO) kırılımlı veri özeti. Son diagonal için kaza yılı "
                "bazlı: toplam, dosya sayısı, ortalama, top-1/top-3 konsantrasyon. "
                "Yalnızca DOSYA_NO kolonu içeren Excel yüklenmiş branşlarda çalışır. "
                "'Kaç dosya var?', 'en büyük dosya hangisi?', 'konsantrasyon?' "
                "sorularında kullan."
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
                "Tüm branşların cashflow ayarlarını ve aylık nakit akışı pattern "
                "durumunu döner. Hangi branşlarda cashflow hesaplanmış, LDF penceresi "
                "ne, curve model seçimleri neler sorularında kullan."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
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
                "Belirli bir branş için iskonto hesapla. Sabit faiz (flat) veya "
                "term yapısı (curve) kullanılabilir. Sonuç: kaza yılı bazlı "
                "Unpaid Liability, İskontolu Unpaid, iskonto tutarı, iskonto%, duration. "
                "Cashflow pattern eksikse hata döner. "
                "SEDDK 2025: flat_rate=0.30. IFRS 17: piyasa gözlemlenebilir oran."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "branch_id": {
                        "type": "string",
                        "description": "Hedef branş. Verilmezse aktif branş.",
                    },
                    "rate_mode": {
                        "type": "string",
                        "enum": ["flat", "curve"],
                        "description": "'flat' = sabit faiz, 'curve' = vade yapısı.",
                    },
                    "flat_rate": {
                        "type": "number",
                        "description": "Yıllık faiz oranı (0.30 = %30). rate_mode='flat' için.",
                    },
                    "curve_nodes": {
                        "type": "array",
                        "description": "Eğri noktaları. rate_mode='curve' için.",
                        "items": {
                            "type": "object",
                            "properties": {
                                "month": {"type": "integer"},
                                "rate": {"type": "number", "description": "Yıllık spot oran (0.25 = %25)."},
                            },
                            "required": ["month", "rate"],
                        },
                    },
                },
                "required": ["rate_mode"],
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
}


def dispatch_tool(
    name: str,
    args: dict[str, Any],
    *,
    triangle: Triangle | None = None,
    session_state: dict[str, Any] | None = None,
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
    if name == "get_ilr_triangle":
        return _get_ilr_triangle(triangle, session_state)  # type: ignore[arg-type]
    if name == "get_file_summary":
        return _get_file_summary(session_state)
    # ─── Cashflow ─────────────────────────────────────────────────────────────
    if name == "get_cashflow_state":
        return _get_cashflow_state(session_state)
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


def _list_project(session_state: dict[str, Any] | None) -> dict[str, Any]:
    if not session_state:
        return {"periods": [], "active": None, "totals_all_branches": {}}
    return {
        "active": session_state.get("active"),
        "periods": session_state.get("periods", []),
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
    Desteklenen formlar: sayı (0.75 veya 75%), vw(y1:y2), avg(y1:y2).

    formula_context (öncelikli): frontend'in evalFormula ile ürettiği cl_ult,
    exposure, pattern haritaları — bunlar CDF cascade uygulanmış, kesin doğru
    değerlerdir. Yoksa per_origin'den fallback hesap yapılır.
    """
    import re

    f = formula.strip()

    # Yüzde: "75%"
    if f.endswith("%"):
        return float(f[:-1]) / 100

    # Sayı: "0.75"
    try:
        v = float(f)
        # >5 ise yüzde varsay (örn. "75" → 0.75)
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

    # vw(...) = Σ cl_ult / Σ exposure — range veya virgüllü yıl listesi
    m = re.fullmatch(r"vw\((.+)\)", f, re.DOTALL)
    if m:
        ors = _parse_year_list(m.group(1).strip())
        sum_cl = sum(_cl_for(o) for o in ors)
        sum_exp = sum(_exp_for(o) for o in ors)
        if sum_exp == 0:
            raise ValueError(
                f"Exposure sıfır: vw({m.group(1).strip()}) hesaplanamıyor. "
                "BF sekmesinden bu yıllar için prim girdiniz mi?"
            )
        return sum_cl / sum_exp

    # avg(...) = ortalama pattern ratio — range veya virgüllü yıl listesi
    m = re.fullmatch(r"avg\((.+)\)", f, re.DOTALL)
    if m:
        ors = _parse_year_list(m.group(1).strip())
        ratios: list[float] = [p for o in ors if (p := _pat_for(o)) is not None]
        if not ratios:
            raise ValueError("Pattern ratio hesaplanamadı")
        return sum(ratios) / len(ratios)

    raise ValueError(
        f"Formül tanınamadı: '{formula}'. "
        "Desteklenen: sayı (0.75 veya 75%), vw(2021:2023), vw(2021, 2022, 2024), avg(2021:2023), avg(2021, 2023)."
    )


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
                "Dosya verisi yok. Bu branşta DOSYA_NO kolonu içeren Excel "
                "yüklenmemiş olabilir."
            )
        }
    return summary


def _get_cashflow_state(session_state: dict[str, Any] | None) -> dict[str, Any]:
    if not session_state:
        return {"error": "Session state yok."}
    cashflow = session_state.get("cashflow")
    if not cashflow:
        return {"branches": [], "note": "Cashflow verisi henüz yüklenmemiş."}
    return cashflow


def _get_discount_state(session_state: dict[str, Any] | None) -> dict[str, Any]:
    if not session_state:
        return {"error": "Session state yok."}
    discount = session_state.get("discount")
    if not discount:
        return {"branches": [], "note": "İskonto verisi henüz yüklenmemiş."}
    return discount


def _compute_discount(
    session_state: dict[str, Any] | None, args: dict[str, Any]
) -> dict[str, Any]:
    """Discount hesaplama — session_state'ten cashflow pattern + reserve verisi kullanır."""
    if not session_state:
        return {"error": "Session state yok."}

    rate_mode = str(args.get("rate_mode", "flat"))
    if rate_mode not in {"flat", "curve"}:
        return {"error": f"Geçersiz rate_mode: {rate_mode}. 'flat' veya 'curve' olmalı."}

    # Hedef branşı bul
    branch_id = args.get("branch_id")
    target_branch: dict[str, Any] | None = None
    for p in session_state.get("periods", []):
        for b in p.get("branches", []):
            if branch_id:
                if b.get("id") == str(branch_id):
                    target_branch = b
                    break
            elif b.get("is_active"):
                target_branch = b
                break
        if target_branch:
            break

    if target_branch is None:
        if branch_id:
            return {"error": f"branch_id bulunamadı: {branch_id}"}
        return {"error": "Aktif branş yok. branch_id belirtin veya önce select_branch kullanın."}

    # Cashflow snapshot'tan bu branşın pattern bilgisini al
    cashflow_snap = session_state.get("cashflow", {})
    cf_branches = cashflow_snap.get("branches", []) if isinstance(cashflow_snap, dict) else []
    cf_branch = next((b for b in cf_branches if b.get("branch_id") == target_branch.get("id")), None)

    if not cf_branch or not cf_branch.get("has_pattern"):
        return {
            "error": (
                f"'{target_branch.get('name')}' branşında cashflow pattern hesaplanmamış. "
                "Cashflow modülünde bu branşı seçip hesaplamayı çalıştırın."
            )
        }

    # Rezerv sonuçlarından per_origin al
    per_origin = target_branch.get("per_origin", []) or []
    if not per_origin:
        return {"error": "Bu branş için rezerv sonuçları yok. Rezerv modülünde üçgen yükleyin."}

    # Faiz fonksiyonu
    if rate_mode == "flat":
        flat_rate = float(args.get("flat_rate", 0.30))
        rate_label = f"%{flat_rate * 100:.1f} sabit"
    else:
        curve_nodes = args.get("curve_nodes", []) or []
        if not curve_nodes:
            return {"error": "curve_nodes boş. Eğri noktalarını belirtin: [{month: 12, rate: 0.28}, ...]"}
        rate_label = f"Eğri ({len(curve_nodes)} nokta)"

    # İskonto hesaplama (Python'da)
    discount_pct_note = (
        "Not: Detaylı aylık nakit akışı pattern bilgisi frontend'de tutulduğundan "
        "bu hesaplama per_origin ağırlıklı ortalama ay üzerinden basitleştirilmiştir. "
        "Tam sonuç için İskonto modülüne gidin."
    )

    results = []
    total_unpaid = 0.0
    total_discounted = 0.0
    total_weighted_duration = 0.0

    for row in per_origin:
        origin = str(row.get("origin", ""))
        latest = float(row.get("latest", 0) or 0)
        ibnr = float(row.get("ibnr", 0) or 0)
        unpaid = latest + ibnr

        if unpaid <= 0:
            continue

        # Pattern bilgisi olmadan duration'ı yaklaşık hesapla (CDF'ten)
        cdf = float(row.get("cdf", 1) or 1)
        pct_dev = 1 / cdf if cdf and cdf > 0 else 1
        # Gelecek ödeme ağırlığı ortalama ay: basit yaklaşım
        approx_months = 12 * (1 / pct_dev - 1) if pct_dev < 1 else 12

        if rate_mode == "flat":
            v = 1 / ((1 + flat_rate) ** (approx_months / 12))
        else:
            # Eğriden en yakın nokta
            sorted_nodes = sorted(curve_nodes, key=lambda x: x.get("month", 0))
            rate = sorted_nodes[-1].get("rate", 0.3) if sorted_nodes else 0.3
            for node in sorted_nodes:
                if approx_months >= node.get("month", 0):
                    rate = node.get("rate", 0.3)
            v = 1 / ((1 + rate) ** (approx_months / 12))

        discounted = unpaid * v
        discount_amt = unpaid - discounted
        discount_pct_val = discount_amt / unpaid if unpaid > 0 else 0

        results.append({
            "origin": origin,
            "unpaid_liability": round(unpaid),
            "approx_completion_month": round(approx_months),
            "discount_factor": round(v, 4),
            "discounted_unpaid": round(discounted),
            "discount_amount": round(discount_amt),
            "discount_pct": round(discount_pct_val * 100, 2),
        })
        total_unpaid += unpaid
        total_discounted += discounted
        total_weighted_duration += approx_months * unpaid

    total_discount = total_unpaid - total_discounted
    max_completion = max((r["approx_completion_month"] for r in results), default=0)
    total_discount_pct = total_discount / total_unpaid * 100 if total_unpaid > 0 else 0

    return {
        "branch": target_branch.get("name"),
        "branch_id": target_branch.get("id"),
        "rate_mode": rate_mode,
        "rate_label": rate_label,
        "totals": {
            "unpaid_liability": round(total_unpaid),
            "discounted_unpaid": round(total_discounted),
            "discount_amount": round(total_discount),
            "discount_pct": round(total_discount_pct, 2),
            "completion_month": max_completion,
        },
        "by_origin": results,
        "note": discount_pct_note,
        "tip": "Tam hesaplama için navigate_to(module='discount') ile İskonto modülüne gidin.",
    }


def _list_data_periods(session_state: dict[str, Any] | None) -> dict[str, Any]:
    if not session_state:
        return {"error": "Session state yok."}
    data = session_state.get("data")
    if not data:
        return {"periods": [], "note": "Veri modülü verisi henüz yüklenmemiş."}
    return data


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
