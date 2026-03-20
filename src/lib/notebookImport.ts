import {
  createMemoBlock,
  createMemoTableCell,
  createMemoTableRow,
  type RNestMemoAttachment,
  type RNestMemoBlock,
  type RNestMemoTableAlign,
} from "@/lib/notebook"
import { normalizeNotebookLinkHref, plainTextToRichHtml, richHtmlToPlainText } from "@/lib/notebookRichText"

function normalizeText(value: string) {
  return value.replace(/\r/g, "").trim()
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function splitIntoParagraphs(value: string) {
  return value
    .replace(/\r/g, "")
    .trim()
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function findClosingDelimiter(source: string, marker: string, start: number) {
  let cursor = start
  while (cursor < source.length) {
    const found = source.indexOf(marker, cursor)
    if (found < 0) return -1
    if (marker.length === 1 && source[found - 1] === "\\") {
      cursor = found + marker.length
      continue
    }
    return found
  }
  return -1
}

function findClosingParen(source: string, start: number) {
  let depth = 0
  for (let index = start; index < source.length; index += 1) {
    const char = source[index]
    if (char === "\\" && index + 1 < source.length) {
      index += 1
      continue
    }
    if (char === "(") {
      depth += 1
      continue
    }
    if (char === ")") {
      if (depth === 0) return index
      depth -= 1
    }
  }
  return -1
}

function trimTrailingUrlPunctuation(value: string) {
  let end = value.length
  while (end > 0) {
    const char = value[end - 1]
    if (!".,!?;:".includes(char)) break
    end -= 1
  }
  const candidate = value.slice(0, end)
  if (candidate.endsWith(")") && !candidate.includes("(")) {
    return candidate.slice(0, -1)
  }
  return candidate
}

function parseInlineMarkdown(value: string): string {
  const source = value.replace(/\r/g, "")
  let result = ""
  let index = 0

  while (index < source.length) {
    const remaining = source.slice(index)

    if (source[index] === "\\" && index + 1 < source.length) {
      result += escapeHtml(source[index + 1])
      index += 2
      continue
    }

    if (source[index] === "`") {
      const end = findClosingDelimiter(source, "`", index + 1)
      if (end > index + 1) {
        result += `<code>${escapeHtml(source.slice(index + 1, end))}</code>`
        index = end + 1
        continue
      }
    }

    if (source.startsWith("**", index) || source.startsWith("__", index)) {
      const marker = source.slice(index, index + 2)
      const end = findClosingDelimiter(source, marker, index + 2)
      if (end > index + 2) {
        result += `<strong>${parseInlineMarkdown(source.slice(index + 2, end))}</strong>`
        index = end + 2
        continue
      }
    }

    if (source.startsWith("~~", index)) {
      const end = findClosingDelimiter(source, "~~", index + 2)
      if (end > index + 2) {
        result += `<s>${parseInlineMarkdown(source.slice(index + 2, end))}</s>`
        index = end + 2
        continue
      }
    }

    if (source[index] === "*" || source[index] === "_") {
      const marker = source[index]
      const end = findClosingDelimiter(source, marker, index + 1)
      if (end > index + 1) {
        result += `<em>${parseInlineMarkdown(source.slice(index + 1, end))}</em>`
        index = end + 1
        continue
      }
    }

    if (source.startsWith("[[", index)) {
      const end = source.indexOf("]]", index + 2)
      if (end > index + 2) {
        result += escapeHtml(source.slice(index + 2, end).trim())
        index = end + 2
        continue
      }
    }

    if (source[index] === "[") {
      const labelEnd = findClosingDelimiter(source, "]", index + 1)
      if (labelEnd > index + 1 && source[labelEnd + 1] === "(") {
        const hrefEnd = findClosingParen(source, labelEnd + 2)
        if (hrefEnd > labelEnd + 2) {
          const href = normalizeNotebookLinkHref(source.slice(labelEnd + 2, hrefEnd).trim())
          const labelHtml = parseInlineMarkdown(source.slice(index + 1, labelEnd))
          result += href ? `<a href="${escapeHtml(href)}">${labelHtml || escapeHtml(href)}</a>` : labelHtml
          index = hrefEnd + 1
          continue
        }
      }
    }

    const urlMatch = remaining.match(/^(https?:\/\/[^\s<]+|mailto:[^\s<]+|www\.[^\s<]+)/i)
    if (urlMatch) {
      const rawHref = trimTrailingUrlPunctuation(urlMatch[0])
      const href = normalizeNotebookLinkHref(rawHref)
      if (href) {
        result += `<a href="${escapeHtml(href)}">${escapeHtml(rawHref)}</a>`
        index += rawHref.length
        continue
      }
    }

    result += escapeHtml(source[index])
    index += 1
  }

  return result
}

function markdownTextToRichHtml(value: string) {
  const paragraphs = splitIntoParagraphs(value)
  if (paragraphs.length === 0) return ""
  return paragraphs
    .map((paragraph) => {
      const lines = paragraph.split("\n").map((line) => line.trimEnd())
      return `<p>${lines.map((line) => parseInlineMarkdown(line)).join("<br>")}</p>`
    })
    .join("")
}

function createRichTextPayload(value: string) {
  const html = markdownTextToRichHtml(value)
  const text = richHtmlToPlainText(html) || normalizeText(value)
  return {
    text,
    textHtml: html || (text ? plainTextToRichHtml(text) : ""),
  }
}

function splitTableRow(line: string) {
  const trimmed = line.trim()
  if (!trimmed || !trimmed.includes("|")) return null

  const cells: string[] = []
  let current = ""
  let escaped = false
  let sawPipe = false

  for (const char of trimmed) {
    if (escaped) {
      current += char
      escaped = false
      continue
    }
    if (char === "\\") {
      escaped = true
      continue
    }
    if (char === "|") {
      sawPipe = true
      cells.push(current.trim())
      current = ""
      continue
    }
    current += char
  }

  if (!sawPipe) return null
  cells.push(current.trim())
  if (trimmed.startsWith("|")) cells.shift()
  if (trimmed.endsWith("|")) cells.pop()
  return cells.length >= 2 ? cells.map((cell) => cell.replace(/\\\|/g, "|").trim()) : null
}

function parseDividerAlignmentRow(cells: string[]) {
  if (!cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()))) return null
  return cells.map((cell) => {
    const value = cell.trim()
    if (value.startsWith(":") && value.endsWith(":")) return "center"
    if (value.endsWith(":")) return "right"
    return "left"
  }) as RNestMemoTableAlign[]
}

function isSupportedNotebookEmbedUrl(value: string) {
  return /https?:\/\/(www\.)?(youtube\.com|youtu\.be|instagram\.com|x\.com|twitter\.com|notion\.so)\//i.test(value.trim())
}

function isStandaloneUrlLine(value: string) {
  return /^(https?:\/\/|mailto:|www\.)/i.test(value.trim())
}

function parseStandaloneMarkdownLink(value: string) {
  const match = value.trim().match(/^\[([^\]]+)\]\(([^)]+)\)$/)
  if (!match) return null
  const href = normalizeNotebookLinkHref(match[2] ?? "")
  if (!href) return null
  return {
    label: normalizeText(match[1] ?? ""),
    href,
  }
}

function parseStandalonePageLink(value: string) {
  const trimmed = value.trim()
  const wikiMatch = trimmed.match(/^\[\[([^[\]]+)\]\]$/)
  if (wikiMatch) {
    const title = normalizeText(wikiMatch[1] ?? "")
    return title ? createMemoBlock("pageLink", { text: title, titleSnapshot: title }) : null
  }
  const directMatch = trimmed.match(/^\[([^\]]+)\]\((rnest:\/\/memo\/[^)]+)\)$/i)
  if (!directMatch) return null
  const title = normalizeText(directMatch[1] ?? "")
  const target = normalizeText((directMatch[2] ?? "").replace(/^rnest:\/\/memo\//i, ""))
  return createMemoBlock("pageLink", {
    text: title || target,
    titleSnapshot: title || target,
    targetDocId: target || undefined,
  })
}

function createNotebookUrlBlock(value: string, title?: string) {
  const href = normalizeText(value)
  if (!href) return createMemoBlock("paragraph")
  if (isSupportedNotebookEmbedUrl(href)) {
    return createMemoBlock("embed", {
      url: href,
      text: title || href,
      titleSnapshot: title || href,
    })
  }
  return createMemoBlock("bookmark", {
    text: href,
    detailText: normalizeText(title || href) || href,
  })
}

export { isSupportedNotebookEmbedUrl }

export function createNotebookGalleryBlock(attachments: RNestMemoAttachment[], caption = "") {
  return createMemoBlock("gallery", {
    text: caption,
    attachmentIds: attachments.map((attachment) => attachment.id),
  })
}

function createRichTextBlock(type: RNestMemoBlock["type"], value: string, input?: Partial<RNestMemoBlock>) {
  const payload = createRichTextPayload(value)
  return createMemoBlock(type, {
    ...input,
    text: payload.text,
    textHtml: payload.textHtml,
  })
}

function parsePageSpacerLine(value: string) {
  const trimmed = value.trim()
  if (/^<!--\s*RNEST_PAGE_BREAK\s*-->$/i.test(trimmed) || /^<!--\s*RNEST_PAGE_SPACER\s+next-page\s*-->$/i.test(trimmed)) {
    return createMemoBlock("pageSpacer", { spacerMode: "next-page", spacerHeight: 0 })
  }
  const blankSpaceMatch = trimmed.match(/^<!--\s*RNEST_BLANK_SPACE(?:\s+(?:units=)?(\d+))?\s*-->$/i)
  if (blankSpaceMatch) {
    return createMemoBlock("pageSpacer", {
      spacerMode: "blank-space",
      spacerHeight: Math.max(1, Math.min(12, Number(blankSpaceMatch[1] ?? "1") || 1)),
    })
  }
  return null
}

function parseStandaloneContentBlock(value: string) {
  const pageLink = parseStandalonePageLink(value)
  if (pageLink) return pageLink

  const markdownLink = parseStandaloneMarkdownLink(value)
  if (markdownLink) return createNotebookUrlBlock(markdownLink.href, markdownLink.label)

  if (isStandaloneUrlLine(value)) {
    const href = normalizeNotebookLinkHref(value.trim()) || normalizeNotebookLinkHref(`https://${value.trim()}`)
    return href ? createNotebookUrlBlock(href) : null
  }

  return null
}

function detectInlineCallout(value: string) {
  const markdownMatch = value.trim().match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION|INFO|SUMMARY)\]\s*(.*)$/i)
  if (markdownMatch) {
    return normalizeText(markdownMatch[2] ?? "")
  }
  const prefixedMatch = value.trim().match(/^(주의|참고|핵심|요약|중요|알림|팁|노트|TIP|NOTE|INFO|WARNING|CAUTION)\s*[:：-]\s+(.+)$/i)
  if (prefixedMatch) {
    return normalizeText(value)
  }
  return null
}

function isDividerLine(value: string) {
  return /^([-*_])(?:\s*\1){2,}\s*$/.test(value.trim())
}

function isAtxHeading(value: string) {
  return /^#{1,6}\s+/.test(value.trim())
}

function isSetextUnderline(value: string) {
  return /^={3,}\s*$/.test(value.trim()) || /^-{3,}\s*$/.test(value.trim())
}

function isChecklistLine(value: string) {
  return /^[-*+]\s+\[[ xX]\]\s+/.test(value.trim())
}

function isBulletLine(value: string) {
  return /^[-*+]\s+/.test(value.trim()) && !isChecklistLine(value)
}

function isNumberedLine(value: string) {
  return /^\d+[.)]\s+/.test(value.trim())
}

function isQuoteLine(value: string) {
  return /^>\s?/.test(value.trim())
}

function isCodeFence(value: string) {
  return /^(```|~~~)/.test(value.trim())
}

function isDetailsStart(value: string) {
  return /^<details(?:\s+open)?\s*>/i.test(value.trim())
}

function looksLikeBlockStart(value: string, nextValue: string | undefined) {
  const trimmed = value.trim()
  if (!trimmed) return false
  if (
    parsePageSpacerLine(trimmed) ||
    isCodeFence(trimmed) ||
    isDetailsStart(trimmed) ||
    isDividerLine(trimmed) ||
    isAtxHeading(trimmed) ||
    isChecklistLine(trimmed) ||
    isBulletLine(trimmed) ||
    isNumberedLine(trimmed) ||
    isQuoteLine(trimmed)
  ) {
    return true
  }
  const tableHeader = splitTableRow(trimmed)
  const dividerRow = nextValue ? splitTableRow(nextValue) : null
  if (tableHeader && dividerRow && dividerRow.length === tableHeader.length && parseDividerAlignmentRow(dividerRow)) {
    return true
  }
  return false
}

function collectContinuationLines(lines: string[], startIndex: number) {
  const collected: string[] = []
  let index = startIndex

  while (index < lines.length) {
    const raw = lines[index]
    const trimmed = raw.trim()
    if (!trimmed) break
    if (!/^\s{2,}|\t/.test(raw)) break
    if (looksLikeBlockStart(trimmed, lines[index + 1])) break
    collected.push(trimmed)
    index += 1
  }

  return { lines: collected, nextIndex: index }
}

export function importNotebookBlocksFromText(rawValue: string): RNestMemoBlock[] {
  const source = rawValue.replace(/\r/g, "")
  const lines = source.split("\n")
  const blocks: RNestMemoBlock[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    const trimmed = line.trim()

    if (!trimmed) {
      index += 1
      continue
    }

    const pageSpacer = parsePageSpacerLine(trimmed)
    if (pageSpacer) {
      blocks.push(pageSpacer)
      index += 1
      continue
    }

    if (isCodeFence(trimmed)) {
      const fence = trimmed.startsWith("~~~") ? "~~~" : "```"
      const language = normalizeText(trimmed.slice(fence.length)) || "text"
      const codeLines: string[] = []
      index += 1
      while (index < lines.length && !lines[index].trim().startsWith(fence)) {
        codeLines.push(lines[index])
        index += 1
      }
      if (index < lines.length) index += 1
      blocks.push(createMemoBlock("code", { language, code: codeLines.join("\n") }))
      continue
    }

    if (isDetailsStart(trimmed)) {
      const detailLines: string[] = []
      let summary = ""
      index += 1
      while (index < lines.length && !/<\/details>\s*$/i.test(lines[index].trim())) {
        const summaryMatch = lines[index].match(/^\s*<summary>([\s\S]*?)<\/summary>\s*$/i)
        if (summaryMatch) {
          summary = normalizeText(summaryMatch[1] ?? "")
        } else {
          detailLines.push(lines[index])
        }
        index += 1
      }
      if (index < lines.length) index += 1
      const detailPayload = createRichTextPayload(detailLines.join("\n").trim())
      blocks.push(
        createMemoBlock("toggle", {
          text: richHtmlToPlainText(markdownTextToRichHtml(summary)) || summary || "토글",
          textHtml: markdownTextToRichHtml(summary) || plainTextToRichHtml(summary || "토글"),
          detailText: detailPayload.text || undefined,
          detailTextHtml: detailPayload.textHtml,
        })
      )
      continue
    }

    if (isAtxHeading(trimmed)) {
      const headingText = trimmed.replace(/^#{1,6}\s+/, "").trim()
      blocks.push(createRichTextBlock("heading", headingText))
      index += 1
      continue
    }

    if (index + 1 < lines.length && trimmed && !looksLikeBlockStart(trimmed, lines[index + 1])) {
      const underline = lines[index + 1].trim()
      if (isSetextUnderline(underline)) {
        blocks.push(createRichTextBlock("heading", trimmed))
        index += 2
        continue
      }
    }

    if (isDividerLine(trimmed)) {
      blocks.push(createMemoBlock("divider"))
      index += 1
      continue
    }

    const tableHeader = splitTableRow(line)
    const dividerRow = index + 1 < lines.length ? splitTableRow(lines[index + 1]) : null
    const alignments =
      tableHeader && dividerRow && dividerRow.length === tableHeader.length ? parseDividerAlignmentRow(dividerRow) : null
    if (tableHeader && dividerRow && alignments) {
      const columnPayloads = tableHeader.map((cell) => createRichTextPayload(cell))
      const rowLines: string[][] = []
      index += 2
      while (index < lines.length) {
        const cells = splitTableRow(lines[index])
        if (!cells) break
        rowLines.push(cells)
        index += 1
      }
      blocks.push(
        createMemoBlock("table", {
          table: {
            version: 2,
            columns: columnPayloads.map((payload) => payload.text || ""),
            columnHtml: columnPayloads.map((payload) => payload.textHtml || ""),
            alignments,
            rows: rowLines.map((cells) => {
              const normalizedCells = tableHeader.map((_, columnIndex) =>
                createMemoTableCell("", {
                  text: createRichTextPayload(cells[columnIndex] ?? "").text,
                  textHtml: createRichTextPayload(cells[columnIndex] ?? "").textHtml,
                  align: alignments[columnIndex] ?? "left",
                })
              )
              return createMemoTableRow("", "", { cells: normalizedCells })
            }),
          },
        })
      )
      continue
    }

    if (isQuoteLine(trimmed)) {
      const quoteLines: string[] = []
      while (index < lines.length) {
        const current = lines[index]
        const currentTrimmed = current.trim()
        if (isQuoteLine(currentTrimmed)) {
          quoteLines.push(currentTrimmed.replace(/^>\s?/, ""))
          index += 1
          continue
        }
        if (!currentTrimmed && index + 1 < lines.length && isQuoteLine(lines[index + 1].trim())) {
          quoteLines.push("")
          index += 1
          continue
        }
        break
      }

      const firstNonEmptyIndex = quoteLines.findIndex((item) => item.trim().length > 0)
      const firstNonEmpty = firstNonEmptyIndex >= 0 ? quoteLines[firstNonEmptyIndex] : ""
      const inlineCallout = detectInlineCallout(firstNonEmpty)
      if (inlineCallout !== null) {
        const markdownMatch = firstNonEmpty.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION|INFO|SUMMARY)\]\s*(.*)$/i)
        const bodyLines = quoteLines.slice()
        if (firstNonEmptyIndex >= 0 && markdownMatch) {
          bodyLines.splice(firstNonEmptyIndex, 1, normalizeText(markdownMatch[2] ?? ""))
        }
        blocks.push(createRichTextBlock("callout", bodyLines.join("\n").trim()))
      } else {
        blocks.push(createRichTextBlock("quote", quoteLines.join("\n").trim()))
      }
      continue
    }

    if (isChecklistLine(trimmed)) {
      const firstText = trimmed.replace(/^[-*+]\s+\[[ xX]\]\s+/, "")
      const continuation = collectContinuationLines(lines, index + 1)
      const body = [firstText, ...continuation.lines].join("\n").trim()
      blocks.push(
        createMemoBlock("checklist", {
          ...createRichTextPayload(body),
          checked: /^[-*+]\s+\[[xX]\]\s+/.test(trimmed),
        })
      )
      index = continuation.nextIndex
      continue
    }

    if (isBulletLine(trimmed)) {
      const firstText = trimmed.replace(/^[-*+]\s+/, "")
      const continuation = collectContinuationLines(lines, index + 1)
      blocks.push(createRichTextBlock("bulleted", [firstText, ...continuation.lines].join("\n").trim()))
      index = continuation.nextIndex
      continue
    }

    if (isNumberedLine(trimmed)) {
      const firstText = trimmed.replace(/^\d+[.)]\s+/, "")
      const continuation = collectContinuationLines(lines, index + 1)
      blocks.push(createRichTextBlock("numbered", [firstText, ...continuation.lines].join("\n").trim()))
      index = continuation.nextIndex
      continue
    }

    const paragraphLines = [trimmed]
    index += 1
    while (index < lines.length) {
      const current = lines[index]
      const currentTrimmed = current.trim()
      if (!currentTrimmed) break
      if (looksLikeBlockStart(currentTrimmed, lines[index + 1])) break
      paragraphLines.push(currentTrimmed)
      index += 1
    }

    const paragraphText = paragraphLines.join("\n").trim()
    const standaloneBlock = parseStandaloneContentBlock(paragraphText)
    if (standaloneBlock) {
      blocks.push(standaloneBlock)
      continue
    }

    const inlineCallout = detectInlineCallout(paragraphText)
    if (inlineCallout !== null) {
      blocks.push(createRichTextBlock("callout", paragraphText))
      continue
    }

    blocks.push(createRichTextBlock("paragraph", paragraphText))
  }

  return blocks.length > 0 ? blocks : [createMemoBlock("paragraph")]
}

export const importTextToBlocks = importNotebookBlocksFromText
