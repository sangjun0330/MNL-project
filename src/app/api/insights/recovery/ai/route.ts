import { isISODate, todayISO, type ISODate } from "@/lib/date";
import { isAIRecoverySlot } from "@/lib/aiRecovery";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const [{ jsonNoStore }, { readUserIdFromRequest }, { readAIRecoverySessionView }] = await Promise.all([
      import("@/lib/server/requestSecurity"),
      import("@/lib/server/readUserId"),
      import("@/lib/server/aiRecovery"),
    ]);
    const bad = (status: number, error: string) => jsonNoStore({ ok: false, error }, { status });

    const userId = await readUserIdFromRequest(req);
    if (!userId) return bad(401, "login_required");

    const url = new URL(req.url);
    const dateISO = url.searchParams.get("date");
    const slot = url.searchParams.get("slot");
    const data = await readAIRecoverySessionView({
      userId,
      dateISO: isISODate(dateISO ?? "") ? (dateISO as ISODate) : todayISO(),
      slot: isAIRecoverySlot(slot) ? slot : "wake",
    });
    return jsonNoStore({ ok: true, data });
  } catch (error) {
    console.error("[AIRecovery] route_get_failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    const { jsonNoStore } = await import("@/lib/server/requestSecurity");
    return jsonNoStore({ ok: false, error: "ai_recovery_load_failed" }, { status: 500 });
  }
}
