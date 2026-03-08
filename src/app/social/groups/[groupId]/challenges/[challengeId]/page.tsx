import { SocialGroupChallengePage } from "@/components/pages/SocialGroupChallengePage";
import { AppShell } from "@/components/shell/AppShell";
import { Suspense } from "react";

export const runtime = "edge";

export default async function ChallengeDetailPage({
  params,
}: {
  params: Promise<{ groupId: string; challengeId: string }>;
}) {
  const { groupId, challengeId } = await params;
  return (
    <AppShell>
      <Suspense
        fallback={
          <div className="mx-auto w-full max-w-[680px] space-y-4 px-1.5 pt-4">
            <div className="h-10 w-32 rounded-full bg-white/70 animate-pulse" />
            <div className="h-40 rounded-[34px] bg-white/70 animate-pulse" />
            <div className="h-28 rounded-[32px] bg-white/70 animate-pulse" />
          </div>
        }
      >
        <SocialGroupChallengePage groupId={groupId} challengeId={challengeId} />
      </Suspense>
    </AppShell>
  );
}
