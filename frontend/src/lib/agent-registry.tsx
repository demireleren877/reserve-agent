"use client";

/**
 * Global agent registry — root layout seviyesinde yaşar. Her modül kendi
 * snapshot'ını (triangle, session_state vb.) buraya register eder; global
 * agent paneli bunları toplayıp backend'e gönderir. Backend'den dönen
 * action'lar modül adına göre kayıtlı handler'lara dağıtılır.
 *
 * Bu sayede agent ana sayfada (veya her sayfada) açık olabilir ve aktif
 * tüm modüllere erişir.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AgentAction } from "@/types/triangle";

type ModuleSnapshot = Record<string, unknown>;
type ActionHandler = (actions: AgentAction[]) => void;

interface AgentRegistry {
  modulesPayload: Record<string, ModuleSnapshot>;
  registerSnapshot: (moduleName: string, snapshot: ModuleSnapshot | null) => void;
  registerActionHandler: (moduleName: string, handler: ActionHandler) => void;
  unregisterActionHandler: (moduleName: string) => void;
  dispatchActions: (actions: AgentAction[]) => void;
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  togglePanel: () => void;
}

const Ctx = createContext<AgentRegistry | null>(null);

export function AgentRegistryProvider({ children }: { children: ReactNode }) {
  const [modulesPayload, setModulesPayload] = useState<
    Record<string, ModuleSnapshot>
  >({});
  const handlersRef = useRef<Record<string, ActionHandler>>({});
  const [panelOpen, setPanelOpen] = useState(false);

  const registerSnapshot = useCallback(
    (moduleName: string, snapshot: ModuleSnapshot | null) => {
      setModulesPayload((prev) => {
        if (snapshot === null) {
          if (!(moduleName in prev)) return prev;
          const next = { ...prev };
          delete next[moduleName];
          return next;
        }
        const cur = prev[moduleName];
        // Reference eşit ise no-op (extra render önle)
        if (cur === snapshot) return prev;
        return { ...prev, [moduleName]: snapshot };
      });
    },
    [],
  );

  const registerActionHandler = useCallback(
    (moduleName: string, handler: ActionHandler) => {
      handlersRef.current[moduleName] = handler;
    },
    [],
  );

  const unregisterActionHandler = useCallback((moduleName: string) => {
    delete handlersRef.current[moduleName];
  }, []);

  const dispatchActions = useCallback((actions: AgentAction[]) => {
    const byModule = new Map<string, AgentAction[]>();
    for (const a of actions) {
      const m = a.module || "reserve"; // legacy fallback
      const list = byModule.get(m);
      if (list) list.push(a);
      else byModule.set(m, [a]);
    }
    for (const [name, list] of byModule.entries()) {
      const handler = handlersRef.current[name];
      if (handler) handler(list);
    }
  }, []);

  const togglePanel = useCallback(() => setPanelOpen((v) => !v), []);

  const value = useMemo<AgentRegistry>(
    () => ({
      modulesPayload,
      registerSnapshot,
      registerActionHandler,
      unregisterActionHandler,
      dispatchActions,
      panelOpen,
      setPanelOpen,
      togglePanel,
    }),
    [
      modulesPayload,
      registerSnapshot,
      registerActionHandler,
      unregisterActionHandler,
      dispatchActions,
      panelOpen,
      togglePanel,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAgentRegistry(): AgentRegistry {
  const v = useContext(Ctx);
  if (!v) throw new Error("AgentRegistryProvider eksik");
  return v;
}
