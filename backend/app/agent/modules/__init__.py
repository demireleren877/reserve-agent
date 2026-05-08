"""Modül kayıt defteri. Yeni bir aktüeryal süreç (IFRS 17, ortalama muallak…)
eklemek için: kendi modülünü `app/agent/modules/<isim>.py` altında ModuleSpec
olarak yaz, sonra REGISTRY'e ekle."""

from __future__ import annotations

from app.agent.modules.base import ModuleSpec
from app.agent.modules.reserve import reserve_module

REGISTRY: dict[str, ModuleSpec] = {
    reserve_module.name: reserve_module,
}


def get_modules(active_names: list[str] | None) -> list[ModuleSpec]:
    """active_names listesine göre kayıtlı modülleri döner. None ise hepsi."""
    if active_names is None:
        return list(REGISTRY.values())
    return [REGISTRY[n] for n in active_names if n in REGISTRY]


__all__ = ["ModuleSpec", "REGISTRY", "get_modules", "reserve_module"]
