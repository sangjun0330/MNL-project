import { AppShell } from "@/components/shell/AppShell";
import { SettingsBillingSuccessPage } from "@/components/pages/SettingsBillingSuccessPage";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <AppShell>
      <SettingsBillingSuccessPage />
    </AppShell>
  );
}
