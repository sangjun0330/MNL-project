import { defaultNotebookState, sanitizeNotebookState } from "@/lib/notebook"
import { loadNotebookState, saveNotebookState } from "@/lib/server/notebookStateStore"
import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity"
import { readUserIdFromRequest } from "@/lib/server/readUserId"
import { userHasCompletedServiceConsent } from "@/lib/server/serviceConsentStore"

export const runtime = "edge"
export const dynamic = "force-dynamic"

function bad(status: number, message: string) {
  return jsonNoStore({ ok: false, error: message }, { status })
}

export async function GET(req: Request) {
  let userId = ""
  try {
    userId = await readUserIdFromRequest(req)
    if (!userId) return bad(401, "login required")

    if (!(await userHasCompletedServiceConsent(userId))) {
      return bad(403, "consent_required")
    }

    const row = await loadNotebookState(userId)
    return jsonNoStore({
      ok: true,
      state: row?.payload ?? defaultNotebookState(),
      updatedAt: row?.updatedAt ?? null,
    })
  } catch (error) {
    console.error("[NotebookState] failed_to_load_notebook_state", {
      userId,
      error: error instanceof Error ? error.message : String(error),
    })
    return jsonNoStore({
      ok: true,
      state: defaultNotebookState(),
      updatedAt: null,
      degraded: true,
    })
  }
}

export async function POST(req: Request) {
  const sameOriginError = sameOriginRequestError(req)
  if (sameOriginError) return bad(403, sameOriginError)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return bad(400, "invalid json")
  }

  let userId = ""
  try {
    userId = await readUserIdFromRequest(req)
    const state = (body as { state?: unknown } | null)?.state

    if (!userId) return bad(401, "login required")
    if (!state) return bad(400, "state required")

    if (!(await userHasCompletedServiceConsent(userId))) {
      return bad(403, "consent_required")
    }

    await saveNotebookState({ userId, payload: sanitizeNotebookState(state) })
    return jsonNoStore({ ok: true, syncedAt: new Date().toISOString() })
  } catch (error) {
    console.error("[NotebookState] failed_to_save_notebook_state", {
      userId,
      error: error instanceof Error ? error.message : String(error),
    })
    return bad(500, "failed_to_save_notebook_state")
  }
}
