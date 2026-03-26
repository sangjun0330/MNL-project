import { Suspense } from "react";
import { SocialPage } from "@/components/pages/SocialPage";

export default function Page() {
  return (
      <Suspense fallback={null}>
        <SocialPage />
      </Suspense>
  );
}
