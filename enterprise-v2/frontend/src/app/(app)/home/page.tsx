"use client";

import Link from "next/link";

const MODULES = [
  {
    href: "/reserve",
    label: "Reserve",
    desc: "Actuarial IBNR analysis · Chain-Ladder, Bornhuetter–Ferguson, parametric tail fitting.",
    tags: ["Chain-Ladder", "BF", "Tail Fitting", "AI Agent"],
    icon: <StackIcon />,
    active: true,
  },
];

export default function AppHome() {
  return (
    <main className="flex-1 p-8 max-w-5xl w-full mx-auto">
      <div className="mb-10">
        <h1 className="text-[24px] font-semibold tracking-tight mb-1.5">Modules</h1>
        <p className="text-[13px] text-[color:var(--muted-strong)]">
          Actuarial workflow modules. Select the active module.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {MODULES.map(m => (
          <Link
            key={m.href}
            href={m.href}
            className="group rounded-xl p-5 transition-all hover:border-[color:var(--primary)] hover:shadow-sm"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            <div className="flex items-start justify-between mb-4">
              <div
                className="h-10 w-10 rounded-lg flex items-center justify-center"
                style={{ background: "var(--primary-soft)", color: "var(--primary)" }}
              >
                {m.icon}
              </div>
              {m.active && (
                <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded"
                  style={{ background: "var(--success-soft)", color: "var(--success)" }}>
                  Active
                </span>
              )}
            </div>
            <div className="text-[15px] font-semibold mb-1.5">{m.label}</div>
            <p className="text-[12.5px] leading-relaxed mb-4" style={{ color: "var(--muted-strong)" }}>
              {m.desc}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {m.tags.map(t => (
                <span key={t} className="text-[10px] font-medium px-2 py-0.5 rounded"
                  style={{ background: "var(--surface-alt)", color: "var(--muted-strong)" }}>
                  {t}
                </span>
              ))}
            </div>
          </Link>
        ))}

        {/* Coming soon */}
        <div
          className="rounded-xl p-5 opacity-60"
          style={{ background: "var(--surface)", border: "1px dashed var(--border)" }}>
          <div className="flex items-start justify-between mb-4">
            <div className="h-10 w-10 rounded-lg flex items-center justify-center"
              style={{ background: "var(--surface-alt)", color: "var(--muted)" }}>
              <IFRSIcon />
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded"
              style={{ background: "var(--surface-alt)", color: "var(--muted)" }}>
              Coming soon
            </span>
          </div>
          <div className="text-[15px] font-semibold mb-1.5" style={{ color: "var(--muted-strong)" }}>IFRS 17</div>
          <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--muted)" }}>
            IFRS 17 reporting for insurance contracts · LRC, LIC, CSM calculation.
          </p>
        </div>
      </div>
    </main>
  );
}

function StackIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3 2 8l10 5 10-5z" />
      <path d="M2 13l10 5 10-5" />
      <path d="M2 18l10 5 10-5" />
    </svg>
  );
}

function IFRSIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M9 13h6M9 17h4" />
    </svg>
  );
}
