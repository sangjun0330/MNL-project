import { NextRequest, NextResponse } from "next/server";
import {
  analyzeMedSafetyWithOpenAI,
  type ClinicalMode,
  type ClinicalSituation,
  type QueryIntent,
} from "@/lib/server/openaiMedSafety";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const MAX_QUERY_LENGTH = 1800;
const MAX_PATIENT_SUMMARY_LENGTH = 1400;
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const DEFAULT_ANALYZE_TIMEOUT_MS = 90_000;
const MIN_ANALYZE_TIMEOUT_MS = 30_000;
const MAX_ANALYZE_TIMEOUT_MS = 180_000;

function bad(status: number, error: string) {
  const safeError = String(error ?? "unknown_error")
    .replace(/\s+/g, " ")
    .replace(/[^\x20-\x7E가-힣ㄱ-ㅎㅏ-ㅣ.,:;!?()[\]{}'"`~@#$%^&*_\-+=/\\|<>]/g, "")
    .slice(0, 260);
  return NextResponse.json(
    {
      ok: false,
      error: safeError || "unknown_error",
    },
    { status }
  );
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
  const rounded = Math.round(raw);
  return Math.max(MIN_ANALYZE_TIMEOUT_MS, Math.min(MAX_ANALYZE_TIMEOUT_MS, rounded));
}

async function fileToDataUrl(file: File) {
  const mime = file.type || "application/octet-stream";
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const base64 = bytesToBase64(bytes);
  return `data:${mime};base64,${base64}`;
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const locale = pickLocale(form.get("locale"));
    const mode = pickMode(form.get("mode"));
    const situation = pickSituation(form.get("situation"));
    const queryIntent = pickQueryIntent(form.get("queryIntent"));
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

    try {
      const analyzed = await analyzeMedSafetyWithOpenAI({
        query,
        mode,
        situation,
        queryIntent,
        patientSummary: patientSummary || undefined,
        locale,
        imageDataUrl: imageDataUrl || undefined,
        imageName: imageName || undefined,
        previousResponseId,
        conversationId,
        signal: abort.signal,
      });

      return NextResponse.json({
        ok: true,
        data: {
          ...analyzed.result,
          model: analyzed.model,
          analyzedAt: Date.now(),
          source: analyzed.fallbackReason ? "openai_fallback" : "openai_live",
          fallbackReason: analyzed.fallbackReason,
          openaiResponseId: analyzed.openaiResponseId,
          openaiConversationId: analyzed.openaiConversationId,
        },
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error: any) {
    return bad(500, error?.message || "med_safety_analyze_failed");
  }
}
