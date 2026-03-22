import type { ISODate } from "@/lib/date";
import { isISODate, todayISO } from "@/lib/date";
import { isAIRecoverySlot } from "@/lib/aiRecovery";
import { generateAIRecoverySession } from "@/lib/server/aiRecovery";
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
  const slot = isAIRecoverySlot(body?.slot) ? body.slot : "wake";
  const force = Boolean(body?.force);

  try {
    const data = await generateAIRecoverySession({
      userId,
      dateISO,
      slot,
      force,
      signal: req.signal,
    });
    return jsonNoStore({ ok: true, data });
  } catch (error) {
    const message = String((error as any)?.message ?? error ?? "");
    if (message === "session_generation_limit_reached") return bad(403, message);
    return bad(500, "ai_recovery_generate_failed");
  }
}
