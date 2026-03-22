import { AppShell } from "@/components/shell/AppShell";
import { InsightsRecoveryDetail } from "@/components/pages/insights/InsightsRecoveryDetail";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <AppShell>
      <InsightsRecoveryDetail />
    </AppShell>
  );
}
