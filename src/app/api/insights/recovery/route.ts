import { NextRequest, NextResponse } from "next/server";
import { addDays, fromISODate, toISODate, todayISO, type ISODate } from "@/lib/date";
import type { AIRecoveryApiError, AIRecoveryApiSuccess, AIRecoveryPayload } from "@/lib/aiRecoveryContract";
import type { Language } from "@/lib/i18n";
import { hasHealthInput } from "@/lib/healthRecords";
import type { AppState } from "@/lib/model";
import { sanitizeStatePayload } from "@/lib/stateSanitizer";
import { generateAIRecoveryWithOpenAI } from "@/lib/server/openaiRecovery";
import type { Shift } from "@/lib/types";
import { computeVitalsRange } from "@/lib/vitals";

// Cloudflare Pages requires Edge runtime for non-static routes.
export const runtime = "edge";
export const dynamic = "force-dynamic";

function toLanguage(value: string | null): Language | null {
  if (value === "ko" || value === "en") return value;
  return null;
}

function normalizePayloadToState(payload: unknown, languageHint: Language | null): AppState {
  const sanitized = sanitizeStatePayload(payload);
  if (!languageHint) return sanitized;
  return {
    ...sanitized,
    settings: {
      ...sanitized.settings,
      language: languageHint,
    },
  };
}

function readShift(schedule: AppState["schedule"], iso: ISODate): Shift | null {
  const shift = schedule?.[iso] as Shift | undefined;
  return shift ?? null;
}

function hasReliableEstimatedSignal(v: { engine?: { inputReliability?: number; daysSinceAnyInput?: number | null } } | null) {
  if (!v) return false;
  const reliability = v.engine?.inputReliability ?? 0;
  const gap = v.engine?.daysSinceAnyInput ?? 99;
  return reliability >= 0.45 && gap <= 2;
}

function bad(status: number, error: string) {
  const safeError = String(error ?? "unknown_error")
    .replace(/\s+/g, " ")
    .replace(/[^\x20-\x7E가-힣ㄱ-ㅎㅏ-ㅣ.,:;!?()[\]{}'"`~@#$%^&*_\-+=/\\|<>]/g, "")
    .slice(0, 220);
  const body: AIRecoveryApiError = { ok: false, error: safeError || "unknown_error" };
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

async function safeSaveUserState(userId: string, payload: unknown): Promise<string | null> {
  try {
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!serviceRole || !supabaseUrl) return "missing_supabase_env";

    const { saveUserState } = await import("@/lib/server/userStateStore");
    await saveUserState({ userId, payload });
    return null;
  } catch {
    return "save_user_state_failed";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readServerCachedAI(rawPayload: unknown, today: ISODate, lang: Language): AIRecoveryPayload | null {
  if (!isRecord(rawPayload)) return null;
  const node = rawPayload.aiRecoveryDaily;
  if (!isRecord(node)) return null;
  const dateISO = typeof node.dateISO === "string" ? node.dateISO : "";
  const language = node.language === "ko" || node.language === "en" ? node.language : null;
  const data = (node as Record<string, unknown>).data;
  if (!data || !isRecord(data)) return null;
  if (dateISO !== today || language !== lang) return null;
  const payload = data as AIRecoveryPayload;
  if (payload.engine !== "openai") return null;
  if (!payload.generatedText || typeof payload.generatedText !== "string") return null;
  return payload;
}

function withServerCachedAI(rawPayload: unknown, cacheEntry: { dateISO: ISODate; language: Language; data: AIRecoveryPayload }) {
  const next = isRecord(rawPayload) ? { ...rawPayload } : {};
  next.aiRecoveryDaily = {
    dateISO: cacheEntry.dateISO,
    language: cacheEntry.language,
    generatedAt: Date.now(),
    data: cacheEntry.data,
  };
  return next;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const langHint = toLanguage(url.searchParams.get("lang"));
  const cacheOnly = url.searchParams.get("cacheOnly") === "1";

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

    // ── 3. 추천/분석 기준일: 오늘 (인사이트 통계와 동일 기준) ──
    const today = todayISO();
    const cached = readServerCachedAI(row.payload, today, lang);
    if (cached) {
      return NextResponse.json({ ok: true, data: cached } satisfies AIRecoveryApiSuccess);
    }
    if (cacheOnly) {
      return NextResponse.json({ ok: true, data: null } satisfies AIRecoveryApiSuccess);
    }

    const start = toISODate(addDays(fromISODate(today), -13));
    const vitals14 = computeVitalsRange({ state, start, end: today });
    const inputDateSet = new Set<ISODate>();
    for (let i = 0; i < 14; i++) {
      const iso = toISODate(addDays(fromISODate(start), i));
      const bio = state.bio?.[iso] ?? null;
      const emotion = state.emotions?.[iso] ?? null;
      if (hasHealthInput(bio, emotion)) inputDateSet.add(iso);
    }

    const start7 = toISODate(addDays(fromISODate(today), -6));
    const vitals7 = vitals14.filter(
      (v) => v.dateISO >= start7 && (inputDateSet.has(v.dateISO) || hasReliableEstimatedSignal(v))
    );
    const prevWeek = vitals14.filter(
      (v) => v.dateISO < start7 && (inputDateSet.has(v.dateISO) || hasReliableEstimatedSignal(v))
    );
    const todayVitalCandidate = vitals14.find((v) => v.dateISO === today) ?? null;
    const todayHasInput = inputDateSet.has(today) || hasReliableEstimatedSignal(todayVitalCandidate);
    const todayShift = (readShift(state.schedule, today) ?? todayVitalCandidate?.shift ?? "OFF") as Shift;
    const tomorrowISO = toISODate(addDays(fromISODate(today), 1));
    const nextShift = readShift(state.schedule, tomorrowISO);
    const todayVital = todayHasInput && todayVitalCandidate
      ? {
          ...todayVitalCandidate,
          shift: todayShift,
        }
      : null;

    // ── 4. OpenAI만 사용(규칙 fallback 없음) ──
    const aiOutput = await generateAIRecoveryWithOpenAI({
      language: lang,
      todayISO: today,
      todayShift,
      nextShift,
      todayVital,
      vitals7,
      prevWeekVitals: prevWeek,
    });
    const todayVitalScore = todayVital
      ? Math.round(Math.min(todayVital.body.value, todayVital.mental.ema))
      : null;

    const payload: AIRecoveryPayload = {
      dateISO: today,
      language: lang,
      todayShift,
      nextShift,
      todayVitalScore,
      source: "supabase",
      engine: aiOutput.engine,
      model: aiOutput.model,
      debug: aiOutput.debug,
      generatedText: aiOutput.generatedText,
      result: aiOutput.result,
    };

    const mergedPayload = withServerCachedAI(row.payload, {
      dateISO: today,
      language: lang,
      data: payload,
    });
    const saveError = await safeSaveUserState(userId, mergedPayload);
    if (saveError) {
      payload.debug = payload.debug ? `${payload.debug}|${saveError}` : saveError;
    }

    const body: AIRecoveryApiSuccess = { ok: true, data: payload };

    return NextResponse.json(body);
  } catch (error: any) {
    // 502 is sometimes replaced by Cloudflare HTML error pages.
    // Use 500 so client can read JSON error details.
    return bad(500, error?.message || "openai_generation_failed");
  }
}
