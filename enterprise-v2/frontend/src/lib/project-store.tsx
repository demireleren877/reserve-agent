"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { FileData, LDFMethod } from "@/types/triangle";
import {
  type Branch,
  type ChangeSource,
  type Frequency,
  type HistoryEntry,
  type LargeModel,
  type NavLevel,
  type Period,
  type Project,
  type UploadSettings,
  type Window,
  makeBranch,
  makePeriod,
  newId,
} from "@/types/project";
import {
  fetchState,
  putState,
  ApiError as WorkerError,
} from "@/lib/sync/worker-client";
import { mergeProjects } from "@/lib/project-merge";
import { CHAT_CHANGED_EVENT } from "@/lib/chat-storage";

const STORAGE_KEY_PREFIX = "reserve-agent-project-v2";
const CHAT_STORAGE_KEY_PREFIX = "reserve-agent-chat-v1";
const MAX_HISTORY = 500;
const SYNC_DEBOUNCE_MS = 1500;

const EMPTY: Project = {
  periods: [],
  activePeriodId: null,
  activeFrequency: null,
  activeBranchId: null,
};

export interface CopyAssumptionsOptions {
  excludedCells?: boolean;
  window?: boolean;
  premiums?: boolean;
  lrFormulas?: boolean;
  corrections?: boolean;
  basis?: boolean;
  curve?: boolean;
}

interface ProjectActions {
  createPeriod(label: string): string;
  deletePeriod(periodId: string): void;
  renamePeriod(periodId: string, label: string): void;
  createBranch(periodId: string, frequency: Frequency, name: string): string;
  deleteBranch(branchId: string): void;
  renameBranch(branchId: string, name: string): void;
  copyBranch(branchId: string, targetPeriodId: string, newName: string, targetFrequency?: Frequency): string;
  moveBranch(branchId: string, targetPeriodId: string, targetFrequency?: Frequency): void;
  goRoot(): void;
  goToPeriod(periodId: string): void;
  goToFrequency(freq: Frequency): void;
  goToBranch(branchId: string): void;
  goUp(): void;
  updateActiveBranch(
    updater: (prev: Branch) => Partial<Branch>,
    action: string,
    details?: Record<string, unknown>,
    source?: ChangeSource,
  ): void;
  updateBranch(
    branchId: string,
    updater: (prev: Branch) => Partial<Branch>,
    action: string,
    details?: Record<string, unknown>,
    source?: ChangeSource,
  ): void;
  copyAssumptions(sourceBranchId: string, targetBranchId: string, opts: CopyAssumptionsOptions): void;
  clearAll(): void;
  undo(): void;
  canUndo: boolean;
}

interface Ctx {
  project: Project;
  navLevel: NavLevel;
  activePeriod: Period | null;
  activeBranch: Branch | null;
  branchesForActiveFrequency: Branch[];
  actions: ProjectActions;
  canUndo: boolean;
  /** Aktif model başkasınca kilitliyken yazmayı engelle (salt okunur) */
  setReadOnly: (v: boolean) => void;
}

const ProjectCtx = createContext<Ctx | null>(null);

const MAX_UNDO = 20;

interface ProjectProviderProps {
  children: ReactNode;
  /** Required — scopes localStorage cache and Worker sync to a single user. */
  userId: string;
}

export function ProjectProvider({ children, userId }: ProjectProviderProps) {
  const [project, setProject] = useState<Project>(EMPTY);
  const [hydrated, setHydrated] = useState(false);
  const undoStackRef = useRef<Project[]>([]);
  const [undoDepth, setUndoDepth] = useState(0);

  const projectKey = `${STORAGE_KEY_PREFIX}:${userId}`;

  // Refs for the debounced worker sync. We don't want stale closures.
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSerializedRef = useRef<string>("");
  // Çok kullanıcı senkron: son sunucu durumu (3-yollu merge tabanı) + versiyon + push kilidi
  const baseRef = useRef<Project | null>(null);
  const versionRef = useRef<number>(0);
  const pushingRef = useRef<boolean>(false);
  // Model kilidi başkasındaysa aktif branch'e yazma engellenir (salt okunur)
  const readOnlyRef = useRef<boolean>(false);
  const setReadOnly = useCallback((v: boolean) => { readOnlyRef.current = v; }, []);

  // Wrap setProject to push undo snapshots for destructive ops
  function setProjectWithUndo(updater: (prev: Project) => Project) {
    setProject((prev) => {
      undoStackRef.current = [...undoStackRef.current, prev].slice(-MAX_UNDO);
      setUndoDepth(undoStackRef.current.length);
      return updater(prev);
    });
  }

  // Initial load: try Worker first, fall back to localStorage cache.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setHydrated(false);

    (async () => {
      let serverProject: Project | null = null;

      try {
        const remote = await fetchState<Project, null>();
        if (cancelled) return;
        if (remote.project && Array.isArray((remote.project as Project).periods)) {
          serverProject = remote.project as Project;
        }
        baseRef.current = serverProject;      // 3-yollu merge tabanı
        versionRef.current = remote.version;  // optimistic versiyon
      } catch (e) {
        if (!(e instanceof WorkerError)) console.error("worker fetch failed", e);
      }

      if (cancelled) return;

      // Project: server wins if present, else fall back to localStorage cache.
      if (serverProject) {
        setProject(serverProject);
      } else {
        try {
          const raw = localStorage.getItem(projectKey);
          if (raw) {
            const parsed = JSON.parse(raw) as Project;
            if (parsed && Array.isArray(parsed.periods)) setProject(parsed);
          }
        } catch {
          /* ignore */
        }
      }

      // Seed lastSerialized so we don't immediately PUT what we just GOT.
      try {
        lastSerializedRef.current = localStorage.getItem(projectKey) ?? "";
      } catch {
        /* ignore */
      }

      setHydrated(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, projectKey]);

  // Persist project to localStorage cache + schedule worker sync on change.
  useEffect(() => {
    if (!hydrated || !userId) return;
    try {
      localStorage.setItem(projectKey, JSON.stringify(project));
    } catch {
      /* quota — silent */
    }
    schedulePush();
    // schedulePush is stable via refs; we intentionally exclude it from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, hydrated, userId, projectKey]);

  // Chat değişikliklerini dinle — sadece project sync'i tetiklemek için (chat kendisi gönderilmez).
  useEffect(() => {
    if (!hydrated || !userId) return;
    window.addEventListener(CHAT_CHANGED_EVENT, schedulePush);
    return () => window.removeEventListener(CHAT_CHANGED_EVENT, schedulePush);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, userId]);

  function schedulePush() {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(pushNow, SYNC_DEBOUNCE_MS);
  }

  async function pushNow() {
    if (!userId || pushingRef.current) return;
    let projectStr = "";
    try {
      projectStr = localStorage.getItem(projectKey) ?? "";
    } catch {
      return;
    }
    if (projectStr === lastSerializedRef.current) {
      return; // nothing actually changed
    }
    if (!projectStr) return;
    pushingRef.current = true;
    try {
      const mine = JSON.parse(projectStr) as Project;
      try {
        const res = await putState({ project: mine, expectedVersion: versionRef.current });
        versionRef.current = res.version;
        baseRef.current = mine;
        lastSerializedRef.current = projectStr;
      } catch (e) {
        if (e instanceof WorkerError && e.status === 409) {
          // Başkası bu arada yazmış → sunucuyu çek, branch-düzeyi birleştir, tekrar dene
          const remote = await fetchState<Project, null>();
          const theirs = (remote.project as Project) ?? EMPTY;
          const merged = mergeProjects(baseRef.current, mine, theirs);
          baseRef.current = theirs;
          versionRef.current = remote.version;
          try {
            const res2 = await putState({ project: merged, expectedVersion: versionRef.current });
            versionRef.current = res2.version;
            baseRef.current = merged;
          } catch {
            /* ikinci çakışma — bir sonraki değişiklikte tekrar denenir */
          }
          const mergedStr = JSON.stringify(merged);
          lastSerializedRef.current = mergedStr;
          setProject(merged); // başkasının değişikliklerini de ekranıma getir
        } else {
          console.error("worker push failed", e);
        }
      }
    } finally {
      pushingRef.current = false;
    }
  }

  // Sunucudan tazele + branch-düzeyi birleştir (poll ve kilit-alındı olayı kullanır).
  const syncFromServer = useCallback(async () => {
    if (pushingRef.current) return;
    try {
      const remote = await fetchState<Project, null>();
      if (remote.version === versionRef.current) return; // değişiklik yok
      const theirs = (remote.project as Project) ?? EMPTY;
      let localStr = "";
      try { localStr = localStorage.getItem(projectKey) ?? ""; } catch { return; }
      const mine = localStr ? (JSON.parse(localStr) as Project) : EMPTY;
      const merged = mergeProjects(baseRef.current, mine, theirs);
      baseRef.current = theirs;
      versionRef.current = remote.version;
      if (JSON.stringify(merged) !== localStr) {
        setProject(merged); // yerelde değişiklik varsa persist efekti geri push'lar
      }
    } catch {
      /* geçici hata — sonraki tur */
    }
  }, [projectKey]);

  // Canlı senkron: 15 sn'de bir + kilit alındığında hemen (kilit sahibi hep en
  // güncel veriyi düzenlesin → donmuş sekme kaynaklı aynı-branş kaybını da kapatır).
  useEffect(() => {
    if (!hydrated || !userId) return;
    const id = setInterval(syncFromServer, 15_000);
    const onLockAcquired = () => { void syncFromServer(); };
    window.addEventListener("model-lock-acquired", onLockAcquired);
    return () => {
      clearInterval(id);
      window.removeEventListener("model-lock-acquired", onLockAcquired);
    };
  }, [hydrated, userId, syncFromServer]);

  // Flush on tab close so we don't lose the last edit.
  useEffect(() => {
    if (!hydrated) return;
    function onBeforeUnload() {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
        // sendBeacon would be ideal, but we can't easily attach Bearer tokens
        // to it, so we fall back to a fire-and-forget fetch. The browser may
        // cancel it, but in most cases the request goes through.
        void pushNow();
      }
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  // Cmd/Ctrl+Z → undo
  useEffect(() => {
    function onKeyDown(e: globalThis.KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        const stack = undoStackRef.current;
        if (!stack.length) return;
        e.preventDefault();
        const prev = stack[stack.length - 1];
        undoStackRef.current = stack.slice(0, -1);
        setUndoDepth(undoStackRef.current.length);
        setProject(prev);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const activePeriod = useMemo(
    () =>
      project.activePeriodId
        ? project.periods.find((p) => p.id === project.activePeriodId) ?? null
        : null,
    [project],
  );

  const branchesForActiveFrequency = useMemo(() => {
    if (!activePeriod || !project.activeFrequency) return [];
    return activePeriod.branches.filter(
      (b) => b.frequency === project.activeFrequency,
    );
  }, [activePeriod, project.activeFrequency]);

  const activeBranch = useMemo(
    () =>
      activePeriod && project.activeBranchId
        ? activePeriod.branches.find((b) => b.id === project.activeBranchId) ??
          null
        : null,
    [activePeriod, project.activeBranchId],
  );

  const navLevel: NavLevel = useMemo(() => {
    if (project.activeBranchId && activeBranch) return "branch";
    if (project.activeFrequency) return "frequency";
    if (project.activePeriodId) return "period";
    return "root";
  }, [
    project.activePeriodId,
    project.activeFrequency,
    project.activeBranchId,
    activeBranch,
  ]);

  const actions = useMemo<ProjectActions>(
    () => ({
      createPeriod(label) {
        const p = makePeriod(label);
        setProject((prev) => ({
          ...prev,
          periods: [...prev.periods, p],
          activePeriodId: p.id,
          activeFrequency: null,
          activeBranchId: null,
        }));
        return p.id;
      },
      deletePeriod(periodId) {
        setProjectWithUndo((prev) => {
          const remaining = prev.periods.filter((p) => p.id !== periodId);
          return {
            ...prev,
            periods: remaining,
            activePeriodId:
              prev.activePeriodId === periodId ? null : prev.activePeriodId,
            activeFrequency: null,
            activeBranchId: null,
          };
        });
      },
      renamePeriod(periodId, label) {
        setProject((prev) => ({
          ...prev,
          periods: prev.periods.map((p) =>
            p.id === periodId ? { ...p, label } : p,
          ),
        }));
      },
      createBranch(periodId, frequency, name) {
        const b = makeBranch(name, frequency);
        setProject((prev) => ({
          ...prev,
          periods: prev.periods.map((p) =>
            p.id === periodId
              ? { ...p, branches: [...p.branches, b] }
              : p,
          ),
          activePeriodId: periodId,
          activeFrequency: frequency,
          activeBranchId: b.id,
        }));
        return b.id;
      },
      deleteBranch(branchId) {
        setProjectWithUndo((prev) => {
          const periods = prev.periods.map((p) => ({
            ...p,
            branches: p.branches.filter((b) => b.id !== branchId),
          }));
          return {
            ...prev,
            periods,
            activeBranchId:
              prev.activeBranchId === branchId ? null : prev.activeBranchId,
          };
        });
      },
      renameBranch(branchId, name) {
        setProject((prev) => ({
          ...prev,
          periods: prev.periods.map((p) => ({
            ...p,
            branches: p.branches.map((b) =>
              b.id === branchId
                ? { ...b, name, updatedAt: new Date().toISOString() }
                : b,
            ),
          })),
        }));
      },
      copyBranch(branchId, targetPeriodId, newName, targetFrequency) {
        const newBranchId = newId();
        const now = new Date().toISOString();
        setProjectWithUndo((prev) => {
          let src: Branch | null = null;
          for (const p of prev.periods) {
            const found = p.branches.find((b) => b.id === branchId);
            if (found) { src = found; break; }
          }
          if (!src) return prev;
          const newBranch: Branch = {
            ...src,
            id: newBranchId,
            name: newName,
            frequency: targetFrequency ?? src.frequency,
            createdAt: now,
            updatedAt: now,
            history: [{
              id: newId(),
              timestamp: now,
              action: "branch_copied",
              source: "user",
              details: { from: src.name, originalId: src.id },
            }],
          };
          return {
            ...prev,
            periods: prev.periods.map((p) =>
              p.id === targetPeriodId
                ? { ...p, branches: [...p.branches, newBranch] }
                : p,
            ),
          };
        });
        return newBranchId;
      },
      moveBranch(branchId, targetPeriodId, targetFrequency) {
        setProjectWithUndo((prev) => {
          let movingBranch: Branch | null = null;
          let sourcePeriodId: string | null = null;
          for (const p of prev.periods) {
            const found = p.branches.find((b) => b.id === branchId);
            if (found) { movingBranch = found; sourcePeriodId = p.id; break; }
          }
          if (!movingBranch || !sourcePeriodId) return prev;
          const sameLocation =
            sourcePeriodId === targetPeriodId &&
            (!targetFrequency || targetFrequency === movingBranch.frequency);
          if (sameLocation) return prev;
          const updated: Branch = targetFrequency
            ? { ...movingBranch, frequency: targetFrequency }
            : movingBranch;
          const samePeriod = sourcePeriodId === targetPeriodId;
          return {
            ...prev,
            periods: prev.periods.map((p) => {
              if (samePeriod) {
                // Same period, only frequency changes — update in place
                if (p.id === sourcePeriodId)
                  return { ...p, branches: p.branches.map((b) => b.id === branchId ? updated : b) };
                return p;
              }
              // Cross-period move
              if (p.id === sourcePeriodId)
                return { ...p, branches: p.branches.filter((b) => b.id !== branchId) };
              if (p.id === targetPeriodId)
                return { ...p, branches: [...p.branches, updated] };
              return p;
            }),
            activePeriodId:
              prev.activeBranchId === branchId ? targetPeriodId : prev.activePeriodId,
            activeFrequency:
              prev.activeBranchId === branchId && targetFrequency
                ? targetFrequency
                : prev.activeFrequency,
          };
        });
      },
      goRoot() {
        setProject((prev) => ({
          ...prev,
          activePeriodId: null,
          activeFrequency: null,
          activeBranchId: null,
        }));
      },
      goToPeriod(periodId) {
        setProject((prev) => ({
          ...prev,
          activePeriodId: periodId,
          activeFrequency: null,
          activeBranchId: null,
        }));
      },
      goToFrequency(freq) {
        setProject((prev) => ({
          ...prev,
          activeFrequency: freq,
          activeBranchId: null,
        }));
      },
      goToBranch(branchId) {
        setProject((prev) => {
          const period = prev.periods.find((p) => p.id === prev.activePeriodId);
          const branch = period?.branches.find((b) => b.id === branchId);
          return {
            ...prev,
            activeFrequency: branch?.frequency ?? prev.activeFrequency,
            activeBranchId: branchId,
          };
        });
      },
      goUp() {
        setProject((prev) => {
          if (prev.activeBranchId)
            return { ...prev, activeBranchId: null };
          if (prev.activeFrequency)
            return { ...prev, activeFrequency: null };
          if (prev.activePeriodId)
            return { ...prev, activePeriodId: null };
          return prev;
        });
      },
      updateActiveBranch(updater, action, details, source) {
        // Başka kullanıcı bu modeli kilitlediyse yazma yok (salt okunur)
        if (readOnlyRef.current) return;
        setProject((prev) => {
          if (!prev.activePeriodId || !prev.activeBranchId) return prev;
          return {
            ...prev,
            periods: prev.periods.map((p) => {
              if (p.id !== prev.activePeriodId) return p;
              return {
                ...p,
                branches: p.branches.map((b) => {
                  if (b.id !== prev.activeBranchId) return b;
                  const patch = updater(b);
                  const entry: HistoryEntry = {
                    id: newId(),
                    timestamp: new Date().toISOString(),
                    action,
                    source: source ?? "user",
                    details,
                  };
                  const history = [...b.history, entry].slice(-MAX_HISTORY);
                  return {
                    ...b,
                    ...patch,
                    history,
                    updatedAt: entry.timestamp,
                  };
                }),
              };
            }),
          };
        });
      },
      updateBranch(branchId, updater, action, details, source) {
        setProject((prev) => ({
          ...prev,
          periods: prev.periods.map((p) => ({
            ...p,
            branches: p.branches.map((b) => {
              if (b.id !== branchId) return b;
              const patch = updater(b);
              const entry: HistoryEntry = {
                id: newId(),
                timestamp: new Date().toISOString(),
                action,
                source: source ?? "user",
                details,
              };
              const history = [...b.history, entry].slice(-MAX_HISTORY);
              return { ...b, ...patch, history, updatedAt: entry.timestamp };
            }),
          })),
        }));
      },
      copyAssumptions(sourceBranchId, targetBranchId, opts) {
        setProjectWithUndo((prev) => {
          let src: Branch | null = null;
          let tgt: Branch | null = null;
          let tgtPeriodId: string | null = null;
          for (const p of prev.periods) {
            for (const b of p.branches) {
              if (b.id === sourceBranchId) src = b;
              if (b.id === targetBranchId) { tgt = b; tgtPeriodId = p.id; }
            }
          }
          if (!src || !tgt || !tgtPeriodId) return prev;
          const tgtOrigins = new Set(tgt.triangle?.origin_periods ?? []);
          const tgtSteps = tgt.triangle ? tgt.triangle.development_periods.length - 1 : 0;
          const patch: Partial<Branch> = {};
          if (opts.excludedCells) {
            const filtered = (src.excludedCells ?? []).filter((k) => {
              const [origin, sStr] = k.split("|");
              const step = Number(sStr);
              return tgtOrigins.has(origin) && step < tgtSteps;
            });
            patch.excludedCells = filtered;
          }
          if (opts.window) patch.window = src.window;
          if (opts.premiums) {
            const next: Record<string, number> = { ...tgt.premiums };
            for (const [o, v] of Object.entries(src.premiums)) {
              if (tgtOrigins.has(o)) next[o] = v;
            }
            patch.premiums = next;
          }
          if (opts.lrFormulas) {
            const next: Record<string, string> = { ...tgt.lrInputPerOrigin };
            for (const [o, v] of Object.entries(src.lrInputPerOrigin)) {
              if (tgtOrigins.has(o)) next[o] = v;
            }
            patch.lrInputPerOrigin = next;
          }
          if (opts.corrections) {
            const next: Record<string, number> = { ...tgt.correctionPerOrigin };
            for (const [o, v] of Object.entries(src.correctionPerOrigin ?? {})) {
              if (tgtOrigins.has(o)) next[o] = v;
            }
            patch.correctionPerOrigin = next;
          }
          if (opts.basis) {
            const next: Record<string, "cl" | "bf"> = { ...tgt.basisPerOrigin };
            for (const [o, v] of Object.entries(src.basisPerOrigin)) {
              if (tgtOrigins.has(o)) next[o] = v;
            }
            patch.basisPerOrigin = next;
          }
          if (opts.curve) {
            // Translate keys by position so dev_period offset mismatches
            // (e.g. old [1,...,105] vs new [0,...,104]) don't cause off-by-one.
            const srcDevs = src.triangle?.development_periods ?? [];
            const tgtDevs = tgt.triangle?.development_periods ?? [];
            const translatedChoice: Record<string, "initial" | "user"> = {};
            const translatedInitial: Record<string, number> = {};
            for (const [key, val] of Object.entries(src.cdfChoicePerPeriod)) {
              const idx = srcDevs.indexOf(Number(key));
              if (idx >= 0 && idx < tgtDevs.length)
                translatedChoice[String(tgtDevs[idx])] = val as "initial" | "user";
            }
            for (const [key, val] of Object.entries(src.cdfInitial)) {
              const idx = srcDevs.indexOf(Number(key));
              if (idx >= 0 && idx < tgtDevs.length)
                translatedInitial[String(tgtDevs[idx])] = val as number;
            }
            patch.cdfChoicePerPeriod = translatedChoice;
            patch.cdfInitial = translatedInitial;
          }
          const now = new Date().toISOString();
          const entry = {
            id: Math.random().toString(36).slice(2),
            timestamp: now,
            action: "assumptions_copied",
            source: "user" as const,
            details: { from: sourceBranchId },
          };
          return {
            ...prev,
            periods: prev.periods.map((p) => ({
              ...p,
              branches: p.branches.map((b) =>
                b.id === targetBranchId
                  ? { ...b, ...patch, updatedAt: now, history: [...b.history, entry].slice(-500) }
                  : b,
              ),
            })),
          };
        });
      },
      clearAll() {
        setProject(EMPTY);
      },
      undo() {
        const stack = undoStackRef.current;
        if (!stack.length) return;
        const prev = stack[stack.length - 1];
        undoStackRef.current = stack.slice(0, -1);
        setUndoDepth(undoStackRef.current.length);
        setProject(prev);
      },
      canUndo: false, // placeholder — overridden below
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const canUndo = undoDepth > 0;

  return (
    <ProjectCtx.Provider
      value={{
        project,
        navLevel,
        activePeriod,
        activeBranch,
        branchesForActiveFrequency,
        actions,
        canUndo,
        setReadOnly,
      }}
    >
      {children}
    </ProjectCtx.Provider>
  );
}

export function useProject(): Ctx {
  const v = useContext(ProjectCtx);
  if (!v) throw new Error("ProjectProvider eksik");
  return v;
}

export interface BranchSetters {
  setTriangle: (t: Branch["triangle"], fileName?: string | null, fileData?: FileData) => void;
  setBothTriangles: (paid: Branch["triangle"], incurred: Branch["triangle"], fileName?: string, fileData?: FileData | null, count?: Branch["triangle"]) => void;
  /** Roll-forward: yeni üçgenleri yükle ama TÜM model varsayım/seçimlerini base'den
   *  koru (elemeler, curve, CDF, premium, LR, basis, correction, window, largeModel).
   *  Sadece VERİ değişir; formüller/seçimler aynı kalır. */
  setRolledForward: (
    paid: Branch["triangle"],
    incurred: Branch["triangle"],
    fileName: string,
    fileData: FileData | null | undefined,
    base: Branch,
  ) => void;
  /** LARGE-LOSS üçgenlerini yükle (ödeme + gerçekleşen). */
  setLargeTriangles: (paid: Branch["triangle"], incurred: Branch["triangle"], fileData?: FileData | null) => void;
  clearLarge: () => void;
  setLargeWindow: (w: Window) => void;
  setMethod: (m: LDFMethod) => void;
  setWindow: (w: Window) => void;
  setExcludedCells: (next: Set<string>) => void;
  toggleCell: (origin: string, step: number) => void;
  clearExclusions: () => void;
  setKarmaWindow: (step: string, w: Window) => void;
  initKarma: (stepCount: number, globalWindow: Window) => void;
  clearKarma: () => void;
  setPremiums: (
    fn: (prev: Record<string, number>) => Record<string, number>,
    actionLabel?: string,
    details?: Record<string, unknown>,
  ) => void;
  setLrInput: (origin: string, formula: string) => void;
  setLrInputsBulk: (items: { origin: string; formula: string }[]) => void;
  setBasis: (origin: string, basis: "cl" | "bf") => void;
  setBasisBulk: (items: { origin: string; basis: "cl" | "bf" }[]) => void;
  setCorrection: (origin: string, value: number | null) => void;
  setCorrectionsBulk: (items: { origin: string; value: number | null }[]) => void;
  setCdfInitial: (devPeriod: string, value: number) => void;
  seedCdfInitial: (map: Record<string, number>) => void;
  resetCdfInitial: () => void;
  setCdfChoice: (devPeriod: string, choice: "initial" | "user") => void;
  setCdfChoiceBulk: (
    items: { devPeriod: string; choice: "initial" | "user" }[],
  ) => void;
  setCdfModel: (devPeriod: string, model: 1 | 2 | 3 | 4 | 5 | 6) => void;
  setCurveInclude: (devPeriod: string, include: boolean) => void;
  setUploadSettings: (s: UploadSettings) => void;
}

const LARGE_MODEL_DEFAULT: LargeModel = {
  method: "volume_weighted",
  window: "all",
  excludedCells: [],
  karmaWindowPerStep: {},
  premiums: {},
  lrInputPerOrigin: {},
  basisPerOrigin: {},
  correctionPerOrigin: {},
  cdfInitial: {},
  cdfChoicePerPeriod: {},
  cdfModelPerPeriod: {},
  curveIncludePerPeriod: {},
};

export function useBranchSetters(
  source: ChangeSource = "user",
  segment?: "large",
): BranchSetters {
  const { actions, activeBranch } = useProject();
  const forLarge = segment === "large";

  return useMemo<BranchSetters>(
    () => {
      // Veri setter'ları (üçgen yükleme vs.) her zaman top-level yazar.
      const updData = actions.updateActiveBranch;
      // Model-param setter'ları Large segmentinde largeModel'e yönlendirilir.
      const updModel = (
        mut: (prev: Branch) => Partial<Branch>,
        label: string,
        details?: Record<string, unknown>,
        _src?: ChangeSource,
      ) =>
        forLarge
          ? actions.updateActiveBranch(
              (prev) => {
                const lm = { ...LARGE_MODEL_DEFAULT, ...(prev.largeModel ?? {}) };
                const patch = mut({ ...prev, ...lm } as Branch);
                return { largeModel: { ...lm, ...patch } as LargeModel };
              },
              label,
              details,
              source,
            )
          : actions.updateActiveBranch(mut, label, details, source);
      return {
      setTriangle: (t, fileName, fileData) =>
        updData(
          () => ({
            triangle: t,
            triangleFileName: fileName ?? null,
            fileData: fileData ?? undefined,
            excludedCells: [],
            premiums: {},
            lrInputPerOrigin: {},
            basisPerOrigin: {},
            cdfInitial: {},
            cdfChoicePerPeriod: {},
            // Typed triangles: preserve the OTHER type across uploads
            paidTriangle: t?.triangle_type === "paid"
              ? t
              : (activeBranch?.paidTriangle ?? null),
            incurredTriangle: t?.triangle_type === "incurred"
              ? t
              : (activeBranch?.incurredTriangle ?? null),
          }),
          "triangle_loaded",
          fileName ? { fileName } : {},
          source,
        ),
      setBothTriangles: (paid, incurred, fileName, fileData, count) =>
        updData(
          () => ({
            triangle: incurred,
            triangleFileName: fileName ?? null,
            fileData: fileData ?? undefined,
            excludedCells: [],
            premiums: {},
            lrInputPerOrigin: {},
            basisPerOrigin: {},
            cdfInitial: {},
            cdfChoicePerPeriod: {},
            paidTriangle: paid,
            incurredTriangle: incurred,
            countTriangle: count ?? null,
          }),
          "triangle_loaded",
          fileName ? { fileName } : {},
          source,
        ),
      setRolledForward: (paid, incurred, fileName, fileData, base) =>
        updData(
          () => ({
            triangle: incurred,
            triangleFileName: fileName ?? null,
            fileData: fileData ?? undefined,
            paidTriangle: paid,
            incurredTriangle: incurred,
            // ── Model varsayımları/seçimleri KORUNUR (base'den taşınır) ──
            method: base.method,
            window: base.window,
            excludedCells: [...(base.excludedCells ?? [])],
            karmaWindowPerStep: { ...(base.karmaWindowPerStep ?? {}) },
            premiums: { ...(base.premiums ?? {}) },
            lrInputPerOrigin: { ...(base.lrInputPerOrigin ?? {}) },
            basisPerOrigin: { ...(base.basisPerOrigin ?? {}) },
            correctionPerOrigin: { ...(base.correctionPerOrigin ?? {}) },
            cdfInitial: { ...(base.cdfInitial ?? {}) },
            cdfChoicePerPeriod: { ...(base.cdfChoicePerPeriod ?? {}) },
            cdfModelPerPeriod: { ...(base.cdfModelPerPeriod ?? {}) },
            curveIncludePerPeriod: { ...(base.curveIncludePerPeriod ?? {}) },
            largeWindow: base.largeWindow,
            largeModel: base.largeModel ? { ...base.largeModel } : undefined,
          }),
          "roll_forward",
          { fileName },
          source,
        ),
      setLargeTriangles: (paid, incurred, fileData) =>
        updData(
          () => ({
            largePaidTriangle: paid,
            largeIncurredTriangle: incurred,
            largeFileData: fileData ?? undefined,
          }),
          "large_loaded",
          {},
          source,
        ),
      clearLarge: () =>
        updData(
          () => ({
            largePaidTriangle: null,
            largeIncurredTriangle: null,
            largeFileData: undefined,
          }),
          "large_cleared",
          {},
          source,
        ),
      setLargeWindow: (w) =>
        updData(
          () => ({ largeWindow: w }),
          "large_window",
          { window: w },
          source,
        ),
      setMethod: (m) =>
        updModel(
          () => ({ method: m }),
          "set_method",
          { method: m },
          source,
        ),
      setWindow: (w) =>
        updModel(
          () => ({ window: w }),
          "set_window",
          { window: w },
          source,
        ),
      setExcludedCells: (next) =>
        updModel(
          () => ({ excludedCells: Array.from(next) }),
          "exclusions_replaced",
          { count: next.size },
          source,
        ),
      toggleCell: (origin, step) => {
        const key = `${origin}|${step}`;
        const srcCells = forLarge
          ? activeBranch?.largeModel?.excludedCells
          : activeBranch?.excludedCells;
        const wasExcluded = srcCells?.includes(key) ?? false;
        const actionLabel = wasExcluded ? "cell_included" : "cell_excluded";
        updModel(
          (prev) => {
            const set = new Set(prev.excludedCells);
            if (set.has(key)) set.delete(key);
            else set.add(key);
            return { excludedCells: Array.from(set) };
          },
          actionLabel,
          { origin, step },
          source,
        );
      },
      clearExclusions: () =>
        updModel(
          () => ({ excludedCells: [] }),
          "exclusions_cleared",
          undefined,
          source,
        ),
      setKarmaWindow: (step, w) =>
        updModel(
          (prev) => ({
            karmaWindowPerStep: { ...(prev.karmaWindowPerStep ?? {}), [step]: w },
          }),
          "karma_window_set",
          { step, window: w },
          source,
        ),
      initKarma: (stepCount, globalWindow) => {
        const initial: Record<string, Window> = {};
        for (let j = 0; j < stepCount; j++) initial[String(j)] = globalWindow;
        updModel(
          () => ({ karmaWindowPerStep: initial }),
          "karma_initialized",
          { stepCount, globalWindow },
          source,
        );
      },
      clearKarma: () =>
        updModel(
          () => ({ karmaWindowPerStep: {} }),
          "karma_cleared",
          undefined,
          source,
        ),
      setPremiums: (fn, actionLabel, details) =>
        updModel(
          (prev) => ({ premiums: fn(prev.premiums) }),
          actionLabel ?? "premiums_updated",
          details,
          source,
        ),
      setLrInput: (origin, formula) =>
        updModel(
          (prev) => {
            const next = { ...prev.lrInputPerOrigin };
            if (!formula || !formula.trim()) delete next[origin];
            else next[origin] = formula;
            return { lrInputPerOrigin: next };
          },
          "selected_lr_set",
          { origin, formula },
          source,
        ),
      setLrInputsBulk: (items) =>
        updModel(
          (prev) => {
            const next = { ...prev.lrInputPerOrigin };
            for (const it of items) {
              if (!it.formula || !it.formula.trim()) delete next[it.origin];
              else next[it.origin] = it.formula;
            }
            return { lrInputPerOrigin: next };
          },
          "selected_lr_bulk",
          { count: items.length },
          source,
        ),
      setBasis: (origin, basis) =>
        updModel(
          (prev) => ({
            basisPerOrigin: { ...prev.basisPerOrigin, [origin]: basis },
          }),
          "basis_set",
          { origin, basis },
          source,
        ),
      setBasisBulk: (items) =>
        updModel(
          (prev) => {
            const next = { ...prev.basisPerOrigin };
            for (const it of items) next[it.origin] = it.basis;
            return { basisPerOrigin: next };
          },
          "basis_bulk",
          { count: items.length },
          source,
        ),
      setCorrection: (origin, value) =>
        updModel(
          (prev) => {
            const next = { ...(prev.correctionPerOrigin ?? {}) };
            if (value == null || !Number.isFinite(value) || value === 1)
              delete next[origin];
            else next[origin] = value;
            return { correctionPerOrigin: next };
          },
          "correction_set",
          { origin, value },
          source,
        ),
      setCorrectionsBulk: (items) =>
        updModel(
          (prev) => {
            const next = { ...(prev.correctionPerOrigin ?? {}) };
            for (const it of items) {
              if (it.value == null || !Number.isFinite(it.value) || it.value === 1)
                delete next[it.origin];
              else next[it.origin] = it.value;
            }
            return { correctionPerOrigin: next };
          },
          "correction_bulk",
          { count: items.length },
          source,
        ),
      setCdfInitial: (devPeriod, value) =>
        updModel(
          (prev) => ({
            cdfInitial: { ...(prev.cdfInitial ?? {}), [devPeriod]: value },
          }),
          "curve_cdf_set",
          { devPeriod, value },
          source,
        ),
      seedCdfInitial: (map) =>
        updModel(
          () => ({ cdfInitial: { ...map } }),
          "curve_seeded",
          { count: Object.keys(map).length },
          source,
        ),
      resetCdfInitial: () =>
        updModel(
          () => ({
            cdfInitial: {},
            cdfChoicePerPeriod: {},
            cdfModelPerPeriod: {},
            curveIncludePerPeriod: {},
          }),
          "curve_reset",
          undefined,
          source,
        ),
      setCdfChoice: (devPeriod, choice) =>
        updModel(
          (prev) => ({
            cdfChoicePerPeriod: {
              ...(prev.cdfChoicePerPeriod ?? {}),
              [devPeriod]: choice,
            },
          }),
          "curve_choice_set",
          { devPeriod, choice },
          source,
        ),
      setCdfChoiceBulk: (items) =>
        updModel(
          (prev) => {
            const next = { ...(prev.cdfChoicePerPeriod ?? {}) };
            for (const it of items) next[it.devPeriod] = it.choice;
            return { cdfChoicePerPeriod: next };
          },
          "curve_choice_bulk",
          { count: items.length },
          source,
        ),
      setCdfModel: (devPeriod, model) =>
        updModel(
          (prev) => ({
            cdfModelPerPeriod: {
              ...(prev.cdfModelPerPeriod ?? {}),
              [devPeriod]: model,
            },
          }),
          "curve_model_set",
          { devPeriod, model },
          source,
        ),
      setCurveInclude: (devPeriod, include) =>
        updModel(
          (prev) => ({
            curveIncludePerPeriod: {
              ...(prev.curveIncludePerPeriod ?? {}),
              [devPeriod]: include,
            },
          }),
          "curve_include_set",
          { devPeriod, include },
          source,
        ),
      setUploadSettings: (s) =>
        updData(
          () => ({ uploadSettings: s }),
          "upload_settings_changed",
          s as unknown as Record<string, unknown>,
          source,
        ),
      };
    },
    [actions, source, forLarge, activeBranch?.excludedCells, activeBranch?.largeModel?.excludedCells],
  );
}
