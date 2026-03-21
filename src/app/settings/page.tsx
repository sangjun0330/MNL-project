import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { SettingsPage } from "@/components/pages/SettingsPage";

export default function Page() {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <SettingsPage />
      </Suspense>
    </AppShell>
  );
}
