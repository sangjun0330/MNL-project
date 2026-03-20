import type { RNestMemoBlock } from "@/lib/notebook"

export type MeasuredPdfBlockBounds = {
  blockId: string
  top: number
  bottom: number
  height: number
}

export type ResolvedPdfLayoutKey = string

export type ResolvedPdfBlockPlacement = {
  blockId: string
  pageNumber: number
  sliceStartY: number
  sliceEndY: number
  blockTop: number
  blockBottom: number
  startsPage: boolean
  endsPage: boolean
  isSplit: boolean
}

export type ResolvedPdfPage = {
  pageNumber: number
  startY: number
  endY: number
  height: number
  blockIds: string[]
  firstBlockId?: string
  lastBlockId?: string
  hardBreakBeforeBlockId?: string
}

export type ResolvedPdfLayout = {
  key: ResolvedPdfLayoutKey
  totalHeight: number
  pageHeightPx: number
  pages: ResolvedPdfPage[]
  placements: ResolvedPdfBlockPlacement[]
}

type OrderedMeasuredBlock = MeasuredPdfBlockBounds & {
  order: number
  startsNextPdfPage: boolean
}

type ResolvePdfLayoutInput = {
  layoutKey: ResolvedPdfLayoutKey
  totalHeight: number
  pageHeightPx: number
  sourceBlocks: RNestMemoBlock[]
  measuredBlocks: Record<string, MeasuredPdfBlockBounds | undefined>
  minPageHeightPx?: number
}

function isNextPageSpacer(block: RNestMemoBlock | null | undefined) {
  return block?.type === "pageSpacer" && block.spacerMode !== "blank-space"
}

function buildOrderedMeasuredBlocks(
  sourceBlocks: RNestMemoBlock[],
  measuredBlocks: Record<string, MeasuredPdfBlockBounds | undefined>
) {
  const ordered: OrderedMeasuredBlock[] = []

  for (let index = 0; index < sourceBlocks.length; index += 1) {
    const block = sourceBlocks[index]
    if (!block || block.type === "pageSpacer") continue
    const measured = measuredBlocks[block.id]
    if (!measured) continue

    let startsNextPdfPage = false
    for (let cursor = index - 1; cursor >= 0 && sourceBlocks[cursor]?.type === "pageSpacer"; cursor -= 1) {
      if (isNextPageSpacer(sourceBlocks[cursor])) {
        startsNextPdfPage = true
        break
      }
    }

    ordered.push({
      ...measured,
      order: ordered.length,
      startsNextPdfPage,
    })
  }

  return ordered
}

function buildPagePlacements(page: ResolvedPdfPage, blocks: OrderedMeasuredBlock[]): ResolvedPdfBlockPlacement[] {
  return blocks
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
}

function getHardBreakWithinRange(
  blocks: OrderedMeasuredBlock[],
  startY: number,
  endY: number
) {
  return blocks.find((block) => block.startsNextPdfPage && block.top > startY + 0.5 && block.top < endY - 0.5) ?? null
}

function getOverflowBlock(
  blocks: OrderedMeasuredBlock[],
  startY: number,
  endY: number
) {
  return blocks.find((block) => block.top < endY - 0.5 && block.bottom > endY + 0.5) ?? null
}

export function buildResolvedPdfLayoutKey(input: {
  docId: string
  updatedAt: number
  captureWidth: number
  pageHeightPx: number
  totalHeight: number
}) {
  return [
    input.docId,
    input.updatedAt,
    Math.round(input.captureWidth),
    Math.round(input.pageHeightPx),
    Math.round(input.totalHeight),
  ].join(":")
}

export function resolvePdfLayout(input: ResolvePdfLayoutInput): ResolvedPdfLayout {
  const totalHeight = Math.max(1, Math.ceil(input.totalHeight))
  const pageHeightPx = Math.max(1, Math.floor(input.pageHeightPx))
  const minPageHeightPx = Math.max(32, Math.floor(input.minPageHeightPx ?? 96))
  const orderedBlocks = buildOrderedMeasuredBlocks(input.sourceBlocks, input.measuredBlocks)

  if (orderedBlocks.length === 0) {
    return {
      key: input.layoutKey,
      totalHeight,
      pageHeightPx,
      pages: [
        {
          pageNumber: 1,
          startY: 0,
          endY: totalHeight,
          height: totalHeight,
          blockIds: [],
        },
      ],
      placements: [],
    }
  }

  const pages: ResolvedPdfPage[] = []
  const placements: ResolvedPdfBlockPlacement[] = []
  let pageStartY = 0
  let pageNumber = 1

  while (pageStartY < totalHeight - 0.5) {
    const maxPageEndY = Math.min(totalHeight, pageStartY + pageHeightPx)
    const hardBreak = getHardBreakWithinRange(orderedBlocks, pageStartY, maxPageEndY)

    let pageEndY = hardBreak ? hardBreak.top : maxPageEndY
    if (!hardBreak) {
      const overflowBlock = getOverflowBlock(orderedBlocks, pageStartY, maxPageEndY)
      if (overflowBlock) {
        const canCutBeforeOverflow = overflowBlock.top - pageStartY >= minPageHeightPx
        pageEndY = canCutBeforeOverflow ? overflowBlock.top : maxPageEndY
      }
    }

    if (pageEndY <= pageStartY + 0.5) {
      pageEndY = maxPageEndY
    }

    const pageBlocks = orderedBlocks.filter((block) => block.bottom > pageStartY + 0.5 && block.top < pageEndY - 0.5)
    const page: ResolvedPdfPage = {
      pageNumber,
      startY: pageStartY,
      endY: pageEndY,
      height: Math.max(1, pageEndY - pageStartY),
      blockIds: pageBlocks.map((block) => block.blockId),
      firstBlockId: pageBlocks[0]?.blockId,
      lastBlockId: pageBlocks[pageBlocks.length - 1]?.blockId,
      hardBreakBeforeBlockId: hardBreak?.blockId,
    }

    pages.push(page)
    placements.push(...buildPagePlacements(page, orderedBlocks))

    if (pageEndY >= totalHeight - 0.5) {
      break
    }

    pageStartY = pageEndY
    pageNumber += 1
  }

  return {
    key: input.layoutKey,
    totalHeight,
    pageHeightPx,
    pages,
    placements,
  }
}
