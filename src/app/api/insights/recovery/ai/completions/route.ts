import type { ISODate } from "@/lib/date";
import { isISODate, todayISO } from "@/lib/date";
import { toggleAIRecoveryCompletion } from "@/lib/server/aiRecovery";
import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function bad(status: number, error: string) {
  return jsonNoStore({ ok: false, error }, { status });
}

export async function POST(req: Request) {
  const originError = sameOriginRequestError(req);
  if (originError) return bad(403, originError);

  const userId = await readUserIdFromRequest(req);
  if (!userId) return bad(401, "login_required");

  const body = await req.json().catch(() => null);
  const dateISO = isISODate(body?.dateISO ?? "") ? (body.dateISO as ISODate) : todayISO();
  const orderId = typeof body?.orderId === "string" ? body.orderId.trim() : "";
  const completed = Boolean(body?.completed);
  if (!orderId) return bad(400, "order_id_required");

  try {
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
      return bad(400, message);
    }
    return bad(500, "ai_recovery_completion_failed");
  }
}
