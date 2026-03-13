import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity"
import { userHasCompletedServiceConsent } from "@/lib/server/serviceConsentStore"
import { readUserIdFromRequest } from "@/lib/server/readUserId"
import { removeNotebookFiles, uploadNotebookFile } from "@/lib/server/notebookFileStore"

export const runtime = "edge"
export const dynamic = "force-dynamic"

function bad(status: number, error: string) {
  return jsonNoStore({ ok: false, error }, { status })
}

export async function POST(req: Request) {
  const originError = sameOriginRequestError(req)
  if (originError) return bad(403, originError)

  const userId = await readUserIdFromRequest(req)
  if (!userId) return bad(401, "login_required")
  if (!(await userHasCompletedServiceConsent(userId))) return bad(403, "consent_required")

  const form = await req.formData().catch(() => null)
  const file = form?.get("file")
  const preferredKind = String(form?.get("preferredKind") ?? "").trim()
  if (!(file instanceof File)) return bad(400, "file_required")

  try {
    const attachment = await uploadNotebookFile({
      userId,
      file,
      preferredKind:
        preferredKind === "image" || preferredKind === "scan" || preferredKind === "file" || preferredKind === "pdf"
          ? preferredKind
          : undefined,
    })
    return jsonNoStore({ ok: true, attachment })
  } catch (error) {
    const message = error instanceof Error ? error.message : ""
    if (message.includes("file_too_large")) return bad(400, "file_too_large")
    return bad(500, "failed_to_upload_notebook_file")
  }
}

export async function DELETE(req: Request) {
  const originError = sameOriginRequestError(req)
  if (originError) return bad(403, originError)

  const userId = await readUserIdFromRequest(req)
  if (!userId) return bad(401, "login_required")

  const body = await req.json().catch(() => null)
  const paths = Array.isArray(body?.paths) ? body.paths.filter((item: unknown) => typeof item === "string") : []
  if (paths.length === 0) return jsonNoStore({ ok: true })

  try {
    await removeNotebookFiles({ userId, paths })
    return jsonNoStore({ ok: true })
  } catch {
    return bad(500, "failed_to_remove_notebook_file")
  }
}
