"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuthState } from "@/lib/auth";
import { buildSocialClientCacheKey, getSocialClientCache, setSocialClientCache } from "@/lib/socialClientCache";
import { Button } from "@/components/ui/Button";
import { SocialGroupAIBriefLockedCard } from "@/components/social/SocialGroupAIBriefLockedCard";
import { SocialGroupAIBriefPersonalCardToggle } from "@/components/social/SocialGroupAIBriefPersonalCardToggle";
import type { SocialGroupAIBriefResponse, SocialGroupAIBriefTone } from "@/types/social";

type Props = {
  groupId: number;
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

function stateMessage(errorCode: string | null) {
  if (errorCode === "group_ai_brief_missing") return "이번 주 브리프가 아직 준비되지 않았어요.";
  if (errorCode === "group_ai_brief_generation_failed") return "이번 주 브리프를 최신 상태로 만들지 못했어요.";
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
      return "AI 브리프 새로고침은 Plus/Pro에서 사용할 수 있어요.";
    case "group_ai_brief_refresh_cooldown":
      return "AI 브리프 새로고침은 하루에 한 번만 할 수 있어요.";
    case "health_visibility_required_for_personal_card":
      return "건강 공유를 켠 뒤에 개인 카드에 참여할 수 있어요.";
    default:
      return fallback;
  }
}

function formatGeneratedAt(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatMetric(value: number | null, suffix = "") {
  if (value == null || !Number.isFinite(value)) return "-";
  return `${value}${suffix}`;
}

export function SocialGroupAIBriefTab({ groupId }: Props) {
  const { user } = useAuthState();
  const currentUserId = user?.userId ?? null;
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [response, setResponse] = useState<SocialGroupAIBriefResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const responseRef = useRef<SocialGroupAIBriefResponse | null>(null);

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
      if (cached && !responseRef.current) {
        setResponse(cached.data);
        setLoading(false);
      } else if (!cached) {
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
      }
    },
    [cacheKey, groupId]
  );

  useEffect(() => {
    void loadBrief();
  }, [loadBrief]);

  const handleRefresh = useCallback(async () => {
    if (!response?.viewer.canRefresh || refreshing) return;
    setRefreshing(true);
    setError(null);
    try {
      const apiResponse = await fetch(`/api/social/groups/${groupId}/ai-brief/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const payload = await apiResponse.json();
      if (!apiResponse.ok || payload?.ok !== true) {
        throw new Error(mapRequestErrorMessage(payload?.error, "이번 주 브리프를 새로 만들지 못했어요."));
      }
      const nextResponse = payload.data as SocialGroupAIBriefResponse;
      setResponse(nextResponse);
      if (cacheKey) setSocialClientCache(cacheKey, nextResponse);
    } catch (nextError: any) {
      setError(String(nextError?.message ?? "이번 주 브리프를 새로 만들지 못했어요."));
      await loadBrief(true);
    } finally {
      setRefreshing(false);
    }
  }, [cacheKey, groupId, loadBrief, refreshing, response?.viewer.canRefresh]);

  const handleToggle = useCallback(
    async (next: boolean) => {
      if (!response) return;
      setToggling(true);
      setError(null);
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
        await loadBrief(true);
      } catch (nextError: any) {
        setError(String(nextError?.message ?? "개인 카드 설정을 저장하지 못했어요."));
      } finally {
        setToggling(false);
      }
    },
    [groupId, loadBrief, response]
  );

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
          <div className="h-28 animate-pulse rounded-[28px] bg-white shadow-apple" />
          <div className="h-28 animate-pulse rounded-[28px] bg-white shadow-apple" />
          <div className="h-28 animate-pulse rounded-[28px] bg-white shadow-apple" />
        </div>
      </div>
    );
  }

  if (!response) {
    return (
      <div className="rounded-[28px] bg-white px-4 py-4 shadow-apple">
        <p className="text-[13px] text-ios-muted">AI 브리프를 불러오지 못했어요.</p>
        <Button variant="secondary" onClick={() => void loadBrief(true)} className="mt-3 h-10 rounded-2xl px-4 text-[13px]">
          다시 시도
        </Button>
      </div>
    );
  }

  if (response.state === "locked") {
    return <SocialGroupAIBriefLockedCard groupId={groupId} />;
  }

  const brief = response.brief;

  return (
    <div className="space-y-4">
      {error ? (
        <div className="rounded-2xl bg-red-50 px-4 py-3 text-[12.5px] text-red-600">{error}</div>
      ) : null}

      {response.state === "insufficient_data" ? (
        <div className="rounded-[32px] bg-white px-5 py-5 shadow-apple">
          <div className="inline-flex rounded-full bg-ios-bg px-3 py-1 text-[11px] font-semibold text-ios-muted">
            데이터 부족
          </div>
          <h3 className="mt-4 text-[22px] font-bold tracking-[-0.03em] text-ios-text">
            이번 주 브리프를 만들기 위한 데이터가 아직 부족해요.
          </h3>
          <div className="mt-4 space-y-2 rounded-[24px] bg-ios-bg px-4 py-4">
            <p className="text-[12.5px] text-ios-text">건강 공유를 켠 멤버가 더 필요해요.</p>
            <p className="text-[12.5px] text-ios-text">최근 7일 기록이 3일 이상 쌓인 멤버가 더 필요해요.</p>
          </div>
          <div className="mt-4 flex gap-2">
            <Button
              variant="secondary"
              onClick={() => void loadBrief(true)}
              className="h-10 flex-1 rounded-2xl text-[13px]"
            >
              다시 확인
            </Button>
            {response.viewer.canRefresh ? (
              <Button
                variant="primary"
                onClick={() => void handleRefresh()}
                disabled={refreshing}
                className="h-10 flex-1 rounded-2xl text-[13px]"
              >
                {refreshing ? "브리프 갱신 중…" : "이번 주 브리프 새로고침"}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {response.state === "failed" ? (
        <div className="rounded-[32px] bg-white px-5 py-5 shadow-apple">
          <div className="inline-flex rounded-full bg-ios-bg px-3 py-1 text-[11px] font-semibold text-ios-muted">
            준비 중
          </div>
          <h3 className="mt-4 text-[22px] font-bold tracking-[-0.03em] text-ios-text">
            {stateMessage(response.errorCode)}
          </h3>
          <p className="mt-2 text-[13px] leading-6 text-ios-muted">
            이번 주 요약을 확인하려면 브리프를 한 번 생성해 주세요.
          </p>
          <div className="mt-5 flex gap-2">
            <Button
              variant="secondary"
              onClick={() => void loadBrief(true)}
              className="h-10 flex-1 rounded-2xl text-[13px]"
            >
              다시 확인
            </Button>
            {response.viewer.canRefresh ? (
              <Button
                variant="primary"
                onClick={() => void handleRefresh()}
                disabled={refreshing}
                className="h-10 flex-1 rounded-2xl text-[13px]"
              >
                {refreshing ? "브리프 갱신 중…" : "이번 주 브리프 새로고침"}
              </Button>
            ) : (
              <Button variant="secondary" disabled className="h-10 flex-1 rounded-2xl text-[13px]">
                브리프 새로고침
              </Button>
            )}
          </div>
        </div>
      ) : null}

      {response.state === "ready" && brief ? (
        <>
          <div className="rounded-[32px] bg-white px-5 py-5 shadow-apple">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className={`inline-flex rounded-full px-3 py-1 text-[11px] font-semibold ${toneBadgeClasses(brief.hero.tone)}`}>
                  {brief.hero.tone === "recover" ? "회복 우선" : brief.hero.tone === "watch" ? "주의 구간" : "안정 흐름"}
                </div>
                <h3 className="mt-4 text-[24px] font-bold tracking-[-0.03em] text-ios-text">{brief.hero.headline}</h3>
                <p className="mt-2 text-[13px] leading-6 text-ios-muted">{brief.hero.subheadline}</p>
              </div>
              {response.stale ? (
                <span className="shrink-0 rounded-full bg-amber-50 px-3 py-1 text-[11px] font-semibold text-amber-700">
                  최신 갱신 실패
                </span>
              ) : null}
            </div>
            <div className="mt-5 flex flex-wrap gap-2 text-[11px] text-ios-muted">
              <span>생성 {formatGeneratedAt(response.generatedAt)}</span>
              <span>기여 멤버 {brief.metrics.contributorCount}명</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "평균 배터리", value: formatMetric(brief.metrics.avgBattery, "점") },
              { label: "평균 수면", value: formatMetric(brief.metrics.avgSleep, "시간") },
              { label: "주의/위험 인원", value: `${brief.metrics.warningCount}/${brief.metrics.dangerCount}` },
              { label: "공통 OFF 수", value: String(brief.metrics.commonOffCount) },
            ].map((item) => (
              <div key={item.label} className="rounded-[28px] bg-white px-4 py-4 shadow-apple">
                <p className="text-[11.5px] font-semibold text-ios-muted">{item.label}</p>
                <p className="mt-3 text-[26px] font-bold tracking-[-0.03em] text-ios-text tabular-nums">{item.value}</p>
              </div>
            ))}
          </div>

          <div className="space-y-3">
            {brief.findings.map((item) => (
              <div key={item.id} className="rounded-[28px] bg-white px-4 py-4 shadow-apple">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[14px] font-semibold text-ios-text">{item.title}</p>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${toneBadgeClasses(item.tone)}`}>
                    {item.factLabel}
                  </span>
                </div>
                <p className="mt-2 text-[12.5px] leading-6 text-ios-muted">{item.body}</p>
              </div>
            ))}
          </div>

          <div className="rounded-[32px] bg-white px-5 py-5 shadow-apple">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[14px] font-semibold text-ios-text">같이 쉬기 좋은 창</p>
                <p className="mt-0.5 text-[11.5px] text-ios-muted">공개 일정 기준으로 회복 창을 잡기 쉬운 날이에요.</p>
              </div>
            </div>
            {brief.windows.length === 0 ? (
              <p className="mt-4 rounded-[24px] bg-ios-bg px-4 py-3 text-[12.5px] text-ios-muted">
                이번 주 공개 일정만 놓고 보면 공통 OFF가 뚜렷하게 겹치지 않아요.
              </p>
            ) : (
              <div className="mt-4 space-y-2.5">
                {brief.windows.map((item) => (
                  <div key={item.dateISO} className="rounded-[24px] bg-ios-bg px-4 py-3">
                    <p className="text-[13px] font-semibold text-ios-text">{item.label}</p>
                    <p className="mt-1 text-[11.5px] leading-5 text-ios-muted">{item.reason}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3">
            {brief.actions.map((item) => (
              <div key={item.id} className="rounded-[28px] bg-white px-4 py-4 shadow-apple">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[14px] font-semibold text-ios-text">{item.title}</p>
                  <span className="shrink-0 rounded-full bg-ios-bg px-2.5 py-1 text-[10.5px] font-semibold text-ios-muted">
                    {item.reason}
                  </span>
                </div>
                <p className="mt-2 text-[12.5px] leading-6 text-ios-muted">{item.body}</p>
              </div>
            ))}
          </div>

          <div className="rounded-[32px] bg-white px-5 py-5 shadow-apple">
            <div>
              <p className="text-[14px] font-semibold text-ios-text">개인 카드</p>
              <p className="mt-0.5 text-[11.5px] text-ios-muted">opt-in 멤버만 표시되고, 수치 상세는 노출하지 않아요.</p>
            </div>
            {brief.personalCards.length === 0 ? (
              <p className="mt-4 rounded-[24px] bg-ios-bg px-4 py-3 text-[12.5px] text-ios-muted">
                아직 그룹에 표시할 개인 카드가 없어요.
              </p>
            ) : (
              <div className="mt-4 space-y-2.5">
                {brief.personalCards.map((item) => (
                  <div key={item.userId} className="rounded-[24px] bg-ios-bg px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="text-[22px]">{item.avatarEmoji || "🐧"}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-[13px] font-semibold text-ios-text">{item.nickname || "익명"}</p>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${toneBadgeClasses(item.statusLabel === "회복 우선" ? "recover" : item.statusLabel === "주의" ? "watch" : "steady")}`}>
                            {item.statusLabel}
                          </span>
                        </div>
                        <p className="mt-1 text-[11.5px] leading-5 text-ios-muted">{item.summary}</p>
                        <p className="mt-2 text-[11.5px] font-medium text-ios-text">{item.action}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <SocialGroupAIBriefPersonalCardToggle
            checked={response.viewer.personalCardOptIn}
            disabled={toggling}
            loading={toggling}
            healthShareEnabled={response.viewer.healthShareEnabled}
            onChange={handleToggle}
          />

          <div className="rounded-[28px] bg-white px-4 py-4 shadow-apple">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="primary"
                onClick={() => void handleRefresh()}
                disabled={!response.viewer.canRefresh || refreshing}
                className="h-11 flex-1 rounded-2xl text-[13px]"
              >
                {refreshing ? "브리프 갱신 중…" : "이번 주 브리프 새로고침"}
              </Button>
              {!response.viewer.canRefresh ? (
                <span className="text-[11px] text-ios-muted">새로고침은 하루에 한 번만 가능해요.</span>
              ) : null}
            </div>
            {!response.viewer.healthShareEnabled ? (
              <div className="mt-3 rounded-2xl bg-ios-bg px-3 py-2.5 text-[12px] leading-5 text-ios-muted">
                건강 공유를 켜야 개인 카드에 참여할 수 있어요.
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
