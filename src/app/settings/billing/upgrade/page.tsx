import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { SettingsBillingUpgradePage } from "@/components/pages/SettingsBillingUpgradePage";

export default function Page() {
  return (
    <AppShell>
      <Suspense fallback={<div className="min-h-[40dvh] rounded-apple bg-white/70" />}>
        <SettingsBillingUpgradePage />
      </Suspense>
    </AppShell>
  );
}
