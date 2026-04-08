import {
  defaultNotebookState,
  hasMeaningfulNotebookState,
  sanitizeNotebookState,
  type RNestNotebookState,
} from "@/lib/notebook"
import { ensureUserRow, loadUserState, saveUserState } from "@/lib/server/userStateStore"
import { getSupabaseAdmin } from "@/lib/server/supabaseAdmin"

type NotebookStateRow = {
  userId: string
  payload: RNestNotebookState
  updatedAt: number
}

const LEGACY_NOTEBOOK_STATE_KEY = "notebookState"

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

function extractFallbackNotebookState(payload: unknown): RNestNotebookState {
  if (isRecord(payload) && LEGACY_NOTEBOOK_STATE_KEY in payload) {
    const embedded = sanitizeNotebookState(payload[LEGACY_NOTEBOOK_STATE_KEY])
    if (hasMeaningfulNotebookState(embedded)) return embedded
  }
  return extractLegacyNotebookState(payload)
}

async function loadNotebookStateFallback(userId: string): Promise<NotebookStateRow | null> {
  const legacyRow = await loadUserState(userId)
  if (!legacyRow?.payload) return null

  const fallbackState = extractFallbackNotebookState(legacyRow.payload)
  if (!hasMeaningfulNotebookState(fallbackState)) return null

  return {
    userId,
    payload: fallbackState,
    updatedAt: legacyRow.updatedAt ?? Date.now(),
  }
}

async function saveNotebookStateFallback(userId: string, payload: RNestNotebookState): Promise<RNestNotebookState> {
  await saveUserState({
    userId,
    payload: {
      [LEGACY_NOTEBOOK_STATE_KEY]: payload,
    },
  })
  return payload
}

async function saveNotebookStatePrimary(userId: string, payload: RNestNotebookState): Promise<RNestNotebookState> {
  const admin = getSupabaseAdmin()

  await ensureUserRow(userId)

  const { data: existing, error: existingError } = await admin
    .from("rnest_notebook_state")
    .select("payload")
    .eq("user_id", userId)
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
        user_id: userId,
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

export async function loadNotebookState(userId: string): Promise<NotebookStateRow | null> {
  const admin = getSupabaseAdmin()
  const { data, error } = await admin
    .from("rnest_notebook_state")
    .select("user_id, payload, updated_at")
    .eq("user_id", userId)
    .maybeSingle()

  if (error) {
    if (isMissingTableError(error, "rnest_notebook_state")) {
      return loadNotebookStateFallback(userId)
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

  const fallbackRow = await loadNotebookStateFallback(userId)
  if (!fallbackRow) return null

  try {
    await saveNotebookStatePrimary(userId, fallbackRow.payload)
  } catch (error) {
    if ((error as Error)?.message !== "notebook_state_table_missing") {
      throw error
    }
  }

  return fallbackRow
}

export async function saveNotebookState(input: { userId: string; payload: unknown }): Promise<RNestNotebookState> {
  const payload = sanitizeNotebookState(input.payload)
  try {
    return await saveNotebookStatePrimary(input.userId, payload)
  } catch (error) {
    if ((error as Error)?.message === "notebook_state_table_missing") {
      return saveNotebookStateFallback(input.userId, payload)
    }
    throw error
  }
}
