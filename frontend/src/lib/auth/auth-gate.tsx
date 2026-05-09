"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth } from "./auth-context";
import { fetchMe, type Plan } from "@/lib/sync/worker-client";

export interface MeSnapshot {
  uid: string;
  email: string;
  plan: Plan;
}

interface Props {
  children: (me: MeSnapshot) => ReactNode;
}

/**
 * Renders children only when the user is signed in AND has selected a plan.
 * Otherwise redirects to /login or /onboarding/plan.
 *
 * Children is a render-prop so downstream consumers can read `me` without
 * a second fetch.
 */
export function AuthGate({ children }: Props) {
  const router = useRouter();
  const auth = useAuth();
  const [me, setMe] = useState<MeSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (auth.loading) return;
    if (!auth.user) {
      router.replace("/login");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const m = await fetchMe();
        if (cancelled) return;
        if (!m.hasPlan) {
          router.replace("/onboarding/plan");
          return;
        }
        setMe({ uid: m.uid, email: m.email, plan: m.plan });
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Bağlantı hatası");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [auth.user, auth.loading, router]);

  if (auth.loading || (!me && !error)) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "#faf9f6", color: "#8a8898" }}
      >
        <div className="text-[13px]">Yükleniyor...</div>
      </div>
    );
  }

  if (error || !me) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center gap-3 px-4"
        style={{ background: "#faf9f6" }}
      >
        <div
          className="text-[13.5px] px-4 py-2.5 rounded-lg max-w-md text-center"
          style={{ background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca" }}
        >
          {error ?? "Oturum doğrulanamadı."}
        </div>
        <button
          onClick={() => auth.logout().then(() => router.replace("/login"))}
          className="text-[12px] hover:underline"
          style={{ color: "#45445a" }}
        >
          Çıkış yap ve tekrar dene
        </button>
      </div>
    );
  }

  return <>{children(me)}</>;
}
