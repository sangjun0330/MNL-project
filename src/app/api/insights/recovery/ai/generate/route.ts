import type { ISODate } from "@/lib/date";
import { isISODate, todayISO } from "@/lib/date";
import { isAIRecoverySlot } from "@/lib/aiRecovery";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const [{ jsonNoStore, sameOriginRequestError }, { readUserIdFromRequest }, { generateAIRecoverySession }] = await Promise.all([
      import("@/lib/server/requestSecurity"),
      import("@/lib/server/readUserId"),
      import("@/lib/server/aiRecovery"),
    ]);
    const bad = (status: number, error: string) => jsonNoStore({ ok: false, error }, { status });

    const originError = sameOriginRequestError(req);
    if (originError) return bad(403, originError);

    const userId = await readUserIdFromRequest(req);
    if (!userId) return bad(401, "login_required");

    const body = await req.json().catch(() => null);
    const dateISO = isISODate(body?.dateISO ?? "") ? (body.dateISO as ISODate) : todayISO();
    const slot = isAIRecoverySlot(body?.slot) ? body.slot : "wake";
    const force = Boolean(body?.force);
    const payloadOverride = body?.state;

    const data = await generateAIRecoverySession({
      userId,
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
    const { jsonNoStore } = await import("@/lib/server/requestSecurity");
    if (message === "session_generation_limit_reached") {
      return jsonNoStore({ ok: false, error: message }, { status: 403 });
    }
    if (message.startsWith("ai_recovery_")) {
      return jsonNoStore({ ok: false, error: message }, { status: 502 });
    }
    return jsonNoStore({ ok: false, error: "ai_recovery_generate_failed" }, { status: 500 });
  }
}
