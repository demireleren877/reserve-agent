import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { AgentRegistryProvider, useAgentRegistry } from "@/lib/agent-registry";
import type { AgentAction } from "@/types/triangle";

const wrapper = ({ children }: { children: ReactNode }) => (
  <AgentRegistryProvider>{children}</AgentRegistryProvider>
);

function action(module: string | undefined, type: string): AgentAction {
  return { type, payload: {}, module } as AgentAction;
}

describe("AgentRegistry", () => {
  it("provider dışında kullanım hata fırlatır", () => {
    expect(() => renderHook(() => useAgentRegistry())).toThrow(
      "AgentRegistryProvider eksik",
    );
  });

  it("snapshot register/unregister modulesPayload'ı günceller", () => {
    const { result } = renderHook(() => useAgentRegistry(), { wrapper });
    const snap = { session_state: { x: 1 } };
    act(() => result.current.registerSnapshot("reserve", snap));
    expect(result.current.modulesPayload.reserve).toBe(snap);

    act(() => result.current.registerSnapshot("reserve", null));
    expect("reserve" in result.current.modulesPayload).toBe(false);
  });

  it("aynı referansla tekrar register no-op (render tetiklemez)", () => {
    const { result } = renderHook(() => useAgentRegistry(), { wrapper });
    const snap = { a: 1 };
    act(() => result.current.registerSnapshot("data", snap));
    const before = result.current.modulesPayload;
    act(() => result.current.registerSnapshot("data", snap));
    expect(result.current.modulesPayload).toBe(before);
  });

  it("dispatchActions modüle göre gruplar ve doğru handler'a iletir", () => {
    const { result } = renderHook(() => useAgentRegistry(), { wrapper });
    const reserveHandler = vi.fn();
    const cashflowHandler = vi.fn();
    act(() => {
      result.current.registerActionHandler("reserve", reserveHandler);
      result.current.registerActionHandler("cashflow", cashflowHandler);
    });

    const a1 = action("reserve", "set_window");
    const a2 = action("cashflow", "set_cashflow_window");
    const a3 = action("reserve", "set_basis");
    act(() => result.current.dispatchActions([a1, a2, a3]));

    expect(reserveHandler).toHaveBeenCalledWith([a1, a3]);
    expect(cashflowHandler).toHaveBeenCalledWith([a2]);
  });

  it("module alanı olmayan action legacy olarak reserve'e düşer", () => {
    const { result } = renderHook(() => useAgentRegistry(), { wrapper });
    const reserveHandler = vi.fn();
    act(() => result.current.registerActionHandler("reserve", reserveHandler));
    const a = action(undefined, "exclude_cells");
    act(() => result.current.dispatchActions([a]));
    expect(reserveHandler).toHaveBeenCalledWith([a]);
  });

  it("handler'ı olmayan modülün action'ı sessizce atlanır", () => {
    const { result } = renderHook(() => useAgentRegistry(), { wrapper });
    expect(() =>
      act(() =>
        result.current.dispatchActions([action("navigation", "navigate_to")]),
      ),
    ).not.toThrow();
  });

  it("unregister edilen handler artık çağrılmaz", () => {
    const { result } = renderHook(() => useAgentRegistry(), { wrapper });
    const handler = vi.fn();
    act(() => result.current.registerActionHandler("discount", handler));
    act(() => result.current.unregisterActionHandler("discount"));
    act(() =>
      result.current.dispatchActions([action("discount", "compute_discount")]),
    );
    expect(handler).not.toHaveBeenCalled();
  });

  it("panel aç/kapa toggle çalışır", () => {
    const { result } = renderHook(() => useAgentRegistry(), { wrapper });
    expect(result.current.panelOpen).toBe(false);
    act(() => result.current.togglePanel());
    expect(result.current.panelOpen).toBe(true);
    act(() => result.current.setPanelOpen(false));
    expect(result.current.panelOpen).toBe(false);
  });
});
