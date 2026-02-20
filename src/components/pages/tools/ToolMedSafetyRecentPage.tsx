"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuthState } from "@/lib/auth";
import { useI18n } from "@/lib/useI18n";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

type MedSafetyRecentItem = {
  id: string;
  savedAt: number;
  language: "ko" | "en";
  request: {
    query: string;
    mode: "ward" | "er" | "icu";
    situation: "general" | "pre_admin" | "during_admin" | "event_response";
    queryIntent: "medication" | "device" | "scenario" | null;
  };
  result: {
    resultKind: "medication" | "device" | "scenario";
    oneLineConclusion: string;
    searchAnswer: string;
    generatedText: string;
    analyzedAt: number;
    item: {
      name: string;
    };
  };
};

const FLAT_CARD_CLASS = "rounded-[24px] border border-ios-sep bg-white shadow-none";
const FLAT_BUTTON =
  "inline-flex h-10 items-center justify-center rounded-full border border-[color:var(--rnest-accent)] bg-[color:var(--rnest-accent-soft)] px-4 text-[13px] font-semibold text-[color:var(--rnest-accent)]";

function formatDateTime(value: number) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(
    d.getHours()
  ).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function modeLabel(mode: "ward" | "er" | "icu") {
  if (mode === "er") return "ER";
  if (mode === "icu") return "ICU";
  return "병동";
}

function kindLabel(kind: "medication" | "device" | "scenario") {
  if (kind === "medication") return "의약품";
  if (kind === "device") return "의료기구";
  return "상황";
}

function shortText(value: string, max = 84) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max).trim()}…`;
}

type NarrativeSection = {
  title: string;
  items: string[];
};

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

function isHeadingLine(value: string) {
  const line = String(value ?? "").trim();
  if (!line) return false;
  if (!/[:：]$/.test(line)) return false;
  const noColon = line.replace(/[:：]$/, "").trim();
  if (!noColon) return false;
  if (noColon.length > 56) return false;
  if (/^(ENTITY_|NOT_FOUND|CANDIDATES|입력명|판정|요청|추가확인|주의)/i.test(noColon)) return false;
  return true;
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
  let hasHeading = false;

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
      hasHeading = true;
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
  if (!hasHeading) {
    return fallbackItems.map((item) => ({
      title: "상세 결과",
      items: [item],
    }));
  }
  return [{ title: "상세 결과", items: fallbackItems }];
}

export function ToolMedSafetyRecentPage() {
  const { status } = useAuthState();
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<MedSafetyRecentItem[]>([]);
  const [selected, setSelected] = useState<MedSafetyRecentItem | null>(null);

  useEffect(() => {
    if (status !== "authenticated") {
      setLoading(false);
      setItems([]);
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
              data?: { items?: MedSafetyRecentItem[] };
            }
          | null;
        if (!res.ok || !json?.ok) {
          setError(String(json?.error ?? "recent_history_failed"));
          setItems([]);
          return;
        }
        setItems(Array.isArray(json?.data?.items) ? json.data.items : []);
      } catch (cause: any) {
        setError(String(cause?.message ?? "recent_history_failed"));
        setItems([]);
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [status]);

  const selectedNarrative = useMemo(() => {
    if (!selected) return "";
    return selected.result.searchAnswer || selected.result.generatedText || selected.result.oneLineConclusion || "";
  }, [selected]);
  const selectedSections = useMemo(() => parseNarrativeSections(selectedNarrative), [selectedNarrative]);

  return (
    <>
      <div className="mx-auto w-full max-w-[920px] space-y-3 px-2 pb-24 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[31px] font-extrabold tracking-[-0.02em] text-[color:var(--rnest-accent)]">{t("최근 AI 검색 기록")}</div>
            <div className="mt-1 text-[13px] text-ios-sub">{t("크레딧이 실제 차감된 완료 검색 결과 최근 5건만 표시됩니다.")}</div>
          </div>
          <Link href="/tools/med-safety" className="pt-1 text-[12px] font-semibold text-[color:var(--rnest-accent)]">
            {t("AI 검색기로")}
          </Link>
        </div>

        <Card className={`p-3 ${FLAT_CARD_CLASS}`}>
          {status !== "authenticated" ? (
            <div className="space-y-2">
              <div className="text-[18px] font-bold text-ios-text">{t("로그인이 필요합니다")}</div>
              <div className="text-[13px] leading-6 text-ios-sub">{t("최근 검색 기록은 계정별로 저장됩니다.")}</div>
              <Link href="/settings/account" className={FLAT_BUTTON}>
                {t("로그인/계정 설정")}
              </Link>
            </div>
          ) : loading ? (
            <div className="text-[14px] text-ios-sub">{t("최근 기록을 불러오는 중...")}</div>
          ) : error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-3 text-[14px] font-semibold text-red-700">
              {t("최근 기록 조회에 실패했습니다.")} ({error})
            </div>
          ) : !items.length ? (
            <div className="text-[14px] leading-6 text-ios-sub">{t("아직 저장된 최근 검색 결과가 없습니다. AI 검색 실행 후 다시 확인해 주세요.")}</div>
          ) : (
            <div className="space-y-2">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelected(item)}
                  className="w-full rounded-2xl border border-ios-sep bg-white px-3 py-3 text-left hover:bg-ios-bg"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[17px] font-bold text-ios-text">{item.result.item.name}</div>
                    <span className="rounded-full border border-[color:var(--rnest-accent)] bg-[color:var(--rnest-accent-soft)] px-2 py-0.5 text-[11px] font-semibold text-[color:var(--rnest-accent)]">
                      {t(kindLabel(item.result.resultKind))}
                    </span>
                  </div>
                  <div className="mt-1 text-[12px] text-ios-sub">
                    {t("모드")}: {t(modeLabel(item.request.mode))} · {t("분석")}: {formatDateTime(item.savedAt)}
                  </div>
                  <div className="mt-1.5 text-[13px] leading-5 text-ios-sub">
                    {shortText(item.result.oneLineConclusion || item.result.searchAnswer || item.result.generatedText)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>

      <BottomSheet
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        variant="appstore"
        title={selected?.result.item.name || t("최근 검색 상세")}
        subtitle={selected ? `${t("분석 시각")}: ${formatDateTime(selected.savedAt)}` : ""}
        maxHeightClassName="max-h-[78dvh]"
      >
        {selected ? (
          <div className="space-y-3">
            <div className="rounded-2xl border border-ios-sep bg-ios-bg px-3 py-3">
              <div className="text-[12px] font-semibold text-ios-muted">{t("요약")}</div>
              <div className="mt-1 text-[15px] leading-6 text-ios-text">{selected.result.oneLineConclusion}</div>
            </div>
            <div className="rounded-2xl border border-ios-sep bg-white px-3 py-3">
              <div className="text-[12px] font-semibold text-ios-muted">{t("검색 입력")}</div>
              <div className="mt-1 text-[15px] leading-6 text-ios-text">{selected.request.query || "-"}</div>
            </div>
            <div className="rounded-2xl border border-ios-sep bg-white px-3 py-3">
              <div className="text-[12px] font-semibold text-ios-muted">{t("상세 결과")}</div>
              {selectedSections.length ? (
                <div className="mt-2 space-y-2">
                  {selectedSections.map((section, idx) => (
                    <div
                      key={`${section.title}-${idx}`}
                      className="rounded-xl border border-ios-sep bg-ios-bg px-3 py-3"
                    >
                      <div className="text-[14px] font-bold text-ios-text">{t(section.title)}</div>
                      <ul className="mt-1 space-y-1 text-[14px] leading-6 text-ios-text">
                        {section.items.map((item, itemIdx) => (
                          <li key={`${section.title}-${idx}-item-${itemIdx}`} className="list-disc pl-1 ml-4">
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-1 text-[15px] leading-6 text-ios-sub">{t("표시할 상세 내용이 없습니다.")}</div>
              )}
            </div>
            <Button variant="secondary" onClick={() => setSelected(null)}>
              {t("닫기")}
            </Button>
          </div>
        ) : null}
      </BottomSheet>
    </>
  );
}

export default ToolMedSafetyRecentPage;
