import { NextRequest } from "next/server";
import { todayISO, type ISODate } from "@/lib/date";
import type { Language } from "@/lib/i18n";
import { getDefaultSearchTypeForTier, getPlanDefinition, type SearchCreditType } from "@/lib/billing/plans";
import { buildPrivateNoStoreHeaders, jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { analyzeMedSafetyStructuredWithOpenAI, isMedSafetyIdentityQuestion } from "@/lib/server/openaiMedSafetyStructured";
import { mergeMedSafetySources, type MedSafetyGroundingMode, type MedSafetyGroundingStatus, type MedSafetySource } from "@/lib/medSafetySources";
import type {
  MedSafetyQualitySnapshot,
  MedSafetyStructuredAnswer,
  MedSafetyVerificationReport,
} from "@/lib/medSafetyStructured";
import type { Json } from "@/types/supabase";

export const runtime = "edge";
export const dynamic = "force-dynamic";
export const preferredRegion = ["iad1", "sfo1", "fra1"];

const MAX_QUERY_LENGTH = 2400;
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const MED_SAFETY_RECENT_LIMIT_FREE = 5;
const MED_SAFETY_RECENT_LIMIT_PRO = 20;
const DEFAULT_ANALYZE_TIMEOUT_MS = 420_000;
const MIN_ANALYZE_TIMEOUT_MS = 300_000;
const MAX_ANALYZE_TIMEOUT_MS = 900_000;
const DEFAULT_MED_SAFETY_HISTORY_RETENTION_DAYS = 30;
const MIN_MED_SAFETY_HISTORY_RETENTION_DAYS = 1;
const MAX_MED_SAFETY_HISTORY_RETENTION_DAYS = 90;

type RequestBody = {
  query?: unknown;
  locale?: unknown;
  imageDataUrl?: unknown;
  stream?: unknown;
  searchType?: unknown;
  continuationMemory?: unknown;
};

type MedSafetyResponseData = {
  answer: string;
  query: string;
  language: Language;
  model: string;
  analyzedAt: number;
  source: "openai_live" | "openai_fallback";
  fallbackReason: string | null;
  searchType: SearchCreditType;
  creditBucket: "included" | "extra" | null;
  result: {
    schema_version: string;
    answer: MedSafetyStructuredAnswer | null;
    sources: MedSafetySource[];
    quality: MedSafetyQualitySnapshot;
    verification: MedSafetyVerificationReport | null;
  };
  sources: MedSafetySource[];
  groundingMode: MedSafetyGroundingMode;
  groundingStatus: MedSafetyGroundingStatus;
  groundingError: string | null;
};

type MedSafetyRecentRecord = {
  id: string;
  savedAt: number;
  language: Language;
  request: {
    query: string;
  };
  result: MedSafetyResponseData;
};

const EXACT_PUBLIC_ERRORS = new Set([
  "invalid_origin",
  "missing_origin",
  "invalid_referer_origin",
  "invalid_referer",
  "login_required",
  "missing_supabase_env",
  "missing_openai_api_key",
  "query_required",
  "sensitive_query_blocked",
  "image_too_large_max_6mb",
  "insufficient_med_safety_credits",
  "med_safety_analyze_failed",
]);

function normalizePublicReasonToken(raw: unknown): string | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  if (EXACT_PUBLIC_ERRORS.has(value)) return value;

  const normalized = value.toLowerCase();
  if (normalized.startsWith("openai_network_")) return "openai_network";
  if (normalized.includes("openai_timeout_total_budget") || normalized.includes("translate_timeout_total_budget")) {
    return "openai_timeout_total_budget";
  }
  if (normalized.includes("openai_timeout_upstream")) return "openai_timeout_upstream";
  if (normalized.includes("openai_timeout_retry_aborted")) return "openai_timeout_retry_aborted";
  if (normalized.includes("openai_stream_parse_failed")) return "openai_stream_parse_failed";
  if (normalized.includes("structured_json_parse_failed") && normalized.includes("max_output_tokens")) {
    return "structured_json_parse_failed:max_output_tokens";
  }
  if (normalized.includes("structured_json_parse_failed")) return "structured_json_parse_failed";
  if (normalized.includes("openai_incomplete_status") && normalized.includes("max_output_tokens")) {
    return "openai_incomplete_status:max_output_tokens";
  }
  if (normalized.includes("openai_empty_text")) return "openai_empty_text";
  if (normalized.includes("translate_empty_source")) return "translate_empty_source";
  if (normalized.startsWith("en_direct")) return "en_direct";
  if (normalized.includes("save_med_safety_content_failed")) return "save_med_safety_content_failed";
  if (normalized.includes("save_med_safety_recent_failed")) return "save_med_safety_recent_failed";

  const statusMatch = normalized.match(/openai_responses_(\d{3})/);
  if (statusMatch) {
    const status = statusMatch[1];
    if (status === "400") {
      if (/(max_output|max output|token limit|too many tokens|context length|incomplete_details|max_output_tokens)/i.test(value)) {
        return "openai_responses_400_token_limit";
      }
      return "openai_responses_400";
    }
    if (status === "403" && /(insufficient_permissions|does not have access|model_not_found|permission|access to model)/i.test(value)) {
      return "openai_responses_403_model_access";
    }
    return `openai_responses_${status}`;
  }

  return null;
}

function splitReasonTokens(raw: unknown) {
  return String(raw ?? "")
    .split("|")
    .map((token) => token.trim())
    .filter(Boolean);
}

function toPublicReason(raw: unknown): string | null {
  const tokens = splitReasonTokens(raw);
  if (!tokens.length) return null;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const token of tokens) {
    const normalized = normalizePublicReasonToken(token);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out.length ? out.join("|") : null;
}

function mergePublicReasons(...values: Array<string | null | undefined>) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const publicReason = toPublicReason(value);
    if (!publicReason) continue;
    for (const token of publicReason.split("|")) {
      if (!token || seen.has(token)) continue;
      seen.add(token);
      out.push(token);
    }
  }
  return out.length ? out.join("|") : null;
}

function safeErrorString(error: unknown) {
  const value = String(error ?? "").trim();
  if (!value) return "unknown_error";
  if (EXACT_PUBLIC_ERRORS.has(value)) return value;
  return toPublicReason(value) ?? "unknown_error";
}

function bad(status: number, error: string) {
  return jsonNoStore(
    {
      ok: false,
      error: safeErrorString(error),
    },
    { status }
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

async function safeConsumeMedSafetyCredit(userId: string, searchType: SearchCreditType) {
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceRole || !supabaseUrl) throw new Error("missing_supabase_env");
  const { consumeMedSafetyCredit } = await import("@/lib/server/billingStore");
  return await consumeMedSafetyCredit({ userId, searchType });
}

async function safeReadSubscription(userId: string) {
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

async function safeRestoreConsumedMedSafetyCredit(
  userId: string,
  searchType: SearchCreditType,
  bucket: "included" | "extra" | null
): Promise<void> {
  if (!bucket) return;
  try {
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!serviceRole || !supabaseUrl) return;
    const { restoreConsumedMedSafetyCredit } = await import("@/lib/server/billingStore");
    await restoreConsumedMedSafetyCredit({ userId, searchType, bucket });
  } catch {
    // ignore restore failure
  }
}

async function safeLoadAIContent(userId: string): Promise<{ data: Json } | null> {
  try {
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!serviceRole || !supabaseUrl) return null;
    const { loadAIContent } = await import("@/lib/server/aiContentStore");
    const row = await loadAIContent(userId);
    if (!row) return null;
    return { data: row.data };
  } catch {
    return null;
  }
}

async function safeSaveMedSafetyContent(
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
    await saveAIContent({
      userId,
      dateISO,
      language,
      data: merged as Json,
    });
    return null;
  } catch {
    return "save_med_safety_content_failed";
  }
}

async function safeAppendMedSafetySearchResult(params: {
  userId: string;
  language: Language;
  searchType: SearchCreditType;
  analyzed: Awaited<ReturnType<typeof analyzeMedSafetyStructuredWithOpenAI>>;
}): Promise<string | null> {
  try {
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!serviceRole || !supabaseUrl) return "missing_supabase_env";
    const { appendMedSafetySearchResult } = await import("@/lib/server/medSafetySearchResultStore");
    await appendMedSafetySearchResult({
      userId: params.userId,
      query: params.analyzed.query,
      searchType: params.searchType,
      language: params.language,
      model: params.analyzed.model,
      routeDecision: params.analyzed.routeDecision as unknown as Json,
      groundingSummary: ({
        mode: params.analyzed.groundingMode,
        status: params.analyzed.groundingStatus,
        error: params.analyzed.groundingError,
        sources: params.analyzed.sources,
        retrievalNote: params.analyzed.debug?.retrievalNote ?? null,
      } satisfies Json) as Json,
      answerSchema: params.analyzed.answer as unknown as Json,
      quality: params.analyzed.quality as unknown as Json,
      verifierFlags: params.analyzed.verification
        ? ({
            ran: params.analyzed.verification.ran,
            passed: params.analyzed.verification.passed,
            issues: params.analyzed.verification.issues,
            notes: params.analyzed.verification.notes,
          } satisfies Json)
        : null,
      latencyMs: params.analyzed.latencyMs,
      tokenUsage: params.analyzed.usage as unknown as Json,
    });
    return null;
  } catch {
    return "save_med_safety_result_failed";
  }
}

function normalizeRecentRecords(value: unknown, limit = MED_SAFETY_RECENT_LIMIT_PRO) {
  const normalizedLimit = Math.max(MED_SAFETY_RECENT_LIMIT_FREE, Math.min(MED_SAFETY_RECENT_LIMIT_PRO, Math.round(limit)));
  const retentionDaysRaw = Number(process.env.MED_SAFETY_HISTORY_RETENTION_DAYS ?? DEFAULT_MED_SAFETY_HISTORY_RETENTION_DAYS);
  const retentionDays = Number.isFinite(retentionDaysRaw)
    ? Math.max(MIN_MED_SAFETY_HISTORY_RETENTION_DAYS, Math.min(MAX_MED_SAFETY_HISTORY_RETENTION_DAYS, Math.round(retentionDaysRaw)))
    : DEFAULT_MED_SAFETY_HISTORY_RETENTION_DAYS;
  const retentionMs = retentionDays * 24 * 60 * 60 * 1000;
  const now = Date.now();
  if (!Array.isArray(value)) return [] as MedSafetyRecentRecord[];
  const out: MedSafetyRecentRecord[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const id = String(item.id ?? "").trim();
    if (!id) continue;
    const savedAtRaw = Number(item.savedAt);
    const savedAt = Number.isFinite(savedAtRaw) && savedAtRaw > 0 ? savedAtRaw : Date.now();
    if (savedAt < now - retentionMs) continue;
    const language = String(item.language ?? "ko").toLowerCase() === "en" ? "en" : "ko";
    const requestNode = isRecord(item.request) ? item.request : {};
    const resultNode = isRecord(item.result) ? item.result : null;
    if (!resultNode) continue;
    const answer = String(resultNode.answer ?? resultNode.searchAnswer ?? resultNode.generatedText ?? "").trim();
    if (!answer) continue;
    out.push({
      id,
      savedAt,
      language,
      request: {
        query: String(requestNode.query ?? "").trim(),
      },
      result: {
        answer,
        query: String(resultNode.query ?? requestNode.query ?? "").trim(),
        language,
        model: String(resultNode.model ?? "").trim(),
        analyzedAt: Number.isFinite(Number(resultNode.analyzedAt)) ? Number(resultNode.analyzedAt) : savedAt,
        source: String(resultNode.source ?? "") === "openai_fallback" ? "openai_fallback" : "openai_live",
        fallbackReason: toPublicReason(resultNode.fallbackReason),
        searchType: resultNode.searchType === "premium" ? "premium" : "standard",
        creditBucket: resultNode.creditBucket === "included" || resultNode.creditBucket === "extra" ? resultNode.creditBucket : null,
        result: isRecord(resultNode.result)
          ? {
              schema_version: String(resultNode.result.schema_version ?? "med_safety_answer_v2"),
              answer: isRecord(resultNode.result.answer) ? (resultNode.result.answer as MedSafetyStructuredAnswer) : null,
              sources: mergeMedSafetySources(Array.isArray(resultNode.result.sources) ? (resultNode.result.sources as MedSafetySource[]) : []),
              quality: (resultNode.result.quality ?? {}) as MedSafetyQualitySnapshot,
              verification: (resultNode.result.verification ?? null) as MedSafetyVerificationReport | null,
            }
          : {
              schema_version: "med_safety_answer_v2",
              answer: {
                schema_version: "med_safety_answer_v2",
                question_type: "general",
                triage_level: "routine",
                bottom_line: answer,
                bottom_line_citation_ids: [],
                key_points: [],
                recommended_actions: [],
                do_not_do: [],
                when_to_escalate: [],
                patient_specific_caveats: [],
                uncertainty: {
                  summary: "",
                  needs_verification: false,
                  reasons: [],
                },
                freshness: {
                  retrieved_at: null,
                  newest_effective_date: null,
                  note: "",
                  verification_status: "unknown",
                },
                citations: [],
                comparison_table: [],
              },
              sources: mergeMedSafetySources(Array.isArray(resultNode.sources) ? (resultNode.sources as MedSafetySource[]) : []),
              quality: {
                verification_run: false,
                verification_passed: true,
                official_citation_rate: 0,
                unsupported_claim_count: 0,
                supported_claim_count: 0,
                total_claim_count: 0,
                grounded: false,
                high_risk: false,
              },
              verification: null,
            },
        sources: mergeMedSafetySources(Array.isArray(resultNode.sources) ? (resultNode.sources as MedSafetySource[]) : []),
        groundingMode:
          resultNode.groundingMode === "premium_web" || resultNode.groundingMode === "official_search"
            ? (resultNode.groundingMode as MedSafetyGroundingMode)
            : "none",
        groundingStatus:
          resultNode.groundingStatus === "ok" || resultNode.groundingStatus === "failed" ? resultNode.groundingStatus : "none",
        groundingError: resultNode.groundingError == null ? null : String(resultNode.groundingError),
      },
    });
  }
  return out.sort((a, b) => b.savedAt - a.savedAt).slice(0, normalizedLimit);
}

async function safeAppendMedSafetyRecent(params: {
  userId: string;
  dateISO: ISODate;
  language: Language;
  query: string;
  result: MedSafetyResponseData;
  recentLimit: number;
}) {
  try {
    const existing = await safeLoadAIContent(params.userId);
    const previous = isRecord(existing?.data) ? existing.data : {};
    const normalizedLimit = Math.max(
      MED_SAFETY_RECENT_LIMIT_FREE,
      Math.min(MED_SAFETY_RECENT_LIMIT_PRO, Math.round(params.recentLimit))
    );
    const prevRecent = normalizeRecentRecords(previous.medSafetyRecent, MED_SAFETY_RECENT_LIMIT_PRO);
    const nextRecord: MedSafetyRecentRecord = {
      id: `msr_${Date.now().toString(36)}_${Array.from(crypto.getRandomValues(new Uint8Array(4))).map((b) => b.toString(16).padStart(2, "0")).join("")}`,
      savedAt: Date.now(),
      language: params.language,
      request: {
        query: params.query,
      },
      result: params.result,
    };
    const deduped = [
      nextRecord,
      ...prevRecent.filter((record) => {
        if (record.request.query !== nextRecord.request.query) return true;
        return Math.abs(record.savedAt - nextRecord.savedAt) > 10_000;
      }),
    ].slice(0, normalizedLimit);

    return await safeSaveMedSafetyContent(params.userId, params.dateISO, params.language, {
      medSafetyRecent: deduped,
    } satisfies Json);
  } catch {
    return "save_med_safety_recent_failed";
  }
}

function pickLocale(raw: unknown): "ko" | "en" {
  return "ko";
}

function pickStreamMode(raw: unknown) {
  if (typeof raw === "boolean") return raw;
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function pickSearchType(raw: unknown, fallback: SearchCreditType): SearchCreditType {
  if (raw === "premium") return "premium";
  if (raw === "standard") return "standard";
  return fallback;
}

function pickContinuationMemory(raw: unknown) {
  const value = String(raw ?? "")
    .replace(/\u0000/g, "")
    .trim();
  if (!value) return undefined;
  return value.slice(0, 2400);
}

function estimateBase64Bytes(dataUrl: string) {
  const base64 = dataUrl.split(",", 2)[1] ?? "";
  if (!base64) return 0;
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

function pickImageDataUrl(raw: unknown) {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  if (!/^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\s]+$/i.test(value)) return "";
  return value.replace(/\s+/g, "");
}

function containsSensitivePattern(query: string) {
  const normalized = String(query ?? "").trim();
  if (!normalized) return false;
  if (/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(normalized)) return true;
  if (/(?:\+?82[-\s]?)?0?1[0-9][-\s]?\d{3,4}[-\s]?\d{4}\b/.test(normalized)) return true;
  if (/\b\d{6}[-\s]?[1-4]\d{6}\b/.test(normalized)) return true;
  return false;
}

function resolveAnalyzeTimeoutMs() {
  const raw = Number(process.env.OPENAI_MED_SAFETY_TIMEOUT_MS ?? process.env.OPENAI_TIMEOUT_MS ?? DEFAULT_ANALYZE_TIMEOUT_MS);
  if (!Number.isFinite(raw)) return DEFAULT_ANALYZE_TIMEOUT_MS;
  const analyzeBudgetRaw = Number(process.env.OPENAI_MED_SAFETY_TOTAL_BUDGET_MS ?? "");
  const effectiveAnalyzeBudget =
    Number.isFinite(analyzeBudgetRaw) && analyzeBudgetRaw > 0
      ? Math.max(300_000, Math.min(900_000, Math.round(analyzeBudgetRaw)))
      : 420_000;
  const recommendedFloor = Math.min(MAX_ANALYZE_TIMEOUT_MS, effectiveAnalyzeBudget + 120_000);
  const rounded = Math.round(raw);
  return Math.max(Math.max(MIN_ANALYZE_TIMEOUT_MS, recommendedFloor), Math.min(MAX_ANALYZE_TIMEOUT_MS, rounded));
}

function buildResponseData(params: {
  language: Language;
  analyzedAt: number;
  analyzed: Awaited<ReturnType<typeof analyzeMedSafetyStructuredWithOpenAI>>;
  searchType: SearchCreditType;
  creditBucket: "included" | "extra" | null;
}): MedSafetyResponseData {
  return {
    answer: params.analyzed.answerText,
    query: params.analyzed.query,
    language: params.language,
    model: params.analyzed.model,
    analyzedAt: params.analyzedAt,
    source: params.analyzed.fallbackReason && !params.analyzed.quality.grounded ? "openai_fallback" : "openai_live",
    fallbackReason: toPublicReason(params.analyzed.fallbackReason),
    searchType: params.searchType,
    creditBucket: params.creditBucket,
    result: {
      schema_version: params.analyzed.answer.schema_version,
      answer: null,
      sources: params.analyzed.sources,
      quality: params.analyzed.quality,
      verification: params.analyzed.verification,
    },
    sources: params.analyzed.sources,
    groundingMode: params.analyzed.groundingMode,
    groundingStatus: params.analyzed.groundingStatus,
    groundingError: params.analyzed.groundingError ? toPublicReason(params.analyzed.groundingError) ?? params.analyzed.groundingError : null,
  };
}

function shouldCommitConsumedCredit(params: {
  analyzed: Awaited<ReturnType<typeof analyzeMedSafetyStructuredWithOpenAI>>;
  responseData: MedSafetyResponseData;
}) {
  const liveModelSucceeded = params.responseData.source === "openai_live";
  const hasContent = String(params.responseData.answer ?? "").trim().length > 0;
  return liveModelSucceeded && hasContent;
}

function sseLine(event: string, payload: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

export async function POST(req: NextRequest) {
  try {
    const sameOriginError = sameOriginRequestError(req);
    if (sameOriginError) return bad(403, sameOriginError);

    const userId = await safeReadUserId(req);
    if (!userId) return bad(401, "login_required");
    if (!(await safeHasCompletedServiceConsent(userId))) return bad(403, "consent_required");

    const bodyRaw = ((await req.json().catch(() => null)) ?? {}) as RequestBody;
    const locale = pickLocale(bodyRaw.locale);
    const streamMode = pickStreamMode(bodyRaw.stream);
    const continuationMemory = pickContinuationMemory(bodyRaw.continuationMemory);
    const query = String(bodyRaw.query ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, MAX_QUERY_LENGTH);
    const imageDataUrl = pickImageDataUrl(bodyRaw.imageDataUrl);

    if (!query) {
      return bad(400, "query_required");
    }
    if (containsSensitivePattern(query)) {
      return bad(400, "sensitive_query_blocked");
    }
    if (imageDataUrl && estimateBase64Bytes(imageDataUrl) > MAX_IMAGE_BYTES) {
      return bad(413, "image_too_large_max_6mb");
    }

    const subscription = await safeReadSubscription(userId);
    const searchType = pickSearchType(bodyRaw.searchType, getDefaultSearchTypeForTier(subscription?.tier ?? "free"));
    const skipCreditConsume = !imageDataUrl && isMedSafetyIdentityQuestion(query);
    let consumedBucket: "included" | "extra" | null = null;
    if (!skipCreditConsume) {
      try {
        const creditUse = await safeConsumeMedSafetyCredit(userId, searchType);
        if (!creditUse.allowed) {
          return jsonNoStore(
            {
              ok: false,
              error: safeErrorString(creditUse.reason ?? "insufficient_med_safety_credits"),
              quota: creditUse.quota,
            },
            { status: 402 }
          );
        }
        consumedBucket = creditUse.bucket;
      } catch (error) {
        try {
          console.error("[MedSafetyAnalyze] credit_consume_failed_allowing_request", {
            userId: userId.slice(0, 8),
            error: error instanceof Error ? error.message : String(error),
          });
        } catch {
          // ignore logging failure
        }
        consumedBucket = null;
      }
    }

    const abort = new AbortController();
    const timeoutMs = resolveAnalyzeTimeoutMs();
    const timeout = setTimeout(() => abort.abort(), timeoutMs);
    const runAnalyze = async (
      onStage?: (stage: "routing" | "retrieving" | "generating" | "verifying", payload?: Record<string, unknown>) => void | Promise<void>,
      onPreviewDelta?: (delta: string) => void | Promise<void>,
    ) => {
      const analyzedAt = Date.now();
      const today = todayISO();
      const analyzed = await analyzeMedSafetyStructuredWithOpenAI({
        query,
        locale,
        searchType,
        imageDataUrl: imageDataUrl || undefined,
        continuationMemory,
        onStage,
        onPreviewDelta,
        signal: abort.signal,
      });

      const responseData = buildResponseData({
        language: locale,
        analyzedAt,
        analyzed,
        searchType,
        creditBucket: consumedBucket,
      });

      const saveError = await safeSaveMedSafetyContent(userId, today, "ko", {
        medSafetySearch: {
          dateISO: today,
          savedAt: analyzedAt,
          request: {
            query,
          },
          variants: {
            [locale]: {
              ...responseData,
            },
          },
        },
      } satisfies Json);

      if (saveError) {
        responseData.fallbackReason = mergePublicReasons(responseData.fallbackReason, saveError);
      }

      const resultSaveError = await safeAppendMedSafetySearchResult({
        userId,
        language: locale,
        searchType,
        analyzed,
      });
      if (resultSaveError) {
        responseData.fallbackReason = mergePublicReasons(responseData.fallbackReason, resultSaveError);
      }

      const shouldCommitCredit = shouldCommitConsumedCredit({
        analyzed,
        responseData,
      }) && !abort.signal.aborted;
      if (shouldCommitCredit) {
        const recentLimit =
          subscription?.hasPaidAccess && subscription.tier !== "free"
            ? getPlanDefinition(subscription.tier).medSafetyHistoryLimit
            : getPlanDefinition("free").medSafetyHistoryLimit;
        const recentSaveError = await safeAppendMedSafetyRecent({
          userId,
          dateISO: today,
          language: locale,
          query,
          result: responseData,
          recentLimit,
        });
        if (recentSaveError) {
          responseData.fallbackReason = mergePublicReasons(responseData.fallbackReason, recentSaveError);
        }
      }

      return { responseData, shouldCommitCredit };
    };

    if (!streamMode) {
      try {
        const { responseData, shouldCommitCredit } = await runAnalyze();
        if (!shouldCommitCredit) {
          await safeRestoreConsumedMedSafetyCredit(userId, searchType, consumedBucket);
        }
        return jsonNoStore({
          ok: true,
          result: responseData,
        });
      } catch (error: any) {
        await safeRestoreConsumedMedSafetyCredit(userId, searchType, consumedBucket);
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let currentStage: "routing" | "retrieving" | "generating" | "verifying" = "routing";
        let pendingPreviewDelta = "";
        let previewFlushTimer: ReturnType<typeof setTimeout> | null = null;
        const heartbeat = setInterval(() => {
          try {
            controller.enqueue(
              encoder.encode(
                sseLine("ping", {
                  stage: currentStage,
                  at: Date.now(),
                })
              )
            );
          } catch {
            // ignore heartbeat enqueue failure after close/cancel
          }
        }, 10_000);

        const pushEvent = (event: string, payload: unknown) => {
          try {
            controller.enqueue(encoder.encode(sseLine(event, payload)));
          } catch {
            // ignore enqueue failure after close/cancel
          }
        };
        const flushPreviewDelta = () => {
          if (!pendingPreviewDelta) return;
          pushEvent("delta", {
            delta: pendingPreviewDelta,
          });
          pendingPreviewDelta = "";
        };
        const schedulePreviewFlush = () => {
          if (previewFlushTimer) return;
          previewFlushTimer = setTimeout(() => {
            previewFlushTimer = null;
            flushPreviewDelta();
          }, 24);
        };

        pushEvent("status", { stage: "routing" });
        try {
          const { responseData, shouldCommitCredit } = await runAnalyze(
            async (stage, payload) => {
              currentStage = stage;
              pushEvent("status", {
                stage,
                ...(payload ?? {}),
              });
            },
            async (delta) => {
              if (!delta) return;
              pendingPreviewDelta += delta;
              if (pendingPreviewDelta.length >= 96) {
                if (previewFlushTimer) {
                  clearTimeout(previewFlushTimer);
                  previewFlushTimer = null;
                }
                flushPreviewDelta();
                return;
              }
              schedulePreviewFlush();
            }
          );
          if (previewFlushTimer) {
            clearTimeout(previewFlushTimer);
            previewFlushTimer = null;
          }
          flushPreviewDelta();
          if (!shouldCommitCredit) {
            await safeRestoreConsumedMedSafetyCredit(userId, searchType, consumedBucket);
          }
          if (responseData.groundingError) {
            pushEvent("warning", {
              code: responseData.groundingError,
              message: responseData.groundingError,
            });
          }
          pushEvent("result", {
            ok: true,
            result: responseData,
          });
        } catch (error: any) {
          if (previewFlushTimer) {
            clearTimeout(previewFlushTimer);
            previewFlushTimer = null;
          }
          flushPreviewDelta();
          try {
            console.error("[MedSafetyAnalyze] stream_failed", {
              userId: userId.slice(0, 8),
              stage: currentStage,
              searchType,
              message: String(error?.message ?? error ?? "med_safety_analyze_failed"),
            });
          } catch {
            // ignore logging failure
          }
          await safeRestoreConsumedMedSafetyCredit(userId, searchType, consumedBucket);
          pushEvent("error", {
            ok: false,
            error: safeErrorString(error?.message ?? error ?? "med_safety_analyze_failed"),
          });
        } finally {
          clearInterval(heartbeat);
          if (previewFlushTimer) {
            clearTimeout(previewFlushTimer);
            previewFlushTimer = null;
          }
          clearTimeout(timeout);
          try {
            controller.close();
          } catch {
            // ignore close failure
          }
        }
      },
      cancel() {
        abort.abort();
        clearTimeout(timeout);
      },
    });

    return new Response(stream, {
      headers: buildPrivateNoStoreHeaders({
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "private, no-store, no-cache, no-transform, max-age=0",
        "X-Accel-Buffering": "no",
      }),
    });
  } catch (error) {
    try {
      console.error("[MedSafetyAnalyze] route_failed", {
        message: String((error as Error)?.message ?? error ?? "med_safety_analyze_failed"),
      });
    } catch {
      // ignore logging failure
    }
    return bad(500, "med_safety_analyze_failed");
  }
}
