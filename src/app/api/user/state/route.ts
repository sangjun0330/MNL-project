import { NextResponse } from "next/server";
import { ensureUserRow, loadUserState, saveUserState } from "@/lib/server/userStateStore";
import { readUserIdFromRequest } from "@/lib/server/readUserId";
import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity";
import { userHasCompletedServiceConsent } from "@/lib/server/serviceConsentStore";
import { sanitizeStatePayload } from "@/lib/stateSanitizer";
import { serializeStateForSupabase } from "@/lib/statePersistence";
import { defaultMemoState, defaultRecordState } from "@/lib/notebook";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function bad(status: number, message: string) {
  return jsonNoStore({ ok: false, error: message }, { status });
}

function buildFallbackAppState() {
  return {
    selected: null,
    schedule: {},
    shiftNames: {},
    notes: {},
    emotions: {},
    bio: {},
    memo: defaultMemoState(),
    records: defaultRecordState(),
    settings: null,
  };
}

function isUserStateStorageUnavailable(error: unknown) {
  const code = String((error as { code?: unknown } | null)?.code ?? "").trim();
  const message = String((error as { message?: unknown } | null)?.message ?? "").toLowerCase();
  return (
    message.includes("supabase admin env missing") ||
    code === "42P01" ||
    code === "PGRST204" ||
    code === "PGRST205" ||
    (message.includes("rnest_user_state") && message.includes("does not exist")) ||
    (message.includes("schema cache") && message.includes("rnest_user_state"))
  );
}

export async function GET(req: Request) {
  try {
    const userId = await readUserIdFromRequest(req);
    if (!userId) return bad(401, "login required");
    if (!(await userHasCompletedServiceConsent(userId))) {
      return bad(403, "consent_required");
    }
    await ensureUserRow(userId);
    const row = await loadUserState(userId);
    const sanitized = row?.payload
      ? {
          ...sanitizeStatePayload(row.payload),
          memo: defaultMemoState(),
          records: defaultRecordState(),
        }
      : null;
    return jsonNoStore({
      ok: true,
      state: sanitized,
      updatedAt: row?.updatedAt ?? null,
    });
  } catch (error) {
    console.error("[UserState] failed_to_load_state", {
      error: error instanceof Error ? error.message : String(error),
    });
    return jsonNoStore({
      ok: true,
      state: buildFallbackAppState(),
      updatedAt: null,
      degraded: true,
    });
  }
}

export async function POST(req: Request) {
  const sameOriginError = sameOriginRequestError(req);
  if (sameOriginError) return bad(403, sameOriginError);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return bad(400, "invalid json");
  }

  try {
    const userId = await readUserIdFromRequest(req);
    const state = body?.state;

    if (!userId) return bad(401, "login required");
    if (!state) return bad(400, "state required");

    if (!(await userHasCompletedServiceConsent(userId))) {
      return bad(403, "consent_required");
    }
    const serialized = serializeStateForSupabase(state);
    await saveUserState({ userId, payload: serialized });
    return jsonNoStore({ ok: true, syncedAt: new Date().toISOString() });
  } catch (error) {
    console.error("[UserState] failed_to_save_state", {
      error: error instanceof Error ? error.message : String(error),
    });
    if (isUserStateStorageUnavailable(error)) {
      return jsonNoStore({ ok: true, syncedAt: null, degraded: true, localOnly: true });
    }
    return bad(500, "failed_to_save_state");
  }
}
