import {
  createMemoBlock,
  createMemoTableRow,
  type RNestMemoAttachment,
  type RNestMemoBlock,
} from "@/lib/notebook"

function normalizeText(value: string) {
  return value.replace(/\r/g, "").trim()
}

function splitTableRow(line: string) {
  const trimmed = line.trim()
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return null
  return trimmed
    .slice(1, -1)
    .split("|")
    .map((cell) => cell.replace(/\\\|/g, "|").trim())
}

function isDividerRow(cells: string[]) {
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell))
}

export function isSupportedNotebookEmbedUrl(value: string) {
  return /https?:\/\/(www\.)?(youtube\.com|youtu\.be|instagram\.com|x\.com|twitter\.com|notion\.so)\//i.test(value.trim())
}

export function createNotebookUrlBlock(value: string) {
  const href = normalizeText(value)
  if (!href) return createMemoBlock("paragraph")
  if (isSupportedNotebookEmbedUrl(href)) {
    return createMemoBlock("embed", { url: href })
  }
  return createMemoBlock("bookmark", { text: href, detailText: href })
}

export function createNotebookGalleryBlock(attachments: RNestMemoAttachment[], caption = "") {
  return createMemoBlock("gallery", {
    text: caption,
    attachmentIds: attachments.map((attachment) => attachment.id),
  })
}

export function importNotebookBlocksFromText(rawValue: string): RNestMemoBlock[] {
  const source = rawValue.replace(/\r/g, "")
  const lines = source.split("\n")
  const blocks: RNestMemoBlock[] = []
  let index = 0

  function pushParagraph(value: string) {
    const text = normalizeText(value)
    if (!text) return
    blocks.push(createMemoBlock("paragraph", { text }))
  }

  while (index < lines.length) {
    const line = lines[index]
    const trimmed = line.trim()

    if (!trimmed) {
      index += 1
      continue
    }

    if (trimmed.startsWith("```")) {
      const language = trimmed.slice(3).trim() || "text"
      const codeLines: string[] = []
      index += 1
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        codeLines.push(lines[index])
        index += 1
      }
      if (index < lines.length) index += 1
      blocks.push(createMemoBlock("code", { language, code: codeLines.join("\n") }))
      continue
    }

    if (/^#{1,6}\s+/.test(trimmed)) {
      blocks.push(createMemoBlock("heading", { text: trimmed.replace(/^#{1,6}\s+/, "") }))
      index += 1
      continue
    }

    if (/^- \[[ xX]\]\s+/.test(trimmed)) {
      blocks.push(
        createMemoBlock("checklist", {
          text: trimmed.replace(/^- \[[ xX]\]\s+/, ""),
          checked: /^- \[[xX]\]/.test(trimmed),
        })
      )
      index += 1
      continue
    }

    if (/^[-*+]\s+/.test(trimmed)) {
      blocks.push(createMemoBlock("bulleted", { text: trimmed.replace(/^[-*+]\s+/, "") }))
      index += 1
      continue
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      blocks.push(createMemoBlock("numbered", { text: trimmed.replace(/^\d+\.\s+/, "") }))
      index += 1
      continue
    }

    if (/^>\s?/.test(trimmed)) {
      const quoteLines: string[] = []
      while (index < lines.length && /^>\s?/.test(lines[index].trim())) {
        quoteLines.push(lines[index].trim().replace(/^>\s?/, ""))
        index += 1
      }
      blocks.push(createMemoBlock("quote", { text: quoteLines.join("\n") }))
      continue
    }

    const tableHeader = splitTableRow(line)
    const dividerRow = index + 1 < lines.length ? splitTableRow(lines[index + 1]) : null
    if (tableHeader && dividerRow && dividerRow.length === tableHeader.length && isDividerRow(dividerRow)) {
      const rowLines: string[][] = []
      index += 2
      while (index < lines.length) {
        const cells = splitTableRow(lines[index])
        if (!cells || cells.length !== tableHeader.length) break
        rowLines.push(cells)
        index += 1
      }
      blocks.push(
        createMemoBlock("table", {
          table: {
            version: 2,
            columns: tableHeader,
            rows: rowLines.map((cells) => ({
              ...createMemoTableRow(cells[0] ?? "", cells[1] ?? ""),
              cells: cells.map((cell) => ({ text: cell, textHtml: "", id: "" })),
            })),
          },
        })
      )
      continue
    }

    if (/^(https?:\/\/|mailto:|www\.)/i.test(trimmed)) {
      blocks.push(createNotebookUrlBlock(trimmed))
      index += 1
      continue
    }

    const paragraphLines = [trimmed]
    index += 1
    while (index < lines.length && lines[index].trim()) {
      if (
        /^#{1,6}\s+/.test(lines[index].trim()) ||
        /^[-*+]\s+/.test(lines[index].trim()) ||
        /^\d+\.\s+/.test(lines[index].trim()) ||
        /^- \[[ xX]\]\s+/.test(lines[index].trim()) ||
        /^>\s?/.test(lines[index].trim()) ||
        lines[index].trim().startsWith("```")
      ) {
        break
      }
      paragraphLines.push(lines[index].trim())
      index += 1
    }
    pushParagraph(paragraphLines.join("\n"))
  }

  return blocks.length > 0 ? blocks : [createMemoBlock("paragraph")]
}

export const importTextToBlocks = importNotebookBlocksFromText
