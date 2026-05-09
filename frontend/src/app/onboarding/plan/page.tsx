"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { setPlan, fetchMe, type Plan } from "@/lib/sync/worker-client";

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    Paddle?: any;
  }
}

const PADDLE_CLIENT_TOKEN =
  process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN ?? "";
const PADDLE_PRICE_ID =
  process.env.NEXT_PUBLIC_PADDLE_PRICE_ID ?? "";

export default function PlanOnboarding() {
  const router = useRouter();
  const auth = useAuth();
  const [selected, setSelected] = useState<Plan>("free");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const paddleReady = useRef(false);

  // Not signed in → bounce to /login. Already chose plan → /reserve.
  useEffect(() => {
    if (auth.loading) return;
    if (!auth.user) {
      router.replace("/login");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const me = await fetchMe();
        if (cancelled) return;
        if (me.hasPlan) router.replace("/reserve");
      } catch {
        /* stay here; user can still pick */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [auth.user, auth.loading, router]);

  // Load Paddle.js once
  useEffect(() => {
    if (!PADDLE_CLIENT_TOKEN || paddleReady.current) return;
    const script = document.createElement("script");
    script.src = "https://cdn.paddle.com/paddle/v2/paddle.js";
    script.async = true;
    script.onload = () => {
      if (!window.Paddle) return;
      window.Paddle.Initialize({ token: PADDLE_CLIENT_TOKEN });
      paddleReady.current = true;
    };
    document.head.appendChild(script);
  }, []);

  async function confirm() {
    setBusy(true);
    setError(null);

    if (selected === "free") {
      try {
        await setPlan("free");
        router.replace("/reserve");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Plan kaydedilemedi.");
        setBusy(false);
      }
      return;
    }

    // Pro → open Paddle checkout
    if (!PADDLE_PRICE_ID) {
      setError("Paddle yapılandırması eksik (NEXT_PUBLIC_PADDLE_PRICE_ID).");
      setBusy(false);
      return;
    }
    if (!window.Paddle) {
      setError("Ödeme sistemi yüklenemedi. Sayfayı yenileyip tekrar dene.");
      setBusy(false);
      return;
    }

    const uid = auth.user?.uid;
    if (!uid) {
      setError("Oturum bulunamadı.");
      setBusy(false);
      return;
    }

    window.Paddle.Checkout.open({
      items: [{ priceId: PADDLE_PRICE_ID, quantity: 1 }],
      customData: { uid },
      settings: {
        displayMode: "overlay",
        theme: "light",
        locale: "tr",
      },
      successCallback: async () => {
        // Poll until D1 is updated by the webhook
        let attempts = 0;
        const poll = async () => {
          attempts++;
          try {
            const me = await fetchMe();
            if (me.plan === "pro" && me.hasPlan) {
              router.replace("/reserve");
              return;
            }
          } catch {
            /* keep polling */
          }
          if (attempts < 20) {
            setTimeout(poll, 1500);
          } else {
            // Webhook may be slow — set plan manually as fallback
            try {
              await setPlan("pro");
              router.replace("/reserve");
            } catch (e) {
              setError(e instanceof Error ? e.message : "Plan güncellenemedi.");
              setBusy(false);
            }
          }
        };
        poll();
      },
      closeCallback: () => {
        setBusy(false);
      },
    });
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-10"
      style={{ background: "#faf9f6", color: "#0a0a14" }}
    >
      <div className="w-full max-w-[860px]">
        <div className="text-center mb-10">
          <h1
            className="text-[32px] md:text-[38px] font-bold mb-3"
            style={{ letterSpacing: "-0.03em" }}
          >
            Planını seç
          </h1>
          <p className="text-[14.5px]" style={{ color: "#45445a" }}>
            Free plan ücretsizdir. Pro plan için aylık ödeme alınır.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <PlanCard
            id="free"
            name="Free"
            price="₺0"
            period="sonsuza kadar"
            desc="Küçük portföyler ve deneme."
            features={[
              "Chain-Ladder & BF",
              "LDF & CDF override",
              "Excel export (temel)",
              "1 AI modeli",
              "Veri tarayıcıda + bulut yedekli",
            ]}
            selected={selected === "free"}
            onSelect={() => setSelected("free")}
          />
          <PlanCard
            id="pro"
            name="Pro"
            price="₺890"
            period="/ ay"
            desc="Profesyonel aktüerler için tam set."
            highlight
            features={[
              "Sınırsız proje & dönem",
              "Parametrik tail fitting",
              "AI Aktüer Agent — tüm modeller",
              "Senaryo karşılaştırması",
              "Öncelikli destek",
            ]}
            selected={selected === "pro"}
            onSelect={() => setSelected("pro")}
          />
        </div>

        {error && (
          <div
            className="mt-5 text-[13px] px-4 py-2.5 rounded-lg text-center"
            style={{ background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca" }}
          >
            {error}
          </div>
        )}

        <div className="mt-8 flex flex-col items-center gap-3">
          <button
            onClick={confirm}
            disabled={busy}
            className="px-7 py-3 rounded-lg text-[14px] font-semibold transition disabled:opacity-50"
            style={{
              background: "linear-gradient(180deg, #2563eb, #1e40af)",
              color: "#fff",
              boxShadow: "0 4px 12px rgba(37,83,228,0.25)",
            }}
          >
            {busy
              ? selected === "pro"
                ? "Ödeme bekleniyor..."
                : "Kaydediliyor..."
              : selected === "free"
              ? "Free ile devam et"
              : "Pro'ya geç — ₺890/ay"}
          </button>
          <button
            onClick={() => auth.logout()}
            className="text-[12px] hover:underline"
            style={{ color: "#8a8898" }}
          >
            Çıkış yap
          </button>
        </div>
      </div>
    </div>
  );
}

function PlanCard({
  name,
  price,
  period,
  desc,
  features,
  selected,
  onSelect,
  highlight,
}: {
  id: Plan;
  name: string;
  price: string;
  period: string;
  desc: string;
  features: string[];
  selected: boolean;
  onSelect: () => void;
  highlight?: boolean;
}) {
  const dark = !!highlight;
  return (
    <button
      type="button"
      onClick={onSelect}
      className="rounded-2xl p-7 text-left relative transition-all"
      style={{
        background: dark
          ? "linear-gradient(180deg, #1e2a48 0%, #0f1729 100%)"
          : "#fff",
        border: selected
          ? "2px solid #2553e4"
          : dark
          ? "2px solid transparent"
          : "1px solid #e8e5dd",
        color: dark ? "#fff" : "#0a0a14",
        boxShadow: selected
          ? "0 0 0 4px rgba(37,83,228,0.12), 0 12px 30px rgba(10,10,20,0.08)"
          : dark
          ? "0 20px 60px rgba(15,23,41,0.20)"
          : "none",
      }}
    >
      {selected && (
        <div
          className="absolute top-4 right-4 w-6 h-6 rounded-full flex items-center justify-center"
          style={{ background: "#2553e4" }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path
              d="M5 12l4 4L20 6"
              stroke="#fff"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      )}
      <div
        className="text-[13px] font-bold mb-1"
        style={{ color: dark ? "#93c5fd" : "#8a8898" }}
      >
        {name}
      </div>
      <div className="flex items-end gap-1.5 mb-2">
        <span
          className="text-[34px] font-bold leading-none tabular-nums"
          style={{ letterSpacing: "-0.04em" }}
        >
          {price}
        </span>
        <span
          className="text-[13px] mb-1.5"
          style={{ color: dark ? "rgba(255,255,255,0.5)" : "#9ca3af" }}
        >
          {period}
        </span>
      </div>
      <p
        className="text-[13.5px] mb-5 leading-relaxed"
        style={{ color: dark ? "rgba(255,255,255,0.65)" : "#5a5a6a" }}
      >
        {desc}
      </p>
      <div className="space-y-2">
        {features.map((f) => (
          <div
            key={f}
            className="flex items-start gap-2 text-[13px]"
            style={{ color: dark ? "rgba(255,255,255,0.85)" : "#374151" }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              className="shrink-0 mt-0.5"
            >
              <path
                d="M5 12l4 4L20 6"
                stroke={dark ? "#93c5fd" : "#2553e4"}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {f}
          </div>
        ))}
      </div>
    </button>
  );
}
