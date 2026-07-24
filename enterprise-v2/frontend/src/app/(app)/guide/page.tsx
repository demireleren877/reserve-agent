"use client";

/**
 * Kullanım kılavuzu — TAM OFFLINE. Self-contained statik HTML (public/guide.html)
 * iframe ile gömülür: tüm görseller data: URI, stil/JS gömülü, harici link/istek YOK.
 * Masaüstünde local backend (uvicorn StaticFiles) /guide.html'i aynı origin'den servis eder.
 * Guide'ın kendi TR/EN dil geçişi kendi içinde çalışır; app stilleriyle çakışmaz.
 */
export default function GuidePage() {
  return (
    <main className="flex-1 min-h-0 flex flex-col">
      <div className="h-12 border-b flex items-center px-6 shrink-0">
        <h1 className="text-[14px] font-semibold tracking-tight">User Guide</h1>
        <span className="ml-2 text-[11px] text-[color:var(--muted)]">
          Actuarius Enterprise — step-by-step walkthrough
        </span>
      </div>
      <iframe src="/guide.html" title="User Guide" className="flex-1 w-full border-0" />
    </main>
  );
}
