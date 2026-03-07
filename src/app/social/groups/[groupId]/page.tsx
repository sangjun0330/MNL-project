import { SocialGroupPage } from "@/components/pages/SocialGroupPage";
import { Suspense } from "react";

export const runtime = "edge";

export default async function GroupDetailPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  return (
    <Suspense>
      <SocialGroupPage groupId={groupId} />
    </Suspense>
  );
}
