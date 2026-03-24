import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { InsightsAIRecoveryDetail } from "@/components/pages/insights/InsightsAIRecoveryDetail";
import type { AIRecoverySessionResponse, AIRecoverySlot } from "@/lib/aiRecovery";
import { todayISO } from "@/lib/date";

export const runtime = "edge";
export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Page({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const rawSlot = Array.isArray(params.slot) ? params.slot[0] : params.slot;
  const initialSlot: AIRecoverySlot = rawSlot === "postShift" ? "postShift" : "wake";
  let initialData: AIRecoverySessionResponse["data"] | null = null;

  try {
    const [{ readAuthIdentityFromServer }, { readAIRecoverySessionView }] = await Promise.all([
      import("@/lib/server/readUserId"),
      import("@/lib/server/aiRecovery"),
    ]);
    const identity = await readAuthIdentityFromServer();
    if (identity.userId) {
      initialData = (await readAIRecoverySessionView({
        userId: identity.userId,
        userEmail: identity.email,
        dateISO: todayISO(),
        slot: initialSlot,
      })) as AIRecoverySessionResponse["data"];
    }
  } catch {}

  return (
    <AppShell>
      <Suspense fallback={null}>
        <InsightsAIRecoveryDetail initialSlot={initialSlot} initialData={initialData} />
      </Suspense>
    </AppShell>
  );
}
