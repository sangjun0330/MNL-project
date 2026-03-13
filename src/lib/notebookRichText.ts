const BASIC_ENTITY_MAP: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
}

const ALLOWED_RICH_TAGS = new Set(["a", "br", "code", "em", "mark", "p", "s", "strong"])
const DROP_CONTENT_TAGS = new Set(["embed", "iframe", "link", "math", "meta", "object", "script", "style", "svg"])
const BLOCKISH_TAGS = new Set(["blockquote", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li"])
const TAG_ALIASES: Record<string, string> = {
  b: "strong",
  i: "em",
  strike: "s",
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function decodeBasicEntities(value: string) {
  return value.replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#39;/g, (entity) => BASIC_ENTITY_MAP[entity] ?? entity)
}

function htmlToPlainText(value: string) {
  const normalized = value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
    .replace(/<\/div>\s*<div[^>]*>/gi, "\n")
    .replace(/<\/(blockquote|h[1-6]|li)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "")
    .replace(/<[^>]+>/g, "")
  return decodeBasicEntities(normalized).replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim()
}

function normalizeRichHtmlLength(value: string, maxLength: number) {
  const trimmed = value.trim()
  if (trimmed.length <= maxLength) return trimmed
  const plain = htmlToPlainText(trimmed).slice(0, Math.min(maxLength, 4000))
  return plainTextToRichHtml(plain).trim().slice(0, maxLength)
}

export function normalizeNotebookLinkHref(value: unknown) {
  if (typeof value !== "string") return ""
  const raw = value.trim()
  if (!raw) return ""
  const candidate = raw.startsWith("www.") ? `https://${raw}` : raw
  try {
    const url = new URL(candidate)
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? url.toString() : ""
  } catch {
    return ""
  }
}

function sanitizeNotebookRichHtmlWithDom(value: string, maxLength: number) {
  const parsed = new DOMParser().parseFromString(`<body>${value}</body>`, "text/html")
  const doc = parsed.implementation.createHTMLDocument("")
  const container = doc.createElement("div")

  function appendChildren(source: ParentNode, target: HTMLElement) {
    for (const child of Array.from(source.childNodes)) {
      appendNode(child, target)
    }
  }

  function appendNode(node: Node, target: HTMLElement) {
    if (node.nodeType === Node.TEXT_NODE) {
      target.appendChild(doc.createTextNode(node.textContent ?? ""))
      return
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return

    const element = node as HTMLElement
    const tag = element.tagName.toLowerCase()

    if (DROP_CONTENT_TAGS.has(tag)) return

    if (tag === "br") {
      target.appendChild(doc.createElement("br"))
      return
    }

    if (BLOCKISH_TAGS.has(tag)) {
      const paragraph = doc.createElement("p")
      appendChildren(element, paragraph)
      target.appendChild(paragraph)
      return
    }

    const normalizedTag = TAG_ALIASES[tag] ?? tag
    if (!ALLOWED_RICH_TAGS.has(normalizedTag)) {
      appendChildren(element, target)
      return
    }

    if (normalizedTag === "a") {
      const href = normalizeNotebookLinkHref(element.getAttribute("href") ?? "")
      if (!href) {
        appendChildren(element, target)
        return
      }
      const anchor = doc.createElement("a")
      anchor.setAttribute("href", href)
      appendChildren(element, anchor)
      target.appendChild(anchor)
      return
    }

    const safeElement = doc.createElement(normalizedTag)
    appendChildren(element, safeElement)
    target.appendChild(safeElement)
  }

  appendChildren(parsed.body, container)
  return normalizeRichHtmlLength(container.innerHTML, maxLength)
}

function sanitizeNotebookRichHtmlFallback(value: string, maxLength: number) {
  const cleaned = value
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\s*(embed|iframe|link|math|meta|object|script|style|svg)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(embed|iframe|link|math|meta|object|script|style|svg)\b[^>]*\/?\s*>/gi, "")
    .replace(/<(\/?)([a-z0-9-]+)([^>]*)>/gi, (_match, closing: string, rawTag: string, rawAttrs: string) => {
      const tag = rawTag.toLowerCase()
      if (BLOCKISH_TAGS.has(tag)) {
        return closing ? "</p>" : "<p>"
      }
      if (tag === "br") {
        return "<br>"
      }

      const normalizedTag = TAG_ALIASES[tag] ?? tag
      if (!ALLOWED_RICH_TAGS.has(normalizedTag)) {
        return ""
      }

      if (closing) {
        return `</${normalizedTag}>`
      }

      if (normalizedTag === "a") {
        const hrefMatch = rawAttrs.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i)
        const href = normalizeNotebookLinkHref(hrefMatch?.[1] ?? hrefMatch?.[2] ?? hrefMatch?.[3] ?? "")
        return href ? `<a href="${escapeHtml(href)}">` : ""
      }

      return `<${normalizedTag}>`
    })

  return normalizeRichHtmlLength(cleaned, maxLength)
}

export function sanitizeNotebookRichHtml(value: unknown, maxLength: number) {
  if (typeof value !== "string") return ""
  const source = value.replace(/\u0000/g, "").trim()
  if (!source) return ""
  if (typeof DOMParser !== "undefined") {
    return sanitizeNotebookRichHtmlWithDom(source, maxLength)
  }
  return sanitizeNotebookRichHtmlFallback(source, maxLength)
}

export function richHtmlToPlainText(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return ""
  return htmlToPlainText(sanitizeNotebookRichHtml(value, 24000))
}

export function plainTextToRichHtml(value: unknown) {
  if (typeof value !== "string") return ""
  const normalized = value.replace(/\r/g, "").trim()
  if (!normalized) return ""
  return `<p>${escapeHtml(normalized).replace(/\n/g, "<br>")}</p>`
}

export function richHtmlToMarkdown(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return ""

  let markdown = sanitizeNotebookRichHtml(value, 24000)
  markdown = markdown.replace(/<br\s*\/?>/gi, "\n")
  markdown = markdown.replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
  markdown = markdown.replace(/<\/div>\s*<div[^>]*>/gi, "\n")
  markdown = markdown.replace(/<(strong|b)[^>]*>(.*?)<\/\1>/gis, (_, __, inner: string) => `**${richHtmlToMarkdown(inner)}**`)
  markdown = markdown.replace(/<(em|i)[^>]*>(.*?)<\/\1>/gis, (_, __, inner: string) => `*${richHtmlToMarkdown(inner)}*`)
  markdown = markdown.replace(/<(s|strike)[^>]*>(.*?)<\/\1>/gis, (_, __, inner: string) => `~~${richHtmlToMarkdown(inner)}~~`)
  markdown = markdown.replace(/<code[^>]*>(.*?)<\/code>/gis, (_, inner: string) => `\`${decodeBasicEntities(inner)}\``)
  markdown = markdown.replace(/<mark[^>]*>(.*?)<\/mark>/gis, (_, inner: string) => richHtmlToMarkdown(inner))
  markdown = markdown.replace(/<a[^>]*href=(?:"([^"]*)"|'([^']*)')[^>]*>(.*?)<\/a>/gis, (_, hrefA: string, hrefB: string, label: string) => {
    const href = normalizeNotebookLinkHref(hrefA || hrefB || "")
    const text = richHtmlToPlainText(label) || href
    return href ? `[${text}](${href})` : text
  })
  markdown = markdown.replace(/<[^>]+>/g, "")
  markdown = decodeBasicEntities(markdown)

  return markdown.replace(/\n{3,}/g, "\n\n").trim()
}
