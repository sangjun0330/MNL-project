import type { ISODate } from "@/lib/date";
import { isISODate, todayISO } from "@/lib/date";
import { AI_RECOVERY_MAX_CANDIDATES, isAIRecoverySlot } from "@/lib/aiRecovery";
import { regenerateAIRecoveryOrders } from "@/lib/server/aiRecovery";
import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { readUserIdFromRequest } from "@/lib/server/readUserId";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function bad(status: number, error: string) {
  return jsonNoStore({ ok: false, error }, { status });
}

function readCandidateIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
    if (out.length >= AI_RECOVERY_MAX_CANDIDATES) break;
  }
  return out;
}

export async function POST(req: Request) {
  const originError = sameOriginRequestError(req);
  if (originError) return bad(403, originError);

  const userId = await readUserIdFromRequest(req);
  if (!userId) return bad(401, "login_required");

  const body = await req.json().catch(() => null);
  const dateISO = isISODate(body?.dateISO ?? "") ? (body.dateISO as ISODate) : todayISO();
  const slot = isAIRecoverySlot(body?.slot) ? body.slot : "wake";
  const candidateIds = readCandidateIds(body?.candidateIds);
  if (candidateIds.length < 1 || candidateIds.length > AI_RECOVERY_MAX_CANDIDATES) {
    return bad(400, "candidate_ids_invalid_count");
  }

  try {
    const data = await regenerateAIRecoveryOrders({
      userId,
      dateISO,
      slot,
      candidateIds,
      signal: req.signal,
    });
    return jsonNoStore({ ok: true, data });
  } catch (error) {
    const message = String((error as any)?.message ?? error ?? "");
    if (message === "candidate_ids_invalid_count") return bad(400, message);
    if (message === "candidate_ids_not_found") return bad(400, message);
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
    return bad(500, "ai_recovery_orders_failed");
  }
}
