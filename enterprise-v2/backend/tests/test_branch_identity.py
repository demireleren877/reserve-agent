from app.data.branch_identity import (
    branch_identity_key,
    same_branch_name,
    unique_branch_names,
)


def test_case_diacritic_and_spacing_equivalence():
    groups = [
        ["fire", "FIRE", " Fire "],
        ["eren", "EREN"],
        ["İnşaat", "INSAAT", "ınşaat", "insaat"],
        ["Yangın", "YANGIN", "yangin"],
        ["Motor   Fleet", " motor fleet "],
    ]
    for group in groups:
        assert len({branch_identity_key(value) for value in group}) == 1


def test_different_names_remain_distinct():
    assert not same_branch_name("Motor", "Motor Fleet")


def test_unique_names_preserve_first_spelling():
    assert unique_branch_names(["fire", "FIRE", " Fire ", "EREN", "eren", "Motor"]) == [
        "fire", "EREN", "Motor",
    ]
