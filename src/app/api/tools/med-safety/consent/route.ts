export const runtime = "edge";
export const dynamic = "force-dynamic";

function fallbackJson(body: unknown, status = 500) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "Cache-Control": "private, no-store, max-age=0",
      Pragma: "no-cache",
    },
  });
}

export async function GET(req: Request) {
  try {
    const [{ jsonNoStore, sameOriginRequestError }, { readUserIdFromRequest }, { loadMedSafetyConsentedAt }] =
      await Promise.all([
        import("@/lib/server/requestSecurity"),
        import("@/lib/server/readUserId"),
        import("@/lib/server/serviceConsentStore"),
      ]);

    const sameOriginError = sameOriginRequestError(req);
    if (sameOriginError) return jsonNoStore({ ok: false, error: sameOriginError }, { status: 403 });

    const userId = await readUserIdFromRequest(req);
    if (!userId) return jsonNoStore({ ok: false, error: "login_required" }, { status: 401 });

    const consentedAt = await loadMedSafetyConsentedAt(userId);
    return jsonNoStore({ ok: true, consented: consentedAt !== null, consentedAt: consentedAt ?? null });
  } catch (err) {
    const payload = { ok: false, error: "failed_to_load_med_safety_consent" };
    try {
      const { jsonNoStore } = await import("@/lib/server/requestSecurity");
      return jsonNoStore(payload, { status: 500 });
    } catch {
      return fallbackJson(payload, 500);
    }
  }
}

export async function POST(req: Request) {
  try {
    const [{ jsonNoStore, sameOriginRequestError }, { readUserIdFromRequest }, { completeMedSafetyConsent }] =
      await Promise.all([
        import("@/lib/server/requestSecurity"),
        import("@/lib/server/readUserId"),
        import("@/lib/server/serviceConsentStore"),
      ]);

    const sameOriginError = sameOriginRequestError(req);
    if (sameOriginError) return jsonNoStore({ ok: false, error: sameOriginError }, { status: 403 });

    const userId = await readUserIdFromRequest(req);
    if (!userId) return jsonNoStore({ ok: false, error: "login_required" }, { status: 401 });

    const consentedAt = await completeMedSafetyConsent(userId);
    return jsonNoStore({ ok: true, consentedAt });
  } catch (err) {
    console.error("[MedSafetyConsent] failed_to_save", {
      code: (err as any)?.code,
      message: String((err as any)?.message ?? err).slice(0, 200),
    });
    const payload = { ok: false, error: "failed_to_save_med_safety_consent" };
    try {
      const { jsonNoStore } = await import("@/lib/server/requestSecurity");
      return jsonNoStore(payload, { status: 500 });
    } catch {
      return fallbackJson(payload, 500);
    }
  }
}
