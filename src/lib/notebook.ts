import type { ISODate } from "@/lib/date"
import type { Json } from "@/types/supabase"
import {
  normalizeNotebookLinkHref,
  plainTextToRichHtml,
  richHtmlToMarkdown,
  richHtmlToPlainText,
  sanitizeNotebookRichHtml,
} from "@/lib/notebookRichText"

export const notebookFeatureFlags = {
  code: true,
  tableV2: true,
  import: true,
  pageLink: true,
  pageSpacer: true,
  gallery: true,
  embed: true,
  recordView: true,
  subpages: true,
} as const

export const memoBlockTypes = [
  "paragraph",
  "heading",
  "bulleted",
  "numbered",
  "checklist",
  "callout",
  "quote",
  "toggle",
  "divider",
  "pageSpacer",
  "table",
  "bookmark",
  "image",
  "attachment",
  "code",
  "pageLink",
  "embed",
  "gallery",
  "recordView",
  "unsupported",
] as const

export type RNestMemoBlockType = (typeof memoBlockTypes)[number]
export type RNestMemoSpacerMode = "next-page" | "blank-space"

export type RNestMemoTableAlign = "left" | "center" | "right"

export type RNestMemoTableCell = {
  id: string
  text: string
  textHtml?: string
  align?: RNestMemoTableAlign
}

export type RNestMemoTableRow = {
  id: string
  left: string
  leftHtml?: string
  right: string
  rightHtml?: string
  cells?: RNestMemoTableCell[]
}

export type RNestMemoTable = {
  version?: 1 | 2
  columns: [string, string] | string[]
  columnHtml?: [string, string] | string[]
  rows: RNestMemoTableRow[]
  headerRow?: boolean
  columnWidths?: number[]
  alignments?: RNestMemoTableAlign[]
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
  textHtml?: string
  detailText?: string
  detailTextHtml?: string
  attachmentId?: string
  mediaWidth?: number
  mediaAspectRatio?: number
  mediaOffsetX?: number
  checked?: boolean
  collapsed?: boolean
  highlight?: RNestMemoHighlightColor | null
  table?: RNestMemoTable
  spacerMode?: RNestMemoSpacerMode
  spacerHeight?: number
  code?: string
  language?: string
  wrap?: boolean
  url?: string
  provider?: string
  attachmentIds?: string[]
  titleSnapshot?: string
  targetDocId?: string
  recordTemplateId?: string
  recordVisibleFieldIds?: string[]
  recordSort?: RNestRecordSort
  recordFilters?: RNestRecordFilter[]
  unsupportedType?: string
  unsupportedPayload?: Json | null
}

export type RNestMemoDocument = {
  id: string
  title: string
  titleHtml?: string
  icon: string
  coverStyle: string | null
  folderId: string | null
  parentDocId?: string | null
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

export type RNestMemoFolder = {
  id: string
  name: string
  icon: string
  createdAt: number
  updatedAt: number
}

export type RNestMemoState = {
  folders: Record<string, RNestMemoFolder | undefined>
  documents: Record<string, RNestMemoDocument | undefined>
  recent: string[]
  personalTemplates: RNestMemoTemplate[]
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

export type RNestMemoTemplate = {
  id: string
  label: string
  description: string
  icon: RNestMemoIconId
  title: string
  titleHtml?: string
  coverStyle: string | null
  tags: string[]
  blocks: RNestMemoBlock[]
  sourceDocId?: string | null
  sourceDocTitle?: string
  sourceDocUpdatedAt?: number | null
  createdAt: number
  updatedAt: number
}

export const NOTEBOOK_TEMPLATE_SYNC_EVENT_KEY = "rnest_notebook_templates_updated_at"

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
const MAX_TITLE_HTML_LENGTH = 2400
const MAX_FOLDER_NAME_LENGTH = 40
const MAX_TAG_LENGTH = 24
const MAX_TAGS = 8
const MAX_TEMPLATE_LABEL_LENGTH = 40
const MAX_TEMPLATE_DESCRIPTION_LENGTH = 160
const MAX_TEMPLATE_SOURCE_DOC_ID_LENGTH = 120
const MAX_BLOCK_TEXT_LENGTH = 4000
const MAX_BLOCK_HTML_LENGTH = 24000
const MAX_BLOCKS = 64
const MAX_MEMO_TEMPLATES = 24
const MAX_TABLE_ROWS = 20
const MAX_TABLE_COLUMNS = 8
const MAX_TABLE_CELL_TEXT_LENGTH = 500
const MAX_TABLE_CELL_HTML_LENGTH = 6000
const MAX_MEMO_ATTACHMENTS = 10
const MAX_ATTACHMENT_NAME_LENGTH = 120
const MAX_ATTACHMENT_STORAGE_PATH_LENGTH = 240
const MAX_LOCK_HINT_LENGTH = 80
const MAX_CODE_LANGUAGE_LENGTH = 24
const MAX_CODE_TEXT_LENGTH = 12000
const MAX_URL_LENGTH = 2000
const MAX_TITLE_SNAPSHOT_LENGTH = 120
const MAX_RECORD_FIELDS = 16
const MAX_SELECT_OPTIONS = 10
const MAX_RECORD_VIEW_FIELDS = 8
const DEFAULT_PAGE_SPACER_HEIGHT = 0

function sanitizeMediaWidth(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 100
  return Math.min(100, Math.max(20, Math.round(value)))
}

function sanitizeMediaAspectRatio(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined
  return Math.min(3, Math.max(0.4, Number(value.toFixed(4))))
}

function sanitizeMediaOffsetX(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, Number(value.toFixed(2))))
}
const MAX_RECORD_TITLE_LENGTH = 80

function nowTs() {
  return Date.now()
}

const memoBlockTypeSet = new Set<string>(memoBlockTypes)

export function isMemoBlockType(value: unknown): value is RNestMemoBlockType {
  return typeof value === "string" && memoBlockTypeSet.has(value)
}

export function createNotebookId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`
}

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return ""
  return value.replace(/\r/g, "").replace(/\u0000/g, "").trim().slice(0, maxLength)
}

function cleanCodeText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return ""
  return value.replace(/\r/g, "").replace(/\u0000/g, "").slice(0, maxLength)
}

function cleanRichHtml(value: unknown) {
  return sanitizeNotebookRichHtml(value, MAX_BLOCK_HTML_LENGTH)
}

function cleanTitleRichHtml(value: unknown) {
  return sanitizeNotebookRichHtml(value, MAX_TITLE_HTML_LENGTH)
}

function cleanTableCellRichHtml(value: unknown) {
  return sanitizeNotebookRichHtml(value, MAX_TABLE_CELL_HTML_LENGTH)
}

export function sanitizeNotebookUrl(value: unknown) {
  const normalized = normalizeNotebookLinkHref(typeof value === "string" ? value.slice(0, MAX_URL_LENGTH) : "")
  return normalized || ""
}

export function inferNotebookProvider(url: string) {
  const href = sanitizeNotebookUrl(url)
  if (!href) return ""
  try {
    const parsed = new URL(href)
    const host = parsed.hostname.replace(/^www\./, "")
    if (host.includes("youtube.com") || host.includes("youtu.be")) return "youtube"
    if (host.includes("x.com") || host.includes("twitter.com")) return "x"
    if (host.includes("instagram.com")) return "instagram"
    if (host.includes("github.com")) return "github"
    return host
  } catch {
    return ""
  }
}

function sanitizeUnsupportedPayload(value: unknown): Json | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  try {
    const serialized = JSON.stringify(value)
    if (!serialized || serialized.length > 24000) return null
    const parsed = JSON.parse(serialized) as unknown
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Json) : null
  } catch {
    return null
  }
}

function normalizeBlockHighlight(value: unknown) {
  return value && memoHighlightColors.includes(value as RNestMemoHighlightColor)
    ? (value as RNestMemoHighlightColor)
    : undefined
}

export function getMemoBlockText(block: Pick<RNestMemoBlock, "text" | "textHtml">) {
  const plain = cleanText(block.text, MAX_BLOCK_TEXT_LENGTH)
  if (plain) return plain
  return cleanText(richHtmlToPlainText(block.textHtml), MAX_BLOCK_TEXT_LENGTH)
}

export function getMemoBlockDetailText(block: Pick<RNestMemoBlock, "detailText" | "detailTextHtml">) {
  const plain = cleanText(block.detailText, MAX_BLOCK_TEXT_LENGTH)
  if (plain) return plain
  return cleanText(richHtmlToPlainText(block.detailTextHtml), MAX_BLOCK_TEXT_LENGTH)
}

export function getMemoDocumentTitle(document: Pick<RNestMemoDocument, "title" | "titleHtml">) {
  const plain = cleanText(document.title, MAX_TITLE_LENGTH)
  if (plain) return plain
  return cleanText(richHtmlToPlainText(document.titleHtml), MAX_TITLE_LENGTH)
}

export function getMemoTableColumnText(
  table: Pick<RNestMemoTable, "columns" | "columnHtml"> | null | undefined,
  index: number
) {
  const plain = cleanText(table?.columns?.[index], 40)
  if (plain) return plain
  return cleanText(richHtmlToPlainText(table?.columnHtml?.[index]), 40)
}

export function createMemoTableCell(text = "", input?: Partial<RNestMemoTableCell>): RNestMemoTableCell {
  const nextText =
    cleanText(input?.text ?? text, MAX_TABLE_CELL_TEXT_LENGTH) ||
    cleanText(richHtmlToPlainText(input?.textHtml), MAX_TABLE_CELL_TEXT_LENGTH)
  return {
    id: input?.id || createNotebookId("memo_cell"),
    text: nextText,
    textHtml: cleanTableCellRichHtml(input?.textHtml) || (nextText ? plainTextToRichHtml(nextText) : ""),
    align: input?.align === "center" || input?.align === "right" ? input.align : "left",
  }
}

export function getMemoBlockAttachmentIds(block: Pick<RNestMemoBlock, "attachmentId" | "attachmentIds" | "type">) {
  const ids = new Set<string>()
  if (block.attachmentId) ids.add(block.attachmentId)
  if (block.type === "gallery" && Array.isArray(block.attachmentIds)) {
    for (const item of block.attachmentIds) {
      const next = cleanText(item, 60)
      if (next) ids.add(next)
    }
  }
  return Array.from(ids)
}

export function getMemoTableRowCells(row: RNestMemoTableRow, table: RNestMemoTable | null | undefined) {
  if (Array.isArray(row.cells) && row.cells.length > 0) {
    return row.cells
      .slice(0, MAX_TABLE_COLUMNS)
      .map((cell, index) =>
        createMemoTableCell(cell.text, {
          ...cell,
          align: cell.align ?? table?.alignments?.[index] ?? "left",
        })
      )
  }
  return [
    createMemoTableCell(row.left, { id: `${row.id}_left`, textHtml: row.leftHtml, align: table?.alignments?.[0] ?? "left" }),
    createMemoTableCell(row.right, { id: `${row.id}_right`, textHtml: row.rightHtml, align: table?.alignments?.[1] ?? "left" }),
  ]
}

export function getMemoTableCellText(
  row: Pick<RNestMemoTableRow, "left" | "leftHtml" | "right" | "rightHtml" | "cells">,
  side: "left" | "right" | number
) {
  if (typeof side === "number") {
    const cell = row.cells?.[side]
    const plain = cleanText(cell?.text, MAX_TABLE_CELL_TEXT_LENGTH)
    if (plain) return plain
    return cleanText(richHtmlToPlainText(cell?.textHtml), MAX_TABLE_CELL_TEXT_LENGTH)
  }
  const plain = cleanText(row[side], MAX_TABLE_CELL_TEXT_LENGTH)
  if (plain) return plain
  return cleanText(richHtmlToPlainText(side === "left" ? row.leftHtml : row.rightHtml), MAX_TABLE_CELL_TEXT_LENGTH)
}

function sanitizeTableWidth(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 240
  return Math.min(560, Math.max(120, Math.round(value)))
}

function sanitizeTableAlign(value: unknown): RNestMemoTableAlign {
  return value === "center" || value === "right" ? value : "left"
}

function sanitizePageSpacerHeight(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_PAGE_SPACER_HEIGHT
  return 0
}

function sanitizePageSpacerMode(value: unknown): RNestMemoSpacerMode {
  void value
  return "next-page"
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
    folders: {},
    documents: {},
    recent: [],
    personalTemplates: [],
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

export function createMemoTableRow(left = "", right = "", input?: Partial<RNestMemoTableRow>): RNestMemoTableRow {
  const nextLeft =
    cleanText(input?.left ?? left, MAX_TABLE_CELL_TEXT_LENGTH) ||
    cleanText(richHtmlToPlainText(input?.leftHtml), MAX_TABLE_CELL_TEXT_LENGTH)
  const nextRight =
    cleanText(input?.right ?? right, MAX_TABLE_CELL_TEXT_LENGTH) ||
    cleanText(richHtmlToPlainText(input?.rightHtml), MAX_TABLE_CELL_TEXT_LENGTH)
  return {
    id: input?.id || createNotebookId("memo_row"),
    left: nextLeft,
    leftHtml: cleanTableCellRichHtml(input?.leftHtml) || (nextLeft ? plainTextToRichHtml(nextLeft) : ""),
    right: nextRight,
    rightHtml: cleanTableCellRichHtml(input?.rightHtml) || (nextRight ? plainTextToRichHtml(nextRight) : ""),
    cells: Array.isArray(input?.cells)
      ? input?.cells.slice(0, MAX_TABLE_COLUMNS).map((cell) => createMemoTableCell(cell.text, cell))
      : undefined,
  }
}

function buildDefaultMemoTable(): RNestMemoTable {
  return {
    columns: ["항목", "내용"],
    columnHtml: [plainTextToRichHtml("항목"), plainTextToRichHtml("내용")],
    rows: [createMemoTableRow()],
  }
}

function normalizeMemoTable(input: RNestMemoTable | null | undefined): RNestMemoTable {
  if (!input) return buildDefaultMemoTable()

  const rawColumns = Array.isArray(input.columns) ? input.columns.slice(0, MAX_TABLE_COLUMNS) : ["항목", "내용"]
  const rawColumnHtml = Array.isArray(input.columnHtml) ? input.columnHtml.slice(0, MAX_TABLE_COLUMNS) : []
  const columnCount = Math.max(2, Math.min(MAX_TABLE_COLUMNS, rawColumns.length || rawColumnHtml.length || 2))
  const columns = Array.from({ length: columnCount }, (_, index) => getMemoTableColumnText({ columns: rawColumns, columnHtml: rawColumnHtml }, index) || `열 ${index + 1}`)
  const columnHtml = columns.map(
    (column, index) => cleanTableCellRichHtml(rawColumnHtml[index]) || plainTextToRichHtml(column)
  )
  const alignments = Array.from({ length: columnCount }, (_, index) => sanitizeTableAlign(input.alignments?.[index]))
  const columnWidths = Array.from({ length: columnCount }, (_, index) => sanitizeTableWidth(input.columnWidths?.[index]))
  const legacyShape = input.version !== 2 && columnCount === 2 && !(input.rows ?? []).some((row) => Array.isArray(row.cells) && row.cells.length > 0)
  const rows =
    Array.isArray(input.rows) && input.rows.length > 0
      ? input.rows.slice(0, MAX_TABLE_ROWS).map((row) => {
          if (legacyShape) {
            return createMemoTableRow(row.left, row.right, row)
          }
          const cells = getMemoTableRowCells(row, {
            ...input,
            columns,
            columnHtml,
            alignments,
            columnWidths,
          })
          const normalizedCells = Array.from({ length: columnCount }, (_, index) =>
            createMemoTableCell(cells[index]?.text ?? "", {
              ...(cells[index] ?? {}),
              align: cells[index]?.align ?? alignments[index] ?? "left",
            })
          )
          return {
            id: row.id || createNotebookId("memo_row"),
            left: normalizedCells[0]?.text ?? "",
            leftHtml: normalizedCells[0]?.textHtml ?? "",
            right: normalizedCells[1]?.text ?? "",
            rightHtml: normalizedCells[1]?.textHtml ?? "",
            cells: normalizedCells,
          } satisfies RNestMemoTableRow
        })
      : [legacyShape ? createMemoTableRow() : { ...createMemoTableRow(), cells: Array.from({ length: columnCount }, () => createMemoTableCell()) }]

  if (legacyShape) {
    return {
      columns: [columns[0] ?? "항목", columns[1] ?? "내용"],
      columnHtml: [columnHtml[0] ?? plainTextToRichHtml("항목"), columnHtml[1] ?? plainTextToRichHtml("내용")],
      rows,
    }
  }

  return {
    version: 2,
    columns,
    columnHtml,
    rows,
    headerRow: input.headerRow !== false,
    columnWidths,
    alignments,
  }
}

function normalizeMemoSpacerMode(value: unknown): RNestMemoSpacerMode {
  return value === "blank-space" ? "blank-space" : "next-page"
}

export function upgradeMemoTableToV2(input: RNestMemoTable | null | undefined): RNestMemoTable {
  return normalizeMemoTable({
    ...(input ?? buildDefaultMemoTable()),
    version: 2,
  })
}

function sanitizeMemoUrl(value: unknown) {
  return sanitizeNotebookUrl(value)
}

export function detectNotebookEmbedProvider(url: string | null | undefined) {
  const href = sanitizeMemoUrl(url)
  if (!href) return "link"
  try {
    const parsed = new URL(href)
    const host = parsed.hostname.replace(/^www\./, "")
    if (host.includes("youtube.com") || host.includes("youtu.be")) return "youtube"
    if (host.includes("instagram.com")) return "instagram"
    if (host.includes("x.com") || host.includes("twitter.com")) return "x"
    if (host.includes("notion.so")) return "notion"
    return host
  } catch {
    return "link"
  }
}

function sanitizeRecordViewSort(value: unknown): RNestRecordSort | undefined {
  if (!value || typeof value !== "object") return undefined
  const source = value as Partial<RNestRecordSort>
  const fieldId = cleanText(source.fieldId, 80)
  if (!fieldId) return undefined
  return {
    fieldId,
    direction: source.direction === "asc" ? "asc" : "desc",
  }
}

function sanitizeRecordViewFilters(value: unknown) {
  if (!Array.isArray(value)) return undefined
  const next: RNestRecordFilter[] = []
  for (const item of value.slice(0, 6)) {
    if (!item || typeof item !== "object") continue
    const source = item as Partial<RNestRecordFilter>
    const fieldId = cleanText(source.fieldId, 80)
    if (!fieldId) continue
    next.push({
      id: cleanText(source.id, 80) || createNotebookId("record_filter"),
      fieldId,
      operator:
        source.operator === "checked" ||
        source.operator === "unchecked" ||
        source.operator === "includesAny" ||
        source.operator === "contains"
          ? source.operator
          : "equals",
      value: source.value ?? null,
      values: Array.isArray(source.values) ? sanitizeNotebookTags(source.values) : undefined,
    })
  }
  return next
}

export function createMemoBlock(type: RNestMemoBlockType | string, input?: Partial<RNestMemoBlock>): RNestMemoBlock {
  const normalizedType = isMemoBlockType(type) ? type : "unsupported"
  const base = {
    id: input?.id ?? createNotebookId("memo_block"),
    highlight: normalizeBlockHighlight(input?.highlight),
  }

  if (normalizedType === "image") {
    return {
      ...base,
      type: normalizedType,
      text: cleanText(input?.text, 240),
      textHtml: undefined,
      detailText: undefined,
      detailTextHtml: undefined,
      attachmentId: cleanText(input?.attachmentId, 60) || undefined,
      mediaWidth: sanitizeMediaWidth(input?.mediaWidth),
      mediaAspectRatio: sanitizeMediaAspectRatio(input?.mediaAspectRatio),
      mediaOffsetX: sanitizeMediaOffsetX(input?.mediaOffsetX),
    }
  }

  if (normalizedType === "attachment") {
    const text =
      cleanText(input?.text, MAX_BLOCK_TEXT_LENGTH) ||
      cleanText(richHtmlToPlainText(input?.textHtml), MAX_BLOCK_TEXT_LENGTH)
    return {
      ...base,
      type: normalizedType,
      text,
      textHtml: cleanRichHtml(input?.textHtml) || (text ? plainTextToRichHtml(text) : ""),
      detailText: undefined,
      detailTextHtml: undefined,
      attachmentId: cleanText(input?.attachmentId, 60) || undefined,
    }
  }

  if (normalizedType === "gallery") {
    return {
      ...base,
      type: normalizedType,
      text: cleanText(input?.text, 240),
      textHtml: undefined,
      detailText: undefined,
      detailTextHtml: undefined,
      attachmentIds: Array.isArray(input?.attachmentIds)
        ? Array.from(new Set(input.attachmentIds.map((value) => cleanText(value, 60)).filter(Boolean))).slice(0, 8)
        : [],
    }
  }

  if (normalizedType === "table") {
    return {
      ...base,
      type: normalizedType,
      textHtml: undefined,
      detailText: undefined,
      detailTextHtml: undefined,
      table: normalizeMemoTable(input?.table),
    }
  }

  if (normalizedType === "divider") {
    return {
      ...base,
      type: normalizedType,
      text: undefined,
      textHtml: undefined,
      detailText: undefined,
      detailTextHtml: undefined,
    }
  }

  if (normalizedType === "pageSpacer") {
    const spacerMode = normalizeMemoSpacerMode(input?.spacerMode)
    return {
      ...base,
      type: normalizedType,
      text: undefined,
      textHtml: undefined,
      detailText: undefined,
      detailTextHtml: undefined,
      spacerMode,
      spacerHeight:
        spacerMode === "blank-space"
          ? Math.max(1, Math.min(12, Math.round(Number(input?.spacerHeight ?? 1) || 1)))
          : 0,
    }
  }

  if (normalizedType === "code") {
    const code =
      cleanCodeText(input?.code, MAX_CODE_TEXT_LENGTH) ||
      cleanCodeText(input?.text, MAX_CODE_TEXT_LENGTH) ||
      cleanCodeText(richHtmlToPlainText(input?.textHtml), MAX_CODE_TEXT_LENGTH)
    const caption =
      cleanText(input?.detailText, 240) || cleanText(richHtmlToPlainText(input?.detailTextHtml), 240)
    return {
      ...base,
      type: normalizedType,
      text: undefined,
      textHtml: undefined,
      detailText: caption || undefined,
      detailTextHtml: cleanRichHtml(input?.detailTextHtml) || (caption ? plainTextToRichHtml(caption) : ""),
      code,
      language: cleanText(input?.language, MAX_CODE_LANGUAGE_LENGTH) || "text",
      wrap: input?.wrap !== false,
    }
  }

  if (normalizedType === "pageLink") {
    const titleSnapshot =
      cleanText(input?.titleSnapshot, MAX_TITLE_SNAPSHOT_LENGTH) ||
      cleanText(input?.text, MAX_TITLE_SNAPSHOT_LENGTH) ||
      cleanText(richHtmlToPlainText(input?.textHtml), MAX_TITLE_SNAPSHOT_LENGTH)
    return {
      ...base,
      type: normalizedType,
      text: titleSnapshot,
      textHtml: undefined,
      targetDocId: cleanText(input?.targetDocId, 120) || undefined,
      titleSnapshot,
      detailText: cleanText(input?.detailText, 240) || undefined,
      detailTextHtml: undefined,
    }
  }

  if (normalizedType === "embed") {
    const url = sanitizeMemoUrl(input?.url ?? input?.text)
    const titleSnapshot =
      cleanText(input?.titleSnapshot, MAX_TITLE_SNAPSHOT_LENGTH) ||
      cleanText(input?.detailText, MAX_TITLE_SNAPSHOT_LENGTH) ||
      cleanText(input?.text, MAX_TITLE_SNAPSHOT_LENGTH) ||
      undefined
    return {
      ...base,
      type: normalizedType,
      text: titleSnapshot ?? url,
      textHtml: undefined,
      url,
      provider: cleanText(input?.provider, 40) || detectNotebookEmbedProvider(url),
      titleSnapshot,
    }
  }

  if (normalizedType === "recordView") {
    return {
      ...base,
      type: normalizedType,
      text: cleanText(input?.text, 120),
      textHtml: undefined,
      recordTemplateId: cleanText(input?.recordTemplateId, 120) || undefined,
      recordVisibleFieldIds: Array.isArray(input?.recordVisibleFieldIds)
        ? Array.from(new Set(input.recordVisibleFieldIds.map((value) => cleanText(value, 80)).filter(Boolean))).slice(0, MAX_RECORD_VIEW_FIELDS)
        : undefined,
      recordSort: sanitizeRecordViewSort(input?.recordSort),
      recordFilters: sanitizeRecordViewFilters(input?.recordFilters),
    }
  }

  if (normalizedType === "unsupported") {
    return {
      ...base,
      type: normalizedType,
      text: cleanText(input?.text, MAX_BLOCK_TEXT_LENGTH),
      textHtml: cleanRichHtml(input?.textHtml),
      detailText: cleanText(input?.detailText, MAX_BLOCK_TEXT_LENGTH) || undefined,
      detailTextHtml: cleanRichHtml(input?.detailTextHtml),
      unsupportedType: typeof type === "string" ? cleanText(type, 40) || "unsupported" : "unsupported",
      unsupportedPayload: sanitizeUnsupportedPayload(input?.unsupportedPayload ?? input) ?? null,
    }
  }

  const text = cleanText(input?.text, MAX_BLOCK_TEXT_LENGTH) || cleanText(richHtmlToPlainText(input?.textHtml), MAX_BLOCK_TEXT_LENGTH)
  const textHtml =
    normalizedType === "bookmark"
      ? undefined
      : cleanRichHtml(input?.textHtml) || (text ? plainTextToRichHtml(text) : "")
  const detailText =
    normalizedType === "toggle" || normalizedType === "bookmark"
      ? cleanText(input?.detailText, normalizedType === "bookmark" ? 240 : MAX_BLOCK_TEXT_LENGTH) ||
        cleanText(richHtmlToPlainText(input?.detailTextHtml), normalizedType === "bookmark" ? 240 : MAX_BLOCK_TEXT_LENGTH)
      : undefined
  const detailTextHtml =
    normalizedType === "toggle" || normalizedType === "bookmark"
      ? cleanRichHtml(input?.detailTextHtml) || (detailText ? plainTextToRichHtml(detailText) : "")
      : undefined

  return {
    ...base,
    type: normalizedType,
    text,
    textHtml,
    detailText,
    detailTextHtml,
    checked: normalizedType === "checklist" ? Boolean(input?.checked) : undefined,
    collapsed: normalizedType === "toggle" ? Boolean(input?.collapsed) : undefined,
  }
}

export function coerceMemoBlockType(block: RNestMemoBlock, nextType: RNestMemoBlockType): RNestMemoBlock {
  if (block.type === nextType) return block

  const preservedText =
    block.type === "table"
      ? [
          ...(Array.from({ length: Array.isArray(block.table?.columns) ? block.table?.columns.length : 2 }, (_, index) =>
            getMemoTableColumnText(block.table, index)
          ) ?? []),
          ...(block.table?.rows.map((row) => getMemoTableRowCells(row, block.table).map((cell) => cell.text).join(" ")) ?? []),
        ]
          .join("\n")
          .trim()
      : block.type === "code"
        ? cleanText(block.code, MAX_CODE_TEXT_LENGTH)
        : block.type === "pageLink"
          ? cleanText(block.titleSnapshot ?? block.text, MAX_TITLE_SNAPSHOT_LENGTH)
          : block.type === "embed"
            ? cleanText(block.url ?? block.text, MAX_URL_LENGTH)
            : block.type === "gallery"
              ? cleanText(block.text, 240)
      : getMemoBlockText(block)
  const preservedTextHtml = block.type === "table" ? "" : cleanRichHtml(block.textHtml) || plainTextToRichHtml(preservedText)
  const preservedDetailText = getMemoBlockDetailText(block)
  const preservedDetailHtml = cleanRichHtml(block.detailTextHtml) || plainTextToRichHtml(preservedDetailText)

  if (nextType === "table") {
    return createMemoBlock("table", {
      id: block.id,
      highlight: block.highlight,
      table: {
        columns: ["항목", "내용"],
        rows: preservedText ? [createMemoTableRow(preservedText, "")] : [createMemoTableRow()],
      },
    })
  }

  if (nextType === "divider") {
    return createMemoBlock("divider", { id: block.id, highlight: block.highlight })
  }

  if (nextType === "pageSpacer") {
    return createMemoBlock("pageSpacer", {
      id: block.id,
      highlight: block.highlight,
      spacerMode: "next-page",
      spacerHeight: 0,
    })
  }

  if (nextType === "bookmark") {
    const trimmed = preservedText.trim()
    const looksLikeUrl = /^(https?:\/\/|mailto:|www\.)/i.test(trimmed)
    return createMemoBlock("bookmark", {
      id: block.id,
      highlight: block.highlight,
      text: looksLikeUrl ? trimmed : "",
      detailText: looksLikeUrl ? preservedDetailText : trimmed,
    })
  }

  if (nextType === "code") {
    return createMemoBlock("code", {
      id: block.id,
      highlight: block.highlight,
      code: preservedText,
      language: "text",
    })
  }

  if (nextType === "pageLink") {
    return createMemoBlock("pageLink", {
      id: block.id,
      highlight: block.highlight,
      titleSnapshot: preservedText,
    })
  }

  if (nextType === "embed") {
    return createMemoBlock("embed", {
      id: block.id,
      highlight: block.highlight,
      url: preservedText,
      titleSnapshot: preservedDetailText,
    })
  }

  return createMemoBlock(nextType, {
    id: block.id,
    highlight: block.highlight,
    text: preservedText,
    textHtml: preservedTextHtml,
    detailText: nextType === "toggle" ? preservedDetailText : undefined,
    detailTextHtml: nextType === "toggle" ? preservedDetailHtml : undefined,
    checked: nextType === "checklist" ? Boolean(block.checked) : undefined,
    collapsed: nextType === "toggle" ? Boolean(block.collapsed) : undefined,
  })
}

function createMemoFolderBase(input?: Partial<RNestMemoFolder>): RNestMemoFolder {
  const timestamp = nowTs()
  return {
    id: input?.id ?? createNotebookId("memo_folder"),
    name: cleanText(input?.name, MAX_FOLDER_NAME_LENGTH) || "새 폴더",
    icon: normalizeMemoIcon(input?.icon, "folder"),
    createdAt: typeof input?.createdAt === "number" && Number.isFinite(input.createdAt) ? input.createdAt : timestamp,
    updatedAt: typeof input?.updatedAt === "number" && Number.isFinite(input.updatedAt) ? input.updatedAt : timestamp,
  }
}

function createMemoDocumentBase(input?: Partial<RNestMemoDocument>): RNestMemoDocument {
  const timestamp = nowTs()
  const explicitTitle = input?.title != null || input?.titleHtml != null
  const title =
    cleanText(input?.title, MAX_TITLE_LENGTH) ||
    cleanText(richHtmlToPlainText(input?.titleHtml), MAX_TITLE_LENGTH) ||
    (explicitTitle ? "" : "새 메모")
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
    title,
    titleHtml: cleanTitleRichHtml(input?.titleHtml) || (title ? plainTextToRichHtml(title) : ""),
    icon: normalizeMemoIcon(input?.icon, "note"),
    coverStyle: normalizeMemoCover(input?.coverStyle),
    folderId: cleanText(input?.folderId, 80) || null,
    parentDocId: cleanText((input as Partial<RNestMemoDocument>).parentDocId, 80) || null,
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

export function sanitizeMemoDocument(raw: Partial<RNestMemoDocument>) {
  return createMemoDocumentBase(raw)
}

function normalizeTemplateBlock(
  block: RNestMemoBlock,
  attachmentsById: Record<string, RNestMemoAttachment | undefined>
): RNestMemoBlock {
  if (block.type === "unsupported") {
    return createMemoBlock("paragraph", {
      text: `[지원되지 않는 블록] ${cleanText(block.unsupportedType, 40) || "unknown"}`.trim(),
      highlight: block.highlight,
    })
  }

  if (block.type === "image") {
    const attachment = block.attachmentId ? attachmentsById[block.attachmentId] : null
    const label = cleanText(block.text, 240) || cleanText(attachment?.name, MAX_ATTACHMENT_NAME_LENGTH) || "이미지"
    return createMemoBlock("paragraph", {
      text: `[이미지 자리] ${label}`.trim(),
      highlight: block.highlight,
    })
  }

  if (block.type === "attachment") {
    const attachment = block.attachmentId ? attachmentsById[block.attachmentId] : null
    const label =
      getMemoBlockText(block) || cleanText(attachment?.name, MAX_ATTACHMENT_NAME_LENGTH) || "첨부 파일"
    return createMemoBlock("paragraph", {
      text: `[파일 자리] ${label}`.trim(),
      highlight: block.highlight,
    })
  }

  if (block.type === "gallery") {
    const labels = (block.attachmentIds ?? [])
      .map((attachmentId) => attachmentsById[attachmentId]?.name ?? "")
      .filter(Boolean)
      .slice(0, 3)
    return createMemoBlock("paragraph", {
      text: `[갤러리 자리] ${labels.join(", ") || cleanText(block.text, 240) || "사진 모음"}`.trim(),
      highlight: block.highlight,
    })
  }

  if (block.type === "pageLink") {
    return createMemoBlock("paragraph", {
      text: `[연결 페이지] ${cleanText(block.titleSnapshot ?? block.text, MAX_TITLE_SNAPSHOT_LENGTH) || "페이지 링크"}`,
      highlight: block.highlight,
    })
  }

  if (block.type === "recordView") {
    return createMemoBlock("paragraph", {
      text: `[기록 보기] ${cleanText(block.text, 120) || "기록 보기 블록"}`,
      highlight: block.highlight,
    })
  }

  if (block.type === "embed") {
    const href = sanitizeMemoUrl(block.url ?? block.text)
    if (!href) {
      return createMemoBlock("paragraph", {
        text: `[임베드 자리] ${cleanText(block.titleSnapshot ?? block.text, MAX_TITLE_SNAPSHOT_LENGTH) || "링크 미리보기"}`.trim(),
        highlight: block.highlight,
      })
    }
    return createMemoBlock("bookmark", {
      text: href,
      detailText: cleanText(block.titleSnapshot, MAX_TITLE_SNAPSHOT_LENGTH) || cleanText(block.provider, 40) || href,
      highlight: block.highlight,
    })
  }

  return createMemoBlock(block.type, block)
}

function normalizeTemplateBlocks(
  blocks: RNestMemoBlock[] | null | undefined,
  attachments: RNestMemoAttachment[] | null | undefined
) {
  const attachmentsById = Object.fromEntries((attachments ?? []).map((attachment) => [attachment.id, attachment]))
  const normalized = (blocks ?? [])
    .slice(0, MAX_BLOCKS)
    .map((block) => normalizeTemplateBlock(block, attachmentsById))
  return normalized.length > 0 ? normalized : [createMemoBlock("paragraph")]
}

function createMemoTemplateBase(input?: Partial<RNestMemoTemplate>): RNestMemoTemplate {
  const timestamp = nowTs()
  const explicitTitle = input?.title != null || input?.titleHtml != null
  const label = cleanText(input?.label, MAX_TEMPLATE_LABEL_LENGTH) || "새 템플릿"
  const title =
    cleanText(input?.title, MAX_TITLE_LENGTH) ||
    cleanText(richHtmlToPlainText(input?.titleHtml), MAX_TITLE_LENGTH) ||
    (explicitTitle ? "" : label)

  return {
    id: input?.id ?? createNotebookId("memo_template"),
    label,
    description: cleanText(input?.description, MAX_TEMPLATE_DESCRIPTION_LENGTH) || "새 페이지에 바로 적용할 메모 템플릿입니다.",
    icon: normalizeMemoIcon(input?.icon, "note"),
    title,
    titleHtml: cleanTitleRichHtml(input?.titleHtml) || (title ? plainTextToRichHtml(title) : ""),
    coverStyle: normalizeMemoCover(input?.coverStyle),
    tags: sanitizeNotebookTags(input?.tags),
    blocks: normalizeTemplateBlocks(input?.blocks, []),
    sourceDocId: cleanText(input?.sourceDocId, MAX_TEMPLATE_SOURCE_DOC_ID_LENGTH) || null,
    sourceDocTitle: cleanText(input?.sourceDocTitle, MAX_TITLE_LENGTH) || "",
    sourceDocUpdatedAt:
      typeof input?.sourceDocUpdatedAt === "number" && Number.isFinite(input.sourceDocUpdatedAt)
        ? input.sourceDocUpdatedAt
        : null,
    createdAt:
      typeof input?.createdAt === "number" && Number.isFinite(input.createdAt) ? input.createdAt : timestamp,
    updatedAt:
      typeof input?.updatedAt === "number" && Number.isFinite(input.updatedAt) ? input.updatedAt : timestamp,
  }
}

export function sanitizeMemoTemplate(raw: Partial<RNestMemoTemplate>) {
  return createMemoTemplateBase(raw)
}

export function sanitizeMemoTemplates(value: unknown) {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const templates: RNestMemoTemplate[] = []
  for (const item of value) {
    const template = sanitizeMemoTemplate((item as Partial<RNestMemoTemplate>) ?? {})
    if (!template.id || seen.has(template.id)) continue
    seen.add(template.id)
    templates.push(template)
    if (templates.length >= MAX_MEMO_TEMPLATES) break
  }
  return templates
}

export function createMemoTemplateFromDocument(
  document: Partial<RNestMemoDocument>,
  options?: Partial<RNestMemoTemplate>
) {
  const normalizedDocument = sanitizeMemoDocument(document)
  return createMemoTemplateBase({
    id: options?.id,
    label: (options?.label ?? normalizedDocument.title) || "새 템플릿",
    description: options?.description,
    icon: normalizeMemoIcon(options?.icon ?? normalizedDocument.icon, "note"),
    title: normalizedDocument.title,
    titleHtml: normalizedDocument.titleHtml,
    coverStyle: options?.coverStyle ?? normalizedDocument.coverStyle,
    tags: options?.tags ?? normalizedDocument.tags,
    blocks: normalizeTemplateBlocks(normalizedDocument.blocks, normalizedDocument.attachments),
    sourceDocId: options?.sourceDocId ?? normalizedDocument.id,
    sourceDocTitle: options?.sourceDocTitle ?? getMemoDocumentTitle(normalizedDocument),
    sourceDocUpdatedAt: options?.sourceDocUpdatedAt ?? normalizedDocument.updatedAt,
    createdAt: options?.createdAt,
    updatedAt: options?.updatedAt,
  })
}

export function createMemoFromTemplate(template: Partial<RNestMemoTemplate>) {
  const normalizedTemplate = sanitizeMemoTemplate(template)
  const document = createMemoDocumentBase({
    title: normalizedTemplate.title,
    titleHtml: normalizedTemplate.titleHtml,
    icon: normalizedTemplate.icon,
    coverStyle: normalizedTemplate.coverStyle,
    parentDocId: null,
    tags: normalizedTemplate.tags,
    blocks: normalizedTemplate.blocks,
  })
  return {
    ...document,
    blocks: document.blocks.map((block) => ({
      ...block,
      id: createNotebookId("memo_block"),
      table: block.table
        ? {
            ...block.table,
            rows: block.table.rows.map((row) => ({
              ...row,
              id: createNotebookId("memo_row"),
              cells: Array.isArray(row.cells)
                ? row.cells.map((cell) => ({
                    ...cell,
                    id: createNotebookId("memo_cell"),
                  }))
                : row.cells,
            })),
          }
        : undefined,
    })),
  }
}

export function memoTemplateToPreviewText(template: Pick<RNestMemoTemplate, "description" | "blocks" | "title" | "titleHtml">) {
  const body =
    template.blocks
      .map((block) => memoBlockToPlainText(block))
      .find((value) => Boolean(cleanText(value, 180))) ?? ""
  return (
    cleanText(body, 180) ||
    cleanText(template.description, MAX_TEMPLATE_DESCRIPTION_LENGTH) ||
    cleanText(template.title, MAX_TITLE_LENGTH) ||
    cleanText(richHtmlToPlainText(template.titleHtml), MAX_TITLE_LENGTH) ||
    "빈 템플릿"
  )
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

export const defaultMemoTemplates: RNestMemoTemplate[] = memoPresets.map((preset) =>
  createMemoTemplateFromDocument(preset.create(), {
    id: preset.id,
    label: preset.label,
    description: preset.description,
    icon: normalizeMemoIcon(preset.icon, "note"),
    createdAt: 0,
    updatedAt: 0,
  })
)

export function createMemoFromPreset(presetId: string) {
  const preset = memoPresets.find((item) => item.id === presetId) ?? memoPresets[0]
  return preset.create()
}

export function hasMeaningfulMemoState(state: RNestMemoState | null | undefined) {
  if (!state) return false
  return (
    Object.values(state.documents ?? {}).some((document) => Boolean(document)) ||
    Object.values(state.folders ?? {}).some((folder) => Boolean(folder)) ||
    (state.personalTemplates?.length ?? 0) > 0
  )
}

export function memoBlockToPlainText(block: RNestMemoBlock) {
  const text = getMemoBlockText(block)
  const detailText = getMemoBlockDetailText(block)
  switch (block.type) {
    case "image":
      return [cleanText(block.text, 240), "[이미지]"].filter(Boolean).join(" ")
    case "attachment":
      return [text, "[파일]"].filter(Boolean).join(" ")
    case "gallery":
      return [cleanText(block.text, 240), `[갤러리 ${block.attachmentIds?.length ?? 0}개]`].filter(Boolean).join(" ")
    case "table":
      return [
        Array.from({ length: Array.isArray(block.table?.columns) ? block.table?.columns.length : 2 }, (_, index) =>
          getMemoTableColumnText(block.table, index)
        )
          .filter(Boolean)
          .join(" | "),
        ...(block.table?.rows.map((row) => getMemoTableRowCells(row, block.table).map((cell) => cell.text).join(" | ")) ?? []),
      ]
        .join("\n")
        .trim()
    case "divider":
      return "---"
    case "pageSpacer":
      return ""
    case "checklist":
      return `${block.checked ? "[x]" : "[ ]"} ${text}`
    case "quote":
      return `> ${text}`
    case "toggle":
      return [text, detailText].filter(Boolean).join("\n")
    case "bookmark":
      return [cleanText(block.text, 240), detailText].filter(Boolean).join(" ")
    case "code":
      return cleanText(block.code, MAX_CODE_TEXT_LENGTH)
    case "pageLink":
      return `[페이지] ${cleanText(block.titleSnapshot ?? block.text, MAX_TITLE_SNAPSHOT_LENGTH)}`
    case "embed":
      return [cleanText(block.titleSnapshot, MAX_TITLE_SNAPSHOT_LENGTH), cleanText(block.url ?? block.text, MAX_URL_LENGTH)]
        .filter(Boolean)
        .join(" ")
    case "recordView":
      return `[기록 보기] ${cleanText(block.text, 120) || cleanText(block.recordTemplateId, 120)}`
    case "unsupported":
      return `[지원되지 않는 블록: ${cleanText(block.unsupportedType, 40) || "알 수 없음"}]`
    default:
      return text
  }
}

export function memoDocumentToPlainText(document: RNestMemoDocument) {
  return [
    getMemoDocumentTitle(document),
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

function normalizeMarkdownSnippet(value: string) {
  return value.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim()
}

function prefixMarkdownQuote(value: string, firstLinePrefix = "> ") {
  const normalized = normalizeMarkdownSnippet(value)
  if (!normalized) return firstLinePrefix.trimEnd()
  const lines = normalized.split("\n")
  return lines
    .map((line, index) => {
      if (index === 0) return `${firstLinePrefix}${line}`.trimEnd()
      return line ? `> ${line}` : ">"
    })
    .join("\n")
}

function formatMarkdownListItem(marker: string, value: string) {
  const normalized = normalizeMarkdownSnippet(value)
  if (!normalized) return marker
  const lines = normalized.split("\n")
  return [`${marker} ${lines[0]}`.trimEnd(), ...lines.slice(1).map((line) => (line ? `  ${line}` : "  "))].join("\n")
}

function tableAlignmentToMarkdown(align: RNestMemoTableAlign | undefined) {
  if (align === "center") return ":---:"
  if (align === "right") return "---:"
  return "---"
}

function getMemoBlockMarkdownText(block: Pick<RNestMemoBlock, "text" | "textHtml">) {
  return normalizeMarkdownSnippet(richHtmlToMarkdown(block.textHtml) || getMemoBlockText(block))
}

function getMemoBlockDetailMarkdownText(block: Pick<RNestMemoBlock, "detailText" | "detailTextHtml">) {
  return normalizeMarkdownSnippet(richHtmlToMarkdown(block.detailTextHtml) || getMemoBlockDetailText(block))
}

function serializeMemoTableToMarkdown(table: RNestMemoTable | null | undefined) {
  const columnCount = Array.isArray(table?.columns) ? Math.max(2, table?.columns.length) : 2
  const headers = Array.from({ length: columnCount }, (_, index) =>
    richHtmlToMarkdown(table?.columnHtml?.[index]) || getMemoTableColumnText(table, index) || `열 ${index + 1}`
  )
  const alignments = Array.from({ length: columnCount }, (_, index) => tableAlignmentToMarkdown(table?.alignments?.[index]))
  const rows = (table?.rows ?? []).map((row) => {
    const cells = getMemoTableRowCells(row, table).map((cell) =>
      escapeMarkdownCell(normalizeMarkdownSnippet(richHtmlToMarkdown(cell.textHtml) || cleanText(cell.text, MAX_TABLE_CELL_TEXT_LENGTH)))
    )
    return `| ${Array.from({ length: columnCount }, (_, index) => cells[index] ?? "").join(" | ")} |`
  })

  return [
    `| ${headers.map((value) => escapeMarkdownCell(normalizeMarkdownSnippet(value) || "")).join(" | ")} |`,
    `| ${alignments.join(" | ")} |`,
    ...rows,
  ].join("\n")
}

export function memoDocumentToMarkdown(document: RNestMemoDocument) {
  const titleMarkdown = richHtmlToMarkdown(document.titleHtml) || getMemoDocumentTitle(document)
  const sections: string[] = [`# ${normalizeMarkdownSnippet(titleMarkdown || "제목 없음") || "제목 없음"}`]
  const listBuffer: string[] = []

  function flushListBuffer() {
    if (listBuffer.length === 0) return
    sections.push(listBuffer.join("\n"))
    listBuffer.length = 0
  }

  if (document.attachments.length > 0) {
    sections.push(["## 첨부", ...document.attachments.map((attachment) => `- ${cleanText(attachment.name, MAX_ATTACHMENT_NAME_LENGTH)}`)].join("\n"))
  }
  for (const block of document.blocks) {
    if (block.type === "bulleted") {
      const text = getMemoBlockMarkdownText(block)
      if (text) listBuffer.push(formatMarkdownListItem("-", text))
      continue
    }
    if (block.type === "numbered") {
      const text = getMemoBlockMarkdownText(block)
      if (text) listBuffer.push(formatMarkdownListItem("1.", text))
      continue
    }
    if (block.type === "checklist") {
      const text = getMemoBlockMarkdownText(block)
      if (text) listBuffer.push(formatMarkdownListItem(`- [${block.checked ? "x" : " "}]`, text))
      continue
    }

    flushListBuffer()

    if (block.type === "image") {
      const attachment = document.attachments.find((item) => item.id === block.attachmentId)
      const label = cleanText(block.text, 240) || cleanText(attachment?.name, MAX_ATTACHMENT_NAME_LENGTH) || "이미지"
      const href = cleanText(attachment?.name, MAX_ATTACHMENT_NAME_LENGTH) || "image"
      sections.push(`![${label}](${href})`)
      continue
    }
    if (block.type === "attachment") {
      const attachment = document.attachments.find((item) => item.id === block.attachmentId)
      const label = richHtmlToMarkdown(block.textHtml) || getMemoBlockText(block) || cleanText(attachment?.name, MAX_ATTACHMENT_NAME_LENGTH) || "파일"
      const href = cleanText(attachment?.name, MAX_ATTACHMENT_NAME_LENGTH) || "file"
      sections.push(`[${normalizeMarkdownSnippet(label) || "파일"}](${href})`)
      continue
    }
    if (block.type === "gallery") {
      const galleryLines: string[] = []
      for (const attachmentId of block.attachmentIds ?? []) {
        const attachment = document.attachments.find((item) => item.id === attachmentId)
        const label = cleanText(attachment?.name, MAX_ATTACHMENT_NAME_LENGTH) || "이미지"
        galleryLines.push(`![${label}](${label})`)
      }
      if (block.text) {
        galleryLines.push(normalizeMarkdownSnippet(cleanText(block.text, 240)))
      }
      if (galleryLines.length > 0) sections.push(galleryLines.join("\n"))
      continue
    }
    if (block.type === "divider") {
      sections.push("---")
      continue
    }
    if (block.type === "pageSpacer") {
      if (block.spacerMode === "next-page") {
        sections.push("<!-- RNEST_PAGE_BREAK -->")
      } else if (block.spacerMode === "blank-space") {
        sections.push(`<!-- RNEST_BLANK_SPACE ${Math.max(1, Math.min(12, block.spacerHeight ?? 1))} -->`)
      }
      continue
    }
    if (block.type === "table") {
      sections.push(serializeMemoTableToMarkdown(block.table))
      continue
    }
    if (block.type === "code") {
      const language = cleanText(block.language, MAX_CODE_LANGUAGE_LENGTH) || "text"
      const codeBlock = `\`\`\`${language}\n${cleanText(block.code, MAX_CODE_TEXT_LENGTH)}\n\`\`\``
      const caption = getMemoBlockDetailMarkdownText(block)
      sections.push(caption ? `${codeBlock}\n\n_${caption}_` : codeBlock)
      continue
    }
    if (block.type === "pageLink") {
      const title = cleanText(block.titleSnapshot ?? block.text, MAX_TITLE_SNAPSHOT_LENGTH) || "페이지 링크"
      const target = cleanText(block.targetDocId, 120)
      sections.push(target ? `[${title}](rnest://memo/${target})` : `[[${title}]]`)
      continue
    }
    if (block.type === "embed") {
      const href = cleanText(block.url ?? block.text, MAX_URL_LENGTH)
      const title = cleanText(block.titleSnapshot, MAX_TITLE_SNAPSHOT_LENGTH) || href || "링크"
      sections.push(href ? `[${title}](${href})` : title)
      continue
    }
    if (block.type === "recordView") {
      const label = cleanText(block.text, 120) || cleanText(block.recordTemplateId, 120) || "기록 보기"
      sections.push(prefixMarkdownQuote(`기록 보기: ${label}`, "> [!INFO] "))
      continue
    }
    if (block.type === "unsupported") {
      sections.push(prefixMarkdownQuote(`지원되지 않는 블록: ${cleanText(block.unsupportedType, 40) || "알 수 없음"}`, "> [!WARNING] "))
      continue
    }
    const text = block.type === "bookmark" ? cleanText(block.text, MAX_BLOCK_TEXT_LENGTH) : getMemoBlockMarkdownText(block)
    if (!text) continue

    switch (block.type) {
      case "heading":
        sections.push(`## ${text}`)
        break
      case "callout":
        sections.push(prefixMarkdownQuote(text, "> [!NOTE] "))
        break
      case "quote":
        sections.push(prefixMarkdownQuote(text))
        break
      case "toggle": {
        const detail = getMemoBlockDetailMarkdownText(block)
        const safeTitle = normalizeMarkdownSnippet(text.replace(/\n+/g, " ")) || "토글"
        if (detail) {
          sections.push(`<details>\n<summary>${safeTitle}</summary>\n\n${detail}\n</details>`)
        } else {
          sections.push(`<details>\n<summary>${safeTitle}</summary>\n</details>`)
        }
        break
      }
      case "bookmark": {
        const label = getMemoBlockDetailMarkdownText(block) || text
        sections.push(text ? `[${label}](${text})` : label)
        break
      }
      default:
        sections.push(text)
        break
    }
  }

  flushListBuffer()

  return sections.join("\n\n").replace(/\n{3,}/g, "\n\n").trim()
}

export function sanitizeMemoState(raw: unknown): RNestMemoState {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  const foldersSource =
    source.folders && typeof source.folders === "object" ? (source.folders as Record<string, unknown>) : {}
  const folders: Record<string, RNestMemoFolder | undefined> = {}
  for (const [id, value] of Object.entries(foldersSource)) {
    if (!value || typeof value !== "object") continue
    const folder = createMemoFolderBase({
      ...(value as Partial<RNestMemoFolder>),
      id,
    })
    folders[folder.id] = folder
  }
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
    if (doc.folderId && !folders[doc.folderId]) {
      doc.folderId = null
    }
    documents[doc.id] = doc
  }

  for (const doc of Object.values(documents)) {
    if (!doc) continue
    if (doc.parentDocId === doc.id || (doc.parentDocId && !documents[doc.parentDocId])) {
      doc.parentDocId = null
    }
    if (doc.parentDocId) {
      const parent = documents[doc.parentDocId]
      if (!parent || (parent.folderId ?? null) !== (doc.folderId ?? null)) {
        doc.parentDocId = null
      }
    }
  }

  for (const doc of Object.values(documents)) {
    if (!doc?.parentDocId) continue
    const seen = new Set<string>([doc.id])
    let cursorId: string | null = doc.parentDocId
    let hasCycle = false
    while (cursorId) {
      if (seen.has(cursorId)) {
        hasCycle = true
        break
      }
      seen.add(cursorId)
      cursorId = documents[cursorId]?.parentDocId ?? null
    }
    if (hasCycle) {
      doc.parentDocId = null
    }
  }

  const recentSource = Array.isArray(source.recent) ? source.recent : []
  const recent = recentSource
    .map((item) => (typeof item === "string" ? item : ""))
    .filter((id, index, list) => Boolean(id) && Boolean(documents[id]) && list.indexOf(id) === index)
    .slice(0, 20)

  const personalTemplates = sanitizeMemoTemplates(source.personalTemplates)

  return {
    folders,
    documents,
    recent,
    personalTemplates,
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
