"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { getBrowserAuthHeaders, useAuthState } from "@/lib/auth";
import { useI18n } from "@/lib/useI18n";
import { buildStructuredCopyText, copyTextToClipboard } from "@/lib/structuredCopy";
import {
  buildMedSafetySourcesCopyLines,
  extractMedSafetyInlineCitations,
  mergeMedSafetySources,
  type MedSafetyGroundingMode,
  type MedSafetyGroundingStatus,
  type MedSafetySource,
} from "@/lib/medSafetySources";
import { AnimatedCopyLabel } from "@/components/ui/AnimatedCopyLabel";
import { sanitizeMemoDocument } from "@/lib/notebook";
import { buildMedSafetyMemoBlocks, getMedSafetyMemoQuestionTypeLabel } from "@/lib/medSafetyMemo";
import { useAppStore } from "@/lib/store";
import { MedSafetySourceRail } from "@/components/pages/tools/MedSafetySourceRail";
import { MedSafetySourceButton } from "@/components/pages/tools/MedSafetySourceButton";
import {
  buildMedSafetyDisplayLines,
  parseMedSafetyAnswerSections,
  type MedSafetyAnswerDisplayLine,
  type MedSafetyAnswerSection,
  type MedSafetyAnswerSectionTone,
} from "@/lib/medSafetyAnswerSections";
import type {
  MedSafetyQualitySnapshot,
  MedSafetyStructuredAnswer,
  MedSafetyVerificationReport,
} from "@/lib/medSafetyStructured";
import type { SearchCreditType } from "@/lib/billing/plans";
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
    searchType?: SearchCreditType;
    structuredAnswer?: MedSafetyStructuredAnswer | null;
    quality?: MedSafetyQualitySnapshot | null;
    verification?: MedSafetyVerificationReport | null;
    sources: MedSafetySource[];
    groundingMode: MedSafetyGroundingMode;
    groundingStatus: MedSafetyGroundingStatus;
    groundingError?: string | null;
  };
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

/* ── Utility functions ── */

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

function sectionToneStyles(tone: MedSafetyAnswerSectionTone) {
  if (tone === "warning") {
    return {
      shell: "border-[#F0DEC4] bg-[#FFF9F1]",
      title: "text-[#9A5B1B]",
      marker: "bg-[#D88A1D]",
    };
  }
  if (tone === "action") {
    return {
      shell: "border-[#D8E9D9] bg-[#F5FBF6]",
      title: "text-[#2E6A35]",
      marker: "bg-[#4F9F58]",
    };
  }
  if (tone === "summary") {
    return {
      shell: "border-[#D4E0F3] bg-[#F6F9FE]",
      title: "text-[#31598B]",
      marker: "bg-[#4E78B9]",
    };
  }
  if (tone === "compare") {
    return {
      shell: "border-[#DADDEA] bg-[#F7F8FC]",
      title: "text-[#48627E]",
      marker: "bg-[#6D7790]",
    };
  }
  return {
    shell: "border-gray-100 bg-white",
    title: "text-gray-500",
    marker: "bg-gray-300",
  };
}

function displayLineIndentStyle(level: number): CSSProperties | undefined {
  if (level <= 0) return undefined;
  return { paddingLeft: `${Math.min(3, level) * 14}px` };
}

function InlineRecentAnswerText({
  text,
  sources,
  className,
  style,
}: {
  text: string;
  sources: MedSafetySource[];
  className?: string;
  style?: CSSProperties;
}) {
  const parsed = useMemo(() => extractMedSafetyInlineCitations(text, sources), [text, sources]);
  if (!parsed.text && !parsed.citations.length) return null;
  return (
    <div className={["min-w-0 whitespace-pre-wrap break-words", className].filter(Boolean).join(" ")} style={style}>
      {parsed.text ? <span>{parsed.text}</span> : null}
      {parsed.citations.length ? (
        <span className={["inline-flex flex-wrap items-center gap-1 align-middle", parsed.text ? "ml-2" : ""].join(" ")}>
          {parsed.citations.map((source) => (
            <MedSafetySourceButton key={`${source.url}-recent-inline`} source={source} variant="inline" />
          ))}
        </span>
      ) : null}
    </div>
  );
}

function RecentDisplayLine({
  line,
  sources,
}: {
  line: MedSafetyAnswerDisplayLine;
  sources: MedSafetySource[];
}) {
  if (line.kind === "blank") return null;
  const indentStyle = displayLineIndentStyle(line.level);

  if (line.kind === "bullet") {
    return (
      <div className="flex min-w-0 items-start gap-2.5 text-[14px] leading-7 text-gray-700" style={indentStyle}>
        <span className="mt-[11px] h-[5px] w-[5px] shrink-0 rounded-full bg-current opacity-50" aria-hidden="true" />
        <InlineRecentAnswerText text={line.content} sources={sources} />
      </div>
    );
  }

  if (line.kind === "number") {
    return (
      <div className="flex min-w-0 items-start gap-2.5 text-[14px] leading-7 text-gray-700" style={indentStyle}>
        <span className="min-w-[20px] shrink-0 font-semibold text-gray-900">{line.marker}</span>
        <InlineRecentAnswerText text={line.content} sources={sources} />
      </div>
    );
  }

  if (line.kind === "label") {
    return (
      <div className="flex min-w-0 items-start gap-2.5 text-[14px] leading-7 text-gray-700" style={indentStyle}>
        <span className="min-w-[24px] shrink-0 font-semibold text-[color:var(--rnest-accent)]">{line.marker}</span>
        <InlineRecentAnswerText text={line.content} sources={sources} />
      </div>
    );
  }

  return (
    <InlineRecentAnswerText
      text={line.content}
      sources={sources}
      className="text-[14px] leading-7 text-gray-700"
      style={indentStyle}
    />
  );
}

function RecentAnswerSections({ content, sources }: { content: string; sources: MedSafetySource[] }) {
  const sections = useMemo(() => parseMedSafetyAnswerSections(content), [content]);
  if (!sections.length) {
    return <InlineRecentAnswerText text={content} sources={sources} className="text-[14.5px] leading-7 text-gray-700" />;
  }

  return (
    <div className="space-y-4">
      {sections.map((section: MedSafetyAnswerSection, index: number) => {
        const styles = sectionToneStyles(section.tone);
        const lines = buildMedSafetyDisplayLines(section.bodyLines);
        return (
          <section key={`${section.title}-${index}`} className={`rounded-2xl border px-4 py-4 ${styles.shell}`}>
            <div className={`mb-2 flex items-center gap-2 text-[11.5px] font-bold uppercase tracking-[0.06em] ${styles.title}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${styles.marker}`} aria-hidden="true" />
              {section.title || "상세 결과"}
            </div>
            {section.lead ? (
              <InlineRecentAnswerText
                text={section.lead}
                sources={sources}
                className="text-[15px] font-semibold leading-7 text-gray-900"
              />
            ) : null}
            {lines.length ? (
              <div className={section.lead ? "mt-2.5 space-y-1.5" : "space-y-1.5"}>
                {lines.map((line, lineIndex) => (
                  <RecentDisplayLine key={`${section.title}-${lineIndex}`} line={line} sources={sources} />
                ))}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

function structuredTriageLabel(answer: MedSafetyStructuredAnswer) {
  if (answer.triage_level === "critical") return "즉시 대응";
  if (answer.triage_level === "urgent") return "우선 확인";
  return "일반 확인";
}

function structuredTriageClass(answer: MedSafetyStructuredAnswer) {
  if (answer.triage_level === "critical") return "border-[#F2C9C9] bg-[#FFF1F1] text-[#A33636]";
  if (answer.triage_level === "urgent") return "border-[#F0DEC4] bg-[#FFF7EE] text-[#9A5B1B]";
  return "border-[#D8E0EC] bg-[#F1F5FA] text-[#48627E]";
}

function collectCitationIds(items: Array<{ citation_ids?: string[] }>) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    for (const id of item.citation_ids ?? []) {
      const normalized = String(id ?? "").trim();
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      out.push(normalized);
    }
  }
  return out;
}

function citationLookupFromStructuredAnswer(answer: MedSafetyStructuredAnswer, sources: MedSafetySource[]) {
  const merged = mergeMedSafetySources([...answer.citations, ...sources], 12);
  const byId = new Map<string, MedSafetySource>();
  merged.forEach((source, index) => {
    const id = typeof source.id === "string" && source.id ? source.id : `src_${index + 1}`;
    byId.set(id, { ...source, id });
  });
  return byId;
}

function StructuredCitationButtons({ ids, lookup }: { ids: string[]; lookup: Map<string, MedSafetySource> }) {
  const sources = ids.map((id) => lookup.get(id)).filter((item): item is MedSafetySource => Boolean(item));
  if (!sources.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {sources.map((source) => (
        <MedSafetySourceButton key={`${source.url}-${source.id ?? ""}`} source={source} variant="inline" />
      ))}
    </div>
  );
}

function RecentStructuredItems({
  title,
  items,
  lookup,
  tone = "neutral",
  checklist = false,
}: {
  title: string;
  items: MedSafetyStructuredAnswer["key_points"];
  lookup: Map<string, MedSafetySource>;
  tone?: MedSafetyAnswerSectionTone;
  checklist?: boolean;
}) {
  if (!items.length) return null;
  const styles = sectionToneStyles(tone);
  return (
    <section className={`rounded-2xl border px-4 py-4 ${styles.shell}`}>
      <div className={`mb-2 flex items-center gap-2 text-[11.5px] font-bold uppercase tracking-[0.06em] ${styles.title}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${styles.marker}`} aria-hidden="true" />
        {title}
      </div>
      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={`${title}-${index}`} className="flex items-start gap-2.5">
            {checklist ? (
              <span className="mt-[7px] flex h-4 w-4 shrink-0 items-center justify-center rounded border border-[color:var(--rnest-accent-border)] bg-white" aria-hidden="true" />
            ) : (
              <span className="mt-[11px] h-[5px] w-[5px] shrink-0 rounded-full bg-gray-400" aria-hidden="true" />
            )}
            <div className="min-w-0 flex-1">
              <div className="whitespace-pre-wrap break-words text-[14px] leading-7 text-gray-800">{item.text}</div>
              {item.evidence_status === "needs_review" ? (
                <span className="mt-1 inline-flex rounded-full border border-[#F0DEC4] bg-[#FFF7EE] px-2 py-0.5 text-[10.5px] font-semibold text-[#9A5B1B]">
                  근거 확인 필요
                </span>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      <StructuredCitationButtons ids={collectCitationIds(items)} lookup={lookup} />
    </section>
  );
}

function RecentStructuredComparison({
  answer,
  lookup,
}: {
  answer: MedSafetyStructuredAnswer;
  lookup: Map<string, MedSafetySource>;
}) {
  if (!answer.comparison_table.length) return null;
  return (
    <section className="rounded-2xl border border-[#DADDEA] bg-[#F7F8FC] px-4 py-4">
      <div className="mb-3 flex items-center gap-2 text-[11.5px] font-bold uppercase tracking-[0.06em] text-[#48627E]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#6D7790]" aria-hidden="true" />
        비교 포인트
      </div>
      <div className="overflow-x-auto rounded-xl border border-white/80 bg-white">
        <table className="min-w-[720px] w-full border-collapse text-left text-[13px]">
          <thead className="bg-gray-50 text-[11px] uppercase tracking-[0.05em] text-gray-500">
            <tr>
              <th className="px-3 py-2 font-semibold">항목</th>
              <th className="px-3 py-2 font-semibold">언제</th>
              <th className="px-3 py-2 font-semibold">효과</th>
              <th className="px-3 py-2 font-semibold">한계</th>
              <th className="px-3 py-2 font-semibold">실무</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-gray-700">
            {answer.comparison_table.map((row, index) => (
              <tr key={`recent-compare-${index}`}>
                <td className="px-3 py-3 align-top font-semibold text-gray-900">{row.role}</td>
                <td className="px-3 py-3 align-top">{row.when_to_use}</td>
                <td className="px-3 py-3 align-top">{row.effect_onset}</td>
                <td className="px-3 py-3 align-top">{row.limitations}</td>
                <td className="px-3 py-3 align-top">{row.bedside_points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <StructuredCitationButtons ids={collectCitationIds(answer.comparison_table)} lookup={lookup} />
    </section>
  );
}

function RecentStructuredAnswer({
  answer,
  sources,
  quality,
}: {
  answer: MedSafetyStructuredAnswer;
  sources: MedSafetySource[];
  quality?: MedSafetyQualitySnapshot | null;
}) {
  const lookup = citationLookupFromStructuredAnswer(answer, sources);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${structuredTriageClass(answer)}`}>
          {structuredTriageLabel(answer)}
        </span>
        <span className={PILL_GRAY}>{getMedSafetyMemoQuestionTypeLabel(answer.question_type)}</span>
        {quality?.grounded ? (
          <span className="inline-flex items-center rounded-full border border-[#D4E0F3] bg-[#EEF4FF] px-2.5 py-1 text-[11px] font-semibold text-[#31598B]">
            공식 근거 확인됨
          </span>
        ) : null}
      </div>

      <div className="rounded-2xl border border-[#D4E0F3] bg-[#F6F9FE] px-4 py-4">
        <div className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-[#31598B]">핵심 결론</div>
        <div className="mt-2 whitespace-pre-wrap break-words text-[16px] font-semibold leading-8 text-gray-900">
          {answer.bottom_line}
        </div>
        <StructuredCitationButtons ids={answer.bottom_line_citation_ids} lookup={lookup} />
      </div>

      <RecentStructuredItems title="핵심 포인트" items={answer.key_points} lookup={lookup} tone="summary" />
      <RecentStructuredItems title="지금 할 일" items={answer.recommended_actions} lookup={lookup} tone="action" checklist />
      <RecentStructuredItems title="하지 말아야 할 것" items={answer.do_not_do} lookup={lookup} tone="warning" />
      <RecentStructuredItems title="즉시 보고 상황" items={answer.when_to_escalate} lookup={lookup} tone="warning" />
      <RecentStructuredItems title="환자별 주의사항" items={answer.patient_specific_caveats} lookup={lookup} />
      <RecentStructuredComparison answer={answer} lookup={lookup} />

      {answer.uncertainty.needs_verification && answer.uncertainty.summary ? (
        <div className="rounded-2xl border border-[#F0DEC4] bg-[#FFF7EE] px-4 py-3 text-[13px] leading-6 text-[#9A5B1B]">
          {answer.uncertainty.summary}
        </div>
      ) : null}
    </div>
  );
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
      ...(item.result.sources.length ? [{ title: t("출처"), body: buildMedSafetySourcesCopyLines(item.result.sources).join("\n") }] : []),
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
  const selectedStructuredAnswer = useMemo(
    () => selected?.result.verification?.corrected_answer ?? selected?.result.structuredAnswer ?? null,
    [selected]
  );
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
    const structuredAnswer = item.result.verification?.corrected_answer ?? item.result.structuredAnswer ?? null;
    const categoryLabel = getMedSafetyMemoQuestionTypeLabel(structuredAnswer?.question_type ?? null);
    const title = `${categoryLabel} · ${item.result.title || query}`.slice(0, 80);
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
      structuredAnswer,
      sources: item.result.sources ?? [],
      questionType: structuredAnswer?.question_type ?? null,
      triageLevel: structuredAnswer?.triage_level ?? null,
      searchType: item.result.searchType ?? null,
    });

    const doc = sanitizeMemoDocument({
      title,
      icon: "book",
      blocks,
      tags: Array.from(new Set(["AI검색", categoryLabel])),
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

                <hr className="my-5 border-gray-100" />

                {/* 화면 답변과 같은 구조화 렌더링 */}
                {selectedStructuredAnswer ? (
                  <RecentStructuredAnswer
                    answer={selectedStructuredAnswer}
                    sources={selected.result.sources}
                    quality={selected.result.quality ?? null}
                  />
                ) : (
                  <RecentAnswerSections content={selected.result.answer} sources={selected.result.sources} />
                )}

                <MedSafetySourceRail
                  className="mt-6"
                  sources={selected.result.sources}
                  groundingMode={selected.result.groundingMode}
                  groundingStatus={selected.result.groundingStatus}
                  groundingError={selected.result.groundingError ?? null}
                />
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
