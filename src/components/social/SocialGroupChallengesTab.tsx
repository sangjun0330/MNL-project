"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import {
  SocialBatteryIcon,
  SocialBrainIcon,
  SocialFlameIcon,
  SocialMoonIcon,
  SocialPlusIcon,
  SocialTargetIcon,
  SocialTrophyIcon,
} from "@/components/social/SocialIcons";
import type {
  ChallengeMetric,
  ChallengeType,
  CreateChallengePayload,
  GroupChallengeSummary,
} from "@/types/social";

// ── 타입 ─────────────────────────────────────────────────────

type Props = {
  groupId: number;
  challenges: GroupChallengeSummary[];
  currentUserId: string | null;
  canCreate: boolean;
  onRefresh: () => void;
};

// ── 메트릭 헬퍼 ──────────────────────────────────────────────

function MetricIcon({ metric, className }: { metric: ChallengeMetric; className?: string }) {
  if (metric === "sleep") return <SocialMoonIcon className={className ?? "h-[15px] w-[15px]"} />;
  if (metric === "mental") return <SocialBrainIcon className={className ?? "h-[15px] w-[15px]"} />;
  return <SocialBatteryIcon className={className ?? "h-[15px] w-[15px]"} />;
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

function metricUnit(metric: ChallengeMetric): string {
  return metric === "sleep" ? "h" : "";
}

// ── D-N 배지 ─────────────────────────────────────────────────

function DaysBadge({ daysLeft, status }: { daysLeft: number; status: string }) {
  if (status === "canceled") {
    return (
      <span className="shrink-0 rounded-full bg-ios-sep px-2.5 py-1 text-[11px] font-semibold text-ios-muted">
        취소됨
      </span>
    );
  }
  if (status === "ended" || daysLeft <= 0) {
    return (
      <span className="shrink-0 rounded-full bg-ios-sep px-2.5 py-1 text-[11px] font-semibold text-ios-muted">
        종료됨
      </span>
    );
  }
  if (daysLeft <= 1) {
    return (
      <span className="shrink-0 rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-600">
        D-DAY
      </span>
    );
  }
  return (
    <span className="shrink-0 rounded-full bg-[color:var(--rnest-accent-soft)] px-2.5 py-1 text-[11px] font-bold text-[color:var(--rnest-accent)]">
      D-{daysLeft}
    </span>
  );
}

// ── 진행 바 ───────────────────────────────────────────────────

function ProgressBar({
  value,
  maxValue,
  metric,
  streak,
  targetDays,
}: {
  value: number | null;
  maxValue: number;
  metric: ChallengeMetric;
  streak?: number | null;
  targetDays?: number | null;
}) {
  if (streak != null && targetDays != null) {
    // streak 타입
    const pct = Math.min(100, (streak / targetDays) * 100);
    return (
      <div className="mt-2 flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-ios-sep overflow-hidden">
          <div
            className="h-full rounded-full bg-orange-400 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="shrink-0 text-[11.5px] font-bold text-ios-text tabular-nums">
          {streak}일 연속
        </span>
      </div>
    );
  }
  if (value == null) return null;
  const pct = Math.min(100, (value / maxValue) * 100);
  const colorClass =
    metric === "sleep"
      ? pct >= 80 ? "bg-blue-400" : pct >= 60 ? "bg-sky-400" : "bg-amber-400"
      : pct >= 60 ? "bg-green-400" : pct >= 40 ? "bg-amber-400" : "bg-red-400";

  return (
    <div className="mt-2 flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-ios-sep overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", colorClass)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="shrink-0 text-[11.5px] font-bold text-ios-text tabular-nums">
        {metric === "sleep" ? `${value.toFixed(1)}h` : Math.round(value)}
        {metricUnit(metric)}
      </span>
    </div>
  );
}

// ── 챌린지 카드 ──────────────────────────────────────────────

function ChallengeCard({
  challenge,
  groupId,
  isEnded,
  onJoin,
  joiningId,
}: {
  challenge: GroupChallengeSummary;
  groupId: number;
  isEnded: boolean;
  onJoin: (challengeId: number) => void;
  joiningId: number | null;
}) {
  const router = useRouter();
  const entry = challenge.myEntry;
  const isParticipating = entry !== null;
  const maxValue = challenge.metric === "sleep" ? 9 : 100;

  return (
    <button
      type="button"
      onClick={() =>
        router.push(`/social/groups/${groupId}/challenges/${challenge.id}`)
      }
      className={cn(
        "w-full rounded-[28px] bg-white px-4 py-4 text-left shadow-apple transition active:opacity-80",
        isEnded && "opacity-60"
      )}
    >
      {/* 상단: 메트릭 아이콘 + 제목 + D-N */}
      <div className="flex items-start gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-[color:var(--rnest-accent-soft)] text-[color:var(--rnest-accent)]">
          <MetricIcon metric={challenge.metric} className="h-[16px] w-[16px]" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-bold text-ios-text leading-tight">
            {challenge.title}
          </p>
          <p className="mt-0.5 text-[11px] text-ios-muted">
            {typeLabel(challenge.challengeType)} · {metricLabel(challenge.metric)}
          </p>
        </div>
        <DaysBadge daysLeft={challenge.daysLeft} status={challenge.status} />
      </div>

      {/* 내 진행 바 또는 참가 버튼 */}
      {!isEnded && (
        isParticipating ? (
          challenge.challengeType === "streak" ? (
            <ProgressBar
              value={null}
              maxValue={maxValue}
              metric={challenge.metric}
              streak={entry.streakDays ?? 0}
              targetDays={challenge.targetDays}
            />
          ) : (
            <ProgressBar
              value={entry.snapshotValue}
              maxValue={maxValue}
              metric={challenge.metric}
            />
          )
        ) : (
          <div className="mt-2.5 flex">
            <button
              type="button"
              disabled={joiningId === challenge.id}
              onClick={(e) => {
                e.stopPropagation();
                onJoin(challenge.id);
              }}
              className="rounded-full bg-[color:var(--rnest-accent-soft)] px-3.5 py-1.5 text-[12px] font-semibold text-[color:var(--rnest-accent)] transition active:opacity-60 disabled:opacity-50"
            >
              {joiningId === challenge.id ? "참가 중…" : "참가하기"}
            </button>
          </div>
        )
      )}

      {/* 하단: 참가자 수 + 1위 정보 */}
      <div className="mt-2.5 flex items-center gap-2">
        <p className="text-[11px] text-ios-muted tabular-nums">
          {challenge.participantCount}명 참가
        </p>
        {challenge.challengeType === "group_goal" && challenge.targetValue != null && (
          <p className="text-[11px] text-ios-muted">
            · 목표 {challenge.metric === "sleep" ? `${challenge.targetValue}h` : challenge.targetValue}
          </p>
        )}
        {challenge.challengeType === "streak" && challenge.targetDays != null && (
          <p className="text-[11px] text-ios-muted">
            · {challenge.targetDays}일 연속 목표
          </p>
        )}
        <svg
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          className="ml-auto h-3.5 w-3.5 shrink-0 text-ios-muted"
          aria-hidden="true"
        >
          <path d="m8 5 5 5-5 5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </button>
  );
}

// ── 챌린지 생성 시트 ─────────────────────────────────────────

const METRICS: Array<{ value: ChallengeMetric; label: string; icon: ReactNode }> = [
  { value: "battery", label: "신체 배터리", icon: <SocialBatteryIcon className="h-5 w-5" /> },
  { value: "sleep",   label: "수면 시간",   icon: <SocialMoonIcon className="h-5 w-5" />    },
  { value: "mental",  label: "멘탈 배터리", icon: <SocialBrainIcon className="h-5 w-5" />   },
];

const TYPES: Array<{ value: ChallengeType; label: string; desc: string }> = [
  { value: "leaderboard", label: "순위 경쟁",   desc: "높은 값 순으로 개인 순위 경쟁" },
  { value: "group_goal",  label: "그룹 목표",   desc: "그룹 평균이 목표값 이상이면 성공" },
  { value: "streak",      label: "연속 달성",   desc: "N일 연속 목표값 이상 유지" },
];

const DURATIONS: Array<{ days: 7 | 14 | 21 | 30; label: string }> = [
  { days: 7,  label: "7일" },
  { days: 14, label: "14일" },
  { days: 21, label: "21일" },
  { days: 30, label: "30일" },
];

function CreateChallengeSheet({
  groupId,
  onClose,
  onCreated,
}: {
  groupId: number;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [metric, setMetric] = useState<ChallengeMetric>("battery");
  const [challengeType, setChallengeType] = useState<ChallengeType>("leaderboard");
  const [targetValue, setTargetValue] = useState("");
  const [targetDays, setTargetDays] = useState("7");
  const [durationDays, setDurationDays] = useState<7 | 14 | 21 | 30>(7);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) { setError("챌린지 이름을 입력해 주세요."); return; }
    if (challengeType === "group_goal" && !targetValue.trim()) {
      setError("그룹 목표값을 입력해 주세요."); return;
    }
    if (challengeType === "streak" && (!targetValue.trim() || !targetDays.trim())) {
      setError("연속 달성 기준값과 목표 일수를 입력해 주세요."); return;
    }

    setSubmitting(true);
    setError(null);

    const payload: CreateChallengePayload = {
      title: trimmedTitle,
      description: description.trim() || undefined,
      metric,
      challengeType,
      targetValue: targetValue.trim() ? Number(targetValue) : undefined,
      targetDays: challengeType === "streak" && targetDays.trim() ? Number(targetDays) : undefined,
      durationDays,
    };

    try {
      const res = await fetch(`/api/social/groups/${groupId}/challenges`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then((r) => r.json());

      if (!res.ok) {
        const errMsg =
          res.error === "challenge_title_required" ? "챌린지 이름을 입력해 주세요." :
          res.error === "too_many_active_challenges" ? "진행 중인 챌린지가 너무 많아요. (최대 5개)" :
          res.error === "too_many_requests" ? "잠시 후 다시 시도해 주세요." :
          "챌린지를 만들지 못했어요.";
        throw new Error(errMsg);
      }
      onCreated();
      onClose();
    } catch (err: any) {
      setError(String(err?.message ?? "챌린지를 만들지 못했어요."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div
        role="presentation"
        className="fixed inset-0 z-40 bg-black/30"
        onClick={onClose}
      />
      <div className="fixed bottom-0 left-0 right-0 z-50 flex max-h-[90dvh] flex-col overflow-hidden rounded-t-[32px] bg-white">
        {/* 핸들 */}
        <div className="flex shrink-0 justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-ios-sep" />
        </div>

        {/* 헤더 */}
        <div className="flex shrink-0 items-center justify-between px-5 py-3">
          <p className="text-[17px] font-bold text-ios-text">챌린지 만들기</p>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-ios-bg text-ios-muted transition active:opacity-60"
            aria-label="닫기"
          >
            <svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" />
            </svg>
          </button>
        </div>

        {/* 스크롤 영역 */}
        <div className="flex-1 overflow-y-auto px-5 pb-[calc(32px+env(safe-area-inset-bottom))]">
          <div className="space-y-5">

            {/* 이름 */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-[13px] font-semibold text-ios-text">챌린지 이름 *</label>
                <span className="text-[11px] text-ios-muted">{Array.from(title).length}/40</span>
              </div>
              <input
                value={title}
                onChange={(e) => setTitle(Array.from(e.target.value).slice(0, 40).join(""))}
                placeholder="예: 이번 주 수면 배틀"
                className="w-full rounded-2xl border border-ios-sep bg-ios-bg px-4 py-3 text-[14px] text-ios-text outline-none transition focus:border-[color:var(--rnest-accent)] placeholder:text-ios-muted/60"
              />
            </div>

            {/* 설명 */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-[13px] font-semibold text-ios-text">설명 (선택)</label>
                <span className="text-[11px] text-ios-muted">{Array.from(description).length}/120</span>
              </div>
              <input
                value={description}
                onChange={(e) => setDescription(Array.from(e.target.value).slice(0, 120).join(""))}
                placeholder="챌린지 목표나 규칙을 간단히 설명해 주세요."
                className="w-full rounded-2xl border border-ios-sep bg-ios-bg px-4 py-3 text-[14px] text-ios-text outline-none transition focus:border-[color:var(--rnest-accent)] placeholder:text-ios-muted/60"
              />
            </div>

            {/* 메트릭 */}
            <div>
              <p className="mb-2 text-[13px] font-semibold text-ios-text">측정 지표</p>
              <div className="grid grid-cols-3 gap-2">
                {METRICS.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setMetric(m.value)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-2xl border px-3 py-3 text-center transition",
                      metric === m.value
                        ? "border-[color:var(--rnest-accent)] bg-[color:var(--rnest-accent-soft)] text-[color:var(--rnest-accent)]"
                        : "border-ios-sep bg-ios-bg text-ios-muted"
                    )}
                  >
                    {m.icon}
                    <span className="text-[11px] font-semibold leading-tight">{m.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 챌린지 방식 */}
            <div>
              <p className="mb-2 text-[13px] font-semibold text-ios-text">챌린지 방식</p>
              <div className="space-y-2">
                {TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setChallengeType(t.value)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left transition",
                      challengeType === t.value
                        ? "border-[color:var(--rnest-accent)] bg-[color:var(--rnest-accent-soft)]"
                        : "border-ios-sep bg-ios-bg"
                    )}
                  >
                    <span className={cn(
                      "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2",
                      challengeType === t.value
                        ? "border-[color:var(--rnest-accent)] bg-[color:var(--rnest-accent)]"
                        : "border-ios-sep bg-white"
                    )}>
                      {challengeType === t.value && (
                        <span className="h-1.5 w-1.5 rounded-full bg-white" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className={cn(
                        "text-[13px] font-semibold",
                        challengeType === t.value ? "text-[color:var(--rnest-accent)]" : "text-ios-text"
                      )}>{t.label}</p>
                      <p className="mt-0.5 text-[11.5px] text-ios-muted">{t.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* 목표값 (group_goal / streak) */}
            {(challengeType === "group_goal" || challengeType === "streak") && (
              <div>
                <label className="mb-1.5 block text-[13px] font-semibold text-ios-text">
                  {challengeType === "group_goal" ? "그룹 목표값 *" : "달성 기준값 *"}
                  <span className="ml-1 font-normal text-ios-muted">
                    ({metric === "sleep" ? "시간, 예: 7.0" : "점수, 0–100"})
                  </span>
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={targetValue}
                  onChange={(e) => setTargetValue(e.target.value)}
                  placeholder={metric === "sleep" ? "7.0" : "50"}
                  className="w-full rounded-2xl border border-ios-sep bg-ios-bg px-4 py-3 text-[14px] text-ios-text outline-none transition focus:border-[color:var(--rnest-accent)] placeholder:text-ios-muted/60"
                />
              </div>
            )}

            {/* 연속 일수 (streak) */}
            {challengeType === "streak" && (
              <div>
                <label className="mb-1.5 block text-[13px] font-semibold text-ios-text">
                  목표 연속 일수 *
                </label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={targetDays}
                  onChange={(e) => setTargetDays(e.target.value)}
                  placeholder="7"
                  className="w-full rounded-2xl border border-ios-sep bg-ios-bg px-4 py-3 text-[14px] text-ios-text outline-none transition focus:border-[color:var(--rnest-accent)] placeholder:text-ios-muted/60"
                />
              </div>
            )}

            {/* 기간 */}
            <div>
              <p className="mb-2 text-[13px] font-semibold text-ios-text">진행 기간</p>
              <div className="flex gap-2">
                {DURATIONS.map((d) => (
                  <button
                    key={d.days}
                    type="button"
                    onClick={() => setDurationDays(d.days)}
                    className={cn(
                      "flex-1 rounded-2xl border py-2.5 text-[13px] font-semibold transition",
                      durationDays === d.days
                        ? "border-[color:var(--rnest-accent)] bg-[color:var(--rnest-accent-soft)] text-[color:var(--rnest-accent)]"
                        : "border-ios-sep bg-ios-bg text-ios-muted"
                    )}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[11.5px] text-ios-muted">
                시작: 지금 · 종료: {(() => {
                  const end = new Date(Date.now() + durationDays * 86_400_000);
                  return `${end.getMonth() + 1}/${end.getDate()}`;
                })()}
              </p>
            </div>

            {/* 에러 */}
            {error && (
              <div className="rounded-2xl bg-red-50 px-4 py-3 text-[13px] text-red-600">
                {error}
              </div>
            )}

            {/* 제출 버튼 */}
            <button
              type="button"
              disabled={submitting}
              onClick={handleSubmit}
              className="w-full rounded-2xl bg-[color:var(--rnest-accent)] py-4 text-[15px] font-bold text-white transition active:opacity-80 disabled:opacity-40"
            >
              {submitting ? "만드는 중…" : "챌린지 만들기"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ── 메인 탭 컴포넌트 ─────────────────────────────────────────

export function SocialGroupChallengesTab({
  groupId,
  challenges,
  currentUserId,
  canCreate,
  onRefresh,
}: Props) {
  const [createOpen, setCreateOpen] = useState(false);
  const [joiningId, setJoiningId] = useState<number | null>(null);

  const activeChallenges = challenges.filter((c) => c.status === "active");
  const endedChallenges  = challenges.filter((c) => c.status === "ended" || c.status === "canceled");

  const handleJoin = async (challengeId: number) => {
    if (joiningId) return;
    setJoiningId(challengeId);
    try {
      const res = await fetch(
        `/api/social/groups/${groupId}/challenges/${challengeId}/join`,
        { method: "POST" }
      ).then((r) => r.json());
      if (res.ok) onRefresh();
    } catch {
      // 조용히 실패 처리
    } finally {
      setJoiningId(null);
    }
  };

  // ── 빈 상태 ────────────────────────────────────────────────
  if (challenges.length === 0) {
    return (
      <>
        <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
          <div className="text-ios-muted/30">
            <SocialTrophyIcon className="h-14 w-14" />
          </div>
          <p className="text-[14px] font-semibold text-ios-text">아직 챌린지가 없어요</p>
          <p className="text-[12.5px] leading-5 text-ios-muted">
            그룹 멤버들과 건강 목표를 함께 달성해 보세요.
          </p>
          {canCreate && (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="mt-1 flex items-center gap-1.5 rounded-full bg-[color:var(--rnest-accent)] px-5 py-2.5 text-[13.5px] font-semibold text-white transition active:opacity-80"
            >
              <SocialPlusIcon className="h-4 w-4" />
              첫 챌린지 만들기
            </button>
          )}
        </div>
        {createOpen && (
          <CreateChallengeSheet
            groupId={groupId}
            onClose={() => setCreateOpen(false)}
            onCreated={onRefresh}
          />
        )}
      </>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {/* 헤더 행 */}
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-semibold text-ios-text">
            {activeChallenges.length > 0
              ? `${activeChallenges.length}개 진행 중`
              : "진행 중인 챌린지 없음"}
          </p>
          {canCreate && (
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="flex items-center gap-1 rounded-full bg-[color:var(--rnest-accent-soft)] px-3 py-1.5 text-[12px] font-semibold text-[color:var(--rnest-accent)] transition active:opacity-60"
            >
              <SocialPlusIcon className="h-3.5 w-3.5" />
              만들기
            </button>
          )}
        </div>

        {/* 진행 중 챌린지 */}
        {activeChallenges.length > 0 && (
          <div className="space-y-3">
            {activeChallenges.map((c) => (
              <ChallengeCard
                key={c.id}
                challenge={c}
                groupId={groupId}
                isEnded={false}
                onJoin={handleJoin}
                joiningId={joiningId}
              />
            ))}
          </div>
        )}

        {/* 종료된 챌린지 */}
        {endedChallenges.length > 0 && (
          <div>
            <p className="mb-2.5 text-[12px] font-semibold text-ios-muted">종료된 챌린지</p>
            <div className="space-y-2.5">
              {endedChallenges.map((c) => (
                <ChallengeCard
                  key={c.id}
                  challenge={c}
                  groupId={groupId}
                  isEnded
                  onJoin={handleJoin}
                  joiningId={joiningId}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 챌린지 생성 시트 */}
      {createOpen && (
        <CreateChallengeSheet
          groupId={groupId}
          onClose={() => setCreateOpen(false)}
          onCreated={onRefresh}
        />
      )}
    </>
  );
}
