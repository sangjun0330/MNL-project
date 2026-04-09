import type {
  FeedPage,
  SocialPost,
  SocialPostComment,
  SocialPostVisibility,
} from "@/types/social";
import { appendSocialEvent } from "@/lib/server/socialGroups";
import {
  buildSocialAuthorProfile,
  ensureSocialProfile,
  getSocialProfileHeaderByHandle,
  loadSocialHubProfileMap,
} from "@/lib/server/socialHub";
import { isOwnedSocialPostImagePath } from "@/lib/server/socialPostImageStore";

const INVISIBLE_UNSAFE_CHARS =
  /[\u0000-\u001f\u007f-\u009f\u200b-\u200d\u2060\ufeff\u202a-\u202e\u2066-\u2069]/g;

const ALLOWED_TAGS = [
  "야간후회복",
  "수면기록",
  "오프데이",
  "번아웃주의",
  "활력",
  "꿀휴식",
  "나이트회복",
  "감사한하루",
  "소소한일상",
  "간호사일상",
];

type FeedScope = "following" | "explore" | "profile" | "saved" | "liked";

type ViewerAccessContext = {
  userId: string;
  followingIds: Set<string>;
  friendIds: Set<string>;
  groupIds: Set<number>;
};

type PostRow = {
  id: number;
  author_user_id: string;
  body: string;
  image_path: string | null;
  tags: string[] | null;
  visibility: SocialPostVisibility;
  group_id: number | null;
  like_count: number | null;
  comment_count: number | null;
  created_at: string;
  updated_at: string | null;
};

type CommentRow = {
  id: number;
  post_id: number;
  author_user_id: string;
  parent_id: number | null;
  body: string;
  created_at: string;
  updated_at: string | null;
  is_edited: boolean | null;
};

function normalizeVisibility(value: unknown): SocialPostVisibility {
  if (value === "public_internal") return "public_internal";
  if (value === "followers") return "followers";
  if (value === "group") return "group";
  return "friends";
}

function buildImageUrl(imagePath: string | null): string | null {
  if (!imagePath) return null;
  const base = String(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
  if (!base) return null;
  return `${base}/storage/v1/object/public/social-post-images/${imagePath}`;
}

export function cleanPostBody(value: unknown): string {
  const raw = String(value ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(INVISIBLE_UNSAFE_CHARS, "")
    .replace(/\r/g, "")
    .replace(/\t/g, " ")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return Array.from(raw).slice(0, 500).join("");
}

export function cleanCommentBody(value: unknown): string {
  const raw = String(value ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(INVISIBLE_UNSAFE_CHARS, "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(raw).slice(0, 200).join("");
}

export function cleanPostTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((tag) => String(tag ?? "").trim())
    .filter((tag) => ALLOWED_TAGS.includes(tag))
    .slice(0, 5);
}

async function buildViewerAccessContext(admin: any, userId: string): Promise<ViewerAccessContext> {
  const [followRows, connectionRows, membershipRows] = await Promise.all([
    (admin as any)
      .from("rnest_social_follows")
      .select("followee_user_id")
      .eq("follower_user_id", userId),
    (admin as any)
      .from("rnest_connections")
      .select("requester_id, receiver_id")
      .eq("status", "accepted")
      .or(`requester_id.eq.${userId},receiver_id.eq.${userId}`),
    (admin as any)
      .from("rnest_social_group_members")
      .select("group_id")
      .eq("user_id", userId),
  ]);

  const followingIds = new Set<string>((followRows.data ?? []).map((row: any) => String(row.followee_user_id)));
  const friendIds = new Set<string>();
  for (const row of connectionRows.data ?? []) {
    const requesterId = String(row.requester_id);
    const receiverId = String(row.receiver_id);
    friendIds.add(requesterId === userId ? receiverId : requesterId);
  }
  const groupIds = new Set<number>((membershipRows.data ?? []).map((row: any) => Number(row.group_id)));

  return { userId, followingIds, friendIds, groupIds };
}

function canUserAccessPostWithContext(postRow: any, context: ViewerAccessContext): boolean {
  const authorUserId = String(postRow.author_user_id);
  if (authorUserId === context.userId) return true;

  const visibility = normalizeVisibility(postRow.visibility);
  if (visibility === "public_internal") return true;
  if (visibility === "followers") return context.followingIds.has(authorUserId);
  if (visibility === "friends") return context.friendIds.has(authorUserId);
  if (visibility === "group") return context.groupIds.has(Number(postRow.group_id));
  return false;
}

export async function canUserAccessPost(admin: any, postRow: any, userId: string) {
  const context = await buildViewerAccessContext(admin, userId);
  return canUserAccessPostWithContext(postRow, context);
}

async function loadGroupNameMap(admin: any, groupIds: number[]) {
  const map = new Map<number, string>();
  const normalized = Array.from(new Set(groupIds.filter((value) => Number.isFinite(value) && value > 0)));
  if (normalized.length === 0) return map;

  const { data } = await (admin as any)
    .from("rnest_social_groups")
    .select("id, name")
    .in("id", normalized);

  for (const row of data ?? []) {
    map.set(Number(row.id), String(row.name ?? ""));
  }

  return map;
}

async function loadPostInteractionMaps(admin: any, userId: string, postIds: number[]) {
  const normalized = Array.from(new Set(postIds.filter((value) => Number.isFinite(value) && value > 0)));
  if (normalized.length === 0) {
    return {
      likedPostIds: new Set<number>(),
      savedPostIds: new Set<number>(),
      saveCountMap: new Map<number, number>(),
    };
  }

  const [likeRows, saveRows, saveCountRows] = await Promise.all([
    (admin as any)
      .from("rnest_social_post_likes")
      .select("post_id")
      .eq("user_id", userId)
      .in("post_id", normalized),
    (admin as any)
      .from("rnest_social_post_saves")
      .select("post_id")
      .eq("user_id", userId)
      .in("post_id", normalized),
    (admin as any)
      .from("rnest_social_post_saves")
      .select("post_id")
      .in("post_id", normalized),
  ]);

  const likedPostIds = new Set<number>((likeRows.data ?? []).map((row: any) => Number(row.post_id)));
  const savedPostIds = new Set<number>((saveRows.data ?? []).map((row: any) => Number(row.post_id)));
  const saveCountMap = new Map<number, number>();

  for (const row of saveCountRows.data ?? []) {
    const postId = Number(row.post_id);
    saveCountMap.set(postId, Number(saveCountMap.get(postId) ?? 0) + 1);
  }

  return { likedPostIds, savedPostIds, saveCountMap };
}

function buildSocialPost(
  row: PostRow,
  profileMap: Map<string, ReturnType<typeof ensureSocialProfile> extends Promise<infer T> ? T : never>,
  likedPostIds: Set<number>,
  savedPostIds: Set<number>,
  saveCountMap: Map<number, number>,
  groupNameMap: Map<number, string>
): SocialPost {
  const authorUserId = String(row.author_user_id);
  const profile = profileMap.get(authorUserId);
  const authorProfile = buildSocialAuthorProfile(authorUserId, profile);
  const groupId = row.group_id ? Number(row.group_id) : null;

  return {
    id: Number(row.id),
    authorUserId,
    authorProfile,
    body: String(row.body ?? ""),
    imagePath: row.image_path ? String(row.image_path) : null,
    imageUrl: buildImageUrl(row.image_path ? String(row.image_path) : null),
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    visibility: normalizeVisibility(row.visibility),
    groupId,
    groupName: groupId ? groupNameMap.get(groupId) ?? null : null,
    likeCount: Number(row.like_count ?? 0),
    commentCount: Number(row.comment_count ?? 0),
    saveCount: Number(saveCountMap.get(Number(row.id)) ?? 0),
    isLiked: likedPostIds.has(Number(row.id)),
    isSaved: savedPostIds.has(Number(row.id)),
    createdAt: String(row.created_at ?? ""),
    updatedAt: row.updated_at ? String(row.updated_at) : undefined,
  };
}

async function hydratePosts(admin: any, userId: string, rows: PostRow[]): Promise<SocialPost[]> {
  if (rows.length === 0) return [];
  const authorIds = Array.from(new Set(rows.map((row) => String(row.author_user_id))));
  const groupIds = Array.from(
    new Set(rows.map((row) => (row.group_id ? Number(row.group_id) : null)).filter(Boolean))
  ) as number[];
  const postIds = rows.map((row) => Number(row.id));

  const [profileMap, interactionMaps, groupNameMap] = await Promise.all([
    loadSocialHubProfileMap(admin, authorIds),
    loadPostInteractionMaps(admin, userId, postIds),
    loadGroupNameMap(admin, groupIds),
  ]);

  return rows.map((row) =>
    buildSocialPost(
      row,
      profileMap,
      interactionMaps.likedPostIds,
      interactionMaps.savedPostIds,
      interactionMaps.saveCountMap,
      groupNameMap
    )
  );
}

async function resolveTargetUserIdForScope(admin: any, handle?: string | null, currentUserId?: string) {
  if (!handle) return currentUserId ?? null;
  const header = currentUserId
    ? await getSocialProfileHeaderByHandle(admin, handle, currentUserId)
    : null;
  return header?.userId ?? null;
}

export async function getFeedPage(
  admin: any,
  userId: string,
  options: {
    scope?: FeedScope;
    cursor?: string | null;
    limit?: number;
    handle?: string | null;
  } = {}
): Promise<FeedPage> {
  const scope = options.scope ?? "following";
  const limit = options.limit ?? 20;
  const cursor = options.cursor ?? null;
  const context = await buildViewerAccessContext(admin, userId);

  const selectColumns =
    "id, author_user_id, body, image_path, tags, visibility, group_id, like_count, comment_count, created_at, updated_at";
  let rawRows: PostRow[] = [];

  if (scope === "saved" || scope === "liked") {
    const table = scope === "saved" ? "rnest_social_post_saves" : "rnest_social_post_likes";
    const idColumn = scope === "saved" ? "post_id" : "post_id";
    const { data: relationRows } = await (admin as any)
      .from(table)
      .select(`${idColumn}, created_at`)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(200);

    const candidatePostIds = (relationRows ?? []).map((row: any) => Number(row.post_id)).filter(Boolean);
    if (candidatePostIds.length === 0) {
      return { posts: [], nextCursor: null };
    }

    let query = (admin as any)
      .from("rnest_social_posts")
      .select(selectColumns)
      .in("id", candidatePostIds)
      .order("created_at", { ascending: false })
      .limit(limit + 1);

    if (cursor) {
      query = query.lt("created_at", cursor);
    }

    const { data, error } = await query;
    if (error) throw error;
    rawRows = (data as PostRow[] | null) ?? [];
  } else if (scope === "profile") {
    const targetUserId = await resolveTargetUserIdForScope(admin, options.handle, userId);
    if (!targetUserId) {
      return { posts: [], nextCursor: null };
    }

    let query = (admin as any)
      .from("rnest_social_posts")
      .select(selectColumns)
      .eq("author_user_id", targetUserId)
      .order("created_at", { ascending: false })
      .limit(limit + 1);

    if (cursor) {
      query = query.lt("created_at", cursor);
    }

    const { data, error } = await query;
    if (error) throw error;
    rawRows = (data as PostRow[] | null) ?? [];
  } else if (scope === "explore") {
    let query = (admin as any)
      .from("rnest_social_posts")
      .select(selectColumns)
      .eq("visibility", "public_internal")
      .order("created_at", { ascending: false })
      .limit(limit * 3);

    if (cursor) {
      query = query.lt("created_at", cursor);
    }

    const { data, error } = await query;
    if (error) throw error;
    rawRows = (data as PostRow[] | null) ?? [];
  } else {
    const authorIds = Array.from(new Set([userId, ...context.followingIds, ...context.friendIds]));
    const groupIds = Array.from(context.groupIds);
    let query = (admin as any)
      .from("rnest_social_posts")
      .select(selectColumns)
      .order("created_at", { ascending: false })
      .limit(limit * 3);

    if (cursor) {
      query = query.lt("created_at", cursor);
    }

    const orParts: string[] = [`author_user_id.eq.${userId}`];
    if (authorIds.length > 0) {
      orParts.push(`author_user_id.in.(${authorIds.join(",")})`);
    }
    if (groupIds.length > 0) {
      orParts.push(`group_id.in.(${groupIds.join(",")})`);
    }
    query = query.or(orParts.join(","));

    const { data, error } = await query;
    if (error) throw error;
    rawRows = (data as PostRow[] | null) ?? [];
  }

  const authorIds = Array.from(new Set(rawRows.map((row) => String(row.author_user_id))));
  const profileMap = await loadSocialHubProfileMap(admin, authorIds);

  const filteredRows = rawRows.filter((row) => {
    if (!canUserAccessPostWithContext(row, context)) return false;
    if (scope === "explore") {
      const profile = profileMap.get(String(row.author_user_id));
      return profile?.discoverability === "internal" || String(row.author_user_id) === userId;
    }
    return true;
  });

  const pageRows = filteredRows.slice(0, limit);
  const hasMore = filteredRows.length > limit;
  const posts = await hydratePosts(admin, userId, pageRows);
  const nextCursor = hasMore ? String(pageRows[pageRows.length - 1]?.created_at ?? "") : null;
  return { posts, nextCursor };
}

export async function getFriendFeed(
  admin: any,
  userId: string,
  cursor?: string | null,
  limit = 20
) {
  return getFeedPage(admin, userId, { scope: "following", cursor, limit });
}

export async function searchSocialPosts(
  admin: any,
  userId: string,
  query: string,
  limit = 8
) {
  const cleanedQuery = cleanPostBody(query).trim();
  let builder = (admin as any)
    .from("rnest_social_posts")
    .select("id, author_user_id, body, image_path, tags, visibility, group_id, like_count, comment_count, created_at, updated_at")
    .eq("visibility", "public_internal")
    .order("created_at", { ascending: false })
    .limit(limit * 3);

  if (cleanedQuery) {
    builder = builder.ilike("body", `%${cleanedQuery.replace(/[%_]/g, "\\$&")}%`);
  }

  const { data, error } = await builder;
  if (error) throw error;

  const rows = (data as PostRow[] | null) ?? [];
  const profileMap = await loadSocialHubProfileMap(
    admin,
    Array.from(new Set(rows.map((row) => String(row.author_user_id))))
  );
  const filtered = rows
    .filter((row) => {
      const profile = profileMap.get(String(row.author_user_id));
      return profile?.discoverability === "internal" || String(row.author_user_id) === userId;
    })
    .slice(0, limit);

  return hydratePosts(admin, userId, filtered);
}

export async function getPostById(admin: any, postId: number, userId: string) {
  const { data, error } = await (admin as any)
    .from("rnest_social_posts")
    .select("id, author_user_id, body, image_path, tags, visibility, group_id, like_count, comment_count, created_at, updated_at")
    .eq("id", postId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const accessible = await canUserAccessPost(admin, data, userId);
  if (!accessible) return null;

  const posts = await hydratePosts(admin, userId, [data as PostRow]);
  return posts[0] ?? null;
}

async function notifyFollowersAboutPost(admin: any, userId: string, post: SocialPost) {
  if (post.visibility === "group" || post.visibility === "friends") return;

  const [{ data: followerRows }, actorProfile] = await Promise.all([
    (admin as any)
      .from("rnest_social_follows")
      .select("follower_user_id")
      .eq("followee_user_id", userId),
    ensureSocialProfile(admin, userId),
  ]);

  const preview = post.body.length > 80 ? `${post.body.slice(0, 80)}…` : post.body;
  for (const row of followerRows ?? []) {
    const recipientId = String(row.follower_user_id);
    if (!recipientId || recipientId === userId) continue;
    await appendSocialEvent({
      admin,
      recipientId,
      actorId: userId,
      type: "new_post",
      entityId: String(post.id),
      payload: {
        nickname: actorProfile.nickname,
        avatarEmoji: actorProfile.avatarEmoji,
        handle: actorProfile.handle ?? undefined,
        postId: post.id,
        bodyPreview: preview,
      },
    });
  }
}

export async function createPost(
  admin: any,
  userId: string,
  body: string,
  opts: {
    imagePath?: string | null;
    tags?: string[];
    groupId?: number | null;
    visibility?: SocialPostVisibility;
  } = {}
): Promise<SocialPost> {
  const visibility = normalizeVisibility(opts.visibility ?? "friends");
  const groupId = visibility === "group" ? (opts.groupId ?? null) : null;
  const imagePath = opts.imagePath ? String(opts.imagePath).replace(/^\/+/, "").trim() : null;

  if (imagePath && !isOwnedSocialPostImagePath(userId, imagePath)) {
    throw Object.assign(new Error("invalid_image_path"), { code: "invalid_image_path" });
  }

  if (visibility === "group" && groupId) {
    const { data: memberRow } = await (admin as any)
      .from("rnest_social_group_members")
      .select("user_id")
      .eq("group_id", groupId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!memberRow) {
      throw Object.assign(new Error("not_group_member"), { code: "not_group_member" });
    }
  }

  const { data, error } = await (admin as any)
    .from("rnest_social_posts")
    .insert({
      author_user_id: userId,
      body,
      image_path: imagePath,
      tags: opts.tags ?? [],
      visibility,
      group_id: groupId,
    })
    .select("id, author_user_id, body, image_path, tags, visibility, group_id, like_count, comment_count, created_at, updated_at")
    .single();

  if (error) throw error;

  const posts = await hydratePosts(admin, userId, [data as PostRow]);
  const post = posts[0];
  if (!post) throw new Error("failed_to_hydrate_post");

  await notifyFollowersAboutPost(admin, userId, post);
  return post;
}

export async function deletePost(admin: any, postId: number, userId: string, isAdmin = false) {
  let query = (admin as any)
    .from("rnest_social_posts")
    .delete()
    .eq("id", postId);

  if (!isAdmin) {
    query = query.eq("author_user_id", userId);
  }

  const { error } = await query;
  if (error) throw error;
}

async function updatePostLikeCount(admin: any, postId: number) {
  const { count } = await (admin as any)
    .from("rnest_social_post_likes")
    .select("post_id", { count: "exact", head: true })
    .eq("post_id", postId);
  const likeCount = Number(count ?? 0);
  await (admin as any)
    .from("rnest_social_posts")
    .update({ like_count: likeCount })
    .eq("id", postId);
  return likeCount;
}

export async function togglePostLike(admin: any, postId: number, userId: string) {
  const [{ data: existing }, { data: postRow }, actorProfile] = await Promise.all([
    (admin as any)
      .from("rnest_social_post_likes")
      .select("post_id")
      .eq("post_id", postId)
      .eq("user_id", userId)
      .maybeSingle(),
    (admin as any)
      .from("rnest_social_posts")
      .select("id, author_user_id, body")
      .eq("id", postId)
      .maybeSingle(),
    ensureSocialProfile(admin, userId),
  ]);

  let liked = false;
  if (existing) {
    const { error } = await (admin as any)
      .from("rnest_social_post_likes")
      .delete()
      .eq("post_id", postId)
      .eq("user_id", userId);
    if (error) throw error;
  } else {
    const { error } = await (admin as any)
      .from("rnest_social_post_likes")
      .insert({ post_id: postId, user_id: userId });
    if (error && error.code !== "23505") throw error;
    liked = true;
  }

  const count = await updatePostLikeCount(admin, postId);

  if (liked && postRow?.author_user_id && String(postRow.author_user_id) !== userId) {
    const preview = String(postRow.body ?? "").slice(0, 80);
    await appendSocialEvent({
      admin,
      recipientId: String(postRow.author_user_id),
      actorId: userId,
      type: "post_liked",
      entityId: String(postId),
      payload: {
        nickname: actorProfile.nickname,
        avatarEmoji: actorProfile.avatarEmoji,
        handle: actorProfile.handle ?? undefined,
        postId,
        bodyPreview: preview,
      },
    });
  }

  return { liked, count };
}

export async function togglePostSave(admin: any, postId: number, userId: string) {
  const { data: existing } = await (admin as any)
    .from("rnest_social_post_saves")
    .select("post_id")
    .eq("post_id", postId)
    .eq("user_id", userId)
    .maybeSingle();

  let saved = false;
  if (existing) {
    const { error } = await (admin as any)
      .from("rnest_social_post_saves")
      .delete()
      .eq("post_id", postId)
      .eq("user_id", userId);
    if (error) throw error;
  } else {
    const { error } = await (admin as any)
      .from("rnest_social_post_saves")
      .insert({ post_id: postId, user_id: userId });
    if (error && error.code !== "23505") throw error;
    saved = true;
  }

  const { count } = await (admin as any)
    .from("rnest_social_post_saves")
    .select("post_id", { count: "exact", head: true })
    .eq("post_id", postId);

  return { saved, count: Number(count ?? 0) };
}

async function buildCommentLikeMaps(admin: any, userId: string, commentIds: number[]) {
  const normalized = Array.from(new Set(commentIds.filter((value) => Number.isFinite(value) && value > 0)));
  if (normalized.length === 0) {
    return {
      likedCommentIds: new Set<number>(),
      likeCountMap: new Map<number, number>(),
    };
  }

  const [likeRows, viewerLikeRows] = await Promise.all([
    (admin as any)
      .from("rnest_social_comment_likes")
      .select("comment_id")
      .in("comment_id", normalized),
    (admin as any)
      .from("rnest_social_comment_likes")
      .select("comment_id")
      .eq("user_id", userId)
      .in("comment_id", normalized),
  ]);

  const likeCountMap = new Map<number, number>();
  for (const row of likeRows.data ?? []) {
    const commentId = Number(row.comment_id);
    likeCountMap.set(commentId, Number(likeCountMap.get(commentId) ?? 0) + 1);
  }

  return {
    likedCommentIds: new Set<number>((viewerLikeRows.data ?? []).map((row: any) => Number(row.comment_id))),
    likeCountMap,
  };
}

function buildCommentEntity(
  row: CommentRow,
  profileMap: Map<string, ReturnType<typeof ensureSocialProfile> extends Promise<infer T> ? T : never>,
  likedCommentIds: Set<number>,
  likeCountMap: Map<number, number>,
  replyCountMap: Map<number, number>,
  replies: SocialPostComment[]
): SocialPostComment {
  const authorUserId = String(row.author_user_id);
  const authorProfile = buildSocialAuthorProfile(authorUserId, profileMap.get(authorUserId));
  return {
    id: Number(row.id),
    postId: Number(row.post_id),
    authorUserId,
    parentId: row.parent_id ? Number(row.parent_id) : null,
    authorProfile,
    body: String(row.body ?? ""),
    createdAt: String(row.created_at ?? ""),
    updatedAt: row.updated_at ? String(row.updated_at) : null,
    isEdited: Boolean(row.is_edited),
    likeCount: Number(likeCountMap.get(Number(row.id)) ?? 0),
    isLiked: likedCommentIds.has(Number(row.id)),
    replyCount: Number(replyCountMap.get(Number(row.id)) ?? 0),
    replies,
  };
}

export async function getPostComments(
  admin: any,
  postId: number,
  userId: string,
  cursor?: string | null,
  limit = 30
): Promise<{ comments: SocialPostComment[]; nextCursor: string | null }> {
  let query = (admin as any)
    .from("rnest_social_post_comments")
    .select("id, post_id, author_user_id, parent_id, body, created_at, updated_at, is_edited")
    .eq("post_id", postId)
    .is("parent_id", null)
    .order("created_at", { ascending: true })
    .limit(limit + 1);

  if (cursor) {
    query = query.gt("created_at", cursor);
  }

  const { data, error } = await query;
  if (error) throw error;

  const topLevelRows = (data as CommentRow[] | null) ?? [];
  const hasMore = topLevelRows.length > limit;
  const pageRows = hasMore ? topLevelRows.slice(0, limit) : topLevelRows;

  if (pageRows.length === 0) {
    return { comments: [], nextCursor: null };
  }

  const parentIds = pageRows.map((row) => Number(row.id));
  const { data: replyRowsData, error: replyError } = await (admin as any)
    .from("rnest_social_post_comments")
    .select("id, post_id, author_user_id, parent_id, body, created_at, updated_at, is_edited")
    .eq("post_id", postId)
    .in("parent_id", parentIds)
    .order("created_at", { ascending: true });

  if (replyError) throw replyError;

  const replyRows = (replyRowsData as CommentRow[] | null) ?? [];
  const allRows = [...pageRows, ...replyRows];
  const authorIds = Array.from(new Set(allRows.map((row) => String(row.author_user_id))));
  const commentIds = allRows.map((row) => Number(row.id));
  const [profileMap, commentLikeMaps] = await Promise.all([
    loadSocialHubProfileMap(admin, authorIds),
    buildCommentLikeMaps(admin, userId, commentIds),
  ]);

  const replyCountMap = new Map<number, number>();
  for (const row of replyRows) {
    const parentId = Number(row.parent_id);
    replyCountMap.set(parentId, Number(replyCountMap.get(parentId) ?? 0) + 1);
  }

  const repliesByParentId = new Map<number, SocialPostComment[]>();
  for (const row of replyRows) {
    const parentId = Number(row.parent_id);
    const nextReplies = repliesByParentId.get(parentId) ?? [];
    nextReplies.push(
      buildCommentEntity(
        row,
        profileMap,
        commentLikeMaps.likedCommentIds,
        commentLikeMaps.likeCountMap,
        new Map(),
        []
      )
    );
    repliesByParentId.set(parentId, nextReplies);
  }

  const comments = pageRows.map((row) =>
    buildCommentEntity(
      row,
      profileMap,
      commentLikeMaps.likedCommentIds,
      commentLikeMaps.likeCountMap,
      replyCountMap,
      repliesByParentId.get(Number(row.id)) ?? []
    )
  );

  const nextCursor = hasMore ? String(pageRows[pageRows.length - 1]?.created_at ?? "") : null;
  return { comments, nextCursor };
}

async function updatePostCommentCount(admin: any, postId: number) {
  const { count } = await (admin as any)
    .from("rnest_social_post_comments")
    .select("id", { count: "exact", head: true })
    .eq("post_id", postId);
  await (admin as any)
    .from("rnest_social_posts")
    .update({ comment_count: Number(count ?? 0) })
    .eq("id", postId);
}

export async function addComment(
  admin: any,
  postId: number,
  userId: string,
  body: string,
  options: { parentId?: number | null } = {}
): Promise<SocialPostComment> {
  let parentId: number | null = null;
  if (options.parentId && Number.isFinite(options.parentId) && Number(options.parentId) > 0) {
    const { data: parentComment } = await (admin as any)
      .from("rnest_social_post_comments")
      .select("id, post_id, parent_id, author_user_id")
      .eq("id", Number(options.parentId))
      .maybeSingle();

    if (!parentComment || Number(parentComment.post_id) !== postId || parentComment.parent_id) {
      throw Object.assign(new Error("invalid_parent_comment"), { code: "invalid_parent_comment" });
    }
    parentId = Number(parentComment.id);
  }

  const [{ data: row, error }, postResult, actorProfile] = await Promise.all([
    (admin as any)
      .from("rnest_social_post_comments")
      .insert({
        post_id: postId,
        author_user_id: userId,
        parent_id: parentId,
        body,
      })
      .select("id, post_id, author_user_id, parent_id, body, created_at, updated_at, is_edited")
      .single(),
    (admin as any)
      .from("rnest_social_posts")
      .select("id, author_user_id, body")
      .eq("id", postId)
      .maybeSingle(),
    ensureSocialProfile(admin, userId),
  ]);

  if (error) throw error;

  await updatePostCommentCount(admin, postId);

  const comment = buildCommentEntity(
    row as CommentRow,
    new Map([[userId, actorProfile]]),
    new Set(),
    new Map(),
    new Map(),
    []
  );

  const postAuthorId = String(postResult.data?.author_user_id ?? "");
  const postPreview = String(postResult.data?.body ?? "").slice(0, 80);

  if (parentId) {
    const { data: parentRow } = await (admin as any)
      .from("rnest_social_post_comments")
      .select("author_user_id")
      .eq("id", parentId)
      .maybeSingle();
    const parentAuthorId = String(parentRow?.author_user_id ?? "");
    if (parentAuthorId && parentAuthorId !== userId) {
      await appendSocialEvent({
        admin,
        recipientId: parentAuthorId,
        actorId: userId,
        type: "comment_replied",
        entityId: String(postId),
        payload: {
          nickname: actorProfile.nickname,
          avatarEmoji: actorProfile.avatarEmoji,
          handle: actorProfile.handle ?? undefined,
          postId,
          commentId: comment.id,
          bodyPreview: postPreview,
        },
      });
    }
  } else if (postAuthorId && postAuthorId !== userId) {
    await appendSocialEvent({
      admin,
      recipientId: postAuthorId,
      actorId: userId,
      type: "post_commented",
      entityId: String(postId),
      payload: {
        nickname: actorProfile.nickname,
        avatarEmoji: actorProfile.avatarEmoji,
        handle: actorProfile.handle ?? undefined,
        postId,
        commentId: comment.id,
        bodyPreview: postPreview,
      },
    });
  }

  return comment;
}

export async function deleteComment(admin: any, commentId: number, userId: string, isAdmin = false) {
  const { data: comment } = await (admin as any)
    .from("rnest_social_post_comments")
    .select("id, post_id, author_user_id")
    .eq("id", commentId)
    .maybeSingle();

  if (!comment) return;
  if (!isAdmin && String(comment.author_user_id) !== userId) {
    throw Object.assign(new Error("forbidden"), { code: "forbidden" });
  }

  const { error } = await (admin as any)
    .from("rnest_social_post_comments")
    .delete()
    .eq("id", commentId);
  if (error) throw error;

  await updatePostCommentCount(admin, Number(comment.post_id));
}

export async function toggleCommentLike(admin: any, commentId: number, userId: string) {
  const [{ data: existing }] = await Promise.all([
    (admin as any)
      .from("rnest_social_comment_likes")
      .select("comment_id")
      .eq("comment_id", commentId)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  let liked = false;
  if (existing) {
    const { error } = await (admin as any)
      .from("rnest_social_comment_likes")
      .delete()
      .eq("comment_id", commentId)
      .eq("user_id", userId);
    if (error) throw error;
  } else {
    const { error } = await (admin as any)
      .from("rnest_social_comment_likes")
      .insert({ comment_id: commentId, user_id: userId });
    if (error && error.code !== "23505") throw error;
    liked = true;
  }

  const { count } = await (admin as any)
    .from("rnest_social_comment_likes")
    .select("comment_id", { count: "exact", head: true })
    .eq("comment_id", commentId);

  return {
    liked,
    count: Number(count ?? 0),
  };
}
