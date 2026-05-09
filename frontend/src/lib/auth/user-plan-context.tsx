"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Plan } from "@/lib/sync/worker-client";

const Ctx = createContext<Plan>("free");

export function UserPlanProvider({
  plan,
  children,
}: {
  plan: Plan;
  children: ReactNode;
}) {
  return <Ctx.Provider value={plan}>{children}</Ctx.Provider>;
}

export function useUserPlan(): Plan {
  return useContext(Ctx);
}
