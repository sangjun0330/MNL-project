import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin"

export const NOTEBOOK_STORAGE_BUCKET =
  process.env.SUPABASE_NOTEBOOK_BUCKET ||
  process.env.NEXT_PUBLIC_SUPABASE_NOTEBOOK_BUCKET ||
  "rnest-notebook"

const MAX_FILE_SIZE = 12 * 1024 * 1024
const MAX_STORAGE_PATH_LENGTH = 240
const NOTEBOOK_SIGNED_URL_TTL_SECONDS = 60 * 60

function isImageType(type: string) {
  return type.startsWith("image/")
}

function normalizeNotebookStoragePath(path: string) {
  const trimmed = String(path ?? "").trim()
  if (!trimmed || trimmed.length > MAX_STORAGE_PATH_LENGTH) return ""
  if (trimmed.includes("\\") || trimmed.includes("..")) return ""
  const normalized = trimmed.replace(/^\/+/, "")
  return normalized
}

function toAbsoluteSignedUrl(url: string) {
  const trimmed = String(url ?? "").trim()
  if (!trimmed) return ""
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim()
  if (!supabaseUrl) return trimmed
  try {
    return new URL(trimmed, supabaseUrl).toString()
  } catch {
    return trimmed
  }
}

async function ensureNotebookBucket() {
  const admin: any = getSupabaseAdmin()
  const { data: existing } = await admin.storage.getBucket(NOTEBOOK_STORAGE_BUCKET)
  if (existing?.id) return
  await admin.storage.createBucket(NOTEBOOK_STORAGE_BUCKET, {
    public: false,
    fileSizeLimit: `${MAX_FILE_SIZE}`,
  })
}

function isNotebookBucketMissingError(error: unknown) {
  const message = String((error as { message?: unknown } | null)?.message ?? "").toLowerCase()
  const statusCode = Number((error as { statusCode?: unknown } | null)?.statusCode ?? NaN)
  return (
    statusCode === 404 ||
    message.includes("bucket not found") ||
    message.includes("not found") ||
    (message.includes("bucket") && message.includes("does not exist"))
  )
}

export function isNotebookStoragePathOwnedByUser(userId: string, path: string) {
  const normalized = normalizeNotebookStoragePath(path)
  return Boolean(normalized) && normalized.startsWith(`${userId}/`)
}

export async function uploadNotebookFile(input: {
  userId: string
  file?: File
  fileName?: string
  mimeType?: string
  size?: number
  bytes?: ArrayBuffer
  preferredKind?: "image" | "scan" | "file" | "pdf"
}) {
  const fileName = input.file?.name || input.fileName || "upload"
  const mimeType = input.file?.type || input.mimeType || "application/octet-stream"
  const size = input.file?.size ?? input.size ?? 0
  const body = input.bytes ?? (input.file ? await input.file.arrayBuffer() : null)

  if (!body) {
    throw new Error("file_required")
  }

  if (size > MAX_FILE_SIZE) {
    throw new Error("file_too_large")
  }

  const safeName = fileName.replace(/[^\w.\-() ]+/g, "_").trim() || "upload"
  const ext =
    safeName.includes(".") ? safeName.split(".").pop()?.slice(0, 12).toLowerCase() ?? "" : ""
  const path = `${input.userId}/${crypto.randomUUID()}${ext ? `.${ext}` : ""}`
  const admin: any = getSupabaseAdmin()

  let { error } = await admin.storage.from(NOTEBOOK_STORAGE_BUCKET).upload(path, body, {
    contentType: mimeType,
    upsert: false,
  })

  if (error && isNotebookBucketMissingError(error)) {
    await ensureNotebookBucket()
    const retry = await admin.storage.from(NOTEBOOK_STORAGE_BUCKET).upload(path, body, {
      contentType: mimeType,
      upsert: false,
    })
    error = retry.error
  }

  if (error) {
    throw error
  }

  const kind =
    input.preferredKind ||
    (isImageType(mimeType) ? "image" : mimeType === "application/pdf" ? "pdf" : "file")

  return {
    id: crypto.randomUUID(),
    storagePath: path,
    name: fileName || "첨부 파일",
    mimeType,
    size,
    kind,
    createdAt: Date.now(),
  }
}

export async function createNotebookSignedUrls(input: { userId: string; paths: string[] }) {
  const admin: any = getSupabaseAdmin()
  const ownedPaths = Array.from(
    new Set(
      input.paths
        .map((path) => normalizeNotebookStoragePath(path))
        .filter((path) => isNotebookStoragePathOwnedByUser(input.userId, path))
    )
  )
  if (ownedPaths.length === 0) return {}

  const { data, error } = await admin.storage.from(NOTEBOOK_STORAGE_BUCKET).createSignedUrls(ownedPaths, NOTEBOOK_SIGNED_URL_TTL_SECONDS)
  if (error) throw error

  const out: Record<string, string> = {}
  for (const item of data ?? []) {
    if (!item?.path || !item?.signedUrl) continue
    out[item.path] = toAbsoluteSignedUrl(item.signedUrl)
  }
  return out
}

export async function removeNotebookFiles(input: { userId: string; paths: string[] }) {
  const admin: any = getSupabaseAdmin()
  const ownedPaths = Array.from(
    new Set(
      input.paths
        .map((path) => normalizeNotebookStoragePath(path))
        .filter((path) => isNotebookStoragePathOwnedByUser(input.userId, path))
    )
  )
  if (ownedPaths.length === 0) return
  await admin.storage.from(NOTEBOOK_STORAGE_BUCKET).remove(ownedPaths)
}

export async function downloadNotebookFile(input: { userId: string; path: string }) {
  const admin: any = getSupabaseAdmin()
  const path = normalizeNotebookStoragePath(input.path)
  if (!isNotebookStoragePathOwnedByUser(input.userId, path)) {
    throw new Error("forbidden_notebook_file")
  }

  const { data, error } = await admin.storage.from(NOTEBOOK_STORAGE_BUCKET).download(path)
  if (error) throw error

  return {
    path,
    blob: data as Blob,
  }
}
