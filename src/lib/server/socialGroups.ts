import type {
  SocialEventType,
  SocialGroupActivity,
  SocialGroupActivityType,
  SocialGroupJoinMode,
  SocialGroupJoinRequest,
  SocialGroupPermissions,
  SocialGroupPreviewMember,
  SocialGroupRole,
  SocialGroupSummary,
} from "@/types/social";

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
    const profileMap = await loadSocialGroupProfileMap(admin, requesterIds);
    return (rows ?? []).map((row: any) => {
      const profile = profileMap.get(String(row.requester_user_id));
      return {
        id: Number(row.id),
        requesterUserId: String(row.requester_user_id),
        nickname: profile?.nickname ?? "",
        avatarEmoji: profile?.avatarEmoji ?? "🐧",
        statusMessage: profile?.statusMessage ?? "",
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
