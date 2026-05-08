"use client";

import { AppSidebar } from "@/components/AppSidebar";
import { AgentRegistryProvider } from "@/lib/agent-registry";
import { GlobalAgentLauncher, GlobalAgentPanel } from "@/components/GlobalAgent";
import { ProjectProvider } from "@/lib/project-store";
import { ReserveAgentBridge } from "@/components/ReserveAgentBridge";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProjectProvider>
      <AgentRegistryProvider>
        <ReserveAgentBridge />
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
    </ProjectProvider>
  );
}
