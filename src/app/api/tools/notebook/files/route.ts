import { buildPrivateNoStoreHeaders, jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity"

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

function isNotebookFileMissingError(error: unknown) {
  const statusCode = Number((error as { statusCode?: unknown } | null)?.statusCode ?? NaN)
  const message = String((error as { message?: unknown } | null)?.message ?? "").toLowerCase()
  return (
    statusCode === 404 ||
    message.includes("not found") ||
    message.includes("object not found") ||
    message.includes("no such file")
  )
}

function decodeUploadFileName(value: string) {
  const trimmed = String(value ?? "").trim()
  if (!trimmed) return ""
  try {
    return decodeURIComponent(trimmed)
  } catch {
    return trimmed
  }
}

function normalizePreferredKind(value: string): "image" | "scan" | "file" | "pdf" | undefined {
  const trimmed = String(value ?? "").trim()
  return trimmed === "image" || trimmed === "scan" || trimmed === "file" || trimmed === "pdf" ? trimmed : undefined
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const path = String(url.searchParams.get("path") ?? "").trim()
  const download = url.searchParams.get("download") === "1"
  if (!path) {
    return new Response("path_required", { status: 400, headers: buildPrivateNoStoreHeaders() })
  }

  let userId = ""
  try {
    const { readUserIdFromRequest } = await import("@/lib/server/readUserId")
    const { userHasCompletedServiceConsent } = await import("@/lib/server/serviceConsentStore")
    const { downloadNotebookFile } = await import("@/lib/server/notebookFileStore")
    userId = await readUserIdFromRequest(req)
    if (!userId) return new Response("login_required", { status: 401, headers: buildPrivateNoStoreHeaders() })
    if (!(await userHasCompletedServiceConsent(userId))) {
      return new Response("consent_required", { status: 403, headers: buildPrivateNoStoreHeaders() })
    }

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
    if (isNotebookFileMissingError(error)) {
      return new Response("notebook_file_not_found", { status: 404, headers: buildPrivateNoStoreHeaders() })
    }
    console.error("[NotebookFiles] failed_to_open_notebook_file", {
      userId,
      path,
      download,
      error: error instanceof Error ? error.message : String(error),
    })
    return new Response("failed_to_open_notebook_file", { status: 500, headers: buildPrivateNoStoreHeaders() })
  }
}

export async function POST(req: Request) {
  const originError = sameOriginRequestError(req)
  if (originError) return bad(403, originError)

  let userId = ""
  try {
    const { readUserIdFromRequest } = await import("@/lib/server/readUserId")
    const { userHasCompletedServiceConsent } = await import("@/lib/server/serviceConsentStore")
    const { uploadNotebookFile } = await import("@/lib/server/notebookFileStore")
    userId = await readUserIdFromRequest(req)
    if (!userId) return bad(401, "login_required")
    if (!(await userHasCompletedServiceConsent(userId))) return bad(403, "consent_required")

    const headerFileName = decodeUploadFileName(req.headers.get("x-rnest-file-name") ?? "")
    const headerFileType = String(req.headers.get("x-rnest-file-type") ?? "").trim() || "application/octet-stream"
    let file: File | null = null
    let rawBytes: ArrayBuffer | null = null
    let preferredKind = normalizePreferredKind(req.headers.get("x-rnest-file-kind") ?? "")

    if (headerFileName) {
      const body = await req.arrayBuffer().catch(() => null)
      if (body) {
        rawBytes = body
      }
    }

    if (!rawBytes) {
      const form = await req.formData().catch(() => null)
      const formFile = form?.get("file")
      preferredKind = preferredKind ?? normalizePreferredKind(String(form?.get("preferredKind") ?? ""))
      if (formFile instanceof File) {
        file = formFile
      }
    }

    if (!(file instanceof File) && !rawBytes) return bad(400, "file_required")

    const attachment = await uploadNotebookFile({
      userId,
      file: file ?? undefined,
      fileName: headerFileName || file?.name,
      mimeType: headerFileType || file?.type,
      size: rawBytes?.byteLength ?? file?.size ?? 0,
      bytes: rawBytes ?? undefined,
      preferredKind,
    })
    return jsonNoStore({ ok: true, attachment })
  } catch (error) {
    const message = error instanceof Error ? error.message : ""
    if (message.includes("file_too_large")) return bad(400, "file_too_large")
    console.error("[NotebookFiles] failed_to_upload_notebook_file", {
      userId,
      error: error instanceof Error ? error.message : String(error),
    })
    return bad(500, "failed_to_upload_notebook_file")
  }
}

export async function DELETE(req: Request) {
  const originError = sameOriginRequestError(req)
  if (originError) return bad(403, originError)

  let userId = ""
  try {
    const { readUserIdFromRequest } = await import("@/lib/server/readUserId")
    const { removeNotebookFiles } = await import("@/lib/server/notebookFileStore")
    userId = await readUserIdFromRequest(req)
    if (!userId) return bad(401, "login_required")

    const body = await req.json().catch(() => null)
    const paths = Array.isArray(body?.paths) ? body.paths.filter((item: unknown) => typeof item === "string") : []
    if (paths.length === 0) return jsonNoStore({ ok: true })

    await removeNotebookFiles({ userId, paths })
    return jsonNoStore({ ok: true })
  } catch (error) {
    console.error("[NotebookFiles] failed_to_remove_notebook_file", {
      userId,
      error: error instanceof Error ? error.message : String(error),
    })
    return bad(500, "failed_to_remove_notebook_file")
  }
}
