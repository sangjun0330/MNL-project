import { AppShell } from "@/components/shell/AppShell";
import { ToolMedSafetyPage } from "@/components/pages/tools/ToolMedSafetyPage";
import type { Metadata } from "next";

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

