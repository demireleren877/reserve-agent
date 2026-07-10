"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";

interface ModuleItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
}

const MODULES: ModuleItem[] = [
  { href: "/home", label: "Anasayfa", icon: <HomeIcon /> },
  { href: "/data", label: "Veri", icon: <DatabaseIcon /> },
  { href: "/reserve", label: "Rezerv", icon: <StackIcon /> },
  { href: "/cashflow", label: "Nakit Akışı", icon: <CashflowIcon /> },
  { href: "/discount", label: "İskonto", icon: <DiscountIcon /> },
  { href: "/admin/users", label: "Kullanıcılar", icon: <UsersIcon />, adminOnly: true },
];

const STORAGE_KEY = "app-sidebar-collapsed";

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  const [collapsed, setCollapsed] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v === "true") setCollapsed(true);
    } catch { /* ignore */ }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(STORAGE_KEY, String(collapsed)); } catch { /* ignore */ }
  }, [collapsed, hydrated]);

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

  const username = user?.username ?? "";
  const initials = username.slice(0, 2).toUpperCase();
  const isAdmin = user?.role === "admin";

  function handleLogout() {
    setProfileOpen(false);
    logout();
    router.replace("/login");
  }

  const visibleModules = MODULES.filter((m) => !m.adminOnly || isAdmin);

  return (
    <aside
      className={
        "shrink-0 border-r bg-[color:var(--surface)] flex flex-col sticky top-0 h-screen transition-[width] duration-150 " +
        (collapsed ? "w-[56px]" : "w-[200px]")
      }
    >
      {/* Logo */}
      <div className={"border-b h-14 flex items-center gap-2 " + (collapsed ? "justify-center" : "px-4")}>
        <img src="/favicon.png" alt="Actuarius" className="h-7 w-7 shrink-0" />
        {!collapsed && (
          <div className="leading-tight overflow-hidden">
            <div className="text-[13px] font-semibold whitespace-nowrap">Actuarius</div>
            <div className="text-[10px] text-[color:var(--muted)]">Enterprise</div>
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
          {visibleModules.map((m) => {
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

      {/* Profile section */}
      <div className="border-t p-2 space-y-1">
        <div ref={profileRef} className="relative">
          {profileOpen && (
            <div
              className="absolute rounded-xl border shadow-xl overflow-hidden z-50"
              style={{
                background: "var(--surface)",
                borderColor: "var(--border)",
                minWidth: 200,
                left: collapsed ? "calc(100% + 6px)" : 0,
                bottom: collapsed ? 0 : "calc(100% + 6px)",
                right: collapsed ? "auto" : 0,
              }}
            >
              <div className="px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-center gap-2.5">
                  <Avatar initials={initials} size={32} active />
                  <div className="min-w-0">
                    <div className="text-[12.5px] font-semibold truncate">{username}</div>
                    <div className="text-[11px] truncate" style={{ color: "var(--muted-strong)" }}>
                      {isAdmin ? "Admin" : "Kullanıcı"}
                    </div>
                  </div>
                </div>
              </div>
              <div className="p-1.5">
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

          <button
            onClick={() => setProfileOpen((v) => !v)}
            title={collapsed ? username : undefined}
            className={
              "w-full flex items-center gap-2.5 rounded-lg py-1.5 transition hover:bg-[color:var(--surface-alt)] " +
              (collapsed ? "justify-center px-0" : "px-2")
            }
          >
            <Avatar initials={initials} size={26} active={profileOpen} />
            {!collapsed && (
              <div className="flex-1 min-w-0 text-left">
                <div className="text-[12px] font-medium truncate leading-tight" style={{ color: "var(--foreground)" }}>
                  {username}
                </div>
                <div className="text-[10px] truncate leading-tight" style={{ color: "var(--muted)" }}>
                  {isAdmin ? "Admin" : "Kullanıcı"}
                </div>
              </div>
            )}
            {!collapsed && <ChevronUpDownIcon open={profileOpen} />}
          </button>
        </div>

        <button
          onClick={() => setCollapsed((c) => !c)}
          className="w-full inline-flex items-center justify-center gap-2 rounded-md py-1.5 text-[11px] text-[color:var(--muted-strong)] hover:bg-[color:var(--surface-alt)] transition"
          title={collapsed ? "Genişlet" : "Daralt"}
        >
          {collapsed ? <ChevronRightIcon /> : <><ChevronLeftIcon /><span>Daralt</span></>}
        </button>
      </div>
    </aside>
  );
}

function Avatar({ initials, size, active }: { initials: string; size: number; active?: boolean }) {
  return (
    <div
      className="shrink-0 rounded-full grid place-items-center font-semibold transition-all"
      style={{
        width: size, height: size, fontSize: size * 0.38,
        background: active ? "linear-gradient(135deg,#2563eb,#7c3aed)" : "linear-gradient(135deg,#dbeafe,#ede9fe)",
        color: active ? "#fff" : "#3730a3",
        boxShadow: active ? "0 0 0 2px #2563eb44" : undefined,
      }}
    >
      {initials}
    </div>
  );
}

function HomeIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9.5 12 3l9 6.5V21a1 1 0 0 1-1 1h-5v-7h-6v7H4a1 1 0 0 1-1-1z" /></svg>;
}
function StackIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3 2 8l10 5 10-5z" /><path d="M2 13l10 5 10-5" /><path d="M2 18l10 5 10-5" /></svg>;
}
function DatabaseIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5" /><path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3" /></svg>;
}
function CashflowIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 7h20M2 12h20M2 17h20" /><path d="M6 3v18M18 3v18" /></svg>;
}
function DiscountIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 5 5 19" /><circle cx="6.5" cy="6.5" r="2.5" /><circle cx="17.5" cy="17.5" r="2.5" /></svg>;
}
function UsersIcon() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
}
function ChevronLeftIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>;
}
function ChevronRightIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>;
}
function ChevronUpDownIcon({ open }: { open: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 transition-transform" style={{ color: "var(--muted)", transform: open ? "rotate(180deg)" : "none" }}>
      <path d="M7 15l5 5 5-5M7 9l5-5 5 5" />
    </svg>
  );
}
function LogOutIcon() {
  return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>;
}
