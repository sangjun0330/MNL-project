import { Suspense } from "react";
import { SocialPostDetailPage } from "@/components/pages/SocialPostDetailPage";

export const dynamic = "force-dynamic";

export default async function SocialPostRoute(
  props: {
    params: Promise<{ postId: string }>;
  }
) {
  const params = await props.params;
  return (
    <Suspense fallback={null}>
      <SocialPostDetailPage postId={params.postId} />
    </Suspense>
  );
}
