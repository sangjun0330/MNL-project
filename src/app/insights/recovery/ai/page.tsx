import { InsightsAIRecoveryDetail } from "@/components/pages/insights/InsightsAIRecoveryDetail";
import type { AIRecoverySlot } from "@/lib/aiRecovery";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Page({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const rawSlot = Array.isArray(params.slot) ? params.slot[0] : params.slot;
  const requestedSlot: AIRecoverySlot | null = rawSlot === "postShift" ? "postShift" : rawSlot === "wake" ? "wake" : null;
  return <InsightsAIRecoveryDetail requestedSlot={requestedSlot} />;
}
