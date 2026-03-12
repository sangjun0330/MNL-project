"use client"

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import {
  Bell,
  BookOpenText,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  FileText,
  Folder,
  GripVertical,
  Heading1,
  Leaf,
  Lightbulb,
  Link2,
  List,
  ListOrdered,
  MessageSquareQuote,
  Minus,
  MoonStar,
  MoreHorizontal,
  NotebookPen,
  Pin,
  Plus,
  Quote,
  ReceiptText,
  RotateCcw,
  Search,
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
  memoIconOptions,
  memoDocumentToMarkdown,
  memoDocumentToPlainText,
  memoPresets,
  memoReminderPresets,
  sanitizeNotebookTags,
  type RNestMemoBlock,
  type RNestMemoBlockType,
  type RNestMemoCoverId,
  type RNestMemoDocument,
  type RNestMemoIconId,
  type RNestMemoState,
} from "@/lib/notebook"
import { useAppStore } from "@/lib/store"
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

function buildMemoSearchText(doc: RNestMemoDocument) {
  return [doc.title, doc.tags.join(" "), memoDocumentToPlainText(doc)].join(" ").toLowerCase()
}

function buildSummary(doc: RNestMemoDocument) {
  return doc.blocks
    .map((block) => memoBlockToPlainText(block))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100)
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
    "📄": "page",
    "✅": "check",
    "📋": "table",
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
    default:
      return <Type {...props} />
  }
}

/* ─── sidebar page item ───────────────────────────────────── */

function PageItem({
  doc,
  isActive,
  onClick,
}: {
  doc: RNestMemoDocument
  isActive: boolean
  onClick: () => void
}) {
  const summary = buildSummary(doc)
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex w-full items-start gap-2 rounded-xl px-2 py-2 text-left transition-colors",
        isActive
          ? "bg-[color:var(--rnest-accent-soft)] text-ios-text"
          : "text-ios-sub hover:bg-gray-100"
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
      {doc.favorite && (
        <Star className="mt-1 h-3 w-3 shrink-0 fill-current text-[color:var(--rnest-accent)] opacity-60" />
      )}
    </button>
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
  onAction,
  onClose,
}: {
  doc: RNestMemoDocument
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
        { id: "favorite", label: doc.favorite ? "즐겨찾기 해제" : "즐겨찾기", icon: <Star className="h-3.5 w-3.5" /> },
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
          className="w-full border-none bg-transparent text-[13px] text-ios-text outline-none placeholder:text-gray-400"
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

/* ─── inline block editor ─────────────────────────────────── */

function InlineBlock({
  block,
  onChange,
  onDelete,
  onDuplicate,
  onTypeChange,
  onAddAfter,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: {
  block: RNestMemoBlock
  onChange: (b: RNestMemoBlock) => void
  onDelete: () => void
  onDuplicate: () => void
  onTypeChange: (t: RNestMemoBlockType) => void
  onAddAfter: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  isFirst: boolean
  isLast: boolean
}) {
  const [showTypeMenu, setShowTypeMenu] = useState(false)
  const [showSlashMenu, setShowSlashMenu] = useState(false)
  const [hovered, setHovered] = useState(false)

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
      id={`memo-block-${block.id}`}
      className="group relative scroll-mt-28"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setShowTypeMenu(false) }}
    >
      {/* left controls: grip + add */}
      <div
        className={cn(
          "absolute -left-10 top-0.5 flex flex-col items-center gap-0.5 transition-opacity",
          hovered ? "opacity-100" : "opacity-0"
        )}
      >
        <button
          type="button"
          onClick={onAddAfter}
          className="flex h-6 w-6 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          title="아래에 블록 추가"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowTypeMenu(!showTypeMenu)}
            className="flex h-6 w-6 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            title="블록 메뉴"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
          {showTypeMenu && (
            <div className="absolute left-0 top-full z-30 mt-1 w-48 rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
              <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-ios-muted">
                블록 변환
              </div>
              {(Object.keys(blockTypeLabels) as RNestMemoBlockType[]).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => { onTypeChange(type); setShowTypeMenu(false) }}
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
                  {blockTypeLabels[type]}
                </button>
              ))}
              <div className="mx-2 my-1 border-t border-gray-100" />
              <button
                type="button"
                onClick={() => { onDuplicate(); setShowTypeMenu(false) }}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-ios-text hover:bg-gray-50"
              >
                <Copy className="h-3.5 w-3.5" />
                블록 복제
              </button>
              {!isFirst && (
                <button
                  type="button"
                  onClick={() => { onMoveUp(); setShowTypeMenu(false) }}
                  className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-ios-text hover:bg-gray-50"
                >
                  ↑ 위로 이동
                </button>
              )}
              {!isLast && (
                <button
                  type="button"
                  onClick={() => { onMoveDown(); setShowTypeMenu(false) }}
                  className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-ios-text hover:bg-gray-50"
                >
                  ↓ 아래로 이동
                </button>
              )}
              <button
                type="button"
                onClick={() => { onDelete(); setShowTypeMenu(false) }}
                className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-[13px] text-red-500 hover:bg-red-50"
              >
                <Trash2 className="h-3.5 w-3.5" /> 삭제
              </button>
            </div>
          )}
        </div>
      </div>

      {/* block content */}
      <div className="min-h-[1.6em]">
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
          />
        )}

        {block.type === "paragraph" && (
          <textarea
            value={block.text ?? ""}
            onChange={(e) => onChange({ ...block, text: e.target.value })}
            onKeyDown={handleEditorKeyDown}
            placeholder="내용을 입력하세요..."
            rows={1}
            className="w-full resize-none border-none bg-transparent text-[15px] leading-relaxed text-ios-text outline-none placeholder:text-gray-300"
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
            <span className="mt-[2px] shrink-0 text-[15px] leading-relaxed text-ios-sub">•</span>
            <textarea
              value={block.text ?? ""}
              onChange={(e) => onChange({ ...block, text: e.target.value })}
              onKeyDown={handleEditorKeyDown}
              placeholder="목록 항목"
              rows={1}
              className="w-full resize-none border-none bg-transparent text-[15px] leading-relaxed text-ios-text outline-none placeholder:text-gray-300"
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
              value={block.text ?? ""}
              onChange={(e) => onChange({ ...block, text: e.target.value })}
              onKeyDown={handleEditorKeyDown}
              placeholder="번호 항목"
              rows={1}
              className="w-full resize-none border-transparent bg-transparent text-[15px] leading-relaxed text-ios-text outline-none placeholder:text-gray-300"
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
              value={block.text ?? ""}
              onChange={(e) => onChange({ ...block, text: e.target.value })}
              onKeyDown={handleEditorKeyDown}
              placeholder="할 일"
              rows={1}
              className={cn(
                "w-full resize-none border-none bg-transparent text-[15px] leading-relaxed outline-none placeholder:text-gray-300",
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
              value={block.text ?? ""}
              onChange={(e) => onChange({ ...block, text: e.target.value })}
              onKeyDown={handleEditorKeyDown}
              placeholder="콜아웃 내용을 입력하세요"
              rows={1}
              className="w-full resize-none border-none bg-transparent text-[14.5px] leading-relaxed text-ios-text outline-none placeholder:text-gray-300"
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
              value={block.text ?? ""}
              onChange={(e) => onChange({ ...block, text: e.target.value })}
              onKeyDown={handleEditorKeyDown}
              placeholder="인용하거나 강조할 문장을 적어 두세요"
              rows={1}
              className="w-full resize-none border-none bg-transparent text-[14.5px] leading-relaxed text-ios-text outline-none placeholder:text-gray-300"
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
                className="w-full border-none bg-transparent text-[14px] font-medium text-ios-text outline-none placeholder:text-gray-300"
              />
            </div>
            {!block.collapsed && (
              <div className="border-t border-gray-100 px-4 py-3">
                <textarea
                  value={block.detailText ?? ""}
                  onChange={(e) => onChange({ ...block, detailText: e.target.value })}
                  onKeyDown={handleCommandKeyDown}
                  placeholder="토글 안쪽 내용을 입력하세요"
                  rows={2}
                  className="w-full resize-none border-none bg-transparent text-[14px] leading-relaxed text-ios-text outline-none placeholder:text-gray-300"
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
                  className="w-full border-none bg-transparent text-[14px] font-medium text-ios-text outline-none placeholder:text-gray-300"
                />
                <input
                  type="text"
                  value={block.detailText ?? ""}
                  onChange={(e) => onChange({ ...block, detailText: e.target.value })}
                  onKeyDown={handleCommandKeyDown}
                  placeholder="링크 제목 또는 메모"
                  className="w-full border-none bg-transparent text-[12.5px] text-ios-sub outline-none placeholder:text-gray-300"
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
          className="h-6 w-24 border-none bg-transparent text-[12px] text-ios-text outline-none placeholder:text-gray-300"
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
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // auto-close sidebar on mobile on first mount
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
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
  }, [activeMemoId])

  /* ── derived lists ── */

  const allDocs = useMemo(
    () =>
      Object.values(memoState.documents)
        .filter((d): d is RNestMemoDocument => Boolean(d))
        .sort(sortByUpdated),
    [memoState.documents]
  )

  const activeDocs = useMemo(
    () => allDocs.filter((d) => d.trashedAt == null),
    [allDocs]
  )

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

  const searchResults = useMemo(() => {
    if (!queryDeferred) return null
    return activeDocs.filter((d) => buildMemoSearchText(d).includes(queryDeferred))
  }, [activeDocs, queryDeferred])

  const displayDocs = searchResults ?? activeDocs

  const activeMemo = useMemo(
    () => allDocs.find((d) => d.id === activeMemoId) ?? null,
    [activeMemoId, allDocs]
  )

  const headingBlocks = useMemo(
    () =>
      activeMemo?.blocks.filter(
        (block): block is RNestMemoBlock & { type: "heading"; text: string } =>
          block.type === "heading" && Boolean(block.text?.trim())
      ) ?? [],
    [activeMemo]
  )

  // auto-select first doc if none selected
  useEffect(() => {
    if (!activeMemoId && activeDocs.length > 0) {
      setActiveMemoId(activeDocs[0].id)
    }
  }, [activeMemoId, activeDocs])

  /* ── state operations ── */

  function commit(docs: Record<string, RNestMemoDocument | undefined>, recent?: string[]) {
    store.setMemoState({ documents: docs, recent: recent ?? memoState.recent })
  }

  function saveDoc(doc: RNestMemoDocument) {
    const next = { ...doc, updatedAt: Date.now() }
    commit({ ...memoState.documents, [next.id]: next }, insertRecent(memoState.recent, next.id))
  }

  function createMemo(presetId = "blank") {
    const doc = createMemoFromPreset(presetId)
    commit({ ...memoState.documents, [doc.id]: doc }, insertRecent(memoState.recent, doc.id))
    setActiveMemoId(doc.id)
    setQuery("")
    setToast("새 페이지를 만들었습니다")
  }

  function duplicateMemo(doc: RNestMemoDocument) {
    const next: RNestMemoDocument = {
      ...doc,
      id: crypto.randomUUID(),
      title: `${doc.title} 복사`,
      favorite: false,
      trashedAt: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      blocks: doc.blocks.map((b) =>
        b.type === "table"
          ? { ...b, id: crypto.randomUUID(), table: { columns: b.table?.columns ?? ["항목", "내용"], rows: (b.table?.rows ?? []).map((r) => ({ ...r, id: crypto.randomUUID() })) } }
          : { ...b, id: crypto.randomUUID() }
      ),
    }
    commit({ ...memoState.documents, [next.id]: next }, insertRecent(memoState.recent, next.id))
    setActiveMemoId(next.id)
    setToast("페이지를 복제했습니다")
  }

  function trashMemo(id: string) {
    const doc = memoState.documents[id]
    if (!doc) return
    saveDoc({ ...doc, trashedAt: Date.now(), favorite: false })
    if (activeMemoId === id) setActiveMemoId(null)
    setToast("휴지통으로 이동했습니다")
  }

  function restoreMemo(id: string) {
    const doc = memoState.documents[id]
    if (!doc) return
    saveDoc({ ...doc, trashedAt: null })
    setToast("복구했습니다")
  }

  function deletePermanently(id: string) {
    const next = { ...memoState.documents }
    delete next[id]
    commit(next, memoState.recent.filter((i) => i !== id))
    if (activeMemoId === id) setActiveMemoId(null)
    setToast("영구 삭제했습니다")
  }

  function handleMoreAction(action: string) {
    if (!activeMemo) return
    switch (action) {
      case "favorite":
        saveDoc({ ...activeMemo, favorite: !activeMemo.favorite })
        break
      case "duplicate":
        duplicateMemo(activeMemo)
        break
      case "export-txt":
        downloadTextFile(`${activeMemo.title}.txt`, memoDocumentToPlainText(activeMemo), "text/plain;charset=utf-8")
        setToast("TXT 파일을 다운로드합니다")
        break
      case "export-md":
        downloadTextFile(`${activeMemo.title}.md`, memoDocumentToMarkdown(activeMemo), "text/markdown;charset=utf-8")
        setToast("Markdown 파일을 다운로드합니다")
        break
      case "trash":
        trashMemo(activeMemo.id)
        break
      case "restore":
        restoreMemo(activeMemo.id)
        break
      case "delete-permanent":
        deletePermanently(activeMemo.id)
        break
    }
  }

  function openMemo(id: string) {
    setActiveMemoId(id)
    commit(memoState.documents, insertRecent(memoState.recent, id))
    // close sidebar on mobile
    if (typeof window !== "undefined" && window.innerWidth < 768) setSidebarOpen(false)
  }

  /* ── block operations ── */

  function updateBlock(blockId: string, next: RNestMemoBlock) {
    if (!activeMemo) return
    saveDoc({ ...activeMemo, blocks: activeMemo.blocks.map((b) => (b.id === blockId ? next : b)) })
  }

  function changeBlockType(blockId: string, newType: RNestMemoBlockType) {
    if (!activeMemo) return
    saveDoc({
      ...activeMemo,
      blocks: activeMemo.blocks.map((b) => (b.id === blockId ? coerceMemoBlockType(b, newType) : b)),
    })
  }

  function deleteBlock(blockId: string) {
    if (!activeMemo) return
    const next = activeMemo.blocks.filter((b) => b.id !== blockId)
    saveDoc({ ...activeMemo, blocks: next.length ? next : [createMemoBlock("paragraph")] })
  }

  function addBlockAfter(blockId: string, type: RNestMemoBlockType = "paragraph") {
    if (!activeMemo) return
    const idx = activeMemo.blocks.findIndex((b) => b.id === blockId)
    if (idx === -1) return
    const newBlocks = [...activeMemo.blocks]
    newBlocks.splice(idx + 1, 0, createMemoBlock(type))
    saveDoc({ ...activeMemo, blocks: newBlocks })
  }

  function moveBlock(blockId: string, direction: "up" | "down") {
    if (!activeMemo) return
    const idx = activeMemo.blocks.findIndex((b) => b.id === blockId)
    if (idx === -1) return
    const swap = direction === "up" ? idx - 1 : idx + 1
    if (swap < 0 || swap >= activeMemo.blocks.length) return
    const next = [...activeMemo.blocks]
    const temp = next[swap]
    next[swap] = next[idx]
    next[idx] = temp
    saveDoc({ ...activeMemo, blocks: next })
  }

  function duplicateBlock(blockId: string) {
    if (!activeMemo) return
    const idx = activeMemo.blocks.findIndex((b) => b.id === blockId)
    if (idx === -1) return
    const block = activeMemo.blocks[idx]
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
            checked: block.checked,
            collapsed: block.collapsed,
          })
    const next = [...activeMemo.blocks]
    next.splice(idx + 1, 0, duplicate)
    saveDoc({ ...activeMemo, blocks: next })
    setToast("블록을 복제했습니다")
  }

  function appendBlock(type: RNestMemoBlockType) {
    if (!activeMemo) return
    saveDoc({ ...activeMemo, blocks: [...activeMemo.blocks, createMemoBlock(type)] })
  }

  function appendTemplateBundle(templateId: (typeof quickInsertTemplates)[number]["id"]) {
    if (!activeMemo) return
    const template = quickInsertTemplates.find((item) => item.id === templateId)
    if (!template) return
    saveDoc({ ...activeMemo, blocks: [...activeMemo.blocks, ...template.createBlocks()] })
    setToast(`${template.label} 구성을 추가했습니다`)
  }

  function jumpToBlock(blockId: string) {
    if (typeof document === "undefined") return
    document.getElementById(`memo-block-${blockId}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  /* ── render ── */

  return (
    <div className="flex h-[calc(100dvh-56px)] overflow-hidden bg-white">
      {/* ─── SIDEBAR BACKDROP (mobile) ─── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/20 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ─── SIDEBAR ─── */}
      <aside
        className={cn(
          "flex shrink-0 flex-col border-r border-gray-100 bg-[#F9F9F8] transition-all duration-200",
          "max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-50 max-md:shadow-xl",
          sidebarOpen ? "w-[260px]" : "w-0 overflow-hidden"
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
              className="h-8 w-full rounded-lg border border-gray-200 bg-white pl-8 pr-3 text-[13px] text-ios-text outline-none placeholder:text-gray-400 focus:border-[color:var(--rnest-accent-border)] focus:ring-1 focus:ring-[color:var(--rnest-accent-border)]"
            />
          </div>
        </div>

        {/* new page button */}
        <div className="px-2 pb-3">
          <button
            type="button"
            onClick={() => createMemo("blank")}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] font-medium text-ios-sub transition-colors hover:bg-gray-200"
          >
            <Plus className="h-4 w-4" />
            새 페이지
          </button>
        </div>

        {/* page lists */}
        <div className="flex-1 space-y-3 overflow-y-auto px-2 pb-4">
          {searchResults != null ? (
            <SidebarSection title="검색 결과" count={searchResults.length}>
              {searchResults.length === 0 && (
                <div className="px-2 py-3 text-center text-[12px] text-gray-400">결과 없음</div>
              )}
              {searchResults.map((doc) => (
                <PageItem key={doc.id} doc={doc} isActive={activeMemoId === doc.id} onClick={() => openMemo(doc.id)} />
              ))}
            </SidebarSection>
          ) : (
            <>
              {recentDocs.length > 0 && (
                <SidebarSection title="최근" count={recentDocs.length}>
                  {recentDocs.map((doc) => (
                    <PageItem key={doc.id} doc={doc} isActive={activeMemoId === doc.id} onClick={() => openMemo(doc.id)} />
                  ))}
                </SidebarSection>
              )}

              {favoriteDocs.length > 0 && (
                <SidebarSection title="즐겨찾기" count={favoriteDocs.length}>
                  {favoriteDocs.map((doc) => (
                    <PageItem key={doc.id} doc={doc} isActive={activeMemoId === doc.id} onClick={() => openMemo(doc.id)} />
                  ))}
                </SidebarSection>
              )}

              <SidebarSection title="페이지" count={activeDocs.length}>
                {activeDocs.length === 0 && (
                  <div className="px-2 py-6 text-center text-[12px] text-gray-400">
                    아직 메모가 없습니다
                  </div>
                )}
                {activeDocs.map((doc) => (
                  <PageItem key={doc.id} doc={doc} isActive={activeMemoId === doc.id} onClick={() => openMemo(doc.id)} />
                ))}
              </SidebarSection>

              {trashedDocs.length > 0 && (
                <SidebarSection title="휴지통" count={trashedDocs.length} defaultOpen={false}>
                  {trashedDocs.map((doc) => (
                    <PageItem key={doc.id} doc={doc} isActive={activeMemoId === doc.id} onClick={() => openMemo(doc.id)} />
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
        <div className="flex h-11 shrink-0 items-center gap-2 border-b border-gray-100 px-4">
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
              <span className="truncate text-[13px] font-medium text-ios-sub">{activeMemo.title || "제목 없음"}</span>
              <span className="ml-auto text-[11.5px] text-gray-400">
                {relativeTime(activeMemo.updatedAt)}
              </span>
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
                    doc={activeMemo}
                    onAction={handleMoreAction}
                    onClose={() => setShowMoreMenu(false)}
                  />
                )}
              </div>
            </>
          )}
        </div>

        {/* editor area */}
        <div className="flex-1 overflow-y-auto">
          {activeMemo ? (
            <div className="mx-auto w-full max-w-[720px] px-6 py-10 sm:px-10 md:pl-16">
              {activeMemo.coverStyle && (
                <div
                  className={cn(
                    "mb-5 h-28 rounded-[28px] border border-white/70 shadow-[0_20px_40px_rgba(148,163,184,0.14)]",
                    coverClassMap[(activeMemo.coverStyle as RNestMemoCoverId) ?? "lavender-glow"]
                  )}
                />
              )}

              {/* page icon */}
              <div className="relative mb-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowIconPicker(!showIconPicker)
                    setShowCoverPicker(false)
                  }}
                  className="flex h-[72px] w-[72px] items-center justify-center rounded-[22px] bg-[color:var(--rnest-accent-soft)] text-[color:var(--rnest-accent)] shadow-[inset_0_0_0_1px_rgba(196,181,253,0.45)] transition-transform hover:scale-[1.03]"
                  title="아이콘 변경"
                >
                  {renderMemoIcon(activeMemo.icon, "h-9 w-9")}
                </button>
                {showIconPicker && (
                  <IconPicker
                    value={activeMemo.icon}
                    onChange={(icon) => saveDoc({ ...activeMemo, icon })}
                    onClose={() => setShowIconPicker(false)}
                  />
                )}
              </div>

              {/* title */}
              <input
                type="text"
                value={activeMemo.title}
                onChange={(e) => saveDoc({ ...activeMemo, title: e.target.value })}
                placeholder="제목 없음"
                className="mb-2 w-full border-none bg-transparent text-[32px] font-bold tracking-[-0.03em] text-ios-text outline-none placeholder:text-gray-200"
              />

              {/* tags + reminder row */}
              <div className="mb-8 flex flex-wrap items-center gap-3">
                <InlineTagEditor
                  tags={activeMemo.tags}
                  onChange={(next) => saveDoc({ ...activeMemo, tags: next })}
                />
                <span className="text-gray-200">|</span>
                <ReminderPicker
                  reminderAt={activeMemo.reminderAt}
                  onSet={(v) => saveDoc({ ...activeMemo, reminderAt: v })}
                />
                <span className="text-gray-200">|</span>
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
                      onChange={(coverStyle) => saveDoc({ ...activeMemo, coverStyle })}
                      onClose={() => setShowCoverPicker(false)}
                    />
                  )}
                </div>
              </div>

              {(headingBlocks.length > 0 || quickInsertTemplates.length > 0) && (
                <div className="mb-8 space-y-4">
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
              <div className="space-y-1 pl-10">
                {activeMemo.blocks.map((block, idx) => (
                  <InlineBlock
                    key={block.id}
                    block={block}
                    isFirst={idx === 0}
                    isLast={idx === activeMemo.blocks.length - 1}
                    onChange={(next) => updateBlock(block.id, next)}
                    onDelete={() => deleteBlock(block.id)}
                    onDuplicate={() => duplicateBlock(block.id)}
                    onTypeChange={(type) => changeBlockType(block.id, type)}
                    onAddAfter={() => addBlockAfter(block.id)}
                    onMoveUp={() => moveBlock(block.id, "up")}
                    onMoveDown={() => moveBlock(block.id, "down")}
                  />
                ))}
              </div>

              {/* add block */}
              <div className="mt-4 pl-10">
                <AddBlockButton onSelect={appendBlock} />
              </div>

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
