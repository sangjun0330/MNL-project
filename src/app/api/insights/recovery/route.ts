import { NextRequest, NextResponse } from "next/server";
import { addDays, fromISODate, toISODate, todayISO, type ISODate } from "@/lib/date";
import { generateAIRecovery } from "@/lib/aiRecovery";
import type { AIRecoveryApiError, AIRecoveryApiSuccess } from "@/lib/aiRecoveryContract";
import type { Language } from "@/lib/i18n";
import { hasHealthInput } from "@/lib/healthRecords";
import { defaultSettings, emptyState, type AppState } from "@/lib/model";
import { generateAIRecoveryWithOpenAI } from "@/lib/server/openaiRecovery";
import type { Shift } from "@/lib/types";
import { computeVitalsRange } from "@/lib/vitals";

// Cloudflare Pages (next-on-pages) requires Edge runtime for non-static routes.
export const runtime = "edge";
export const dynamic = "force-dynamic";

function toLanguage(value: string | null): Language | null {
  if (value === "ko" || value === "en") return value;
  return null;
}

function normalizeSettings(raw: unknown, languageHint: Language | null): AppState["settings"] {
  const loaded = (raw ?? {}) as Record<string, unknown>;
  const defaults = defaultSettings();
  const loadedMenstrual = (loaded.menstrual ?? {}) as Record<string, unknown>;
  const loadedProfile = (loaded.profile ?? {}) as Record<string, unknown>;
  const lastPeriodStart = (loadedMenstrual.lastPeriodStart ?? loadedMenstrual.startISO ?? null) as ISODate | null;

  const normalizedLanguage =
    languageHint ?? (loaded.language === "en" ? "en" : loaded.language === "ko" ? "ko" : defaults.language ?? "ko");

  return {
    ...defaults,
    ...loaded,
    menstrual: {
      ...defaults.menstrual,
      ...loadedMenstrual,
      lastPeriodStart,
    },
    profile: {
      chronotype: Math.max(
        0,
        Math.min(
          1,
          Number((loadedProfile.chronotype as number | undefined) ?? defaults.profile?.chronotype ?? 0.5)
        )
      ),
      caffeineSensitivity: Math.max(
        0.5,
        Math.min(
          1.5,
          Number(
            (loadedProfile.caffeineSensitivity as number | undefined) ?? defaults.profile?.caffeineSensitivity ?? 1.0
          )
        )
      ),
    },
    theme: loaded.theme === "dark" ? "dark" : "light",
    language: normalizedLanguage,
  };
}

function normalizePayloadToState(payload: unknown, languageHint: Language | null): AppState {
  const loaded = (payload ?? {}) as Record<string, unknown>;
  const base = emptyState();
  return {
    ...base,
    ...loaded,
    selected: (loaded.selected as AppState["selected"] | undefined) ?? base.selected,
    schedule: (loaded.schedule as AppState["schedule"] | undefined) ?? {},
    shiftNames: (loaded.shiftNames as AppState["shiftNames"] | undefined) ?? {},
    notes: (loaded.notes as AppState["notes"] | undefined) ?? {},
    emotions: (loaded.emotions as AppState["emotions"] | undefined) ?? {},
    bio: (loaded.bio as AppState["bio"] | undefined) ?? {},
    settings: normalizeSettings(loaded.settings, languageHint),
  };
}

function readShift(schedule: AppState["schedule"], iso: ISODate): Shift | null {
  const shift = schedule?.[iso] as Shift | undefined;
  return shift ?? null;
}

function bad(status: number, error: string) {
  const body: AIRecoveryApiError = { ok: false, error };
  return NextResponse.json(body, { status });
}

// ✅ 안전하게 userId 읽기 - Supabase 환경변수 없어도 crash 안 됨
async function safeReadUserId(req: NextRequest): Promise<string> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnon) return "";

    const { readUserIdFromRequest } = await import("@/lib/server/readUserId");
    return await readUserIdFromRequest(req);
  } catch {
    return "";
  }
}

// ✅ 안전하게 user state 로드 - Supabase service role key 없어도 crash 안 됨
async function safeLoadUserState(userId: string): Promise<{ payload: unknown } | null> {
  try {
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!serviceRole || !supabaseUrl) return null;

    const { loadUserState } = await import("@/lib/server/userStateStore");
    return await loadUserState(userId);
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const langHint = toLanguage(new URL(req.url).searchParams.get("lang"));

  // ── 1. 사용자 인증 시도 (실패해도 계속 진행) ──
  const userId = await safeReadUserId(req);
  if (!userId) {
    return bad(401, "login_required");
  }

  try {
    // ── 2. Supabase에서 사용자 데이터 로드 시도 ──
    const row = await safeLoadUserState(userId);
    if (!row?.payload) {
      return bad(404, "state_not_found");
    }

    const state = normalizePayloadToState(row.payload, langHint);
    const lang = (state.settings.language ?? "ko") as Language;

    // ── 3. 14일치 vitals 계산 ──
    const end = todayISO();
    const start = toISODate(addDays(fromISODate(end), -13));
    const vitals14 = computeVitalsRange({ state, start, end });
    const inputDateSet = new Set<ISODate>();
    for (let i = 0; i < 14; i++) {
      const iso = toISODate(addDays(fromISODate(start), i));
      const bio = state.bio?.[iso] ?? null;
      const emotion = state.emotions?.[iso] ?? null;
      if (hasHealthInput(bio, emotion)) inputDateSet.add(iso);
    }

    const start7 = toISODate(addDays(fromISODate(end), -6));
    const vitals7 = vitals14.filter((v) => v.dateISO >= start7 && inputDateSet.has(v.dateISO));
    const prevWeek = vitals14.filter((v) => v.dateISO < start7 && inputDateSet.has(v.dateISO));
    const todayVital = inputDateSet.has(end) ? vitals14.find((v) => v.dateISO === end) ?? null : null;
    const tomorrowISO = toISODate(addDays(fromISODate(end), 1));
    const nextShift = readShift(state.schedule, tomorrowISO);
    const todayShift = (todayVital?.shift ?? readShift(state.schedule, end) ?? "OFF") as Shift;

    // ── 4. 기록 없으면 안내 메시지 ──
    if (!vitals7.length) {
      const body: AIRecoveryApiSuccess = {
        ok: true,
        data: {
          dateISO: end,
          language: lang,
          todayShift,
          nextShift,
          todayVitalScore: null,
          source: "supabase",
          engine: "rule",
          model: null,
          debug: "no_recorded_inputs_in_last_7_days",
          result: {
            headline:
              lang === "en"
                ? "Log your health records to unlock personalized recovery guidance."
                : "건강 기록을 입력하면 맞춤 회복 처방을 자세히 제공해드려요.",
            compoundAlert: null,
            sections: [],
            weeklySummary: null,
          },
        },
      };
      return NextResponse.json(body);
    }

    // ── 5. Rule-based fallback 생성 + OpenAI 시도 ──
    const fallbackResult = generateAIRecovery(todayVital, vitals7, prevWeek, nextShift, lang);
    const aiOutput = await generateAIRecoveryWithOpenAI({
      language: lang,
      todayISO: end,
      todayShift,
      nextShift,
      todayVital,
      vitals7,
      prevWeekVitals: prevWeek,
      fallback: fallbackResult,
    });
    const todayVitalScore = todayVital
      ? Math.round(Math.min(todayVital.body.value, todayVital.mental.ema))
      : null;

    const body: AIRecoveryApiSuccess = {
      ok: true,
      data: {
        dateISO: end,
        language: lang,
        todayShift,
        nextShift,
        todayVitalScore,
        source: "supabase",
        engine: aiOutput.engine,
        model: aiOutput.model,
        debug: aiOutput.debug,
        result: aiOutput.result,
      },
    };
    return NextResponse.json(body);
  } catch (error: any) {
    return bad(500, error?.message || "failed to build recovery data");
  }
}
