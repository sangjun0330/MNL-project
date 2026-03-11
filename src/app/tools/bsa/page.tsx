import { AppShell } from "@/components/shell/AppShell";
import { ToolBSAPage } from "@/components/pages/tools/ToolBSAPage";
import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function Page() {
  return (
    <AppShell>
      <ToolBSAPage />
    </AppShell>
  );
}
