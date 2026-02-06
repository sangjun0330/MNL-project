import { NextResponse } from "next/server";
import { addDays, fromISODate, toISODate, todayISO, type ISODate } from "@/lib/date";
import { generateAIRecovery } from "@/lib/aiRecovery";
import type { AIRecoveryApiError, AIRecoveryApiSuccess } from "@/lib/aiRecoveryContract";
import type { Language } from "@/lib/i18n";
import { hasHealthInput } from "@/lib/healthRecords";
import { defaultSettings, emptyState, type AppState } from "@/lib/model";
import { generateAIRecoveryWithOpenAI } from "@/lib/server/openaiRecovery";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { loadUserState } from "@/lib/server/userStateStore";
import type { Shift } from "@/lib/types";
import { computeVitalsRange } from "@/lib/vitals";

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

export async function GET(req: Request) {
  const userId = await readUserIdFromRequest(req);
  if (!userId) return bad(401, "login required");

  const langHint = toLanguage(new URL(req.url).searchParams.get("lang"));

  try {
    const row = await loadUserState(userId);
    if (!row?.payload) return bad(404, "state not found");

    const state = normalizePayloadToState(row.payload, langHint);
    const lang = (state.settings.language ?? "ko") as Language;

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
        result: aiOutput.result,
      },
    };
    return NextResponse.json(body);
  } catch (error: any) {
    return bad(500, error?.message || "failed to build recovery data");
  }
}
