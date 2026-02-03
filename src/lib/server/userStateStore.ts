import { createClient } from "@supabase/supabase-js";

type UserStateRow = {
  userId: string;
  payload: any;
  updatedAt: number;
};

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL missing");
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY missing");
  const g = globalThis as any;
  if (!g.__wnlSupabaseAdmin) {
    g.__wnlSupabaseAdmin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return g.__wnlSupabaseAdmin as ReturnType<typeof createClient>;
}

async function upsertUser(userId: string) {
  const admin = getAdminClient();
  const now = new Date().toISOString();
  const { error } = await admin
    .from("wnl_users")
    .upsert({ user_id: userId, last_seen: now }, { onConflict: "user_id" });
  if (error) throw new Error(error.message);
}

async function saveToSupabase(row: UserStateRow): Promise<void> {
  const admin = getAdminClient();
  await upsertUser(row.userId);
  const { error } = await admin
    .from("wnl_user_state")
    .upsert({ user_id: row.userId, payload: row.payload }, { onConflict: "user_id" });
  if (error) throw new Error(error.message);
}

async function loadFromSupabase(userId: string): Promise<UserStateRow | null> {
  const admin = getAdminClient();
  await upsertUser(userId);
  const { data, error } = await admin
    .from("wnl_user_state")
    .select("user_id,payload,updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    userId: data.user_id,
    payload: data.payload,
    updatedAt: data.updated_at ? new Date(data.updated_at).getTime() : Date.now(),
  };
}

export async function saveUserState(input: { userId: string; payload: any }): Promise<void> {
  const row: UserStateRow = {
    userId: input.userId,
    payload: input.payload,
    updatedAt: Date.now(),
  };

  await saveToSupabase(row);
}

export async function loadUserState(userId: string): Promise<UserStateRow | null> {
  return loadFromSupabase(userId);
}
