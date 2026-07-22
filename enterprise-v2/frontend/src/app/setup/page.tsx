"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  ApiError,
  getConnections,
  testConnection,
  createConnection,
  updateConnection,
  deleteConnection,
  selectConnection,
  type ConnectionsList,
  type ConnectionMeta,
} from "@/lib/sync/worker-client";

const inputCls =
  "w-full px-3 py-2.5 rounded-lg text-[14px] outline-none transition disabled:opacity-50";
const inputStyle = { background: "#faf9f6", border: "1px solid #e8e5dd" } as const;
const labelCls = "block text-[11.5px] font-semibold mb-1.5";
const labelStyle = { color: "#45445a" } as const;

type Mode = { kind: "list" } | { kind: "add" } | { kind: "edit"; id: string };

export default function ConnectionsPage() {
  const router = useRouter();
  const [list, setList] = useState<ConnectionsList | null>(null);
  const [mode, setMode] = useState<Mode>({ kind: "list" });

  const load = useCallback(async () => {
    try {
      const l = await getConnections();
      setList(l);
      if (l.env_mode) return;
      // Hiç bağlantı yoksa doğrudan ekleme formunu aç
      if (l.connections.length === 0) setMode({ kind: "add" });
    } catch {
      setList({ connections: [], selected_id: null, ready: false, env_mode: false });
      setMode({ kind: "add" });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (list === null) {
    return (
      <Shell>
        <div className="text-[13px]" style={{ color: "#8a8898" }}>Loading...</div>
      </Shell>
    );
  }

  if (list.env_mode) {
    const c = list.connections[0];
    return (
      <Shell>
        <Card>
          <h1 className="text-[15px] font-semibold mb-1" style={{ color: "#0a0a14" }}>Connection</h1>
          <p className="text-[12px] mb-4" style={{ color: "#8a8898" }}>
            The connection is managed via environment variables (server deployment). It cannot be changed here.
          </p>
          {c && (
            <div className="rounded-lg px-3 py-2.5 text-[13px]" style={inputStyle}>
              {c.name} — {c.host}:{c.port}/{c.service_name} ({c.user})
            </div>
          )}
          <button onClick={() => router.replace("/login")} className="mt-5 w-full py-2.5 rounded-lg text-[13.5px] font-semibold text-white"
            style={{ background: "linear-gradient(180deg, #2563eb, #1e40af)" }}>
            Back to login
          </button>
        </Card>
      </Shell>
    );
  }

  if (mode.kind === "add" || mode.kind === "edit") {
    const editing = mode.kind === "edit"
      ? list.connections.find((c) => c.id === mode.id) ?? null
      : null;
    return (
      <Shell>
        <ConnectionForm
          editing={editing}
          isFirst={list.connections.length === 0}
          onCancel={() => setMode({ kind: "list" })}
          onDone={async () => { setMode({ kind: "list" }); await load(); }}
        />
      </Shell>
    );
  }

  // Liste görünümü
  return (
    <Shell>
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-[15px] font-semibold" style={{ color: "#0a0a14" }}>Connections</h1>
          <button onClick={() => setMode({ kind: "add" })}
            className="text-[12.5px] font-semibold px-3 py-1.5 rounded-lg text-white"
            style={{ background: "linear-gradient(180deg, #2563eb, #1e40af)" }}>
            + Yeni
          </button>
        </div>

        <div className="space-y-2">
          {list.connections.map((c) => (
            <ConnectionRow
              key={c.id}
              conn={c}
              selected={c.id === list.selected_id}
              onSelect={async () => { await selectConnection(c.id); await load(); }}
              onEdit={() => setMode({ kind: "edit", id: c.id })}
              onDelete={async () => { await deleteConnection(c.id); await load(); }}
            />
          ))}
        </div>

        <button
          onClick={() => router.replace("/login")}
          disabled={!list.selected_id}
          className="mt-6 w-full py-2.5 rounded-lg text-[13.5px] font-semibold text-white disabled:opacity-50"
          style={{ background: "linear-gradient(180deg, #2563eb, #1e40af)" }}
        >
          Back to login with the selected connection
        </button>
      </Card>
    </Shell>
  );
}

function ConnectionRow({
  conn, selected, onSelect, onEdit, onDelete,
}: {
  conn: ConnectionMeta;
  selected: boolean;
  onSelect: () => Promise<void>;
  onEdit: () => void;
  onDelete: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const run = (fn: () => Promise<void>) => async () => {
    setBusy(true);
    try { await fn(); } catch { /* sessiz */ } finally { setBusy(false); }
  };
  return (
    <div
      className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition"
      style={{
        background: selected ? "#f0f5ff" : "#faf9f6",
        border: `1px solid ${selected ? "#bcd0ff" : "#e8e5dd"}`,
      }}
    >
      <button onClick={run(onSelect)} disabled={busy || selected} title="Select"
        className="shrink-0 h-4 w-4 rounded-full border transition"
        style={{
          borderColor: selected ? "#2563eb" : "#c8c5bd",
          background: selected ? "#2563eb" : "transparent",
        }}
      />
      <button onClick={run(onSelect)} disabled={busy} className="flex-1 text-left min-w-0">
        <div className="text-[13.5px] font-semibold truncate" style={{ color: "#0a0a14" }}>{conn.name}</div>
        <div className="text-[11.5px] truncate" style={{ color: "#8a8898" }}>
          {conn.host}:{conn.port}/{conn.service_name} · {conn.user}
        </div>
      </button>
      <button onClick={onEdit} disabled={busy} className="text-[11.5px] font-semibold px-2 py-1 rounded-md"
        style={{ color: "#45445a", background: "#fff", border: "1px solid #e8e5dd" }}>Edit</button>
      <button onClick={run(onDelete)} disabled={busy} className="text-[11.5px] font-semibold px-2 py-1 rounded-md"
        style={{ color: "#b91c1c", background: "#fff", border: "1px solid #fecaca" }}>Delete</button>
    </div>
  );
}

function ConnectionForm({
  editing, isFirst, onCancel, onDone,
}: {
  editing: ConnectionMeta | null;
  isFirst: boolean;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState(editing?.name ?? "");
  const [host, setHost] = useState(editing?.host ?? "");
  const [port, setPort] = useState(String(editing?.port ?? 1521));
  const [serviceName, setServiceName] = useState(editing?.service_name ?? "");
  const [user, setUser] = useState(editing?.user ?? "");
  const [password, setPassword] = useState("");
  const [initDb, setInitDb] = useState(isFirst && !editing);
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");

  const [testState, setTestState] = useState<"idle" | "ok">("idle");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function payload() {
    return {
      name: name.trim(),
      host: host.trim(),
      port: Number(port) || 1521,
      service_name: serviceName.trim(),
      user: user.trim(),
      password,
    };
  }

  async function onTest() {
    setError(null); setTestState("idle"); setBusy(true);
    try {
      const { name: _n, ...conn } = payload();
      void _n;
      await testConnection(conn);
      setTestState("ok");
    } catch (e) { setError(humanize(e)); } finally { setBusy(false); }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setBusy(true);
    try {
      if (editing) {
        await updateConnection(editing.id, payload());
      } else {
        await createConnection({
          ...payload(),
          ...(initDb ? { admin_username: adminUsername.trim(), admin_password: adminPassword } : {}),
        });
      }
      onDone();
    } catch (e) { setError(humanize(e)); } finally { setBusy(false); }
  }

  return (
    <Card>
      <h1 className="text-[15px] font-semibold mb-1" style={{ color: "#0a0a14" }}>
        {editing ? "Edit connection" : "New connection"}
      </h1>
      <p className="text-[12px] mb-5" style={{ color: "#8a8898" }}>
        Oracle connection details are stored securely on this computer.
      </p>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label className={labelCls} style={labelStyle}>Connection name</label>
          <input className={inputCls} style={inputStyle} required autoFocus placeholder="Production Oracle"
            value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <label className={labelCls} style={labelStyle}>Sunucu (Host / IP)</label>
            <input className={inputCls} style={inputStyle} required placeholder="192.168.1.10"
              value={host} onChange={(e) => setHost(e.target.value)} disabled={busy} />
          </div>
          <div style={{ width: 96 }}>
            <label className={labelCls} style={labelStyle}>Port</label>
            <input className={inputCls} style={inputStyle} required inputMode="numeric"
              value={port} onChange={(e) => setPort(e.target.value)} disabled={busy} />
          </div>
        </div>

        <div>
          <label className={labelCls} style={labelStyle}>Service name</label>
          <input className={inputCls} style={inputStyle} required placeholder="ORCLPDB1"
            value={serviceName} onChange={(e) => setServiceName(e.target.value)} disabled={busy} />
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <label className={labelCls} style={labelStyle}>Database user</label>
            <input className={inputCls} style={inputStyle} required autoComplete="off"
              value={user} onChange={(e) => setUser(e.target.value)} disabled={busy} />
          </div>
          <div className="flex-1">
            <label className={labelCls} style={labelStyle}>
              Database password {editing && <span style={{ color: "#8a8898" }}>(re-enter)</span>}
            </label>
            <input type="password" className={inputCls} style={inputStyle} required autoComplete="off"
              value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} />
          </div>
        </div>

        {!editing && (
          <label className="flex items-center gap-2 text-[12.5px] cursor-pointer" style={{ color: "#45445a" }}>
            <input type="checkbox" checked={initDb} onChange={(e) => setInitDb(e.target.checked)} disabled={busy} />
            New/empty database — set up schema and first admin
          </label>
        )}

        {!editing && initDb && (
          <div className="rounded-lg p-3.5 space-y-4" style={{ background: "#f7f9ff", border: "1px solid #dbe4ff" }}>
            <p className="text-[11.5px] font-semibold" style={{ color: "#3452c9" }}>First admin account</p>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className={labelCls} style={labelStyle}>Admin username</label>
                <input className={inputCls} style={inputStyle} required={initDb} autoComplete="off"
                  value={adminUsername} onChange={(e) => setAdminUsername(e.target.value)} disabled={busy} />
              </div>
              <div className="flex-1">
                <label className={labelCls} style={labelStyle}>Admin password</label>
                <input type="password" className={inputCls} style={inputStyle} required={initDb} autoComplete="new-password"
                  value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} disabled={busy} />
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="text-[12.5px] px-3 py-2 rounded-lg"
            style={{ background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca" }}>{error}</div>
        )}
        {testState === "ok" && !error && (
          <div className="text-[12.5px] px-3 py-2 rounded-lg"
            style={{ background: "#f0fdf4", color: "#15803d", border: "1px solid #bbf7d0" }}>Connection successful.</div>
        )}

        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onCancel} disabled={busy}
            className="py-2.5 px-4 rounded-lg text-[13.5px] font-semibold"
            style={{ background: "#faf9f6", border: "1px solid #e8e5dd", color: "#45445a" }}>Cancel</button>
          <button type="button" onClick={onTest} disabled={busy}
            className="flex-1 py-2.5 rounded-lg text-[13.5px] font-semibold"
            style={{ background: "#faf9f6", border: "1px solid #e8e5dd", color: "#45445a" }}>
            {busy ? "..." : "Test et"}
          </button>
          <button type="submit" disabled={busy}
            className="flex-1 py-2.5 rounded-lg text-[13.5px] font-semibold text-white"
            style={{ background: "linear-gradient(180deg, #2563eb, #1e40af)", boxShadow: "0 4px 12px rgba(37,83,228,0.25)" }}>
            {editing ? "Save" : "Add"}
          </button>
        </div>
      </form>
    </Card>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10"
      style={{ background: "#faf9f6", color: "#0a0a14" }}>
      <div className="w-full max-w-[480px]">
        <div className="flex items-center gap-2.5 mb-8 justify-center">
          <img src="/favicon.png" alt="Actuarius" className="h-11 w-11" />
          <span className="text-[22px] font-semibold tracking-tight">Actuarius</span>
        </div>
        {children}
        <p className="text-center text-[11px] mt-5" style={{ color: "#8a8898" }}>
          Enterprise — offline setup
        </p>
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-7" style={{ background: "#fff", border: "1px solid #e8e5dd" }}>
      {children}
    </div>
  );
}

function humanize(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.message && !err.message.startsWith("http_")) return err.message;
    if (err.status === 403) return "This action is disabled in environment-variable mode.";
    return `Server error: ${err.code}`;
  }
  return "Could not reach the backend. Try restarting the app.";
}
