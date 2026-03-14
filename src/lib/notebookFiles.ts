import { createMemoAttachment, type RNestMemoAttachment } from "@/lib/notebook"
import { getBrowserAuthHeaders } from "@/lib/auth"

type NotebookImagePreviewCacheEntry = {
  url: string
  kind: "blob" | "signed" | "proxy"
  expiresAt: number | null
}

const NOTEBOOK_SIGNED_URL_CACHE_MS = 55 * 60 * 1000
const NOTEBOOK_PROXY_URL_CACHE_MS = 15 * 1000

const notebookImagePreviewCache = new Map<string, NotebookImagePreviewCacheEntry>()
const notebookImagePreviewPromiseCache = new Map<string, Promise<string>>()

async function parseJson(response: Response) {
  return response.json().catch(() => null)
}

function revokePreviewEntry(entry: NotebookImagePreviewCacheEntry | undefined) {
  if (!entry) return
  if (entry.kind === "blob" && entry.url.startsWith("blob:")) {
    URL.revokeObjectURL(entry.url)
  }
}

function clearPreviewPromise(path: string, request?: Promise<string>) {
  if (!request || notebookImagePreviewPromiseCache.get(path) === request) {
    notebookImagePreviewPromiseCache.delete(path)
  }
}

function setNotebookImagePreviewCache(path: string, entry: NotebookImagePreviewCacheEntry) {
  const existing = notebookImagePreviewCache.get(path)
  if (existing?.url === entry.url && existing?.kind === entry.kind && existing?.expiresAt === entry.expiresAt) return
  revokePreviewEntry(existing)
  notebookImagePreviewCache.set(path, entry)
}

function getNotebookImagePreviewCacheEntry(path: string) {
  const cached = notebookImagePreviewCache.get(path)
  if (!cached) return null
  if (cached.expiresAt && cached.expiresAt <= Date.now()) {
    revokePreviewEntry(cached)
    notebookImagePreviewCache.delete(path)
    return null
  }
  return cached
}

function normalizeSignedNotebookFileUrl(url: string) {
  const trimmed = url.trim()
  if (!trimmed) return ""
  return trimmed
}

async function requestSignedNotebookImageUrl(path: string) {
  const urls = await requestNotebookSignedUrls([path])
  const signedUrl = normalizeSignedNotebookFileUrl(String(urls[path] ?? ""))
  if (!signedUrl) {
    throw new Error("notebook_image_url_missing")
  }
  return signedUrl
}

export async function requestNotebookSignedUrls(paths: string[]) {
  const uniquePaths = Array.from(new Set(paths.map((path) => String(path ?? "").trim()).filter(Boolean)))
  if (uniquePaths.length === 0) return {} as Record<string, string>
  const authHeaders = await getBrowserAuthHeaders()

  const response = await fetch("/api/tools/notebook/files/sign", {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...authHeaders,
    },
    body: JSON.stringify({ paths: uniquePaths }),
    cache: "no-store",
  })

  const payload = await parseJson(response)
  if (!response.ok || !payload?.ok) {
    throw new Error(String(payload?.error ?? "failed_to_create_notebook_file_urls"))
  }

  const urls = Object.fromEntries(
    Object.entries(payload?.urls ?? {}).map(([path, url]) => [path, normalizeSignedNotebookFileUrl(String(url ?? ""))])
  ) as Record<string, string>

  return urls
}

export async function loadNotebookFileAccessUrl(path: string, options?: { download?: boolean }) {
  const trimmedPath = String(path ?? "").trim()
  if (!trimmedPath) throw new Error("path_required")
  try {
    const urls = await requestNotebookSignedUrls([trimmedPath])
    const signedUrl = normalizeSignedNotebookFileUrl(String(urls[trimmedPath] ?? ""))
    if (signedUrl) return signedUrl
  } catch {
    // Fall back to proxy URL when signed URL creation fails.
  }
  return buildNotebookFileUrl(trimmedPath, options)
}

export async function uploadNotebookFile(file: File, preferredKind?: RNestMemoAttachment["kind"]) {
  const form = new FormData()
  form.set("file", file)
  if (preferredKind) form.set("preferredKind", preferredKind)
  const authHeaders = await getBrowserAuthHeaders()

  const response = await fetch("/api/tools/notebook/files", {
    method: "POST",
    body: form,
    credentials: "include",
    headers: authHeaders,
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
  return getNotebookImagePreviewCacheEntry(path)?.url ?? null
}

export function clearNotebookImagePreview(path: string) {
  const cached = notebookImagePreviewCache.get(path)
  revokePreviewEntry(cached)
  notebookImagePreviewCache.delete(path)
  notebookImagePreviewPromiseCache.delete(path)
}

export function seedNotebookImagePreview(path: string, file: File) {
  if (!path || !file.type.startsWith("image/")) return null
  const existing = getNotebookImagePreviewCacheEntry(path)
  if (existing) return existing.url
  const previewUrl = URL.createObjectURL(file)
  setNotebookImagePreviewCache(path, {
    url: previewUrl,
    kind: "blob",
    expiresAt: null,
  })
  return previewUrl
}

export async function loadNotebookImagePreview(path: string, options?: { forceRefresh?: boolean }) {
  if (!path) throw new Error("path_required")
  if (options?.forceRefresh) {
    clearNotebookImagePreview(path)
  }

  const cached = getNotebookImagePreviewCacheEntry(path)
  if (cached) return cached.url

  const pending = options?.forceRefresh ? null : notebookImagePreviewPromiseCache.get(path)
  if (pending) return pending

  const request = (async () => {
    try {
      const signedUrl = await requestSignedNotebookImageUrl(path)
      setNotebookImagePreviewCache(path, {
        url: signedUrl,
        kind: "signed",
        expiresAt: Date.now() + NOTEBOOK_SIGNED_URL_CACHE_MS,
      })
      return signedUrl
    } catch (signedError) {
      const proxyUrl = buildNotebookFileUrl(path)
      setNotebookImagePreviewCache(path, {
        url: proxyUrl,
        kind: "proxy",
        expiresAt: Date.now() + NOTEBOOK_PROXY_URL_CACHE_MS,
      })
      return proxyUrl
    }
  })()

  const wrappedRequest = request
    .then((url) => {
      clearPreviewPromise(path, wrappedRequest)
      return url
    })
    .catch((error) => {
      clearPreviewPromise(path, wrappedRequest)
      throw error
    })

  notebookImagePreviewPromiseCache.set(path, wrappedRequest)
  return wrappedRequest
}

export async function deleteNotebookFiles(paths: string[]) {
  if (paths.length === 0) return
  for (const path of paths) {
    clearNotebookImagePreview(path)
  }
  const authHeaders = await getBrowserAuthHeaders()
  await fetch("/api/tools/notebook/files", {
    method: "DELETE",
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...authHeaders,
    },
    body: JSON.stringify({ paths }),
  })
}
