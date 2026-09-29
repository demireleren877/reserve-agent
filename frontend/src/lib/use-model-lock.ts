"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import {
  WORKER_BASE,
  WorkerError,
  acquireLock,
  getToken,
  releaseLock,
} from "@/lib/sync/worker-client";

export interface LockState {
  status: "idle" | "mine" | "locked_by_other" | "error";
  lockedByName?: string;
  expiresAt?: string;
}

// Sayfa kapanırken (beforeunload) async token alınamaz; son bilinen token saklanır.
let lastToken: string | null = null;
async function rememberToken() {
  try {
    lastToken = await getToken();
  } catch {
    /* oturum yok */
  }
}

const HEARTBEAT_MS = 60_000; // 60 saniyede bir yenile

export function useModelLock(lockKey: string | null) {
  const [state, setState] = useState<LockState>({ status: "idle" });
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lockKeyRef = useRef<string | null>(null);

  const acquire = useCallback(async (key: string) => {
    void rememberToken();
    try {
      await acquireLock(key);
      setState({ status: "mine" });
      // Kilit sahibi en güncel veriyi düzenlesin diye senkronu tetikle
      window.dispatchEvent(new Event("model-lock-acquired"));
      return true;
    } catch (e) {
      if (e instanceof WorkerError && e.status === 423) {
        const d = (e.detail ?? {}) as { locked_by_name?: string; expires_at?: string };
        setState({
          status: "locked_by_other",
          lockedByName: d.locked_by_name,
          expiresAt: d.expires_at,
        });
        return false;
      }
      setState({ status: "error" });
      return false;
    }
  }, []);

  const release = useCallback(async (key: string) => {
    try {
      await releaseLock(key);
    } catch { /* ignore */ }
    setState({ status: "idle" });
  }, []);

  // lockKey değişince: eski kilidi bırak, yenisini al
  useEffect(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }

    lockKeyRef.current = lockKey;

    if (!lockKey) {
      setState({ status: "idle" });
      return;
    }

    let cancelled = false;
    acquire(lockKey).then((ok) => {
      // Bu arada unmount/lockKey değişimi olduysa heartbeat kurma (zombie kilit önle)
      if (cancelled) return;
      if (ok) {
        heartbeatRef.current = setInterval(() => acquire(lockKey), HEARTBEAT_MS);
      }
    });

    // Temizlik unmount'ta VE lockKey değişince çalışır → kilidi HER durumda bırak
    // (logout, başka sayfaya geçiş, branch değiştirme). Aksi halde kilit TTL'e
    // kadar kalır ve diğer kullanıcı "başkası düzenliyor" görür.
    return () => {
      cancelled = true;
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      release(lockKey);
    };
  }, [lockKey, acquire, release]);

  // Logout: token temizlenmeden hemen önce kilidi bırak (geçerli token'la DELETE)
  useEffect(() => {
    const onLogout = () => {
      if (lockKeyRef.current) release(lockKeyRef.current);
    };
    window.addEventListener("app-logout", onLogout);
    return () => window.removeEventListener("app-logout", onLogout);
  }, [release]);

  // Sayfa kapanınca kilidi bırak
  useEffect(() => {
    const handleUnload = () => {
      if (lockKeyRef.current) {
        const token = lastToken;
        // sendBeacon DELETE desteklemez → keepalive fetch
        try {
          fetch(`${WORKER_BASE}/v1/locks/${encodeURIComponent(lockKeyRef.current)}`, {
            method: "DELETE",
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            keepalive: true,
          });
        } catch { /* ignore */ }
      }
    };
    window.addEventListener("beforeunload", handleUnload);
    return () => window.removeEventListener("beforeunload", handleUnload);
  }, []);

  const forceRelease = useCallback(() => {
    if (lockKeyRef.current) release(lockKeyRef.current);
  }, [release]);

  // Kilidi zorla devral (bayat/başkasının kilidini sil, kendine al)
  const forceAcquire = useCallback(async () => {
    const key = lockKeyRef.current;
    if (!key) return;
    try {
      await acquireLock(key, true);
      setState({ status: "mine" });
      window.dispatchEvent(new Event("model-lock-acquired"));
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      heartbeatRef.current = setInterval(() => acquire(key), HEARTBEAT_MS);
    } catch { /* ignore */ }
  }, [acquire]);

  return { state, forceRelease, forceAcquire };
}
