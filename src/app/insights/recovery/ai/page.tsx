import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { InsightsAIRecoveryDetail } from "@/components/pages/insights/InsightsAIRecoveryDetail";

export default function Page() {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <InsightsAIRecoveryDetail />
      </Suspense>
    </AppShell>
  );
}
