import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { SettingsBillingSuccessPage } from "@/components/pages/SettingsBillingSuccessPage";

export default function Page() {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <SettingsBillingSuccessPage />
      </Suspense>
    </AppShell>
  );
}
