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
      <Suspense fallback={null}>
        <SocialGroupChallengePage groupId={groupId} challengeId={challengeId} />
      </Suspense>
    </AppShell>
  );
}
