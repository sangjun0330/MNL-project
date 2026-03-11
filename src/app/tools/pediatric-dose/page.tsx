import { AppShell } from "@/components/shell/AppShell";
import { ToolPediatricDosePage } from "@/components/pages/tools/ToolPediatricDosePage";
import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function Page() {
  return (
    <AppShell>
      <ToolPediatricDosePage />
    </AppShell>
  );
}
