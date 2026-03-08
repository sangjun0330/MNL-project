/**
 * socialChallenges.ts
 * Group Challenge 서버 유틸리티 (Edge Runtime 호환)
 */

import type {
  ChallengeEntry,
  ChallengeLeaderboardEntry,
  ChallengeMetric,
  ChallengeStatus,
  ChallengeType,
  CreateChallengePayload,
  GroupChallengeDetail,
  GroupChallengeSummary,
} from "@/types/social";
import { computeMemberWeeklyVitals } from "@/lib/server/socialGroups";

// ── 상수 ──────────────────────────────────────────────────────
export const MAX_ACTIVE_CHALLENGES_PER_GROUP = 5;
export const MIN_CHALLENGE_DAYS = 3;
export const MAX_CHALLENGE_DAYS = 30;

// ── 텍스트 정제 ──────────────────────────────────────────────

export function cleanChallengeTitle(raw: string): string {
  return Array.from(raw.trim().replace(/\s+/g, " "))
    .slice(0, 40)
    .join("")
    .trim();
}

export function cleanChallengeDescription(raw: string): string {
  return Array.from(raw.trim().replace(/\s+/g, " "))
    .slice(0, 120)
    .join("")
    .trim();
}

// ── DB row 정규화 ─────────────────────────────────────────────

function normalizeStatus(value: unknown): ChallengeStatus {
  if (value === "ended" || value === "canceled") return value;
  return "active";
}

function normalizeMetric(value: unknown): ChallengeMetric {
  if (value === "sleep" || value === "mental") return value;
  return "battery";
}

function normalizeType(value: unknown): ChallengeType {
  if (value === "group_goal" || value === "streak") return value;
  return "leaderboard";
}

function calcDaysLeft(endsAt: string): number {
  const ms = new Date(endsAt).getTime() - Date.now();
  return Math.ceil(ms / 86_400_000);
}

function rowToSummary(
  row: any,
  participantCount: number,
  myEntry: ChallengeEntry | null
): GroupChallengeSummary {
  const endsAt = String(row.ends_at ?? "");
  return {
    id: Number(row.id),
    groupId: Number(row.group_id),
    title: String(row.title ?? ""),
    description: row.description ? String(row.description) : null,
    metric: normalizeMetric(row.metric),
    challengeType: normalizeType(row.challenge_type),
    targetValue: row.target_value != null ? Number(row.target_value) : null,
    targetDays: row.target_days != null ? Number(row.target_days) : null,
    status: normalizeStatus(row.status),
    startsAt: String(row.starts_at ?? ""),
    endsAt,
    createdBy: String(row.created_by ?? ""),
    createdAt: String(row.created_at ?? ""),
    participantCount,
    myEntry,
    daysLeft: calcDaysLeft(endsAt),
  };
}

function rowToEntry(row: any): ChallengeEntry {
  return {
    challengeId: Number(row.challenge_id),
    userId: String(row.user_id ?? ""),
    joinedAt: String(row.joined_at ?? ""),
    snapshotValue: row.snapshot_value != null ? Number(row.snapshot_value) : null,
    streakDays: row.streak_days != null ? Number(row.streak_days) : null,
    snapshotAt: row.snapshot_at ? String(row.snapshot_at) : null,
    isCompleted: Boolean(row.is_completed),
    completedAt: row.completed_at ? String(row.completed_at) : null,
  };
}

function metricSnapshotValue(metric: ChallengeMetric, vitals: ReturnType<typeof computeMemberWeeklyVitals>): number | null {
  if (!vitals) return null;
  if (metric === "sleep") return vitals.weeklyAvgSleep ?? null;
  if (metric === "mental") return vitals.weeklyAvgMental;
  return vitals.weeklyAvgBattery;
}

function sameIsoDate(snapshotAt: unknown, todayISO: string): boolean {
  return typeof snapshotAt === "string" && snapshotAt.slice(0, 10) === todayISO;
}

async function loadChallengeVitalsMap(
  admin: any,
  userIds: string[],
  todayISO: string,
): Promise<Map<string, ReturnType<typeof computeMemberWeeklyVitals>>> {
  const vitalsMap = new Map<string, ReturnType<typeof computeMemberWeeklyVitals>>();
  if (userIds.length === 0) return vitalsMap;

  const { data: states, error } = await (admin as any)
    .from("rnest_user_state")
    .select("user_id, payload")
    .in("user_id", userIds);

  if (error) throw error;

  for (const userId of userIds) {
    vitalsMap.set(userId, null);
  }

  for (const row of states ?? []) {
    const userId = String(row.user_id ?? "");
    if (!userId) continue;
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    vitalsMap.set(userId, computeMemberWeeklyVitals(payload, todayISO));
  }

  return vitalsMap;
}

function buildEntrySyncUpdate(input: {
  challenge: any;
  entry: any;
  vitals: ReturnType<typeof computeMemberWeeklyVitals>;
  nowIso: string;
  todayISO: string;
}) {
  const metric = normalizeMetric(input.challenge.metric);
  const challengeType = normalizeType(input.challenge.challenge_type);
  const snapshotValue = metricSnapshotValue(metric, input.vitals);
  const prevStreak = Number(input.entry.streak_days ?? 0);
  const alreadySyncedToday = sameIsoDate(input.entry.snapshot_at, input.todayISO);
  const targetValue =
    input.challenge.target_value != null ? Number(input.challenge.target_value) : 0;
  const targetDays =
    input.challenge.target_days != null ? Number(input.challenge.target_days) : 7;
  const wasCompleted = Boolean(input.entry.is_completed);

  let streakDays: number | null = null;
  let isCompleted = wasCompleted;
  let completedAt = input.entry.completed_at ? String(input.entry.completed_at) : null;

  if (challengeType === "streak") {
    if (snapshotValue == null) {
      streakDays = prevStreak;
    } else if (snapshotValue >= targetValue) {
      streakDays = alreadySyncedToday ? prevStreak : prevStreak + 1;
    } else {
      streakDays = 0;
    }

    if (!wasCompleted && (streakDays ?? 0) >= targetDays) {
      isCompleted = true;
      completedAt = input.nowIso;
    }
  }

  return {
    snapshot_value: snapshotValue,
    streak_days: streakDays,
    snapshot_at: input.nowIso,
    is_completed: isCompleted,
    completed_at: completedAt,
  };
}

async function syncChallengeRows(admin: any, challengeRows: any[]): Promise<void> {
  if (challengeRows.length === 0) return;

  const now = new Date();
  const nowIso = now.toISOString();
  const todayISO = nowIso.slice(0, 10);

  const expiredIds = challengeRows
    .filter((row) => normalizeStatus(row.status) === "active" && String(row.ends_at ?? "") < nowIso)
    .map((row) => Number(row.id));

  if (expiredIds.length > 0) {
    await (admin as any)
      .from("rnest_social_group_challenges")
      .update({ status: "ended", ended_at: nowIso })
      .in("id", expiredIds);
  }

  const activeRows = challengeRows.filter(
    (row) => normalizeStatus(row.status) === "active" && !expiredIds.includes(Number(row.id))
  );
  if (activeRows.length === 0) return;

  for (const challenge of activeRows) {
    const challengeId = Number(challenge.id);
    const { data: entries, error: entriesError } = await (admin as any)
      .from("rnest_social_challenge_entries")
      .select("id, user_id, streak_days, snapshot_value, snapshot_at, is_completed, completed_at")
      .eq("challenge_id", challengeId);

    if (entriesError) throw entriesError;
    if (!entries || entries.length === 0) continue;

    const userIds = entries.map((entry: any) => String(entry.user_id ?? ""));
    const vitalsMap = await loadChallengeVitalsMap(admin, userIds, todayISO);

    await Promise.all(
      entries.map(async (entry: any) => {
        const nextUpdate = buildEntrySyncUpdate({
          challenge,
          entry,
          vitals: vitalsMap.get(String(entry.user_id ?? "")) ?? null,
          nowIso,
          todayISO,
        });

        const prevSnapshotValue =
          entry.snapshot_value != null ? Number(entry.snapshot_value) : null;
        const prevStreakDays =
          entry.streak_days != null ? Number(entry.streak_days) : null;
        const prevCompletedAt =
          entry.completed_at != null ? String(entry.completed_at) : null;
        const shouldPersist =
          prevSnapshotValue !== nextUpdate.snapshot_value ||
          prevStreakDays !== nextUpdate.streak_days ||
          Boolean(entry.is_completed) !== nextUpdate.is_completed ||
          prevCompletedAt !== nextUpdate.completed_at ||
          !sameIsoDate(entry.snapshot_at, todayISO);

        if (!shouldPersist) return;

        await (admin as any)
          .from("rnest_social_challenge_entries")
          .update(nextUpdate)
          .eq("id", Number(entry.id));
      })
    );
  }
}

// ── 목록 로드 ────────────────────────────────────────────────

export async function listGroupChallenges(
  admin: any,
  groupId: number,
  userId: string
): Promise<GroupChallengeSummary[]> {
  // 챌린지 목록 (active 먼저 → 종료 최신순)
  const { data: challenges, error } = await (admin as any)
    .from("rnest_social_group_challenges")
    .select("*")
    .eq("group_id", groupId)
    .in("status", ["active", "ended"])
    .order("status", { ascending: true })       // active < ended (알파벳 순)
    .order("ends_at", { ascending: false })
    .limit(20);

  if (error) throw error;
  if (!challenges || challenges.length === 0) return [];

  await syncChallengeRows(admin, challenges);

  const { data: refreshedChallenges, error: refreshError } = await (admin as any)
    .from("rnest_social_group_challenges")
    .select("*")
    .eq("group_id", groupId)
    .in("status", ["active", "ended"])
    .order("status", { ascending: true })
    .order("ends_at", { ascending: false })
    .limit(20);

  if (refreshError) throw refreshError;
  const challengeRows = refreshedChallenges ?? challenges;

  const challengeIds: number[] = challengeRows.map((c: any) => Number(c.id));

  // 참가자 수 집계
  const { data: countRows } = await (admin as any)
    .from("rnest_social_challenge_entries")
    .select("challenge_id")
    .in("challenge_id", challengeIds);

  const countMap = new Map<number, number>();
  for (const r of countRows ?? []) {
    const cid = Number(r.challenge_id);
    countMap.set(cid, (countMap.get(cid) ?? 0) + 1);
  }

  // 내 엔트리 조회
  const { data: myEntryRows } = await (admin as any)
    .from("rnest_social_challenge_entries")
    .select("*")
    .eq("user_id", userId)
    .in("challenge_id", challengeIds);

  const myEntryMap = new Map<number, ChallengeEntry>();
  for (const r of myEntryRows ?? []) {
    myEntryMap.set(Number(r.challenge_id), rowToEntry(r));
  }

  return challengeRows.map((row: any) => {
    const cid = Number(row.id);
    return rowToSummary(row, countMap.get(cid) ?? 0, myEntryMap.get(cid) ?? null);
  });
}

// ── 단일 챌린지 상세 ─────────────────────────────────────────

export async function getGroupChallengeDetail(
  admin: any,
  challengeId: number,
  userId: string
): Promise<GroupChallengeDetail | null> {
  const { data: row, error } = await (admin as any)
    .from("rnest_social_group_challenges")
    .select("*")
    .eq("id", challengeId)
    .maybeSingle();

  if (error) throw error;
  if (!row) return null;

  await syncChallengeRows(admin, [row]);

  const { data: refreshedRow, error: refreshError } = await (admin as any)
    .from("rnest_social_group_challenges")
    .select("*")
    .eq("id", challengeId)
    .maybeSingle();

  if (refreshError) throw refreshError;
  const challengeRow = refreshedRow ?? row;

  // 참가자 엔트리 목록
  const { data: entryRows } = await (admin as any)
    .from("rnest_social_challenge_entries")
    .select("*")
    .eq("challenge_id", challengeId)
    .order("snapshot_value", { ascending: false, nullsFirst: false });

  const entries: ChallengeEntry[] = (entryRows ?? []).map(rowToEntry);

  // 사용자 프로필 맵
  const userIds = entries.map((e) => e.userId);
  const profileMap = new Map<string, { nickname: string; avatarEmoji: string }>();

  if (userIds.length > 0) {
    const { data: profiles } = await (admin as any)
      .from("rnest_social_profiles")
      .select("user_id, nickname, avatar_emoji")
      .in("user_id", userIds);

    for (const p of profiles ?? []) {
      profileMap.set(String(p.user_id), {
        nickname: String(p.nickname ?? ""),
        avatarEmoji: String(p.avatar_emoji ?? "🐧"),
      });
    }
  }

  // 리더보드 (streak는 streak_days 기준 정렬)
  const challengeType = normalizeType(challengeRow.challenge_type);
  let sortedEntries = [...entries];
  if (challengeType === "streak") {
    sortedEntries = sortedEntries.sort(
      (a, b) => (b.streakDays ?? 0) - (a.streakDays ?? 0)
    );
  } else {
    sortedEntries = sortedEntries.sort(
      (a, b) => (b.snapshotValue ?? Number.NEGATIVE_INFINITY) - (a.snapshotValue ?? Number.NEGATIVE_INFINITY)
    );
  }

  const leaderboard: ChallengeLeaderboardEntry[] = sortedEntries.map((entry, i) => {
    const profile = profileMap.get(entry.userId);
    return {
      ...entry,
      rank: i + 1,
      nickname: profile?.nickname ?? "알 수 없음",
      avatarEmoji: profile?.avatarEmoji ?? "🐧",
    };
  });

  // group_goal: 현재 평균 및 달성 여부 계산
  let groupCurrentAvg: number | null = null;
  let groupGoalMet: boolean | null = null;
  if (challengeType === "group_goal") {
    const withValues = entries.filter((e) => e.snapshotValue !== null);
    if (withValues.length > 0) {
      const sum = withValues.reduce((acc, e) => acc + (e.snapshotValue ?? 0), 0);
      groupCurrentAvg = Math.round((sum / withValues.length) * 10) / 10;
      const targetValue = challengeRow.target_value != null ? Number(challengeRow.target_value) : null;
      groupGoalMet = targetValue !== null ? groupCurrentAvg >= targetValue : null;
    }
  }

  const myEntry = entries.find((e) => e.userId === userId) ?? null;
  const endsAt = String(challengeRow.ends_at ?? "");

  return {
    id: Number(challengeRow.id),
    groupId: Number(challengeRow.group_id),
    title: String(challengeRow.title ?? ""),
    description: challengeRow.description ? String(challengeRow.description) : null,
    metric: normalizeMetric(challengeRow.metric),
    challengeType,
    targetValue: challengeRow.target_value != null ? Number(challengeRow.target_value) : null,
    targetDays: challengeRow.target_days != null ? Number(challengeRow.target_days) : null,
    status: normalizeStatus(challengeRow.status),
    startsAt: String(challengeRow.starts_at ?? ""),
    endsAt,
    createdBy: String(challengeRow.created_by ?? ""),
    createdAt: String(challengeRow.created_at ?? ""),
    participantCount: entries.length,
    myEntry,
    daysLeft: calcDaysLeft(endsAt),
    leaderboard,
    groupCurrentAvg,
    groupGoalMet,
  };
}

// ── 생성 ─────────────────────────────────────────────────────

export async function createGroupChallenge(
  admin: any,
  groupId: number,
  userId: string,
  payload: CreateChallengePayload
): Promise<GroupChallengeSummary> {
  const title = cleanChallengeTitle(payload.title);
  if (!title) throw new Error("challenge_title_required");

  const durationDays = Math.min(MAX_CHALLENGE_DAYS, Math.max(MIN_CHALLENGE_DAYS, payload.durationDays ?? 7));
  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + durationDays * 86_400_000);

  // 동시 active 챌린지 개수 제한
  const { count } = await (admin as any)
    .from("rnest_social_group_challenges")
    .select("id", { count: "exact", head: true })
    .eq("group_id", groupId)
    .eq("status", "active");

  if ((count ?? 0) >= MAX_ACTIVE_CHALLENGES_PER_GROUP) {
    throw new Error("too_many_active_challenges");
  }

  const { data: inserted, error } = await (admin as any)
    .from("rnest_social_group_challenges")
    .insert({
      group_id:       groupId,
      created_by:     userId,
      title,
      description:    payload.description ? cleanChallengeDescription(payload.description) : null,
      metric:         payload.metric ?? "battery",
      challenge_type: payload.challengeType ?? "leaderboard",
      target_value:   payload.targetValue ?? null,
      target_days:    payload.targetDays ?? null,
      status:         "active",
      starts_at:      startsAt.toISOString(),
      ends_at:        endsAt.toISOString(),
    })
    .select("*")
    .single();

  if (error) throw error;

  return rowToSummary(inserted, 0, null);
}

// ── 참가 ─────────────────────────────────────────────────────

export async function joinChallenge(
  admin: any,
  challengeId: number,
  userId: string
): Promise<ChallengeEntry> {
  const { data: existing } = await (admin as any)
    .from("rnest_social_challenge_entries")
    .select("*")
    .eq("challenge_id", challengeId)
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) {
    const { data: challenge } = await (admin as any)
      .from("rnest_social_group_challenges")
      .select("id, status, ends_at, metric, challenge_type, target_value, target_days")
      .eq("id", challengeId)
      .maybeSingle();
    if (challenge) {
      await syncChallengeRows(admin, [challenge]);
      const { data: refreshed } = await (admin as any)
        .from("rnest_social_challenge_entries")
        .select("*")
        .eq("challenge_id", challengeId)
        .eq("user_id", userId)
        .maybeSingle();
      if (refreshed) return rowToEntry(refreshed);
    }
    return rowToEntry(existing);
  }

  const { data: inserted, error } = await (admin as any)
    .from("rnest_social_challenge_entries")
    .insert({ challenge_id: challengeId, user_id: userId })
    .select("*")
    .single();

  if (error) throw error;
  const { data: challenge } = await (admin as any)
    .from("rnest_social_group_challenges")
    .select("id, status, ends_at, metric, challenge_type, target_value, target_days")
    .eq("id", challengeId)
    .maybeSingle();

  if (challenge) {
    await syncChallengeRows(admin, [challenge]);
    const { data: refreshed } = await (admin as any)
      .from("rnest_social_challenge_entries")
      .select("*")
      .eq("challenge_id", challengeId)
      .eq("user_id", userId)
      .maybeSingle();
    if (refreshed) return rowToEntry(refreshed);
  }

  return rowToEntry(inserted);
}

// ── 취소 ─────────────────────────────────────────────────────

export async function cancelChallenge(
  admin: any,
  challengeId: number,
  userId: string,
  isManager: boolean
): Promise<void> {
  const { data: challenge, error: fetchErr } = await (admin as any)
    .from("rnest_social_group_challenges")
    .select("id, created_by, status")
    .eq("id", challengeId)
    .maybeSingle();

  if (fetchErr) throw fetchErr;
  if (!challenge) throw new Error("challenge_not_found");
  if (challenge.status !== "active") throw new Error("challenge_already_ended");
  if (!isManager && String(challenge.created_by) !== userId) {
    throw new Error("challenge_cancel_forbidden");
  }

  const { error } = await (admin as any)
    .from("rnest_social_group_challenges")
    .update({ status: "canceled", ended_at: new Date().toISOString() })
    .eq("id", challengeId);

  if (error) throw error;
}

// ── 진행상황 동기화 (cron job용) ──────────────────────────────

export type SyncResult = {
  processedCount: number;
  endedCount: number;
  errorCount: number;
};

/**
 * active 챌린지들의 snapshot_value / streak_days를 최신 vitals로 갱신.
 * ends_at이 지난 챌린지는 status = 'ended' 처리.
 */
export async function syncAllActiveChallenges(admin: any): Promise<SyncResult> {
  const result: SyncResult = { processedCount: 0, endedCount: 0, errorCount: 0 };

  const now = new Date().toISOString();
  const { data: toEnd } = await (admin as any)
    .from("rnest_social_group_challenges")
    .select("id")
    .eq("status", "active")
    .lt("ends_at", now);

  if (toEnd && toEnd.length > 0) {
    const ids = toEnd.map((r: any) => Number(r.id));
    await (admin as any)
      .from("rnest_social_group_challenges")
      .update({ status: "ended", ended_at: now })
      .in("id", ids);
    result.endedCount = ids.length;
  }

  // 2. 여전히 active인 챌린지 목록
  const { data: activeChallenges } = await (admin as any)
    .from("rnest_social_group_challenges")
    .select("id, status, ends_at, metric, challenge_type, target_value, target_days")
    .eq("status", "active")
    .gte("ends_at", now)
    .limit(100);

  if (!activeChallenges || activeChallenges.length === 0) return result;

  try {
    await syncChallengeRows(admin, activeChallenges);
    result.processedCount = activeChallenges.length;
  } catch {
    result.errorCount = activeChallenges.length;
  }

  return result;
}
