import { isISODate, todayISO, type ISODate } from "@/lib/date";
import { isAIRecoverySlot } from "@/lib/aiRecovery";
import { readAIRecoverySessionView } from "@/lib/server/aiRecovery";
import { jsonNoStore } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function bad(status: number, error: string) {
  return jsonNoStore({ ok: false, error }, { status });
}

export async function GET(req: Request) {
  const userId = await readUserIdFromRequest(req);
  if (!userId) return bad(401, "login_required");

  const url = new URL(req.url);
  const dateISO = url.searchParams.get("date");
  const slot = url.searchParams.get("slot");

  try {
    const data = await readAIRecoverySessionView({
      userId,
      dateISO: isISODate(dateISO ?? "") ? (dateISO as ISODate) : todayISO(),
      slot: isAIRecoverySlot(slot) ? slot : "wake",
    });
    return jsonNoStore({ ok: true, data });
  } catch {
    return bad(500, "ai_recovery_load_failed");
  }
}
