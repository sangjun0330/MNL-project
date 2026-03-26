import { Suspense } from "react";
import { SettingsBillingSuccessPage } from "@/components/pages/SettingsBillingSuccessPage";

export default function Page() {
  return (
      <Suspense fallback={null}>
        <SettingsBillingSuccessPage />
      </Suspense>
  );
}
