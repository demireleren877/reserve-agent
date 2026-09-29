/**
 * project-store testleri — aktif branş setter davranışı. Worker sync mock'lanır.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

vi.mock("@/lib/sync/worker-client", () => ({
  fetchState: vi.fn(() => Promise.resolve({ project: null, chat: null })),
  putState: vi.fn(() => Promise.resolve()),
  WorkerError: class WorkerError extends Error {},
}));

import {
  ProjectProvider,
  useBranchSetters,
  useProject,
} from "@/lib/project-store";

const wrapper = ({ children }: { children: ReactNode }) => (
  <ProjectProvider userId="test-user" userName="test@example.com">{children}</ProjectProvider>
);

function useHarness() {
  const proj = useProject();
  const setters = useBranchSetters("agent");
  return { proj, setters };
}

async function setupActiveBranch() {
  const hook = renderHook(() => useHarness(), { wrapper });
  // İlk yükleme effect'inin (mock fetchState) tamamlanmasını bekle
  await act(async () => {});
  act(() => {
    const pid = hook.result.current.proj.actions.createPeriod("2026Q1");
    hook.result.current.proj.actions.createBranch(pid, "yearly", "Test");
  });
  act(() => {
    const branch = hook.result.current.proj.project.periods[0].branches[0];
    hook.result.current.proj.actions.goToBranch(branch.id);
  });
  await waitFor(() =>
    expect(hook.result.current.proj.activeBranch).not.toBeNull(),
  );
  return hook;
}

beforeEach(() => localStorage.clear());

describe("temel setter davranışı", () => {
  it("setWindow aktif branşı günceller", async () => {
    const { result } = await setupActiveBranch();
    act(() => result.current.setters.setWindow(5));
    expect(result.current.proj.activeBranch!.window).toBe(5);
  });

  it("setLrInput boş formülde anahtarı siler", async () => {
    const { result } = await setupActiveBranch();
    act(() => result.current.setters.setLrInput("2023", "vw(2020:2022)"));
    expect(
      result.current.proj.activeBranch!.lrInputPerOrigin["2023"],
    ).toBe("vw(2020:2022)");
    act(() => result.current.setters.setLrInput("2023", "  "));
    expect(
      "2023" in result.current.proj.activeBranch!.lrInputPerOrigin,
    ).toBe(false);
  });

  it("setCorrection 1 veya null değerinde anahtarı siler", async () => {
    const { result } = await setupActiveBranch();
    act(() => result.current.setters.setCorrection("2026Q1", 4));
    expect(
      result.current.proj.activeBranch!.correctionPerOrigin["2026Q1"],
    ).toBe(4);
    act(() => result.current.setters.setCorrection("2026Q1", 1));
    expect(
      "2026Q1" in result.current.proj.activeBranch!.correctionPerOrigin,
    ).toBe(false);
  });
});
