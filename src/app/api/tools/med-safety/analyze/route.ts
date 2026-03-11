import { NextRequest } from "next/server";
import { todayISO, type ISODate } from "@/lib/date";
import type { Language } from "@/lib/i18n";
import { buildPrivateNoStoreHeaders, jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { analyzeMedSafetyWithOpenAI, translateMedSafetyToEnglish } from "@/lib/server/openaiMedSafety";
import {
  createMedSafetyContinuationToken,
  readMedSafetyContinuationToken,
} from "@/lib/server/medSafetyContinuation";
import type { Json } from "@/types/supabase";

export const runtime = "edge";
export const dynamic = "force-dynamic";
export const preferredRegion = ["iad1", "sfo1", "fra1"];

const MAX_QUERY_LENGTH = 2400;
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const MED_SAFETY_RECENT_LIMIT_FREE = 5;
const MED_SAFETY_RECENT_LIMIT_PRO = 10;
const DEFAULT_ANALYZE_TIMEOUT_MS = 420_000;
const MIN_ANALYZE_TIMEOUT_MS = 300_000;
const MAX_ANALYZE_TIMEOUT_MS = 900_000;
const DEFAULT_MED_SAFETY_HISTORY_RETENTION_DAYS = 30;
const MIN_MED_SAFETY_HISTORY_RETENTION_DAYS = 1;
const MAX_MED_SAFETY_HISTORY_RETENTION_DAYS = 90;

type RequestBody = {
  query?: unknown;
  continuationToken?: unknown;
  locale?: unknown;
  imageDataUrl?: unknown;
  stream?: unknown;
};

type MedSafetyResponseData = {
  answer: string;
  query: string;
  language: Language;
  model: string;
  analyzedAt: number;
  source: "openai_live" | "openai_fallback";
  fallbackReason: string | null;
  continuationToken: string | null;
  startedFreshSession: boolean;
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
  if (normalized.includes("openai_empty_text")) return "openai_empty_text";
  if (normalized.includes("translate_empty_source")) return "translate_empty_source";
  if (normalized.startsWith("en_direct")) return "en_direct";
  if (normalized.includes("save_med_safety_content_failed")) return "save_med_safety_content_failed";
  if (normalized.includes("save_med_safety_recent_failed")) return "save_med_safety_recent_failed";

  const statusMatch = normalized.match(/openai_responses_(\d{3})/);
  if (statusMatch) {
    const status = statusMatch[1];
    if (status === "400") {
      if (/(previous_response|conversation)/i.test(value)) return "openai_responses_400_continuation";
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

async function safeConsumeMedSafetyCredit(userId: string): Promise<{
  allowed: boolean;
  source: "daily" | "extra" | null;
  reason: string | null;
  quota: {
    totalRemaining: number;
    dailyRemaining: number;
    extraCredits: number;
    isPro: boolean;
  };
}> {
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!serviceRole || !supabaseUrl) throw new Error("missing_supabase_env");
  const { consumeMedSafetyCredit } = await import("@/lib/server/billingStore");
  return await consumeMedSafetyCredit({ userId });
}

async function safeRestoreConsumedMedSafetyCredit(userId: string, source: "daily" | "extra" | null): Promise<void> {
  if (!source) return;
  try {
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!serviceRole || !supabaseUrl) return;
    const { restoreConsumedMedSafetyCredit } = await import("@/lib/server/billingStore");
    await restoreConsumedMedSafetyCredit({ userId, source });
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
        continuationToken: typeof resultNode.continuationToken === "string" ? resultNode.continuationToken : null,
        startedFreshSession: resultNode.startedFreshSession === true,
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
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "en") return "en";
  return "ko";
}

function pickContinuationToken(raw: unknown) {
  const value = String(raw ?? "").trim();
  if (!value) return undefined;
  if (value.length < 24 || value.length > 8192) return undefined;
  return value;
}

function pickStreamMode(raw: unknown) {
  if (typeof raw === "boolean") return raw;
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
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
  analyzed: Awaited<ReturnType<typeof analyzeMedSafetyWithOpenAI>>;
}): MedSafetyResponseData {
  return {
    answer: params.analyzed.result.answer,
    query: params.analyzed.result.query,
    language: params.language,
    model: params.analyzed.model,
    analyzedAt: params.analyzedAt,
    source: params.analyzed.fallbackReason ? "openai_fallback" : "openai_live",
    fallbackReason: toPublicReason(params.analyzed.fallbackReason),
    continuationToken: null,
    startedFreshSession: false,
  };
}

function shouldCommitConsumedCredit(params: {
  analyzed: Awaited<ReturnType<typeof analyzeMedSafetyWithOpenAI>>;
  responseData: MedSafetyResponseData;
}) {
  const liveModelSucceeded = params.analyzed.fallbackReason == null;
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

    const bodyRaw = ((await req.json().catch(() => null)) ?? {}) as RequestBody;
    const locale = pickLocale(bodyRaw.locale);
    const streamMode = pickStreamMode(bodyRaw.stream);
    const continuationToken = pickContinuationToken(bodyRaw.continuationToken);
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

    const creditUse = await safeConsumeMedSafetyCredit(userId);
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
    const consumedSource = creditUse.source;

    const abort = new AbortController();
    const timeoutMs = resolveAnalyzeTimeoutMs();
    const timeout = setTimeout(() => abort.abort(), timeoutMs);
    const routeStartedAt = Date.now();
    const continuationState = await readMedSafetyContinuationToken({
      token: continuationToken,
      userId,
    });
    const previousResponseId = continuationState?.previousResponseId ?? undefined;
    const conversationId = continuationState?.conversationId ?? undefined;

    const runAnalyze = async (onTextDelta?: (delta: string) => void | Promise<void>) => {
      const analyzedAt = Date.now();
      const today = todayISO();

      const analyzedKo = await analyzeMedSafetyWithOpenAI({
        query,
        locale: "ko",
        imageDataUrl: imageDataUrl || undefined,
        previousResponseId,
        conversationId,
        onTextDelta,
        signal: abort.signal,
      });

      const payloadKo = buildResponseData({
        language: "ko",
        analyzedAt,
        analyzed: analyzedKo,
      });

      let payloadEn: MedSafetyResponseData | null = null;
      const translateController = new AbortController();
      const relayAbort = () => translateController.abort();
      const translateTimeoutMs = locale === "en" ? 18_000 : 7_000;
      const translateTimer = setTimeout(() => translateController.abort(), translateTimeoutMs);
      abort.signal.addEventListener("abort", relayAbort);
      try {
        const translated = await translateMedSafetyToEnglish({
          answer: analyzedKo.result.answer,
          rawText: analyzedKo.rawText,
          model: analyzedKo.model,
          signal: translateController.signal,
        });
        payloadEn = {
          ...payloadKo,
          answer: translated.result.answer,
          language: "en",
          model: translated.model ?? payloadKo.model,
          fallbackReason: mergePublicReasons(payloadKo.fallbackReason, translated.debug),
        };
      } catch {
        if (locale === "en") {
          const elapsed = Date.now() - routeStartedAt;
          const remainingMs = timeoutMs - elapsed;
          if (remainingMs > 10_000) {
            try {
              const analyzedEn = await analyzeMedSafetyWithOpenAI({
                query,
                locale: "en",
                imageDataUrl: imageDataUrl || undefined,
                previousResponseId,
                conversationId,
                signal: abort.signal,
              });
              payloadEn = buildResponseData({
                language: "en",
                analyzedAt,
                analyzed: analyzedEn,
              });
              payloadEn.fallbackReason = mergePublicReasons("en_direct", payloadEn.fallbackReason);
            } catch {
              payloadEn = null;
            }
          }
        }
      } finally {
        clearTimeout(translateTimer);
        abort.signal.removeEventListener("abort", relayAbort);
      }

      const nextContinuationToken = await createMedSafetyContinuationToken({
        userId,
        responseId: analyzedKo.openaiResponseId,
        conversationId: analyzedKo.openaiConversationId,
      });
      payloadKo.continuationToken = nextContinuationToken;
      payloadKo.startedFreshSession = false;
      if (payloadEn) {
        payloadEn.continuationToken = nextContinuationToken;
        payloadEn.startedFreshSession = false;
      }

      const storedPayloadKo: MedSafetyResponseData = {
        ...payloadKo,
        continuationToken: null,
      };
      const storedPayloadEn: MedSafetyResponseData | null = payloadEn
        ? {
            ...payloadEn,
            continuationToken: null,
          }
        : null;

      const saveError = await safeSaveMedSafetyContent(userId, today, "ko", {
        medSafetySearch: {
          dateISO: today,
          savedAt: analyzedAt,
          request: {
            query,
          },
          variants: {
            ko: storedPayloadKo,
            ...(storedPayloadEn ? { en: storedPayloadEn } : {}),
          },
        },
      } satisfies Json);

      if (saveError) {
        payloadKo.fallbackReason = mergePublicReasons(payloadKo.fallbackReason, saveError);
        if (payloadEn) {
          payloadEn.fallbackReason = mergePublicReasons(payloadEn.fallbackReason, saveError);
        }
      }

      const responseData = locale === "en" ? payloadEn ?? payloadKo : payloadKo;
      const shouldCommitCredit = shouldCommitConsumedCredit({
        analyzed: analyzedKo,
        responseData: payloadKo,
      }) && !abort.signal.aborted;
      if (shouldCommitCredit) {
        const recentLimit = creditUse.quota.isPro ? MED_SAFETY_RECENT_LIMIT_PRO : MED_SAFETY_RECENT_LIMIT_FREE;
        const recentSaveError = await safeAppendMedSafetyRecent({
          userId,
          dateISO: today,
          language: locale,
          query,
          result: {
            ...responseData,
            continuationToken: null,
          },
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
          await safeRestoreConsumedMedSafetyCredit(userId, consumedSource);
        }
        return jsonNoStore({
          ok: true,
          ...responseData,
        });
      } catch (error: any) {
        await safeRestoreConsumedMedSafetyCredit(userId, consumedSource);
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const pushEvent = (event: string, payload: unknown) => {
          try {
            controller.enqueue(encoder.encode(sseLine(event, payload)));
          } catch {
            // ignore enqueue failure after close/cancel
          }
        };

        pushEvent("start", { ok: true });
        try {
          const { responseData, shouldCommitCredit } = await runAnalyze(async (delta) => {
            const chunk = String(delta ?? "");
            if (!chunk) return;
            pushEvent("delta", { text: chunk });
          });
          if (!shouldCommitCredit) {
            await safeRestoreConsumedMedSafetyCredit(userId, consumedSource);
          }
          pushEvent("result", {
            ok: true,
            ...responseData,
          });
        } catch (error: any) {
          await safeRestoreConsumedMedSafetyCredit(userId, consumedSource);
          pushEvent("error", {
            ok: false,
            error: safeErrorString(error?.message ?? error ?? "med_safety_analyze_failed"),
          });
        } finally {
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
        Connection: "keep-alive",
      }),
    });
  } catch {
    return bad(500, "med_safety_analyze_failed");
  }
}
