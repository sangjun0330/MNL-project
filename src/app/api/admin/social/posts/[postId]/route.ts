import { NextResponse } from "next/server";
import { requireBillingAdmin } from "@/lib/server/billingAdminAuth";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import { deletePost } from "@/lib/server/socialPosts";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function bad(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ postId: string }> },
) {
  const auth = await requireBillingAdmin(req);
  if (!auth.ok) return bad(auth.status, auth.error);

  const { postId } = await params;
  const id = Number(postId);
  if (!Number.isFinite(id) || id <= 0) return bad(400, "invalid_post_id");

  const admin = getSupabaseAdmin();

  try {
    await deletePost(admin, id, auth.identity.userId, true);
    return NextResponse.json({ ok: true });
  } catch {
    return bad(500, "failed_to_delete_social_post");
  }
}
