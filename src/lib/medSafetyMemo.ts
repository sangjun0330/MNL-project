import {
  createMemoBlock,
  createMemoTableCell,
  createMemoTableRow,
  sanitizeNotebookUrl,
  type RNestMemoBlock,
  type RNestMemoTableRow,
} from "@/lib/notebook"
import {
  buildMedSafetyDisplayLines,
  parseMedSafetyAnswerSections,
  type MedSafetyAnswerDisplayLine as DisplayBodyLine,
  type MedSafetyAnswerSection as MedSafetySection,
} from "@/lib/medSafetyAnswerSections"
import {
  getMedSafetySourceLabel,
  mergeMedSafetySources,
  normalizeMedSafetySourceUrl,
  sanitizeMedSafetyTextUrls,
  type MedSafetySource,
} from "@/lib/medSafetySources"
import type {
  MedSafetyQuestionType,
  MedSafetyStructuredAnswer,
  MedSafetyTriageLevel,
} from "@/lib/medSafetyStructured"

type MedSafetyResultKind = "medication" | "device" | "scenario"
type MedSafetyMemoLayout = "brief"

export type BuildMedSafetyMemoInput = {
  query: string
  answer: string
  summary?: string
  layout?: MedSafetyMemoLayout
  savedAt?: number
  resultKind?: MedSafetyResultKind | null
  mode?: string | null
  situation?: string | null
  queryIntent?: string | null
  structuredAnswer?: MedSafetyStructuredAnswer | null
  sources?: MedSafetySource[]
  questionType?: MedSafetyQuestionType | null
  triageLevel?: MedSafetyTriageLevel | null
  searchType?: string | null
  imageAttachmentId?: string | null
  imageAttachmentName?: string | null
}

const URL_PATTERN = /https?:\/\/[^\s<>"')\]]+/gi
const MAX_CALLOUT_TEXT_LENGTH = 220
const MAX_MEMO_SOURCE_COUNT = 8
const AI_NOTE_TEXT = "AI 참고용 메모입니다. 실제 처치와 보고는 환자 상태, 기관 기준, 담당자 판단으로 최종 확인하세요."

type MemoCategoryConfig = {
  label: string
  keyHeading: string
  actionHeading: string
  warningHeading: string
  caveatHeading: string
  comparisonHeading: string
}

const MEMO_CATEGORY_CONFIG: Record<MedSafetyQuestionType, MemoCategoryConfig> = {
  general: {
    label: "임상 판단",
    keyHeading: "핵심 판단",
    actionHeading: "지금 할 일",
    warningHeading: "보고/에스컬레이션 기준",
    caveatHeading: "환자별 확인사항",
    comparisonHeading: "판단 근거",
  },
  drug: {
    label: "약물/투약",
    keyHeading: "투약 판단",
    actionHeading: "투약 전 체크",
    warningHeading: "보류/보고 기준",
    caveatHeading: "환자별 투약 주의",
    comparisonHeading: "약물/처치 비교",
  },
  lab: {
    label: "검사/수치",
    keyHeading: "수치 해석",
    actionHeading: "재확인/추가 확인",
    warningHeading: "즉시 보고 수치",
    caveatHeading: "환자별 해석 변수",
    comparisonHeading: "수치별 판단 근거",
  },
  compare: {
    label: "비교 판단",
    keyHeading: "선택 기준",
    actionHeading: "결정 전 확인",
    warningHeading: "선택을 바꿔야 하는 상황",
    caveatHeading: "대상별 예외",
    comparisonHeading: "비교표",
  },
  guideline: {
    label: "가이드라인",
    keyHeading: "적용 기준",
    actionHeading: "현장 적용 순서",
    warningHeading: "예외/보고 기준",
    caveatHeading: "적용 전 확인사항",
    comparisonHeading: "권고 차이",
  },
  device: {
    label: "기구/장비",
    keyHeading: "기구 판단",
    actionHeading: "장비 확인 체크",
    warningHeading: "알람/중단/보고 기준",
    caveatHeading: "환자/기구별 주의",
    comparisonHeading: "장비/설정 비교",
  },
  procedure: {
    label: "절차/간호",
    keyHeading: "절차 핵심",
    actionHeading: "간호 수행 체크",
    warningHeading: "중단/보고 기준",
    caveatHeading: "대상자별 주의",
    comparisonHeading: "절차 판단 근거",
  },
  image: {
    label: "이미지 질문",
    keyHeading: "이미지 관찰 포인트",
    actionHeading: "추가 확인/대응",
    warningHeading: "바로 보고할 소견",
    caveatHeading: "이미지만으로 단정 금지",
    comparisonHeading: "감별/비교 포인트",
  },
}

function cleanLine(value: string) {
  return String(value ?? "")
    .replace(/\u0000/g, "")
    .replace(/\u2060/g, "")
    .replace(/\r/g, "")
    .replace(/\*\*([\s\S]*?)\*\*/g, "$1")
    .replace(/__([\s\S]*?)__/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/__/g, "")
    .trim()
}

function cleanMemoText(value: string) {
  return String(value ?? "")
    .replace(/\u0000/g, "")
    .replace(/\u2060/g, "")
    .replace(/\r/g, "")
    .replace(/\*\*([\s\S]*?)\*\*/g, "$1")
    .replace(/__([\s\S]*?)__/g, "$1")
    .replace(/\*\*/g, "")
    .replace(/__/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .trim()
}

function extractUrls(...values: string[]) {
  const out = new Set<string>()
  for (const value of values) {
    const text = String(value ?? "")
    const matches = text.match(URL_PATTERN)
    if (!matches) continue
    for (const match of matches) {
      const url = normalizeMedSafetySourceUrl(match) || sanitizeNotebookUrl(match)
      if (url) out.add(url)
    }
  }
  return Array.from(out)
}

function buildComparisonRows(lines: DisplayBodyLine[]) {
  const rows: RNestMemoTableRow[] = []
  const remaining: DisplayBodyLine[] = []

  for (const line of lines) {
    if (line.kind === "label" && line.marker && line.content) {
      const label = cleanLine(line.marker.replace(/:\s*$/, ""))
      rows.push(
        createMemoTableRow(label, line.content, {
          cells: [
            createMemoTableCell(label, { align: "left" }),
            createMemoTableCell(line.content, { align: "left" }),
          ],
        })
      )
      continue
    }
    remaining.push(line)
  }

  return { rows, remaining }
}

function withMemoIndent(text: string, level: number) {
  const content = cleanLine(text)
  if (!content) return ""
  if (level <= 0) return content
  return `\u2060 ${content}`
}

function toChecklistText(line: DisplayBodyLine) {
  if (line.kind === "blank") return ""
  if (line.kind === "label") {
    const label = cleanLine(line.marker.replace(/:\s*$/, ""))
    return withMemoIndent(`${label}: ${line.content}`, line.level)
  }
  return withMemoIndent(line.content, line.level)
}

function appendChecklistBlocks(blocks: RNestMemoBlock[], lines: DisplayBodyLine[]) {
  for (const line of lines) {
    const text = toChecklistText(line)
    if (!text) continue
    blocks.push(createMemoBlock("checklist", { text, checked: false }))
  }
}

function appendNarrativeBlocks(blocks: RNestMemoBlock[], lines: DisplayBodyLine[]) {
  for (const line of lines) {
    if (line.kind === "blank") continue
    if (line.kind === "label") {
      const label = cleanLine(line.marker.replace(/:\s*$/, ""))
      blocks.push(createMemoBlock("bulleted", { text: withMemoIndent(`${label}: ${line.content}`, line.level) }))
      continue
    }
    if (line.kind === "bullet") {
      blocks.push(createMemoBlock("bulleted", { text: withMemoIndent(line.content, line.level) }))
      continue
    }
    if (line.kind === "number") {
      blocks.push(createMemoBlock("numbered", { text: withMemoIndent(line.content, line.level) }))
      continue
    }
    blocks.push(createMemoBlock("paragraph", { text: withMemoIndent(line.content, line.level) }))
  }
}

function truncateText(value: string, maxLength: number) {
  const cleaned = cleanLine(value)
  if (!cleaned) return ""
  if (cleaned.length <= maxLength) return cleaned
  return `${cleaned.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}

export function getMedSafetyMemoQuestionTypeLabel(questionType?: MedSafetyQuestionType | null) {
  return MEMO_CATEGORY_CONFIG[questionType || "general"]?.label ?? MEMO_CATEGORY_CONFIG.general.label
}

export function getMedSafetyMemoTriageLabel(triageLevel?: MedSafetyTriageLevel | null) {
  if (triageLevel === "critical") return "즉시 대응"
  if (triageLevel === "urgent") return "우선 확인"
  return "일반 확인"
}

function getMemoCategoryConfig(questionType?: MedSafetyQuestionType | null) {
  return MEMO_CATEGORY_CONFIG[questionType || "general"] ?? MEMO_CATEGORY_CONFIG.general
}

function createMemoTableRowV2(cells: string[]) {
  return createMemoTableRow(cells[0] ?? "", cells[1] ?? "", {
    cells: cells.map((cell) => createMemoTableCell(cleanLine(cell), { align: "left" })),
  })
}

function appendTableBlock(blocks: RNestMemoBlock[], columns: string[], rows: RNestMemoTableRow[]) {
  if (!rows.length) return
  blocks.push(
    createMemoBlock("table", {
      table: {
        version: 2,
        columns,
        rows,
        headerRow: true,
      },
    })
  )
}

function addSectionBreak(blocks: RNestMemoBlock[]) {
  if (!blocks.length) return
  blocks.push(createMemoBlock("divider"))
  blocks.push(createMemoBlock("pageSpacer", { spacerMode: "blank-space", spacerHeight: 2 }))
}

function addSectionHeading(blocks: RNestMemoBlock[], text: string, shouldRender: boolean) {
  if (!shouldRender) return
  addSectionBreak(blocks)
  blocks.push(createMemoBlock("heading", { text: cleanLine(text) }))
  blocks.push(createMemoBlock("pageSpacer", { spacerMode: "blank-space", spacerHeight: 1 }))
}

function sanitizeMemoTableRow(row: RNestMemoTableRow): RNestMemoTableRow {
  return {
    ...row,
    left: cleanLine(row.left),
    leftHtml: undefined,
    right: cleanLine(row.right),
    rightHtml: undefined,
    cells: row.cells?.map((cell) => ({
      ...cell,
      text: cleanLine(cell.text),
      textHtml: undefined,
    })),
  }
}

function sanitizeMedSafetyMemoBlocks(blocks: RNestMemoBlock[]) {
  return blocks.map((block) => ({
    ...block,
    text: block.text != null ? cleanMemoText(block.text) : block.text,
    textHtml: undefined,
    detailText: block.detailText != null ? cleanMemoText(block.detailText) : block.detailText,
    detailTextHtml: undefined,
    table: block.table
      ? {
          ...block.table,
          columns: block.table.columns.map((column) => cleanLine(column)),
          columnHtml: undefined,
          rows: block.table.rows.map(sanitizeMemoTableRow),
        }
      : block.table,
  }))
}

function answerItemText(item: MedSafetyStructuredAnswer["key_points"][number]) {
  const text = cleanLine(sanitizeMedSafetyTextUrls(item.text))
  if (!text) return ""
  return item.evidence_status === "needs_review" ? `${text} (근거 확인 필요)` : text
}

function appendAnswerItemBullets(blocks: RNestMemoBlock[], items: MedSafetyStructuredAnswer["key_points"]) {
  for (const item of items.slice(0, 10)) {
    const text = answerItemText(item)
    if (!text) continue
    blocks.push(createMemoBlock("bulleted", { text }))
  }
}

function appendAnswerItemChecklist(blocks: RNestMemoBlock[], items: MedSafetyStructuredAnswer["recommended_actions"]) {
  for (const item of items.slice(0, 10)) {
    const text = answerItemText(item)
    if (!text) continue
    blocks.push(createMemoBlock("checklist", { text, checked: false }))
  }
}

function appendWarningCallouts(blocks: RNestMemoBlock[], label: string, items: MedSafetyStructuredAnswer["do_not_do"]) {
  for (const item of items.slice(0, 6)) {
    const text = answerItemText(item)
    if (!text) continue
    blocks.push(createMemoBlock("callout", { text: `${label} · ${text}` }))
  }
}

function firstContentLine(lines: DisplayBodyLine[]) {
  for (const line of lines) {
    const text = toChecklistText(line)
    if (text) return text
  }
  return ""
}

function buildSummaryCalloutText(sections: MedSafetySection[], summary: string, answer: string) {
  const candidates = [
    cleanLine(summary),
    ...sections
      .filter((section) => section.tone === "summary")
      .flatMap((section) => {
        const parsedLines = buildMedSafetyDisplayLines(section.bodyLines)
        return [cleanLine(section.lead), firstContentLine(parsedLines)]
      }),
    cleanLine(answer.split(/\n{2,}/)[0] ?? ""),
  ]

  for (const candidate of candidates) {
    if (candidate) return truncateText(candidate, MAX_CALLOUT_TEXT_LENGTH)
  }
  return "핵심 결론을 확인하세요."
}

function addHeadingIfNeeded(blocks: RNestMemoBlock[], text: string, shouldRender: boolean) {
  if (!shouldRender) return
  addSectionHeading(blocks, text, shouldRender)
}

function appendFreeformSectionBlocks(blocks: RNestMemoBlock[], section: MedSafetySection) {
  const title = cleanLine(section.title) || "내용 정리"
  const lead = cleanLine(section.lead)
  const parsedLines = buildMedSafetyDisplayLines(section.bodyLines)
  const hasBody = parsedLines.some((line) => Boolean(toChecklistText(line)))
  if (!lead && !hasBody) return

  addSectionHeading(blocks, title, true)

  if (lead) {
    blocks.push(createMemoBlock(section.tone === "warning" ? "callout" : "paragraph", { text: lead }))
  }

  if (!hasBody) return

  if (section.tone === "action") {
    appendChecklistBlocks(blocks, parsedLines)
    return
  }

  if (section.tone === "compare") {
    const { rows, remaining } = buildComparisonRows(parsedLines)
    if (rows.length >= 2) appendTableBlock(blocks, ["항목", "내용"], rows)
    appendNarrativeBlocks(blocks, remaining.length >= 2 ? remaining : parsedLines)
    return
  }

  appendNarrativeBlocks(blocks, parsedLines)
}

function addBookmarks(blocks: RNestMemoBlock[], urls: string[]) {
  if (urls.length === 0) return
  addSectionHeading(blocks, "참고 링크", true)
  for (const url of urls.slice(0, 6)) {
    let label = url
    try {
      label = new URL(url).hostname.replace(/^www\./, "")
    } catch {
      label = url
    }
    blocks.push(
      createMemoBlock("bookmark", {
        text: url,
        detailText: label,
      })
    )
  }
}

function appendQuestionImageBlock(blocks: RNestMemoBlock[], input: BuildMedSafetyMemoInput) {
  const attachmentId = cleanLine(input.imageAttachmentId ?? "")
  if (!attachmentId) return
  blocks.push(createMemoBlock("heading", { text: "질문 이미지" }))
  blocks.push(
    createMemoBlock("image", {
      text: cleanLine(input.imageAttachmentName ?? "질문 첨부 이미지"),
      attachmentId,
      mediaWidth: 100,
      mediaAspectRatio: 1.3333,
      mediaOffsetX: 0,
    })
  )
}

function addSourceBlocks(blocks: RNestMemoBlock[], sources: MedSafetySource[]) {
  const merged = mergeMedSafetySources(sources, MAX_MEMO_SOURCE_COUNT)
  if (!merged.length) return [] as string[]

  addSectionHeading(blocks, "공식 출처/근거", true)

  for (const source of merged.slice(0, 6)) {
    const url = normalizeMedSafetySourceUrl(source.url) || sanitizeNotebookUrl(source.url)
    if (!url) continue
    blocks.push(
      createMemoBlock("bookmark", {
        text: url,
        detailText: cleanLine(source.title) || getMedSafetySourceLabel(source),
      })
    )
  }

  return merged.map((source) => normalizeMedSafetySourceUrl(source.url) || sanitizeNotebookUrl(source.url)).filter(Boolean)
}

function appendStructuredComparisonTable(blocks: RNestMemoBlock[], rows: MedSafetyStructuredAnswer["comparison_table"]) {
  if (!rows.length) return
  appendTableBlock(
    blocks,
    ["항목", "사용 기준", "효과/시점", "한계", "실무 포인트"],
    rows.slice(0, 10).map((row) =>
      createMemoTableRowV2([
        row.role,
        row.when_to_use,
        row.effect_onset,
        row.limitations,
        row.bedside_points,
      ])
    )
  )
}

function buildStructuredMemoBlocks(input: BuildMedSafetyMemoInput, structuredAnswer: MedSafetyStructuredAnswer) {
  const query = cleanLine(input.query)
  const answer = cleanMemoText(sanitizeMedSafetyTextUrls(String(input.answer ?? "").trim()))
  const questionType = structuredAnswer.question_type || input.questionType || (input.imageAttachmentId ? "image" : "general")
  const category = getMemoCategoryConfig(questionType)
  const blocks: RNestMemoBlock[] = []
  const allSources = mergeMedSafetySources([...(structuredAnswer.citations ?? []), ...(input.sources ?? [])], MAX_MEMO_SOURCE_COUNT)
  appendQuestionImageBlock(blocks, input)

  addHeadingIfNeeded(blocks, category.keyHeading, structuredAnswer.key_points.length > 0)
  appendAnswerItemBullets(blocks, structuredAnswer.key_points)

  addHeadingIfNeeded(blocks, category.actionHeading, structuredAnswer.recommended_actions.length > 0)
  appendAnswerItemChecklist(blocks, structuredAnswer.recommended_actions)

  addHeadingIfNeeded(blocks, "하지 말아야 할 것", structuredAnswer.do_not_do.length > 0)
  appendWarningCallouts(blocks, "금지/주의", structuredAnswer.do_not_do)

  addHeadingIfNeeded(blocks, category.warningHeading, structuredAnswer.when_to_escalate.length > 0)
  appendWarningCallouts(blocks, "보고", structuredAnswer.when_to_escalate)

  addHeadingIfNeeded(blocks, category.caveatHeading, structuredAnswer.patient_specific_caveats.length > 0)
  appendAnswerItemBullets(blocks, structuredAnswer.patient_specific_caveats)

  addHeadingIfNeeded(blocks, category.comparisonHeading, structuredAnswer.comparison_table.length > 0)
  appendStructuredComparisonTable(blocks, structuredAnswer.comparison_table)

  if (structuredAnswer.uncertainty.needs_verification && structuredAnswer.uncertainty.summary) {
    blocks.push(createMemoBlock("callout", { text: `근거 제한 · ${truncateText(structuredAnswer.uncertainty.summary, MAX_CALLOUT_TEXT_LENGTH)}` }))
  }
  if (structuredAnswer.freshness.note) {
    blocks.push(createMemoBlock("callout", { text: `최신성 · ${truncateText(structuredAnswer.freshness.note, MAX_CALLOUT_TEXT_LENGTH)}` }))
  }

  const sourceUrls = addSourceBlocks(blocks, allSources)
  const urls = extractUrls(query, answer, structuredAnswer.bottom_line).filter((url) => !sourceUrls.includes(url))
  addBookmarks(blocks, urls)
  blocks.push(createMemoBlock("paragraph", { text: AI_NOTE_TEXT }))

  return sanitizeMedSafetyMemoBlocks(blocks)
}

export function buildMedSafetyMemoBlocks(input: BuildMedSafetyMemoInput) {
  const layout = input.layout ?? "brief"
  const query = cleanLine(input.query)
  const answer = cleanMemoText(sanitizeMedSafetyTextUrls(String(input.answer ?? "").trim()))
  const summary = cleanLine(sanitizeMedSafetyTextUrls(input.summary ?? ""))
  const sections =
    answer.trim().length > 0 ? parseMedSafetyAnswerSections(answer) : summary ? parseMedSafetyAnswerSections(summary) : []
  const blocks: RNestMemoBlock[] = []

  if (layout !== "brief") return blocks
  if (input.structuredAnswer) return buildStructuredMemoBlocks(input, input.structuredAnswer)
  appendQuestionImageBlock(blocks, input)

  if (answer && sections.length === 0) {
    addSectionHeading(blocks, "내용 정리", true)
    blocks.push(createMemoBlock("paragraph", { text: answer }))
  } else {
    for (const section of sections) {
      appendFreeformSectionBlocks(blocks, section)
    }
  }

  const sourceUrls = addSourceBlocks(blocks, input.sources ?? [])
  const urls = extractUrls(query, summary, answer).filter((url) => !sourceUrls.includes(url))
  addBookmarks(blocks, urls)
  blocks.push(createMemoBlock("paragraph", { text: AI_NOTE_TEXT }))

  return sanitizeMedSafetyMemoBlocks(blocks)
}
