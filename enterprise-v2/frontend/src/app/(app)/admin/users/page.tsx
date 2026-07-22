"use client";

import { useEffect, useState } from "react";
import {
  fetchUsers,
  createUser,
  updateUser,
  deleteUser,
  UserRecord,
} from "@/lib/sync/worker-client";
import { isAdmin } from "@/lib/auth/jwt";
import { useRouter } from "next/navigation";

export default function UsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Yeni kullanıcı formu
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<"user" | "admin">("user");
  const [creating, setCreating] = useState(false);

  // Şifre sıfırlama
  const [resetUserId, setResetUserId] = useState<number | null>(null);
  const [resetPassword, setResetPassword] = useState("");

  useEffect(() => {
    if (!isAdmin()) {
      router.replace("/home");
      return;
    }
    load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setUsers(await fetchUsers());
    } catch {
      setError("Could not load users.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newUsername || !newPassword) return;
    setCreating(true);
    try {
      await createUser({ username: newUsername, password: newPassword, role: newRole });
      setNewUsername("");
      setNewPassword("");
      setNewRole("user");
      await load();
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleActive(u: UserRecord) {
    try {
      await updateUser(u.id, { is_active: !u.is_active });
      await load();
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  }

  async function handleDelete(u: UserRecord) {
    if (!confirm(`${u.username} silinsin mi?`)) return;
    try {
      await deleteUser(u.id);
      await load();
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!resetUserId || !resetPassword) return;
    try {
      await updateUser(resetUserId, { password: resetPassword });
      setResetUserId(null);
      setResetPassword("");
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">User Management</h1>

      {error && (
        <div className="mb-4 p-3 rounded bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Yeni kullanıcı */}
      <div className="mb-8 p-5 rounded-xl border bg-[color:var(--surface)]">
        <h2 className="text-base font-medium mb-4">Add New User</h2>
        <form onSubmit={handleCreate} className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[color:var(--muted-strong)]">Username</label>
            <input
              className="border rounded-lg px-3 py-2 text-sm w-40 bg-[color:var(--background)]"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder="kullanici_adi"
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[color:var(--muted-strong)]">Password</label>
            <input
              type="password"
              className="border rounded-lg px-3 py-2 text-sm w-40 bg-[color:var(--background)]"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[color:var(--muted-strong)]">Rol</label>
            <select
              className="border rounded-lg px-3 py-2 text-sm bg-[color:var(--background)]"
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as "user" | "admin")}
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={creating}
            className="px-4 py-2 rounded-lg bg-[color:var(--brand)] text-white text-sm font-medium disabled:opacity-50"
          >
            {creating ? "Addniyor..." : "Add"}
          </button>
        </form>
      </div>

      {/* Kullanıcı listesi */}
      {loading ? (
        <p className="text-sm text-[color:var(--muted-strong)]">Loading...</p>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--surface)]">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-[color:var(--muted-strong)]">User</th>
                <th className="px-4 py-3 text-left font-medium text-[color:var(--muted-strong)]">Rol</th>
                <th className="px-4 py-3 text-left font-medium text-[color:var(--muted-strong)]">Durum</th>
                <th className="px-4 py-3 text-right font-medium text-[color:var(--muted-strong)]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-[color:var(--surface-hover)]">
                  <td className="px-4 py-3 font-mono">{u.username}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      u.role === "admin"
                        ? "bg-purple-100 text-purple-700"
                        : "bg-blue-50 text-blue-600"
                    }`}>
                      {u.role === "admin" ? "Admin" : "User"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      u.is_active ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-500"
                    }`}>
                      {u.is_active ? "Aktif" : "Pasif"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => { setResetUserId(u.id); setResetPassword(""); }}
                        className="text-xs px-2 py-1 rounded border hover:bg-[color:var(--surface)] text-[color:var(--muted-strong)]"
                      >
                        Password
                      </button>
                      <button
                        onClick={() => handleToggleActive(u)}
                        className="text-xs px-2 py-1 rounded border hover:bg-[color:var(--surface)] text-[color:var(--muted-strong)]"
                      >
                        {u.is_active ? "Deactivate" : "Activate"}
                      </button>
                      <button
                        onClick={() => handleDelete(u)}
                        className="text-xs px-2 py-1 rounded border border-red-200 hover:bg-red-50 text-red-600"
                      >
                        Sil
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Şifre sıfırlama modal */}
      {resetUserId !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-[color:var(--background)] rounded-2xl p-6 w-80 shadow-xl">
            <h3 className="font-medium mb-4">Reset Password</h3>
            <form onSubmit={handleResetPassword} className="flex flex-col gap-3">
              <input
                type="password"
                className="border rounded-lg px-3 py-2 text-sm bg-[color:var(--surface)]"
                placeholder="New password"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                required
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setResetUserId(null)}
                  className="px-3 py-1.5 rounded-lg border text-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 rounded-lg bg-[color:var(--brand)] text-white text-sm"
                >
                  Kaydet
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
