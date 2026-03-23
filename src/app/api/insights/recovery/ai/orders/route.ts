import type { ISODate } from "@/lib/date";
import { isISODate, todayISO } from "@/lib/date";
import { isAIRecoverySlot } from "@/lib/aiRecovery";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = ["iad1", "sfo1", "fra1"];

export async function POST(req: Request) {
  let userId: string | null = null;
  let dateISO: ISODate = todayISO();
  let slot: "wake" | "postShift" = "wake";
  try {
    const [{ jsonNoStore, sameOriginRequestError }, { readUserIdFromRequest }, { regenerateAIRecoveryOrders }] = await Promise.all([
      import("@/lib/server/requestSecurity"),
      import("@/lib/server/readUserId"),
      import("@/lib/server/aiRecovery"),
    ]);
    const bad = (status: number, error: string) => jsonNoStore({ ok: false, error }, { status });

    const originError = sameOriginRequestError(req);
    if (originError) return bad(403, originError);

    userId = await readUserIdFromRequest(req);
    if (!userId) return bad(401, "login_required");

    const body = await req.json().catch(() => null);
    dateISO = isISODate(body?.dateISO ?? "") ? (body.dateISO as ISODate) : todayISO();
    slot = isAIRecoverySlot(body?.slot) ? body.slot : "wake";

    const data = await regenerateAIRecoveryOrders({
      userId,
      dateISO,
      slot,
      signal: req.signal,
    });
    return jsonNoStore({ ok: true, data });
  } catch (error) {
    const message = String((error as any)?.message ?? error ?? "");
    const [{ jsonNoStore }, { readAIRecoverySessionView }] = await Promise.all([
      import("@/lib/server/requestSecurity"),
      import("@/lib/server/aiRecovery"),
    ]);
    const bad = (status: number, code: string) => jsonNoStore({ ok: false, error: code }, { status });
    if (message === "ai_recovery_session_missing") return bad(404, message);
    if (message === "orders_generation_limit_reached") return bad(403, message);
    if (
      message === "plan_upgrade_required" ||
      message === "service_consent_required" ||
      message === "needs_more_records" ||
      message === "wake_sleep_required" ||
      message === "slot_not_available"
    ) {
      return bad(403, message);
    }
    if (userId) {
      try {
        const recovered = await readAIRecoverySessionView({
          userId,
          dateISO,
          slot,
        });
        if (recovered.session) {
          return jsonNoStore({ ok: true, data: recovered });
        }
      } catch (recoveryError) {
        console.error("[AIRecovery] orders_failed_recovery_read_failed", {
          message: recoveryError instanceof Error ? recoveryError.message : String(recoveryError),
        });
      }
    }
    if (message.startsWith("ai_recovery_")) {
      const [error, ...rest] = message.split(":");
      return jsonNoStore({ ok: false, error, detail: rest.join(":") || null }, { status: 500 });
    }
    return jsonNoStore({ ok: false, error: "ai_recovery_orders_failed" }, { status: 500 });
  }
}
