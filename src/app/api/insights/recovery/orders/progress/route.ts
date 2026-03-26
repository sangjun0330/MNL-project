import { NextRequest } from "next/server";
import { todayISO, type ISODate } from "@/lib/date";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import {
  readRecoveryOrderCompletedIds,
  writeRecoveryOrderCompletedIds,
} from "@/lib/server/recoveryOrderStore";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function isISODateString(value: string | null | undefined): value is ISODate {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function resolveDateISO(value: string | null | undefined) {
  return isISODateString(value) ? value : todayISO();
}

export async function GET(req: NextRequest) {
  const userId = await readUserIdFromRequest(req);
  if (!userId) return jsonNoStore({ ok: false, error: "login_required" }, { status: 401 });

  try {
    const url = new URL(req.url);
    const dateISO = resolveDateISO(url.searchParams.get("dateISO"));
    const completedIds = await readRecoveryOrderCompletedIds(userId, dateISO);
    return jsonNoStore({ ok: true, data: { dateISO, completedIds } });
  } catch {
    return jsonNoStore({ ok: false, error: "failed_to_load_recovery_order_progress" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const originError = sameOriginRequestError(req);
  if (originError) return jsonNoStore({ ok: false, error: originError }, { status: 403 });

  const userId = await readUserIdFromRequest(req);
  if (!userId) return jsonNoStore({ ok: false, error: "login_required" }, { status: 401 });

  let body: { dateISO?: string; completedIds?: unknown } | null = null;
  try {
    body = await req.json();
  } catch {
    return jsonNoStore({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  try {
    const dateISO = resolveDateISO(body?.dateISO);
    const completedIds = await writeRecoveryOrderCompletedIds(userId, dateISO, body?.completedIds);
    return jsonNoStore({ ok: true, data: { dateISO, completedIds } });
  } catch {
    return jsonNoStore({ ok: false, error: "failed_to_save_recovery_order_progress" }, { status: 500 });
  }
}
