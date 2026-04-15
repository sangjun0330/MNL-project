import { NextResponse } from "next/server";
import { requireBillingAdmin } from "@/lib/server/billingAdminAuth";
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function bad(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ storyId: string }> },
) {
  const auth = await requireBillingAdmin(req);
  if (!auth.ok) return bad(auth.status, auth.error);

  const { storyId } = await params;
  const id = Number(storyId);
  if (!Number.isFinite(id) || id <= 0) return bad(400, "invalid_story_id");

  const admin = getSupabaseAdmin();

  try {
    const { error } = await (admin as any)
      .from("rnest_social_stories")
      .delete()
      .eq("id", id);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch {
    return bad(500, "failed_to_delete_social_story");
  }
}
