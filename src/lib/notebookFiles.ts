import { createMemoAttachment, type RNestMemoAttachment } from "@/lib/notebook"

const notebookImagePreviewCache = new Map<string, string>()
const notebookImagePreviewPromiseCache = new Map<string, Promise<string>>()

async function parseJson(response: Response) {
  return response.json().catch(() => null)
}

export async function uploadNotebookFile(file: File, preferredKind?: RNestMemoAttachment["kind"]) {
  const form = new FormData()
  form.set("file", file)
  if (preferredKind) form.set("preferredKind", preferredKind)

  const response = await fetch("/api/tools/notebook/files", {
    method: "POST",
    body: form,
    credentials: "include",
  })

  const payload = await parseJson(response)
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || "failed_to_upload_notebook_file")
  }

  const attachment = createMemoAttachment(payload.attachment)
  if (!attachment) throw new Error("invalid_attachment_response")
  return attachment
}

export function buildNotebookFileUrl(path: string, options?: { download?: boolean }) {
  const params = new URLSearchParams()
  params.set("path", path)
  if (options?.download) params.set("download", "1")
  return `/api/tools/notebook/files?${params.toString()}`
}

export function getCachedNotebookImagePreview(path: string) {
  return notebookImagePreviewCache.get(path) ?? null
}

export function seedNotebookImagePreview(path: string, file: File) {
  if (!path || !file.type.startsWith("image/")) return null
  const existing = notebookImagePreviewCache.get(path)
  if (existing) return existing
  const previewUrl = URL.createObjectURL(file)
  notebookImagePreviewCache.set(path, previewUrl)
  return previewUrl
}

export async function loadNotebookImagePreview(path: string) {
  if (!path) throw new Error("path_required")
  const cached = notebookImagePreviewCache.get(path)
  if (cached) return cached

  const pending = notebookImagePreviewPromiseCache.get(path)
  if (pending) return pending

  const request = fetch(buildNotebookFileUrl(path), {
    credentials: "include",
    cache: "force-cache",
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error("failed_to_load_notebook_image_preview")
      }
      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      notebookImagePreviewCache.set(path, objectUrl)
      notebookImagePreviewPromiseCache.delete(path)
      return objectUrl
    })
    .catch((error) => {
      notebookImagePreviewPromiseCache.delete(path)
      throw error
    })

  notebookImagePreviewPromiseCache.set(path, request)
  return request
}

export async function deleteNotebookFiles(paths: string[]) {
  if (paths.length === 0) return
  for (const path of paths) {
    const cached = notebookImagePreviewCache.get(path)
    if (cached && cached.startsWith("blob:")) {
      URL.revokeObjectURL(cached)
    }
    notebookImagePreviewCache.delete(path)
    notebookImagePreviewPromiseCache.delete(path)
  }
  await fetch("/api/tools/notebook/files", {
    method: "DELETE",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ paths }),
  })
}
