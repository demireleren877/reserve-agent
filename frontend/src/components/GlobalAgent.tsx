"use client";

import { ChatPanel } from "@/components/ChatPanel";
import { useAgentRegistry } from "@/lib/agent-registry";
import { usePathname } from "next/navigation";

export function GlobalAgentLauncher() {
  const { panelOpen, togglePanel } = useAgentRegistry();
  if (panelOpen) return null;
  return (
    <button
      onClick={togglePanel}
      className="fixed top-4 right-5 z-[60] inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-semibold shadow-sm transition-all border bg-[color:var(--surface)] text-[color:var(--foreground)] border-[color:var(--border-strong)] hover:border-[color:var(--primary)] hover:text-[color:var(--primary)]"
    >
      <SparkleIcon active={false} />
      Agent
    </button>
  );
}

export function GlobalAgentPanel() {
  const { panelOpen, setPanelOpen, modulesPayload, dispatchActions } =
    useAgentRegistry();
  const pathname = usePathname();

  // Only show active branch context when the user is actually on the reserve page
  const onReservePage = pathname?.startsWith("/reserve");
  const ss = (modulesPayload?.reserve as Record<string, unknown> | undefined)
    ?.session_state as Record<string, unknown> | null | undefined;
  const activeInfo = ss?.active as
    | { period_label?: string; branch_name?: string; frequency?: string }
    | null
    | undefined;
  const activeContext = onReservePage && activeInfo?.branch_name
    ? {
        periodLabel: activeInfo.period_label ?? "",
        branchName: activeInfo.branch_name,
        frequency: activeInfo.frequency ?? "",
      }
    : null;

  return (
    <>
      {/* Backdrop */}
      <div
        className={
          "fixed inset-0 z-[55] bg-black/20 backdrop-blur-[1px] transition-opacity duration-200 " +
          (panelOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none")
        }
        onClick={() => setPanelOpen(false)}
      />
      {/* Slide-in panel */}
      <div
        className={
          "fixed inset-y-0 right-0 z-[58] w-[520px] max-w-[100vw] flex flex-col bg-[color:var(--surface)] border-l shadow-2xl transition-transform duration-200 ease-out " +
          (panelOpen ? "translate-x-0" : "translate-x-full")
        }
        aria-hidden={!panelOpen}
      >
        <ChatPanel
          modulesPayload={modulesPayload}
          onActions={dispatchActions}
          onClose={() => setPanelOpen(false)}
          activeContext={activeContext}
        />
      </div>
    </>
  );
}

function SparkleIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill={active ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4z" />
      <path d="M19 15l1 2.4L22 18l-2 .6L19 21l-1-2.4L16 18l2-.6z" />
    </svg>
  );
}
