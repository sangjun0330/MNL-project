import { AppShell } from "@/components/shell/AppShell";
import { ToolCrClPage } from "@/components/pages/tools/ToolCrClPage";
import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function Page() {
  return (
    <AppShell>
      <ToolCrClPage />
    </AppShell>
  );
}
