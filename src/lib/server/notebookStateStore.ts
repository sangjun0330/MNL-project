import {
  defaultNotebookState,
  hasMeaningfulNotebookState,
  sanitizeNotebookState,
  type RNestNotebookState,
} from "@/lib/notebook"
import { ensureUserRow, loadUserState } from "@/lib/server/userStateStore"
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin"

type NotebookStateRow = {
  userId: string
  payload: RNestNotebookState
  updatedAt: number
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function normalizeJsonForCompare(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeJsonForCompare(item))
  }
  if (isRecord(value)) {
    const normalized: Record<string, unknown> = {}
    for (const key of Object.keys(value).sort()) {
      normalized[key] = normalizeJsonForCompare(value[key])
    }
    return normalized
  }
  return value
}

function isJsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(normalizeJsonForCompare(a)) === JSON.stringify(normalizeJsonForCompare(b))
}

function extractLegacyNotebookState(payload: unknown): RNestNotebookState {
  const state = sanitizeNotebookState(payload)
  return hasMeaningfulNotebookState(state) ? state : defaultNotebookState()
}

export async function loadNotebookState(userId: string): Promise<NotebookStateRow | null> {
  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from("rnest_notebook_state")
    .select("user_id, payload, updated_at")
    .eq("user_id", userId)
    .maybeSingle()

  if (error) {
    if (isMissingTableError(error, "rnest_notebook_state")) {
      return null
    }
    throw error
  }

  if (data) {
    return {
      userId: data.user_id,
      payload: sanitizeNotebookState(data.payload),
      updatedAt: data.updated_at ? new Date(data.updated_at).getTime() : Date.now(),
    }
  }

  const legacyRow = await loadUserState(userId)
  if (!legacyRow?.payload) return null

  const legacyState = extractLegacyNotebookState(legacyRow.payload)
  if (!hasMeaningfulNotebookState(legacyState)) return null

  await saveNotebookState({ userId, payload: legacyState })
  return {
    userId,
    payload: legacyState,
    updatedAt: Date.now(),
  }
}

export async function saveNotebookState(input: { userId: string; payload: unknown }): Promise<RNestNotebookState> {
  const admin = getSupabaseAdmin()
  const payload = sanitizeNotebookState(input.payload)

  await ensureUserRow(input.userId)

  const { data: existing, error: existingError } = await admin
    .from("rnest_notebook_state")
    .select("payload")
    .eq("user_id", input.userId)
    .maybeSingle()

  if (existingError) {
    if (isMissingTableError(existingError, "rnest_notebook_state")) {
      throw new Error("notebook_state_table_missing")
    }
    throw existingError
  }

  if (existing?.payload && isJsonEqual(existing.payload, payload)) {
    return payload
  }

  const { error } = await admin
    .from("rnest_notebook_state")
    .upsert(
      {
        user_id: input.userId,
        payload,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    )

  if (error) {
    if (isMissingTableError(error, "rnest_notebook_state")) {
      throw new Error("notebook_state_table_missing")
    }
    throw error
  }

  return payload
}
