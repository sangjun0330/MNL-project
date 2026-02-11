import { AppShell } from "@/components/shell/AppShell";
import { SettingsBillingFailPage } from "@/components/pages/SettingsBillingFailPage";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <AppShell>
      <SettingsBillingFailPage />
    </AppShell>
  );
}
