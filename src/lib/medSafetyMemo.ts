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
  model?: string | null
  structuredAnswer?: MedSafetyStructuredAnswer | null
  sources?: MedSafetySource[]
  questionType?: MedSafetyQuestionType | null
  triageLevel?: MedSafetyTriageLevel | null
  searchType?: string | null
  imageAttachmentId?: string | null
  imageAttachmentName?: string | null
}

const URL_PATTERN = /https?:\/\/[^\s<>"')\]]+/gi
const MAX_RAW_DETAIL_LENGTH = 3600
const MAX_CALLOUT_TEXT_LENGTH = 220
const MAX_MEMO_SOURCE_COUNT = 8
const RAW_DETAIL_LABEL = "원문/세부 근거"
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

function pushUnique(target: string[], value: string) {
  const cleaned = cleanLine(value)
  if (!cleaned) return
  if (!target.includes(cleaned)) target.push(cleaned)
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

function formatMemoSavedAt(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(
    2,
    "0"
  )} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`
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

function buildRawDetailText(answer: string) {
  const normalized = String(answer ?? "").replace(/\u0000/g, "").replace(/\r/g, "").trim()
  if (!normalized) return ""
  if (normalized.length <= MAX_RAW_DETAIL_LENGTH) return normalized
  return `${normalized.slice(0, MAX_RAW_DETAIL_LENGTH).trim()}\n\n[일부 원문이 길어 뒤쪽 내용은 생략되었습니다.]`
}

function firstContentLine(lines: DisplayBodyLine[]) {
  for (const line of lines) {
    const text = toChecklistText(line)
    if (text) return text
  }
  return ""
}

function removeFirstContentLine(lines: DisplayBodyLine[]) {
  const remaining: DisplayBodyLine[] = []
  let removed = false

  for (const line of lines) {
    if (!removed && toChecklistText(line)) {
      removed = true
      continue
    }
    remaining.push(line)
  }

  return remaining
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
  blocks.push(createMemoBlock("heading", { text }))
}

function addBookmarks(blocks: RNestMemoBlock[], urls: string[]) {
  if (urls.length === 0) return
  blocks.push(createMemoBlock("heading", { text: "참고 링크" }))
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

function buildMemoMetaRows(input: BuildMedSafetyMemoInput, questionType?: MedSafetyQuestionType | null, triageLevel?: MedSafetyTriageLevel | null) {
  const rows: RNestMemoTableRow[] = []
  rows.push(createMemoTableRowV2(["카테고리", getMedSafetyMemoQuestionTypeLabel(questionType)]))
  rows.push(createMemoTableRowV2(["긴급도", getMedSafetyMemoTriageLabel(triageLevel)]))
  const savedAt = formatMemoSavedAt(input.savedAt)
  if (savedAt) rows.push(createMemoTableRowV2(["분석 시각", savedAt]))
  if (input.searchType) rows.push(createMemoTableRowV2(["검색 방식", input.searchType === "premium" ? "프리미엄 공식 근거 검색" : "기본 검색"]))
  if (input.model) rows.push(createMemoTableRowV2(["모델", input.model]))
  return rows
}

function addMemoMetaTable(blocks: RNestMemoBlock[], input: BuildMedSafetyMemoInput, questionType?: MedSafetyQuestionType | null, triageLevel?: MedSafetyTriageLevel | null) {
  appendTableBlock(blocks, ["항목", "내용"], buildMemoMetaRows(input, questionType, triageLevel))
}

function addSourceBlocks(blocks: RNestMemoBlock[], sources: MedSafetySource[]) {
  const merged = mergeMedSafetySources(sources, MAX_MEMO_SOURCE_COUNT)
  if (!merged.length) return [] as string[]

  blocks.push(createMemoBlock("divider"))
  blocks.push(createMemoBlock("heading", { text: "공식 출처/근거" }))
  appendTableBlock(
    blocks,
    ["기관", "문서", "날짜"],
    merged.slice(0, 6).map((source) =>
      createMemoTableRowV2([
        getMedSafetySourceLabel(source),
        cleanLine(source.title) || cleanLine(source.domain) || "공식 자료",
        cleanLine(source.effectiveDate ?? source.retrievedAt ?? ""),
      ])
    )
  )

  for (const source of merged.slice(0, 5)) {
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
  const answer = sanitizeMedSafetyTextUrls(String(input.answer ?? "").trim())
  const questionType = structuredAnswer.question_type || input.questionType || (input.imageAttachmentId ? "image" : "general")
  const triageLevel = structuredAnswer.triage_level || input.triageLevel || "routine"
  const category = getMemoCategoryConfig(questionType)
  const blocks: RNestMemoBlock[] = []
  const bottomLine = truncateText(sanitizeMedSafetyTextUrls(structuredAnswer.bottom_line), 280)
  const allSources = mergeMedSafetySources([...(structuredAnswer.citations ?? []), ...(input.sources ?? [])], MAX_MEMO_SOURCE_COUNT)

  blocks.push(
    createMemoBlock("callout", {
      text: `${getMedSafetyMemoTriageLabel(triageLevel)} · ${bottomLine || "핵심 결론을 확인하세요."}`,
    })
  )

  if (query) {
    blocks.push(createMemoBlock("quote", { text: query }))
  }
  appendQuestionImageBlock(blocks, input)
  addMemoMetaTable(blocks, input, questionType, triageLevel)

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

  const rawDetailText = buildRawDetailText(answer || structuredAnswer.bottom_line)
  if (rawDetailText) {
    blocks.push(
      createMemoBlock("toggle", {
        text: RAW_DETAIL_LABEL,
        detailText: rawDetailText,
        collapsed: true,
      })
    )
  }

  const sourceUrls = addSourceBlocks(blocks, allSources)
  const urls = extractUrls(query, answer, structuredAnswer.bottom_line).filter((url) => !sourceUrls.includes(url))
  addBookmarks(blocks, urls)
  blocks.push(createMemoBlock("paragraph", { text: AI_NOTE_TEXT }))

  return blocks
}

export function buildMedSafetyMemoBlocks(input: BuildMedSafetyMemoInput) {
  const layout = input.layout ?? "brief"
  const query = cleanLine(input.query)
  const answer = sanitizeMedSafetyTextUrls(String(input.answer ?? "").trim())
  const summary = cleanLine(sanitizeMedSafetyTextUrls(input.summary ?? ""))
  const sections =
    answer.trim().length > 0 ? parseMedSafetyAnswerSections(answer) : summary ? parseMedSafetyAnswerSections(summary) : []
  const blocks: RNestMemoBlock[] = []
  const summaryCallout = buildSummaryCalloutText(sections, summary, answer)

  if (layout !== "brief") return blocks
  if (input.structuredAnswer) return buildStructuredMemoBlocks(input, input.structuredAnswer)

  const actionLines: DisplayBodyLine[] = []
  const warningNarrativeLines: DisplayBodyLine[] = []
  const warningCallouts: string[] = []
  const compareTables: RNestMemoTableRow[][] = []
  const compareNarrativeLines: DisplayBodyLine[] = []
  const extraLines: DisplayBodyLine[] = []

  for (const section of sections) {
    const parsedLines = buildMedSafetyDisplayLines(section.bodyLines)

    if (section.tone === "summary") {
      if (section.lead && cleanLine(section.lead) !== summaryCallout) {
        extraLines.push({
          kind: "text",
          content: cleanLine(section.lead),
          level: 0,
        })
      }
      if (section.bodyLines.length > 0) {
        const firstLine = firstContentLine(parsedLines)
        extraLines.push(...(cleanLine(firstLine) === summaryCallout ? removeFirstContentLine(parsedLines) : parsedLines))
      }
      continue
    }

    if (section.tone === "action") {
      if (section.lead) {
        actionLines.push({
          kind: "text",
          content: cleanLine(section.lead),
          level: 0,
        })
      }
      actionLines.push(...parsedLines)
      continue
    }

    if (section.tone === "warning") {
      if (section.lead) pushUnique(warningCallouts, section.lead)
      if (!section.lead && parsedLines.length > 0) {
        const firstLine = firstContentLine(parsedLines)
        if (firstLine) pushUnique(warningCallouts, firstLine)
        warningNarrativeLines.push(...removeFirstContentLine(parsedLines))
        continue
      }
      warningNarrativeLines.push(...parsedLines)
      continue
    }

    if (section.tone === "compare") {
      if (section.lead) {
        compareNarrativeLines.push({
          kind: "text",
          content: cleanLine(section.lead),
          level: 0,
        })
      }
      const { rows, remaining } = buildComparisonRows(parsedLines)
      if (rows.length >= 2) compareTables.push(rows)
      compareNarrativeLines.push(...remaining)
      continue
    }

    if (section.lead) {
      extraLines.push({
        kind: "text",
        content: cleanLine(section.lead),
        level: 0,
      })
    }
    extraLines.push(...parsedLines)
  }

  blocks.push(
    createMemoBlock("callout", {
      text: `핵심 결론 · ${summaryCallout}`,
    })
  )

  if (query) {
    blocks.push(createMemoBlock("quote", { text: query }))
  }
  appendQuestionImageBlock(blocks, input)
  addMemoMetaTable(blocks, input, input.questionType ?? (input.imageAttachmentId ? "image" : "general"), input.triageLevel ?? null)

  addHeadingIfNeeded(blocks, "지금 할 일", actionLines.length > 0)
  appendChecklistBlocks(blocks, actionLines)

  addHeadingIfNeeded(blocks, "주의/보고 포인트", warningCallouts.length > 0 || warningNarrativeLines.length > 0)
  for (const text of warningCallouts) {
    if (!text) continue
    blocks.push(createMemoBlock("callout", { text: `주의 · ${text}` }))
  }
  appendNarrativeBlocks(blocks, warningNarrativeLines)

  addHeadingIfNeeded(blocks, "비교/판단 근거", compareTables.length > 0 || compareNarrativeLines.length > 0)
  for (const rows of compareTables) {
    blocks.push(
      createMemoBlock("table", {
        table: {
          version: 2,
          columns: ["항목", "내용"],
          rows,
          headerRow: true,
        },
      })
    )
  }
  appendNarrativeBlocks(blocks, compareNarrativeLines)

  if (answer && sections.length === 0) {
    extraLines.push({
      kind: "text",
      content: answer,
      level: 0,
    })
  }
  addHeadingIfNeeded(blocks, "추가 설명", extraLines.length > 0)
  appendNarrativeBlocks(blocks, extraLines)

  const rawDetailText = buildRawDetailText(answer || summary)
  if (rawDetailText) {
    blocks.push(
      createMemoBlock("toggle", {
        text: RAW_DETAIL_LABEL,
        detailText: rawDetailText,
        collapsed: true,
      })
    )
  }

  const sourceUrls = addSourceBlocks(blocks, input.sources ?? [])
  const urls = extractUrls(query, summary, answer).filter((url) => !sourceUrls.includes(url))
  addBookmarks(blocks, urls)
  blocks.push(createMemoBlock("paragraph", { text: AI_NOTE_TEXT }))

  return blocks
}
