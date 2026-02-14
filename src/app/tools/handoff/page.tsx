import { AppShell } from "@/components/shell/AppShell";
import { ToolHandoffPage } from "@/components/pages/tools/ToolHandoffPage";
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
      <ToolHandoffPage />
    </AppShell>
  );
}
