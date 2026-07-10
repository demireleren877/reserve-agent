"use client";

import { AppSidebar } from "@/components/AppSidebar";
import { AgentRegistryProvider } from "@/lib/agent-registry";
import { GlobalAgentLauncher, GlobalAgentPanel } from "@/components/GlobalAgent";
import { ProjectProvider } from "@/lib/project-store";
import { DataStoreProvider } from "@/lib/data-store";
import { ReserveAgentBridge } from "@/components/ReserveAgentBridge";
import { CashflowAgentBridge } from "@/components/CashflowAgentBridge";
import { DiscountAgentBridge } from "@/components/DiscountAgentBridge";
import { DataAgentBridge } from "@/components/DataAgentBridge";
import { AuthGate } from "@/lib/auth/auth-gate";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      {(me) => (
        <ProjectProvider userId={me.uid}>
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
              <div className="flex-1 min-w-0 flex flex-col">{children}</div>
            </div>
            <GlobalAgentLauncher />
            <GlobalAgentPanel />
          </AgentRegistryProvider>
        </DataStoreProvider>
        </ProjectProvider>
      )}
    </AuthGate>
  );
}
