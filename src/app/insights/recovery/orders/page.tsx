import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { InsightsRecoveryOrdersDetail } from "@/components/pages/insights/InsightsRecoveryOrdersDetail";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <InsightsRecoveryOrdersDetail />
      </Suspense>
    </AppShell>
  );
}
