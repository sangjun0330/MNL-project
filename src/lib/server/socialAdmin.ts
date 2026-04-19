import { requireBillingAdmin } from "@/lib/server/billingAdminAuth";
import { buildSocialProfileImageUrl } from "@/lib/server/socialProfileImageStore";
import { cancelChallenge } from "@/lib/server/socialChallenges";
import { generateGroupAIBriefForAdmin } from "@/lib/server/socialGroupAIBrief";
import { getSocialGroupById, normalizeSocialGroupRole } from "@/lib/server/socialGroups";
import { deleteComment, deletePost } from "@/lib/server/socialPosts";
import {
  cleanSocialGroupDescription,
  cleanSocialGroupName,
  cleanSocialGroupNotice,
} from "@/lib/server/socialSecurity";
import type {
  SocialAdminActorSummary,
  SocialAdminChallengeItem,
  SocialAdminContentItem,
  SocialAdminContentKind,
  SocialAdminGroupDetail,
  SocialAdminGroupItem,
  SocialAdminGroupJoinRequest,
  SocialAdminGroupMember,
  SocialAdminOverview,
  SocialAdminUserDetail,
  SocialAdminUserListItem,
  SocialAdminUserState,
} from "@/types/socialAdmin";

const ACTIVE_STATE: SocialAdminUserState = "active";
const STORY_MEDIA_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? `${process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/+$/, "")}/storage/v1/object/public/social-story-images`
  : "";

type AdminProfileRow = {
  user_id: string;
  nickname: string | null;
  avatar_emoji: string | null;
  handle: string | null;
  display_name: string | null;
  bio: string | null;
  profile_image_path: string | null;
  account_visibility?: string | null;
  default_post_visibility?: string | null;
  updated_at?: string | null;
};

type SocialUserControlRow = {
  user_id: string;
  social_state: string | null;
  reason: string | null;
  updated_by: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function normalizeText(value: unknown, fallback = "") {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function normalizeOptionalText(value: unknown) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function normalizeState(value: unknown): SocialAdminUserState {
  if (value === "read_only") return "read_only";
  if (value === "suspended") return "suspended";
  return ACTIVE_STATE;
}

function normalizeJoinMode(value: unknown): "open" | "approval" {
  return value === "approval" ? "approval" : "open";
}

function normalizeDefaultPostVisibility(
  value: unknown,
): "public_internal" | "followers" | "friends" | "group" {
  if (value === "public_internal") return "public_internal";
  if (value === "followers") return "followers";
  if (value === "group") return "group";
  return "friends";
}

function normalizeAccountVisibility(value: unknown): "public" | "private" {
  return value === "private" ? "private" : "public";
}

function storyMediaUrl(mediaPath: string | null | undefined) {
  if (!mediaPath || !STORY_MEDIA_BASE) return null;
  return `${STORY_MEDIA_BASE}/${String(mediaPath).replace(/^\/+/, "")}`;
}

function cleanAdminReason(value: unknown) {
  const sanitized = String(value ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return sanitized ? Array.from(sanitized).slice(0, 240).join("") : null;
}

function buildActorSummary(
  userId: string,
  row?: AdminProfileRow | null,
): SocialAdminActorSummary {
  const nickname = normalizeText(row?.nickname, `RNest ${userId.slice(0, 6)}`);
  const displayName = normalizeText(row?.display_name ?? row?.nickname, nickname);
  return {
    userId,
    nickname,
    displayName,
    handle: normalizeOptionalText(row?.handle),
    avatarEmoji: normalizeText(row?.avatar_emoji, "🐧"),
    profileImageUrl: buildSocialProfileImageUrl(normalizeOptionalText(row?.profile_image_path)),
  };
}

function buildCountsByKey(rows: any[], key: string) {
  const map = new Map<string, number>();
  for (const row of rows ?? []) {
    const value = String(row?.[key] ?? "");
    if (!value) continue;
    map.set(value, (map.get(value) ?? 0) + 1);
  }
  return map;
}

async function loadProfileMap(admin: any, userIds: string[]) {
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  const map = new Map<string, AdminProfileRow>();
  if (unique.length === 0) return map;
  const { data, error } = await (admin as any)
    .from("rnest_social_profiles")
    .select(
      "user_id, nickname, avatar_emoji, handle, display_name, bio, profile_image_path, account_visibility, default_post_visibility, updated_at",
    )
    .in("user_id", unique);
  if (error) throw error;
  for (const row of data ?? []) {
    map.set(String(row.user_id), row as AdminProfileRow);
  }
  return map;
}

async function loadSocialUserControlMap(admin: any, userIds: string[]) {
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  const map = new Map<string, SocialUserControlRow>();
  if (unique.length === 0) return map;
  const { data, error } = await (admin as any)
    .from("rnest_social_user_controls")
    .select("user_id, social_state, reason, updated_by, created_at, updated_at")
    .in("user_id", unique);
  if (error) throw error;
  for (const row of data ?? []) {
    map.set(String(row.user_id), row as SocialUserControlRow);
  }
  return map;
}

export async function requireSocialAdmin(req: Request) {
  return requireBillingAdmin(req);
}

export async function getSocialUserState(
  admin: any,
  userId: string,
): Promise<SocialAdminUserState> {
  if (!userId) return ACTIVE_STATE;
  const { data, error } = await (admin as any)
    .from("rnest_social_user_controls")
    .select("social_state")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return normalizeState(data?.social_state);
}

export function getSocialAccessErrorCode(error: unknown) {
  const code = String((error as any)?.code ?? (error as any)?.message ?? "");
  if (code === "social_read_only" || code === "social_suspended") return code;
  return null;
}

export async function assertSocialReadAccess(admin: any, userId: string) {
  const state = await getSocialUserState(admin, userId);
  if (state === "suspended") {
    const error = new Error("social_suspended");
    (error as any).code = "social_suspended";
    throw error;
  }
  return state;
}

export async function assertSocialWriteAccess(admin: any, userId: string) {
  const state = await getSocialUserState(admin, userId);
  if (state === "read_only") {
    const error = new Error("social_read_only");
    (error as any).code = "social_read_only";
    throw error;
  }
  if (state === "suspended") {
    const error = new Error("social_suspended");
    (error as any).code = "social_suspended";
    throw error;
  }
  return state;
}

export async function writeSocialAdminAuditLog(args: {
  admin: any;
  adminUserId: string;
  actionType: string;
  targetType: string;
  targetId: string;
  reason?: string | null;
  details?: Record<string, unknown>;
}) {
  const { error } = await (args.admin as any)
    .from("rnest_social_admin_audit_log")
    .insert({
      admin_user_id: args.adminUserId,
      action_type: args.actionType,
      target_type: args.targetType,
      target_id: args.targetId,
      reason: cleanAdminReason(args.reason),
      details: args.details ?? {},
    });
  if (error) throw error;
}

export async function listSocialAdminOverview(admin: any): Promise<SocialAdminOverview> {
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [
    totalUsers,
    totalPosts,
    totalComments,
    activeStories,
    totalGroups,
    pendingJoinRequests,
    activeChallenges,
    readOnlyUsers,
    suspendedUsers,
    postsLast24h,
    storiesLast24h,
    aiBriefsThisWeek,
  ] = await Promise.all([
    (admin as any).from("rnest_social_profiles").select("user_id", { count: "exact", head: true }),
    (admin as any).from("rnest_social_posts").select("id", { count: "exact", head: true }),
    (admin as any).from("rnest_social_post_comments").select("id", { count: "exact", head: true }),
    (admin as any)
      .from("rnest_social_stories")
      .select("id", { count: "exact", head: true })
      .gt("expires_at", now.toISOString()),
    (admin as any).from("rnest_social_groups").select("id", { count: "exact", head: true }),
    (admin as any)
      .from("rnest_social_group_join_requests")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending"),
    (admin as any)
      .from("rnest_social_group_challenges")
      .select("id", { count: "exact", head: true })
      .eq("status", "active"),
    (admin as any)
      .from("rnest_social_user_controls")
      .select("user_id", { count: "exact", head: true })
      .eq("social_state", "read_only"),
    (admin as any)
      .from("rnest_social_user_controls")
      .select("user_id", { count: "exact", head: true })
      .eq("social_state", "suspended"),
    (admin as any)
      .from("rnest_social_posts")
      .select("id", { count: "exact", head: true })
      .gte("created_at", last24h),
    (admin as any)
      .from("rnest_social_stories")
      .select("id", { count: "exact", head: true })
      .gte("created_at", last24h),
    (admin as any)
      .from("rnest_social_group_ai_briefs")
      .select("group_id", { count: "exact", head: true })
      .eq("week_start_iso", weekStart),
  ]);

  return {
    totalUsers: Number(totalUsers.count ?? 0),
    totalPosts: Number(totalPosts.count ?? 0),
    totalComments: Number(totalComments.count ?? 0),
    activeStories: Number(activeStories.count ?? 0),
    totalGroups: Number(totalGroups.count ?? 0),
    pendingJoinRequests: Number(pendingJoinRequests.count ?? 0),
    activeChallenges: Number(activeChallenges.count ?? 0),
    readOnlyUsers: Number(readOnlyUsers.count ?? 0),
    suspendedUsers: Number(suspendedUsers.count ?? 0),
    postsLast24h: Number(postsLast24h.count ?? 0),
    storiesLast24h: Number(storiesLast24h.count ?? 0),
    aiBriefsThisWeek: Number(aiBriefsThisWeek.count ?? 0),
  };
}

export async function listSocialAdminUsers(args: {
  admin: any;
  query?: string;
  state?: SocialAdminUserState | "all";
  limit?: number;
}): Promise<SocialAdminUserListItem[]> {
  const search = normalizeText(args.query).toLowerCase();
  const limit = Math.min(120, Math.max(1, Math.round(args.limit ?? 60)));

  let query = (args.admin as any)
    .from("rnest_social_profiles")
    .select(
      "user_id, nickname, avatar_emoji, handle, display_name, bio, profile_image_path, account_visibility, default_post_visibility, updated_at",
    )
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (search) {
    query = query.or(
      `nickname.ilike.%${search}%,handle.ilike.%${search}%,display_name.ilike.%${search}%,user_id.ilike.%${search}%`,
    );
  }

  const { data: profileRows, error } = await query;
  if (error) throw error;

  const userIds = (profileRows ?? []).map((row: any) => String(row.user_id ?? ""));
  const [controlMap, { data: userRows }, { data: postRows }, { data: storyRows }, { data: membershipRows }] =
    await Promise.all([
      loadSocialUserControlMap(args.admin, userIds),
      (args.admin as any)
        .from("rnest_users")
        .select("user_id, subscription_tier, last_seen")
        .in("user_id", userIds),
      userIds.length > 0
        ? (args.admin as any).from("rnest_social_posts").select("author_user_id").in("author_user_id", userIds)
        : Promise.resolve({ data: [] }),
      userIds.length > 0
        ? (args.admin as any).from("rnest_social_stories").select("author_user_id").in("author_user_id", userIds)
        : Promise.resolve({ data: [] }),
      userIds.length > 0
        ? (args.admin as any).from("rnest_social_group_members").select("user_id").in("user_id", userIds)
        : Promise.resolve({ data: [] }),
    ]);

  const userRowMap = new Map<string, any>((userRows ?? []).map((row: any) => [String(row.user_id), row]));
  const postCountMap = buildCountsByKey(postRows ?? [], "author_user_id");
  const storyCountMap = buildCountsByKey(storyRows ?? [], "author_user_id");
  const groupCountMap = buildCountsByKey(membershipRows ?? [], "user_id");

  const items = (profileRows ?? []).map((row: any) => {
    const userId = String(row.user_id);
    const control = controlMap.get(userId);
    const userRow = userRowMap.get(userId);
    return {
      ...buildActorSummary(userId, row as AdminProfileRow),
      bio: normalizeText(row.bio),
      state: normalizeState(control?.social_state),
      stateReason: normalizeOptionalText(control?.reason),
      accountVisibility: normalizeAccountVisibility(row.account_visibility),
      defaultPostVisibility: normalizeDefaultPostVisibility(row.default_post_visibility),
      subscriptionTier: normalizeText(userRow?.subscription_tier, "free"),
      lastSeenAt: normalizeOptionalText(userRow?.last_seen),
      updatedAt: normalizeText(row.updated_at, new Date(0).toISOString()),
      postCount: Number(postCountMap.get(userId) ?? 0),
      storyCount: Number(storyCountMap.get(userId) ?? 0),
      groupCount: Number(groupCountMap.get(userId) ?? 0),
    } satisfies SocialAdminUserListItem;
  });

  return items.filter((item: SocialAdminUserListItem) => {
    if (args.state && args.state !== "all" && item.state !== args.state) return false;
    if (!search) return true;
    const haystack = [
      item.nickname,
      item.displayName,
      item.handle ?? "",
      item.userId,
      item.bio,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(search);
  });
}

export async function getSocialAdminUserDetail(
  admin: any,
  userId: string,
): Promise<SocialAdminUserDetail | null> {
  const [profileMap, controlMap] = await Promise.all([
    loadProfileMap(admin, [userId]),
    loadSocialUserControlMap(admin, [userId]),
  ]);
  const profile = profileMap.get(userId);
  if (!profile) return null;

  const [{ data: userRow }, posts, stories, memberships, followers, following, friendRequestRows] =
    await Promise.all([
      (admin as any)
        .from("rnest_users")
        .select("user_id, subscription_tier, last_seen")
        .eq("user_id", userId)
        .maybeSingle(),
      (admin as any)
        .from("rnest_social_posts")
        .select("id", { count: "exact", head: true })
        .eq("author_user_id", userId),
      (admin as any)
        .from("rnest_social_stories")
        .select("id", { count: "exact", head: true })
        .eq("author_user_id", userId),
      (admin as any)
        .from("rnest_social_group_members")
        .select("group_id, role, joined_at")
        .eq("user_id", userId)
        .order("joined_at", { ascending: false }),
      (admin as any)
        .from("rnest_social_follows")
        .select("follower_user_id", { count: "exact", head: true })
        .eq("followee_user_id", userId),
      (admin as any)
        .from("rnest_social_follows")
        .select("followee_user_id", { count: "exact", head: true })
        .eq("follower_user_id", userId),
      (admin as any)
        .from("rnest_connections")
        .select("status, requester_id, receiver_id")
        .or(`requester_id.eq.${userId},receiver_id.eq.${userId}`),
    ]);

  const groupIds = (memberships.data ?? []).map((row: any) => Number(row.group_id)).filter((value: number) => Number.isFinite(value));
  const groupRows =
    groupIds.length > 0
      ? await (admin as any).from("rnest_social_groups").select("id, name").in("id", groupIds)
      : { data: [] };
  const groupNameMap = new Map<number, string>(
    (groupRows.data ?? []).map((row: any) => [Number(row.id), normalizeText(row.name, "그룹")]),
  );
  const connections = friendRequestRows.data ?? [];
  const friendCount = connections.filter((row: any) => row.status === "accepted").length;
  const pendingIncomingRequests = connections.filter(
    (row: any) => row.status === "pending" && String(row.receiver_id) === userId,
  ).length;
  const pendingOutgoingRequests = connections.filter(
    (row: any) => row.status === "pending" && String(row.requester_id) === userId,
  ).length;
  const recentGroups = (memberships.data ?? []).slice(0, 5).map((row: any) => ({
    groupId: Number(row.group_id),
    name: groupNameMap.get(Number(row.group_id)) ?? "그룹",
    role: normalizeSocialGroupRole(row.role),
    joinedAt: normalizeText(row.joined_at, new Date(0).toISOString()),
  }));

  const control = controlMap.get(userId);
  return {
    ...buildActorSummary(userId, profile),
    bio: normalizeText(profile.bio),
    state: normalizeState(control?.social_state),
    stateReason: normalizeOptionalText(control?.reason),
    accountVisibility: normalizeAccountVisibility(profile.account_visibility),
    defaultPostVisibility: normalizeDefaultPostVisibility(profile.default_post_visibility),
    subscriptionTier: normalizeText(userRow?.subscription_tier, "free"),
    lastSeenAt: normalizeOptionalText(userRow?.last_seen),
    updatedAt: normalizeText(profile.updated_at, new Date(0).toISOString()),
    postCount: Number(posts.count ?? 0),
    storyCount: Number(stories.count ?? 0),
    groupCount: Number(memberships.data?.length ?? 0),
    followerCount: Number(followers.count ?? 0),
    followingCount: Number(following.count ?? 0),
    friendCount,
    pendingIncomingRequests,
    pendingOutgoingRequests,
    recentGroups,
  };
}

export async function updateSocialAdminUserState(args: {
  admin: any;
  adminUserId: string;
  targetUserId: string;
  state: SocialAdminUserState;
  reason?: string | null;
}) {
  const reason = cleanAdminReason(args.reason);
  if (!args.targetUserId) throw new Error("target_user_required");
  if (
    args.adminUserId === args.targetUserId &&
    args.state !== ACTIVE_STATE
  ) {
    throw new Error("cannot_restrict_self");
  }

  if (args.state === ACTIVE_STATE) {
    const { error } = await (args.admin as any)
      .from("rnest_social_user_controls")
      .delete()
      .eq("user_id", args.targetUserId);
    if (error) throw error;
  } else {
    const { error } = await (args.admin as any)
      .from("rnest_social_user_controls")
      .upsert(
        {
          user_id: args.targetUserId,
          social_state: args.state,
          reason,
          updated_by: args.adminUserId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
    if (error) throw error;
  }

  await writeSocialAdminAuditLog({
    admin: args.admin,
    adminUserId: args.adminUserId,
    actionType: `user_state_${args.state}`,
    targetType: "user",
    targetId: args.targetUserId,
    reason,
    details: { state: args.state },
  });
}

async function listPostContent(admin: any, limit: number, search: string) {
  let query = (admin as any)
    .from("rnest_social_posts")
    .select("id, author_user_id, body, visibility, group_id, image_path, created_at, like_count, comment_count")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (search) query = query.ilike("body", `%${search}%`);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

async function listCommentContent(admin: any, limit: number, search: string) {
  let query = (admin as any)
    .from("rnest_social_post_comments")
    .select("id, post_id, author_user_id, body, created_at, like_count")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (search) query = query.ilike("body", `%${search}%`);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

async function listStoryContent(admin: any, limit: number, search: string) {
  let query = (admin as any)
    .from("rnest_social_stories")
    .select("id, author_user_id, content_type, text, media_path, expires_at, created_at, view_count")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (search) query = query.ilike("text", `%${search}%`);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function listSocialAdminContent(args: {
  admin: any;
  kind?: SocialAdminContentKind | "all";
  query?: string;
  limit?: number;
}): Promise<SocialAdminContentItem[]> {
  const search = normalizeText(args.query).toLowerCase();
  const limit = Math.min(90, Math.max(1, Math.round(args.limit ?? 45)));
  const postLimit = args.kind === "all" || !args.kind ? Math.ceil(limit / 3) : limit;

  const [posts, comments, stories] = await Promise.all([
    args.kind === "comment" || args.kind === "story"
      ? Promise.resolve([])
      : listPostContent(args.admin, postLimit, search),
    args.kind === "post" || args.kind === "story"
      ? Promise.resolve([])
      : listCommentContent(args.admin, postLimit, search),
    args.kind === "post" || args.kind === "comment"
      ? Promise.resolve([])
      : listStoryContent(args.admin, postLimit, search),
  ]);

  const authorIds = Array.from(
    new Set(
      [...posts, ...comments, ...stories].map((row: any) => String(row.author_user_id ?? "")).filter(Boolean),
    ),
  );
  const groupIds = Array.from(
    new Set(posts.map((row: any) => Number(row.group_id)).filter((value: number) => Number.isFinite(value) && value > 0)),
  );
  const [profileMap, { data: groupRows }] = await Promise.all([
    loadProfileMap(args.admin, authorIds),
    groupIds.length > 0
      ? (args.admin as any).from("rnest_social_groups").select("id, name").in("id", groupIds)
      : Promise.resolve({ data: [] }),
  ]);
  const groupNameMap = new Map<number, string>(
    (groupRows ?? []).map((row: any) => [Number(row.id), normalizeText(row.name, "그룹")]),
  );

  const mapped: SocialAdminContentItem[] = [
    ...posts.map((row: any) => ({
      id: Number(row.id),
      kind: "post" as const,
      author: buildActorSummary(String(row.author_user_id), profileMap.get(String(row.author_user_id))),
      preview: normalizeText(row.body, "본문 없음"),
      createdAt: normalizeText(row.created_at, new Date(0).toISOString()),
      groupId: Number.isFinite(Number(row.group_id)) ? Number(row.group_id) : null,
      groupName: Number.isFinite(Number(row.group_id)) ? groupNameMap.get(Number(row.group_id)) ?? null : null,
      postId: Number(row.id),
      visibility: normalizeOptionalText(row.visibility),
      contentType: null,
      imageUrl: normalizeOptionalText(row.image_path),
      metricPrimary: Number(row.like_count ?? 0),
      metricSecondary: Number(row.comment_count ?? 0),
      expiresAt: null,
    })),
    ...comments.map((row: any) => ({
      id: Number(row.id),
      kind: "comment" as const,
      author: buildActorSummary(String(row.author_user_id), profileMap.get(String(row.author_user_id))),
      preview: normalizeText(row.body, "댓글 없음"),
      createdAt: normalizeText(row.created_at, new Date(0).toISOString()),
      groupId: null,
      groupName: null,
      postId: Number(row.post_id ?? 0) || null,
      visibility: null,
      contentType: null,
      imageUrl: null,
      metricPrimary: Number(row.like_count ?? 0),
      metricSecondary: null,
      expiresAt: null,
    })),
    ...stories.map((row: any) => ({
      id: Number(row.id),
      kind: "story" as const,
      author: buildActorSummary(String(row.author_user_id), profileMap.get(String(row.author_user_id))),
      preview: normalizeText(row.text, row.content_type === "recovery" ? "회복 카드 스토리" : "이미지 스토리"),
      createdAt: normalizeText(row.created_at, new Date(0).toISOString()),
      groupId: null,
      groupName: null,
      postId: null,
      visibility: null,
      contentType: normalizeOptionalText(row.content_type),
      imageUrl: storyMediaUrl(normalizeOptionalText(row.media_path)),
      metricPrimary: Number(row.view_count ?? 0),
      metricSecondary: null,
      expiresAt: normalizeOptionalText(row.expires_at),
    })),
  ];

  return mapped
    .filter((item) => {
      if (!search) return true;
      const haystack = [
        item.preview,
        item.groupName ?? "",
        item.author.nickname,
        item.author.displayName,
        item.author.handle ?? "",
        item.author.userId,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(search);
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, limit);
}

export async function deleteSocialAdminContent(args: {
  admin: any;
  adminUserId: string;
  kind: SocialAdminContentKind;
  id: number;
  reason?: string | null;
}) {
  if (args.kind === "post") {
    await deletePost(args.admin, args.id, args.adminUserId, true);
  } else if (args.kind === "comment") {
    await deleteComment(args.admin, args.id, args.adminUserId, true);
  } else {
    const { data: story } = await (args.admin as any)
      .from("rnest_social_stories")
      .select("id, media_path")
      .eq("id", args.id)
      .maybeSingle();
    if (!story) throw new Error("story_not_found");
    await (args.admin as any).from("rnest_social_stories").delete().eq("id", args.id);
    if (story.media_path) {
      await args.admin.storage.from("social-story-images").remove([String(story.media_path)]);
    }
  }

  await writeSocialAdminAuditLog({
    admin: args.admin,
    adminUserId: args.adminUserId,
    actionType: `delete_${args.kind}`,
    targetType: args.kind,
    targetId: String(args.id),
    reason: args.reason,
  });
}

export async function listSocialAdminGroups(args: {
  admin: any;
  query?: string;
  limit?: number;
}): Promise<SocialAdminGroupItem[]> {
  const search = normalizeText(args.query).toLowerCase();
  const limit = Math.min(80, Math.max(1, Math.round(args.limit ?? 40)));
  let query = (args.admin as any)
    .from("rnest_social_groups")
    .select("id, owner_user_id, name, description, notice, join_mode, allow_member_invites, max_members, updated_at")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (search) {
    query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%,notice.ilike.%${search}%`);
  }

  const { data: groupRows, error } = await query;
  if (error) throw error;

  const groupIds = (groupRows ?? []).map((row: any) => Number(row.id));
  const ownerIds = (groupRows ?? []).map((row: any) => String(row.owner_user_id ?? ""));
  const [profileMap, { data: memberRows }, { data: requestRows }, { data: challengeRows }, { data: briefRows }] =
    await Promise.all([
      loadProfileMap(args.admin, ownerIds),
      groupIds.length > 0
        ? (args.admin as any).from("rnest_social_group_members").select("group_id").in("group_id", groupIds)
        : Promise.resolve({ data: [] }),
      groupIds.length > 0
        ? (args.admin as any)
            .from("rnest_social_group_join_requests")
            .select("group_id")
            .in("group_id", groupIds)
            .eq("status", "pending")
        : Promise.resolve({ data: [] }),
      groupIds.length > 0
        ? (args.admin as any)
            .from("rnest_social_group_challenges")
            .select("group_id")
            .in("group_id", groupIds)
            .eq("status", "active")
        : Promise.resolve({ data: [] }),
      groupIds.length > 0
        ? (args.admin as any)
            .from("rnest_social_group_ai_briefs")
            .select("group_id, generated_at")
            .in("group_id", groupIds)
            .order("generated_at", { ascending: false })
        : Promise.resolve({ data: [] }),
    ]);

  const memberCountMap = buildCountsByKey(memberRows ?? [], "group_id");
  const requestCountMap = buildCountsByKey(requestRows ?? [], "group_id");
  const challengeCountMap = buildCountsByKey(challengeRows ?? [], "group_id");
  const briefMap = new Map<number, string>();
  for (const row of briefRows ?? []) {
    const groupId = Number(row.group_id);
    if (!Number.isFinite(groupId) || briefMap.has(groupId)) continue;
    briefMap.set(groupId, normalizeText(row.generated_at));
  }

  return (groupRows ?? []).map((row: any) => {
    const groupId = Number(row.id);
    return {
      id: groupId,
      name: normalizeText(row.name, "그룹"),
      description: normalizeText(row.description),
      notice: normalizeText(row.notice),
      owner: buildActorSummary(String(row.owner_user_id ?? ""), profileMap.get(String(row.owner_user_id ?? ""))),
      joinMode: normalizeJoinMode(row.join_mode),
      allowMemberInvites: row.allow_member_invites !== false,
      maxMembers: Number(row.max_members ?? 12),
      updatedAt: normalizeText(row.updated_at, new Date(0).toISOString()),
      memberCount: Number(memberCountMap.get(String(groupId)) ?? 0),
      pendingJoinRequestCount: Number(requestCountMap.get(String(groupId)) ?? 0),
      activeChallengeCount: Number(challengeCountMap.get(String(groupId)) ?? 0),
      latestBriefGeneratedAt: briefMap.get(groupId) ?? null,
    } satisfies SocialAdminGroupItem;
  });
}

export async function getSocialAdminGroupDetail(
  admin: any,
  groupId: number,
): Promise<SocialAdminGroupDetail | null> {
  const group = await getSocialGroupById(admin, groupId);
  if (!group) return null;

  const [{ data: memberRows }, { data: requestRows }, { data: challengeRows }, { data: briefRows }] =
    await Promise.all([
      (admin as any)
        .from("rnest_social_group_members")
        .select("group_id, user_id, role, joined_at")
        .eq("group_id", groupId)
        .order("joined_at", { ascending: true }),
      (admin as any)
        .from("rnest_social_group_join_requests")
        .select("id, requester_user_id, created_at")
        .eq("group_id", groupId)
        .eq("status", "pending")
        .order("created_at", { ascending: true }),
      (admin as any)
        .from("rnest_social_group_challenges")
        .select("group_id")
        .eq("group_id", groupId)
        .eq("status", "active"),
      (admin as any)
        .from("rnest_social_group_ai_briefs")
        .select("generated_at")
        .eq("group_id", groupId)
        .order("generated_at", { ascending: false })
        .limit(1),
    ]);

  const userIds = Array.from(
    new Set(
      [
        String(group.ownerUserId),
        ...(memberRows ?? []).map((row: any) => String(row.user_id ?? "")),
        ...(requestRows ?? []).map((row: any) => String(row.requester_user_id ?? "")),
      ].filter(Boolean),
    ),
  );
  const profileMap = await loadProfileMap(admin, userIds);
  const members: SocialAdminGroupMember[] = (memberRows ?? []).map((row: any) => ({
    ...buildActorSummary(String(row.user_id), profileMap.get(String(row.user_id))),
    role: normalizeSocialGroupRole(row.role),
    joinedAt: normalizeText(row.joined_at, new Date(0).toISOString()),
  }));
  const pendingRequests: SocialAdminGroupJoinRequest[] = (requestRows ?? []).map((row: any) => ({
    ...buildActorSummary(String(row.requester_user_id), profileMap.get(String(row.requester_user_id))),
    requestId: Number(row.id),
    createdAt: normalizeText(row.created_at, new Date(0).toISOString()),
  }));

  return {
    id: group.id,
    name: group.name,
    description: group.description,
    notice: group.notice,
    owner: buildActorSummary(group.ownerUserId, profileMap.get(group.ownerUserId)),
    joinMode: group.joinMode,
    allowMemberInvites: group.allowMemberInvites,
    maxMembers: group.maxMembers,
    updatedAt: group.updatedAt,
    memberCount: members.length,
    pendingJoinRequestCount: pendingRequests.length,
    activeChallengeCount: Number(challengeRows?.length ?? 0),
    latestBriefGeneratedAt: normalizeOptionalText(briefRows?.[0]?.generated_at),
    members,
    pendingRequests,
  };
}

export async function updateSocialAdminGroup(args: {
  admin: any;
  adminUserId: string;
  groupId: number;
  action:
    | "update_settings"
    | "remove_member"
    | "approve_request"
    | "reject_request"
    | "delete_group";
  payload?: Record<string, unknown>;
  reason?: string | null;
}) {
  const reason = cleanAdminReason(args.reason);
  if (args.action === "delete_group") {
    const { error } = await (args.admin as any).from("rnest_social_groups").delete().eq("id", args.groupId);
    if (error) throw error;
  } else if (args.action === "update_settings") {
    const group = await getSocialGroupById(args.admin, args.groupId);
    if (!group) throw new Error("group_not_found");
    const nextName = cleanSocialGroupName(args.payload?.name ?? group.name);
    const nextDescription = cleanSocialGroupDescription(args.payload?.description ?? group.description);
    const nextNotice = cleanSocialGroupNotice(args.payload?.notice ?? group.notice);
    const nextJoinMode = normalizeJoinMode(args.payload?.joinMode ?? group.joinMode);
    const nextAllowMemberInvites =
      typeof args.payload?.allowMemberInvites === "boolean"
        ? args.payload.allowMemberInvites
        : group.allowMemberInvites;
    const rawMaxMembers = Number.parseInt(String(args.payload?.maxMembers ?? group.maxMembers), 10);
    const nextMaxMembers = Number.isFinite(rawMaxMembers) ? Math.min(24, Math.max(2, rawMaxMembers)) : group.maxMembers;
    const { error } = await (args.admin as any)
      .from("rnest_social_groups")
      .update({
        name: nextName,
        description: nextDescription,
        notice: nextNotice,
        join_mode: nextJoinMode,
        allow_member_invites: nextAllowMemberInvites,
        max_members: nextMaxMembers,
        updated_at: new Date().toISOString(),
      })
      .eq("id", args.groupId);
    if (error) throw error;
  } else if (args.action === "remove_member") {
    const targetUserId = normalizeText(args.payload?.targetUserId);
    if (!targetUserId) throw new Error("target_user_required");
    const group = await getSocialGroupById(args.admin, args.groupId);
    if (!group) throw new Error("group_not_found");
    if (group.ownerUserId === targetUserId) throw new Error("cannot_remove_owner");
    const { error } = await (args.admin as any)
      .from("rnest_social_group_members")
      .delete()
      .eq("group_id", args.groupId)
      .eq("user_id", targetUserId);
    if (error) throw error;
  } else {
    const requestId = Number.parseInt(String(args.payload?.requestId ?? ""), 10);
    if (!Number.isFinite(requestId) || requestId <= 0) throw new Error("request_required");
    const { data: requestRow, error: requestError } = await (args.admin as any)
      .from("rnest_social_group_join_requests")
      .select("id, requester_user_id, status")
      .eq("id", requestId)
      .eq("group_id", args.groupId)
      .maybeSingle();
    if (requestError) throw requestError;
    if (!requestRow) throw new Error("request_not_found");
    if (args.action === "approve_request") {
      const { data: existingMember } = await (args.admin as any)
        .from("rnest_social_group_members")
        .select("group_id")
        .eq("group_id", args.groupId)
        .eq("user_id", String(requestRow.requester_user_id))
        .maybeSingle();
      if (!existingMember) {
        const { error: insertError } = await (args.admin as any).from("rnest_social_group_members").insert({
          group_id: args.groupId,
          user_id: String(requestRow.requester_user_id),
          role: "member",
        });
        if (insertError) throw insertError;
      }
      const { error: updateError } = await (args.admin as any)
        .from("rnest_social_group_join_requests")
        .update({ status: "approved", reviewed_at: new Date().toISOString() })
        .eq("id", requestId);
      if (updateError) throw updateError;
    } else {
      const { error: updateError } = await (args.admin as any)
        .from("rnest_social_group_join_requests")
        .update({ status: "rejected", reviewed_at: new Date().toISOString() })
        .eq("id", requestId);
      if (updateError) throw updateError;
    }
  }

  await writeSocialAdminAuditLog({
    admin: args.admin,
    adminUserId: args.adminUserId,
    actionType: `group_${args.action}`,
    targetType: "group",
    targetId: String(args.groupId),
    reason,
    details: args.payload ?? {},
  });
}

export async function listSocialAdminChallenges(args: {
  admin: any;
  query?: string;
  limit?: number;
}): Promise<SocialAdminChallengeItem[]> {
  const search = normalizeText(args.query).toLowerCase();
  const limit = Math.min(100, Math.max(1, Math.round(args.limit ?? 50)));
  let query = (args.admin as any)
    .from("rnest_social_group_challenges")
    .select("id, group_id, title, description, metric, challenge_type, status, created_at, starts_at, ends_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (search) query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
  const { data: rows, error } = await query;
  if (error) throw error;

  const challengeIds = (rows ?? []).map((row: any) => Number(row.id));
  const groupIds = Array.from(new Set((rows ?? []).map((row: any) => Number(row.group_id)).filter((value: number) => Number.isFinite(value))));
  const [{ data: entryRows }, { data: groupRows }] = await Promise.all([
    challengeIds.length > 0
      ? (args.admin as any).from("rnest_social_challenge_entries").select("challenge_id").in("challenge_id", challengeIds)
      : Promise.resolve({ data: [] }),
    groupIds.length > 0
      ? (args.admin as any).from("rnest_social_groups").select("id, name").in("id", groupIds)
      : Promise.resolve({ data: [] }),
  ]);
  const participantCountMap = buildCountsByKey(entryRows ?? [], "challenge_id");
  const groupNameMap = new Map<number, string>((groupRows ?? []).map((row: any) => [Number(row.id), normalizeText(row.name, "그룹")]));

  return (rows ?? []).map((row: any) => ({
    id: Number(row.id),
    groupId: Number(row.group_id),
    groupName: groupNameMap.get(Number(row.group_id)) ?? "그룹",
    title: normalizeText(row.title, "챌린지"),
    description: normalizeOptionalText(row.description),
    metric: normalizeText(row.metric, "battery"),
    challengeType: normalizeText(row.challenge_type, "leaderboard"),
    status: normalizeText(row.status, "active"),
    participantCount: Number(participantCountMap.get(String(row.id)) ?? 0),
    createdAt: normalizeText(row.created_at, new Date(0).toISOString()),
    startsAt: normalizeText(row.starts_at, new Date(0).toISOString()),
    endsAt: normalizeText(row.ends_at, new Date(0).toISOString()),
  }));
}

export async function cancelSocialAdminChallenge(args: {
  admin: any;
  adminUserId: string;
  challengeId: number;
  reason?: string | null;
}) {
  await cancelChallenge(args.admin, args.challengeId, args.adminUserId, true);
  await writeSocialAdminAuditLog({
    admin: args.admin,
    adminUserId: args.adminUserId,
    actionType: "challenge_cancel",
    targetType: "challenge",
    targetId: String(args.challengeId),
    reason: args.reason,
  });
}

export async function runSocialAdminAIBriefGeneration(args: {
  admin: any;
  adminUserId: string;
  groupId: number;
  reason?: string | null;
}) {
  const result = await generateGroupAIBriefForAdmin({
    admin: args.admin,
    groupId: args.groupId,
  });
  await writeSocialAdminAuditLog({
    admin: args.admin,
    adminUserId: args.adminUserId,
    actionType: "group_ai_brief_regenerate",
    targetType: "group",
    targetId: String(args.groupId),
    reason: args.reason,
    details: { status: result.status },
  });
  return result;
}
