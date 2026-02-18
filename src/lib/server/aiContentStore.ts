import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin";
import type { ISODate } from "@/lib/date";
import type { Language } from "@/lib/i18n";
import type { Json } from "@/types/supabase";

type AIContentRow = {
  userId: string;
  dateISO: ISODate;
  language: Language;
  data: Json;
  updatedAt: number;
};

export async function loadAIContent(userId: string): Promise<AIContentRow | null> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("ai_content")
    .select("user_id, date_iso, language, data, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) return null;

  return {
    userId: data.user_id,
    dateISO: data.date_iso as ISODate,
    language: (data.language === "en" ? "en" : "ko") as Language,
    data: data.data as Json,
    updatedAt: data.updated_at ? new Date(data.updated_at).getTime() : Date.now(),
  };
}

export async function saveAIContent(input: {
  userId: string;
  dateISO: ISODate;
  language: Language;
  data: Json;
}): Promise<void> {
  const admin = getSupabaseAdmin();
  const now = new Date().toISOString();

  const { error } = await admin
    .from("ai_content")
    .upsert(
      {
        user_id: input.userId,
        date_iso: input.dateISO,
        language: input.language,
        data: input.data,
        updated_at: now,
      },
      { onConflict: "user_id" }
    );

  if (error) {
    throw error;
  }
}
