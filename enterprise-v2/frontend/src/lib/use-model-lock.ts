"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { getToken } from "@/lib/auth/jwt";
import { API_BASE } from "@/lib/api";

export interface LockState {
  status: "idle" | "mine" | "locked_by_other" | "error";
  lockedByName?: string;
  expiresAt?: string;
}

async function apiFetch(path: string, options?: RequestInit) {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  return res;
}

const HEARTBEAT_MS = 60_000; // 60 saniyede bir yenile

export function useModelLock(lockKey: string | null) {
  const [state, setState] = useState<LockState>({ status: "idle" });
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lockKeyRef = useRef<string | null>(null);

  const acquire = useCallback(async (key: string) => {
    try {
      const res = await apiFetch("/v1/locks/acquire", {
        method: "POST",
        body: JSON.stringify({ lock_key: key }),
      });
      if (res.ok) {
        setState({ status: "mine" });
        // Kilit sahibi en güncel veriyi düzenlesin diye senkronu tetikle
        window.dispatchEvent(new Event("model-lock-acquired"));
        return true;
      }
      if (res.status === 423) {
        const data = await res.json();
        setState({
          status: "locked_by_other",
          lockedByName: data.detail?.locked_by_name,
          expiresAt: data.detail?.expires_at,
        });
        return false;
      }
      setState({ status: "error" });
      return false;
    } catch {
      setState({ status: "error" });
      return false;
    }
  }, []);

  const release = useCallback(async (key: string) => {
    try {
      await apiFetch(`/v1/locks/${encodeURIComponent(key)}`, { method: "DELETE" });
    } catch { /* ignore */ }
    setState({ status: "idle" });
  }, []);

  // lockKey değişince: eski kilidi bırak, yenisini al
  useEffect(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }

    const prevKey = lockKeyRef.current;
    lockKeyRef.current = lockKey;

    if (prevKey && prevKey !== lockKey) {
      release(prevKey);
    }

    if (!lockKey) {
      setState({ status: "idle" });
      return;
    }

    acquire(lockKey).then((ok) => {
      if (ok) {
        heartbeatRef.current = setInterval(() => acquire(lockKey), HEARTBEAT_MS);
      }
    });

    return () => {
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
    };
  }, [lockKey, acquire, release]);

  // Sayfa kapanınca kilidi bırak
  useEffect(() => {
    const handleUnload = () => {
      if (lockKeyRef.current) {
        const token = getToken();
        navigator.sendBeacon(
          `${API_BASE}/v1/locks/${encodeURIComponent(lockKeyRef.current)}`,
          // sendBeacon DELETE desteklemez, fetch kullan
        );
        // Sync fetch as fallback
        try {
          fetch(`${API_BASE}/v1/locks/${encodeURIComponent(lockKeyRef.current)}`, {
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
      const res = await apiFetch("/v1/locks/force-acquire", {
        method: "POST",
        body: JSON.stringify({ lock_key: key }),
      });
      if (res.ok) {
        setState({ status: "mine" });
        window.dispatchEvent(new Event("model-lock-acquired"));
        if (heartbeatRef.current) clearInterval(heartbeatRef.current);
        heartbeatRef.current = setInterval(() => acquire(key), HEARTBEAT_MS);
      }
    } catch { /* ignore */ }
  }, [acquire]);

  return { state, forceRelease, forceAcquire };
}
