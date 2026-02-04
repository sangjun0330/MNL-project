import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";

type UserStateRow = {
  userId: string;
  payload: any;
  updatedAt: number;
};

export async function ensureUserRow(userId: string): Promise<void> {
  const admin = getSupabaseAdmin();
  const { error } = await admin
    .from("wnl_users")
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

export async function saveUserState(input: { userId: string; payload: any }): Promise<void> {
  const admin = getSupabaseAdmin();
  const now = new Date().toISOString();
  const { error } = await admin
    .from("wnl_user_state")
    .upsert(
      {
        user_id: input.userId,
        payload: input.payload,
        updated_at: now,
      },
      { onConflict: "user_id" }
    );

  if (error) {
    throw error;
  }

  await ensureUserRow(input.userId);
}

export async function loadUserState(userId: string): Promise<UserStateRow | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("wnl_user_state")
    .select("user_id, payload, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) return null;

  return {
    userId: data.user_id,
    payload: data.payload,
    updatedAt: data.updated_at ? new Date(data.updated_at).getTime() : Date.now(),
  };
}
