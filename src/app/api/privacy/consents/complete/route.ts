export const runtime = "edge";
export const dynamic = "force-dynamic";

type RequestBody = {
  recordsStorage?: unknown;
  aiUsage?: unknown;
};

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

function isRetriableConsentStorageError(error: unknown) {
  const code = String((error as any)?.code ?? "").toUpperCase();
  const message = String((error as any)?.message ?? "").toLowerCase();
  return (
    code === "42P01" ||
    code === "42703" ||
    code === "PGRST204" ||
    code === "PGRST205" ||
    code === "23503" ||
    message.includes("does not exist") ||
    message.includes("schema cache") ||
    message.includes("could not find the table") ||
    message.includes("could not find the column")
  );
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
      return jsonNoStore({ ok: false, error: "failed_to_save_service_consent" }, { status: isRetriableConsentStorageError(err) ? 503 : 500 });
    }
  } catch (outerErr) {
    console.error("[ConsentComplete] outer_catch", {
      message: String((outerErr as any)?.message ?? outerErr).slice(0, 200),
    });
    const payload = { ok: false, error: "failed_to_save_service_consent" };
    try {
      const { jsonNoStore } = await import("@/lib/server/requestSecurity");
      return jsonNoStore(payload, { status: 500 });
    } catch {
      return fallbackJson(payload, 500);
    }
  }
}
