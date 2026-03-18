import { jsonNoStore, sameOriginRequestError } from "@/lib/server/requestSecurity"
import { defaultMemoTemplates, sanitizeMemoTemplate } from "@/lib/server/notebookTemplateRuntime"

export const runtime = "edge"
export const dynamic = "force-dynamic"

function bad(status: number, message: string) {
  return jsonNoStore({ ok: false, error: message }, { status })
}

export async function GET() {
  try {
    const { loadNotebookTemplates } = await import("@/lib/server/notebookTemplateStore")
    const row = await loadNotebookTemplates()
    return jsonNoStore({
      ok: true,
      templates: row.templates,
      updatedAt: row.updatedAt,
    })
  } catch {
    return jsonNoStore({
      ok: true,
      templates: defaultMemoTemplates.map((template) => sanitizeMemoTemplate(template)),
      updatedAt: null,
      degraded: true,
    })
  }
}

export async function PUT(req: Request) {
  const originError = sameOriginRequestError(req)
  if (originError) return bad(403, originError)

  const { requireBillingAdmin } = await import("@/lib/server/billingAdminAuth")
  const admin = await requireBillingAdmin(req)
  if (!admin.ok) return bad(admin.status, admin.error)

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return bad(400, "invalid_json")
  }

  const templates = (body as { templates?: unknown } | null)?.templates
  if (!templates) return bad(400, "templates_required")

  try {
    const { saveNotebookTemplates } = await import("@/lib/server/notebookTemplateStore")
    const saved = await saveNotebookTemplates({ templates })
    return jsonNoStore({
      ok: true,
      templates: saved.templates,
      updatedAt: saved.updatedAt,
    })
  } catch (error) {
    if ((error as Error)?.message === "template_required") {
      return bad(400, "template_required")
    }
    return bad(500, "failed_to_save_notebook_templates")
  }
}
