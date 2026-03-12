"use client"

import { useDeferredValue, useEffect, useMemo, useState } from "react"
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Copy,
  Download,
  FilePlus2,
  Filter,
  ListChecks,
  NotebookPen,
  Plus,
  RotateCcw,
  Search,
  Star,
  Table2,
  Trash2,
} from "lucide-react"
import { ToolPageShell } from "@/components/pages/tools/ToolPageShell"
import { Button } from "@/components/ui/Button"
import { Card, CardBody, CardHeader } from "@/components/ui/Card"
import { Input } from "@/components/ui/Input"
import { Pill } from "@/components/ui/Pill"
import { Segmented } from "@/components/ui/Segmented"
import { Textarea } from "@/components/ui/Textarea"
import { cn } from "@/lib/cn"
import {
  builtinRecordTemplates,
  coerceMemoBlockType,
  createChecklistItem,
  createCustomTemplateFromBase,
  createMemoBlock,
  createMemoFromPreset,
  createRecordEntryFromTemplate,
  createRecordField,
  createRecordTemplateSnapshot,
  formatNotebookDateTime,
  getReminderTimestampFromPreset,
  isBuiltinRecordTemplateId,
  memoDocumentToMarkdown,
  memoDocumentToPlainText,
  memoPresets,
  memoReminderPresets,
  notebookEmojiOptions,
  recordEntriesToCsv,
  recordEntrySearchText,
  recordEntrySummary,
  recordFieldValueToText,
  resolveRecordTemplate,
  sanitizeNotebookTags,
  type RNestChecklistItem,
  type RNestMemoBlock,
  type RNestMemoBlockType,
  type RNestMemoDocument,
  type RNestRecordEntry,
  type RNestRecordField,
  type RNestRecordFieldType,
  type RNestRecordSort,
  type RNestRecordTemplate,
  type RNestRecordValue,
} from "@/lib/notebook"
import { useAppStore } from "@/lib/store"

type NotebookTab = "memo" | "records"
type ListViewMode = "all" | "favorites" | "recent" | "trash"

const memoBlockOptions: Array<{ value: RNestMemoBlockType; label: string }> = [
  { value: "paragraph", label: "문단" },
  { value: "heading", label: "제목" },
  { value: "bulleted", label: "불릿" },
  { value: "numbered", label: "번호 목록" },
  { value: "checklist", label: "체크리스트" },
  { value: "callout", label: "콜아웃" },
  { value: "divider", label: "구분선" },
  { value: "table", label: "간단 표" },
]

const recordFieldTypeOptions: Array<{ value: RNestRecordFieldType; label: string }> = [
  { value: "text", label: "텍스트" },
  { value: "number", label: "숫자" },
  { value: "date", label: "날짜" },
  { value: "time", label: "시간" },
  { value: "singleSelect", label: "단일 선택" },
  { value: "multiSelect", label: "다중 선택" },
  { value: "checkbox", label: "체크박스" },
  { value: "checklist", label: "체크리스트" },
  { value: "note", label: "짧은 메모" },
]

const listModeOptions: Array<{ value: ListViewMode; label: string }> = [
  { value: "all", label: "전체" },
  { value: "favorites", label: "즐겨찾기" },
  { value: "recent", label: "최근" },
  { value: "trash", label: "휴지통" },
]

const nativeSelectClassName =
  "h-11 w-full rounded-2xl border border-[color:var(--rnest-accent-border)] bg-white px-3 text-[14px] text-ios-text focus:outline-none focus:ring-2 focus:ring-[color:var(--rnest-accent-border)]"

const lavenderPrimaryButtonClass =
  "bg-[color:var(--rnest-accent)] text-white shadow-[0_14px_30px_rgba(123,111,208,0.18)] hover:bg-[color:var(--rnest-accent)]/90"

function insertRecent(list: string[], id: string, limit = 24) {
  return [id, ...list.filter((item) => item !== id)].slice(0, limit)
}

function downloadTextFile(fileName: string, content: string, mimeType: string) {
  if (typeof window === "undefined") return
  const blob = new Blob([content], { type: mimeType })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.style.display = "none"
  link.href = url
  link.download = sanitizeDownloadFileName(fileName)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(url)
}

function buildMemoSearchText(document: RNestMemoDocument) {
  return [document.title, document.tags.join(" "), memoDocumentToPlainText(document)].join(" ").toLowerCase()
}

function buildMemoSummary(document: RNestMemoDocument) {
  const content = document.blocks
    .map((block) => {
      if (block.type === "table") {
        return (block.table?.rows ?? []).map((row) => `${row.left} ${row.right}`).join(" ")
      }
      if (block.type === "divider") return ""
      return block.text ?? ""
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()

  return truncateText(content, 140)
}

function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}...`
}

function sanitizeDownloadFileName(fileName: string) {
  const parts = fileName.split(".")
  const extension = parts.length > 1 ? parts.pop() ?? "" : ""
  const baseName = parts.join(".")
  const safeBase = baseName.replace(/[<>:\"/\\|?*\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 60) || "download"
  const safeExtension = extension.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10)
  return safeExtension ? `${safeBase}.${safeExtension}` : safeBase
}

function sortDocuments(items: RNestMemoDocument[]) {
  return [...items].sort((a, b) => b.updatedAt - a.updatedAt)
}

function compareMaybeNumbers(a: number | string | null, b: number | string | null, direction: RNestRecordSort["direction"]) {
  const left = a ?? ""
  const right = b ?? ""
  if (typeof left === "number" && typeof right === "number") {
    return direction === "asc" ? left - right : right - left
  }
  return direction === "asc"
    ? String(left).localeCompare(String(right), "ko")
    : String(right).localeCompare(String(left), "ko")
}

function readEntryComparable(entry: RNestRecordEntry, template: RNestRecordTemplate, fieldId: string) {
  if (fieldId === "createdAt") return entry.createdAt
  if (fieldId === "updatedAt") return entry.updatedAt
  if (fieldId === "title") return entry.title
  const field = template.fields.find((item) => item.id === fieldId)
  if (!field) return ""
  const value = entry.values[field.id]
  if (field.type === "number") return typeof value === "number" ? value : null
  if (field.type === "checkbox") return value === true ? 1 : 0
  if (field.type === "date" || field.type === "time" || field.type === "text" || field.type === "note") {
    return typeof value === "string" ? value : ""
  }
  if (field.type === "singleSelect") return typeof value === "string" ? value : ""
  if (field.type === "multiSelect") return Array.isArray(value) ? value.join(", ") : ""
  if (field.type === "checklist") {
    return Array.isArray(value) ? value.filter((item) => typeof item === "object" && item && (item as RNestChecklistItem).checked).length : 0
  }
  return ""
}

function optionListForField(field: RNestRecordField) {
  return field.type === "singleSelect" || field.type === "multiSelect" ? field.options ?? [] : []
}

function emptyTemplateDraft() {
  return createRecordTemplateSnapshot({
    name: "새 기록지",
    icon: "🗂",
    fields: [createRecordField("date", { label: "날짜", required: true }), createRecordField("text", { label: "내용" })],
    defaultSort: { fieldId: "updatedAt", direction: "desc" },
    defaultFilters: [],
  })
}

function renderCount(value: number, label: string) {
  return (
    <div className="rounded-[24px] border border-[color:var(--rnest-accent-border)] bg-[color:var(--rnest-accent-soft)] px-4 py-3">
      <div className="text-[20px] font-bold tracking-[-0.02em] text-[color:var(--rnest-accent)]">{value}</div>
      <div className="mt-1 text-[12px] text-ios-sub">{label}</div>
    </div>
  )
}

function resolveTabFromQuery(value: string | null): NotebookTab | null {
  return value === "memo" || value === "records" ? value : null
}

function resolveReminderPresetId(reminderAt: number | null) {
  if (!reminderAt) return "none"

  const now = Date.now()
  const diffMinutes = Math.round((reminderAt - now) / (60 * 1000))
  if (Math.abs(diffMinutes - 30) <= 1) return "30m"
  if (Math.abs(diffMinutes - 120) <= 2) return "2h"

  const tomorrowMorning = getReminderTimestampFromPreset("tomorrow")
  if (tomorrowMorning && Math.abs(tomorrowMorning - reminderAt) <= 60 * 1000) return "tomorrow"

  return null
}

function buildRecordEntryPreview(entry: RNestRecordEntry, template: RNestRecordTemplate) {
  return recordEntrySummary(entry, template).map((item) => truncateText(item, 52))
}

function SectionTitle({
  icon,
  title,
  subtitle,
  right,
}: {
  icon: React.ReactNode
  title: string
  subtitle: string
  right?: React.ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="inline-flex h-11 w-11 items-center justify-center rounded-[18px] border border-[color:var(--rnest-accent-border)] bg-[linear-gradient(180deg,#FFFFFF_0%,#F5F1FF_100%)] text-[color:var(--rnest-accent)] shadow-[0_14px_30px_rgba(123,111,208,0.12)]">
          {icon}
        </div>
        <div className="mt-3 text-[22px] font-bold tracking-[-0.03em] text-ios-text">{title}</div>
        <div className="mt-1 max-w-[620px] text-[13px] leading-6 text-ios-sub">{subtitle}</div>
      </div>
      {right}
    </div>
  )
}

function FilterPills({
  value,
  onChange,
}: {
  value: ListViewMode
  onChange: (next: ListViewMode) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {listModeOptions.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "inline-flex items-center rounded-full border px-3 py-2 text-[12px] font-semibold transition",
            value === option.value
              ? "border-[color:var(--rnest-accent-border)] bg-[color:var(--rnest-accent-soft)] text-[color:var(--rnest-accent)]"
              : "border-ios-sep bg-white text-ios-sub hover:border-[color:var(--rnest-accent-border)]"
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

function EmojiChooser({
  value,
  onChange,
}: {
  value: string
  onChange: (next: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {notebookEmojiOptions.map((icon) => (
        <button
          key={icon}
          type="button"
          onClick={() => onChange(icon)}
          className={cn(
            "inline-flex h-10 w-10 items-center justify-center rounded-2xl border text-[18px] transition",
            value === icon
              ? "border-[color:var(--rnest-accent-border)] bg-[color:var(--rnest-accent-soft)]"
              : "border-ios-sep bg-white hover:border-[color:var(--rnest-accent-border)]"
          )}
        >
          {icon}
        </button>
      ))}
    </div>
  )
}

function TagEditor({
  value,
  onChange,
  placeholder,
}: {
  value: string[]
  onChange: (next: string[]) => void
  placeholder: string
}) {
  const [draft, setDraft] = useState(value.join(", "))

  useEffect(() => {
    setDraft(value.join(", "))
  }, [value])

  return (
    <div className="space-y-2">
      <Input
        label="태그"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => onChange(sanitizeNotebookTags(draft.split(",").map((item) => item.trim())))}
        placeholder={placeholder}
      />
      <div className="flex flex-wrap gap-2">
        {value.length ? (
          value.map((tag) => (
            <Pill key={tag} className="border-[color:var(--rnest-accent-border)] bg-[color:var(--rnest-accent-soft)] text-[color:var(--rnest-accent)]">
              #{tag}
            </Pill>
          ))
        ) : (
          <div className="text-[12px] text-ios-muted">태그가 없으면 검색은 제목과 본문 중심으로 동작합니다.</div>
        )}
      </div>
    </div>
  )
}

function MemoBlockCard({
  block,
  index,
  total,
  onChange,
  onMoveUp,
  onMoveDown,
  onDelete,
}: {
  block: RNestMemoBlock
  index: number
  total: number
  onChange: (next: RNestMemoBlock) => void
  onMoveUp: () => void
  onMoveDown: () => void
  onDelete: () => void
}) {
  return (
    <div className="rounded-[28px] border border-[color:var(--rnest-accent-border)] bg-white p-4 shadow-[0_14px_32px_rgba(123,111,208,0.06)]">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          aria-label="블록 타입"
          value={block.type}
          onChange={(event) => onChange({ ...block, type: event.target.value as RNestMemoBlockType })}
          className={cn(nativeSelectClassName, "w-auto min-w-[132px]")}
        >
          {memoBlockOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={index === 0}
            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-ios-sep bg-white text-ios-sub disabled:opacity-35"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={index === total - 1}
            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-ios-sep bg-white text-ios-sub disabled:opacity-35"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[#F2D8E0] bg-[#FFF6F8] text-[#B04867]"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {block.type === "divider" ? (
        <div className="rounded-2xl border border-dashed border-[color:var(--rnest-accent-border)] bg-[color:var(--rnest-accent-soft)] px-4 py-6 text-center text-[13px] text-ios-sub">
          시각적 구분선 블록입니다.
        </div>
      ) : null}

      {block.type === "table" ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="왼쪽 헤더"
              value={block.table?.columns[0] ?? ""}
              onChange={(event) =>
                onChange({
                  ...block,
                  table: {
                    columns: [event.target.value, block.table?.columns[1] ?? "내용"],
                    rows: block.table?.rows ?? [],
                  },
                })
              }
            />
            <Input
              label="오른쪽 헤더"
              value={block.table?.columns[1] ?? ""}
              onChange={(event) =>
                onChange({
                  ...block,
                  table: {
                    columns: [block.table?.columns[0] ?? "항목", event.target.value],
                    rows: block.table?.rows ?? [],
                  },
                })
              }
            />
          </div>
          <div className="space-y-2">
            {(block.table?.rows ?? []).map((row, rowIndex) => (
              <div key={row.id} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                <Input
                  value={row.left}
                  placeholder="왼쪽 셀"
                  onChange={(event) =>
                    onChange({
                      ...block,
                      table: {
                        columns: block.table?.columns ?? ["항목", "내용"],
                        rows:
                          block.table?.rows.map((item) =>
                            item.id === row.id ? { ...item, left: event.target.value } : item
                          ) ?? [],
                      },
                    })
                  }
                />
                <Input
                  value={row.right}
                  placeholder="오른쪽 셀"
                  onChange={(event) =>
                    onChange({
                      ...block,
                      table: {
                        columns: block.table?.columns ?? ["항목", "내용"],
                        rows:
                          block.table?.rows.map((item) =>
                            item.id === row.id ? { ...item, right: event.target.value } : item
                          ) ?? [],
                      },
                    })
                  }
                />
                <button
                  type="button"
                  onClick={() =>
                    onChange({
                      ...block,
                      table: {
                        columns: block.table?.columns ?? ["항목", "내용"],
                        rows: (block.table?.rows ?? []).filter((item) => item.id !== row.id),
                      },
                    })
                  }
                  className="inline-flex h-11 items-center justify-center rounded-2xl border border-ios-sep bg-white px-4 text-[13px] text-ios-sub"
                >
                  삭제
                </button>
              </div>
            ))}
          </div>
          <Button
            variant="secondary"
            className="h-11 rounded-2xl border border-[color:var(--rnest-accent-border)] bg-[color:var(--rnest-accent-soft)] px-4 text-[13px] text-[color:var(--rnest-accent)]"
            onClick={() =>
              onChange({
                ...block,
                table: {
                  columns: block.table?.columns ?? ["항목", "내용"],
                  rows: [...(block.table?.rows ?? []), { id: crypto.randomUUID(), left: "", right: "" }],
                },
              })
            }
          >
            행 추가
          </Button>
        </div>
      ) : null}

      {block.type !== "divider" && block.type !== "table" ? (
        block.type === "checklist" ? (
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => onChange({ ...block, checked: !block.checked })}
              className={cn(
                "mt-11 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border text-[14px] font-semibold transition",
                block.checked
                  ? "border-[color:var(--rnest-accent-border)] bg-[color:var(--rnest-accent-soft)] text-[color:var(--rnest-accent)]"
                  : "border-ios-sep bg-white text-ios-sub"
              )}
            >
              {block.checked ? "완료" : "대기"}
            </button>
            <Textarea
              label="내용"
              value={block.text ?? ""}
              onChange={(event) => onChange({ ...block, text: event.target.value })}
              className="min-h-[100px]"
              placeholder="체크리스트 내용을 입력하세요."
            />
          </div>
        ) : (
          <Textarea
            label="내용"
            value={block.text ?? ""}
            onChange={(event) => onChange({ ...block, text: event.target.value })}
            className={block.type === "heading" ? "min-h-[88px] text-[18px] font-semibold" : "min-h-[110px]"}
            placeholder={
              block.type === "callout"
                ? "강조해야 할 메모를 남겨두세요."
                : block.type === "bulleted" || block.type === "numbered"
                  ? "목록 항목을 입력하세요."
                  : "내용을 입력하세요."
            }
          />
        )
      ) : null}
    </div>
  )
}

function RecordFieldEditor({
  field,
  onChange,
  onMoveUp,
  onMoveDown,
  onDelete,
  disableDelete,
}: {
  field: RNestRecordField
  onChange: (next: RNestRecordField) => void
  onMoveUp: () => void
  onMoveDown: () => void
  onDelete: () => void
  disableDelete?: boolean
}) {
  return (
    <div className="rounded-[24px] border border-[color:var(--rnest-accent-border)] bg-white p-4">
      <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr_auto]">
        <Input
          label="필드명"
          value={field.label}
          onChange={(event) => onChange({ ...field, label: event.target.value })}
        />
        <div>
          <label className="mb-1 block text-[12px] font-medium text-ios-muted">타입</label>
          <select
            value={field.type}
            onChange={(event) => onChange(createRecordField(event.target.value as RNestRecordFieldType, { ...field, type: event.target.value as RNestRecordFieldType }))}
            className={nativeSelectClassName}
          >
            {recordFieldTypeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end gap-2">
          <button
            type="button"
            onClick={onMoveUp}
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-ios-sep bg-white text-ios-sub"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-ios-sep bg-white text-ios-sub"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={disableDelete}
            className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[#F2D8E0] bg-[#FFF6F8] text-[#B04867] disabled:opacity-35"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {field.type === "singleSelect" || field.type === "multiSelect" ? (
        <div className="mt-3">
          <Input
            label="선택 옵션"
            value={(field.options ?? []).join(", ")}
            onChange={(event) =>
              onChange({
                ...field,
                options: sanitizeNotebookTags(event.target.value.split(",").map((item) => item.trim())),
              })
            }
            placeholder="옵션을 쉼표로 구분하세요"
          />
        </div>
      ) : null}
    </div>
  )
}

function RecordValueEditor({
  field,
  value,
  onChange,
}: {
  field: RNestRecordField
  value: RNestRecordValue | undefined
  onChange: (next: RNestRecordValue | undefined) => void
}) {
  if (field.type === "text") {
    return <Input value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)} />
  }
  if (field.type === "note") {
    return <Textarea value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)} className="min-h-[120px]" />
  }
  if (field.type === "number") {
    return (
      <Input
        type="number"
        value={typeof value === "number" ? String(value) : ""}
        onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))}
      />
    )
  }
  if (field.type === "date") {
    return <Input type="date" value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value || null)} />
  }
  if (field.type === "time") {
    return <Input type="time" value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value || null)} />
  }
  if (field.type === "singleSelect") {
    return (
      <select value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value || null)} className={nativeSelectClassName}>
        <option value="">선택 안 함</option>
        {optionListForField(field).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    )
  }
  if (field.type === "multiSelect") {
    const list = Array.isArray(value) ? (value as string[]) : []
    return (
      <div className="flex flex-wrap gap-2">
        {optionListForField(field).map((option) => {
          const active = list.includes(option)
          return (
            <button
              key={option}
              type="button"
              onClick={() =>
                onChange(active ? list.filter((item) => item !== option) : [...list, option])
              }
              className={cn(
                "inline-flex items-center rounded-full border px-3 py-2 text-[12px] font-semibold transition",
                active
                  ? "border-[color:var(--rnest-accent-border)] bg-[color:var(--rnest-accent-soft)] text-[color:var(--rnest-accent)]"
                  : "border-ios-sep bg-white text-ios-sub"
              )}
            >
              {option}
            </button>
          )
        })}
      </div>
    )
  }
  if (field.type === "checkbox") {
    const checked = value === true
    return (
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={cn(
          "inline-flex h-11 items-center justify-center rounded-2xl border px-4 text-[13px] font-semibold transition",
          checked
            ? "border-[color:var(--rnest-accent-border)] bg-[color:var(--rnest-accent-soft)] text-[color:var(--rnest-accent)]"
            : "border-ios-sep bg-white text-ios-sub"
        )}
      >
        {checked ? "완료됨" : "아직"}
      </button>
    )
  }
  const checklist = Array.isArray(value) ? (value as RNestChecklistItem[]) : []
  return (
    <div className="space-y-2">
      {checklist.map((item) => (
        <div key={item.id} className="flex gap-2">
          <button
            type="button"
            onClick={() =>
              onChange(
                checklist.map((entry) => (entry.id === item.id ? { ...entry, checked: !entry.checked } : entry))
              )
            }
            className={cn(
              "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border text-[12px] font-semibold transition",
              item.checked
                ? "border-[color:var(--rnest-accent-border)] bg-[color:var(--rnest-accent-soft)] text-[color:var(--rnest-accent)]"
                : "border-ios-sep bg-white text-ios-sub"
            )}
          >
            {item.checked ? "완" : "미"}
          </button>
          <Input
            value={item.label}
            onChange={(event) =>
              onChange(checklist.map((entry) => (entry.id === item.id ? { ...entry, label: event.target.value } : entry)))
            }
          />
          <button
            type="button"
            onClick={() => onChange(checklist.filter((entry) => entry.id !== item.id))}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-ios-sep bg-white text-ios-sub"
          >
            ×
          </button>
        </div>
      ))}
      <Button
        variant="secondary"
        className="h-11 rounded-2xl border border-[color:var(--rnest-accent-border)] bg-[color:var(--rnest-accent-soft)] px-4 text-[13px] text-[color:var(--rnest-accent)]"
        onClick={() => onChange([...checklist, createChecklistItem("새 항목", false)])}
      >
        체크 항목 추가
      </Button>
    </div>
  )
}

export function ToolNotebookPage() {
  const store = useAppStore()
  const memoState = store.memo
  const recordState = store.records
  const [tab, setTab] = useState<NotebookTab>("memo")
  const [message, setMessage] = useState<string | null>(null)

  const [memoMode, setMemoMode] = useState<ListViewMode>("all")
  const [memoQuery, setMemoQuery] = useState("")
  const memoQueryDeferred = useDeferredValue(memoQuery.trim().toLowerCase())
  const [activeMemoId, setActiveMemoId] = useState<string | null>(null)

  const [recordMode, setRecordMode] = useState<ListViewMode>("all")
  const [recordQuery, setRecordQuery] = useState("")
  const recordQueryDeferred = useDeferredValue(recordQuery.trim().toLowerCase())
  const [activeTemplateId, setActiveTemplateId] = useState<string>(builtinRecordTemplates[0].id)
  const [activeEntryId, setActiveEntryId] = useState<string | null>(null)
  const [recordSort, setRecordSort] = useState<RNestRecordSort>({ fieldId: "updatedAt", direction: "desc" })
  const [filterFieldId, setFilterFieldId] = useState<string>("")
  const [filterValue, setFilterValue] = useState<string>("")
  const [filterOperator, setFilterOperator] = useState<"equals" | "contains" | "checked" | "unchecked" | "includesAny">("equals")
  const [templateDraft, setTemplateDraft] = useState<RNestRecordTemplate | null>(null)

  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(() => setMessage(null), 2800)
    return () => window.clearTimeout(timer)
  }, [message])

  useEffect(() => {
    if (typeof window === "undefined") return
    const syncTabFromLocation = () => {
      const nextTab = resolveTabFromQuery(new URLSearchParams(window.location.search).get("tab"))
      if (nextTab) setTab(nextTab)
    }

    syncTabFromLocation()
    window.addEventListener("popstate", syncTabFromLocation)
    return () => window.removeEventListener("popstate", syncTabFromLocation)
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return
    const url = new URL(window.location.href)
    if (url.searchParams.get("tab") === tab) return
    url.searchParams.set("tab", tab)
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`)
  }, [tab])

  const memoDocuments = useMemo(
    () => sortDocuments(Object.values(memoState.documents).filter((document): document is RNestMemoDocument => Boolean(document))),
    [memoState.documents]
  )
  const memoFavoriteCount = useMemo(() => memoDocuments.filter((item) => item.favorite && item.trashedAt == null).length, [memoDocuments])

  const memoVisibleDocuments = useMemo(() => {
    return memoDocuments.filter((document) => {
      const matchesMode =
        memoMode === "trash"
          ? document.trashedAt != null
          : document.trashedAt == null &&
            (memoMode === "all" ||
              (memoMode === "favorites" && document.favorite) ||
              (memoMode === "recent" && memoState.recent.includes(document.id)))
      if (!matchesMode) return false
      if (!memoQueryDeferred) return true
      return buildMemoSearchText(document).includes(memoQueryDeferred)
    })
  }, [memoDocuments, memoMode, memoQueryDeferred, memoState.recent])

  const activeMemo = useMemo(
    () => memoVisibleDocuments.find((document) => document.id === activeMemoId) ?? memoVisibleDocuments[0] ?? null,
    [activeMemoId, memoVisibleDocuments]
  )
  const activeReminderPresetId = useMemo(() => resolveReminderPresetId(activeMemo?.reminderAt ?? null), [activeMemo?.reminderAt])

  useEffect(() => {
    if (!memoVisibleDocuments.length) {
      if (activeMemoId) setActiveMemoId(null)
      return
    }
    if (!activeMemoId || !memoVisibleDocuments.some((document) => document.id === activeMemoId)) {
      setActiveMemoId(memoVisibleDocuments[0].id)
    }
  }, [activeMemoId, memoVisibleDocuments])

  const customTemplates = useMemo(
    () => Object.values(recordState.templates).filter((template): template is RNestRecordTemplate => Boolean(template)),
    [recordState.templates]
  )
  const recordFavoriteCount = useMemo(
    () =>
      Object.values(recordState.entries).filter((entry): entry is RNestRecordEntry => Boolean(entry && entry.favorite && entry.trashedAt == null))
        .length,
    [recordState.entries]
  )
  const trashedRecordEntryCount = useMemo(
    () => Object.values(recordState.entries).filter((entry): entry is RNestRecordEntry => Boolean(entry && entry.trashedAt != null)).length,
    [recordState.entries]
  )

  const activeTemplate = useMemo(
    () => resolveRecordTemplate(activeTemplateId, recordState.templates) ?? builtinRecordTemplates[0],
    [activeTemplateId, recordState.templates]
  )

  const activeTemplateField = useMemo(
    () => activeTemplate.fields.find((field) => field.id === filterFieldId) ?? null,
    [activeTemplate.fields, filterFieldId]
  )

  const recordEntriesForTemplate = useMemo(() => {
    return Object.values(recordState.entries)
      .filter((entry): entry is RNestRecordEntry => Boolean(entry))
      .filter((entry) => entry.templateId === activeTemplate.id)
  }, [activeTemplate.id, recordState.entries])

  const visibleRecordEntries = useMemo(() => {
    const next = recordEntriesForTemplate.filter((entry) => {
      const modeMatch =
        recordMode === "trash"
          ? entry.trashedAt != null
          : entry.trashedAt == null &&
            (recordMode === "all" ||
              (recordMode === "favorites" && entry.favorite) ||
              (recordMode === "recent" && recordState.recent.includes(entry.id)))
      if (!modeMatch) return false
      if (recordQueryDeferred && !recordEntrySearchText(entry, activeTemplate).includes(recordQueryDeferred)) return false
      if (!activeTemplateField || !filterFieldId) return true
      const current = entry.values[activeTemplateField.id]
      if (activeTemplateField.type === "checkbox") {
        return filterOperator === "checked" ? current === true : filterOperator === "unchecked" ? current !== true : true
      }
      if (activeTemplateField.type === "singleSelect") {
        return !filterValue || current === filterValue
      }
      if (activeTemplateField.type === "multiSelect") {
        const currentValues = Array.isArray(current) ? current.filter((item): item is string => typeof item === "string") : []
        return !filterValue || currentValues.some((item) => item === filterValue)
      }
      if (activeTemplateField.type === "checklist") {
        if (!filterOperator || filterOperator === "contains") return true
        const checkedCount = Array.isArray(current)
          ? current.filter((item) => typeof item === "object" && item && (item as RNestChecklistItem).checked).length
          : 0
        return filterOperator === "checked" ? checkedCount > 0 : checkedCount === 0
      }
      const text = recordFieldValueToText(current).toLowerCase()
      if (!filterValue) return true
      return text.includes(filterValue.toLowerCase())
    })
    return [...next].sort((left, right) =>
      compareMaybeNumbers(
        readEntryComparable(left, activeTemplate, recordSort.fieldId),
        readEntryComparable(right, activeTemplate, recordSort.fieldId),
        recordSort.direction
      )
    )
  }, [
    activeTemplate,
    activeTemplateField,
    filterFieldId,
    filterOperator,
    filterValue,
    recordEntriesForTemplate,
    recordMode,
    recordQueryDeferred,
    recordSort,
    recordState.recent,
  ])

  const activeEntry = useMemo(
    () => visibleRecordEntries.find((entry) => entry.id === activeEntryId) ?? visibleRecordEntries[0] ?? null,
    [activeEntryId, visibleRecordEntries]
  )

  const trashedTemplates = useMemo(() => customTemplates.filter((template) => template.trashedAt != null), [customTemplates])
  const isEditingPersistedCustomTemplate = Boolean(templateDraft && recordState.templates[templateDraft.id])

  useEffect(() => {
    if (activeTemplate.trashedAt != null && recordMode !== "trash") {
      setActiveTemplateId(builtinRecordTemplates[0].id)
      return
    }
    if (templateDraft && recordState.templates[templateDraft.id] && templateDraft.id !== activeTemplate.id) {
      setTemplateDraft(null)
    }
  }, [activeTemplate, recordMode, recordState.templates, templateDraft])

  useEffect(() => {
    if (!visibleRecordEntries.length) {
      if (activeEntryId) setActiveEntryId(null)
      return
    }
    if (!activeEntryId || !visibleRecordEntries.some((entry) => entry.id === activeEntryId)) {
      setActiveEntryId(visibleRecordEntries[0].id)
    }
  }, [activeEntryId, visibleRecordEntries])

  useEffect(() => {
    setRecordSort(activeTemplate.defaultSort)
    setFilterFieldId("")
    setFilterValue("")
    setFilterOperator("equals")
  }, [activeTemplate.id, activeTemplate.defaultSort])

  useEffect(() => {
    if (!activeTemplateField) {
      setFilterValue("")
      setFilterOperator("equals")
      return
    }

    if (activeTemplateField.type === "checkbox" || activeTemplateField.type === "checklist") {
      setFilterValue("")
      setFilterOperator((current) => (current === "checked" || current === "unchecked" ? current : "checked"))
      return
    }

    if (activeTemplateField.type === "multiSelect") {
      setFilterOperator("includesAny")
      return
    }

    if (activeTemplateField.type === "singleSelect") {
      setFilterOperator("equals")
      return
    }

    setFilterOperator("contains")
  }, [activeTemplateField])

  function commitMemoState(nextDocuments: Record<string, RNestMemoDocument | undefined>, nextRecent = memoState.recent) {
    store.setMemoState({
      documents: nextDocuments,
      recent: nextRecent,
    })
  }

  function openMemo(documentId: string) {
    setActiveMemoId(documentId)
    commitMemoState(memoState.documents, insertRecent(memoState.recent, documentId))
  }

  function saveMemoDocument(document: RNestMemoDocument) {
    const next = {
      ...document,
      updatedAt: Date.now(),
    }
    commitMemoState(
      {
        ...memoState.documents,
        [next.id]: next,
      },
      insertRecent(memoState.recent, next.id)
    )
  }

  function createMemo(presetId: string) {
    const next = createMemoFromPreset(presetId)
    setMemoMode("all")
    commitMemoState(
      {
        ...memoState.documents,
        [next.id]: next,
      },
      insertRecent(memoState.recent, next.id)
    )
    setActiveMemoId(next.id)
    setMessage(`"${next.title}" 메모를 만들었습니다.`)
  }

  function duplicateMemo(document: RNestMemoDocument) {
    const next: RNestMemoDocument = {
      ...document,
      id: crypto.randomUUID(),
      title: `${document.title} 복사`,
      favorite: false,
      trashedAt: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      blocks: document.blocks.map((block) =>
        block.type === "table"
          ? {
              ...block,
              id: crypto.randomUUID(),
              table: {
                columns: block.table?.columns ?? ["항목", "내용"],
                rows: (block.table?.rows ?? []).map((row) => ({ ...row, id: crypto.randomUUID() })),
              },
            }
          : { ...block, id: crypto.randomUUID() }
      ),
    }
    setMemoMode("all")
    commitMemoState(
      {
        ...memoState.documents,
        [next.id]: next,
      },
      insertRecent(memoState.recent, next.id)
    )
    setActiveMemoId(next.id)
    setMessage("메모를 복제했습니다.")
  }

  function trashMemo(documentId: string) {
    const document = memoState.documents[documentId]
    if (!document) return
    saveMemoDocument({ ...document, trashedAt: Date.now(), favorite: false })
    setMessage("메모를 휴지통으로 이동했습니다.")
  }

  function restoreMemo(documentId: string) {
    const document = memoState.documents[documentId]
    if (!document) return
    saveMemoDocument({ ...document, trashedAt: null })
    setMessage("메모를 복구했습니다.")
  }

  function deleteMemoPermanently(documentId: string) {
    const nextDocuments = { ...memoState.documents }
    delete nextDocuments[documentId]
    commitMemoState(nextDocuments, memoState.recent.filter((item) => item !== documentId))
    setActiveMemoId((current) => (current === documentId ? null : current))
    setMessage("메모를 영구 삭제했습니다.")
  }

  function commitRecordState(nextTemplates: typeof recordState.templates, nextEntries: typeof recordState.entries, nextRecent = recordState.recent) {
    store.setRecordState({
      templates: nextTemplates,
      entries: nextEntries,
      recent: nextRecent,
    })
  }

  function openEntry(entryId: string) {
    setActiveEntryId(entryId)
    commitRecordState(recordState.templates, recordState.entries, insertRecent(recordState.recent, entryId))
  }

  function saveEntry(entry: RNestRecordEntry) {
    const nextEntry = {
      ...entry,
      updatedAt: Date.now(),
    }
    commitRecordState(
      recordState.templates,
      {
        ...recordState.entries,
        [nextEntry.id]: nextEntry,
      },
      insertRecent(recordState.recent, nextEntry.id)
    )
  }

  function createEntry(copyPrevious = false) {
    const baseTemplate = activeTemplate
    const latestEntry = recordEntriesForTemplate
      .filter((entry) => entry.trashedAt == null)
      .sort((a, b) => b.updatedAt - a.updatedAt)[0]
    const entry = createRecordEntryFromTemplate(baseTemplate, {
      title: `${baseTemplate.name} 항목`,
      copyFrom: copyPrevious ? latestEntry ?? null : null,
    })
    setRecordMode("all")
    commitRecordState(
      recordState.templates,
      {
        ...recordState.entries,
        [entry.id]: entry,
      },
      insertRecent(recordState.recent, entry.id)
    )
    setActiveEntryId(entry.id)
    setMessage(copyPrevious ? "이전 값을 복사한 새 항목을 만들었습니다." : "새 항목을 만들었습니다.")
  }

  function duplicateEntry(entry: RNestRecordEntry) {
    const duplicate = createRecordEntryFromTemplate(activeTemplate, {
      ...entry,
      id: crypto.randomUUID(),
      title: `${entry.title} 복사`,
      favorite: false,
      trashedAt: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    setRecordMode("all")
    commitRecordState(
      recordState.templates,
      {
        ...recordState.entries,
        [duplicate.id]: duplicate,
      },
      insertRecent(recordState.recent, duplicate.id)
    )
    setActiveEntryId(duplicate.id)
    setMessage("항목을 복제했습니다.")
  }

  function trashEntry(entryId: string) {
    const entry = recordState.entries[entryId]
    if (!entry) return
    saveEntry({ ...entry, trashedAt: Date.now(), favorite: false })
    setMessage("항목을 휴지통으로 이동했습니다.")
  }

  function restoreEntry(entryId: string) {
    const entry = recordState.entries[entryId]
    if (!entry) return
    saveEntry({ ...entry, trashedAt: null })
    setMessage("항목을 복구했습니다.")
  }

  function deleteEntryPermanently(entryId: string) {
    const nextEntries = { ...recordState.entries }
    delete nextEntries[entryId]
    commitRecordState(recordState.templates, nextEntries, recordState.recent.filter((item) => item !== entryId))
    setActiveEntryId((current) => (current === entryId ? null : current))
    setMessage("항목을 영구 삭제했습니다.")
  }

  function startTemplateEditor(template?: RNestRecordTemplate) {
    if (!template) {
      const nextTemplate = emptyTemplateDraft()
      setTemplateDraft(nextTemplate)
      setMessage("새 커스텀 기록지를 시작했습니다.")
      return
    }

    if (isBuiltinRecordTemplateId(template.id)) {
      const duplicate = createCustomTemplateFromBase(template)
      setTemplateDraft(duplicate)
      setMessage("저장하면 기본 템플릿을 바탕으로 커스텀 기록지가 추가됩니다.")
      return
    }

    setTemplateDraft({ ...template, fields: template.fields.map((field) => ({ ...field, options: [...(field.options ?? [])] })) })
  }

  function saveTemplateDraft() {
    if (!templateDraft) return
    const normalized = createRecordTemplateSnapshot({
      ...templateDraft,
      updatedAt: Date.now(),
    })

    const nextEntries = { ...recordState.entries }
    for (const [entryId, entry] of Object.entries(nextEntries)) {
      if (!entry || entry.templateId !== normalized.id) continue
      nextEntries[entryId] = createRecordEntryFromTemplate(normalized, {
        ...entry,
        id: entry.id,
        createdAt: entry.createdAt,
        updatedAt: Date.now(),
      })
    }

    commitRecordState(
      {
        ...recordState.templates,
        [normalized.id]: normalized,
      },
      nextEntries
    )
    setActiveTemplateId(normalized.id)
    setTemplateDraft(normalized)
    setMessage("템플릿을 저장했습니다.")
  }

  function duplicateTemplate(template: RNestRecordTemplate) {
    const duplicated = createCustomTemplateFromBase(template)
    commitRecordState(
      {
        ...recordState.templates,
        [duplicated.id]: duplicated,
      },
      recordState.entries
    )
    setActiveTemplateId(duplicated.id)
    setTemplateDraft(duplicated)
    setMessage("템플릿을 복제했습니다.")
  }

  function trashTemplate(templateId: string) {
    const template = recordState.templates[templateId]
    if (!template) return
    commitRecordState(
      {
        ...recordState.templates,
        [templateId]: { ...template, trashedAt: Date.now(), updatedAt: Date.now() },
      },
      recordState.entries
    )
    setTemplateDraft(null)
    setMessage("템플릿을 휴지통으로 이동했습니다.")
  }

  function restoreTemplate(templateId: string) {
    const template = recordState.templates[templateId]
    if (!template) return
    const nextTemplate = { ...template, trashedAt: null, updatedAt: Date.now() }
    commitRecordState(
      {
        ...recordState.templates,
        [templateId]: nextTemplate,
      },
      recordState.entries
    )
    setActiveTemplateId(templateId)
    setMessage("템플릿을 복구했습니다.")
  }

  function deleteTemplatePermanently(templateId: string) {
    const nextTemplates = { ...recordState.templates }
    const nextEntries = { ...recordState.entries }
    delete nextTemplates[templateId]
    for (const [entryId, entry] of Object.entries(nextEntries)) {
      if (!entry || entry.templateId !== templateId) continue
      delete nextEntries[entryId]
    }
    const filteredRecent = recordState.recent.filter((entryId) => {
      const entry = recordState.entries[entryId]
      return entry?.templateId !== templateId
    })
    commitRecordState(nextTemplates, nextEntries, filteredRecent)
    setActiveTemplateId(builtinRecordTemplates[0].id)
    setTemplateDraft(null)
    setActiveEntryId(null)
    setMessage("템플릿과 연결된 항목을 정리했습니다.")
  }

  function exportActiveRecordCsv() {
    const visible = visibleRecordEntries.filter((entry) => entry.trashedAt == null)
    if (!visible.length) {
      setMessage("내보낼 항목이 없습니다.")
      return
    }
    const csv = recordEntriesToCsv(activeTemplate, visible)
    downloadTextFile(`${activeTemplate.name}.csv`, csv, "text/csv;charset=utf-8")
    setMessage("CSV 내보내기를 시작했습니다.")
  }

  return (
    <ToolPageShell
      title="메모·기록지"
      subtitle="AppFlowy의 개념을 참고해 RNest 문맥으로 다시 설계한 개인용 메모·기록지 툴입니다."
      badge="New"
      badgeVariant="new"
    >
      <div className="space-y-5">
        <div className="rounded-[34px] border border-[color:var(--rnest-accent-border)] bg-[linear-gradient(180deg,#FFFFFF_0%,#F8F3FF_48%,#F3EEFF_100%)] p-5 shadow-[0_20px_60px_rgba(123,111,208,0.12)]">
          <div className="flex flex-col gap-4">
            <SectionTitle
              icon={tab === "memo" ? <NotebookPen className="h-5 w-5" /> : <Table2 className="h-5 w-5" />}
              title={tab === "memo" ? "개인 메모 워크스페이스" : "기록지 워크스페이스"}
              subtitle={
                tab === "memo"
                  ? "블록 메모, 템플릿, 리마인더, 휴지통, Markdown export를 한 화면에서 관리합니다."
                  : "범용 기록지 템플릿, 항목 상세 편집, 정렬·필터, CSV export까지 RNest 흐름에 맞게 묶었습니다."
              }
              right={
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {renderCount(memoDocuments.filter((item) => item.trashedAt == null).length, "메모")}
                  {renderCount(recordEntriesForTemplate.filter((item) => item.trashedAt == null).length, "현재 항목")}
                  {renderCount(memoFavoriteCount + recordFavoriteCount, "즐겨찾기")}
                  {renderCount(trashedTemplates.length + memoDocuments.filter((item) => item.trashedAt != null).length + trashedRecordEntryCount, "휴지통")}
                </div>
              }
            />

            <Segmented
              value={tab}
              onValueChange={(next) => setTab(next)}
              options={[
                { value: "memo", label: "메모" },
                { value: "records", label: "기록지" },
              ]}
            />

            {message ? (
              <div className="rounded-[24px] border border-[color:var(--rnest-accent-border)] bg-white/85 px-4 py-3 text-[13px] font-medium text-[color:var(--rnest-accent)] shadow-[0_12px_24px_rgba(123,111,208,0.08)]">
                {message}
              </div>
            ) : null}
          </div>
        </div>

        {tab === "memo" ? (
          <div className="space-y-5">
            <Card className="rounded-[32px] border-[color:var(--rnest-accent-border)] bg-[linear-gradient(180deg,#FFFFFF_0%,#FCFAFF_100%)] shadow-[0_16px_44px_rgba(123,111,208,0.08)]">
              <CardBody className="space-y-4 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-[16px] font-semibold text-ios-text">빠른 시작</div>
                    <div className="mt-1 text-[12.5px] text-ios-sub">메모 템플릿을 눌러 바로 새 문서를 생성합니다.</div>
                  </div>
                  <FilterPills value={memoMode} onChange={setMemoMode} />
                </div>
                <div className="grid gap-3 md:grid-cols-4">
                  {memoPresets.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => createMemo(preset.id)}
                      className="rounded-[28px] border border-[color:var(--rnest-accent-border)] bg-white p-4 text-left transition hover:-translate-y-[1px] hover:shadow-[0_16px_32px_rgba(123,111,208,0.1)]"
                    >
                      <div className="text-[26px]">{preset.icon}</div>
                      <div className="mt-3 text-[15px] font-semibold text-ios-text">{preset.label}</div>
                      <div className="mt-1 text-[12px] leading-5 text-ios-sub">{preset.description}</div>
                    </button>
                  ))}
                </div>
                <div className="grid gap-3 md:grid-cols-[1fr_320px]">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ios-muted" />
                    <Input
                      value={memoQuery}
                      onChange={(event) => setMemoQuery(event.target.value)}
                      placeholder="메모 제목, 본문, 태그 검색"
                      className="pl-11"
                    />
                  </div>
                  <div className="rounded-[24px] border border-[color:var(--rnest-accent-border)] bg-[color:var(--rnest-accent-soft)] px-4 py-3 text-[12px] text-[color:var(--rnest-accent)]">
                    리마인더는 저장과 표시 중심으로 동작하며 실제 푸시 연동은 후속 단계로 둡니다.
                  </div>
                </div>
              </CardBody>
            </Card>

            <div className="grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
              <Card className="rounded-[32px] border-[color:var(--rnest-accent-border)] bg-white shadow-[0_16px_44px_rgba(123,111,208,0.08)]">
                <CardHeader title="메모 목록" subtitle={`${memoVisibleDocuments.length}개 문서`} />
                <CardBody className="space-y-3">
                  {memoVisibleDocuments.length ? (
                    memoVisibleDocuments.map((document) => (
                      <button
                        key={document.id}
                        type="button"
                        onClick={() => openMemo(document.id)}
                        className={cn(
                          "w-full rounded-[26px] border p-4 text-left transition",
                          activeMemo?.id === document.id
                            ? "border-[color:var(--rnest-accent-border)] bg-[color:var(--rnest-accent-soft)] shadow-[0_14px_30px_rgba(123,111,208,0.08)]"
                            : "border-ios-sep bg-white hover:border-[color:var(--rnest-accent-border)]"
                        )}
                      >
                        <div className="flex items-start gap-3">
                          <div className="inline-flex h-11 w-11 items-center justify-center rounded-[18px] border border-[color:var(--rnest-accent-border)] bg-white text-[22px]">
                            {document.icon}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <div className="truncate text-[15px] font-semibold text-ios-text">{document.title}</div>
                              {document.favorite ? <Star className="h-4 w-4 fill-current text-[color:var(--rnest-accent)]" /> : null}
                            </div>
                            <div className="mt-1 line-clamp-2 text-[12.5px] leading-5 text-ios-sub">{buildMemoSummary(document) || "내용이 아직 없습니다."}</div>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <Pill className="border-ios-sep bg-[#F8F7FC] text-ios-sub">{formatNotebookDateTime(document.updatedAt)}</Pill>
                              {document.reminderAt ? (
                                <Pill className="border-[color:var(--rnest-accent-border)] bg-[color:var(--rnest-accent-soft)] text-[color:var(--rnest-accent)]">
                                  {formatNotebookDateTime(document.reminderAt)}
                                </Pill>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="rounded-[26px] border border-dashed border-[color:var(--rnest-accent-border)] bg-[color:var(--rnest-accent-soft)] px-4 py-10 text-center">
                      <div className="text-[15px] font-semibold text-[color:var(--rnest-accent)]">조건에 맞는 메모가 없습니다.</div>
                      <div className="mt-1 text-[12.5px] text-ios-sub">새 메모를 만들거나 검색/필터를 조정해 보세요.</div>
                    </div>
                  )}
                </CardBody>
              </Card>

              <Card className="rounded-[32px] border-[color:var(--rnest-accent-border)] bg-white shadow-[0_16px_44px_rgba(123,111,208,0.08)]">
                {activeMemo ? (
                  <CardBody className="space-y-5 p-5">
                    <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
                      <div className="space-y-4">
                        <Input
                          label="메모 제목"
                          value={activeMemo.title}
                          onChange={(event) => saveMemoDocument({ ...activeMemo, title: event.target.value })}
                          placeholder="메모 제목"
                        />
                        <TagEditor
                          value={activeMemo.tags}
                          onChange={(next) => saveMemoDocument({ ...activeMemo, tags: next })}
                          placeholder="예: 회복, 체크, 학습"
                        />
                      </div>
                      <div className="space-y-4">
                        <div>
                          <label className="mb-1 block text-[12px] font-medium text-ios-muted">아이콘</label>
                          <EmojiChooser value={activeMemo.icon} onChange={(next) => saveMemoDocument({ ...activeMemo, icon: next })} />
                        </div>
                        <div>
                          <label className="mb-1 block text-[12px] font-medium text-ios-muted">리마인더</label>
                          <div className="flex flex-wrap gap-2">
                            {memoReminderPresets.map((preset) => (
                              <button
                                key={preset.id}
                                type="button"
                                onClick={() => saveMemoDocument({ ...activeMemo, reminderAt: getReminderTimestampFromPreset(preset.id) })}
                                className={cn(
                                  "inline-flex items-center rounded-full border px-3 py-2 text-[12px] font-semibold transition",
                                  preset.id === activeReminderPresetId
                                    ? "border-[color:var(--rnest-accent-border)] bg-[color:var(--rnest-accent-soft)] text-[color:var(--rnest-accent)]"
                                    : "border-ios-sep bg-white text-ios-sub"
                                )}
                              >
                                {preset.label}
                              </button>
                            ))}
                          </div>
                          <div className="mt-2 text-[12px] text-ios-sub">
                            현재: {activeMemo.reminderAt ? formatNotebookDateTime(activeMemo.reminderAt) : "설정 안 함"}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant={activeMemo.favorite ? "primary" : "secondary"}
                        className={cn("h-11 rounded-2xl px-4", activeMemo.favorite ? lavenderPrimaryButtonClass : "")}
                        onClick={() => saveMemoDocument({ ...activeMemo, favorite: !activeMemo.favorite })}
                      >
                        <Star className={cn("mr-2 h-4 w-4", activeMemo.favorite ? "fill-current" : "")} />
                        즐겨찾기
                      </Button>
                      <Button variant="secondary" className="h-11 rounded-2xl px-4" onClick={() => duplicateMemo(activeMemo)}>
                        <Copy className="mr-2 h-4 w-4" />
                        복제
                      </Button>
                      <Button
                        variant="secondary"
                        className="h-11 rounded-2xl px-4"
                        onClick={() =>
                          downloadTextFile(`${activeMemo.title}.txt`, memoDocumentToPlainText(activeMemo), "text/plain;charset=utf-8")
                        }
                      >
                        <Download className="mr-2 h-4 w-4" />
                        TXT
                      </Button>
                      <Button
                        variant="secondary"
                        className="h-11 rounded-2xl px-4"
                        onClick={() =>
                          downloadTextFile(`${activeMemo.title}.md`, memoDocumentToMarkdown(activeMemo), "text/markdown;charset=utf-8")
                        }
                      >
                        <Download className="mr-2 h-4 w-4" />
                        Markdown
                      </Button>
                      {activeMemo.trashedAt == null ? (
                        <Button variant="danger" className="h-11 rounded-2xl px-4" onClick={() => trashMemo(activeMemo.id)}>
                          <Trash2 className="mr-2 h-4 w-4" />
                          휴지통
                        </Button>
                      ) : (
                        <>
                          <Button variant="secondary" className="h-11 rounded-2xl px-4" onClick={() => restoreMemo(activeMemo.id)}>
                            <RotateCcw className="mr-2 h-4 w-4" />
                            복구
                          </Button>
                          <Button variant="danger" className="h-11 rounded-2xl px-4" onClick={() => deleteMemoPermanently(activeMemo.id)}>
                            <Archive className="mr-2 h-4 w-4" />
                            영구 삭제
                          </Button>
                        </>
                      )}
                    </div>

                    <div className="space-y-3">
                      {activeMemo.blocks.map((block, index) => (
                        <MemoBlockCard
                          key={block.id}
                          block={block}
                          index={index}
                          total={activeMemo.blocks.length}
                          onChange={(nextBlock) => {
                            const typeFixed = nextBlock.type !== block.type ? coerceMemoBlockType(block, nextBlock.type) : nextBlock
                            const nextBlocks = activeMemo.blocks.map((item) => (item.id === block.id ? typeFixed : item))
                            saveMemoDocument({ ...activeMemo, blocks: nextBlocks })
                          }}
                          onMoveUp={() => {
                            if (index === 0) return
                            const nextBlocks = [...activeMemo.blocks]
                            const prev = nextBlocks[index - 1]
                            nextBlocks[index - 1] = nextBlocks[index]
                            nextBlocks[index] = prev
                            saveMemoDocument({ ...activeMemo, blocks: nextBlocks })
                          }}
                          onMoveDown={() => {
                            if (index >= activeMemo.blocks.length - 1) return
                            const nextBlocks = [...activeMemo.blocks]
                            const next = nextBlocks[index + 1]
                            nextBlocks[index + 1] = nextBlocks[index]
                            nextBlocks[index] = next
                            saveMemoDocument({ ...activeMemo, blocks: nextBlocks })
                          }}
                          onDelete={() => {
                            const nextBlocks = activeMemo.blocks.filter((item) => item.id !== block.id)
                            saveMemoDocument({ ...activeMemo, blocks: nextBlocks.length ? nextBlocks : [createMemoBlock("paragraph")] })
                          }}
                        />
                      ))}
                    </div>

                    <div className="rounded-[28px] border border-dashed border-[color:var(--rnest-accent-border)] bg-[color:var(--rnest-accent-soft)] p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-[14px] font-semibold text-[color:var(--rnest-accent)]">블록 추가</div>
                        {memoBlockOptions.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => saveMemoDocument({ ...activeMemo, blocks: [...activeMemo.blocks, createMemoBlock(option.value)] })}
                            className="inline-flex items-center rounded-full border border-white/70 bg-white px-3 py-2 text-[12px] font-semibold text-ios-sub transition hover:border-[color:var(--rnest-accent-border)]"
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </CardBody>
                ) : (
                  <CardBody className="p-8 text-center">
                    <div className="text-[16px] font-semibold text-ios-text">선택된 메모가 없습니다.</div>
                    <div className="mt-1 text-[13px] text-ios-sub">왼쪽에서 메모를 선택하거나 새 메모를 만드세요.</div>
                  </CardBody>
                )}
              </Card>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <Card className="rounded-[32px] border-[color:var(--rnest-accent-border)] bg-[linear-gradient(180deg,#FFFFFF_0%,#FCFAFF_100%)] shadow-[0_16px_44px_rgba(123,111,208,0.08)]">
              <CardBody className="space-y-4 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-[16px] font-semibold text-ios-text">템플릿 허브</div>
                    <div className="mt-1 text-[12.5px] text-ios-sub">기본 템플릿으로 바로 시작하거나 커스텀 템플릿을 만들어 기록지 흐름을 고정합니다.</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" className="h-11 rounded-2xl px-4" onClick={() => startTemplateEditor()}>
                      <LayoutTemplateIcon />
                      새 템플릿
                    </Button>
                    <Button variant="secondary" className="h-11 rounded-2xl px-4" onClick={() => duplicateTemplate(activeTemplate)}>
                      <Copy className="mr-2 h-4 w-4" />
                      템플릿 복제
                    </Button>
                    <Button variant="secondary" className="h-11 rounded-2xl px-4" onClick={() => startTemplateEditor(activeTemplate)}>
                      <NotebookPen className="mr-2 h-4 w-4" />
                      {isBuiltinRecordTemplateId(activeTemplate.id) ? "커스텀 편집" : "템플릿 편집"}
                    </Button>
                  </div>
                </div>
                <div className="grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {[...builtinRecordTemplates, ...customTemplates.filter((template) => template.trashedAt == null)].map((template) => (
                      <button
                        key={template.id}
                        type="button"
                        onClick={() => setActiveTemplateId(template.id)}
                        className={cn(
                          "min-w-[170px] rounded-[26px] border p-4 text-left transition",
                          activeTemplate.id === template.id
                            ? "border-[color:var(--rnest-accent-border)] bg-[color:var(--rnest-accent-soft)] shadow-[0_14px_30px_rgba(123,111,208,0.08)]"
                            : "border-ios-sep bg-white"
                        )}
                      >
                        <div className="text-[22px]">{template.icon}</div>
                        <div className="mt-3 text-[14px] font-semibold text-ios-text">{template.name}</div>
                        <div className="mt-1 text-[12px] text-ios-sub">{template.fields.length}개 필드</div>
                      </button>
                    ))}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {renderCount(customTemplates.filter((template) => template.trashedAt == null).length, "커스텀")}
                    {renderCount(recordEntriesForTemplate.filter((entry) => entry.favorite && entry.trashedAt == null).length, "즐겨찾기")}
                    {renderCount(recordEntriesForTemplate.filter((entry) => entry.trashedAt != null).length, "현재 휴지통")}
                  </div>
                </div>
              </CardBody>
            </Card>

            {templateDraft ? (
              <Card className="rounded-[32px] border-[color:var(--rnest-accent-border)] bg-white shadow-[0_16px_44px_rgba(123,111,208,0.08)]">
                <CardHeader title="템플릿 편집기" subtitle="필드 타입과 정렬 기준을 조정해 기록지 입력 흐름을 고정합니다." />
                <CardBody className="space-y-4">
                  <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
                    <div className="space-y-4">
                      <Input
                        label="템플릿 이름"
                        value={templateDraft.name}
                        onChange={(event) => setTemplateDraft({ ...templateDraft, name: event.target.value })}
                      />
                      <div>
                        <label className="mb-1 block text-[12px] font-medium text-ios-muted">기본 정렬</label>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <select
                            value={templateDraft.defaultSort.fieldId}
                            onChange={(event) =>
                              setTemplateDraft({
                                ...templateDraft,
                                defaultSort: { ...templateDraft.defaultSort, fieldId: event.target.value },
                              })
                            }
                            className={nativeSelectClassName}
                          >
                            <option value="updatedAt">최근 수정순</option>
                            <option value="createdAt">생성순</option>
                            <option value="title">제목</option>
                            {templateDraft.fields.map((field) => (
                              <option key={field.id} value={field.id}>
                                {field.label}
                              </option>
                            ))}
                          </select>
                          <select
                            value={templateDraft.defaultSort.direction}
                            onChange={(event) =>
                              setTemplateDraft({
                                ...templateDraft,
                                defaultSort: { ...templateDraft.defaultSort, direction: event.target.value as "asc" | "desc" },
                              })
                            }
                            className={nativeSelectClassName}
                          >
                            <option value="desc">내림차순</option>
                            <option value="asc">오름차순</option>
                          </select>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <label className="mb-1 block text-[12px] font-medium text-ios-muted">아이콘</label>
                        <EmojiChooser value={templateDraft.icon} onChange={(next) => setTemplateDraft({ ...templateDraft, icon: next })} />
                      </div>
                      <div className="rounded-[24px] border border-[color:var(--rnest-accent-border)] bg-[color:var(--rnest-accent-soft)] p-4 text-[12.5px] leading-6 text-[color:var(--rnest-accent)]">
                        템플릿 기본 필터는 현재 비워 두고, 사용 중 필터 UI는 실시간으로 적용됩니다.
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {templateDraft.fields.map((field, index) => (
                      <RecordFieldEditor
                        key={field.id}
                        field={field}
                        disableDelete={templateDraft.fields.length === 1}
                        onChange={(nextField) =>
                          setTemplateDraft({
                            ...templateDraft,
                            fields: templateDraft.fields.map((item) => (item.id === field.id ? nextField : item)),
                          })
                        }
                        onMoveUp={() => {
                          if (index === 0) return
                          const nextFields = [...templateDraft.fields]
                          const prev = nextFields[index - 1]
                          nextFields[index - 1] = nextFields[index]
                          nextFields[index] = prev
                          setTemplateDraft({ ...templateDraft, fields: nextFields })
                        }}
                        onMoveDown={() => {
                          if (index >= templateDraft.fields.length - 1) return
                          const nextFields = [...templateDraft.fields]
                          const next = nextFields[index + 1]
                          nextFields[index + 1] = nextFields[index]
                          nextFields[index] = next
                          setTemplateDraft({ ...templateDraft, fields: nextFields })
                        }}
                        onDelete={() =>
                          setTemplateDraft({
                            ...templateDraft,
                            fields: templateDraft.fields.filter((item) => item.id !== field.id),
                          })
                        }
                      />
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {recordFieldTypeOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() =>
                          setTemplateDraft({
                            ...templateDraft,
                            fields: [...templateDraft.fields, createRecordField(option.value)],
                          })
                        }
                        className="inline-flex items-center rounded-full border border-[color:var(--rnest-accent-border)] bg-[color:var(--rnest-accent-soft)] px-3 py-2 text-[12px] font-semibold text-[color:var(--rnest-accent)]"
                      >
                        <Plus className="mr-1 h-3.5 w-3.5" />
                        {option.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button className={cn("h-11 rounded-2xl px-4", lavenderPrimaryButtonClass)} onClick={saveTemplateDraft}>
                      템플릿 저장
                    </Button>
                    <Button variant="secondary" className="h-11 rounded-2xl px-4" onClick={() => setTemplateDraft(null)}>
                      닫기
                    </Button>
                    {isEditingPersistedCustomTemplate ? (
                      templateDraft.trashedAt == null ? (
                        <Button variant="danger" className="h-11 rounded-2xl px-4" onClick={() => trashTemplate(templateDraft.id)}>
                          휴지통 이동
                        </Button>
                      ) : (
                        <>
                          <Button variant="secondary" className="h-11 rounded-2xl px-4" onClick={() => restoreTemplate(templateDraft.id)}>
                            복구
                          </Button>
                          <Button variant="danger" className="h-11 rounded-2xl px-4" onClick={() => deleteTemplatePermanently(templateDraft.id)}>
                            영구 삭제
                          </Button>
                        </>
                      )
                    ) : null}
                  </div>
                </CardBody>
              </Card>
            ) : null}

            <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
              <Card className="rounded-[32px] border-[color:var(--rnest-accent-border)] bg-white shadow-[0_16px_44px_rgba(123,111,208,0.08)]">
                <CardBody className="space-y-4 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-[16px] font-semibold text-ios-text">{activeTemplate.icon} {activeTemplate.name}</div>
                      <div className="mt-1 text-[12.5px] text-ios-sub">{activeTemplate.fields.length}개 필드 · {visibleRecordEntries.length}개 결과</div>
                    </div>
                    <FilterPills value={recordMode} onChange={setRecordMode} />
                  </div>

                  <div className="relative">
                    <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ios-muted" />
                    <Input
                      value={recordQuery}
                      onChange={(event) => setRecordQuery(event.target.value)}
                      placeholder="항목 제목, 태그, 값 검색"
                      className="pl-11"
                    />
                  </div>

                  <div className="grid gap-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <select
                        value={recordSort.fieldId}
                        onChange={(event) => setRecordSort({ ...recordSort, fieldId: event.target.value })}
                        className={nativeSelectClassName}
                      >
                        <option value="updatedAt">최근 수정순</option>
                        <option value="createdAt">생성순</option>
                        <option value="title">제목</option>
                        {activeTemplate.fields.map((field) => (
                          <option key={field.id} value={field.id}>
                            {field.label}
                          </option>
                        ))}
                      </select>
                      <select
                        value={recordSort.direction}
                        onChange={(event) => setRecordSort({ ...recordSort, direction: event.target.value as "asc" | "desc" })}
                        className={nativeSelectClassName}
                      >
                        <option value="desc">내림차순</option>
                        <option value="asc">오름차순</option>
                      </select>
                    </div>
                    <div className="rounded-[24px] border border-ios-sep bg-[#FBFAFF] p-4">
                      <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold text-ios-text">
                        <Filter className="h-4 w-4 text-[color:var(--rnest-accent)]" />
                        실시간 필터
                      </div>
                      <div className="grid gap-3">
                        <select value={filterFieldId} onChange={(event) => setFilterFieldId(event.target.value)} className={nativeSelectClassName}>
                          <option value="">필터 없음</option>
                          {activeTemplate.fields.map((field) => (
                            <option key={field.id} value={field.id}>
                              {field.label}
                            </option>
                          ))}
                        </select>
                        {activeTemplateField ? (
                          <>
                            {activeTemplateField.type === "checkbox" || activeTemplateField.type === "checklist" ? (
                              <select
                                value={filterOperator === "checked" || filterOperator === "unchecked" ? filterOperator : "checked"}
                                onChange={(event) => setFilterOperator(event.target.value as "checked" | "unchecked")}
                                className={nativeSelectClassName}
                              >
                                <option value="checked">완료/체크 있음</option>
                                <option value="unchecked">미완료/체크 없음</option>
                              </select>
                            ) : activeTemplateField.type === "singleSelect" || activeTemplateField.type === "multiSelect" ? (
                              <select value={filterValue} onChange={(event) => setFilterValue(event.target.value)} className={nativeSelectClassName}>
                                <option value="">전체</option>
                                {optionListForField(activeTemplateField).map((option) => (
                                  <option key={option} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <Input value={filterValue} onChange={(event) => setFilterValue(event.target.value)} placeholder="필터 값을 입력하세요" />
                            )}
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button className={cn("h-11 rounded-2xl px-4", lavenderPrimaryButtonClass)} onClick={() => createEntry(false)}>
                      <FilePlus2 className="mr-2 h-4 w-4" />
                      새 항목
                    </Button>
                    <Button variant="secondary" className="h-11 rounded-2xl px-4" onClick={() => createEntry(true)}>
                      <Copy className="mr-2 h-4 w-4" />
                      이전 값 복사
                    </Button>
                    <Button variant="secondary" className="h-11 rounded-2xl px-4" onClick={exportActiveRecordCsv}>
                      <Download className="mr-2 h-4 w-4" />
                      CSV
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {visibleRecordEntries.length ? (
                      visibleRecordEntries.map((entry) => (
                        <button
                          key={entry.id}
                          type="button"
                          onClick={() => openEntry(entry.id)}
                          className={cn(
                            "w-full rounded-[26px] border p-4 text-left transition",
                            activeEntry?.id === entry.id
                              ? "border-[color:var(--rnest-accent-border)] bg-[color:var(--rnest-accent-soft)] shadow-[0_14px_30px_rgba(123,111,208,0.08)]"
                              : "border-ios-sep bg-white"
                          )}
                        >
                          <div className="flex items-start gap-3">
                            <div className="inline-flex h-11 w-11 items-center justify-center rounded-[18px] border border-[color:var(--rnest-accent-border)] bg-white text-[20px]">
                              {activeTemplate.icon}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <div className="truncate text-[15px] font-semibold text-ios-text">{entry.title}</div>
                                {entry.favorite ? <Star className="h-4 w-4 fill-current text-[color:var(--rnest-accent)]" /> : null}
                              </div>
                              <div className="mt-1 flex flex-wrap gap-2">
                                {buildRecordEntryPreview(entry, activeTemplate).map((item) => (
                                  <Pill key={`${entry.id}-${item}`} className="border-ios-sep bg-[#F8F7FC] text-ios-sub">
                                    {item}
                                  </Pill>
                                ))}
                              </div>
                              <div className="mt-2 text-[12px] text-ios-sub">{formatNotebookDateTime(entry.updatedAt)}</div>
                            </div>
                          </div>
                        </button>
                      ))
                    ) : (
                      <div className="rounded-[26px] border border-dashed border-[color:var(--rnest-accent-border)] bg-[color:var(--rnest-accent-soft)] px-4 py-10 text-center">
                        <div className="text-[15px] font-semibold text-[color:var(--rnest-accent)]">조건에 맞는 기록 항목이 없습니다.</div>
                        <div className="mt-1 text-[12.5px] text-ios-sub">새 항목을 만들거나 필터를 바꿔 보세요.</div>
                      </div>
                    )}
                  </div>
                </CardBody>
              </Card>

              <div className="space-y-5">
                <Card className="rounded-[32px] border-[color:var(--rnest-accent-border)] bg-white shadow-[0_16px_44px_rgba(123,111,208,0.08)]">
                  {activeEntry ? (
                    <CardBody className="space-y-5 p-5">
                      <div className="flex flex-wrap gap-3">
                        <Input
                          label="항목 제목"
                          value={activeEntry.title}
                          onChange={(event) => saveEntry({ ...activeEntry, title: event.target.value })}
                        />
                        <TagEditor
                          value={activeEntry.tags}
                          onChange={(next) => saveEntry({ ...activeEntry, tags: next })}
                          placeholder="예: daily, idea, recap"
                        />
                      </div>

                      <div className="grid gap-4 lg:grid-cols-2">
                        {activeTemplate.fields.map((field) => (
                          <div key={field.id} className={field.type === "note" || field.type === "checklist" ? "lg:col-span-2" : ""}>
                            <label className="mb-1 block text-[12px] font-medium text-ios-muted">{field.label}</label>
                            <RecordValueEditor
                              field={field}
                              value={activeEntry.values[field.id]}
                              onChange={(nextValue) =>
                                saveEntry({
                                  ...activeEntry,
                                  values: {
                                    ...activeEntry.values,
                                    [field.id]: nextValue,
                                  },
                                })
                              }
                            />
                          </div>
                        ))}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant={activeEntry.favorite ? "primary" : "secondary"}
                          className={cn("h-11 rounded-2xl px-4", activeEntry.favorite ? lavenderPrimaryButtonClass : "")}
                          onClick={() => saveEntry({ ...activeEntry, favorite: !activeEntry.favorite })}
                        >
                          <Star className={cn("mr-2 h-4 w-4", activeEntry.favorite ? "fill-current" : "")} />
                          즐겨찾기
                        </Button>
                        <Button variant="secondary" className="h-11 rounded-2xl px-4" onClick={() => duplicateEntry(activeEntry)}>
                          <Copy className="mr-2 h-4 w-4" />
                          복제
                        </Button>
                        {activeEntry.trashedAt == null ? (
                          <Button variant="danger" className="h-11 rounded-2xl px-4" onClick={() => trashEntry(activeEntry.id)}>
                            <Trash2 className="mr-2 h-4 w-4" />
                            휴지통
                          </Button>
                        ) : (
                          <>
                            <Button variant="secondary" className="h-11 rounded-2xl px-4" onClick={() => restoreEntry(activeEntry.id)}>
                              <RotateCcw className="mr-2 h-4 w-4" />
                              복구
                            </Button>
                            <Button variant="danger" className="h-11 rounded-2xl px-4" onClick={() => deleteEntryPermanently(activeEntry.id)}>
                              <Archive className="mr-2 h-4 w-4" />
                              영구 삭제
                            </Button>
                          </>
                        )}
                      </div>

                      <div className="rounded-[24px] border border-ios-sep bg-[#FAFAFE] p-4 text-[12.5px] text-ios-sub">
                        생성 {formatNotebookDateTime(activeEntry.createdAt)} · 마지막 수정 {formatNotebookDateTime(activeEntry.updatedAt)}
                      </div>
                    </CardBody>
                  ) : (
                    <CardBody className="p-8 text-center">
                      <div className="text-[16px] font-semibold text-ios-text">선택된 항목이 없습니다.</div>
                      <div className="mt-1 text-[13px] text-ios-sub">왼쪽에서 항목을 선택하거나 새 항목을 만드세요.</div>
                    </CardBody>
                  )}
                </Card>

                <Card className="rounded-[32px] border-[color:var(--rnest-accent-border)] bg-white shadow-[0_16px_44px_rgba(123,111,208,0.08)]">
                  <CardHeader title="휴지통 템플릿" subtitle="커스텀 템플릿은 휴지통에서 복구하거나 영구 삭제할 수 있습니다." />
                  <CardBody className="space-y-3">
                    {trashedTemplates.length ? (
                      trashedTemplates.map((template) => (
                        <div key={template.id} className="rounded-[24px] border border-ios-sep bg-[#FBFAFF] p-4">
                          <div className="flex items-center gap-3">
                            <div className="text-[20px]">{template.icon}</div>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[14px] font-semibold text-ios-text">{template.name}</div>
                              <div className="mt-1 text-[12px] text-ios-sub">휴지통 이동: {formatNotebookDateTime(template.trashedAt)}</div>
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button variant="secondary" className="h-10 rounded-2xl px-4" onClick={() => restoreTemplate(template.id)}>
                              복구
                            </Button>
                            <Button variant="danger" className="h-10 rounded-2xl px-4" onClick={() => deleteTemplatePermanently(template.id)}>
                              영구 삭제
                            </Button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-[24px] border border-dashed border-[color:var(--rnest-accent-border)] bg-[color:var(--rnest-accent-soft)] px-4 py-8 text-center">
                        <div className="text-[14px] font-semibold text-[color:var(--rnest-accent)]">휴지통에 있는 템플릿이 없습니다.</div>
                        <div className="mt-1 text-[12px] text-ios-sub">커스텀 템플릿만 휴지통 복구 흐름에 들어갑니다.</div>
                      </div>
                    )}
                  </CardBody>
                </Card>
              </div>
            </div>
          </div>
        )}
      </div>
    </ToolPageShell>
  )
}

function LayoutTemplateIcon() {
  return <ListChecks className="mr-2 h-4 w-4" />
}

export default ToolNotebookPage
