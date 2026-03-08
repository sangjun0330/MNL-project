"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthState } from "@/lib/auth";
import { cn } from "@/lib/cn";
import {
  SocialBatteryIcon,
  SocialBrainIcon,
  SocialMoonIcon,
} from "@/components/social/SocialIcons";
import type {
  ChallengeMetric,
  ChallengeType,
  GroupChallengeDetail,
} from "@/types/social";

// ── 헬퍼 ─────────────────────────────────────────────────────

function MetricIcon({
  metric,
  className,
}: {
  metric: ChallengeMetric;
  className?: string;
}) {
  if (metric === "sleep") return <SocialMoonIcon className={className} />;
  if (metric === "mental") return <SocialBrainIcon className={className} />;
  return <SocialBatteryIcon className={className} />;
}

function metricLabel(metric: ChallengeMetric): string {
  if (metric === "sleep") return "수면 시간";
  if (metric === "mental") return "멘탈 배터리";
  return "신체 배터리";
}

function typeLabel(challengeType: ChallengeType): string {
  if (challengeType === "group_goal") return "그룹 목표";
  if (challengeType === "streak") return "연속 달성";
  return "순위 경쟁";
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatValue(value: number | null, metric: ChallengeMetric): string {
  if (value == null) return "-";
  if (metric === "sleep") return `${value.toFixed(1)}h`;
  return String(Math.round(value));
}

function calcDaysLeft(endsAt: string): number {
  const ms = new Date(endsAt).getTime() - Date.now();
  return Math.ceil(ms / 86_400_000);
}

function RankBadge({ rank }: { rank: number }) {
  const cls =
    rank === 1
      ? "bg-yellow-50 text-yellow-600 border border-yellow-200"
      : rank === 2
        ? "bg-slate-100 text-slate-500 border border-slate-200"
        : rank === 3
          ? "bg-orange-50 text-orange-500 border border-orange-200"
          : "bg-ios-bg text-ios-muted border border-transparent";

  return (
    <div
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold tabular-nums",
        cls
      )}
    >
      {rank}
    </div>
  );
}

function DaysBadge({
  daysLeft,
  status,
}: {
  daysLeft: number;
  status: string;
}) {
  if (status === "canceled") {
    return (
      <span className="rounded-full bg-ios-sep px-2.5 py-1 text-[11px] font-semibold text-ios-muted">
        취소됨
      </span>
    );
  }
  if (status === "ended" || daysLeft <= 0) {
    return (
      <span className="rounded-full bg-ios-sep px-2.5 py-1 text-[11px] font-semibold text-ios-muted">
        종료됨
      </span>
    );
  }
  if (daysLeft <= 1) {
    return (
      <span className="rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-600">
        D-DAY
      </span>
    );
  }
  return (
    <span className="rounded-full bg-[color:var(--rnest-accent-soft)] px-2.5 py-1 text-[11px] font-bold text-[color:var(--rnest-accent)]">
      D-{daysLeft}
    </span>
  );
}

// ── 컴포넌트 ─────────────────────────────────────────────────

type Props = {
  groupId: string;
  challengeId: string;
};

export function SocialGroupChallengePage({
  groupId: rawGroupId,
  challengeId: rawChallengeId,
}: Props) {
  const router = useRouter();
  const { user } = useAuthState();
  const currentUserId = user?.userId ?? null;

  const groupIdNum = parseInt(rawGroupId, 10);
  const challengeIdNum = parseInt(rawChallengeId, 10);

  const [detail, setDetail] = useState<GroupChallengeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const loadDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/social/groups/${groupIdNum}/challenges/${challengeIdNum}`,
        { cache: "no-store" }
      ).then((r) => r.json());
      if (!res.ok) throw new Error(res.error ?? "불러오기 실패");
      setDetail(res.data as GroupChallengeDetail);
    } catch (err: any) {
      setError(String(err?.message ?? "챌린지 정보를 불러오지 못했어요."));
    } finally {
      setLoading(false);
    }
  }, [groupIdNum, challengeIdNum]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const handleJoin = async () => {
    if (joining || !detail) return;
    setJoining(true);
    setJoinError(null);
    try {
      const res = await fetch(
        `/api/social/groups/${groupIdNum}/challenges/${challengeIdNum}/join`,
        { method: "POST" }
      ).then((r) => r.json());
      if (!res.ok) {
        const msg =
          res.error === "challenge_not_active"
            ? "이미 종료된 챌린지예요."
            : res.error === "not_group_member"
              ? "그룹 멤버만 참가할 수 있어요."
              : "참가하지 못했어요.";
        throw new Error(msg);
      }
      await loadDetail();
    } catch (err: any) {
      setJoinError(String(err?.message ?? "참가하지 못했어요."));
    } finally {
      setJoining(false);
    }
  };

  // ── 공통 헤더 ────────────────────────────────────────────

  const BackHeader = () => (
    <div className="flex items-center justify-between pt-1">
      <button
        type="button"
        onClick={() => router.back()}
        className="flex h-9 w-9 items-center justify-center rounded-full text-ios-muted transition hover:bg-ios-sep/40 active:opacity-60"
        aria-label="뒤로"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
      <h1 className="text-[17px] font-bold text-ios-text">챌린지</h1>
      <div className="h-9 w-9" />
    </div>
  );

  // ── 에러 ─────────────────────────────────────────────────

  if (!loading && error) {
    return (
      <div className="mx-auto w-full max-w-[680px] space-y-4 px-1.5 pb-8 sm:max-w-[700px] sm:px-0">
        <BackHeader />
        <div className="rounded-[32px] bg-white px-4 py-8 text-center shadow-apple">
          <p className="text-[15px] font-semibold text-ios-text">
            챌린지를 불러오지 못했어요
          </p>
          <p className="mt-2 text-[13px] text-ios-muted">
            {error === "challenge_not_found"
              ? "삭제되었거나 존재하지 않는 챌린지예요."
              : "잠시 후 다시 시도해 주세요."}
          </p>
          <button
            type="button"
            onClick={() => void loadDetail()}
            className="mt-4 rounded-full bg-ios-bg px-5 py-2 text-[13px] font-semibold text-ios-text shadow-sm transition active:opacity-60"
          >
            다시 불러오기
          </button>
        </div>
      </div>
    );
  }

  // ── 파생 값 ─────────────────────────────────────────────

  const daysLeft = detail ? calcDaysLeft(detail.endsAt) : 0;
  const isActive = detail?.status === "active";
  const myEntry = detail?.myEntry ?? null;
  const isParticipating = myEntry !== null;
  const myLeaderboardEntry = detail?.leaderboard.find(
    (e) => e.userId === currentUserId
  );

  return (
    <div className="mx-auto w-full max-w-[680px] space-y-4 px-1.5 pb-8 sm:max-w-[700px] sm:px-0">
      <BackHeader />

      {/* ── 로딩 스켈레톤 ─────────────────────────────────── */}
      {loading && (
        <div className="space-y-3">
          <div className="h-44 rounded-[34px] bg-white animate-pulse shadow-apple" />
          <div className="h-28 rounded-[32px] bg-white animate-pulse shadow-apple" />
          <div className="h-48 rounded-[32px] bg-white animate-pulse shadow-apple" />
        </div>
      )}

      {/* ── 챌린지 정보 카드 ──────────────────────────────── */}
      {!loading && detail && (
        <>
          <div className="rounded-[34px] bg-white px-5 py-5 shadow-apple">
            {/* 메트릭 아이콘 + 제목 */}
            <div className="flex items-start gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] bg-[color:var(--rnest-accent-soft)] text-[color:var(--rnest-accent)]">
                <MetricIcon metric={detail.metric} className="h-[22px] w-[22px]" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[18px] font-bold leading-tight text-ios-text">
                  {detail.title}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full bg-ios-bg px-2.5 py-1 text-[11px] font-semibold text-ios-muted">
                    {typeLabel(detail.challengeType)}
                  </span>
                  <span className="rounded-full bg-ios-bg px-2.5 py-1 text-[11px] font-semibold text-ios-muted">
                    {metricLabel(detail.metric)}
                  </span>
                  <DaysBadge daysLeft={daysLeft} status={detail.status} />
                </div>
              </div>
            </div>

            {detail.description && (
              <p className="mt-3 text-[13px] leading-6 text-ios-muted">
                {detail.description}
              </p>
            )}

            {/* 메타 그리드 */}
            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="rounded-2xl bg-ios-bg px-3 py-2.5 text-center">
                <p className="text-[10px] font-semibold text-ios-muted">기간</p>
                <p className="mt-0.5 text-[12px] font-semibold text-ios-text">
                  {formatDate(detail.startsAt)} ~ {formatDate(detail.endsAt)}
                </p>
              </div>
              <div className="rounded-2xl bg-ios-bg px-3 py-2.5 text-center">
                <p className="text-[10px] font-semibold text-ios-muted">참가자</p>
                <p className="mt-0.5 text-[12px] font-semibold text-ios-text">
                  {detail.participantCount}명
                </p>
              </div>
              <div className="rounded-2xl bg-ios-bg px-3 py-2.5 text-center">
                <p className="text-[10px] font-semibold text-ios-muted">
                  {detail.challengeType === "streak" ? "목표일" : "목표"}
                </p>
                <p className="mt-0.5 text-[12px] font-semibold text-ios-text">
                  {detail.challengeType === "streak" && detail.targetDays
                    ? `${detail.targetDays}일 연속`
                    : detail.targetValue != null
                      ? formatValue(detail.targetValue, detail.metric)
                      : "-"}
                </p>
              </div>
            </div>
          </div>

          {/* ── 그룹 목표 진행 ─────────────────────────────── */}
          {detail.challengeType === "group_goal" &&
            detail.targetValue != null && (
              <div className="rounded-[32px] bg-white px-5 py-5 shadow-apple">
                <p className="mb-3 text-[14px] font-bold text-ios-text">
                  그룹 목표 달성 현황
                </p>
                <div className="flex items-center justify-between">
                  <p className="text-[12.5px] text-ios-muted">그룹 평균</p>
                  <p className="text-[15px] font-bold text-ios-text tabular-nums">
                    {detail.groupCurrentAvg != null
                      ? formatValue(detail.groupCurrentAvg, detail.metric)
                      : "-"}
                    <span className="ml-1 text-[11px] font-normal text-ios-muted">
                      / 목표 {formatValue(detail.targetValue, detail.metric)}
                    </span>
                  </p>
                </div>
                {detail.groupCurrentAvg != null && (
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-ios-sep">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        detail.groupGoalMet ? "bg-emerald-400" : "bg-[color:var(--rnest-accent)]"
                      )}
                      style={{
                        width: `${Math.min(100, (detail.groupCurrentAvg / detail.targetValue) * 100)}%`,
                      }}
                    />
                  </div>
                )}
                {detail.groupGoalMet === true && (
                  <div className="mt-3 rounded-2xl bg-emerald-50 px-4 py-3 text-center">
                    <p className="text-[13px] font-bold text-emerald-700">
                      🎉 그룹 목표 달성!
                    </p>
                  </div>
                )}
                {detail.groupCurrentAvg == null && (
                  <p className="mt-3 text-center text-[12px] text-ios-muted">
                    아직 스냅샷 데이터가 없어요. 잠시 후 다시 확인해 주세요.
                  </p>
                )}
              </div>
            )}

          {/* ── 내 현황 ───────────────────────────────────── */}
          {isParticipating && myEntry && (
            <div className="rounded-[32px] bg-white px-5 py-5 shadow-apple">
              <p className="mb-3 text-[14px] font-bold text-ios-text">내 현황</p>
              <div className="flex items-center gap-4">
                {myLeaderboardEntry && (
                  <div className="flex flex-col items-center rounded-2xl bg-ios-bg px-5 py-3">
                    <p className="text-[10px] font-semibold text-ios-muted">내 순위</p>
                    <p className="mt-1 text-[22px] font-bold tabular-nums text-ios-text">
                      {myLeaderboardEntry.rank}
                      <span className="text-[13px]">위</span>
                    </p>
                  </div>
                )}
                <div className="flex flex-col items-center rounded-2xl bg-ios-bg px-5 py-3">
                  <p className="text-[10px] font-semibold text-ios-muted">
                    {detail.challengeType === "streak"
                      ? "연속 달성"
                      : metricLabel(detail.metric)}
                  </p>
                  <p className="mt-1 text-[22px] font-bold tabular-nums text-ios-text">
                    {detail.challengeType === "streak"
                      ? `${myEntry.streakDays ?? 0}일`
                      : formatValue(myEntry.snapshotValue, detail.metric)}
                  </p>
                </div>
                {myEntry.isCompleted && (
                  <div className="ml-auto rounded-2xl bg-emerald-50 px-4 py-3 text-center">
                    <p className="text-[11px] font-bold text-emerald-700">달성 완료</p>
                    <p className="mt-0.5 text-[20px]">✓</p>
                  </div>
                )}
              </div>
              {myEntry.snapshotAt && (
                <p className="mt-3 text-[11px] text-ios-muted text-right">
                  마지막 갱신:{" "}
                  {new Date(myEntry.snapshotAt).toLocaleString("ko-KR", {
                    month: "numeric",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              )}
            </div>
          )}

          {/* ── 참가 유도 (미참가 + 진행 중) ──────────────── */}
          {isActive && !isParticipating && (
            <div className="rounded-[32px] bg-white px-5 py-6 text-center shadow-apple">
              <p className="text-[13.5px] text-ios-muted">
                아직 이 챌린지에 참가하지 않았어요.
              </p>
              {joinError && (
                <p className="mt-2 text-[12.5px] text-red-600">{joinError}</p>
              )}
              <button
                type="button"
                disabled={joining}
                onClick={() => void handleJoin()}
                className="mt-4 rounded-full bg-[color:var(--rnest-accent)] px-8 py-3 text-[14px] font-bold text-white transition active:opacity-80 disabled:opacity-40"
              >
                {joining ? "참가 중…" : "챌린지 참가하기"}
              </button>
            </div>
          )}

          {/* ── 리더보드 ──────────────────────────────────── */}
          {detail.leaderboard.length > 0 && (
            <div className="rounded-[32px] bg-white px-5 py-5 shadow-apple">
              <p className="mb-4 text-[14px] font-bold text-ios-text">
                리더보드
                {detail.challengeType === "streak" && (
                  <span className="ml-1.5 text-[11px] font-normal text-ios-muted">
                    연속 달성일 기준
                  </span>
                )}
              </p>
              <div className="space-y-2">
                {detail.leaderboard.map((entry) => {
                  const isMe = entry.userId === currentUserId;
                  const displayValue =
                    detail.challengeType === "streak"
                      ? entry.streakDays != null
                        ? `${entry.streakDays}일`
                        : "-"
                      : formatValue(entry.snapshotValue, detail.metric);

                  return (
                    <div
                      key={entry.userId}
                      className={cn(
                        "flex items-center gap-3 rounded-2xl px-4 py-3",
                        isMe
                          ? "bg-[color:var(--rnest-accent-soft)]"
                          : "bg-ios-bg"
                      )}
                    >
                      <RankBadge rank={entry.rank} />
                      <span className="text-[21px] leading-none">
                        {entry.avatarEmoji || "🐧"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p
                          className={cn(
                            "truncate text-[13.5px] font-semibold",
                            isMe
                              ? "text-[color:var(--rnest-accent)]"
                              : "text-ios-text"
                          )}
                        >
                          {entry.nickname || "알 수 없음"}
                          {isMe && (
                            <span className="ml-1 text-[11px] font-normal">
                              (나)
                            </span>
                          )}
                        </p>
                        {entry.isCompleted && (
                          <p className="text-[10.5px] font-semibold text-emerald-600">
                            달성 완료 ✓
                          </p>
                        )}
                      </div>
                      <p
                        className={cn(
                          "shrink-0 text-[13.5px] font-bold tabular-nums",
                          isMe
                            ? "text-[color:var(--rnest-accent)]"
                            : "text-ios-text"
                        )}
                      >
                        {displayValue}
                      </p>
                    </div>
                  );
                })}
              </div>
              <p className="mt-4 text-center text-[11px] text-ios-muted">
                순위는 매 시간 자동으로 갱신돼요
              </p>
            </div>
          )}

          {detail.leaderboard.length === 0 && (
            <div className="rounded-[32px] bg-white px-5 py-8 text-center shadow-apple">
              <p className="text-[13px] text-ios-muted">
                아직 참가자가 없어요. 먼저 참가해 보세요!
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
