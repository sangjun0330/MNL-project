import { Suspense } from "react";
import { SettingsBillingFailPage } from "@/components/pages/SettingsBillingFailPage";

export default function Page() {
  return (
      <Suspense fallback={null}>
        <SettingsBillingFailPage />
      </Suspense>
  );
}
