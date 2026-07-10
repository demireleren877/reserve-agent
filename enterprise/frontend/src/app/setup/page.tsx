"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ApiError,
  getSetupStatus,
  testConnection,
  saveConnection,
  type ConnectionInput,
} from "@/lib/sync/worker-client";

const inputCls =
  "w-full px-3 py-2.5 rounded-lg text-[14px] outline-none transition disabled:opacity-50";
const inputStyle = { background: "#faf9f6", border: "1px solid #e8e5dd" } as const;
const labelCls = "block text-[11.5px] font-semibold mb-1.5";
const labelStyle = { color: "#45445a" } as const;

export default function SetupPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [firstRun, setFirstRun] = useState(true); // hiç kurulmamışsa admin alanları göster

  const [host, setHost] = useState("");
  const [port, setPort] = useState("1521");
  const [serviceName, setServiceName] = useState("");
  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");

  const [testState, setTestState] = useState<"idle" | "ok" | "fail">("idle");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getSetupStatus()
      .then((s) => {
        if (s.env_mode) {
          // Web/Docker: bağlantı .env yönetiminde — kuruluma gerek yok.
          router.replace("/login");
          return;
        }
        setFirstRun(!s.configured);
        setChecking(false);
      })
      .catch(() => setChecking(false));
  }, [router]);

  function conn(): ConnectionInput {
    return {
      host: host.trim(),
      port: Number(port) || 1521,
      service_name: serviceName.trim(),
      user: user.trim(),
      password,
    };
  }

  async function onTest() {
    setError(null);
    setTestState("idle");
    setBusy(true);
    try {
      await testConnection(conn());
      setTestState("ok");
    } catch (err) {
      setTestState("fail");
      setError(humanize(err));
    } finally {
      setBusy(false);
    }
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await saveConnection({
        ...conn(),
        ...(firstRun
          ? { admin_username: adminUsername.trim(), admin_password: adminPassword }
          : {}),
      });
      router.replace("/login");
    } catch (err) {
      setError(humanize(err));
    } finally {
      setBusy(false);
    }
  }

  if (checking) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "#faf9f6", color: "#8a8898" }}
      >
        <div className="text-[13px]">Denetleniyor...</div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-10"
      style={{ background: "#faf9f6", color: "#0a0a14" }}
    >
      <div className="w-full max-w-[460px]">
        <div className="flex items-center gap-2.5 mb-8 justify-center">
          <img src="/favicon.png" alt="Actuarius" className="h-11 w-11" />
          <span className="text-[22px] font-semibold tracking-tight">Actuarius</span>
        </div>

        <div className="rounded-2xl p-7" style={{ background: "#fff", border: "1px solid #e8e5dd" }}>
          <h1 className="text-[15px] font-semibold mb-1" style={{ color: "#0a0a14" }}>
            {firstRun ? "Kurulum — Veritabanı bağlantısı" : "Bağlantı ayarları"}
          </h1>
          <p className="text-[12px] mb-5" style={{ color: "#8a8898" }}>
            Oracle veritabanınıza bağlanın. Bilgiler bu bilgisayarda güvenli biçimde saklanır.
          </p>

          <form onSubmit={onSave} className="space-y-4">
            <div className="flex gap-3">
              <div className="flex-1">
                <label className={labelCls} style={labelStyle}>Sunucu (Host / IP)</label>
                <input
                  className={inputCls} style={inputStyle} required autoFocus
                  placeholder="192.168.1.10"
                  value={host} onChange={(e) => setHost(e.target.value)} disabled={busy}
                />
              </div>
              <div style={{ width: 96 }}>
                <label className={labelCls} style={labelStyle}>Port</label>
                <input
                  className={inputCls} style={inputStyle} required inputMode="numeric"
                  value={port} onChange={(e) => setPort(e.target.value)} disabled={busy}
                />
              </div>
            </div>

            <div>
              <label className={labelCls} style={labelStyle}>Servis adı (Service name)</label>
              <input
                className={inputCls} style={inputStyle} required placeholder="ORCLPDB1"
                value={serviceName} onChange={(e) => setServiceName(e.target.value)} disabled={busy}
              />
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <label className={labelCls} style={labelStyle}>Veritabanı kullanıcısı</label>
                <input
                  className={inputCls} style={inputStyle} required autoComplete="off"
                  value={user} onChange={(e) => setUser(e.target.value)} disabled={busy}
                />
              </div>
              <div className="flex-1">
                <label className={labelCls} style={labelStyle}>Veritabanı şifresi</label>
                <input
                  type="password" className={inputCls} style={inputStyle} required autoComplete="off"
                  value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy}
                />
              </div>
            </div>

            {firstRun && (
              <div
                className="rounded-lg p-3.5 space-y-4"
                style={{ background: "#f7f9ff", border: "1px solid #dbe4ff" }}
              >
                <p className="text-[11.5px] font-semibold" style={{ color: "#3452c9" }}>
                  İlk yönetici hesabı
                </p>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className={labelCls} style={labelStyle}>Yönetici kullanıcı adı</label>
                    <input
                      className={inputCls} style={inputStyle} required autoComplete="off"
                      value={adminUsername} onChange={(e) => setAdminUsername(e.target.value)} disabled={busy}
                    />
                  </div>
                  <div className="flex-1">
                    <label className={labelCls} style={labelStyle}>Yönetici şifresi</label>
                    <input
                      type="password" className={inputCls} style={inputStyle} required autoComplete="new-password"
                      value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} disabled={busy}
                    />
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div
                className="text-[12.5px] px-3 py-2 rounded-lg"
                style={{ background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca" }}
              >
                {error}
              </div>
            )}
            {testState === "ok" && !error && (
              <div
                className="text-[12.5px] px-3 py-2 rounded-lg"
                style={{ background: "#f0fdf4", color: "#15803d", border: "1px solid #bbf7d0" }}
              >
                Bağlantı başarılı.
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                type="button" onClick={onTest} disabled={busy}
                className="flex-1 py-2.5 rounded-lg text-[13.5px] font-semibold transition disabled:opacity-50"
                style={{ background: "#faf9f6", border: "1px solid #e8e5dd", color: "#45445a" }}
              >
                {busy ? "..." : "Bağlantıyı test et"}
              </button>
              <button
                type="submit" disabled={busy}
                className="flex-1 py-2.5 rounded-lg text-[13.5px] font-semibold transition disabled:opacity-50"
                style={{
                  background: "linear-gradient(180deg, #2563eb, #1e40af)",
                  color: "#fff",
                  boxShadow: "0 4px 12px rgba(37,83,228,0.25)",
                }}
              >
                {firstRun ? "Kur ve devam et" : "Kaydet"}
              </button>
            </div>
          </form>
        </div>

        <p className="text-center text-[11px] mt-5" style={{ color: "#8a8898" }}>
          Enterprise — çevrimdışı kurulum
        </p>
      </div>
    </div>
  );
}

function humanize(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.message && !err.message.startsWith("http_")) return err.message;
    if (err.status === 403) return "Bu işlem için yönetici yetkisi gerekiyor.";
    return `Sunucu hatası: ${err.code}`;
  }
  return "Backend'e ulaşılamadı. Uygulamayı yeniden başlatmayı deneyin.";
}
