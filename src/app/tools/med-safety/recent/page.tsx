import { AppShell } from "@/components/shell/AppShell";
import type { Metadata } from "next";
import { ToolMedSafetyRecentPage } from "@/components/pages/tools/ToolMedSafetyRecentPage";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default function Page() {
  return (
    <AppShell>
      <ToolMedSafetyRecentPage />
    </AppShell>
  );
}
