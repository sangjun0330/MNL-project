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
  buildMedSafetySectionBodyText,
  parseMedSafetyAnswerSections,
  type MedSafetyAnswerDisplayLine as DisplayBodyLine,
  type MedSafetyAnswerSection as MedSafetySection,
  type MedSafetyAnswerSectionTone as MedSafetySectionTone,
} from "@/lib/medSafetyAnswerSections"

type MedSafetyResultKind = "medication" | "device" | "scenario"

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
    if (tone === "action" && (line.kind === "bullet" || line.kind === "number")) {
      blocks.push(createMemoBlock("checklist", { text: withMemoIndent(line.content, line.level), checked: false }))
      continue
    }
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

export function buildMedSafetyMemoBlocks(input: BuildMedSafetyMemoInput) {
  const query = cleanLine(input.query)
  const answer = String(input.answer ?? "").trim()
  const summary = cleanLine(input.summary ?? "")
  const sections = parseMedSafetyAnswerSections(answer)
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
    blocks.push(createMemoBlock("heading", { text: "결론" }))
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

      const parsedLines = buildMedSafetyDisplayLines(section.bodyLines)
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

      const sectionRaw = buildMedSafetySectionBodyText(section)
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
