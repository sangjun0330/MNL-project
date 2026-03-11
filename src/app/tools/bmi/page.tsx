import { AppShell } from "@/components/shell/AppShell";
import { ToolBMIPage } from "@/components/pages/tools/ToolBMIPage";
import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function Page() {
  return (
    <AppShell>
      <ToolBMIPage />
    </AppShell>
  );
}
