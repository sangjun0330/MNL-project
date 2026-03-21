import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { SettingsBillingUpgradePage } from "@/components/pages/SettingsBillingUpgradePage";

export default function Page() {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <SettingsBillingUpgradePage />
      </Suspense>
    </AppShell>
  );
}
