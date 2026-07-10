/**
 * JWT tabanlı auth — Firebase yok, token localStorage'da tutulur.
 */

const TOKEN_KEY = "reserve_enterprise_token";
const USER_KEY = "reserve_enterprise_user";

export interface EnterpriseUser {
  user_id: number;
  username: string;
  role: "admin" | "user";
}

export function saveSession(token: string, user: EnterpriseUser): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUser(): EnterpriseUser | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as EnterpriseUser;
  } catch {
    return null;
  }
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

export function isAdmin(): boolean {
  return getUser()?.role === "admin";
}
