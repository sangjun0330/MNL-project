import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";

export async function ensureUserRow(userId: string): Promise<void> {
  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from("rnest_users")
    .upsert(
      {
        user_id: userId,
        last_seen: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (error) {
    throw error;
  }
}
