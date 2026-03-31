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
}

const URL_PATTERN = /https?:\/\/[^\s<>"')\]]+/gi
const MAX_RAW_DETAIL_LENGTH = 3600
const MAX_CALLOUT_TEXT_LENGTH = 220
const RAW_DETAIL_LABEL = "원문/세부 근거"
const AI_NOTE_TEXT = "AI 참고용 메모입니다. 실제 처치와 보고는 환자 상태, 기관 기준, 담당자 판단으로 최종 확인하세요."

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
      const url = sanitizeNotebookUrl(match)
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

export function buildMedSafetyMemoBlocks(input: BuildMedSafetyMemoInput) {
  const layout = input.layout ?? "brief"
  const query = cleanLine(input.query)
  const answer = String(input.answer ?? "").trim()
  const summary = cleanLine(input.summary ?? "")
  const sections =
    answer.trim().length > 0 ? parseMedSafetyAnswerSections(answer) : summary ? parseMedSafetyAnswerSections(summary) : []
  const blocks: RNestMemoBlock[] = []
  const summaryCallout = buildSummaryCalloutText(sections, summary, answer)

  if (layout !== "brief") return blocks

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

  const urls = extractUrls(query, summary, answer)
  addBookmarks(blocks, urls)
  blocks.push(createMemoBlock("paragraph", { text: AI_NOTE_TEXT }))

  return blocks
}
