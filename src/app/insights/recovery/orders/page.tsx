import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { InsightsRecoveryOrdersDetail } from "@/components/pages/insights/InsightsRecoveryOrdersDetail";
import type { AIRecoverySlot } from "@/lib/aiRecovery";

export const runtime = "edge";
export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Page({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const rawSlot = Array.isArray(params.slot) ? params.slot[0] : params.slot;
  const initialSlot: AIRecoverySlot = rawSlot === "postShift" ? "postShift" : "wake";

  return (
    <AppShell>
      <Suspense fallback={null}>
        <InsightsRecoveryOrdersDetail initialSlot={initialSlot} />
      </Suspense>
    </AppShell>
  );
}
