import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { SettingsPage } from "@/components/pages/SettingsPage";

export default function Page() {
  return (
    <AppShell>
      <Suspense fallback={<div className="min-h-[40dvh] rounded-apple bg-white/70" />}>
        <SettingsPage />
      </Suspense>
    </AppShell>
  );
}
