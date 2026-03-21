import {
  createMemoBlock,
  createMemoTableCell,
  createMemoTableRow,
  sanitizeNotebookUrl,
  type RNestMemoBlock,
  type RNestMemoTableRow,
} from "@/lib/notebook"

type MedSafetyResultKind = "medication" | "device" | "scenario"
type MedSafetySectionTone = "summary" | "action" | "warning" | "compare" | "neutral"

type MedSafetySection = {
  title: string
  lead: string
  bodyLines: string[]
  tone: MedSafetySectionTone
}

type ParsedBodyLine =
  | { kind: "blank"; level: number }
  | { kind: "bullet" | "number" | "text"; content: string; marker?: string; level: number }
  | { kind: "label"; label: string; content: string; level: number }

type DisplayBodyLine =
  | { kind: "blank"; level: number }
  | { kind: "bullet"; content: string; level: number }
  | { kind: "number"; content: string; marker?: string; level: number }
  | { kind: "text"; content: string; level: number }
  | { kind: "label"; label: string; content: string; level: number }
  | { kind: "subheading"; content: string; level: number }

export type BuildMedSafetyMemoInput = {
  query: string
  answer: string
  summary?: string
  savedAt?: number
  resultKind?: MedSafetyResultKind | null
  mode?: string | null
  situation?: string | null
  queryIntent?: string | null
  model?: string | null
}

const URL_PATTERN = /https?:\/\/[^\s<>"')\]]+/gi
const MAX_SECTION_RAW_LENGTH = 900

function cleanLine(value: string) {
  return String(value ?? "")
    .replace(/\u0000/g, "")
    .replace(/\r/g, "")
    .trim()
}

function normalizeRawLine(value: string) {
  return String(value ?? "").replace(/\u0000/g, "").replace(/\r/g, "")
}

function stripListPrefix(value: string) {
  return String(value ?? "")
    .replace(/^[-*•·]\s+/, "")
    .replace(/^\d+[.)]\s+/, "")
    .trim()
}

function getIndentLevel(value: string) {
  const match = String(value ?? "").match(/^\s+/)
  return match ? Math.min(3, Math.floor(match[0].length / 2)) : 0
}

function normalizeSectionTitle(value: string) {
  return cleanLine(value).replace(/^#+\s*/, "").replace(/[:：]\s*$/, "").trim()
}

function looksLikeSectionHeading(line: string, previousNonEmptyLine: string | null, nextNonEmptyLine: string | null) {
  const normalized = normalizeSectionTitle(line)
  if (!normalized) return false
  if (normalized.length > 28) return false
  if (/^[-*•·]/.test(line) || /^\d+[.)]/.test(line)) return false
  if (/[:：]\s*$/.test(line)) return true
  if (/^#+\s+/.test(line)) return true
  if (!previousNonEmptyLine && normalized.length <= 20) return true
  return Boolean(nextNonEmptyLine && !/[.?!다요]$/.test(normalized) && normalized.length <= 18)
}

function inferSectionTone(title: string, index: number): MedSafetySectionTone {
  const normalized = String(title ?? "")
    .replace(/\s+/g, "")
    .toLowerCase()

  if (index === 0 || /(핵심|요약|정의|의미|정리|결론)/.test(normalized)) return "summary"
  if (/(지금할일|즉시대응|조치|확인|실무|간호|모니터링|체크|대응|처치|보고순서)/.test(normalized)) return "action"
  if (/(주의|위험|금기|보고|호출|중단|이상반응|redflag|레드플래그)/.test(normalized)) return "warning"
  if (/(비교|차이|선택기준|구분|판별)/.test(normalized)) return "compare"
  return "neutral"
}

function buildSectionFromLines(title: string, lines: string[], index: number): MedSafetySection | null {
  const compact = lines.map(normalizeRawLine)
  const nonEmpty = compact.map(cleanLine).filter(Boolean)
  if (!nonEmpty.length) return null
  return {
    title: normalizeSectionTitle(title) || "상세 정리",
    lead: nonEmpty[0] ?? "",
    bodyLines: compact.slice(1),
    tone: inferSectionTone(title, index),
  }
}

function parseSections(value: string) {
  const lines = String(value ?? "")
    .replace(/\r/g, "")
    .split("\n")

  const sections: MedSafetySection[] = []
  let currentTitle = "핵심 정리"
  let currentLines: string[] = []

  const pushCurrent = () => {
    const section = buildSectionFromLines(currentTitle, currentLines, sections.length)
    if (section) sections.push(section)
    currentLines = []
  }

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = normalizeRawLine(lines[index] ?? "")
    const line = cleanLine(rawLine)
    if (!line) {
      currentLines.push("")
      continue
    }

    let previousNonEmptyLine: string | null = null
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      const previous = cleanLine(lines[cursor] ?? "")
      if (!previous) continue
      previousNonEmptyLine = previous
      break
    }

    let nextNonEmptyLine: string | null = null
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const next = cleanLine(lines[cursor] ?? "")
      if (!next) continue
      nextNonEmptyLine = next
      break
    }

    if (looksLikeSectionHeading(line, previousNonEmptyLine, nextNonEmptyLine)) {
      pushCurrent()
      currentTitle = line
      continue
    }
    currentLines.push(rawLine)
  }

  pushCurrent()
  return sections
}

function parseBodyLine(raw: string): ParsedBodyLine {
  if (!cleanLine(raw)) return { kind: "blank", level: 0 }

  const bulletMatch = raw.match(/^(\s*)([-*•·])\s+(.*)$/)
  if (bulletMatch) {
    return {
      kind: "bullet",
      content: cleanLine(bulletMatch[3] ?? ""),
      level: getIndentLevel(bulletMatch[1] ?? ""),
    }
  }

  const numberMatch = raw.match(/^(\s*)(\d+[.)])\s+(.*)$/)
  if (numberMatch) {
    return {
      kind: "number",
      marker: numberMatch[2],
      content: cleanLine(numberMatch[3] ?? ""),
      level: getIndentLevel(numberMatch[1] ?? ""),
    }
  }

  const labelMatch = raw.match(/^(\s*)([^:：\-\d•*][^:：]{0,18})[:：]\s*(.+)$/)
  if (labelMatch) {
    return {
      kind: "label",
      label: cleanLine(labelMatch[2] ?? ""),
      content: cleanLine(labelMatch[3] ?? ""),
      level: getIndentLevel(labelMatch[1] ?? ""),
    }
  }

  return {
    kind: "text",
    content: cleanLine(raw),
    level: getIndentLevel(raw),
  }
}

function countWords(value: string) {
  return String(value ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length
}

function extractParsedLineContent(line: ParsedBodyLine) {
  if (line.kind === "blank") return ""
  if (line.kind === "label") return `${line.label}: ${line.content}`.trim()
  return line.content
}

function looksLikeInlineBodySubheading(raw: string, nextRaw?: string | null) {
  const parsed = parseBodyLine(raw)
  if (parsed.kind === "blank") return false

  const text = stripListPrefix(cleanLine(extractParsedLineContent(parsed)))
  const nextText = stripListPrefix(cleanLine(String(nextRaw ?? "")))
  if (!text || !nextText) return false
  if (/[.。!?？！:]$/.test(text)) return false
  if (/니다$|습니다$|세요$|시오$|랍니다$|있습니다$|없습니다$|입니다$|합니다$/.test(text)) return false

  const wordCount = countWords(text)
  const headingSuffix = /(쪽|기준|예시|권장|해석|포인트|할 일|확인|양|색|점도\/이물|삽입부\/주변|이물|주변)$/

  if (headingSuffix.test(text) && wordCount <= 5 && text.length <= 30) return true
  if (/라면$/.test(text) && text.length <= 34) return true
  if ((wordCount <= 2 || (text.includes("/") && wordCount <= 3)) && text.length <= 18) return true

  return false
}

function buildDisplayBodyLines(lines: string[]): DisplayBodyLine[] {
  const parsedLines = lines.map((line) => parseBodyLine(line))
  const out: DisplayBodyLine[] = []
  let nestedLevel = 0

  const findNextNonBlankRaw = (startIndex: number) => {
    for (let index = startIndex; index < lines.length; index += 1) {
      if (parsedLines[index]?.kind !== "blank") return lines[index] ?? ""
    }
    return ""
  }

  for (let index = 0; index < parsedLines.length; index += 1) {
    const parsedLine = parsedLines[index]!
    if (parsedLine.kind === "blank") {
      out.push({ kind: "blank", level: 0 })
      continue
    }

    const nextNonBlankRaw = findNextNonBlankRaw(index + 1)
    if (looksLikeInlineBodySubheading(lines[index] ?? "", nextNonBlankRaw)) {
      nestedLevel = parsedLine.level + 1
      out.push({
        kind: "subheading",
        level: parsedLine.level,
        content: stripListPrefix(cleanLine(extractParsedLineContent(parsedLine))),
      })
      continue
    }

    const effectiveLevel = nestedLevel > 0 ? Math.max(parsedLine.level, nestedLevel) : parsedLine.level
    if (parsedLine.kind === "bullet") {
      out.push({
        kind: "bullet",
        level: effectiveLevel,
        content: parsedLine.content,
      })
      continue
    }
    if (parsedLine.kind === "number") {
      out.push({
        kind: "number",
        level: effectiveLevel,
        content: parsedLine.content,
        marker: parsedLine.marker,
      })
      continue
    }
    if (parsedLine.kind === "label") {
      out.push({
        kind: "label",
        level: effectiveLevel,
        label: parsedLine.label,
        content: parsedLine.content,
      })
      continue
    }
    out.push({
      kind: "text",
      level: effectiveLevel,
      content: parsedLine.content,
    })
  }

  return out
}

function buildComparisonRows(lines: DisplayBodyLine[]) {
  const rows: RNestMemoTableRow[] = []
  const remaining: DisplayBodyLine[] = []

  for (const line of lines) {
    if (line.kind === "label" && line.label && line.content) {
      rows.push(
        createMemoTableRow(line.label, line.content, {
          cells: [
            createMemoTableCell(line.label, { align: "left" }),
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

function kindLabel(kind: MedSafetyResultKind | null | undefined) {
  if (kind === "medication") return "의약품"
  if (kind === "device") return "의료기구"
  if (kind === "scenario") return "임상 질문"
  return ""
}

function modeLabel(mode: string | null | undefined) {
  if (mode === "ward") return "병동"
  if (mode === "er") return "ER"
  if (mode === "icu") return "ICU"
  return mode ?? ""
}

function situationLabel(situation: string | null | undefined) {
  if (situation === "general") return "일반 검색"
  if (situation === "pre_admin") return "투여 전 확인"
  if (situation === "during_admin") return "투여 중 모니터"
  if (situation === "event_response") return "이상/알람 대응"
  return situation ?? ""
}

function queryIntentLabel(queryIntent: string | null | undefined) {
  if (queryIntent === "medication") return "의약품"
  if (queryIntent === "device") return "의료기구"
  if (queryIntent === "scenario") return "상황 질문"
  return queryIntent ?? ""
}

function metaLines(input: BuildMedSafetyMemoInput) {
  const lines = [
    `저장 시각: ${new Date(input.savedAt ?? Date.now()).toLocaleString("ko-KR")}`,
    kindLabel(input.resultKind) ? `결과 유형: ${kindLabel(input.resultKind)}` : "",
    input.mode ? `근무 모드: ${modeLabel(input.mode)}` : "",
    input.situation ? `상황: ${situationLabel(input.situation)}` : "",
    input.queryIntent ? `질문 유형: ${queryIntentLabel(input.queryIntent)}` : "",
    input.model ? `응답 모델: ${input.model}` : "",
    "출처: RNest AI 임상 검색",
  ]
  return lines.filter(Boolean)
}

function withMemoIndent(text: string, level: number) {
  const content = cleanLine(text)
  if (!content) return ""
  if (level <= 0) return content
  return `\u2060 ${content}`
}

function appendNarrativeBlocks(blocks: RNestMemoBlock[], lines: DisplayBodyLine[], tone: MedSafetySectionTone) {
  for (const line of lines) {
    if (line.kind === "blank") continue
    if (line.kind === "subheading") {
      blocks.push(createMemoBlock("paragraph", { text: line.content }))
      continue
    }
    if (tone === "action" && (line.kind === "bullet" || line.kind === "number")) {
      blocks.push(createMemoBlock("checklist", { text: withMemoIndent(line.content, line.level), checked: false }))
      continue
    }
    if (line.kind === "label") {
      blocks.push(createMemoBlock("bulleted", { text: withMemoIndent(`${line.label}: ${line.content}`, line.level) }))
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

export function buildMedSafetyMemoBlocks(input: BuildMedSafetyMemoInput) {
  const query = cleanLine(input.query)
  const answer = String(input.answer ?? "").trim()
  const summary = cleanLine(input.summary ?? "")
  const sections = parseSections(answer)
  const blocks: RNestMemoBlock[] = []

  blocks.push(
    createMemoBlock("callout", {
      text: "⚠️ AI 참고 정보 — 의료 판단 대체 불가",
    })
  )

  if (query) {
    blocks.push(createMemoBlock("heading", { text: "질문" }))
    blocks.push(createMemoBlock("quote", { text: query }))
  }

  if (summary && summary !== query) {
    blocks.push(createMemoBlock("divider"))
    blocks.push(createMemoBlock("heading", { text: "한눈에 요약" }))
    blocks.push(createMemoBlock(summary.length <= 160 ? "callout" : "paragraph", { text: summary }))
  }

  if (sections.length > 0) {
    blocks.push(createMemoBlock("divider"))
    blocks.push(createMemoBlock("heading", { text: "AI 분석 정리" }))

    sections.forEach((section, index) => {
      if (index > 0) {
        blocks.push(createMemoBlock("divider"))
      }
      blocks.push(createMemoBlock("heading", { text: section.title }))

      if (section.lead) {
        if (section.tone === "warning") {
          blocks.push(createMemoBlock("callout", { text: `주의 · ${section.lead}` }))
        } else if (section.tone === "summary") {
          blocks.push(createMemoBlock("callout", { text: section.lead }))
        } else {
          blocks.push(createMemoBlock("paragraph", { text: section.lead }))
        }
      }

      const parsedLines = buildDisplayBodyLines(section.bodyLines)
      const { rows, remaining } =
        section.tone === "compare" || parsedLines.filter((line) => line.kind === "label").length >= 2
          ? buildComparisonRows(parsedLines)
          : { rows: [], remaining: parsedLines }

      if (rows.length >= 2) {
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

      appendNarrativeBlocks(blocks, remaining, section.tone)

      const sectionRaw = [section.lead, ...section.bodyLines.map((line) => stripListPrefix(line))]
        .filter(Boolean)
        .join("\n")
        .trim()
      if (sectionRaw.length > 360) {
        blocks.push(
          createMemoBlock("toggle", {
            text: `${section.title} 원문 메모`,
            detailText: sectionRaw.slice(0, MAX_SECTION_RAW_LENGTH),
          })
        )
      }
    })
  } else if (answer) {
    blocks.push(createMemoBlock("divider"))
    blocks.push(createMemoBlock("heading", { text: "AI 분석 정리" }))
    blocks.push(createMemoBlock("paragraph", { text: answer }))
  }

  const urls = extractUrls(query, summary, answer)
  if (urls.length > 0) {
    blocks.push(createMemoBlock("divider"))
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

  blocks.push(createMemoBlock("divider"))
  blocks.push(
    createMemoBlock("toggle", {
      text: "검색 메타",
      detailText: metaLines(input).join("\n"),
    })
  )

  return blocks
}
