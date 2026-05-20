"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { useUserPlan } from "@/lib/auth/user-plan-context";

interface ModuleItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const MODULES: ModuleItem[] = [
  { href: "/home", label: "Anasayfa", icon: <HomeIcon /> },
  { href: "/data", label: "Veri", icon: <DatabaseIcon /> },
  { href: "/reserve", label: "Rezerv", icon: <StackIcon /> },
  { href: "/cashflow", label: "Nakit Akışı", icon: <CashflowIcon /> },
  { href: "/discount", label: "İskonto", icon: <DiscountIcon /> },
];

const STORAGE_KEY = "app-sidebar-collapsed";

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const plan = useUserPlan();

  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

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

  // Close dropdown on outside click
  useEffect(() => {
    if (!profileOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [profileOpen]);

  const email = user?.email ?? "";
  const displayName = user?.displayName ?? "";
  const initials = displayName
    ? displayName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
    : email.slice(0, 2).toUpperCase();

  async function handleLogout() {
    setProfileOpen(false);
    await logout();
    router.replace("/login");
  }

  return (
    <aside
      className={
        "shrink-0 border-r bg-[color:var(--surface)] flex flex-col sticky top-0 h-screen transition-[width] duration-150 " +
        (collapsed ? "w-[56px]" : "w-[200px]")
      }
    >
      {/* Logo */}
      <div
        className={
          "border-b h-14 flex items-center gap-2 " +
          (collapsed ? "justify-center" : "px-4")
        }
      >
        <img src="/favicon.png" alt="Actuarius" className="h-7 w-7 shrink-0" />
        {!collapsed && (
          <div className="leading-tight overflow-hidden">
            <div className="text-[13px] font-semibold whitespace-nowrap">
              Actuarius
            </div>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="p-2 flex-1 overflow-y-auto">
        {!collapsed && (
          <div className="text-[10px] uppercase tracking-wide text-[color:var(--muted)] font-semibold px-2 py-2">
            Modüller
          </div>
        )}
        <ul className="space-y-0.5">
          {MODULES.map((m) => {
            const active =
              pathname === m.href || pathname.startsWith(m.href + "/");
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
                  {!collapsed && (
                    <span className="flex-1 truncate">{m.label}</span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Profile section */}
      <div className="border-t p-2 space-y-1">
        {/* Profile button + dropdown */}
        <div ref={profileRef} className="relative">
          {/* Dropdown — rendered above the button */}
          {profileOpen && (
            <div
              className="absolute bottom-[calc(100%+6px)] left-0 right-0 rounded-xl border shadow-xl overflow-hidden z-50"
              style={{
                background: "var(--surface)",
                borderColor: "var(--border)",
                minWidth: collapsed ? 220 : undefined,
                left: collapsed ? "calc(100% + 6px)" : 0,
                bottom: collapsed ? 0 : "calc(100% + 6px)",
              }}
            >
              {/* User info header */}
              <div
                className="px-4 py-3 border-b"
                style={{ borderColor: "var(--border)" }}
              >
                <div className="flex items-center gap-2.5">
                  <Avatar initials={initials} size={32} />
                  <div className="min-w-0">
                    {displayName && (
                      <div className="text-[12.5px] font-semibold truncate">
                        {displayName}
                      </div>
                    )}
                    <div
                      className="text-[11.5px] truncate"
                      style={{ color: "var(--muted-strong)" }}
                    >
                      {email}
                    </div>
                  </div>
                </div>
                {/* Plan badge */}
                <div className="mt-2.5">
                  <span
                    className="inline-flex items-center gap-1 text-[10.5px] font-semibold px-2 py-0.5 rounded-full"
                    style={
                      plan === "pro"
                        ? {
                            background:
                              "linear-gradient(135deg,#7c3aed22,#4f46e522)",
                            color: "#6d28d9",
                            border: "1px solid #ddd6fe",
                          }
                        : {
                            background: "var(--surface-alt)",
                            color: "var(--muted-strong)",
                            border: "1px solid var(--border)",
                          }
                    }
                  >
                    {plan === "pro" ? "✦ Pro" : "Free"}
                  </span>
                </div>
              </div>

              {/* Menu items */}
              <div className="p-1.5 space-y-0.5">
                <Link
                  href="/onboarding/plan"
                  onClick={() => setProfileOpen(false)}
                  className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-[12.5px] transition hover:bg-[color:var(--surface-alt)]"
                  style={{ color: "var(--foreground)" }}
                >
                  <CreditCardIcon />
                  {plan === "pro" ? "Üyeliği yönet" : "Pro'ya yükselt"}
                </Link>

                <div
                  className="my-1 h-px"
                  style={{ background: "var(--border)" }}
                />

                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-[12.5px] transition hover:bg-red-50"
                  style={{ color: "#dc2626" }}
                >
                  <LogOutIcon />
                  Çıkış yap
                </button>
              </div>
            </div>
          )}

          {/* The trigger button */}
          <button
            onClick={() => setProfileOpen((v) => !v)}
            title={collapsed ? `${displayName || email}\n${plan === "pro" ? "Pro" : "Free"}` : undefined}
            className={
              "w-full flex items-center gap-2.5 rounded-lg py-1.5 transition hover:bg-[color:var(--surface-alt)] " +
              (collapsed ? "justify-center px-0" : "px-2")
            }
          >
            <Avatar initials={initials} size={26} active={profileOpen} />
            {!collapsed && (
              <div className="flex-1 min-w-0 text-left">
                <div
                  className="text-[12px] font-medium truncate leading-tight"
                  style={{ color: "var(--foreground)" }}
                >
                  {displayName || email.split("@")[0]}
                </div>
                <div
                  className="text-[10px] truncate leading-tight"
                  style={{ color: "var(--muted)" }}
                >
                  {plan === "pro" ? "✦ Pro" : "Free"}
                </div>
              </div>
            )}
            {!collapsed && (
              <ChevronUpDownIcon open={profileOpen} />
            )}
          </button>
        </div>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className={
            "w-full inline-flex items-center justify-center gap-2 rounded-md py-1.5 text-[11px] text-[color:var(--muted-strong)] hover:bg-[color:var(--surface-alt)] transition"
          }
          title={collapsed ? "Genişlet" : "Daralt"}
          aria-label={collapsed ? "Sidebar'ı genişlet" : "Sidebar'ı daralt"}
        >
          {collapsed ? (
            <ChevronRightIcon />
          ) : (
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

function Avatar({
  initials,
  size,
  active,
}: {
  initials: string;
  size: number;
  active?: boolean;
}) {
  return (
    <div
      className="shrink-0 rounded-full grid place-items-center font-semibold transition-all"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: active
          ? "linear-gradient(135deg,#2563eb,#7c3aed)"
          : "linear-gradient(135deg,#dbeafe,#ede9fe)",
        color: active ? "#fff" : "#3730a3",
        boxShadow: active ? "0 0 0 2px #2563eb44" : undefined,
      }}
    >
      {initials}
    </div>
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

function DatabaseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5" />
      <path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3" />
    </svg>
  );
}

function CashflowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 7h20M2 12h20M2 17h20" />
      <path d="M6 3v18M18 3v18" />
    </svg>
  );
}

function DiscountIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 5 5 19" />
      <circle cx="6.5" cy="6.5" r="2.5" />
      <circle cx="17.5" cy="17.5" r="2.5" />
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

function ChevronUpDownIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 transition-transform"
      style={{
        color: "var(--muted)",
        transform: open ? "rotate(180deg)" : "none",
      }}
    >
      <path d="M7 15l5 5 5-5M7 9l5-5 5 5" />
    </svg>
  );
}

function CreditCardIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--muted-strong)" }}>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
    </svg>
  );
}

function LogOutIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
