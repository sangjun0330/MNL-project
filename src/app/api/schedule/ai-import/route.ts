import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { MAX_SCHEDULE_IMPORT_IMAGE_BYTES } from "@/lib/scheduleAiImport";

export const runtime = "edge";
export const dynamic = "force-dynamic";
export const preferredRegion = ["iad1", "sfo1", "fra1"];

const MAX_REQUEST_BODY_BYTES = Math.ceil(MAX_SCHEDULE_IMPORT_IMAGE_BYTES * 1.55);

const EXACT_PUBLIC_ERRORS = new Set([
  "invalid_origin",
  "missing_origin",
  "invalid_referer_origin",
  "invalid_referer",
  "login_required",
  "consent_required",
  "invalid_image_data_url",
  "image_too_large_max_6mb",
  "person_not_found",
  "schedule_ai_timeout",
  "schedule_ai_parse_failed",
  "invalid_schedule_ai_response",
  "selected_person_required",
  "missing_openai_api_key",
  "missing_cf_aig_token_and_openai_api_key",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeMode(value: unknown) {
  return value === "resolve_person" ? "resolve_person" : "detect";
}

function toPublicError(raw: unknown) {
  const value = String(raw ?? "").trim();
  if (!value) return "schedule_ai_import_failed";
  if (EXACT_PUBLIC_ERRORS.has(value)) return value;

  const normalized = value.toLowerCase();
  if (normalized.startsWith("openai_network_")) return "openai_network";
  const responseMatch = normalized.match(/openai_responses_(\d{3})/);
  if (responseMatch) return `openai_responses_${responseMatch[1]}`;
  if (normalized.includes("schedule_ai_timeout")) return "schedule_ai_timeout";

  return "schedule_ai_import_failed";
}

function bad(status: number, error: string) {
  return jsonNoStore(
    {
      ok: false,
      error: toPublicError(error),
    },
    { status }
  );
}

export async function POST(req: Request) {
  try {
    const originError = sameOriginRequestError(req);
    if (originError) return bad(403, originError);

    const contentType = String(req.headers.get("content-type") ?? "").toLowerCase();
    if (!contentType.includes("application/json")) {
      return bad(415, "invalid_image_data_url");
    }

    const contentLength = Number(req.headers.get("content-length") ?? "");
    if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BODY_BYTES) {
      return bad(413, "image_too_large_max_6mb");
    }

    const [{ readUserIdFromRequest }, { userHasCompletedServiceConsent }, { importScheduleFromImageWithAI }] =
      await Promise.all([
        import("@/lib/server/readUserId"),
        import("@/lib/server/serviceConsentStore"),
        import("@/lib/server/openaiScheduleImport"),
      ]);

    const userId = await readUserIdFromRequest(req);
    if (!userId) return bad(401, "login_required");

    if (!(await userHasCompletedServiceConsent(userId))) {
      return bad(403, "consent_required");
    }

    const body = await req.json().catch(() => null);
    if (!isRecord(body)) return bad(400, "invalid_image_data_url");

    const data = await importScheduleFromImageWithAI({
      mode: normalizeMode(body.mode),
      imageDataUrl: typeof body.imageDataUrl === "string" ? body.imageDataUrl : "",
      selectedPerson: typeof body.selectedPerson === "string" ? body.selectedPerson : "",
      yearMonthHint: typeof body.yearMonthHint === "string" ? body.yearMonthHint : "",
      locale: body.locale === "en" ? "en" : "ko",
      customShiftTypes: body.customShiftTypes,
      signal: req.signal,
    });

    return jsonNoStore({ ok: true, data });
  } catch (error) {
    const message = String((error as Error)?.message ?? error ?? "");
    const publicError = toPublicError(message);
    const status =
      publicError === "login_required"
        ? 401
        : publicError === "consent_required"
          ? 403
        : publicError === "invalid_image_data_url" ||
            publicError === "image_too_large_max_6mb" ||
            publicError === "person_not_found" ||
            publicError === "selected_person_required"
          ? 400
          : publicError === "schedule_ai_timeout"
            ? 504
              : 500;
    return bad(status, publicError);
  }
}
