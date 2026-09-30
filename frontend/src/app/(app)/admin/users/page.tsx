"use client";

import { useEffect, useState } from "react";
import {
  fetchUsers,
  createUser,
  updateUser,
  deleteUser,
  type UserRecord,
} from "@/lib/sync/worker-client";
import { useMe } from "@/lib/auth/auth-gate";
import { useRouter } from "next/navigation";

// Web: kullanıcılar e-postayla davet edilir; parola ve giriş Firebase'dedir.
// Davet edilen kişi aynı e-postayla ilk kez giriş yaptığında bu ekibe bağlanır.
const ERRORS: Record<string, string> = {
  invalid_email: "Enter a valid email address.",
  username_exists: "This user is already in the team.",
  member_of_other_workspace: "This person already belongs to another team.",
  cannot_delete_self: "You cannot remove yourself.",
  team_requires_enterprise: "Inviting teammates is part of Actuarius Enterprise.",
};

function errorText(err: unknown): string {
  const e = err as { code?: string; detail?: unknown; message?: string };
  const key = typeof e.detail === "string" ? e.detail : e.code;
  return (key && ERRORS[key]) || e.message || "Operation failed.";
}

export default function UsersPage() {
  const router = useRouter();
  const me = useMe();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Yeni kullanıcı formu
  const [newUsername, setNewUsername] = useState("");
  const [newRole, setNewRole] = useState<"user" | "admin">("user");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (me?.role !== "admin") {
      router.replace("/reserve");
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    if (!newUsername) return;
    setCreating(true);
    setError(null);
    try {
      await createUser({ username: newUsername.trim(), role: newRole });
      setNewUsername("");
      setNewRole("user");
      await load();
    } catch (err: unknown) {
      setError(errorText(err));
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleActive(u: UserRecord) {
    try {
      await updateUser(u.id, { is_active: !u.is_active });
      await load();
    } catch (err: unknown) {
      setError(errorText(err));
    }
  }

  async function handleDelete(u: UserRecord) {
    if (!confirm(`Delete ${u.username}?`)) return;
    try {
      await deleteUser(u.id);
      await load();
    } catch (err: unknown) {
      setError(errorText(err));
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

      {/* Yeni kullanıcı — çoklu kullanıcı Enterprise özelliği */}
      {me?.teamEnabled ? (
      <div className="mb-8 p-5 rounded-xl border bg-[color:var(--surface)]">
        <h2 className="text-base font-medium mb-4">Invite User</h2>
        <form onSubmit={handleCreate} className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[color:var(--muted-strong)]">Email</label>
            <input
              type="email"
              className="border rounded-lg px-3 py-2 text-sm w-64 bg-[color:var(--background)]"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder="name@company.com"
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-[color:var(--muted-strong)]">Role</label>
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
            {creating ? "Adding..." : "Add"}
          </button>
        </form>
      </div>
      ) : (
        <div className="mb-8 p-5 rounded-xl border bg-[color:var(--surface)]">
          <h2 className="text-base font-medium mb-1">Invite teammates</h2>
          <p className="text-sm text-[color:var(--muted-strong)]">
            Shared workspaces with multiple users and roles are part of Actuarius Enterprise.
          </p>
          <a href="/#contact" className="inline-block mt-3 text-sm font-medium text-[color:var(--brand)]">
            Talk to us about Enterprise →
          </a>
        </div>
      )}

      {/* Kullanıcı listesi */}
      {loading ? (
        <p className="text-sm text-[color:var(--muted-strong)]">Loading...</p>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[color:var(--surface)]">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-[color:var(--muted-strong)]">User</th>
                <th className="px-4 py-3 text-left font-medium text-[color:var(--muted-strong)]">Role</th>
                <th className="px-4 py-3 text-left font-medium text-[color:var(--muted-strong)]">Durum</th>
                <th className="px-4 py-3 text-right font-medium text-[color:var(--muted-strong)]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-[color:var(--surface-hover)]">
                  <td className="px-4 py-3 font-mono">
                    {u.username}
                    {u.is_owner && <span className="ml-2 text-[10px] font-sans text-[color:var(--muted)]">owner</span>}
                    {!u.is_owner && u.joined === false && <span className="ml-2 text-[10px] font-sans text-[color:var(--muted)]">invited</span>}
                  </td>
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
                    {!u.is_owner && <div className="flex justify-end gap-2">
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
                    </div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
}
