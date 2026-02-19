import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";

type UserStateRow = {
  userId: string;
  payload: any;
  updatedAt: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function countRecordKeys(value: unknown): number {
  return isRecord(value) ? Object.keys(value).length : 0;
}

function hasMeaningfulUserData(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    countRecordKeys(value.schedule) > 0 ||
    countRecordKeys(value.notes) > 0 ||
    countRecordKeys(value.emotions) > 0 ||
    countRecordKeys(value.bio) > 0 ||
    countRecordKeys(value.shiftNames) > 0
  );
}

function mergeProtectedMaps(nextPayload: Record<string, unknown>, existingPayload: Record<string, unknown>) {
  const protectedKeys = ["schedule", "notes", "emotions", "bio", "shiftNames"] as const;
  const merged: Record<string, unknown> = { ...nextPayload };
  for (const key of protectedKeys) {
    const nextCount = countRecordKeys(nextPayload[key]);
    const existingCount = countRecordKeys(existingPayload[key]);
    // Prevent accidental wipe: keep existing non-empty maps when incoming map is empty.
    if (nextCount === 0 && existingCount > 0) {
      merged[key] = existingPayload[key];
    }
  }
  return merged;
}

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

export async function saveUserState(input: { userId: string; payload: any }): Promise<void> {
  const admin = getSupabaseAdmin();
  const now = new Date().toISOString();
  let nextPayload = input.payload;
  let existingPayload: Record<string, unknown> | null = null;

  // Ensure parent row exists before writing child state row (FK-safe for first login).
  await ensureUserRow(input.userId);

  const { data: existing } = await admin
    .from("rnest_user_state")
    .select("payload")
    .eq("user_id", input.userId)
    .maybeSingle();
  if (isRecord(existing?.payload)) {
    existingPayload = existing.payload;
  }

  // Safety guard: never overwrite existing non-empty user maps with an empty payload by accident.
  if (
    isRecord(nextPayload) &&
    existingPayload &&
    hasMeaningfulUserData(existingPayload) &&
    !hasMeaningfulUserData(nextPayload)
  ) {
    nextPayload = mergeProtectedMaps(nextPayload, existingPayload);
  }

  // Preserve server-managed daily AI cache unless caller explicitly set/updated it.
  if (isRecord(nextPayload) && !Object.prototype.hasOwnProperty.call(nextPayload, "aiRecoveryDaily")) {
    if (existingPayload && Object.prototype.hasOwnProperty.call(existingPayload, "aiRecoveryDaily")) {
      nextPayload = {
        ...nextPayload,
        aiRecoveryDaily: existingPayload.aiRecoveryDaily,
      };
    }
  }

  const { error } = await admin
    .from("rnest_user_state")
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
}

export async function loadUserState(userId: string): Promise<UserStateRow | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("rnest_user_state")
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
