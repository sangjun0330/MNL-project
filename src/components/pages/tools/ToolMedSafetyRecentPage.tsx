"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuthState } from "@/lib/auth";
import { useI18n } from "@/lib/useI18n";
import { buildStructuredCopyText, copyTextToClipboard, type StructuredCopySection } from "@/lib/structuredCopy";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

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

const FLAT_CARD_CLASS = "rounded-[28px] border border-ios-sep bg-white shadow-none";
const META_PILL_CLASS = "inline-flex items-center rounded-full border border-ios-sep bg-[#F7F7F8] px-2.5 py-1 text-[11px] font-semibold text-ios-sub";
const PRIMARY_ACTION_CLASS =
  "h-11 flex-1 rounded-full border border-[color:var(--rnest-accent)] bg-[color:var(--rnest-accent)] px-4 text-[14px] font-semibold text-white shadow-none hover:bg-[color:var(--rnest-accent)]/90";
const SECONDARY_ACTION_CLASS =
  "h-11 flex-1 rounded-full border border-ios-sep bg-white px-4 text-[14px] font-semibold text-ios-text shadow-none hover:bg-ios-bg";
const HERO_CARD_CLASS =
  "overflow-hidden rounded-[32px] border border-ios-sep bg-[radial-gradient(circle_at_top_right,rgba(255,234,214,0.72),transparent_36%),linear-gradient(180deg,#FFFFFF_0%,#FCFCFD_100%)] p-5 shadow-none";
const GROUP_CARD_CLASS = "rounded-[30px] border border-ios-sep bg-[#FCFCFD] p-3 shadow-none md:p-4";
const ITEM_CARD_CLASS = "rounded-[24px] border border-ios-sep bg-white p-4 transition";
const ITEM_CARD_ACTIVE_CLASS = "border-[color:var(--rnest-accent-border)] bg-[#FFF9F4] shadow-[0_12px_30px_rgba(16,24,40,0.06)]";
const ITEM_CARD_IDLE_CLASS = "hover:border-[color:var(--rnest-accent-border)] hover:bg-[#FFFDFC]";
const QUICK_ACTION_CLASS =
  "inline-flex h-10 items-center justify-center rounded-full border border-ios-sep bg-white px-4 text-[12.5px] font-semibold text-ios-text";
const QUICK_ACTION_PRIMARY_CLASS =
  "inline-flex h-10 items-center justify-center rounded-full border border-[color:var(--rnest-accent)] bg-[color:var(--rnest-accent-soft)] px-4 text-[12.5px] font-semibold text-[color:var(--rnest-accent)]";
const DETAIL_PANEL_CLASS = "rounded-[30px] border border-ios-sep bg-white p-4 shadow-none";
const TWO_LINE_CLAMP_STYLE = {
  display: "-webkit-box",
  WebkitBoxOrient: "vertical" as const,
  WebkitLineClamp: 2,
  overflow: "hidden",
};

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

function buildRecentCopyText(item: MedSafetyRecentItem, sections: NarrativeSection[], t: TranslateFn) {
  const copySections: StructuredCopySection[] = [
    { title: t("요약"), body: item.result.summary },
    { title: t("질문"), body: item.request.query || "-" },
    ...sections.map((section) => ({
      title: t(section.title),
      items: section.items,
    })),
  ];

  const metaLines = [
    `${t("분석 시각")}: ${formatDateTime(item.savedAt)}`,
    `${t("유형")}: ${t(kindLabel(item.result.resultKind))}`,
  ];
  if (item.request.mode) metaLines.push(`${t("근무 모드")}: ${t(modeLabel(item.request.mode))}`);
  if (item.request.situation) metaLines.push(`${t("상황")}: ${t(situationLabel(item.request.situation))}`);
  if (item.request.queryIntent) metaLines.push(`${t("질문 유형")}: ${t(queryIntentLabel(item.request.queryIntent))}`);

  return buildStructuredCopyText({
    title: item.result.title,
    metaLines,
    sections: copySections,
  });
}

export function ToolMedSafetyRecentPage() {
  const { status } = useAuthState();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<MedSafetyRecentItem[]>([]);
  const [historyLimit, setHistoryLimit] = useState(5);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");

  useEffect(() => {
    if (!copyMessage) return;
    const timer = window.setTimeout(() => setCopyMessage(""), 1800);
    return () => window.clearTimeout(timer);
  }, [copyMessage]);

  useEffect(() => {
    if (status !== "authenticated") {
      setLoading(false);
      setItems([]);
      setHistoryLimit(5);
      setSelectedId(null);
      setDetailOpen(false);
      return;
    }

    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/tools/med-safety/history", {
          method: "GET",
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
    if (typeof window === "undefined") return undefined;
    const media = window.matchMedia("(min-width: 1024px)");
    const sync = () => {
      const next = media.matches;
      setIsDesktop(next);
      if (next) setDetailOpen(false);
    };
    sync();
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", sync);
      return () => media.removeEventListener("change", sync);
    }
    media.addListener(sync);
    return () => media.removeListener(sync);
  }, []);

  useEffect(() => {
    if (!items.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !items.some((item) => item.id === selectedId)) {
      setSelectedId(items[0]!.id);
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

  const selected = useMemo(() => items.find((item) => item.id === selectedId) ?? items[0] ?? null, [items, selectedId]);
  const selectedSections = useMemo(() => parseNarrativeSections(selected?.result.answer ?? ""), [selected]);
  const selectedCopyText = useMemo(() => {
    if (!selected) return "";
    return buildRecentCopyText(selected, selectedSections, t);
  }, [selected, selectedSections, t]);

  const latestSavedAt = items[0]?.savedAt ?? 0;

  async function handleCopySelected() {
    if (!selectedCopyText) return;
    try {
      const copied = await copyTextToClipboard(selectedCopyText);
      setCopyMessage(copied ? t("답변을 복사했습니다.") : t("클립보드를 사용할 수 없습니다."));
    } catch {
      setCopyMessage(t("복사에 실패했습니다."));
    }
  }

  async function handleCopyItem(item: MedSafetyRecentItem) {
    try {
      const copied = await copyTextToClipboard(buildRecentCopyText(item, parseNarrativeSections(item.result.answer), t));
      setCopyMessage(copied ? t("답변을 복사했습니다.") : t("클립보드를 사용할 수 없습니다."));
    } catch {
      setCopyMessage(t("복사에 실패했습니다."));
    }
  }

  function handleOpenItem(item: MedSafetyRecentItem) {
    setSelectedId(item.id);
    if (!isDesktop) setDetailOpen(true);
  }

  const detailContent = selected ? (
    <div className="space-y-4">
      <div className="rounded-[26px] border border-[color:var(--rnest-accent-border)] bg-[linear-gradient(180deg,#FFFDFC_0%,#FFF8F2_100%)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-[color:var(--rnest-accent-soft)] px-2.5 py-1 text-[11px] font-semibold text-[color:var(--rnest-accent)]">
                {t(kindLabel(selected.result.resultKind))}
              </span>
              <span className={META_PILL_CLASS}>{formatDateTime(selected.savedAt)}</span>
              {selected.result.model ? <span className={META_PILL_CLASS}>{selected.result.model}</span> : null}
            </div>
            <div className="mt-2 text-[22px] font-bold tracking-[-0.02em] text-ios-text">{selected.result.title}</div>
            <div className="mt-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-ios-muted">{t("질문")}</div>
            <div className="mt-1 text-[14px] font-semibold leading-6 text-ios-text">{selected.request.query || "-"}</div>
            <div className="mt-4 text-[12px] font-semibold uppercase tracking-[0.08em] text-ios-muted">{t("요약")}</div>
            <div className="mt-1 text-[15px] leading-7 text-ios-text">{selected.result.summary}</div>
          </div>
          {isDesktop ? (
            <button type="button" onClick={() => void handleCopySelected()} className={QUICK_ACTION_PRIMARY_CLASS}>
              {t("답변 복사")}
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {selected.request.mode ? <span className={META_PILL_CLASS}>{t(modeLabel(selected.request.mode))}</span> : null}
        {selected.request.situation ? <span className={META_PILL_CLASS}>{t(situationLabel(selected.request.situation))}</span> : null}
        {selected.request.queryIntent ? <span className={META_PILL_CLASS}>{t(queryIntentLabel(selected.request.queryIntent))}</span> : null}
        <span className={META_PILL_CLASS}>{t("{count}섹션", { count: selectedSections.length || 1 })}</span>
      </div>

      {selectedSections.length ? (
        <div className="space-y-3">
          {selectedSections.map((section, index) => (
            <section key={`${section.title}-${index}`} className="rounded-[24px] border border-ios-sep bg-white px-4 py-4 shadow-[0_10px_24px_rgba(16,24,40,0.03)]">
              <div className="text-[18px] font-bold tracking-[-0.02em] text-ios-text">{t(section.title || "상세 결과")}</div>
              <div className="mt-3 space-y-2">
                {section.items.map((entry, entryIndex) => (
                  <div key={`${section.title}-${entryIndex}`} className="text-[14px] leading-7 text-ios-text">
                    - {entry}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="rounded-[24px] border border-ios-sep bg-white px-4 py-4 shadow-[0_10px_24px_rgba(16,24,40,0.03)]">
          <div className="whitespace-pre-wrap break-words text-[14px] leading-7 text-ios-text">{selected.result.answer}</div>
        </div>
      )}
    </div>
  ) : (
    <div className="rounded-[24px] border border-dashed border-ios-sep bg-[#FCFCFD] px-4 py-5 text-[14px] leading-6 text-ios-sub">
      {t("선택한 검색 결과가 여기 표시됩니다.")}
    </div>
  );

  return (
    <>
      <div className="mx-auto w-full max-w-[1120px] space-y-4 px-2 pb-24 pt-4">
        <Card className={HERO_CARD_CLASS}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-[31px] font-extrabold tracking-[-0.02em] text-ios-text">{t("최근 AI 검색 기록")}</div>
                <span className="inline-flex items-center rounded-full bg-[color:var(--rnest-accent-soft)] px-2.5 py-1 text-[11px] font-semibold text-[color:var(--rnest-accent)]">
                  {t("최근 {count}건", { count: historyLimit })}
                </span>
              </div>
              <div className="mt-2 max-w-[760px] text-[13px] leading-6 text-ios-sub">
                {t("완료된 검색만 저장되며, 항목별로 질문과 답변을 다시 열 수 있습니다.")}
              </div>
            </div>
            <Link
              href="/tools/med-safety"
              className="inline-flex h-11 items-center justify-center rounded-full border border-[color:var(--rnest-accent)] bg-white px-4 text-[12.5px] font-semibold text-[color:var(--rnest-accent)]"
            >
              {t("AI 검색기로")}
            </Link>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-[24px] border border-ios-sep bg-white/90 px-4 py-4">
              <div className="text-[12px] font-semibold text-ios-sub">{t("최근 저장")}</div>
              <div className="mt-2 text-[28px] font-bold tracking-[-0.03em] text-ios-text">{items.length}</div>
              <div className="mt-1 text-[12px] text-ios-sub">{t("완료 검색만 저장")}</div>
            </div>
            <div className="rounded-[24px] border border-ios-sep bg-white/90 px-4 py-4">
              <div className="text-[12px] font-semibold text-ios-sub">{t("마지막 저장")}</div>
              <div className="mt-2 text-[18px] font-bold tracking-[-0.02em] text-ios-text">
                {latestSavedAt ? formatDateTime(latestSavedAt) : "-"}
              </div>
              <div className="mt-1 text-[12px] text-ios-sub">{t("계정별로 동기화됩니다.")}</div>
            </div>
            <div className="rounded-[24px] border border-ios-sep bg-white/90 px-4 py-4">
              <div className="text-[12px] font-semibold text-ios-sub">{t("복사")}</div>
              <div className="mt-2 text-[18px] font-bold tracking-[-0.02em] text-ios-text">{t("바로 복사 가능")}</div>
              <div className="mt-1 text-[12px] text-ios-sub">{t("질문과 답변이 함께 복사됩니다.")}</div>
            </div>
          </div>
        </Card>

        {status !== "authenticated" ? (
          <Card className={`p-5 ${FLAT_CARD_CLASS}`}>
            <div className="space-y-3">
              <div className="text-[19px] font-bold text-ios-text">{t("로그인이 필요합니다")}</div>
              <div className="text-[13px] leading-6 text-ios-sub">{t("최근 검색 기록은 계정별로 저장됩니다.")}</div>
              <Link href="/settings/account" className="inline-flex h-10 items-center justify-center rounded-full border border-[color:var(--rnest-accent)] bg-[color:var(--rnest-accent-soft)] px-4 text-[13px] font-semibold text-[color:var(--rnest-accent)]">
                {t("로그인/계정 설정")}
              </Link>
            </div>
          </Card>
        ) : loading ? (
          <Card className={`p-5 ${FLAT_CARD_CLASS}`}>
            <div className="space-y-2">
              <div className="text-[17px] font-bold text-ios-text">{t("최근 기록을 불러오는 중...")}</div>
              <div className="text-[13px] leading-6 text-ios-sub">{t("계정에 저장된 완료 검색 결과를 정리하고 있습니다.")}</div>
            </div>
          </Card>
        ) : error ? (
          <Card className={`p-4 ${FLAT_CARD_CLASS}`}>
            <div className="rounded-[24px] border border-red-200 bg-red-50 px-4 py-4 text-[14px] font-semibold text-red-700">
              {t("최근 기록 조회에 실패했습니다.")} ({error})
            </div>
          </Card>
        ) : !items.length ? (
          <Card className={`p-5 ${FLAT_CARD_CLASS}`}>
            <div className="space-y-2">
              <div className="text-[18px] font-bold text-ios-text">{t("저장된 기록이 없습니다")}</div>
              <div className="text-[13px] leading-6 text-ios-sub">{t("아직 저장된 최근 검색 결과가 없습니다. AI 검색 실행 후 다시 확인해 주세요.")}</div>
            </div>
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)]">
            <div className="space-y-4">
              {groupedItems.map((group) => (
                <section key={group.key} className={GROUP_CARD_CLASS}>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[16px] font-bold tracking-[-0.01em] text-ios-text">{group.label}</div>
                      <div className="mt-1 text-[12px] text-ios-sub">{t("질문과 요약을 먼저 보고, 전체 보기에서 답변 전문을 확인합니다.")}</div>
                    </div>
                    <span className={META_PILL_CLASS}>{t("{count}건", { count: group.items.length })}</span>
                  </div>

                  <div className="space-y-2">
                    {group.items.map((item) => {
                      const isActive = selected?.id === item.id;
                      return (
                        <article key={item.id} className={`${ITEM_CARD_CLASS} ${isActive ? ITEM_CARD_ACTIVE_CLASS : ITEM_CARD_IDLE_CLASS}`}>
                          <button type="button" onClick={() => handleOpenItem(item)} className="w-full text-left">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="text-[16px] font-bold tracking-[-0.02em] text-ios-text sm:text-[18px]">{item.result.title}</div>
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                  <span className="inline-flex shrink-0 items-center rounded-full bg-[color:var(--rnest-accent-soft)] px-2.5 py-1 text-[10.5px] font-semibold text-[color:var(--rnest-accent)]">
                                    {t(kindLabel(item.result.resultKind))}
                                  </span>
                                  {item.request.mode ? <span className={META_PILL_CLASS}>{t(modeLabel(item.request.mode))}</span> : null}
                                  {item.request.situation ? <span className={META_PILL_CLASS}>{t(situationLabel(item.request.situation))}</span> : null}
                                </div>
                              </div>
                              <span className="inline-flex shrink-0 items-center rounded-full border border-ios-sep bg-white px-3 py-1.5 text-[11px] font-semibold text-ios-sub">
                                {formatListTime(item.savedAt)}
                              </span>
                            </div>

                            <div className="mt-3 text-[14px] font-semibold leading-6 text-ios-text" style={TWO_LINE_CLAMP_STYLE}>
                              {item.request.query || "-"}
                            </div>

                            <div className="mt-2 text-[13.5px] leading-6 text-ios-sub" style={TWO_LINE_CLAMP_STYLE}>
                              {shortText(item.result.summary || item.result.answer || "-", 120)}
                            </div>
                          </button>

                          <div className="mt-4 flex items-center justify-end gap-2">
                            <button type="button" onClick={() => void handleCopyItem(item)} className={QUICK_ACTION_CLASS}>
                              {t("복사")}
                            </button>
                            <button type="button" onClick={() => handleOpenItem(item)} className={QUICK_ACTION_PRIMARY_CLASS}>
                              {t("전체 보기")}
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>

            <div className="hidden lg:block">
              <div className="sticky top-4">
                <Card className={DETAIL_PANEL_CLASS}>
                  <div className="mb-3">
                    <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ios-muted">{t("선택한 결과")}</div>
                    <div className="mt-1 text-[20px] font-bold tracking-[-0.02em] text-ios-text">
                      {selected?.result.title || t("최근 검색 상세")}
                    </div>
                  </div>
                  {detailContent}
                </Card>
              </div>
            </div>
          </div>
        )}
      </div>

      <BottomSheet
        open={!isDesktop && detailOpen && Boolean(selected)}
        onClose={() => setDetailOpen(false)}
        variant="appstore"
        title={selected?.result.title || t("최근 검색 상세")}
        subtitle={selected ? `${t("분석 시각")}: ${formatDateTime(selected.savedAt)}` : ""}
        maxHeightClassName="max-h-[82dvh]"
        footer={
          selected ? (
            <div className="flex gap-2">
              <Button className={PRIMARY_ACTION_CLASS} onClick={() => void handleCopySelected()}>
                {t("답변 복사")}
              </Button>
              <Button variant="secondary" className={SECONDARY_ACTION_CLASS} onClick={() => setDetailOpen(false)}>
                {t("닫기")}
              </Button>
            </div>
          ) : null
        }
      >
        {detailContent}
      </BottomSheet>

      {copyMessage ? (
        <div className="pointer-events-none fixed bottom-[calc(92px+env(safe-area-inset-bottom))] left-1/2 z-[120] -translate-x-1/2 rounded-full bg-black px-4 py-2 text-[12px] font-semibold text-white shadow-lg">
          {copyMessage}
        </div>
      ) : null}
    </>
  );
}

export default ToolMedSafetyRecentPage;
