import { AppShell } from "@/components/shell/AppShell";
import { ToolFluidBalancePage } from "@/components/pages/tools/ToolFluidBalancePage";
import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function Page() {
  return (
    <AppShell>
      <ToolFluidBalancePage />
    </AppShell>
  );
}
