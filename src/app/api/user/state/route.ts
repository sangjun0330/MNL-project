import { NextResponse, after } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function errorResponse(status: number, error: string) {
  return NextResponse.json(
    { ok: false, error },
    {
      status,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        Pragma: "no-cache",
      },
    }
  );
}

function isUserStateStorageUnavailable(error: unknown) {
  const code = String((error as { code?: unknown } | null)?.code ?? "").trim();
  const message = String((error as { message?: unknown } | null)?.message ?? "").toLowerCase();
  return (
    message.includes("supabase admin env missing") ||
    code === "42P01" ||
    code === "42703" ||
    code === "PGRST204" ||
    code === "PGRST205" ||
    (message.includes("rnest_user_state") && message.includes("does not exist")) ||
    (message.includes("schema cache") && message.includes("rnest_user_state"))
  );
}

export async function GET(req: Request) {
  try {
    const { jsonNoStore } = await import("@/lib/server/requestSecurity");
    const { readUserIdFromRequest } = await import("@/lib/server/readUserId");
    const { userHasCompletedServiceConsent } = await import("@/lib/server/serviceConsentStore");
    const { loadAIRecoverySummary } = await import("@/lib/server/aiRecoveryStateStore");
    const { ensureUserRow, loadUserState } = await import("@/lib/server/userStateStore");
    const { sanitizeStatePayload } = await import("@/lib/stateSanitizer");
    const { defaultMemoState, defaultRecordState } = await import("@/lib/notebook");

    const userId = await readUserIdFromRequest(req);
    if (!userId) {
      return errorResponse(401, "login_required");
    }
    if (!(await userHasCompletedServiceConsent(userId))) {
      return errorResponse(403, "consent_required");
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
    const recoverySummary = await loadAIRecoverySummary(userId);
    return jsonNoStore({
      ok: true,
      state: sanitized,
      stateRevision: row?.updatedAt ?? null,
      updatedAt: row?.updatedAt ?? null,
      recoverySummary,
    });
  } catch (error) {
    try {
      console.error("[UserState] failed_to_load_state", {
        error: error instanceof Error ? error.message : String(error),
      });
    } catch {
      // Ignore logging failures.
    }
    if (isUserStateStorageUnavailable(error)) {
      return errorResponse(503, "user_state_storage_unavailable");
    }
    return errorResponse(500, "failed_to_load_state");
  }
}

export async function POST(req: Request) {
  try {
    const { jsonNoStore, sameOriginRequestError } = await import("@/lib/server/requestSecurity");
    const { readUserIdFromRequest } = await import("@/lib/server/readUserId");
    const { userHasCompletedServiceConsent } = await import("@/lib/server/serviceConsentStore");
    const { saveUserState } = await import("@/lib/server/userStateStore");
    const { serializeStateForSupabase } = await import("@/lib/statePersistence");

    const sameOriginError = sameOriginRequestError(req);
    if (sameOriginError) {
      return jsonNoStore({ ok: false, error: sameOriginError }, { status: 403 });
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return jsonNoStore({ ok: false, error: "invalid json" }, { status: 400 });
    }

    const userId = await readUserIdFromRequest(req);
    const state = body?.state;

    if (!userId) return errorResponse(401, "login_required");
    if (!state) return jsonNoStore({ ok: false, error: "state required" }, { status: 400 });

    if (!(await userHasCompletedServiceConsent(userId))) {
      return jsonNoStore({ ok: false, error: "consent_required" }, { status: 403 });
    }
    const serialized = serializeStateForSupabase(state);
    const saved = await saveUserState({ userId, payload: serialized });
    if (saved.changed) {
      after(async () => {
        try {
          const { getSupabaseAdmin } = await import("@/lib/server/supabaseAdmin");
          const { maybeAutoRefreshGroupAIBriefsForUserStateChange } = await import("@/lib/server/socialGroupAIBrief");
          const result = await maybeAutoRefreshGroupAIBriefsForUserStateChange({
            admin: getSupabaseAdmin(),
            userId,
            previousPayload: saved.previousPayload,
            nextPayload: saved.payload,
          });
          if (result.triggered || result.failedCount > 0) {
            console.info("[UserState] group_ai_brief_auto_refresh", {
              userId: userId.slice(0, 8),
              ...result,
            });
          }
        } catch (error) {
          console.error("[UserState] group_ai_brief_auto_refresh_failed", {
            userId: userId.slice(0, 8),
            error: error instanceof Error ? error.message : String(error),
          });
        }
      });
    }
    return jsonNoStore({
      ok: true,
      syncedAt: new Date().toISOString(),
      stateRevision: saved.stateRevision,
    });
  } catch (error) {
    try {
      console.error("[UserState] failed_to_save_state", {
        error: error instanceof Error ? error.message : String(error),
      });
    } catch {
      // Ignore logging failures.
    }
    if (isUserStateStorageUnavailable(error)) {
      return errorResponse(503, "user_state_storage_unavailable");
    }
    return errorResponse(500, "failed_to_save_state");
  }
}
