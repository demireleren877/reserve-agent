"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/auth-context";
import { ApiError, getConnections } from "@/lib/sync/worker-client";

export default function LoginPage() {
  const router = useRouter();
  const auth = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // İlk açılış: hiç bağlantı yoksa bağlantı yöneticisine yönlendir.
  useEffect(() => {
    getConnections()
      .then((l) => {
        if (!l.env_mode && l.connections.length === 0) router.replace("/setup");
      })
      .catch(() => { /* backend hazır değil — form yine de gösterilir */ });
  }, [router]);

  useEffect(() => {
    if (!auth.loading && auth.user) {
      router.replace("/reserve");
    }
  }, [auth.user, auth.loading, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await auth.signIn(username, password);
      // auth.user güncellenince useEffect yönlendirir
    } catch (err) {
      setError(humanizeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "#faf9f6", color: "#0a0a14" }}
    >
      <div className="w-full max-w-[400px]">
        <div className="flex items-center gap-2.5 mb-8 justify-center">
          <img src="/favicon.png" alt="Actuarius" className="h-11 w-11" />
          <span className="text-[22px] font-semibold tracking-tight">Actuarius</span>
        </div>

        <div
          className="rounded-2xl p-7"
          style={{ background: "#fff", border: "1px solid #e8e5dd" }}
        >
          <h1 className="text-[15px] font-semibold mb-5" style={{ color: "#0a0a14" }}>
            Enterprise Login
          </h1>

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label
                className="block text-[11.5px] font-semibold mb-1.5"
                style={{ color: "#45445a" }}
              >
                Username
              </label>
              <input
                type="text"
                required
                autoFocus
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
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
                Password
              </label>
              <input
                type="password"
                required
                autoComplete="current-password"
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
              className="w-full py-2.5 rounded-lg text-[13.5px] font-semibold transition disabled:opacity-50 mt-1"
              style={{
                background: "linear-gradient(180deg, #2563eb, #1e40af)",
                color: "#fff",
                boxShadow: "0 4px 12px rgba(37,83,228,0.25)",
              }}
            >
              {busy ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <button
            type="button"
            onClick={() => router.push("/setup")}
            disabled={busy}
            className="w-full mt-3 py-2 rounded-lg text-[12.5px] font-semibold transition disabled:opacity-50"
            style={{ background: "#faf9f6", border: "1px solid #e8e5dd", color: "#45445a" }}
          >
            Connections
          </button>
        </div>

        <p className="text-center text-[11px] mt-5" style={{ color: "#8a8898" }}>
          Enterprise — offline setup
        </p>
      </div>
    </div>
  );
}

function humanizeError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return "Incorrect username or password.";
    if (err.status === 403) return "Your account has been disabled.";
    return `Server error: ${err.code}`;
  }
  return "Connection error. Make sure the backend is running.";
}
