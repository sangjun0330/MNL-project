import { NextRequest, NextResponse } from "next/server";
import {
  analyzeMedSafetyWithOpenAI,
  type ClinicalMode,
  type ClinicalSituation,
} from "@/lib/server/openaiMedSafety";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const MAX_QUERY_LENGTH = 1800;
const MAX_PATIENT_SUMMARY_LENGTH = 1400;
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

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
  if (value === "pre_admin") return "pre_admin";
  if (value === "during_admin") return "during_admin";
  if (value === "alarm") return "alarm";
  if (value === "adverse_suspect") return "adverse_suspect";
  return "general";
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
    const timeout = setTimeout(() => abort.abort(), 45_000);

    try {
      const analyzed = await analyzeMedSafetyWithOpenAI({
        query,
        mode,
        situation,
        patientSummary: patientSummary || undefined,
        locale,
        imageDataUrl: imageDataUrl || undefined,
        imageName: imageName || undefined,
        signal: abort.signal,
      });

      return NextResponse.json({
        ok: true,
        data: {
          ...analyzed.result,
          model: analyzed.model,
          analyzedAt: Date.now(),
          source: "openai",
        },
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (error: any) {
    return bad(500, error?.message || "med_safety_analyze_failed");
  }
}
