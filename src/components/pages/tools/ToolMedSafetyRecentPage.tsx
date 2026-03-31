"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserAuthHeaders, useAuthState } from "@/lib/auth";
import { useI18n } from "@/lib/useI18n";
import { buildStructuredCopyText, copyTextToClipboard } from "@/lib/structuredCopy";
import { AnimatedCopyLabel } from "@/components/ui/AnimatedCopyLabel";
import { sanitizeMemoDocument } from "@/lib/notebook";
import { buildMedSafetyMemoBlocks } from "@/lib/medSafetyMemo";
import { useAppStore } from "@/lib/store";
import { ArrowLeft, ChevronRight } from "lucide-react";

/* ── Types ── */

type MedSafetyRecentItem = {
  id: string;
  savedAt: number;
  language: "ko" | "en";
  request: {
    query: string;
    mode?: "ward" | "er" | "icu" | null;
    situation?: "general" | "pre_admin" | "during_admin" | "event_response" | null;
    queryIntent?: "medication" | "device" | "scenario" | null;
  };
  result: {
    title: string;
    summary: string;
    answer: string;
    analyzedAt: number;
    resultKind: "medication" | "device" | "scenario";
    model?: string | null;
    source?: "openai_live" | "openai_fallback";
  };
};

type NarrativeSection = {
  title: string;
  items: string[];
};

type TranslateFn = (key: string, vars?: Record<string, string | number>) => string;

/* ── Design tokens ── */

const PILL = "inline-flex items-center rounded-full px-3 py-1.5 text-[11px] font-semibold";
const PILL_ACCENT = `${PILL} border border-[color:var(--rnest-accent-border)] bg-[color:var(--rnest-accent-soft)] text-[color:var(--rnest-accent)]`;
const PILL_GRAY = `${PILL} border border-gray-200 bg-gray-50 text-gray-500`;
const BTN_PRIMARY =
  "inline-flex h-9 items-center justify-center rounded-full border border-[color:var(--rnest-accent-border)] bg-[color:var(--rnest-accent-soft)] px-4 text-[11px] font-semibold text-[color:var(--rnest-accent)] transition-colors hover:brightness-95 active:brightness-90";
const BTN_SECONDARY =
  "inline-flex h-9 items-center justify-center rounded-full border border-gray-200 bg-gray-50 px-4 text-[11px] font-semibold text-gray-500 transition-colors hover:bg-gray-100 active:bg-gray-200";

/* ── Utility functions (unchanged) ── */

function isHeadingLine(value: string) {
  const line = String(value ?? "").trim();
  if (!line) return false;
  if (!/[:：]$/.test(line)) return false;
  const noColon = line.replace(/[:：]$/, "").trim();
  if (!noColon) return false;
  if (noColon.length > 56) return false;
  return true;
}

function cleanNarrativeLine(value: string) {
  return String(value ?? "")
    .replace(/\u0000/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripBulletPrefix(value: string) {
  return String(value ?? "")
    .replace(/^[-*•·]\s+/, "")
    .replace(/^\d+[.)]\s+/, "")
    .trim();
}

function splitSectionItems(lines: string[]) {
  const out: string[] = [];
  let buffer: string[] = [];

  const flush = () => {
    if (!buffer.length) return;
    out.push(buffer.join(" ").trim());
    buffer = [];
  };

  for (const raw of lines) {
    const line = cleanNarrativeLine(raw);
    if (!line) {
      flush();
      continue;
    }
    const normalized = stripBulletPrefix(line);
    if (!normalized) continue;
    if (/^[-*•·]\s+/.test(line) || /^\d+[.)]\s+/.test(line)) {
      flush();
      buffer.push(normalized);
      flush();
      continue;
    }
    buffer.push(normalized);
  }
  flush();
  return out.filter(Boolean);
}

function parseNarrativeSections(value: string): NarrativeSection[] {
  const lines = String(value ?? "")
    .replace(/\r/g, "")
    .split("\n");

  const sections: NarrativeSection[] = [];
  let currentTitle = "상세 결과";
  let currentLines: string[] = [];

  const pushCurrent = () => {
    const items = splitSectionItems(currentLines);
    if (!items.length) {
      currentLines = [];
      return;
    }
    sections.push({
      title: currentTitle,
      items,
    });
    currentLines = [];
  };

  for (const rawLine of lines) {
    const line = cleanNarrativeLine(rawLine);
    if (!line) {
      currentLines.push("");
      continue;
    }
    if (isHeadingLine(line)) {
      pushCurrent();
      currentTitle = line.replace(/[:：]$/, "").trim();
      continue;
    }
    currentLines.push(line);
  }
  pushCurrent();

  if (sections.length) return sections;

  const fallbackItems = splitSectionItems(lines);
  if (!fallbackItems.length) return [];
  return [{ title: "상세 결과", items: fallbackItems }];
}

function formatDateTime(value: number) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(
    d.getHours()
  ).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatListTime(value: number) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
}

function dayKey(value: number) {
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDayLabel(value: number, t: (key: string) => string) {
  const now = new Date();
  const today = dayKey(now.getTime());
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(now.getDate() - 1);
  const yesterday = dayKey(yesterdayDate.getTime());
  const current = dayKey(value);
  if (current === today) return t("오늘");
  if (current === yesterday) return t("어제");
  const d = new Date(value);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

function shortText(value: string, max = 88) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max).trim()}…`;
}

function kindLabel(kind: "medication" | "device" | "scenario") {
  if (kind === "medication") return "의약품";
  if (kind === "device") return "의료기구";
  return "임상 질문";
}

function modeLabel(mode: "ward" | "er" | "icu" | null | undefined) {
  if (mode === "er") return "ER";
  if (mode === "icu") return "ICU";
  if (mode === "ward") return "병동";
  return "";
}

function situationLabel(situation: "general" | "pre_admin" | "during_admin" | "event_response" | null | undefined) {
  if (situation === "pre_admin") return "투여 전 확인";
  if (situation === "during_admin") return "투여 중 모니터";
  if (situation === "event_response") return "이상/알람 대응";
  if (situation === "general") return "일반 검색";
  return "";
}

function queryIntentLabel(intent: "medication" | "device" | "scenario" | null | undefined) {
  if (intent === "device") return "의료기구";
  if (intent === "scenario") return "상황질문";
  if (intent === "medication") return "의약품";
  return "";
}

function buildRecentCopyText(item: MedSafetyRecentItem, t: TranslateFn) {
  const metaLines = [
    `${t("분석 시각")}: ${formatDateTime(item.savedAt)}`,
    `${t("유형")}: ${t(kindLabel(item.result.resultKind))}`,
  ];
  if (item.request.mode) metaLines.push(`${t("근무 모드")}: ${t(modeLabel(item.request.mode))}`);
  if (item.request.situation) metaLines.push(`${t("상황")}: ${t(situationLabel(item.request.situation))}`);
  if (item.request.queryIntent) metaLines.push(`${t("질문 유형")}: ${t(queryIntentLabel(item.request.queryIntent))}`);

  return buildStructuredCopyText({
    title: item.request.query || item.result.title,
    metaLines,
    sections: [
      { title: t("요약"), body: item.result.summary || "-" },
      { title: t("상세 결과"), body: item.result.answer || "-" },
    ],
  });
}

/* ── Component ── */

export function ToolMedSafetyRecentPage() {
  const { status } = useAuthState();
  const { t } = useI18n();
  const router = useRouter();
  const store = useAppStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<MedSafetyRecentItem[]>([]);
  const [historyLimit, setHistoryLimit] = useState(5);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<"list" | "detail">("list");
  const [copyMessage, setCopyMessage] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!copyMessage) return;
    const timer = window.setTimeout(() => setCopyMessage(""), 1800);
    return () => window.clearTimeout(timer);
  }, [copyMessage]);

  useEffect(() => {
    if (!copiedKey) return;
    const timer = window.setTimeout(() => setCopiedKey(null), 1400);
    return () => window.clearTimeout(timer);
  }, [copiedKey]);

  useEffect(() => {
    if (status !== "authenticated") {
      setLoading(false);
      setItems([]);
      setHistoryLimit(5);
      setSelectedId(null);
      setView("list");
      return;
    }

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const authHeaders = await getBrowserAuthHeaders();
        const res = await fetch("/api/tools/med-safety/history", {
          method: "GET",
          headers: authHeaders,
          cache: "no-store",
        });
        const json = (await res.json().catch(() => null)) as
          | {
              ok?: boolean;
              error?: string;
              data?: { items?: MedSafetyRecentItem[]; historyLimit?: number };
            }
          | null;
        if (!res.ok || !json?.ok) {
          setError(String(json?.error ?? "recent_history_failed"));
          setItems([]);
          setHistoryLimit(5);
          return;
        }
        const limit = Number(json?.data?.historyLimit ?? 5);
        setHistoryLimit(Number.isFinite(limit) ? Math.max(5, Math.min(10, Math.round(limit))) : 5);
        setItems(Array.isArray(json?.data?.items) ? json.data.items : []);
      } catch (cause: any) {
        setError(String(cause?.message ?? "recent_history_failed"));
        setItems([]);
        setHistoryLimit(5);
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [status]);

  useEffect(() => {
    if (!items.length) {
      setSelectedId(null);
      setView("list");
      return;
    }
    if (selectedId && !items.some((item) => item.id === selectedId)) {
      setSelectedId(null);
      setView("list");
    }
  }, [items, selectedId]);

  const groupedItems = useMemo(() => {
    const groups = new Map<string, { label: string; items: MedSafetyRecentItem[] }>();
    for (const item of items) {
      const key = dayKey(item.savedAt);
      const current = groups.get(key);
      if (current) {
        current.items.push(item);
        continue;
      }
      groups.set(key, {
        label: formatDayLabel(item.savedAt, t),
        items: [item],
      });
    }
    return [...groups.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, value]) => ({
        key,
        label: value.label,
        items: value.items.sort((a, b) => b.savedAt - a.savedAt),
      }));
  }, [items, t]);

  const selected = useMemo(() => items.find((item) => item.id === selectedId) ?? null, [items, selectedId]);
  const selectedSections = useMemo(() => parseNarrativeSections(selected?.result.answer ?? ""), [selected]);
  const selectedCopyText = useMemo(() => {
    if (!selected) return "";
    return buildRecentCopyText(selected, t);
  }, [selected, t]);

  const latestSavedAt = items[0]?.savedAt ?? 0;

  async function handleCopySelected() {
    if (!selectedCopyText) return;
    try {
      const copied = await copyTextToClipboard(selectedCopyText);
      if (copied) setCopiedKey("selected");
      setCopyMessage(copied ? t("답변을 복사했습니다.") : t("클립보드를 사용할 수 없습니다."));
    } catch {
      setCopyMessage(t("복사에 실패했습니다."));
    }
  }

  async function handleCopyItem(item: MedSafetyRecentItem) {
    try {
      const copied = await copyTextToClipboard(buildRecentCopyText(item, t));
      if (copied) setCopiedKey(`item:${item.id}`);
      setCopyMessage(copied ? t("답변을 복사했습니다.") : t("클립보드를 사용할 수 없습니다."));
    } catch {
      setCopyMessage(t("복사에 실패했습니다."));
    }
  }

  function handleOpenItem(item: MedSafetyRecentItem) {
    setSelectedId(item.id);
    setView("detail");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleBackToList() {
    setView("list");
  }

  function saveRecentItemToMemo(item: MedSafetyRecentItem) {
    const query = item.request.query || "";
    const answer = item.result.answer || "";
    const summary = item.result.summary || "";
    const title = (item.result.title || query).slice(0, 80);
    const blocks = buildMedSafetyMemoBlocks({
      layout: "brief",
      query,
      answer,
      summary,
      savedAt: item.savedAt,
      resultKind: item.result.resultKind,
      mode: item.request.mode ?? null,
      situation: item.request.situation ?? null,
      queryIntent: item.request.queryIntent ?? null,
      model: item.result.model ?? null,
    });

    const doc = sanitizeMemoDocument({
      title,
      icon: "book",
      blocks,
      tags: ["AI검색"],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const latestMemo = store.getState().memo;
    store.setMemoState({
      ...latestMemo,
      documents: { ...latestMemo.documents, [doc.id]: doc },
      recent: [doc.id, ...latestMemo.recent.filter((id) => id !== doc.id)].slice(0, 20),
    });
    if (typeof window !== "undefined") {
      try {
        sessionStorage.setItem("rnest_notebook_open", doc.id);
      } catch {}
    }
    router.push("/tools/notebook");
  }

  /* ── Render ── */

  return (
    <>
      <div className="mx-auto w-full max-w-[1120px] px-4 pb-24 pt-6 sm:px-6">
        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[26px] font-bold tracking-[-0.02em] text-gray-900 sm:text-[28px]">
              {t("최근 검색 기록")}
            </h1>
            {items.length > 0 && (
              <p className="mt-1 text-[13px] text-gray-500">
                {t("{count}건 저장", { count: items.length })}
                {latestSavedAt ? ` · ${t("마지막")} ${formatDateTime(latestSavedAt)}` : ""}
              </p>
            )}
          </div>
          <Link href="/tools/med-safety" className={BTN_SECONDARY}>
            {t("AI 검색기로")}
          </Link>
        </div>

        {/* ── Main content ── */}
        <div className="mt-6">
          {status !== "authenticated" ? (
            <div className="rounded-2xl border border-gray-100 bg-white px-5 py-8 text-center">
              <div className="text-[17px] font-semibold text-gray-900">{t("로그인이 필요합니다")}</div>
              <p className="mt-2 text-[13px] text-gray-500">{t("최근 검색 기록은 계정별로 저장됩니다.")}</p>
              <Link
                href="/settings/account"
                className="mt-4 inline-flex h-10 items-center justify-center rounded-full border border-[color:var(--rnest-accent-border)] bg-[color:var(--rnest-accent-soft)] px-5 text-[11px] font-semibold text-[color:var(--rnest-accent)] hover:brightness-95"
              >
                {t("로그인/계정 설정")}
              </Link>
            </div>
          ) : loading ? (
            <div className="rounded-2xl border border-gray-100 bg-white px-5 py-10 text-center">
              <div className="text-[15px] font-semibold text-gray-700">{t("최근 기록을 불러오는 중...")}</div>
              <p className="mt-1 text-[13px] text-gray-400">{t("계정에 저장된 완료 검색 결과를 정리하고 있습니다.")}</p>
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-red-100 bg-red-50 px-5 py-5 text-[14px] font-medium text-red-700">
              {t("최근 기록 조회에 실패했습니다.")} ({error})
            </div>
          ) : !items.length ? (
            <div className="rounded-2xl border border-gray-100 bg-white px-5 py-10 text-center">
              <div className="text-[16px] font-semibold text-gray-800">{t("저장된 기록이 없습니다")}</div>
              <p className="mt-2 text-[13px] text-gray-500">
                {t("아직 저장된 최근 검색 결과가 없습니다. AI 검색 실행 후 다시 확인해 주세요.")}
              </p>
            </div>
          ) : view === "list" ? (
            /* ── List View ── */
            <div className="space-y-5">
              {groupedItems.map((group, groupIndex) => (
                <section key={group.key}>
                  <div className="px-1 pb-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400">
                    {group.label} · {group.items.length}
                  </div>
                  <div className="space-y-2">
                    {group.items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleOpenItem(item)}
                        className="group flex w-full items-center gap-4 rounded-2xl border border-gray-100 bg-white px-5 py-4 text-left transition-colors hover:border-[color:var(--rnest-accent-border)] hover:bg-[color:var(--rnest-accent-soft)]"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className={PILL_ACCENT}>{t(kindLabel(item.result.resultKind))}</span>
                            <span className="text-[11px] text-gray-400">{formatListTime(item.savedAt)}</span>
                          </div>
                          <div className="mt-2 truncate text-[15px] font-semibold text-gray-900">
                            {item.result.title}
                          </div>
                          <div className="mt-1 truncate text-[13px] text-gray-500">
                            {shortText(item.request.query || "-", 80)}
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 transition-colors group-hover:text-[color:var(--rnest-accent)]" />
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : selected ? (
            /* ── Detail View ── */
            <div>
              <button
                type="button"
                onClick={handleBackToList}
                className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-gray-500 transition-colors hover:text-gray-900"
              >
                <ArrowLeft className="h-4 w-4" />
                {t("목록으로")}
              </button>

              <div className="rounded-2xl border border-gray-100 bg-white p-5 sm:p-6">
                {/* Header pills */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className={PILL_ACCENT}>{t(kindLabel(selected.result.resultKind))}</span>
                  <span className={PILL_GRAY}>{formatDateTime(selected.savedAt)}</span>
                  {selected.request.mode ? <span className={PILL_GRAY}>{t(modeLabel(selected.request.mode))}</span> : null}
                  {selected.request.situation ? <span className={PILL_GRAY}>{t(situationLabel(selected.request.situation))}</span> : null}
                  {selected.request.queryIntent ? <span className={PILL_GRAY}>{t(queryIntentLabel(selected.request.queryIntent))}</span> : null}
                </div>

                {/* Title */}
                <h2 className="mt-4 text-[22px] font-bold tracking-[-0.02em] text-gray-900 sm:text-[24px]">
                  {selected.result.title}
                </h2>

                {/* Action buttons */}
                <div className="mt-4 flex flex-wrap gap-2">
                  <button type="button" onClick={() => void handleCopySelected()} className={BTN_PRIMARY}>
                    <AnimatedCopyLabel copied={copiedKey === "selected"} label={t("답변 복사")} />
                  </button>
                  <button type="button" onClick={() => saveRecentItemToMemo(selected)} className={BTN_SECONDARY}>
                    {t("메모에 정리하기")}
                  </button>
                </div>

                {/* Question box */}
                <div className="mt-5 rounded-xl bg-[#FAFAFB] px-4 py-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-400">{t("질문")}</div>
                  <div className="mt-1.5 text-[14px] leading-6 text-gray-900">{selected.request.query || "-"}</div>
                </div>

                {/* Summary */}
                <div className="mt-5">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-400">{t("요약")}</div>
                  <div className="mt-1.5 text-[15px] leading-7 text-gray-800">{selected.result.summary}</div>
                </div>

                <hr className="my-5 border-gray-100" />

                {/* Parsed sections */}
                {selectedSections.length ? (
                  <div className="space-y-5">
                    {selectedSections.map((section, index) => (
                      <section key={`${section.title}-${index}`}>
                        <h3 className="text-[15px] font-semibold text-gray-900">{t(section.title || "상세 결과")}</h3>
                        <div className="mt-2 space-y-1.5">
                          {section.items.map((entry, entryIndex) => (
                            <p key={`${section.title}-${entryIndex}`} className="text-[14px] leading-7 text-gray-700">
                              {entry}
                            </p>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap break-words text-[14px] leading-7 text-gray-700">
                    {selected.result.answer}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* ── Toast ── */}
      {copyMessage ? (
        <div className="pointer-events-none fixed bottom-[calc(92px+env(safe-area-inset-bottom))] left-1/2 z-[120] -translate-x-1/2 rounded-full bg-gray-900 px-4 py-2 text-[12px] font-semibold text-white shadow-lg">
          {copyMessage}
        </div>
      ) : null}
    </>
  );
}

export default ToolMedSafetyRecentPage;
