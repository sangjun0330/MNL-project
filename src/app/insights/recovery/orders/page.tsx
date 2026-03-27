import { InsightsRecoveryOrdersDetail } from "@/components/pages/insights/InsightsRecoveryOrdersDetail";
import type { AIRecoverySlot } from "@/lib/aiRecovery";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function Page({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const rawSlot = Array.isArray(params.slot) ? params.slot[0] : params.slot;
  const requestedSlot: AIRecoverySlot | null = rawSlot === "postShift" ? "postShift" : rawSlot === "wake" ? "wake" : null;
  return <InsightsRecoveryOrdersDetail requestedSlot={requestedSlot} />;
}
