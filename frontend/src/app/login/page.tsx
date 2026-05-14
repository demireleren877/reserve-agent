"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { fetchMe, WorkerError } from "@/lib/sync/worker-client";

type Mode = "signin" | "signup";

export default function LoginPage() {
  const router = useRouter();
  const auth = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Already signed in → bounce to /reserve (or onboarding)
  useEffect(() => {
    if (auth.loading) return;
    if (!auth.user) return;
    let cancelled = false;
    (async () => {
      try {
        const me = await fetchMe();
        if (cancelled) return;
        router.replace(me.hasPlan ? "/reserve" : "/onboarding/plan");
      } catch {
        /* stay on /login if /v1/me fails */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [auth.user, auth.loading, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "signin") await auth.signInWithEmail(email, password);
      else await auth.signUpWithEmail(email, password);
      // useEffect above handles the redirect once auth.user updates
    } catch (e) {
      setError(humanizeError(e));
    } finally {
      setBusy(false);
    }
  }

  async function onGoogle() {
    setError(null);
    setBusy(true);
    try {
      await auth.signInWithGoogle();
    } catch (e) {
      setError(humanizeError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "#faf9f6", color: "#0a0a14" }}
    >
      <div className="w-full max-w-[420px]">
        <Link
          href="/"
          className="flex items-center gap-2.5 mb-8 justify-center"
        >
          <div
            className="h-8 w-8 rounded-lg flex items-center justify-center text-white text-[13px] font-bold"
            style={{ background: "linear-gradient(135deg, #2563eb, #6d28d9)" }}
          >
            A
          </div>
          <span className="text-[15px] font-semibold tracking-tight">
            Actuarius
          </span>
        </Link>

        <div
          className="rounded-2xl p-7"
          style={{ background: "#fff", border: "1px solid #e8e5dd" }}
        >
          <div className="flex items-center mb-6">
            <button
              type="button"
              onClick={() => setMode("signin")}
              className="flex-1 text-[13.5px] font-semibold py-2 rounded-lg transition"
              style={{
                background: mode === "signin" ? "#0a0a14" : "transparent",
                color: mode === "signin" ? "#fff" : "#45445a",
              }}
            >
              Giriş yap
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className="flex-1 text-[13.5px] font-semibold py-2 rounded-lg transition"
              style={{
                background: mode === "signup" ? "#0a0a14" : "transparent",
                color: mode === "signup" ? "#fff" : "#45445a",
              }}
            >
              Kayıt ol
            </button>
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={onGoogle}
            className="w-full py-2.5 rounded-lg text-[13.5px] font-semibold mb-5 flex items-center justify-center gap-2.5 transition disabled:opacity-50"
            style={{ background: "#fff", border: "1px solid #d8d5cd", color: "#0a0a14" }}
          >
            <GoogleIcon />
            Google ile devam et
          </button>

          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px" style={{ background: "#e8e5dd" }} />
            <span className="text-[11px] uppercase tracking-widest" style={{ color: "#8a8898" }}>
              veya
            </span>
            <div className="flex-1 h-px" style={{ background: "#e8e5dd" }} />
          </div>

          <form onSubmit={onSubmit} className="space-y-3">
            <div>
              <label
                className="block text-[11.5px] font-semibold mb-1.5"
                style={{ color: "#45445a" }}
              >
                E-posta
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy}
                className="w-full px-3 py-2.5 rounded-lg text-[14px] outline-none transition disabled:opacity-50"
                style={{ background: "#faf9f6", border: "1px solid #e8e5dd" }}
              />
            </div>
            <div>
              <label
                className="block text-[11.5px] font-semibold mb-1.5"
                style={{ color: "#45445a" }}
              >
                Şifre
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
                className="w-full px-3 py-2.5 rounded-lg text-[14px] outline-none transition disabled:opacity-50"
                style={{ background: "#faf9f6", border: "1px solid #e8e5dd" }}
              />
            </div>

            {error && (
              <div
                className="text-[12.5px] px-3 py-2 rounded-lg"
                style={{ background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca" }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 rounded-lg text-[13.5px] font-semibold transition disabled:opacity-50"
              style={{
                background: "linear-gradient(180deg, #2563eb, #1e40af)",
                color: "#fff",
                boxShadow: "0 4px 12px rgba(37,83,228,0.25)",
              }}
            >
              {busy
                ? "..."
                : mode === "signin"
                ? "Giriş yap"
                : "Hesap oluştur"}
            </button>
          </form>
        </div>

        <p
          className="text-center text-[12px] mt-6"
          style={{ color: "#8a8898" }}
        >
          {mode === "signin" ? "Hesabın yok mu? " : "Zaten üye misin? "}
          <button
            type="button"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="font-semibold hover:underline"
            style={{ color: "#2553e4" }}
          >
            {mode === "signin" ? "Kayıt ol" : "Giriş yap"}
          </button>
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.4 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8L6.2 33c3.3 6.4 10 11 17.8 11z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.3-4.1 5.7l6.2 5.2C41.4 36 44 30.5 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}

function humanizeError(e: unknown): string {
  if (e instanceof WorkerError) return `Sunucu hatası: ${e.code}`;
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("auth/invalid-credential")) return "E-posta veya şifre hatalı.";
  if (msg.includes("auth/email-already-in-use")) return "Bu e-posta zaten kayıtlı.";
  if (msg.includes("auth/weak-password")) return "Şifre en az 6 karakter olmalı.";
  if (msg.includes("auth/invalid-email")) return "Geçersiz e-posta adresi.";
  if (msg.includes("auth/too-many-requests"))
    return "Çok fazla deneme. Lütfen sonra tekrar deneyin.";
  if (msg.includes("auth/popup-closed-by-user")) return "Google girişi iptal edildi.";
  if (msg.includes("auth/network-request-failed")) return "Ağ hatası.";
  return "Beklenmeyen hata. Lütfen tekrar deneyin.";
}
