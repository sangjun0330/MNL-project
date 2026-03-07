"use client";

import { useMemo, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import {
  SocialAlertIcon,
  SocialBatteryIcon,
  SocialChartIcon,
  SocialHourglassIcon,
  SocialInfoIcon,
  SocialMoonIcon,
  SocialWarningIcon,
} from "@/components/social/SocialIcons";
import type { MemberWeeklyVitals, SocialGroupBoardMember } from "@/types/social";

type Props = {
  members: SocialGroupBoardMember[];
  currentUserId: string | null;
};

// Body Battery 색상 (기존 vitals.ts toneFromScore 기준과 동일)
function batteryColor(value: number): string {
  if (value >= 60) return "bg-green-400";
  if (value >= 40) return "bg-amber-400";
  return "bg-red-400";
}

function sleepColor(hours: number): string {
  if (hours >= 7) return "bg-blue-400";
  if (hours >= 6) return "bg-sky-400";
  if (hours >= 5) return "bg-amber-400";
  return "bg-red-400";
}

function BatteryBar({
  value,
  maxValue,
  colorFn,
}: {
  value: number;
  maxValue: number;
  colorFn: (v: number) => string;
}) {
  const pct = Math.max(0, Math.min(100, (value / maxValue) * 100));
  return (
    <div className="flex-1 h-1.5 bg-ios-sep rounded-full overflow-hidden">
      <div
        className={cn("h-full rounded-full", colorFn(value))}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  const tone =
    rank === 1
      ? "border-[#F1D37A] bg-[#FFF7DB] text-[#9E6A00]"
      : rank === 2
        ? "border-[#D7DCE5] bg-[#F7F9FC] text-[#586377]"
        : rank === 3
          ? "border-[#E6C7B3] bg-[#FFF1E8] text-[#9A5B37]"
          : "border-ios-sep bg-ios-bg text-ios-muted";

  return (
    <span
      className={cn(
        "inline-flex h-7 min-w-7 items-center justify-center rounded-full border px-2 text-[11px] font-bold tabular-nums",
        tone
      )}
    >
      {rank}
    </span>
  );
}

type RankingRowProps = {
  rank: number;
  member: SocialGroupBoardMember;
  metricValue: number;
  maxValue: number;
  metricLabel: string;
  colorFn: (v: number) => string;
  isCurrentUser: boolean;
};

function RankingRow({
  rank,
  member,
  metricValue,
  maxValue,
  metricLabel,
  colorFn,
  isCurrentUser,
}: RankingRowProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-2xl",
        isCurrentUser && "bg-[color:var(--rnest-accent-soft)]"
      )}
    >
      {/* 순위 */}
      <div className="w-8 shrink-0 text-center">
        <RankBadge rank={rank} />
      </div>

      {/* 아바타 */}
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-ios-bg text-[15px]">
        {member.avatarEmoji}
      </div>

      {/* 이름 + 바 + 수치 */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 mb-1">
          <p className="truncate text-[13px] font-semibold text-ios-text leading-tight">
            {member.nickname || "이름 없음"}
          </p>
          {isCurrentUser && (
            <span className="shrink-0 rounded-full bg-[color:var(--rnest-accent-soft)] px-1.5 py-0.5 text-[10px] font-semibold text-[color:var(--rnest-accent)]">
              나
            </span>
          )}
          <span className="ml-auto shrink-0 text-[13px] font-bold text-ios-text tabular-nums">
            {metricLabel}
          </span>
        </div>
        <div className="mb-1.5 flex items-center gap-1.5 text-[10.5px] text-ios-muted">
          <span>최근 {member.vitals?.daysCounted ?? 0}일 반영</span>
        </div>
        <BatteryBar value={metricValue} maxValue={maxValue} colorFn={colorFn} />
      </div>
    </div>
  );
}

type SectionProps = {
  title: ReactNode;
  children: ReactNode;
};

function RankingSection({ title, children }: SectionProps) {
  return (
    <div className="rounded-[30px] border border-ios-sep/70 bg-white px-4 py-4 shadow-apple">
      <p className="mb-2.5 flex items-center gap-1.5 text-[13px] font-semibold text-ios-text">{title}</p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function RankingRulePill({
  icon,
  text,
}: {
  icon: ReactNode;
  text: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-ios-bg px-2.5 py-1 text-[11px] font-medium text-ios-muted">
      {icon}
      {text}
    </span>
  );
}

export function SocialGroupRankingTab({ members, currentUserId }: Props) {
  // 공유 ON + vitals 있는 멤버
  const withVitals = useMemo(
    () =>
      members.filter(
        (m): m is SocialGroupBoardMember & { vitals: MemberWeeklyVitals } =>
          m.healthVisibility === "full" && m.vitals !== null
      ),
    [members]
  );

  // 공유 ON이지만 데이터 3일 미만
  const withInsufficientData = useMemo(
    () => members.filter((m) => m.healthVisibility === "full" && m.vitals === null),
    [members]
  );

  // 비공개 멤버 수
  const hiddenCount = useMemo(
    () => members.filter((m) => m.healthVisibility === "hidden").length,
    [members]
  );

  // Body Battery 순위 (내림차순)
  const batteryRanked = useMemo(
    () =>
      [...withVitals].sort(
        (a, b) => b.vitals.weeklyAvgBattery - a.vitals.weeklyAvgBattery
      ),
    [withVitals]
  );

  // 수면 시간 순위 (수면 데이터 있는 멤버만, 내림차순)
  const sleepRanked = useMemo(
    () =>
      withVitals
        .filter((m) => m.vitals.weeklyAvgSleep !== null)
        .sort((a, b) => (b.vitals.weeklyAvgSleep ?? 0) - (a.vitals.weeklyAvgSleep ?? 0)),
    [withVitals]
  );

  // 번아웃 위험/경고 멤버
  const burnoutDanger = useMemo(
    () => withVitals.filter((m) => m.vitals.burnoutLevel === "danger"),
    [withVitals]
  );
  const burnoutWarning = useMemo(
    () => withVitals.filter((m) => m.vitals.burnoutLevel === "warning"),
    [withVitals]
  );

  const totalCount = members.length;
  const participatingCount = withVitals.length;

  // 공유 참여자가 아무도 없을 때
  if (participatingCount === 0 && withInsufficientData.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
        <div className="text-ios-muted/40">
          <SocialChartIcon className="h-11 w-11" />
        </div>
        <p className="text-[14px] font-semibold text-ios-text">
          아직 공유된 건강 데이터가 없어요
        </p>
        <p className="text-[12.5px] leading-5 text-ios-muted">
          내 소셜 프로필 → 프라이버시에서
          <br />
          &apos;건강 데이터 그룹 공유&apos;를 켜면 랭킹에 참여해요.
        </p>
        {hiddenCount > 0 && (
          <p className="text-[11.5px] text-ios-muted mt-1">
            현재 {hiddenCount}명 비공개 중
          </p>
        )}
      </div>
    );
  }

  // 참여는 했지만 전원 데이터 부족
  if (participatingCount === 0 && withInsufficientData.length > 0) {
    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
          <div className="text-ios-muted/40">
            <SocialHourglassIcon className="h-11 w-11" />
          </div>
          <p className="text-[14px] font-semibold text-ios-text">
            데이터를 모으는 중이에요
          </p>
          <p className="text-[12.5px] leading-5 text-ios-muted">
            건강 데이터를 3일 이상 입력하면 랭킹에 표시됩니다.
          </p>
        </div>
        <div className="rounded-3xl bg-white px-4 py-3 shadow-apple">
          <p className="text-[12px] font-semibold text-ios-muted mb-2">데이터 수집 중</p>
          <div className="flex flex-wrap gap-2">
            {withInsufficientData.map((m) => (
              <div key={m.userId} className="flex items-center gap-1 text-[12px] text-ios-muted">
                <span>{m.avatarEmoji}</span>
                <span>{m.nickname}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 헤더: 기간 + 참여 인원 */}
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-semibold text-ios-text">
          지난 7일 기준
        </p>
        <p className="text-[12px] text-ios-muted tabular-nums">
          {participatingCount}/{totalCount}명 참여
        </p>
      </div>

      <div className="rounded-[30px] border border-ios-sep/70 bg-white px-4 py-4 shadow-apple">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-[color:var(--rnest-accent-soft)] text-[color:var(--rnest-accent)]">
            <SocialInfoIcon className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0">
            <p className="text-[13.5px] font-semibold text-ios-text">현재 랭킹 카테고리</p>
            <p className="mt-1 text-[12px] leading-5 text-ios-muted">
              신체 배터리와 수면 시간을 지난 7일 기준으로 집계해요. 건강 데이터 그룹 공유가 켜져 있고,
              실제 건강 기록이 3일 이상 있는 멤버만 순위에 반영됩니다.
            </p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-ios-bg px-3 py-3">
            <p className="flex items-center gap-1.5 text-[12px] font-semibold text-ios-text">
              <SocialBatteryIcon className="h-[14px] w-[14px]" />
              신체 배터리
            </p>
            <p className="mt-1 text-[11px] leading-5 text-ios-muted">최근 7일 Body Battery 평균</p>
          </div>
          <div className="rounded-2xl bg-ios-bg px-3 py-3">
            <p className="flex items-center gap-1.5 text-[12px] font-semibold text-ios-text">
              <SocialMoonIcon className="h-[14px] w-[14px]" />
              수면 시간
            </p>
            <p className="mt-1 text-[11px] leading-5 text-ios-muted">수면을 입력한 날만 평균에 반영</p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <RankingRulePill
            icon={<SocialChartIcon className="h-[13px] w-[13px]" />}
            text="지난 7일 기준"
          />
          <RankingRulePill
            icon={<SocialHourglassIcon className="h-[13px] w-[13px]" />}
            text="최소 3일 데이터"
          />
          <RankingRulePill
            icon={<SocialInfoIcon className="h-[13px] w-[13px]" />}
            text="비공개 멤버 제외"
          />
        </div>
      </div>

      {/* 번아웃 알림 (위험/경고 멤버 있을 때만) */}
      {burnoutDanger.length > 0 && (
        <div className="rounded-2xl bg-red-50 px-4 py-3">
          <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-red-700">
            <SocialAlertIcon className="h-[13px] w-[13px] shrink-0 text-red-500" />
            회복 위험{" "}
            <span className="font-normal">
              · {burnoutDanger.map((m) => m.nickname).join(", ")}
            </span>
          </p>
        </div>
      )}
      {burnoutWarning.length > 0 && (
        <div className="rounded-2xl bg-amber-50 px-4 py-3">
          <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-amber-700">
            <SocialWarningIcon className="h-[13px] w-[13px] shrink-0 text-amber-500" />
            피로 누적 주의{" "}
            <span className="font-normal">
              · {burnoutWarning.map((m) => m.nickname).join(", ")}
            </span>
          </p>
        </div>
      )}

      {/* Body Battery 랭킹 */}
      {batteryRanked.length > 0 && (
        <RankingSection title={<><SocialBatteryIcon className="h-[14px] w-[14px]" /> 신체 배터리 랭킹</>}>
          {batteryRanked.map((member, i) => (
            <RankingRow
              key={member.userId}
              rank={i + 1}
              member={member}
              metricValue={member.vitals.weeklyAvgBattery}
              maxValue={100}
              metricLabel={String(Math.round(member.vitals.weeklyAvgBattery))}
              colorFn={batteryColor}
              isCurrentUser={member.userId === currentUserId}
            />
          ))}
        </RankingSection>
      )}

      {/* 수면 시간 랭킹 */}
      {sleepRanked.length > 0 && (
        <RankingSection title={<><SocialMoonIcon className="h-[14px] w-[14px]" /> 수면 시간 랭킹</>}>
          {sleepRanked.map((member, i) => (
            <RankingRow
              key={member.userId}
              rank={i + 1}
              member={member}
              metricValue={member.vitals.weeklyAvgSleep ?? 0}
              maxValue={9}
              metricLabel={`${member.vitals.weeklyAvgSleep?.toFixed(1)}h`}
              colorFn={sleepColor}
              isCurrentUser={member.userId === currentUserId}
            />
          ))}
        </RankingSection>
      )}

      {/* 데이터 부족 멤버 */}
      {withInsufficientData.length > 0 && (
        <div className="rounded-3xl bg-white px-4 py-3 shadow-apple">
          <p className="text-[12px] font-semibold text-ios-muted mb-2">
            데이터 수집 중 (3일 미만)
          </p>
          <div className="flex flex-wrap gap-2">
            {withInsufficientData.map((m) => (
              <div
                key={m.userId}
                className="flex items-center gap-1 text-[12px] text-ios-muted"
              >
                <span>{m.avatarEmoji}</span>
                <span>{m.nickname}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 비공개 멤버 안내 */}
      {hiddenCount > 0 && (
        <p className="text-center text-[11.5px] text-ios-muted px-4 leading-5">
          {hiddenCount}명이 건강 데이터를 비공개로 설정했어요.
        </p>
      )}
    </div>
  );
}
