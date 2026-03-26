import { Suspense } from "react";
import { SettingsPersonalizationPage } from "@/components/pages/SettingsPersonalizationPage";

export default function Page() {
  return (
      <Suspense fallback={null}>
        <SettingsPersonalizationPage />
      </Suspense>
  );
}
