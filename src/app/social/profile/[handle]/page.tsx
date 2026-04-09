import { Suspense } from "react";
import { SocialProfilePage } from "@/components/pages/SocialProfilePage";

export const dynamic = "force-dynamic";

export default async function SocialProfileRoute(
  props: {
    params: Promise<{ handle: string }>;
  }
) {
  const params = await props.params;
  return (
    <Suspense fallback={null}>
      <SocialProfilePage handle={params.handle} />
    </Suspense>
  );
}
