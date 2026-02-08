import { NextRequest, NextResponse } from "next/server";
import { addDays, fromISODate, toISODate, todayISO, type ISODate } from "@/lib/date";
import type { AIRecoveryApiError, AIRecoveryApiSuccess, AIRecoveryPayload } from "@/lib/aiRecoveryContract";
import type { Language } from "@/lib/i18n";
import { countHealthRecordedDays, hasHealthInput } from "@/lib/healthRecords";
import type { AppState } from "@/lib/model";
import { sanitizeStatePayload } from "@/lib/stateSanitizer";
import { generateAIRecoveryWithOpenAI, translateAIRecoveryToEnglish } from "@/lib/server/openaiRecovery";
import type { Shift } from "@/lib/types";
import { computeVitalsRange } from "@/lib/vitals";
import type { Json } from "@/types/supabase";

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

async function safeLoadAIContent(userId: string): Promise<{
  dateISO: ISODate;
  language: Language;
  data: Json;
} | null> {
  try {
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!serviceRole || !supabaseUrl) return null;

    const { loadAIContent } = await import("@/lib/server/aiContentStore");
    const row = await loadAIContent(userId);
    if (!row) return null;
    return {
      dateISO: row.dateISO,
      language: row.language,
      data: row.data,
    };
  } catch {
    return null;
  }
}

async function safeSaveAIContent(
  userId: string,
  dateISO: ISODate,
  language: Language,
  data: Json
): Promise<string | null> {
  try {
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!serviceRole || !supabaseUrl) return "missing_supabase_env";

    const { saveAIContent } = await import("@/lib/server/aiContentStore");
    await saveAIContent({ userId, dateISO, language, data });
    return null;
  } catch {
    return "save_ai_content_failed";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asLanguage(value: unknown): Language | null {
  return value === "ko" || value === "en" ? value : null;
}

function asPayload(candidate: unknown, fallbackLang: Language): AIRecoveryPayload | null {
  if (!isRecord(candidate) || !isRecord(candidate.result)) return null;
  if (typeof candidate.dateISO !== "string") return null;
  const language = asLanguage(candidate.language) ?? fallbackLang;
  return {
    dateISO: candidate.dateISO as ISODate,
    language,
    todayShift: (typeof candidate.todayShift === "string" ? candidate.todayShift : "OFF") as Shift,
    nextShift: (typeof candidate.nextShift === "string" ? candidate.nextShift : null) as Shift | null,
    todayVitalScore: typeof candidate.todayVitalScore === "number" ? candidate.todayVitalScore : null,
    source: candidate.source === "local" ? "local" : "supabase",
    engine: candidate.engine === "rule" ? "rule" : "openai",
    model: typeof candidate.model === "string" ? candidate.model : null,
    debug: typeof candidate.debug === "string" ? candidate.debug : null,
    generatedText: typeof candidate.generatedText === "string" ? candidate.generatedText : undefined,
    result: candidate.result as AIRecoveryPayload["result"],
  };
}

function readAIContentVariants(raw: unknown, today: ISODate): Partial<Record<Language, AIRecoveryPayload>> {
  if (!isRecord(raw)) return {};
  const variants: Partial<Record<Language, AIRecoveryPayload>> = {};

  const nodeVariants = isRecord(raw.variants) ? raw.variants : null;
  if (nodeVariants) {
    const ko = asPayload(nodeVariants.ko, "ko");
    const en = asPayload(nodeVariants.en, "en");
    if (ko && ko.dateISO === today) variants.ko = ko;
    if (en && en.dateISO === today) variants.en = en;
  }

  const single = asPayload(raw, "ko");
  if (single && single.dateISO === today) {
    variants[single.language] = variants[single.language] ?? single;
  }

  return variants;
}

function hasSameStructure(ko: AIRecoveryPayload, en: AIRecoveryPayload) {
  const koSections = ko.result.sections ?? [];
  const enSections = en.result.sections ?? [];
  if (koSections.length !== enSections.length) return false;
  for (let i = 0; i < koSections.length; i++) {
    if (koSections[i].category !== enSections[i].category) return false;
    if ((koSections[i].tips ?? []).length !== (enSections[i].tips ?? []).length) return false;
  }

  const koAlert = ko.result.compoundAlert;
  const enAlert = en.result.compoundAlert;
  if (Boolean(koAlert) !== Boolean(enAlert)) return false;
  if (koAlert && enAlert && (koAlert.factors ?? []).length !== (enAlert.factors ?? []).length) return false;

  const koWeekly = ko.result.weeklySummary;
  const enWeekly = en.result.weeklySummary;
  if (Boolean(koWeekly) !== Boolean(enWeekly)) return false;
  if (koWeekly && enWeekly && (koWeekly.topDrains ?? []).length !== (enWeekly.topDrains ?? []).length) return false;
  return true;
}

function readServerCachedAI(rawPayload: unknown, today: ISODate, lang: Language): AIRecoveryPayload | null {
  if (!isRecord(rawPayload)) return null;
  const node = rawPayload.aiRecoveryDaily;
  if (!isRecord(node)) return null;

  const candidates: unknown[] = [];
  candidates.push(node);

  if (isRecord(node.data)) candidates.push(node.data);
  if (isRecord(node.payload)) candidates.push(node.payload);

  const legacyByLang = node[lang];
  if (isRecord(legacyByLang)) {
    candidates.push(legacyByLang);
    if (isRecord(legacyByLang.data)) candidates.push(legacyByLang.data);
    if (isRecord(legacyByLang.payload)) candidates.push(legacyByLang.payload);
  }

  for (const candidate of candidates) {
    const payload = asPayload(candidate, lang);
    if (!payload) continue;
    if (payload.dateISO !== today) continue;
    if (payload.engine !== "openai") continue;
    return payload;
  }
  return null;
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
    const today = todayISO();
    const recordedDays = countHealthRecordedDays({ bio: state.bio, emotions: state.emotions });
    if (recordedDays < 3) {
      return bad(403, "insights_locked_min_3_days");
    }

    // ── 3. Supabase ai_content 캐시 우선 조회 ──
    const aiContent = await safeLoadAIContent(userId);
    if (aiContent && aiContent.dateISO === today) {
      const variants = readAIContentVariants(aiContent.data, today);
      const koVariant = variants.ko ?? null;
      const direct = variants[lang] ?? null;
      if (direct && direct.engine === "openai" && (lang !== "en" || !koVariant || hasSameStructure(koVariant, direct))) {
        return NextResponse.json({ ok: true, data: direct } satisfies AIRecoveryApiSuccess);
      }
      if (lang === "en" && koVariant && koVariant.engine === "openai") {
        try {
          const translated = await translateAIRecoveryToEnglish({
            result: koVariant.result,
            generatedText: koVariant.generatedText ?? "",
            engine: "openai",
            model: koVariant.model,
            debug: koVariant.debug ?? null,
          });
          const translatedPayload: AIRecoveryPayload = {
            ...koVariant,
            language: "en",
            model: translated.model ?? koVariant.model,
            debug: translated.debug,
            generatedText: translated.generatedText,
            result: translated.result,
          };
          const saveError = await safeSaveAIContent(userId, today, "ko", {
            dateISO: today,
            generatedAt: Date.now(),
            variants: {
              ko: koVariant,
              en: translatedPayload,
            },
          });
          if (saveError) {
            translatedPayload.debug = translatedPayload.debug
              ? `${translatedPayload.debug}|${saveError}`
              : saveError;
          }
          return NextResponse.json({ ok: true, data: translatedPayload } satisfies AIRecoveryApiSuccess);
        } catch {
          return NextResponse.json({ ok: true, data: koVariant } satisfies AIRecoveryApiSuccess);
        }
      }
    }

    // legacy fallback: wnl_user_state.payload.aiRecoveryDaily
    const legacyCached = readServerCachedAI(row.payload, today, lang);
    if (legacyCached) {
      void safeSaveAIContent(userId, today, legacyCached.language, {
        dateISO: today,
        generatedAt: Date.now(),
        variants: {
          ko: legacyCached,
        },
      });
      return NextResponse.json({ ok: true, data: legacyCached } satisfies AIRecoveryApiSuccess);
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

    // ── 4. OpenAI 한국어 단일 생성(영어는 번역 캐시) ──
    const aiKo = await generateAIRecoveryWithOpenAI({
      language: "ko",
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

    const payloadKo: AIRecoveryPayload = {
      dateISO: today,
      language: "ko",
      todayShift,
      nextShift,
      todayVitalScore,
      source: "supabase",
      engine: aiKo.engine,
      model: aiKo.model,
      debug: aiKo.debug,
      generatedText: aiKo.generatedText,
      result: aiKo.result,
    };

    let payloadEn: AIRecoveryPayload | null = null;
    if (lang === "en") {
      try {
        const translated = await translateAIRecoveryToEnglish(aiKo);
        payloadEn = {
          ...payloadKo,
          language: "en",
          model: translated.model ?? payloadKo.model,
          debug: translated.debug,
          generatedText: translated.generatedText,
          result: translated.result,
        };
      } catch {
        payloadEn = null;
      }
    }

    const saveError = await safeSaveAIContent(userId, today, "ko", {
      dateISO: today,
      generatedAt: Date.now(),
      variants: {
        ko: payloadKo,
        ...(payloadEn ? { en: payloadEn } : {}),
      },
    });
    if (saveError) {
      payloadKo.debug = payloadKo.debug ? `${payloadKo.debug}|${saveError}` : saveError;
      if (payloadEn) {
        payloadEn.debug = payloadEn.debug ? `${payloadEn.debug}|${saveError}` : saveError;
      }
    }

    const body: AIRecoveryApiSuccess = { ok: true, data: lang === "en" ? payloadEn ?? payloadKo : payloadKo };

    return NextResponse.json(body);
  } catch (error: any) {
    // 502 is sometimes replaced by Cloudflare HTML error pages.
    // Use 500 so client can read JSON error details.
    return bad(500, error?.message || "openai_generation_failed");
  }
}
