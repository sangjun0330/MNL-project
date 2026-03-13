"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Plus,
  RefreshCw,
  Save,
  Trash2,
} from "lucide-react";
import { authHeaders } from "@/lib/billing/client";
import { signInWithProvider, useAuthState } from "@/lib/auth";
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
import { Badge } from "@/components/ui/badge";

type AccessState = "unknown" | "granted" | "denied";

function parseErrorMessage(input: string | null) {
  const text = String(input ?? "");
  if (!text) return "템플릿 정보를 불러오지 못했습니다.";
  if (text.includes("login_required")) return "로그인이 필요합니다.";
  if (text.includes("forbidden")) return "관리자 권한이 없는 계정입니다.";
  if (text.includes("templates_required")) return "최소 1개 이상의 템플릿이 필요합니다.";
  if (text.includes("template_required")) return "최소 1개 이상의 템플릿이 필요합니다.";
  return text;
}

function createNewTemplate() {
  const blank = defaultMemoTemplates.find((template) => template.id === "blank") ?? defaultMemoTemplates[0];
  return sanitizeMemoTemplate({
    ...blank,
    id: createNotebookId("memo_template"),
    label: "새 템플릿",
    description: "새 페이지에 바로 적용할 메모 템플릿입니다.",
    title: "새 메모",
    titleHtml: plainTextToRichHtml("새 메모"),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}

function buildSourceDocs(state: RNestNotebookState | null) {
  return Object.values(state?.memo.documents ?? {})
    .filter((doc): doc is RNestMemoDocument => Boolean(doc))
    .filter((doc) => doc.trashedAt == null)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function SettingsAdminNotebookTemplatesPage() {
  const { status } = useAuthState();
  const [accessState, setAccessState] = useState<AccessState>("unknown");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<RNestMemoTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [sourceDocs, setSourceDocs] = useState<RNestMemoDocument[]>([]);
  const [selectedSourceDocId, setSelectedSourceDocId] = useState<string>("");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (status !== "authenticated") {
      setAccessState("unknown");
      setError(null);
      setTemplates([]);
      setSourceDocs([]);
      return;
    }

    setLoading(true);
    setError(null);
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
    [templates, selectedTemplateId]
  );

  const selectedSourceDoc = useMemo(
    () => sourceDocs.find((doc) => doc.id === selectedSourceDocId) ?? null,
    [selectedSourceDocId, sourceDocs]
  );

  const unlockedSourceDocs = useMemo(
    () => sourceDocs.filter((doc) => !doc.lock),
    [sourceDocs]
  );

  const defaultTemplateIdSet = useMemo(
    () => new Set(defaultMemoTemplates.map((template) => template.id)),
    []
  );

  const selectedTemplateIndex = useMemo(
    () => templates.findIndex((template) => template.id === selectedTemplateId),
    [selectedTemplateId, templates]
  );

  const updateTemplate = useCallback((templateId: string, updater: (template: RNestMemoTemplate) => RNestMemoTemplate) => {
    setTemplates((current) =>
      current.map((template) => {
        if (template.id !== templateId) return template;
        return updater(template);
      })
    );
  }, []);

  const createTemplateItem = useCallback(() => {
    const next = createNewTemplate();
    setTemplates((current) => [...current, next]);
    setSelectedTemplateId(next.id);
  }, []);

  const duplicateTemplateItem = useCallback(() => {
    if (!selectedTemplate) return;
    const next = sanitizeMemoTemplate({
      ...selectedTemplate,
      id: createNotebookId("memo_template"),
      label: `${selectedTemplate.label} 복사본`.slice(0, 40),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    setTemplates((current) => [...current, next]);
    setSelectedTemplateId(next.id);
  }, [selectedTemplate]);

  const removeTemplateItem = useCallback(() => {
    if (!selectedTemplateId || templates.length <= 1) return;
    setTemplates((current) => current.filter((template) => template.id !== selectedTemplateId));
    setSelectedTemplateId((current) => {
      const remaining = templates.filter((template) => template.id !== selectedTemplateId);
      return remaining[0]?.id ?? null;
    });
  }, [selectedTemplateId, templates]);

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
    },
    [selectedTemplateId]
  );

  const applySourceDocToTemplate = useCallback(() => {
    if (!selectedTemplate || !selectedSourceDoc || selectedSourceDoc.lock) return;
    const nextTemplate = createMemoTemplateFromDocument(selectedSourceDoc, {
      id: selectedTemplate.id,
      label: selectedTemplate.label,
      description: selectedTemplate.description,
      icon: selectedTemplate.icon,
      createdAt: selectedTemplate.createdAt,
      updatedAt: Date.now(),
    });
    setTemplates((current) =>
      current.map((template) => (template.id === selectedTemplate.id ? nextTemplate : template))
    );
  }, [selectedSourceDoc, selectedTemplate]);

  const saveTemplateList = useCallback(async () => {
    if (status !== "authenticated") return;
    setSaving(true);
    setError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/tools/notebook/templates", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          ...headers,
        },
        body: JSON.stringify({
          templates,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok || !Array.isArray(json?.templates)) {
        throw new Error(String(json?.error ?? `failed_to_save_templates:${res.status}`));
      }

      const savedTemplates: RNestMemoTemplate[] = json.templates.map((template: RNestMemoTemplate) =>
        sanitizeMemoTemplate(template)
      );
      setTemplates(savedTemplates);
      setSelectedTemplateId((current) =>
        savedTemplates.some((template) => template.id === current) ? current : savedTemplates[0]?.id ?? null
      );
      setLastSavedAt(typeof json?.updatedAt === "number" ? json.updatedAt : Date.now());
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
    <div className="mx-auto w-full max-w-[1180px] px-4 pb-24 pt-6">
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
            새 페이지 생성 팝업에서 보일 메모 템플릿을 등록하고 순서를 관리합니다.
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
            <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
              <aside className="overflow-hidden rounded-[32px] border border-white/80 bg-white/95 p-5 shadow-[0_20px_60px_rgba(17,41,75,0.08)]">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[20px] font-bold tracking-[-0.03em] text-ios-text">템플릿 목록</div>
                    <div className="mt-1 text-[12px] leading-5 text-ios-sub">
                      {lastSavedAt ? `${formatNotebookDateTime(lastSavedAt)} 저장 반영` : "기본 템플릿 포함"}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={createTemplateItem}
                    className="inline-flex h-11 items-center gap-2 rounded-full bg-[color:var(--rnest-accent)] px-4 text-[12px] font-semibold text-white shadow-[0_16px_32px_rgba(167,139,250,0.24)]"
                  >
                    <Plus className="h-4 w-4" />
                    새 템플릿
                  </button>
                </div>

                <div className="mt-5 space-y-3">
                  {templates.map((template, index) => {
                    const selected = template.id === selectedTemplateId;
                    const isDefault = defaultTemplateIdSet.has(template.id);
                    return (
                      <button
                        key={template.id}
                        type="button"
                        onClick={() => setSelectedTemplateId(template.id)}
                        className={`
                          w-full overflow-hidden rounded-[24px] border px-4 py-4 text-left transition
                          ${selected
                            ? "border-[color:var(--rnest-accent-border)] bg-[rgba(167,139,250,0.1)] shadow-[0_14px_32px_rgba(167,139,250,0.14)]"
                            : "border-[#e4ebf4] bg-[#fbfcfe] hover:border-[color:var(--rnest-accent-border)] hover:bg-[rgba(167,139,250,0.04)]"}
                        `}
                      >
                        <div className="flex items-start gap-3">
                          <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] bg-white text-[14px] font-bold uppercase text-[color:var(--rnest-accent)] shadow-[inset_0_0_0_1px_rgba(167,139,250,0.18)]">
                            {template.icon.slice(0, 1)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="truncate text-[15px] font-semibold text-ios-text">{template.label}</div>
                              <Badge
                                variant="secondary"
                                className={selected
                                  ? "border-transparent bg-white/80 text-[11px] text-[color:var(--rnest-accent)]"
                                  : "border-transparent bg-[#eef3fa] text-[11px] text-[#5c6f86]"}
                              >
                                {isDefault ? "기본" : "운영"}
                              </Badge>
                            </div>
                            <div className="mt-1 line-clamp-2 text-[12px] leading-5 text-ios-sub">
                              {template.description || memoTemplateToPreviewText(template)}
                            </div>
                            <div className="mt-3 flex items-center justify-between gap-3 text-[11px] text-ios-muted">
                              <span>{index + 1}번째 노출</span>
                              <span className="truncate">{memoTemplateToPreviewText(template)}</span>
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </aside>

              <section className="space-y-5">
                <div className="overflow-hidden rounded-[34px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(244,248,252,0.96))] p-6 shadow-[0_24px_70px_rgba(17,41,75,0.08)]">
                  <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <Badge variant="outline" className="border-[#dbe4ef] bg-white text-[11px] text-[#17324d]">
                        템플릿 편집기
                      </Badge>
                      <div className="mt-3 text-[28px] font-bold tracking-[-0.04em] text-ios-text">
                        {selectedTemplate?.label ?? "템플릿을 선택하세요"}
                      </div>
                      <div className="mt-2 max-w-[720px] text-[13px] leading-6 text-ios-sub">
                        메타데이터는 여기서 다듬고, 실제 블록 구성은 기존 메모를 골라 템플릿으로 덮어씁니다.
                      </div>
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
                        onClick={() => moveTemplateItem(-1)}
                        disabled={!selectedTemplate || selectedTemplateIndex <= 0}
                        className="inline-flex items-center gap-2 rounded-2xl border border-[#d9e2ee] bg-white px-3 py-2.5 text-[12px] font-semibold text-[#41556f] disabled:opacity-50"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                        위로
                      </button>
                      <button
                        type="button"
                        onClick={() => moveTemplateItem(1)}
                        disabled={!selectedTemplate || selectedTemplateIndex < 0 || selectedTemplateIndex >= templates.length - 1}
                        className="inline-flex items-center gap-2 rounded-2xl border border-[#d9e2ee] bg-white px-3 py-2.5 text-[12px] font-semibold text-[#41556f] disabled:opacity-50"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                        아래로
                      </button>
                      <button
                        type="button"
                        onClick={duplicateTemplateItem}
                        disabled={!selectedTemplate}
                        className="inline-flex items-center gap-2 rounded-2xl border border-[#d9e2ee] bg-white px-3 py-2.5 text-[12px] font-semibold text-[#41556f] disabled:opacity-50"
                      >
                        <Copy className="h-3.5 w-3.5" />
                        복제
                      </button>
                      <button
                        type="button"
                        onClick={removeTemplateItem}
                        disabled={!selectedTemplate || templates.length <= 1}
                        className="inline-flex items-center gap-2 rounded-2xl border border-[#f2d8d8] bg-white px-3 py-2.5 text-[12px] font-semibold text-[#b04a4a] disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        삭제
                      </button>
                      <button
                        type="button"
                        onClick={saveTemplateList}
                        disabled={saving || templates.length === 0}
                        className="inline-flex items-center gap-2 rounded-2xl bg-[color:var(--rnest-accent)] px-4 py-2.5 text-[12px] font-semibold text-white shadow-[0_16px_36px_rgba(167,139,250,0.28)] disabled:opacity-60"
                      >
                        <Save className="h-3.5 w-3.5" />
                        {saving ? "저장 중..." : "저장"}
                      </button>
                    </div>
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
                </div>

                {selectedTemplate ? (
                  <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
                    <div className="space-y-5">
                      <div className="overflow-hidden rounded-[30px] border border-white/80 bg-white/95 p-5 shadow-[0_14px_40px_rgba(17,41,75,0.06)]">
                        <div className="text-[16px] font-bold tracking-[-0.02em] text-ios-text">기본 정보</div>
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
                              className="min-h-[116px] w-full rounded-[22px] border border-[#dbe4ef] bg-[#fbfcfe] px-4 py-3 text-[14px] text-ios-text outline-none transition focus:border-[color:var(--rnest-accent-border)]"
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
                      </div>

                      <div className="overflow-hidden rounded-[30px] border border-white/80 bg-white/95 p-5 shadow-[0_14px_40px_rgba(17,41,75,0.06)]">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                          <div>
                            <div className="text-[16px] font-bold tracking-[-0.02em] text-ios-text">메모에서 템플릿 가져오기</div>
                            <div className="mt-1 text-[12px] leading-5 text-ios-sub">
                              메모 페이지에서 다듬은 실제 블록 구성을 현재 템플릿에 덮어씁니다.
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => void load()}
                            className="inline-flex items-center gap-2 rounded-2xl border border-[#d9e2ee] bg-white px-3 py-2.5 text-[12px] font-semibold text-[#41556f]"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                            메모 새로고침
                          </button>
                        </div>

                        <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                          <select
                            value={selectedSourceDocId}
                            onChange={(event) => setSelectedSourceDocId(event.target.value)}
                            className="h-11 w-full rounded-2xl border border-[#dbe4ef] bg-[#fbfcfe] px-4 text-[14px] text-ios-text outline-none transition focus:border-[color:var(--rnest-accent-border)]"
                          >
                            <option value="">메모를 선택하세요</option>
                            {sourceDocs.map((doc) => (
                              <option key={doc.id} value={doc.id} disabled={Boolean(doc.lock)}>
                                {getMemoDocumentTitle(doc) || "제목 없음"}
                                {doc.lock ? " (잠금 메모)" : ""}
                              </option>
                            ))}
                          </select>

                          <button
                            type="button"
                            onClick={applySourceDocToTemplate}
                            disabled={!selectedSourceDoc || Boolean(selectedSourceDoc?.lock)}
                            className="rounded-2xl bg-[color:var(--rnest-accent)] px-4 py-2.5 text-[12px] font-semibold text-white shadow-[0_16px_36px_rgba(167,139,250,0.22)] disabled:opacity-60"
                          >
                            선택 메모로 덮어쓰기
                          </button>
                        </div>

                        {selectedSourceDoc ? (
                          <div className="mt-4 rounded-[22px] border border-[#e7edf5] bg-[#fbfcfe] p-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="text-[13px] font-semibold text-ios-text">
                                {getMemoDocumentTitle(selectedSourceDoc) || "제목 없음"}
                              </div>
                              <Badge variant="secondary" className="border-transparent bg-white text-[11px] text-[#5c6f86]">
                                최근 수정 {formatNotebookDateTime(selectedSourceDoc.updatedAt)}
                              </Badge>
                            </div>
                            <div className="mt-3 whitespace-pre-wrap break-words text-[12px] leading-6 text-ios-sub">
                              {memoDocumentToPlainText(selectedSourceDoc).slice(0, 220) || "본문이 없는 메모입니다."}
                            </div>
                          </div>
                        ) : null}

                        {unlockedSourceDocs.length === 0 ? (
                          <div className="mt-4 rounded-2xl border border-dashed border-[#dbe4ef] bg-[#fbfcfe] px-4 py-3 text-[12px] leading-5 text-ios-muted">
                            불러올 메모가 없으면 먼저 메모 페이지에서 템플릿 초안을 만들어 주세요.
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <aside className="space-y-5 xl:sticky xl:top-6 xl:self-start">
                      <div className="overflow-hidden rounded-[30px] border border-white/80 bg-white/95 p-5 shadow-[0_14px_40px_rgba(17,41,75,0.06)]">
                        <div className="text-[16px] font-bold tracking-[-0.02em] text-ios-text">미리보기</div>
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
                      </div>

                      <div className="overflow-hidden rounded-[30px] border border-white/80 bg-white/95 p-5 shadow-[0_14px_40px_rgba(17,41,75,0.06)]">
                        <div className="text-[16px] font-bold tracking-[-0.02em] text-ios-text">운영 메모</div>
                        <div className="mt-3 space-y-2 text-[12px] leading-6 text-ios-sub">
                          <p>새 페이지 생성 팝업에는 여기서 저장한 순서대로 템플릿이 노출됩니다.</p>
                          <p>잠금 메모는 본문을 읽을 수 없어 템플릿 원본으로 쓸 수 없습니다.</p>
                          <p>이미지와 파일 첨부 블록은 템플릿 저장 시 자리표시 텍스트로 정리됩니다.</p>
                        </div>
                      </div>
                    </aside>
                  </div>
                ) : (
                  <div className="rounded-[28px] border border-dashed border-[#dbe4ef] bg-white/92 px-5 py-6 text-[13px] text-ios-sub">
                    왼쪽 목록에서 템플릿을 선택하거나 새 템플릿을 추가하세요.
                  </div>
                )}
              </section>
            </div>
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
