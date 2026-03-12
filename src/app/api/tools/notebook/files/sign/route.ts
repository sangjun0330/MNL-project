import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity"
import { readUserIdFromRequest } from "@/lib/server/readUserId"
import { createNotebookSignedUrls } from "@/lib/server/notebookFileStore"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function bad(status: number, error: string) {
  return jsonNoStore({ ok: false, error }, { status })
}

export async function POST(req: Request) {
  const originError = sameOriginRequestError(req)
  if (originError) return bad(403, originError)

  const userId = await readUserIdFromRequest(req)
  if (!userId) return bad(401, "login_required")

  const body = await req.json().catch(() => null)
  const paths = Array.isArray(body?.paths) ? body.paths.filter((item: unknown) => typeof item === "string") : []
  if (paths.length === 0) return jsonNoStore({ ok: true, urls: {} })

  try {
    const urls = await createNotebookSignedUrls({ userId, paths })
    return jsonNoStore({ ok: true, urls })
  } catch {
    return bad(500, "failed_to_create_notebook_file_urls")
  }
}
