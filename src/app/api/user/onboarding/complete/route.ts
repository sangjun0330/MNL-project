import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { markUserOnboardingCompleted } from "@/lib/server/serviceConsentStore";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
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
    // markUserOnboardingCompleted is designed to not throw, but guard here anyway.
    // Onboarding completion is best-effort; always return 200 so the client proceeds.
    console.error("[OnboardingComplete] unexpected_error_in_onboarding", {
      userId: String(userId).slice(0, 8),
      code: (err as any)?.code,
      message: String((err as any)?.message ?? err).slice(0, 200),
    });
  }
  return jsonNoStore({ ok: true });
}
