"""Test edilmeyen API endpoint'leri: cashflow upload/compute/from-triangle/
pattern-from-cdf, data inspect/import/build-triangle, prim inspect/import,
upload/premiums ve agent/chat hata dalları."""

import base64
from io import BytesIO

import pytest
from fastapi.testclient import TestClient
from openpyxl import Workbook

from app.agent.client import AgentClient
from app.firebase_auth import verify_firebase_token
from app.main import app


@pytest.fixture
def client():
    app.dependency_overrides[verify_firebase_token] = lambda: {"uid": "test"}
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(verify_firebase_token, None)


def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode()


def _xlsx_b64(rows: list[list]) -> str:
    wb = Workbook()
    ws = wb.active
    for r in rows:
        ws.append(r)
    buf = BytesIO()
    wb.save(buf)
    return _b64(buf.getvalue())


# ─── Auth ────────────────────────────────────────────────────────────────────────


class TestAuthRequired:
    def test_unauthenticated_request_rejected(self):
        """Override yokken endpoint'ler auth istemeli (401/403)."""
        with TestClient(app) as c:
            resp = c.post("/v1/agent/chat", json={"messages": []})
        assert resp.status_code in (401, 403)


# ─── Cashflow upload / compute ──────────────────────────────────────────────────


_CF_CSV = (
    "origin_year;development_date;paid\n"
    "2023;31.12.2023;1000\n"
    "2023;31.12.2024;1500\n"
    "2024;31.12.2024;1100\n"
)


class TestCashflowUpload:
    def test_valid_csv(self, client):
        resp = client.post(
            "/v1/cashflow/upload",
            json={"file_b64": _b64(_CF_CSV.encode()), "filename": "data.csv"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["record_count"] == 3
        assert data["origin_years"] == [2023, 2024]
        assert data["report_date"] == "2024-12-31"

    def test_invalid_base64(self, client):
        resp = client.post(
            "/v1/cashflow/upload", json={"file_b64": "!!!", "filename": "x.csv"}
        )
        assert resp.status_code == 400

    def test_missing_columns(self, client):
        csv = "kolon_a;kolon_b\n1;2\n"
        resp = client.post(
            "/v1/cashflow/upload",
            json={"file_b64": _b64(csv.encode()), "filename": "x.csv"},
        )
        assert resp.status_code == 400
        assert "Zorunlu sütunlar" in resp.json()["detail"]

    def test_no_valid_records(self, client):
        csv = "origin_year;development_date;paid\nabc;xyz;1\n"
        resp = client.post(
            "/v1/cashflow/upload",
            json={"file_b64": _b64(csv.encode()), "filename": "x.csv"},
        )
        assert resp.status_code == 400


class TestCashflowCompute:
    def test_empty_records_rejected(self, client):
        resp = client.post("/v1/cashflow/compute", json={"records": []})
        assert resp.status_code == 400

    def test_valid_records(self, client):
        resp = client.post(
            "/v1/cashflow/compute",
            json={"records": [
                {"origin_year": 2023, "dev_date": "2023-12-31", "paid": 1000},
                {"origin_year": 2023, "dev_date": "2024-12-31", "paid": 1500},
                {"origin_year": 2024, "dev_date": "2024-12-31", "paid": 1100},
            ]},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["origin_years"] == [2023, 2024]
        assert data["per_origin"][0]["origin_year"] == 2023
        assert "quarterly_pattern" in data and "monthly_pattern" in data

    def test_invalid_date_rejected(self, client):
        resp = client.post(
            "/v1/cashflow/compute",
            json={"records": [
                {"origin_year": 2023, "dev_date": "tarih-değil", "paid": 1},
            ]},
        )
        assert resp.status_code in (400, 500)

    def test_null_paid_treated_as_zero(self, client):
        resp = client.post(
            "/v1/cashflow/compute",
            json={"records": [
                {"origin_year": 2022, "dev_date": "2022-12-31", "paid": None},
                {"origin_year": 2022, "dev_date": "2023-12-31", "paid": 500},
                {"origin_year": 2023, "dev_date": "2023-12-31", "paid": 1000},
                {"origin_year": 2023, "dev_date": "2024-12-31", "paid": 1500},
                {"origin_year": 2024, "dev_date": "2024-12-31", "paid": 1100},
            ]},
        )
        assert resp.status_code == 200

    def test_insufficient_data_controlled_400(self, client):
        """Tek nokta — development faktörü hesaplanamaz; 500 değil 400 dönmeli."""
        resp = client.post(
            "/v1/cashflow/compute",
            json={"records": [
                {"origin_year": 2023, "dev_date": "2023-12-31", "paid": 100},
            ]},
        )
        assert resp.status_code == 400
        assert "yetersiz veri" in resp.json()["detail"]


class TestCashflowFromTriangle:
    def test_valid_triangle(self, client):
        resp = client.post(
            "/v1/cashflow/from-triangle",
            json={
                "origin_periods": ["2022", "2023"],
                "development_periods": ["1", "2"],
                "values": [[1000.0, 1500.0], [1100.0, None]],
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["origin_years"] == [2022, 2023]

    def test_report_date_override(self, client):
        resp = client.post(
            "/v1/cashflow/from-triangle",
            json={
                "origin_periods": ["2022", "2023"],
                "development_periods": ["1", "2"],
                "values": [[1000.0, 1500.0], [1100.0, None]],
                "report_date": "2024-06-30",
            },
        )
        assert resp.status_code == 200
        assert resp.json()["report_date"] == "2024-06-30"

    def test_empty_values_rejected(self, client):
        resp = client.post(
            "/v1/cashflow/from-triangle",
            json={
                "origin_periods": ["2022"],
                "development_periods": ["1"],
                "values": [[None]],
            },
        )
        assert resp.status_code == 400


class TestCashflowPatternFromCdf:
    def test_valid(self, client):
        resp = client.post(
            "/v1/cashflow/pattern-from-cdf",
            json={
                "origin_years": [2023, 2024],
                "report_date": "2024-12-31",
                "selected_cdfs": [2.0, 1.5, 1.2, 1.0],
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "2023" in data["quarterly_pattern"]
        assert data["report_date"] == "2024-12-31"

    def test_missing_keys_rejected(self, client):
        resp = client.post(
            "/v1/cashflow/pattern-from-cdf", json={"origin_years": [2023]}
        )
        assert resp.status_code == 400


# ─── Data (hasar) endpoints ─────────────────────────────────────────────────────


_HASAR_CSV = (
    "Dosya No;Brans;Hasar Tarihi;Gelisim Tarihi;Odeme;Muallak\n"
    "D1;Yangin;15.03.2023;31.12.2023;1000;500\n"
    "D2;Yangin;10.06.2023;31.12.2023;2000;0\n"
    "D1;Kasko;01.01.2024;31.12.2024;300;100\n"
)

_HASAR_MAPPING = {
    "dosya_no": "Dosya No", "brans": "Brans",
    "hasar_tarihi": "Hasar Tarihi", "gelisim_tarihi": "Gelisim Tarihi",
    "odeme": "Odeme", "muallak": "Muallak",
}


class TestDataInspect:
    def test_csv_inspect_suggests_mapping(self, client):
        resp = client.post(
            "/v1/data/inspect",
            json={"file_b64": _b64(_HASAR_CSV.encode()), "filename": "h.csv"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["sheets"] == [None]
        # JSON'da None dict anahtarı "None" string'ine serileşir
        sugg = data["suggested_mapping"]["None"]
        assert sugg["dosya_no"] == "Dosya No"
        assert sugg["brans"] == "Brans"

    def test_excel_inspect(self, client):
        b64 = _xlsx_b64([
            ["Dosya No", "Brans", "Hasar Tarihi", "Gelisim Tarihi", "Odeme", "Muallak"],
            ["D1", "Yangin", "15.03.2023", "31.12.2023", 1000, 500],
        ])
        resp = client.post(
            "/v1/data/inspect", json={"file_b64": b64, "filename": "h.xlsx"}
        )
        assert resp.status_code == 200
        assert resp.json()["sheets"] == ["Sheet"]

    def test_invalid_base64(self, client):
        # "a" → binascii.Error (geçersiz uzunluk); "!!!" gibi girdiler boş
        # byte'a decode olur ve 200 döner — gerçek geçersizlik budur.
        resp = client.post(
            "/v1/data/inspect", json={"file_b64": "a", "filename": "h.csv"}
        )
        assert resp.status_code == 400


class TestDataImport:
    def test_valid_import(self, client):
        resp = client.post(
            "/v1/data/import",
            json={
                "file_b64": _b64(_HASAR_CSV.encode()),
                "filename": "h.csv",
                "column_mapping": _HASAR_MAPPING,
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["record_count"] == 3
        assert data["brans_list"] == ["Kasko", "Yangin"]
        assert data["total_odeme"] == 3300.0
        assert data["hasar_tarihi_min"] == "2023-03-15"

    def test_missing_mapping_field(self, client):
        mapping = {k: v for k, v in _HASAR_MAPPING.items() if k != "odeme"}
        resp = client.post(
            "/v1/data/import",
            json={"file_b64": _b64(_HASAR_CSV.encode()), "filename": "h.csv",
                  "column_mapping": mapping},
        )
        assert resp.status_code == 400
        assert "odeme" in resp.json()["detail"]

    def test_unknown_column(self, client):
        mapping = {**_HASAR_MAPPING, "odeme": "Olmayan Kolon"}
        resp = client.post(
            "/v1/data/import",
            json={"file_b64": _b64(_HASAR_CSV.encode()), "filename": "h.csv",
                  "column_mapping": mapping},
        )
        assert resp.status_code == 400
        assert "bulunamadı" in resp.json()["detail"]

    def test_bad_date_includes_row_number(self, client):
        csv = (
            "Dosya No;Brans;Hasar Tarihi;Gelisim Tarihi;Odeme;Muallak\n"
            "D1;Yangin;tarih-değil;31.12.2023;1000;500\n"
        )
        resp = client.post(
            "/v1/data/import",
            json={"file_b64": _b64(csv.encode()), "filename": "h.csv",
                  "column_mapping": _HASAR_MAPPING},
        )
        assert resp.status_code == 400
        assert "Satır 2" in resp.json()["detail"]


class TestBuildTriangle:
    _RECORDS = [
        {"dosya_no": "D1", "brans": "Yangin", "hasar_tarihi": "2022-03-15",
         "gelisim_tarihi": "2022-12-31", "odeme": 1000, "muallak": 500},
        {"dosya_no": "D1", "brans": "Yangin", "hasar_tarihi": "2022-03-15",
         "gelisim_tarihi": "2023-12-31", "odeme": 400, "muallak": 100},
        {"dosya_no": "D2", "brans": "Yangin", "hasar_tarihi": "2023-05-10",
         "gelisim_tarihi": "2023-12-31", "odeme": 700, "muallak": 200},
    ]

    def test_builds_paid_incurred_count(self, client):
        resp = client.post(
            "/v1/data/build-triangle",
            json={"records": self._RECORDS, "brans": "Yangin"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["paid_triangle"]["origin_periods"] == ["2022", "2023"]
        # paid kümülatif: 2022 → [1000, 1400]
        assert data["paid_triangle"]["values"][0] == [1000.0, 1400.0]
        # incurred = kümülatif ödeme + muallak: [1500, 1500]
        assert data["incurred_triangle"]["values"][0] == [1500.0, 1500.0]
        assert data["count_triangle"]["values"][0][0] == 1.0

    def test_unknown_brans_rejected(self, client):
        resp = client.post(
            "/v1/data/build-triangle",
            json={"records": self._RECORDS, "brans": "Olmayan"},
        )
        assert resp.status_code == 400


# ─── Prim endpoints ─────────────────────────────────────────────────────────────


_PRIM_CSV = "Brans,Donem,EP\nYangin,2022,5000\nYangin,2023Q1,1500\n"
_PRIM_MAPPING = {"brans": "Brans", "donem": "Donem", "ep": "EP"}


class TestPrimEndpoints:
    def test_inspect_prim(self, client):
        resp = client.post(
            "/v1/data/inspect-prim",
            json={"file_b64": _b64(_PRIM_CSV.encode()), "filename": "p.csv"},
        )
        assert resp.status_code == 200
        sugg = resp.json()["suggested_mapping"]["null"]
        assert sugg == {"brans": "Brans", "donem": "Donem", "ep": "EP"}

    def test_import_prim(self, client):
        resp = client.post(
            "/v1/data/import-prim",
            json={"file_b64": _b64(_PRIM_CSV.encode()), "filename": "p.csv",
                  "column_mapping": _PRIM_MAPPING},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["record_count"] == 2
        assert data["total_ep"] == 6500.0
        assert data["donem_list"] == ["2022", "2023Q1"]

    def test_import_prim_missing_mapping(self, client):
        resp = client.post(
            "/v1/data/import-prim",
            json={"file_b64": _b64(_PRIM_CSV.encode()), "filename": "p.csv",
                  "column_mapping": {"brans": "Brans"}},
        )
        assert resp.status_code == 400

    def test_import_prim_unknown_column(self, client):
        resp = client.post(
            "/v1/data/import-prim",
            json={"file_b64": _b64(_PRIM_CSV.encode()), "filename": "p.csv",
                  "column_mapping": {**_PRIM_MAPPING, "ep": "Yok"}},
        )
        assert resp.status_code == 400


class TestUploadPremiums:
    def test_valid_xlsx(self, client):
        b64 = _xlsx_b64([["Origin", "Premium"], [2022, 5000], [2023, 6000]])
        resp = client.post("/v1/upload/premiums", json={"file_b64": b64})
        assert resp.status_code == 200
        prem = resp.json()["premiums"]
        assert prem["2022"] == 5000

    def test_invalid_magic_rejected(self, client):
        resp = client.post(
            "/v1/upload/premiums", json={"file_b64": _b64(b"duz metin")}
        )
        assert resp.status_code == 400

    def test_invalid_granularity_rejected(self, client):
        b64 = _xlsx_b64([["Origin", "Premium"], [2022, 5000]])
        resp = client.post(
            "/v1/upload/premiums",
            json={"file_b64": b64, "origin_granularity": "aylik"},
        )
        assert resp.status_code == 400


# ─── Agent chat hata dalları ────────────────────────────────────────────────────


class TestAgentChatErrors:
    def test_invalid_triangle_returns_400(self, client, monkeypatch):
        monkeypatch.setattr(AgentClient, "__init__", lambda self, **kw: None)
        resp = client.post(
            "/v1/agent/chat",
            json={
                "messages": [{"role": "user", "content": "x"}],
                "modules": {"reserve": {"triangle": {
                    "origin_periods": ["2020"],
                    "development_periods": [1, 2],
                    "values": [[1.0]],  # boyut uyumsuz
                }}},
            },
        )
        assert resp.status_code == 400

    def test_agent_exception_returns_502(self, client, monkeypatch):
        monkeypatch.setattr(AgentClient, "__init__", lambda self, **kw: None)

        def boom(self, messages, tools):
            raise RuntimeError("LLM down")

        monkeypatch.setattr(AgentClient, "chat", boom)
        resp = client.post(
            "/v1/agent/chat",
            json={"messages": [{"role": "user", "content": "x"}]},
        )
        assert resp.status_code == 502
        assert "Agent hatası" in resp.json()["detail"]

    def test_full_history_round_trip(self, client, monkeypatch):
        monkeypatch.setattr(AgentClient, "__init__", lambda self, **kw: None)
        monkeypatch.setattr(
            AgentClient, "chat",
            lambda self, messages, tools: {"content": "ok", "tool_calls": []},
        )
        resp = client.post(
            "/v1/agent/chat",
            json={
                "messages": [{"role": "user", "content": "yeni"}],
                "full_history": [
                    {"role": "user", "content": "eski"},
                    {"role": "assistant", "content": "eski cevap"},
                ],
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["assistant_message"] == "ok"
        assert data["raw_additions"][-1]["content"] == "ok"
