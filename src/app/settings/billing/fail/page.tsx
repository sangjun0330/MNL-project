import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { SettingsBillingFailPage } from "@/components/pages/SettingsBillingFailPage";

export default function Page() {
  return (
    <AppShell>
      <Suspense fallback={<div className="min-h-[40dvh] rounded-apple bg-white/70" />}>
        <SettingsBillingFailPage />
      </Suspense>
    </AppShell>
  );
}
