import type { ISODate } from "@/lib/date";
import { isISODate, todayISO } from "@/lib/date";
import { isAIRecoverySlot } from "@/lib/aiRecovery";

export const runtime = "edge";
export const dynamic = "force-dynamic";
export const preferredRegion = ["iad1", "sfo1", "fra1"];

export async function POST(req: Request) {
  let userId: string | null = null;
  let userEmail: string | null = null;
  let dateISO: ISODate = todayISO();
  let slot: "wake" | "postShift" = "wake";
  try {
    const [{ jsonNoStore, sameOriginRequestError }, { readAuthIdentityFromRequest }, { generateAIRecoverySession }] = await Promise.all([
      import("@/lib/server/requestSecurity"),
      import("@/lib/server/readUserId"),
      import("@/lib/server/aiRecovery"),
    ]);
    const bad = (status: number, error: string) => jsonNoStore({ ok: false, error }, { status });

    const originError = sameOriginRequestError(req);
    if (originError) return bad(403, originError);

    const identity = await readAuthIdentityFromRequest(req);
    userId = identity.userId;
    userEmail = identity.email;
    if (!userId) return bad(401, "login_required");

    const body = await req.json().catch(() => null);
    dateISO = isISODate(body?.dateISO ?? "") ? (body.dateISO as ISODate) : todayISO();
    slot = isAIRecoverySlot(body?.slot) ? body.slot : "wake";
    const force = Boolean(body?.force);
    const payloadOverride = body?.state;

    const data = await generateAIRecoverySession({
      userId,
      userEmail,
      dateISO,
      slot,
      force,
      payloadOverride,
      signal: req.signal,
    });
    return jsonNoStore({ ok: true, data });
  } catch (error) {
    const message = String((error as any)?.message ?? error ?? "");
    console.error("[AIRecovery] generate_failed", {
      message,
    });
    const [{ jsonNoStore }, { readAIRecoverySessionView }] = await Promise.all([
      import("@/lib/server/requestSecurity"),
      import("@/lib/server/aiRecovery"),
    ]);
    if (userId) {
      try {
        const recovered = await readAIRecoverySessionView({
          userId,
          userEmail,
          dateISO,
          slot,
        });
        if (recovered.session) {
          return jsonNoStore({ ok: true, data: recovered });
        }
      } catch (recoveryError) {
        console.error("[AIRecovery] generate_failed_recovery_read_failed", {
          message: recoveryError instanceof Error ? recoveryError.message : String(recoveryError),
        });
      }
    }
    if (message === "session_generation_limit_reached") {
      return jsonNoStore({ ok: false, error: message }, { status: 403 });
    }
    if (message.startsWith("ai_recovery_")) {
      const [error, ...rest] = message.split(":");
      return jsonNoStore({ ok: false, error, detail: rest.join(":") || null }, { status: 500 });
    }
    return jsonNoStore({ ok: false, error: "ai_recovery_generate_failed" }, { status: 500 });
  }
}
