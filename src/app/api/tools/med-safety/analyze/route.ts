import { NextRequest, NextResponse } from "next/server";
import { todayISO, type ISODate } from "@/lib/date";
import type { Language } from "@/lib/i18n";
import {
  analyzeMedSafetyWithOpenAI,
  translateMedSafetyToEnglish,
  type ClinicalMode,
  type ClinicalSituation,
  type MedSafetyAnalysisResult,
  type QueryIntent,
} from "@/lib/server/openaiMedSafety";
import type { Json } from "@/types/supabase";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const MAX_QUERY_LENGTH = 1800;
const MAX_PATIENT_SUMMARY_LENGTH = 1400;
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const DEFAULT_ANALYZE_TIMEOUT_MS = 420_000;
const MIN_ANALYZE_TIMEOUT_MS = 300_000;
const MAX_ANALYZE_TIMEOUT_MS = 900_000;

function safeErrorString(error: unknown) {
  const safeError = String(error ?? "unknown_error")
    .replace(/\s+/g, " ")
    .replace(/[^\x20-\x7E가-힣ㄱ-ㅎㅏ-ㅣ.,:;!?()[\]{}'"`~@#$%^&*_\-+=/\\|<>]/g, "")
    .slice(0, 260);
  return safeError || "unknown_error";
}

function bad(status: number, error: string) {
  return NextResponse.json(
    {
      ok: false,
      error: safeErrorString(error),
    },
    { status }
  );
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

async function safeReadSubscription(userId: string): Promise<{ hasPaidAccess: boolean } | null> {
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

type MedSafetyResponseData = MedSafetyAnalysisResult & {
  generatedText: string;
  language: Language;
  model: string;
  analyzedAt: number;
  source: "openai_live" | "openai_fallback";
  fallbackReason: string | null;
  openaiResponseId: string | null;
  openaiConversationId: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

function pickLocale(raw: FormDataEntryValue | null): "ko" | "en" {
  const value = String(raw ?? "").trim().toLowerCase();
  if (value === "en") return "en";
  return "ko";
}

function pickMode(raw: FormDataEntryValue | null): ClinicalMode {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (value === "er") return "er";
  if (value === "icu") return "icu";
  return "ward";
}

function pickSituation(raw: FormDataEntryValue | null): ClinicalSituation {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (value === "general") return "general";
  if (value === "pre_admin") return "pre_admin";
  if (value === "during_admin") return "during_admin";
  if (value === "event_response") return "event_response";
  // legacy aliases from previous UI
  if (value === "alarm" || value === "adverse_suspect") return "event_response";
  return "general";
}

function pickQueryIntent(raw: FormDataEntryValue | null): QueryIntent | undefined {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (value === "medication") return "medication";
  if (value === "device") return "device";
  if (value === "scenario") return "scenario";
  return undefined;
}

function pickOpenAIStateId(raw: FormDataEntryValue | null) {
  const value = String(raw ?? "").trim();
  if (!value) return undefined;
  if (!/^[A-Za-z0-9_-]{8,220}$/.test(value)) return undefined;
  return value;
}

function bytesToBase64(input: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < input.length; i += chunkSize) {
    const chunk = input.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
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

async function fileToDataUrl(file: File) {
  const mime = file.type || "application/octet-stream";
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const base64 = bytesToBase64(bytes);
  return `data:${mime};base64,${base64}`;
}

function buildResponseData(params: {
  language: Language;
  analyzedAt: number;
  analyzed: Awaited<ReturnType<typeof analyzeMedSafetyWithOpenAI>>;
}): MedSafetyResponseData {
  return {
    ...params.analyzed.result,
    generatedText: params.analyzed.rawText,
    language: params.language,
    model: params.analyzed.model,
    analyzedAt: params.analyzedAt,
    source: params.analyzed.fallbackReason ? "openai_fallback" : "openai_live",
    fallbackReason: params.analyzed.fallbackReason,
    openaiResponseId: params.analyzed.openaiResponseId,
    openaiConversationId: params.analyzed.openaiConversationId,
  };
}

function pickStreamMode(raw: FormDataEntryValue | null) {
  const value = String(raw ?? "")
    .trim()
    .toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function sseLine(event: string, payload: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

export async function POST(req: NextRequest) {
  try {
    const userId = await safeReadUserId(req);
    if (!userId) return bad(401, "login_required");
    const subscription = await safeReadSubscription(userId);
    if (!subscription?.hasPaidAccess) return bad(402, "paid_plan_required");

    const form = await req.formData();
    const locale = pickLocale(form.get("locale"));
    const mode = pickMode(form.get("mode"));
    const situation = pickSituation(form.get("situation"));
    const queryIntent = pickQueryIntent(form.get("queryIntent"));
    const streamMode = pickStreamMode(form.get("stream"));
    const previousResponseId = pickOpenAIStateId(form.get("previousResponseId"));
    const conversationId = pickOpenAIStateId(form.get("conversationId"));
    const query = String(form.get("query") ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, MAX_QUERY_LENGTH);
    const patientSummary = String(form.get("patientSummary") ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, MAX_PATIENT_SUMMARY_LENGTH);

    const imageEntry = form.get("image");
    const image = imageEntry instanceof File ? imageEntry : null;

    if (!query && !image) {
      return bad(400, "query_or_image_required");
    }

    let imageDataUrl = "";
    let imageName = "";

    if (image) {
      if (!image.type.startsWith("image/")) return bad(400, "image_type_invalid");
      if (image.size <= 0) return bad(400, "image_empty");
      if (image.size > MAX_IMAGE_BYTES) return bad(413, "image_too_large_max_6mb");

      imageDataUrl = await fileToDataUrl(image);
      imageName = image.name;
    }

    const abort = new AbortController();
    const timeoutMs = resolveAnalyzeTimeoutMs();
    const timeout = setTimeout(() => abort.abort(), timeoutMs);
    const routeStartedAt = Date.now();

    const runAnalyze = async (onTextDelta?: (delta: string) => void | Promise<void>) => {
      const analyzedAt = Date.now();
      const today = todayISO();

      // AI 맞춤회복과 동일하게 KO를 기준 생성하고, EN은 번역/직접생성 fallback으로 확보한다.
      const analyzedKo = await analyzeMedSafetyWithOpenAI({
        query,
        mode,
        situation,
        queryIntent,
        patientSummary: patientSummary || undefined,
        locale: "ko",
        imageDataUrl: imageDataUrl || undefined,
        imageName: imageName || undefined,
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
          result: analyzedKo.result,
          rawText: analyzedKo.rawText,
          model: analyzedKo.model,
          signal: translateController.signal,
        });
        payloadEn = {
          ...payloadKo,
          ...translated.result,
          generatedText: translated.rawText,
          language: "en",
          model: translated.model ?? payloadKo.model,
          fallbackReason: payloadKo.fallbackReason
            ? translated.debug
              ? `${payloadKo.fallbackReason}|${translated.debug}`
              : payloadKo.fallbackReason
            : translated.debug,
        };
      } catch {
        // EN 직접 생성 fallback은 EN 요청에서만 수행해 응답 지연을 줄인다.
        if (locale === "en") {
          const elapsed = Date.now() - routeStartedAt;
          const remainingMs = timeoutMs - elapsed;
          if (remainingMs > 10_000) {
            try {
              const analyzedEn = await analyzeMedSafetyWithOpenAI({
                query,
                mode,
                situation,
                queryIntent,
                patientSummary: patientSummary || undefined,
                locale: "en",
                imageDataUrl: imageDataUrl || undefined,
                imageName: imageName || undefined,
                signal: abort.signal,
              });
              payloadEn = buildResponseData({
                language: "en",
                analyzedAt,
                analyzed: analyzedEn,
              });
              payloadEn.fallbackReason = payloadEn.fallbackReason ? `en_direct:${payloadEn.fallbackReason}` : "en_direct";
            } catch {
              payloadEn = null;
            }
          } else {
            payloadEn = null;
          }
        }
      } finally {
        clearTimeout(translateTimer);
        abort.signal.removeEventListener("abort", relayAbort);
      }

      const saveError = await safeSaveMedSafetyContent(userId, today, "ko", {
        medSafetySearch: {
          dateISO: today,
          savedAt: analyzedAt,
          request: {
            query,
            mode,
            situation,
            queryIntent: queryIntent ?? null,
            patientSummary: patientSummary || null,
            imageName: imageName || null,
          },
          variants: {
            ko: payloadKo,
            ...(payloadEn ? { en: payloadEn } : {}),
          },
        },
      } satisfies Json);

      if (saveError) {
        payloadKo.fallbackReason = payloadKo.fallbackReason ? `${payloadKo.fallbackReason}|${saveError}` : saveError;
        if (payloadEn) {
          payloadEn.fallbackReason = payloadEn.fallbackReason ? `${payloadEn.fallbackReason}|${saveError}` : saveError;
        }
      }

      const responseData = locale === "en" ? payloadEn ?? payloadKo : payloadKo;
      return responseData;
    };

    if (!streamMode) {
      try {
        const responseData = await runAnalyze();
        return NextResponse.json({
          ok: true,
          data: responseData,
        });
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
          const responseData = await runAnalyze(async (delta) => {
            const chunk = String(delta ?? "");
            if (!chunk) return;
            pushEvent("delta", { text: chunk });
          });
          pushEvent("result", {
            ok: true,
            data: responseData,
          });
        } catch (error: any) {
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
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error: any) {
    return bad(500, error?.message || "med_safety_analyze_failed");
  }
}
