import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { InsightsAIRecoveryDetail } from "@/components/pages/insights/InsightsAIRecoveryDetail";
import { pickPreferredAIRecoverySlot, type AIRecoverySessionResponse, type AIRecoverySlot } from "@/lib/aiRecovery";
import { todayISO } from "@/lib/date";

export const runtime = "edge";
export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Page({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const rawSlot = Array.isArray(params.slot) ? params.slot[0] : params.slot;
  const requestedSlot: AIRecoverySlot | null = rawSlot === "postShift" ? "postShift" : rawSlot === "wake" ? "wake" : null;
  let initialSlot: AIRecoverySlot = requestedSlot ?? "wake";
  let initialData: AIRecoverySessionResponse["data"] | null = null;

  try {
    const [{ readAuthIdentityFromServer }, { readAIRecoverySessionView }] = await Promise.all([
      import("@/lib/server/readUserId"),
      import("@/lib/server/aiRecovery"),
    ]);
    const identity = await readAuthIdentityFromServer();
    if (identity.userId) {
      if (requestedSlot) {
        initialData = (await readAIRecoverySessionView({
          userId: identity.userId,
          userEmail: identity.email,
          dateISO: todayISO(),
          slot: requestedSlot,
        })) as AIRecoverySessionResponse["data"];
      } else {
        const [wakeData, postShiftData] = (await Promise.all([
          readAIRecoverySessionView({
            userId: identity.userId,
            userEmail: identity.email,
            dateISO: todayISO(),
            slot: "wake",
          }),
          readAIRecoverySessionView({
            userId: identity.userId,
            userEmail: identity.email,
            dateISO: todayISO(),
            slot: "postShift",
          }),
        ])) as [AIRecoverySessionResponse["data"], AIRecoverySessionResponse["data"]];
        const preferred = pickPreferredAIRecoverySlot({
          wake: wakeData,
          postShift: postShiftData,
        });
        initialSlot = preferred.slot;
        initialData = preferred.data;
      }
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
