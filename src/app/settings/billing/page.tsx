import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { SettingsBillingPage } from "@/components/pages/SettingsBillingPage";

export default function Page() {
  return (
    <AppShell>
      <Suspense fallback={<div className="min-h-[40dvh] rounded-apple bg-white/70" />}>
        <SettingsBillingPage />
      </Suspense>
    </AppShell>
  );
}
