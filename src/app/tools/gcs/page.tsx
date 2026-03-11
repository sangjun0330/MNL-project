import { AppShell } from "@/components/shell/AppShell";
import { ToolGCSPage } from "@/components/pages/tools/ToolGCSPage";
import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function Page() {
  return (
    <AppShell>
      <ToolGCSPage />
    </AppShell>
  );
}
