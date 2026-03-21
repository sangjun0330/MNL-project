import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { SettingsBillingPage } from "@/components/pages/SettingsBillingPage";

export default function Page() {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <SettingsBillingPage />
      </Suspense>
    </AppShell>
  );
}
