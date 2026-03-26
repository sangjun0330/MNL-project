import { NextResponse } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

function degradedGetResponse() {
  return NextResponse.json(
    {
      ok: true,
      state: {
        selected: null,
        schedule: {},
        shiftNames: {},
        notes: {},
        emotions: {},
        bio: {},
        memo: { folders: {}, documents: {}, recent: [], personalTemplates: [] },
        records: { templates: {}, entries: {}, recent: [] },
        settings: null,
      },
      stateRevision: null,
      updatedAt: null,
      degraded: true,
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        Pragma: "no-cache",
      },
    }
  );
}

function localOnlySaveResponse() {
  return NextResponse.json(
    { ok: true, syncedAt: null, stateRevision: null, degraded: true, localOnly: true },
    {
      status: 200,
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
    const { ensureUserRow, loadUserState } = await import("@/lib/server/userStateStore");
    const { sanitizeStatePayload } = await import("@/lib/stateSanitizer");
    const { defaultMemoState, defaultRecordState } = await import("@/lib/notebook");

    const userId = await readUserIdFromRequest(req);
    if (!userId) {
      return degradedGetResponse();
    }
    if (!(await userHasCompletedServiceConsent(userId))) {
      return degradedGetResponse();
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
      stateRevision: row?.updatedAt ?? null,
      updatedAt: row?.updatedAt ?? null,
    });
  } catch (error) {
    try {
      console.error("[UserState] failed_to_load_state", {
        error: error instanceof Error ? error.message : String(error),
      });
    } catch {
      // Ignore logging failures.
    }
    return degradedGetResponse();
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

    if (!userId) return localOnlySaveResponse();
    if (!state) return jsonNoStore({ ok: false, error: "state required" }, { status: 400 });

    if (!(await userHasCompletedServiceConsent(userId))) {
      return localOnlySaveResponse();
    }
    const serialized = serializeStateForSupabase(state);
    const saved = await saveUserState({ userId, payload: serialized });
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
      return localOnlySaveResponse();
    }
    return NextResponse.json(
      { ok: false, error: "failed_to_save_state" },
      {
        status: 500,
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
          Pragma: "no-cache",
        },
      }
    );
  }
}
