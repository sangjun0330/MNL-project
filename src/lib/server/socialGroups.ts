import type {
  MemberWeeklyVitals,
  SocialEventType,
  SocialGroupActivity,
  SocialGroupActivityType,
  SocialGroupJoinMode,
  SocialGroupJoinRequest,
  SocialGroupNoticePost,
  SocialGroupPermissions,
  SocialGroupPreviewMember,
  SocialGroupRole,
  SocialGroupSummary,
} from "@/types/social";
import { computeVitalsRange } from "@/lib/vitals";

export const DEFAULT_GROUP_MAX_MEMBERS = 12;
export const DEFAULT_GROUP_JOIN_MODE: SocialGroupJoinMode = "open";

const GROUP_SELECT_EXTENDED =
  "id, owner_user_id, name, description, notice, invite_version, max_members, join_mode, allow_member_invites, created_at, updated_at";
const GROUP_SELECT_LEGACY =
  "id, owner_user_id, name, description, invite_version, max_members, created_at, updated_at";

export type SocialGroupRow = {
  id: number;
  ownerUserId: string;
  name: string;
  description: string;
  notice: string;
  inviteVersion: number;
  maxMembers: number;
  joinMode: SocialGroupJoinMode;
  allowMemberInvites: boolean;
  createdAt: string;
  updatedAt: string;
};

function isMissingSchemaFeatureError(error: any): boolean {
  const message = String(error?.message ?? error ?? "").toLowerCase();
  const details = String(error?.details ?? "").toLowerCase();
  const hint = String(error?.hint ?? "").toLowerCase();
  const code = String(error?.code ?? "").toLowerCase();
  return (
    code === "42p01" ||
    code === "42703" ||
    message.includes("does not exist") ||
    message.includes("column") ||
    message.includes("relation") ||
    details.includes("column") ||
    hint.includes("column") ||
    message.includes("could not find the") ||
    message.includes("schema cache")
  );
}

export function parseSocialGroupId(raw: string): number | null {
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function normalizeSocialGroupRole(value: unknown): SocialGroupRole {
  return value === "owner" || value === "admin" ? value : "member";
}

export function isSocialGroupManager(role: SocialGroupRole | string | null | undefined): boolean {
  return role === "owner" || role === "admin";
}

export function listSocialGroupRecipientIds(
  memberRows: Array<{ user_id?: unknown; role?: unknown }>,
  input?: {
    excludeUserIds?: string[];
    managersOnly?: boolean;
  }
): string[] {
  const exclude = new Set((input?.excludeUserIds ?? []).filter(Boolean));
  const ids = new Set<string>();

  for (const row of memberRows ?? []) {
    const userId = String(row?.user_id ?? "").trim();
    if (!userId || exclude.has(userId)) continue;
    if (input?.managersOnly && !isSocialGroupManager(normalizeSocialGroupRole(row?.role))) continue;
    ids.add(userId);
  }

  return Array.from(ids);
}

export function buildSocialGroupPermissions(
  role: SocialGroupRole,
  allowMemberInvites: boolean
): SocialGroupPermissions {
  const isOwner = role === "owner";
  const isAdmin = role === "admin";
  const isManager = isOwner || isAdmin;

  return {
    canCreateInvite: isManager || allowMemberInvites,
    canEditBasicInfo: isManager,
    canEditNotice: isManager,
    canChangeInvitePolicy: isOwner,
    canManageJoinRequests: isManager,
    canManageMembers: isManager,
    canPromoteMembers: isOwner,
    canTransferOwner: isOwner,
    canRemoveMembers: isManager,
    canDeleteGroup: isOwner,
  };
}

function normalizeGroupRow(row: any): SocialGroupRow {
  return {
    id: Number(row?.id ?? 0),
    ownerUserId: String(row?.owner_user_id ?? ""),
    name: String(row?.name ?? ""),
    description: String(row?.description ?? ""),
    notice: String(row?.notice ?? ""),
    inviteVersion: Number(row?.invite_version ?? 1),
    maxMembers: Number(row?.max_members ?? DEFAULT_GROUP_MAX_MEMBERS),
    joinMode: row?.join_mode === "approval" ? "approval" : DEFAULT_GROUP_JOIN_MODE,
    allowMemberInvites: row?.allow_member_invites !== false,
    createdAt: String(row?.created_at ?? new Date().toISOString()),
    updatedAt: String(row?.updated_at ?? row?.created_at ?? new Date().toISOString()),
  };
}

async function runGroupSelect<T>(
  run: (selectColumns: string) => Promise<{ data: T | null; error: any }>
): Promise<{ data: T | null; legacy: boolean }> {
  const extended = await run(GROUP_SELECT_EXTENDED);
  if (!extended.error) return { data: extended.data, legacy: false };
  if (!isMissingSchemaFeatureError(extended.error)) throw extended.error;

  const legacy = await run(GROUP_SELECT_LEGACY);
  if (legacy.error) throw legacy.error;
  return { data: legacy.data, legacy: true };
}

export async function getSocialGroupById(admin: any, groupId: number): Promise<SocialGroupRow | null> {
  const { data } = await runGroupSelect((selectColumns) =>
    (admin as any)
      .from("rnest_social_groups")
      .select(selectColumns)
      .eq("id", groupId)
      .maybeSingle()
  );
  return data ? normalizeGroupRow(data) : null;
}

export async function getSocialGroupsByIds(admin: any, groupIds: number[]): Promise<SocialGroupRow[]> {
  if (groupIds.length === 0) return [];
  const { data } = await runGroupSelect((selectColumns) =>
    (admin as any)
      .from("rnest_social_groups")
      .select(selectColumns)
      .in("id", groupIds)
      .order("updated_at", { ascending: false })
  );
  return Array.isArray(data) ? data.map(normalizeGroupRow) : [];
}

export function mapSocialGroupSummary(input: {
  group: SocialGroupRow;
  membership: { role?: string | null; joined_at?: string | null } | null | undefined;
  memberCount: number;
  memberPreview: SocialGroupPreviewMember[];
  latestNotice?: {
    title: string;
    preview: string;
    createdAt: string;
  } | null;
  pendingJoinRequestCount?: number;
}): SocialGroupSummary {
  return {
    id: input.group.id,
    name: input.group.name,
    description: input.group.description,
    role: normalizeSocialGroupRole(input.membership?.role),
    ownerUserId: input.group.ownerUserId,
    memberCount: input.memberCount,
    joinedAt: String(input.membership?.joined_at ?? input.group.createdAt),
    memberPreview: input.memberPreview,
    notice: input.group.notice,
    latestNoticeTitle: input.latestNotice?.title ?? null,
    latestNoticePreview: input.latestNotice?.preview ?? null,
    latestNoticeCreatedAt: input.latestNotice?.createdAt ?? null,
    joinMode: input.group.joinMode,
    allowMemberInvites: input.group.allowMemberInvites,
    maxMembers: input.group.maxMembers,
    pendingJoinRequestCount: Number(input.pendingJoinRequestCount ?? 0),
  };
}

export async function loadSocialGroupProfileMap(
  admin: any,
  userIds: string[]
): Promise<Map<string, { nickname: string; avatarEmoji: string; statusMessage: string }>> {
  const idList = Array.from(new Set(userIds.filter(Boolean)));
  const profileMap = new Map<string, { nickname: string; avatarEmoji: string; statusMessage: string }>();
  if (idList.length === 0) return profileMap;

  let rows: any[] | null = null;
  let error: any = null;

  const extended = await (admin as any)
    .from("rnest_social_profiles")
    .select("user_id, nickname, avatar_emoji, status_message")
    .in("user_id", idList);
  if (!extended.error) {
    rows = extended.data ?? [];
  } else if (isMissingSchemaFeatureError(extended.error)) {
    const fallback = await (admin as any)
      .from("rnest_social_profiles")
      .select("user_id, nickname, avatar_emoji")
      .in("user_id", idList);
    rows = fallback.data ?? [];
    error = fallback.error;
  } else {
    error = extended.error;
  }

  if (error) throw error;

  for (const row of rows ?? []) {
    profileMap.set(String(row.user_id), {
      nickname: String(row.nickname ?? ""),
      avatarEmoji: String(row.avatar_emoji ?? "🐧"),
      statusMessage: String(row.status_message ?? ""),
    });
  }
  return profileMap;
}

export async function loadPendingJoinRequests(
  admin: any,
  groupId: number
): Promise<SocialGroupJoinRequest[]> {
  try {
    const { data: rows, error } = await (admin as any)
      .from("rnest_social_group_join_requests")
      .select("id, requester_user_id, created_at, status")
      .eq("group_id", groupId)
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    if (error) throw error;

    const requesterIds = (rows ?? []).map((row: any) => String(row.requester_user_id));
    const [profileMap, { data: prefRows }] = await Promise.all([
      loadSocialGroupProfileMap(admin, requesterIds),
      requesterIds.length > 0
        ? (admin as any)
            .from("rnest_social_preferences")
            .select("user_id, status_message_visible")
            .in("user_id", requesterIds)
        : Promise.resolve({ data: [] }),
    ]);

    const prefMap = new Map<string, boolean>();
    for (const row of prefRows ?? []) {
      prefMap.set(String(row.user_id), row.status_message_visible !== false);
    }

    return (rows ?? []).map((row: any) => {
      const requesterUserId = String(row.requester_user_id);
      const profile = profileMap.get(requesterUserId);
      return {
        id: Number(row.id),
        requesterUserId,
        nickname: profile?.nickname ?? "",
        avatarEmoji: profile?.avatarEmoji ?? "🐧",
        statusMessage: prefMap.get(requesterUserId) === false ? "" : (profile?.statusMessage ?? ""),
        createdAt: String(row.created_at ?? new Date().toISOString()),
      };
    });
  } catch (error: any) {
    if (isMissingSchemaFeatureError(error)) return [];
    throw error;
  }
}

export async function loadPendingJoinRequestForUser(
  admin: any,
  groupId: number,
  requesterUserId: string
): Promise<any | null> {
  try {
    const { data, error } = await (admin as any)
      .from("rnest_social_group_join_requests")
      .select("id, status, created_at")
      .eq("group_id", groupId)
      .eq("requester_user_id", requesterUserId)
      .maybeSingle();
    if (error) throw error;
    return data ?? null;
  } catch (error: any) {
    if (isMissingSchemaFeatureError(error)) return null;
    throw error;
  }
}

export async function loadPendingJoinRequestCountMap(
  admin: any,
  groupIds: number[]
): Promise<Map<number, number>> {
  const counts = new Map<number, number>();
  if (groupIds.length === 0) return counts;

  try {
    const { data: rows, error } = await (admin as any)
      .from("rnest_social_group_join_requests")
      .select("group_id")
      .in("group_id", groupIds)
      .eq("status", "pending");
    if (error) throw error;
    for (const row of rows ?? []) {
      const groupId = Number(row.group_id);
      counts.set(groupId, Number(counts.get(groupId) ?? 0) + 1);
    }
    return counts;
  } catch (error: any) {
    if (isMissingSchemaFeatureError(error)) return counts;
    throw error;
  }
}

export async function loadGroupActivities(
  admin: any,
  groupId: number,
  limit = 24
): Promise<SocialGroupActivity[]> {
  try {
    const { data: rows, error } = await (admin as any)
      .from("rnest_social_group_activity")
      .select("id, type, actor_user_id, target_user_id, payload, created_at")
      .eq("group_id", groupId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;

    const ids = new Set<string>();
    for (const row of rows ?? []) {
      if (row.actor_user_id) ids.add(String(row.actor_user_id));
      if (row.target_user_id) ids.add(String(row.target_user_id));
    }
    const profileMap = await loadSocialGroupProfileMap(admin, Array.from(ids));

    return (rows ?? []).map((row: any) => {
      const actor = profileMap.get(String(row.actor_user_id ?? ""));
      const target = profileMap.get(String(row.target_user_id ?? ""));
      return {
        id: Number(row.id),
        type: String(row.type ?? "group_settings_updated") as SocialGroupActivityType,
        actorUserId: row.actor_user_id ? String(row.actor_user_id) : null,
        actorNickname: actor?.nickname ?? "",
        actorAvatarEmoji: actor?.avatarEmoji ?? "🐧",
        targetUserId: row.target_user_id ? String(row.target_user_id) : null,
        targetNickname: target?.nickname ?? "",
        targetAvatarEmoji: target?.avatarEmoji ?? "🐧",
        payload: (row.payload ?? {}) as SocialGroupActivity["payload"],
        createdAt: String(row.created_at ?? new Date().toISOString()),
      };
    });
  } catch (error: any) {
    if (isMissingSchemaFeatureError(error)) return [];
    throw error;
  }
}

export async function loadGroupNoticePosts(
  admin: any,
  groupId: number,
  limit = 12
): Promise<SocialGroupNoticePost[]> {
  try {
    const { data: rows, error } = await (admin as any)
      .from("rnest_social_group_notice_posts")
      .select("id, author_user_id, title, body, created_at, updated_at")
      .eq("group_id", groupId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;

    const authorIds: string[] = [];
    for (const row of rows ?? []) {
      const authorUserId = String((row as any).author_user_id ?? "").trim();
      if (authorUserId && !authorIds.includes(authorUserId)) {
        authorIds.push(authorUserId);
      }
    }
    const profileMap = await loadSocialGroupProfileMap(admin, authorIds);

    return (rows ?? []).map((row: any) => {
      const authorUserId = row.author_user_id ? String(row.author_user_id) : null;
      const author = authorUserId ? profileMap.get(authorUserId) : null;
      return {
        id: Number(row.id),
        title: String(row.title ?? ""),
        body: String(row.body ?? ""),
        createdAt: String(row.created_at ?? new Date().toISOString()),
        updatedAt: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
        authorUserId,
        authorNickname: author?.nickname ?? "",
        authorAvatarEmoji: author?.avatarEmoji ?? "🐧",
      };
    });
  } catch (error: any) {
    if (isMissingSchemaFeatureError(error)) return [];
    throw error;
  }
}

export async function loadLatestGroupNoticePreviewMap(
  admin: any,
  groupIds: number[]
): Promise<Map<number, { title: string; preview: string; createdAt: string }>> {
  const previewMap = new Map<number, { title: string; preview: string; createdAt: string }>();
  if (groupIds.length === 0) return previewMap;

  try {
    const { data: rows, error } = await (admin as any)
      .from("rnest_social_group_notice_posts")
      .select("group_id, title, body, created_at")
      .in("group_id", groupIds)
      .order("created_at", { ascending: false });
    if (error) throw error;

    for (const row of rows ?? []) {
      const groupId = Number((row as any).group_id ?? 0);
      if (!Number.isFinite(groupId) || groupId <= 0 || previewMap.has(groupId)) continue;

      const title = String((row as any).title ?? "").trim();
      const body = String((row as any).body ?? "").trim();
      previewMap.set(groupId, {
        title: title || "공지",
        preview: body,
        createdAt: String((row as any).created_at ?? new Date().toISOString()),
      });
    }

    return previewMap;
  } catch (error: any) {
    if (isMissingSchemaFeatureError(error)) return previewMap;
    throw error;
  }
}

export async function appendGroupActivity(input: {
  admin: any;
  groupId: number;
  type: SocialGroupActivityType;
  actorUserId?: string | null;
  targetUserId?: string | null;
  payload?: Record<string, unknown>;
}): Promise<void> {
  try {
    await (input.admin as any).from("rnest_social_group_activity").insert({
      group_id: input.groupId,
      actor_user_id: input.actorUserId ?? null,
      target_user_id: input.targetUserId ?? null,
      type: input.type,
      payload: input.payload ?? {},
    });
  } catch (error: any) {
    if (isMissingSchemaFeatureError(error)) return;
    console.error("[SocialGroupActivity/insert] group=%d err=%s", input.groupId, String(error?.message ?? error));
  }
}

// ─── 건강 통계 계산 (서버 사이드, Edge Runtime 호환) ────────────────────────

/**
 * ISO 날짜에 days를 더한 ISO 날짜 반환 (정오 UTC 기준으로 DST 영향 방지)
 */
function serverOffsetISO(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * 그룹 멤버의 rnest_user_state payload로부터 지난 7일 건강 통계를 계산합니다.
 * - health_visibility === 'full' 멤버에게만 호출해야 합니다.
 * - 실제 건강 입력(bio)이 3일 미만이면 null을 반환합니다.
 * - 계산 실패 시 null을 반환합니다 (에러를 throw하지 않음).
 *
 * 성능: payload를 최근 60일 데이터로 필터링 후 computeVitalsRange 호출.
 * 60일치 × 최대 24명 = 최대 1440 엔진 스텝 (각 O(1)), 충분히 빠릅니다.
 */
export function computeMemberWeeklyVitals(
  payload: Record<string, unknown>,
  todayISO: string,
): MemberWeeklyVitals | null {
  try {
    // 60일 전 ISO 날짜 (수면부채 누적 정확도를 위해 최소 30일 필요, 60일로 여유 확보)
    const cutoffISO = serverOffsetISO(todayISO, -60);

    // 원본 데이터 추출
    const rawSchedule = ((payload.schedule ?? {}) as Record<string, string>);
    const rawBio = ((payload.bio ?? {}) as Record<string, unknown>);
    const rawEmotions = ((payload.emotions ?? {}) as Record<string, unknown>);
    const rawNotes = ((payload.notes ?? {}) as Record<string, unknown>);

    // 60일 이후 데이터만 필터링 (성능 최적화)
    const filteredSchedule: Record<string, string> = {};
    const filteredBio: Record<string, unknown> = {};
    const filteredEmotions: Record<string, unknown> = {};
    const filteredNotes: Record<string, unknown> = {};

    for (const [date, value] of Object.entries(rawSchedule)) {
      if (typeof date === "string" && date >= cutoffISO) {
        filteredSchedule[date] = value as string;
      }
    }
    for (const [date, value] of Object.entries(rawBio)) {
      if (typeof date === "string" && date >= cutoffISO) {
        filteredBio[date] = value;
      }
    }
    for (const [date, value] of Object.entries(rawEmotions)) {
      if (typeof date === "string" && date >= cutoffISO) {
        filteredEmotions[date] = value;
      }
    }
    for (const [date, value] of Object.entries(rawNotes)) {
      if (typeof date === "string" && date >= cutoffISO) {
        filteredNotes[date] = value;
      }
    }

    // settings (menstrual, profile)는 날짜 키가 없으므로 그대로 사용
    const filteredState = {
      ...payload,
      schedule: filteredSchedule,
      bio: filteredBio,
      emotions: filteredEmotions,
      notes: filteredNotes,
    };

    // vitals 계산: cutoff → today (엔진이 내부적으로 computeStart를 결정)
    const vitals = computeVitalsRange({
      state: filteredState as any,
      start: cutoffISO as any,
      end: todayISO as any,
    });

    // 지난 7일 (오늘 포함 롤링 윈도우)
    const weekStartISO = serverOffsetISO(todayISO, -6);
    const weekVitals = vitals.filter((v) => v.dateISO >= weekStartISO);

    // 실제 건강 입력이 있는 날만 카운트
    // (엔진이 추정치를 사용하는 날은 의미있는 순위로 볼 수 없음)
    const daysWithData = weekVitals.filter(
      (v) =>
        v.inputs.sleepHours != null ||
        v.inputs.stress != null ||
        v.inputs.mood != null ||
        v.inputs.activity != null ||
        v.inputs.caffeineMg != null,
    );

    // 최소 3일 이상 데이터 없으면 랭킹 제외
    if (daysWithData.length < 3) return null;

    // 평균 계산
    const avgBattery =
      daysWithData.reduce((sum, v) => sum + v.body.value, 0) / daysWithData.length;
    const avgMental =
      daysWithData.reduce((sum, v) => sum + v.mental.ema, 0) / daysWithData.length;

    const daysWithSleep = daysWithData.filter((v) => v.inputs.sleepHours != null);
    const avgSleep =
      daysWithSleep.length > 0
        ? daysWithSleep.reduce((sum, v) => sum + (v.inputs.sleepHours ?? 0), 0) /
          daysWithSleep.length
        : null;

    const daysWithStress = daysWithData.filter((v) => v.inputs.stress != null);
    const avgStress =
      daysWithStress.length > 0
        ? daysWithStress.reduce((sum, v) => sum + Number(v.inputs.stress ?? 0), 0) /
          daysWithStress.length
        : null;

    const daysWithActivity = daysWithData.filter((v) => v.inputs.activity != null);
    const avgActivity =
      daysWithActivity.length > 0
        ? daysWithActivity.reduce((sum, v) => sum + Number(v.inputs.activity ?? 0), 0) /
          daysWithActivity.length
        : null;

    const daysWithCaffeine = daysWithData.filter((v) => v.inputs.caffeineMg != null);
    const avgCaffeine =
      daysWithCaffeine.length > 0
        ? daysWithCaffeine.reduce((sum, v) => sum + Number(v.inputs.caffeineMg ?? 0), 0) /
          daysWithCaffeine.length
        : null;

    const daysWithMood = daysWithData.filter((v) => v.inputs.mood != null);
    const avgMood =
      daysWithMood.length > 0
        ? daysWithMood.reduce((sum, v) => sum + Number(v.inputs.mood ?? 0), 0) /
          daysWithMood.length
        : null;

    // 지난 7일 중 가장 나쁜 번아웃 레벨 (danger > warning > ok)
    let burnoutLevel: "ok" | "warning" | "danger" = "ok";
    for (const v of daysWithData) {
      if (v.burnout.level === "danger") {
        burnoutLevel = "danger";
        break;
      }
      if (v.burnout.level === "warning") {
        burnoutLevel = "warning";
      }
    }

    return {
      weeklyAvgBattery: Math.round(avgBattery * 10) / 10,
      weeklyAvgMental: Math.round(avgMental * 10) / 10,
      weeklyAvgSleep: avgSleep !== null ? Math.round(avgSleep * 10) / 10 : null,
      weeklyAvgStress: avgStress !== null ? Math.round(avgStress * 10) / 10 : null,
      weeklyAvgActivity: avgActivity !== null ? Math.round(avgActivity * 10) / 10 : null,
      weeklyAvgCaffeine: avgCaffeine !== null ? Math.round(avgCaffeine * 10) / 10 : null,
      weeklyAvgMood: avgMood !== null ? Math.round(avgMood * 10) / 10 : null,
      burnoutLevel,
      daysCounted: daysWithData.length,
    };
  } catch {
    // 계산 실패 시 안전하게 null 반환 (보드 API 전체를 실패시키지 않음)
    return null;
  }
}

export async function appendSocialEvent(input: {
  admin: any;
  recipientId: string;
  actorId?: string | null;
  type: SocialEventType;
  entityId?: string | null;
  payload?: Record<string, unknown>;
  dedupeKey?: string | null;
}): Promise<void> {
  try {
    const row = {
      recipient_id: input.recipientId,
      actor_id: input.actorId ?? null,
      type: input.type,
      entity_id: input.entityId ?? null,
      payload: input.payload ?? {},
      dedupe_key: input.dedupeKey ?? null,
    };
    if (input.dedupeKey) {
      await (input.admin as any).from("rnest_social_events").upsert(row, { onConflict: "dedupe_key" });
    } else {
      await (input.admin as any).from("rnest_social_events").insert(row);
    }
  } catch (error: any) {
    console.error("[SocialEvents/append] recipient=%s type=%s err=%s", input.recipientId, input.type, String(error?.message ?? error));
  }
}
