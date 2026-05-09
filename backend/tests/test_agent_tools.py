"""Agent tool testleri.

Agent tool'ları: LLM'in çağırabileceği, hesaplama çekirdeği üzerinde
güvenli özetler döndüren fonksiyonlar.

Veri gizliliği ilkesi: LLM üçgen ham verisini GÖRMEZ; tool sonucu
sadece agrega (LDF, ultimate, total reserve, özet istatistik) olur.
"""

import pytest

from app.agent.tools import (
    TOOL_SCHEMAS,
    dispatch_tool,
    get_tool_schema,
)
from app.core.triangle import Triangle, TriangleType


@pytest.fixture
def triangle() -> Triangle:
    return Triangle(
        origin_periods=[2020, 2021, 2022, 2023],
        development_periods=[1, 2, 3, 4],
        values=[
            [1000.0, 1500.0, 1700.0, 1750.0],
            [1100.0, 1600.0, 1800.0, None],
            [1200.0, 1700.0, None, None],
            [1300.0, None, None, None],
        ],
        triangle_type=TriangleType.PAID,
    )


class TestToolSchemas:
    def test_schemas_list_is_non_empty(self):
        assert len(TOOL_SCHEMAS) >= 2

    def test_each_schema_has_openai_tool_shape(self):
        for schema in TOOL_SCHEMAS:
            assert schema["type"] == "function"
            fn = schema["function"]
            assert "name" in fn
            assert "description" in fn
            assert "parameters" in fn
            assert fn["parameters"]["type"] == "object"

    def test_required_tools_are_defined(self):
        names = {s["function"]["name"] for s in TOOL_SCHEMAS}
        assert "describe_triangle" in names
        assert "run_chain_ladder" in names

    def test_get_tool_schema_by_name(self):
        schema = get_tool_schema("run_chain_ladder")
        assert schema["function"]["name"] == "run_chain_ladder"

    def test_get_unknown_tool_raises(self):
        with pytest.raises(KeyError):
            get_tool_schema("unknown_tool")


class TestDescribeTriangle:
    def test_describe_returns_basic_shape_info(self, triangle):
        out = dispatch_tool("describe_triangle", {}, triangle=triangle)
        assert out["n_origins"] == 4
        assert out["n_developments"] == 4
        assert out["triangle_type"] == "paid"
        assert out["origin_periods"] == ["2020", "2021", "2022", "2023"]
        # latest diagonal summarize amount
        assert out["latest_diagonal"] == [1750.0, 1800.0, 1700.0, 1300.0]
        assert out["total_latest"] == pytest.approx(6550.0, rel=1e-9)


class TestRunChainLadderTool:
    def test_run_with_default_method(self, triangle):
        out = dispatch_tool("run_chain_ladder", {}, triangle=triangle)
        assert out["method"] == "volume_weighted"
        assert len(out["ldfs"]) == 3
        assert out["ldfs"][0] == pytest.approx(4800 / 3300, rel=1e-9)

    def test_run_with_exclusion(self, triangle):
        out = dispatch_tool(
            "run_chain_ladder",
            {"excluded_origins": [2021]},
            triangle=triangle,
        )
        assert out["ldfs"][0] == pytest.approx(3200 / 2200, rel=1e-9)

    def test_run_with_ldf_override(self, triangle):
        out = dispatch_tool(
            "run_chain_ladder",
            {"ldf_override": [1.5, 1.1, 1.02]},
            triangle=triangle,
        )
        assert out["ldfs"] == [1.5, 1.1, 1.02]

    def test_run_with_simple_average(self, triangle):
        out = dispatch_tool(
            "run_chain_ladder",
            {"method": "simple_average"},
            triangle=triangle,
        )
        expected = (1500 / 1000 + 1600 / 1100 + 1700 / 1200) / 3
        assert out["ldfs"][0] == pytest.approx(expected, rel=1e-9)

    def test_run_output_has_totals(self, triangle):
        out = dispatch_tool("run_chain_ladder", {}, triangle=triangle)
        assert "total_ultimate" in out
        assert "total_reserve" in out
        assert "total_latest" in out
        assert "ultimate_per_origin" in out
        assert "reserve_per_origin" in out


class TestDispatchErrorHandling:
    def test_unknown_tool_name_raises(self, triangle):
        with pytest.raises(KeyError):
            dispatch_tool("nonexistent", {}, triangle=triangle)

    def test_invalid_args_return_error_result(self, triangle):
        """LLM yanlış argüman verirse exception yerine error dict dönmeli
        (LLM'in kendini düzeltmesi için)."""
        out = dispatch_tool(
            "run_chain_ladder",
            {"ldf_override": [1.5]},  # wrong length
            triangle=triangle,
        )
        assert "error" in out


class TestPrivacyGuarantee:
    def test_output_does_not_contain_raw_triangle_matrix(self, triangle):
        """Tool çıktısında ham üçgen values matrisi bulunmamalı."""
        out_describe = dispatch_tool("describe_triangle", {}, triangle=triangle)
        out_run = dispatch_tool("run_chain_ladder", {}, triangle=triangle)

        # describe_triangle özet bilgi verir, latest diagonal dahil ama
        # ham kümülatif matris içermez
        assert "values" not in out_describe
        assert "values" not in out_run
