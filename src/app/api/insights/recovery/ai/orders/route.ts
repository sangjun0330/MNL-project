import type { ISODate } from "@/lib/date";
import { isISODate, todayISO } from "@/lib/date";
import { isAIRecoverySlot } from "@/lib/aiRecovery";

export const runtime = "edge";
export const dynamic = "force-dynamic";
export const preferredRegion = ["iad1", "sfo1", "fra1"];

export async function POST(req: Request) {
  try {
    const [{ jsonNoStore, sameOriginRequestError }, { readUserIdFromRequest }, { regenerateAIRecoveryOrders }] = await Promise.all([
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

    const data = await regenerateAIRecoveryOrders({
      userId,
      dateISO,
      slot,
      signal: req.signal,
    });
    return jsonNoStore({ ok: true, data });
  } catch (error) {
    const message = String((error as any)?.message ?? error ?? "");
    const { jsonNoStore } = await import("@/lib/server/requestSecurity");
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
    if (message.startsWith("ai_recovery_")) {
      const [error, ...rest] = message.split(":");
      return jsonNoStore({ ok: false, error, detail: rest.join(":") || null }, { status: 500 });
    }
    return jsonNoStore({ ok: false, error: "ai_recovery_orders_failed" }, { status: 500 });
  }
}
