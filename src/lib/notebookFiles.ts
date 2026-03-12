import { createMemoAttachment, type RNestMemoAttachment } from "@/lib/notebook"

async function parseJson(response: Response) {
  return response.json().catch(() => null)
}

export async function uploadNotebookFile(file: File, preferredKind?: RNestMemoAttachment["kind"]) {
  const form = new FormData()
  form.set("file", file)
  if (preferredKind) form.set("preferredKind", preferredKind)

  const response = await fetch("/api/tools/notebook/files", {
    method: "POST",
    body: form,
    credentials: "include",
  })

  const payload = await parseJson(response)
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || "failed_to_upload_notebook_file")
  }

  const attachment = createMemoAttachment(payload.attachment)
  if (!attachment) throw new Error("invalid_attachment_response")
  return attachment
}

export async function fetchNotebookFileUrls(paths: string[]) {
  const response = await fetch("/api/tools/notebook/files/sign", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ paths }),
  })
  const payload = await parseJson(response)
  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.error || "failed_to_create_notebook_file_urls")
  }
  return (payload.urls ?? {}) as Record<string, string>
}

export async function deleteNotebookFiles(paths: string[]) {
  if (paths.length === 0) return
  await fetch("/api/tools/notebook/files", {
    method: "DELETE",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ paths }),
  })
}
