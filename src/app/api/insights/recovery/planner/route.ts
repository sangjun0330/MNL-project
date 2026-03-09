import { NextRequest } from "next/server";
import { addDays, fromISODate, toISODate, todayISO, type ISODate } from "@/lib/date";
import type { AIRecoveryPayload } from "@/lib/aiRecoveryContract";
import {
  buildExplanationModule,
  buildFallbackModules,
  type AIRecoveryPlannerApiError,
  type AIRecoveryPlannerApiSuccess,
  type AIRecoveryPlannerPayload,
} from "@/lib/aiRecoveryPlanner";
import { generateAIRecovery } from "@/lib/aiRecovery";
import type { Language } from "@/lib/i18n";
import { countHealthRecordedDays, hasHealthInput } from "@/lib/healthRecords";
import type { AppState } from "@/lib/model";
import { sanitizeStatePayload } from "@/lib/stateSanitizer";
import {
  generateAIRecoveryPlannerModulesWithOpenAI,
  generateAIRecoveryWithOpenAI,
} from "@/lib/server/openaiRecovery";
import {
  buildPlannerContext,
  buildPlannerTimelinePreview,
  formatRelativeDutyKorean,
  normalizeProfileSettings,
  type PlannerContext,
} from "@/lib/recoveryPlanner";
import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import type { Shift } from "@/lib/types";
import { computeVitalsRange } from "@/lib/vitals";
import type { Json } from "@/types/supabase";
import type { SubscriptionSnapshot } from "@/lib/server/billingStore";

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

function collectRecordedDates(state: AppState): ISODate[] {
  const dates = new Set<ISODate>();
  const keys = new Set<string>([...Object.keys(state.bio ?? {}), ...Object.keys(state.emotions ?? {})]);
  for (const raw of keys) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) continue;
    const iso = raw as ISODate;
    if (hasHealthInput(state.bio?.[iso] ?? null, state.emotions?.[iso] ?? null)) {
      dates.add(iso);
    }
  }
  return Array.from(dates).sort();
}

function bad(status: number, error: string) {
  const safeError = String(error ?? "unknown_error")
    .replace(/\s+/g, " ")
    .replace(/[^\x20-\x7E가-힣ㄱ-ㅎㅏ-ㅣ.,:;!?()[\]{}'"`~@#$%^&*_\-+=/\\|<>]/g, "")
    .slice(0, 220);
  const body: AIRecoveryPlannerApiError = { ok: false, error: safeError || "unknown_error" };
  return jsonNoStore(body, { status });
}

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

async function safeLoadAIContent(
  userId: string
): Promise<{ dateISO: ISODate; language: Language; data: Json } | null> {
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

async function safeLoadSubscription(userId: string): Promise<SubscriptionSnapshot | null> {
  try {
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!serviceRole || !supabaseUrl) return null;
    const { readSubscription } = await import("@/lib/server/billingStore");
    return await readSubscription(userId);
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
    const existing = await safeLoadAIContent(userId);
    const previous = isRecord(existing?.data) ? existing.data : {};
    const incoming = isRecord(data) ? data : {};
    const merged = { ...previous, ...incoming };

    await saveAIContent({ userId, dateISO, language, data: merged as Json });
    return null;
  } catch {
    return "save_ai_content_failed";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asLanguage(value: unknown): Language | null {
  return value === "ko" || value === "en" ? value : null;
}

function asPlannerContext(value: unknown): PlannerContext | null {
  if (!isRecord(value)) return null;
  const focus = isRecord(value.focusFactor)
    ? {
        key: typeof value.focusFactor.key === "string" ? value.focusFactor.key : "",
        label: typeof value.focusFactor.label === "string" ? value.focusFactor.label : "",
        pct: typeof value.focusFactor.pct === "number" ? value.focusFactor.pct : 0,
      }
    : null;

  return {
    focusFactor: focus && focus.key && focus.label ? (focus as PlannerContext["focusFactor"]) : null,
    primaryAction: typeof value.primaryAction === "string" ? value.primaryAction : null,
    avoidAction: typeof value.avoidAction === "string" ? value.avoidAction : null,
    nextDuty: typeof value.nextDuty === "string" ? (value.nextDuty as Shift) : null,
    nextDutyDate: typeof value.nextDutyDate === "string" ? (value.nextDutyDate as ISODate) : null,
    plannerTone:
      value.plannerTone === "warning" || value.plannerTone === "noti" || value.plannerTone === "stable"
        ? value.plannerTone
        : "stable",
    ordersTop3: Array.isArray(value.ordersTop3)
      ? value.ordersTop3
          .map((item, index) => {
            if (!isRecord(item)) return null;
            return {
              rank: typeof item.rank === "number" ? item.rank : index + 1,
              title: typeof item.title === "string" ? item.title : "",
              text: typeof item.text === "string" ? item.text : "",
            };
          })
          .filter((item): item is PlannerContext["ordersTop3"][number] => Boolean(item && item.title && item.text))
      : [],
  };
}

function asProfileSnapshot(value: unknown): AIRecoveryPlannerPayload["profileSnapshot"] | null {
  if (!isRecord(value)) return null;
  return {
    chronotype: Number.isFinite(Number(value.chronotype)) ? Number(value.chronotype) : 0.5,
    caffeineSensitivity: Number.isFinite(Number(value.caffeineSensitivity)) ? Number(value.caffeineSensitivity) : 1,
  };
}

function normalizeProfileSnapshot(value: AIRecoveryPlannerPayload["profileSnapshot"]) {
  const profile = normalizeProfileSettings(value ?? null);
  return {
    chronotype: Number(profile.chronotype.toFixed(2)),
    caffeineSensitivity: Number(profile.caffeineSensitivity.toFixed(2)),
  };
}

function asRecoveryPayload(candidate: unknown, fallbackLang: Language): AIRecoveryPayload | null {
  if (!isRecord(candidate) || !isRecord(candidate.result)) return null;
  if (typeof candidate.dateISO !== "string") return null;
  const language = asLanguage(candidate.language) ?? fallbackLang;
  const plannerContext = asPlannerContext(candidate.plannerContext);
  const profileSnapshot = asProfileSnapshot(candidate.profileSnapshot);
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
    plannerContext: plannerContext ?? undefined,
    profileSnapshot: profileSnapshot ?? undefined,
    result: candidate.result as AIRecoveryPayload["result"],
  };
}

function hasChecklistOrdersShape(value: unknown) {
  if (!isRecord(value) || !isRecord(value.orders) || !Array.isArray(value.orders.items)) return false;
  if (value.orders.items.length < 1 || value.orders.items.length > 5) return false;
  return value.orders.items.every((item) => {
    if (!isRecord(item)) return false;
    return (
      typeof item.id === "string" &&
      item.id.length > 0 &&
      typeof item.title === "string" &&
      item.title.length > 0 &&
      typeof item.body === "string" &&
      item.body.length > 0 &&
      typeof item.when === "string" &&
      item.when.length > 0
    );
  });
}

function asPlannerPayload(candidate: unknown, fallbackLang: Language): AIRecoveryPlannerPayload | null {
  if (!isRecord(candidate) || !isRecord(candidate.result)) return null;
  if (typeof candidate.dateISO !== "string") return null;
  if (!hasChecklistOrdersShape(candidate.result)) return null;
  const language = asLanguage(candidate.language) ?? fallbackLang;
  const plannerContext = asPlannerContext(candidate.plannerContext);
  const profileSnapshot = asProfileSnapshot(candidate.profileSnapshot);
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
    explanationGeneratedText:
      typeof candidate.explanationGeneratedText === "string" ? candidate.explanationGeneratedText : undefined,
    plannerContext: plannerContext ?? undefined,
    profileSnapshot: profileSnapshot ?? undefined,
    result: candidate.result as AIRecoveryPlannerPayload["result"],
  };
}

function isPlannerContextCurrent(cached: PlannerContext | null | undefined, current: PlannerContext) {
  if (!cached) return false;
  if ((cached.focusFactor?.key ?? null) !== (current.focusFactor?.key ?? null)) return false;
  if ((cached.primaryAction ?? null) !== (current.primaryAction ?? null)) return false;
  if ((cached.avoidAction ?? null) !== (current.avoidAction ?? null)) return false;
  if ((cached.nextDuty ?? null) !== (current.nextDuty ?? null)) return false;
  if ((cached.nextDutyDate ?? null) !== (current.nextDutyDate ?? null)) return false;
  if (cached.plannerTone !== current.plannerTone) return false;

  const cachedOrders = cached.ordersTop3 ?? [];
  const currentOrders = current.ordersTop3 ?? [];
  if (cachedOrders.length !== currentOrders.length) return false;
  return cachedOrders.every((item, index) => {
    const target = currentOrders[index];
    return Boolean(target && item.rank === target.rank && item.title === target.title && item.text === target.text);
  });
}

function isProfileSnapshotCurrent(
  cached: AIRecoveryPlannerPayload["profileSnapshot"] | null | undefined,
  current: NonNullable<AIRecoveryPlannerPayload["profileSnapshot"]>
) {
  if (!cached) return false;
  return (
    Number(cached.chronotype.toFixed(2)) === current.chronotype &&
    Number(cached.caffeineSensitivity.toFixed(2)) === current.caffeineSensitivity
  );
}

function readPlannerVariants(raw: unknown, today: ISODate): Partial<Record<Language, AIRecoveryPlannerPayload>> {
  if (!isRecord(raw)) return {};
  const variantsNode = isRecord(raw.plannerVariants) ? raw.plannerVariants : null;
  if (!variantsNode) return {};

  const ko = asPlannerPayload(variantsNode.ko, "ko");
  const en = asPlannerPayload(variantsNode.en, "en");
  const variants: Partial<Record<Language, AIRecoveryPlannerPayload>> = {};
  if (ko && ko.dateISO === today) variants.ko = ko;
  if (en && en.dateISO === today) variants.en = en;
  return variants;
}

function readRecoveryVariants(raw: unknown, today: ISODate): Partial<Record<Language, AIRecoveryPayload>> {
  if (!isRecord(raw)) return {};
  const variantsNode = isRecord(raw.variants) ? raw.variants : null;
  if (!variantsNode) return {};

  const ko = asRecoveryPayload(variantsNode.ko, "ko");
  const en = asRecoveryPayload(variantsNode.en, "en");
  const variants: Partial<Record<Language, AIRecoveryPayload>> = {};
  if (ko && ko.dateISO === today) variants.ko = ko;
  if (en && en.dateISO === today) variants.en = en;
  return variants;
}

async function handlePlanner(req: NextRequest, options?: { allowGenerate?: boolean }) {
  const allowGenerate = options?.allowGenerate ?? false;
  const url = new URL(req.url);
  const langHint = toLanguage(url.searchParams.get("lang"));
  const cacheOnly = !allowGenerate || url.searchParams.get("cacheOnly") === "1";

  const userId = await safeReadUserId(req);
  if (!userId) return bad(401, "login_required");

  const subscription = await safeLoadSubscription(userId);
  if (!subscription?.entitlements?.recoveryPlannerAI) {
    return bad(402, "paid_plan_required_recovery_planner_ai");
  }

  try {
    const row = await safeLoadUserState(userId);
    if (!row?.payload) return bad(404, "state_not_found");

    const state = normalizePayloadToState(row.payload, null);
    const lang = (langHint ?? state.settings.language ?? "ko") as Language;
    const today = todayISO();
    const recordedDays = countHealthRecordedDays({ bio: state.bio, emotions: state.emotions });
    if (recordedDays < 3) return bad(403, "insights_locked_min_3_days");

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
    const todayVital = todayHasInput && todayVitalCandidate ? { ...todayVitalCandidate, shift: todayShift } : null;
    const recordedDates = collectRecordedDates(state);
    const historyStart = recordedDates[0] ?? today;
    const historyDateSet = new Set(recordedDates);
    const allVitals = computeVitalsRange({ state, start: historyStart, end: today }).filter(
      (v) => historyDateSet.has(v.dateISO) || hasReliableEstimatedSignal(v)
    );

    const plannerContext = buildPlannerContext({
      pivotISO: today,
      schedule: state.schedule,
      todayVital,
      factorVitals: vitals7.length ? vitals7 : todayVital ? [todayVital] : [],
      profile: state.settings?.profile,
    });
    const nextShift = plannerContext.nextDuty;
    const profile = normalizeProfileSettings(state.settings?.profile);
    const profileSnapshot = normalizeProfileSnapshot(profile);
    const timelinePreview = buildPlannerTimelinePreview(todayShift, todayVital, profile);
    const nextDutyLabel = formatRelativeDutyKorean(plannerContext.nextDutyDate, today);

    const aiContent = await safeLoadAIContent(userId);
    const recoveryVariants = aiContent && aiContent.dateISO === today ? readRecoveryVariants(aiContent.data, today) : {};
    if (aiContent && aiContent.dateISO === today) {
      const variants = readPlannerVariants(aiContent.data, today);
      const direct = variants[lang] ?? null;
      const directIsCurrent =
        direct &&
        isPlannerContextCurrent(direct.plannerContext, plannerContext) &&
        isProfileSnapshotCurrent(direct.profileSnapshot, profileSnapshot);

      if (directIsCurrent) {
        return jsonNoStore({ ok: true, data: direct } satisfies AIRecoveryPlannerApiSuccess);
      }
    }

    if (cacheOnly) {
      return jsonNoStore({ ok: true, data: null } satisfies AIRecoveryPlannerApiSuccess);
    }

    const fallbackModules = buildFallbackModules({
      language: lang,
      plannerContext,
      nextDutyLabel,
      timelinePreview,
    });

    let plannerDebug: string | null = null;
    let explanationDebug: string | null = null;
    let plannerModel: string | null = null;
    const fallbackRecovery = generateAIRecovery(todayVital, vitals7, prevWeek, nextShift, lang);
    let explanationResult = fallbackRecovery;
    let explanationGeneratedText: string | undefined;
    let explanationModel: string | null = null;
    const cachedRecovery = recoveryVariants[lang] ?? null;
    const cachedRecoveryIsCurrent =
      cachedRecovery &&
      isPlannerContextCurrent(cachedRecovery.plannerContext, plannerContext) &&
      isProfileSnapshotCurrent(cachedRecovery.profileSnapshot, profileSnapshot);

    if (cachedRecoveryIsCurrent) {
      explanationResult = cachedRecovery.result;
      explanationGeneratedText = cachedRecovery.generatedText;
      explanationModel = cachedRecovery.model;
      explanationDebug = cachedRecovery.debug ?? null;
    } else {
      try {
        const explanationAI = await generateAIRecoveryWithOpenAI({
          language: lang,
          todayISO: today,
          todayShift,
          nextShift,
          todayVital,
          vitals7,
          prevWeekVitals: prevWeek,
          allVitals,
          plannerContext,
          profile,
        });
        explanationResult = explanationAI.result;
        explanationGeneratedText = explanationAI.generatedText;
        explanationModel = explanationAI.model;
      } catch (err: any) {
        explanationDebug = typeof err?.message === "string" ? err.message : "explanation_ai_failed";
      }
    }

    let plannerModules = fallbackModules;
    let plannerGeneratedText: string | undefined;
    try {
      const plannerAI = await generateAIRecoveryPlannerModulesWithOpenAI({
        language: lang,
        todayISO: today,
        todayShift,
        nextShift,
        todayVital,
        vitals7,
        prevWeekVitals: prevWeek,
        allVitals,
        plannerContext,
        profile,
        recoveryResult: explanationResult,
      });
      plannerModules = plannerAI.result;
      plannerGeneratedText = plannerAI.generatedText;
      plannerModel = plannerAI.model;
    } catch (err: any) {
      plannerDebug = typeof err?.message === "string" ? err.message : "planner_ai_failed";
    }

    const todayVitalScore = todayVital ? Math.round(Math.min(todayVital.body.value, todayVital.mental.ema)) : null;
    const model = explanationModel ?? plannerModel ?? null;
    const explanationPayload: AIRecoveryPayload = {
      dateISO: today,
      language: lang,
      todayShift,
      nextShift,
      todayVitalScore,
      source: "supabase",
      engine: explanationGeneratedText ? "openai" : "rule",
      model: explanationModel,
      debug: explanationDebug,
      generatedText: explanationGeneratedText,
      plannerContext,
      profileSnapshot,
      result: explanationResult,
    };
    const payload: AIRecoveryPlannerPayload = {
      dateISO: today,
      language: lang,
      todayShift,
      nextShift,
      todayVitalScore,
      source: "supabase",
      engine: plannerGeneratedText || explanationGeneratedText ? "openai" : "rule",
      model,
      debug: [plannerDebug, explanationDebug].filter(Boolean).join("|") || null,
      generatedText: plannerGeneratedText,
      explanationGeneratedText,
      plannerContext,
      profileSnapshot,
      result: {
        ...plannerModules,
        explanation: buildExplanationModule(explanationResult, lang),
      },
    };

    const saveError = await safeSaveAIContent(userId, today, lang, {
      dateISO: today,
      generatedAt: Date.now(),
      variants: {
        ...(isRecord(aiContent?.data) && isRecord((aiContent?.data as Record<string, unknown>).variants)
          ? ((aiContent?.data as Record<string, unknown>).variants as Record<string, unknown>)
          : {}),
        [lang]: explanationPayload,
      },
      plannerVariants: {
        ...(isRecord(aiContent?.data) && isRecord((aiContent?.data as Record<string, unknown>).plannerVariants)
          ? ((aiContent?.data as Record<string, unknown>).plannerVariants as Record<string, unknown>)
          : {}),
        [lang]: payload,
      },
    } as Json);
    if (saveError) {
      payload.debug = payload.debug ? `${payload.debug}|${saveError}` : saveError;
    }

    return jsonNoStore({ ok: true, data: payload } satisfies AIRecoveryPlannerApiSuccess);
  } catch {
    return bad(500, "openai_generation_failed");
  }
}

export async function GET(req: NextRequest) {
  return handlePlanner(req, { allowGenerate: false });
}

export async function POST(req: NextRequest) {
  const sameOriginError = sameOriginRequestError(req);
  if (sameOriginError) return bad(403, sameOriginError);
  return handlePlanner(req, { allowGenerate: true });
}
