import {
  defaultMemoTemplates,
  sanitizeMemoTemplate,
  sanitizeMemoTemplates,
  type RNestMemoTemplate,
} from "@/lib/notebook"
import { todayISO } from "@/lib/date"
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin"
import type { Json } from "@/types/supabase"

const NOTEBOOK_TEMPLATE_SYSTEM_USER_ID = "__system_notebook_templates__"
const NOTEBOOK_TEMPLATE_PAYLOAD_KEY = "notebookTemplates"

type NotebookTemplateRow = {
  templates: RNestMemoTemplate[]
  updatedAt: number | null
}

type StoredNotebookTemplatePayload = {
  version: 1
  templates: RNestMemoTemplate[]
}

function cloneDefaultTemplates() {
  return defaultMemoTemplates.map((template) => sanitizeMemoTemplate(template))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function readStoredTemplatePayload(payload: unknown): StoredNotebookTemplatePayload | null {
  if (!isRecord(payload)) return null
  const stored = payload[NOTEBOOK_TEMPLATE_PAYLOAD_KEY]
  if (!isRecord(stored)) return null
  if (stored.version !== 1) return null
  return {
    version: 1,
    templates: sanitizeMemoTemplates(stored.templates),
  }
}

async function loadStoredTemplatePayloadFromAIContent() {
  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from("ai_content")
    .select("data, updated_at")
    .eq("user_id", NOTEBOOK_TEMPLATE_SYSTEM_USER_ID)
    .order("updated_at", { ascending: false })
    .limit(1)

  if (error) throw error

  const row = Array.isArray(data) ? data[0] : null
  return {
    stored: readStoredTemplatePayload((row?.data ?? null) as Json | null),
    updatedAt: row?.updated_at ? new Date(row.updated_at).getTime() : null,
  }
}

async function loadLegacyTemplatePayload() {
  try {
    const { loadUserState } = await import("@/lib/server/userStateStore")
    const row = await loadUserState(NOTEBOOK_TEMPLATE_SYSTEM_USER_ID)
    return {
      stored: readStoredTemplatePayload(row?.payload),
      updatedAt: row?.updatedAt ?? null,
    }
  } catch {
    return { stored: null, updatedAt: null }
  }
}

export async function loadNotebookTemplates(): Promise<NotebookTemplateRow> {
  try {
    const primary = await loadStoredTemplatePayloadFromAIContent()
    if (primary.stored?.templates?.length) {
      return {
        templates: primary.stored.templates,
        updatedAt: primary.updatedAt,
      }
    }
  } catch {
    // Fall through to legacy/default fallback.
  }

  const legacy = await loadLegacyTemplatePayload()
  if (legacy.stored?.templates?.length) {
    return {
      templates: legacy.stored.templates,
      updatedAt: legacy.updatedAt,
    }
  }

  return {
    templates: cloneDefaultTemplates(),
    updatedAt: null,
  }
}

export async function saveNotebookTemplates(input: { templates: unknown }) {
  const templates = sanitizeMemoTemplates(input.templates)
  if (templates.length === 0) {
    throw new Error("template_required")
  }

  const payload = {
    [NOTEBOOK_TEMPLATE_PAYLOAD_KEY]: {
      version: 1,
      templates,
    } satisfies StoredNotebookTemplatePayload,
  } satisfies Record<string, Json>

  const admin = getSupabaseAdmin()
  const now = new Date().toISOString()

  const { error } = await admin.from("ai_content").upsert(
    {
      user_id: NOTEBOOK_TEMPLATE_SYSTEM_USER_ID,
      date_iso: todayISO(),
      language: "ko",
      data: payload,
      updated_at: now,
    },
    { onConflict: "user_id" }
  )

  if (error) throw error

  return {
    templates,
    updatedAt: Date.now(),
  }
}
