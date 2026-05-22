"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { saveSession, clearSession, getToken, getUser, type EnterpriseUser } from "./jwt";
import { login as apiLogin, ApiError } from "@/lib/sync/worker-client";

export interface AuthUser {
  uid: string;
  username: string;
  role: "admin" | "user";
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  logout: () => void;
  getIdToken: () => string | null;
}

const AuthCtx = createContext<AuthState | null>(null);

function toAuthUser(u: EnterpriseUser | null): AuthUser | null {
  if (!u) return null;
  return { uid: String(u.user_id), username: u.username, role: u.role };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (getToken()) {
      setUser(toAuthUser(getUser()));
    }
    setLoading(false);
  }, []);

  async function signIn(username: string, password: string) {
    const res = await apiLogin(username, password);
    const enterpriseUser: EnterpriseUser = {
      user_id: res.user_id,
      username: res.username,
      role: res.role as "admin" | "user",
    };
    saveSession(res.token, enterpriseUser);
    setUser(toAuthUser(enterpriseUser));
  }

  function logout() {
    clearSession();
    setUser(null);
  }

  const ctx = useMemo<AuthState>(
    () => ({ user, loading, signIn, logout, getIdToken: getToken }),
    [user, loading],
  );

  return <AuthCtx.Provider value={ctx}>{children}</AuthCtx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
