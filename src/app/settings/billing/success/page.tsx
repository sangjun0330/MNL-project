import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { SettingsBillingSuccessPage } from "@/components/pages/SettingsBillingSuccessPage";

export default function Page() {
  return (
    <AppShell>
      <Suspense fallback={<div className="min-h-[40dvh] rounded-apple bg-white/70" />}>
        <SettingsBillingSuccessPage />
      </Suspense>
    </AppShell>
  );
}
