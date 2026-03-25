import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { completeUserServiceConsent } from "@/lib/server/serviceConsentStore";

export const runtime = "edge";
export const dynamic = "force-dynamic";

type RequestBody = {
  recordsStorage?: unknown;
  aiUsage?: unknown;
};

export async function POST(req: Request) {
  const sameOriginError = sameOriginRequestError(req);
  if (sameOriginError) {
    return jsonNoStore({ ok: false, error: sameOriginError }, { status: 403 });
  }

  const userId = await readUserIdFromRequest(req);
  if (!userId) {
    return jsonNoStore({ ok: false, error: "login_required" }, { status: 401 });
  }

  const body = ((await req.json().catch(() => null)) ?? {}) as RequestBody;
  if (body.recordsStorage !== true || body.aiUsage !== true) {
    return jsonNoStore({ ok: false, error: "required_consents_missing" }, { status: 400 });
  }

  try {
    const consent = await completeUserServiceConsent(userId);
    return jsonNoStore({ ok: true, data: consent });
  } catch (err) {
    console.error("[ConsentComplete] failed_to_save_service_consent", {
      userId: String(userId).slice(0, 8),
      code: (err as any)?.code,
      message: String((err as any)?.message ?? err).slice(0, 200),
    });
    return jsonNoStore({ ok: false, error: "failed_to_save_service_consent" }, { status: 500 });
  }
}
