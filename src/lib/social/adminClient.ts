import { authHeaders } from "@/lib/billing/client";
import type {
  SocialAdminStats,
  SocialAdminUser,
  SocialAdminUserDetail,
  SocialAdminPost,
  SocialAdminGroup,
  SocialAdminGroupMember,
  SocialAdminStory,
  SocialAdminSecurityLog,
} from "@/types/socialAdmin";

async function apiFetch(path: string, init?: RequestInit): Promise<any> {
  const headers = await authHeaders();
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...headers, ...init?.headers },
    cache: "no-store",
  });
  const json = await res.json().catch(() => null);
  if (!json?.ok) throw new Error(json?.error ?? "unknown_error");
  return json;
}

export async function fetchSocialAdminStats(): Promise<SocialAdminStats> {
  const json = await apiFetch("/api/admin/social/stats");
  return json.data.stats as SocialAdminStats;
}

export async function fetchSocialAdminUsers(params: {
  q?: string;
  limit?: number;
  offset?: number;
  suspended?: boolean;
}): Promise<{ users: SocialAdminUser[]; total: number }> {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.limit != null) sp.set("limit", String(params.limit));
  if (params.offset != null) sp.set("offset", String(params.offset));
  if (params.suspended) sp.set("suspended", "true");
  const json = await apiFetch(`/api/admin/social/users?${sp.toString()}`);
  return json.data as { users: SocialAdminUser[]; total: number };
}

export async function fetchSocialAdminUserDetail(
  userId: string,
): Promise<SocialAdminUserDetail> {
  const json = await apiFetch(`/api/admin/social/users/${encodeURIComponent(userId)}`);
  return json.data.user as SocialAdminUserDetail;
}

export async function patchSocialAdminUser(
  userId: string,
  action: "suspend" | "unsuspend",
  reason?: string,
): Promise<void> {
  await apiFetch(`/api/admin/social/users/${encodeURIComponent(userId)}`, {
    method: "PATCH",
    body: JSON.stringify({ action, reason }),
  });
}

export async function fetchSocialAdminPosts(params: {
  q?: string;
  limit?: number;
  offset?: number;
  userId?: string;
}): Promise<{ posts: SocialAdminPost[]; total: number }> {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.limit != null) sp.set("limit", String(params.limit));
  if (params.offset != null) sp.set("offset", String(params.offset));
  if (params.userId) sp.set("userId", params.userId);
  const json = await apiFetch(`/api/admin/social/posts?${sp.toString()}`);
  return json.data as { posts: SocialAdminPost[]; total: number };
}

export async function deleteSocialAdminPost(postId: number): Promise<void> {
  await apiFetch(`/api/admin/social/posts/${postId}`, { method: "DELETE" });
}

export async function fetchSocialAdminGroups(params: {
  q?: string;
  limit?: number;
  offset?: number;
}): Promise<{ groups: SocialAdminGroup[]; total: number }> {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.limit != null) sp.set("limit", String(params.limit));
  if (params.offset != null) sp.set("offset", String(params.offset));
  const json = await apiFetch(`/api/admin/social/groups?${sp.toString()}`);
  return json.data as { groups: SocialAdminGroup[]; total: number };
}

export async function fetchSocialAdminGroupMembers(
  groupId: number,
): Promise<SocialAdminGroupMember[]> {
  const json = await apiFetch(`/api/admin/social/groups/${groupId}`);
  return json.data.members as SocialAdminGroupMember[];
}

export async function deleteSocialAdminGroup(groupId: number): Promise<void> {
  await apiFetch(`/api/admin/social/groups/${groupId}`, { method: "DELETE" });
}

export async function removeSocialGroupMember(
  groupId: number,
  memberId: string,
): Promise<void> {
  await apiFetch(
    `/api/admin/social/groups/${groupId}/members/${encodeURIComponent(memberId)}`,
    { method: "DELETE" },
  );
}

export async function fetchSocialAdminStories(params: {
  limit?: number;
  offset?: number;
}): Promise<{ stories: SocialAdminStory[]; total: number }> {
  const sp = new URLSearchParams();
  if (params.limit != null) sp.set("limit", String(params.limit));
  if (params.offset != null) sp.set("offset", String(params.offset));
  const json = await apiFetch(`/api/admin/social/stories?${sp.toString()}`);
  return json.data as { stories: SocialAdminStory[]; total: number };
}

export async function deleteSocialAdminStory(storyId: number): Promise<void> {
  await apiFetch(`/api/admin/social/stories/${storyId}`, { method: "DELETE" });
}

export async function fetchSocialAdminSecurity(params: {
  action?: string;
  userId?: string;
  limit?: number;
  offset?: number;
}): Promise<{ logs: SocialAdminSecurityLog[]; total: number }> {
  const sp = new URLSearchParams();
  if (params.action) sp.set("action", params.action);
  if (params.userId) sp.set("userId", params.userId);
  if (params.limit != null) sp.set("limit", String(params.limit));
  if (params.offset != null) sp.set("offset", String(params.offset));
  const json = await apiFetch(`/api/admin/social/security?${sp.toString()}`);
  return json.data as { logs: SocialAdminSecurityLog[]; total: number };
}
