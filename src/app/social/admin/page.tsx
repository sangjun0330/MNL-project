import { Suspense } from "react";
import { SocialAdminPage } from "@/components/pages/SocialAdminPage";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <SocialAdminPage />
    </Suspense>
  );
}
