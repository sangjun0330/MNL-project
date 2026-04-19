export type SocialAdminUserState = "active" | "read_only" | "suspended";

export type SocialAdminOverview = {
  totalUsers: number;
  totalPosts: number;
  totalComments: number;
  activeStories: number;
  totalGroups: number;
  pendingJoinRequests: number;
  activeChallenges: number;
  readOnlyUsers: number;
  suspendedUsers: number;
  postsLast24h: number;
  storiesLast24h: number;
  aiBriefsThisWeek: number;
};

export type SocialAdminActorSummary = {
  userId: string;
  nickname: string;
  displayName: string;
  handle: string | null;
  avatarEmoji: string;
  profileImageUrl: string | null;
};

export type SocialAdminUserListItem = SocialAdminActorSummary & {
  bio: string;
  state: SocialAdminUserState;
  stateReason: string | null;
  accountVisibility: "public" | "private";
  defaultPostVisibility: "public_internal" | "followers" | "friends" | "group";
  subscriptionTier: string;
  lastSeenAt: string | null;
  updatedAt: string;
  postCount: number;
  storyCount: number;
  groupCount: number;
};

export type SocialAdminUserDetail = SocialAdminUserListItem & {
  followerCount: number;
  followingCount: number;
  friendCount: number;
  pendingIncomingRequests: number;
  pendingOutgoingRequests: number;
  recentGroups: Array<{
    groupId: number;
    name: string;
    role: "owner" | "admin" | "member";
    joinedAt: string;
  }>;
};

export type SocialAdminContentKind = "post" | "comment" | "story";

export type SocialAdminContentItem = {
  id: number;
  kind: SocialAdminContentKind;
  author: SocialAdminActorSummary;
  preview: string;
  createdAt: string;
  groupId: number | null;
  groupName: string | null;
  postId: number | null;
  visibility: string | null;
  contentType: string | null;
  imageUrl: string | null;
  metricPrimary: number | null;
  metricSecondary: number | null;
  expiresAt: string | null;
};

export type SocialAdminGroupMember = SocialAdminActorSummary & {
  role: "owner" | "admin" | "member";
  joinedAt: string;
};

export type SocialAdminGroupJoinRequest = SocialAdminActorSummary & {
  requestId: number;
  createdAt: string;
};

export type SocialAdminGroupItem = {
  id: number;
  name: string;
  description: string;
  notice: string;
  owner: SocialAdminActorSummary | null;
  joinMode: "open" | "approval";
  allowMemberInvites: boolean;
  maxMembers: number;
  updatedAt: string;
  memberCount: number;
  pendingJoinRequestCount: number;
  activeChallengeCount: number;
  latestBriefGeneratedAt: string | null;
};

export type SocialAdminGroupDetail = SocialAdminGroupItem & {
  members: SocialAdminGroupMember[];
  pendingRequests: SocialAdminGroupJoinRequest[];
};

export type SocialAdminChallengeItem = {
  id: number;
  groupId: number;
  groupName: string;
  title: string;
  description: string | null;
  metric: string;
  challengeType: string;
  status: string;
  participantCount: number;
  createdAt: string;
  startsAt: string;
  endsAt: string;
};
