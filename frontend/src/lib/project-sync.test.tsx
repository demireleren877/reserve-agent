/**
 * Proje senkronu hata yolları.
 *
 * İki sessiz veri kaybı düzeltildi:
 *  1. Tarayıcı kotası dolunca push da atlanıyordu (aynı try içindeydi):
 *     değişiklik ne yerelde ne sunucuda saklanıyordu.
 *  2. Sunucu yazımı başarısız olunca yalnız console.error vardı: proje
 *     sunucuya gitmiyor, kullanıcıya hiçbir şey söylenmiyordu.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

vi.mock("@/lib/sync/worker-client", () => {
  class WorkerError extends Error {
    constructor(public status: number, public code: string, message?: string, public detail?: unknown) {
      super(message ?? code);
    }
  }
  return {
    fetchState: vi.fn(() => Promise.resolve({ project: null, chat: null, version: 0, updated_at: 0 })),
    putState: vi.fn(() => Promise.resolve({ version: 1, updated_at: 0 })),
    WorkerError,
    ApiError: WorkerError,
  };
});

import * as wc from "@/lib/sync/worker-client";
import { ProjectProvider, useProject } from "@/lib/project-store";

const putState = vi.mocked(wc.putState);
const WorkerError = (wc as unknown as { WorkerError: new (s: number, c: string, m?: string, d?: unknown) => Error }).WorkerError;

const wrapper = ({ children }: { children: ReactNode }) => (
  <ProjectProvider userId="u1" userName="u1@example.com">{children}</ProjectProvider>
);

async function mount() {
  const hook = renderHook(() => useProject(), { wrapper });
  await act(async () => {}); // hidrasyon
  return hook;
}

/** Son putState çağrısındaki projede verilen etiketli dönem var mı. */
function lastPushedLabels(): string[] {
  const call = putState.mock.calls.at(-1)?.[0] as { project?: { periods?: { label: string }[] } } | undefined;
  return (call?.project?.periods ?? []).map((p) => p.label);
}

const WAIT = { timeout: 6000 };

beforeEach(() => {
  localStorage.clear();
  putState.mockReset();
  putState.mockResolvedValue({ version: 1, updated_at: 0 } as never);
});
afterEach(() => vi.restoreAllMocks());

describe("proje senkronu", () => {
  it("tarayıcı kotası dolsa da değişiklik sunucuya gönderilir", async () => {
    const real = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, k: string, v: string) {
      if (k.startsWith("reserve-agent-project-v2")) throw new DOMException("full", "QuotaExceededError");
      return real.call(this, k, v);
    });
    const { result } = await mount();
    act(() => { result.current.actions.createPeriod("2026Q1"); });
    await waitFor(() => expect(lastPushedLabels()).toContain("2026Q1"), WAIT);
  }, 10_000);

  it("sunucu yazımı başarısızsa kullanıcıya söylenir, başarılı olunca uyarı kalkar", async () => {
    putState.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { result } = await mount();
    act(() => { result.current.actions.createPeriod("2026Q1"); });
    await waitFor(() => expect(result.current.syncError).toMatch(/could not be saved/), WAIT);
    expect(result.current.syncError).toMatch(/kept in this browser/);

    act(() => { result.current.actions.createPeriod("2026Q2"); });
    await waitFor(() => expect(result.current.syncError).toBeNull(), WAIT);
    expect(lastPushedLabels()).toEqual(expect.arrayContaining(["2026Q1", "2026Q2"]));
  }, 15_000);

  it("boyut sınırı aşılınca sebebi ve sınır söylenir", async () => {
    putState.mockRejectedValue(new WorkerError(413, "state_too_large", undefined, "17.0 MB > 16 MB limit"));
    const { result } = await mount();
    act(() => { result.current.actions.createPeriod("2026Q1"); });
    await waitFor(() => expect(result.current.syncError).toMatch(/too large/), WAIT);
    expect(result.current.syncError).toContain("17.0 MB > 16 MB limit");
  }, 10_000);

  it("hem yerel hem sunucu kaydı başarısızsa sekmeyi kapatmaması söylenir", async () => {
    const real = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, k: string, v: string) {
      if (k.startsWith("reserve-agent-project-v2")) throw new DOMException("full", "QuotaExceededError");
      return real.call(this, k, v);
    });
    putState.mockRejectedValue(new TypeError("Failed to fetch"));
    const { result } = await mount();
    act(() => { result.current.actions.createPeriod("2026Q1"); });
    await waitFor(() => expect(result.current.syncError).toMatch(/keep this tab open/), WAIT);
  }, 10_000);
});
