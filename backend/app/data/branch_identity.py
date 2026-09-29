"""Canonical identity for line-of-business display names."""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Iterable


def branch_identity_key(value: object) -> str:
    text = unicodedata.normalize("NFKD", str(value or ""))
    text = "".join(char for char in text if not unicodedata.combining(char))
    text = text.replace("ı", "i").lower()
    return re.sub(r"\s+", " ", text).strip()


def same_branch_name(left: object, right: object) -> bool:
    return branch_identity_key(left) == branch_identity_key(right)


def clean_branch_display_name(value: object) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def unique_branch_names(values: Iterable[object]) -> list[str]:
    names: dict[str, str] = {}
    for value in values:
        display = clean_branch_display_name(value)
        key = branch_identity_key(display)
        if key and key not in names:
            names[key] = display
    return list(names.values())
