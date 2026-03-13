import { buildPrivateNoStoreHeaders, jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity"
import { userHasCompletedServiceConsent } from "@/lib/server/serviceConsentStore"
import { readUserIdFromRequest } from "@/lib/server/readUserId"
import { downloadNotebookFile, removeNotebookFiles, uploadNotebookFile } from "@/lib/server/notebookFileStore"

export const runtime = "edge"
export const dynamic = "force-dynamic"

function bad(status: number, error: string) {
  return jsonNoStore({ ok: false, error }, { status })
}

function encodeContentDispositionFileName(fileName: string) {
  return encodeURIComponent(fileName).replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
}

function guessFileNameFromPath(path: string) {
  const parts = path.split("/")
  return parts[parts.length - 1] || "file"
}

function buildNotebookFileHeaders(input: {
  contentType: string
  contentDisposition: string
  download: boolean
}) {
  const headers = buildPrivateNoStoreHeaders({
    "Content-Type": input.contentType,
    "Content-Disposition": input.contentDisposition,
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "same-origin",
  })
  if (!input.download) {
    headers.set("Cache-Control", "private, max-age=120, stale-while-revalidate=600")
    headers.delete("Pragma")
  }
  return headers
}

export async function GET(req: Request) {
  const userId = await readUserIdFromRequest(req)
  if (!userId) return new Response("login_required", { status: 401, headers: buildPrivateNoStoreHeaders() })
  if (!(await userHasCompletedServiceConsent(userId))) {
    return new Response("consent_required", { status: 403, headers: buildPrivateNoStoreHeaders() })
  }

  const url = new URL(req.url)
  const path = String(url.searchParams.get("path") ?? "").trim()
  const download = url.searchParams.get("download") === "1"
  if (!path) {
    return new Response("path_required", { status: 400, headers: buildPrivateNoStoreHeaders() })
  }

  try {
    const { blob } = await downloadNotebookFile({ userId, path })
    const fileName = guessFileNameFromPath(path)
    const headers = buildNotebookFileHeaders({
      contentType: blob.type || "application/octet-stream",
      contentDisposition: `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeContentDispositionFileName(fileName)}`,
      download,
    })
    return new Response(await blob.arrayBuffer(), { status: 200, headers })
  } catch (error) {
    const message = error instanceof Error ? error.message : ""
    if (message === "forbidden_notebook_file") {
      return new Response("forbidden_notebook_file", { status: 403, headers: buildPrivateNoStoreHeaders() })
    }
    return new Response("failed_to_open_notebook_file", { status: 500, headers: buildPrivateNoStoreHeaders() })
  }
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
