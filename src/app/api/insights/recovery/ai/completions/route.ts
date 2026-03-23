import type { ISODate } from "@/lib/date";
import { isISODate, todayISO } from "@/lib/date";

export const runtime = "edge";
export const dynamic = "force-dynamic";
export const preferredRegion = ["iad1", "sfo1", "fra1"];

export async function POST(req: Request) {
  try {
    const [{ jsonNoStore, sameOriginRequestError }, { readUserIdFromRequest }, { toggleAIRecoveryCompletion }] = await Promise.all([
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
    const orderId = typeof body?.orderId === "string" ? body.orderId.trim() : "";
    const completed = Boolean(body?.completed);
    if (!orderId) return bad(400, "order_id_required");

    const data = await toggleAIRecoveryCompletion({
      userId,
      dateISO,
      orderId,
      completed,
    });
    return jsonNoStore({ ok: true, data });
  } catch (error) {
    const message = String((error as any)?.message ?? error ?? "");
    if (message === "order_id_invalid" || message === "order_id_not_found") {
      const { jsonNoStore } = await import("@/lib/server/requestSecurity");
      return jsonNoStore({ ok: false, error: message }, { status: 400 });
    }
    const { jsonNoStore } = await import("@/lib/server/requestSecurity");
    return jsonNoStore({ ok: false, error: "ai_recovery_completion_failed" }, { status: 500 });
  }
}
