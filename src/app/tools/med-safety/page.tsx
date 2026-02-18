import { AppShell } from "@/components/shell/AppShell";
import type { Metadata } from "next";
import { ToolMedSafetyPage } from "@/components/pages/tools/ToolMedSafetyPage";

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
      <ToolMedSafetyPage />
    </AppShell>
  );
}
