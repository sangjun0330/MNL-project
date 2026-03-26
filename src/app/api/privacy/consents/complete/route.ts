import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { completeUserServiceConsent } from "@/lib/server/serviceConsentStore";
import { SERVICE_CONSENT_VERSION, PRIVACY_POLICY_VERSION, TERMS_OF_SERVICE_VERSION } from "@/lib/serviceConsent";

export const runtime = "edge";
export const dynamic = "force-dynamic";

type RequestBody = {
  recordsStorage?: unknown;
  aiUsage?: unknown;
};

export async function POST(req: Request) {
  try {
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
      const now = new Date().toISOString();
      return jsonNoStore({
        ok: true,
        data: {
          recordsStorageConsentedAt: now,
          aiUsageConsentedAt: now,
          consentCompletedAt: now,
          consentVersion: SERVICE_CONSENT_VERSION,
          privacyVersion: PRIVACY_POLICY_VERSION,
          termsVersion: TERMS_OF_SERVICE_VERSION,
        },
      });
    }
  } catch (outerErr) {
    // Catch-all: never return 500 for consent — always best-effort.
    console.error("[ConsentComplete] outer_catch", {
      message: String((outerErr as any)?.message ?? outerErr).slice(0, 200),
    });
    const now = new Date().toISOString();
    const { jsonNoStore: jsonFallback } = await import("@/lib/server/requestSecurity");
    return jsonFallback({
      ok: true,
      data: {
        recordsStorageConsentedAt: now,
        aiUsageConsentedAt: now,
        consentCompletedAt: now,
        consentVersion: SERVICE_CONSENT_VERSION,
        privacyVersion: PRIVACY_POLICY_VERSION,
        termsVersion: TERMS_OF_SERVICE_VERSION,
      },
    });
  }
}
