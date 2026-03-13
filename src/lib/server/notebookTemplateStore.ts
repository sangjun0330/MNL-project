import {
  defaultMemoTemplates,
  sanitizeMemoTemplate,
  sanitizeMemoTemplates,
  type RNestMemoTemplate,
} from "@/lib/notebook"
import { ensureUserRow, loadUserState, saveUserState } from "@/lib/server/userStateStore"

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
  const version = stored.version === 1 ? 1 : null
  if (!version) return null
  return {
    version,
    templates: sanitizeMemoTemplates(stored.templates),
  }
}

export async function loadNotebookTemplates(): Promise<NotebookTemplateRow> {
  try {
    const row = await loadUserState(NOTEBOOK_TEMPLATE_SYSTEM_USER_ID)
    const stored = readStoredTemplatePayload(row?.payload)
    const templates = stored?.templates?.length ? stored.templates : cloneDefaultTemplates()
    return {
      templates,
      updatedAt: row?.updatedAt ?? null,
    }
  } catch {
    return {
      templates: cloneDefaultTemplates(),
      updatedAt: null,
    }
  }
}

export async function saveNotebookTemplates(input: { templates: unknown }) {
  const templates = sanitizeMemoTemplates(input.templates)
  if (templates.length === 0) {
    throw new Error("template_required")
  }

  await ensureUserRow(NOTEBOOK_TEMPLATE_SYSTEM_USER_ID)
  await saveUserState({
    userId: NOTEBOOK_TEMPLATE_SYSTEM_USER_ID,
    payload: {
      [NOTEBOOK_TEMPLATE_PAYLOAD_KEY]: {
        version: 1,
        templates,
      } satisfies StoredNotebookTemplatePayload,
    },
  })

  const row = await loadUserState(NOTEBOOK_TEMPLATE_SYSTEM_USER_ID)
  return {
    templates,
    updatedAt: row?.updatedAt ?? Date.now(),
  }
}
