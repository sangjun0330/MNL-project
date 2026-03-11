import { AppShell } from "@/components/shell/AppShell";
import { ToolUnitConverterPage } from "@/components/pages/tools/ToolUnitConverterPage";
import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function Page() {
  return (
    <AppShell>
      <ToolUnitConverterPage />
    </AppShell>
  );
}
