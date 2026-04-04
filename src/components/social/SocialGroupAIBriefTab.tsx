"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, BatteryMedium, CalendarDays, ShieldAlert } from "lucide-react";
import { addDays, fromISODate, isISODate, toISODate } from "@/lib/date";
import { useAuthState } from "@/lib/auth";
import {
  buildSocialClientCacheKey,
  clearSocialClientCache,
  getSocialClientCache,
  setSocialClientCache,
} from "@/lib/socialClientCache";
import { useClientSyncSnapshot } from "@/lib/clientSyncStore";
import { Button } from "@/components/ui/Button";
import { SocialGroupAIBriefLockedCard } from "@/components/social/SocialGroupAIBriefLockedCard";
import { SocialGroupAIBriefPersonalCardToggle } from "@/components/social/SocialGroupAIBriefPersonalCardToggle";
import {
  SocialAvatarStackButton,
  SocialMemberPreviewSheet,
} from "@/components/social/SocialMemberPreviewSheet";
import { useSocialGroupAIBriefRealtimeRefresh } from "@/components/social/useSocialGroupAIBriefRealtimeRefresh";
import type {
  SocialGroupAIBriefAction,
  SocialGroupAIBriefFlowRow,
  SocialGroupAIBriefPersonalCard,
  SocialGroupAIBriefResponse,
  SocialGroupAIBriefTone,
  SocialGroupAIBriefWindow,
} from "@/types/social";

type Props = {
  groupId: number;
  memberIds: string[];
};

function currentWeekCacheKeyPart() {
  const now = Date.now();
  const kst = new Date(now + 9 * 60 * 60 * 1000);
  const day = kst.getUTCDay();
  const delta = day === 0 ? -6 : 1 - day;
  kst.setUTCDate(kst.getUTCDate() + delta);
  const year = kst.getUTCFullYear();
  const month = String(kst.getUTCMonth() + 1).padStart(2, "0");
  const date = String(kst.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${date}`;
}

function toneBadgeClasses(tone: SocialGroupAIBriefTone) {
  if (tone === "recover") return "bg-amber-50 text-amber-700";
  if (tone === "watch") return "bg-sky-50 text-sky-700";
  return "bg-[color:var(--rnest-accent-soft)] text-[color:var(--rnest-accent)]";
}

function toneLevelClasses(tone: SocialGroupAIBriefTone, active: boolean) {
  if (!active) return "bg-ios-sep/70";
  if (tone === "recover") return "bg-amber-400";
  if (tone === "watch") return "bg-sky-400";
  return "bg-[color:var(--rnest-accent)]";
}

function stateMessage(errorCode: string | null) {
  if (errorCode === "group_ai_brief_generation_failed") return "최근 AI 요약을 새로 만들지 못했어요.";
  if (errorCode === "group_ai_brief_missing") return "AI 요약이 아직 준비되지 않았어요.";
  return "AI 브리프를 불러오지 못했어요.";
}

function mapRequestErrorMessage(errorCode: string | null | undefined, fallback: string) {
  switch (errorCode) {
    case "consent_required":
      return "서비스 동의 후 사용할 수 있어요.";
    case "login_required":
      return "로그인 후 사용할 수 있어요.";
    case "not_group_member":
      return "이 그룹의 멤버만 AI 브리프를 볼 수 있어요.";
    case "group_not_found":
      return "그룹을 찾을 수 없어요.";
    case "paid_plan_required_for_group_ai_brief":
      return "AI 브리프는 Plus/Pro에서 사용할 수 있어요.";
    case "group_ai_brief_refresh_cooldown":
      return "AI 요약은 06:00 / 18:00 KST에 자동 갱신돼요.";
    case "health_visibility_required_for_personal_card":
      return "건강 공유를 켠 뒤에 개인 카드에 참여할 수 있어요.";
    default:
      return fallback;
  }
}

function formatMetric(value: number | null, suffix = "") {
  if (value == null || !Number.isFinite(value)) return "-";
  return `${value}${suffix}`;
}

function InlineSpinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-current border-t-transparent"
    />
  );
}

function EligibilityStatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-[22px] bg-ios-bg px-4 py-4">
      <p className="text-[11px] font-semibold text-ios-muted">{label}</p>
      <p className="mt-2 text-[22px] font-bold tracking-[-0.03em] text-ios-text">{value}</p>
      <p className="mt-1 text-[11px] leading-5 text-ios-muted">{hint}</p>
    </div>
  );
}

function FlowIcon({ id }: { id: SocialGroupAIBriefFlowRow["id"] }) {
  if (id === "energy") return <BatteryMedium className="h-4 w-4" />;
  if (id === "risk") return <ShieldAlert className="h-4 w-4" />;
  return <CalendarDays className="h-4 w-4" />;
}

function LevelBar({ level, tone }: { level: number; tone: SocialGroupAIBriefTone }) {
  return (
    <div className="mt-3 flex gap-1.5">
      {Array.from({ length: 5 }).map((_, index) => (
        <span
          key={index}
          className={`h-2 flex-1 rounded-full ${toneLevelClasses(tone, index < level)}`}
        />
      ))}
    </div>
  );
}

function FlowBoardRow({ row }: { row: SocialGroupAIBriefFlowRow }) {
  return (
    <div className="rounded-[26px] bg-white/80 px-4 py-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.72)]">
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl ${toneBadgeClasses(row.tone)}`}>
          <FlowIcon id={row.id} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ios-muted">{row.label}</p>
              <p className="mt-1 text-[15px] font-semibold tracking-[-0.02em] text-ios-text">{row.title}</p>
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${toneBadgeClasses(row.tone)}`}>
              {row.factLabel}
            </span>
          </div>
          <LevelBar level={row.level} tone={row.tone} />
          <p className="mt-2 text-[12px] leading-6 text-ios-muted">{row.summary}</p>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-[28px] bg-white px-4 py-4 shadow-apple">
      <p className="text-[11.5px] font-semibold text-ios-muted">{label}</p>
      <p className="mt-3 text-[26px] font-bold tracking-[-0.03em] text-ios-text tabular-nums">{value}</p>
      <p className="mt-2 text-[11px] leading-5 text-ios-muted">{hint}</p>
    </div>
  );
}

function buildWeekCells(startISO: string) {
  const weekday = ["월", "화", "수", "목", "금", "토", "일"];
  const start = fromISODate(isISODate(startISO) ? startISO : toISODate(new Date()));
  return Array.from({ length: 7 }).map((_, index) => {
    const iso = toISODate(addDays(start, index));
    const [, month, date] = iso.split("-");
    return {
      iso,
      weekday: weekday[index] ?? "",
      dayLabel: `${Number(month)}/${Number(date)}`,
    };
  });
}

function MiniCalendarStrip({
  startISO,
  windows,
  onSelectWindow,
}: {
  startISO: string;
  windows: SocialGroupAIBriefWindow[];
  onSelectWindow?: (window: SocialGroupAIBriefWindow) => void;
}) {
  const highlighted = new Map(windows.map((item) => [item.dateISO, item]));
  const weekCells = buildWeekCells(startISO);

  if (windows.length === 0) {
    return (
      <div className="mt-4 rounded-[24px] bg-white/80 px-4 py-4">
        <div className="flex gap-1.5">
          {weekCells.map((item) => (
            <div key={item.iso} className="flex-1 rounded-2xl bg-ios-bg px-2 py-2 text-center">
              <p className="text-[10px] font-semibold text-ios-muted">{item.weekday}</p>
              <p className="mt-1 text-[12px] font-semibold text-ios-text/70">{item.dayLabel}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[12px] leading-6 text-ios-muted">
          겹치는 OFF가 뚜렷하지 않아요. 대신 15~30분 짧은 회복 창을 먼저 맞추는 편이 좋습니다.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <div className="grid grid-cols-7 gap-2">
        {weekCells.map((item) => {
          const highlightedWindow = highlighted.get(item.iso);
          return (
            <div
              key={item.iso}
              className={
                highlightedWindow
                  ? "rounded-[22px] bg-white px-2 py-3 text-center shadow-[0_12px_30px_rgba(111,208,185,0.18)]"
                  : "rounded-[22px] bg-white/70 px-2 py-3 text-center"
              }
            >
              <p className="text-[10px] font-semibold text-ios-muted">{item.weekday}</p>
              <p className="mt-1 text-[12px] font-semibold text-ios-text">{item.dayLabel}</p>
              <div className="mt-2 flex justify-center">
                {highlightedWindow ? (
                  highlightedWindow.members && highlightedWindow.members.length > 0 ? (
                    <SocialAvatarStackButton
                      members={highlightedWindow.members}
                      onClick={onSelectWindow ? () => onSelectWindow(highlightedWindow) : undefined}
                      size="sm"
                      className="justify-center"
                    />
                  ) : (
                    <span className="h-2.5 w-2.5 rounded-full bg-[color:var(--rnest-accent)]" />
                  )
                ) : (
                  <span className="h-2.5 w-2.5 rounded-full bg-ios-sep" />
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {windows.map((item) => (
          <span key={item.dateISO} className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-ios-text">
            {item.label}
          </span>
        ))}
      </div>
      <p className="mt-3 text-[12px] leading-6 text-ios-muted">
        공개 일정 기준으로 회복 창을 잡기 쉬운 날을 먼저 표시해 두었습니다.
      </p>
    </div>
  );
}

function StepItem({
  index,
  action,
}: {
  index: number;
  action: SocialGroupAIBriefAction;
}) {
  return (
    <div className="flex gap-3">
      <div className="flex w-8 shrink-0 justify-center">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-ios-text text-[12px] font-semibold text-white">
          {index + 1}
        </div>
      </div>
      <div className="min-w-0 flex-1 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[14px] font-semibold text-ios-text">{action.title}</p>
          <span className="rounded-full bg-ios-bg px-2.5 py-1 text-[10.5px] font-semibold text-ios-muted">
            {action.reason}
          </span>
        </div>
        <p className="mt-2 text-[12px] leading-6 text-ios-muted">{action.body}</p>
      </div>
    </div>
  );
}

function compactMetricValue(value: number | null, suffix = "") {
  if (value == null || !Number.isFinite(value)) return "-";
  return `${value}${suffix}`;
}

function CompactMetricCell({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "blue" | "rose";
}) {
  return (
    <div
      className={
        tone === "blue"
          ? "rounded-[18px] bg-[rgba(0,122,255,0.08)] px-3 py-3"
          : tone === "rose"
            ? "rounded-[18px] bg-[rgba(232,116,133,0.10)] px-3 py-3"
            : "rounded-[18px] bg-ios-bg px-3 py-3"
      }
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ios-muted">{label}</p>
      <p className="mt-1 text-[18px] font-bold tracking-[-0.03em] text-ios-text tabular-nums">{value}</p>
    </div>
  );
}

function PersonalBandCard({
  cards,
}: {
  cards: SocialGroupAIBriefPersonalCard[];
}) {
  return (
    <div className="rounded-[32px] bg-[linear-gradient(180deg,rgba(249,247,255,0.98),rgba(255,255,255,0.98))] px-5 py-5 shadow-apple">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[14px] font-semibold text-ios-text">멤버 상태 밴드</p>
        </div>
        <Activity className="mt-0.5 h-4 w-4 text-ios-muted" />
      </div>
      {cards.length === 0 ? (
        <p className="mt-4 rounded-[24px] bg-white px-4 py-3 text-[12.5px] text-ios-muted">
          아직 그룹에 표시할 개인 카드가 없어요.
        </p>
      ) : (
        <div className="-mx-1 mt-4 overflow-x-auto px-1 pb-1">
          <div className="flex gap-3">
            {cards.map((item) => (
              <div
                key={item.userId}
                className="w-[252px] shrink-0 snap-start rounded-[26px] bg-white px-4 py-4 shadow-[0_16px_36px_rgba(123,111,208,0.10)]"
              >
                <div className="flex items-center gap-3">
                  <span className="text-[22px]">{item.avatarEmoji || "🐧"}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-[13px] font-semibold text-ios-text">{item.nickname || "익명"}</p>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${toneBadgeClasses(
                          item.statusLabel === "회복 우선" ? "recover" : item.statusLabel === "주의" ? "watch" : "steady"
                        )}`}
                      >
                        {item.statusLabel}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="mt-3 rounded-[20px] bg-[linear-gradient(180deg,rgba(0,122,255,0.10),rgba(255,255,255,0.98))] px-3 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-ios-muted">RNest Vital</p>
                  <div className="mt-1 flex items-end justify-between gap-3">
                    <p className="text-[30px] font-bold tracking-[-0.04em] text-ios-text tabular-nums">
                      {compactMetricValue(item.vitalScore)}
                    </p>
                    <span className="text-[11px] font-semibold text-ios-muted">{item.statusLabel}</span>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <CompactMetricCell label="Body" value={compactMetricValue(item.bodyBattery)} tone="blue" />
                  <CompactMetricCell label="Mental" value={compactMetricValue(item.mentalBattery)} tone="rose" />
                  <CompactMetricCell label="수면부채" value={compactMetricValue(item.sleepDebtHours, "h")} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function SocialGroupAIBriefTab({ groupId, memberIds }: Props) {
  const { user } = useAuthState();
  const { stateRevision } = useClientSyncSnapshot();
  const currentUserId = user?.userId ?? null;
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [memberPreviewSheet, setMemberPreviewSheet] = useState<{
    title: string;
    subtitle?: string;
    members: NonNullable<SocialGroupAIBriefWindow["members"]>;
  } | null>(null);
  const [response, setResponse] = useState<SocialGroupAIBriefResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [optimisticCardMode, setOptimisticCardMode] = useState<"remove" | null>(null);
  const responseRef = useRef<SocialGroupAIBriefResponse | null>(null);
  const stateRevisionRef = useRef<number | null>(null);

  useEffect(() => {
    responseRef.current = response;
  }, [response]);

  const cacheKey = useMemo(
    () =>
      currentUserId
        ? buildSocialClientCacheKey(currentUserId, "group-ai-brief", `${groupId}:${currentWeekCacheKeyPart()}`)
        : null,
    [currentUserId, groupId]
  );

  const loadBrief = useCallback(
    async (force = false) => {
      if (!groupId) return;
      const cached = !force && cacheKey ? getSocialClientCache<SocialGroupAIBriefResponse>(cacheKey) : null;
      const hasVisibleResponse = Boolean(responseRef.current || cached);

      if (cached && !responseRef.current) {
        setResponse(cached.data);
        setLoading(false);
      }

      if (hasVisibleResponse) {
        setSyncing(true);
      } else {
        setLoading(true);
      }

      try {
        const apiResponse = await fetch(`/api/social/groups/${groupId}/ai-brief`, { cache: "no-store" });
        const payload = await apiResponse.json();
        if (!apiResponse.ok || payload?.ok !== true) {
          throw new Error(mapRequestErrorMessage(payload?.error, "AI 브리프를 불러오지 못했어요."));
        }
        const nextResponse = payload.data as SocialGroupAIBriefResponse;
        setResponse(nextResponse);
        if (cacheKey) setSocialClientCache(cacheKey, nextResponse);
        setError(null);
      } catch (nextError: any) {
        setError(String(nextError?.message ?? "AI 브리프를 불러오지 못했어요."));
      } finally {
        setLoading(false);
        setSyncing(false);
      }
    },
    [cacheKey, groupId]
  );

  const refreshLiveView = useCallback(async () => {
    if (cacheKey) clearSocialClientCache(cacheKey);
    await loadBrief(true);
  }, [cacheKey, loadBrief]);

  useEffect(() => {
    void loadBrief();
  }, [loadBrief]);

  useEffect(() => {
    if (stateRevision == null) {
      stateRevisionRef.current = null;
      return;
    }
    if (stateRevisionRef.current == null) {
      stateRevisionRef.current = stateRevision;
      return;
    }
    if (stateRevision !== stateRevisionRef.current) {
      stateRevisionRef.current = stateRevision;
      void refreshLiveView();
    }
  }, [refreshLiveView, stateRevision]);

  useEffect(() => {
    let tid: ReturnType<typeof setTimeout> | null = null;
    const trigger = () => {
      if (tid) clearTimeout(tid);
      tid = setTimeout(() => {
        void refreshLiveView();
      }, 250);
    };
    const onVisibility = () => {
      if (!document.hidden) trigger();
    };
    window.addEventListener("focus", trigger);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (tid) clearTimeout(tid);
      window.removeEventListener("focus", trigger);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refreshLiveView]);

  useSocialGroupAIBriefRealtimeRefresh({
    enabled: Boolean(currentUserId && groupId),
    groupId,
    memberIds,
    onRefresh: refreshLiveView,
  });

  const handleGenerate = useCallback(async () => {
    if (!groupId || retrying) return;
    setRetrying(true);
    setError(null);
    try {
      const apiResponse = await fetch(`/api/social/groups/${groupId}/ai-brief/refresh`, {
        method: "POST",
      });
      const payload = await apiResponse.json();
      if (!apiResponse.ok || payload?.ok !== true) {
        throw new Error(mapRequestErrorMessage(payload?.error, "AI 브리프를 새로 만들지 못했어요."));
      }
      const nextResponse = payload.data as SocialGroupAIBriefResponse;
      setResponse(nextResponse);
      if (cacheKey) setSocialClientCache(cacheKey, nextResponse);
      setError(null);
    } catch (nextError: any) {
      setError(String(nextError?.message ?? "AI 브리프를 새로 만들지 못했어요."));
    } finally {
      setRetrying(false);
    }
  }, [cacheKey, groupId, retrying]);

  const handleRetry = useCallback(async () => {
    if (retrying) return;
    setRetrying(true);
    setError(null);
    try {
      await refreshLiveView();
    } finally {
      setRetrying(false);
    }
  }, [refreshLiveView, retrying]);

  const handleToggle = useCallback(
    async (next: boolean) => {
      if (!response) return;
      const previousChecked = response.viewer.personalCardOptIn;
      setOptimisticCardMode(next ? null : "remove");
      setToggling(true);
      setError(null);
      setResponse((prev) =>
        prev
          ? {
              ...prev,
              viewer: {
                ...prev.viewer,
                personalCardOptIn: next,
              },
            }
          : prev
      );

      try {
        const apiResponse = await fetch(`/api/social/groups/${groupId}/ai-brief/me`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ personalCardOptIn: next }),
        });
        const payload = await apiResponse.json();
        if (!apiResponse.ok || payload?.ok !== true) {
          throw new Error(mapRequestErrorMessage(payload?.error, "개인 카드 설정을 저장하지 못했어요."));
        }
        const prefs = payload.data as { personalCardOptIn: boolean; healthShareEnabled: boolean };
        setResponse((prev) =>
          prev
            ? {
                ...prev,
                viewer: {
                  ...prev.viewer,
                  personalCardOptIn: prefs.personalCardOptIn,
                  healthShareEnabled: prefs.healthShareEnabled,
                },
              }
            : prev
        );
        await refreshLiveView();
        setOptimisticCardMode(null);
      } catch (nextError: any) {
        setOptimisticCardMode(null);
        setResponse((prev) =>
          prev
            ? {
                ...prev,
                viewer: {
                  ...prev.viewer,
                  personalCardOptIn: previousChecked,
                },
              }
            : prev
        );
        setError(String(nextError?.message ?? "개인 카드 설정을 저장하지 못했어요."));
      } finally {
        setToggling(false);
      }
    },
    [groupId, refreshLiveView, response]
  );

  const snapshot = response?.snapshot ?? null;
  const live = response?.live ?? null;

  const visiblePersonalCards = useMemo(() => {
    const cards = [...(live?.personalCards ?? [])];
    if (!currentUserId) return cards;
    if (optimisticCardMode === "remove") {
      return cards.filter((item) => item.userId !== currentUserId);
    }
    return cards;
  }, [currentUserId, live?.personalCards, optimisticCardMode]);

  if (loading && !response) {
    return (
      <div className="space-y-4">
        <div className="rounded-[32px] bg-white px-5 py-5 shadow-apple">
          <div className="h-4 w-24 animate-pulse rounded-full bg-ios-sep" />
          <div className="mt-4 h-8 w-2/3 animate-pulse rounded-full bg-ios-sep/80" />
          <div className="mt-2 h-4 w-3/4 animate-pulse rounded-full bg-ios-sep/60" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="h-28 animate-pulse rounded-[28px] bg-white shadow-apple" />
          <div className="h-28 animate-pulse rounded-[28px] bg-white shadow-apple" />
          <div className="h-28 animate-pulse rounded-[28px] bg-white shadow-apple" />
          <div className="h-28 animate-pulse rounded-[28px] bg-white shadow-apple" />
        </div>
        <div className="space-y-3">
          <div className="h-40 animate-pulse rounded-[28px] bg-white shadow-apple" />
          <div className="h-36 animate-pulse rounded-[28px] bg-white shadow-apple" />
          <div className="h-36 animate-pulse rounded-[28px] bg-white shadow-apple" />
        </div>
      </div>
    );
  }

  if (!response) {
    return (
      <div className="rounded-[28px] bg-white px-4 py-4 shadow-apple">
        <p className="text-[13px] text-ios-muted">AI 브리프를 불러오지 못했어요.</p>
        <Button
          variant="secondary"
          onClick={() => void handleRetry()}
          disabled={retrying}
          aria-busy={retrying}
          className="mt-3 h-10 rounded-2xl px-4 text-[13px] transition-[transform,opacity] duration-200"
        >
          <span className="inline-flex items-center gap-2">
            {retrying ? <InlineSpinner /> : null}
            {retrying ? "확인 중..." : "다시 시도"}
          </span>
        </Button>
      </div>
    );
  }

  if (response.state === "locked") {
    return <SocialGroupAIBriefLockedCard groupId={groupId} />;
  }

  if (response.state === "insufficient_data") {
    return (
      <div className="space-y-4">
        {error ? (
          <div className="rounded-2xl bg-red-50 px-4 py-3 text-[12.5px] text-red-600">{error}</div>
        ) : null}
        <div className="rounded-[32px] bg-white px-5 py-5 shadow-apple">
          <div className="inline-flex rounded-full bg-ios-bg px-3 py-1 text-[11px] font-semibold text-ios-muted">
            데이터 부족
          </div>
          <h3 className="mt-4 text-[22px] font-bold tracking-[-0.03em] text-ios-text">
            이번 주 브리프를 만들기 위한 데이터가 아직 부족해요.
          </h3>
          {response.eligibility ? (
            <>
              <p className="mt-3 text-[13px] leading-6 text-ios-muted">
                기여 가능 멤버가{" "}
                <span className="font-semibold text-ios-text">
                  {response.eligibility.contributorCount}/{response.eligibility.memberCount}
                </span>
                명이고, 브리프를 열려면 최소{" "}
                <span className="font-semibold text-ios-text">{response.eligibility.requiredContributorCount}명</span>이 필요해요.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <EligibilityStatCard
                  label="기여 가능 멤버"
                  value={`${response.eligibility.contributorCount}/${response.eligibility.memberCount}`}
                  hint={`최소 ${response.eligibility.requiredContributorCount}명 필요`}
                />
                <EligibilityStatCard
                  label="건강 공유 ON"
                  value={`${response.eligibility.healthShareCount}/${response.eligibility.memberCount}`}
                  hint="health 공유 기준"
                />
                <EligibilityStatCard
                  label="최근 기록 충족"
                  value={`${response.eligibility.recentDataCount}/${response.eligibility.memberCount}`}
                  hint="최근 7일 입력 3일 이상"
                />
                <EligibilityStatCard
                  label="AI 동의 완료"
                  value={`${response.eligibility.consentCount}/${response.eligibility.memberCount}`}
                  hint="서비스 동의 기준"
                />
              </div>
            </>
          ) : null}
        </div>
      </div>
    );
  }

  if (response.state === "failed" || !snapshot || !live) {
    return (
      <div className="space-y-4">
        {error ? (
          <div className="rounded-2xl bg-red-50 px-4 py-3 text-[12.5px] text-red-600">{error}</div>
        ) : null}
        <div className="rounded-[32px] bg-white px-5 py-5 shadow-apple">
          <div className="inline-flex rounded-full bg-ios-bg px-3 py-1 text-[11px] font-semibold text-ios-muted">
            준비 중
          </div>
          <h3 className="mt-4 text-[22px] font-bold tracking-[-0.03em] text-ios-text">
            {stateMessage(response.errorCode)}
          </h3>
          <Button
            variant="secondary"
            onClick={() => void (response.viewer.canRefresh ? handleGenerate() : handleRetry())}
            disabled={retrying}
            aria-busy={retrying}
            className="mt-5 h-10 rounded-2xl px-4 text-[13px]"
          >
            <span className="inline-flex items-center gap-2">
              {retrying ? <InlineSpinner /> : null}
              {retrying ? "생성 중..." : response.viewer.canRefresh ? "AI 브리프 다시 생성" : "다시 시도"}
            </span>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-2xl bg-red-50 px-4 py-3 text-[12.5px] text-red-600">{error}</div>
      ) : null}

      <div
        className={
          syncing || toggling
            ? "transition-opacity duration-200 opacity-95"
            : "transition-opacity duration-200 opacity-100"
        }
      >
        <div className="relative overflow-hidden rounded-[34px] bg-white px-5 py-5 shadow-apple">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(123,111,208,0.16),transparent_38%),radial-gradient(circle_at_bottom_left,rgba(111,208,185,0.12),transparent_34%)]" />
          <div className="relative">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h3 className="text-[24px] font-bold tracking-[-0.04em] text-ios-text">{snapshot.hero.headline}</h3>
                <p className="mt-2 text-[13px] leading-6 text-ios-muted">{snapshot.hero.subheadline}</p>
              </div>
              {response.viewer.canRefresh ? (
                <Button
                  variant="secondary"
                  onClick={() => void handleGenerate()}
                  disabled={retrying || syncing}
                  aria-busy={retrying}
                  className="h-9 rounded-full px-3 text-[12px]"
                >
                  <span className="inline-flex items-center gap-2">
                    {retrying ? <InlineSpinner /> : null}
                    {retrying ? "생성 중..." : "다시 생성"}
                  </span>
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <MetricCard label="평균 배터리" value={formatMetric(live.metrics.avgBattery, "점")} hint="최근 7일 기여 멤버 기준" />
          <MetricCard label="평균 수면" value={formatMetric(live.metrics.avgSleep, "시간")} hint="최근 7일 수면 흐름" />
          <MetricCard
            label="주의 / 위험"
            value={`${live.metrics.warningCount}/${live.metrics.dangerCount}`}
            hint="주의 인원 / 회복 우선 인원"
          />
          <MetricCard label="겹치는 회복 창" value={String(live.metrics.commonOffCount)} hint="같이 맞추기 쉬운 후보 수" />
        </div>

        <div className="mt-4 rounded-[32px] bg-[linear-gradient(180deg,rgba(243,248,255,0.98),rgba(255,255,255,0.98))] px-5 py-5 shadow-apple">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[14px] font-semibold text-ios-text">주간 흐름 보드</p>
              <p className="mt-1 text-[11.5px] leading-5 text-ios-muted">
                이번 주 에너지와 리스크만 남겨 핵심 변화가 바로 들어오도록 정리했습니다.
              </p>
            </div>
            <BatteryMedium className="mt-0.5 h-4 w-4 text-ios-muted" />
          </div>
          <div className="mt-4 space-y-3">
            {live.flowRows.map((row) => (
              <FlowBoardRow key={row.id} row={row} />
            ))}
          </div>
        </div>

        <div className="mt-4 rounded-[32px] bg-[linear-gradient(180deg,rgba(240,251,249,0.96),rgba(255,255,255,0.98))] px-5 py-5 shadow-apple">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[14px] font-semibold text-ios-text">같이 맞추기 쉬운 창</p>
              <p className="mt-1 text-[11.5px] leading-5 text-ios-muted">
                공개 일정 기준으로 같은 회복 창을 먼저 잡기 쉬운 날을 표시합니다.
              </p>
            </div>
            <CalendarDays className="mt-0.5 h-4 w-4 text-ios-muted" />
          </div>
          <MiniCalendarStrip
            startISO={live.week.startISO}
            windows={live.windows}
            onSelectWindow={(window) =>
              setMemberPreviewSheet({
                title: `${window.label} · 겹치는 멤버 ${window.members?.length ?? 0}명`,
                subtitle: "공개 일정 기준으로 이 날 회복 창이 겹치는 멤버예요.",
                members: window.members ?? [],
              })
            }
          />
        </div>

        <div className="mt-4 rounded-[32px] bg-[linear-gradient(180deg,rgba(249,246,240,0.98),rgba(255,255,255,0.98))] px-5 py-5 shadow-apple">
          <div>
            <p className="text-[14px] font-semibold text-ios-text">이번 주 실행 3단계</p>
          </div>
          <div className="mt-4 space-y-1">
            {snapshot.actions.map((action, index) => (
              <StepItem key={action.id} index={index} action={action} />
            ))}
          </div>
        </div>

        <div className="mt-4">
          <PersonalBandCard cards={visiblePersonalCards} />
        </div>

        <div className="mt-4">
          <SocialGroupAIBriefPersonalCardToggle
            checked={response.viewer.personalCardOptIn}
            disabled={toggling}
            loading={toggling}
            healthShareEnabled={response.viewer.healthShareEnabled}
            onChange={handleToggle}
          />
        </div>
      </div>

      <SocialMemberPreviewSheet
        open={Boolean(memberPreviewSheet)}
        onClose={() => setMemberPreviewSheet(null)}
        title={memberPreviewSheet?.title ?? "멤버"}
        subtitle={memberPreviewSheet?.subtitle}
        members={memberPreviewSheet?.members ?? []}
      />
    </div>
  );
}
