"""AgentClient testleri — OpenAI SDK mock'lanır; normalize yanıt sözleşmesi
(content + ToolCall listesi) ve hatalı tool argüman JSON'unun yutulması."""

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from app.agent.client import DEFAULT_MODEL, AgentClient, ToolCall


def _fake_openai_response(content=None, tool_calls=None):
    msg = SimpleNamespace(content=content, tool_calls=tool_calls)
    return SimpleNamespace(choices=[SimpleNamespace(message=msg)])


def _fake_tool_call(id_: str, name: str, arguments: str):
    return SimpleNamespace(
        id=id_, function=SimpleNamespace(name=name, arguments=arguments)
    )


@pytest.fixture
def client() -> AgentClient:
    c = AgentClient(api_key="test-key", model="test/model")
    c._client = MagicMock()
    return c


class TestAgentClientInit:
    def test_explicit_model_wins(self):
        assert AgentClient(api_key="k", model="x/y").model == "x/y"

    def test_env_model_fallback(self, monkeypatch):
        monkeypatch.setenv("OPENROUTER_MODEL", "env/model")
        assert AgentClient(api_key="k").model == "env/model"

    def test_default_model(self, monkeypatch):
        monkeypatch.delenv("OPENROUTER_MODEL", raising=False)
        assert AgentClient(api_key="k", model=None).model == DEFAULT_MODEL


class TestAgentClientChat:
    def test_plain_content_no_tools(self, client):
        client._client.chat.completions.create.return_value = (
            _fake_openai_response(content="merhaba")
        )
        out = client.chat(messages=[{"role": "user", "content": "x"}], tools=[])
        assert out == {"content": "merhaba", "tool_calls": []}

    def test_tool_calls_parsed(self, client):
        client._client.chat.completions.create.return_value = _fake_openai_response(
            content=None,
            tool_calls=[
                _fake_tool_call("t1", "list_project", '{"a": 1}'),
                _fake_tool_call("t2", "describe_triangle", ""),
            ],
        )
        out = client.chat(messages=[], tools=[])
        assert out["tool_calls"] == [
            ToolCall(id="t1", name="list_project", arguments={"a": 1}),
            ToolCall(id="t2", name="describe_triangle", arguments={}),
        ]

    def test_invalid_json_arguments_become_empty_dict(self, client):
        """LLM bozuk JSON üretirse crash yerine boş argüman."""
        client._client.chat.completions.create.return_value = _fake_openai_response(
            tool_calls=[_fake_tool_call("t1", "simulate_bf", "{bozuk json")],
        )
        out = client.chat(messages=[], tools=[])
        assert out["tool_calls"][0].arguments == {}

    def test_model_and_tools_passed_through(self, client):
        client._client.chat.completions.create.return_value = (
            _fake_openai_response(content="ok")
        )
        tools = [{"type": "function", "function": {"name": "t"}}]
        msgs = [{"role": "user", "content": "x"}]
        client.chat(messages=msgs, tools=tools)
        kwargs = client._client.chat.completions.create.call_args.kwargs
        assert kwargs["model"] == "test/model"
        assert kwargs["messages"] is msgs
        assert kwargs["tools"] is tools
