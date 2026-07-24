"use client";

/**
 * Kullanım kılavuzu — self-contained statik HTML (public/guide.html) iframe ile
 * gösterilir. Guide'ın kendi CSS'i ve TR/EN dil geçişi izole kalır (app stilleriyle
 * çakışmaz). Görseller data: URI olduğundan çevrimdışı masaüstünde de çalışır.
 */
export default function GuidePage() {
  return (
    <main className="flex-1 min-h-0 flex flex-col">
      <div className="h-14 border-b flex items-center justify-between px-6 shrink-0">
        <div>
          <h1 className="text-[15px] font-semibold tracking-tight">User Guide</h1>
          <p className="text-[11px] text-[color:var(--muted)]">
            Actuarius Enterprise — step-by-step walkthrough
          </p>
        </div>
        <a
          href="/guide.html"
          target="_blank"
          rel="noreferrer"
          className="text-[12px] px-3 py-1.5 rounded-md border transition hover:bg-[color:var(--surface-alt)]"
          style={{ borderColor: "var(--border)", color: "var(--muted-strong)" }}
        >
          Open in new tab ↗
        </a>
      </div>
      <iframe src="/guide.html" title="User Guide" className="flex-1 w-full border-0" />
    </main>
  );
}
