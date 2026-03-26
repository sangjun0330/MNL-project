import { Suspense } from "react";
import { SettingsBillingUpgradePage } from "@/components/pages/SettingsBillingUpgradePage";

export default function Page() {
  return (
      <Suspense fallback={null}>
        <SettingsBillingUpgradePage />
      </Suspense>
  );
}
