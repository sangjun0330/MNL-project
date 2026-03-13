"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  FilePlus2,
  RefreshCw,
  Save,
  Search,
  Trash2,
} from "lucide-react";
import { authHeaders } from "@/lib/billing/client";
import { signInWithProvider, useAuthState } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import {
  NOTEBOOK_TEMPLATE_SYNC_EVENT_KEY,
  createMemoTemplateFromDocument,
  createNotebookId,
  defaultMemoTemplates,
  formatNotebookDateTime,
  getMemoDocumentTitle,
  memoCoverOptions,
  memoDocumentToPlainText,
  memoIconOptions,
  memoTemplateToPreviewText,
  sanitizeMemoTemplate,
  sanitizeNotebookTags,
  type RNestMemoDocument,
  type RNestMemoTemplate,
  type RNestNotebookState,
} from "@/lib/notebook";
import { plainTextToRichHtml } from "@/lib/notebookRichText";

type AccessState = "unknown" | "granted" | "denied";

function parseErrorMessage(input: string | null) {
  const text = String(input ?? "");
  if (!text) return "템플릿 정보를 불러오지 못했습니다.";
  if (text.includes("login_required")) return "로그인이 필요합니다.";
  if (text.includes("forbidden")) return "관리자 권한이 없는 계정입니다.";
  if (text.includes("templates_required")) return "최소 1개 이상의 템플릿이 필요합니다.";
  if (text.includes("template_required")) return "최소 1개 이상의 템플릿이 필요합니다.";
  if (text.includes("source_document_required")) return "원본 메모를 먼저 선택해 주세요.";
  return text;
}

function buildTemplateSignature(templates: RNestMemoTemplate[]) {
  return JSON.stringify(templates.map((template) => sanitizeMemoTemplate(template)));
}

function createUniqueTemplateLabel(baseLabel: string, templates: RNestMemoTemplate[]) {
  const base = baseLabel.trim().slice(0, 40) || "새 템플릿";
  const existing = new Set(templates.map((template) => template.label.trim()).filter(Boolean));
  if (!existing.has(base)) return base;
  let count = 2;
  while (count < 1000) {
    const candidate = `${base} ${count}`.slice(0, 40);
    if (!existing.has(candidate)) return candidate;
    count += 1;
  }
  return `${base}-${Date.now()}`.slice(0, 40);
}

function createBlankTemplate(templates: RNestMemoTemplate[]) {
  const blank = defaultMemoTemplates.find((template) => template.id === "blank") ?? defaultMemoTemplates[0];
  const label = createUniqueTemplateLabel("새 템플릿", templates);
  return sanitizeMemoTemplate({
    ...blank,
    id: createNotebookId("memo_template"),
    label,
    description: "새 페이지에 바로 적용할 메모 템플릿입니다.",
    title: "새 메모",
    titleHtml: plainTextToRichHtml("새 메모"),
    sourceDocId: null,
    sourceDocTitle: "",
    sourceDocUpdatedAt: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}

function buildTemplateDescriptionFromDocument(document: RNestMemoDocument) {
  const preview = memoDocumentToPlainText(document).replace(/\s+/g, " ").trim().slice(0, 150);
  return preview || "메모에서 가져온 템플릿입니다.";
}

function createTemplateFromSourceDocument(document: RNestMemoDocument, templates: RNestMemoTemplate[]) {
  return sanitizeMemoTemplate(
    createMemoTemplateFromDocument(document, {
      id: createNotebookId("memo_template"),
      label: createUniqueTemplateLabel(getMemoDocumentTitle(document) || "새 템플릿", templates),
      description: buildTemplateDescriptionFromDocument(document),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
  );
}

function buildSourceDocs(state: RNestNotebookState | null) {
  return Object.values(state?.memo.documents ?? {})
    .filter((doc): doc is RNestMemoDocument => Boolean(doc))
    .filter((doc) => doc.trashedAt == null)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

function TemplateListCard({
  template,
  selected,
  index,
  isDefault,
  isDirty,
  onSelect,
}: {
  template: RNestMemoTemplate;
  selected: boolean;
  index: number;
  isDefault: boolean;
  isDirty: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        "w-full rounded-[24px] border px-4 py-4 text-left transition",
        selected
          ? "border-[color:var(--rnest-accent-border)] bg-[rgba(167,139,250,0.1)] shadow-[0_16px_36px_rgba(167,139,250,0.14)]"
          : "border-[#e4ebf4] bg-[#fbfcfe] hover:border-[color:var(--rnest-accent-border)] hover:bg-[rgba(167,139,250,0.04)]",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <div className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] bg-white text-[15px] font-bold uppercase text-[color:var(--rnest-accent)] shadow-[inset_0_0_0_1px_rgba(167,139,250,0.18)]">
          {template.icon.slice(0, 1)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="truncate text-[15px] font-semibold text-ios-text">{template.label}</div>
            <Badge
              variant="secondary"
              className={selected ? "border-transparent bg-white/85 text-[11px] text-[color:var(--rnest-accent)]" : "border-transparent bg-[#eef3fa] text-[11px] text-[#5c6f86]"}
            >
              {isDefault ? "기본" : "운영"}
            </Badge>
            {isDirty ? (
              <Badge variant="secondary" className="border-transparent bg-[#fff4d8] text-[11px] text-[#9a5a00]">
                수정 중
              </Badge>
            ) : null}
          </div>
          <div className="mt-1 line-clamp-2 text-[12px] leading-5 text-ios-sub">
            {template.description || memoTemplateToPreviewText(template)}
          </div>
          <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-ios-muted">
            <span>{index + 1}번째 노출</span>
            <span className="truncate">{template.sourceDocTitle || memoTemplateToPreviewText(template)}</span>
          </div>
        </div>
      </div>
    </button>
  );
}

function SourceDocCard({
  document,
  selected,
  stale,
  onSelect,
}: {
  document: RNestMemoDocument;
  selected: boolean;
  stale: boolean;
  onSelect: () => void;
}) {
  const locked = Boolean(document.lock);
  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        "w-full rounded-[22px] border px-4 py-3 text-left transition",
        selected
          ? "border-[color:var(--rnest-accent-border)] bg-[rgba(167,139,250,0.08)] shadow-[0_12px_28px_rgba(167,139,250,0.1)]"
          : "border-[#e4ebf4] bg-white hover:border-[color:var(--rnest-accent-border)] hover:bg-[rgba(167,139,250,0.03)]",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="truncate text-[14px] font-semibold text-ios-text">
          {getMemoDocumentTitle(document) || "제목 없는 메모"}
        </div>
        {locked ? (
          <Badge variant="secondary" className="border-transparent bg-[#f4e8e8] text-[11px] text-[#a24a4a]">
            잠금
          </Badge>
        ) : null}
        {stale ? (
          <Badge variant="secondary" className="border-transparent bg-[#fff4d8] text-[11px] text-[#9a5a00]">
            원본 최신
          </Badge>
        ) : null}
      </div>
      <div className="mt-1 text-[11px] text-ios-muted">최근 수정 {formatNotebookDateTime(document.updatedAt)}</div>
      <div className="mt-3 line-clamp-3 text-[12px] leading-5 text-ios-sub">
        {memoDocumentToPlainText(document).slice(0, 180) || "본문이 없는 메모입니다."}
      </div>
    </button>
  );
}

function InfoPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#e6edf5] bg-[#fbfcfe] px-3 py-2">
      <div className="text-[11px] font-semibold text-ios-muted">{label}</div>
      <div className="mt-1 text-[13px] font-semibold text-ios-text">{value}</div>
    </div>
  );
}

export function SettingsAdminNotebookTemplatesPage() {
  const { status } = useAuthState();
  const [accessState, setAccessState] = useState<AccessState>("unknown");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [templates, setTemplates] = useState<RNestMemoTemplate[]>([]);
  const [savedSignature, setSavedSignature] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [sourceDocs, setSourceDocs] = useState<RNestMemoDocument[]>([]);
  const [selectedSourceDocId, setSelectedSourceDocId] = useState<string>("");
  const [sourceQuery, setSourceQuery] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (status !== "authenticated") {
      setAccessState("unknown");
      setError(null);
      setNotice(null);
      setTemplates([]);
      setSavedSignature("");
      setSourceDocs([]);
      return;
    }

    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const headers = await authHeaders();
      const accessRes = await fetch("/api/admin/billing/access", {
        method: "GET",
        headers: {
          "content-type": "application/json",
          ...headers,
        },
        cache: "no-store",
      });
      const accessJson = await accessRes.json().catch(() => null);
      if (!accessRes.ok || !accessJson?.ok) {
        throw new Error(String(accessJson?.error ?? `failed_to_check_admin_access:${accessRes.status}`));
      }
      if (!accessJson?.data?.isAdmin) {
        setAccessState("denied");
        setTemplates([]);
        setSourceDocs([]);
        return;
      }

      setAccessState("granted");

      const [templateRes, notebookRes] = await Promise.allSettled([
        fetch("/api/tools/notebook/templates", {
          method: "GET",
          headers: {
            "content-type": "application/json",
            ...headers,
          },
          cache: "no-store",
        }),
        fetch("/api/tools/notebook/state", {
          method: "GET",
          headers: {
            "content-type": "application/json",
            ...headers,
          },
          cache: "no-store",
        }),
      ]);

      let nextTemplates = defaultMemoTemplates.map((template) => sanitizeMemoTemplate(template));
      let nextSourceDocs: RNestMemoDocument[] = [];
      const partialFailures: string[] = [];

      if (templateRes.status === "fulfilled") {
        const json = await templateRes.value.json().catch(() => null);
        if (templateRes.value.ok && json?.ok && Array.isArray(json?.templates)) {
          nextTemplates = json.templates.map((template: RNestMemoTemplate) => sanitizeMemoTemplate(template));
          setLastSavedAt(typeof json?.updatedAt === "number" ? json.updatedAt : null);
        } else {
          partialFailures.push("템플릿 목록");
        }
      } else {
        partialFailures.push("템플릿 목록");
      }

      if (notebookRes.status === "fulfilled") {
        const json = await notebookRes.value.json().catch(() => null);
        if (notebookRes.value.ok && json?.ok && json?.state) {
          nextSourceDocs = buildSourceDocs(json.state as RNestNotebookState);
        } else {
          partialFailures.push("메모 원본 목록");
        }
      } else {
        partialFailures.push("메모 원본 목록");
      }

      setTemplates(nextTemplates);
      setSavedSignature(buildTemplateSignature(nextTemplates));
      setSelectedTemplateId((current) =>
        nextTemplates.some((template) => template.id === current) ? current : nextTemplates[0]?.id ?? null
      );
      setSourceDocs(nextSourceDocs);
      setSelectedSourceDocId((current) =>
        nextSourceDocs.some((doc) => doc.id === current) ? current : nextSourceDocs.find((doc) => !doc.lock)?.id ?? ""
      );
      setError(partialFailures.length > 0 ? `${partialFailures.join(", ")}을 일부 불러오지 못했습니다.` : null);
    } catch (e: any) {
      setAccessState("denied");
      setTemplates([]);
      setSourceDocs([]);
      setSavedSignature("");
      setError(parseErrorMessage(String(e?.message ?? "failed_to_load_notebook_templates_admin")));
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedTemplateId) ?? null,
    [selectedTemplateId, templates]
  );

  const selectedSourceDoc = useMemo(
    () => sourceDocs.find((doc) => doc.id === selectedSourceDocId) ?? null,
    [selectedSourceDocId, sourceDocs]
  );

  const selectedTemplateSourceDoc = useMemo(() => {
    if (!selectedTemplate?.sourceDocId) return null;
    return sourceDocs.find((doc) => doc.id === selectedTemplate.sourceDocId) ?? null;
  }, [selectedTemplate, sourceDocs]);

  const sourceNeedsSync = Boolean(
    selectedTemplate &&
      selectedTemplateSourceDoc &&
      selectedTemplateSourceDoc.updatedAt > (selectedTemplate.sourceDocUpdatedAt ?? 0)
  );

  const filteredSourceDocs = useMemo(() => {
    const query = sourceQuery.replace(/\s+/g, " ").trim().toLowerCase();
    if (!query) return sourceDocs;
    return sourceDocs.filter((doc) => {
      const title = (getMemoDocumentTitle(doc) || "").toLowerCase();
      const body = memoDocumentToPlainText(doc).slice(0, 600).toLowerCase();
      return title.includes(query) || body.includes(query);
    });
  }, [sourceDocs, sourceQuery]);

  const defaultTemplateIdSet = useMemo(
    () => new Set(defaultMemoTemplates.map((template) => template.id)),
    []
  );

  const dirty = useMemo(() => buildTemplateSignature(templates) !== savedSignature, [savedSignature, templates]);

  const selectedTemplateIndex = useMemo(
    () => templates.findIndex((template) => template.id === selectedTemplateId),
    [selectedTemplateId, templates]
  );

  useEffect(() => {
    if (!selectedTemplate?.sourceDocId) return;
    if (!sourceDocs.some((doc) => doc.id === selectedTemplate.sourceDocId)) return;
    setSelectedSourceDocId(selectedTemplate.sourceDocId);
  }, [selectedTemplate?.sourceDocId, sourceDocs]);

  const updateTemplate = useCallback((templateId: string, updater: (template: RNestMemoTemplate) => RNestMemoTemplate) => {
    setTemplates((current) =>
      current.map((template) => (template.id === templateId ? sanitizeMemoTemplate(updater(template)) : template))
    );
    setNotice(null);
  }, []);

  const insertTemplate = useCallback((template: RNestMemoTemplate) => {
    setTemplates((current) => [template, ...current]);
    setSelectedTemplateId(template.id);
    setNotice("새 템플릿 초안을 만들었습니다. 저장하면 새 페이지 팝업에 반영됩니다.");
    setError(null);
  }, []);

  const createBlankTemplateItem = useCallback(() => {
    insertTemplate(createBlankTemplate(templates));
  }, [insertTemplate, templates]);

  const createTemplateFromSelectedMemo = useCallback(() => {
    if (!selectedSourceDoc || selectedSourceDoc.lock) {
      setError("잠금되지 않은 메모를 먼저 선택해 주세요.");
      return;
    }
    insertTemplate(createTemplateFromSourceDocument(selectedSourceDoc, templates));
  }, [insertTemplate, selectedSourceDoc, templates]);

  const applySourceDocToTemplate = useCallback(() => {
    if (!selectedTemplate || !selectedSourceDoc || selectedSourceDoc.lock) {
      setError("적용할 메모를 먼저 선택해 주세요.");
      return;
    }
    const nextTemplate = createMemoTemplateFromDocument(selectedSourceDoc, {
      id: selectedTemplate.id,
      label: selectedTemplate.label,
      description: selectedTemplate.description,
      createdAt: selectedTemplate.createdAt,
      updatedAt: Date.now(),
    });
    setTemplates((current) =>
      current.map((template) => (template.id === selectedTemplate.id ? sanitizeMemoTemplate(nextTemplate) : template))
    );
    setNotice(`"${getMemoDocumentTitle(selectedSourceDoc) || "선택 메모"}" 내용을 현재 템플릿에 반영했습니다.`);
    setError(null);
  }, [selectedSourceDoc, selectedTemplate]);

  const syncTemplateFromLinkedSource = useCallback(() => {
    if (!selectedTemplate?.sourceDocId) {
      setError("연결된 원본 메모가 없습니다.");
      return;
    }
    const linkedDoc = sourceDocs.find((doc) => doc.id === selectedTemplate.sourceDocId);
    if (!linkedDoc || linkedDoc.lock) {
      setError("연결된 원본 메모를 찾을 수 없거나 잠겨 있습니다.");
      return;
    }
    const nextTemplate = createMemoTemplateFromDocument(linkedDoc, {
      id: selectedTemplate.id,
      label: selectedTemplate.label,
      description: selectedTemplate.description,
      createdAt: selectedTemplate.createdAt,
      updatedAt: Date.now(),
    });
    setTemplates((current) =>
      current.map((template) => (template.id === selectedTemplate.id ? sanitizeMemoTemplate(nextTemplate) : template))
    );
    setSelectedSourceDocId(linkedDoc.id);
    setNotice("연결된 원본 메모 내용을 다시 반영했습니다.");
    setError(null);
  }, [selectedTemplate, sourceDocs]);

  const duplicateTemplateItem = useCallback(() => {
    if (!selectedTemplate) return;
    const next = sanitizeMemoTemplate({
      ...selectedTemplate,
      id: createNotebookId("memo_template"),
      label: createUniqueTemplateLabel(`${selectedTemplate.label} 복사본`, templates),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    insertTemplate(next);
  }, [insertTemplate, selectedTemplate, templates]);

  const removeTemplateItem = useCallback(() => {
    if (!selectedTemplate || templates.length <= 1) return;
    const confirmed = typeof window === "undefined" ? true : window.confirm(`"${selectedTemplate.label}" 템플릿을 삭제할까요?`);
    if (!confirmed) return;
    const remaining = templates.filter((template) => template.id !== selectedTemplate.id);
    setTemplates(remaining);
    setSelectedTemplateId(remaining[0]?.id ?? null);
    setNotice("선택한 템플릿을 목록에서 제거했습니다. 저장해야 실제 반영됩니다.");
    setError(null);
  }, [selectedTemplate, templates]);

  const moveTemplateItem = useCallback(
    (direction: -1 | 1) => {
      if (!selectedTemplateId) return;
      setTemplates((current) => {
        const index = current.findIndex((template) => template.id === selectedTemplateId);
        if (index < 0) return current;
        const nextIndex = index + direction;
        if (nextIndex < 0 || nextIndex >= current.length) return current;
        const next = [...current];
        const [item] = next.splice(index, 1);
        next.splice(nextIndex, 0, item);
        return next;
      });
      setNotice("노출 순서를 조정했습니다. 저장하면 새 페이지 팝업 순서가 바뀝니다.");
      setError(null);
    },
    [selectedTemplateId]
  );

  const saveTemplateList = useCallback(async () => {
    if (status !== "authenticated") return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/tools/notebook/templates", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          ...headers,
        },
        body: JSON.stringify({ templates }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok || !Array.isArray(json?.templates)) {
        throw new Error(String(json?.error ?? `failed_to_save_templates:${res.status}`));
      }

      const savedTemplates: RNestMemoTemplate[] = json.templates.map((template: RNestMemoTemplate) =>
        sanitizeMemoTemplate(template)
      );
      const nextSignature = buildTemplateSignature(savedTemplates);
      setTemplates(savedTemplates);
      setSavedSignature(nextSignature);
      setSelectedTemplateId((current) =>
        savedTemplates.some((template) => template.id === current) ? current : savedTemplates[0]?.id ?? null
      );
      setLastSavedAt(typeof json?.updatedAt === "number" ? json.updatedAt : Date.now());
      setNotice("템플릿 변경 사항을 저장했습니다.");
      if (typeof window !== "undefined") {
        window.localStorage.setItem(NOTEBOOK_TEMPLATE_SYNC_EVENT_KEY, String(Date.now()));
      }
    } catch (e: any) {
      setError(parseErrorMessage(String(e?.message ?? "failed_to_save_templates")));
    } finally {
      setSaving(false);
    }
  }, [status, templates]);

  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 pb-24 pt-6">
      <div className="mb-4 flex items-center gap-3">
        <Link
          href="/settings/admin"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/80 bg-white/90 text-[18px] text-ios-text shadow-[0_8px_24px_rgba(17,41,75,0.06)]"
        >
          ←
        </Link>
        <div>
          <div className="text-[28px] font-extrabold tracking-[-0.03em] text-ios-text">메모 템플릿 운영</div>
          <div className="text-[12.5px] text-ios-sub">
            메모 원본과 연결된 템플릿을 만들고, 새 페이지 팝업에 노출될 순서와 내용을 관리합니다.
          </div>
        </div>
      </div>

      {status !== "authenticated" ? (
        <div className="rnest-surface p-5">
          <div className="text-[16px] font-bold text-ios-text">로그인이 필요합니다</div>
          <p className="mt-2 text-[13px] text-ios-sub">관리자 화면은 관리자 계정 로그인 후 접근할 수 있습니다.</p>
          <button
            type="button"
            onClick={() => signInWithProvider("google")}
            className="rnest-btn-primary mt-4 px-4 py-2 text-[13px]"
          >
            Google로 로그인
          </button>
        </div>
      ) : null}

      {status === "authenticated" ? (
        <>
          {accessState === "granted" ? (
            <>
              <section className="rounded-[34px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.97),rgba(244,248,252,0.95))] p-6 shadow-[0_22px_70px_rgba(17,41,75,0.08)]">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <Badge variant="outline" className="border-[#dbe4ef] bg-white text-[11px] text-[#17324d]">
                      Template Workspace
                    </Badge>
                    <div className="mt-3 text-[28px] font-bold tracking-[-0.04em] text-ios-text">
                      메모에서 템플릿을 만들고 바로 배포
                    </div>
                    <p className="mt-3 max-w-[760px] text-[13px] leading-6 text-ios-sub">
                      왼쪽에서 운영 템플릿을 고르고, 오른쪽에서 원본 메모를 선택해 새 템플릿을 만들거나 기존 템플릿 본문을 다시 반영합니다.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void load()}
                      className="inline-flex items-center gap-2 rounded-2xl border border-[#d9e2ee] bg-white px-3 py-2.5 text-[12px] font-semibold text-[#41556f]"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      새로고침
                    </button>
                    <button
                      type="button"
                      onClick={saveTemplateList}
                      disabled={saving || templates.length === 0 || !dirty}
                      className="inline-flex items-center gap-2 rounded-2xl bg-[color:var(--rnest-accent)] px-4 py-2.5 text-[12px] font-semibold text-white shadow-[0_16px_36px_rgba(167,139,250,0.28)] disabled:opacity-60"
                    >
                      <Save className="h-3.5 w-3.5" />
                      {saving ? "저장 중..." : dirty ? "변경 저장" : "저장 완료"}
                    </button>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 md:grid-cols-4">
                  <InfoPill label="운영 템플릿" value={`${templates.length}개`} />
                  <InfoPill label="메모 원본" value={`${sourceDocs.length}개`} />
                  <InfoPill label="현재 선택" value={selectedTemplate?.label || "없음"} />
                  <InfoPill
                    label="마지막 저장"
                    value={lastSavedAt ? formatNotebookDateTime(lastSavedAt) : dirty ? "저장 필요" : "아직 없음"}
                  />
                </div>

                {loading ? (
                  <div className="mt-4 rounded-2xl border border-[#e7edf5] bg-white/70 px-4 py-3 text-[12px] text-ios-muted">
                    템플릿과 메모 원본을 불러오는 중입니다.
                  </div>
                ) : null}

                {error ? (
                  <div className="mt-4 rounded-2xl border border-[#f6dcb3] bg-[#fff7ea] px-4 py-3 text-[12px] leading-5 text-[#b26a11]">
                    {error}
                  </div>
                ) : null}

                {notice ? (
                  <div className="mt-4 rounded-2xl border border-[#dbe7f5] bg-[#f7fbff] px-4 py-3 text-[12px] leading-5 text-[#36567a]">
                    {notice}
                  </div>
                ) : null}
              </section>

              <div className="mt-5 grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
                <aside className="min-w-0 space-y-5">
                  <section className="rounded-[30px] border border-white/80 bg-white/95 p-5 shadow-[0_16px_40px_rgba(17,41,75,0.06)]">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[20px] font-bold tracking-[-0.03em] text-ios-text">운영 템플릿</div>
                        <div className="mt-1 text-[12px] leading-5 text-ios-sub">
                          새 페이지 팝업에는 이 순서대로 템플릿이 표시됩니다.
                        </div>
                      </div>
                      <Badge variant="secondary" className="border-[#d9e2ee] bg-[#f7f9fc] text-[11px] text-[#41556f]">
                        {templates.length}개
                      </Badge>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={createBlankTemplateItem}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#d9e2ee] bg-white px-3 py-2.5 text-[12px] font-semibold text-[#41556f]"
                      >
                        <FilePlus2 className="h-3.5 w-3.5" />
                        빈 템플릿
                      </button>
                      <button
                        type="button"
                        onClick={createTemplateFromSelectedMemo}
                        disabled={!selectedSourceDoc || Boolean(selectedSourceDoc?.lock)}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[color:var(--rnest-accent)] px-3 py-2.5 text-[12px] font-semibold text-white shadow-[0_16px_30px_rgba(167,139,250,0.22)] disabled:opacity-60"
                      >
                        <FilePlus2 className="h-3.5 w-3.5" />
                        메모로 생성
                      </button>
                    </div>

                    <div className="mt-4 max-h-[calc(100vh-280px)] space-y-3 overflow-y-auto pr-1">
                      {templates.map((template, index) => (
                        <TemplateListCard
                          key={template.id}
                          template={template}
                          selected={template.id === selectedTemplateId}
                          index={index}
                          isDefault={defaultTemplateIdSet.has(template.id)}
                          isDirty={dirty && template.id === selectedTemplateId}
                          onSelect={() => setSelectedTemplateId(template.id)}
                        />
                      ))}
                    </div>
                  </section>

                  <section className="rounded-[30px] border border-white/80 bg-white/95 p-5 shadow-[0_16px_40px_rgba(17,41,75,0.06)]">
                    <div className="text-[16px] font-bold tracking-[-0.02em] text-ios-text">선택 템플릿 작업</div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => moveTemplateItem(-1)}
                        disabled={!selectedTemplate || selectedTemplateIndex <= 0}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#d9e2ee] bg-white px-3 py-2.5 text-[12px] font-semibold text-[#41556f] disabled:opacity-50"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                        위로
                      </button>
                      <button
                        type="button"
                        onClick={() => moveTemplateItem(1)}
                        disabled={!selectedTemplate || selectedTemplateIndex < 0 || selectedTemplateIndex >= templates.length - 1}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#d9e2ee] bg-white px-3 py-2.5 text-[12px] font-semibold text-[#41556f] disabled:opacity-50"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                        아래로
                      </button>
                      <button
                        type="button"
                        onClick={duplicateTemplateItem}
                        disabled={!selectedTemplate}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#d9e2ee] bg-white px-3 py-2.5 text-[12px] font-semibold text-[#41556f] disabled:opacity-50"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        복제
                      </button>
                      <button
                        type="button"
                        onClick={removeTemplateItem}
                        disabled={!selectedTemplate || templates.length <= 1}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[#f2d8d8] bg-white px-3 py-2.5 text-[12px] font-semibold text-[#b04a4a] disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        삭제
                      </button>
                    </div>

                    <div className="mt-4 rounded-[22px] border border-[#e7edf5] bg-[#fbfcfe] px-4 py-3 text-[12px] leading-6 text-ios-sub">
                      새 템플릿은 메모에서 직접 만들 수 있고, 저장 전까지는 이 화면에서만 초안 상태로 유지됩니다.
                    </div>
                  </section>
                </aside>

                <section className="min-w-0 space-y-5">
                  {selectedTemplate ? (
                    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_340px]">
                      <div className="min-w-0 space-y-5">
                        <section className="rounded-[30px] border border-white/80 bg-white/95 p-5 shadow-[0_16px_40px_rgba(17,41,75,0.06)]">
                          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                            <div>
                              <div className="text-[16px] font-bold tracking-[-0.02em] text-ios-text">메모 원본 연결</div>
                              <div className="mt-1 text-[12px] leading-5 text-ios-sub">
                                메모를 선택한 뒤 새 템플릿을 만들거나, 현재 선택한 템플릿 본문을 다시 반영할 수 있습니다.
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => void load()}
                                className="inline-flex items-center gap-2 rounded-2xl border border-[#d9e2ee] bg-white px-3 py-2.5 text-[12px] font-semibold text-[#41556f]"
                              >
                                <RefreshCw className="h-3.5 w-3.5" />
                                메모 새로고침
                              </button>
                              <Link
                                href="/tools/notebook"
                                className="inline-flex items-center gap-2 rounded-2xl border border-[#d9e2ee] bg-white px-3 py-2.5 text-[12px] font-semibold text-[#41556f]"
                              >
                                메모 열기
                              </Link>
                            </div>
                          </div>

                          <div className="relative mt-4">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ios-muted" />
                            <input
                              value={sourceQuery}
                              onChange={(event) => setSourceQuery(event.target.value)}
                              placeholder="원본 메모 검색"
                              className="h-11 w-full rounded-2xl border border-[#dbe4ef] bg-[#fbfcfe] pl-10 pr-4 text-[14px] text-ios-text outline-none transition focus:border-[color:var(--rnest-accent-border)]"
                            />
                          </div>

                          <div className="mt-4 max-h-[420px] space-y-3 overflow-y-auto pr-1">
                            {filteredSourceDocs.length > 0 ? (
                              filteredSourceDocs.map((doc) => (
                                <SourceDocCard
                                  key={doc.id}
                                  document={doc}
                                  selected={doc.id === selectedSourceDocId}
                                  stale={selectedTemplate?.sourceDocId === doc.id && doc.updatedAt > (selectedTemplate.sourceDocUpdatedAt ?? 0)}
                                  onSelect={() => setSelectedSourceDocId(doc.id)}
                                />
                              ))
                            ) : (
                              <div className="rounded-[22px] border border-dashed border-[#dbe4ef] bg-[#fbfcfe] px-4 py-5 text-[12px] leading-5 text-ios-muted">
                                검색 조건에 맞는 메모가 없습니다.
                              </div>
                            )}
                          </div>

                          <div className="mt-4 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={createTemplateFromSelectedMemo}
                              disabled={!selectedSourceDoc || Boolean(selectedSourceDoc?.lock)}
                              className="rounded-2xl bg-[color:var(--rnest-accent)] px-4 py-2.5 text-[12px] font-semibold text-white shadow-[0_16px_30px_rgba(167,139,250,0.22)] disabled:opacity-60"
                            >
                              선택 메모로 새 템플릿 만들기
                            </button>
                            <button
                              type="button"
                              onClick={applySourceDocToTemplate}
                              disabled={!selectedTemplate || !selectedSourceDoc || Boolean(selectedSourceDoc?.lock)}
                              className="rounded-2xl border border-[#d9e2ee] bg-white px-4 py-2.5 text-[12px] font-semibold text-[#41556f] disabled:opacity-60"
                            >
                              현재 템플릿 본문 덮어쓰기
                            </button>
                          </div>
                        </section>

                        <section className="rounded-[30px] border border-white/80 bg-white/95 p-5 shadow-[0_16px_40px_rgba(17,41,75,0.06)]">
                          <div className="text-[16px] font-bold tracking-[-0.02em] text-ios-text">템플릿 설정</div>
                          <div className="mt-4 grid gap-4 md:grid-cols-2">
                            <label className="block">
                              <div className="mb-2 text-[12px] font-semibold text-ios-sub">목록 이름</div>
                              <input
                                value={selectedTemplate.label}
                                onChange={(event) =>
                                  updateTemplate(selectedTemplate.id, (template) => ({
                                    ...template,
                                    label: event.target.value,
                                    updatedAt: Date.now(),
                                  }))
                                }
                                placeholder="템플릿 이름"
                                className="h-11 w-full rounded-2xl border border-[#dbe4ef] bg-[#fbfcfe] px-4 text-[14px] text-ios-text outline-none transition focus:border-[color:var(--rnest-accent-border)]"
                              />
                            </label>

                            <label className="block">
                              <div className="mb-2 text-[12px] font-semibold text-ios-sub">새 페이지 제목</div>
                              <input
                                value={selectedTemplate.title}
                                onChange={(event) =>
                                  updateTemplate(selectedTemplate.id, (template) => ({
                                    ...template,
                                    title: event.target.value,
                                    titleHtml: plainTextToRichHtml(event.target.value),
                                    updatedAt: Date.now(),
                                  }))
                                }
                                placeholder="새 페이지 제목"
                                className="h-11 w-full rounded-2xl border border-[#dbe4ef] bg-[#fbfcfe] px-4 text-[14px] text-ios-text outline-none transition focus:border-[color:var(--rnest-accent-border)]"
                              />
                            </label>

                            <label className="block md:col-span-2">
                              <div className="mb-2 text-[12px] font-semibold text-ios-sub">설명</div>
                              <textarea
                                value={selectedTemplate.description}
                                onChange={(event) =>
                                  updateTemplate(selectedTemplate.id, (template) => ({
                                    ...template,
                                    description: event.target.value,
                                    updatedAt: Date.now(),
                                  }))
                                }
                                placeholder="템플릿 설명"
                                className="min-h-[120px] w-full rounded-[22px] border border-[#dbe4ef] bg-[#fbfcfe] px-4 py-3 text-[14px] text-ios-text outline-none transition focus:border-[color:var(--rnest-accent-border)]"
                              />
                            </label>

                            <label className="block">
                              <div className="mb-2 text-[12px] font-semibold text-ios-sub">아이콘</div>
                              <select
                                value={selectedTemplate.icon}
                                onChange={(event) =>
                                  updateTemplate(selectedTemplate.id, (template) => ({
                                    ...template,
                                    icon: event.target.value as RNestMemoTemplate["icon"],
                                    updatedAt: Date.now(),
                                  }))
                                }
                                className="h-11 w-full rounded-2xl border border-[#dbe4ef] bg-[#fbfcfe] px-4 text-[14px] text-ios-text outline-none transition focus:border-[color:var(--rnest-accent-border)]"
                              >
                                {memoIconOptions.map((icon) => (
                                  <option key={icon} value={icon}>
                                    {icon}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <label className="block">
                              <div className="mb-2 text-[12px] font-semibold text-ios-sub">커버</div>
                              <select
                                value={selectedTemplate.coverStyle ?? ""}
                                onChange={(event) =>
                                  updateTemplate(selectedTemplate.id, (template) => ({
                                    ...template,
                                    coverStyle: event.target.value || null,
                                    updatedAt: Date.now(),
                                  }))
                                }
                                className="h-11 w-full rounded-2xl border border-[#dbe4ef] bg-[#fbfcfe] px-4 text-[14px] text-ios-text outline-none transition focus:border-[color:var(--rnest-accent-border)]"
                              >
                                <option value="">없음</option>
                                {memoCoverOptions.map((cover) => (
                                  <option key={cover} value={cover}>
                                    {cover}
                                  </option>
                                ))}
                              </select>
                            </label>

                            <label className="block md:col-span-2">
                              <div className="mb-2 text-[12px] font-semibold text-ios-sub">기본 태그</div>
                              <input
                                value={selectedTemplate.tags.join(", ")}
                                onChange={(event) =>
                                  updateTemplate(selectedTemplate.id, (template) => ({
                                    ...template,
                                    tags: sanitizeNotebookTags(
                                      event.target.value
                                        .split(",")
                                        .map((item) => item.trim())
                                        .filter(Boolean)
                                    ),
                                    updatedAt: Date.now(),
                                  }))
                                }
                                placeholder="예: 회의, 발표, 프로젝트"
                                className="h-11 w-full rounded-2xl border border-[#dbe4ef] bg-[#fbfcfe] px-4 text-[14px] text-ios-text outline-none transition focus:border-[color:var(--rnest-accent-border)]"
                              />
                            </label>
                          </div>
                        </section>
                      </div>

                      <div className="min-w-0 space-y-5">
                        <section className="rounded-[30px] border border-white/80 bg-white/95 p-5 shadow-[0_16px_40px_rgba(17,41,75,0.06)]">
                          <div className="flex items-center justify-between gap-3">
                            <div className="text-[16px] font-bold tracking-[-0.02em] text-ios-text">미리보기</div>
                            {defaultTemplateIdSet.has(selectedTemplate.id) ? (
                              <Badge variant="secondary" className="border-transparent bg-[#eef3fa] text-[11px] text-[#5c6f86]">
                                기본 템플릿
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="border-transparent bg-[rgba(167,139,250,0.12)] text-[11px] text-[color:var(--rnest-accent)]">
                                운영 템플릿
                              </Badge>
                            )}
                          </div>

                          <div className="mt-4 overflow-hidden rounded-[26px] border border-[#e7edf5] bg-[linear-gradient(180deg,#FBFCFE_0%,#FFFFFF_100%)] p-5">
                            <div className="inline-flex h-12 w-12 items-center justify-center rounded-[18px] bg-[color:var(--rnest-accent-soft)] text-[15px] font-bold uppercase text-[color:var(--rnest-accent)]">
                              {selectedTemplate.icon.slice(0, 1)}
                            </div>
                            <div className="mt-4 text-[24px] font-bold tracking-[-0.04em] text-ios-text">
                              {selectedTemplate.title || "제목 없음"}
                            </div>
                            <div className="mt-2 text-[13px] leading-6 text-ios-sub">
                              {selectedTemplate.description || "설명이 아직 없습니다."}
                            </div>
                            {selectedTemplate.tags.length > 0 ? (
                              <div className="mt-4 flex flex-wrap gap-2">
                                {selectedTemplate.tags.map((tag) => (
                                  <Badge
                                    key={tag}
                                    variant="secondary"
                                    className="border-[#d9e2ee] bg-white text-[11px] text-[#41556f]"
                                  >
                                    #{tag}
                                  </Badge>
                                ))}
                              </div>
                            ) : null}
                            <div className="mt-5 rounded-[20px] border border-[#e7edf5] bg-white px-4 py-3 text-[13px] leading-6 text-ios-sub">
                              {memoTemplateToPreviewText(selectedTemplate)}
                            </div>
                          </div>
                        </section>

                        <section className="rounded-[30px] border border-white/80 bg-white/95 p-5 shadow-[0_16px_40px_rgba(17,41,75,0.06)]">
                          <div className="text-[16px] font-bold tracking-[-0.02em] text-ios-text">원본 메모 연결 상태</div>

                          {selectedTemplate.sourceDocId ? (
                            <div className="mt-4 rounded-[22px] border border-[#e7edf5] bg-[#fbfcfe] p-4">
                              <div className="flex flex-wrap items-center gap-2">
                                <div className="text-[13px] font-semibold text-ios-text">
                                  {selectedTemplate.sourceDocTitle || "연결된 메모"}
                                </div>
                                {selectedTemplateSourceDoc ? (
                                  <Badge variant="secondary" className="border-transparent bg-[#eef3fa] text-[11px] text-[#5c6f86]">
                                    연결됨
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary" className="border-transparent bg-[#f4e8e8] text-[11px] text-[#a24a4a]">
                                    찾을 수 없음
                                  </Badge>
                                )}
                                {sourceNeedsSync ? (
                                  <Badge variant="secondary" className="border-transparent bg-[#fff4d8] text-[11px] text-[#9a5a00]">
                                    원본 업데이트됨
                                  </Badge>
                                ) : null}
                              </div>
                              <div className="mt-2 text-[12px] leading-5 text-ios-sub">
                                마지막 연결 시점:{" "}
                                {selectedTemplate.sourceDocUpdatedAt
                                  ? formatNotebookDateTime(selectedTemplate.sourceDocUpdatedAt)
                                  : "기록 없음"}
                              </div>
                              <button
                                type="button"
                                onClick={syncTemplateFromLinkedSource}
                                disabled={!selectedTemplateSourceDoc || Boolean(selectedTemplateSourceDoc?.lock)}
                                className="mt-4 rounded-2xl border border-[#d9e2ee] bg-white px-4 py-2.5 text-[12px] font-semibold text-[#41556f] disabled:opacity-60"
                              >
                                연결된 원본 메모 다시 반영
                              </button>
                            </div>
                          ) : (
                            <div className="mt-4 rounded-[22px] border border-dashed border-[#dbe4ef] bg-[#fbfcfe] px-4 py-5 text-[12px] leading-5 text-ios-muted">
                              아직 원본 메모와 연결되지 않았습니다. 왼쪽 메모 목록에서 선택한 뒤 새 템플릿을 만들거나 현재 템플릿 본문을 덮어쓰면 연결 정보가 저장됩니다.
                            </div>
                          )}
                        </section>

                        <section className="rounded-[30px] border border-white/80 bg-white/95 p-5 shadow-[0_16px_40px_rgba(17,41,75,0.06)]">
                          <div className="text-[16px] font-bold tracking-[-0.02em] text-ios-text">운영 메모</div>
                          <div className="mt-3 space-y-2 text-[12px] leading-6 text-ios-sub">
                            <p>템플릿 본문은 메모에서 가져온 블록 구조를 사용합니다.</p>
                            <p>잠금 메모는 본문을 읽을 수 없어 템플릿 원본으로 쓸 수 없습니다.</p>
                            <p>이미지와 파일 첨부 블록은 템플릿 저장 시 자리표시 텍스트로 정리됩니다.</p>
                          </div>
                        </section>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-[28px] border border-dashed border-[#dbe4ef] bg-white/92 px-5 py-6 text-[13px] text-ios-sub">
                      왼쪽 목록에서 템플릿을 선택하거나 새 템플릿을 추가하세요.
                    </div>
                  )}
                </section>
              </div>
            </>
          ) : (
            <section className="rnest-surface p-5">
              <div className="text-[15px] font-bold text-ios-text">관리자 권한 확인</div>
              <p className="mt-2 text-[13px] leading-6 text-ios-sub">
                {loading
                  ? "관리자 권한을 확인하는 중입니다."
                  : error || "현재 로그인한 계정은 운영 관리자 권한이 없습니다."}
              </p>
            </section>
          )}
        </>
      ) : null}
    </div>
  );
}
