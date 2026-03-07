import { SocialGroupPage } from "@/components/pages/SocialGroupPage";
import { AppShell } from "@/components/shell/AppShell";
import { Suspense } from "react";

export const runtime = "edge";

export default async function GroupDetailPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  return (
    <AppShell>
      <Suspense fallback={<div className="min-h-[40dvh] rounded-apple bg-white/70" />}>
        <SocialGroupPage groupId={groupId} />
      </Suspense>
    </AppShell>
  );
}
