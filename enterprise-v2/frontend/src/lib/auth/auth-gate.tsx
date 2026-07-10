"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "./auth-context";

export interface MeSnapshot {
  uid: string;
  username: string;
  role: "admin" | "user";
}

interface Props {
  children: (me: MeSnapshot) => ReactNode;
}

export function AuthGate({ children }: Props) {
  const router = useRouter();
  const auth = useAuth();

  useEffect(() => {
    if (auth.loading) return;
    if (!auth.user) {
      router.replace("/login");
    }
  }, [auth.user, auth.loading, router]);

  if (auth.loading || !auth.user) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "#faf9f6", color: "#8a8898" }}
      >
        <div className="text-[13px]">Yükleniyor...</div>
      </div>
    );
  }

  const me: MeSnapshot = {
    uid: auth.user.uid,
    username: auth.user.username,
    role: auth.user.role,
  };

  return <>{children(me)}</>;
}
