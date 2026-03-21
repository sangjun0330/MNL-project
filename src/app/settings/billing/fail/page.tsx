import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { SettingsBillingFailPage } from "@/components/pages/SettingsBillingFailPage";

export default function Page() {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <SettingsBillingFailPage />
      </Suspense>
    </AppShell>
  );
}
