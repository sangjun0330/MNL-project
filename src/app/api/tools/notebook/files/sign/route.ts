import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity"
import { readUserIdFromRequest } from "@/lib/server/readUserId"
import { createNotebookSignedUrls } from "@/lib/server/notebookFileStore"
import { userHasCompletedServiceConsent } from "@/lib/server/serviceConsentStore"

export const runtime = "edge"
export const dynamic = "force-dynamic"

function bad(status: number, error: string) {
  return jsonNoStore({ ok: false, error }, { status })
}

export async function POST(req: Request) {
  const originError = sameOriginRequestError(req)
  if (originError) return bad(403, originError)

  let userId = ""
  try {
    userId = await readUserIdFromRequest(req)
    if (!userId) return bad(401, "login_required")
    if (!(await userHasCompletedServiceConsent(userId))) return bad(403, "consent_required")

    const body = await req.json().catch(() => null)
    const paths = Array.isArray(body?.paths) ? body.paths.filter((item: unknown) => typeof item === "string") : []
    if (paths.length === 0) return jsonNoStore({ ok: true, urls: {} })

    const urls = await createNotebookSignedUrls({ userId, paths })
    return jsonNoStore({ ok: true, urls })
  } catch (error) {
    console.error("[NotebookFilesSign] failed_to_create_notebook_file_urls", {
      userId,
      error: error instanceof Error ? error.message : String(error),
    })
    return bad(500, "failed_to_create_notebook_file_urls")
  }
}
