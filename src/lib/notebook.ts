import type { ISODate } from "@/lib/date"

export type RNestMemoBlockType =
  | "paragraph"
  | "heading"
  | "bulleted"
  | "numbered"
  | "checklist"
  | "callout"
  | "quote"
  | "toggle"
  | "divider"
  | "table"
  | "bookmark"
  | "image"
  | "attachment"

export type RNestMemoTableRow = {
  id: string
  left: string
  right: string
}

export type RNestMemoTable = {
  columns: [string, string]
  rows: RNestMemoTableRow[]
}

export type RNestMemoAttachmentKind = "image" | "pdf" | "file" | "scan"

export type RNestMemoAttachment = {
  id: string
  storagePath: string
  name: string
  mimeType: string
  size: number
  kind: RNestMemoAttachmentKind
  createdAt: number
}

export type RNestMemoLockEnvelope = {
  version: 1
  algorithm: "PBKDF2-AES-GCM"
  iterations: number
  saltB64: string
  ivB64: string
  cipherB64: string
  hint: string
  lockedAt: number
}

export const memoHighlightColors = [
  "yellow",
  "green",
  "blue",
  "pink",
  "orange",
  "purple",
] as const

export type RNestMemoHighlightColor = (typeof memoHighlightColors)[number]

export type RNestMemoBlock = {
  id: string
  type: RNestMemoBlockType
  text?: string
  detailText?: string
  attachmentId?: string
  mediaWidth?: number
  mediaAspectRatio?: number
  checked?: boolean
  collapsed?: boolean
  highlight?: RNestMemoHighlightColor | null
  table?: RNestMemoTable
}

export type RNestMemoDocument = {
  id: string
  title: string
  icon: string
  coverStyle: string | null
  pinned: boolean
  favorite: boolean
  trashedAt: number | null
  reminderAt: number | null
  tags: string[]
  blocks: RNestMemoBlock[]
  attachments: RNestMemoAttachment[]
  attachmentStoragePaths: string[]
  lock: RNestMemoLockEnvelope | null
  createdAt: number
  updatedAt: number
}

export type RNestMemoState = {
  documents: Record<string, RNestMemoDocument | undefined>
  recent: string[]
}

export type RNestRecordFieldType =
  | "text"
  | "number"
  | "date"
  | "time"
  | "singleSelect"
  | "multiSelect"
  | "checkbox"
  | "checklist"
  | "note"

export type RNestRecordField = {
  id: string
  label: string
  type: RNestRecordFieldType
  options?: string[]
  required?: boolean
}

export type RNestRecordFilter = {
  id: string
  fieldId: string
  operator: "equals" | "contains" | "checked" | "unchecked" | "includesAny"
  value?: string | number | boolean | null
  values?: string[]
}

export type RNestRecordSort = {
  fieldId: string
  direction: "asc" | "desc"
}

export type RNestRecordTemplate = {
  id: string
  name: string
  icon: string
  fields: RNestRecordField[]
  defaultSort: RNestRecordSort
  defaultFilters: RNestRecordFilter[]
  trashedAt: number | null
  createdAt: number
  updatedAt: number
}

export type RNestChecklistItem = {
  id: string
  label: string
  checked: boolean
}

export type RNestRecordValue = string | number | boolean | string[] | RNestChecklistItem[] | null

export type RNestRecordEntry = {
  id: string
  templateId: string
  title: string
  values: Record<string, RNestRecordValue | undefined>
  tags: string[]
  favorite: boolean
  trashedAt: number | null
  createdAt: number
  updatedAt: number
}

export type RNestRecordState = {
  templates: Record<string, RNestRecordTemplate | undefined>
  entries: Record<string, RNestRecordEntry | undefined>
  recent: string[]
}

export type RNestNotebookState = {
  memo: RNestMemoState
  records: RNestRecordState
}

export type RNestMemoPreset = {
  id: string
  label: string
  description: string
  icon: string
  create: () => RNestMemoDocument
}

export const memoIconOptions = [
  "note",
  "page",
  "check",
  "table",
  "folder",
  "clip",
  "leaf",
  "idea",
  "book",
  "spark",
  "moon",
  "pin",
] as const

export type RNestMemoIconId = (typeof memoIconOptions)[number]

export const memoCoverOptions = [
  "lavender-glow",
  "soft-sky",
  "mint-fog",
  "sunset-blush",
  "midnight-ink",
  "paper-grid",
] as const

export type RNestMemoCoverId = (typeof memoCoverOptions)[number]

const MAX_TITLE_LENGTH = 80
const MAX_TAG_LENGTH = 24
const MAX_TAGS = 8
const MAX_BLOCK_TEXT_LENGTH = 4000
const MAX_BLOCKS = 64
const MAX_TABLE_ROWS = 20
const MAX_MEMO_ATTACHMENTS = 10
const MAX_ATTACHMENT_NAME_LENGTH = 120
const MAX_ATTACHMENT_STORAGE_PATH_LENGTH = 240
const MAX_LOCK_HINT_LENGTH = 80
const MAX_RECORD_FIELDS = 16
const MAX_SELECT_OPTIONS = 10

function sanitizeMediaWidth(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 100
  return Math.min(100, Math.max(20, Math.round(value)))
}

function sanitizeMediaAspectRatio(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined
  return Math.min(3, Math.max(0.4, Number(value.toFixed(4))))
}
const MAX_RECORD_TITLE_LENGTH = 80

function nowTs() {
  return Date.now()
}

export function createNotebookId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`
}

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return ""
  return value.replace(/\r/g, "").replace(/\u0000/g, "").trim().slice(0, maxLength)
}

function normalizeMemoIcon(value: unknown, fallback: RNestMemoIconId): RNestMemoIconId {
  const raw = cleanText(value, 24)
  const legacyMap: Record<string, RNestMemoIconId> = {
    "📝": "note",
    "🗒": "note",
    "📄": "page",
    "✅": "check",
    "📋": "table",
    "📊": "table",
    "🗂": "folder",
    "🧾": "clip",
    "🌿": "leaf",
    "💡": "idea",
    "📚": "book",
    "🫧": "spark",
    "🌙": "moon",
    "📌": "pin",
  }
  const normalized = (legacyMap[raw] ?? raw) as RNestMemoIconId
  return memoIconOptions.includes(normalized) ? normalized : fallback
}

function normalizeMemoCover(value: unknown): RNestMemoCoverId | null {
  const raw = cleanText(value, 32)
  if (!raw) return null
  return memoCoverOptions.includes(raw as RNestMemoCoverId) ? (raw as RNestMemoCoverId) : null
}

export function sanitizeNotebookTags(value: unknown) {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const item of value) {
    const next = cleanText(item, MAX_TAG_LENGTH)
    if (!next || seen.has(next)) continue
    seen.add(next)
    out.push(next)
    if (out.length >= MAX_TAGS) break
  }
  return out
}

function sanitizeIcon(value: unknown, fallback: string) {
  const text = cleanText(value, 24)
  return text || fallback
}

function normalizeAttachmentKind(value: unknown, fallback: RNestMemoAttachmentKind): RNestMemoAttachmentKind {
  const raw = cleanText(value, 12)
  return raw === "image" || raw === "pdf" || raw === "file" || raw === "scan" ? raw : fallback
}

function sanitizeMemoAttachment(value: unknown): RNestMemoAttachment | null {
  if (!value || typeof value !== "object") return null
  const source = value as Record<string, unknown>
  const mimeType = cleanText(source.mimeType, 80).toLowerCase()
  const fallbackKind: RNestMemoAttachmentKind =
    mimeType.startsWith("image/")
      ? "image"
      : mimeType === "application/pdf"
        ? "pdf"
        : "file"
  const storagePath =
    cleanText(source.storagePath, MAX_ATTACHMENT_STORAGE_PATH_LENGTH) ||
    cleanText(source.blobKey, MAX_ATTACHMENT_STORAGE_PATH_LENGTH)
  if (!storagePath) return null
  return {
    id: cleanText(source.id, 60) || createNotebookId("memo_attachment"),
    storagePath,
    name: cleanText(source.name, MAX_ATTACHMENT_NAME_LENGTH) || "첨부 파일",
    mimeType,
    size:
      typeof source.size === "number" && Number.isFinite(source.size) && source.size >= 0
        ? Math.min(Math.round(source.size), 100 * 1024 * 1024)
        : 0,
    kind: normalizeAttachmentKind(source.kind, fallbackKind),
    createdAt:
      typeof source.createdAt === "number" && Number.isFinite(source.createdAt)
        ? source.createdAt
        : nowTs(),
  }
}

export function createMemoAttachment(input: Partial<RNestMemoAttachment> & { storagePath: string }) {
  return sanitizeMemoAttachment(input)
}

function sanitizeMemoAttachments(value: unknown) {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const attachments: RNestMemoAttachment[] = []
  for (const item of value) {
    const attachment = sanitizeMemoAttachment(item)
    if (!attachment || seen.has(attachment.id)) continue
    seen.add(attachment.id)
    attachments.push(attachment)
    if (attachments.length >= MAX_MEMO_ATTACHMENTS) break
  }
  return attachments
}

function sanitizeAttachmentStoragePaths(value: unknown, attachments: RNestMemoAttachment[]) {
  const seen = new Set<string>()
  const out: string[] = []

  for (const attachment of attachments) {
    if (!attachment.storagePath || seen.has(attachment.storagePath)) continue
    seen.add(attachment.storagePath)
    out.push(attachment.storagePath)
  }

  if (!Array.isArray(value)) return out
  for (const item of value) {
    const next = cleanText(item, MAX_ATTACHMENT_STORAGE_PATH_LENGTH)
    if (!next || seen.has(next)) continue
    seen.add(next)
    out.push(next)
    if (out.length >= MAX_MEMO_ATTACHMENTS) break
  }
  return out.slice(0, MAX_MEMO_ATTACHMENTS)
}

function sanitizeMemoLockEnvelope(value: unknown): RNestMemoLockEnvelope | null {
  if (!value || typeof value !== "object") return null
  const source = value as Record<string, unknown>
  const version = source.version === 1 ? 1 : null
  const algorithm = cleanText(source.algorithm, 24)
  const iterations =
    typeof source.iterations === "number" && Number.isFinite(source.iterations)
      ? Math.max(10000, Math.min(Math.round(source.iterations), 500000))
      : 180000
  const saltB64 = cleanText(source.saltB64, 4096)
  const ivB64 = cleanText(source.ivB64, 128)
  const cipherB64 = cleanText(source.cipherB64, 200000)
  if (!version || algorithm !== "PBKDF2-AES-GCM" || !saltB64 || !ivB64 || !cipherB64) return null
  return {
    version,
    algorithm: "PBKDF2-AES-GCM",
    iterations,
    saltB64,
    ivB64,
    cipherB64,
    hint: cleanText(source.hint, MAX_LOCK_HINT_LENGTH),
    lockedAt:
      typeof source.lockedAt === "number" && Number.isFinite(source.lockedAt)
        ? source.lockedAt
        : nowTs(),
  }
}

export function defaultMemoState(): RNestMemoState {
  return {
    documents: {},
    recent: [],
  }
}

export function defaultRecordState(): RNestRecordState {
  return {
    templates: {},
    entries: {},
    recent: [],
  }
}

export function defaultNotebookState(): RNestNotebookState {
  return {
    memo: defaultMemoState(),
    records: defaultRecordState(),
  }
}

export function createMemoTableRow(left = "", right = ""): RNestMemoTableRow {
  return {
    id: createNotebookId("memo_row"),
    left: cleanText(left, 500),
    right: cleanText(right, 500),
  }
}

export function createMemoBlock(type: RNestMemoBlockType, input?: Partial<RNestMemoBlock>): RNestMemoBlock {
  if (type === "image" || type === "attachment") {
    return {
      id: input?.id ?? createNotebookId("memo_block"),
      type,
      text: cleanText(input?.text, 240),
      detailText: undefined,
      attachmentId: cleanText(input?.attachmentId, 60) || undefined,
      mediaWidth: type === "image" ? sanitizeMediaWidth(input?.mediaWidth) : undefined,
      mediaAspectRatio: type === "image" ? sanitizeMediaAspectRatio(input?.mediaAspectRatio) : undefined,
    }
  }

  if (type === "table") {
    return {
      id: input?.id ?? createNotebookId("memo_block"),
      type,
      table: {
        columns: [
          cleanText(input?.table?.columns?.[0], 40) || "항목",
          cleanText(input?.table?.columns?.[1], 40) || "내용",
        ],
        rows:
          input?.table?.rows?.slice(0, MAX_TABLE_ROWS).map((row) => ({
            id: row.id || createNotebookId("memo_row"),
            left: cleanText(row.left, 500),
            right: cleanText(row.right, 500),
          })) ?? [createMemoTableRow()],
      },
    }
  }

  if (type === "divider") {
    return {
      id: input?.id ?? createNotebookId("memo_block"),
      type,
    }
  }

  return {
    id: input?.id ?? createNotebookId("memo_block"),
    type,
    text: cleanText(input?.text, MAX_BLOCK_TEXT_LENGTH),
    detailText:
      type === "toggle" || type === "bookmark"
        ? cleanText(input?.detailText, type === "bookmark" ? 240 : MAX_BLOCK_TEXT_LENGTH)
        : undefined,
    attachmentId: undefined,
    mediaWidth: undefined,
    mediaAspectRatio: undefined,
    checked: type === "checklist" ? Boolean(input?.checked) : undefined,
    collapsed: type === "toggle" ? Boolean(input?.collapsed) : undefined,
    highlight: input?.highlight && memoHighlightColors.includes(input.highlight) ? input.highlight : undefined,
  }
}

export function coerceMemoBlockType(block: RNestMemoBlock, nextType: RNestMemoBlockType): RNestMemoBlock {
  if (block.type === nextType) return block

  const preservedText =
    block.type === "table"
      ? [
          block.table?.columns.join(" / ") ?? "",
          ...(block.table?.rows.map((row) => `${row.left} ${row.right}`) ?? []),
        ]
          .join("\n")
          .trim()
      : cleanText(block.text, MAX_BLOCK_TEXT_LENGTH)

  if (nextType === "table") {
    return createMemoBlock("table", {
      id: block.id,
      table: {
        columns: ["항목", "내용"],
        rows: preservedText ? [createMemoTableRow(preservedText, "")] : [createMemoTableRow()],
      },
    })
  }

  if (nextType === "divider") {
    return createMemoBlock("divider", { id: block.id })
  }

  if (nextType === "bookmark") {
    const trimmed = preservedText.trim()
    const looksLikeUrl = /^(https?:\/\/|mailto:|www\.)/i.test(trimmed)
    return createMemoBlock("bookmark", {
      id: block.id,
      text: looksLikeUrl ? trimmed : "",
      detailText: looksLikeUrl ? cleanText(block.detailText, 240) : trimmed,
    })
  }

  return createMemoBlock(nextType, {
    id: block.id,
    text: preservedText,
    detailText: nextType === "toggle" ? cleanText(block.detailText, MAX_BLOCK_TEXT_LENGTH) : undefined,
    checked: nextType === "checklist" ? Boolean(block.checked) : undefined,
    collapsed: nextType === "toggle" ? Boolean(block.collapsed) : undefined,
  })
}

function createMemoDocumentBase(input?: Partial<RNestMemoDocument>): RNestMemoDocument {
  const timestamp = nowTs()
  const lock = sanitizeMemoLockEnvelope(input?.lock)
  const candidateBlocks =
    input?.blocks?.slice(0, MAX_BLOCKS).map((block) => createMemoBlock(block.type, block)) ?? []
  const blocks = lock
    ? []
    : candidateBlocks.length > 0
      ? candidateBlocks
      : [createMemoBlock("paragraph")]
  const attachments = lock ? [] : sanitizeMemoAttachments(input?.attachments)
  const attachmentStoragePaths = sanitizeAttachmentStoragePaths(
    (input as Partial<RNestMemoDocument> & { attachmentStoragePaths?: string[]; attachmentBlobKeys?: string[] })
      ?.attachmentStoragePaths ??
      (input as Partial<RNestMemoDocument> & { attachmentBlobKeys?: string[] })?.attachmentBlobKeys,
    attachments
  )

  return {
    id: input?.id ?? createNotebookId("memo_doc"),
    title: input?.title != null ? cleanText(input.title, MAX_TITLE_LENGTH) : "새 메모",
    icon: normalizeMemoIcon(input?.icon, "note"),
    coverStyle: normalizeMemoCover(input?.coverStyle),
    pinned: Boolean(input?.pinned),
    favorite: Boolean(input?.favorite),
    trashedAt: typeof input?.trashedAt === "number" && Number.isFinite(input.trashedAt) ? input.trashedAt : null,
    reminderAt:
      lock || typeof input?.reminderAt !== "number" || !Number.isFinite(input.reminderAt) ? null : input.reminderAt,
    tags: lock ? [] : sanitizeNotebookTags(input?.tags),
    blocks,
    attachments,
    attachmentStoragePaths,
    lock,
    createdAt: typeof input?.createdAt === "number" && Number.isFinite(input.createdAt) ? input.createdAt : timestamp,
    updatedAt: typeof input?.updatedAt === "number" && Number.isFinite(input.updatedAt) ? input.updatedAt : timestamp,
  }
}

export const memoPresets: RNestMemoPreset[] = [
  {
    id: "quick",
    label: "빠른 메모",
    description: "완전 빈 캔버스 — 바로 타이핑을 시작하세요",
    icon: "spark",
    create: () =>
      createMemoDocumentBase({
        title: "",
        icon: "spark",
        coverStyle: null,
        blocks: [createMemoBlock("paragraph")],
      }),
  },
  {
    id: "blank",
    label: "빈 메모",
    description: "바로 입력을 시작하는 자유 메모",
    icon: "note",
    create: () =>
      createMemoDocumentBase({
        title: "빈 메모",
        icon: "note",
        coverStyle: null,
        blocks: [createMemoBlock("paragraph")],
      }),
  },
  {
    id: "free",
    label: "자유 메모",
    description: "짧은 정리와 핵심 메모를 빠르게 남기는 형식",
    icon: "page",
    create: () =>
      createMemoDocumentBase({
        title: "자유 메모",
        icon: "page",
        coverStyle: "lavender-glow",
        blocks: [
          createMemoBlock("heading", { text: "핵심 요약" }),
          createMemoBlock("paragraph", { text: "" }),
          createMemoBlock("callout", { text: "잊지 말아야 할 한 줄을 남겨두세요." }),
        ],
      }),
  },
  {
    id: "checklist",
    label: "체크리스트 메모",
    description: "해야 할 일과 확인 포인트를 정리하는 형식",
    icon: "check",
    create: () =>
      createMemoDocumentBase({
        title: "체크리스트 메모",
        icon: "check",
        coverStyle: "mint-fog",
        blocks: [
          createMemoBlock("heading", { text: "오늘 체크할 것" }),
          createMemoBlock("checklist", { text: "첫 번째 항목", checked: false }),
          createMemoBlock("checklist", { text: "두 번째 항목", checked: false }),
          createMemoBlock("checklist", { text: "세 번째 항목", checked: false }),
        ],
      }),
  },
  {
    id: "table",
    label: "표 포함 메모",
    description: "비교 정리나 짧은 기록표가 필요한 형식",
    icon: "table",
    create: () =>
      createMemoDocumentBase({
        title: "표 포함 메모",
        icon: "table",
        coverStyle: "soft-sky",
        blocks: [
          createMemoBlock("heading", { text: "표 메모" }),
          createMemoBlock("table", {
            table: {
              columns: ["항목", "내용"],
              rows: [createMemoTableRow("예시", "내용을 입력하세요.")],
            },
          }),
        ],
      }),
  },
]

export function createMemoFromPreset(presetId: string) {
  const preset = memoPresets.find((item) => item.id === presetId) ?? memoPresets[0]
  return preset.create()
}

export function hasMeaningfulMemoState(state: RNestMemoState | null | undefined) {
  if (!state) return false
  return Object.values(state.documents ?? {}).some((document) => Boolean(document))
}

export function memoBlockToPlainText(block: RNestMemoBlock) {
  switch (block.type) {
    case "image":
      return [cleanText(block.text, 240), "[이미지]"].filter(Boolean).join(" ")
    case "attachment":
      return [cleanText(block.text, 240), "[파일]"].filter(Boolean).join(" ")
    case "table":
      return [
        block.table?.columns.join(" | ") ?? "",
        ...(block.table?.rows.map((row) => `${row.left} | ${row.right}`) ?? []),
      ]
        .join("\n")
        .trim()
    case "divider":
      return "---"
    case "checklist":
      return `${block.checked ? "[x]" : "[ ]"} ${cleanText(block.text, MAX_BLOCK_TEXT_LENGTH)}`
    case "quote":
      return `> ${cleanText(block.text, MAX_BLOCK_TEXT_LENGTH)}`
    case "toggle":
      return [cleanText(block.text, 240), cleanText(block.detailText, MAX_BLOCK_TEXT_LENGTH)].filter(Boolean).join("\n")
    case "bookmark":
      return [cleanText(block.text, 240), cleanText(block.detailText, 240)].filter(Boolean).join(" ")
    default:
      return cleanText(block.text, MAX_BLOCK_TEXT_LENGTH)
  }
}

export function memoDocumentToPlainText(document: RNestMemoDocument) {
  return [
    cleanText(document.title, MAX_TITLE_LENGTH),
    document.attachments.length > 0
      ? `첨부: ${document.attachments.map((attachment) => cleanText(attachment.name, MAX_ATTACHMENT_NAME_LENGTH)).join(", ")}`
      : "",
    ...document.blocks.map((block) => memoBlockToPlainText(block)),
  ]
    .filter(Boolean)
    .join("\n\n")
    .trim()
}

function escapeMarkdownCell(value: string) {
  return value.replace(/\|/g, "\\|").replace(/\n/g, " ")
}

export function memoDocumentToMarkdown(document: RNestMemoDocument) {
  const lines: string[] = [`# ${document.title}`]
  if (document.attachments.length > 0) {
    lines.push("## 첨부")
    for (const attachment of document.attachments) {
      lines.push(`- ${cleanText(attachment.name, MAX_ATTACHMENT_NAME_LENGTH)}`)
    }
  }
  for (const block of document.blocks) {
    if (block.type === "image") {
      const label = cleanText(block.text, 240)
      lines.push(label ? `![${label}](이미지)` : "![이미지](이미지)")
      continue
    }
    if (block.type === "attachment") {
      const label = cleanText(block.text, 240) || "파일"
      lines.push(`- [파일] ${label}`)
      continue
    }
    if (block.type === "divider") {
      lines.push("---")
      continue
    }
    if (block.type === "table") {
      const columns = block.table?.columns ?? ["항목", "내용"]
      lines.push(`| ${escapeMarkdownCell(columns[0])} | ${escapeMarkdownCell(columns[1])} |`)
      lines.push("| --- | --- |")
      for (const row of block.table?.rows ?? []) {
        lines.push(`| ${escapeMarkdownCell(row.left)} | ${escapeMarkdownCell(row.right)} |`)
      }
      continue
    }
    const text = cleanText(block.text, MAX_BLOCK_TEXT_LENGTH)
    if (!text) {
      lines.push("")
      continue
    }
    switch (block.type) {
      case "heading":
        lines.push(`## ${text}`)
        break
      case "bulleted":
        lines.push(`- ${text}`)
        break
      case "numbered":
        lines.push(`1. ${text}`)
        break
      case "checklist":
        lines.push(`- [${block.checked ? "x" : " "}] ${text}`)
        break
      case "callout":
        lines.push(`> ${text}`)
        break
      case "quote":
        lines.push(`> ${text}`)
        break
      case "toggle": {
        const detail = cleanText(block.detailText, MAX_BLOCK_TEXT_LENGTH)
        const safeTitle = text || "토글"
        if (detail) {
          lines.push(`<details>\n<summary>${safeTitle}</summary>\n\n${detail}\n</details>`)
        } else {
          lines.push(`<details>\n<summary>${safeTitle}</summary>\n</details>`)
        }
        break
      }
      case "bookmark": {
        const label = cleanText(block.detailText, 240) || text
        lines.push(text ? `[${label}](${text})` : label)
        break
      }
      default:
        lines.push(text)
        break
    }
  }
  return lines.join("\n\n").replace(/\n{3,}/g, "\n\n").trim()
}

export function sanitizeMemoState(raw: unknown): RNestMemoState {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  const documentsSource =
    source.documents && typeof source.documents === "object" ? (source.documents as Record<string, unknown>) : {}
  const documents: Record<string, RNestMemoDocument | undefined> = {}

  for (const [id, value] of Object.entries(documentsSource)) {
    if (!value || typeof value !== "object") continue
    const doc = createMemoDocumentBase({
      ...(value as Partial<RNestMemoDocument>),
      id,
      blocks: Array.isArray((value as RNestMemoDocument).blocks)
        ? (value as RNestMemoDocument).blocks
        : [createMemoBlock("paragraph")],
    })
    documents[doc.id] = doc
  }

  const recentSource = Array.isArray(source.recent) ? source.recent : []
  const recent = recentSource
    .map((item) => (typeof item === "string" ? item : ""))
    .filter((id, index, list) => Boolean(id) && Boolean(documents[id]) && list.indexOf(id) === index)
    .slice(0, 20)

  return {
    documents,
    recent,
  }
}

export function createRecordField(type: RNestRecordFieldType, input?: Partial<RNestRecordField>): RNestRecordField {
  const labelFallback =
    type === "text"
      ? "텍스트"
      : type === "number"
        ? "숫자"
        : type === "date"
          ? "날짜"
          : type === "time"
            ? "시간"
            : type === "singleSelect"
              ? "단일 선택"
              : type === "multiSelect"
                ? "다중 선택"
                : type === "checkbox"
                  ? "체크"
                  : type === "checklist"
                    ? "체크리스트"
                    : "메모"

  return {
    id: input?.id ?? createNotebookId("record_field"),
    label: cleanText(input?.label, 30) || labelFallback,
    type,
    options:
      type === "singleSelect" || type === "multiSelect"
        ? sanitizeNotebookTags(input?.options).slice(0, MAX_SELECT_OPTIONS)
        : undefined,
    required: Boolean(input?.required),
  }
}

export function createChecklistItem(label = "", checked = false): RNestChecklistItem {
  return {
    id: createNotebookId("check_item"),
    label: cleanText(label, 120),
    checked,
  }
}

export function createRecordTemplateSnapshot(input?: Partial<RNestRecordTemplate>): RNestRecordTemplate {
  const timestamp = nowTs()
  const fields =
    input?.fields?.slice(0, MAX_RECORD_FIELDS).map((field) => createRecordField(field.type, field)) ?? [
      createRecordField("text", { label: "내용" }),
    ]
  return {
    id: input?.id ?? createNotebookId("record_template"),
    name: cleanText(input?.name, 40) || "새 기록지",
    icon: sanitizeIcon(input?.icon, "folder"),
    fields,
    defaultSort:
      input?.defaultSort && typeof input.defaultSort.fieldId === "string"
        ? {
            fieldId: input.defaultSort.fieldId,
            direction: input.defaultSort.direction === "asc" ? "asc" : "desc",
          }
        : { fieldId: "updatedAt", direction: "desc" },
    defaultFilters:
      Array.isArray(input?.defaultFilters)
        ? input.defaultFilters
            .filter((filter) => typeof filter?.fieldId === "string" && typeof filter?.operator === "string")
            .slice(0, 6)
            .map((filter) => ({
              id: filter.id || createNotebookId("record_filter"),
              fieldId: filter.fieldId,
              operator:
                filter.operator === "checked" ||
                filter.operator === "unchecked" ||
                filter.operator === "includesAny" ||
                filter.operator === "equals" ||
                filter.operator === "contains"
                  ? filter.operator
                  : "equals",
              value: filter.value ?? null,
              values: Array.isArray(filter.values) ? sanitizeNotebookTags(filter.values) : undefined,
            }))
        : [],
    trashedAt: typeof input?.trashedAt === "number" && Number.isFinite(input.trashedAt) ? input.trashedAt : null,
    createdAt: typeof input?.createdAt === "number" && Number.isFinite(input.createdAt) ? input.createdAt : timestamp,
    updatedAt: typeof input?.updatedAt === "number" && Number.isFinite(input.updatedAt) ? input.updatedAt : timestamp,
  }
}

export const builtinRecordTemplates: RNestRecordTemplate[] = [
  createRecordTemplateSnapshot({
    id: "builtin_free",
    name: "자유 기록지",
    icon: "note",
    fields: [
      createRecordField("date", { id: "date", label: "날짜", required: true }),
      createRecordField("text", { id: "focus", label: "핵심" }),
      createRecordField("note", { id: "note", label: "메모" }),
    ],
    defaultSort: { fieldId: "date", direction: "desc" },
  }),
  createRecordTemplateSnapshot({
    id: "builtin_check",
    name: "체크 기록지",
    icon: "check",
    fields: [
      createRecordField("date", { id: "date", label: "날짜", required: true }),
      createRecordField("checkbox", { id: "done", label: "완료" }),
      createRecordField("checklist", { id: "items", label: "체크 항목" }),
      createRecordField("note", { id: "note", label: "메모" }),
    ],
    defaultSort: { fieldId: "date", direction: "desc" },
  }),
  createRecordTemplateSnapshot({
    id: "builtin_table",
    name: "표형 기록지",
    icon: "table",
    fields: [
      createRecordField("date", { id: "date", label: "날짜", required: true }),
      createRecordField("singleSelect", { id: "category", label: "분류", options: ["A", "B", "C"] }),
      createRecordField("number", { id: "value", label: "수치" }),
      createRecordField("note", { id: "note", label: "메모" }),
    ],
    defaultSort: { fieldId: "date", direction: "desc" },
  }),
  createRecordTemplateSnapshot({
    id: "builtin_reflection",
    name: "회고 기록지",
    icon: "moon",
    fields: [
      createRecordField("date", { id: "date", label: "날짜", required: true }),
      createRecordField("singleSelect", {
        id: "mood",
        label: "컨디션",
        options: ["좋음", "보통", "지침"],
      }),
      createRecordField("note", { id: "what_went_well", label: "잘 된 점" }),
      createRecordField("note", { id: "next_step", label: "다음 액션" }),
    ],
    defaultSort: { fieldId: "date", direction: "desc" },
  }),
]

export function isBuiltinRecordTemplateId(templateId: string) {
  return builtinRecordTemplates.some((template) => template.id === templateId)
}

export function resolveRecordTemplate(
  templateId: string,
  customTemplates: Record<string, RNestRecordTemplate | undefined>
) {
  return customTemplates[templateId] ?? builtinRecordTemplates.find((template) => template.id === templateId) ?? null
}

function defaultValueForField(field: RNestRecordField): RNestRecordValue {
  switch (field.type) {
    case "checkbox":
      return false
    case "multiSelect":
      return []
    case "checklist":
      return []
    default:
      return null
  }
}

export function normalizeEntryValuesForTemplate(
  values: Record<string, RNestRecordValue | undefined>,
  template: RNestRecordTemplate
) {
  const next: Record<string, RNestRecordValue | undefined> = {}
  for (const field of template.fields) {
    const raw = values[field.id]
    if (field.type === "checkbox") {
      next[field.id] = Boolean(raw)
      continue
    }
    if (field.type === "multiSelect" || field.type === "checklist") {
      if (field.type === "multiSelect") {
        next[field.id] = Array.isArray(raw) ? sanitizeNotebookTags(raw) : (defaultValueForField(field) as string[])
        continue
      }
      next[field.id] = Array.isArray(raw)
        ? raw
            .filter((item) => item && typeof item === "object")
            .slice(0, 20)
            .map((item) => ({
              id:
                typeof (item as RNestChecklistItem).id === "string" && (item as RNestChecklistItem).id
                  ? (item as RNestChecklistItem).id
                  : createNotebookId("check_item"),
              label: cleanText((item as RNestChecklistItem).label, 120),
              checked: Boolean((item as RNestChecklistItem).checked),
            }))
            .filter((item) => item.label)
        : []
      continue
    }
    if (field.type === "number") {
      const numeric = Number(raw)
      next[field.id] = Number.isFinite(numeric) ? numeric : null
      continue
    }
    if (field.type === "date") {
      next[field.id] = typeof raw === "string" ? cleanText(raw, 20) : null
      continue
    }
    if (field.type === "time") {
      next[field.id] = typeof raw === "string" ? cleanText(raw, 10) : null
      continue
    }
    next[field.id] = typeof raw === "string" ? cleanText(raw, field.type === "note" ? 1000 : 240) : null
  }
  return next
}

export function createRecordEntryFromTemplate(
  template: RNestRecordTemplate,
  input?: Partial<RNestRecordEntry> & { copyFrom?: RNestRecordEntry | null }
) {
  const timestamp = nowTs()
  const copiedValues =
    input?.copyFrom && input.copyFrom.templateId === template.id ? normalizeEntryValuesForTemplate(input.copyFrom.values, template) : {}
  const baseValues: Record<string, RNestRecordValue | undefined> = {}
  for (const field of template.fields) {
    baseValues[field.id] = defaultValueForField(field)
  }
  return {
    id: input?.id ?? createNotebookId("record_entry"),
    templateId: template.id,
    title: cleanText(input?.title, MAX_RECORD_TITLE_LENGTH) || `${template.name} 항목`,
    values: normalizeEntryValuesForTemplate({ ...baseValues, ...copiedValues, ...(input?.values ?? {}) }, template),
    tags: sanitizeNotebookTags(input?.tags),
    favorite: Boolean(input?.favorite),
    trashedAt: typeof input?.trashedAt === "number" && Number.isFinite(input.trashedAt) ? input.trashedAt : null,
    createdAt: typeof input?.createdAt === "number" && Number.isFinite(input.createdAt) ? input.createdAt : timestamp,
    updatedAt: typeof input?.updatedAt === "number" && Number.isFinite(input.updatedAt) ? input.updatedAt : timestamp,
  }
}

export function createCustomTemplateFromBase(template: RNestRecordTemplate) {
  return createRecordTemplateSnapshot({
    ...template,
    id: createNotebookId("record_template"),
    createdAt: nowTs(),
    updatedAt: nowTs(),
  })
}

export function hasMeaningfulRecordState(state: RNestRecordState | null | undefined) {
  if (!state) return false
  return (
    Object.values(state.templates ?? {}).some((template) => Boolean(template)) ||
    Object.values(state.entries ?? {}).some((entry) => Boolean(entry))
  )
}

export function hasMeaningfulNotebookState(state: RNestNotebookState | null | undefined) {
  if (!state) return false
  return hasMeaningfulMemoState(state.memo) || hasMeaningfulRecordState(state.records)
}

export function sanitizeRecordState(raw: unknown): RNestRecordState {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  const templatesSource =
    source.templates && typeof source.templates === "object" ? (source.templates as Record<string, unknown>) : {}
  const templates: Record<string, RNestRecordTemplate | undefined> = {}

  for (const [id, value] of Object.entries(templatesSource)) {
    if (!value || typeof value !== "object") continue
    templates[id] = createRecordTemplateSnapshot({
      ...(value as Partial<RNestRecordTemplate>),
      id,
      fields: Array.isArray((value as RNestRecordTemplate).fields) ? (value as RNestRecordTemplate).fields : [],
    })
  }

  const entriesSource =
    source.entries && typeof source.entries === "object" ? (source.entries as Record<string, unknown>) : {}
  const entries: Record<string, RNestRecordEntry | undefined> = {}
  for (const [id, value] of Object.entries(entriesSource)) {
    if (!value || typeof value !== "object") continue
    const templateId = typeof (value as RNestRecordEntry).templateId === "string" ? (value as RNestRecordEntry).templateId : ""
    const template = resolveRecordTemplate(templateId, templates)
    if (!template) continue
    entries[id] = createRecordEntryFromTemplate(template, {
      ...(value as Partial<RNestRecordEntry>),
      id,
      templateId,
      values:
        (value as RNestRecordEntry).values && typeof (value as RNestRecordEntry).values === "object"
          ? ((value as RNestRecordEntry).values as Record<string, RNestRecordValue | undefined>)
          : {},
    })
  }

  const recentSource = Array.isArray(source.recent) ? source.recent : []
  const recent = recentSource
    .map((item) => (typeof item === "string" ? item : ""))
    .filter((id, index, list) => Boolean(id) && Boolean(entries[id]) && list.indexOf(id) === index)
    .slice(0, 24)

  return {
    templates,
    entries,
    recent,
  }
}

export function recordFieldValueToText(value: RNestRecordValue | undefined) {
  if (Array.isArray(value) && value.every((item) => item && typeof item === "object")) {
    return value
      .map((item) => `${(item as RNestChecklistItem).checked ? "[x]" : "[ ]"} ${(item as RNestChecklistItem).label}`)
      .join(", ")
  }
  if (Array.isArray(value)) return value.join(", ")
  if (typeof value === "boolean") return value ? "true" : "false"
  if (typeof value === "number") return String(value)
  if (typeof value === "string") return value
  return ""
}

export function recordEntrySearchText(entry: RNestRecordEntry, template: RNestRecordTemplate) {
  return [
    entry.title,
    entry.tags.join(" "),
    ...template.fields.map((field) => recordFieldValueToText(entry.values[field.id])),
  ]
    .join(" ")
    .trim()
    .toLowerCase()
}

export function recordEntrySummary(entry: RNestRecordEntry, template: RNestRecordTemplate) {
  const parts: string[] = []
  for (const field of template.fields) {
    const raw = recordFieldValueToText(entry.values[field.id])
    if (!raw) continue
    parts.push(`${field.label}: ${raw}`)
    if (parts.length >= 3) break
  }
  return parts
}

function csvEscape(value: string) {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export function recordEntriesToCsv(template: RNestRecordTemplate, entries: RNestRecordEntry[]) {
  const headers = ["title", "favorite", "createdAt", "updatedAt", "tags", ...template.fields.map((field) => field.label)]
  const rows = entries.map((entry) => {
    return [
      entry.title,
      entry.favorite ? "true" : "false",
      String(entry.createdAt),
      String(entry.updatedAt),
      entry.tags.join("|"),
      ...template.fields.map((field) => recordFieldValueToText(entry.values[field.id])),
    ]
  })

  return [headers, ...rows]
    .map((row) => row.map((cell) => csvEscape(cell)).join(","))
    .join("\n")
}

export const notebookEmojiOptions = [...memoIconOptions]

export function sanitizeNotebookState(raw: unknown): RNestNotebookState {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  return {
    memo: sanitizeMemoState(source.memo),
    records: sanitizeRecordState(source.records),
  }
}

export const memoReminderPresets: Array<{ id: string; label: string; minutes: number }> = [
  { id: "none", label: "없음", minutes: 0 },
  { id: "30m", label: "30분 뒤", minutes: 30 },
  { id: "2h", label: "2시간 뒤", minutes: 120 },
  { id: "tomorrow", label: "내일 오전 9시", minutes: -1 },
]

export function getReminderTimestampFromPreset(presetId: string) {
  if (presetId === "none") return null
  if (presetId === "tomorrow") {
    const base = new Date()
    base.setDate(base.getDate() + 1)
    base.setHours(9, 0, 0, 0)
    return base.getTime()
  }
  const preset = memoReminderPresets.find((item) => item.id === presetId)
  return preset ? nowTs() + preset.minutes * 60 * 1000 : null
}

export function formatNotebookDateTime(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "-"
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(
    2,
    "0"
  )} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
}

export function isoFromTimestamp(value: number) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "" as ISODate
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(
    2,
    "0"
  )}` as ISODate
}
