"use client"

import { Fragment, type MutableRefObject, useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  ArrowDownAZ,
  ArrowUpDown,
  BookOpenText,
  Calendar,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  File,
  FileText,
  Folder,
  FolderPlus,
  GripVertical,
  Heading1,
  Highlighter,
  ImageIcon,
  Leaf,
  Lightbulb,
  Link2,
  List,
  ListOrdered,
  Lock,
  LockOpen,
  MessageSquareQuote,
  Minus,
  MoonStar,
  MoreHorizontal,
  NotebookPen,
  Paperclip,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Quote,
  ReceiptText,
  Replace,
  RotateCcw,
  RotateCw,
  Search,
  Shield,
  Sparkles,
  Star,
  StickyNote,
  Table2,
  Trash2,
  Type,
  X,
} from "lucide-react"
import { cn } from "@/lib/cn"
import {
  builtinRecordTemplates,
  coerceMemoBlockType,
  createMemoBlock,
  createMemoFromPreset,
  createMemoTableCell,
  createMemoTemplateFromDocument,
  createNotebookId,
  createMemoFromTemplate,
  createMemoTableRow,
  detectNotebookEmbedProvider,
  defaultMemoTemplates,
  formatNotebookDateTime,
  getMemoBlockDetailText,
  getMemoBlockText,
  getMemoDocumentTitle,
  getMemoTableCellText,
  getMemoTableColumnText,
  getMemoTableRowCells,
  memoTemplateToPreviewText,
  memoBlockToPlainText,
  memoCoverOptions,
  memoHighlightColors,
  memoIconOptions,
  memoDocumentToMarkdown,
  memoDocumentToPlainText,
  NOTEBOOK_TEMPLATE_SYNC_EVENT_KEY,
  notebookFeatureFlags,
  recordFieldValueToText,
  resolveRecordTemplate,
  sanitizeMemoDocument,
  sanitizeMemoTemplate,
  sanitizeNotebookTags,
  upgradeMemoTableToV2,
  createRecordEntryFromTemplate,
  type RNestMemoBlock,
  type RNestMemoAttachment,
  type RNestMemoBlockType,
  type RNestMemoCoverId,
  type RNestMemoDocument,
  type RNestMemoFolder,
  type RNestMemoHighlightColor,
  type RNestMemoIconId,
  type RNestMemoState,
  type RNestMemoTemplate,
  type RNestRecordEntry,
  type RNestRecordTemplate,
} from "@/lib/notebook"
import { importTextToBlocks } from "@/lib/notebookImport"
import { normalizeNotebookLinkHref, plainTextToRichHtml, sanitizeNotebookRichHtml } from "@/lib/notebookRichText"
import {
  applyLockedMemoPayload,
  createLockedMemoEnvelope,
  createLockedMemoPayloadFromDocument,
  createLockedMemoSnapshot,
  reencryptLockedMemoEnvelope,
  removeLockedMemoSnapshot,
  unlockLockedMemoEnvelope,
  type RNestLockedMemoPayload,
} from "@/lib/notebookSecurity"
import {
  buildNotebookFileUrl,
  clearNotebookImagePreview,
  deleteNotebookFiles,
  getCachedNotebookImagePreview,
  loadNotebookFileAccessUrl,
  loadNotebookImagePreview,
  seedNotebookImagePreview,
  uploadNotebookFile,
} from "@/lib/notebookFiles"
import {
  buildResolvedPdfLayoutKey,
  type MeasuredPdfBlockBounds,
  type ResolvedPdfLayout,
} from "@/lib/notebookPdfLayout"
import { useAppStore } from "@/lib/store"
import { getBrowserAuthHeaders } from "@/lib/auth"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { NotebookRichTextField } from "@/components/pages/tools/notebook/NotebookRichTextField"
import Link from "next/link"

/* ─── helpers ──────────────────────────────────────────────── */

function insertRecent(list: string[], id: string, limit = 20) {
  return [id, ...list.filter((item) => item !== id)].slice(0, limit)
}

function createSafeDownloadName(value: string, fallback = "memo") {
  return value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60) || fallback
}

function downloadTextFile(fileName: string, content: string, mimeType: string) {
  if (typeof window === "undefined") return
  const blob = new Blob([content], { type: mimeType })
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.style.display = "none"
  a.href = url
  a.download = createSafeDownloadName(fileName, "memo")
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.URL.revokeObjectURL(url)
}

const PDF_EXPORT_MARGIN_PT = 28
const PDF_EXPORT_CAPTURE_SCALE = 2
const PDF_EXPORT_MAX_CAPTURE_SCALE = 3
const PDF_EXPORT_DEFAULT_CONTENT_DENSITY_MULTIPLIER = 1.5
const PDF_EXPORT_CONTENT_DENSITY_STORAGE_KEY = "rnest:notebook:pdf-content-density"
const PDF_PAGE_WIDTH_PT = 595.28
const PDF_PAGE_HEIGHT_PT = 841.89
const PDF_BREAK_PADDING_PX = 8
const PDF_MIN_SAFE_SLICE_HEIGHT_PX = 96
const BLANK_SPACE_UNIT_PX = 36
const PDF_CONTENT_DENSITY_OPTIONS = [
  { value: 1, label: "1.0x" },
  { value: 1.25, label: "1.25x" },
  { value: 1.5, label: "1.5x" },
] as const
const PDF_INNER_BREAK_SELECTOR = [
  "p",
  "li",
  "blockquote",
  "pre",
  "table tr",
  "figcaption",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  '[data-notebook-rich-input="true"] > *',
  ".notebook-rich-text-editor > *",
  ".ProseMirror > *",
].join(", ")

type PdfSlice = {
  offsetY: number
  height: number
  breakAnchor?: PdfBreakAnchor
}

type PdfSlicePlan = {
  totalHeight: number
  pageSliceHeightPx: number
  slices: PdfSlice[]
}

type PdfPreviewPage = {
  pageNumber: number
  imageDataUrl: string
  renderedHeightPt: number
}

type PdfViewMode = "editor" | "preview"

type PdfRenderState = "idle" | "layouting" | "rasterizing" | "ready" | "error"

type PdfRenderSnapshot = {
  layout: ResolvedPdfLayout
  pages: PdfPreviewPage[]
  pageWidth: number
  pageHeight: number
  contentWidth: number
  contentHeight: number
  captureWidth: number
  contentDensityMultiplier: number
  renderedAt: number
}

type PdfRenderCacheEntry = PdfRenderSnapshot & {
  docId: string
  docUpdatedAt: number
}

type RenderPdfPagesOptions = {
  doc: RNestMemoDocument
  contentDensityMultiplier: number
  onLayout?: (layout: ResolvedPdfLayout) => void
  onPageRendered?: (page: PdfPreviewPage, completed: number, total: number) => void
  shouldCancel?: () => boolean
}

function sanitizePdfContentDensityMultiplier(value: unknown) {
  const nextValue = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(nextValue)) return PDF_EXPORT_DEFAULT_CONTENT_DENSITY_MULTIPLIER
  const matched = PDF_CONTENT_DENSITY_OPTIONS.find((option) => Math.abs(option.value - nextValue) < 0.001)
  return matched?.value ?? PDF_EXPORT_DEFAULT_CONTENT_DENSITY_MULTIPLIER
}

type PdfBreakAnchor = {
  naturalY: number
  blockId?: string
  edge?: "top" | "bottom"
  delta?: number
  target?: "block" | "page-spacer-filler" | "page-spacer-marker" | "forced-page-start"
}

function isNextPageSpacer(block: RNestMemoBlock | null | undefined) {
  return block?.type === "pageSpacer" && block.spacerMode !== "blank-space"
}

function isBlankSpaceSpacer(block: RNestMemoBlock | null | undefined) {
  return block?.type === "pageSpacer" && block.spacerMode === "blank-space"
}

function getBlankSpaceUnits(block: RNestMemoBlock | null | undefined) {
  if (!isBlankSpaceSpacer(block)) return 0
  const units = Number(block?.spacerHeight ?? 1) || 1
  return Math.max(1, Math.min(12, Math.round(units)))
}

function getLeadingSpacerInfo(blocks: RNestMemoBlock[], index: number) {
  let cursor = index - 1
  let startsNextPdfPage = false
  let blankSpaceBlock: RNestMemoBlock | null = null
  let insertIndex = index

  while (cursor >= 0 && blocks[cursor]?.type === "pageSpacer") {
    const spacer = blocks[cursor]
    insertIndex = cursor
    if (isNextPageSpacer(spacer)) startsNextPdfPage = true
    if (isBlankSpaceSpacer(spacer) && !blankSpaceBlock) blankSpaceBlock = spacer
    cursor -= 1
  }

  return {
    startsNextPdfPage,
    blankSpaceBlock,
    insertIndex,
  }
}

function PdfPageStartIndicator() {
  return (
    <div data-pdf-hide="true" aria-hidden="true" className="pointer-events-none px-1">
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-[#D8DEE8]" />
        <div className="inline-flex items-center rounded-full border border-[#E6E8F1] bg-white/98 px-3 py-1 text-[11px] font-semibold tracking-[-0.01em] text-[color:var(--rnest-accent)] shadow-[0_10px_24px_rgba(15,23,42,0.08)]">
          다음 PDF 페이지 시작
        </div>
        <div className="h-px flex-1 bg-[#D8DEE8]" />
      </div>
    </div>
  )
}

function createPdfFieldPreview(field: HTMLInputElement | HTMLTextAreaElement) {
  const preview = document.createElement("div")
  preview.className = field.className
  preview.textContent = field.value ?? ""
  preview.style.whiteSpace = "pre-wrap"
  preview.style.wordBreak = "break-word"
  preview.style.overflowWrap = "anywhere"
  preview.style.height = "auto"
  preview.style.minHeight = field instanceof HTMLTextAreaElement ? `${Math.max(field.scrollHeight, 24)}px` : "1.4em"
  preview.style.border = "none"
  preview.style.background = "transparent"
  preview.style.boxShadow = "none"
  preview.style.maxWidth = "100%"
  return preview
}

function getPdfObservedSource(root: HTMLElement) {
  return root.querySelector<HTMLElement>('[data-pdf-preview-source="true"]') ?? root
}

function buildPdfExportRoot(source: HTMLElement, contentDensityMultiplier: number) {
  const sourceRect = source.getBoundingClientRect()
  const baseCaptureWidth = Math.max(
    1,
    Math.ceil(source.scrollWidth || sourceRect.width || source.parentElement?.getBoundingClientRect().width || 0)
  )
  const captureWidth = Math.max(1, Math.ceil(baseCaptureWidth * sanitizePdfContentDensityMultiplier(contentDensityMultiplier)))

  const host = document.createElement("div")
  host.setAttribute("data-pdf-export-root", "true")
  host.style.position = "fixed"
  host.style.left = "-20000px"
  host.style.top = "0"
  host.style.width = `${captureWidth}px`
  host.style.padding = "0"
  host.style.margin = "0"
  host.style.background = "#ffffff"
  host.style.zIndex = "-1"
  host.style.pointerEvents = "none"
  host.style.overflow = "visible"

  const viewport = document.createElement("div")
  viewport.style.position = "relative"
  viewport.style.width = `${captureWidth}px`
  viewport.style.background = "#ffffff"
  viewport.style.overflow = "hidden"

  const clone = source.cloneNode(true) as HTMLElement
  clone.style.width = `${captureWidth}px`
  clone.style.maxWidth = `${captureWidth}px`
  clone.style.margin = "0"
  clone.style.paddingBottom = `${PDF_BREAK_PADDING_PX * 2}px`
  clone.style.background = "#ffffff"
  clone.style.overflow = "visible"
  clone.style.minHeight = "0"
  clone.style.transform = "translateY(0)"
  clone.style.transformOrigin = "top left"
  clone.style.animation = "none"
  clone.style.transition = "none"
  clone.style.position = "relative"
  clone.style.left = "auto"
  clone.style.right = "auto"
  clone.style.top = "auto"
  clone.style.bottom = "auto"
  clone.style.opacity = "1"
  clone.style.visibility = "visible"
  clone.style.zIndex = "auto"
  clone.style.pointerEvents = "auto"

  clone.querySelectorAll('[data-pdf-hide="true"]').forEach((element) => element.remove())

  clone.querySelectorAll<HTMLElement>("[data-pdf-export-only='true']").forEach((element) => {
    element.style.display = element.dataset.pdfExportDisplay || "block"
  })

  clone.querySelectorAll("input, textarea").forEach((field) => {
    field.replaceWith(createPdfFieldPreview(field as HTMLInputElement | HTMLTextAreaElement))
  })

  clone.querySelectorAll<HTMLElement>('[data-notebook-rich-input="true"], .notebook-rich-text-editor, .ProseMirror').forEach((element) => {
    element.setAttribute("contenteditable", "false")
    element.removeAttribute("data-placeholder")
    element.style.caretColor = "transparent"
    element.style.outline = "none"
    element.style.animation = "none"
    element.style.transition = "none"
  })

  clone.querySelectorAll<HTMLElement>("*").forEach((element) => {
    element.style.animation = "none"
    element.style.transition = "none"
  })

  ;([clone, ...Array.from(clone.querySelectorAll<HTMLElement>('[data-pdf-preview-source="true"]'))]).forEach((element) => {
    if (!(element instanceof HTMLElement)) return
    if (element.hasAttribute("data-pdf-preview-source")) {
      element.removeAttribute("aria-hidden")
      element.style.position = "relative"
      element.style.left = "auto"
      element.style.right = "auto"
      element.style.top = "auto"
      element.style.bottom = "auto"
      element.style.opacity = "1"
      element.style.visibility = "visible"
      element.style.zIndex = "auto"
      element.style.pointerEvents = "auto"
      element.style.userSelect = "auto"
      element.style.transform = "none"
    }
  })

  clone.querySelectorAll<HTMLElement>('[data-page-spacer-block="true"]').forEach((element) => {
    element.style.position = "relative"
    element.style.height = "0"
    element.style.minHeight = "0"
    element.style.padding = "0"
    element.style.margin = "0"
    element.style.border = "0"
    element.style.overflow = "visible"
  })
  // ✅ visibility:hidden → display:none 수정
  // visibility:hidden은 레이아웃에 공간을 그대로 차지해
  // buildPdfSlicePlan의 totalHeight에 UI 카드 높이(~150px)가 포함되어
  // 페이지 구분선 위치와 실제 PDF 페이지가 전혀 맞지 않는 근본 원인이었음
  clone.querySelectorAll<HTMLElement>('[data-page-spacer-ui="true"]').forEach((element) => {
    element.style.display = "none"
  })
  clone.querySelectorAll<HTMLElement>('[data-page-spacer-filler="true"]').forEach((element) => {
    element.style.border = "0"
    element.style.background = "transparent"
    element.style.boxShadow = "none"
    element.style.outline = "none"
    element.style.borderRadius = "0"
    element.style.opacity = "1"
  })

  viewport.appendChild(clone)
  host.appendChild(viewport)
  document.body.appendChild(host)

  // ✅ CSS 커스텀 프로퍼티(var(--rnest-accent) 등) 인라인화
  // html2canvas는 CSS 변수를 직접 파싱하지 못해 배경색·테두리색·아이콘색이 사라질 수 있음.
  // clone이 실제 DOM에 붙은 이후 getComputedStyle()로 완전히 해석된 값을 inline style로 주입.
  const COLOR_PROPS = [
    "color",
    "background-color",
    "border-top-color",
    "border-right-color",
    "border-bottom-color",
    "border-left-color",
  ]
  const SVG_TAGS = new Set(["svg", "path", "line", "circle", "rect", "polyline", "polygon", "ellipse"])
  clone.querySelectorAll<HTMLElement>("*").forEach((el) => {
    try {
      const cs = window.getComputedStyle(el)
      for (const prop of COLOR_PROPS) {
        const val = cs.getPropertyValue(prop)
        if (val) el.style.setProperty(prop, val)
      }
      const tag = el.tagName.toLowerCase()
      if (SVG_TAGS.has(tag)) {
        const stroke = cs.getPropertyValue("stroke")
        const fill = cs.getPropertyValue("fill")
        if (stroke && stroke !== "none") el.setAttribute("stroke", stroke)
        if (fill && fill !== "none") el.setAttribute("fill", fill)
      }
    } catch {
      // getComputedStyle 실패 시 무시
    }
  })

  return {
    host,
    viewport,
    clone,
    captureWidth,
    cleanup: () => {
      host.remove()
    },
  }
}

function getPdfSliceHeightPx(captureWidth: number, pdfInnerWidthPt: number, pdfInnerHeightPt: number) {
  if (captureWidth <= 0 || pdfInnerWidthPt <= 0 || pdfInnerHeightPt <= 0) return 1
  return Math.max(1, Math.floor((captureWidth * pdfInnerHeightPt) / pdfInnerWidthPt))
}

function getElementNaturalBounds(element: HTMLElement, cloneTop: number) {
  const rect = element.getBoundingClientRect()
  return {
    top: rect.top - cloneTop,
    bottom: rect.bottom - cloneTop,
    height: rect.height,
  }
}


function isUsablePdfSliceHeight(nextHeight: number, desiredSliceHeight: number) {
  if (nextHeight <= 0) return false
  const minimum = Math.min(PDF_MIN_SAFE_SLICE_HEIGHT_PX, Math.max(32, desiredSliceHeight - 24))
  return nextHeight >= minimum
}

function findSafeInnerSlice(
  block: HTMLElement,
  currentOffsetY: number,
  cutNaturalY: number,
  desiredSliceHeight: number,
  cloneTop: number
) {
  const candidates = Array.from(block.querySelectorAll<HTMLElement>(PDF_INNER_BREAK_SELECTOR))
  let bestBottom = -1

  for (const element of candidates) {
    const bounds = getElementNaturalBounds(element, cloneTop)
    if (bounds.height <= 2) continue
    if (bounds.bottom <= currentOffsetY + 24) continue
    if (bounds.bottom <= cutNaturalY - 4) {
      bestBottom = Math.max(bestBottom, bounds.bottom)
    }
  }

  if (bestBottom > currentOffsetY) {
    const safeHeight = Math.min(desiredSliceHeight, Math.floor(bestBottom - currentOffsetY))
    if (isUsablePdfSliceHeight(safeHeight, desiredSliceHeight)) {
      return {
        height: safeHeight,
        anchor: {
          naturalY: currentOffsetY + safeHeight,
          blockId: block.id,
          edge: "top" as const,
          delta: Math.floor(bestBottom - getElementNaturalBounds(block, cloneTop).top),
        },
      }
    }
  }

  return null
}

// Find a clean page-break position that avoids slicing through a memo block.
// ✅ getBoundingClientRect() 방식 사용:
//    clone에 translateY(-X)가 적용되어 있어도
//    block.top - clone.top 은 항상 content 내 자연 위치를 반환한다.
//    (offsetTop/offsetParent 방식은 clone이 position:relative가 아닐 때 잘못 누적되는 버그가 있었음)
function findSafeSlice(
  desiredSliceHeight: number,
  currentOffsetY: number,
  clone: HTMLElement
): PdfSlice {
  if (desiredSliceHeight <= 0) {
    return { offsetY: currentOffsetY, height: desiredSliceHeight, breakAnchor: { naturalY: currentOffsetY + desiredSliceHeight } }
  }
  const cutNaturalY = currentOffsetY + desiredSliceHeight
  const cloneTop = clone.getBoundingClientRect().top
  const blockBounds = Array.from(clone.querySelectorAll<HTMLElement>('[id^="memo-block-"]')).map((block) => {
    const bounds = getElementNaturalBounds(block, cloneTop)
    return { block, ...bounds }
  })

  // 강제 페이지 시작 마커가 현재 페이지 범위 안에 있으면,
  // 해당 블록의 top에서 무조건 페이지를 끊는다.
  const forcedPageStart = blockBounds.find(
    ({ block, top }) => block.dataset.pdfForcePageStart === "true" && top > currentOffsetY && top <= cutNaturalY + 1
  )

  if (forcedPageStart) {
    const forcedHeight = Math.max(1, Math.ceil(forcedPageStart.top - currentOffsetY))
    const breakY = currentOffsetY + forcedHeight
    if (forcedHeight > 0) {
      return {
        offsetY: currentOffsetY,
        height: forcedHeight,
        breakAnchor: {
          naturalY: breakY,
          blockId: forcedPageStart.block.id,
          edge: "top",
          delta: 0,
          target: "forced-page-start",
        },
      }
    }
  }

  for (const { block, top: blockNaturalTop, bottom: blockNaturalBottom } of blockBounds) {
    if (blockNaturalTop < cutNaturalY && blockNaturalBottom > cutNaturalY) {
      const safeHeight = Math.floor(blockNaturalTop - currentOffsetY - PDF_BREAK_PADDING_PX)
      if (safeHeight > 0 && safeHeight < desiredSliceHeight) {
        return {
          offsetY: currentOffsetY,
          height: safeHeight,
          breakAnchor: {
            naturalY: currentOffsetY + safeHeight,
            blockId: block.id,
            edge: "top",
            delta: -PDF_BREAK_PADDING_PX,
            target: "block",
          },
        }
      }
      const innerSafeSlice = findSafeInnerSlice(block, currentOffsetY, cutNaturalY, desiredSliceHeight, cloneTop)
      if (innerSafeSlice && innerSafeSlice.height > 0 && innerSafeSlice.height < desiredSliceHeight) {
        return {
          offsetY: currentOffsetY,
          height: innerSafeSlice.height,
          breakAnchor: innerSafeSlice.anchor,
        }
      }
    }
  }

  const nextBlock = blockBounds.find(({ top }) => top >= cutNaturalY)
  const previousBlock = [...blockBounds].reverse().find(({ bottom }) => bottom <= cutNaturalY)
  if (nextBlock) {
    return {
      offsetY: currentOffsetY,
      height: desiredSliceHeight,
      breakAnchor: {
        naturalY: cutNaturalY,
        blockId: nextBlock.block.id,
        edge: "top",
        delta: Math.floor(cutNaturalY - nextBlock.top),
        target: "block",
      },
    }
  }
  if (previousBlock) {
    return {
      offsetY: currentOffsetY,
      height: desiredSliceHeight,
      breakAnchor: {
        naturalY: cutNaturalY,
        blockId: previousBlock.block.id,
        edge: "bottom",
        delta: Math.floor(cutNaturalY - previousBlock.bottom),
        target: "block",
      },
    }
  }
  return {
    offsetY: currentOffsetY,
    height: desiredSliceHeight,
    breakAnchor: { naturalY: cutNaturalY },
  }
}

function buildPdfSlicePlan(clone: HTMLElement, captureWidth: number, pdfInnerWidthPt: number, pdfInnerHeightPt: number): PdfSlicePlan {
  const pageSliceHeightPx = getPdfSliceHeightPx(captureWidth, pdfInnerWidthPt, pdfInnerHeightPt)
  const totalHeight = Math.max(Math.ceil(clone.scrollHeight), Math.ceil(clone.getBoundingClientRect().height))
  const slices: PdfSlice[] = []

  let offsetY = 0
  while (offsetY < totalHeight) {
    let sliceHeight = Math.min(pageSliceHeightPx, totalHeight - offsetY)
    const slice = findSafeSlice(sliceHeight, offsetY, clone)
    if (slice.height <= 0) break
    slices.push(slice)
    offsetY += slice.height
  }

  return {
    totalHeight,
    pageSliceHeightPx,
    slices,
  }
}

function buildResolvedPdfLayoutFromSlicePlan(
  layoutKey: string,
  plan: PdfSlicePlan,
  sourceBlocks: RNestMemoBlock[],
  measuredBlocks: Record<string, MeasuredPdfBlockBounds>
): ResolvedPdfLayout {
  const orderedBlocks = sourceBlocks
    .filter((block) => block.type !== "pageSpacer")
    .map((block) => measuredBlocks[block.id])
    .filter((block): block is MeasuredPdfBlockBounds => Boolean(block))

  const slices = plan.slices.length
    ? plan.slices
    : [
        {
          offsetY: 0,
          height: Math.max(1, plan.totalHeight),
        },
      ]

  const pages = slices.map((slice, index) => {
    const startY = slice.offsetY
    const endY = slice.offsetY + slice.height
    const pageBlocks = orderedBlocks.filter((block) => block.bottom > startY + 0.5 && block.top < endY - 0.5)

    return {
      pageNumber: index + 1,
      startY,
      endY,
      height: Math.max(1, slice.height),
      blockIds: pageBlocks.map((block) => block.blockId),
      firstBlockId: pageBlocks[0]?.blockId,
      lastBlockId: pageBlocks[pageBlocks.length - 1]?.blockId,
      hardBreakBeforeBlockId: slice.breakAnchor?.target === "forced-page-start" ? slice.breakAnchor.blockId : undefined,
    }
  })

  const placements = pages.flatMap((page) =>
    orderedBlocks
      .filter((block) => block.bottom > page.startY + 0.5 && block.top < page.endY - 0.5)
      .map((block) => ({
        blockId: block.blockId,
        pageNumber: page.pageNumber,
        sliceStartY: Math.max(page.startY, block.top),
        sliceEndY: Math.min(page.endY, block.bottom),
        blockTop: block.top,
        blockBottom: block.bottom,
        startsPage: block.top <= page.startY + 0.5,
        endsPage: block.bottom >= page.endY - 0.5,
        isSplit: block.top < page.startY + 0.5 || block.bottom > page.endY - 0.5,
      }))
  )

  return {
    key: layoutKey,
    totalHeight: Math.max(1, plan.totalHeight),
    pageHeightPx: Math.max(1, plan.pageSliceHeightPx),
    pages,
    placements,
  }
}

function waitForNextPaint() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve())
  })
}

function waitForDoublePaint() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve())
    })
  })
}

function yieldPdfRasterization() {
  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    return new Promise<void>((resolve) => {
      window.requestIdleCallback(() => resolve(), { timeout: 120 })
    })
  }
  return new Promise<void>((resolve) => {
    window.setTimeout(() => resolve(), 0)
  })
}

function createPdfRenderCancelledError() {
  const error = new Error("pdf_render_cancelled")
  error.name = "PdfRenderCancelledError"
  return error
}

function throwIfPdfRenderCancelled(shouldCancel?: () => boolean) {
  if (shouldCancel?.()) {
    throw createPdfRenderCancelledError()
  }
}

function isPdfRenderCancelled(error: unknown) {
  return error instanceof Error && error.name === "PdfRenderCancelledError"
}

function measurePdfBlockBounds(clone: HTMLElement) {
  const cloneTop = clone.getBoundingClientRect().top
  const measuredBlocks: Record<string, MeasuredPdfBlockBounds> = {}
  clone.querySelectorAll<HTMLElement>('[id^="memo-block-"]').forEach((element) => {
    const blockId = element.id.replace(/^memo-block-/, "")
    if (!blockId) return
    const bounds = getElementNaturalBounds(element, cloneTop)
    measuredBlocks[blockId] = {
      blockId,
      top: bounds.top,
      bottom: bounds.bottom,
      height: bounds.height,
    }
  })
  return measuredBlocks
}

type ClonePdfBlockHandle = {
  blockId: string
  element: HTMLElement
  top: number
  bottom: number
  left: number
  width: number
  forcedStart: boolean
  duplicateElement: HTMLElement | null
}

function getClonePdfBlockHandles(clone: HTMLElement, measuredBlocks: Record<string, MeasuredPdfBlockBounds>) {
  return Array.from(clone.querySelectorAll<HTMLElement>('[id^="memo-block-"]'))
    .map<ClonePdfBlockHandle | null>((element) => {
      const blockId = element.id.replace(/^memo-block-/, "")
      const measured = measuredBlocks[blockId]
      if (!blockId || !measured) return null
      return {
        blockId,
        element,
        top: measured.top,
        bottom: measured.bottom,
        left: element.offsetLeft,
        width: element.offsetWidth,
        forcedStart: element.dataset.pdfForcePageStart === "true",
        duplicateElement: null,
      }
    })
    .filter((entry): entry is ClonePdfBlockHandle => Boolean(entry))
}

function createForcedStartPdfDuplicates(clone: HTMLElement, blocks: ClonePdfBlockHandle[]) {
  const forcedStartBlocks = blocks.filter((block) => block.forcedStart)
  if (forcedStartBlocks.length === 0) return

  const overlay = document.createElement("div")
  overlay.setAttribute("data-pdf-forced-start-duplicates", "true")
  overlay.style.position = "absolute"
  overlay.style.inset = "0"
  overlay.style.pointerEvents = "none"
  overlay.style.overflow = "visible"
  overlay.style.zIndex = "3"

  for (const block of forcedStartBlocks) {
    const duplicate = block.element.cloneNode(true) as HTMLElement
    duplicate.removeAttribute("id")
    duplicate.removeAttribute("data-pdf-force-page-start")
    duplicate.querySelectorAll<HTMLElement>("[id]").forEach((node) => node.removeAttribute("id"))
    duplicate.style.position = "absolute"
    duplicate.style.left = `${Math.max(0, Math.round(block.left))}px`
    duplicate.style.top = `${Math.max(0, Math.round(block.top))}px`
    duplicate.style.width = `${Math.max(1, Math.round(block.width))}px`
    duplicate.style.maxWidth = `${Math.max(1, Math.round(block.width))}px`
    duplicate.style.margin = "0"
    duplicate.style.visibility = "hidden"
    duplicate.style.opacity = "0"
    duplicate.style.pointerEvents = "none"
    duplicate.style.zIndex = "1"
    overlay.appendChild(duplicate)
    block.duplicateElement = duplicate
  }

  clone.appendChild(overlay)
}

function resetPdfBlockVisibility(blocks: ClonePdfBlockHandle[]) {
  for (const block of blocks) {
    block.element.style.visibility = "visible"
    block.element.style.opacity = "1"
    if (block.duplicateElement) {
      block.duplicateElement.style.visibility = "hidden"
      block.duplicateElement.style.opacity = "0"
    }
  }
}

function hidePdfBlockForCapture(block: ClonePdfBlockHandle) {
  block.element.style.visibility = "hidden"
  block.element.style.opacity = "0"
}

function showPdfBlockDuplicateForCapture(block: ClonePdfBlockHandle) {
  if (!block.duplicateElement) return
  block.duplicateElement.style.visibility = "visible"
  block.duplicateElement.style.opacity = "1"
}

function applyHardPdfPageBlockVisibility(page: ResolvedPdfLayout["pages"][number], blocks: ClonePdfBlockHandle[]) {
  resetPdfBlockVisibility(blocks)

  const forcedStartIndex = page.firstBlockId
    ? blocks.findIndex((block) => block.blockId === page.firstBlockId && block.forcedStart)
    : -1
  const forcedStartBlock = forcedStartIndex >= 0 ? blocks[forcedStartIndex] ?? null : null

  if (forcedStartIndex > 0) {
    for (let index = 0; index < forcedStartIndex; index += 1) {
      hidePdfBlockForCapture(blocks[index]!)
    }
  }

  if (forcedStartBlock) {
    hidePdfBlockForCapture(forcedStartBlock)
    showPdfBlockDuplicateForCapture(forcedStartBlock)
  }

  if (page.hardBreakBeforeBlockId) {
    const hardBreakIndex = blocks.findIndex((block) => block.blockId === page.hardBreakBeforeBlockId)
    if (hardBreakIndex >= 0) {
      for (let index = hardBreakIndex; index < blocks.length; index += 1) {
        hidePdfBlockForCapture(blocks[index]!)
      }
    }
  }

  const beforeGuardY = page.startY + 2
  const afterGuardY = page.endY - 2
  for (const block of blocks) {
    if (block.bottom <= beforeGuardY || block.top >= afterGuardY) {
      hidePdfBlockForCapture(block)
    }
  }
}

function getPdfRenderedHeightPt(canvas: HTMLCanvasElement, contentWidth: number, contentHeight: number) {
  if (!canvas.width || !canvas.height) return contentHeight
  return Math.min(contentHeight, contentWidth * (canvas.height / canvas.width))
}

async function renderPdfPages(source: HTMLElement, options: RenderPdfPagesOptions) {
  const html2canvasModule = await import("html2canvas")
  const html2canvas = html2canvasModule.default
  const contentDensityMultiplier = sanitizePdfContentDensityMultiplier(options.contentDensityMultiplier)
  const { clone, viewport, cleanup, captureWidth } = buildPdfExportRoot(getPdfObservedSource(source), contentDensityMultiplier)
  try {
    throwIfPdfRenderCancelled(options.shouldCancel)
    await waitForNextPaint()
    await waitForPdfExportAssets(clone)
    throwIfPdfRenderCancelled(options.shouldCancel)

    const pageWidth = PDF_PAGE_WIDTH_PT
    const pageHeight = PDF_PAGE_HEIGHT_PT
    const contentWidth = pageWidth - PDF_EXPORT_MARGIN_PT * 2
    const contentHeight = pageHeight - PDF_EXPORT_MARGIN_PT * 2
    const { pdfInnerWidthPt, pdfInnerHeightPt } = getPdfInnerBounds()
    const renderScale = Math.max(
      PDF_EXPORT_CAPTURE_SCALE,
      Math.min((window.devicePixelRatio || 1) * 1.5, PDF_EXPORT_MAX_CAPTURE_SCALE)
    )
    const measuredBlocks = measurePdfBlockBounds(clone)
    const cloneBlocks = getClonePdfBlockHandles(clone, measuredBlocks)
    createForcedStartPdfDuplicates(clone, cloneBlocks)
    const plan = buildPdfSlicePlan(clone, captureWidth, pdfInnerWidthPt, pdfInnerHeightPt)
    const layout = buildResolvedPdfLayoutFromSlicePlan(
      buildResolvedPdfLayoutKey({
        docId: options.doc.id,
        updatedAt: options.doc.updatedAt,
        captureWidth,
        pageHeightPx: plan.pageSliceHeightPx,
        totalHeight: plan.totalHeight,
      }),
      plan,
      options.doc.blocks,
      measuredBlocks
    )
    options.onLayout?.(layout)
    if (layout.totalHeight <= 0 || layout.pages.length <= 0) {
      throw new Error("pdf_export_empty")
    }

    const pages: PdfPreviewPage[] = []
    for (const page of layout.pages) {
      throwIfPdfRenderCancelled(options.shouldCancel)
      const sliceHeight = Math.max(1, Math.ceil(page.height))
      applyHardPdfPageBlockVisibility(page, cloneBlocks)
      viewport.style.height = `${sliceHeight}px`
      clone.style.transform = `translateY(-${page.startY}px)`

      await waitForDoublePaint()
      throwIfPdfRenderCancelled(options.shouldCancel)

      const canvas = await html2canvas(viewport, {
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
        scale: renderScale,
        width: captureWidth,
        height: sliceHeight,
        windowWidth: captureWidth,
        windowHeight: sliceHeight,
        scrollX: 0,
        scrollY: 0,
        imageTimeout: 15000,
      })

      const nextPage: PdfPreviewPage = {
        pageNumber: pages.length + 1,
        imageDataUrl: canvas.toDataURL("image/png", 1),
        renderedHeightPt: getPdfRenderedHeightPt(canvas, contentWidth, contentHeight),
      }
      pages.push(nextPage)
      options.onPageRendered?.(nextPage, pages.length, layout.pages.length)
      await yieldPdfRasterization()
    }
    resetPdfBlockVisibility(cloneBlocks)

    return {
      pageWidth,
      pageHeight,
      contentWidth,
      contentHeight,
      pages,
      layout,
      captureWidth,
      contentDensityMultiplier,
      renderedAt: Date.now(),
    }
  } finally {
    cleanup()
  }
}

async function waitForPdfExportAssets(root: HTMLElement) {
  const fontReady =
    typeof document !== "undefined" && "fonts" in document && document.fonts?.ready
      ? document.fonts.ready.catch(() => undefined)
      : Promise.resolve(undefined)

  const imageReady = Promise.allSettled(
    Array.from(root.querySelectorAll("img")).map((img) => {
      if (img.complete) return Promise.resolve()
      return new Promise<void>((resolve) => {
        const finalize = () => resolve()
        img.addEventListener("load", finalize, { once: true })
        img.addEventListener("error", finalize, { once: true })
        window.setTimeout(finalize, 5000)
      })
    })
  )

  await Promise.all([fontReady, imageReady])
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)}MB`
}

function clampImageWidth(value: number | undefined | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 100
  return Math.min(100, Math.max(20, Math.round(value)))
}

function clampImageAspectRatio(value: number | undefined | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 4 / 3
  return Math.min(3, Math.max(0.4, Number(value)))
}

function clampImageOffsetX(value: number | undefined | null) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, Number(value.toFixed(2))))
}

function getPdfInnerBounds() {
  return {
    pdfInnerWidthPt: PDF_PAGE_WIDTH_PT - PDF_EXPORT_MARGIN_PT * 2,
    pdfInnerHeightPt: PDF_PAGE_HEIGHT_PT - PDF_EXPORT_MARGIN_PT * 2,
  }
}

function getPageSpacerElements(root: HTMLElement) {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-page-spacer-block="true"]'))
}

function setPageSpacerAppliedHeight(spacer: HTMLElement, height: number) {
  const nextHeight = Math.max(0, Math.round(height))
  spacer.dataset.pageSpacerAppliedHeight = String(nextHeight)
  spacer.style.setProperty("--rnest-page-spacer-height", `${nextHeight}px`)
  const filler = spacer.querySelector<HTMLElement>('[data-page-spacer-filler="true"]')
  if (filler) {
    filler.style.height = `${nextHeight}px`
  }
}

function initializePageSpacerLayout(root: HTMLElement) {
  const spacers = getPageSpacerElements(root)
  for (const spacer of spacers) {
    setPageSpacerAppliedHeight(spacer, 0)
  }
  return spacers
}

/**
 * Slice-plan 기반 spacer 높이 계산.
 *
 * 이전 모듈러 연산 방식(spacerBottom % pageHeightPx)은 이상적 페이지 경계를 기준으로 했지만,
 * findSafeSlice가 블록 경계를 피해 페이지 높이를 조정하면 실제 페이지 경계와 불일치하여
 * spacer 뒤 콘텐츠가 다음 페이지 상단이 아닌 중간에 위치하는 버그가 있었다.
 *
 * 새 방식: 각 spacer마다 실제 slice plan을 빌드하여 spacer가 속한 페이지의 끝 위치를
 * 정확히 알아내고, 그 위치까지 filler를 채운다.
 */
function computeSpacerFillHeights(
  root: HTMLElement,
  captureWidth: number,
  pdfInnerWidthPt: number,
  pdfInnerHeightPt: number
) {
  const spacers = initializePageSpacerLayout(root)
  void root.offsetHeight // 최종 reflow

  return {
    spacers,
    spacerHeights: Object.fromEntries(
      spacers.map((spacer) => [
        spacer.dataset.pageSpacerBlockId || spacer.id,
        Math.max(0, Math.round(Number(spacer.dataset.pageSpacerAppliedHeight || 0))),
      ])
    ) as Record<string, number>,
  }
}

function buildPdfLayoutWithPageSpacers(
  root: HTMLElement,
  captureWidth: number,
  pdfInnerWidthPt: number,
  pdfInnerHeightPt: number
) {
  const { spacerHeights } = computeSpacerFillHeights(root, captureWidth, pdfInnerWidthPt, pdfInnerHeightPt)
  const plan = buildPdfSlicePlan(root, captureWidth, pdfInnerWidthPt, pdfInnerHeightPt)
  return { plan, spacerHeights }
}

function deriveAttachmentKind(file: File, preferred: RNestMemoAttachment["kind"] | null = null): RNestMemoAttachment["kind"] {
  if (preferred) return preferred
  if (file.type.startsWith("image/")) return "image"
  if (file.type === "application/pdf") return "pdf"
  return "file"
}

function buildDocStoragePaths(doc: RNestMemoDocument) {
  return Array.from(
    new Set([...(doc.attachmentStoragePaths ?? []), ...(doc.attachments ?? []).map((attachment) => attachment.storagePath)])
  )
}

function referencedAttachmentIds(doc: RNestMemoDocument) {
  return Array.from(
    new Set(
      doc.blocks
        .flatMap((block) => [block.attachmentId, ...(block.attachmentIds ?? [])])
        .filter((value): value is string => Boolean(value))
    )
  )
}

function normalizeDocAttachments(doc: RNestMemoDocument) {
  const ids = new Set(referencedAttachmentIds(doc))
  const attachments = doc.attachments.filter((attachment) => ids.has(attachment.id))
  return {
    ...doc,
    attachments,
    attachmentStoragePaths: Array.from(new Set(attachments.map((attachment) => attachment.storagePath))),
  }
}

function findAttachment(doc: RNestMemoDocument, attachmentId?: string | null) {
  if (!attachmentId) return null
  return doc.attachments.find((attachment) => attachment.id === attachmentId) ?? null
}

function buildMemoSearchText(doc: RNestMemoDocument) {
  return [
    doc.title,
    doc.tags.join(" "),
    doc.attachments.map((attachment) => attachment.name).join(" "),
    memoDocumentToPlainText(doc),
  ]
    .join(" ")
    .toLowerCase()
}

function buildSummary(doc: RNestMemoDocument) {
  if (doc.lock && doc.blocks.length === 0 && doc.attachments.length === 0) {
    return "잠긴 메모"
  }

  const textSummary = doc.blocks
    .map((block) => memoBlockToPlainText(block))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100)
  if (textSummary) return textSummary
  if (doc.attachments.length > 0) return `첨부 ${doc.attachments.length}개`
  return ""
}

function cloneJsonLike<T>(value: T): T {
  if (value == null) return value
  return JSON.parse(JSON.stringify(value)) as T
}

function cloneMemoBlockForDuplicate(
  block: RNestMemoBlock,
  attachmentIdMap?: Map<string, string>
): RNestMemoBlock {
  const mapAttachmentId = (attachmentId?: string) => {
    if (!attachmentId) return undefined
    return attachmentIdMap?.get(attachmentId) ?? attachmentId
  }

  if (block.type === "table") {
    const table = upgradeMemoTableToV2(block.table)
    return createMemoBlock("table", {
      highlight: block.highlight,
      table: {
        version: 2,
        columns: [...table.columns],
        columnHtml: [...(table.columnHtml ?? table.columns.map((column) => plainTextToRichHtml(column)))],
        headerRow: table.headerRow,
        columnWidths: [...(table.columnWidths ?? [])],
        alignments: [...(table.alignments ?? [])],
        rows: table.rows.map((row) =>
          createMemoTableRow(row.left, row.right, {
            ...row,
            id: undefined,
            cells: getMemoTableRowCells(row, table).map((cell) =>
              createMemoTableCell(cell.text, {
                ...cell,
                id: undefined,
              })
            ),
          })
        ),
      },
    })
  }

  return createMemoBlock(block.type, {
    text: block.text,
    textHtml: block.textHtml,
    detailText: block.detailText,
    detailTextHtml: block.detailTextHtml,
    attachmentId: mapAttachmentId(block.attachmentId),
    attachmentIds: block.attachmentIds?.map((attachmentId) => mapAttachmentId(attachmentId)).filter(Boolean) as
      | string[]
      | undefined,
    mediaWidth: block.mediaWidth,
    mediaAspectRatio: block.mediaAspectRatio,
    mediaOffsetX: block.mediaOffsetX,
    checked: block.checked,
    collapsed: block.collapsed,
    highlight: block.highlight,
    spacerMode: block.spacerMode,
    spacerHeight: block.spacerHeight,
    code: block.code,
    language: block.language,
    wrap: block.wrap,
    url: block.url,
    provider: block.provider,
    titleSnapshot: block.titleSnapshot,
    targetDocId: block.targetDocId,
    recordTemplateId: block.recordTemplateId,
    recordVisibleFieldIds: block.recordVisibleFieldIds ? [...block.recordVisibleFieldIds] : undefined,
    recordSort: block.recordSort ? { ...block.recordSort } : undefined,
    recordFilters: block.recordFilters?.map((filter) => ({
      ...filter,
      values: filter.values ? [...filter.values] : undefined,
    })),
    unsupportedType: block.unsupportedType,
    unsupportedPayload: cloneJsonLike(block.unsupportedPayload),
  })
}

type MemoDocTreeNode = {
  doc: RNestMemoDocument
  children: MemoDocTreeNode[]
}

function buildMemoDocTree(docs: RNestMemoDocument[], sortKey: MemoSortKey): MemoDocTreeNode[] {
  const scoped = sortDocsByKey(docs, sortKey)
  const docMap = new Map(scoped.map((doc) => [doc.id, doc]))
  const grouped = new Map<string | null, RNestMemoDocument[]>()

  for (const doc of scoped) {
    const parentId = doc.parentDocId && docMap.has(doc.parentDocId) ? doc.parentDocId : null
    const bucket = grouped.get(parentId) ?? []
    bucket.push(doc)
    grouped.set(parentId, bucket)
  }

  const build = (parentId: string | null): MemoDocTreeNode[] =>
    (grouped.get(parentId) ?? []).map((doc) => ({
      doc,
      children: build(doc.id),
    }))

  return build(null)
}

function collectDocSubtreeIds(
  documents: Record<string, RNestMemoDocument | undefined>,
  rootDocId: string
) {
  const collected = new Set<string>()
  const stack = [rootDocId]
  while (stack.length > 0) {
    const currentId = stack.pop()
    if (!currentId || collected.has(currentId)) continue
    collected.add(currentId)
    for (const doc of Object.values(documents)) {
      if (doc?.parentDocId === currentId && !collected.has(doc.id)) {
        stack.push(doc.id)
      }
    }
  }
  return Array.from(collected)
}

function isEditableSurfaceTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return Boolean(target.closest('[data-notebook-rich-input="true"], input, textarea, select, [contenteditable="true"]'))
}

function sortByUpdated(a: RNestMemoDocument, b: RNestMemoDocument) {
  return b.updatedAt - a.updatedAt
}

function relativeTime(ts: number) {
  const diff = Date.now() - ts
  const m = Math.floor(diff / 60000)
  if (m < 1) return "방금"
  if (m < 60) return `${m}분 전`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}시간 전`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}일 전`
  return formatNotebookDateTime(ts)
}

const blockTypeLabels: Record<RNestMemoBlockType, string> = {
  unsupported: "지원 안 되는 블록",
  paragraph: "텍스트",
  heading: "제목",
  bulleted: "글머리 기호",
  numbered: "번호 목록",
  checklist: "할 일 목록",
  callout: "콜아웃",
  quote: "인용",
  toggle: "토글",
  divider: "구분선",
  pageSpacer: "다음 PDF 페이지 시작",
  table: "표",
  bookmark: "링크",
  code: "코드",
  pageLink: "문서 링크",
  embed: "임베드",
  gallery: "갤러리",
  recordView: "기록 보기",
  image: "사진",
  attachment: "파일",
}

const memoIconLabelMap: Record<RNestMemoIconId, string> = {
  note: "노트",
  page: "문서",
  check: "체크",
  table: "표",
  folder: "폴더",
  clip: "기록",
  leaf: "회복",
  idea: "아이디어",
  book: "학습",
  spark: "강조",
  moon: "야간",
  pin: "핀",
}

const coverClassMap: Record<RNestMemoCoverId, string> = {
  "lavender-glow": "bg-[radial-gradient(circle_at_top_left,#F3E8FF_0%,#DDD6FE_35%,#F8FAFC_100%)]",
  "soft-sky": "bg-[linear-gradient(135deg,#E0F2FE_0%,#F1F5F9_45%,#EDE9FE_100%)]",
  "mint-fog": "bg-[linear-gradient(135deg,#DCFCE7_0%,#F0FDFA_42%,#F5F3FF_100%)]",
  "sunset-blush": "bg-[linear-gradient(135deg,#FFE4E6_0%,#FEF3C7_45%,#F5F3FF_100%)]",
  "midnight-ink": "bg-[linear-gradient(135deg,#1E1B4B_0%,#312E81_45%,#64748B_100%)]",
  "paper-grid": "bg-[linear-gradient(180deg,#FFFFFF_0%,#F8FAFC_100%)] bg-[size:22px_22px] [background-image:linear-gradient(to_right,rgba(148,163,184,0.1)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.1)_1px,transparent_1px)]",
}

const coverLabelMap: Record<RNestMemoCoverId, string> = {
  "lavender-glow": "라벤더",
  "soft-sky": "소프트 스카이",
  "mint-fog": "민트 포그",
  "sunset-blush": "선셋 블러시",
  "midnight-ink": "미드나잇",
  "paper-grid": "페이퍼 그리드",
}

const quickInsertTemplates = [
  {
    id: "daily-review",
    label: "오늘 정리",
    createBlocks: () => [
      createMemoBlock("heading", { text: "오늘 정리" }),
      createMemoBlock("bulleted", { text: "핵심 한 줄" }),
      createMemoBlock("quote", { text: "기억해야 할 포인트" }),
    ],
  },
  {
    id: "check-bundle",
    label: "체크 묶음",
    createBlocks: () => [
      createMemoBlock("heading", { text: "체크할 항목" }),
      createMemoBlock("checklist", { text: "첫 번째 체크", checked: false }),
      createMemoBlock("checklist", { text: "두 번째 체크", checked: false }),
      createMemoBlock("checklist", { text: "세 번째 체크", checked: false }),
    ],
  },
  {
    id: "reference-link",
    label: "참고 링크",
    createBlocks: () => [
      createMemoBlock("bookmark", { text: "https://", detailText: "링크 제목" }),
      createMemoBlock("callout", { text: "왜 저장했는지 짧게 메모하세요." }),
    ],
  },
] as const

type SlashCommand =
  | { id: string; label: string; description: string; blockType: RNestMemoBlockType }
  | { id: "duplicate"; label: string; description: string; action: "duplicate" }

const slashCommands: SlashCommand[] = [
  { id: "paragraph", label: "텍스트", description: "기본 문단 블록", blockType: "paragraph" },
  { id: "heading", label: "제목", description: "큰 제목으로 정리", blockType: "heading" },
  { id: "bulleted", label: "글머리 기호", description: "불릿 목록", blockType: "bulleted" },
  { id: "numbered", label: "번호 목록", description: "순서가 있는 목록", blockType: "numbered" },
  { id: "checklist", label: "할 일 목록", description: "체크 가능한 항목", blockType: "checklist" },
  { id: "callout", label: "콜아웃", description: "중요한 메모 강조", blockType: "callout" },
  { id: "quote", label: "인용", description: "짧은 인용/요약", blockType: "quote" },
  { id: "toggle", label: "토글", description: "접고 펼치는 메모", blockType: "toggle" },
  { id: "bookmark", label: "링크", description: "참고 링크 저장", blockType: "bookmark" },
  { id: "code", label: "코드", description: "코드 블록", blockType: "code" },
  { id: "pageLink", label: "문서 링크", description: "다른 메모 연결", blockType: "pageLink" },
  { id: "embed", label: "임베드", description: "허용된 링크 미리보기", blockType: "embed" },
  { id: "gallery", label: "갤러리", description: "여러 이미지를 묶어서 표시", blockType: "gallery" },
  { id: "recordView", label: "기록 보기", description: "노트 안에 기록 그리드 연결", blockType: "recordView" },
  { id: "divider", label: "구분선", description: "섹션 나누기", blockType: "divider" },
  { id: "table", label: "표", description: "간단한 2열 표", blockType: "table" },
  { id: "duplicate", label: "블록 복제", description: "현재 블록을 복사", action: "duplicate" },
]

const quickAddBlockTypes: RNestMemoBlockType[] = [
  "paragraph",
  "heading",
  "bulleted",
  "numbered",
  "checklist",
  "callout",
  "quote",
  "toggle",
  "bookmark",
  "divider",
  "table",
]

const inlineAddBlockTypes: RNestMemoBlockType[] = [
  "paragraph",
  "heading",
  "bulleted",
  "numbered",
  "checklist",
  "callout",
  "quote",
  "toggle",
  "bookmark",
  "code",
  "pageLink",
  "embed",
  "gallery",
  "recordView",
  "image",
  "attachment",
  "divider",
  "table",
]

const inlineConvertBlockTypes: RNestMemoBlockType[] = [
  "paragraph",
  "heading",
  "bulleted",
  "numbered",
  "checklist",
  "callout",
  "quote",
  "toggle",
  "bookmark",
  "divider",
  "table",
  "code",
  "pageLink",
  "embed",
  "gallery",
  "recordView",
]

type BlockTypeMenuGroupId = "text" | "list" | "emphasis" | "link" | "media" | "advanced"
type BlockTypeMenuIntent = "add" | "convert"
type BlockTypeMenuGroupDefinition = {
  id: BlockTypeMenuGroupId
  label: string
  description: string
  types: RNestMemoBlockType[]
}

const blockTypeMenuGroupDefinitions: BlockTypeMenuGroupDefinition[] = [
  {
    id: "text",
    label: "텍스트/구조",
    description: "텍스트, 제목, 구분선",
    types: ["paragraph", "heading", "divider"],
  },
  {
    id: "list",
    label: "목록",
    description: "글머리, 번호, 체크, 토글",
    types: ["bulleted", "numbered", "checklist", "toggle"],
  },
  {
    id: "emphasis",
    label: "강조",
    description: "콜아웃, 인용",
    types: ["callout", "quote"],
  },
  {
    id: "link",
    label: "링크/연결",
    description: "링크, 문서 링크, 임베드",
    types: ["bookmark", "pageLink", "embed"],
  },
  {
    id: "media",
    label: "미디어/파일",
    description: "사진, 파일, 갤러리",
    types: ["image", "attachment", "gallery"],
  },
  {
    id: "advanced",
    label: "표/고급",
    description: "표, 기록 보기, 코드",
    types: ["table", "recordView", "code"],
  },
]

function renderMemoIcon(icon: string, className = "h-5 w-5") {
  const normalized = normalizeMemoIconId(icon)
  const props = { className, strokeWidth: 1.9 }
  switch (normalized) {
    case "note":
      return <StickyNote {...props} />
    case "page":
      return <FileText {...props} />
    case "check":
      return <CheckSquare {...props} />
    case "table":
      return <Table2 {...props} />
    case "folder":
      return <Folder {...props} />
    case "clip":
      return <ReceiptText {...props} />
    case "leaf":
      return <Leaf {...props} />
    case "idea":
      return <Lightbulb {...props} />
    case "book":
      return <BookOpenText {...props} />
    case "spark":
      return <Sparkles {...props} />
    case "moon":
      return <MoonStar {...props} />
    case "pin":
      return <Pin {...props} />
    default:
      return <StickyNote {...props} />
  }
}

function normalizeMemoIconId(icon: string): RNestMemoIconId {
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
  const normalized = (legacyMap[icon] ?? icon) as RNestMemoIconId
  return memoIconOptions.includes(normalized) ? normalized : "note"
}

function getSafeExternalHref(rawValue: string | null | undefined) {
  const href = normalizeNotebookLinkHref(rawValue)
  return href || null
}

function getBookmarkMeta(rawValue: string | null | undefined) {
  const href = getSafeExternalHref(rawValue)
  if (!href) return null
  try {
    const url = new URL(href)
    return {
      href,
      label: url.protocol === "mailto:" ? url.pathname : url.hostname.replace(/^www\./, ""),
    }
  } catch {
    return { href, label: href }
  }
}

function replaceOccurrences(value: string, query: string, replacement: string, replaceAll: boolean) {
  if (!query) return { value, count: 0 }
  if (!replaceAll) {
    const idx = value.indexOf(query)
    if (idx === -1) return { value, count: 0 }
    return {
      value: `${value.slice(0, idx)}${replacement}${value.slice(idx + query.length)}`,
      count: 1,
    }
  }
  const matches = value.split(query).length - 1
  return matches > 0 ? { value: value.replaceAll(query, replacement), count: matches } : { value, count: 0 }
}

function replaceOccurrencesInRichHtml(html: string | undefined, query: string, replacement: string, replaceAll: boolean) {
  const safeHtml = sanitizeNotebookRichHtml(html, 24000)
  if (!safeHtml || !query || typeof DOMParser === "undefined") {
    return { html: safeHtml, count: 0 }
  }

  const parsed = new DOMParser().parseFromString(`<body>${safeHtml}</body>`, "text/html")
  const walker = parsed.createTreeWalker(parsed.body, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  let count = 0
  while (node) {
    const textNode = node as Text
    const next = replaceOccurrences(textNode.textContent ?? "", query, replacement, replaceAll)
    if (next.count > 0) {
      textNode.textContent = next.value
      count += next.count
      if (!replaceAll) break
    }
    node = walker.nextNode()
  }
  return {
    html: count > 0 ? sanitizeNotebookRichHtml(parsed.body.innerHTML, 24000) : safeHtml,
    count,
  }
}

function replaceBlockContent(block: RNestMemoBlock, query: string, replacement: string, replaceAll: boolean) {
  if (!query) return { block, count: 0 }

  if (block.type === "table") {
    const baseTable = block.table ? upgradeMemoTableToV2(block.table) : upgradeMemoTableToV2(undefined)
    const nextTable = {
      ...baseTable,
      columnHtml: [...(baseTable.columnHtml ?? baseTable.columns.map((column) => plainTextToRichHtml(column)))],
      rows: (baseTable.rows ?? []).map((row) => ({ ...row, cells: row.cells ? [...row.cells] : row.cells })),
    }
    let count = 0

    for (let columnIndex = 0; columnIndex < nextTable.columns.length; columnIndex += 1) {
      const nextColumn = replaceOccurrencesInRichHtml(nextTable.columnHtml[columnIndex], query, replacement, replaceAll)
      if (nextColumn.count > 0) {
        nextTable.columnHtml[columnIndex] = nextColumn.html
        nextTable.columns[columnIndex] = getMemoTableColumnText({ columns: nextTable.columns, columnHtml: nextTable.columnHtml }, columnIndex)
        count += nextColumn.count
        if (!replaceAll) return { block: { ...block, table: nextTable }, count }
      }
    }

    for (let rowIndex = 0; rowIndex < nextTable.rows.length; rowIndex += 1) {
      const cells = getMemoTableRowCells(nextTable.rows[rowIndex], nextTable)
      const nextCells = [...cells]
      for (let columnIndex = 0; columnIndex < nextCells.length; columnIndex += 1) {
        const replaced = replaceOccurrencesInRichHtml(nextCells[columnIndex]?.textHtml, query, replacement, replaceAll)
        if (replaced.count === 0) continue
        nextCells[columnIndex] = {
          ...nextCells[columnIndex],
          text: getMemoTableCellText({ left: "", leftHtml: "", right: "", rightHtml: "", cells: [{ ...nextCells[columnIndex], textHtml: replaced.html }] }, 0),
          textHtml: replaced.html,
        }
        nextTable.rows[rowIndex] = {
          ...nextTable.rows[rowIndex],
          left: nextCells[0]?.text ?? "",
          leftHtml: nextCells[0]?.textHtml ?? "",
          right: nextCells[1]?.text ?? "",
          rightHtml: nextCells[1]?.textHtml ?? "",
          cells: nextCells,
        }
        count += replaced.count
        if (!replaceAll) return { block: { ...block, table: nextTable }, count }
      }
    }

    return count > 0 ? { block: { ...block, table: nextTable }, count } : { block, count: 0 }
  }

  if (block.type === "code") {
    const next = replaceOccurrences(block.code ?? "", query, replacement, replaceAll)
    if (next.count === 0) return { block, count: 0 }
    return {
      block: {
        ...block,
        code: next.value,
      },
      count: next.count,
    }
  }

  if (block.type === "pageLink" || block.type === "embed" || block.type === "recordView" || block.type === "unsupported") {
    const next = replaceOccurrences(
      block.type === "embed" ? block.titleSnapshot ?? block.text ?? "" : block.type === "pageLink" ? block.titleSnapshot ?? block.text ?? "" : block.text ?? "",
      query,
      replacement,
      replaceAll
    )
    if (next.count === 0) return { block, count: 0 }
    return {
      block:
        block.type === "embed"
          ? { ...block, titleSnapshot: next.value, text: next.value }
          : block.type === "pageLink"
            ? { ...block, titleSnapshot: next.value, text: next.value }
            : { ...block, text: next.value },
      count: next.count,
    }
  }

  if (block.type === "gallery") {
    const next = replaceOccurrences(block.text ?? "", query, replacement, replaceAll)
    if (next.count === 0) return { block, count: 0 }
    return { block: { ...block, text: next.value }, count: next.count }
  }

  const richTextTypes: RNestMemoBlockType[] = ["heading", "paragraph", "bulleted", "numbered", "checklist", "callout", "quote", "toggle", "attachment"]
  let nextBlock: RNestMemoBlock = block
  let count = 0

  function applyPlainField(field: "text" | "detailText") {
    const next = replaceOccurrences(nextBlock[field] ?? "", query, replacement, replaceAll)
    if (next.count > 0) {
      count += next.count
      nextBlock = { ...nextBlock, [field]: next.value }
      return true
    }
    return false
  }

  function applyRichField(plainField: "text" | "detailText", htmlField: "textHtml" | "detailTextHtml") {
    const nextRich = replaceOccurrencesInRichHtml(nextBlock[htmlField], query, replacement, replaceAll)
    if (nextRich.count > 0) {
      count += nextRich.count
      nextBlock = { ...nextBlock, [htmlField]: nextRich.html }
      if (plainField === "text") {
        nextBlock.text = getMemoBlockText({ text: "", textHtml: nextRich.html })
      } else {
        nextBlock.detailText = getMemoBlockDetailText({ detailText: "", detailTextHtml: nextRich.html })
      }
      return true
    }

    if (!nextBlock[htmlField]) {
      return applyPlainField(plainField)
    }

    return false
  }

  if (richTextTypes.includes(block.type)) {
    if (applyRichField("text", "textHtml") && !replaceAll) return { block: nextBlock, count }
  } else if (applyPlainField("text") && !replaceAll) {
    return { block: nextBlock, count }
  }

  if (nextBlock.type === "toggle") {
    applyRichField("detailText", "detailTextHtml")
  }

  if (nextBlock.type === "bookmark") {
    if (count === 0 || replaceAll) applyRichField("detailText", "detailTextHtml")
  }

  return { block: nextBlock, count }
}

function renderBlockTypeIcon(type: RNestMemoBlockType, className = "h-3.5 w-3.5") {
  const props = { className, strokeWidth: 1.8 }
  switch (type) {
    case "unsupported":
      return <Shield {...props} />
    case "paragraph":
      return <Type {...props} />
    case "heading":
      return <Heading1 {...props} />
    case "bulleted":
      return <List {...props} />
    case "numbered":
      return <ListOrdered {...props} />
    case "checklist":
      return <CheckSquare {...props} />
    case "callout":
      return <Lightbulb {...props} />
    case "quote":
      return <Quote {...props} />
    case "toggle":
      return <ChevronRight {...props} />
    case "divider":
      return <Minus {...props} />
    case "pageSpacer":
      return <ArrowUpDown {...props} />
    case "table":
      return <Table2 {...props} />
    case "bookmark":
      return <Link2 {...props} />
    case "code":
      return <FileText {...props} />
    case "pageLink":
      return <FileText {...props} />
    case "embed":
      return <Link2 {...props} />
    case "gallery":
      return <ImageIcon {...props} />
    case "recordView":
      return <ReceiptText {...props} />
    case "image":
      return <ImageIcon {...props} />
    case "attachment":
      return <Paperclip {...props} />
    default:
      return <Type {...props} />
  }
}

function renderBlockTypeGroupIcon(groupId: BlockTypeMenuGroupId, className = "h-3.5 w-3.5") {
  const props = { className, strokeWidth: 1.8 }
  switch (groupId) {
    case "text":
      return <Type {...props} />
    case "list":
      return <List {...props} />
    case "emphasis":
      return <Lightbulb {...props} />
    case "link":
      return <Link2 {...props} />
    case "media":
      return <ImageIcon {...props} />
    case "advanced":
      return <Table2 {...props} />
    default:
      return <Type {...props} />
  }
}

function resolveBlockTypeMenuGroups(availableTypes: RNestMemoBlockType[]) {
  const available = new Set(availableTypes)
  return blockTypeMenuGroupDefinitions
    .map((group) => ({
      ...group,
      types: group.types.filter((type) => available.has(type)),
    }))
    .filter((group) => group.types.length > 0)
}

function findBlockTypeMenuGroupId(
  currentType: RNestMemoBlockType | undefined,
  groups: ReturnType<typeof resolveBlockTypeMenuGroups>
) {
  if (!currentType) return groups[0]?.id ?? null
  return groups.find((group) => group.types.includes(currentType))?.id ?? groups[0]?.id ?? null
}

function renderAttachmentIcon(kind: RNestMemoAttachment["kind"], className = "h-4 w-4") {
  if (kind === "image" || kind === "scan") {
    return <ImageIcon className={className} strokeWidth={1.8} />
  }
  if (kind === "pdf") {
    return <FileText className={className} strokeWidth={1.8} />
  }
  return <File className={className} strokeWidth={1.8} />
}

const mobileSafeInputClass = "text-[16px] md:text-[14px]"
const mobileSafeBodyClass = "text-[16px] md:text-[15px]"
const mobileSafeFineClass = "text-[16px] md:text-[12.5px]"

/* ─── highlight colors ────────────────────────────────────── */

const highlightBgMap: Record<RNestMemoHighlightColor, string> = {
  yellow: "bg-yellow-100/80",
  green: "bg-green-100/80",
  blue: "bg-blue-100/80",
  pink: "bg-pink-100/80",
  orange: "bg-orange-100/80",
  purple: "bg-purple-100/80",
}

const highlightDotMap: Record<RNestMemoHighlightColor, string> = {
  yellow: "bg-yellow-400",
  green: "bg-green-400",
  blue: "bg-blue-400",
  pink: "bg-pink-400",
  orange: "bg-orange-400",
  purple: "bg-purple-400",
}

const highlightLabelMap: Record<RNestMemoHighlightColor, string> = {
  yellow: "노랑",
  green: "초록",
  blue: "파랑",
  pink: "핑크",
  orange: "주황",
  purple: "보라",
}

/* ─── sort options ────────────────────────────────────────── */

type MemoSortKey = "updatedAt" | "createdAt" | "title"

const sortOptions: { key: MemoSortKey; label: string }[] = [
  { key: "updatedAt", label: "수정일순" },
  { key: "createdAt", label: "생성일순" },
  { key: "title", label: "제목순" },
]

const NOTEBOOK_IMPORT_BLOCK_LIMIT = 64

function sortDocsByKey(docs: RNestMemoDocument[], key: MemoSortKey): RNestMemoDocument[] {
  return [...docs].sort((a, b) => {
    if (key === "title") return (a.title || "").localeCompare(b.title || "", "ko")
    if (key === "createdAt") return b.createdAt - a.createdAt
    return b.updatedAt - a.updatedAt
  })
}

function sortFoldersByName(folders: RNestMemoFolder[]) {
  return [...folders].sort((a, b) => a.name.localeCompare(b.name, "ko"))
}

/** Ref callback that auto-sizes a textarea on mount & when value changes */
function autoSizeRef(el: HTMLTextAreaElement | null) {
  if (!el) return
  el.style.height = "auto"
  el.style.height = `${el.scrollHeight}px`
}

const pageItemPositionCache = new Map<string, number>()

/* ─── sidebar page item ───────────────────────────────────── */

function PageItem({
  doc,
  summary,
  isActive,
  isLocked,
  depth = 0,
  isDropActive = false,
  listKey,
  onClick,
  draggable = false,
  isDragging = false,
  className,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  isEditing = false,
  draftTitle = "",
  onStartEdit,
  onDraftChange,
  onDraftCommit,
  onDraftCancel,
  onTrash,
  onRestore,
  onDeletePermanent,
}: {
  doc: RNestMemoDocument
  summary: string
  isActive: boolean
  isLocked: boolean
  depth?: number
  isDropActive?: boolean
  listKey: string
  onClick: () => void
  draggable?: boolean
  isDragging?: boolean
  className?: string
  onDragStart?: React.DragEventHandler<HTMLButtonElement>
  onDragEnd?: React.DragEventHandler<HTMLButtonElement>
  onDragOver?: React.DragEventHandler<HTMLDivElement>
  onDragLeave?: React.DragEventHandler<HTMLDivElement>
  onDrop?: React.DragEventHandler<HTMLDivElement>
  isEditing?: boolean
  draftTitle?: string
  onStartEdit?: () => void
  onDraftChange?: (value: string) => void
  onDraftCommit?: () => void
  onDraftCancel?: () => void
  onTrash?: () => void
  onRestore?: () => void
  onDeletePermanent?: () => void
}) {
  const itemRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useLayoutEffect(() => {
    const element = itemRef.current
    if (!element) return
    const cacheKey = `${listKey}:${doc.id}`
    const nextTop = element.getBoundingClientRect().top
    const previousTop = pageItemPositionCache.get(cacheKey)
    pageItemPositionCache.set(cacheKey, nextTop)

    if (typeof previousTop !== "number") return
    const deltaY = previousTop - nextTop
    if (Math.abs(deltaY) < 2) return

    element.animate(
      [
        {
          transform: `translateY(${deltaY}px)`,
          boxShadow: "0 18px 36px rgba(123,111,208,0.08)",
        },
        {
          transform: "translateY(0)",
          boxShadow: "0 0 0 rgba(123,111,208,0)",
        },
      ],
      {
        duration: 280,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      }
    )
  }, [doc.id, doc.updatedAt, doc.favorite, doc.pinned, doc.title, isActive, isLocked, listKey, summary])

  useEffect(() => {
    if (!isEditing) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [isEditing])

  return (
    <div
      ref={itemRef}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        "group flex w-full items-start gap-2 rounded-xl px-2 py-2 transition-colors",
        draggable && !isEditing && "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-45",
        isDropActive && "ring-1 ring-[color:var(--rnest-accent-border)] bg-[color:var(--rnest-accent-soft)]/60",
        isActive
          ? "bg-[color:var(--rnest-accent-soft)] text-ios-text"
          : "text-ios-sub hover:bg-gray-100",
        className
      )}
      style={depth > 0 ? { marginLeft: `${Math.min(depth, 5) * 14}px` } : undefined}
    >
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white text-ios-sub shadow-[inset_0_0_0_1px_rgba(148,163,184,0.16)]">
        {renderMemoIcon(doc.icon, "h-4 w-4")}
      </span>
      {isEditing ? (
        <span className="min-w-0 flex-1">
          <input
            ref={inputRef}
            value={draftTitle}
            onChange={(e) => onDraftChange?.(e.target.value)}
            onBlur={onDraftCommit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                onDraftCommit?.()
              }
              if (e.key === "Escape") {
                e.preventDefault()
                onDraftCancel?.()
              }
            }}
            className={cn(
              "w-full border-none bg-transparent text-[13.5px] font-medium text-ios-text outline-none",
              mobileSafeFineClass
            )}
          />
        </span>
      ) : (
        <button
          type="button"
          onClick={onClick}
          draggable={draggable}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          className="min-w-0 flex-1 text-left"
        >
          <span className="block truncate text-[13.5px] font-medium text-ios-text">{doc.title || "제목 없음"}</span>
          <span className="block truncate pt-0.5 text-[11.5px] text-ios-muted">
            {summary || "비어 있는 메모"}
          </span>
        </button>
      )}
      <span className="mt-0.5 flex shrink-0 items-center gap-1 text-ios-muted">
        {doc.pinned && <Pin className="h-3 w-3 text-[color:var(--rnest-accent)]" />}
        {isLocked && <Lock className="h-3 w-3" />}
        {doc.favorite && (
          <Star className="h-3 w-3 fill-current text-[color:var(--rnest-accent)] opacity-60" />
        )}
      </span>
      {(onStartEdit || onTrash || onRestore || onDeletePermanent) && !isEditing && (
        <div className="flex shrink-0 items-center gap-0.5 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
          {onRestore || onDeletePermanent ? (
            <>
              {onRestore && (
                <button
                  type="button"
                  onClick={onRestore}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-[color:var(--rnest-accent-soft)] hover:text-[color:var(--rnest-accent)]"
                  title="복구"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              )}
              {onDeletePermanent && (
                <button
                  type="button"
                  onClick={onDeletePermanent}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                  title="영구 삭제"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </>
          ) : (
            <>
              {onStartEdit && (
                <button
                  type="button"
                  onClick={onStartEdit}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                  title="이름 변경"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
              {onTrash && (
                <button
                  type="button"
                  onClick={onTrash}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                  title="삭제"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function FolderItem({
  folder,
  docCount,
  isOpen,
  isActive,
  isDropActive,
  isEditing,
  draftName,
  onToggle,
  onStartEdit,
  onDraftChange,
  onDraftCommit,
  onDraftCancel,
  onDelete,
  onDragOver,
  onDragLeave,
  onDrop,
  children,
}: {
  folder: RNestMemoFolder
  docCount: number
  isOpen: boolean
  isActive: boolean
  isDropActive: boolean
  isEditing: boolean
  draftName: string
  onToggle: () => void
  onStartEdit: () => void
  onDraftChange: (value: string) => void
  onDraftCommit: () => void
  onDraftCancel: () => void
  onDelete: () => void
  onDragOver: React.DragEventHandler<HTMLDivElement>
  onDragLeave: React.DragEventHandler<HTMLDivElement>
  onDrop: React.DragEventHandler<HTMLDivElement>
  children?: React.ReactNode
}) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isEditing) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [isEditing])

  return (
    <div className="group">
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={cn(
          "rounded-2xl border transition-all",
          isDropActive
            ? "border-[color:var(--rnest-accent-border)] bg-[color:var(--rnest-accent-soft)]/80 shadow-[0_10px_24px_rgba(123,111,208,0.12)]"
            : "border-transparent"
        )}
      >
        <div className="flex items-center gap-1 rounded-2xl px-1 py-0.5">
          {isEditing ? (
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-white px-2 py-2 shadow-[inset_0_0_0_1px_rgba(196,181,253,0.32)]">
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[color:var(--rnest-accent-soft)] text-[color:var(--rnest-accent)]">
                {renderMemoIcon(folder.icon, "h-4 w-4")}
              </span>
              <input
                ref={inputRef}
                value={draftName}
                onChange={(e) => onDraftChange(e.target.value)}
                onBlur={onDraftCommit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault()
                    onDraftCommit()
                  }
                  if (e.key === "Escape") {
                    e.preventDefault()
                    onDraftCancel()
                  }
                }}
                className={cn(
                  "min-w-0 flex-1 border-none bg-transparent text-[13px] font-medium text-ios-text outline-none",
                  mobileSafeFineClass
                )}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={onToggle}
              className={cn(
                "flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2 py-2 text-left transition-colors",
                isActive
                  ? "bg-[color:var(--rnest-accent-soft)] text-ios-text"
                  : "text-ios-sub hover:bg-gray-100"
              )}
            >
              {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-gray-400" /> : <ChevronRight className="h-3.5 w-3.5 text-gray-400" />}
              <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-[color:var(--rnest-accent)] shadow-[inset_0_0_0_1px_rgba(196,181,253,0.3)]">
                {renderMemoIcon(folder.icon, "h-4 w-4")}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ios-text">{folder.name}</span>
              <span className="rounded-full bg-white px-1.5 py-0.5 text-[10.5px] font-medium text-ios-muted shadow-[inset_0_0_0_1px_rgba(226,232,240,0.8)]">
                {docCount}
              </span>
            </button>
          )}

          {!isEditing && (
            <div className="flex items-center gap-0.5 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
              <button
                type="button"
                onClick={onStartEdit}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                title="이름 변경"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                title="폴더 삭제"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        {isDropActive && (
          <div className="px-3 pb-2 pt-0.5 text-[11px] font-medium text-[color:var(--rnest-accent)]">
            여기에 놓으면 폴더에 추가됩니다
          </div>
        )}
      </div>

      {isOpen && children ? (
        <div className="ml-7 mt-1 space-y-0.5 border-l border-[color:var(--rnest-accent-border)]/60 pl-3">
          {children}
        </div>
      ) : null}
    </div>
  )
}

/* ─── sidebar section ─────────────────────────────────────── */

function SidebarSection({
  title,
  count,
  defaultOpen = true,
  children,
}: {
  title: string
  count?: number
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1 px-2 py-1.5 text-[11.5px] font-semibold uppercase tracking-wider text-ios-muted hover:text-ios-sub"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {title}
        {typeof count === "number" && count > 0 && (
          <span className="ml-auto text-[10.5px] font-normal text-ios-muted">{count}</span>
        )}
      </button>
      {open && <div className="mt-0.5 space-y-0.5">{children}</div>}
    </div>
  )
}

/* ─── icon picker popup ───────────────────────────────────── */

function IconPicker({
  value,
  onChange,
  onClose,
}: {
  value: string
  onChange: (v: string) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [onClose])

  return (
    <div
      ref={ref}
      className="absolute left-0 top-full z-30 mt-1 rounded-xl border border-gray-200 bg-white p-2 shadow-lg"
    >
      <div className="grid grid-cols-6 gap-1">
        {memoIconOptions.map((icon) => (
          <button
            key={icon}
            type="button"
            onClick={() => { onChange(icon); onClose() }}
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
              normalizeMemoIconId(value) === icon ? "bg-[color:var(--rnest-accent-soft)] text-[color:var(--rnest-accent)]" : "text-ios-sub hover:bg-gray-100"
            )}
            title={memoIconLabelMap[icon]}
          >
            {renderMemoIcon(icon, "h-4.5 w-4.5")}
          </button>
        ))}
      </div>
    </div>
  )
}

function CoverPicker({
  value,
  onChange,
  onClose,
}: {
  value: string | null
  onChange: (v: RNestMemoCoverId | null) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [onClose])

  return (
    <div
      ref={ref}
      className="absolute left-0 top-full z-30 mt-2 w-[286px] rounded-2xl border border-gray-200 bg-white p-3 shadow-[0_18px_40px_rgba(15,23,42,0.12)]"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[12px] font-semibold text-ios-text">페이지 커버</span>
        <button
          type="button"
          onClick={() => {
            onChange(null)
            onClose()
          }}
          className="text-[11.5px] text-ios-muted transition-colors hover:text-ios-sub"
        >
          제거
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {memoCoverOptions.map((cover) => {
          const selected = value === cover
          return (
            <button
              key={cover}
              type="button"
              onClick={() => {
                onChange(cover)
                onClose()
              }}
              className={cn(
                "overflow-hidden rounded-2xl border text-left transition-all",
                selected
                  ? "border-[color:var(--rnest-accent-border)] shadow-[0_0_0_1px_var(--rnest-accent-border)]"
                  : "border-gray-200 hover:border-gray-300"
              )}
            >
              <div className={cn("h-16 w-full", coverClassMap[cover])} />
              <div className="px-3 py-2 text-[12px] font-medium text-ios-text">{coverLabelMap[cover]}</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ─── block type menu ─────────────────────────────────────── */

function GroupedBlockTypeMenuContent({
  availableTypes,
  currentType,
  intent,
  onSelect,
}: {
  availableTypes: RNestMemoBlockType[]
  currentType?: RNestMemoBlockType
  intent: BlockTypeMenuIntent
  onSelect: (type: RNestMemoBlockType) => void
}) {
  const groups = useMemo(() => resolveBlockTypeMenuGroups(availableTypes), [availableTypes])
  const [activeGroupId, setActiveGroupId] = useState<BlockTypeMenuGroupId | null>(() => findBlockTypeMenuGroupId(currentType, groups))

  useEffect(() => {
    setActiveGroupId(findBlockTypeMenuGroupId(currentType, groups))
  }, [currentType, groups])

  const activeGroup = groups.find((group) => group.id === activeGroupId) ?? groups[0] ?? null

  return (
    <div className="relative">
      <div className="max-h-[calc(100vh-12rem)] overflow-y-auto py-1">
        {groups.map((group) => (
          <button
            key={group.id}
            type="button"
            onMouseEnter={() => setActiveGroupId(group.id)}
            onFocus={() => setActiveGroupId(group.id)}
            onClick={() => setActiveGroupId(group.id)}
            className={cn(
              "flex w-full items-start gap-3 px-3 py-2 text-left transition-colors",
              activeGroup?.id === group.id ? "bg-gray-50" : "hover:bg-gray-50"
            )}
          >
            <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-ios-sub">
              {renderBlockTypeGroupIcon(group.id, "h-3.5 w-3.5")}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium text-ios-text">{group.label}</span>
              <span className="block text-[11px] text-ios-muted">{group.description}</span>
            </span>
            <ChevronRight className="mt-1 h-3.5 w-3.5 shrink-0 text-gray-300" />
          </button>
        ))}
      </div>
      {activeGroup && (
        <div className="absolute left-full top-0 z-10 ml-2 w-56 max-w-[calc(100vw-7rem)] rounded-2xl border border-gray-200 bg-white py-1.5 shadow-[0_18px_40px_rgba(15,23,42,0.14)]">
          <div className="border-b border-gray-100 px-3 py-2">
            <div className="text-[12px] font-semibold text-ios-text">{activeGroup.label}</div>
            <div className="mt-0.5 text-[11px] text-ios-muted">
              {intent === "add" ? "이 그룹에서 추가할 블록" : "이 그룹으로 변경할 블록"}
            </div>
          </div>
          <div className="max-h-[calc(100vh-14rem)] overflow-y-auto py-1">
            {activeGroup.types.map((type) => (
              <button
                key={`${activeGroup.id}-${type}`}
                type="button"
                onClick={() => onSelect(type)}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors",
                  intent === "convert" && currentType === type
                    ? "bg-[color:var(--rnest-accent-soft)] text-[color:var(--rnest-accent)]"
                    : "text-ios-text hover:bg-gray-50"
                )}
              >
                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-ios-sub">
                  {renderBlockTypeIcon(type, "h-3 w-3")}
                </span>
                <span className="min-w-0 flex-1">{blockTypeLabels[type]}</span>
                {intent === "convert" && currentType === type && (
                  <span className="text-[11px] font-medium text-[color:var(--rnest-accent)]">현재</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function BlockTypeMenu({
  currentType,
  availableTypes = quickAddBlockTypes,
  onSelect,
  onClose,
}: {
  currentType: RNestMemoBlockType
  availableTypes?: RNestMemoBlockType[]
  onSelect: (t: RNestMemoBlockType) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [onClose])

  return (
    <div
      ref={ref}
      className="absolute left-0 top-full z-30 mt-1 w-60 rounded-2xl border border-gray-200 bg-white py-1.5 shadow-[0_18px_40px_rgba(15,23,42,0.14)]"
    >
      <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-ios-muted">
        추가할 블록
      </div>
      <GroupedBlockTypeMenuContent
        availableTypes={availableTypes}
        currentType={currentType}
        intent="add"
        onSelect={(type) => {
          onSelect(type)
          onClose()
        }}
      />
    </div>
  )
}

/* ─── more actions menu ───────────────────────────────────── */

function MoreMenu({
  doc,
  isUnlocked,
  onAction,
  onClose,
}: {
  doc: RNestMemoDocument
  isUnlocked: boolean
  onAction: (action: string) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [onClose])

  const items = doc.trashedAt != null
    ? [
      { id: "restore", label: "복구", icon: <RotateCcw className="h-3.5 w-3.5" /> },
      { id: "delete-permanent", label: "영구 삭제", icon: <Trash2 className="h-3.5 w-3.5" />, danger: true },
    ]
    : [
      { id: "find", label: "메모 검색", icon: <Search className="h-3.5 w-3.5" /> },
      { id: "pin", label: doc.pinned ? "핀 해제" : "핀 고정", icon: doc.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" /> },
      { id: "favorite", label: doc.favorite ? "즐겨찾기 해제" : "즐겨찾기", icon: <Star className="h-3.5 w-3.5" /> },
      {
        id: doc.lock ? (isUnlocked ? "relock" : "unlock") : "lock",
        label: doc.lock ? (isUnlocked ? "다시 잠그기" : "잠금 해제") : "잠금 설정",
        icon: doc.lock ? (isUnlocked ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />) : <Shield className="h-3.5 w-3.5" />,
      },
      ...(doc.lock && isUnlocked
        ? [{ id: "remove-lock", label: "잠금 제거", icon: <Shield className="h-3.5 w-3.5" /> }]
        : []),
      { id: "duplicate", label: "복제", icon: <Copy className="h-3.5 w-3.5" /> },
      { id: "import-text", label: "텍스트 가져오기", icon: <Download className="h-3.5 w-3.5" /> },
      { id: "export-pdf", label: "PDF 저장", icon: <Download className="h-3.5 w-3.5" /> },
      { id: "export-txt", label: "TXT 내보내기", icon: <Download className="h-3.5 w-3.5" /> },
      { id: "export-md", label: "Markdown 내보내기", icon: <Download className="h-3.5 w-3.5" /> },
      { id: "trash", label: "삭제", icon: <Trash2 className="h-3.5 w-3.5" />, danger: true },
    ]

  return (
    <div
      ref={ref}
      className="absolute right-0 top-full z-30 mt-1 w-52 rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => { onAction(item.id); onClose() }}
          className={cn(
            "flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors",
            "danger" in item && item.danger
              ? "text-red-500 hover:bg-red-50"
              : "text-ios-text hover:bg-gray-50"
          )}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>
  )
}

function SlashMenu({
  currentType,
  onSelectType,
  onDuplicate,
  onClose,
}: {
  currentType: RNestMemoBlockType
  onSelectType: (type: RNestMemoBlockType) => void
  onDuplicate: () => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState("")

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [onClose])

  const items = slashCommands.filter((item) => {
    const haystack = `${item.label} ${item.description} ${item.id}`.toLowerCase()
    return haystack.includes(query.trim().toLowerCase())
  })

  return (
    <div
      ref={ref}
      className="absolute left-0 top-full z-30 mt-2 w-[280px] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.12)]"
    >
      <div className="border-b border-gray-100 px-3 py-2">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="/ 명령 검색"
          className={cn("w-full border-none bg-transparent text-ios-text outline-none placeholder:text-gray-400", mobileSafeInputClass)}
        />
      </div>
      <div className="max-h-[280px] overflow-y-auto py-1">
        {items.length === 0 ? (
          <div className="px-3 py-6 text-center text-[12px] text-ios-muted">일치하는 명령이 없습니다.</div>
        ) : (
          items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                if ("blockType" in item) onSelectType(item.blockType)
                else onDuplicate()
                onClose()
              }}
              className={cn(
                "flex w-full items-start gap-3 px-3 py-2 text-left transition-colors",
                "blockType" in item && item.blockType === currentType
                  ? "bg-[color:var(--rnest-accent-soft)]"
                  : "hover:bg-gray-50"
              )}
            >
              <span className="mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-lg bg-gray-100 text-ios-sub">
                {"blockType" in item ? renderBlockTypeIcon(item.blockType, "h-3.5 w-3.5") : <Copy className="h-3.5 w-3.5" />}
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-medium text-ios-text">{item.label}</span>
                <span className="block text-[11.5px] text-ios-muted">{item.description}</span>
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

/* ─── resizable image block ───────────────────────────────── */

function ImageResizableBlock({
  block,
  attachment,
  attachmentUrl,
  onChange,
  onKeyDown,
}: {
  block: RNestMemoBlock
  attachment: RNestMemoAttachment | null
  attachmentUrl?: string
  onChange: (b: RNestMemoBlock) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void
}) {
  const stageRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLDivElement>(null)
  const [resizing, setResizing] = useState(false)
  const [moving, setMoving] = useState(false)
  const [imgHovered, setImgHovered] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [previewWidthPct, setPreviewWidthPct] = useState(() => clampImageWidth(block.mediaWidth))
  const [previewOffsetX, setPreviewOffsetX] = useState(() => clampImageOffsetX(block.mediaOffsetX))
  const storagePath = attachment?.storagePath ?? ""
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(() => {
    if (attachment?.storagePath) {
      return getCachedNotebookImagePreview(attachment.storagePath) ?? null
    }
    return attachmentUrl ?? null
  })
  const resizeStartRef = useRef<{ startX: number; startW: number; handle: string } | null>(null)
  const moveStartRef = useRef<{ startX: number; startOffsetPx: number; availableWidth: number } | null>(null)
  const previewWidthRef = useRef(previewWidthPct)
  const pendingWidthRef = useRef(previewWidthPct)
  const previewOffsetRef = useRef(previewOffsetX)
  const pendingOffsetRef = useRef(previewOffsetX)
  const resizeFrameRef = useRef<number | null>(null)
  const moveFrameRef = useRef<number | null>(null)
  const imageLoadRetryCountRef = useRef(0)
  const imageLoadRequestIdRef = useRef(0)

  const aspectRatio = clampImageAspectRatio(block.mediaAspectRatio)
  const canMoveImage = previewWidthPct < 100
  const marginLeftPct = Math.max(0, ((100 - previewWidthPct) * previewOffsetX) / 100)

  useEffect(() => {
    previewWidthRef.current = previewWidthPct
    pendingWidthRef.current = previewWidthPct
  }, [previewWidthPct])

  useEffect(() => {
    previewOffsetRef.current = previewOffsetX
    pendingOffsetRef.current = previewOffsetX
  }, [previewOffsetX])

  useEffect(() => {
    if (!resizing) {
      const nextWidth = clampImageWidth(block.mediaWidth)
      previewWidthRef.current = nextWidth
      pendingWidthRef.current = nextWidth
      setPreviewWidthPct(nextWidth)
    }
  }, [block.mediaWidth, resizing])

  useEffect(() => {
    if (!moving) {
      const nextOffset = clampImageOffsetX(block.mediaOffsetX)
      previewOffsetRef.current = nextOffset
      pendingOffsetRef.current = nextOffset
      setPreviewOffsetX(nextOffset)
    }
  }, [block.mediaOffsetX, moving])

  useEffect(() => {
    setLoadError(false)
  }, [attachment?.id, resolvedSrc])

  const resolveImageSource = useCallback(
    async (options?: { forceRefresh?: boolean }) => {
      const path = attachment?.storagePath
      const requestId = imageLoadRequestIdRef.current + 1
      imageLoadRequestIdRef.current = requestId

      if (!path) {
        setResolvedSrc(attachmentUrl ?? null)
        setLoadError(false)
        return attachmentUrl ?? null
      }

      if (options?.forceRefresh) {
        clearNotebookImagePreview(path)
      }

      try {
        const previewUrl = await loadNotebookImagePreview(path, { forceRefresh: options?.forceRefresh })
        if (imageLoadRequestIdRef.current === requestId) {
          setResolvedSrc(previewUrl)
          setLoadError(false)
        }
        return previewUrl
      } catch (error) {
        if (imageLoadRequestIdRef.current === requestId) {
          setResolvedSrc(attachmentUrl ?? null)
        }
        throw error
      }
    },
    [attachment?.storagePath, attachmentUrl]
  )

  useEffect(() => {
    let cancelled = false
    imageLoadRetryCountRef.current = 0

    if (!storagePath) {
      setResolvedSrc(attachmentUrl ?? null)
      return () => {
        cancelled = true
      }
    }

    const cached = getCachedNotebookImagePreview(storagePath)
    if (cached) {
      setResolvedSrc((current) => (current === cached ? current : cached))
      return () => {
        cancelled = true
      }
    }

    void resolveImageSource()
      .then((previewUrl) => {
        if (!cancelled) {
          setResolvedSrc(previewUrl)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setResolvedSrc((current) => current ?? attachmentUrl ?? null)
        }
      })

    return () => {
      cancelled = true
    }
  }, [attachmentUrl, resolveImageSource, storagePath])

  const retryImageLoad = useCallback(
    (options?: { manual?: boolean }) => {
      const path = attachment?.storagePath
      if (!path) {
        setLoadError(true)
        return
      }

      const isManual = Boolean(options?.manual)
      if (!isManual && imageLoadRetryCountRef.current >= 2) {
        setLoadError(true)
        return
      }

      imageLoadRetryCountRef.current += 1
      setLoadError(false)
      clearNotebookImagePreview(path)
      void resolveImageSource({ forceRefresh: true }).catch(() => {
        if (attachmentUrl && resolvedSrc !== attachmentUrl) {
          setResolvedSrc(attachmentUrl)
          return
        }
        setLoadError(true)
      })
    },
    [attachment?.storagePath, attachmentUrl, resolveImageSource, resolvedSrc]
  )

  useEffect(() => {
    return () => {
      if (resizeFrameRef.current != null) {
        window.cancelAnimationFrame(resizeFrameRef.current)
      }
      if (moveFrameRef.current != null) {
        window.cancelAnimationFrame(moveFrameRef.current)
      }
    }
  }, [])

  function schedulePreviewWidth(nextWidth: number) {
    previewWidthRef.current = nextWidth
    pendingWidthRef.current = nextWidth
    if (resizeFrameRef.current != null) return
    resizeFrameRef.current = window.requestAnimationFrame(() => {
      resizeFrameRef.current = null
      const width = pendingWidthRef.current
      setPreviewWidthPct((current) => (current === width ? current : width))
    })
  }

  function schedulePreviewOffset(nextOffset: number) {
    previewOffsetRef.current = nextOffset
    pendingOffsetRef.current = nextOffset
    if (moveFrameRef.current != null) return
    moveFrameRef.current = window.requestAnimationFrame(() => {
      moveFrameRef.current = null
      const offset = pendingOffsetRef.current
      setPreviewOffsetX((current) => (current === offset ? current : offset))
    })
  }

  function commitImageOffset(nextOffset: number) {
    const clamped = clampImageOffsetX(nextOffset)
    previewOffsetRef.current = clamped
    pendingOffsetRef.current = clamped
    setPreviewOffsetX(clamped)
    if (Math.abs(clamped - clampImageOffsetX(block.mediaOffsetX)) > 0.05) {
      onChange({ ...block, mediaOffsetX: clamped })
    }
  }

  function handleResizeStart(e: React.PointerEvent, handle: string) {
    e.preventDefault()
    e.stopPropagation()
    const imgEl = imageRef.current
    if (!imgEl) return
    const rect = imgEl.getBoundingClientRect()
    resizeStartRef.current = {
      startX: e.clientX,
      startW: rect.width,
      handle,
    }
    setResizing(true)

    function handleMove(ev: PointerEvent) {
      if (!resizeStartRef.current || !stageRef.current) return
      const parentWidth = stageRef.current.getBoundingClientRect().width
      const { startX, startW, handle: h } = resizeStartRef.current
      const dx = ev.clientX - startX
      const isLeft = h.includes("l")
      const effectiveDx = isLeft ? -dx : dx
      const newW = Math.max(100, startW + effectiveDx)
      const newPct = Math.min(100, Math.max(20, Math.round((newW / parentWidth) * 100)))
      schedulePreviewWidth(newPct)
    }

    function handleUp() {
      const nextWidth = previewWidthRef.current
      resizeStartRef.current = null
      if (resizeFrameRef.current != null) {
        window.cancelAnimationFrame(resizeFrameRef.current)
        resizeFrameRef.current = null
      }
      pendingWidthRef.current = nextWidth
      setPreviewWidthPct(nextWidth)
      setResizing(false)
      window.removeEventListener("pointermove", handleMove)
      window.removeEventListener("pointerup", handleUp)
      if (nextWidth !== clampImageWidth(block.mediaWidth)) {
        onChange({ ...block, mediaWidth: nextWidth })
      }
    }

    window.addEventListener("pointermove", handleMove)
    window.addEventListener("pointerup", handleUp)
  }

  function handleMoveStart(event: React.PointerEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement
    if (
      target.closest('[data-image-resize-handle="true"]') ||
      target.closest('[data-image-align-control="true"]') ||
      !canMoveImage ||
      resizing
    ) {
      return
    }
    if (event.pointerType === "mouse" && event.button !== 0) return
    const stageEl = stageRef.current
    const imageEl = imageRef.current
    if (!stageEl || !imageEl) return
    const availableWidth = stageEl.getBoundingClientRect().width - imageEl.getBoundingClientRect().width
    if (availableWidth <= 1) return

    event.preventDefault()
    event.stopPropagation()
    setImgHovered(true)
    setMoving(true)
    moveStartRef.current = {
      startX: event.clientX,
      startOffsetPx: (availableWidth * previewOffsetRef.current) / 100,
      availableWidth,
    }

    function handleMove(ev: PointerEvent) {
      if (!moveStartRef.current) return
      const { startX, startOffsetPx, availableWidth: width } = moveStartRef.current
      const dx = ev.clientX - startX
      const nextOffsetPx = Math.min(width, Math.max(0, startOffsetPx + dx))
      const nextOffset = width <= 1 ? 0 : clampImageOffsetX((nextOffsetPx / width) * 100)
      schedulePreviewOffset(nextOffset)
    }

    function handleUp() {
      const nextOffset = previewOffsetRef.current
      moveStartRef.current = null
      if (moveFrameRef.current != null) {
        window.cancelAnimationFrame(moveFrameRef.current)
        moveFrameRef.current = null
      }
      pendingOffsetRef.current = nextOffset
      setPreviewOffsetX(nextOffset)
      setMoving(false)
      window.removeEventListener("pointermove", handleMove)
      window.removeEventListener("pointerup", handleUp)
      if (Math.abs(nextOffset - clampImageOffsetX(block.mediaOffsetX)) > 0.05) {
        onChange({ ...block, mediaOffsetX: nextOffset })
      }
    }

    window.addEventListener("pointermove", handleMove)
    window.addEventListener("pointerup", handleUp)
  }

  const showHandles = imgHovered || resizing || moving

  const handleClass =
    "absolute z-10 rounded-full border-2 border-[color:var(--rnest-accent)] bg-white shadow-sm transition-opacity [touch-action:none]"

  return (
    <div>
      {resolvedSrc && !loadError ? (
        <div ref={stageRef} className="relative w-full">
          <div
            className="relative inline-block max-w-full"
            style={{
              width: `${previewWidthPct}%`,
              marginLeft: `${marginLeftPct}%`,
              willChange: resizing || moving ? "width, margin-left" : undefined,
              transition:
                resizing || moving ? "none" : "width 220ms cubic-bezier(0.22, 1, 0.36, 1), margin-left 220ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 220ms ease",
            }}
            ref={imageRef}
            onMouseEnter={() => setImgHovered(true)}
            onMouseLeave={() => {
              if (!resizing && !moving) setImgHovered(false)
            }}
            onPointerDown={handleMoveStart}
          >
            {showHandles && canMoveImage && (
              <div
                data-pdf-hide="true"
                data-image-align-control="true"
                className="absolute right-2 top-2 z-20 flex items-center gap-1 rounded-full border border-white/80 bg-white/92 p-1 shadow-[0_12px_24px_rgba(15,23,42,0.12)] backdrop-blur"
                onPointerDown={(event) => event.stopPropagation()}
              >
                {([
                  { label: "좌", value: 0 },
                  { label: "중", value: 50 },
                  { label: "우", value: 100 },
                ] as const).map((preset) => {
                  const active = Math.abs(previewOffsetX - preset.value) <= 2
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      data-image-align-control="true"
                      disabled={!canMoveImage}
                      aria-label={`이미지 ${preset.label}측 정렬`}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => commitImageOffset(preset.value)}
                      className={cn(
                        "flex h-7 min-w-7 items-center justify-center rounded-full px-2 text-[11px] font-medium transition-colors",
                        active
                          ? "bg-[color:var(--rnest-accent-soft)] text-[color:var(--rnest-accent)]"
                          : "text-ios-sub hover:bg-gray-100 hover:text-ios-text",
                        !canMoveImage && "cursor-not-allowed opacity-45"
                      )}
                    >
                      {preset.label}
                    </button>
                  )
                })}
              </div>
            )}

            <div
              className={cn(
                "relative overflow-hidden rounded-lg",
                canMoveImage && !resizing && !moving && "cursor-grab active:cursor-grabbing",
                (resizing || moving) && "select-none shadow-[0_18px_36px_rgba(123,111,208,0.14)]"
              )}
              style={{ aspectRatio: String(aspectRatio), touchAction: resizing || moving ? "none" : canMoveImage ? "pan-y" : "auto" }}
            >
              <img
                src={resolvedSrc}
                alt={block.text || attachment?.name || "메모 이미지"}
                className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover"
                draggable={false}
                onLoad={(event) => {
                  imageLoadRetryCountRef.current = 0
                  setLoadError(false)
                  const nextRatio =
                    event.currentTarget.naturalWidth > 0 && event.currentTarget.naturalHeight > 0
                      ? event.currentTarget.naturalWidth / event.currentTarget.naturalHeight
                      : undefined
                  if (
                    typeof nextRatio === "number" &&
                    Math.abs(clampImageAspectRatio(block.mediaAspectRatio) - clampImageAspectRatio(nextRatio)) > 0.01
                  ) {
                    onChange({ ...block, mediaAspectRatio: nextRatio })
                  }
                }}
                onError={() => {
                  retryImageLoad()
                }}
              />
            </div>
            {showHandles && (
              <>
                <div
                  data-image-resize-handle="true"
                  onPointerDown={(e) => handleResizeStart(e, "tl")}
                  className={cn(handleClass, "-left-1.5 -top-1.5 h-3 w-3 cursor-nwse-resize", showHandles ? "opacity-100" : "opacity-0")}
                />
                <div
                  data-image-resize-handle="true"
                  onPointerDown={(e) => handleResizeStart(e, "tr")}
                  className={cn(handleClass, "-right-1.5 -top-1.5 h-3 w-3 cursor-nesw-resize", showHandles ? "opacity-100" : "opacity-0")}
                />
                <div
                  data-image-resize-handle="true"
                  onPointerDown={(e) => handleResizeStart(e, "bl")}
                  className={cn(handleClass, "-bottom-1.5 -left-1.5 h-3 w-3 cursor-nesw-resize", showHandles ? "opacity-100" : "opacity-0")}
                />
                <div
                  data-image-resize-handle="true"
                  onPointerDown={(e) => handleResizeStart(e, "br")}
                  className={cn(handleClass, "-bottom-1.5 -right-1.5 h-3 w-3 cursor-nwse-resize", showHandles ? "opacity-100" : "opacity-0")}
                />
                <div
                  data-image-resize-handle="true"
                  onPointerDown={(e) => handleResizeStart(e, "l")}
                  className={cn(handleClass, "-left-1.5 top-1/2 h-6 w-2 -translate-y-1/2 cursor-ew-resize rounded-full", showHandles ? "opacity-100" : "opacity-0")}
                />
                <div
                  data-image-resize-handle="true"
                  onPointerDown={(e) => handleResizeStart(e, "r")}
                  className={cn(handleClass, "-right-1.5 top-1/2 h-6 w-2 -translate-y-1/2 cursor-ew-resize rounded-full", showHandles ? "opacity-100" : "opacity-0")}
                />
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="flex h-48 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 text-center text-[13px] text-ios-muted">
          <span>{loadError ? "이미지를 불러오지 못했습니다" : "이미지를 불러오는 중..."}</span>
          {loadError ? (
            <button
              type="button"
              onClick={() => retryImageLoad({ manual: true })}
              className="inline-flex items-center rounded-full border border-[color:var(--rnest-accent)] px-3 py-1.5 text-[12px] font-medium text-[color:var(--rnest-accent)] transition-colors hover:bg-[color:var(--rnest-accent-soft)]"
            >
              다시 불러오기
            </button>
          ) : null}
        </div>
      )}
      <input
        type="text"
        value={block.text ?? ""}
        onChange={(e) => onChange({ ...block, text: e.target.value })}
        onKeyDown={onKeyDown}
        placeholder="이미지 설명을 입력하세요"
        className={cn(
          "mt-1.5 w-full border-none bg-transparent text-[13px] text-ios-muted outline-none placeholder:text-gray-300",
          mobileSafeInputClass
        )}
      />
    </div>
  )
}

/* ─── inline block editor ─────────────────────────────────── */

type MemoUndoSnapshot = {
  rawDoc: RNestMemoDocument
  unlockedPayload: RNestLockedMemoPayload | null
}

type BlockDropPlacement = "before" | "after"

type BlockReorderGesture = {
  activeBlockId: string
  pointerId: number
  pointerType: string
  startX: number
  startY: number
}

type ActiveBlockReorderState = BlockReorderGesture & {
  overBlockId: string
  placement: BlockDropPlacement
  offsetY: number
}

function InlineBlock({
  block,
  attachment,
  attachmentUrl,
  docAttachments,
  allDocs,
  recordTemplates,
  recordEntriesByTemplateId,
  onChange,
  onDelete,
  onRemoveAttachment,
  onOpenAttachment,
  onOpenDoc,
  onDuplicate,
  onInsertBlankBefore,
  onRemoveBlankBefore,
  onTypeChange,
  onAddAfter,
  onInsertAsset,
  onQuickAddRecordEntry,
  onSendToNextPdfPage,
  onMoveUp,
  onMoveDown,
  onHighlight,
  onRequestReorderStart,
  onRootReady,
  isFirst,
  isLast,
  showPdfBreaks,
  startsNextPdfPage,
  isDragging,
  dragOffsetY,
}: {
  block: RNestMemoBlock
  attachment: RNestMemoAttachment | null
  attachmentUrl?: string
  docAttachments: RNestMemoAttachment[]
  allDocs: RNestMemoDocument[]
  recordTemplates: RNestRecordTemplate[]
  recordEntriesByTemplateId: Record<string, RNestRecordEntry[]>
  onChange: (b: RNestMemoBlock) => void
  onDelete: () => void
  onRemoveAttachment: () => void
  onOpenAttachment: () => void
  onOpenDoc: (docId: string) => void
  onDuplicate: () => void
  onInsertBlankBefore: () => void
  onRemoveBlankBefore: () => boolean
  onTypeChange: (t: RNestMemoBlockType) => void
  onAddAfter: (type?: RNestMemoBlockType) => void
  onInsertAsset: (kind: "image" | "attachment" | "gallery") => void
  onQuickAddRecordEntry: (templateId: string) => void
  onSendToNextPdfPage: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onHighlight: (color: RNestMemoHighlightColor | null) => void
  onRequestReorderStart: (gesture: BlockReorderGesture) => void
  onRootReady?: (node: HTMLDivElement | null) => void
  isFirst: boolean
  isLast: boolean
  showPdfBreaks: boolean
  startsNextPdfPage?: boolean
  isDragging?: boolean
  dragOffsetY?: number
}) {
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [showActionMenu, setShowActionMenu] = useState(false)
  const [showSlashMenu, setShowSlashMenu] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [touchActive, setTouchActive] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const addMenuRef = useRef<HTMLDivElement>(null)
  const actionMenuRef = useRef<HTMLDivElement>(null)
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const actionHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const actionGestureRef = useRef<BlockReorderGesture | null>(null)
  const suppressActionClickRef = useRef(false)
  const desktopControlsVisible = hovered || focused || showAddMenu || showActionMenu
  const mobileControlsVisible = !focused && (showAddMenu || showActionMenu || touchActive)

  function clearActionHold() {
    if (actionHoldTimerRef.current) {
      clearTimeout(actionHoldTimerRef.current)
      actionHoldTimerRef.current = null
    }
  }

  function handleBlockMouseEnter() {
    if (hoverTimeoutRef.current) { clearTimeout(hoverTimeoutRef.current); hoverTimeoutRef.current = null }
    setHovered(true)
  }
  function handleBlockMouseLeave() {
    // Delay hide so controls stay stable while moving between controls and block content
    hoverTimeoutRef.current = setTimeout(() => setHovered(false), 120)
  }

  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current)
      clearActionHold()
    }
  }, [])

  useEffect(() => {
    if (!showAddMenu && !showActionMenu) return
    function handlePointerDown(event: MouseEvent) {
      if (addMenuRef.current && !addMenuRef.current.contains(event.target as Node)) setShowAddMenu(false)
      if (actionMenuRef.current && !actionMenuRef.current.contains(event.target as Node)) setShowActionMenu(false)
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setShowAddMenu(false)
        setShowActionMenu(false)
      }
    }
    document.addEventListener("mousedown", handlePointerDown)
    document.addEventListener("keydown", handleEscape)
    return () => {
      document.removeEventListener("mousedown", handlePointerDown)
      document.removeEventListener("keydown", handleEscape)
    }
  }, [showAddMenu, showActionMenu])

  useEffect(() => {
    if (!touchActive && !showAddMenu && !showActionMenu) return
    function handlePointerDown(event: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setTouchActive(false)
      }
    }
    document.addEventListener("pointerdown", handlePointerDown)
    return () => document.removeEventListener("pointerdown", handlePointerDown)
  }, [touchActive, showAddMenu, showActionMenu])

  function handleInsertBlankBeforeFromInput(e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const selectionStart = typeof e.currentTarget.selectionStart === "number" ? e.currentTarget.selectionStart : null
    const selectionEnd = typeof e.currentTarget.selectionEnd === "number" ? e.currentTarget.selectionEnd : null
    if (e.key !== "Enter" || selectionStart !== 0 || selectionEnd !== 0) return false
    e.preventDefault()
    onInsertBlankBefore()
    return true
  }

  function handleRemoveBlankBeforeFromInput(e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const selectionStart = typeof e.currentTarget.selectionStart === "number" ? e.currentTarget.selectionStart : null
    const selectionEnd = typeof e.currentTarget.selectionEnd === "number" ? e.currentTarget.selectionEnd : null
    if (e.key !== "Backspace" || selectionStart !== 0 || selectionEnd !== 0) return false
    if (!onRemoveBlankBefore()) return false
    e.preventDefault()
    return true
  }

  function handleCommandKeyDown(e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
      e.preventDefault()
      onDuplicate()
      return
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "/") {
      e.preventDefault()
      setShowSlashMenu(true)
    }
  }

  function handleEditorKeyDown(e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (handleInsertBlankBeforeFromInput(e)) return
    if (handleRemoveBlankBeforeFromInput(e)) return
    handleCommandKeyDown(e)
    if (e.defaultPrevented) return
    const currentValue = "value" in e.currentTarget ? String(e.currentTarget.value ?? "") : ""
    if (e.key === "/" && currentValue.trim().length === 0) {
      e.preventDefault()
      setShowSlashMenu(true)
    }
  }

  function updateTableColumn(index: number, next: { text: string; html: string }) {
    const table = block.table ? upgradeMemoTableToV2(block.table) : upgradeMemoTableToV2(undefined)
    const columns = [...table.columns]
    const columnHtml = [...(table.columnHtml ?? columns.map((column) => plainTextToRichHtml(column)))]
    columns[index] = next.text || `열 ${index + 1}`
    columnHtml[index] = next.html || plainTextToRichHtml(columns[index])
    onChange({
      ...block,
      table: {
        ...table,
        columns,
        columnHtml,
      },
    })
  }

  function updateTableRowCell(rowId: string, side: "left" | "right" | number, next: { text: string; html: string }) {
    const table = block.table ? upgradeMemoTableToV2(block.table) : upgradeMemoTableToV2(undefined)
    onChange({
      ...block,
      table: {
        ...table,
        rows: table.rows.map((row) => {
          if (row.id !== rowId) return row
          const cells = getMemoTableRowCells(row, table)
          const cellIndex = typeof side === "number" ? side : side === "left" ? 0 : 1
          const nextCells = Array.from({ length: table.columns.length }, (_, index) =>
            createMemoTableCell(index === cellIndex ? next.text : cells[index]?.text || "", {
              ...(cells[index] ?? {}),
              textHtml: index === cellIndex ? next.html : cells[index]?.textHtml,
            })
          )
          return {
            ...row,
            left: nextCells[0]?.text ?? "",
            leftHtml: nextCells[0]?.textHtml ?? "",
            right: nextCells[1]?.text ?? "",
            rightHtml: nextCells[1]?.textHtml ?? "",
            cells: nextCells,
          }
        }),
      },
    })
  }

  function addTableColumn() {
    const table = upgradeMemoTableToV2(block.table)
    if (table.columns.length >= 8) return
    onChange({
      ...block,
      table: {
        ...table,
        columns: [...table.columns, `열 ${table.columns.length + 1}`],
        columnHtml: [...(table.columnHtml ?? table.columns.map((column) => plainTextToRichHtml(column))), plainTextToRichHtml(`열 ${table.columns.length + 1}`)],
        columnWidths: [...(table.columnWidths ?? table.columns.map(() => 240)), 240],
        alignments: [...(table.alignments ?? table.columns.map(() => "left")), "left"],
        rows: table.rows.map((row) => ({
          ...row,
          cells: [...getMemoTableRowCells(row, table), createMemoTableCell()],
        })),
      },
    })
  }

  function removeTableColumn(index: number) {
    const table = upgradeMemoTableToV2(block.table)
    if (table.columns.length <= 2) return
    onChange({
      ...block,
      table: {
        ...table,
        columns: table.columns.filter((_, columnIndex) => columnIndex !== index),
        columnHtml: (table.columnHtml ?? []).filter((_, columnIndex) => columnIndex !== index),
        columnWidths: (table.columnWidths ?? []).filter((_, columnIndex) => columnIndex !== index),
        alignments: (table.alignments ?? []).filter((_, columnIndex) => columnIndex !== index),
        rows: table.rows.map((row) => {
          const nextCells = getMemoTableRowCells(row, table).filter((_, columnIndex) => columnIndex !== index)
          return {
            ...row,
            left: nextCells[0]?.text ?? "",
            leftHtml: nextCells[0]?.textHtml ?? "",
            right: nextCells[1]?.text ?? "",
            rightHtml: nextCells[1]?.textHtml ?? "",
            cells: nextCells,
          }
        }),
      },
    })
  }

  const linkedDoc = block.targetDocId ? allDocs.find((doc) => doc.id === block.targetDocId) ?? null : null
  const customRecordTemplates = Object.fromEntries(recordTemplates.map((template) => [template.id, template]))
  const recordTemplate = block.recordTemplateId ? resolveRecordTemplate(block.recordTemplateId, customRecordTemplates) : null
  const recordEntries = recordTemplate
    ? (recordEntriesByTemplateId[recordTemplate.id] ?? []).slice(0, 6)
    : []
  return (
    <div
      ref={(node) => {
        rootRef.current = node
        onRootReady?.(node)
      }}
      id={`memo-block-${block.id}`}
      className={cn(
        "group/block relative scroll-mt-28 transition-shadow",
        isDragging && "z-30 pointer-events-none rounded-2xl bg-white shadow-[0_8px_30px_rgba(0,0,0,0.12),0_2px_8px_rgba(0,0,0,0.06)]"
      )}
      data-pdf-force-page-start={startsNextPdfPage ? "true" : undefined}
      style={isDragging ? { transform: `translateY(${dragOffsetY ?? 0}px) scale(1.018)`, opacity: 1, transition: "none" } : undefined}
      onMouseEnter={handleBlockMouseEnter}
      onMouseLeave={handleBlockMouseLeave}
      onPointerDownCapture={(event) => {
        if (event.pointerType && event.pointerType !== "mouse") {
          setTouchActive(true)
        }
      }}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setFocused(false)
        }
      }}
    >
      {/* left controls */}
      <div
        className={cn(
          "z-20 mb-2 flex items-center gap-2 transition-opacity duration-150",
          "lg:absolute lg:-left-16 lg:top-1/2 lg:mb-0 lg:gap-1 lg:-translate-y-1/2",
          showPdfBreaks
            ? "pointer-events-none h-0 overflow-hidden opacity-0 lg:h-auto lg:overflow-visible"
            : mobileControlsVisible ? "pointer-events-auto opacity-100" : "pointer-events-none h-0 overflow-hidden opacity-0 lg:h-auto lg:overflow-visible",
          desktopControlsVisible ? "lg:pointer-events-auto lg:opacity-100" : "lg:pointer-events-none lg:opacity-0"
        )}
        data-pdf-hide="true"
        onMouseEnter={handleBlockMouseEnter}
        onMouseLeave={handleBlockMouseLeave}
      >
        <div className="relative" ref={addMenuRef}>
          <button
            type="button"
            onClick={() => {
              setShowAddMenu((current) => !current)
              setShowActionMenu(false)
            }}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-400 shadow-[0_8px_18px_rgba(15,23,42,0.06)] transition-colors lg:h-7 lg:w-7 lg:rounded-lg lg:border-transparent lg:bg-transparent lg:shadow-none",
              showAddMenu
                ? "bg-gray-100 text-[color:var(--rnest-accent)]"
                : "hover:bg-gray-100 hover:text-gray-600"
            )}
            title="아래에 새 블록 추가"
            aria-label="아래에 새 블록 추가"
            aria-expanded={showAddMenu}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          {showAddMenu && (
            <div className="absolute left-0 top-full z-40 mt-2 w-60 max-w-[calc(100vw-6rem)] rounded-2xl border border-gray-200 bg-white py-1.5 shadow-[0_18px_40px_rgba(15,23,42,0.14)]">
              <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-ios-muted">
                아래에 새 블록
              </div>
              <GroupedBlockTypeMenuContent
                availableTypes={inlineAddBlockTypes}
                currentType={block.type}
                intent="add"
                onSelect={(type) => {
                  if (type === "image" || type === "attachment" || type === "gallery") onInsertAsset(type)
                  else onAddAfter(type)
                  setShowAddMenu(false)
                }}
              />
            </div>
          )}
        </div>
        <div className="relative" ref={actionMenuRef}>
          <button
            type="button"
            onPointerDown={(event) => {
              if (event.button !== 0) return
              suppressActionClickRef.current = false
              actionGestureRef.current = {
                activeBlockId: block.id,
                pointerId: event.pointerId,
                pointerType: event.pointerType || "mouse",
                startX: event.clientX,
                startY: event.clientY,
              }
              clearActionHold()
              actionHoldTimerRef.current = setTimeout(() => {
                const gesture = actionGestureRef.current
                if (!gesture) return
                suppressActionClickRef.current = true
                setShowActionMenu(false)
                setShowAddMenu(false)
                onRequestReorderStart(gesture)
              }, (event.pointerType || "mouse") === "mouse" ? 180 : 260)
            }}
            onPointerMove={(event) => {
              const gesture = actionGestureRef.current
              if (!gesture || gesture.pointerId !== event.pointerId || suppressActionClickRef.current) return
              if (Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY) > 8) {
                clearActionHold()
              }
            }}
            onPointerUp={(event) => {
              if (actionGestureRef.current?.pointerId === event.pointerId) {
                clearActionHold()
                actionGestureRef.current = null
              }
            }}
            onPointerCancel={(event) => {
              if (actionGestureRef.current?.pointerId === event.pointerId) {
                clearActionHold()
                actionGestureRef.current = null
              }
            }}
            onClick={(event) => {
              clearActionHold()
              actionGestureRef.current = null
              if (suppressActionClickRef.current) {
                event.preventDefault()
                event.stopPropagation()
                suppressActionClickRef.current = false
                return
              }
              setShowActionMenu((current) => !current)
              setShowAddMenu(false)
            }}
            className={cn(
              "flex h-9 w-9 touch-none items-center justify-center rounded-xl border border-gray-100 bg-white/90 text-gray-300 shadow-[0_2px_8px_rgba(15,23,42,0.06)] transition-all duration-150 lg:h-7 lg:w-7 lg:rounded-lg lg:border-transparent lg:bg-transparent lg:shadow-none",
              showActionMenu
                ? "border-gray-200 bg-gray-50 text-[color:var(--rnest-accent)] shadow-[0_2px_8px_rgba(15,23,42,0.08)]"
                : "cursor-grab hover:border-gray-200 hover:bg-gray-50 hover:text-gray-500 active:cursor-grabbing active:scale-95"
            )}
            title="짧게 누르면 블록 설정, 길게 누르면 위치 이동"
            aria-label="짧게 누르면 블록 설정, 길게 누르면 위치 이동"
            aria-expanded={showActionMenu}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
          {showActionMenu && (
            <div className="absolute left-0 top-full z-40 mt-2 w-60 max-w-[calc(100vw-6rem)] rounded-2xl border border-gray-200 bg-white py-1.5 shadow-[0_18px_40px_rgba(15,23,42,0.14)]">
              <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-ios-muted">
                현재 블록 설정
              </div>
              <GroupedBlockTypeMenuContent
                availableTypes={inlineConvertBlockTypes}
                currentType={block.type}
                intent="convert"
                onSelect={(type) => {
                  onTypeChange(type)
                  setShowActionMenu(false)
                }}
              />
              <div className="mx-2 my-1 border-t border-gray-100" />
              <button
                type="button"
                onClick={() => {
                  onDuplicate()
                  setShowActionMenu(false)
                }}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-ios-text hover:bg-gray-50"
              >
                <Copy className="h-3.5 w-3.5" />
                블록 복제
              </button>
              {block.type !== "pageSpacer" && (
                <button
                  type="button"
                  onClick={() => {
                    onSendToNextPdfPage()
                    setShowActionMenu(false)
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-ios-text hover:bg-gray-50"
                >
                  <ArrowUpDown className="h-3.5 w-3.5" />
                  {startsNextPdfPage ? "다음 PDF 페이지 시작 해제" : "다음 PDF 페이지에서 시작"}
                </button>
              )}
              {!isFirst && (
                <button
                  type="button"
                  onClick={() => {
                    onMoveUp()
                    setShowActionMenu(false)
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-ios-text hover:bg-gray-50"
                >
                  ↑ 위로 이동
                </button>
              )}
              {!isLast && (
                <button
                  type="button"
                  onClick={() => {
                    onMoveDown()
                    setShowActionMenu(false)
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-ios-text hover:bg-gray-50"
                >
                  ↓ 아래로 이동
                </button>
              )}
              <div className="mx-2 my-1 border-t border-gray-100" />
              <div className="px-3 py-1.5">
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-ios-muted">
                  하이라이트
                </div>
                <div className="flex items-center gap-1.5">
                  {memoHighlightColors.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => {
                        onHighlight(block.highlight === color ? null : color)
                        setShowActionMenu(false)
                      }}
                      className={cn(
                        "h-6 w-6 rounded-full border-2 transition-transform hover:scale-110",
                        highlightDotMap[color],
                        block.highlight === color ? "border-gray-800 scale-110" : "border-transparent"
                      )}
                      title={highlightLabelMap[color]}
                    />
                  ))}
                  {block.highlight && (
                    <button
                      type="button"
                      onClick={() => {
                        onHighlight(null)
                        setShowActionMenu(false)
                      }}
                      className="flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 text-gray-400 hover:bg-gray-100"
                      title="하이라이트 제거"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
              <div className="mx-2 my-1 border-t border-gray-100" />
              {attachment && block.type === "attachment" && (
                <button
                  type="button"
                  onClick={() => {
                    onOpenAttachment()
                    setShowActionMenu(false)
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-ios-text hover:bg-gray-50"
                >
                  <Paperclip className="h-3.5 w-3.5" />
                  파일 열기
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (attachment) onRemoveAttachment()
                  else onDelete()
                  setShowActionMenu(false)
                }}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-red-500 hover:bg-red-50"
              >
                <Trash2 className="h-3.5 w-3.5" /> 삭제
              </button>
            </div>
          )}
        </div>
      </div>

      {/* block content */}
      <div className={cn("min-h-[1.6em] rounded-md transition-colors", block.highlight && highlightBgMap[block.highlight] ? `${highlightBgMap[block.highlight]} px-2 -mx-2 py-0.5` : "")}>
        {showSlashMenu && (
          <SlashMenu
            currentType={block.type}
            onSelectType={(type) => onTypeChange(type)}
            onDuplicate={onDuplicate}
            onClose={() => setShowSlashMenu(false)}
          />
        )}

        {block.type === "divider" && (
          <div className="py-3">
            <hr className="border-gray-200" />
          </div>
        )}

        {block.type === "heading" && (
          <NotebookRichTextField
            text={block.text}
            html={block.textHtml}
            placeholder="제목"
            ariaLabel="제목"
            className="text-[22px] font-bold tracking-[-0.02em] text-ios-text"
            onDuplicate={onDuplicate}
            onInsertBlankBlockBefore={onInsertBlankBefore}
            onBackspaceAtStart={onRemoveBlankBefore}
            onRequestSlashMenu={() => setShowSlashMenu(true)}
            onChange={(next) =>
              onChange({
                ...block,
                text: next.text,
                textHtml: next.html,
              })
            }
          />
        )}

        {block.type === "paragraph" && (
          <NotebookRichTextField
            text={block.text}
            html={block.textHtml}
            placeholder="내용을 입력하세요..."
            ariaLabel="문단"
            className={cn("leading-relaxed text-ios-text", mobileSafeBodyClass)}
            onDuplicate={onDuplicate}
            onInsertBlankBlockBefore={onInsertBlankBefore}
            onBackspaceAtStart={onRemoveBlankBefore}
            onRequestSlashMenu={() => setShowSlashMenu(true)}
            onChange={(next) =>
              onChange({
                ...block,
                text: next.text,
                textHtml: next.html,
              })
            }
          />
        )}

        {block.type === "bulleted" && (
          <div className="flex gap-2">
            <span className="mt-[7px] inline-flex shrink-0 items-center justify-center text-ios-sub">
              <svg viewBox="0 0 8 8" className="h-2.5 w-2.5 fill-current" aria-hidden="true">
                <circle cx="4" cy="4" r="2.2" />
              </svg>
            </span>
            <NotebookRichTextField
              text={block.text}
              html={block.textHtml}
              placeholder="목록 항목"
              ariaLabel="글머리 기호 항목"
              className={cn("leading-relaxed text-ios-text", mobileSafeBodyClass)}
              onDuplicate={onDuplicate}
              onInsertBlankBlockBefore={onInsertBlankBefore}
              onBackspaceAtStart={onRemoveBlankBefore}
              onRequestSlashMenu={() => setShowSlashMenu(true)}
              onChange={(next) =>
                onChange({
                  ...block,
                  text: next.text,
                  textHtml: next.html,
                })
              }
            />
          </div>
        )}

        {block.type === "numbered" && (
          <div className="flex gap-2">
            <span className="mt-[2px] shrink-0 text-[15px] leading-relaxed text-ios-sub">1.</span>
            <NotebookRichTextField
              text={block.text}
              html={block.textHtml}
              placeholder="번호 항목"
              ariaLabel="번호 목록 항목"
              className={cn("leading-relaxed text-ios-text", mobileSafeBodyClass)}
              onDuplicate={onDuplicate}
              onInsertBlankBlockBefore={onInsertBlankBefore}
              onBackspaceAtStart={onRemoveBlankBefore}
              onRequestSlashMenu={() => setShowSlashMenu(true)}
              onChange={(next) =>
                onChange({
                  ...block,
                  text: next.text,
                  textHtml: next.html,
                })
              }
            />
          </div>
        )}

        {block.type === "checklist" && (
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={() => onChange({ ...block, checked: !block.checked })}
              className={cn(
                "mt-[3px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border transition-colors",
                block.checked
                  ? "border-[color:var(--rnest-accent)] bg-[color:var(--rnest-accent)] text-white"
                  : "border-gray-300 bg-white hover:border-gray-400"
              )}
            >
              {block.checked && (
                <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                  <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
            <NotebookRichTextField
              text={block.text}
              html={block.textHtml}
              placeholder="할 일"
              ariaLabel="체크리스트 항목"
              className={cn(
                "leading-relaxed outline-none",
                mobileSafeBodyClass,
                block.checked ? "text-ios-muted line-through" : "text-ios-text"
              )}
              onDuplicate={onDuplicate}
              onInsertBlankBlockBefore={onInsertBlankBefore}
              onBackspaceAtStart={onRemoveBlankBefore}
              onRequestSlashMenu={() => setShowSlashMenu(true)}
              onChange={(next) =>
                onChange({
                  ...block,
                  text: next.text,
                  textHtml: next.html,
                })
              }
            />
          </div>
        )}

        {block.type === "callout" && (
          <div className="flex gap-3 rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
            <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--rnest-accent)]" />
            <NotebookRichTextField
              text={block.text}
              html={block.textHtml}
              placeholder="콜아웃 내용을 입력하세요"
              ariaLabel="콜아웃"
              className="leading-relaxed text-ios-text text-[16px] md:text-[14.5px]"
              onDuplicate={onDuplicate}
              onInsertBlankBlockBefore={onInsertBlankBefore}
              onBackspaceAtStart={onRemoveBlankBefore}
              onRequestSlashMenu={() => setShowSlashMenu(true)}
              onChange={(next) =>
                onChange({
                  ...block,
                  text: next.text,
                  textHtml: next.html,
                })
              }
            />
          </div>
        )}

        {block.type === "quote" && (
          <div className="flex gap-3 rounded-r-lg border-l-[3px] border-[color:var(--rnest-accent-border)] bg-[color:var(--rnest-accent-soft)]/45 px-4 py-3">
            <MessageSquareQuote className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--rnest-accent)]" />
            <NotebookRichTextField
              text={block.text}
              html={block.textHtml}
              placeholder="인용하거나 강조할 문장을 적어 두세요"
              ariaLabel="인용"
              className="leading-relaxed text-ios-text text-[16px] md:text-[14.5px]"
              onDuplicate={onDuplicate}
              onInsertBlankBlockBefore={onInsertBlankBefore}
              onBackspaceAtStart={onRemoveBlankBefore}
              onRequestSlashMenu={() => setShowSlashMenu(true)}
              onChange={(next) =>
                onChange({
                  ...block,
                  text: next.text,
                  textHtml: next.html,
                })
              }
            />
          </div>
        )}

        {block.type === "toggle" && (
          <div className="rounded-xl border border-gray-200 bg-white">
            <div className="flex items-center gap-2 px-3 py-2.5">
              <button
                type="button"
                onClick={() => onChange({ ...block, collapsed: !block.collapsed })}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-ios-sub transition-colors hover:bg-gray-100"
                aria-label={block.collapsed ? "토글 펼치기" : "토글 접기"}
              >
                {block.collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              <NotebookRichTextField
                text={block.text}
                html={block.textHtml}
                placeholder="토글 제목"
                ariaLabel="토글 제목"
                className={cn("font-medium text-ios-text", mobileSafeInputClass)}
                onDuplicate={onDuplicate}
                onInsertBlankBlockBefore={onInsertBlankBefore}
                onBackspaceAtStart={onRemoveBlankBefore}
                onRequestSlashMenu={() => setShowSlashMenu(true)}
                onChange={(next) =>
                  onChange({
                    ...block,
                    text: next.text,
                    textHtml: next.html,
                  })
                }
              />
            </div>
            {!block.collapsed && (
              <div className="border-t border-gray-100 px-4 py-3">
                <NotebookRichTextField
                  text={block.detailText}
                  html={block.detailTextHtml}
                  placeholder="토글 안쪽 내용을 입력하세요"
                  ariaLabel="토글 내용"
                  className={cn("leading-relaxed text-ios-text", mobileSafeInputClass)}
                  onDuplicate={onDuplicate}
                  onChange={(next) =>
                    onChange({
                      ...block,
                      detailText: next.text,
                      detailTextHtml: next.html,
                    })
                  }
                />
              </div>
            )}
          </div>
        )}

        {block.type === "bookmark" && (
          <div className="rounded-xl border border-gray-200 bg-white p-3">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[color:var(--rnest-accent-soft)] text-[color:var(--rnest-accent)]">
                <Link2 className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1 space-y-2">
                <input
                  type="url"
                  value={block.text ?? ""}
                  onChange={(e) => onChange({ ...block, text: e.target.value })}
                  onKeyDown={(event) => {
                    if (handleInsertBlankBeforeFromInput(event)) return
                    if (handleRemoveBlankBeforeFromInput(event)) return
                    handleCommandKeyDown(event)
                  }}
                  placeholder="https://example.com"
                  className={cn(
                    "w-full border-none bg-transparent font-medium text-ios-text outline-none placeholder:text-gray-300",
                    mobileSafeInputClass
                  )}
                />
                <NotebookRichTextField
                  text={block.detailText}
                  html={block.detailTextHtml}
                  placeholder="링크 제목 또는 메모"
                  ariaLabel="링크 제목 또는 메모"
                  className={cn("text-ios-sub", mobileSafeFineClass)}
                  enableSlashMenu={false}
                  onDuplicate={onDuplicate}
                  onChange={(next) =>
                    onChange({
                      ...block,
                      detailText: next.text,
                      detailTextHtml: next.html,
                    })
                  }
                />
                {getBookmarkMeta(block.text) ? (
                  <a
                    href={getBookmarkMeta(block.text)?.href ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-[12.5px] text-[color:var(--rnest-accent)] hover:underline"
                  >
                    {getBookmarkMeta(block.text)?.label}
                    <Link2 className="h-3.5 w-3.5" />
                  </a>
                ) : block.text ? (
                  <span className="inline-flex items-center gap-1.5 text-[12px] text-amber-600">
                    링크 형식을 확인하세요
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        )}

        {block.type === "code" && (
          <div className="rounded-2xl border border-slate-200 bg-slate-950 text-slate-100 shadow-[0_18px_40px_rgba(15,23,42,0.14)]">
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 px-3 py-2">
              <input
                type="text"
                value={block.language ?? "text"}
                onChange={(event) => onChange({ ...block, language: event.target.value || "text" })}
                onKeyDown={handleCommandKeyDown}
                placeholder="language"
                className="h-8 w-28 rounded-lg border border-slate-700 bg-slate-900 px-2 text-[12px] text-slate-100 outline-none placeholder:text-slate-500"
              />
              <button
                type="button"
                onClick={() => onChange({ ...block, wrap: block.wrap === false })}
                className={cn(
                  "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                  block.wrap === false
                    ? "bg-slate-800 text-slate-300"
                    : "bg-[color:var(--rnest-accent)]/15 text-[color:var(--rnest-accent)]"
                )}
              >
                {block.wrap === false ? "가로 스크롤" : "자동 줄바꿈"}
              </button>
            </div>
            <textarea
              value={block.code ?? ""}
              onChange={(event) => onChange({ ...block, code: event.target.value })}
              onKeyDown={handleEditorKeyDown}
              spellCheck={false}
              placeholder="코드를 입력하세요"
              className={cn(
                "min-h-[180px] w-full resize-y border-none bg-transparent px-4 py-3 font-mono text-[13px] leading-6 text-slate-100 outline-none placeholder:text-slate-500",
                block.wrap === false ? "whitespace-pre overflow-x-auto" : "whitespace-pre-wrap break-words"
              )}
            />
            <div className="border-t border-slate-800 px-3 py-2">
              <NotebookRichTextField
                text={block.detailText}
                html={block.detailTextHtml}
                placeholder="코드 설명"
                ariaLabel="코드 설명"
                className="text-[13px] text-slate-300"
                enableSlashMenu={false}
                onDuplicate={onDuplicate}
                onChange={(next) => onChange({ ...block, detailText: next.text, detailTextHtml: next.html })}
              />
            </div>
          </div>
        )}

        {block.type === "pageLink" && (
          <div className="rounded-2xl border border-[color:var(--rnest-accent-border)] bg-[color:var(--rnest-accent-soft)]/45 p-4 shadow-[0_14px_28px_rgba(123,111,208,0.08)]">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={block.targetDocId ?? ""}
                onChange={(event) => {
                  const nextDoc = allDocs.find((doc) => doc.id === event.target.value) ?? null
                  onChange({
                    ...block,
                    targetDocId: nextDoc?.id,
                    titleSnapshot: nextDoc ? nextDoc.title : block.titleSnapshot,
                    text: nextDoc ? nextDoc.title : block.text,
                  })
                }}
                className="min-w-[180px] rounded-xl border border-white/80 bg-white px-3 py-2 text-[13px] text-ios-text outline-none"
              >
                <option value="">문서 선택</option>
                {allDocs.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.title || "제목 없음"}
                  </option>
                ))}
              </select>
              {linkedDoc ? (
                <button
                  type="button"
                  onClick={() => onOpenDoc(linkedDoc.id)}
                  className="rounded-full border border-[color:var(--rnest-accent-border)] bg-white px-3 py-1.5 text-[12px] font-medium text-[color:var(--rnest-accent)] transition-colors hover:bg-[color:var(--rnest-accent-soft)]"
                >
                  문서 열기
                </button>
              ) : null}
            </div>
              <NotebookRichTextField
                text={block.titleSnapshot ?? block.text}
                html={undefined}
              placeholder="링크로 보일 제목"
              ariaLabel="문서 링크 제목"
                className="mt-3 text-[15px] font-semibold text-ios-text"
                enableSlashMenu={false}
                onDuplicate={onDuplicate}
                onInsertBlankBlockBefore={onInsertBlankBefore}
                onBackspaceAtStart={onRemoveBlankBefore}
                onChange={(next) =>
                onChange({
                  ...block,
                  titleSnapshot: next.text,
                  text: next.text,
                })
              }
            />
            <p className="mt-1 text-[12px] text-ios-muted">
              {linkedDoc ? `현재 연결: ${linkedDoc.title || "제목 없음"}` : "아직 연결된 문서가 없습니다"}
            </p>
          </div>
        )}

        {block.type === "embed" && (
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-[0_14px_28px_rgba(15,23,42,0.06)]">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="url"
                value={block.url ?? ""}
                onChange={(event) => {
                  const nextUrl = event.target.value
                  onChange({
                    ...block,
                    url: nextUrl,
                    text: block.titleSnapshot || nextUrl,
                    provider: detectNotebookEmbedProvider(nextUrl),
                  })
                }}
                onKeyDown={(event) => {
                  if (handleInsertBlankBeforeFromInput(event)) return
                  if (handleRemoveBlankBeforeFromInput(event)) return
                  handleCommandKeyDown(event)
                }}
                placeholder="https://"
                className={cn(
                  "min-w-[220px] flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-ios-text outline-none placeholder:text-gray-300",
                  mobileSafeInputClass
                )}
              />
              <span className="rounded-full bg-[color:var(--rnest-accent-soft)] px-2.5 py-1 text-[11px] font-medium text-[color:var(--rnest-accent)]">
                {detectNotebookEmbedProvider(block.url ?? "")}
              </span>
            </div>
            <NotebookRichTextField
              text={block.titleSnapshot}
              html={undefined}
              placeholder="미리보기 제목"
              ariaLabel="임베드 제목"
              className="mt-3 text-[14px] font-medium text-ios-text"
              enableSlashMenu={false}
              onDuplicate={onDuplicate}
              onInsertBlankBlockBefore={onInsertBlankBefore}
              onBackspaceAtStart={onRemoveBlankBefore}
              onChange={(next) =>
                onChange({
                  ...block,
                  titleSnapshot: next.text,
                  text: next.text || block.url,
                })
              }
            />
            {block.url ? (
              <a
                href={block.url}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 text-[12.5px] text-[color:var(--rnest-accent)] hover:underline"
              >
                외부 링크 열기
                <Link2 className="h-3.5 w-3.5" />
              </a>
            ) : null}
          </div>
        )}

        {block.type === "gallery" && (
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-[0_14px_28px_rgba(15,23,42,0.06)]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <NotebookRichTextField
                text={block.text}
                html={block.textHtml}
                placeholder="갤러리 제목"
                ariaLabel="갤러리 제목"
                className="min-w-[180px] flex-1 text-[15px] font-semibold text-ios-text"
                enableSlashMenu={false}
                onDuplicate={onDuplicate}
                onInsertBlankBlockBefore={onInsertBlankBefore}
                onBackspaceAtStart={onRemoveBlankBefore}
                onChange={(next) => onChange({ ...block, text: next.text, textHtml: next.html })}
              />
              <button
                type="button"
                onClick={() => onInsertAsset("gallery")}
                className="rounded-full border border-[color:var(--rnest-accent-border)] bg-white px-3 py-1.5 text-[12px] font-medium text-[color:var(--rnest-accent)] transition-colors hover:bg-[color:var(--rnest-accent-soft)]"
              >
                사진 추가
              </button>
            </div>
            {(block.attachmentIds?.length ?? 0) === 0 ? (
              <div className="mt-3 flex h-28 items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50 text-[13px] text-ios-muted">
                아직 추가된 사진이 없습니다
              </div>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-3">
                {(block.attachmentIds ?? []).map((attachmentId) => {
                  const galleryAttachment = docAttachments.find((item) => item.id === attachmentId) ?? null
                  return (
                    <div key={attachmentId} className="group relative overflow-hidden rounded-2xl border border-gray-100 bg-gray-50">
                      {galleryAttachment ? (
                        <img
                          src={buildNotebookFileUrl(galleryAttachment.storagePath)}
                          alt={galleryAttachment.name}
                          className="h-32 w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-32 items-center justify-center text-[12px] text-ios-muted">이미지 없음</div>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          onChange({
                            ...block,
                            attachmentIds: (block.attachmentIds ?? []).filter((id) => id !== attachmentId),
                          })
                        }
                        className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {block.type === "image" && (
          <ImageResizableBlock
            block={block}
            attachment={attachment}
            attachmentUrl={attachmentUrl}
            onChange={onChange}
            onKeyDown={handleCommandKeyDown}
          />
        )}

        {block.type === "attachment" && (
          <div className="rounded-[22px] border border-gray-200 bg-white p-4 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
            <div className="flex items-center gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[color:var(--rnest-accent-soft)] text-[color:var(--rnest-accent)]">
                {renderAttachmentIcon(attachment?.kind ?? "file", "h-5 w-5")}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium text-ios-text">{attachment?.name || "첨부 파일"}</p>
                <p className="mt-1 text-[12px] text-ios-muted">
                  {attachment ? `${formatFileSize(attachment.size)} · ${attachment.kind === "pdf" ? "PDF" : attachment.kind === "image" || attachment.kind === "scan" ? "이미지" : "파일"}` : "파일 정보를 불러오는 중"}
                </p>
              </div>
              <button
                type="button"
                onClick={onOpenAttachment}
                className="inline-flex items-center gap-1 rounded-full bg-[color:var(--rnest-accent-soft)] px-3 py-1.5 text-[12px] font-medium text-[color:var(--rnest-accent)] transition-colors hover:bg-[color:var(--rnest-accent-soft)]/80"
              >
                열기
              </button>
            </div>
            <NotebookRichTextField
              text={block.text}
              html={block.textHtml}
              placeholder="파일 메모를 입력하세요"
              ariaLabel="파일 메모"
              className={cn("mt-3 text-ios-sub", mobileSafeInputClass)}
              enableSlashMenu={false}
              onDuplicate={onDuplicate}
              onChange={(next) =>
                onChange({
                  ...block,
                  text: next.text,
                  textHtml: next.html,
                })
              }
            />
          </div>
        )}

        {block.type === "table" && (
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            {(() => {
              const table = upgradeMemoTableToV2(block.table)
              return (
                <>
                  <table className="w-full text-[13.5px]">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50">
                        {table.columns.map((column, columnIndex) => (
                          <th key={`col-${columnIndex}`} className="min-w-[180px] px-3 py-2 text-left font-medium text-ios-sub">
                            <div className="flex items-center gap-2">
                              <NotebookRichTextField
                                text={getMemoTableColumnText(table, columnIndex)}
                                html={table.columnHtml?.[columnIndex]}
                                placeholder={`열 ${columnIndex + 1}`}
                                ariaLabel={`표 ${columnIndex + 1}번째 헤더`}
                                className="font-medium text-ios-sub"
                                singleLine
                                enableSlashMenu={false}
                                onDuplicate={onDuplicate}
                                onChange={(next) => updateTableColumn(columnIndex, next)}
                              />
                              {table.columns.length > 2 && (
                                <button
                                  type="button"
                                  onClick={() => removeTableColumn(columnIndex)}
                                  className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          </th>
                        ))}
                        <th className="w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {table.rows.map((row) => (
                        <tr key={row.id} className="border-b border-gray-100 last:border-b-0">
                          {getMemoTableRowCells(row, table).map((cell, columnIndex) => (
                            <td key={`${row.id}-${columnIndex}`} className="px-3 py-2">
                              <NotebookRichTextField
                                text={cell.text}
                                html={cell.textHtml}
                                placeholder="..."
                                ariaLabel={`표 셀 ${columnIndex + 1}`}
                                className="text-ios-text"
                                enableSlashMenu={false}
                                onDuplicate={onDuplicate}
                                onChange={(next) => updateTableRowCell(row.id, columnIndex, next)}
                              />
                            </td>
                          ))}
                          <td className="px-1 py-2">
                            <button
                              type="button"
                              onClick={() =>
                                onChange({
                                  ...block,
                                  table: {
                                    ...table,
                                    rows: table.rows.filter((r) => r.id !== row.id),
                                  },
                                })
                              }
                              className="flex h-6 w-6 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="flex flex-wrap gap-2 border-t border-gray-100 px-3 py-2">
                    <button
                      type="button"
                      onClick={() =>
                        onChange({
                          ...block,
                          table: {
                            ...table,
                            rows: [
                              ...table.rows,
                              {
                                ...createMemoTableRow(),
                                cells: Array.from({ length: table.columns.length }, () => createMemoTableCell()),
                              },
                            ],
                          },
                        })
                      }
                      className="rounded-full border border-gray-200 px-3 py-1.5 text-[12px] font-medium text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                    >
                      + 새 행
                    </button>
                    {notebookFeatureFlags.tableV2 && table.columns.length < 8 && (
                      <button
                        type="button"
                        onClick={addTableColumn}
                        className="rounded-full border border-[color:var(--rnest-accent-border)] px-3 py-1.5 text-[12px] font-medium text-[color:var(--rnest-accent)] hover:bg-[color:var(--rnest-accent-soft)]"
                      >
                        + 새 열
                      </button>
                    )}
                  </div>
                </>
              )
            })()}
          </div>
        )}

        {block.type === "recordView" && (
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-[0_14px_28px_rgba(15,23,42,0.06)]">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={block.recordTemplateId ?? ""}
                onChange={(event) => onChange({ ...block, recordTemplateId: event.target.value || undefined })}
                className="min-w-[180px] rounded-xl border border-gray-200 bg-white px-3 py-2 text-[13px] text-ios-text outline-none"
              >
                <option value="">기록지 선택</option>
                {recordTemplates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </select>
              {recordTemplate ? (
                <button
                  type="button"
                  onClick={() => onQuickAddRecordEntry(recordTemplate.id)}
                  className="rounded-full border border-[color:var(--rnest-accent-border)] bg-white px-3 py-1.5 text-[12px] font-medium text-[color:var(--rnest-accent)] transition-colors hover:bg-[color:var(--rnest-accent-soft)]"
                >
                  빠른 추가
                </button>
              ) : null}
            </div>
            <NotebookRichTextField
              text={block.text}
              html={undefined}
              placeholder="기록 보기 제목"
              ariaLabel="기록 보기 제목"
              className="mt-3 text-[15px] font-semibold text-ios-text"
              enableSlashMenu={false}
              onDuplicate={onDuplicate}
              onInsertBlankBlockBefore={onInsertBlankBefore}
              onBackspaceAtStart={onRemoveBlankBefore}
              onChange={(next) => onChange({ ...block, text: next.text })}
            />
            {recordTemplate ? (
              <div className="mt-3 overflow-x-auto rounded-2xl border border-gray-100">
                <table className="w-full min-w-[420px] text-[12.5px]">
                  <thead className="bg-gray-50 text-ios-muted">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">제목</th>
                      {recordTemplate.fields
                        .filter((field) => !block.recordVisibleFieldIds || block.recordVisibleFieldIds.includes(field.id))
                        .slice(0, 3)
                        .map((field) => (
                          <th key={field.id} className="px-3 py-2 text-left font-medium">
                            {field.label}
                          </th>
                        ))}
                    </tr>
                  </thead>
                  <tbody>
                    {recordEntries.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-3 py-4 text-center text-ios-muted">
                          아직 연결된 기록이 없습니다
                        </td>
                      </tr>
                    ) : (
                      recordEntries.map((entry) => (
                        <tr key={entry.id} className="border-t border-gray-100">
                          <td className="px-3 py-2 font-medium text-ios-text">{entry.title}</td>
                          {recordTemplate.fields
                            .filter((field) => !block.recordVisibleFieldIds || block.recordVisibleFieldIds.includes(field.id))
                            .slice(0, 3)
                            .map((field) => (
                              <td key={field.id} className="px-3 py-2 text-ios-sub">
                                {recordFieldValueToText(entry.values[field.id]) || "-"}
                              </td>
                            ))}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="mt-3 rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-[13px] text-ios-muted">
                연결할 기록지를 선택하면 노트 안에서 최근 항목을 함께 볼 수 있습니다
              </div>
            )}
          </div>
        )}

        {block.type === "unsupported" && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
            현재 버전에서 편집할 수 없는 블록입니다. 타입: {block.unsupportedType || "unknown"}
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── add block button ────────────────────────────────────── */

function AddBlockButton({ onSelect }: { onSelect: (type: RNestMemoBlockType) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[13px] text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
      >
        <Plus className="h-4 w-4" />
        블록 추가
      </button>
      {open && (
        <BlockTypeMenu
          currentType="paragraph"
          onSelect={(type) => { onSelect(type); setOpen(false) }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  )
}

/* ─── tag inline editor ───────────────────────────────────── */

function InlineTagEditor({
  tags,
  onChange,
}: {
  tags: string[]
  onChange: (next: string[]) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  function handleAdd() {
    const next = draft.trim()
    if (!next || tags.includes(next)) { setDraft(""); return }
    onChange(sanitizeNotebookTags([...tags, next]))
    setDraft("")
  }

  function handleRemove(tag: string) {
    onChange(tags.filter((t) => t !== tag))
  }

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  if (!editing && tags.length === 0) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-[13px] text-gray-400 hover:text-gray-500"
      >
        태그 추가...
      </button>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-0.5 text-[12px] text-ios-sub"
        >
          #{tag}
          <button
            type="button"
            onClick={() => handleRemove(tag)}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); handleAdd() }
            if (e.key === "Escape") { setDraft(""); setEditing(false) }
            if (e.key === "Backspace" && !draft && tags.length > 0) {
              onChange(tags.slice(0, -1))
            }
          }}
          onBlur={() => { handleAdd(); if (!draft.trim()) setEditing(false) }}
          placeholder="태그 입력 후 Enter"
          className={cn("h-6 w-24 border-none bg-transparent text-ios-text outline-none placeholder:text-gray-300", mobileSafeFineClass)}
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="flex h-5 w-5 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-500"
        >
          <Plus className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}

/* ─── main component ──────────────────────────────────────── */

export function ToolNotebookPage() {
  const store = useAppStore()
  const memoState = store.memo
  const recordState = store.records

  const [query, setQuery] = useState("")
  const queryDeferred = useDeferredValue(query.trim().toLowerCase())
  const [activeMemoId, setActiveMemoId] = useState<string | null>(null)
  const [showIconPicker, setShowIconPicker] = useState(false)
  const [showCoverPicker, setShowCoverPicker] = useState(false)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [showCompactTools, setShowCompactTools] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pendingAssetTargetRef = useRef<{ docId: string; blockId: string; kind: "image" | "attachment" | "gallery" } | null>(null)
  const unlockKeysRef = useRef<Record<string, CryptoKey>>({})
  const [unlockedPayloads, setUnlockedPayloads] = useState<Record<string, RNestLockedMemoPayload>>({})
  const undoSnapshotsRef = useRef<Record<string, MemoUndoSnapshot[]>>({})
  const redoSnapshotsRef = useRef<Record<string, MemoUndoSnapshot[]>>({})
  const undoCaptureBlockedRef = useRef(false)
  const [undoVersion, setUndoVersion] = useState(0)
  const [lockDialogOpen, setLockDialogOpen] = useState(false)
  const [unlockDialogOpen, setUnlockDialogOpen] = useState(false)
  const [lockPassword, setLockPassword] = useState("")
  const [lockPasswordConfirm, setLockPasswordConfirm] = useState("")
  const [lockHint, setLockHint] = useState("")
  const [unlockPassword, setUnlockPassword] = useState("")
  const [lockBusy, setLockBusy] = useState(false)
  const [unlockBusy, setUnlockBusy] = useState(false)
  const [lockError, setLockError] = useState<string | null>(null)
  const [unlockError, setUnlockError] = useState<string | null>(null)

  // find & replace
  const [findOpen, setFindOpen] = useState(false)
  const [findQuery, setFindQuery] = useState("")
  const [replaceQuery, setReplaceQuery] = useState("")
  const [findMatchCount, setFindMatchCount] = useState(0)
  const findInputRef = useRef<HTMLInputElement>(null)

  // sort
  const [sortKey, setSortKey] = useState<MemoSortKey>("updatedAt")
  const [showSortMenu, setShowSortMenu] = useState(false)
  const [editingDocId, setEditingDocId] = useState<string | null>(null)
  const [pageTitleDraft, setPageTitleDraft] = useState("")
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null)
  const [folderNameDraft, setFolderNameDraft] = useState("")
  const [folderOpenState, setFolderOpenState] = useState<Record<string, boolean>>({})
  const [draggingDocId, setDraggingDocId] = useState<string | null>(null)
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null)
  const [dragOverParentDocId, setDragOverParentDocId] = useState<string | null>(null)
  const [dragOverRootPages, setDragOverRootPages] = useState(false)
  const [editorDropActive, setEditorDropActive] = useState(false)
  const [pdfExporting, setPdfExporting] = useState(false)
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false)
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [templateError, setTemplateError] = useState<string | null>(null)
  const [templateUiReady, setTemplateUiReady] = useState(false)
  const [timeUiReady, setTimeUiReady] = useState(false)
  const [personalTemplateDialogOpen, setPersonalTemplateDialogOpen] = useState(false)
  const [personalTemplateName, setPersonalTemplateName] = useState("")
  const [personalTemplateDescription, setPersonalTemplateDescription] = useState("")
  const [personalTemplateSource, setPersonalTemplateSource] = useState<"current" | "blank">("blank")
  const [personalTemplateCreateError, setPersonalTemplateCreateError] = useState<string | null>(null)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importTextValue, setImportTextValue] = useState("")
  const [importError, setImportError] = useState<string | null>(null)
  const [blockReorderState, setBlockReorderState] = useState<ActiveBlockReorderState | null>(null)
  const [pdfContentDensityMultiplier, setPdfContentDensityMultiplier] = useState(() => {
    if (typeof window === "undefined") return PDF_EXPORT_DEFAULT_CONTENT_DENSITY_MULTIPLIER
    return sanitizePdfContentDensityMultiplier(window.localStorage.getItem(PDF_EXPORT_CONTENT_DENSITY_STORAGE_KEY))
  })
  const [pdfViewMode, setPdfViewMode] = useState<PdfViewMode>("editor")
  const [pdfRenderState, setPdfRenderState] = useState<PdfRenderState>("idle")
  const [pdfPreviewDirty, setPdfPreviewDirty] = useState(false)
  const [pdfLayoutCacheKey, setPdfLayoutCacheKey] = useState<string | null>(null)
  const [pdfBitmapCacheKey, setPdfBitmapCacheKey] = useState<string | null>(null)
  const [pdfPreviewPages, setPdfPreviewPages] = useState<PdfPreviewPage[]>([])
  const [pdfPreviewError, setPdfPreviewError] = useState<string | null>(null)
  const [pdfExpectedPageCount, setPdfExpectedPageCount] = useState(0)
  const [pdfRenderProgress, setPdfRenderProgress] = useState({ completed: 0, total: 0 })
  const [pdfRenderedAt, setPdfRenderedAt] = useState<number | null>(null)
  const [availableTemplates, setAvailableTemplates] = useState<RNestMemoTemplate[]>(() =>
    defaultMemoTemplates.map((template) => sanitizeMemoTemplate(template))
  )
  const sortMenuRef = useRef<HTMLDivElement>(null)
  const pdfContentRef = useRef<HTMLDivElement>(null)
  const pdfRenderCacheRef = useRef<PdfRenderCacheEntry | null>(null)
  const pdfRenderJobIdRef = useRef(0)
  const pdfContentDensityRef = useRef(pdfContentDensityMultiplier)
  const blockNodesRef = useRef<Record<string, HTMLDivElement | null>>({})
  const blockReorderStateRef = useRef<ActiveBlockReorderState | null>(null)
  const blockReorderGestureRef = useRef<BlockReorderGesture | null>(null)
  const blockReorderCleanupRef = useRef<(() => void) | null>(null)
  const showPdfBreaks = pdfViewMode === "preview"
  const showingPdfPreview = pdfViewMode === "preview" && pdfPreviewPages.length > 0
  const pdfPreviewBusy = pdfRenderState === "layouting" || pdfRenderState === "rasterizing"
  const handlePdfContentDensityChange = useCallback((nextValue: number) => {
    const sanitized = sanitizePdfContentDensityMultiplier(nextValue)
    setPdfContentDensityMultiplier((current) => (Math.abs(current - sanitized) < 0.001 ? current : sanitized))
  }, [])

  useEffect(() => {
    if (!showSortMenu) return
    function handleClick(e: MouseEvent) {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) setShowSortMenu(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [showSortMenu])

  useEffect(() => {
    blockReorderStateRef.current = blockReorderState
  }, [blockReorderState])

  useEffect(() => {
    return () => {
      blockReorderCleanupRef.current?.()
      if (typeof document !== "undefined") {
        document.body.style.userSelect = ""
      }
    }
  }, [])

  // auto-close sidebar on phone/tablet on first mount
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setSidebarOpen(false)
    }
  }, [])

  // open specific memo passed via sessionStorage (e.g. from AI search "메모에 정리하기")
  useEffect(() => {
    if (typeof window === "undefined") return
    const pendingId = sessionStorage.getItem("rnest_notebook_open")
    if (!pendingId) return
    sessionStorage.removeItem("rnest_notebook_open")
    const doc = store.getState().memo.documents[pendingId]
    if (doc) {
      setActiveMemoId(pendingId)
      if (window.innerWidth >= 1024) setSidebarOpen(true)
    }
  }, [])
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 2200)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    setShowIconPicker(false)
    setShowCoverPicker(false)
    setShowMoreMenu(false)
    setShowCompactTools(false)
    setEditingDocId(null)
    setPageTitleDraft("")
  }, [activeMemoId])

  useEffect(() => {
    const folderId = activeMemoId ? memoState.documents[activeMemoId]?.folderId ?? null : null
    if (!folderId) return
    setFolderOpenState((current) => (current[folderId] === false ? { ...current, [folderId]: true } : current))
  }, [activeMemoId, memoState.documents])

  useEffect(() => {
    function clearUnlockedState() {
      unlockKeysRef.current = {}
      setUnlockedPayloads({})
    }

    function handleVisibilityChange() {
      if (document.hidden) clearUnlockedState()
    }

    window.addEventListener("pagehide", clearUnlockedState)
    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () => {
      window.removeEventListener("pagehide", clearUnlockedState)
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [])

  useEffect(() => {
    setTemplateUiReady(true)
    setTimeUiReady(true)
  }, [])

  const defaultTemplates = useMemo(
    () => defaultMemoTemplates.map((template) => sanitizeMemoTemplate(template)),
    []
  )

  const personalTemplates = useMemo(
    () => (memoState.personalTemplates ?? []).map((template) => sanitizeMemoTemplate(template)),
    [memoState.personalTemplates]
  )

  const personalTemplateIdSet = useMemo(
    () => new Set(personalTemplates.map((template) => template.id)),
    [personalTemplates]
  )

  const displayedTemplates = useMemo(
    () => {
      const seen = new Set<string>()
      const merged: RNestMemoTemplate[] = []
      const sharedTemplates = availableTemplates.length > 0 ? availableTemplates : defaultTemplates
      for (const template of [...personalTemplates, ...sharedTemplates]) {
        const normalized = sanitizeMemoTemplate(template)
        if (seen.has(normalized.id)) continue
        seen.add(normalized.id)
        merged.push(normalized)
      }
      return merged
    },
    [availableTemplates, defaultTemplates, personalTemplates]
  )

  const renderTemplates = templateUiReady ? displayedTemplates : defaultTemplates
  const formatUpdatedAtLabel = useCallback(
    (timestamp: number) => (timeUiReady ? relativeTime(timestamp) : formatNotebookDateTime(timestamp)),
    [timeUiReady]
  )

  const loadTemplates = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setTemplatesLoading(true)
    try {
      const authHeaders = await getBrowserAuthHeaders()
      const res = await fetch("/api/tools/notebook/templates", {
        method: "GET",
        headers: {
          "content-type": "application/json",
          ...authHeaders,
        },
        cache: "no-store",
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.ok || !Array.isArray(json?.templates)) {
        throw new Error(String(json?.error ?? `failed_to_load_templates:${res.status}`))
      }
      const nextTemplates = json.templates.map((template: RNestMemoTemplate) => sanitizeMemoTemplate(template))
      setAvailableTemplates(nextTemplates.length > 0 ? nextTemplates : defaultTemplates)
      setTemplateError(null)
      return nextTemplates
    } catch {
      if (!options?.silent) {
        setTemplateError("템플릿을 불러오지 못해 기본 템플릿으로 표시합니다")
      }
      return defaultTemplates
    } finally {
      if (!options?.silent) setTemplatesLoading(false)
    }
  }, [defaultTemplates])

  useEffect(() => {
    void loadTemplates({ silent: true })
  }, [loadTemplates])

  useEffect(() => {
    function handleFocus() {
      void loadTemplates({ silent: true })
    }

    function handleStorage(event: StorageEvent) {
      if (event.key !== NOTEBOOK_TEMPLATE_SYNC_EVENT_KEY) return
      void loadTemplates({ silent: true })
    }

    window.addEventListener("focus", handleFocus)
    window.addEventListener("storage", handleStorage)
    return () => {
      window.removeEventListener("focus", handleFocus)
      window.removeEventListener("storage", handleStorage)
    }
  }, [loadTemplates])

  /* ── derived lists ── */

  const allDocs = useMemo(
    () =>
      Object.values(memoState.documents)
        .filter((d): d is RNestMemoDocument => Boolean(d))
        .sort(sortByUpdated),
    [memoState.documents]
  )

  const allFolders = useMemo(
    () =>
      sortFoldersByName(
        Object.values(memoState.folders).filter((folder): folder is RNestMemoFolder => Boolean(folder))
      ),
    [memoState.folders]
  )

  const allRecordTemplates = useMemo(
    () => [
      ...builtinRecordTemplates,
      ...Object.values(recordState.templates).filter((template): template is RNestRecordTemplate => Boolean(template)),
    ],
    [recordState.templates]
  )

  const recordEntriesByTemplateId = useMemo(() => {
    const next: Record<string, RNestRecordEntry[]> = {}
    for (const entry of Object.values(recordState.entries).filter((item): item is RNestRecordEntry => Boolean(item))) {
      if (entry.trashedAt != null) continue
      if (!next[entry.templateId]) next[entry.templateId] = []
      next[entry.templateId].push(entry)
    }
    for (const templateId of Object.keys(next)) {
      next[templateId] = [...next[templateId]].sort((a, b) => b.updatedAt - a.updatedAt)
    }
    return next
  }, [recordState.entries])

  const activeDocs = useMemo(
    () => allDocs.filter((d) => d.trashedAt == null),
    [allDocs]
  )

  const renderedDocs = useMemo(() => {
    const next: Record<string, RNestMemoDocument> = {}
    for (const doc of allDocs) {
      next[doc.id] = unlockedPayloads[doc.id] ? applyLockedMemoPayload(doc, unlockedPayloads[doc.id]) : doc
    }
    return next
  }, [allDocs, unlockedPayloads])

  function getRenderableDoc(doc: RNestMemoDocument) {
    return renderedDocs[doc.id] ?? doc
  }

  const renderPageTree = useCallback(
    (nodes: MemoDocTreeNode[], listKey: string, depth = 0) =>
      nodes.map((node) => {
        const doc = node.doc
        return (
          <Fragment key={`${listKey}:${doc.id}`}>
            <PageItem
              doc={getRenderableDoc(doc)}
              summary={buildSummary(getRenderableDoc(doc))}
              isLocked={Boolean(doc.lock && !unlockedPayloads[doc.id])}
              listKey={listKey}
              depth={depth}
              isDropActive={dragOverParentDocId === doc.id}
              isActive={activeMemoId === doc.id}
              onClick={() => openMemo(doc.id)}
              draggable
              isDragging={draggingDocId === doc.id}
              onDragStart={(event) => handlePageDragStart(event, doc.id)}
              onDragEnd={handlePageDragEnd}
              onDragOver={(event) => {
                if (!draggingDocId || draggingDocId === doc.id) return
                event.preventDefault()
                event.dataTransfer.dropEffect = "move"
                setDragOverRootPages(false)
                setDragOverFolderId(doc.folderId ?? null)
                setDragOverParentDocId(doc.id)
              }}
              onDragLeave={(event) => {
                if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
                setDragOverParentDocId((current) => (current === doc.id ? null : current))
              }}
              onDrop={(event) => {
                event.preventDefault()
                const droppedDocId = event.dataTransfer.getData("text/plain") || draggingDocId
                if (droppedDocId) {
                  moveDocPlacement(droppedDocId, doc.folderId ?? null, doc.id)
                }
                handlePageDragEnd()
              }}
              className="px-2 py-1.5"
              isEditing={editingDocId === doc.id}
              draftTitle={editingDocId === doc.id ? pageTitleDraft : doc.title}
              onStartEdit={() => startPageRename(doc)}
              onDraftChange={setPageTitleDraft}
              onDraftCommit={() => commitPageRename(doc.id)}
              onDraftCancel={cancelPageRename}
              onTrash={() => trashMemo(doc.id)}
            />
            {node.children.length > 0 ? (
              <div className="space-y-1">
                {renderPageTree(node.children, listKey, depth + 1)}
              </div>
            ) : null}
          </Fragment>
        )
      }),
    [
      activeMemoId,
      dragOverParentDocId,
      draggingDocId,
      editingDocId,
      pageTitleDraft,
      unlockedPayloads,
      renderedDocs,
    ]
  )

  const pinnedDocs = useMemo(
    () => activeDocs.filter((d) => d.pinned),
    [activeDocs]
  )

  const rootDocs = useMemo(
    () => sortDocsByKey(activeDocs.filter((d) => !d.pinned && !d.folderId && !d.parentDocId), sortKey),
    [activeDocs, sortKey]
  )

  const rootDocTree = useMemo(
    () => buildMemoDocTree(activeDocs.filter((d) => !d.pinned && !d.folderId), sortKey),
    [activeDocs, sortKey]
  )

  const folderDocsByFolderId = useMemo(() => {
    const next: Record<string, RNestMemoDocument[]> = {}
    for (const folder of allFolders) next[folder.id] = []
    const sorted = sortDocsByKey(activeDocs.filter((d) => Boolean(d.folderId)), sortKey)
    for (const doc of sorted) {
      if (!doc.folderId || !next[doc.folderId]) continue
      next[doc.folderId].push(doc)
    }
    for (const folderId of Object.keys(next)) {
      next[folderId] = [...next[folderId]].sort(
        (a, b) => Number(b.pinned) - Number(a.pinned) || 0
      )
    }
    return next
  }, [activeDocs, allFolders, sortKey])

  const folderDocTreesByFolderId = useMemo(() => {
    const next: Record<string, MemoDocTreeNode[]> = {}
    for (const folder of allFolders) {
      next[folder.id] = buildMemoDocTree((folderDocsByFolderId[folder.id] ?? []).filter((doc) => doc.folderId === folder.id), sortKey)
    }
    return next
  }, [allFolders, folderDocsByFolderId, sortKey])

  const favoriteDocs = useMemo(
    () => activeDocs.filter((d) => d.favorite),
    [activeDocs]
  )

  const recentDocs = useMemo(() => {
    return memoState.recent
      .map((id) => activeDocs.find((doc) => doc.id === id) ?? null)
      .filter((doc): doc is RNestMemoDocument => Boolean(doc))
      .slice(0, 6)
  }, [activeDocs, memoState.recent])

  const trashedDocs = useMemo(
    () => allDocs.filter((d) => d.trashedAt != null),
    [allDocs]
  )

  const draggingDoc = useMemo(
    () => activeDocs.find((doc) => doc.id === draggingDocId) ?? null,
    [activeDocs, draggingDocId]
  )

  const searchResults = useMemo(() => {
    if (!queryDeferred) return null
    return activeDocs
      .filter((d) => buildMemoSearchText(renderedDocs[d.id] ?? d).includes(queryDeferred))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || sortByUpdated(a, b))
  }, [activeDocs, queryDeferred, renderedDocs])

  const activeMemoRaw = useMemo(
    () => allDocs.find((d) => d.id === activeMemoId) ?? null,
    [activeMemoId, allDocs]
  )

  const activeMemo = useMemo(
    () => (activeMemoRaw ? renderedDocs[activeMemoRaw.id] ?? activeMemoRaw : null),
    [activeMemoRaw, renderedDocs]
  )
  const activeMemoExportTags = useMemo(() => sanitizeNotebookTags(activeMemo?.tags ?? []), [activeMemo?.tags])

  const activeMemoIsLocked = Boolean(activeMemoRaw?.lock)
  const activeMemoIsUnlocked = Boolean(activeMemoRaw?.id && unlockedPayloads[activeMemoRaw.id])
  const canUseActiveMemoAsPersonalTemplate = Boolean(activeMemo && (!activeMemoRaw?.lock || activeMemoIsUnlocked))
  const currentTemplateWarningLabels = useMemo(() => {
    if (!activeMemo) return []
    const degradableTypes: RNestMemoBlockType[] = ["unsupported", "image", "attachment", "gallery", "pageLink", "recordView", "embed"]
    return Array.from(
      new Set(
        activeMemo.blocks
          .filter((block) => degradableTypes.includes(block.type))
          .map((block) => blockTypeLabels[block.type])
      )
    )
  }, [activeMemo])
  const canUndoActiveMemo = useMemo(() => {
    void undoVersion
    if (!activeMemoRaw) return false
    return (undoSnapshotsRef.current[activeMemoRaw.id]?.length ?? 0) > 0
  }, [activeMemoRaw, undoVersion])
  const canRestoreActiveMemo = useMemo(() => {
    void undoVersion
    if (!activeMemoRaw) return false
    return (redoSnapshotsRef.current[activeMemoRaw.id]?.length ?? 0) > 0
  }, [activeMemoRaw, undoVersion])
  const headingBlocks = useMemo(
    () =>
      activeMemo?.blocks.filter((block): block is RNestMemoBlock => block.type === "heading" && Boolean(getMemoBlockText(block))) ?? [],
    [activeMemo]
  )

  const restorePdfSnapshotFromCache = useCallback((snapshot: PdfRenderCacheEntry) => {
    setPdfPreviewPages(snapshot.pages)
    setPdfPreviewError(null)
    setPdfExpectedPageCount(snapshot.layout.pages.length)
    setPdfLayoutCacheKey(snapshot.layout.key)
    setPdfBitmapCacheKey(`${snapshot.layout.key}:${snapshot.pages.length}`)
    setPdfRenderProgress({ completed: snapshot.pages.length, total: snapshot.layout.pages.length })
    setPdfRenderedAt(snapshot.renderedAt)
    setPdfRenderState("ready")
  }, [])

  const resetPdfPreviewState = useCallback((options?: { clearCache?: boolean; clearPages?: boolean }) => {
    pdfRenderJobIdRef.current += 1
    if (options?.clearCache) {
      pdfRenderCacheRef.current = null
      setPdfPreviewDirty(false)
      setPdfRenderedAt(null)
      setPdfLayoutCacheKey(null)
      setPdfBitmapCacheKey(null)
    }
    if (options?.clearPages ?? options?.clearCache) {
      setPdfPreviewPages([])
    }
    setPdfPreviewError(null)
    setPdfExpectedPageCount(0)
    setPdfRenderProgress({ completed: 0, total: 0 })
    setPdfRenderState("idle")
  }, [])

  const runPdfRender = useCallback(
    async (options?: { force?: boolean }) => {
      if (!activeMemo || !pdfContentRef.current || typeof window === "undefined") return null
      const cachedSnapshot = pdfRenderCacheRef.current
      const canReuseCache =
        !options?.force &&
        !pdfPreviewDirty &&
        cachedSnapshot &&
        cachedSnapshot.docId === activeMemo.id &&
        cachedSnapshot.docUpdatedAt === activeMemo.updatedAt &&
        Math.abs(cachedSnapshot.contentDensityMultiplier - pdfContentDensityMultiplier) < 0.001

      if (canReuseCache) {
        restorePdfSnapshotFromCache(cachedSnapshot)
        return cachedSnapshot
      }

      const jobId = pdfRenderJobIdRef.current + 1
      pdfRenderJobIdRef.current = jobId
      setPdfPreviewError(null)
      setPdfPreviewPages([])
      setPdfExpectedPageCount(0)
      setPdfRenderProgress({ completed: 0, total: 0 })
      setPdfRenderState("layouting")
      await waitForDoublePaint()

      try {
        const snapshot = await renderPdfPages(pdfContentRef.current, {
          doc: activeMemo,
          contentDensityMultiplier: pdfContentDensityMultiplier,
          shouldCancel: () => pdfRenderJobIdRef.current !== jobId,
          onLayout: (layout) => {
            if (pdfRenderJobIdRef.current !== jobId) return
            setPdfRenderState("rasterizing")
            setPdfExpectedPageCount(layout.pages.length)
            setPdfLayoutCacheKey(layout.key)
            setPdfRenderProgress({ completed: 0, total: layout.pages.length })
          },
          onPageRendered: (page, completed, total) => {
            if (pdfRenderJobIdRef.current !== jobId) return
            setPdfPreviewPages((current) => [...current, page])
            setPdfRenderProgress({ completed, total })
          },
        })
        if (pdfRenderJobIdRef.current !== jobId) return null
        const cacheEntry: PdfRenderCacheEntry = {
          ...snapshot,
          docId: activeMemo.id,
          docUpdatedAt: activeMemo.updatedAt,
        }
        pdfRenderCacheRef.current = cacheEntry
        setPdfBitmapCacheKey(`${snapshot.layout.key}:${snapshot.pages.length}`)
        setPdfRenderedAt(snapshot.renderedAt)
        setPdfPreviewDirty(false)
        setPdfRenderState("ready")
        return cacheEntry
      } catch (error) {
        if (isPdfRenderCancelled(error)) {
          if (pdfRenderJobIdRef.current === jobId) {
            setPdfRenderState("idle")
          }
          return null
        }
        console.error("[NotebookPdfPreview] failed_to_render_preview", error)
        if (pdfRenderJobIdRef.current === jobId) {
          setPdfPreviewPages([])
          setPdfPreviewError("PDF 미리보기를 생성하지 못했습니다")
          setPdfRenderState("error")
        }
        return null
      }
    },
    [activeMemo, pdfContentDensityMultiplier, pdfPreviewDirty, restorePdfSnapshotFromCache]
  )

  const openPdfPreview = useCallback(
    async (options?: { force?: boolean }) => {
      if (!activeMemo) return
      setPdfViewMode("preview")
      const cachedSnapshot = pdfRenderCacheRef.current
      const shouldRender =
        options?.force ||
        !cachedSnapshot ||
        cachedSnapshot.docId !== activeMemo.id ||
        cachedSnapshot.docUpdatedAt !== activeMemo.updatedAt ||
        Math.abs(cachedSnapshot.contentDensityMultiplier - pdfContentDensityMultiplier) >= 0.001 ||
        pdfPreviewDirty

      if (!shouldRender) {
        restorePdfSnapshotFromCache(cachedSnapshot)
        return
      }
      await runPdfRender({ force: true })
    },
    [activeMemo, pdfContentDensityMultiplier, pdfPreviewDirty, restorePdfSnapshotFromCache, runPdfRender]
  )

  const closePdfPreview = useCallback(() => {
    pdfRenderJobIdRef.current += 1
    setPdfViewMode("editor")
    if (pdfRenderState !== "ready") {
      setPdfRenderState("idle")
    }
  }, [pdfRenderState])

  useEffect(() => {
    if (typeof window === "undefined") return
    window.localStorage.setItem(PDF_EXPORT_CONTENT_DENSITY_STORAGE_KEY, String(pdfContentDensityMultiplier))
  }, [pdfContentDensityMultiplier])

  useEffect(() => {
    const previousValue = pdfContentDensityRef.current
    if (Math.abs(previousValue - pdfContentDensityMultiplier) < 0.001) return
    pdfContentDensityRef.current = pdfContentDensityMultiplier
    pdfRenderCacheRef.current = null
    setPdfPreviewDirty(true)
    setPdfRenderedAt(null)
    setPdfLayoutCacheKey(null)
    setPdfBitmapCacheKey(null)
    setPdfPreviewError(null)
    if (showPdfBreaks && activeMemo) {
      void runPdfRender({ force: true })
    }
  }, [activeMemo, pdfContentDensityMultiplier, runPdfRender, showPdfBreaks])

  useEffect(() => {
    if (!activeMemo) {
      setPdfViewMode("editor")
      resetPdfPreviewState({ clearCache: true, clearPages: true })
    }
  }, [activeMemo, resetPdfPreviewState])

  useEffect(() => {
    setPdfViewMode("editor")
    resetPdfPreviewState({ clearCache: true, clearPages: true })
  }, [activeMemoId, resetPdfPreviewState])

  useEffect(() => {
    const cachedSnapshot = pdfRenderCacheRef.current
    if (!activeMemo || !cachedSnapshot) return
    if (cachedSnapshot.docId !== activeMemo.id) return
    if (cachedSnapshot.docUpdatedAt === activeMemo.updatedAt) return
    setPdfPreviewDirty(true)
    if (pdfViewMode === "preview") {
      setPdfPreviewError(null)
    }
  }, [activeMemo, pdfViewMode])

  useEffect(() => {
    if (typeof window === "undefined") return
    function handleResize() {
      const root = pdfContentRef.current
      const cachedSnapshot = pdfRenderCacheRef.current
      if (!root || !cachedSnapshot || !activeMemo) return
      if (cachedSnapshot.docId !== activeMemo.id) return
      const captureWidth = Math.max(
        1,
        Math.ceil(
          (getPdfObservedSource(root).getBoundingClientRect().width || root.clientWidth || 0) * pdfContentDensityMultiplier
        )
      )
      if (Math.abs(captureWidth - cachedSnapshot.captureWidth) >= 2) {
        setPdfPreviewDirty(true)
      }
    }
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [activeMemo, pdfContentDensityMultiplier])

  // Cmd+F / Ctrl+F to open find bar
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "f" && activeMemo) {
        e.preventDefault()
        setFindOpen(true)
        requestAnimationFrame(() => findInputRef.current?.focus())
      }
      if (e.key === "Escape" && findOpen) {
        setFindOpen(false)
        setFindQuery("")
        setReplaceQuery("")
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [activeMemo, findOpen])

  // compute match count
  useEffect(() => {
    if (!findQuery.trim() || !activeMemo) { setFindMatchCount(0); return }
    const q = findQuery.toLowerCase()
    let count = 0
    for (const block of activeMemo.blocks) {
      const text = memoBlockToPlainText(block).toLowerCase()
      let idx = 0
      while ((idx = text.indexOf(q, idx)) !== -1) { count++; idx += q.length }
    }
    setFindMatchCount(count)
  }, [findQuery, activeMemo])

  // auto-select first doc if none selected
  useEffect(() => {
    if (!activeMemoId && activeDocs.length > 0) {
      setActiveMemoId(activeDocs[0].id)
    }
  }, [activeMemoId, activeDocs])

  /* ── state operations ── */

  function commit(
    docs: Record<string, RNestMemoDocument | undefined>,
    recent?: string[],
    folders?: Record<string, RNestMemoFolder | undefined>,
    personalTemplates?: RNestMemoTemplate[]
  ) {
    const latestMemo = store.getState().memo
    store.setMemoState({
      folders: folders ?? latestMemo.folders,
      documents: docs,
      recent: recent ?? latestMemo.recent,
      personalTemplates: personalTemplates ?? latestMemo.personalTemplates ?? [],
    })
  }

  function getLatestMemoState() {
    return store.getState().memo
  }

  function updatePersonalTemplates(nextTemplates: RNestMemoTemplate[]) {
    const latestMemo = getLatestMemoState()
    commit(latestMemo.documents, latestMemo.recent, latestMemo.folders, nextTemplates)
    if (typeof window !== "undefined") {
      window.localStorage.setItem(NOTEBOOK_TEMPLATE_SYNC_EVENT_KEY, String(Date.now()))
    }
  }

  function clearUnlockSession(docId: string) {
    delete unlockKeysRef.current[docId]
    setUnlockedPayloads((current) => {
      if (!(docId in current)) return current
      const next = { ...current }
      delete next[docId]
      return next
    })
  }

  function cloneNotebookSnapshot<T>(value: T): T {
    if (typeof structuredClone === "function") {
      return structuredClone(value)
    }
    return JSON.parse(JSON.stringify(value)) as T
  }

  function buildMemoHistorySnapshot(docId: string, rawDoc: RNestMemoDocument): MemoUndoSnapshot {
    return {
      rawDoc: cloneNotebookSnapshot(rawDoc),
      unlockedPayload: unlockedPayloads[docId] ? cloneNotebookSnapshot(unlockedPayloads[docId]) : null,
    }
  }

  function pushHistorySnapshot(
    targetRef: MutableRefObject<Record<string, MemoUndoSnapshot[]>>,
    docId: string,
    snapshot: MemoUndoSnapshot
  ) {
    const current = targetRef.current[docId] ?? []
    targetRef.current[docId] = [...current.slice(-59), snapshot]
  }

  function pushUndoSnapshot(docId: string, rawDoc: RNestMemoDocument) {
    if (undoCaptureBlockedRef.current) return
    if (!activeMemoRaw || docId !== activeMemoRaw.id) return
    pushHistorySnapshot(undoSnapshotsRef, docId, buildMemoHistorySnapshot(docId, rawDoc))
    redoSnapshotsRef.current[docId] = []
    setUndoVersion((version) => version + 1)
  }

  function saveRawDoc(
    doc: RNestMemoDocument,
    options?: {
      touchRecent?: boolean
      touchUpdatedAt?: boolean
    }
  ) {
    const touchRecent = options?.touchRecent ?? true
    const touchUpdatedAt = options?.touchUpdatedAt ?? true
    const normalizedDoc = sanitizeMemoDocument(normalizeDocAttachments(doc))
    const next = touchUpdatedAt ? { ...normalizedDoc, updatedAt: Date.now() } : normalizedDoc
    const latestMemo = store.getState().memo
    const previousRawDoc = latestMemo.documents[next.id]
    if (previousRawDoc) {
      pushUndoSnapshot(next.id, previousRawDoc)
    }
    commit(
      { ...latestMemo.documents, [next.id]: next },
      touchRecent ? insertRecent(latestMemo.recent, next.id) : latestMemo.recent
    )
    return next
  }

  function openMemoDoc(docId: string) {
    if (!memoState.documents[docId]) return
    setActiveMemoId(docId)
    const latestMemo = getLatestMemoState()
    commit(latestMemo.documents, insertRecent(latestMemo.recent, docId), latestMemo.folders, latestMemo.personalTemplates)
  }

  function quickAddRecordEntry(templateId: string) {
    const customTemplates = Object.fromEntries(
      Object.values(recordState.templates)
        .filter((template): template is RNestRecordTemplate => Boolean(template))
        .map((template) => [template.id, template])
    )
    const template = resolveRecordTemplate(templateId, customTemplates)
    if (!template) {
      setToast("기록지를 찾을 수 없습니다")
      return
    }
    const latestRecords = store.getState().records
    const entry = createRecordEntryFromTemplate(template, {
      title: `${template.name} 기록`,
    })
    store.setRecordState({
      ...latestRecords,
      entries: {
        ...latestRecords.entries,
        [entry.id]: entry,
      },
      recent: [entry.id, ...(latestRecords.recent ?? []).filter((id) => id !== entry.id)].slice(0, 20),
    })
    setToast(`${template.name} 기록을 추가했습니다`)
  }

  async function cleanupAttachmentStoragePathsIfUnused(storagePaths: string[]) {
    const uniquePaths = Array.from(new Set(storagePaths.filter(Boolean)))
    if (uniquePaths.length === 0) return
    const latestDocuments = store.getState().memo.documents
    const removable = uniquePaths.filter((storagePath) => {
      return !Object.values(latestDocuments).some((doc) => doc && buildDocStoragePaths(doc).includes(storagePath))
    })
    if (removable.length > 0) {
      await deleteNotebookFiles(removable).catch(() => null)
    }
  }

  async function updateActiveMemoContent(
    updater: (doc: RNestMemoDocument) => RNestMemoDocument,
    options?: {
      touchRecent?: boolean
      touchUpdatedAt?: boolean
    }
  ) {
    if (!activeMemoRaw || !activeMemo) return null
    if (!activeMemoRaw.lock) {
      return saveRawDoc(updater(activeMemoRaw), options)
    }

    const sessionKey = unlockKeysRef.current[activeMemoRaw.id]
    const unlockedPayload = unlockedPayloads[activeMemoRaw.id]
    if (!sessionKey || !unlockedPayload) {
      setToast("잠금 해제 후 수정할 수 있습니다")
      setUnlockDialogOpen(true)
      return null
    }

    const nextEffective = updater(activeMemo)
    const nextPayload = createLockedMemoPayloadFromDocument(nextEffective)
    const nextEnvelope = await reencryptLockedMemoEnvelope(nextPayload, activeMemoRaw.lock, sessionKey)
    const nextRaw = createLockedMemoSnapshot(
      {
        ...nextEffective,
        lock: activeMemoRaw.lock,
      },
      nextEnvelope
    )
    const saved = saveRawDoc(nextRaw, options)
    setUnlockedPayloads((current) => ({ ...current, [activeMemoRaw.id]: nextPayload }))
    return saved
  }

  function undoActiveMemoChange() {
    if (!activeMemoRaw) return
    const currentSnapshots = undoSnapshotsRef.current[activeMemoRaw.id] ?? []
    const snapshot = currentSnapshots[currentSnapshots.length - 1]
    if (!snapshot) return

    pushHistorySnapshot(redoSnapshotsRef, activeMemoRaw.id, buildMemoHistorySnapshot(activeMemoRaw.id, activeMemoRaw))
    undoSnapshotsRef.current[activeMemoRaw.id] = currentSnapshots.slice(0, -1)
    undoCaptureBlockedRef.current = true
    try {
      saveRawDoc(snapshot.rawDoc, { touchRecent: false, touchUpdatedAt: false })
      if (snapshot.unlockedPayload && (!snapshot.rawDoc.lock || unlockKeysRef.current[snapshot.rawDoc.id])) {
        setUnlockedPayloads((current) => ({
          ...current,
          [snapshot.rawDoc.id]: cloneNotebookSnapshot(snapshot.unlockedPayload as RNestLockedMemoPayload),
        }))
      } else {
        clearUnlockSession(snapshot.rawDoc.id)
      }
      setToast("이전 상태로 되돌렸습니다")
    } finally {
      undoCaptureBlockedRef.current = false
      setUndoVersion((version) => version + 1)
    }
  }

  function restoreActiveMemoChange() {
    if (!activeMemoRaw) return
    const currentSnapshots = redoSnapshotsRef.current[activeMemoRaw.id] ?? []
    const snapshot = currentSnapshots[currentSnapshots.length - 1]
    if (!snapshot) return

    pushHistorySnapshot(undoSnapshotsRef, activeMemoRaw.id, buildMemoHistorySnapshot(activeMemoRaw.id, activeMemoRaw))
    redoSnapshotsRef.current[activeMemoRaw.id] = currentSnapshots.slice(0, -1)
    undoCaptureBlockedRef.current = true
    try {
      saveRawDoc(snapshot.rawDoc, { touchRecent: false, touchUpdatedAt: false })
      if (snapshot.unlockedPayload && (!snapshot.rawDoc.lock || unlockKeysRef.current[snapshot.rawDoc.id])) {
        setUnlockedPayloads((current) => ({
          ...current,
          [snapshot.rawDoc.id]: cloneNotebookSnapshot(snapshot.unlockedPayload as RNestLockedMemoPayload),
        }))
      } else {
        clearUnlockSession(snapshot.rawDoc.id)
      }
      setToast("원래 상태로 복구했습니다")
    } finally {
      undoCaptureBlockedRef.current = false
      setUndoVersion((version) => version + 1)
    }
  }

  async function openTemplatePicker() {
    setTemplateDialogOpen(true)
    setTemplateError(null)
    await loadTemplates()
  }

  function openPersonalTemplateCreator() {
    const defaultSource: "current" | "blank" = canUseActiveMemoAsPersonalTemplate ? "current" : "blank"
    const activeTitle = activeMemo ? getMemoDocumentTitle(activeMemo) : ""
    const suggestedBaseName = activeTitle || "내 템플릿"
    const existingNames = new Set(personalTemplates.map((template) => template.label.trim()).filter(Boolean))
    let suggestedName = suggestedBaseName
    if (existingNames.has(suggestedName)) {
      suggestedName = `${suggestedBaseName} ${personalTemplates.length + 1}`.slice(0, 40)
    }
    setPersonalTemplateName(suggestedName)
    setPersonalTemplateDescription(
      defaultSource === "current"
        ? "현재 페이지를 기반으로 만든 개인 템플릿입니다."
        : "직접 시작점을 만들 수 있는 개인 템플릿입니다."
    )
    setPersonalTemplateSource(defaultSource)
    setPersonalTemplateCreateError(null)
    setPersonalTemplateDialogOpen(true)
  }

  function createPersonalTemplate() {
    const nextLabel = personalTemplateName.trim()
    if (!nextLabel) {
      setPersonalTemplateCreateError("템플릿 이름을 입력해 주세요")
      return
    }

    const timestamp = Date.now()
    const baseTemplate =
      personalTemplateSource === "current" && canUseActiveMemoAsPersonalTemplate && activeMemo
        ? createMemoTemplateFromDocument(activeMemo, {
          id: createNotebookId("memo_template"),
          label: nextLabel,
          description: personalTemplateDescription.trim() || "현재 페이지를 기반으로 만든 개인 템플릿입니다.",
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        : sanitizeMemoTemplate({
          ...(defaultTemplates.find((template) => template.id === "blank") ?? defaultTemplates[0]),
          id: createNotebookId("memo_template"),
          label: nextLabel,
          description: personalTemplateDescription.trim() || "직접 시작점을 만들 수 있는 개인 템플릿입니다.",
          createdAt: timestamp,
          updatedAt: timestamp,
        })

    updatePersonalTemplates([baseTemplate, ...personalTemplates])
    setPersonalTemplateDialogOpen(false)
    setPersonalTemplateCreateError(null)
    setToast(
      personalTemplateSource === "current" && currentTemplateWarningLabels.length > 0
        ? "내 템플릿을 만들었습니다 · 일부 블록은 단순화되어 저장됩니다"
        : "내 템플릿을 만들었습니다"
    )
  }

  function removePersonalTemplate(templateId: string) {
    const target = personalTemplates.find((template) => template.id === templateId)
    if (!target) return
    if (typeof window !== "undefined") {
      const confirmed = window.confirm(`"${target.label}" 템플릿을 삭제할까요?`)
      if (!confirmed) return
    }
    updatePersonalTemplates(personalTemplates.filter((template) => template.id !== templateId))
    setToast("내 템플릿을 삭제했습니다")
  }

  function createMemoFromTemplateId(templateId = "blank") {
    const template = displayedTemplates.find((item) => item.id === templateId) ?? displayedTemplates[0]
    const doc = createMemoFromTemplate(template)
    const latestMemo = store.getState().memo
    commit({ ...latestMemo.documents, [doc.id]: doc }, insertRecent(latestMemo.recent, doc.id))
    setActiveMemoId(doc.id)
    setQuery("")
    setTemplateDialogOpen(false)

    if (template?.id === "quick") {
      // Auto-focus first block for quick memo — pure blank canvas feel
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const firstBlock = doc.blocks[0]
          if (!firstBlock) return
          const el = document.querySelector<HTMLElement>(`#memo-block-${firstBlock.id} [data-notebook-rich-input="true"]`)
          el?.focus()
        })
      })
      setToast("빠른 메모를 시작합니다")
    } else {
      setToast("새 페이지를 만들었습니다")
    }
  }

  function createFolder() {
    const latestMemo = getLatestMemoState()
    const timestamp = Date.now()
    const folder: RNestMemoFolder = {
      id: crypto.randomUUID(),
      name: "새 폴더",
      icon: "folder",
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    commit(latestMemo.documents, latestMemo.recent, {
      ...latestMemo.folders,
      [folder.id]: folder,
    })
    setFolderOpenState((current) => ({ ...current, [folder.id]: true }))
    setEditingFolderId(folder.id)
    setFolderNameDraft(folder.name)
    setToast("폴더를 만들었습니다")
  }

  function commitFolderRename(folderId: string) {
    const latestMemo = getLatestMemoState()
    const folder = latestMemo.folders[folderId]
    if (!folder) {
      setEditingFolderId(null)
      setFolderNameDraft("")
      return
    }
    const nextName = folderNameDraft.trim() || "새 폴더"
    commit(latestMemo.documents, latestMemo.recent, {
      ...latestMemo.folders,
      [folderId]: {
        ...folder,
        name: nextName,
        updatedAt: Date.now(),
      },
    })
    setEditingFolderId(null)
    setFolderNameDraft("")
  }

  function cancelFolderRename() {
    setEditingFolderId(null)
    setFolderNameDraft("")
  }

  function deleteFolder(folderId: string) {
    const latestMemo = getLatestMemoState()
    const folder = latestMemo.folders[folderId]
    if (!folder) return
    const nextFolders = { ...latestMemo.folders }
    delete nextFolders[folderId]
    const nextDocuments: Record<string, RNestMemoDocument | undefined> = { ...latestMemo.documents }
    for (const doc of Object.values(latestMemo.documents)) {
      if (!doc || doc.folderId !== folderId) continue
      nextDocuments[doc.id] = { ...doc, folderId: null, parentDocId: null }
    }
    commit(nextDocuments, latestMemo.recent, nextFolders)
    setFolderOpenState((current) => {
      if (!(folderId in current)) return current
      const next = { ...current }
      delete next[folderId]
      return next
    })
    if (editingFolderId === folderId) {
      cancelFolderRename()
    }
    setToast("폴더를 삭제하고 페이지를 바깥으로 이동했습니다")
  }

  function wouldCreateDocCycle(
    documents: Record<string, RNestMemoDocument | undefined>,
    movingDocId: string,
    nextParentDocId: string | null
  ) {
    let cursorId = nextParentDocId
    while (cursorId) {
      if (cursorId === movingDocId) return true
      const cursor = documents[cursorId]
      cursorId = cursor?.parentDocId ?? null
    }
    return false
  }

  function moveDocPlacement(docId: string, nextFolderId: string | null, nextParentDocId: string | null) {
    const latestMemo = getLatestMemoState()
    const doc = latestMemo.documents[docId]
    if (!doc) return

    const parentDoc = nextParentDocId ? latestMemo.documents[nextParentDocId] ?? null : null
    if (nextParentDocId && !parentDoc) return
    if (nextParentDocId && wouldCreateDocCycle(latestMemo.documents, docId, nextParentDocId)) {
      setToast("페이지를 자기 자신의 하위 페이지로 이동할 수 없습니다")
      return
    }

    const resolvedFolderId = parentDoc ? parentDoc.folderId ?? null : nextFolderId
    if (parentDoc && (parentDoc.folderId ?? null) !== resolvedFolderId) return
    if ((doc.folderId ?? null) === (resolvedFolderId ?? null) && (doc.parentDocId ?? null) === (nextParentDocId ?? null)) {
      return
    }
    const nextDocuments = { ...latestMemo.documents }
    const subtreeIds = collectDocSubtreeIds(latestMemo.documents, docId)
    for (const subtreeDocId of subtreeIds) {
      const subtreeDoc = latestMemo.documents[subtreeDocId]
      if (!subtreeDoc) continue
      if (subtreeDocId === docId) {
        nextDocuments[subtreeDocId] = {
          ...subtreeDoc,
          folderId: resolvedFolderId ?? null,
          parentDocId: nextParentDocId ?? null,
          updatedAt: Date.now(),
        }
        continue
      }
      nextDocuments[subtreeDocId] = {
        ...subtreeDoc,
        folderId: resolvedFolderId ?? null,
      }
    }
    commit(nextDocuments, latestMemo.recent, latestMemo.folders, latestMemo.personalTemplates)

    if (resolvedFolderId) {
      setFolderOpenState((current) => ({ ...current, [resolvedFolderId]: true }))
    }
    if (nextParentDocId) {
      setToast("하위 페이지로 이동했습니다")
    } else if (resolvedFolderId) {
      setToast("폴더에 페이지를 추가했습니다")
    } else {
      setToast("페이지를 폴더 밖으로 이동했습니다")
    }
  }

  function moveDocToFolder(docId: string, folderId: string | null) {
    const latestMemo = getLatestMemoState()
    if (folderId && !latestMemo.folders[folderId]) return
    moveDocPlacement(docId, folderId, null)
  }

  async function exportActiveMemoPdf() {
    if (!activeMemo || !pdfContentRef.current || typeof window === "undefined") return
    if (pdfExporting) return
    if (activeMemoRaw?.lock && !activeMemoIsUnlocked) {
      setToast("잠금 해제 후 PDF로 저장할 수 있습니다")
      return
    }

    setPdfExporting(true)
    setToast("PDF 저장을 준비하고 있습니다")
    try {
      const { jsPDF } = await import("jspdf")
      const cachedSnapshot = pdfRenderCacheRef.current
      const shouldReuseCache =
        !pdfPreviewDirty &&
        cachedSnapshot &&
        cachedSnapshot.docId === activeMemo.id &&
        cachedSnapshot.docUpdatedAt === activeMemo.updatedAt &&
        Math.abs(cachedSnapshot.contentDensityMultiplier - pdfContentDensityMultiplier) < 0.001
      const rendered = shouldReuseCache
        ? cachedSnapshot
        : await renderPdfPages(pdfContentRef.current, {
            doc: activeMemo,
            contentDensityMultiplier: pdfContentDensityMultiplier,
          })

      if (!shouldReuseCache) {
        const cacheEntry: PdfRenderCacheEntry = {
          ...rendered,
          docId: activeMemo.id,
          docUpdatedAt: activeMemo.updatedAt,
        }
        pdfRenderCacheRef.current = cacheEntry
        setPdfPreviewDirty(false)
        setPdfPreviewPages(rendered.pages)
        setPdfExpectedPageCount(rendered.layout.pages.length)
        setPdfLayoutCacheKey(rendered.layout.key)
        setPdfBitmapCacheKey(`${rendered.layout.key}:${rendered.pages.length}`)
        setPdfRenderedAt(rendered.renderedAt)
        setPdfRenderProgress({ completed: rendered.pages.length, total: rendered.layout.pages.length })
        setPdfRenderState("ready")
      }
      const pdf = new jsPDF({
        orientation: "portrait",
        unit: "pt",
        format: "a4",
        compress: true,
      })

      for (const [index, page] of rendered.pages.entries()) {
        if (index > 0) {
          pdf.addPage()
        }
        pdf.addImage(
          page.imageDataUrl,
          "PNG",
          PDF_EXPORT_MARGIN_PT,
          PDF_EXPORT_MARGIN_PT,
          rendered.contentWidth,
          page.renderedHeightPt,
          undefined,
          "FAST"
        )
      }

      pdf.save(`${createSafeDownloadName(activeMemo.title || "메모", "memo")}.pdf`)
      setToast("PDF 파일을 다운로드합니다")
    } catch {
      setToast("PDF 저장에 실패했습니다")
    } finally {
      setPdfExporting(false)
    }
  }

  function startPageRename(doc: RNestMemoDocument) {
    setEditingDocId(doc.id)
    setPageTitleDraft(getMemoDocumentTitle(doc))
  }

  function commitPageRename(docId: string) {
    const latestMemo = getLatestMemoState()
    const doc = latestMemo.documents[docId]
    if (!doc) {
      setEditingDocId(null)
      setPageTitleDraft("")
      return
    }
    saveRawDoc(
      {
        ...doc,
        title: pageTitleDraft,
        titleHtml: pageTitleDraft.trim() ? plainTextToRichHtml(pageTitleDraft) : "",
      },
      { touchRecent: false }
    )
    setEditingDocId(null)
    setPageTitleDraft("")
  }

  function cancelPageRename() {
    setEditingDocId(null)
    setPageTitleDraft("")
  }

  function handlePageDragStart(event: React.DragEvent<HTMLButtonElement>, docId: string) {
    setDraggingDocId(docId)
    event.dataTransfer.effectAllowed = "move"
    event.dataTransfer.setData("text/plain", docId)
  }

  function handlePageDragEnd() {
    setDraggingDocId(null)
    setDragOverFolderId(null)
    setDragOverParentDocId(null)
    setDragOverRootPages(false)
  }

  function duplicateMemo(doc: RNestMemoDocument) {
    const attachmentIdMap = new Map<string, string>()
    const duplicatedAttachments = doc.attachments.map((attachment) => {
      const nextId = crypto.randomUUID()
      attachmentIdMap.set(attachment.id, nextId)
      return {
        ...attachment,
        id: nextId,
      }
    })
    const next = sanitizeMemoDocument({
      ...doc,
      id: crypto.randomUUID(),
      title: `${doc.title} 복사`,
      titleHtml: "",
      pinned: false,
      favorite: false,
      trashedAt: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      attachments: duplicatedAttachments,
      attachmentStoragePaths: buildDocStoragePaths(doc),
      blocks: doc.blocks.map((block) => cloneMemoBlockForDuplicate(block, attachmentIdMap)),
    })
    const latestMemo = store.getState().memo
    commit({ ...latestMemo.documents, [next.id]: next }, insertRecent(latestMemo.recent, next.id))
    setActiveMemoId(next.id)
    setToast("페이지를 복제했습니다")
  }

  function trashMemo(id: string) {
    const latestMemo = getLatestMemoState()
    const doc = latestMemo.documents[id]
    if (!doc) return
    const trashedDoc = normalizeDocAttachments({ ...doc, trashedAt: Date.now(), favorite: false })
    const nextDocuments = { ...latestMemo.documents, [id]: trashedDoc }
    commit(nextDocuments, latestMemo.recent.filter((item) => item !== id))
    clearUnlockSession(id)
    if (activeMemoId === id) {
      const nextActive = Object.values(nextDocuments)
        .filter((item): item is RNestMemoDocument => item != null && item.trashedAt == null)
        .sort(sortByUpdated)[0]
      setActiveMemoId(nextActive?.id ?? null)
    }
    if (editingDocId === id) {
      cancelPageRename()
    }
    setToast("휴지통으로 이동했습니다")
  }

  function restoreMemo(id: string) {
    const latestMemo = getLatestMemoState()
    const doc = latestMemo.documents[id]
    if (!doc) return
    const restoredDoc = normalizeDocAttachments({ ...doc, trashedAt: null })
    commit(
      { ...latestMemo.documents, [id]: restoredDoc },
      insertRecent(latestMemo.recent, id)
    )
    setActiveMemoId(id)
    setToast("복구했습니다")
  }

  function deletePermanently(id: string) {
    const latestMemo = getLatestMemoState()
    const storagePaths = latestMemo.documents[id] ? buildDocStoragePaths(latestMemo.documents[id] as RNestMemoDocument) : []
    const next = { ...latestMemo.documents }
    delete next[id]
    commit(next, latestMemo.recent.filter((i) => i !== id))
    clearUnlockSession(id)
    void cleanupAttachmentStoragePathsIfUnused(storagePaths)
    if (activeMemoId === id) {
      const nextActive = Object.values(next)
        .filter((item): item is RNestMemoDocument => item != null && item.trashedAt == null)
        .sort(sortByUpdated)[0]
      setActiveMemoId(nextActive?.id ?? null)
    }
    if (editingDocId === id) {
      cancelPageRename()
    }
    setToast("영구 삭제했습니다")
  }

  function handleMoreAction(action: string) {
    if (!activeMemoRaw || !activeMemo) return
    switch (action) {
      case "find":
        setFindOpen(true)
        requestAnimationFrame(() => findInputRef.current?.focus())
        break
      case "pin":
        saveRawDoc(
          { ...activeMemoRaw, pinned: !activeMemoRaw.pinned },
          { touchRecent: false, touchUpdatedAt: false }
        )
        setToast(activeMemoRaw.pinned ? "핀 고정을 해제했습니다" : "상단에 고정했습니다")
        break
      case "favorite":
        saveRawDoc(
          { ...activeMemoRaw, favorite: !activeMemoRaw.favorite },
          { touchRecent: false, touchUpdatedAt: false }
        )
        break
      case "lock":
        setLockPassword("")
        setLockPasswordConfirm("")
        setLockHint(activeMemoRaw.lock?.hint ?? "")
        setLockError(null)
        setLockDialogOpen(true)
        break
      case "unlock":
        setUnlockPassword("")
        setUnlockError(null)
        setUnlockDialogOpen(true)
        break
      case "relock":
        clearUnlockSession(activeMemoRaw.id)
        setToast("메모를 다시 잠갔습니다")
        break
      case "remove-lock":
        void (async () => {
          const payload = unlockedPayloads[activeMemoRaw.id]
          if (!payload) {
            setToast("잠금 해제 후 잠금 제거가 가능합니다")
            setUnlockDialogOpen(true)
            return
          }
          const next = removeLockedMemoSnapshot(activeMemoRaw, payload)
          saveRawDoc(next, { touchRecent: false })
          clearUnlockSession(activeMemoRaw.id)
          setToast("잠금을 제거했습니다")
        })()
        break
      case "duplicate":
        duplicateMemo(activeMemoRaw)
        break
      case "import-text":
        if (activeMemoRaw.lock && !activeMemoIsUnlocked) {
          setToast("잠금 해제 후 가져올 수 있습니다")
          break
        }
        setImportError(null)
        setImportDialogOpen(true)
        break
      case "export-pdf":
        void exportActiveMemoPdf()
        break
      case "export-txt":
        if (activeMemoRaw.lock && !activeMemoIsUnlocked) {
          setToast("잠금 해제 후 내보낼 수 있습니다")
          break
        }
        downloadTextFile(`${activeMemo.title}.txt`, memoDocumentToPlainText(activeMemo), "text/plain;charset=utf-8")
        setToast("TXT 파일을 다운로드합니다")
        break
      case "export-md":
        if (activeMemoRaw.lock && !activeMemoIsUnlocked) {
          setToast("잠금 해제 후 내보낼 수 있습니다")
          break
        }
        downloadTextFile(`${activeMemo.title}.md`, memoDocumentToMarkdown(activeMemo), "text/markdown;charset=utf-8")
        setToast("Markdown 파일을 다운로드합니다")
        break
      case "trash":
        trashMemo(activeMemoRaw.id)
        break
      case "restore":
        restoreMemo(activeMemoRaw.id)
        break
      case "delete-permanent":
        deletePermanently(activeMemoRaw.id)
        break
    }
  }

  function openMemo(id: string) {
    setActiveMemoId(id)
    // close sidebar on phone/tablet
    if (typeof window !== "undefined" && window.innerWidth < 1024) setSidebarOpen(false)
  }

  async function confirmLockMemo() {
    if (!activeMemoRaw || !activeMemo) return
    if (lockPassword.trim().length < 4) {
      setLockError("잠금 암호는 4자 이상으로 입력해 주세요.")
      return
    }
    if (lockPassword !== lockPasswordConfirm) {
      setLockError("암호 확인이 일치하지 않습니다.")
      return
    }

    setLockBusy(true)
    setLockError(null)
    try {
      const { envelope, key, payload } = await createLockedMemoEnvelope(
        lockPassword,
        createLockedMemoPayloadFromDocument(activeMemo),
        lockHint
      )
      const next = createLockedMemoSnapshot(activeMemo, envelope)
      saveRawDoc(next, { touchRecent: false, touchUpdatedAt: false })
      unlockKeysRef.current[activeMemoRaw.id] = key
      setUnlockedPayloads((current) => ({ ...current, [activeMemoRaw.id]: payload }))
      setLockDialogOpen(false)
      setLockPassword("")
      setLockPasswordConfirm("")
      setLockHint("")
      setToast("잠금 메모를 설정했습니다")
    } catch (error) {
      setLockError(error instanceof Error ? error.message : "잠금 메모를 설정하지 못했습니다.")
    } finally {
      setLockBusy(false)
    }
  }

  async function confirmUnlockMemo() {
    if (!activeMemoRaw?.lock) return
    if (!unlockPassword.trim()) {
      setUnlockError("암호를 입력해 주세요.")
      return
    }

    setUnlockBusy(true)
    setUnlockError(null)
    try {
      const { key, payload } = await unlockLockedMemoEnvelope(unlockPassword, activeMemoRaw.lock)
      unlockKeysRef.current[activeMemoRaw.id] = key
      setUnlockedPayloads((current) => ({ ...current, [activeMemoRaw.id]: payload }))
      setUnlockDialogOpen(false)
      setUnlockPassword("")
      setToast("잠금 메모를 열었습니다")
    } catch (error) {
      setUnlockError(error instanceof Error ? error.message : "잠금 메모를 열지 못했습니다.")
    } finally {
      setUnlockBusy(false)
    }
  }

  function getDefaultBlockInsertTarget(doc: RNestMemoDocument, kind: "image" | "attachment" | "gallery") {
    const lastBlock = doc.blocks[doc.blocks.length - 1]
    return {
      docId: doc.id,
      blockId: lastBlock?.id ?? createMemoBlock("paragraph").id,
      kind,
    }
  }

  function resolveInsertKindFromFiles(files: File[]) {
    if (files.length === 0) return "attachment" as const
    const everyImage = files.every((file) => file.type.startsWith("image/"))
    if (!everyImage) return "attachment" as const
    return files.length > 1 ? ("gallery" as const) : ("image" as const)
  }

  async function appendImportedBlocks(rawValue: string, sourceLabel: string) {
    if (!activeMemo) return
    const importedBlocks = importTextToBlocks(rawValue)
    if (importedBlocks.length === 0) {
      setImportError("가져올 내용을 찾지 못했습니다")
      return
    }
    const canReplaceStarter =
      activeMemo.attachments.length === 0 &&
      activeMemo.blocks.length === 1 &&
      activeMemo.blocks[0]?.type === "paragraph" &&
      !getMemoBlockText(activeMemo.blocks[0]) &&
      !getMemoBlockDetailText(activeMemo.blocks[0])
    const remainingSlots = canReplaceStarter ? NOTEBOOK_IMPORT_BLOCK_LIMIT : Math.max(0, NOTEBOOK_IMPORT_BLOCK_LIMIT - activeMemo.blocks.length)
    const nextImportedBlocks = importedBlocks.slice(0, remainingSlots)
    if (nextImportedBlocks.length === 0) {
      setImportError("이 메모에는 더 이상 블록을 추가할 수 없습니다")
      return
    }
    await updateActiveMemoContent((doc) => {
      return {
        ...doc,
        blocks: canReplaceStarter ? nextImportedBlocks : [...doc.blocks, ...nextImportedBlocks],
      }
    })
    setImportDialogOpen(false)
    setImportError(null)
    setImportTextValue("")
    setToast(
      importedBlocks.length > nextImportedBlocks.length
        ? `${sourceLabel} ${nextImportedBlocks.length}개 블록만 가져왔습니다`
        : `${sourceLabel} ${nextImportedBlocks.length}개 블록으로 가져왔습니다`
    )
  }

  function beginAssetInsert(blockId: string, kind: "image" | "attachment" | "gallery") {
    if (!activeMemo) return
    pendingAssetTargetRef.current = { docId: activeMemo.id, blockId, kind }
    if (kind === "image" || kind === "gallery") {
      imageInputRef.current?.click()
    } else {
      fileInputRef.current?.click()
    }
  }

  async function insertUploadedAssetFiles(
    files: File[],
    kind: "image" | "attachment" | "gallery",
    targetOverride?: { docId: string; blockId: string; kind: "image" | "attachment" | "gallery" } | null
  ) {
    const target = targetOverride ?? pendingAssetTargetRef.current
    pendingAssetTargetRef.current = null
    if (files.length === 0 || !activeMemo || !target) return
    if (activeMemo.id !== target.docId) {
      setToast("메모가 바뀌어 업로드를 취소했습니다")
      return
    }

    const existingCount = activeMemo.attachments.length
    const available = Math.max(0, 10 - existingCount)
    if (available === 0) {
      setToast("첨부는 메모당 최대 10개까지 저장할 수 있습니다")
      return
    }

    const nextFiles = files.slice(0, available)
    const uploadedAttachments: RNestMemoAttachment[] = []
    let largeFileCount = 0
    let failedCount = 0

    for (const file of nextFiles) {
      if (file.size > 12 * 1024 * 1024) {
        largeFileCount += 1
        continue
      }
      try {
        const uploaded = await uploadNotebookFile(file, kind === "attachment" ? deriveAttachmentKind(file, "file") : deriveAttachmentKind(file, "image"))
        if ((uploaded.kind === "image" || uploaded.kind === "scan") && file.type.startsWith("image/")) {
          seedNotebookImagePreview(uploaded.storagePath, file)
        }
        uploadedAttachments.push(uploaded)
      } catch {
        failedCount += 1
      }
    }

    if (uploadedAttachments.length === 0) {
      setToast(largeFileCount > 0 ? "12MB 이하 파일만 첨부할 수 있습니다" : "파일 업로드에 실패했습니다")
      return
    }

    await updateActiveMemoContent((doc) => {
      const idx = doc.blocks.findIndex((block) => block.id === target.blockId)
      const insertAt = idx >= 0 ? idx + 1 : doc.blocks.length
      const nextBlocks = [...doc.blocks]
      if (kind === "gallery") {
        const targetBlock = nextBlocks[idx]
        if (targetBlock?.type === "gallery") {
          nextBlocks[idx] = {
            ...targetBlock,
            attachmentIds: Array.from(new Set([...(targetBlock.attachmentIds ?? []), ...uploadedAttachments.map((attachment) => attachment.id)])).slice(0, 8),
          }
        } else {
          nextBlocks.splice(
            insertAt,
            0,
            createMemoBlock("gallery", {
              text: "새 갤러리",
              attachmentIds: uploadedAttachments.map((attachment) => attachment.id),
            })
          )
        }
      } else {
        nextBlocks.splice(
          insertAt,
          0,
          ...uploadedAttachments.map((attachment) =>
            createMemoBlock(kind, {
              text: kind === "image" ? "" : attachment.name,
              attachmentId: attachment.id,
              mediaWidth: kind === "image" ? 100 : undefined,
              mediaOffsetX: kind === "image" ? 0 : undefined,
            })
          )
        )
      }
      return normalizeDocAttachments({
        ...doc,
        blocks: nextBlocks,
        attachments: [...doc.attachments, ...uploadedAttachments],
        attachmentStoragePaths: Array.from(
          new Set([...doc.attachmentStoragePaths, ...uploadedAttachments.map((attachment) => attachment.storagePath)])
        ),
      })
    })

    if (failedCount > 0) {
      setToast(`${uploadedAttachments.length}개 업로드, ${failedCount}개 실패`)
    } else {
      setToast(
        kind === "attachment"
          ? `파일 ${uploadedAttachments.length}개를 추가했습니다`
          : kind === "gallery"
            ? `갤러리에 사진 ${uploadedAttachments.length}개를 추가했습니다`
            : `사진 ${uploadedAttachments.length}개를 추가했습니다`
      )
    }
  }

  async function insertUploadedAssetBlocks(fileList: FileList | null, kind: "image" | "attachment" | "gallery") {
    await insertUploadedAssetFiles(Array.from(fileList ?? []), kind)
  }

  function handleEditorSurfacePaste(event: React.ClipboardEvent<HTMLDivElement>) {
    if (!activeMemo || draggingDocId || isEditableSurfaceTarget(event.target)) return

    const clipboardFiles = Array.from(event.clipboardData.files ?? [])
    if (clipboardFiles.length > 0) {
      const kind = resolveInsertKindFromFiles(clipboardFiles)
      event.preventDefault()
      void insertUploadedAssetFiles(
        clipboardFiles,
        kind,
        getDefaultBlockInsertTarget(activeMemo, kind)
      )
      return
    }

    const text = event.clipboardData.getData("text/plain").trim()
    if (!text) return
    event.preventDefault()
    void appendImportedBlocks(text, "붙여넣은 내용을")
  }

  function handleEditorSurfaceDragOver(event: React.DragEvent<HTMLDivElement>) {
    if (draggingDocId || isEditableSurfaceTarget(event.target)) return
    const hasFiles = event.dataTransfer.items && Array.from(event.dataTransfer.items).some((item) => item.kind === "file")
    const hasText = Array.from(event.dataTransfer.types ?? []).some((type) => type === "text/plain" || type === "text/uri-list")
    if (!hasFiles && !hasText) return
    event.preventDefault()
    event.dataTransfer.dropEffect = "copy"
    setEditorDropActive(true)
  }

  function handleEditorSurfaceDragLeave(event: React.DragEvent<HTMLDivElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
    setEditorDropActive(false)
  }

  function handleEditorSurfaceDrop(event: React.DragEvent<HTMLDivElement>) {
    setEditorDropActive(false)
    if (!activeMemo || draggingDocId || isEditableSurfaceTarget(event.target)) return

    const files = Array.from(event.dataTransfer.files ?? [])
    const rawText = event.dataTransfer.getData("text/plain") || event.dataTransfer.getData("text/uri-list")
    if (files.length === 0 && !rawText.trim()) return

    event.preventDefault()
    if (files.length > 0) {
      const kind = resolveInsertKindFromFiles(files)
      void insertUploadedAssetFiles(files, kind, getDefaultBlockInsertTarget(activeMemo, kind))
      return
    }
    void appendImportedBlocks(rawText, "드롭한 내용을")
  }

  async function removeAttachmentById(blockId: string, attachmentId: string) {
    if (!activeMemo) return
    const target = activeMemo.attachments.find((attachment) => attachment.id === attachmentId)
    if (!target) return

    const previousStoragePaths = buildDocStoragePaths(activeMemo)
    await updateActiveMemoContent((doc) => {
      return normalizeDocAttachments({
        ...doc,
        blocks: (() => {
          const nextBlocks = doc.blocks.filter((block) => block.id !== blockId)
          return nextBlocks.length > 0 ? nextBlocks : [createMemoBlock("paragraph")]
        })(),
      })
    })

    const nextDoc = store.getState().memo.documents[activeMemo.id]
    const nextStoragePaths = nextDoc ? buildDocStoragePaths(nextDoc as RNestMemoDocument) : []
    const removed = previousStoragePaths.filter((path) => !nextStoragePaths.includes(path))
    await cleanupAttachmentStoragePathsIfUnused(removed.length > 0 ? removed : [target.storagePath])
    setToast("첨부를 제거했습니다")
  }

  async function openAttachment(attachment: RNestMemoAttachment) {
    try {
      const url = await loadNotebookFileAccessUrl(attachment.storagePath)
      window.open(url, "_blank", "noopener,noreferrer")
    } catch {
      const fallbackUrl = buildNotebookFileUrl(attachment.storagePath)
      window.open(fallbackUrl, "_blank", "noopener,noreferrer")
    }
  }

  /* ── block operations ── */

  function updateBlock(blockId: string, next: RNestMemoBlock) {
    if (!activeMemo) return
    void updateActiveMemoContent((doc) => ({
      ...doc,
      blocks: doc.blocks.map((b) => (b.id === blockId ? next : b)),
    }))
  }

  function changeBlockType(blockId: string, newType: RNestMemoBlockType) {
    if (!activeMemo) return
    const previousStoragePaths = buildDocStoragePaths(activeMemo)
    void updateActiveMemoContent((doc) =>
      normalizeDocAttachments({
        ...doc,
        blocks: doc.blocks.map((b) => (b.id === blockId ? coerceMemoBlockType(b, newType) : b)),
      })
    ).then(() => {
      const nextDoc = store.getState().memo.documents[activeMemo.id]
      const nextStoragePaths = nextDoc ? buildDocStoragePaths(nextDoc as RNestMemoDocument) : []
      const removed = previousStoragePaths.filter((path) => !nextStoragePaths.includes(path))
      void cleanupAttachmentStoragePathsIfUnused(removed)
    })
  }

  function deleteBlock(blockId: string) {
    if (!activeMemo) return
    const previousStoragePaths = buildDocStoragePaths(activeMemo)
    void updateActiveMemoContent((doc) =>
      normalizeDocAttachments({
        ...doc,
        blocks: (() => {
          const next = doc.blocks.filter((b) => b.id !== blockId)
          return next.length ? next : [createMemoBlock("paragraph")]
        })(),
      })
    ).then(() => {
      const nextDoc = store.getState().memo.documents[activeMemo.id]
      const nextStoragePaths = nextDoc ? buildDocStoragePaths(nextDoc as RNestMemoDocument) : []
      const removed = previousStoragePaths.filter((path) => !nextStoragePaths.includes(path))
      void cleanupAttachmentStoragePathsIfUnused(removed)
    })
  }

  function addBlockAfter(blockId: string, type: RNestMemoBlockType = "paragraph") {
    if (!activeMemo) return
    void updateActiveMemoContent((doc) => ({
      ...doc,
      blocks: (() => {
        const idx = doc.blocks.findIndex((b) => b.id === blockId)
        if (idx === -1) return doc.blocks
        const next = [...doc.blocks]
        next.splice(idx + 1, 0, createMemoBlock(type))
        return next
      })(),
    }))
  }

  function insertBlankSpaceBefore(blockId: string) {
    if (!activeMemo) return
    void updateActiveMemoContent((doc) => ({
      ...doc,
      blocks: (() => {
        const idx = doc.blocks.findIndex((block) => block.id === blockId)
        if (idx === -1) return doc.blocks
        const next = [...doc.blocks]
        const { blankSpaceBlock, insertIndex, startsNextPdfPage } = getLeadingSpacerInfo(next, idx)
        if (blankSpaceBlock) {
          return next.map((entry) =>
            entry.id === blankSpaceBlock.id
              ? {
                  ...entry,
                  spacerHeight: getBlankSpaceUnits(entry) + 1,
                }
              : entry
          )
        }
        const blankSpacer = createMemoBlock("pageSpacer", {
          spacerMode: "blank-space",
          spacerHeight: 1,
        })
        next.splice(startsNextPdfPage ? insertIndex + 1 : insertIndex, 0, blankSpacer)
        return next
      })(),
    }))
  }

  function removeBlankSpaceBefore(blockId: string) {
    if (!activeMemo) return false
    const currentIndex = activeMemo.blocks.findIndex((block) => block.id === blockId)
    if (currentIndex === -1) return false
    if (!getLeadingSpacerInfo(activeMemo.blocks, currentIndex).blankSpaceBlock) return false
    void updateActiveMemoContent((doc) => ({
      ...doc,
      blocks: (() => {
        const idx = doc.blocks.findIndex((block) => block.id === blockId)
        if (idx === -1) return doc.blocks
        const next = [...doc.blocks]
        const { blankSpaceBlock } = getLeadingSpacerInfo(next, idx)
        if (!blankSpaceBlock) return doc.blocks
        const units = getBlankSpaceUnits(blankSpaceBlock)
        if (units <= 1) {
          return next.filter((entry) => entry.id !== blankSpaceBlock.id)
        }
        return next.map((entry) =>
          entry.id === blankSpaceBlock.id
            ? {
                ...entry,
                spacerHeight: units - 1,
              }
            : entry
        )
      })(),
    }))
    return true
  }

  function ensureNextPageSpacerBefore(blockId: string, options?: { quiet?: boolean }) {
    if (!activeMemo) return
    const currentIndex = activeMemo.blocks.findIndex((block) => block.id === blockId)
    if (currentIndex === -1) return
    const { startsNextPdfPage } = getLeadingSpacerInfo(activeMemo.blocks, currentIndex)
    if (startsNextPdfPage) return
    void updateActiveMemoContent((doc) => ({
      ...doc,
      blocks: (() => {
        const idx = doc.blocks.findIndex((b) => b.id === blockId)
        if (idx === -1) return doc.blocks
        const next = [...doc.blocks]
        const { insertIndex } = getLeadingSpacerInfo(next, idx)
        next.splice(
          insertIndex,
          0,
          createMemoBlock("pageSpacer", {
            spacerMode: "next-page",
            spacerHeight: 0,
          })
        )
        return next
      })(),
    }))
    if (!options?.quiet) setToast("다음 PDF 페이지 시작 블록을 추가했습니다")
  }

  function removeNextPageSpacerBefore(blockId: string, options?: { quiet?: boolean }) {
    if (!activeMemo) return
    const currentIndex = activeMemo.blocks.findIndex((block) => block.id === blockId)
    if (currentIndex === -1) return
    const { startsNextPdfPage } = getLeadingSpacerInfo(activeMemo.blocks, currentIndex)
    if (!startsNextPdfPage) return
    void updateActiveMemoContent((doc) => ({
      ...doc,
      blocks: (() => {
        const idx = doc.blocks.findIndex((entry) => entry.id === blockId)
        if (idx === -1) return doc.blocks
        const next = [...doc.blocks]
        for (let cursor = idx - 1; cursor >= 0 && next[cursor]?.type === "pageSpacer"; cursor -= 1) {
          if (isNextPageSpacer(next[cursor])) {
            next.splice(cursor, 1)
            break
          }
        }
        return next
      })(),
    }))
    if (!options?.quiet) setToast("다음 PDF 페이지 시작을 해제했습니다")
  }

  function toggleNextPageSpacerBefore(blockId: string) {
    if (!activeMemo) return
    const currentIndex = activeMemo.blocks.findIndex((block) => block.id === blockId)
    if (currentIndex === -1) return
    if (getLeadingSpacerInfo(activeMemo.blocks, currentIndex).startsNextPdfPage) {
      removeNextPageSpacerBefore(blockId)
      return
    }
    ensureNextPageSpacerBefore(blockId)
  }

  function moveBlock(blockId: string, direction: "up" | "down") {
    if (!activeMemo) return
    void updateActiveMemoContent((doc) => ({
      ...doc,
      blocks: (() => {
        const idx = doc.blocks.findIndex((b) => b.id === blockId)
        if (idx === -1) return doc.blocks
        const swap = direction === "up" ? idx - 1 : idx + 1
        if (swap < 0 || swap >= doc.blocks.length) return doc.blocks
        const next = [...doc.blocks]
        const temp = next[swap]
        next[swap] = next[idx]
        next[idx] = temp
        return next
      })(),
    }))
  }

  function duplicateBlock(blockId: string) {
    if (!activeMemo) return
    void updateActiveMemoContent((doc) => ({
      ...doc,
      blocks: (() => {
        const idx = doc.blocks.findIndex((b) => b.id === blockId)
        if (idx === -1) return doc.blocks
        const block = doc.blocks[idx]
        const duplicate = cloneMemoBlockForDuplicate(block)
        const next = [...doc.blocks]
        next.splice(idx + 1, 0, duplicate)
        return next
      })(),
    }))
    setToast("블록을 복제했습니다")
  }

  function appendBlock(type: RNestMemoBlockType) {
    if (!activeMemo) return
    void updateActiveMemoContent((doc) => ({
      ...doc,
      blocks: [...doc.blocks, createMemoBlock(type)],
    }))
  }

  function appendTemplateBundle(templateId: (typeof quickInsertTemplates)[number]["id"]) {
    if (!activeMemo) return
    const template = quickInsertTemplates.find((item) => item.id === templateId)
    if (!template) return
    void updateActiveMemoContent((doc) => ({
      ...doc,
      blocks: [...doc.blocks, ...template.createBlocks()],
    }))
    setToast(`${template.label} 구성을 추가했습니다`)
  }

  function cleanupBlockReorderSession() {
    blockReorderCleanupRef.current?.()
    blockReorderCleanupRef.current = null
    blockReorderGestureRef.current = null
    blockReorderStateRef.current = null
    if (typeof document !== "undefined") {
      document.body.style.userSelect = ""
    }
  }

  function getBlockDropTarget(blocks: RNestMemoBlock[], clientY: number) {
    const entries = blocks
      .map((block) => {
        const node = blockNodesRef.current[block.id]
        if (!node) return null
        return { blockId: block.id, rect: node.getBoundingClientRect() }
      })
      .filter((entry): entry is { blockId: string; rect: DOMRect } => Boolean(entry))

    if (entries.length === 0) return null

    for (const entry of entries) {
      const midpoint = entry.rect.top + entry.rect.height / 2
      if (clientY < midpoint) {
        return { overBlockId: entry.blockId, placement: "before" as BlockDropPlacement }
      }
    }

    return {
      overBlockId: entries[entries.length - 1].blockId,
      placement: "after" as BlockDropPlacement,
    }
  }

  function reorderBlocks(
    blocks: RNestMemoBlock[],
    activeBlockId: string,
    overBlockId: string,
    placement: BlockDropPlacement
  ) {
    const fromIndex = blocks.findIndex((block) => block.id === activeBlockId)
    const overIndex = blocks.findIndex((block) => block.id === overBlockId)
    if (fromIndex === -1 || overIndex === -1) return blocks

    const next = [...blocks]
    const [moved] = next.splice(fromIndex, 1)
    let insertIndex = placement === "before" ? overIndex : overIndex + 1
    if (fromIndex < insertIndex) insertIndex -= 1
    insertIndex = Math.max(0, Math.min(insertIndex, next.length))
    next.splice(insertIndex, 0, moved)
    return next
  }

  function startBlockReorder(gesture: BlockReorderGesture) {
    if (!activeMemo) return

    cleanupBlockReorderSession()
    const initialTarget = getBlockDropTarget(activeMemo.blocks, gesture.startY) ?? {
      overBlockId: gesture.activeBlockId,
      placement: "after" as BlockDropPlacement,
    }
    const initialState: ActiveBlockReorderState = {
      ...gesture,
      overBlockId: initialTarget.overBlockId,
      placement: initialTarget.placement,
      offsetY: 0,
    }
    blockReorderGestureRef.current = gesture
    setShowMoreMenu(false)
    blockReorderStateRef.current = initialState
    setBlockReorderState(initialState)
    if (typeof document !== "undefined") {
      document.body.style.userSelect = "none"
    }

    const handlePointerMove = (event: PointerEvent) => {
      const session = blockReorderGestureRef.current
      if (!session || event.pointerId !== session.pointerId) return
      event.preventDefault()

      if (typeof window !== "undefined") {
        if (event.clientY < 96) window.scrollBy(0, -18)
        else if (event.clientY > window.innerHeight - 96) window.scrollBy(0, 18)
      }

      const nextTarget = getBlockDropTarget(activeMemo.blocks, event.clientY)
      setBlockReorderState((current) => {
        const nextState =
          current && current.activeBlockId === session.activeBlockId
            ? {
              ...current,
              offsetY: event.clientY - session.startY,
              overBlockId: nextTarget?.overBlockId ?? current.overBlockId,
              placement: nextTarget?.placement ?? current.placement,
            }
            : current
        blockReorderStateRef.current = nextState
        return nextState
      }
      )
    }

    const handlePointerEnd = (event: PointerEvent) => {
      const session = blockReorderGestureRef.current
      if (!session || event.pointerId !== session.pointerId) return

      const currentState = blockReorderStateRef.current
      cleanupBlockReorderSession()
      blockReorderStateRef.current = null
      setBlockReorderState(null)

      if (!currentState) return
      const reordered = reorderBlocks(
        activeMemo.blocks,
        currentState.activeBlockId,
        currentState.overBlockId,
        currentState.placement
      )
      const changed = reordered.some((block, index) => block.id !== activeMemo.blocks[index]?.id)
      if (!changed) return

      void updateActiveMemoContent((doc) => ({
        ...doc,
        blocks: reorderBlocks(doc.blocks, currentState.activeBlockId, currentState.overBlockId, currentState.placement),
      }))
      setToast("블록 순서를 바꿨습니다")
    }

    window.addEventListener("pointermove", handlePointerMove, { passive: false })
    window.addEventListener("pointerup", handlePointerEnd)
    window.addEventListener("pointercancel", handlePointerEnd)
    blockReorderCleanupRef.current = () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerEnd)
      window.removeEventListener("pointercancel", handlePointerEnd)
    }
  }

  function jumpToBlock(blockId: string) {
    if (typeof document === "undefined") return
    document.getElementById(`memo-block-${blockId}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  /* ── find & replace ── */

  function handleFindReplace() {
    if (!activeMemo || !findQuery.trim()) return
    const q = findQuery
    let replaced = 0
    void updateActiveMemoContent((doc) => {
      const nextBlocks = doc.blocks.map((block) => {
        const next = replaceBlockContent(block, q, replaceQuery, true)
        replaced += next.count
        return next.block
      })
      if (replaced === 0) return doc
      return { ...doc, blocks: nextBlocks }
    }).then(() => {
      setToast(replaced > 0 ? `${replaced}개 항목을 바꿨습니다` : "바꿀 항목이 없습니다")
      if (replaced > 0) {
        setFindQuery("")
        setReplaceQuery("")
        setFindOpen(false)
      }
    })
  }

  function handleFindReplaceOne() {
    if (!activeMemo || !findQuery.trim()) return
    const q = findQuery
    let replaced = 0
    void updateActiveMemoContent((doc) => {
      const nextBlocks = [...doc.blocks]
      for (let i = 0; i < nextBlocks.length; i++) {
        const next = replaceBlockContent(nextBlocks[i], q, replaceQuery, false)
        if (next.count > 0) {
          replaced = next.count
          nextBlocks[i] = next.block
          return { ...doc, blocks: nextBlocks }
        }
      }
      return doc
    }).then(() => {
      setToast(replaced > 0 ? "1개 항목을 바꿨습니다" : "바꿀 항목이 없습니다")
    })
  }

  /* ── highlight ── */

  function setBlockHighlight(blockId: string, color: RNestMemoHighlightColor | null) {
    if (!activeMemo) return
    void updateActiveMemoContent((doc) => ({
      ...doc,
      blocks: doc.blocks.map((b) => (b.id === blockId ? { ...b, highlight: color || undefined } : b)),
    }))
  }

  /* ── daily note ── */

  function openOrCreateDailyNote() {
    const now = new Date()
    const dateStr = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, "0")}.${String(now.getDate()).padStart(2, "0")}`
    const dayNames = ["일", "월", "화", "수", "목", "금", "토"]
    const dayName = dayNames[now.getDay()]
    const dailyTitle = `${dateStr} ${dayName}요일`

    // Check if daily note already exists
    const existing = activeDocs.find((d) => d.title === dailyTitle)
    if (existing) {
      openMemo(existing.id)
      return
    }

    // Create new daily note
    const doc = createMemoFromTemplate(
      displayedTemplates.find((template) => template.id === "blank") ??
      defaultMemoTemplates.find((template) => template.id === "blank") ??
      defaultMemoTemplates[0]
    )
    const dailyDoc = sanitizeMemoDocument({
      ...doc,
      title: dailyTitle,
      titleHtml: "",
      icon: "moon",
      coverStyle: null,
      blocks: [
        createMemoBlock("heading", { text: "오늘 할 일" }),
        createMemoBlock("checklist", { text: "", checked: false }),
        createMemoBlock("divider"),
        createMemoBlock("heading", { text: "메모" }),
        createMemoBlock("paragraph"),
      ],
    })
    const latestMemo = store.getState().memo
    commit({ ...latestMemo.documents, [dailyDoc.id]: dailyDoc }, insertRecent(latestMemo.recent, dailyDoc.id))
    setActiveMemoId(dailyDoc.id)
    setQuery("")
    setToast("오늘의 데일리 노트를 만들었습니다")
  }

  /* ── render ── */

  return (
    <div
      className="flex h-[calc(100dvh-56px)] overflow-hidden bg-white"
      style={{ WebkitTextSizeAdjust: "100%" }}
    >
      {/* ─── SIDEBAR BACKDROP (mobile) ─── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/20 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ─── SIDEBAR ─── */}
      <aside
        className={cn(
          "flex min-h-0 shrink-0 flex-col overflow-hidden border-r border-gray-100 bg-[#F9F9F8] transition-all duration-200",
          "max-lg:fixed max-lg:inset-y-0 max-lg:left-0 max-lg:z-50 max-lg:shadow-xl",
          sidebarOpen ? "w-[260px] max-lg:w-[min(86vw,320px)]" : "w-0 overflow-hidden"
        )}
      >
        {/* sidebar header */}
        <div className="flex items-center justify-between px-3 pb-1 pt-3">
          <Link href="/tools" className="text-[12px] font-medium text-ios-muted hover:text-ios-sub">
            ← 툴
          </Link>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="flex h-6 w-6 items-center justify-center rounded-md text-gray-400 hover:bg-gray-200 hover:text-gray-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* search */}
        <div className="px-2 pb-2 pt-1">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="검색..."
              className={cn(
                "h-10 w-full rounded-lg border border-gray-200 bg-white pl-8 pr-3 text-ios-text outline-none placeholder:text-gray-400 focus:border-[color:var(--rnest-accent-border)] focus:ring-1 focus:ring-[color:var(--rnest-accent-border)] md:h-8",
                mobileSafeInputClass
              )}
            />
          </div>
        </div>

        {/* action buttons */}
        <div className="space-y-0.5 px-2 pb-3">
          <button
            type="button"
            onClick={() => void openTemplatePicker()}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] font-medium text-ios-sub transition-colors hover:bg-gray-200"
          >
            <Plus className="h-4 w-4" />
            새 페이지
          </button>
          <button
            type="button"
            onClick={createFolder}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] font-medium text-ios-sub transition-colors hover:bg-gray-200"
          >
            <FolderPlus className="h-4 w-4" />
            폴더 만들기
          </button>
          <button
            type="button"
            onClick={openOrCreateDailyNote}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] font-medium text-ios-sub transition-colors hover:bg-gray-200"
          >
            <Calendar className="h-4 w-4" />
            오늘 메모
          </button>
          <div className="relative" ref={sortMenuRef}>
            <button
              type="button"
              onClick={() => setShowSortMenu(!showSortMenu)}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] font-medium text-ios-sub transition-colors hover:bg-gray-200"
            >
              <ArrowUpDown className="h-4 w-4" />
              {sortOptions.find((o) => o.key === sortKey)?.label ?? "수정일순"}
            </button>
            {showSortMenu && (
              <div className="absolute left-0 top-full z-30 mt-1 w-40 rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
                {sortOptions.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => { setSortKey(option.key); setShowSortMenu(false) }}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] transition-colors",
                      sortKey === option.key
                        ? "bg-[color:var(--rnest-accent-soft)] text-[color:var(--rnest-accent)]"
                        : "text-ios-text hover:bg-gray-50"
                    )}
                  >
                    {option.key === "title" ? <ArrowDownAZ className="h-3.5 w-3.5" /> : <ArrowUpDown className="h-3.5 w-3.5" />}
                    {option.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* page lists */}
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-2 pb-4 [webkit-overflow-scrolling:touch]">
          {searchResults != null ? (
            <SidebarSection title="검색 결과" count={searchResults.length}>
              {searchResults.length === 0 && (
                <div className="px-2 py-3 text-center text-[12px] text-gray-400">결과 없음</div>
              )}
              {searchResults.map((doc) => (
                <PageItem
                  key={doc.id}
                  doc={getRenderableDoc(doc)}
                  summary={buildSummary(getRenderableDoc(doc))}
                  isLocked={Boolean(doc.lock && !unlockedPayloads[doc.id])}
                  listKey="search"
                  isActive={activeMemoId === doc.id}
                  onClick={() => openMemo(doc.id)}
                  draggable
                  isDragging={draggingDocId === doc.id}
                  onDragStart={(event) => handlePageDragStart(event, doc.id)}
                  onDragEnd={handlePageDragEnd}
                />
              ))}
            </SidebarSection>
          ) : (
            <>
              {pinnedDocs.length > 0 && (
                <SidebarSection title="고정" count={pinnedDocs.length}>
                  {pinnedDocs.map((doc) => (
                    <PageItem
                      key={doc.id}
                      doc={getRenderableDoc(doc)}
                      summary={buildSummary(getRenderableDoc(doc))}
                      isLocked={Boolean(doc.lock && !unlockedPayloads[doc.id])}
                      listKey="pinned"
                      isActive={activeMemoId === doc.id}
                      onClick={() => openMemo(doc.id)}
                      draggable
                      isDragging={draggingDocId === doc.id}
                      onDragStart={(event) => handlePageDragStart(event, doc.id)}
                      onDragEnd={handlePageDragEnd}
                      isEditing={editingDocId === doc.id}
                      draftTitle={editingDocId === doc.id ? pageTitleDraft : doc.title}
                      onStartEdit={() => startPageRename(doc)}
                      onDraftChange={setPageTitleDraft}
                      onDraftCommit={() => commitPageRename(doc.id)}
                      onDraftCancel={cancelPageRename}
                      onTrash={() => trashMemo(doc.id)}
                    />
                  ))}
                </SidebarSection>
              )}

              {recentDocs.length > 0 && (
                <SidebarSection title="최근" count={recentDocs.length}>
                  {recentDocs.map((doc) => (
                    <PageItem
                      key={doc.id}
                      doc={getRenderableDoc(doc)}
                      summary={buildSummary(getRenderableDoc(doc))}
                      isLocked={Boolean(doc.lock && !unlockedPayloads[doc.id])}
                      listKey="recent"
                      isActive={activeMemoId === doc.id}
                      onClick={() => openMemo(doc.id)}
                      draggable
                      isDragging={draggingDocId === doc.id}
                      onDragStart={(event) => handlePageDragStart(event, doc.id)}
                      onDragEnd={handlePageDragEnd}
                    />
                  ))}
                </SidebarSection>
              )}

              {favoriteDocs.length > 0 && (
                <SidebarSection title="즐겨찾기" count={favoriteDocs.length}>
                  {favoriteDocs.map((doc) => (
                    <PageItem
                      key={doc.id}
                      doc={getRenderableDoc(doc)}
                      summary={buildSummary(getRenderableDoc(doc))}
                      isLocked={Boolean(doc.lock && !unlockedPayloads[doc.id])}
                      listKey="favorites"
                      isActive={activeMemoId === doc.id}
                      onClick={() => openMemo(doc.id)}
                      draggable
                      isDragging={draggingDocId === doc.id}
                      onDragStart={(event) => handlePageDragStart(event, doc.id)}
                      onDragEnd={handlePageDragEnd}
                      isEditing={editingDocId === doc.id}
                      draftTitle={editingDocId === doc.id ? pageTitleDraft : doc.title}
                      onStartEdit={() => startPageRename(doc)}
                      onDraftChange={setPageTitleDraft}
                      onDraftCommit={() => commitPageRename(doc.id)}
                      onDraftCancel={cancelPageRename}
                      onTrash={() => trashMemo(doc.id)}
                    />
                  ))}
                </SidebarSection>
              )}

              <SidebarSection key={`folders-${allFolders.length > 0 ? "filled" : "empty"}`} title="폴더" count={allFolders.length}>
                {allFolders.length === 0 ? (
                  <div className="px-2 py-4 text-[12px] leading-5 text-gray-400">
                    폴더를 만들면 비슷한 메모를 한곳에 정리할 수 있습니다
                  </div>
                ) : (
                  allFolders.map((folder) => {
                    const docs = folderDocsByFolderId[folder.id] ?? []
                    const docTree = folderDocTreesByFolderId[folder.id] ?? []
                    const isOpen = folderOpenState[folder.id] ?? true
                    return (
                      <FolderItem
                        key={folder.id}
                        folder={folder}
                        docCount={docs.length}
                        isOpen={isOpen}
                        isActive={activeMemoRaw?.folderId === folder.id}
                        isDropActive={dragOverFolderId === folder.id}
                        isEditing={editingFolderId === folder.id}
                        draftName={editingFolderId === folder.id ? folderNameDraft : folder.name}
                        onToggle={() =>
                          setFolderOpenState((current) => ({
                            ...current,
                            [folder.id]: !(current[folder.id] ?? true),
                          }))
                        }
                        onStartEdit={() => {
                          setEditingFolderId(folder.id)
                          setFolderNameDraft(folder.name)
                          setFolderOpenState((current) => ({ ...current, [folder.id]: true }))
                        }}
                        onDraftChange={setFolderNameDraft}
                        onDraftCommit={() => commitFolderRename(folder.id)}
                        onDraftCancel={cancelFolderRename}
                        onDelete={() => deleteFolder(folder.id)}
                        onDragOver={(event) => {
                          if (!draggingDocId) return
                          event.preventDefault()
                          event.dataTransfer.dropEffect = "move"
                          setDragOverRootPages(false)
                          setDragOverParentDocId(null)
                          setDragOverFolderId(folder.id)
                          setFolderOpenState((current) => ({ ...current, [folder.id]: true }))
                        }}
                        onDragLeave={() => {
                          setDragOverFolderId((current) => (current === folder.id ? null : current))
                        }}
                        onDrop={(event) => {
                          event.preventDefault()
                          const docId = event.dataTransfer.getData("text/plain") || draggingDocId
                          if (docId) moveDocToFolder(docId, folder.id)
                          handlePageDragEnd()
                        }}
                      >
                        {docs.length === 0 ? (
                          <div className="rounded-xl px-2 py-2 text-[11.5px] text-gray-400">
                            아직 폴더 안에 페이지가 없습니다
                          </div>
                        ) : (
                          renderPageTree(docTree, `folder:${folder.id}`)
                        )}
                      </FolderItem>
                    )
                  })
                )}
              </SidebarSection>

              <SidebarSection title="페이지" count={rootDocs.length}>
                {draggingDoc?.folderId ? (
                  <div
                    onDragOver={(event) => {
                      event.preventDefault()
                      event.dataTransfer.dropEffect = "move"
                      setDragOverFolderId(null)
                      setDragOverParentDocId(null)
                      setDragOverRootPages(true)
                    }}
                    onDragLeave={() => setDragOverRootPages(false)}
                    onDrop={(event) => {
                      event.preventDefault()
                      const docId = event.dataTransfer.getData("text/plain") || draggingDocId
                      if (docId) moveDocToFolder(docId, null)
                      handlePageDragEnd()
                    }}
                    className={cn(
                      "mb-1 rounded-2xl border border-dashed px-3 py-2 text-[11.5px] font-medium transition-colors",
                      dragOverRootPages
                        ? "border-[color:var(--rnest-accent-border)] bg-[color:var(--rnest-accent-soft)] text-[color:var(--rnest-accent)]"
                        : "border-gray-200 text-ios-muted"
                    )}
                  >
                    폴더 밖으로 이동
                  </div>
                ) : null}

                {activeDocs.length === 0 && (
                  <div className="px-2 py-6 text-center text-[12px] text-gray-400">
                    아직 메모가 없습니다
                  </div>
                )}
                {activeDocs.length > 0 && rootDocs.length === 0 && (
                  <div className="px-2 py-3 text-center text-[12px] text-gray-400">
                    모든 페이지가 폴더 안에 있습니다
                  </div>
                )}
                {renderPageTree(rootDocTree, "pages")}
              </SidebarSection>

              {trashedDocs.length > 0 && (
                <SidebarSection title="휴지통" count={trashedDocs.length} defaultOpen={false}>
                  {trashedDocs.map((doc) => (
                    <PageItem
                      key={doc.id}
                      doc={getRenderableDoc(doc)}
                      summary={buildSummary(getRenderableDoc(doc))}
                      isLocked={Boolean(doc.lock && !unlockedPayloads[doc.id])}
                      listKey="trash"
                      isActive={activeMemoId === doc.id}
                      onClick={() => openMemo(doc.id)}
                      draggable
                      isDragging={draggingDocId === doc.id}
                      onDragStart={(event) => handlePageDragStart(event, doc.id)}
                      onDragEnd={handlePageDragEnd}
                      onRestore={() => restoreMemo(doc.id)}
                      onDeletePermanent={() => deletePermanently(doc.id)}
                    />
                  ))}
                </SidebarSection>
              )}
            </>
          )}
        </div>
      </aside>

      {/* ─── MAIN CONTENT ─── */}
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* top bar */}
        <div className="flex h-12 shrink-0 items-center gap-2 border-b border-gray-100 px-3 lg:h-11 lg:px-4">
          {!sidebarOpen && (
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              title="사이드바 열기"
            >
              <FileText className="h-4 w-4" />
            </button>
          )}

          {activeMemo && (
            <>
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-[color:var(--rnest-accent-soft)] text-[color:var(--rnest-accent)]">
                {renderMemoIcon(activeMemo.icon, "h-3.5 w-3.5")}
              </span>
              <div className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium text-ios-sub lg:text-[13px]">
                  {activeMemo.title || "제목 없음"}
                </span>
                <span className="mt-0.5 block text-[11px] text-ios-muted lg:hidden">{formatUpdatedAtLabel(activeMemo.updatedAt)}</span>
              </div>
              {activeMemoRaw?.pinned && (
                <span className="hidden items-center gap-1 rounded-full bg-[color:var(--rnest-accent-soft)] px-2 py-0.5 text-[11px] font-medium text-[color:var(--rnest-accent)] lg:inline-flex">
                  <Pin className="h-3 w-3" />
                  고정
                </span>
              )}
              {activeMemoIsLocked && (
                <span className="hidden items-center gap-1 rounded-full border border-[color:var(--rnest-accent-border)] bg-white px-2 py-0.5 text-[11px] font-medium text-ios-sub lg:inline-flex">
                  {activeMemoIsUnlocked ? <LockOpen className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                  {activeMemoIsUnlocked ? "잠금 해제됨" : "잠금 메모"}
                </span>
              )}
              <span className="ml-auto hidden text-[11.5px] text-gray-400 lg:inline">
                {formatUpdatedAtLabel(activeMemo.updatedAt)}
              </span>
              <button
                type="button"
                onClick={() => { setFindOpen(!findOpen); if (!findOpen) requestAnimationFrame(() => findInputRef.current?.focus()) }}
                className={cn(
                  "hidden h-7 w-7 items-center justify-center rounded-md transition-colors lg:flex",
                  findOpen ? "bg-gray-100 text-[color:var(--rnest-accent)]" : "text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                )}
                title="검색 & 바꾸기 (⌘F)"
              >
                <Search className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (showPdfBreaks) {
                    closePdfPreview()
                    return
                  }
                  void openPdfPreview()
                }}
                className={cn(
                  "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-[10.5px] font-semibold tracking-[-0.01em] transition-colors sm:h-8 sm:gap-2 sm:px-3.5 sm:text-[11px]",
                  showPdfBreaks
                    ? "border-[#BFDBFE] bg-[#EFF6FF] text-[#007AFF]"
                    : "border-[#E5E7EB] bg-white text-[#5B6577] hover:border-[#D0D7E2] hover:bg-[#F8FAFC] hover:text-[#111827]"
                )}
                title={showPdfBreaks ? "편집 화면으로 돌아가기" : "PDF 미리보기"}
              >
                <svg viewBox="0 0 16 16" fill="none" className="h-3 w-3 shrink-0 sm:h-3.5 sm:w-3.5" aria-hidden="true">
                  <rect x="1" y="1" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.4" />
                  <line x1="1" y1="5.5" x2="15" y2="5.5" stroke="currentColor" strokeWidth="1" strokeDasharray="2 1.5" />
                  <line x1="1" y1="10.5" x2="15" y2="10.5" stroke="currentColor" strokeWidth="1" strokeDasharray="2 1.5" />
                </svg>
                {showPdfBreaks ? "편집" : "PDF"}
              </button>
              <button
                type="button"
                onClick={undoActiveMemoChange}
                disabled={!canUndoActiveMemo}
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
                  canUndoActiveMemo
                    ? "text-gray-400 hover:bg-gray-100 hover:text-[color:var(--rnest-accent)]"
                    : "cursor-not-allowed text-gray-200"
                )}
                title="이전 상태로 되돌리기"
                aria-label="이전 상태로 되돌리기"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={restoreActiveMemoChange}
                disabled={!canRestoreActiveMemo}
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
                  canRestoreActiveMemo
                    ? "text-gray-400 hover:bg-gray-100 hover:text-[color:var(--rnest-accent)]"
                    : "cursor-not-allowed text-gray-200"
                )}
                title="원래 상태로 복구"
                aria-label="원래 상태로 복구"
              >
                <RotateCw className="h-4 w-4" />
              </button>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowMoreMenu(!showMoreMenu)}
                  className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
                {showMoreMenu && (
                  <MoreMenu
                    doc={activeMemoRaw ?? activeMemo}
                    isUnlocked={activeMemoIsUnlocked}
                    onAction={handleMoreAction}
                    onClose={() => setShowMoreMenu(false)}
                  />
                )}
              </div>
            </>
          )}
        </div>

        {/* find & replace bar */}
        {findOpen && activeMemo && (
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-gray-100 bg-gray-50/70 px-4 py-2">
            <div className="relative flex-1 min-w-[120px] max-w-[240px]">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={findQuery}
                ref={findInputRef}
                onChange={(e) => setFindQuery(e.target.value)}
                placeholder="검색..."
                autoFocus
                className="h-8 w-full rounded-lg border border-gray-200 bg-white pl-7 pr-3 text-[13px] text-ios-text outline-none placeholder:text-gray-400 focus:border-[color:var(--rnest-accent-border)] focus:ring-1 focus:ring-[color:var(--rnest-accent-border)]"
              />
            </div>
            <div className="relative flex-1 min-w-[120px] max-w-[240px]">
              <Replace className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={replaceQuery}
                onChange={(e) => setReplaceQuery(e.target.value)}
                placeholder="바꾸기..."
                className="h-8 w-full rounded-lg border border-gray-200 bg-white pl-7 pr-3 text-[13px] text-ios-text outline-none placeholder:text-gray-400 focus:border-[color:var(--rnest-accent-border)] focus:ring-1 focus:ring-[color:var(--rnest-accent-border)]"
              />
            </div>
            {findQuery.trim() && (
              <span className="text-[12px] text-ios-muted whitespace-nowrap">{findMatchCount}개 일치</span>
            )}
            <button
              type="button"
              onClick={handleFindReplaceOne}
              disabled={!findQuery.trim() || findMatchCount === 0}
              className="h-8 rounded-lg border border-gray-200 bg-white px-3 text-[12px] font-medium text-ios-sub transition-colors hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
            >
              하나 바꾸기
            </button>
            <button
              type="button"
              onClick={handleFindReplace}
              disabled={!findQuery.trim() || findMatchCount === 0}
              className="h-8 rounded-lg border border-gray-200 bg-white px-3 text-[12px] font-medium text-ios-sub transition-colors hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
            >
              모두 바꾸기
            </button>
            <button
              type="button"
              onClick={() => { setFindOpen(false); setFindQuery(""); setReplaceQuery("") }}
              className="flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-gray-200 hover:text-gray-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* editor area */}
        <div
          className={cn(
            "flex-1 overflow-y-auto transition-colors",
            editorDropActive && "bg-[color:var(--rnest-accent-soft)]/35"
          )}
          onPasteCapture={handleEditorSurfacePaste}
          onDragOver={handleEditorSurfaceDragOver}
          onDragLeave={handleEditorSurfaceDragLeave}
          onDrop={handleEditorSurfaceDrop}
        >
          {activeMemo ? (
            <div
              ref={pdfContentRef}
              className="relative mx-auto w-full max-w-[720px] bg-white px-5 py-6 sm:px-6 lg:px-10 lg:py-10 xl:pl-16"
            >
              {editorDropActive && (
                <div
                  data-pdf-hide="true"
                  className="pointer-events-none absolute inset-3 z-20 rounded-[28px] border-2 border-dashed border-[color:var(--rnest-accent-border)] bg-[color:var(--rnest-accent-soft)]/50"
                >
                  <div className="flex h-full items-center justify-center text-[13px] font-medium text-[color:var(--rnest-accent)]">
                    파일이나 텍스트를 놓으면 메모로 가져옵니다
                  </div>
                </div>
              )}
              <div
                data-pdf-preview-source="true"
                className={cn(
                  // Keep the measured source in the same layout state from the first preview render.
                  // When this toggled only after pages arrived, the observer scheduled a second render
                  // against a different DOM geometry, which could move forced page starts backward.
                  showPdfBreaks &&
                    "pointer-events-none absolute inset-x-0 top-0 opacity-0"
                )}
              >
              {activeMemo.coverStyle && (
                <div
                  data-pdf-hide="true"
                  className={cn(
                    "mb-4 h-16 rounded-[24px] border border-white/70 shadow-[0_20px_40px_rgba(148,163,184,0.14)] lg:mb-5 lg:h-28 lg:rounded-[28px]",
                    coverClassMap[(activeMemo.coverStyle as RNestMemoCoverId) ?? "lavender-glow"]
                  )}
                />
              )}

              {/* page icon */}
              <div data-pdf-hide="true" className="relative mb-3 lg:mb-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowIconPicker(!showIconPicker)
                    setShowCoverPicker(false)
                  }}
                  className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-[color:var(--rnest-accent-soft)] text-[color:var(--rnest-accent)] shadow-[inset_0_0_0_1px_rgba(196,181,253,0.45)] transition-transform hover:scale-[1.03] lg:h-[72px] lg:w-[72px] lg:rounded-[22px]"
                  title="아이콘 변경"
                >
                  {renderMemoIcon(activeMemo.icon, "h-7 w-7 lg:h-9 lg:w-9")}
                </button>
                {showIconPicker && (
                  <IconPicker
                    value={activeMemo.icon}
                    onChange={(icon) => activeMemoRaw && saveRawDoc({ ...activeMemoRaw, icon })}
                    onClose={() => setShowIconPicker(false)}
                  />
                )}
              </div>

              {/* title */}
              <NotebookRichTextField
                text={getMemoDocumentTitle(activeMemo)}
                html={activeMemo.titleHtml}
                placeholder="제목 없음"
                ariaLabel="페이지 제목"
                className="mb-2 text-[30px] font-bold tracking-[-0.03em] text-ios-text sm:text-[32px] lg:text-[36px]"
                singleLine
                enableSlashMenu={false}
                onChange={(next) => {
                  if (!activeMemoRaw) return
                  saveRawDoc({
                    ...activeMemoRaw,
                    title: next.text,
                    titleHtml: next.html,
                  })
                }}
              />

              {activeMemoExportTags.length > 0 && (
                <div
                  data-pdf-export-only="true"
                  data-pdf-export-display="flex"
                  className="mb-5 hidden flex-wrap items-center gap-2"
                >
                  {activeMemoExportTags.map((tag) => (
                    <span
                      key={`pdf-tag-${tag}`}
                      className="inline-flex items-center rounded-full bg-[color:var(--rnest-accent-soft)] px-3 py-1 text-[12px] font-medium leading-none text-[color:var(--rnest-accent)]"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}

              {/* compact tools for phone/tablet */}
              <div data-pdf-hide="true" className="mb-5 lg:hidden">
                {activeMemoIsLocked && !activeMemoIsUnlocked ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--rnest-accent-border)] bg-[color:var(--rnest-accent-soft)] px-3 py-1 text-[12px] font-medium text-[color:var(--rnest-accent)]">
                      <Lock className="h-3.5 w-3.5" />
                      잠금 메모
                    </span>
                    {activeMemoRaw?.pinned && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-[12px] font-medium text-ios-sub shadow-[inset_0_0_0_1px_rgba(196,181,253,0.35)]">
                        <Pin className="h-3.5 w-3.5 text-[color:var(--rnest-accent)]" />
                        고정됨
                      </span>
                    )}
                    {activeMemoRaw?.lock?.hint && (
                      <span className="text-[12px] text-ios-muted">힌트: {activeMemoRaw.lock.hint}</span>
                    )}
                    <span className="ml-auto text-[11px] text-ios-muted">{formatUpdatedAtLabel(activeMemo.updatedAt)}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setUnlockPassword("")
                        setUnlockError(null)
                        setUnlockDialogOpen(true)
                      }}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--rnest-accent-border)] bg-white px-3 py-1 text-[12px] font-medium text-ios-sub transition-colors hover:bg-[color:var(--rnest-accent-soft)]"
                    >
                      <LockOpen className="h-3.5 w-3.5" />
                      잠금 해제
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="mb-2 flex flex-wrap items-center gap-2 text-[11px] text-ios-muted">
                      {activeMemoRaw?.pinned && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[color:var(--rnest-accent-soft)] px-2.5 py-1 font-medium text-[color:var(--rnest-accent)]">
                          <Pin className="h-3 w-3" />
                          고정됨
                        </span>
                      )}
                      {activeMemoRaw?.lock && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-[color:var(--rnest-accent-border)] bg-white px-2.5 py-1 font-medium text-ios-sub">
                          {activeMemoIsUnlocked ? <LockOpen className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                          {activeMemoIsUnlocked ? "잠금 해제됨" : "잠금 메모"}
                        </span>
                      )}
                      <span className="ml-auto">{formatUpdatedAtLabel(activeMemo.updatedAt)}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {activeMemo.tags.slice(0, 2).map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center rounded-full bg-[color:var(--rnest-accent-soft)] px-3 py-1 text-[12px] font-medium text-[color:var(--rnest-accent)]"
                        >
                          #{tag}
                        </span>
                      ))}
                      {activeMemo.tags.length > 2 && (
                        <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-[12px] font-medium text-ios-sub">
                          +{activeMemo.tags.length - 2}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => setShowCompactTools((current) => !current)}
                        data-pdf-hide="true"
                        className={cn("ml-auto inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[12px] font-medium text-ios-sub shadow-[inset_0_0_0_1px_rgba(196,181,253,0.35)] transition-colors hover:bg-[color:var(--rnest-accent-soft)]/35", showPdfBreaks && "hidden")}
                      >
                        <Sparkles className="h-3.5 w-3.5 text-[color:var(--rnest-accent)]" />
                        메모 도구
                        {showCompactTools ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      </button>
                    </div>

                    {showCompactTools && !showPdfBreaks && (
                      <div data-pdf-hide="true" className="mt-3 space-y-4 rounded-[24px] border border-[color:var(--rnest-accent-border)]/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(248,245,255,0.94)_100%)] p-4 shadow-[0_14px_34px_rgba(123,111,208,0.08)]">
                        <div className="flex flex-wrap items-center gap-3">
                          <InlineTagEditor
                            tags={activeMemo.tags}
                            onChange={(next) => {
                              void updateActiveMemoContent((doc) => ({ ...doc, tags: next }))
                            }}
                          />
                          <div className="hidden h-4 w-px bg-gray-200 sm:block" />
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => {
                                setShowCoverPicker(!showCoverPicker)
                                setShowIconPicker(false)
                              }}
                              className="inline-flex items-center gap-1.5 text-[12px] text-gray-400 transition-colors hover:text-gray-500"
                            >
                              <Sparkles className="h-3.5 w-3.5" />
                              {activeMemo.coverStyle
                                ? coverLabelMap[(activeMemo.coverStyle as RNestMemoCoverId) ?? "lavender-glow"]
                                : "커버"}
                            </button>
                            {showCoverPicker && (
                              <CoverPicker
                                value={activeMemo.coverStyle}
                                onChange={(coverStyle) => activeMemoRaw && saveRawDoc({ ...activeMemoRaw, coverStyle })}
                                onClose={() => setShowCoverPicker(false)}
                              />
                            )}
                          </div>
                        </div>

                        {headingBlocks.length > 0 && (
                          <div>
                            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-ios-muted">
                              <NotebookPen className="h-3.5 w-3.5" />
                              페이지 목차
                            </div>
                            <div className="flex gap-2 overflow-x-auto pb-1">
                              {headingBlocks.map((block) => (
                                <button
                                  key={block.id}
                                  type="button"
                                  onClick={() => jumpToBlock(block.id)}
                                  className="shrink-0 rounded-full bg-[color:var(--rnest-accent-soft)] px-3 py-1.5 text-[12px] font-medium text-[color:var(--rnest-accent)] transition-colors hover:bg-[color:var(--rnest-accent-soft)]/80"
                                >
                                  {getMemoBlockText(block)}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        <div>
                          <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-ios-muted">
                            <Sparkles className="h-3.5 w-3.5" />
                            빠른 삽입
                          </div>
                          <div className="flex gap-2 overflow-x-auto pb-1">
                            {quickInsertTemplates.map((template) => (
                              <button
                                key={template.id}
                                type="button"
                                onClick={() => appendTemplateBundle(template.id)}
                                className="shrink-0 rounded-full border border-[color:var(--rnest-accent-border)] bg-white px-3 py-1.5 text-[12px] font-medium text-[color:var(--rnest-accent)] transition-colors hover:bg-[color:var(--rnest-accent-soft)]"
                              >
                                {template.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* desktop tools row */}
              <div data-pdf-hide="true" className="mb-8 hidden flex-wrap items-center gap-3 lg:flex">
                {activeMemoIsLocked && !activeMemoIsUnlocked ? (
                  <>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--rnest-accent-border)] bg-[color:var(--rnest-accent-soft)] px-3 py-1 text-[12px] font-medium text-[color:var(--rnest-accent)]">
                      <Lock className="h-3.5 w-3.5" />
                      잠금 메모
                    </span>
                    {activeMemoRaw?.lock?.hint && (
                      <span className="text-[12px] text-ios-muted">힌트: {activeMemoRaw.lock.hint}</span>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setUnlockPassword("")
                        setUnlockError(null)
                        setUnlockDialogOpen(true)
                      }}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--rnest-accent-border)] bg-white px-3 py-1 text-[12px] font-medium text-ios-sub transition-colors hover:bg-[color:var(--rnest-accent-soft)]"
                    >
                      <LockOpen className="h-3.5 w-3.5" />
                      잠금 해제
                    </button>
                  </>
                ) : (
                  <>
                    <InlineTagEditor
                      tags={activeMemo.tags}
                      onChange={(next) => {
                        void updateActiveMemoContent((doc) => ({ ...doc, tags: next }))
                      }}
                    />
                    <span className="text-gray-200">|</span>
                  </>
                )}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCoverPicker(!showCoverPicker)
                      setShowIconPicker(false)
                    }}
                    className="inline-flex items-center gap-1.5 text-[12px] text-gray-400 transition-colors hover:text-gray-500"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    {activeMemo.coverStyle
                      ? coverLabelMap[(activeMemo.coverStyle as RNestMemoCoverId) ?? "lavender-glow"]
                      : "커버"}
                  </button>
                  {showCoverPicker && (
                    <CoverPicker
                      value={activeMemo.coverStyle}
                      onChange={(coverStyle) => activeMemoRaw && saveRawDoc({ ...activeMemoRaw, coverStyle })}
                      onClose={() => setShowCoverPicker(false)}
                    />
                  )}
                </div>
              </div>

              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(event) => {
                  void insertUploadedAssetBlocks(event.target.files, "image")
                  event.currentTarget.value = ""
                }}
              />
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(event) => {
                  void insertUploadedAssetBlocks(event.target.files, "attachment")
                  event.currentTarget.value = ""
                }}
              />

              {activeMemoIsLocked && !activeMemoIsUnlocked ? (
                <div className="rounded-[32px] border border-[color:var(--rnest-accent-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(248,245,255,0.98)_100%)] px-6 py-10 text-center shadow-[0_18px_42px_rgba(123,111,208,0.08)]">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[22px] bg-[color:var(--rnest-accent-soft)] text-[color:var(--rnest-accent)] shadow-[inset_0_0_0_1px_rgba(196,181,253,0.4)]">
                    <Shield className="h-8 w-8" />
                  </div>
                  <h3 className="mt-5 text-[22px] font-semibold tracking-[-0.02em] text-ios-text">잠금 메모입니다</h3>
                  <p className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed text-ios-sub">
                    본문, 태그, 첨부 목록은 암호화되어 있습니다. 읽거나 수정하려면 잠금 해제가 필요합니다.
                  </p>
                  {activeMemoRaw?.lock?.hint && (
                    <p className="mt-3 text-[12px] text-ios-muted">힌트: {activeMemoRaw.lock.hint}</p>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setUnlockPassword("")
                      setUnlockError(null)
                      setUnlockDialogOpen(true)
                    }}
                    className="mt-5 inline-flex items-center gap-2 rounded-full bg-[color:var(--rnest-accent-soft)] px-4 py-2 text-[13px] font-medium text-[color:var(--rnest-accent)] transition-colors hover:bg-[color:var(--rnest-accent-soft)]/80"
                  >
                    <LockOpen className="h-4 w-4" />
                    잠금 해제
                  </button>
                </div>
              ) : (
                <>
                  {(headingBlocks.length > 0 || quickInsertTemplates.length > 0) && (
                    <div
                      data-pdf-hide="true"
                      className={cn("mb-8 hidden space-y-4 lg:block", showPdfBreaks && "hidden")}
                    >
                      {headingBlocks.length > 0 && (
                        <div>
                          <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-ios-muted">
                            <NotebookPen className="h-3.5 w-3.5" />
                            페이지 목차
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {headingBlocks.map((block) => (
                              <button
                                key={block.id}
                                type="button"
                                onClick={() => jumpToBlock(block.id)}
                                className="rounded-full bg-[color:var(--rnest-accent-soft)] px-3 py-1.5 text-[12px] font-medium text-[color:var(--rnest-accent)] transition-colors hover:bg-[color:var(--rnest-accent-soft)]/80"
                              >
                                {getMemoBlockText(block)}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      <div>
                        <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-ios-muted">
                          <Sparkles className="h-3.5 w-3.5" />
                          빠른 삽입
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {quickInsertTemplates.map((template) => (
                            <button
                              key={template.id}
                              type="button"
                              onClick={() => appendTemplateBundle(template.id)}
                              className="rounded-full border border-[color:var(--rnest-accent-border)] bg-white px-3 py-1.5 text-[12px] font-medium text-[color:var(--rnest-accent)] transition-colors hover:bg-[color:var(--rnest-accent-soft)]"
                            >
                              {template.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* blocks */}
                  <div className="space-y-3 pl-0 lg:pl-10">
                    {activeMemo.blocks.map((block, idx) => {
                      if (block.type === "pageSpacer") return null
                      const attachment = findAttachment(activeMemo, block.attachmentId)
                      const { startsNextPdfPage, blankSpaceBlock } = getLeadingSpacerInfo(activeMemo.blocks, idx)
                      const blankSpaceHeightPx = startsNextPdfPage ? 0 : getBlankSpaceUnits(blankSpaceBlock) * BLANK_SPACE_UNIT_PX
                      const visibleBlockIndex = activeMemo.blocks
                        .slice(0, idx + 1)
                        .filter((entry) => entry.type !== "pageSpacer").length - 1
                      const visibleBlockCount = activeMemo.blocks.filter((entry) => entry.type !== "pageSpacer").length
                      const showBeforeIndicator =
                        blockReorderState?.activeBlockId !== block.id &&
                        blockReorderState?.overBlockId === block.id &&
                        blockReorderState?.placement === "before"
                      const showAfterIndicator =
                        blockReorderState?.activeBlockId !== block.id &&
                        blockReorderState?.overBlockId === block.id &&
                        blockReorderState?.placement === "after"
                      return (
                        <Fragment key={block.id}>
                          {showBeforeIndicator && (
                            <div aria-hidden="true" className="flex items-center gap-1.5 py-0.5">
                              <div className="h-[5px] w-[5px] shrink-0 rounded-full bg-[#007AFF]" />
                              <div className="h-[2px] flex-1 rounded-full bg-[#007AFF]/70" />
                            </div>
                          )}
                          {startsNextPdfPage && <PdfPageStartIndicator />}
                          {blankSpaceHeightPx > 0 && (
                            <div
                              aria-hidden="true"
                              style={{ height: `${blankSpaceHeightPx}px` }}
                            />
                          )}
                          <InlineBlock
                            block={block}
                            attachment={attachment}
                            attachmentUrl={attachment ? buildNotebookFileUrl(attachment.storagePath) : undefined}
                            docAttachments={activeMemo.attachments}
                            allDocs={activeDocs}
                            recordTemplates={allRecordTemplates}
                            recordEntriesByTemplateId={recordEntriesByTemplateId}
                            isFirst={visibleBlockIndex === 0}
                            isLast={visibleBlockIndex === visibleBlockCount - 1}
                            isDragging={blockReorderState?.activeBlockId === block.id}
                            dragOffsetY={blockReorderState?.activeBlockId === block.id ? (blockReorderState?.offsetY ?? 0) : 0}
                            onRootReady={(node) => {
                              if (node) blockNodesRef.current[block.id] = node
                              else delete blockNodesRef.current[block.id]
                            }}
                            onChange={(next) => updateBlock(block.id, next)}
                            onDelete={() => deleteBlock(block.id)}
                            onRemoveAttachment={() => {
                              if (attachment) {
                                void removeAttachmentById(block.id, attachment.id)
                              } else {
                                deleteBlock(block.id)
                              }
                            }}
                            onOpenAttachment={() => {
                              if (attachment) openAttachment(attachment)
                            }}
                            onDuplicate={() => duplicateBlock(block.id)}
                            onInsertBlankBefore={() => insertBlankSpaceBefore(block.id)}
                            onRemoveBlankBefore={() => removeBlankSpaceBefore(block.id)}
                            onTypeChange={(type) => changeBlockType(block.id, type)}
                            onAddAfter={(type) => addBlockAfter(block.id, type)}
                            onInsertAsset={(kind) => beginAssetInsert(block.id, kind)}
                            onOpenDoc={openMemoDoc}
                            onQuickAddRecordEntry={quickAddRecordEntry}
                            onSendToNextPdfPage={() => toggleNextPageSpacerBefore(block.id)}
                            onMoveUp={() => moveBlock(block.id, "up")}
                            onMoveDown={() => moveBlock(block.id, "down")}
                            onHighlight={(color) => setBlockHighlight(block.id, color)}
                            onRequestReorderStart={startBlockReorder}
                            showPdfBreaks={showPdfBreaks}
                            startsNextPdfPage={startsNextPdfPage}
                          />
                          {showAfterIndicator && (
                            <div aria-hidden="true" className="flex items-center gap-1.5 py-0.5">
                              <div className="h-[5px] w-[5px] shrink-0 rounded-full bg-[#007AFF]" />
                              <div className="h-[2px] flex-1 rounded-full bg-[#007AFF]/70" />
                            </div>
                          )}
                        </Fragment>
                      )
                    })}
                  </div>

                  {/* add block */}
                  <div data-pdf-hide="true" className={cn("mt-4 pl-0 lg:pl-10", showPdfBreaks && "hidden")}>
                    <AddBlockButton onSelect={appendBlock} />
                  </div>
                </>
              )}

              {/* footer info */}
              {activeMemo.trashedAt != null && (
                <div className="mt-8 flex items-center gap-3 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3">
                  <Trash2 className="h-4 w-4 shrink-0 text-orange-500" />
                  <span className="text-[13px] text-orange-700">
                    이 페이지는 휴지통에 있습니다.
                  </span>
                  <button
                    type="button"
                    onClick={() => restoreMemo(activeMemo.id)}
                    className="ml-auto text-[13px] font-medium text-orange-600 hover:underline"
                  >
                    복구
                  </button>
                  <button
                    type="button"
                    onClick={() => deletePermanently(activeMemo.id)}
                    className="text-[13px] font-medium text-red-500 hover:underline"
                  >
                    영구 삭제
                  </button>
                </div>
              )}
              </div>

              {showPdfBreaks && (
                <div
                  data-pdf-hide="true"
                  data-pdf-layout-key={pdfLayoutCacheKey ?? undefined}
                  data-pdf-bitmap-key={pdfBitmapCacheKey ?? undefined}
                  aria-hidden="true"
                  className="space-y-4 rounded-[28px] border border-[#E5E7EB] bg-[#F5F6F8]/95 p-4 shadow-[0_12px_30px_rgba(15,23,42,0.06)]"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3 rounded-[22px] border border-white/80 bg-white/80 px-4 py-3 backdrop-blur-sm">
                    <div>
                      <p className="text-[12px] font-semibold tracking-[-0.01em] text-[#111827]">PDF 미리보기</p>
                      <p className="mt-1 text-[12px] text-[#6B7280]">편집의 다음 PDF 페이지 시작 선을 그대로 기준으로 사용합니다.</p>
                      <div className="mt-2 inline-flex items-center gap-1 rounded-full border border-[#E5E7EB] bg-[#F8FAFC] p-1">
                        <span className="px-2 text-[10px] font-semibold tracking-[-0.01em] text-[#6B7280]">내용량</span>
                        {PDF_CONTENT_DENSITY_OPTIONS.map((option) => {
                          const active = Math.abs(option.value - pdfContentDensityMultiplier) < 0.001
                          return (
                            <button
                              key={`pdf-density-${option.value}`}
                              type="button"
                              onClick={() => handlePdfContentDensityChange(option.value)}
                              disabled={pdfPreviewBusy}
                              className={cn(
                                "inline-flex h-7 items-center rounded-full px-2.5 text-[11px] font-semibold tracking-[-0.01em] transition-colors",
                                active
                                  ? "bg-white text-[#111827] shadow-[0_1px_2px_rgba(15,23,42,0.08)]"
                                  : "text-[#6B7280] hover:text-[#374151]",
                                pdfPreviewBusy && !active && "cursor-wait text-[#9CA3AF]"
                              )}
                            >
                              {option.label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center rounded-full border border-[#E5E7EB] bg-white px-3 py-1 text-[11px] font-medium text-[#4B5563]">
                        {pdfExpectedPageCount || pdfPreviewPages.length || 0} 페이지
                      </span>
                      {pdfPreviewDirty ? (
                        <span className="inline-flex items-center rounded-full border border-[#FED7AA] bg-[#FFF7ED] px-3 py-1 text-[11px] font-medium text-[#C2410C]">
                          업데이트 필요
                        </span>
                      ) : pdfRenderedAt ? (
                        <span className="inline-flex items-center rounded-full border border-[#E5E7EB] bg-white px-3 py-1 text-[11px] font-medium text-[#6B7280]">
                          {formatUpdatedAtLabel(pdfRenderedAt)}
                        </span>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void openPdfPreview({ force: true })}
                        disabled={pdfPreviewBusy}
                        className={cn(
                          "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[11px] font-semibold tracking-[-0.01em] transition-colors",
                          pdfPreviewBusy
                            ? "cursor-wait border-[#E5E7EB] bg-[#F3F4F6] text-[#9CA3AF]"
                            : "border-[#D1D5DB] bg-white text-[#374151] hover:border-[#C7D2FE] hover:bg-[#F8FAFC]"
                        )}
                      >
                        <RotateCw className={cn("h-3.5 w-3.5", pdfPreviewBusy && "animate-spin")} />
                        새로고침
                      </button>
                    </div>
                  </div>

                  {(pdfRenderState === "layouting" || pdfRenderState === "rasterizing") && (
                    <div className="space-y-2 rounded-[20px] border border-white/70 bg-white/80 px-4 py-3">
                      <div className="flex items-center justify-between gap-3 text-[12px] font-medium text-[#6B7280]">
                        <span>
                          {pdfRenderState === "layouting"
                            ? "페이지 경계를 계산하고 있습니다"
                            : `페이지를 렌더링하고 있습니다 (${pdfRenderProgress.completed}/${pdfRenderProgress.total || pdfExpectedPageCount || 0})`}
                        </span>
                        <span>{Math.max(pdfRenderProgress.total, pdfExpectedPageCount, pdfPreviewPages.length)}p</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-[#E5E7EB]">
                        <div
                          className="h-full rounded-full bg-[#111827] transition-[width] duration-200"
                          style={{
                            width: `${Math.max(
                              6,
                              Math.min(
                                100,
                                ((pdfRenderProgress.completed || (pdfRenderState === "layouting" ? 0.25 : 0)) /
                                  Math.max(1, pdfRenderProgress.total || pdfExpectedPageCount || 1)) *
                                  100
                              )
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {pdfPreviewError ? (
                    <div className="flex min-h-[220px] items-center justify-center rounded-[24px] border border-[#FECACA] bg-[#FEF2F2] px-4 text-[13px] font-medium text-[#B91C1C]">
                      {pdfPreviewError}
                    </div>
                  ) : showingPdfPreview ? (
                    <div className="space-y-4">
                      {pdfPreviewPages.map((page) => (
                        <div
                          key={`pdf-preview-page-${page.pageNumber}`}
                          className="rounded-[24px] border border-[#E5E7EB] bg-[#EEF1F4] p-3 shadow-[0_8px_20px_rgba(15,23,42,0.05)]"
                        >
                          <div className="relative aspect-[595.28/841.89] overflow-hidden rounded-[18px] border border-[#E5E7EB] bg-white">
                            <div
                              className="absolute overflow-hidden bg-white"
                              style={{
                                left: `${(PDF_EXPORT_MARGIN_PT / PDF_PAGE_WIDTH_PT) * 100}%`,
                                right: `${(PDF_EXPORT_MARGIN_PT / PDF_PAGE_WIDTH_PT) * 100}%`,
                                top: `${(PDF_EXPORT_MARGIN_PT / PDF_PAGE_HEIGHT_PT) * 100}%`,
                                bottom: `${(PDF_EXPORT_MARGIN_PT / PDF_PAGE_HEIGHT_PT) * 100}%`,
                              }}
                            >
                              <img
                                src={page.imageDataUrl}
                                alt={`PDF page ${page.pageNumber}`}
                                className="block w-full select-none"
                                draggable={false}
                              />
                            </div>
                          </div>
                          <div className="mt-2 flex items-center justify-center text-[11px] font-medium text-[#6B7280]">
                            {page.pageNumber} / {pdfExpectedPageCount || pdfPreviewPages.length}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex min-h-[240px] items-center justify-center rounded-[24px] border border-[#E5E7EB] bg-white/80 px-4 text-[13px] font-medium text-[#6B7280]">
                      {pdfPreviewBusy ? "PDF 페이지를 렌더링하고 있습니다" : "PDF 버튼을 눌러 만든 최신 결과를 여기에 표시합니다"}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            /* empty state */
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <div className="flex h-20 w-20 items-center justify-center rounded-[28px] bg-[radial-gradient(circle_at_top_left,#F3E8FF_0%,#DDD6FE_45%,#FFFFFF_100%)] text-[color:var(--rnest-accent)] shadow-[inset_0_0_0_1px_rgba(196,181,253,0.4)]">
                <StickyNote className="h-9 w-9" strokeWidth={1.9} />
              </div>
              <div>
                <h2 className="text-[20px] font-bold text-ios-text">메모에 오신 것을 환영합니다</h2>
                <p className="mt-2 text-[14px] text-ios-sub">
                  새 페이지를 만들어 자유롭게 메모를 시작하세요
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {renderTemplates.slice(0, 4).map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => createMemoFromTemplateId(template.id)}
                    className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-[13.5px] text-ios-text shadow-sm transition-colors hover:border-[color:var(--rnest-accent-border)] hover:bg-[color:var(--rnest-accent-soft)]"
                  >
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[color:var(--rnest-accent-soft)] text-[color:var(--rnest-accent)]">
                      {renderMemoIcon(template.icon, "h-4 w-4")}
                    </span>
                    {template.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => void openTemplatePicker()}
                  className="flex items-center gap-2 rounded-xl border border-dashed border-[color:var(--rnest-accent-border)] bg-white px-4 py-2.5 text-[13.5px] font-medium text-[color:var(--rnest-accent)] shadow-sm transition-colors hover:bg-[color:var(--rnest-accent-soft)]"
                >
                  <Plus className="h-4 w-4" />
                  전체 템플릿
                </button>
              </div>
            </div>
          )}
        </div>

        <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
          <DialogContent className="[&>button]:hidden w-[calc(100vw-16px)] max-w-[760px] overflow-hidden rounded-[32px] border-0 bg-white p-0 shadow-[0_30px_80px_rgba(15,23,42,0.18)] sm:w-full">
            <div className="flex max-h-[calc(100dvh-16px)] flex-col rounded-[32px] bg-[linear-gradient(180deg,rgba(250,245,255,0.98)_0%,rgba(255,255,255,0.98)_100%)]">
              <div className="border-b border-white/80 bg-[rgba(255,255,255,0.78)] px-5 pb-4 pt-5 backdrop-blur sm:px-6 sm:pt-6">
                <div className="flex items-start justify-between gap-3">
                  <DialogHeader className="min-w-0 space-y-2 text-left">
                    <DialogTitle className="text-[22px] tracking-[-0.03em] text-ios-text sm:text-[24px]">
                      새 페이지 템플릿 선택
                    </DialogTitle>
                    <DialogDescription className="text-[13px] leading-relaxed text-ios-sub">
                      현재 운영 중인 템플릿 목록에서 시작할 메모 형식을 선택하세요.
                    </DialogDescription>
                  </DialogHeader>

                  <button
                    type="button"
                    onClick={() => setTemplateDialogOpen(false)}
                    className="inline-flex h-10 shrink-0 items-center justify-center rounded-full border border-[#dde6f0] bg-white px-4 text-[12px] font-semibold text-[#49607b] shadow-sm transition hover:bg-[#f8fbff]"
                  >
                    닫기
                  </button>
                </div>

                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="inline-flex items-center gap-2 rounded-full border border-[#e4ebf4] bg-white/92 px-3 py-2 text-[12px] font-medium text-[#536b86]">
                    <span className="inline-flex h-2 w-2 rounded-full bg-[color:var(--rnest-accent)]" />
                    사용 가능한 템플릿 {renderTemplates.length}개
                  </div>
                  <button
                    type="button"
                    onClick={openPersonalTemplateCreator}
                    className="inline-flex h-11 items-center justify-center rounded-full bg-[color:var(--rnest-accent)] px-5 text-[13px] font-semibold text-white shadow-[0_18px_42px_rgba(167,139,250,0.22)] transition hover:-translate-y-[1px] hover:opacity-95"
                  >
                    + 템플릿 만들기
                  </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-4 [-webkit-overflow-scrolling:touch] sm:px-6 sm:pb-6">
                {templatesLoading ? (
                  <div className="rounded-[20px] border border-[#e7edf5] bg-white/85 px-4 py-3 text-[12px] text-ios-muted">
                    템플릿을 불러오는 중...
                  </div>
                ) : null}

                {templateError ? (
                  <div className="mt-3 rounded-[20px] border border-[#f6dcb3] bg-[#fff7ea] px-4 py-3 text-[12px] leading-5 text-[#b26a11]">
                    {templateError}
                  </div>
                ) : null}

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {renderTemplates.map((template) => (
                    <div key={template.id} className="relative">
                      <button
                        type="button"
                        onClick={() => createMemoFromTemplateId(template.id)}
                        className={cn(
                          "w-full rounded-[26px] border border-[#e7edf5] bg-white/96 p-4 text-left shadow-[0_14px_34px_rgba(17,41,75,0.05)] transition hover:-translate-y-[1px] hover:border-[color:var(--rnest-accent-border)] hover:bg-[color:var(--rnest-accent-soft)]",
                          "touch-manipulation",
                          personalTemplateIdSet.has(template.id) && "pr-14"
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] bg-[color:var(--rnest-accent-soft)] text-[color:var(--rnest-accent)]">
                            {renderMemoIcon(template.icon, "h-5 w-5")}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="text-[16px] font-semibold text-ios-text">{template.label}</div>
                              {personalTemplateIdSet.has(template.id) ? (
                                <span className="inline-flex rounded-full bg-[rgba(167,139,250,0.14)] px-2 py-0.5 text-[10px] font-semibold text-[color:var(--rnest-accent)]">
                                  내 템플릿
                                </span>
                              ) : (
                                <span className="inline-flex rounded-full bg-[#eef3fa] px-2 py-0.5 text-[10px] font-semibold text-[#5c6f86]">
                                  기본
                                </span>
                              )}
                            </div>
                            <div className="mt-1 text-[13px] leading-6 text-ios-sub">{template.description}</div>
                          </div>
                        </div>

                        <div className="mt-4 rounded-[18px] border border-[#edf1f6] bg-[#fbfcfe] px-3 py-3 text-[12px] leading-5 text-ios-sub">
                          {memoTemplateToPreviewText(template)}
                        </div>
                      </button>

                      {personalTemplateIdSet.has(template.id) ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            removePersonalTemplate(template.id)
                          }}
                          aria-label={`${template.label} 템플릿 삭제`}
                          className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#f0d8d8] bg-white text-[#c15b5b] shadow-sm transition hover:bg-[#fff4f4]"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>

                <DialogFooter className="mt-5 gap-2 sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setTemplateDialogOpen(false)}
                    className="inline-flex h-11 items-center justify-center rounded-full border border-gray-200 px-4 text-[13px] font-medium text-ios-sub transition-colors hover:bg-gray-50"
                  >
                    닫기
                  </button>
                </DialogFooter>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={personalTemplateDialogOpen}
          onOpenChange={(open) => {
            setPersonalTemplateDialogOpen(open)
            if (!open) {
              setPersonalTemplateCreateError(null)
            }
          }}
        >
          <DialogContent className="[&>button]:hidden w-[calc(100vw-16px)] max-w-[520px] overflow-hidden rounded-[30px] border-0 bg-white p-0 shadow-[0_30px_80px_rgba(15,23,42,0.18)] sm:w-full">
            <div className="flex max-h-[calc(100dvh-16px)] flex-col rounded-[30px] bg-[linear-gradient(180deg,rgba(250,245,255,0.98)_0%,rgba(255,255,255,0.98)_100%)]">
              <div className="border-b border-white/80 bg-[rgba(255,255,255,0.76)] px-5 pb-4 pt-5 backdrop-blur sm:px-6 sm:pt-6">
                <div className="flex items-start justify-between gap-3">
                  <DialogHeader className="min-w-0 space-y-2 text-left">
                    <DialogTitle className="text-[22px] tracking-[-0.02em] text-ios-text">내 템플릿 만들기</DialogTitle>
                    <DialogDescription className="text-[13px] leading-relaxed text-ios-sub">
                      직접 만든 템플릿은 목록의 가장 앞에 표시되고, 메모 동기화와 함께 내 기기들에 반영됩니다.
                    </DialogDescription>
                  </DialogHeader>

                  <button
                    type="button"
                    onClick={() => setPersonalTemplateDialogOpen(false)}
                    className="inline-flex h-10 shrink-0 items-center justify-center rounded-full border border-[#dde6f0] bg-white px-4 text-[12px] font-semibold text-[#49607b] shadow-sm transition hover:bg-[#f8fbff]"
                  >
                    닫기
                  </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-4 [-webkit-overflow-scrolling:touch] sm:px-6 sm:pb-6">
                <div className="space-y-4">
                  <label className="block">
                    <div className="mb-2 text-[12px] font-semibold text-ios-sub">템플릿 이름</div>
                    <input
                      type="text"
                      value={personalTemplateName}
                      onChange={(event) => setPersonalTemplateName(event.target.value)}
                      placeholder="예: 내 발표 노트"
                      className={cn(
                        "h-11 w-full rounded-2xl border border-gray-200 bg-white px-4 text-ios-text outline-none focus:border-[color:var(--rnest-accent-border)] focus:ring-2 focus:ring-[color:var(--rnest-accent-soft)]",
                        mobileSafeInputClass
                      )}
                    />
                  </label>

                  <label className="block">
                    <div className="mb-2 text-[12px] font-semibold text-ios-sub">설명</div>
                    <textarea
                      value={personalTemplateDescription}
                      onChange={(event) => setPersonalTemplateDescription(event.target.value)}
                      placeholder="템플릿 설명을 입력하세요"
                      className={cn(
                        "min-h-[108px] w-full rounded-[22px] border border-gray-200 bg-white px-4 py-3 text-ios-text outline-none focus:border-[color:var(--rnest-accent-border)] focus:ring-2 focus:ring-[color:var(--rnest-accent-soft)]",
                        mobileSafeInputClass
                      )}
                    />
                  </label>

                  <div>
                    <div className="mb-2 text-[12px] font-semibold text-ios-sub">시작 방식</div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={() => setPersonalTemplateSource("current")}
                        disabled={!canUseActiveMemoAsPersonalTemplate}
                        className={cn(
                          "rounded-[20px] border px-4 py-3 text-left transition",
                          personalTemplateSource === "current"
                            ? "border-[color:var(--rnest-accent-border)] bg-[color:var(--rnest-accent-soft)]"
                            : "border-gray-200 bg-white",
                          !canUseActiveMemoAsPersonalTemplate && "cursor-not-allowed opacity-50"
                        )}
                      >
                        <div className="text-[13px] font-semibold text-ios-text">현재 페이지 기반</div>
                        <div className="mt-1 text-[12px] leading-5 text-ios-sub">
                          {canUseActiveMemoAsPersonalTemplate
                            ? `${getMemoDocumentTitle(activeMemo ?? { title: "", titleHtml: "" }) || "현재 메모"} 내용을 템플릿으로 저장`
                            : "잠금 메모이거나 선택된 페이지가 없어 사용할 수 없습니다"}
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setPersonalTemplateSource("blank")}
                        className={cn(
                          "rounded-[20px] border px-4 py-3 text-left transition",
                          personalTemplateSource === "blank"
                            ? "border-[color:var(--rnest-accent-border)] bg-[color:var(--rnest-accent-soft)]"
                            : "border-gray-200 bg-white"
                        )}
                      >
                        <div className="text-[13px] font-semibold text-ios-text">빈 템플릿 기반</div>
                        <div className="mt-1 text-[12px] leading-5 text-ios-sub">
                          기본 빈 메모를 시작점으로 두고 제목과 설명만 먼저 저장합니다.
                        </div>
                      </button>
                    </div>
                    {personalTemplateSource === "current" && currentTemplateWarningLabels.length > 0 ? (
                      <div className="mt-3 rounded-[18px] border border-[#f6dcb3] bg-[#fff7ea] px-4 py-3 text-[12px] leading-5 text-[#b26a11]">
                        템플릿에서는 {currentTemplateWarningLabels.join(", ")} 블록이 단순 텍스트/링크 형태로 변환되어 저장됩니다.
                      </div>
                    ) : null}
                  </div>

                  {personalTemplateCreateError ? (
                    <div className="rounded-[18px] border border-[#f0d8d8] bg-[#fff5f5] px-4 py-3 text-[12px] leading-5 text-[#b04a4a]">
                      {personalTemplateCreateError}
                    </div>
                  ) : null}
                </div>

                <DialogFooter className="mt-6 gap-2 sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setPersonalTemplateDialogOpen(false)}
                    className="inline-flex h-11 items-center justify-center rounded-full border border-gray-200 px-4 text-[13px] font-medium text-ios-sub transition-colors hover:bg-gray-50"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={createPersonalTemplate}
                    className="inline-flex h-11 items-center justify-center rounded-full bg-[color:var(--rnest-accent)] px-4 text-[13px] font-semibold text-white shadow-[0_16px_36px_rgba(167,139,250,0.22)]"
                  >
                    템플릿 만들기
                  </button>
                </DialogFooter>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={importDialogOpen}
          onOpenChange={(open) => {
            setImportDialogOpen(open)
            if (!open) {
              setImportError(null)
              setImportTextValue("")
            }
          }}
        >
          <DialogContent className="[&>button]:hidden w-[calc(100vw-16px)] max-w-[560px] overflow-hidden rounded-[30px] border-0 bg-white p-0 shadow-[0_30px_80px_rgba(15,23,42,0.18)] sm:w-full">
            <div className="flex max-h-[calc(100dvh-16px)] flex-col rounded-[30px] bg-[linear-gradient(180deg,rgba(250,245,255,0.98)_0%,rgba(255,255,255,0.98)_100%)]">
              <div className="border-b border-white/80 bg-[rgba(255,255,255,0.76)] px-5 pb-4 pt-5 backdrop-blur sm:px-6 sm:pt-6">
                <div className="flex items-start justify-between gap-3">
                  <DialogHeader className="min-w-0 space-y-2 text-left">
                    <DialogTitle className="text-[22px] tracking-[-0.02em] text-ios-text">텍스트 가져오기</DialogTitle>
                    <DialogDescription className="text-[13px] leading-relaxed text-ios-sub">
                      Markdown이나 일반 텍스트를 붙여 넣으면 제목, 목록, 체크리스트, 콜아웃, 토글, 표, 코드, 링크, 페이지 구분선을 문맥에 맞게 블록으로 변환합니다.
                    </DialogDescription>
                  </DialogHeader>

                  <button
                    type="button"
                    onClick={() => setImportDialogOpen(false)}
                    className="inline-flex h-10 shrink-0 items-center justify-center rounded-full border border-[#dde6f0] bg-white px-4 text-[12px] font-semibold text-[#49607b] shadow-sm transition hover:bg-[#f8fbff]"
                  >
                    닫기
                  </button>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-4 [-webkit-overflow-scrolling:touch] sm:px-6 sm:pb-6">
                <textarea
                  value={importTextValue}
                  onChange={(event) => setImportTextValue(event.target.value)}
                  placeholder="여기에 텍스트나 Markdown을 붙여 넣으세요"
                  className={cn(
                    "min-h-[240px] w-full rounded-[24px] border border-gray-200 bg-white px-4 py-4 text-ios-text outline-none focus:border-[color:var(--rnest-accent-border)] focus:ring-2 focus:ring-[color:var(--rnest-accent-soft)]",
                    mobileSafeInputClass
                  )}
                />
                {importError ? (
                  <div className="mt-3 rounded-[18px] border border-[#f0d8d8] bg-[#fff5f5] px-4 py-3 text-[12px] leading-5 text-[#b04a4a]">
                    {importError}
                  </div>
                ) : (
                  <div className="mt-3 rounded-[18px] border border-[#edf1f6] bg-[#fbfcfe] px-4 py-3 text-[12px] leading-5 text-ios-muted">
                    코드 펜스, ATX/setext 제목, 목록, 체크리스트, 인용/콜아웃, details 토글, 표 정렬, URL/Markdown 링크, 페이지 구분선 주석을 자동으로 해석합니다.
                  </div>
                )}

                <DialogFooter className="mt-5 gap-2 sm:justify-end">
                  <button
                    type="button"
                    onClick={() => setImportDialogOpen(false)}
                    className="inline-flex h-11 items-center justify-center rounded-full border border-gray-200 px-4 text-[13px] font-medium text-ios-sub transition-colors hover:bg-gray-50"
                  >
                    취소
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const nextValue = importTextValue.trim()
                      if (!nextValue) {
                        setImportError("가져올 텍스트를 입력해 주세요.")
                        return
                      }
                      void appendImportedBlocks(nextValue, "가져온 내용을")
                    }}
                    className="inline-flex h-11 items-center justify-center rounded-full bg-[color:var(--rnest-accent)] px-4 text-[13px] font-semibold text-white shadow-[0_16px_36px_rgba(167,139,250,0.22)]"
                  >
                    블록으로 가져오기
                  </button>
                </DialogFooter>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={lockDialogOpen}
          onOpenChange={(open) => {
            setLockDialogOpen(open)
            if (!open) {
              setLockError(null)
              setLockPassword("")
              setLockPasswordConfirm("")
            }
          }}
        >
          <DialogContent className="rounded-[28px] border-0 bg-white p-0 shadow-[0_30px_80px_rgba(15,23,42,0.18)] sm:max-w-[480px]">
            <div className="rounded-[28px] bg-[linear-gradient(180deg,rgba(250,245,255,0.98)_0%,rgba(255,255,255,0.98)_100%)] p-6">
              <DialogHeader>
                <DialogTitle className="text-[22px] tracking-[-0.02em] text-ios-text">잠금 메모 설정</DialogTitle>
                <DialogDescription className="text-[13px] leading-relaxed text-ios-sub">
                  본문, 태그, 첨부 목록을 암호화해 보호합니다. 제목과 아이콘은 목록에서 보이도록 남겨둡니다.
                </DialogDescription>
              </DialogHeader>

              <div className="mt-5 space-y-3">
                <input
                  type="password"
                  value={lockPassword}
                  onChange={(event) => setLockPassword(event.target.value)}
                  placeholder="암호 입력"
                  className={cn(
                    "h-11 w-full rounded-2xl border border-gray-200 bg-white px-4 text-ios-text outline-none focus:border-[color:var(--rnest-accent-border)] focus:ring-2 focus:ring-[color:var(--rnest-accent-soft)]",
                    mobileSafeInputClass
                  )}
                />
                <input
                  type="password"
                  value={lockPasswordConfirm}
                  onChange={(event) => setLockPasswordConfirm(event.target.value)}
                  placeholder="암호 확인"
                  className={cn(
                    "h-11 w-full rounded-2xl border border-gray-200 bg-white px-4 text-ios-text outline-none focus:border-[color:var(--rnest-accent-border)] focus:ring-2 focus:ring-[color:var(--rnest-accent-soft)]",
                    mobileSafeInputClass
                  )}
                />
                <input
                  type="text"
                  value={lockHint}
                  onChange={(event) => setLockHint(event.target.value)}
                  placeholder="힌트 (선택)"
                  className={cn(
                    "h-11 w-full rounded-2xl border border-gray-200 bg-white px-4 text-ios-text outline-none focus:border-[color:var(--rnest-accent-border)] focus:ring-2 focus:ring-[color:var(--rnest-accent-soft)]",
                    mobileSafeInputClass
                  )}
                />
                {lockError && <p className="text-[12px] text-red-500">{lockError}</p>}
              </div>

              <DialogFooter className="mt-6 gap-2 sm:justify-end">
                <button
                  type="button"
                  onClick={() => setLockDialogOpen(false)}
                  className="inline-flex h-11 items-center justify-center rounded-full border border-gray-200 px-4 text-[13px] font-medium text-ios-sub transition-colors hover:bg-gray-50"
                >
                  취소
                </button>
                <button
                  type="button"
                  disabled={lockBusy}
                  onClick={() => {
                    void confirmLockMemo()
                  }}
                  className="inline-flex h-11 items-center justify-center rounded-full bg-[color:var(--rnest-accent-soft)] px-5 text-[13px] font-medium text-[color:var(--rnest-accent)] transition-colors hover:bg-[color:var(--rnest-accent-soft)]/80 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {lockBusy ? "설정 중..." : "잠금 설정"}
                </button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={unlockDialogOpen}
          onOpenChange={(open) => {
            setUnlockDialogOpen(open)
            if (!open) {
              setUnlockError(null)
              setUnlockPassword("")
            }
          }}
        >
          <DialogContent className="rounded-[28px] border-0 bg-white p-0 shadow-[0_30px_80px_rgba(15,23,42,0.18)] sm:max-w-[440px]">
            <div className="rounded-[28px] bg-[linear-gradient(180deg,rgba(250,245,255,0.98)_0%,rgba(255,255,255,0.98)_100%)] p-6">
              <DialogHeader>
                <DialogTitle className="text-[22px] tracking-[-0.02em] text-ios-text">잠금 메모 열기</DialogTitle>
                <DialogDescription className="text-[13px] leading-relaxed text-ios-sub">
                  암호를 입력하면 이 세션에서만 메모 내용이 열립니다. 페이지를 벗어나면 다시 잠깁니다.
                </DialogDescription>
              </DialogHeader>

              {activeMemoRaw?.lock?.hint && (
                <div className="mt-4 rounded-2xl border border-[color:var(--rnest-accent-border)] bg-[color:var(--rnest-accent-soft)]/60 px-4 py-3 text-[12px] text-ios-sub">
                  힌트: {activeMemoRaw.lock.hint}
                </div>
              )}

              <div className="mt-4 space-y-3">
                <input
                  type="password"
                  value={unlockPassword}
                  onChange={(event) => setUnlockPassword(event.target.value)}
                  placeholder="암호 입력"
                  className={cn(
                    "h-11 w-full rounded-2xl border border-gray-200 bg-white px-4 text-ios-text outline-none focus:border-[color:var(--rnest-accent-border)] focus:ring-2 focus:ring-[color:var(--rnest-accent-soft)]",
                    mobileSafeInputClass
                  )}
                />
                {unlockError && <p className="text-[12px] text-red-500">{unlockError}</p>}
              </div>

              <DialogFooter className="mt-6 gap-2 sm:justify-end">
                <button
                  type="button"
                  onClick={() => setUnlockDialogOpen(false)}
                  className="inline-flex h-11 items-center justify-center rounded-full border border-gray-200 px-4 text-[13px] font-medium text-ios-sub transition-colors hover:bg-gray-50"
                >
                  취소
                </button>
                <button
                  type="button"
                  disabled={unlockBusy}
                  onClick={() => {
                    void confirmUnlockMemo()
                  }}
                  className="inline-flex h-11 items-center justify-center rounded-full bg-[color:var(--rnest-accent-soft)] px-5 text-[13px] font-medium text-[color:var(--rnest-accent)] transition-colors hover:bg-[color:var(--rnest-accent-soft)]/80 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {unlockBusy ? "여는 중..." : "잠금 해제"}
                </button>
              </DialogFooter>
            </div>
          </DialogContent>
        </Dialog>

        {/* toast */}
        {toast && (
          <div className="pointer-events-none fixed bottom-8 left-1/2 z-50 -translate-x-1/2">
            <div className="rounded-xl bg-gray-800 px-5 py-2.5 text-[13px] font-medium text-white shadow-lg">
              {toast}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default ToolNotebookPage
