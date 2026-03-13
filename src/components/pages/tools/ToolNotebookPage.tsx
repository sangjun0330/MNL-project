"use client"

import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  ArrowDownAZ,
  ArrowUpDown,
  Bell,
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
  coerceMemoBlockType,
  createMemoBlock,
  createMemoFromPreset,
  createMemoTableRow,
  formatNotebookDateTime,
  getReminderTimestampFromPreset,
  memoBlockToPlainText,
  memoCoverOptions,
  memoHighlightColors,
  memoIconOptions,
  memoDocumentToMarkdown,
  memoDocumentToPlainText,
  memoPresets,
  memoReminderPresets,
  sanitizeNotebookTags,
  type RNestMemoBlock,
  type RNestMemoAttachment,
  type RNestMemoBlockType,
  type RNestMemoCoverId,
  type RNestMemoDocument,
  type RNestMemoFolder,
  type RNestMemoHighlightColor,
  type RNestMemoIconId,
  type RNestMemoState,
} from "@/lib/notebook"
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
  deleteNotebookFiles,
  getCachedNotebookImagePreview,
  loadNotebookImagePreview,
  seedNotebookImagePreview,
  uploadNotebookFile,
} from "@/lib/notebookFiles"
import { useAppStore } from "@/lib/store"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import Image from "next/image"
import Link from "next/link"

/* ─── helpers ──────────────────────────────────────────────── */

function insertRecent(list: string[], id: string, limit = 20) {
  return [id, ...list.filter((item) => item !== id)].slice(0, limit)
}

function downloadTextFile(fileName: string, content: string, mimeType: string) {
  if (typeof window === "undefined") return
  const blob = new Blob([content], { type: mimeType })
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.style.display = "none"
  a.href = url
  a.download = fileName.replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60) || "memo"
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.URL.revokeObjectURL(url)
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
  return Array.from(new Set(doc.blocks.map((block) => block.attachmentId).filter((value): value is string => Boolean(value))))
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
  paragraph: "텍스트",
  heading: "제목",
  bulleted: "글머리 기호",
  numbered: "번호 목록",
  checklist: "할 일 목록",
  callout: "콜아웃",
  quote: "인용",
  toggle: "토글",
  divider: "구분선",
  table: "표",
  bookmark: "링크",
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
  { id: "divider", label: "구분선", description: "섹션 나누기", blockType: "divider" },
  { id: "table", label: "표", description: "간단한 2열 표", blockType: "table" },
  { id: "duplicate", label: "블록 복제", description: "현재 블록을 복사", action: "duplicate" },
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
  const raw = String(rawValue ?? "").trim()
  if (!raw) return null
  const candidate = /^(https?:\/\/|mailto:)/i.test(raw) ? raw : raw.startsWith("www.") ? `https://${raw}` : ""
  if (!candidate) return null
  try {
    const url = new URL(candidate)
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? url.toString() : null
  } catch {
    return null
  }
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

function renderBlockTypeIcon(type: RNestMemoBlockType, className = "h-3.5 w-3.5") {
  const props = { className, strokeWidth: 1.8 }
  switch (type) {
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
    case "table":
      return <Table2 {...props} />
    case "bookmark":
      return <Link2 {...props} />
    case "image":
      return <ImageIcon {...props} />
    case "attachment":
      return <Paperclip {...props} />
    default:
      return <Type {...props} />
  }
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
  listKey,
  onClick,
  draggable = false,
  isDragging = false,
  className,
  onDragStart,
  onDragEnd,
}: {
  doc: RNestMemoDocument
  summary: string
  isActive: boolean
  isLocked: boolean
  listKey: string
  onClick: () => void
  draggable?: boolean
  isDragging?: boolean
  className?: string
  onDragStart?: React.DragEventHandler<HTMLButtonElement>
  onDragEnd?: React.DragEventHandler<HTMLButtonElement>
}) {
  const itemRef = useRef<HTMLButtonElement>(null)

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

  return (
    <button
      ref={itemRef}
      type="button"
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={cn(
        "group flex w-full items-start gap-2 rounded-xl px-2 py-2 text-left transition-colors",
        draggable && "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-45",
        isActive
          ? "bg-[color:var(--rnest-accent-soft)] text-ios-text"
          : "text-ios-sub hover:bg-gray-100",
        className
      )}
    >
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white text-ios-sub shadow-[inset_0_0_0_1px_rgba(148,163,184,0.16)]">
        {renderMemoIcon(doc.icon, "h-4 w-4")}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-medium text-ios-text">{doc.title || "제목 없음"}</span>
        <span className="block truncate pt-0.5 text-[11.5px] text-ios-muted">
          {summary || "비어 있는 메모"}
        </span>
      </span>
      <span className="mt-0.5 flex shrink-0 items-center gap-1 text-ios-muted">
        {doc.pinned && <Pin className="h-3 w-3 text-[color:var(--rnest-accent)]" />}
        {isLocked && <Lock className="h-3 w-3" />}
        {doc.favorite && (
          <Star className="h-3 w-3 fill-current text-[color:var(--rnest-accent)] opacity-60" />
        )}
      </span>
    </button>
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

function BlockTypeMenu({
  currentType,
  onSelect,
  onClose,
}: {
  currentType: RNestMemoBlockType
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

  const types: RNestMemoBlockType[] = [
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

  return (
    <div
      ref={ref}
      className="absolute left-0 top-full z-30 mt-1 w-48 rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
    >
      {types.map((type) => (
        <button
          key={type}
          type="button"
          onClick={() => { onSelect(type); onClose() }}
          className={cn(
            "flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors",
            type === currentType
              ? "bg-[color:var(--rnest-accent-soft)] text-[color:var(--rnest-accent)]"
              : "text-ios-text hover:bg-gray-50"
          )}
        >
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-gray-100 text-ios-sub">
            {renderBlockTypeIcon(type, "h-3.5 w-3.5")}
          </span>
          {blockTypeLabels[type]}
        </button>
      ))}
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
  const containerRef = useRef<HTMLDivElement>(null)
  const [resizing, setResizing] = useState(false)
  const [imgHovered, setImgHovered] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [previewWidthPct, setPreviewWidthPct] = useState(() => clampImageWidth(block.mediaWidth))
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(() => {
    if (attachment?.storagePath) {
      return getCachedNotebookImagePreview(attachment.storagePath) ?? attachmentUrl ?? null
    }
    return attachmentUrl ?? null
  })
  const startDataRef = useRef<{ startX: number; startY: number; startW: number; startH: number; handle: string } | null>(null)
  const previewWidthRef = useRef(previewWidthPct)
  const pendingWidthRef = useRef(previewWidthPct)
  const resizeFrameRef = useRef<number | null>(null)

  const aspectRatio = clampImageAspectRatio(block.mediaAspectRatio)

  useEffect(() => {
    previewWidthRef.current = previewWidthPct
    pendingWidthRef.current = previewWidthPct
  }, [previewWidthPct])

  useEffect(() => {
    if (!resizing) {
      const nextWidth = clampImageWidth(block.mediaWidth)
      previewWidthRef.current = nextWidth
      pendingWidthRef.current = nextWidth
      setPreviewWidthPct(nextWidth)
    }
  }, [block.mediaWidth, resizing])

  useEffect(() => {
    setLoadError(false)
  }, [attachment?.id, resolvedSrc])

  useEffect(() => {
    let cancelled = false
    const storagePath = attachment?.storagePath

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

    void loadNotebookImagePreview(storagePath)
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
  }, [attachment?.storagePath, attachmentUrl])

  useEffect(() => {
    return () => {
      if (resizeFrameRef.current != null) {
        window.cancelAnimationFrame(resizeFrameRef.current)
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

  function handleResizeStart(e: React.PointerEvent, handle: string) {
    e.preventDefault()
    e.stopPropagation()
    const imgEl = containerRef.current
    if (!imgEl) return
    const rect = imgEl.getBoundingClientRect()
    startDataRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startW: rect.width,
      startH: rect.height,
      handle,
    }
    setResizing(true)

    function handleMove(ev: PointerEvent) {
      if (!startDataRef.current || !containerRef.current) return
      const parentEl = containerRef.current.parentElement
      if (!parentEl) return
      const parentWidth = parentEl.getBoundingClientRect().width
      const { startX, startW, handle: h } = startDataRef.current
      const dx = ev.clientX - startX
      const isLeft = h.includes("l")
      const effectiveDx = isLeft ? -dx : dx
      const newW = Math.max(100, startW + effectiveDx)
      const newPct = Math.min(100, Math.max(20, Math.round((newW / parentWidth) * 100)))
      schedulePreviewWidth(newPct)
    }

    function handleUp() {
      const nextWidth = previewWidthRef.current
      startDataRef.current = null
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

  const showHandles = imgHovered || resizing

  const handleClass =
    "absolute z-10 rounded-full border-2 border-[color:var(--rnest-accent)] bg-white shadow-sm transition-opacity [touch-action:none]"

  return (
    <div>
      {resolvedSrc && !loadError ? (
        <div
          className="relative inline-block"
          style={{
            width: `${previewWidthPct}%`,
            willChange: resizing ? "width" : undefined,
            transition: resizing ? "none" : "width 220ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 220ms ease",
          }}
          ref={containerRef}
          onMouseEnter={() => setImgHovered(true)}
          onMouseLeave={() => { if (!resizing) setImgHovered(false) }}
          onPointerDown={() => setImgHovered(true)}
        >
          <div
            className={cn(
              "relative overflow-hidden rounded-lg",
              resizing && "select-none shadow-[0_18px_36px_rgba(123,111,208,0.14)]"
            )}
            style={{ aspectRatio: String(aspectRatio) }}
          >
            <Image
              src={resolvedSrc}
              alt={block.text || attachment?.name || "메모 이미지"}
              fill
              unoptimized
              className="pointer-events-none select-none object-cover"
              sizes="(max-width: 1024px) 92vw, 720px"
              draggable={false}
              onLoad={(event) => {
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
                if (attachmentUrl && resolvedSrc !== attachmentUrl) {
                  setResolvedSrc(attachmentUrl)
                  return
                }
                setLoadError(true)
              }}
            />
          </div>
          {/* resize handles at corners and edges */}
          {showHandles && (
            <>
              {/* corner handles */}
              <div
                onPointerDown={(e) => handleResizeStart(e, "tl")}
                className={cn(handleClass, "-left-1.5 -top-1.5 h-3 w-3 cursor-nwse-resize", showHandles ? "opacity-100" : "opacity-0")}
              />
              <div
                onPointerDown={(e) => handleResizeStart(e, "tr")}
                className={cn(handleClass, "-right-1.5 -top-1.5 h-3 w-3 cursor-nesw-resize", showHandles ? "opacity-100" : "opacity-0")}
              />
              <div
                onPointerDown={(e) => handleResizeStart(e, "bl")}
                className={cn(handleClass, "-bottom-1.5 -left-1.5 h-3 w-3 cursor-nesw-resize", showHandles ? "opacity-100" : "opacity-0")}
              />
              <div
                onPointerDown={(e) => handleResizeStart(e, "br")}
                className={cn(handleClass, "-bottom-1.5 -right-1.5 h-3 w-3 cursor-nwse-resize", showHandles ? "opacity-100" : "opacity-0")}
              />
              {/* edge handles */}
              <div
                onPointerDown={(e) => handleResizeStart(e, "l")}
                className={cn(handleClass, "-left-1.5 top-1/2 h-6 w-2 -translate-y-1/2 cursor-ew-resize rounded-full", showHandles ? "opacity-100" : "opacity-0")}
              />
              <div
                onPointerDown={(e) => handleResizeStart(e, "r")}
                className={cn(handleClass, "-right-1.5 top-1/2 h-6 w-2 -translate-y-1/2 cursor-ew-resize rounded-full", showHandles ? "opacity-100" : "opacity-0")}
              />
            </>
          )}
        </div>
      ) : (
        <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-gray-200 bg-gray-50 text-[13px] text-ios-muted">
          {loadError ? "이미지를 불러오지 못했습니다" : "이미지를 불러오는 중..."}
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

function InlineBlock({
  block,
  attachment,
  attachmentUrl,
  onChange,
  onDelete,
  onRemoveAttachment,
  onOpenAttachment,
  onDuplicate,
  onTypeChange,
  onAddAfter,
  onInsertAsset,
  onMoveUp,
  onMoveDown,
  onHighlight,
  isFirst,
  isLast,
}: {
  block: RNestMemoBlock
  attachment: RNestMemoAttachment | null
  attachmentUrl?: string
  onChange: (b: RNestMemoBlock) => void
  onDelete: () => void
  onRemoveAttachment: () => void
  onOpenAttachment: () => void
  onDuplicate: () => void
  onTypeChange: (t: RNestMemoBlockType) => void
  onAddAfter: (type?: RNestMemoBlockType) => void
  onInsertAsset: (kind: "image" | "attachment") => void
  onMoveUp: () => void
  onMoveDown: () => void
  onHighlight: (color: RNestMemoHighlightColor | null) => void
  isFirst: boolean
  isLast: boolean
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
  const desktopControlsVisible = hovered || focused || showAddMenu || showActionMenu
  const mobileControlsVisible = !focused && (showAddMenu || showActionMenu || touchActive)

  function handleBlockMouseEnter() {
    if (hoverTimeoutRef.current) { clearTimeout(hoverTimeoutRef.current); hoverTimeoutRef.current = null }
    setHovered(true)
  }
  function handleBlockMouseLeave() {
    // Delay hide so controls stay stable while moving between controls and block content
    hoverTimeoutRef.current = setTimeout(() => setHovered(false), 120)
  }

  useEffect(() => {
    return () => { if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current) }
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
    handleCommandKeyDown(e)
    if (e.defaultPrevented) return
    const currentValue = "value" in e.currentTarget ? String(e.currentTarget.value ?? "") : ""
    if (e.key === "/" && currentValue.trim().length === 0) {
      e.preventDefault()
      setShowSlashMenu(true)
    }
  }

  return (
    <div
      ref={rootRef}
      id={`memo-block-${block.id}`}
      className="group/block relative scroll-mt-28"
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
          mobileControlsVisible ? "pointer-events-auto opacity-100" : "pointer-events-none h-0 overflow-hidden opacity-0 lg:h-auto lg:overflow-visible",
          desktopControlsVisible ? "lg:pointer-events-auto lg:opacity-100" : "lg:pointer-events-none lg:opacity-0"
        )}
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
            <div className="absolute left-0 top-full z-40 mt-2 w-56 max-w-[calc(100vw-6rem)] rounded-2xl border border-gray-200 bg-white py-1.5 shadow-[0_18px_40px_rgba(15,23,42,0.14)]">
              <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-ios-muted">
                아래에 새 블록
              </div>
              {(
                [
                  "paragraph",
                  "heading",
                  "bulleted",
                  "numbered",
                  "checklist",
                  "callout",
                  "quote",
                  "toggle",
                  "bookmark",
                  "image",
                  "attachment",
                  "divider",
                  "table",
                ] as RNestMemoBlockType[]
              ).map((type) => (
                <button
                  key={`add-below-${type}`}
                  type="button"
                  onClick={() => {
                    if (type === "image" || type === "attachment") onInsertAsset(type)
                    else onAddAfter(type)
                    setShowAddMenu(false)
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-ios-text transition-colors hover:bg-gray-50"
                >
                  <span className="inline-flex h-5 w-5 items-center justify-center rounded text-ios-sub">
                    {renderBlockTypeIcon(type, "h-3 w-3")}
                  </span>
                  {blockTypeLabels[type]} 추가
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="relative" ref={actionMenuRef}>
          <button
            type="button"
            onClick={() => {
              setShowActionMenu((current) => !current)
              setShowAddMenu(false)
            }}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-400 shadow-[0_8px_18px_rgba(15,23,42,0.06)] transition-colors lg:h-7 lg:w-7 lg:rounded-lg lg:border-transparent lg:bg-transparent lg:shadow-none",
              showActionMenu
                ? "bg-gray-100 text-[color:var(--rnest-accent)]"
                : "hover:bg-gray-100 hover:text-gray-600"
            )}
            title="현재 블록 설정"
            aria-label="현재 블록 설정"
            aria-expanded={showActionMenu}
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
          {showActionMenu && (
            <div className="absolute left-0 top-full z-40 mt-2 w-56 max-w-[calc(100vw-6rem)] rounded-2xl border border-gray-200 bg-white py-1.5 shadow-[0_18px_40px_rgba(15,23,42,0.14)]">
              <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-ios-muted">
                현재 블록 설정
              </div>
              {(Object.keys(blockTypeLabels) as RNestMemoBlockType[])
                .filter((type) => type !== "image" && type !== "attachment")
                .map((type) => (
                  <button
                    key={`convert-${type}`}
                    type="button"
                    onClick={() => {
                      onTypeChange(type)
                      setShowActionMenu(false)
                    }}
                    className={cn(
                      "flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] transition-colors",
                      type === block.type
                        ? "bg-[color:var(--rnest-accent-soft)] text-[color:var(--rnest-accent)]"
                        : "text-ios-text hover:bg-gray-50"
                    )}
                  >
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded text-ios-sub">
                      {renderBlockTypeIcon(type, "h-3 w-3")}
                    </span>
                    {blockTypeLabels[type]}로 변경
                  </button>
                ))}
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
          <input
            type="text"
            value={block.text ?? ""}
            onChange={(e) => onChange({ ...block, text: e.target.value })}
            onKeyDown={handleEditorKeyDown}
            placeholder="제목"
            className="w-full border-none bg-transparent text-[22px] font-bold tracking-[-0.02em] text-ios-text outline-none placeholder:text-gray-300"
            style={{ fontSize: "max(16px, 22px)" }}
          />
        )}

        {block.type === "paragraph" && (
          <textarea
            ref={autoSizeRef}
            value={block.text ?? ""}
            onChange={(e) => onChange({ ...block, text: e.target.value })}
            onKeyDown={handleEditorKeyDown}
            placeholder="내용을 입력하세요..."
            rows={1}
            className={cn(
              "w-full resize-none border-none bg-transparent leading-relaxed text-ios-text outline-none placeholder:text-gray-300",
              mobileSafeBodyClass
            )}
            style={{ minHeight: "1.6em", height: "auto" }}
            onInput={(e) => {
              const el = e.currentTarget
              el.style.height = "auto"
              el.style.height = `${el.scrollHeight}px`
            }}
          />
        )}

        {block.type === "bulleted" && (
          <div className="flex gap-2">
            <span className="mt-[7px] inline-flex shrink-0 items-center justify-center text-ios-sub">
              <svg viewBox="0 0 8 8" className="h-2.5 w-2.5 fill-current" aria-hidden="true">
                <circle cx="4" cy="4" r="2.2" />
              </svg>
            </span>
            <textarea
              ref={autoSizeRef}
              value={block.text ?? ""}
              onChange={(e) => onChange({ ...block, text: e.target.value })}
              onKeyDown={handleEditorKeyDown}
              placeholder="목록 항목"
              rows={1}
              className={cn(
                "w-full resize-none border-none bg-transparent leading-relaxed text-ios-text outline-none placeholder:text-gray-300",
                mobileSafeBodyClass
              )}
              style={{ minHeight: "1.6em", height: "auto" }}
              onInput={(e) => {
                const el = e.currentTarget
                el.style.height = "auto"
                el.style.height = `${el.scrollHeight}px`
              }}
            />
          </div>
        )}

        {block.type === "numbered" && (
          <div className="flex gap-2">
            <span className="mt-[2px] shrink-0 text-[15px] leading-relaxed text-ios-sub">1.</span>
            <textarea
              ref={autoSizeRef}
              value={block.text ?? ""}
              onChange={(e) => onChange({ ...block, text: e.target.value })}
              onKeyDown={handleEditorKeyDown}
              placeholder="번호 항목"
              rows={1}
              className={cn(
                "w-full resize-none border-transparent bg-transparent leading-relaxed text-ios-text outline-none placeholder:text-gray-300",
                mobileSafeBodyClass
              )}
              style={{ minHeight: "1.6em", height: "auto" }}
              onInput={(e) => {
                const el = e.currentTarget
                el.style.height = "auto"
                el.style.height = `${el.scrollHeight}px`
              }}
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
            <textarea
              ref={autoSizeRef}
              value={block.text ?? ""}
              onChange={(e) => onChange({ ...block, text: e.target.value })}
              onKeyDown={handleEditorKeyDown}
              placeholder="할 일"
              rows={1}
              className={cn(
                "w-full resize-none border-none bg-transparent leading-relaxed outline-none placeholder:text-gray-300",
                mobileSafeBodyClass,
                block.checked ? "text-ios-muted line-through" : "text-ios-text"
              )}
              style={{ minHeight: "1.6em", height: "auto" }}
              onInput={(e) => {
                const el = e.currentTarget
                el.style.height = "auto"
                el.style.height = `${el.scrollHeight}px`
              }}
            />
          </div>
        )}

        {block.type === "callout" && (
          <div className="flex gap-3 rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
            <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--rnest-accent)]" />
            <textarea
              ref={autoSizeRef}
              value={block.text ?? ""}
              onChange={(e) => onChange({ ...block, text: e.target.value })}
              onKeyDown={handleEditorKeyDown}
              placeholder="콜아웃 내용을 입력하세요"
              rows={1}
              className={cn(
                "w-full resize-none border-none bg-transparent leading-relaxed text-ios-text outline-none placeholder:text-gray-300",
                "text-[16px] md:text-[14.5px]"
              )}
              style={{ minHeight: "1.6em", height: "auto" }}
              onInput={(e) => {
                const el = e.currentTarget
                el.style.height = "auto"
                el.style.height = `${el.scrollHeight}px`
              }}
            />
          </div>
        )}

        {block.type === "quote" && (
          <div className="flex gap-3 rounded-r-lg border-l-[3px] border-[color:var(--rnest-accent-border)] bg-[color:var(--rnest-accent-soft)]/45 px-4 py-3">
            <MessageSquareQuote className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--rnest-accent)]" />
            <textarea
              ref={autoSizeRef}
              value={block.text ?? ""}
              onChange={(e) => onChange({ ...block, text: e.target.value })}
              onKeyDown={handleEditorKeyDown}
              placeholder="인용하거나 강조할 문장을 적어 두세요"
              rows={1}
              className={cn(
                "w-full resize-none border-none bg-transparent leading-relaxed text-ios-text outline-none placeholder:text-gray-300",
                "text-[16px] md:text-[14.5px]"
              )}
              style={{ minHeight: "1.6em", height: "auto" }}
              onInput={(e) => {
                const el = e.currentTarget
                el.style.height = "auto"
                el.style.height = `${el.scrollHeight}px`
              }}
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
              <input
                type="text"
                value={block.text ?? ""}
                onChange={(e) => onChange({ ...block, text: e.target.value })}
                onKeyDown={handleEditorKeyDown}
                placeholder="토글 제목"
                className={cn(
                  "w-full border-none bg-transparent font-medium text-ios-text outline-none placeholder:text-gray-300",
                  mobileSafeInputClass
                )}
              />
            </div>
            {!block.collapsed && (
              <div className="border-t border-gray-100 px-4 py-3">
                <textarea
                  ref={autoSizeRef}
                  value={block.detailText ?? ""}
                  onChange={(e) => onChange({ ...block, detailText: e.target.value })}
                  onKeyDown={handleCommandKeyDown}
                  placeholder="토글 안쪽 내용을 입력하세요"
                  rows={2}
                  className={cn(
                    "w-full resize-none border-none bg-transparent leading-relaxed text-ios-text outline-none placeholder:text-gray-300",
                    mobileSafeInputClass
                  )}
                  style={{ minHeight: "3.2em", height: "auto" }}
                  onInput={(e) => {
                    const el = e.currentTarget
                    el.style.height = "auto"
                    el.style.height = `${el.scrollHeight}px`
                  }}
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
                  onKeyDown={handleCommandKeyDown}
                  placeholder="https://example.com"
                  className={cn(
                    "w-full border-none bg-transparent font-medium text-ios-text outline-none placeholder:text-gray-300",
                    mobileSafeInputClass
                  )}
                />
                <input
                  type="text"
                  value={block.detailText ?? ""}
                  onChange={(e) => onChange({ ...block, detailText: e.target.value })}
                  onKeyDown={handleCommandKeyDown}
                  placeholder="링크 제목 또는 메모"
                  className={cn(
                    "w-full border-none bg-transparent text-ios-sub outline-none placeholder:text-gray-300",
                    mobileSafeFineClass
                  )}
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
            <input
              type="text"
              value={block.text ?? ""}
              onChange={(e) => onChange({ ...block, text: e.target.value })}
              onKeyDown={handleCommandKeyDown}
              placeholder="파일 메모를 입력하세요"
              className={cn("mt-3 w-full border-none bg-transparent text-ios-sub outline-none placeholder:text-gray-300", mobileSafeInputClass)}
            />
          </div>
        )}

        {block.type === "table" && (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-3 py-2 text-left font-medium text-ios-sub">
                    <input
                      type="text"
                      value={block.table?.columns[0] ?? "항목"}
                      onChange={(e) =>
                        onChange({
                          ...block,
                          table: {
                            columns: [e.target.value, block.table?.columns[1] ?? "내용"],
                            rows: block.table?.rows ?? [],
                          },
                        })
                      }
                      className="w-full border-none bg-transparent font-medium text-ios-sub outline-none"
                      style={{ fontSize: "16px" }}
                    />
                  </th>
                  <th className="px-3 py-2 text-left font-medium text-ios-sub">
                    <input
                      type="text"
                      value={block.table?.columns[1] ?? "내용"}
                      onChange={(e) =>
                        onChange({
                          ...block,
                          table: {
                            columns: [block.table?.columns[0] ?? "항목", e.target.value],
                            rows: block.table?.rows ?? [],
                          },
                        })
                      }
                      className="w-full border-none bg-transparent font-medium text-ios-sub outline-none"
                      style={{ fontSize: "16px" }}
                    />
                  </th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {(block.table?.rows ?? []).map((row) => (
                  <tr key={row.id} className="border-b border-gray-100 last:border-b-0">
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={row.left}
                        onChange={(e) =>
                          onChange({
                            ...block,
                            table: {
                              columns: block.table?.columns ?? ["항목", "내용"],
                              rows: (block.table?.rows ?? []).map((r) =>
                                r.id === row.id ? { ...r, left: e.target.value } : r
                              ),
                            },
                          })
                        }
                        placeholder="..."
                        className="w-full border-none bg-transparent text-ios-text outline-none placeholder:text-gray-300"
                        style={{ fontSize: "16px" }}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        type="text"
                        value={row.right}
                        onChange={(e) =>
                          onChange({
                            ...block,
                            table: {
                              columns: block.table?.columns ?? ["항목", "내용"],
                              rows: (block.table?.rows ?? []).map((r) =>
                                r.id === row.id ? { ...r, right: e.target.value } : r
                              ),
                            },
                          })
                        }
                        placeholder="..."
                        className="w-full border-none bg-transparent text-ios-text outline-none placeholder:text-gray-300"
                        style={{ fontSize: "16px" }}
                      />
                    </td>
                    <td className="px-1 py-2">
                      <button
                        type="button"
                        onClick={() =>
                          onChange({
                            ...block,
                            table: {
                              columns: block.table?.columns ?? ["항목", "내용"],
                              rows: (block.table?.rows ?? []).filter((r) => r.id !== row.id),
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
            <button
              type="button"
              onClick={() =>
                onChange({
                  ...block,
                  table: {
                    columns: block.table?.columns ?? ["항목", "내용"],
                    rows: [...(block.table?.rows ?? []), createMemoTableRow()],
                  },
                })
              }
              className="w-full border-t border-gray-100 px-3 py-2 text-left text-[12.5px] text-gray-400 hover:bg-gray-50 hover:text-gray-600"
            >
              + 새 행
            </button>
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

/* ─── reminder picker (subtle) ────────────────────────────── */

function ReminderPicker({
  reminderAt,
  onSet,
}: {
  reminderAt: number | null
  onSet: (v: number | null) => void
}) {
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
        className={cn(
          "inline-flex items-center gap-1.5 text-[12px] transition-colors",
          reminderAt ? "text-[color:var(--rnest-accent)]" : "text-gray-400 hover:text-gray-500"
        )}
      >
        <Bell className="h-3.5 w-3.5" />
        {reminderAt ? formatNotebookDateTime(reminderAt) : "리마인더"}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-44 rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
          {memoReminderPresets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => {
                onSet(getReminderTimestampFromPreset(preset.id))
                setOpen(false)
              }}
              className="flex w-full items-center px-3 py-2 text-left text-[13px] text-ios-text hover:bg-gray-50"
            >
              {preset.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── main component ──────────────────────────────────────── */

export function ToolNotebookPage() {
  const store = useAppStore()
  const memoState = store.memo

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
  const pendingAssetTargetRef = useRef<{ docId: string; blockId: string; kind: "image" | "attachment" } | null>(null)
  const unlockKeysRef = useRef<Record<string, CryptoKey>>({})
  const [unlockedPayloads, setUnlockedPayloads] = useState<Record<string, RNestLockedMemoPayload>>({})
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
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null)
  const [folderNameDraft, setFolderNameDraft] = useState("")
  const [folderOpenState, setFolderOpenState] = useState<Record<string, boolean>>({})
  const [draggingDocId, setDraggingDocId] = useState<string | null>(null)
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null)
  const [dragOverRootPages, setDragOverRootPages] = useState(false)
  const sortMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showSortMenu) return
    function handleClick(e: MouseEvent) {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) setShowSortMenu(false)
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [showSortMenu])

  // auto-close sidebar on phone/tablet on first mount
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setSidebarOpen(false)
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

  const pinnedDocs = useMemo(
    () => activeDocs.filter((d) => d.pinned),
    [activeDocs]
  )

  const rootDocs = useMemo(
    () => sortDocsByKey(activeDocs.filter((d) => !d.pinned && !d.folderId), sortKey),
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

  const activeMemoIsLocked = Boolean(activeMemoRaw?.lock)
  const activeMemoIsUnlocked = Boolean(activeMemoRaw?.id && unlockedPayloads[activeMemoRaw.id])
  const headingBlocks = useMemo(
    () =>
      activeMemo?.blocks.filter(
        (block): block is RNestMemoBlock & { type: "heading"; text: string } =>
          block.type === "heading" && Boolean(block.text?.trim())
      ) ?? [],
    [activeMemo]
  )

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
    folders?: Record<string, RNestMemoFolder | undefined>
  ) {
    const latestMemo = store.getState().memo
    store.setMemoState({
      folders: folders ?? latestMemo.folders,
      documents: docs,
      recent: recent ?? latestMemo.recent,
    })
  }

  function getLatestMemoState() {
    return store.getState().memo
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

  function saveRawDoc(
    doc: RNestMemoDocument,
    options?: {
      touchRecent?: boolean
      touchUpdatedAt?: boolean
    }
  ) {
    const touchRecent = options?.touchRecent ?? true
    const touchUpdatedAt = options?.touchUpdatedAt ?? true
    const normalizedDoc = normalizeDocAttachments(doc)
    const next = touchUpdatedAt ? { ...normalizedDoc, updatedAt: Date.now() } : normalizedDoc
    const latestMemo = store.getState().memo
    commit(
      { ...latestMemo.documents, [next.id]: next },
      touchRecent ? insertRecent(latestMemo.recent, next.id) : latestMemo.recent
    )
    return next
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

  function createMemo(presetId = "blank") {
    const doc = createMemoFromPreset(presetId)
    const latestMemo = store.getState().memo
    commit({ ...latestMemo.documents, [doc.id]: doc }, insertRecent(latestMemo.recent, doc.id))
    setActiveMemoId(doc.id)
    setQuery("")

    if (presetId === "quick") {
      // Auto-focus first block for quick memo — pure blank canvas feel
      requestAnimationFrame(() => {
        const firstBlock = doc.blocks[0]
        if (!firstBlock) return
        const el = document.querySelector<HTMLTextAreaElement>(`#memo-block-${firstBlock.id} textarea`)
        el?.focus()
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
      nextDocuments[doc.id] = { ...doc, folderId: null }
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

  function moveDocToFolder(docId: string, folderId: string | null) {
    const latestMemo = getLatestMemoState()
    const doc = latestMemo.documents[docId]
    if (!doc) return
    if (folderId && !latestMemo.folders[folderId]) return
    if ((doc.folderId ?? null) === folderId) return
    saveRawDoc(
      { ...doc, folderId },
      { touchRecent: false, touchUpdatedAt: false }
    )
    if (folderId) {
      setFolderOpenState((current) => ({ ...current, [folderId]: true }))
      setToast("폴더에 페이지를 추가했습니다")
    } else {
      setToast("페이지를 폴더 밖으로 이동했습니다")
    }
  }

  function handlePageDragStart(event: React.DragEvent<HTMLButtonElement>, docId: string) {
    setDraggingDocId(docId)
    event.dataTransfer.effectAllowed = "move"
    event.dataTransfer.setData("text/plain", docId)
  }

  function handlePageDragEnd() {
    setDraggingDocId(null)
    setDragOverFolderId(null)
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
    const next: RNestMemoDocument = {
      ...doc,
      id: crypto.randomUUID(),
      title: `${doc.title} 복사`,
      pinned: false,
      favorite: false,
      trashedAt: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      attachments: duplicatedAttachments,
      attachmentStoragePaths: buildDocStoragePaths(doc),
      blocks: doc.blocks.map((b) =>
        b.type === "table"
          ? { ...b, id: crypto.randomUUID(), table: { columns: b.table?.columns ?? ["항목", "내용"], rows: (b.table?.rows ?? []).map((r) => ({ ...r, id: crypto.randomUUID() })) } }
          : {
              ...b,
              id: crypto.randomUUID(),
              attachmentId: b.attachmentId ? attachmentIdMap.get(b.attachmentId) ?? b.attachmentId : undefined,
            }
      ),
    }
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

  function beginAssetInsert(blockId: string, kind: "image" | "attachment") {
    if (!activeMemo) return
    pendingAssetTargetRef.current = { docId: activeMemo.id, blockId, kind }
    if (kind === "image") {
      imageInputRef.current?.click()
    } else {
      fileInputRef.current?.click()
    }
  }

  async function insertUploadedAssetBlocks(fileList: FileList | null, kind: "image" | "attachment") {
    const target = pendingAssetTargetRef.current
    pendingAssetTargetRef.current = null
    if (!fileList || fileList.length === 0 || !activeMemo || !target) return
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

    const files = Array.from(fileList).slice(0, available)
    const uploadedAttachments: RNestMemoAttachment[] = []
    let largeFileCount = 0
    let failedCount = 0

    for (const file of files) {
      if (file.size > 12 * 1024 * 1024) {
        largeFileCount += 1
        continue
      }
      try {
        const uploaded = await uploadNotebookFile(file, kind === "image" ? deriveAttachmentKind(file, "image") : deriveAttachmentKind(file, "file"))
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
      nextBlocks.splice(
        insertAt,
        0,
        ...uploadedAttachments.map((attachment) =>
          createMemoBlock(kind, {
            text: kind === "image" ? "" : attachment.name,
            attachmentId: attachment.id,
            mediaWidth: kind === "image" ? 100 : undefined,
          })
        )
      )
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
      setToast(kind === "image" ? `사진 ${uploadedAttachments.length}개를 추가했습니다` : `파일 ${uploadedAttachments.length}개를 추가했습니다`)
    }
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

  function openAttachment(attachment: RNestMemoAttachment) {
    const url = buildNotebookFileUrl(attachment.storagePath)
    window.open(url, "_blank", "noopener,noreferrer")
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
        const duplicate =
          block.type === "table"
            ? createMemoBlock("table", {
                table: {
                  columns: block.table?.columns ?? ["항목", "내용"],
                  rows: (block.table?.rows ?? []).map((row) => createMemoTableRow(row.left, row.right)),
                },
              })
            : createMemoBlock(block.type, {
                text: block.text,
                detailText: block.detailText,
                attachmentId: block.attachmentId,
                mediaWidth: block.mediaWidth,
                mediaAspectRatio: block.mediaAspectRatio,
                checked: block.checked,
                collapsed: block.collapsed,
              })
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

  function jumpToBlock(blockId: string) {
    if (typeof document === "undefined") return
    document.getElementById(`memo-block-${blockId}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  /* ── find & replace ── */

  function handleFindReplace() {
    if (!activeMemo || !findQuery.trim()) return
    const q = findQuery
    let replaced = 0
    void updateActiveMemoContent((doc) => ({
      ...doc,
      blocks: doc.blocks.map((block) => {
        if (!block.text?.includes(q)) return block
        replaced++
        return { ...block, text: block.text.replaceAll(q, replaceQuery) }
      }),
    }))
    setToast(`${findMatchCount}개 항목을 바꿨습니다`)
    setFindQuery("")
    setReplaceQuery("")
    setFindOpen(false)
  }

  function handleFindReplaceOne() {
    if (!activeMemo || !findQuery.trim()) return
    const q = findQuery
    void updateActiveMemoContent((doc) => {
      const nextBlocks = [...doc.blocks]
      for (let i = 0; i < nextBlocks.length; i++) {
        const block = nextBlocks[i]
        if (block.text?.includes(q)) {
          nextBlocks[i] = { ...block, text: block.text.replace(q, replaceQuery) }
          break
        }
      }
      return { ...doc, blocks: nextBlocks }
    })
    setToast("1개 항목을 바꿨습니다")
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
    const doc = createMemoFromPreset("blank")
    const dailyDoc: RNestMemoDocument = {
      ...doc,
      title: dailyTitle,
      icon: "moon",
      coverStyle: null,
      blocks: [
        createMemoBlock("heading", { text: "오늘 할 일" }),
        createMemoBlock("checklist", { text: "", checked: false }),
        createMemoBlock("divider"),
        createMemoBlock("heading", { text: "메모" }),
        createMemoBlock("paragraph"),
      ],
    }
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
            onClick={() => createMemo("blank")}
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
                          docs.map((doc) => (
                            <PageItem
                              key={doc.id}
                              doc={getRenderableDoc(doc)}
                              summary={buildSummary(getRenderableDoc(doc))}
                              isLocked={Boolean(doc.lock && !unlockedPayloads[doc.id])}
                              listKey={`folder:${folder.id}`}
                              isActive={activeMemoId === doc.id}
                              onClick={() => openMemo(doc.id)}
                              draggable
                              isDragging={draggingDocId === doc.id}
                              onDragStart={(event) => handlePageDragStart(event, doc.id)}
                              onDragEnd={handlePageDragEnd}
                              className="px-2 py-1.5"
                            />
                          ))
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
                {rootDocs.map((doc) => (
                  <PageItem
                    key={doc.id}
                    doc={getRenderableDoc(doc)}
                    summary={buildSummary(getRenderableDoc(doc))}
                    isLocked={Boolean(doc.lock && !unlockedPayloads[doc.id])}
                    listKey="pages"
                    isActive={activeMemoId === doc.id}
                    onClick={() => openMemo(doc.id)}
                    draggable
                    isDragging={draggingDocId === doc.id}
                    onDragStart={(event) => handlePageDragStart(event, doc.id)}
                    onDragEnd={handlePageDragEnd}
                  />
                ))}
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
                <span className="mt-0.5 block text-[11px] text-ios-muted lg:hidden">{relativeTime(activeMemo.updatedAt)}</span>
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
                {relativeTime(activeMemo.updatedAt)}
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
        <div className="flex-1 overflow-y-auto">
          {activeMemo ? (
            <div className="mx-auto w-full max-w-[720px] px-5 py-6 sm:px-6 lg:px-10 lg:py-10 xl:pl-16">
              {activeMemo.coverStyle && (
                <div
                  className={cn(
                    "mb-4 h-16 rounded-[24px] border border-white/70 shadow-[0_20px_40px_rgba(148,163,184,0.14)] lg:mb-5 lg:h-28 lg:rounded-[28px]",
                    coverClassMap[(activeMemo.coverStyle as RNestMemoCoverId) ?? "lavender-glow"]
                  )}
                />
              )}

              {/* page icon */}
              <div className="relative mb-3 lg:mb-4">
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
              <input
                type="text"
                value={activeMemo.title}
                onChange={(e) => activeMemoRaw && saveRawDoc({ ...activeMemoRaw, title: e.target.value })}
                placeholder="제목 없음"
                className="mb-2 w-full border-none bg-transparent text-[30px] font-bold tracking-[-0.03em] text-ios-text outline-none placeholder:text-gray-200 sm:text-[32px] lg:text-[36px]"
              />

              {/* compact tools for phone/tablet */}
              <div className="mb-5 lg:hidden">
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
                    <span className="ml-auto text-[11px] text-ios-muted">{relativeTime(activeMemo.updatedAt)}</span>
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
                      <span className="ml-auto">{relativeTime(activeMemo.updatedAt)}</span>
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
                      {activeMemo.reminderAt && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[12px] font-medium text-ios-sub shadow-[inset_0_0_0_1px_rgba(196,181,253,0.35)]">
                          <Bell className="h-3.5 w-3.5 text-[color:var(--rnest-accent)]" />
                          리마인더
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => setShowCompactTools((current) => !current)}
                        className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-[12px] font-medium text-ios-sub shadow-[inset_0_0_0_1px_rgba(196,181,253,0.35)] transition-colors hover:bg-[color:var(--rnest-accent-soft)]/35"
                      >
                        <Sparkles className="h-3.5 w-3.5 text-[color:var(--rnest-accent)]" />
                        메모 도구
                        {showCompactTools ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                      </button>
                    </div>

                    {showCompactTools && (
                      <div className="mt-3 space-y-4 rounded-[24px] border border-[color:var(--rnest-accent-border)]/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(248,245,255,0.94)_100%)] p-4 shadow-[0_14px_34px_rgba(123,111,208,0.08)]">
                        <div className="flex flex-wrap items-center gap-3">
                          <InlineTagEditor
                            tags={activeMemo.tags}
                            onChange={(next) => {
                              void updateActiveMemoContent((doc) => ({ ...doc, tags: next }))
                            }}
                          />
                          <div className="hidden h-4 w-px bg-gray-200 sm:block" />
                          <ReminderPicker
                            reminderAt={activeMemo.reminderAt}
                            onSet={(v) => {
                              void updateActiveMemoContent((doc) => ({ ...doc, reminderAt: v }))
                            }}
                          />
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
                                  {block.text}
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
              <div className="mb-8 hidden flex-wrap items-center gap-3 lg:flex">
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
                    <ReminderPicker
                      reminderAt={activeMemo.reminderAt}
                      onSet={(v) => {
                        void updateActiveMemoContent((doc) => ({ ...doc, reminderAt: v }))
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
                    본문, 태그, 리마인더, 첨부 목록은 암호화되어 있습니다. 읽거나 수정하려면 잠금 해제가 필요합니다.
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
                    <div className="mb-8 hidden space-y-4 lg:block">
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
                            {block.text}
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
                      const attachment = findAttachment(activeMemo, block.attachmentId)
                      return (
                      <InlineBlock
                        key={block.id}
                        block={block}
                        attachment={attachment}
                        attachmentUrl={attachment ? buildNotebookFileUrl(attachment.storagePath) : undefined}
                        isFirst={idx === 0}
                        isLast={idx === activeMemo.blocks.length - 1}
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
                        onTypeChange={(type) => changeBlockType(block.id, type)}
                        onAddAfter={(type) => addBlockAfter(block.id, type)}
                        onInsertAsset={(kind) => beginAssetInsert(block.id, kind)}
                        onMoveUp={() => moveBlock(block.id, "up")}
                        onMoveDown={() => moveBlock(block.id, "down")}
                        onHighlight={(color) => setBlockHighlight(block.id, color)}
                      />
                      )
                    })}
                  </div>

                  {/* add block */}
                  <div className="mt-4 pl-0 lg:pl-10">
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
                {memoPresets.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => createMemo(preset.id)}
                    className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-[13.5px] text-ios-text shadow-sm transition-colors hover:border-[color:var(--rnest-accent-border)] hover:bg-[color:var(--rnest-accent-soft)]"
                  >
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[color:var(--rnest-accent-soft)] text-[color:var(--rnest-accent)]">
                      {renderMemoIcon(preset.icon, "h-4 w-4")}
                    </span>
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

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
                  본문, 태그, 리마인더, 첨부 목록을 암호화해 보호합니다. 제목과 아이콘은 목록에서 보이도록 남겨둡니다.
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
                  {unlockBusy ? "열는 중..." : "잠금 해제"}
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
