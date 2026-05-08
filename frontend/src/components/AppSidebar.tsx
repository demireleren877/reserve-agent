"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

interface ModuleItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const MODULES: ModuleItem[] = [
  { href: "/home", label: "Anasayfa", icon: <HomeIcon /> },
  { href: "/reserve", label: "Rezerv", icon: <StackIcon /> },
];

const STORAGE_KEY = "app-sidebar-collapsed";

export function AppSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v === "true") setCollapsed(true);
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, String(collapsed));
    } catch {
      /* ignore */
    }
  }, [collapsed, hydrated]);

  return (
    <aside
      className={
        "shrink-0 border-r bg-[color:var(--surface)] flex flex-col sticky top-0 h-screen transition-[width] duration-150 " +
        (collapsed ? "w-[56px]" : "w-[200px]")
      }
    >
      <div
        className={
          "border-b h-14 flex items-center gap-2 " +
          (collapsed ? "justify-center" : "px-4")
        }
      >
        <div className="h-7 w-7 rounded-md bg-[color:var(--primary)] grid place-items-center text-white text-[12px] font-bold shrink-0">
          A
        </div>
        {!collapsed && (
          <div className="leading-tight overflow-hidden">
            <div className="text-[13px] font-semibold whitespace-nowrap">
              Actuarial
            </div>
            <div className="text-[10px] text-[color:var(--muted)] -mt-0.5 whitespace-nowrap">
              Workbench
            </div>
          </div>
        )}
      </div>

      <nav className="p-2 flex-1 overflow-y-auto">
        {!collapsed && (
          <div className="text-[10px] uppercase tracking-wide text-[color:var(--muted)] font-semibold px-2 py-2">
            Modüller
          </div>
        )}
        <ul className="space-y-0.5">
          {MODULES.map((m) => {
            const active = pathname === m.href || pathname.startsWith(m.href + "/");
            return (
              <li key={m.href}>
                <Link
                  href={m.href}
                  title={collapsed ? m.label : undefined}
                  className={
                    "flex items-center gap-2 rounded-md text-[13px] transition " +
                    (collapsed ? "justify-center py-2" : "px-2.5 py-1.5") +
                    " " +
                    (active
                      ? "bg-[color:var(--primary-soft)] text-[color:var(--primary)] font-medium"
                      : "text-[color:var(--muted-strong)] hover:bg-[color:var(--surface-alt)] hover:text-[color:var(--foreground)]")
                  }
                >
                  <span className="opacity-80 shrink-0">{m.icon}</span>
                  {!collapsed && <span className="flex-1 truncate">{m.label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div
        className={
          "border-t " + (collapsed ? "p-2" : "p-2 flex items-center gap-2")
        }
      >
        <button
          onClick={() => setCollapsed((c) => !c)}
          className={
            "w-full inline-flex items-center justify-center gap-2 rounded-md py-1.5 text-[11px] text-[color:var(--muted-strong)] hover:bg-[color:var(--surface-alt)] transition"
          }
          title={collapsed ? "Genişlet" : "Daralt"}
          aria-label={collapsed ? "Sidebar'ı genişlet" : "Sidebar'ı daralt"}
        >
          {collapsed ? <ChevronRightIcon /> : (
            <>
              <ChevronLeftIcon />
              <span>Daralt</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}

function HomeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5 12 3l9 6.5V21a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1z" />
    </svg>
  );
}

function StackIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3 2 8l10 5 10-5z" />
      <path d="M2 13l10 5 10-5" />
      <path d="M2 18l10 5 10-5" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}
