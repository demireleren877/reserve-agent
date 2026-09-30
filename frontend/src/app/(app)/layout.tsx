"use client";

import { AppSidebar } from "@/components/AppSidebar";
import { SyncErrorBanner } from "@/components/SyncErrorBanner";
import { AgentRegistryProvider } from "@/lib/agent-registry";
import { GlobalAgentPanel } from "@/components/GlobalAgent";
import { ProjectProvider } from "@/lib/project-store";
import { DataStoreProvider } from "@/lib/data-store";
import { ReserveAgentBridge } from "@/components/ReserveAgentBridge";
import { CashflowAgentBridge } from "@/components/CashflowAgentBridge";
import { DiscountAgentBridge } from "@/components/DiscountAgentBridge";
import { DataAgentBridge } from "@/components/DataAgentBridge";
import { AuthGate } from "@/lib/auth/auth-gate";
import { UserPlanProvider } from "@/lib/auth/user-plan-context";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      {(me) => (
        <UserPlanProvider plan={me.plan}>
        <ProjectProvider userId={me.uid} userName={me.username}>
        <DataStoreProvider userId={me.uid}>
          <AgentRegistryProvider>
            <ReserveAgentBridge />
            <CashflowAgentBridge />
            <DiscountAgentBridge />
            <DataAgentBridge />
            <div
              className="flex min-h-screen bg-[color:var(--background)] text-[color:var(--foreground)]"
              style={{ colorScheme: "light" }}
            >
              <AppSidebar />
              <div className="flex-1 min-w-0 flex flex-col">
                <SyncErrorBanner />
                {children}
              </div>
            </div>
            <GlobalAgentPanel />
          </AgentRegistryProvider>
        </DataStoreProvider>
        </ProjectProvider>
        </UserPlanProvider>
      )}
    </AuthGate>
  );
}
