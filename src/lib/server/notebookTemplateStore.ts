import {
  defaultMemoTemplates,
  sanitizeMemoTemplate,
  sanitizeMemoTemplates,
  type RNestMemoTemplate,
} from "@/lib/server/notebookTemplateRuntime"
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

function isMissingTableError(error: unknown, tableName: string) {
  const code = String((error as { code?: unknown } | null)?.code ?? "").trim()
  const message = String((error as { message?: unknown } | null)?.message ?? "").toLowerCase()
  return (
    code === "42P01" ||
    code === "42703" ||
    code === "PGRST204" ||
    code === "PGRST205" ||
    (message.includes("schema cache") && message.includes(tableName)) ||
    (message.includes("relation") && message.includes(tableName)) ||
    (message.includes(tableName) && message.includes("does not exist"))
  )
}

function isSystemUserForeignKeyError(error: unknown) {
  const code = String((error as { code?: unknown } | null)?.code ?? "").trim()
  const message = String((error as { message?: unknown } | null)?.message ?? "").toLowerCase()
  return (
    code === "23503" &&
    (message.includes("ai_content") ||
      message.includes("rnest_users") ||
      message.includes("foreign key") ||
      message.includes("violates foreign key"))
  )
}

function buildStoredTemplatePayload(templates: RNestMemoTemplate[]) {
  return {
    [NOTEBOOK_TEMPLATE_PAYLOAD_KEY]: {
      version: 1,
      templates,
    } satisfies StoredNotebookTemplatePayload,
  } satisfies Record<string, Json>
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

async function saveLegacyTemplatePayload(templates: RNestMemoTemplate[]) {
  const { loadUserState, saveUserState } = await import("@/lib/server/userStateStore")
  const existing = await loadUserState(NOTEBOOK_TEMPLATE_SYSTEM_USER_ID)
  const existingPayload = isRecord(existing?.payload) ? existing.payload : {}

  await saveUserState({
    userId: NOTEBOOK_TEMPLATE_SYSTEM_USER_ID,
    payload: {
      ...existingPayload,
      ...buildStoredTemplatePayload(templates),
    },
  })

  return {
    templates,
    updatedAt: Date.now(),
  }
}

async function saveNotebookTemplatesPrimary(templates: RNestMemoTemplate[]) {
  const { ensureUserRow } = await import("@/lib/server/userStateStore")
  const admin = getSupabaseAdmin()
  const now = new Date().toISOString()

  await ensureUserRow(NOTEBOOK_TEMPLATE_SYSTEM_USER_ID)

  const { error } = await admin.from("ai_content").upsert(
    {
      user_id: NOTEBOOK_TEMPLATE_SYSTEM_USER_ID,
      date_iso: todayISO(),
      language: "ko",
      data: buildStoredTemplatePayload(templates),
      updated_at: now,
    },
    { onConflict: "user_id" }
  )

  if (error) {
    if (isMissingTableError(error, "ai_content")) {
      throw new Error("notebook_template_ai_content_missing")
    }
    if (isSystemUserForeignKeyError(error)) {
      throw new Error("notebook_template_system_user_missing")
    }
    throw error
  }

  return {
    templates,
    updatedAt: Date.now(),
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
    try {
      await saveNotebookTemplatesPrimary(legacy.stored.templates)
    } catch {
      // Keep serving legacy templates when primary storage is unavailable.
    }
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

  try {
    const saved = await saveNotebookTemplatesPrimary(templates)
    try {
      await saveLegacyTemplatePayload(templates)
    } catch {
      // Primary storage already succeeded; do not fail the request on legacy sync.
    }
    return saved
  } catch (primaryError) {
    try {
      return await saveLegacyTemplatePayload(templates)
    } catch {
      throw primaryError
    }
  }
}
