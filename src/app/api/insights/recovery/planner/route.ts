import { NextRequest } from "next/server";
import { addDays, fromISODate, toISODate, todayISO, type ISODate } from "@/lib/date";
import type { AIRecoveryPayload } from "@/lib/aiRecoveryContract";
import {
  buildExplanationModule,
  type AIRecoveryPlannerModules,
  type AIRecoveryPlannerApiError,
  type AIRecoveryPlannerApiSuccess,
  type AIRecoveryPlannerPayload,
} from "@/lib/aiRecoveryPlanner";
import type { Language } from "@/lib/i18n";
import { getAIRecoveryModelForTier } from "@/lib/billing/plans";
import { countHealthRecordedDays, hasHealthInput } from "@/lib/healthRecords";
import type { AppState } from "@/lib/model";
import { sanitizeStatePayload } from "@/lib/stateSanitizer";
import {
  generateAIRecoveryPlannerModulesWithOpenAI,
  generateAIRecoveryWithOpenAI,
} from "@/lib/server/openaiRecovery";
import {
  buildAfterWorkMissingLabels,
  buildRecoveryOrderProgressId,
  buildRecoveryPhaseState,
  getAfterWorkReadiness,
  normalizeRecoveryPhase,
  recoveryPhaseTitle,
  stripStartPhaseDynamicInputs,
  stripStartPhaseDynamicInputsFromVitals,
  type RecoveryPhase,
} from "@/lib/recoveryPhases";
import {
  buildPlannerContext,
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
// Pin Edge Function to US/EU regions so outbound OpenAI calls never originate
// from Asian PoPs whose egress IPs may be blocked by OpenAI's region policy.
export const preferredRegion = ["iad1", "sfo1", "fra1"];
const DEFAULT_ORDER_COUNT = 3;

function toLanguage(value: string | null): Language | null {
  if (value === "ko" || value === "en") return value;
  return null;
}

function normalizeRequestedOrderCount(value: unknown): number | null {
  if (value == null || String(value).trim() === "") return DEFAULT_ORDER_COUNT;
  const parsed = Math.round(Number(value));
  if (!Number.isFinite(parsed)) return DEFAULT_ORDER_COUNT;
  return Math.max(1, Math.min(5, parsed));
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

async function safeHasCompletedServiceConsent(userId: string): Promise<boolean> {
  try {
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!serviceRole || !supabaseUrl) return false;
    const { userHasCompletedServiceConsent } = await import("@/lib/server/serviceConsentStore");
    return await userHasCompletedServiceConsent(userId);
  } catch {
    return false;
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
    requestedOrderCount: normalizeRequestedOrderCount(candidate.requestedOrderCount),
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

function isRequestedOrderCountCurrent(cached: number | null | undefined, requested: number | null) {
  if (requested == null) return true;
  return normalizeRequestedOrderCount(cached) === requested;
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

function readRecoveryPhasePayload(
  raw: unknown,
  today: ISODate,
  lang: Language,
  phase: RecoveryPhase
): AIRecoveryPayload | null {
  if (!isRecord(raw)) return phase === "start" ? readRecoveryVariants(raw, today)[lang] ?? null : null;
  const phaseNode = isRecord(raw.recoveryPhaseVariants) ? raw.recoveryPhaseVariants : null;
  const langNode = phaseNode && isRecord(phaseNode[lang]) ? phaseNode[lang] : null;
  const direct = langNode ? asRecoveryPayload(langNode[phase], lang) : null;
  if (direct && direct.dateISO === today && direct.engine === "openai") return direct;
  const legacy = phase === "start" ? readRecoveryVariants(raw, today)[lang] ?? null : null;
  return legacy?.engine === "openai" ? legacy : null;
}

function readPlannerPhasePayload(
  raw: unknown,
  today: ISODate,
  lang: Language,
  phase: RecoveryPhase
): AIRecoveryPlannerPayload | null {
  if (!isRecord(raw)) return phase === "start" ? readPlannerVariants(raw, today)[lang] ?? null : null;
  const phaseNode = isRecord(raw.plannerPhaseVariants) ? raw.plannerPhaseVariants : null;
  const langNode = phaseNode && isRecord(phaseNode[lang]) ? phaseNode[lang] : null;
  const direct = langNode ? asPlannerPayload(langNode[phase], lang) : null;
  if (direct && direct.dateISO === today && direct.engine === "openai") return direct;
  const legacy = phase === "start" ? readPlannerVariants(raw, today)[lang] ?? null : null;
  return legacy?.engine === "openai" ? legacy : null;
}

function buildRecoveryThread(
  startPlanner: AIRecoveryPlannerPayload | null,
  completedIds: string[]
): NonNullable<Parameters<typeof generateAIRecoveryWithOpenAI>[0]["recoveryThread"]> | null {
  if (!startPlanner) return null;
  const completed = new Set(completedIds);
  const startOrders = startPlanner.result.orders.items ?? [];
  const completedStartOrders = startOrders
    .filter((item) => completed.has(buildRecoveryOrderProgressId("start", item.id)))
    .map((item) => ({ id: item.id, title: item.title }));
  const pendingStartOrders = startOrders
    .filter((item) => !completed.has(buildRecoveryOrderProgressId("start", item.id)))
    .map((item) => ({ id: item.id, title: item.title }));

  return {
    startRecoveryHeadline: startPlanner.result.explanation.recovery.headline ?? null,
    startFocusLabel: startPlanner.plannerContext?.focusFactor?.label ?? null,
    startPrimaryAction: startPlanner.plannerContext?.primaryAction ?? null,
    startAvoidAction: startPlanner.plannerContext?.avoidAction ?? null,
    totalStartOrderCount: startOrders.length,
    completedStartOrderCount: completedStartOrders.length,
    completedStartOrders,
    pendingStartOrders,
  };
}

async function handlePlanner(
  req: NextRequest,
  options?: { allowGenerate?: boolean; requestedOrderCount?: number | null; forceGenerate?: boolean; phase?: RecoveryPhase }
) {
  const allowGenerate = options?.allowGenerate ?? false;
  const requestedOrderCount = normalizeRequestedOrderCount(options?.requestedOrderCount);
  const forceGenerate = options?.forceGenerate ?? false;
  const url = new URL(req.url);
  const langHint = toLanguage(url.searchParams.get("lang"));
  const phase = normalizeRecoveryPhase(options?.phase ?? url.searchParams.get("phase"));
  const cacheOnly = !allowGenerate || url.searchParams.get("cacheOnly") === "1";

  const userId = await safeReadUserId(req);
  if (!userId) return bad(401, "login_required");
  if (!(await safeHasCompletedServiceConsent(userId))) return bad(403, "consent_required");

  const subscription = await safeLoadSubscription(userId);
  if (!subscription?.entitlements?.recoveryPlannerAI) {
    return bad(402, "paid_plan_required_recovery_planner_ai");
  }
  const aiRecoveryModel = getAIRecoveryModelForTier(subscription.tier);

  try {
    const row = await safeLoadUserState(userId);
    if (!row?.payload) return bad(404, "state_not_found");

    const state = normalizePayloadToState(row.payload, null);
    const lang = (langHint ?? state.settings.language ?? "ko") as Language;
    const today = todayISO();
    const recordedDays = countHealthRecordedDays({ bio: state.bio, emotions: state.emotions });
    if (recordedDays < 3) return bad(403, "insights_locked_min_3_days");
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
    const todayVital = todayHasInput && phaseTodayVitalCandidate ? { ...phaseTodayVitalCandidate, shift: todayShift } : null;
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

    const aiContent = await safeLoadAIContent(userId);
    const cachedRecovery = aiContent && aiContent.dateISO === today ? readRecoveryPhasePayload(aiContent.data, today, lang, phase) : null;
    const cachedStartPlanner =
      aiContent && aiContent.dateISO === today ? readPlannerPhasePayload(aiContent.data, today, lang, "start") : null;
    const startCompletedIds =
      phase === "after_work" && cachedStartPlanner
        ? await (async () => {
            const { readRecoveryOrderCompletedIds } = await import("@/lib/server/recoveryOrderStore");
            return await readRecoveryOrderCompletedIds(userId, today);
          })()
        : [];
    const recoveryThread = phase === "after_work" ? buildRecoveryThread(cachedStartPlanner, startCompletedIds) : null;
    if (phase === "after_work" && !cachedStartPlanner && !cacheOnly) {
      return bad(409, "start_recovery_required_before_after_work");
    }
    if (!forceGenerate && aiContent && aiContent.dateISO === today) {
      const direct = readPlannerPhasePayload(aiContent.data, today, lang, phase);
      const directIsCurrent =
        direct &&
        direct.phase === phase &&
        isPlannerContextCurrent(direct.plannerContext, plannerContext) &&
        isProfileSnapshotCurrent(direct.profileSnapshot, profileSnapshot) &&
        (cacheOnly || isRequestedOrderCountCurrent(direct.requestedOrderCount, requestedOrderCount));

      if (directIsCurrent) {
        return jsonNoStore({ ok: true, data: direct } satisfies AIRecoveryPlannerApiSuccess);
      }
    }

    if (cacheOnly) {
      return jsonNoStore({ ok: true, data: null } satisfies AIRecoveryPlannerApiSuccess);
    }

    let plannerDebug: string | null = null;
    let explanationDebug: string | null = null;
    let plannerModel: string | null = null;
    let explanationResult: AIRecoveryPayload["result"];
    let explanationGeneratedText: string | undefined;
    let explanationModel: string | null = null;
    const cachedRecoveryIsCurrent =
      cachedRecovery &&
      cachedRecovery.engine === "openai" &&
      cachedRecovery.phase === phase &&
      isPlannerContextCurrent(cachedRecovery.plannerContext, plannerContext) &&
      isProfileSnapshotCurrent(cachedRecovery.profileSnapshot, profileSnapshot);

    if (cachedRecoveryIsCurrent) {
      explanationResult = cachedRecovery.result;
      explanationGeneratedText = cachedRecovery.generatedText;
      explanationModel = cachedRecovery.model;
      explanationDebug = cachedRecovery.debug ?? null;
    } else {
      const explanationAI = await generateAIRecoveryWithOpenAI({
        language: lang,
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
      explanationResult = explanationAI.result;
      explanationGeneratedText = explanationAI.generatedText;
      explanationModel = explanationAI.model;
    }

    let plannerModules: AIRecoveryPlannerModules;
    let plannerGeneratedText: string | undefined;
    const plannerAI = await generateAIRecoveryPlannerModulesWithOpenAI({
      language: lang,
      requestedOrderCount,
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
      recoveryResult: explanationResult,
    });
    plannerModules = plannerAI.result;
    plannerGeneratedText = plannerAI.generatedText;
    plannerModel = plannerAI.model;

    const todayVitalScore = todayVital ? Math.round(Math.min(todayVital.body.value, todayVital.mental.ema)) : null;
    const model = explanationModel ?? plannerModel ?? null;
    const explanationPayload: AIRecoveryPayload = {
      dateISO: today,
      language: lang,
      phase,
      todayShift,
      nextShift,
      todayVitalScore,
      source: "supabase",
      engine: "openai",
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
      phase,
      requestedOrderCount,
      todayShift,
      nextShift,
      todayVitalScore,
      source: "supabase",
      engine: "openai",
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

    const aiContentRecord = isRecord(aiContent?.data) ? (aiContent?.data as Record<string, unknown>) : {};
    const previousRecoveryPhaseVariants =
      isRecord(aiContentRecord.recoveryPhaseVariants) ? (aiContentRecord.recoveryPhaseVariants as Record<string, unknown>) : {};
    const previousPlannerPhaseVariants =
      isRecord(aiContentRecord.plannerPhaseVariants) ? (aiContentRecord.plannerPhaseVariants as Record<string, unknown>) : {};
    const previousRecoveryLangNode =
      isRecord(previousRecoveryPhaseVariants[lang]) ? (previousRecoveryPhaseVariants[lang] as Record<string, unknown>) : {};
    const previousPlannerLangNode =
      isRecord(previousPlannerPhaseVariants[lang]) ? (previousPlannerPhaseVariants[lang] as Record<string, unknown>) : {};
    const legacyRecoveryVariants =
      isRecord(aiContentRecord.variants) ? (aiContentRecord.variants as Record<string, unknown>) : {};
    const legacyPlannerVariants =
      isRecord(aiContentRecord.plannerVariants) ? (aiContentRecord.plannerVariants as Record<string, unknown>) : {};

    const saveError = await safeSaveAIContent(userId, today, lang, {
      dateISO: today,
      generatedAt: Date.now(),
      recoveryPhaseVariants: {
        ...previousRecoveryPhaseVariants,
        [lang]: {
          ...previousRecoveryLangNode,
          [phase]: explanationPayload,
        },
      },
      plannerPhaseVariants: {
        ...previousPlannerPhaseVariants,
        [lang]: {
          ...previousPlannerLangNode,
          [phase]: payload,
        },
      },
      ...(phase === "start"
        ? {
            variants: {
              ...legacyRecoveryVariants,
              [lang]: explanationPayload,
            },
            plannerVariants: {
              ...legacyPlannerVariants,
              [lang]: payload,
            },
          }
        : {}),
    } as Json);
    if (saveError) {
      payload.debug = payload.debug ? `${payload.debug}|${saveError}` : saveError;
    }

    return jsonNoStore({ ok: true, data: payload } satisfies AIRecoveryPlannerApiSuccess);
  } catch (err: any) {
    return bad(500, typeof err?.message === "string" && err.message.trim() ? err.message.trim() : "openai_generation_failed");
  }
}

export async function GET(req: NextRequest) {
  try {
    return await handlePlanner(req, { allowGenerate: false });
  } catch (err: any) {
    console.error("[Planner GET] unhandled", err?.message ?? err);
    return bad(500, "planner_unhandled_error");
  }
}

export async function POST(req: NextRequest) {
  try {
    const sameOriginError = sameOriginRequestError(req);
    if (sameOriginError) return bad(403, sameOriginError);
    let requestedOrderCount: number | null = null;
    let forceGenerate = false;
    let phase: RecoveryPhase | null = null;
    const rawBody = await req.text().catch(() => "");
    if (rawBody.trim()) {
      try {
        const body = JSON.parse(rawBody);
        requestedOrderCount = normalizeRequestedOrderCount((body as { orderCount?: unknown } | null)?.orderCount);
        forceGenerate = Boolean((body as { forceGenerate?: unknown } | null)?.forceGenerate);
        phase = normalizeRecoveryPhase((body as { phase?: unknown } | null)?.phase);
      } catch {
        return bad(400, "invalid_json");
      }
    }
    return await handlePlanner(req, { allowGenerate: true, requestedOrderCount, forceGenerate, phase: phase ?? undefined });
  } catch (err: any) {
    console.error("[Planner POST] unhandled", err?.message ?? err);
    return bad(500, "planner_unhandled_error");
  }
}
