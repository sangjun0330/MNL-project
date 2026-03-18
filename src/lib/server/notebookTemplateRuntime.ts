import { plainTextToRichHtml, richHtmlToPlainText, sanitizeNotebookRichHtml } from "@/lib/notebookRichText"
import type {
  RNestMemoBlock,
  RNestMemoBlockType,
  RNestMemoHighlightColor,
  RNestMemoIconId,
  RNestMemoTableRow,
  RNestMemoTemplate,
} from "@/lib/notebook"

const memoHighlightColors = ["yellow", "green", "blue", "pink", "orange", "purple"] as const
const memoIconOptions = ["note", "page", "check", "table", "folder", "clip", "leaf", "idea", "book", "spark", "moon", "pin"] as const
const memoCoverOptions = ["lavender-glow", "soft-sky", "mint-fog", "sunset-blush", "midnight-ink", "paper-grid"] as const

const MAX_TITLE_LENGTH = 80
const MAX_TITLE_HTML_LENGTH = 2400
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
const MAX_TABLE_CELL_TEXT_LENGTH = 500
const MAX_TABLE_CELL_HTML_LENGTH = 6000

function nowTs() {
  return Date.now()
}

function createNotebookId(prefix: string) {
  const uuid =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  return `${prefix}_${uuid}`
}

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return ""
  return value.replace(/\r/g, "").replace(/\u0000/g, "").trim().slice(0, maxLength)
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

function normalizeBlockHighlight(value: unknown) {
  return value && memoHighlightColors.includes(value as RNestMemoHighlightColor)
    ? (value as RNestMemoHighlightColor)
    : undefined
}

function sanitizeNotebookTags(value: unknown) {
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

function normalizeMemoIcon(value: unknown, fallback: RNestMemoIconId): RNestMemoIconId {
  const raw = cleanText(value, 24)
  const normalized = raw as RNestMemoIconId
  return memoIconOptions.includes(normalized) ? normalized : fallback
}

function normalizeMemoCover(value: unknown) {
  const raw = cleanText(value, 32)
  if (!raw) return null
  return memoCoverOptions.includes(raw as (typeof memoCoverOptions)[number]) ? raw : null
}

function createMemoTableRow(left = "", right = "", input?: Partial<RNestMemoTableRow>): RNestMemoTableRow {
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
  }
}

function createTemplateBlock(type: RNestMemoBlockType, input?: Partial<RNestMemoBlock>): RNestMemoBlock {
  if (type === "image") {
    const label = cleanText(input?.text, 240) || "이미지"
    return createTemplateBlock("paragraph", {
      id: input?.id,
      highlight: input?.highlight,
      text: `[이미지 자리] ${label}`.trim(),
    })
  }

  if (type === "attachment") {
    const label = cleanText(input?.text, 240) || "첨부 파일"
    return createTemplateBlock("paragraph", {
      id: input?.id,
      highlight: input?.highlight,
      text: `[파일 자리] ${label}`.trim(),
    })
  }

  if (type === "table") {
    const firstColumn =
      cleanText(input?.table?.columns?.[0], 40) || cleanText(richHtmlToPlainText(input?.table?.columnHtml?.[0]), 40) || "항목"
    const secondColumn =
      cleanText(input?.table?.columns?.[1], 40) || cleanText(richHtmlToPlainText(input?.table?.columnHtml?.[1]), 40) || "내용"
    return {
      id: input?.id ?? createNotebookId("memo_block"),
      type,
      textHtml: undefined,
      detailText: undefined,
      detailTextHtml: undefined,
      table: {
        columns: [firstColumn, secondColumn],
        columnHtml: [
          cleanTableCellRichHtml(input?.table?.columnHtml?.[0]) || plainTextToRichHtml(firstColumn),
          cleanTableCellRichHtml(input?.table?.columnHtml?.[1]) || plainTextToRichHtml(secondColumn),
        ],
        rows:
          input?.table?.rows?.slice(0, MAX_TABLE_ROWS).map((row) => createMemoTableRow(row.left, row.right, row)) ?? [
            createMemoTableRow(),
          ],
      },
      highlight: normalizeBlockHighlight(input?.highlight),
    } satisfies RNestMemoBlock
  }

  if (type === "divider") {
    return {
      id: input?.id ?? createNotebookId("memo_block"),
      type,
      text: undefined,
      textHtml: undefined,
      detailText: undefined,
      detailTextHtml: undefined,
      highlight: normalizeBlockHighlight(input?.highlight),
    } satisfies RNestMemoBlock
  }

  const text = cleanText(input?.text, MAX_BLOCK_TEXT_LENGTH) || cleanText(richHtmlToPlainText(input?.textHtml), MAX_BLOCK_TEXT_LENGTH)
  const textHtml = type === "bookmark" ? undefined : cleanRichHtml(input?.textHtml) || (text ? plainTextToRichHtml(text) : "")
  const detailText =
    type === "toggle" || type === "bookmark"
      ? cleanText(input?.detailText, MAX_BLOCK_TEXT_LENGTH) || cleanText(richHtmlToPlainText(input?.detailTextHtml), MAX_BLOCK_TEXT_LENGTH)
      : undefined
  const detailTextHtml =
    type === "toggle" || type === "bookmark"
      ? cleanRichHtml(input?.detailTextHtml) || (detailText ? plainTextToRichHtml(detailText) : "")
      : undefined

  return {
    id: input?.id ?? createNotebookId("memo_block"),
    type,
    text,
    textHtml,
    detailText,
    detailTextHtml,
    attachmentId: undefined,
    mediaWidth: undefined,
    mediaAspectRatio: undefined,
    mediaOffsetX: undefined,
    checked: type === "checklist" ? Boolean(input?.checked) : undefined,
    collapsed: type === "toggle" ? Boolean(input?.collapsed) : undefined,
    highlight: normalizeBlockHighlight(input?.highlight),
  } satisfies RNestMemoBlock
}

function normalizeTemplateBlocks(blocks: RNestMemoBlock[] | null | undefined) {
  const normalized = (blocks ?? []).slice(0, MAX_BLOCKS).map((block) => createTemplateBlock(block.type, block))
  return normalized.length > 0 ? normalized : [createTemplateBlock("paragraph")]
}

export function sanitizeMemoTemplate(raw: Partial<RNestMemoTemplate>) {
  const timestamp = nowTs()
  const explicitTitle = raw?.title != null || raw?.titleHtml != null
  const label = cleanText(raw?.label, MAX_TEMPLATE_LABEL_LENGTH) || "새 템플릿"
  const title =
    cleanText(raw?.title, MAX_TITLE_LENGTH) ||
    cleanText(richHtmlToPlainText(raw?.titleHtml), MAX_TITLE_LENGTH) ||
    (explicitTitle ? "" : label)

  return {
    id: raw?.id ?? createNotebookId("memo_template"),
    label,
    description: cleanText(raw?.description, MAX_TEMPLATE_DESCRIPTION_LENGTH) || "새 페이지에 바로 적용할 메모 템플릿입니다.",
    icon: normalizeMemoIcon(raw?.icon, "note"),
    title,
    titleHtml: cleanTitleRichHtml(raw?.titleHtml) || (title ? plainTextToRichHtml(title) : ""),
    coverStyle: normalizeMemoCover(raw?.coverStyle),
    tags: sanitizeNotebookTags(raw?.tags),
    blocks: normalizeTemplateBlocks(raw?.blocks),
    sourceDocId: cleanText(raw?.sourceDocId, MAX_TEMPLATE_SOURCE_DOC_ID_LENGTH) || null,
    sourceDocTitle: cleanText(raw?.sourceDocTitle, MAX_TITLE_LENGTH) || "",
    sourceDocUpdatedAt:
      typeof raw?.sourceDocUpdatedAt === "number" && Number.isFinite(raw.sourceDocUpdatedAt) ? raw.sourceDocUpdatedAt : null,
    createdAt: typeof raw?.createdAt === "number" && Number.isFinite(raw.createdAt) ? raw.createdAt : timestamp,
    updatedAt: typeof raw?.updatedAt === "number" && Number.isFinite(raw.updatedAt) ? raw.updatedAt : timestamp,
  } satisfies RNestMemoTemplate
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

export const defaultMemoTemplates: RNestMemoTemplate[] = [
  sanitizeMemoTemplate({
    id: "quick",
    label: "빠른 메모",
    description: "완전 빈 캔버스 — 바로 타이핑을 시작하세요",
    icon: "spark",
    title: "",
    titleHtml: "",
    coverStyle: null,
    createdAt: 0,
    updatedAt: 0,
    blocks: [createTemplateBlock("paragraph", { id: "quick_block_1", text: "" })],
  }),
  sanitizeMemoTemplate({
    id: "blank",
    label: "빈 메모",
    description: "바로 입력을 시작하는 자유 메모",
    icon: "note",
    title: "빈 메모",
    coverStyle: null,
    createdAt: 0,
    updatedAt: 0,
    blocks: [createTemplateBlock("paragraph", { id: "blank_block_1", text: "" })],
  }),
  sanitizeMemoTemplate({
    id: "free",
    label: "자유 메모",
    description: "짧은 정리와 핵심 메모를 빠르게 남기는 형식",
    icon: "page",
    title: "자유 메모",
    coverStyle: "lavender-glow",
    createdAt: 0,
    updatedAt: 0,
    blocks: [
      createTemplateBlock("heading", { id: "free_block_1", text: "핵심 요약" }),
      createTemplateBlock("paragraph", { id: "free_block_2", text: "" }),
      createTemplateBlock("callout", { id: "free_block_3", text: "잊지 말아야 할 한 줄을 남겨두세요." }),
    ],
  }),
  sanitizeMemoTemplate({
    id: "checklist",
    label: "체크리스트 메모",
    description: "해야 할 일과 확인 포인트를 정리하는 형식",
    icon: "check",
    title: "체크리스트 메모",
    coverStyle: "mint-fog",
    createdAt: 0,
    updatedAt: 0,
    blocks: [
      createTemplateBlock("heading", { id: "check_block_1", text: "오늘 체크할 것" }),
      createTemplateBlock("checklist", { id: "check_block_2", text: "첫 번째 항목", checked: false }),
      createTemplateBlock("checklist", { id: "check_block_3", text: "두 번째 항목", checked: false }),
      createTemplateBlock("checklist", { id: "check_block_4", text: "세 번째 항목", checked: false }),
    ],
  }),
  sanitizeMemoTemplate({
    id: "table",
    label: "표 포함 메모",
    description: "비교 정리나 짧은 기록표가 필요한 형식",
    icon: "table",
    title: "표 포함 메모",
    coverStyle: "soft-sky",
    createdAt: 0,
    updatedAt: 0,
    blocks: [
      createTemplateBlock("heading", { id: "table_block_1", text: "표 메모" }),
      createTemplateBlock("table", {
        id: "table_block_2",
        table: {
          columns: ["항목", "내용"],
          rows: [createMemoTableRow("예시", "내용을 입력하세요.", { id: "table_row_1" })],
        },
      }),
    ],
  }),
]

export type { RNestMemoTemplate } from "@/lib/notebook"
