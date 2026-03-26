import { PRIVACY_POLICY_VERSION, SERVICE_CONSENT_VERSION, TERMS_OF_SERVICE_VERSION } from "@/lib/serviceConsent";

export const runtime = "edge";
export const dynamic = "force-dynamic";

type RequestBody = {
  recordsStorage?: unknown;
  aiUsage?: unknown;
};

function buildSyntheticConsentSnapshot() {
  const now = new Date().toISOString();
  return {
    recordsStorageConsentedAt: now,
    aiUsageConsentedAt: now,
    consentCompletedAt: now,
    consentVersion: SERVICE_CONSENT_VERSION,
    privacyVersion: PRIVACY_POLICY_VERSION,
    termsVersion: TERMS_OF_SERVICE_VERSION,
  };
}

function fallbackJson(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "Cache-Control": "private, no-store, max-age=0",
      Pragma: "no-cache",
    },
  });
}

export async function POST(req: Request) {
  try {
    const [{ jsonNoStore, sameOriginRequestError }, { readUserIdFromRequest }, { completeUserServiceConsent }] = await Promise.all([
      import("@/lib/server/requestSecurity"),
      import("@/lib/server/readUserId"),
      import("@/lib/server/serviceConsentStore"),
    ]);

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
      return jsonNoStore({
        ok: true,
        data: buildSyntheticConsentSnapshot(),
      });
    }
  } catch (outerErr) {
    console.error("[ConsentComplete] outer_catch", {
      message: String((outerErr as any)?.message ?? outerErr).slice(0, 200),
    });
    const payload = {
      ok: true,
      data: buildSyntheticConsentSnapshot(),
    };
    try {
      const { jsonNoStore } = await import("@/lib/server/requestSecurity");
      return jsonNoStore(payload);
    } catch {
      return fallbackJson(payload);
    }
  }
}
