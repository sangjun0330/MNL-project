import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { SettingsPersonalizationPage } from "@/components/pages/SettingsPersonalizationPage";

export default function Page() {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <SettingsPersonalizationPage />
      </Suspense>
    </AppShell>
  );
}
