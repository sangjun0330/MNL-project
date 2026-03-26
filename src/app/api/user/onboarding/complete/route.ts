export const runtime = "edge";
export const dynamic = "force-dynamic";

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
    const [{ jsonNoStore, sameOriginRequestError }, { readUserIdFromRequest }, { markUserOnboardingCompleted }] = await Promise.all([
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

    try {
      await markUserOnboardingCompleted(userId);
    } catch (err) {
      console.error("[OnboardingComplete] unexpected_error_in_onboarding", {
        userId: String(userId).slice(0, 8),
        code: (err as any)?.code,
        message: String((err as any)?.message ?? err).slice(0, 200),
      });
    }

    return jsonNoStore({ ok: true });
  } catch (outerErr) {
    console.error("[OnboardingComplete] outer_catch", {
      message: String((outerErr as any)?.message ?? outerErr).slice(0, 200),
    });
    try {
      const { jsonNoStore } = await import("@/lib/server/requestSecurity");
      return jsonNoStore({ ok: true });
    } catch {
      return fallbackJson({ ok: true });
    }
  }
}
