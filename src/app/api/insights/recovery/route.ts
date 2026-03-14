import { NextRequest, NextResponse } from "next/server";
import { addDays, fromISODate, toISODate, todayISO, type ISODate } from "@/lib/date";
import { generateAIRecovery } from "@/lib/aiRecovery";
import type { AIRecoveryApiError, AIRecoveryApiSuccess, AIRecoveryPayload } from "@/lib/aiRecoveryContract";
import type { AIRecoveryPlannerPayload } from "@/lib/aiRecoveryPlanner";
import type { Language } from "@/lib/i18n";
import { countHealthRecordedDays, hasHealthInput } from "@/lib/healthRecords";
import { getAIRecoveryModelForTier } from "@/lib/billing/plans";
import type { AppState } from "@/lib/model";
import { sanitizeStatePayload } from "@/lib/stateSanitizer";
import {
  buildAfterWorkMissingLabels,
  buildRecoveryOrderProgressId,
  buildRecoveryPhaseState,
  getAfterWorkReadiness,
  normalizeRecoveryPhase,
  stripStartPhaseDynamicInputs,
  stripStartPhaseDynamicInputsFromVitals,
  type RecoveryPhase,
} from "@/lib/recoveryPhases";
import type { Shift } from "@/lib/types";
import { computeVitalsRange } from "@/lib/vitals";
import type { Json } from "@/types/supabase";
import type { SubscriptionSnapshot } from "@/lib/server/billingStore";
import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { buildPlannerContext, normalizeProfileSettings, type PlannerContext } from "@/lib/recoveryPlanner";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { userHasCompletedServiceConsent } from "@/lib/server/serviceConsentStore";
import { loadUserState } from "@/lib/server/userStateStore";
import { loadAIContent, saveAIContent } from "@/lib/server/aiContentStore";
import { readSubscription } from "@/lib/server/billingStore";

// Cloudflare Pages requires Edge runtime for non-static routes.
export const runtime = "edge";
export const dynamic = "force-dynamic";
// Pin Edge Function to US/EU regions so outbound OpenAI calls never originate
// from Asian PoPs whose egress IPs may be blocked by OpenAI's region policy.
export const preferredRegion = ["iad1", "sfo1", "fra1"];

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
  const body: AIRecoveryApiError = { ok: false, error: safeError || "unknown_error" };
  return jsonNoStore(body, { status });
}

async function safeReadUserId(req: NextRequest): Promise<string> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnon) return "";

    return await readUserIdFromRequest(req);
  } catch {
    return "";
  }
}

async function safeHasCompletedServiceConsent(userId: string): Promise<boolean> {
  try {
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!serviceRole || !supabaseUrl) return false;

    return await userHasCompletedServiceConsent(userId);
  } catch {
    return false;
  }
}

// ✅ 안전하게 user state 로드 - Supabase service role key 없어도 crash 안 됨
async function safeLoadUserState(userId: string): Promise<{ payload: unknown } | null> {
  try {
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!serviceRole || !supabaseUrl) return null;

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

function asPayload(candidate: unknown, fallbackLang: Language): AIRecoveryPayload | null {
  if (!isRecord(candidate) || !isRecord(candidate.result)) return null;
  if (typeof candidate.dateISO !== "string") return null;
  const language = asLanguage(candidate.language) ?? fallbackLang;
  const engine = candidate.engine === "rule" ? "rule" : "openai";
  const generatedText = typeof candidate.generatedText === "string" ? candidate.generatedText : undefined;
  if (engine === "openai" && !generatedText?.trim()) return null;
  const plannerContext = asPlannerContext(candidate.plannerContext);
  const profileSnapshot = asProfileSnapshot(candidate.profileSnapshot);
  return {
    dateISO: candidate.dateISO as ISODate,
    language,
    phase: normalizeRecoveryPhase(candidate.phase),
    todayShift: (typeof candidate.todayShift === "string" ? candidate.todayShift : "OFF") as Shift,
    nextShift: (typeof candidate.nextShift === "string" ? candidate.nextShift : null) as Shift | null,
    todayVitalScore: typeof candidate.todayVitalScore === "number" ? candidate.todayVitalScore : null,
    source: candidate.source === "local" ? "local" : "supabase",
    engine,
    model: typeof candidate.model === "string" ? candidate.model : null,
    debug: typeof candidate.debug === "string" ? candidate.debug : null,
    generatedText,
    plannerContext: plannerContext ?? undefined,
    profileSnapshot: profileSnapshot ?? undefined,
    result: candidate.result as AIRecoveryPayload["result"],
  };
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

function asProfileSnapshot(value: unknown): AIRecoveryPayload["profileSnapshot"] | null {
  if (!isRecord(value)) return null;
  return {
    chronotype: Number.isFinite(Number(value.chronotype)) ? Number(value.chronotype) : 0.5,
    caffeineSensitivity: Number.isFinite(Number(value.caffeineSensitivity)) ? Number(value.caffeineSensitivity) : 1,
  };
}

function normalizeProfileSnapshot(value: AIRecoveryPayload["profileSnapshot"]) {
  const profile = normalizeProfileSettings(value ?? null);
  return {
    chronotype: Number(profile.chronotype.toFixed(2)),
    caffeineSensitivity: Number(profile.caffeineSensitivity.toFixed(2)),
  };
}

function hasChecklistOrdersShape(value: unknown) {
  if (!isRecord(value) || !isRecord(value.orders) || !Array.isArray(value.orders.items)) return false;
  if (value.orders.items.length < 1 || value.orders.items.length > 5) return false;
  return value.orders.items.every((item) => {
    if (!isRecord(item)) return false;
    return (
      typeof item.id === "string" &&
      typeof item.title === "string" &&
      typeof item.body === "string" &&
      typeof item.when === "string"
    );
  });
}

function asPlannerPayload(candidate: unknown, fallbackLang: Language): AIRecoveryPlannerPayload | null {
  if (!isRecord(candidate) || !isRecord(candidate.result) || !hasChecklistOrdersShape(candidate.result)) return null;
  if (typeof candidate.dateISO !== "string") return null;
  const language = asLanguage(candidate.language) ?? fallbackLang;
  const engine = candidate.engine === "rule" ? "rule" : "openai";
  const generatedText = typeof candidate.generatedText === "string" ? candidate.generatedText : undefined;
  const explanationGeneratedText =
    typeof candidate.explanationGeneratedText === "string" ? candidate.explanationGeneratedText : undefined;
  if (engine === "openai" && (!generatedText?.trim() || !explanationGeneratedText?.trim())) return null;
  const plannerContext = asPlannerContext(candidate.plannerContext);
  const profileSnapshot = asProfileSnapshot(candidate.profileSnapshot);
  return {
    dateISO: candidate.dateISO as ISODate,
    language,
    phase: normalizeRecoveryPhase(candidate.phase),
    requestedOrderCount: typeof candidate.requestedOrderCount === "number" ? candidate.requestedOrderCount : null,
    todayShift: (typeof candidate.todayShift === "string" ? candidate.todayShift : "OFF") as Shift,
    nextShift: (typeof candidate.nextShift === "string" ? candidate.nextShift : null) as Shift | null,
    todayVitalScore: typeof candidate.todayVitalScore === "number" ? candidate.todayVitalScore : null,
    source: candidate.source === "local" ? "local" : "supabase",
    engine,
    model: typeof candidate.model === "string" ? candidate.model : null,
    debug: typeof candidate.debug === "string" ? candidate.debug : null,
    generatedText,
    explanationGeneratedText,
    plannerContext: plannerContext ?? undefined,
    profileSnapshot: profileSnapshot ?? undefined,
    result: candidate.result as AIRecoveryPlannerPayload["result"],
  };
}

function asPlannerRecoveryPayload(candidate: unknown, fallbackLang: Language): AIRecoveryPayload | null {
  if (!candidate || typeof candidate !== "object") return null;
  const planner = candidate as AIRecoveryPlannerPayload;
  if (typeof planner.dateISO !== "string" || !planner.result || typeof planner.result !== "object") return null;
  const explanation = (planner.result as Record<string, unknown>).explanation;
  if (!explanation || typeof explanation !== "object") return null;
  const recovery = (explanation as Record<string, unknown>).recovery;
  if (!recovery || typeof recovery !== "object") return null;
  const language = asLanguage((planner as any).language) ?? fallbackLang;
  const engine = planner.engine === "rule" ? "rule" : "openai";
  const generatedText =
    typeof planner.explanationGeneratedText === "string"
      ? planner.explanationGeneratedText
      : typeof planner.generatedText === "string"
        ? planner.generatedText
        : undefined;
  if (engine === "openai" && !generatedText?.trim()) return null;

  return {
    dateISO: planner.dateISO as ISODate,
    language,
    phase: normalizeRecoveryPhase((planner as any).phase),
    todayShift: (typeof planner.todayShift === "string" ? planner.todayShift : "OFF") as Shift,
    nextShift: (typeof planner.nextShift === "string" ? planner.nextShift : null) as Shift | null,
    todayVitalScore: typeof planner.todayVitalScore === "number" ? planner.todayVitalScore : null,
    source: planner.source === "local" ? "local" : "supabase",
    engine,
    model: typeof planner.model === "string" ? planner.model : null,
    debug: typeof planner.debug === "string" ? planner.debug : null,
    generatedText,
    plannerContext: planner.plannerContext,
    profileSnapshot: planner.profileSnapshot,
    result: recovery as AIRecoveryPayload["result"],
  };
}

function isPlannerContextCurrent(cached: PlannerContext | null | undefined, current: PlannerContext) {
  if (!cached) return false;

  const cachedFocus = cached.focusFactor?.key ?? null;
  const currentFocus = current.focusFactor?.key ?? null;
  if (cachedFocus !== currentFocus) return false;
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
    return Boolean(
      target &&
      item.rank === target.rank &&
      item.title === target.title &&
      item.text === target.text
    );
  });
}

function isProfileSnapshotCurrent(
  cached: AIRecoveryPayload["profileSnapshot"] | null | undefined,
  current: NonNullable<AIRecoveryPayload["profileSnapshot"]>
) {
  if (!cached) return false;
  return (
    Number(cached.chronotype.toFixed(2)) === current.chronotype &&
    Number(cached.caffeineSensitivity.toFixed(2)) === current.caffeineSensitivity
  );
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

  const plannerVariants = isRecord(raw.plannerVariants) ? raw.plannerVariants : null;
  if (plannerVariants) {
    const plannerKo = asPlannerRecoveryPayload(plannerVariants.ko, "ko");
    const plannerEn = asPlannerRecoveryPayload(plannerVariants.en, "en");
    if (plannerKo && plannerKo.dateISO === today) variants.ko = variants.ko ?? plannerKo;
    if (plannerEn && plannerEn.dateISO === today) variants.en = variants.en ?? plannerEn;
  }

  return variants;
}

function readRecoveryPhasePayload(
  raw: unknown,
  today: ISODate,
  lang: Language,
  phase: RecoveryPhase
): AIRecoveryPayload | null {
  if (!isRecord(raw)) return phase === "start" ? readAIContentVariants(raw, today)[lang] ?? null : null;
  const phaseNode = isRecord(raw.recoveryPhaseVariants) ? raw.recoveryPhaseVariants : null;
  const langNode = phaseNode && isRecord(phaseNode[lang]) ? phaseNode[lang] : null;
  const direct = langNode ? asPayload(langNode[phase], lang) : null;
  if (direct && direct.dateISO === today && direct.engine === "openai") return direct;

  const plannerPhaseNode = isRecord(raw.plannerPhaseVariants) ? raw.plannerPhaseVariants : null;
  const plannerLangNode = plannerPhaseNode && isRecord(plannerPhaseNode[lang]) ? plannerPhaseNode[lang] : null;
  const plannerDirect = plannerLangNode ? asPlannerRecoveryPayload(plannerLangNode[phase], lang) : null;
  if (plannerDirect && plannerDirect.dateISO === today && plannerDirect.engine === "openai") return plannerDirect;

  const legacy = phase === "start" ? readAIContentVariants(raw, today)[lang] ?? null : null;
  return legacy?.engine === "openai" ? legacy : null;
}

function readPlannerPhasePayload(
  raw: unknown,
  today: ISODate,
  lang: Language,
  phase: RecoveryPhase
): AIRecoveryPlannerPayload | null {
  if (!isRecord(raw)) return null;
  const plannerPhaseNode = isRecord(raw.plannerPhaseVariants) ? raw.plannerPhaseVariants : null;
  const plannerLangNode = plannerPhaseNode && isRecord(plannerPhaseNode[lang]) ? plannerPhaseNode[lang] : null;
  const plannerDirect = plannerLangNode ? asPlannerPayload(plannerLangNode[phase], lang) : null;
  if (plannerDirect && plannerDirect.dateISO === today && plannerDirect.engine === "openai") return plannerDirect;
  return null;
}

type RecoveryThreadSummary = {
  startRecoveryHeadline?: string | null;
  startFocusLabel?: string | null;
  startPrimaryAction?: string | null;
  startAvoidAction?: string | null;
  totalStartOrderCount?: number;
  completedStartOrderCount?: number;
  completedStartOrders?: Array<{ id: string; title: string }>;
  pendingStartOrders?: Array<{ id: string; title: string }>;
}

function buildRecoveryThreadFromPlanner(
  plannerPayload: AIRecoveryPlannerPayload | null,
  completedIds: string[]
): RecoveryThreadSummary | null {
  if (!plannerPayload) return null;
  const completed = new Set(completedIds);
  const startOrders = plannerPayload.result.orders.items ?? [];
  return {
    startRecoveryHeadline: plannerPayload.result.explanation.recovery.headline ?? null,
    startFocusLabel: plannerPayload.plannerContext?.focusFactor?.label ?? null,
    startPrimaryAction: plannerPayload.plannerContext?.primaryAction ?? null,
    startAvoidAction: plannerPayload.plannerContext?.avoidAction ?? null,
    totalStartOrderCount: startOrders.length,
    completedStartOrderCount: startOrders.filter((item) => completed.has(buildRecoveryOrderProgressId("start", item.id))).length,
    completedStartOrders: startOrders
      .filter((item) => completed.has(buildRecoveryOrderProgressId("start", item.id)))
      .map((item) => ({ id: item.id, title: item.title })),
    pendingStartOrders: startOrders
      .filter((item) => !completed.has(buildRecoveryOrderProgressId("start", item.id)))
      .map((item) => ({ id: item.id, title: item.title })),
  };
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

function looksKoreanPayload(payload: AIRecoveryPayload) {
  const chunks: string[] = [];
  chunks.push(payload.result.headline ?? "");
  chunks.push(payload.generatedText ?? "");
  if (payload.result.compoundAlert) {
    chunks.push(payload.result.compoundAlert.message ?? "");
    chunks.push(...(payload.result.compoundAlert.factors ?? []));
  }
  for (const section of payload.result.sections ?? []) {
    chunks.push(section.title ?? "");
    chunks.push(section.description ?? "");
    chunks.push(...(section.tips ?? []));
  }
  if (payload.result.weeklySummary) {
    chunks.push(payload.result.weeklySummary.personalInsight ?? "");
    chunks.push(payload.result.weeklySummary.nextWeekPreview ?? "");
    for (const drain of payload.result.weeklySummary.topDrains ?? []) {
      chunks.push(drain.label ?? "");
    }
  }
  const text = chunks.join(" ");
  const total = (text.match(/[A-Za-z가-힣]/g) ?? []).length;
  if (!total) return false;
  const hangul = (text.match(/[가-힣]/g) ?? []).length;
  return hangul / total > 0.08;
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
    if (lang === "en" && (payload.language !== "en" || looksKoreanPayload(payload))) continue;
    return payload;
  }
  return null;
}

async function handleRecovery(
  req: NextRequest,
  options?: { allowGenerate?: boolean; forceGenerate?: boolean; phase?: RecoveryPhase }
) {
  const allowGenerate = options?.allowGenerate ?? false;
  const forceGenerate = options?.forceGenerate ?? false;
  const url = new URL(req.url);
  const langHint = toLanguage(url.searchParams.get("lang"));
  const phase = normalizeRecoveryPhase(options?.phase ?? url.searchParams.get("phase"));
  const cacheOnly = !allowGenerate || url.searchParams.get("cacheOnly") === "1";

  try {
    // ── 1. 사용자 인증 시도 (실패해도 계속 진행) ──
    const userId = await safeReadUserId(req);
    if (!userId) {
      return bad(401, "login_required");
    }
    if (!(await safeHasCompletedServiceConsent(userId))) {
      return bad(403, "consent_required");
    }

    const subscription = await safeLoadSubscription(userId);
    if (subscription && !subscription.entitlements?.recoveryPlannerAI) {
      return bad(402, "paid_plan_required_ai_recovery");
    }
    const aiRecoveryModel = getAIRecoveryModelForTier(subscription?.tier ?? "pro");

    // ── 2. Supabase에서 사용자 데이터 로드 시도 ──
    const row = await safeLoadUserState(userId);
    if (!row?.payload) {
      return bad(404, "state_not_found");
    }

    const state = normalizePayloadToState(row.payload, null);
    const lang = (langHint ?? state.settings.language ?? "ko") as Language;
    const today = todayISO();
    const recordedDays = countHealthRecordedDays({ bio: state.bio, emotions: state.emotions });
    if (recordedDays < 3) {
      return bad(403, "insights_locked_min_3_days");
    }
    const readiness = getAfterWorkReadiness(state, today);
    if (phase === "after_work" && !readiness.ready && !cacheOnly) {
      return bad(409, `after_work_inputs_required:${buildAfterWorkMissingLabels(readiness.recordedLabels).slice(0, 3).join(",")}`);
    }
    const phaseState = buildRecoveryPhaseState(state, today, phase);

    const start = toISODate(addDays(fromISODate(today), -13));
    const vitals14 = computeVitalsRange({
      state: phaseState,
      start,
      end: today,
      disableTodayCarryISO: phase === "start" ? today : null,
    });
    const inputDateSet = new Set<ISODate>();
    for (let i = 0; i < 14; i++) {
      const iso = toISODate(addDays(fromISODate(start), i));
      const bio = phaseState.bio?.[iso] ?? null;
      const emotion = phaseState.emotions?.[iso] ?? null;
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
    const todayShift = (readShift(phaseState.schedule, today) ?? todayVitalCandidate?.shift ?? "OFF") as Shift;
    const phaseTodayVitalCandidate = phase === "start" ? stripStartPhaseDynamicInputs(todayVitalCandidate) : todayVitalCandidate;
    const todayVital = todayHasInput && phaseTodayVitalCandidate
      ? {
          ...phaseTodayVitalCandidate,
          shift: todayShift,
        }
      : null;
    const recordedDates = collectRecordedDates(phaseState);
    const historyStart = recordedDates[0] ?? today;
    const historyDateSet = new Set(recordedDates);
    const allVitalsRaw = computeVitalsRange({
      state: phaseState,
      start: historyStart,
      end: today,
      disableTodayCarryISO: phase === "start" ? today : null,
    }).filter(
      (v) => historyDateSet.has(v.dateISO) || hasReliableEstimatedSignal(v)
    );
    const phaseVitals7 = phase === "start" ? stripStartPhaseDynamicInputsFromVitals(vitals7, today) : vitals7;
    const phasePrevWeek = phase === "start" ? stripStartPhaseDynamicInputsFromVitals(prevWeek, today) : prevWeek;
    const allVitals = phase === "start" ? stripStartPhaseDynamicInputsFromVitals(allVitalsRaw, today) : allVitalsRaw;
    const plannerContext = buildPlannerContext({
      pivotISO: today,
      schedule: phaseState.schedule,
      todayVital,
      factorVitals: phaseVitals7.length ? phaseVitals7 : todayVital ? [todayVital] : [],
      profile: phaseState.settings?.profile,
    });
    const nextShift = plannerContext.nextDuty;
    const profile = normalizeProfileSettings(phaseState.settings?.profile);
    const profileSnapshot = normalizeProfileSnapshot(profile);

    // ── 3. Supabase ai_content 캐시 우선 조회 ──
    const aiContent = await safeLoadAIContent(userId);
    const cachedStartPlanner =
      aiContent && aiContent.dateISO === today ? readPlannerPhasePayload(aiContent.data, today, lang, "start") : null;
    const startCompletedIds =
      phase === "after_work" && cachedStartPlanner
        ? await (async () => {
            const { readRecoveryOrderCompletedIds } = await import("@/lib/server/recoveryOrderStore");
            return await readRecoveryOrderCompletedIds(userId, today);
          })()
        : [];
    const recoveryThread = phase === "after_work" ? buildRecoveryThreadFromPlanner(cachedStartPlanner, startCompletedIds) : null;
    if (phase === "after_work" && !cachedStartPlanner && !cacheOnly) {
      return bad(409, "start_recovery_required_before_after_work");
    }
    if (!forceGenerate && aiContent && aiContent.dateISO === today) {
      const variants = readAIContentVariants(aiContent.data, today);
      const koVariant = readRecoveryPhasePayload(aiContent.data, today, "ko", phase) ?? null;
      const direct = readRecoveryPhasePayload(aiContent.data, today, lang, phase) ?? null;
      const directIsCurrent =
        direct &&
        direct.phase === phase &&
        direct.engine === "openai" &&
        isPlannerContextCurrent(direct.plannerContext, plannerContext) &&
        isProfileSnapshotCurrent(direct.profileSnapshot, profileSnapshot);
      const koIsCurrent =
        koVariant &&
        koVariant.engine === "openai" &&
        isPlannerContextCurrent(koVariant.plannerContext, plannerContext) &&
        isProfileSnapshotCurrent(koVariant.profileSnapshot, profileSnapshot);

      if (
        directIsCurrent &&
        (lang !== "en" ||
          (!looksKoreanPayload(direct!) && (!koVariant || !koIsCurrent || hasSameStructure(koVariant, direct!))))
      ) {
        return jsonNoStore({ ok: true, data: direct! } satisfies AIRecoveryApiSuccess);
      }
      if (lang === "en" && koVariant && koIsCurrent) {
        try {
          const { translateAIRecoveryToEnglish } = await import("@/lib/server/openaiRecovery");
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
            phase,
            model: translated.model ?? koVariant.model,
            debug: translated.debug,
            generatedText: translated.generatedText,
            result: translated.result,
          };
          const aiContentRecord = isRecord(aiContent.data) ? (aiContent.data as Record<string, unknown>) : {};
          const previousRecoveryPhaseVariants =
            isRecord(aiContentRecord.recoveryPhaseVariants) ? (aiContentRecord.recoveryPhaseVariants as Record<string, unknown>) : {};
          const previousRecoveryKoNode =
            isRecord(previousRecoveryPhaseVariants.ko) ? (previousRecoveryPhaseVariants.ko as Record<string, unknown>) : {};
          const previousRecoveryEnNode =
            isRecord(previousRecoveryPhaseVariants.en) ? (previousRecoveryPhaseVariants.en as Record<string, unknown>) : {};
          const saveError = await safeSaveAIContent(userId, today, "ko", {
            dateISO: today,
            generatedAt: Date.now(),
            recoveryPhaseVariants: {
              ...previousRecoveryPhaseVariants,
              ko: { ...previousRecoveryKoNode, [phase]: koVariant },
              en: { ...previousRecoveryEnNode, [phase]: translatedPayload },
            },
            ...(phase === "start"
              ? {
                  variants: {
                    ...(isRecord(aiContentRecord.variants) ? (aiContentRecord.variants as Record<string, unknown>) : {}),
                    ko: koVariant,
                    en: translatedPayload,
                  },
                }
              : {}),
          } as Json);
          if (saveError) {
            translatedPayload.debug = translatedPayload.debug
              ? `${translatedPayload.debug}|${saveError}`
              : saveError;
          }
          return jsonNoStore({ ok: true, data: translatedPayload } satisfies AIRecoveryApiSuccess);
        } catch {
          if (cacheOnly) {
            return jsonNoStore({ ok: true, data: null } satisfies AIRecoveryApiSuccess);
          }
        }
      }
    }

    // legacy fallback: rnest_user_state.payload.aiRecoveryDaily
    const legacyCached = forceGenerate || phase !== "start" ? null : readServerCachedAI(row.payload, today, lang);
    if (
      legacyCached &&
      isPlannerContextCurrent(legacyCached.plannerContext, plannerContext) &&
      isProfileSnapshotCurrent(legacyCached.profileSnapshot, profileSnapshot)
    ) {
      void safeSaveAIContent(userId, today, legacyCached.language, {
        dateISO: today,
        generatedAt: Date.now(),
        recoveryPhaseVariants: {
          [legacyCached.language]: {
            start: legacyCached,
          },
        },
        variants: {
          ko: legacyCached,
        },
      } as Json);
      return jsonNoStore({ ok: true, data: legacyCached } satisfies AIRecoveryApiSuccess);
    }

    if (cacheOnly) {
      return jsonNoStore({ ok: true, data: null } satisfies AIRecoveryApiSuccess);
    }

    try {
      // ── 4. OpenAI 한국어 단일 생성(영어는 번역 캐시) ──
      const { generateAIRecoveryWithOpenAI, translateAIRecoveryToEnglish } = await import("@/lib/server/openaiRecovery");
      const aiKo = await generateAIRecoveryWithOpenAI({
        language: "ko",
        todayISO: today,
        modelOverride: aiRecoveryModel,
        phase,
        todayShift,
        nextShift,
        todayVital,
        vitals7: phaseVitals7,
        prevWeekVitals: phasePrevWeek,
        allVitals,
        plannerContext,
        profile,
        recoveryThread,
      });
      const todayVitalScore = todayVital
        ? Math.round(Math.min(todayVital.body.value, todayVital.mental.ema))
        : null;

      const payloadKo: AIRecoveryPayload = {
        dateISO: today,
        language: "ko",
        phase,
        todayShift,
        nextShift,
        todayVitalScore,
        source: "supabase",
        engine: aiKo.engine,
        model: aiKo.model,
        debug: aiKo.debug,
        generatedText: aiKo.generatedText,
        plannerContext,
        profileSnapshot,
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
          try {
            const aiEn = await generateAIRecoveryWithOpenAI({
              language: "en",
              todayISO: today,
              modelOverride: aiRecoveryModel,
              phase,
              todayShift,
              nextShift,
              todayVital,
              vitals7: phaseVitals7,
              prevWeekVitals: phasePrevWeek,
              allVitals,
              plannerContext,
              profile,
              recoveryThread,
            });
            payloadEn = {
              ...payloadKo,
              language: "en",
              model: aiEn.model ?? payloadKo.model,
              debug: aiEn.debug ? `en_direct:${aiEn.debug}` : "en_direct",
              generatedText: aiEn.generatedText,
              result: aiEn.result,
            };
          } catch {
            payloadEn = null;
          }
        }
      }

      const saveError = await safeSaveAIContent(userId, today, "ko", {
        dateISO: today,
        generatedAt: Date.now(),
        recoveryPhaseVariants: {
          ...(isRecord(aiContent?.data) && isRecord((aiContent?.data as Record<string, unknown>).recoveryPhaseVariants)
            ? ((aiContent?.data as Record<string, unknown>).recoveryPhaseVariants as Record<string, unknown>)
            : {}),
          ko: {
            ...(isRecord(aiContent?.data) &&
            isRecord((aiContent?.data as Record<string, unknown>).recoveryPhaseVariants) &&
            isRecord((((aiContent?.data as Record<string, unknown>).recoveryPhaseVariants as Record<string, unknown>).ko))
              ? ((((aiContent?.data as Record<string, unknown>).recoveryPhaseVariants as Record<string, unknown>).ko) as Record<string, unknown>)
              : {}),
            [phase]: payloadKo,
          },
          ...(payloadEn
            ? {
                en: {
                  ...(isRecord(aiContent?.data) &&
                  isRecord((aiContent?.data as Record<string, unknown>).recoveryPhaseVariants) &&
                  isRecord((((aiContent?.data as Record<string, unknown>).recoveryPhaseVariants as Record<string, unknown>).en))
                    ? ((((aiContent?.data as Record<string, unknown>).recoveryPhaseVariants as Record<string, unknown>).en) as Record<string, unknown>)
                    : {}),
                  [phase]: payloadEn,
                },
              }
            : {}),
        },
        ...(phase === "start"
          ? {
              variants: {
                ko: payloadKo,
                ...(payloadEn ? { en: payloadEn } : {}),
              },
            }
          : {}),
      } as Json);
      if (saveError) {
        payloadKo.debug = payloadKo.debug ? `${payloadKo.debug}|${saveError}` : saveError;
        if (payloadEn) {
          payloadEn.debug = payloadEn.debug ? `${payloadEn.debug}|${saveError}` : saveError;
        }
      }

      const body: AIRecoveryApiSuccess = { ok: true, data: lang === "en" ? payloadEn ?? payloadKo : payloadKo };
      return jsonNoStore(body);
    } catch (generationError: any) {
      const todayVitalScore = todayVital
        ? Math.round(Math.min(todayVital.body.value, todayVital.mental.ema))
        : null;
      const fallbackKoResult = generateAIRecovery(todayVital, phaseVitals7, phasePrevWeek, nextShift, "ko");
      const fallbackKo: AIRecoveryPayload = {
        dateISO: today,
        language: "ko",
        phase,
        todayShift,
        nextShift,
        todayVitalScore,
        source: "local",
        engine: "rule",
        model: null,
        debug: typeof generationError?.message === "string" ? generationError.message : "rule_fallback",
        plannerContext,
        profileSnapshot,
        result: fallbackKoResult,
      };
      const fallbackEn =
        lang === "en"
          ? ({
              ...fallbackKo,
              language: "en" as const,
              result: generateAIRecovery(todayVital, phaseVitals7, phasePrevWeek, nextShift, "en"),
            } satisfies AIRecoveryPayload)
          : null;
      return jsonNoStore({
        ok: true,
        data: lang === "en" ? fallbackEn ?? fallbackKo : fallbackKo,
      } satisfies AIRecoveryApiSuccess);
    }
  } catch (err: any) {
    try {
      console.error("[Recovery] handle_failed", {
        cacheOnly,
        phase,
        error: err?.message ?? err,
      });
    } catch {
      // Ignore logging failure.
    }
    if (cacheOnly) {
      return jsonNoStore({ ok: true, data: null } satisfies AIRecoveryApiSuccess);
    }
    return bad(500, typeof err?.message === "string" && err.message.trim() ? err.message.trim() : "openai_generation_failed");
  }
}

export async function GET(req: NextRequest) {
  try {
    return await handleRecovery(req, { allowGenerate: false });
  } catch (err: any) {
    console.error("[Recovery GET] unhandled", err?.message ?? err);
    return jsonNoStore({ ok: true, data: null } satisfies AIRecoveryApiSuccess);
  }
}

export async function POST(req: NextRequest) {
  try {
    const sameOriginError = sameOriginRequestError(req);
    if (sameOriginError) return bad(403, sameOriginError);
    let forceGenerate = false;
    let phase: RecoveryPhase | null = null;
    const rawBody = await req.text().catch(() => "");
    if (rawBody.trim()) {
      try {
        const body = JSON.parse(rawBody) as { forceGenerate?: unknown; phase?: unknown } | null;
        forceGenerate = Boolean(body?.forceGenerate);
        phase = normalizeRecoveryPhase(body?.phase);
      } catch {
        return bad(400, "invalid_json");
      }
    }
    return await handleRecovery(req, { allowGenerate: true, forceGenerate, phase: phase ?? undefined });
  } catch (err: any) {
    console.error("[Recovery POST] unhandled", err?.message ?? err);
    return bad(500, "recovery_unhandled_error");
  }
}
