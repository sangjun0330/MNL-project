import { DEFAULT_SOCIAL_POST_VISIBILITY } from "@/types/social";
import type {
  SocialAccountVisibility,
  SocialAuthorProfile,
  SocialFollowSummary,
  SocialPostVisibility,
  SocialProfile,
  SocialProfileDiscoverability,
  SocialProfileHeader,
  SocialRelationshipState,
} from "@/types/social";
import { appendSocialEvent } from "@/lib/server/socialGroups";
import { buildSocialProfileImageUrl } from "@/lib/server/socialProfileImageStore";
import {
  cleanSocialNickname,
  cleanStatusMessage,
} from "@/lib/server/socialSecurity";

const DEFAULT_AVATAR = "🐧";
const ALLOWED_AVATARS = new Set([
  "🐧",
  "🦊",
  "🐱",
  "🐻",
  "🦁",
  "🐺",
  "🦅",
  "🐬",
]);
const HANDLE_REGEX = /^[a-z0-9](?:[a-z0-9._-]{1,28}[a-z0-9])?$/;
const PROFILE_SELECT =
  "user_id, nickname, avatar_emoji, status_message, handle, display_name, bio, profile_image_path, account_visibility, discoverability, default_post_visibility, updated_at";

type SocialHubProfileRow = {
  user_id: string;
  nickname: string | null;
  avatar_emoji: string | null;
  status_message: string | null;
  handle: string | null;
  display_name: string | null;
  bio: string | null;
  profile_image_path: string | null;
  account_visibility: string | null;
  discoverability: string | null;
  default_post_visibility: string | null;
};

type AuthSeed = {
  displayName: string;
  nickname: string;
  handleCandidate: string;
};

export type SocialProfileAvailabilityField =
  | "displayName"
  | "handle"
  | "nickname";
export type SocialProfileAvailabilityReason =
  | "available"
  | "same"
  | "taken"
  | "invalid"
  | "required";

export type SocialProfileAvailabilityResult = {
  field: SocialProfileAvailabilityField;
  normalizedValue: string;
  available: boolean;
  reason: SocialProfileAvailabilityReason;
};

function fallbackDisplayNameFromUserId(userId: string) {
  const trimmed = String(userId ?? "").trim();
  return trimmed ? `RNest ${trimmed.slice(0, 6)}` : "RNest 사용자";
}

function fallbackNicknameFromUserId(userId: string) {
  const display = fallbackDisplayNameFromUserId(userId);
  return cleanSocialNickname(display, 12) || "RNest";
}

function sanitizeHandleCandidate(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/[-_.]{2,}/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "")
    .slice(0, 30);
}

function normalizePostVisibility(value: unknown): SocialPostVisibility {
  if (value === "public_internal") return "public_internal";
  if (value === "followers") return "followers";
  if (value === "group") return "group";
  return "friends";
}

function normalizeProfileDefaultPostVisibility(
  value: unknown,
): SocialPostVisibility {
  if (value === "public_internal") return "public_internal";
  if (value === "followers") return "followers";
  if (value === "friends") return "friends";
  if (value === "group") return "group";
  return DEFAULT_SOCIAL_POST_VISIBILITY;
}

export function normalizeAccountVisibility(
  value: unknown,
): SocialAccountVisibility {
  return value === "private" ? "private" : "public";
}

export function normalizeSocialDiscoverability(
  value: unknown,
): SocialProfileDiscoverability {
  return value === "internal" ? "internal" : "off";
}

export function cleanSocialBio(value: unknown) {
  const raw = String(value ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(
      /[\u0000-\u001f\u007f-\u009f\u200b-\u200d\u2060\ufeff\u202a-\u202e\u2066-\u2069]/g,
      "",
    )
    .replace(/\r/g, "")
    .replace(/\t/g, " ")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return Array.from(raw).slice(0, 160).join("");
}

export function cleanSocialHandle(value: unknown) {
  const normalized = sanitizeHandleCandidate(String(value ?? "").trim());
  return HANDLE_REGEX.test(normalized) ? normalized : "";
}

function normalizeSocialProfileRow(
  row: SocialHubProfileRow | null | undefined,
  userId: string,
): SocialProfile {
  const nickname =
    cleanSocialNickname(row?.nickname ?? "", 12) ||
    fallbackNicknameFromUserId(userId);
  const displayName =
    cleanSocialNickname(row?.display_name ?? "", 24) ||
    cleanSocialNickname(row?.nickname ?? "", 24) ||
    fallbackDisplayNameFromUserId(userId);
  const avatarEmoji = ALLOWED_AVATARS.has(String(row?.avatar_emoji ?? ""))
    ? String(row?.avatar_emoji)
    : DEFAULT_AVATAR;
  const handle = cleanSocialHandle(row?.handle ?? "") || null;
  const bio = cleanSocialBio(row?.bio ?? "");
  const profileImagePath =
    row?.profile_image_path && String(row.profile_image_path).trim()
      ? String(row.profile_image_path).trim()
      : null;
  const profileImageUrl = buildSocialProfileImageUrl(profileImagePath);

  return {
    nickname,
    avatarEmoji,
    statusMessage: cleanStatusMessage(row?.status_message ?? ""),
    handle,
    displayName,
    bio,
    profileImagePath,
    profileImageUrl,
    accountVisibility: normalizeAccountVisibility(row?.account_visibility),
    discoverability: normalizeSocialDiscoverability(row?.discoverability),
    defaultPostVisibility: normalizeProfileDefaultPostVisibility(
      row?.default_post_visibility,
    ),
  };
}

export function buildSocialAuthorProfile(
  userId: string,
  profile: SocialProfile | null | undefined,
): SocialAuthorProfile {
  const normalized = normalizeSocialProfileRow(
    profile
      ? {
          user_id: userId,
          nickname: profile.nickname,
          avatar_emoji: profile.avatarEmoji,
          status_message: profile.statusMessage,
          handle: profile.handle,
          display_name: profile.displayName,
          bio: profile.bio,
          profile_image_path: profile.profileImagePath,
          account_visibility: profile.accountVisibility,
          discoverability: profile.discoverability,
          default_post_visibility: profile.defaultPostVisibility,
        }
      : null,
    userId,
  );
  return {
    userId,
    nickname: normalized.nickname,
    avatarEmoji: normalized.avatarEmoji,
    handle: normalized.handle,
    displayName: normalized.displayName,
    bio: normalized.bio,
    profileImageUrl: normalized.profileImageUrl,
    isFollowing: false,
    isSelf: false,
  };
}

function buildFollowSummary(
  userId: string,
  profile: SocialProfile | null | undefined,
): SocialFollowSummary {
  const author = buildSocialAuthorProfile(userId, profile);
  return {
    userId,
    nickname: author.nickname,
    avatarEmoji: author.avatarEmoji,
    handle: author.handle,
    displayName: author.displayName,
    bio: author.bio,
    profileImageUrl: author.profileImageUrl,
    statusMessage: "",
  };
}

async function loadProfileRow(
  admin: any,
  userId: string,
): Promise<SocialHubProfileRow | null> {
  const { data } = await (admin as any)
    .from("rnest_social_profiles")
    .select(PROFILE_SELECT)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as SocialHubProfileRow | null) ?? null;
}

async function getAuthSeed(admin: any, userId: string): Promise<AuthSeed> {
  const fallbackDisplayName = fallbackDisplayNameFromUserId(userId);
  const fallbackNickname = fallbackNicknameFromUserId(userId);
  const fallbackHandleCandidate =
    sanitizeHandleCandidate(userId.split("-")[0] ?? "user") || "user";

  try {
    const { data } = await admin.auth.admin.getUserById(userId);
    const authUser = data?.user;
    const meta = (authUser?.user_metadata ?? {}) as Record<string, unknown>;
    const rawDisplayName =
      String(
        meta.name ??
          meta.full_name ??
          meta.preferred_username ??
          meta.user_name ??
          meta.nickname ??
          "",
      ).trim() ||
      String(authUser?.email ?? "")
        .split("@")[0]
        ?.trim() ||
      fallbackDisplayName;

    const displayName =
      cleanSocialNickname(rawDisplayName, 24) || fallbackDisplayName;
    const nickname =
      cleanSocialNickname(rawDisplayName, 12) || fallbackNickname;
    const handleCandidate =
      cleanSocialHandle(meta.preferred_username ?? "") ||
      cleanSocialHandle(meta.user_name ?? "") ||
      cleanSocialHandle(rawDisplayName) ||
      cleanSocialHandle(String(authUser?.email ?? "").split("@")[0] ?? "") ||
      fallbackHandleCandidate;

    return { displayName, nickname, handleCandidate };
  } catch {
    return {
      displayName: fallbackDisplayName,
      nickname: fallbackNickname,
      handleCandidate: fallbackHandleCandidate,
    };
  }
}

async function reserveAvailableHandle(
  admin: any,
  requestedHandle: string,
  excludeUserId?: string | null,
): Promise<string> {
  const base = cleanSocialHandle(requestedHandle) || "user";

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const { data } = await (admin as any)
      .from("rnest_social_profiles")
      .select("user_id")
      .eq("handle", candidate)
      .maybeSingle();

    if (!data || String(data.user_id) === String(excludeUserId ?? "")) {
      return candidate;
    }
  }

  return `${base}-${crypto.randomUUID().slice(0, 6)}`;
}

async function isProfileFieldTaken(
  admin: any,
  column: "display_name" | "handle" | "nickname",
  value: string,
  userId: string,
) {
  const { data, error } = await (admin as any)
    .from("rnest_social_profiles")
    .select("user_id")
    .eq(column, value)
    .neq("user_id", userId)
    .limit(1);

  if (error) throw error;
  return Array.isArray(data) && data.length > 0;
}

async function assertProfileFieldAvailable(
  admin: any,
  column: "display_name" | "nickname",
  value: string,
  userId: string,
  errorCode: "display_name_taken" | "nickname_taken",
) {
  if (await isProfileFieldTaken(admin, column, value, userId)) {
    throw Object.assign(new Error(errorCode), { code: errorCode });
  }
  return value;
}

async function assertHandleAvailable(
  admin: any,
  requestedHandle: string,
  userId: string,
): Promise<string> {
  const normalizedHandle = cleanSocialHandle(requestedHandle);
  if (!normalizedHandle) {
    throw Object.assign(new Error("invalid_handle"), {
      code: "invalid_handle",
    });
  }

  if (await isProfileFieldTaken(admin, "handle", normalizedHandle, userId)) {
    throw Object.assign(new Error("handle_taken"), { code: "handle_taken" });
  }

  return normalizedHandle;
}

export async function checkSocialProfileAvailability(
  admin: any,
  userId: string,
  input: {
    field?: unknown;
    value?: unknown;
  },
): Promise<SocialProfileAvailabilityResult> {
  const field =
    input.field === "displayName" ||
    input.field === "handle" ||
    input.field === "nickname"
      ? input.field
      : null;

  if (!field) {
    throw Object.assign(new Error("invalid_field"), { code: "invalid_field" });
  }

  const existing = await loadProfileRow(admin, userId);
  const current = existing
    ? normalizeSocialProfileRow(existing, userId)
    : await ensureSocialProfile(admin, userId);

  if (field === "handle") {
    const normalizedValue = cleanSocialHandle(input.value);
    if (!normalizedValue) {
      return {
        field,
        normalizedValue: "",
        available: false,
        reason: "invalid",
      };
    }
    if (normalizedValue === (current.handle ?? "")) {
      return { field, normalizedValue, available: true, reason: "same" };
    }
    const taken = await isProfileFieldTaken(
      admin,
      "handle",
      normalizedValue,
      userId,
    );
    return {
      field,
      normalizedValue,
      available: !taken,
      reason: taken ? "taken" : "available",
    };
  }

  const maxLength = field === "displayName" ? 24 : 12;
  const normalizedValue = cleanSocialNickname(input.value, maxLength);
  if (!normalizedValue) {
    return { field, normalizedValue: "", available: false, reason: "required" };
  }

  const currentValue =
    field === "displayName" ? current.displayName : current.nickname;
  if (normalizedValue === currentValue) {
    return { field, normalizedValue, available: true, reason: "same" };
  }

  const taken = await isProfileFieldTaken(
    admin,
    field === "displayName" ? "display_name" : "nickname",
    normalizedValue,
    userId,
  );

  return {
    field,
    normalizedValue,
    available: !taken,
    reason: taken ? "taken" : "available",
  };
}

export async function ensureSocialProfile(
  admin: any,
  userId: string,
): Promise<SocialProfile> {
  const existing = await loadProfileRow(admin, userId);
  const seed = await getAuthSeed(admin, userId);
  const updates: Record<string, unknown> = {};

  if (!existing?.nickname) updates.nickname = seed.nickname;
  if (!existing?.avatar_emoji) updates.avatar_emoji = DEFAULT_AVATAR;
  if (!existing?.status_message) updates.status_message = "";
  if (!existing?.display_name) updates.display_name = seed.displayName;
  if (!existing?.handle) {
    updates.handle = await reserveAvailableHandle(
      admin,
      seed.handleCandidate,
      userId,
    );
  }
  if (!existing?.account_visibility) updates.account_visibility = "public";
  if (!existing?.discoverability) updates.discoverability = "off";
  if (!existing?.default_post_visibility)
    updates.default_post_visibility = DEFAULT_SOCIAL_POST_VISIBILITY;

  if (existing && Object.keys(updates).length === 0) {
    return normalizeSocialProfileRow(existing, userId);
  }

  const payload = {
    user_id: userId,
    nickname: existing?.nickname ?? seed.nickname,
    avatar_emoji: existing?.avatar_emoji ?? DEFAULT_AVATAR,
    status_message: existing?.status_message ?? "",
    display_name: existing?.display_name ?? seed.displayName,
    handle:
      existing?.handle ??
      String(
        updates.handle ??
          (await reserveAvailableHandle(admin, seed.handleCandidate, userId)),
      ),
    bio: existing?.bio ?? "",
    profile_image_path: existing?.profile_image_path ?? null,
    account_visibility: existing?.account_visibility ?? "public",
    discoverability: existing?.discoverability ?? "off",
    default_post_visibility:
      existing?.default_post_visibility ?? DEFAULT_SOCIAL_POST_VISIBILITY,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await (admin as any)
    .from("rnest_social_profiles")
    .upsert(payload)
    .select(PROFILE_SELECT)
    .single();

  if (error) throw error;
  return normalizeSocialProfileRow(data as SocialHubProfileRow, userId);
}

export async function getOwnSocialProfile(admin: any, userId: string) {
  return ensureSocialProfile(admin, userId);
}

export async function saveSocialProfile(
  admin: any,
  userId: string,
  input: {
    nickname?: unknown;
    avatarEmoji?: unknown;
    statusMessage?: unknown;
    displayName?: unknown;
    bio?: unknown;
    handle?: unknown;
    accountVisibility?: unknown;
    discoverability?: unknown;
    defaultPostVisibility?: unknown;
  },
): Promise<SocialProfile> {
  const current = await ensureSocialProfile(admin, userId);

  const nickname = cleanSocialNickname(input.nickname ?? current.nickname, 12);
  if (!nickname) {
    throw Object.assign(new Error("nickname_required"), {
      code: "nickname_required",
    });
  }

  const avatarEmoji = String(input.avatarEmoji ?? current.avatarEmoji).trim();
  if (!ALLOWED_AVATARS.has(avatarEmoji)) {
    throw Object.assign(new Error("invalid_avatar"), {
      code: "invalid_avatar",
    });
  }

  const displayName = cleanSocialNickname(
    input.displayName ?? input.nickname ?? current.displayName,
    24,
  );
  if (!displayName) {
    throw Object.assign(new Error("display_name_required"), {
      code: "display_name_required",
    });
  }

  const requestedHandle =
    input.handle == null || String(input.handle).trim() === ""
      ? current.handle
      : cleanSocialHandle(input.handle);
  if (!requestedHandle) {
    throw Object.assign(new Error("invalid_handle"), {
      code: "invalid_handle",
    });
  }

  if (nickname !== current.nickname) {
    await assertProfileFieldAvailable(
      admin,
      "nickname",
      nickname,
      userId,
      "nickname_taken",
    );
  }

  if (displayName !== current.displayName) {
    await assertProfileFieldAvailable(
      admin,
      "display_name",
      displayName,
      userId,
      "display_name_taken",
    );
  }

  const handle =
    requestedHandle === current.handle
      ? requestedHandle
      : await assertHandleAvailable(admin, requestedHandle, userId);
  const bio = cleanSocialBio(input.bio ?? current.bio);
  const statusMessage = cleanStatusMessage(
    input.statusMessage ?? current.statusMessage,
  );
  const accountVisibility = normalizeAccountVisibility(
    input.accountVisibility ?? current.accountVisibility,
  );
  const discoverability = normalizeSocialDiscoverability(
    input.discoverability ?? current.discoverability,
  );
  const defaultPostVisibility = normalizeProfileDefaultPostVisibility(
    input.defaultPostVisibility ?? current.defaultPostVisibility,
  );

  const { data, error } = await (admin as any)
    .from("rnest_social_profiles")
    .upsert({
      user_id: userId,
      nickname,
      avatar_emoji: avatarEmoji,
      status_message: statusMessage,
      handle,
      display_name: displayName,
      bio,
      profile_image_path: current.profileImagePath,
      account_visibility: accountVisibility,
      discoverability,
      default_post_visibility: defaultPostVisibility,
      updated_at: new Date().toISOString(),
    })
    .select(PROFILE_SELECT)
    .single();

  if (error) {
    const message = String(error.message ?? error).toLowerCase();
    if (
      message.includes("display_name") &&
      (message.includes("duplicate") || message.includes("unique"))
    ) {
      throw Object.assign(new Error("display_name_taken"), {
        code: "display_name_taken",
      });
    }
    if (
      message.includes("nickname") &&
      (message.includes("duplicate") || message.includes("unique"))
    ) {
      throw Object.assign(new Error("nickname_taken"), {
        code: "nickname_taken",
      });
    }
    if (message.includes("duplicate") || message.includes("unique")) {
      throw Object.assign(new Error("handle_taken"), { code: "handle_taken" });
    }
    throw error;
  }

  return normalizeSocialProfileRow(data as SocialHubProfileRow, userId);
}

export async function setSocialProfileImage(
  admin: any,
  userId: string,
  imagePath: string | null,
) {
  const current = await ensureSocialProfile(admin, userId);
  const { data, error } = await (admin as any)
    .from("rnest_social_profiles")
    .upsert({
      user_id: userId,
      nickname: current.nickname,
      avatar_emoji: current.avatarEmoji,
      status_message: current.statusMessage,
      handle: current.handle,
      display_name: current.displayName,
      bio: current.bio,
      profile_image_path: imagePath,
      account_visibility: current.accountVisibility,
      discoverability: current.discoverability,
      default_post_visibility: current.defaultPostVisibility,
      updated_at: new Date().toISOString(),
    })
    .select(PROFILE_SELECT)
    .single();

  if (error) throw error;
  return normalizeSocialProfileRow(data as SocialHubProfileRow, userId);
}

export async function loadSocialHubProfileMap(admin: any, userIds: string[]) {
  const normalizedIds = Array.from(
    new Set(userIds.map((value) => String(value ?? "").trim()).filter(Boolean)),
  );
  const map = new Map<string, SocialProfile>();
  if (normalizedIds.length === 0) return map;

  const { data } = await (admin as any)
    .from("rnest_social_profiles")
    .select(PROFILE_SELECT)
    .in("user_id", normalizedIds);

  const rowByUserId = new Map<string, SocialHubProfileRow>();
  for (const row of (data as SocialHubProfileRow[] | null) ?? []) {
    rowByUserId.set(String(row.user_id), row);
  }

  for (const userId of normalizedIds) {
    map.set(
      userId,
      normalizeSocialProfileRow(rowByUserId.get(userId) ?? null, userId),
    );
  }

  return map;
}

export function buildDefaultSocialRelationshipState(
  isSelf = false,
): SocialRelationshipState {
  return {
    isSelf,
    isFollowing: false,
    isFollowedByViewer: false,
    followsViewer: false,
    isFriend: false,
    hasIncomingFriendRequest: false,
    hasOutgoingFriendRequest: false,
  };
}

export async function getSocialRelationshipState(
  admin: any,
  viewerId: string,
  targetUserId: string,
): Promise<SocialRelationshipState> {
  if (!viewerId || !targetUserId)
    return buildDefaultSocialRelationshipState(false);
  if (viewerId === targetUserId)
    return buildDefaultSocialRelationshipState(true);

  const [
    viewerFollowsTarget,
    targetFollowsViewer,
    viewerToTargetConnection,
    targetToViewerConnection,
  ] = await Promise.all([
    (admin as any)
      .from("rnest_social_follows")
      .select("followee_user_id")
      .match({ follower_user_id: viewerId, followee_user_id: targetUserId })
      .maybeSingle(),
    (admin as any)
      .from("rnest_social_follows")
      .select("followee_user_id")
      .match({ follower_user_id: targetUserId, followee_user_id: viewerId })
      .maybeSingle(),
    (admin as any)
      .from("rnest_connections")
      .select("status")
      .match({ requester_id: viewerId, receiver_id: targetUserId })
      .maybeSingle(),
    (admin as any)
      .from("rnest_connections")
      .select("status")
      .match({ requester_id: targetUserId, receiver_id: viewerId })
      .maybeSingle(),
  ]);

  const connectionStatus =
    viewerToTargetConnection.data?.status ??
    targetToViewerConnection.data?.status ??
    null;

  return {
    isSelf: false,
    isFollowing: Boolean(viewerFollowsTarget.data),
    isFollowedByViewer: Boolean(viewerFollowsTarget.data),
    followsViewer: Boolean(targetFollowsViewer.data),
    isFriend: connectionStatus === "accepted",
    hasOutgoingFriendRequest:
      viewerToTargetConnection.data?.status === "pending",
    hasIncomingFriendRequest:
      targetToViewerConnection.data?.status === "pending",
  };
}

async function viewerSharesGroupWithTarget(
  admin: any,
  viewerId: string,
  targetUserId: string,
) {
  if (!viewerId || !targetUserId || viewerId === targetUserId) return false;

  const [viewerMemberships, targetMemberships] = await Promise.all([
    (admin as any)
      .from("rnest_social_group_members")
      .select("group_id")
      .eq("user_id", viewerId),
    (admin as any)
      .from("rnest_social_group_members")
      .select("group_id")
      .eq("user_id", targetUserId),
  ]);

  const viewerGroupIds = new Set<number>(
    (viewerMemberships.data ?? []).map((row: any) => Number(row.group_id)),
  );

  return (targetMemberships.data ?? []).some((row: any) =>
    viewerGroupIds.has(Number(row.group_id)),
  );
}

async function countAccessibleProfilePosts(
  admin: any,
  viewerId: string,
  targetUserId: string,
) {
  const relationship = await getSocialRelationshipState(
    admin,
    viewerId,
    targetUserId,
  );
  const { data: membershipRows } = await (admin as any)
    .from("rnest_social_group_members")
    .select("group_id")
    .eq("user_id", viewerId);
  const groupIds = new Set<number>(
    (membershipRows ?? []).map((row: any) => Number(row.group_id)),
  );

  const { data: postRows } = await (admin as any)
    .from("rnest_social_posts")
    .select("id, visibility, group_id")
    .eq("author_user_id", targetUserId);

  let visibleCount = 0;
  for (const row of postRows ?? []) {
    const visibility = normalizePostVisibility(row.visibility);
    if (viewerId === targetUserId) {
      visibleCount += 1;
      continue;
    }
    if (visibility === "public_internal") {
      visibleCount += 1;
      continue;
    }
    if (visibility === "followers" && relationship.isFollowing) {
      visibleCount += 1;
      continue;
    }
    if (visibility === "friends" && relationship.isFriend) {
      visibleCount += 1;
      continue;
    }
    if (visibility === "group" && groupIds.has(Number(row.group_id))) {
      visibleCount += 1;
    }
  }

  return visibleCount;
}

async function loadProfileHeaderByUserId(
  admin: any,
  targetUserId: string,
  viewerId: string,
) {
  const row = await loadProfileRow(admin, targetUserId);
  if (!row) return null;

  const [
    relationship,
    sharesGroup,
    followerCountResult,
    followingCountResult,
    postCount,
  ] = await Promise.all([
    getSocialRelationshipState(admin, viewerId, targetUserId),
    viewerSharesGroupWithTarget(admin, viewerId, targetUserId),
    (admin as any)
      .from("rnest_social_follows")
      .select("followee_user_id", { count: "exact", head: true })
      .eq("followee_user_id", targetUserId),
    (admin as any)
      .from("rnest_social_follows")
      .select("follower_user_id", { count: "exact", head: true })
      .eq("follower_user_id", targetUserId),
    countAccessibleProfilePosts(admin, viewerId, targetUserId),
  ]);

  const profile = normalizeSocialProfileRow(row, targetUserId);
  const isProfileLocked =
    profile.accountVisibility === "private" &&
    viewerId !== targetUserId &&
    !relationship.isFriend &&
    !sharesGroup;

  return {
    userId: targetUserId,
    nickname: profile.nickname,
    avatarEmoji: profile.avatarEmoji,
    handle: profile.handle,
    displayName: profile.displayName,
    bio: isProfileLocked ? "" : profile.bio,
    statusMessage: "",
    profileImageUrl: profile.profileImageUrl,
    accountVisibility: profile.accountVisibility,
    isProfileLocked,
    discoverability: profile.discoverability,
    defaultPostVisibility: profile.defaultPostVisibility,
    followerCount: Number(followerCountResult.count ?? 0),
    followingCount: Number(followingCountResult.count ?? 0),
    postCount,
    relationship,
  } satisfies SocialProfileHeader;
}

export async function getSocialProfileHeaderByHandle(
  admin: any,
  handle: string,
  viewerId: string,
): Promise<SocialProfileHeader | null> {
  const normalizedHandle = cleanSocialHandle(handle);
  if (!normalizedHandle) return null;

  const { data } = await (admin as any)
    .from("rnest_social_profiles")
    .select("user_id")
    .eq("handle", normalizedHandle)
    .maybeSingle();

  if (!data?.user_id) return null;
  return loadProfileHeaderByUserId(admin, String(data.user_id), viewerId);
}

export async function getSocialProfileHeaderByUserId(
  admin: any,
  targetUserId: string,
  viewerId: string,
) {
  return loadProfileHeaderByUserId(admin, targetUserId, viewerId);
}

export async function toggleFollow(
  admin: any,
  viewerId: string,
  targetUserId: string,
) {
  if (!viewerId || !targetUserId || viewerId === targetUserId) {
    throw Object.assign(new Error("invalid_follow_target"), {
      code: "invalid_follow_target",
    });
  }

  const [{ data: existing }, viewerProfile] = await Promise.all([
    (admin as any)
      .from("rnest_social_follows")
      .select("followee_user_id")
      .match({ follower_user_id: viewerId, followee_user_id: targetUserId })
      .maybeSingle(),
    ensureSocialProfile(admin, viewerId),
  ]);

  let isFollowing = false;
  if (existing) {
    const { error } = await (admin as any)
      .from("rnest_social_follows")
      .delete()
      .match({ follower_user_id: viewerId, followee_user_id: targetUserId });
    if (error) throw error;
  } else {
    const { error } = await (admin as any)
      .from("rnest_social_follows")
      .insert({ follower_user_id: viewerId, followee_user_id: targetUserId });
    if (error) throw error;
    isFollowing = true;

    await appendSocialEvent({
      admin,
      recipientId: targetUserId,
      actorId: viewerId,
      type: "followed",
      entityId: viewerId,
      payload: {
        nickname: viewerProfile.nickname,
        avatarEmoji: viewerProfile.avatarEmoji,
        handle: viewerProfile.handle ?? undefined,
      },
    });
  }

  const [followerCountResult, followingCountResult] = await Promise.all([
    (admin as any)
      .from("rnest_social_follows")
      .select("followee_user_id", { count: "exact", head: true })
      .eq("followee_user_id", targetUserId),
    (admin as any)
      .from("rnest_social_follows")
      .select("follower_user_id", { count: "exact", head: true })
      .eq("follower_user_id", viewerId),
  ]);

  return {
    isFollowing,
    followerCount: Number(followerCountResult.count ?? 0),
    followingCount: Number(followingCountResult.count ?? 0),
  };
}

export async function listFollowSummaries(
  admin: any,
  targetUserId: string,
  direction: "followers" | "following",
) {
  const { data: rows, error } = await (admin as any)
    .from("rnest_social_follows")
    .select(
      direction === "followers"
        ? "follower_user_id, created_at"
        : "followee_user_id, created_at",
    )
    .eq(
      direction === "followers" ? "followee_user_id" : "follower_user_id",
      targetUserId,
    )
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw error;

  const userIds = (rows ?? []).map((row: any) =>
    String(
      direction === "followers" ? row.follower_user_id : row.followee_user_id,
    ),
  );
  const profileMap = await loadSocialHubProfileMap(admin, userIds);

  return userIds.map((userId: string) =>
    buildFollowSummary(userId, profileMap.get(userId)),
  );
}

function escapeLike(value: string) {
  return value.replace(/[%_]/g, (char) => `\\${char}`);
}

export async function searchSocialProfiles(admin: any, query: string) {
  const normalizedQuery = cleanSocialNickname(query, 60).trim();
  let builder = (admin as any)
    .from("rnest_social_profiles")
    .select(PROFILE_SELECT)
    .eq("discoverability", "internal")
    .order("updated_at", { ascending: false })
    .limit(8);

  if (normalizedQuery) {
    const like = `%${escapeLike(normalizedQuery)}%`;
    builder = builder.or(
      `handle.ilike.${like},display_name.ilike.${like},nickname.ilike.${like}`,
    );
  }

  const { data, error } = await builder;
  if (error) throw error;

  return ((data as SocialHubProfileRow[] | null) ?? []).map((row) =>
    buildFollowSummary(
      String(row.user_id),
      normalizeSocialProfileRow(row, String(row.user_id)),
    ),
  );
}

export async function listDiscoverableProfiles(admin: any) {
  const { data, error } = await (admin as any)
    .from("rnest_social_profiles")
    .select(PROFILE_SELECT)
    .eq("discoverability", "internal")
    .order("updated_at", { ascending: false })
    .limit(8);

  if (error) throw error;

  return ((data as SocialHubProfileRow[] | null) ?? []).map((row) =>
    buildFollowSummary(
      String(row.user_id),
      normalizeSocialProfileRow(row, String(row.user_id)),
    ),
  );
}

// ── 어드민: 소셜 계정 정지 여부 확인 ────────────────────────────────
export async function checkSocialSuspension(
  admin: any,
  userId: string,
): Promise<boolean> {
  const { data } = await (admin as any)
    .from("rnest_social_profiles")
    .select("is_suspended")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.is_suspended === true;
}
