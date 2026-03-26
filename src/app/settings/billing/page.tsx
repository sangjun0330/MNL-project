import { Suspense } from "react";
import { SettingsBillingPage } from "@/components/pages/SettingsBillingPage";

export default function Page() {
  return (
      <Suspense fallback={null}>
        <SettingsBillingPage />
      </Suspense>
  );
}
