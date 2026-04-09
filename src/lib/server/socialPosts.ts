import type { FeedPage, SocialPost, SocialPostComment } from "@/types/social";
import { loadSocialGroupProfileMap } from "@/lib/server/socialGroups";

const INVISIBLE_UNSAFE_CHARS = /[\u0000-\u001f\u007f-\u009f\u200b-\u200d\u2060\ufeff\u202a-\u202e\u2066-\u2069]/g;

const ALLOWED_TAGS = [
  "야간후회복", "수면기록", "오프데이", "번아웃주의", "활력", "꿀휴식",
  "나이트회복", "감사한하루", "소소한일상", "간호사일상",
];

// ── 공개 이미지 URL 생성 ───────────────────────────────────────────
function buildImageUrl(imagePath: string | null): string | null {
  if (!imagePath) return null;
  const base = String(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
  if (!base) return null;
  return `${base}/storage/v1/object/public/social-post-images/${imagePath}`;
}

// ── 입력 정제 ─────────────────────────────────────────────────────
export function cleanPostBody(value: unknown): string {
  const raw = String(value ?? "")
    .replace(/<[^>]*>/g, "")
    .replace(INVISIBLE_UNSAFE_CHARS, "")
    .replace(/\r/g, "")
    .replace(/\t/g, " ")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0 || true)
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
    .map((t) => String(t ?? "").trim())
    .filter((t) => ALLOWED_TAGS.includes(t))
    .slice(0, 5);
}

// ── 게시글 접근 권한 확인 ──────────────────────────────────────────
async function canUserAccessPost(
  admin: any,
  postRow: any,
  userId: string
): Promise<boolean> {
  if (String(postRow.author_user_id) === userId) return true;

  if (postRow.visibility === "friends") {
    const { data } = await (admin as any)
      .from("rnest_connections")
      .select("id")
      .eq("status", "accepted")
      .or(
        `and(requester_id.eq.${postRow.author_user_id},receiver_id.eq.${userId}),` +
        `and(receiver_id.eq.${postRow.author_user_id},requester_id.eq.${userId})`
      )
      .limit(1)
      .maybeSingle();
    return data !== null;
  }

  if (postRow.visibility === "group" && postRow.group_id) {
    const { data } = await (admin as any)
      .from("rnest_social_group_members")
      .select("user_id")
      .eq("group_id", Number(postRow.group_id))
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    return data !== null;
  }

  return false;
}

// ── post 행 → SocialPost 변환 ──────────────────────────────────────
function buildSocialPost(
  row: any,
  profileMap: Map<string, { nickname: string; avatarEmoji: string; statusMessage: string }>,
  likedPostIds: Set<number>,
  groupNameMap: Map<number, string>
): SocialPost {
  const profile = profileMap.get(String(row.author_user_id));
  const groupId = row.group_id ? Number(row.group_id) : null;
  return {
    id: Number(row.id),
    authorUserId: String(row.author_user_id),
    authorProfile: {
      nickname: profile?.nickname ?? "",
      avatarEmoji: profile?.avatarEmoji ?? "🐧",
    },
    body: String(row.body ?? ""),
    imagePath: row.image_path ? String(row.image_path) : null,
    imageUrl: buildImageUrl(row.image_path ? String(row.image_path) : null),
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    visibility: row.visibility === "group" ? "group" : "friends",
    groupId,
    groupName: groupId ? (groupNameMap.get(groupId) ?? null) : null,
    likeCount: Number(row.like_count ?? 0),
    commentCount: Number(row.comment_count ?? 0),
    isLiked: likedPostIds.has(Number(row.id)),
    createdAt: String(row.created_at ?? ""),
  };
}

// ── 피드 조회 ─────────────────────────────────────────────────────
export async function getFriendFeed(
  admin: any,
  userId: string,
  cursor?: string | null,
  limit = 20
): Promise<FeedPage> {
  // 1. 친구 IDs 수집
  const { data: connRows } = await (admin as any)
    .from("rnest_connections")
    .select("requester_id, receiver_id")
    .eq("status", "accepted")
    .or(`requester_id.eq.${userId},receiver_id.eq.${userId}`);

  const friendIds = new Set<string>();
  for (const row of connRows ?? []) {
    const other = String(row.requester_id) === userId
      ? String(row.receiver_id)
      : String(row.requester_id);
    if (other && other !== userId) friendIds.add(other);
  }

  // 2. 내 그룹 IDs 수집
  const { data: memberRows } = await (admin as any)
    .from("rnest_social_group_members")
    .select("group_id")
    .eq("user_id", userId);

  const myGroupIds = (memberRows ?? []).map((r: any) => Number(r.group_id)).filter(Boolean);

  // 3. 피드 쿼리
  const friendIdArr = Array.from(friendIds);

  let query = (admin as any)
    .from("rnest_social_posts")
    .select("id, author_user_id, body, image_path, tags, visibility, group_id, like_count, comment_count, created_at")
    .order("created_at", { ascending: false })
    .limit(limit + 1);

  if (cursor) {
    query = query.lt("created_at", cursor);
  }

  // 필터: 본인 + 친구 공개 + 그룹 공개
  const orConditions: string[] = [
    `author_user_id.eq.${userId}`,
  ];
  if (friendIdArr.length > 0) {
    // visibility='friends' 이고 친구 게시글
    orConditions.push(
      `and(visibility.eq.friends,author_user_id.in.(${friendIdArr.join(",")}))`
    );
  }
  if (myGroupIds.length > 0) {
    // visibility='group' 이고 내 그룹 게시글
    orConditions.push(
      `and(visibility.eq.group,group_id.in.(${myGroupIds.join(",")}))`
    );
  }

  query = query.or(orConditions.join(","));

  const { data: postRows, error: postErr } = await query;
  if (postErr) throw postErr;

  const rows = postRows ?? [];
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;

  if (pageRows.length === 0) {
    return { posts: [], nextCursor: null };
  }

  // 4. 작성자 프로필 일괄 로드
  const authorIds: string[] = Array.from(new Set(pageRows.map((r: any) => String(r.author_user_id))));
  const profileMap = await loadSocialGroupProfileMap(admin, authorIds);

  // 5. 좋아요 여부 확인
  const postIds = pageRows.map((r: any) => Number(r.id));
  const { data: likeRows } = await (admin as any)
    .from("rnest_social_post_likes")
    .select("post_id")
    .eq("user_id", userId)
    .in("post_id", postIds);
  const likedPostIds = new Set<number>((likeRows ?? []).map((r: any) => Number(r.post_id)));

  // 6. 그룹명 로드
  const groupIdsInFeed = Array.from(
    new Set(pageRows.map((r: any) => r.group_id ? Number(r.group_id) : null).filter(Boolean))
  ) as number[];
  const groupNameMap = new Map<number, string>();
  if (groupIdsInFeed.length > 0) {
    const { data: groupRows } = await (admin as any)
      .from("rnest_social_groups")
      .select("id, name")
      .in("id", groupIdsInFeed);
    for (const g of groupRows ?? []) {
      groupNameMap.set(Number(g.id), String(g.name ?? ""));
    }
  }

  const posts = pageRows.map((row: any) =>
    buildSocialPost(row, profileMap, likedPostIds, groupNameMap)
  );

  const nextCursor = hasMore ? String(pageRows[pageRows.length - 1].created_at) : null;
  return { posts, nextCursor };
}

// ── 게시글 생성 ───────────────────────────────────────────────────
export async function createPost(
  admin: any,
  userId: string,
  body: string,
  opts: {
    imagePath?: string | null;
    tags?: string[];
    groupId?: number | null;
    visibility?: "friends" | "group";
  } = {}
): Promise<SocialPost> {
  const visibility = opts.visibility ?? "friends";
  const groupId = visibility === "group" ? (opts.groupId ?? null) : null;

  // 그룹 게시글이면 멤버 여부 확인
  if (visibility === "group" && groupId) {
    const { data: memberRow } = await (admin as any)
      .from("rnest_social_group_members")
      .select("user_id")
      .eq("group_id", groupId)
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    if (!memberRow) throw Object.assign(new Error("not_group_member"), { code: "not_group_member" });
  }

  const { data: row, error } = await (admin as any)
    .from("rnest_social_posts")
    .insert({
      author_user_id: userId,
      body,
      image_path: opts.imagePath ?? null,
      tags: opts.tags ?? [],
      visibility,
      group_id: groupId,
    })
    .select("id, author_user_id, body, image_path, tags, visibility, group_id, like_count, comment_count, created_at")
    .single();

  if (error) throw error;

  const profileMap = await loadSocialGroupProfileMap(admin, [userId]);
  const groupNameMap = new Map<number, string>();
  if (groupId) {
    const { data: g } = await (admin as any)
      .from("rnest_social_groups")
      .select("id, name")
      .eq("id", groupId)
      .maybeSingle();
    if (g) groupNameMap.set(Number(g.id), String(g.name ?? ""));
  }

  return buildSocialPost(row, profileMap, new Set(), groupNameMap);
}

// ── 게시글 삭제 ───────────────────────────────────────────────────
export async function deletePost(
  admin: any,
  postId: number,
  userId: string,
  isAdmin = false
): Promise<void> {
  let query = (admin as any)
    .from("rnest_social_posts")
    .delete()
    .eq("id", postId);

  // 관리자가 아니면 본인 게시글만 삭제 가능
  if (!isAdmin) {
    query = query.eq("author_user_id", userId);
  }

  const { error } = await query;
  if (error) throw error;
}

// ── 좋아요 토글 ───────────────────────────────────────────────────
export async function togglePostLike(
  admin: any,
  postId: number,
  userId: string
): Promise<{ liked: boolean; count: number }> {
  // 현재 좋아요 여부 확인
  const { data: existing } = await (admin as any)
    .from("rnest_social_post_likes")
    .select("post_id")
    .eq("post_id", postId)
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  let liked: boolean;

  if (existing) {
    // 좋아요 취소
    await (admin as any)
      .from("rnest_social_post_likes")
      .delete()
      .eq("post_id", postId)
      .eq("user_id", userId);
    liked = false;
  } else {
    // 좋아요 추가
    const { error: likeErr } = await (admin as any)
      .from("rnest_social_post_likes")
      .insert({ post_id: postId, user_id: userId });
    if (likeErr && likeErr.code !== "23505") throw likeErr; // 23505 = unique violation (중복 클릭 무시)
    liked = true;
  }

  // 정확한 좋아요 수 재계산 후 업데이트
  const { count: newCount } = await (admin as any)
    .from("rnest_social_post_likes")
    .select("post_id", { count: "exact", head: true })
    .eq("post_id", postId);

  const likeCount = Number(newCount ?? 0);
  await (admin as any)
    .from("rnest_social_posts")
    .update({ like_count: likeCount })
    .eq("id", postId);

  return { liked, count: likeCount };
}

// ── 댓글 조회 ─────────────────────────────────────────────────────
export async function getPostComments(
  admin: any,
  postId: number,
  cursor?: string | null,
  limit = 30
): Promise<{ comments: SocialPostComment[]; nextCursor: string | null }> {
  let query = (admin as any)
    .from("rnest_social_post_comments")
    .select("id, post_id, author_user_id, body, created_at")
    .eq("post_id", postId)
    .order("created_at", { ascending: true })
    .limit(limit + 1);

  if (cursor) {
    query = query.gt("created_at", cursor);
  }

  const { data: rows, error } = await query;
  if (error) throw error;

  const commentRows = rows ?? [];
  const hasMore = commentRows.length > limit;
  const pageRows = hasMore ? commentRows.slice(0, limit) : commentRows;

  if (pageRows.length === 0) return { comments: [], nextCursor: null };

  const authorIds: string[] = Array.from(new Set(pageRows.map((r: any) => String(r.author_user_id))));
  const profileMap = await loadSocialGroupProfileMap(admin, authorIds);

  const comments: SocialPostComment[] = pageRows.map((row: any) => {
    const profile = profileMap.get(String(row.author_user_id));
    return {
      id: Number(row.id),
      postId: Number(row.post_id),
      authorUserId: String(row.author_user_id),
      authorProfile: {
        nickname: profile?.nickname ?? "",
        avatarEmoji: profile?.avatarEmoji ?? "🐧",
      },
      body: String(row.body ?? ""),
      createdAt: String(row.created_at ?? ""),
    };
  });

  const nextCursor = hasMore ? String(pageRows[pageRows.length - 1].created_at) : null;
  return { comments, nextCursor };
}

// ── 댓글 작성 ─────────────────────────────────────────────────────
export async function addComment(
  admin: any,
  postId: number,
  userId: string,
  body: string
): Promise<SocialPostComment> {
  const { data: row, error } = await (admin as any)
    .from("rnest_social_post_comments")
    .insert({ post_id: postId, author_user_id: userId, body })
    .select("id, post_id, author_user_id, body, created_at")
    .single();

  if (error) throw error;

  // comment_count 재계산 후 업데이트
  const { count: newCommentCount } = await (admin as any)
    .from("rnest_social_post_comments")
    .select("id", { count: "exact", head: true })
    .eq("post_id", postId);
  await (admin as any)
    .from("rnest_social_posts")
    .update({ comment_count: Number(newCommentCount ?? 0) })
    .eq("id", postId);

  const profileMap = await loadSocialGroupProfileMap(admin, [userId]);
  const profile = profileMap.get(userId);

  return {
    id: Number(row.id),
    postId: Number(row.post_id),
    authorUserId: userId,
    authorProfile: {
      nickname: profile?.nickname ?? "",
      avatarEmoji: profile?.avatarEmoji ?? "🐧",
    },
    body: String(row.body ?? ""),
    createdAt: String(row.created_at ?? ""),
  };
}

// ── 댓글 삭제 ─────────────────────────────────────────────────────
export async function deleteComment(
  admin: any,
  commentId: number,
  userId: string,
  isAdmin = false
): Promise<void> {
  // 댓글 조회 (post_id 확인용)
  const { data: comment } = await (admin as any)
    .from("rnest_social_post_comments")
    .select("id, post_id, author_user_id")
    .eq("id", commentId)
    .maybeSingle();

  if (!comment) return; // 이미 삭제됨

  if (!isAdmin && String(comment.author_user_id) !== userId) {
    throw Object.assign(new Error("forbidden"), { code: "forbidden" });
  }

  const { error } = await (admin as any)
    .from("rnest_social_post_comments")
    .delete()
    .eq("id", commentId);

  if (error) throw error;

  // comment_count 재계산 후 업데이트
  const { count: newCommentCount } = await (admin as any)
    .from("rnest_social_post_comments")
    .select("id", { count: "exact", head: true })
    .eq("post_id", Number(comment.post_id));
  await (admin as any)
    .from("rnest_social_posts")
    .update({ comment_count: Number(newCommentCount ?? 0) })
    .eq("id", Number(comment.post_id));
}

// ── 접근 권한 확인 (API 라우트에서 사용) ─────────────────────────────
export { canUserAccessPost };
