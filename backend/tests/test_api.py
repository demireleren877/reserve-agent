"""FastAPI endpoint testleri.

API stateless: frontend triangle state'i tutar, her compute'ta gönderir.
Bu sayede reproducibility ve kolay test sağlanır.
"""

import base64
from io import BytesIO

import pytest
from fastapi.testclient import TestClient
from openpyxl import Workbook

from app.firebase_auth import verify_firebase_token
from app.main import app


@pytest.fixture
def client() -> TestClient:
    # Auth dependency'sini override et — endpoint testleri token doğrulamasına takılmasın
    app.dependency_overrides[verify_firebase_token] = lambda: {"uid": "test"}
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(verify_firebase_token, None)


@pytest.fixture
def sample_xlsx_b64() -> str:
    wb = Workbook()
    ws = wb.active
    ws.append(["Origin", 1, 2, 3, 4])
    ws.append([2020, 1000, 1500, 1700, 1750])
    ws.append([2021, 1100, 1600, 1800, None])
    ws.append([2022, 1200, 1700, None, None])
    ws.append([2023, 1300, None, None, None])
    buf = BytesIO()
    wb.save(buf)
    return base64.b64encode(buf.getvalue()).decode()


@pytest.fixture
def sample_triangle_payload() -> dict:
    return {
        "origin_periods": ["2020", "2021", "2022", "2023"],
        "development_periods": [1, 2, 3, 4],
        "values": [
            [1000.0, 1500.0, 1700.0, 1750.0],
            [1100.0, 1600.0, 1800.0, None],
            [1200.0, 1700.0, None, None],
            [1300.0, None, None, None],
        ],
        "triangle_type": "paid",
    }


class TestUploadEndpoint:
    def test_upload_valid_xlsx_returns_triangle_json(self, client, sample_xlsx_b64):
        response = client.post(
            "/v1/upload",
            json={"file_b64": sample_xlsx_b64, "triangle_type": "paid"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["triangle"]["origin_periods"] == ["2020", "2021", "2022", "2023"]
        # Parser uses 0-based dev period indices.
        assert data["triangle"]["development_periods"] == [0, 1, 2, 3]
        assert data["triangle"]["values"][0][0] == 1000.0
        assert data["triangle"]["values"][3][1] is None

    def test_upload_without_body_returns_422(self, client):
        # No JSON body at all → Pydantic validation fails.
        response = client.post("/v1/upload")
        assert response.status_code == 422

    def test_upload_invalid_xlsx_returns_400(self, client):
        # Valid base64 but not a valid xlsx → parser raises ParseError → 400.
        bogus_b64 = base64.b64encode(b"not a valid xlsx").decode()
        response = client.post(
            "/v1/upload",
            json={"file_b64": bogus_b64},
        )
        assert response.status_code == 400
        assert "detail" in response.json()

    def test_upload_accepts_incurred_type(self, client, sample_xlsx_b64):
        response = client.post(
            "/v1/upload",
            json={"file_b64": sample_xlsx_b64, "triangle_type": "incurred"},
        )
        assert response.status_code == 200
        assert response.json()["triangle"]["triangle_type"] == "incurred"


class TestComputeEndpoint:
    def test_compute_volume_weighted_basic(self, client, sample_triangle_payload):
        response = client.post(
            "/v1/compute",
            json={
                "triangle": sample_triangle_payload,
                "method": "volume_weighted",
            },
        )
        assert response.status_code == 200
        result = response.json()
        assert len(result["ldfs"]) == 3
        assert result["ldfs"][0] == pytest.approx(4800 / 3300, rel=1e-9)
        assert result["total_reserve"] > 0

    def test_compute_with_exclusion(self, client, sample_triangle_payload):
        response = client.post(
            "/v1/compute",
            json={
                "triangle": sample_triangle_payload,
                "method": "volume_weighted",
                "excluded_origins": ["2021"],
            },
        )
        assert response.status_code == 200
        result = response.json()
        # 2021 hariç: dev 1->2 LDF = (1500+1700)/(1000+1200)
        assert result["ldfs"][0] == pytest.approx(3200 / 2200, rel=1e-9)

    def test_compute_with_ldf_override(self, client, sample_triangle_payload):
        response = client.post(
            "/v1/compute",
            json={
                "triangle": sample_triangle_payload,
                "ldf_override": [1.5, 1.1, 1.02],
            },
        )
        assert response.status_code == 200
        result = response.json()
        assert result["ldfs"] == [1.5, 1.1, 1.02]

    def test_compute_invalid_triangle_returns_400(self, client):
        bad = {
            "origin_periods": ["2020", "2020"],  # duplicate
            "development_periods": [1, 2],
            "values": [[100.0, 150.0], [110.0, None]],
            "triangle_type": "paid",
        }
        response = client.post("/v1/compute", json={"triangle": bad})
        assert response.status_code == 400

    def test_compute_with_n_years(self, client, sample_triangle_payload):
        response = client.post(
            "/v1/compute",
            json={
                "triangle": sample_triangle_payload,
                "method": "volume_weighted",
                "n_years": 2,
            },
        )
        assert response.status_code == 200
        result = response.json()
        # son 2 yıl → 2022,2023; dev 1->2'de 2023 dev 2 yok, fiilen 2021,2022 kullanılır
        assert result["ldfs"][0] == pytest.approx(3300 / 2300, rel=1e-9)

    def test_compute_simple_average_method(self, client, sample_triangle_payload):
        response = client.post(
            "/v1/compute",
            json={
                "triangle": sample_triangle_payload,
                "method": "simple_average",
            },
        )
        assert response.status_code == 200
        result = response.json()
        expected = (1500 / 1000 + 1600 / 1100 + 1700 / 1200) / 3
        assert result["ldfs"][0] == pytest.approx(expected, rel=1e-9)


class TestEndToEndFlow:
    def test_upload_then_compute(self, client, sample_xlsx_b64):
        """Frontend davranışı: önce upload, gelen triangle'ı compute'a yolla."""
        up = client.post("/v1/upload", json={"file_b64": sample_xlsx_b64})
        assert up.status_code == 200
        triangle = up.json()["triangle"]

        comp = client.post(
            "/v1/compute",
            json={"triangle": triangle, "method": "volume_weighted"},
        )
        assert comp.status_code == 200
        assert comp.json()["total_reserve"] > 0
