import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { SocialPage } from "@/components/pages/SocialPage";

export default function Page() {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <SocialPage />
      </Suspense>
    </AppShell>
  );
}
