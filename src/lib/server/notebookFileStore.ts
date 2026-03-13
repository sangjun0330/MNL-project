import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin"

export const NOTEBOOK_STORAGE_BUCKET =
  process.env.SUPABASE_NOTEBOOK_BUCKET ||
  process.env.NEXT_PUBLIC_SUPABASE_NOTEBOOK_BUCKET ||
  "rnest-notebook"

const MAX_FILE_SIZE = 12 * 1024 * 1024
const MAX_STORAGE_PATH_LENGTH = 240

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

async function ensureNotebookBucket() {
  const admin: any = getSupabaseAdmin()
  const { data: existing } = await admin.storage.getBucket(NOTEBOOK_STORAGE_BUCKET)
  if (existing?.id) return
  await admin.storage.createBucket(NOTEBOOK_STORAGE_BUCKET, {
    public: false,
    fileSizeLimit: `${MAX_FILE_SIZE}`,
  })
}

export function isNotebookStoragePathOwnedByUser(userId: string, path: string) {
  const normalized = normalizeNotebookStoragePath(path)
  return Boolean(normalized) && normalized.startsWith(`${userId}/`)
}

export async function uploadNotebookFile(input: {
  userId: string
  file: File
  preferredKind?: "image" | "scan" | "file" | "pdf"
}) {
  if (input.file.size > MAX_FILE_SIZE) {
    throw new Error("file_too_large")
  }

  const file = input.file
  const safeName = file.name.replace(/[^\w.\-() ]+/g, "_").trim() || "upload"
  const ext =
    safeName.includes(".") ? safeName.split(".").pop()?.slice(0, 12).toLowerCase() ?? "" : ""
  const path = `${input.userId}/${crypto.randomUUID()}${ext ? `.${ext}` : ""}`
  const admin: any = getSupabaseAdmin()
  const body = await file.arrayBuffer()

  await ensureNotebookBucket()

  const { error } = await admin.storage.from(NOTEBOOK_STORAGE_BUCKET).upload(path, body, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  })

  if (error) {
    throw error
  }

  const kind =
    input.preferredKind ||
    (isImageType(file.type) ? "image" : file.type === "application/pdf" ? "pdf" : "file")

  return {
    id: crypto.randomUUID(),
    storagePath: path,
    name: file.name || "첨부 파일",
    mimeType: file.type || "application/octet-stream",
    size: file.size,
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

  const { data, error } = await admin.storage.from(NOTEBOOK_STORAGE_BUCKET).createSignedUrls(ownedPaths, 30)
  if (error) throw error

  const out: Record<string, string> = {}
  for (const item of data ?? []) {
    if (!item?.path || !item?.signedUrl) continue
    out[item.path] = item.signedUrl
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
