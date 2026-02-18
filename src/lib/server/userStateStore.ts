import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";

type UserStateRow = {
  userId: string;
  payload: any;
  updatedAt: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

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
  let nextPayload = input.payload;

  // Preserve server-managed daily AI cache unless caller explicitly set/updated it.
  if (isRecord(nextPayload) && !Object.prototype.hasOwnProperty.call(nextPayload, "aiRecoveryDaily")) {
    const { data: existing } = await admin
      .from("wnl_user_state")
      .select("payload")
      .eq("user_id", input.userId)
      .maybeSingle();

    if (isRecord(existing?.payload) && Object.prototype.hasOwnProperty.call(existing.payload, "aiRecoveryDaily")) {
      nextPayload = {
        ...nextPayload,
        aiRecoveryDaily: existing.payload.aiRecoveryDaily,
      };
    }
  }

  const { error } = await admin
    .from("wnl_user_state")
    .upsert(
      {
        user_id: input.userId,
        payload: nextPayload,
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
