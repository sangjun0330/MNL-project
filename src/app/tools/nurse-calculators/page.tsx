import { AppShell } from "@/components/shell/AppShell";
import { ToolNurseCalculatorsPage } from "@/components/pages/tools/ToolNurseCalculatorsPage";
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
      <ToolNurseCalculatorsPage />
    </AppShell>
  );
}

