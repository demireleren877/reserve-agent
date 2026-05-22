"use client";

// Enterprise'da plan kavramı yok — tüm özellikler her zaman açık.
export type Plan = "pro";

export function UserPlanProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function useUserPlan(): Plan {
  return "pro";
}
