import { NextResponse } from "next/server"

export const runtime = "edge"
export const dynamic = "force-dynamic"

function degradedNotebookResponse() {
  return NextResponse.json(
    {
      ok: true,
      state: {
        memo: { folders: {}, documents: {}, recent: [], personalTemplates: [] },
        records: { templates: {}, entries: {}, recent: [] },
      },
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
  )
}

function isNotebookStateStorageUnavailable(error: unknown) {
  const code = String((error as { code?: unknown } | null)?.code ?? "").trim()
  const message = String((error as { message?: unknown } | null)?.message ?? "").toLowerCase()
  return (
    message.includes("supabase admin env missing") ||
    message.includes("notebook_state_table_missing") ||
    code === "42P01" ||
    code === "PGRST204" ||
    code === "PGRST205" ||
    (message.includes("rnest_notebook_state") && message.includes("does not exist")) ||
    (message.includes("schema cache") && message.includes("rnest_notebook_state"))
  )
}

export async function GET(req: Request) {
  try {
    const { defaultNotebookState } = await import("@/lib/notebook")
    const { loadNotebookState } = await import("@/lib/server/notebookStateStore")
    const { jsonNoStore } = await import("@/lib/server/requestSecurity")
    const { readUserIdFromRequest } = await import("@/lib/server/readUserId")
    const { userHasCompletedServiceConsent } = await import("@/lib/server/serviceConsentStore")

    const userId = await readUserIdFromRequest(req)
    if (!userId) {
      return jsonNoStore({ ok: false, error: "login required" }, { status: 401 })
    }

    if (!(await userHasCompletedServiceConsent(userId))) {
      return jsonNoStore({ ok: false, error: "consent_required" }, { status: 403 })
    }

    const row = await loadNotebookState(userId)
    return jsonNoStore({
      ok: true,
      state: row?.payload ?? defaultNotebookState(),
      updatedAt: row?.updatedAt ?? null,
    })
  } catch (error) {
    try {
      console.error("[NotebookState] failed_to_load_notebook_state", {
        error: error instanceof Error ? error.message : String(error),
      })
    } catch {
      // Ignore logging failures.
    }
    return degradedNotebookResponse()
  }
}

export async function POST(req: Request) {
  try {
    const { sanitizeNotebookState } = await import("@/lib/notebook")
    const { saveNotebookState } = await import("@/lib/server/notebookStateStore")
    const { jsonNoStore, sameOriginRequestError } = await import("@/lib/server/requestSecurity")
    const { readUserIdFromRequest } = await import("@/lib/server/readUserId")
    const { userHasCompletedServiceConsent } = await import("@/lib/server/serviceConsentStore")

    const sameOriginError = sameOriginRequestError(req)
    if (sameOriginError) {
      return jsonNoStore({ ok: false, error: sameOriginError }, { status: 403 })
    }

    let body: unknown
    try {
      body = await req.json()
    } catch {
      return jsonNoStore({ ok: false, error: "invalid json" }, { status: 400 })
    }

    const userId = await readUserIdFromRequest(req)
    const state = (body as { state?: unknown } | null)?.state

    if (!userId) return jsonNoStore({ ok: false, error: "login required" }, { status: 401 })
    if (!state) return jsonNoStore({ ok: false, error: "state required" }, { status: 400 })

    if (!(await userHasCompletedServiceConsent(userId))) {
      return jsonNoStore({ ok: false, error: "consent_required" }, { status: 403 })
    }

    await saveNotebookState({ userId, payload: sanitizeNotebookState(state) })
    return jsonNoStore({ ok: true, syncedAt: new Date().toISOString() })
  } catch (error) {
    try {
      console.error("[NotebookState] failed_to_save_notebook_state", {
        error: error instanceof Error ? error.message : String(error),
      })
    } catch {
      // Ignore logging failures.
    }
    if (isNotebookStateStorageUnavailable(error)) {
      return NextResponse.json(
        { ok: true, syncedAt: null, degraded: true, localOnly: true },
        {
          status: 200,
          headers: {
            "Cache-Control": "private, no-store, max-age=0",
            Pragma: "no-cache",
          },
        }
      )
    }
    return NextResponse.json(
      { ok: false, error: "failed_to_save_notebook_state" },
      {
        status: 500,
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
          Pragma: "no-cache",
        },
      }
    )
  }
}
