import {
  createMemoAttachment,
  createMemoBlock,
  sanitizeNotebookTags,
  type RNestMemoAttachment,
  type RNestMemoBlock,
  type RNestMemoDocument,
  type RNestMemoLockEnvelope,
} from "@/lib/notebook"

const LOCK_ITERATIONS = 180000
const LOCK_VERSION = 1
const encoder = new TextEncoder()
const decoder = new TextDecoder()

export type RNestLockedMemoPayload = {
  version: 1
  tags: string[]
  blocks: RNestMemoBlock[]
  attachments: RNestMemoAttachment[]
}

function getCryptoOrThrow() {
  if (!globalThis.crypto?.subtle) {
    throw new Error("이 브라우저에서는 잠금 메모를 지원하지 않습니다.")
  }
  return globalThis.crypto
}

function bytesToBase64(bytes: Uint8Array) {
  if (typeof btoa === "function") {
    let binary = ""
    for (const byte of bytes) binary += String.fromCharCode(byte)
    return btoa(binary)
  }
  const bufferCtor = (globalThis as typeof globalThis & {
    Buffer?: { from: (value: Uint8Array) => { toString: (encoding: string) => string } }
  }).Buffer
  if (bufferCtor) return bufferCtor.from(bytes).toString("base64")
  throw new Error("Base64 인코딩을 지원하지 않는 환경입니다.")
}

function base64ToBytes(value: string) {
  if (typeof atob === "function") {
    const binary = atob(value)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes
  }
  const bufferCtor = (globalThis as typeof globalThis & {
    Buffer?: { from: (value: string, encoding: string) => Uint8Array }
  }).Buffer
  if (bufferCtor) return new Uint8Array(bufferCtor.from(value, "base64"))
  throw new Error("Base64 디코딩을 지원하지 않는 환경입니다.")
}

function uniqueBlobKeys(keys: string[]) {
  return Array.from(new Set(keys.filter(Boolean)))
}

function toArrayBuffer(bytes: Uint8Array) {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

function sanitizeBlocks(blocks: unknown) {
  if (!Array.isArray(blocks)) return [createMemoBlock("paragraph")]
  const next = blocks
    .map((block) =>
      block && typeof block === "object" && typeof (block as RNestMemoBlock).type === "string"
        ? createMemoBlock((block as RNestMemoBlock).type, block as RNestMemoBlock)
        : null
    )
    .filter((block): block is RNestMemoBlock => Boolean(block))
  return next.length > 0 ? next : [createMemoBlock("paragraph")]
}

function sanitizeAttachments(attachments: unknown) {
  if (!Array.isArray(attachments)) return []
  return attachments
    .map((attachment) =>
      attachment && typeof attachment === "object"
        ? createMemoAttachment(attachment as Partial<RNestMemoAttachment> & { storagePath: string })
        : null
    )
    .filter((attachment): attachment is RNestMemoAttachment => Boolean(attachment))
}

function normalizeLockedPayload(payload: Partial<RNestLockedMemoPayload>): RNestLockedMemoPayload {
  return {
    version: 1,
    tags: sanitizeNotebookTags(payload.tags),
    blocks: sanitizeBlocks(payload.blocks),
    attachments: sanitizeAttachments(payload.attachments),
  }
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number) {
  const crypto = getCryptoOrThrow()
  const material = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveKey"])
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: toArrayBuffer(salt),
      iterations,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  )
}

async function encryptWithKey(
  payload: RNestLockedMemoPayload,
  key: CryptoKey,
  saltB64: string,
  hint: string,
  iterations: number
): Promise<RNestMemoLockEnvelope> {
  const crypto = getCryptoOrThrow()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toArrayBuffer(iv) },
    key,
    encoder.encode(JSON.stringify(payload))
  )
  return {
    version: LOCK_VERSION,
    algorithm: "PBKDF2-AES-GCM",
    iterations,
    saltB64,
    ivB64: bytesToBase64(iv),
    cipherB64: bytesToBase64(new Uint8Array(cipherBuffer)),
    hint: String(hint ?? "").trim().slice(0, 80),
    lockedAt: Date.now(),
  }
}

export function createLockedMemoPayloadFromDocument(document: RNestMemoDocument): RNestLockedMemoPayload {
  return normalizeLockedPayload({
    tags: document.tags,
    blocks: document.blocks,
    attachments: document.attachments,
  })
}

export function applyLockedMemoPayload(
  document: RNestMemoDocument,
  payload: RNestLockedMemoPayload | null | undefined
): RNestMemoDocument {
  if (!payload) return document
  const normalized = normalizeLockedPayload(payload)
  const attachmentStoragePaths = uniqueBlobKeys([
    ...(document.attachmentStoragePaths ?? []),
    ...normalized.attachments.map((attachment) => attachment.storagePath),
  ])
  return {
    ...document,
    tags: normalized.tags,
    blocks: normalized.blocks,
    attachments: normalized.attachments,
    attachmentStoragePaths,
  }
}

export function createLockedMemoSnapshot(document: RNestMemoDocument, envelope: RNestMemoLockEnvelope): RNestMemoDocument {
  const payload = createLockedMemoPayloadFromDocument(document)
  return {
    ...document,
    tags: [],
    blocks: [],
    attachments: [],
    attachmentStoragePaths: uniqueBlobKeys([
      ...(document.attachmentStoragePaths ?? []),
      ...payload.attachments.map((attachment) => attachment.storagePath),
    ]),
    lock: envelope,
  }
}

export function removeLockedMemoSnapshot(
  document: RNestMemoDocument,
  payload: RNestLockedMemoPayload
): RNestMemoDocument {
  const next = applyLockedMemoPayload({ ...document, lock: null }, payload)
  return {
    ...next,
    lock: null,
    attachmentStoragePaths: uniqueBlobKeys(next.attachments.map((attachment) => attachment.storagePath)),
  }
}

export async function createLockedMemoEnvelope(password: string, payload: RNestLockedMemoPayload, hint: string) {
  const crypto = getCryptoOrThrow()
  const normalized = normalizeLockedPayload(payload)
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const key = await deriveKey(password, salt, LOCK_ITERATIONS)
  const envelope = await encryptWithKey(normalized, key, bytesToBase64(salt), hint, LOCK_ITERATIONS)
  return { envelope, key, payload: normalized }
}

export async function unlockLockedMemoEnvelope(password: string, envelope: RNestMemoLockEnvelope) {
  try {
    const salt = base64ToBytes(envelope.saltB64)
    const iv = base64ToBytes(envelope.ivB64)
    const cipher = base64ToBytes(envelope.cipherB64)
    const key = await deriveKey(password, salt, envelope.iterations)
    const plainBuffer = await getCryptoOrThrow().subtle.decrypt(
      { name: "AES-GCM", iv: toArrayBuffer(iv) },
      key,
      toArrayBuffer(cipher)
    )
    const parsed = JSON.parse(decoder.decode(plainBuffer)) as Partial<RNestLockedMemoPayload>
    return {
      key,
      payload: normalizeLockedPayload(parsed),
    }
  } catch {
    throw new Error("암호가 올바르지 않거나 잠금 데이터를 열 수 없습니다.")
  }
}

export async function reencryptLockedMemoEnvelope(
  payload: RNestLockedMemoPayload,
  envelope: RNestMemoLockEnvelope,
  key: CryptoKey
) {
  return encryptWithKey(normalizeLockedPayload(payload), key, envelope.saltB64, envelope.hint, envelope.iterations)
}
