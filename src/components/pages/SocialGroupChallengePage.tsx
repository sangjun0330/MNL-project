"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthState } from "@/lib/auth";
import { cn } from "@/lib/cn";
import {
  buildSocialClientCacheKey,
  clearSocialClientCache,
  getSocialClientCache,
  setSocialClientCache,
} from "@/lib/socialClientCache";
import {
  SocialActivityIcon,
  SocialBatteryIcon,
  SocialBrainIcon,
  SocialCoffeeIcon,
  SocialFlameIcon,
  SocialMoodIcon,
  SocialMoonIcon,
  SocialStressIcon,
  SocialTargetIcon,
  SocialTrophyIcon,
} from "@/components/social/SocialIcons";
import type {
  ChallengeEntry,
  ChallengeLeaderboardEntry,
  ChallengeMetric,
  ChallengeType,
  GroupChallengeDetail,
} from "@/types/social";

function MetricIcon({
  metric,
  className,
}: {
  metric: ChallengeMetric;
  className?: string;
}) {
  if (metric === "sleep") return <SocialMoonIcon className={className} />;
  if (metric === "mental") return <SocialBrainIcon className={className} />;
  if (metric === "stress") return <SocialStressIcon className={className} />;
  if (metric === "activity") return <SocialActivityIcon className={className} />;
  if (metric === "caffeine") return <SocialCoffeeIcon className={className} />;
  if (metric === "mood") return <SocialMoodIcon className={className} />;
  return <SocialBatteryIcon className={className} />;
}

function metricLabel(metric: ChallengeMetric): string {
  if (metric === "sleep") return "수면 시간";
  if (metric === "mental") return "멘탈 배터리";
  if (metric === "stress") return "스트레스";
  if (metric === "activity") return "활동량";
  if (metric === "caffeine") return "카페인";
  if (metric === "mood") return "기분";
  return "신체 배터리";
}

function typeLabel(challengeType: ChallengeType): string {
  if (challengeType === "low_value") return "낮은 값 경쟁";
  if (challengeType === "group_goal") return "그룹 목표";
  if (challengeType === "streak") return "연속 달성";
  return "순위 경쟁";
}

function metricMax(metric: ChallengeMetric): number {
  if (metric === "sleep") return 16;
  if (metric === "stress" || metric === "activity") return 3;
  if (metric === "mood") return 5;
  if (metric === "caffeine") return 1000;
  return 100;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatValue(value: number | null, metric: ChallengeMetric): string {
  if (value == null) return "-";
  if (metric === "sleep") return `${value.toFixed(1)}h`;
  if (metric === "caffeine") return `${Math.round(value)}mg`;
  if (metric === "stress" || metric === "activity") return `${value.toFixed(1)}단계`;
  if (metric === "mood") return `${value.toFixed(1)}점`;
  return String(Math.round(value));
}

function calcDaysLeft(endsAt: string): number {
  const ms = new Date(endsAt).getTime() - Date.now();
  return Math.ceil(ms / 86_400_000);
}

function challengeValueNumber(
  entry: Pick<ChallengeEntry, "snapshotValue" | "streakDays"> | null,
  challengeType: ChallengeType,
): number | null {
  if (!entry) return null;
  if (challengeType === "streak") return entry.streakDays ?? null;
  return entry.snapshotValue;
}

function challengeValueLabel(
  value: number | null,
  metric: ChallengeMetric,
  challengeType: ChallengeType,
): string {
  if (value == null) return "-";
  if (challengeType === "streak") return `${Math.round(value)}일`;
  return formatValue(value, metric);
}

function gapLabel(
  leaderValue: number | null,
  currentValue: number | null,
  metric: ChallengeMetric,
  challengeType: ChallengeType,
): string | null {
  if (leaderValue == null || currentValue == null) return null;
  const diff =
    challengeType === "low_value" ? currentValue - leaderValue : leaderValue - currentValue;
  if (diff <= 0) return null;
  if (challengeType === "streak") return `${Math.round(diff)}일 차이`;
  if (metric === "sleep") return `${diff.toFixed(1)}h 차이`;
  if (metric === "caffeine") return `${Math.round(diff)}mg 차이`;
  if (metric === "stress" || metric === "activity") return `${diff.toFixed(1)}단계 차이`;
  if (metric === "mood") return `${diff.toFixed(1)}점 차이`;
  return `${Math.round(diff)}점 차이`;
}

function leaderboardBarWidth(
  value: number | null,
  leaderValue: number | null,
  trailingValue: number | null,
  challengeType: ChallengeType,
  metric: ChallengeMetric,
): number {
  if (value == null || leaderValue == null) return 0;
  if (challengeType === "low_value") {
    const worstValue = trailingValue ?? leaderValue;
    if (worstValue <= leaderValue) return 100;
    const ratio = (worstValue - value) / (worstValue - leaderValue);
    return Math.max(10, Math.min(100, ratio * 90 + 10));
  }
  if (challengeType === "streak") {
    const target = Math.max(1, leaderValue);
    return Math.max(10, Math.min(100, (value / target) * 100));
  }
  const scaleMax = Math.max(metricMax(metric), leaderValue);
  return Math.max(10, Math.min(100, (value / scaleMax) * 100));
}

function metricTheme(metric: ChallengeMetric) {
  if (metric === "sleep") {
    return {
      heroSurface:
        "bg-[linear-gradient(135deg,#EEF6FF_0%,#FFFFFF_54%,#F3F8FF_100%)] border border-sky-100/70",
      iconSurface: "bg-[#E3F0FF] text-[#2A72D6]",
      accentSurface: "bg-[#EAF3FF] text-[#2563C9]",
      accentText: "text-[#2563C9]",
      leaderSurface: "bg-[#F3F8FF]",
      topSurface: "bg-[linear-gradient(135deg,#FFF9E8_0%,#FFF4C8_100%)] border border-[#F0D989]",
      secondSurface: "bg-[linear-gradient(135deg,#F8FBFF_0%,#EEF4FB_100%)] border border-[#D5DFEC]",
      thirdSurface: "bg-[linear-gradient(135deg,#FFF5ED_0%,#FFE8D7_100%)] border border-[#E8C5A7]",
      progress: "bg-[linear-gradient(90deg,#60A5FA_0%,#2563EB_100%)]",
      rowHighlight: "bg-[#EEF6FF] border border-sky-100",
      spotlight:
        "bg-[radial-gradient(circle_at_top_right,rgba(96,165,250,0.2),transparent_38%)]",
    };
  }
  if (metric === "stress") {
    return {
      heroSurface:
        "bg-[linear-gradient(135deg,#FFF3F3_0%,#FFFFFF_54%,#FFF6F6_100%)] border border-rose-100/70",
      iconSurface: "bg-[#FFE5E8] text-[#D14767]",
      accentSurface: "bg-[#FFF0F2] text-[#D14767]",
      accentText: "text-[#D14767]",
      leaderSurface: "bg-[#FFF7F8]",
      topSurface: "bg-[linear-gradient(135deg,#FFF9E8_0%,#FFF4C8_100%)] border border-[#F0D989]",
      secondSurface: "bg-[linear-gradient(135deg,#F8FBFF_0%,#EEF4FB_100%)] border border-[#D5DFEC]",
      thirdSurface: "bg-[linear-gradient(135deg,#FFF5ED_0%,#FFE8D7_100%)] border border-[#E8C5A7]",
      progress: "bg-[linear-gradient(90deg,#FB7185_0%,#E11D48_100%)]",
      rowHighlight: "bg-[#FFF4F6] border border-rose-100",
      spotlight:
        "bg-[radial-gradient(circle_at_top_right,rgba(251,113,133,0.18),transparent_40%)]",
    };
  }
  if (metric === "activity") {
    return {
      heroSurface:
        "bg-[linear-gradient(135deg,#EFFAF4_0%,#FFFFFF_54%,#F5FFF9_100%)] border border-emerald-100/70",
      iconSurface: "bg-[#DCF7E7] text-[#1D9A62]",
      accentSurface: "bg-[#EAF9F1] text-[#178452]",
      accentText: "text-[#178452]",
      leaderSurface: "bg-[#F6FCF8]",
      topSurface: "bg-[linear-gradient(135deg,#FFF9E8_0%,#FFF4C8_100%)] border border-[#F0D989]",
      secondSurface: "bg-[linear-gradient(135deg,#F8FBFF_0%,#EEF4FB_100%)] border border-[#D5DFEC]",
      thirdSurface: "bg-[linear-gradient(135deg,#FFF5ED_0%,#FFE8D7_100%)] border border-[#E8C5A7]",
      progress: "bg-[linear-gradient(90deg,#34D399_0%,#10B981_100%)]",
      rowHighlight: "bg-[#EFFBF4] border border-emerald-100",
      spotlight:
        "bg-[radial-gradient(circle_at_top_right,rgba(52,211,153,0.18),transparent_40%)]",
    };
  }
  if (metric === "caffeine") {
    return {
      heroSurface:
        "bg-[linear-gradient(135deg,#FFF7EF_0%,#FFFFFF_54%,#FFF9F2_100%)] border border-amber-100/70",
      iconSurface: "bg-[#FEEBD9] text-[#B96B23]",
      accentSurface: "bg-[#FFF3E6] text-[#B96B23]",
      accentText: "text-[#B96B23]",
      leaderSurface: "bg-[#FFF9F3]",
      topSurface: "bg-[linear-gradient(135deg,#FFF9E8_0%,#FFF4C8_100%)] border border-[#F0D989]",
      secondSurface: "bg-[linear-gradient(135deg,#F8FBFF_0%,#EEF4FB_100%)] border border-[#D5DFEC]",
      thirdSurface: "bg-[linear-gradient(135deg,#FFF5ED_0%,#FFE8D7_100%)] border border-[#E8C5A7]",
      progress: "bg-[linear-gradient(90deg,#F59E0B_0%,#D97706_100%)]",
      rowHighlight: "bg-[#FFF8F0] border border-amber-100",
      spotlight:
        "bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.18),transparent_40%)]",
    };
  }
  if (metric === "mood") {
    return {
      heroSurface:
        "bg-[linear-gradient(135deg,#F2FBFB_0%,#FFFFFF_54%,#F4FFFF_100%)] border border-cyan-100/70",
      iconSurface: "bg-[#DDF7F8] text-[#0E8EA0]",
      accentSurface: "bg-[#E9FAFB] text-[#0E8EA0]",
      accentText: "text-[#0E8EA0]",
      leaderSurface: "bg-[#F5FCFD]",
      topSurface: "bg-[linear-gradient(135deg,#FFF9E8_0%,#FFF4C8_100%)] border border-[#F0D989]",
      secondSurface: "bg-[linear-gradient(135deg,#F8FBFF_0%,#EEF4FB_100%)] border border-[#D5DFEC]",
      thirdSurface: "bg-[linear-gradient(135deg,#FFF5ED_0%,#FFE8D7_100%)] border border-[#E8C5A7]",
      progress: "bg-[linear-gradient(90deg,#22D3EE_0%,#0891B2_100%)]",
      rowHighlight: "bg-[#EFFBFD] border border-cyan-100",
      spotlight:
        "bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.18),transparent_40%)]",
    };
  }
  if (metric === "mental") {
    return {
      heroSurface:
        "bg-[linear-gradient(135deg,#FFF5ED_0%,#FFFFFF_54%,#FFF6EF_100%)] border border-orange-100/70",
      iconSurface: "bg-[#FFE8D8] text-[#C85D28]",
      accentSurface: "bg-[#FFF0E5] text-[#C85D28]",
      accentText: "text-[#C85D28]",
      leaderSurface: "bg-[#FFF7F1]",
      topSurface: "bg-[linear-gradient(135deg,#FFF9E8_0%,#FFF4C8_100%)] border border-[#F0D989]",
      secondSurface: "bg-[linear-gradient(135deg,#F8FBFF_0%,#EEF4FB_100%)] border border-[#D5DFEC]",
      thirdSurface: "bg-[linear-gradient(135deg,#FFF5ED_0%,#FFE8D7_100%)] border border-[#E8C5A7]",
      progress: "bg-[linear-gradient(90deg,#FB923C_0%,#F97316_100%)]",
      rowHighlight: "bg-[#FFF6EF] border border-orange-100",
      spotlight:
        "bg-[radial-gradient(circle_at_top_right,rgba(251,146,60,0.18),transparent_40%)]",
    };
  }
  return {
    heroSurface:
      "bg-[linear-gradient(135deg,#F3FBF6_0%,#FFFFFF_54%,#F5FFF8_100%)] border border-emerald-100/70",
    iconSurface: "bg-[#E4F6EA] text-[#18975C]",
    accentSurface: "bg-[#EAF8EF] text-[#138454]",
    accentText: "text-[#138454]",
    leaderSurface: "bg-[#F6FCF8]",
    topSurface: "bg-[linear-gradient(135deg,#FFF9E8_0%,#FFF4C8_100%)] border border-[#F0D989]",
    secondSurface: "bg-[linear-gradient(135deg,#F8FBFF_0%,#EEF4FB_100%)] border border-[#D5DFEC]",
    thirdSurface: "bg-[linear-gradient(135deg,#FFF5ED_0%,#FFE8D7_100%)] border border-[#E8C5A7]",
    progress: "bg-[linear-gradient(90deg,#4ADE80_0%,#22C55E_100%)]",
    rowHighlight: "bg-[#EFFBF4] border border-emerald-100",
    spotlight:
      "bg-[radial-gradient(circle_at_top_right,rgba(74,222,128,0.18),transparent_40%)]",
  };
}

function RankBadge({
  rank,
  large = false,
}: {
  rank: number;
  large?: boolean;
}) {
  const cls =
    rank === 1
      ? "border-[#F0D989] bg-[#FFF7D8] text-[#A36A00] shadow-[0_8px_24px_rgba(240,185,11,0.16)]"
      : rank === 2
        ? "border-[#D8DEE8] bg-[#F8FAFC] text-[#5A6578]"
        : rank === 3
          ? "border-[#E7C2A3] bg-[#FFF1E6] text-[#9B5D37]"
          : "border-ios-sep bg-ios-bg text-ios-muted";

  return (
    <div
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full border font-bold tabular-nums",
        large ? "h-11 min-w-11 px-3 text-[17px]" : "h-8 min-w-8 px-2 text-[12px]",
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
      <span className="rounded-full bg-ios-sep px-3 py-1 text-[11px] font-semibold text-ios-muted">
        취소됨
      </span>
    );
  }
  if (status === "ended" || daysLeft <= 0) {
    return (
      <span className="rounded-full bg-ios-sep px-3 py-1 text-[11px] font-semibold text-ios-muted">
        종료됨
      </span>
    );
  }
  if (daysLeft <= 1) {
    return (
      <span className="rounded-full bg-red-50 px-3 py-1 text-[11px] font-bold text-red-600">
        D-DAY
      </span>
    );
  }
  return (
    <span className="rounded-full bg-[color:var(--rnest-accent-soft)] px-3 py-1 text-[11px] font-bold text-[color:var(--rnest-accent)]">
      D-{daysLeft}
    </span>
  );
}

function HeroStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-[22px] bg-white/78 px-3 py-3 backdrop-blur-[6px]">
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-ios-muted">
        {label}
      </p>
      <p className="mt-1.5 text-[18px] font-bold tracking-[-0.03em] text-ios-text">{value}</p>
      <p className="mt-1 text-[10.5px] text-ios-muted">{hint}</p>
    </div>
  );
}

function PodiumCard({
  entry,
  metric,
  challengeType,
  currentUserId,
  theme,
  prominent = false,
}: {
  entry: ChallengeLeaderboardEntry;
  metric: ChallengeMetric;
  challengeType: ChallengeType;
  currentUserId: string | null;
  theme: ReturnType<typeof metricTheme>;
  prominent?: boolean;
}) {
  const isMe = entry.userId === currentUserId;
  const value = challengeValueLabel(challengeValueNumber(entry, challengeType), metric, challengeType);
  const surface =
    entry.rank === 1 ? theme.topSurface : entry.rank === 2 ? theme.secondSurface : theme.thirdSurface;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[28px] px-4 py-4 shadow-sm",
        surface,
        prominent ? "min-h-[148px]" : "min-h-[132px]",
        isMe && "ring-2 ring-[color:var(--rnest-accent)]/18"
      )}
    >
      <div className="absolute right-0 top-0 h-20 w-24 rounded-full bg-white/35 blur-2xl" />
      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <RankBadge rank={entry.rank} large={prominent} />
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/75 text-[24px] shadow-sm">
              {entry.avatarEmoji || "🐧"}
            </div>
          </div>
          {entry.rank === 1 ? (
            <span className="rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-bold tracking-[0.08em] text-[#A36A00]">
              LEADER
            </span>
          ) : null}
        </div>
        <div className="mt-4">
          <p className="truncate text-[15px] font-bold text-ios-text">
            {entry.nickname || "알 수 없음"}
            {isMe ? (
              <span className="ml-1.5 rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-[color:var(--rnest-accent)]">
                나
              </span>
            ) : null}
          </p>
          <p className="mt-1 text-[11px] font-semibold text-ios-muted">
            {entry.rank === 1 ? "현재 선두" : `${entry.rank}위 추격 중`}
          </p>
          <p className="mt-3 text-[26px] font-black tracking-[-0.04em] text-ios-text tabular-nums">
            {value}
          </p>
          {entry.isCompleted ? (
            <p className="mt-1 text-[11px] font-bold text-emerald-700">달성 완료</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function LeaderboardRow({
  entry,
  metric,
  challengeType,
  leaderValue,
  trailingValue,
  currentUserId,
  theme,
}: {
  entry: ChallengeLeaderboardEntry;
  metric: ChallengeMetric;
  challengeType: ChallengeType;
  leaderValue: number | null;
  trailingValue: number | null;
  currentUserId: string | null;
  theme: ReturnType<typeof metricTheme>;
}) {
  const isMe = entry.userId === currentUserId;
  const value = challengeValueNumber(entry, challengeType);
  const gap = gapLabel(leaderValue, value, metric, challengeType);
  const valueLabel = challengeValueLabel(value, metric, challengeType);
  const width = leaderboardBarWidth(value, leaderValue, trailingValue, challengeType, metric);

  return (
    <div
      className={cn(
        "rounded-[24px] border px-4 py-3",
        isMe ? theme.rowHighlight : "border-transparent bg-ios-bg"
      )}
    >
      <div className="flex items-center gap-3">
        <RankBadge rank={entry.rank} />
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-[22px] shadow-sm">
          {entry.avatarEmoji || "🐧"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-[14px] font-semibold text-ios-text">
              {entry.nickname || "알 수 없음"}
            </p>
            {isMe ? (
              <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-[color:var(--rnest-accent)]">
                나
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-[10.5px] text-ios-muted">
            {gap ? `선두와 ${gap}` : "현재 선두"}
          </p>
        </div>
        <div className="text-right">
          <p className={cn("text-[18px] font-black tabular-nums", isMe ? theme.accentText : "text-ios-text")}>
            {valueLabel}
          </p>
          {entry.isCompleted ? (
            <p className="mt-0.5 text-[10px] font-semibold text-emerald-700">완료</p>
          ) : null}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-white">
          <div className={cn("h-full rounded-full", theme.progress)} style={{ width: `${width}%` }} />
        </div>
        <span className="shrink-0 text-[10.5px] font-semibold text-ios-muted">{width}%</span>
      </div>
    </div>
  );
}

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

  const parsedGroupId = parseInt(rawGroupId, 10);
  const parsedChallengeId = parseInt(rawChallengeId, 10);
  const groupIdNum = Number.isFinite(parsedGroupId) && parsedGroupId > 0 ? parsedGroupId : null;
  const challengeIdNum =
    Number.isFinite(parsedChallengeId) && parsedChallengeId > 0 ? parsedChallengeId : null;
  const detailCacheKey =
    currentUserId && groupIdNum && challengeIdNum
      ? buildSocialClientCacheKey(currentUserId, "group-challenge-detail", `${groupIdNum}:${challengeIdNum}`)
      : null;

  const [detail, setDetail] = useState<GroupChallengeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const detailRef = useRef<GroupChallengeDetail | null>(null);
  const detailRequestSeqRef = useRef(0);

  useEffect(() => {
    detailRef.current = detail;
  }, [detail]);

  const loadDetail = useCallback(async () => {
    if (!groupIdNum || !challengeIdNum) {
      setDetail(null);
      setError("invalid_route");
      setLoading(false);
      return;
    }
    const requestSeq = ++detailRequestSeqRef.current;
    const cached = detailCacheKey
      ? getSocialClientCache<GroupChallengeDetail>(detailCacheKey)
      : null;
    const hasVisibleDetail = Boolean(cached || detailRef.current);
    if (cached && !detailRef.current) {
      detailRef.current = cached.data;
      setDetail(cached.data);
      setLoading(false);
      setError(null);
    }
    setLoading(!hasVisibleDetail);
    if (!hasVisibleDetail) {
      setError(null);
    }
    try {
      const res = await fetch(
        `/api/social/groups/${groupIdNum}/challenges/${challengeIdNum}`,
        { cache: "no-store" }
      ).then((r) => r.json());
      if (requestSeq !== detailRequestSeqRef.current) return;
      if (!res.ok) throw new Error(res.error ?? "불러오기 실패");
      const nextDetail = res.data as GroupChallengeDetail;
      detailRef.current = nextDetail;
      setDetail(nextDetail);
      setError(null);
      if (detailCacheKey) {
        setSocialClientCache(detailCacheKey, nextDetail);
      }
    } catch (err: any) {
      if (requestSeq !== detailRequestSeqRef.current) return;
      const nextError = String(err?.message ?? "챌린지 정보를 불러오지 못했어요.");
      const isTerminalError = nextError === "challenge_not_found";
      if (!detailRef.current || isTerminalError || nextError === "invalid_route") {
        detailRef.current = null;
        setDetail(null);
        setError(nextError);
        if (detailCacheKey) {
          clearSocialClientCache(detailCacheKey);
        }
      } else {
        setError(null);
      }
    } finally {
      if (requestSeq === detailRequestSeqRef.current) {
        setLoading(false);
      }
    }
  }, [challengeIdNum, detailCacheKey, groupIdNum]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const handleJoin = async () => {
    if (joining || !detail || !groupIdNum || !challengeIdNum) return;
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

  const initialLoading = loading && !detail;
  const refreshing = loading && !!detail;

  if (!initialLoading && error) {
    return (
      <div className="mx-auto w-full max-w-[680px] space-y-4 px-1.5 pb-8 sm:max-w-[700px] sm:px-0">
        <BackHeader />
        <div className="rounded-[32px] bg-white px-4 py-8 text-center shadow-apple">
          <p className="text-[15px] font-semibold text-ios-text">챌린지를 불러오지 못했어요</p>
          <p className="mt-2 text-[13px] text-ios-muted">
            {error === "challenge_not_found"
              ? "삭제되었거나 존재하지 않는 챌린지예요."
              : error === "invalid_route"
                ? "잘못된 챌린지 주소예요."
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

  const daysLeft = detail ? calcDaysLeft(detail.endsAt) : 0;
  const isActive = detail?.status === "active";
  const myEntry = detail?.myEntry ?? null;
  const isParticipating = myEntry !== null;
  const myLeaderboardEntry = detail?.leaderboard.find((entry) => entry.userId === currentUserId) ?? null;
  const leaderEntry = detail?.leaderboard[0] ?? null;
  const topThree = detail?.leaderboard.slice(0, 3) ?? [];
  const chasingEntries = detail?.leaderboard.slice(3) ?? [];
  const leaderValue = detail ? challengeValueNumber(leaderEntry, detail.challengeType) : null;
  const trailingEntry = detail?.leaderboard[detail.leaderboard.length - 1] ?? null;
  const trailingValue = detail ? challengeValueNumber(trailingEntry, detail.challengeType) : null;
  const myValue = detail ? challengeValueNumber(myEntry, detail.challengeType) : null;
  const myGap = detail ? gapLabel(leaderValue, myValue, detail.metric, detail.challengeType) : null;
  const theme = metricTheme(detail?.metric ?? "battery");
  const isLeader = myLeaderboardEntry?.rank === 1;

  const heroSummary =
    !detail
      ? ""
      : detail.challengeType === "streak"
        ? "연속 기록을 이어가며 가장 긴 streak를 만드는 레이스예요."
        : detail.challengeType === "low_value"
          ? "최근 건강 기록 중 더 낮을수록 좋은 값을 기준으로 순위를 겨루는 레이스예요."
        : detail.challengeType === "group_goal"
          ? "개인 기록도 보이지만, 결국 그룹 평균으로 목표를 넘기는 미션이에요."
          : "최근 건강 기록으로 바로 순위가 반영되는 경쟁형 챌린지예요.";

  return (
    <div className="mx-auto w-full max-w-[680px] space-y-4 px-1.5 pb-8 sm:max-w-[700px] sm:px-0">
      <BackHeader />

      {refreshing && (
        <div className="flex justify-end">
          <span className="rounded-full bg-ios-bg px-3 py-1 text-[11px] font-medium text-ios-muted">
            업데이트 중…
          </span>
        </div>
      )}

      {initialLoading && (
        <div className="space-y-3">
          <div className="h-52 rounded-[34px] bg-white animate-pulse shadow-apple" />
          <div className="h-32 rounded-[32px] bg-white animate-pulse shadow-apple" />
          <div className="h-56 rounded-[32px] bg-white animate-pulse shadow-apple" />
        </div>
      )}

      {detail && (
        <>
          <div className={cn("relative overflow-hidden rounded-[36px] shadow-apple", theme.heroSurface)}>
            <div className={cn("absolute inset-0", theme.spotlight)} />
            <div className="relative px-5 py-5">
              <div className="flex items-start gap-3">
                <span className={cn("flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px]", theme.iconSurface)}>
                  <MetricIcon metric={detail.metric} className="h-[24px] w-[24px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold", theme.accentSurface)}>
                      {typeLabel(detail.challengeType)}
                    </span>
                    <span className="rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-ios-muted">
                      {metricLabel(detail.metric)}
                    </span>
                    <DaysBadge daysLeft={daysLeft} status={detail.status} />
                  </div>
                  <p className="mt-3 text-[28px] font-black leading-none tracking-[-0.05em] text-ios-text">
                    {detail.title}
                  </p>
                  <p className="mt-2 max-w-[520px] text-[13px] leading-6 text-ios-muted">
                    {detail.description || heroSummary}
                  </p>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <HeroStat
                  label="참가자"
                  value={`${detail.participantCount}명`}
                  hint="현재 레이스 참여"
                />
                <HeroStat
                  label="현재 선두"
                  value={challengeValueLabel(leaderValue, detail.metric, detail.challengeType)}
                  hint={leaderEntry ? `${leaderEntry.nickname} 리드 중` : "선두 대기 중"}
                />
                <HeroStat
                  label={detail.challengeType === "streak" ? "목표일" : "목표"}
                  value={
                    detail.challengeType === "streak" && detail.targetDays
                      ? `${detail.targetDays}일`
                      : detail.targetValue != null
                        ? challengeValueLabel(detail.targetValue, detail.metric, detail.challengeType)
                        : "자유 경쟁"
                  }
                  hint={
                    detail.challengeType === "leaderboard"
                      ? "가장 높은 기록이 우승"
                      : detail.challengeType === "low_value"
                        ? "가장 낮은 기록이 우승"
                      : detail.challengeType === "group_goal"
                        ? "그룹 평균 달성"
                        : "연속 유지 필요"
                  }
                />
                <HeroStat
                  label="기간"
                  value={`${formatDate(detail.startsAt)} ~ ${formatDate(detail.endsAt)}`}
                  hint={detail.status === "active" ? "지금 진행 중" : "종료된 경기"}
                />
              </div>

              {leaderEntry ? (
                <div className={cn("mt-4 rounded-[26px] border border-white/65 px-4 py-4 shadow-sm", theme.leaderSurface)}>
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-[16px] bg-white text-[#B07A00] shadow-sm">
                      <SocialTrophyIcon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ios-muted">현재 선두</p>
                      <p className="mt-1 truncate text-[16px] font-bold text-ios-text">
                        {leaderEntry.nickname}
                        <span className={cn("ml-2 text-[18px]", theme.accentText)}>
                          {challengeValueLabel(leaderValue, detail.metric, detail.challengeType)}
                        </span>
                      </p>
                    </div>
                    {myGap ? (
                      <div className="text-right">
                        <p className="text-[10.5px] font-semibold text-ios-muted">내 격차</p>
                        <p className="mt-1 text-[12.5px] font-bold text-ios-text">{myGap}</p>
                      </div>
                    ) : isParticipating ? (
                      <div className={cn("rounded-full px-3 py-1.5 text-[11px] font-bold", theme.accentSurface)}>
                        {isLeader ? "선두 유지 중" : "동점 포함"}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {detail.challengeType === "group_goal" && detail.targetValue != null && (
            <div className="rounded-[32px] bg-white px-5 py-5 shadow-apple">
              <div className="flex items-center gap-2">
                <span className={cn("flex h-9 w-9 items-center justify-center rounded-2xl", theme.iconSurface)}>
                  <SocialTargetIcon className="h-[17px] w-[17px]" />
                </span>
                <div>
                  <p className="text-[14px] font-bold text-ios-text">그룹 목표 진행 현황</p>
                  <p className="mt-0.5 text-[11.5px] text-ios-muted">전체 참가자 평균으로 목표를 넘겨야 성공해요.</p>
                </div>
              </div>
              <div className="mt-4 flex items-end justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold text-ios-muted">그룹 평균</p>
                  <p className="mt-1 text-[28px] font-black tracking-[-0.04em] text-ios-text tabular-nums">
                    {detail.groupCurrentAvg != null ? formatValue(detail.groupCurrentAvg, detail.metric) : "-"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] font-semibold text-ios-muted">목표</p>
                  <p className="mt-1 text-[17px] font-bold text-ios-text">
                    {formatValue(detail.targetValue, detail.metric)}
                  </p>
                </div>
              </div>
              {detail.groupCurrentAvg != null ? (
                <div className="mt-4">
                  <div className="h-3 overflow-hidden rounded-full bg-ios-sep">
                    <div
                      className={cn("h-full rounded-full", theme.progress)}
                      style={{ width: `${Math.min(100, (detail.groupCurrentAvg / detail.targetValue) * 100)}%` }}
                    />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-ios-muted">
                    <span>0</span>
                    <span>{Math.min(100, Math.round((detail.groupCurrentAvg / detail.targetValue) * 100))}% 달성</span>
                    <span>{formatValue(detail.targetValue, detail.metric)}</span>
                  </div>
                </div>
              ) : (
                <p className="mt-4 rounded-2xl bg-ios-bg px-4 py-3 text-center text-[12px] text-ios-muted">
                  아직 스냅샷 데이터가 없어요. 잠시 후 다시 확인해 주세요.
                </p>
              )}
              {detail.groupGoalMet === true ? (
                <div className="mt-4 flex items-center gap-2 rounded-[22px] bg-emerald-50 px-4 py-3">
                  <SocialFlameIcon className="h-[18px] w-[18px] text-emerald-600" />
                  <p className="text-[13px] font-bold text-emerald-700">그룹 목표를 달성했어요.</p>
                </div>
              ) : null}
            </div>
          )}

          {isParticipating && myEntry ? (
            <div className="rounded-[32px] bg-white px-5 py-5 shadow-apple">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[14px] font-bold text-ios-text">내 레이스 현황</p>
                  <p className="mt-0.5 text-[11.5px] text-ios-muted">
                    {isLeader
                      ? "현재 선두를 유지하고 있어요."
                      : detail.challengeType === "low_value"
                        ? "더 낮은 값으로 선두와의 격차를 줄여 보세요."
                        : "선두와의 격차를 줄여 보세요."}
                  </p>
                </div>
                <div className={cn("rounded-full px-3 py-1.5 text-[11px] font-bold", theme.accentSurface)}>
                  {myLeaderboardEntry ? `#${myLeaderboardEntry.rank}` : "참가 완료"}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2">
                <HeroStat
                  label="내 순위"
                  value={myLeaderboardEntry ? `${myLeaderboardEntry.rank}위` : "-"}
                  hint={isLeader ? "현재 선두" : "실시간 기준"}
                />
                <HeroStat
                  label={detail.challengeType === "streak" ? "연속 기록" : metricLabel(detail.metric)}
                  value={challengeValueLabel(myValue, detail.metric, detail.challengeType)}
                  hint="내 최신 기록"
                />
                <HeroStat
                  label={isLeader ? "상태" : "선두와 격차"}
                  value={isLeader ? "LEAD" : myGap ?? "-"}
                  hint={
                    isLeader
                      ? "방어 중"
                      : detail.challengeType === "low_value"
                        ? "값 낮추기 필요"
                        : "추격 필요"
                  }
                />
              </div>

              {leaderValue != null && myValue != null ? (
                <div className="mt-4">
                  <div className="mb-1.5 flex items-center justify-between text-[11px] text-ios-muted">
                    <span>내 기록</span>
                    <span>
                      선두 대비 {Math.round(
                        leaderboardBarWidth(
                          myValue,
                          leaderValue,
                          trailingValue,
                          detail.challengeType,
                          detail.metric,
                        )
                      )}%
                    </span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-ios-sep">
                    <div
                      className={cn("h-full rounded-full", theme.progress)}
                      style={{
                        width: `${leaderboardBarWidth(
                          myValue,
                          leaderValue,
                          trailingValue,
                          detail.challengeType,
                          detail.metric,
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              ) : null}

              {myEntry.snapshotAt ? (
                <p className="mt-4 text-right text-[11px] text-ios-muted">
                  마지막 갱신:{" "}
                  {new Date(myEntry.snapshotAt).toLocaleString("ko-KR", {
                    month: "numeric",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              ) : null}
            </div>
          ) : null}

          {isActive && !isParticipating ? (
            <div className={cn("rounded-[32px] bg-white px-5 py-6 shadow-apple", theme.heroSurface)}>
              <div className="flex items-start gap-3">
                <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-[18px]", theme.iconSurface)}>
                  <SocialTrophyIcon className="h-[20px] w-[20px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[16px] font-bold text-ios-text">지금 바로 레이스에 참가하세요</p>
                  <p className="mt-1 text-[12.5px] leading-5 text-ios-muted">
                    참가하면 최근 건강 기록 기준으로 바로 순위에 들어가요.
                  </p>
                </div>
              </div>
              {joinError ? (
                <p className="mt-3 text-[12.5px] text-red-600">{joinError}</p>
              ) : null}
              <button
                type="button"
                disabled={joining}
                onClick={() => void handleJoin()}
                className="mt-4 w-full rounded-[22px] bg-[color:var(--rnest-accent)] py-4 text-[15px] font-bold text-white transition active:opacity-80 disabled:opacity-40"
              >
                {joining ? "참가 중…" : "챌린지 참가하기"}
              </button>
            </div>
          ) : null}

          {detail.leaderboard.length > 0 ? (
            <div className="rounded-[32px] bg-white px-5 py-5 shadow-apple">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2">
                  <span className={cn("mt-0.5 flex h-9 w-9 items-center justify-center rounded-2xl", theme.iconSurface)}>
                    <SocialTrophyIcon className="h-[17px] w-[17px]" />
                  </span>
                  <div>
                    <p className="text-[14px] font-bold text-ios-text">리더보드</p>
                    <p className="mt-0.5 text-[11.5px] text-ios-muted">
                      {detail.challengeType === "streak"
                        ? "가장 긴 연속 달성 순서예요."
                        : detail.challengeType === "low_value"
                          ? "현재 기록이 낮은 순서로 정렬돼요."
                          : "현재 기록이 높은 순서로 정렬돼요."}
                    </p>
                  </div>
                </div>
                <div className="rounded-full bg-ios-bg px-3 py-1.5 text-[11px] font-semibold text-ios-muted">
                  {detail.participantCount}명 경쟁 중
                </div>
              </div>

              <div className="mt-4 space-y-2.5">
                {topThree[0] ? (
                  <PodiumCard
                    entry={topThree[0]}
                    metric={detail.metric}
                    challengeType={detail.challengeType}
                    currentUserId={currentUserId}
                    theme={theme}
                    prominent
                  />
                ) : null}
                {topThree.length > 1 ? (
                  <div className="grid grid-cols-2 gap-2.5">
                    {topThree.slice(1).map((entry) => (
                      <PodiumCard
                        key={entry.userId}
                        entry={entry}
                        metric={detail.metric}
                        challengeType={detail.challengeType}
                        currentUserId={currentUserId}
                        theme={theme}
                      />
                    ))}
                  </div>
                ) : null}
              </div>

              {chasingEntries.length > 0 ? (
                <div className="mt-5 border-t border-ios-sep pt-4">
                  <p className="mb-3 text-[12px] font-semibold text-ios-muted">추격 순위</p>
                  <div className="space-y-2">
                    {chasingEntries.map((entry) => (
                      <LeaderboardRow
                        key={entry.userId}
                        entry={entry}
                        metric={detail.metric}
                        challengeType={detail.challengeType}
                        leaderValue={leaderValue}
                        trailingValue={trailingValue}
                        currentUserId={currentUserId}
                        theme={theme}
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="mt-4 rounded-[22px] bg-ios-bg px-4 py-3">
                <p className="text-[11.5px] leading-5 text-ios-muted">
                  참가 정보와 최근 건강 기록을 기준으로 순위가 자동 갱신돼요.
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-[32px] bg-white px-5 py-8 text-center shadow-apple">
              <p className="text-[13px] text-ios-muted">아직 참가자가 없어요. 먼저 참가해 보세요!</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
