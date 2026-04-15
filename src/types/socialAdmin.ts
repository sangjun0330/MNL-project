export type SocialAdminStats = {
  totalUsers: number;
  totalPosts: number;
  activeToday: number;
  totalLikes: number;
  totalComments: number;
  newUsersThisWeek: number;
  suspendedUsers: number;
  activeStories: number;
  totalGroups: number;
};

export type SocialAdminUser = {
  userId: string;
  nickname: string;
  handle: string;
  displayName: string;
  avatarEmoji: string;
  accountVisibility: string;
  isSuspended: boolean;
  suspendedAt: string | null;
  suspendedBy: string | null;
  suspensionReason: string | null;
  createdAt: string;
};

export type SocialAdminUserDetail = SocialAdminUser & {
  postCount: number;
  groupCount: number;
  followerCount: number;
};

export type SocialAdminPost = {
  id: number;
  authorUserId: string;
  authorNickname: string;
  authorHandle: string;
  bodyPreview: string;
  visibility: string;
  likeCount: number;
  commentCount: number;
  createdAt: string;
};

export type SocialAdminGroupMember = {
  userId: string;
  nickname: string;
  handle: string;
  avatarEmoji: string;
  role: string;
  joinedAt: string;
};

export type SocialAdminGroup = {
  id: number;
  name: string;
  descriptionPreview: string;
  ownerUserId: string;
  ownerNickname: string;
  memberCount: number;
  joinMode: string;
  createdAt: string;
};

export type SocialAdminStory = {
  id: number;
  authorUserId: string;
  authorNickname: string;
  authorHandle: string;
  contentType: string;
  textPreview: string;
  expiresAt: string;
  viewCount: number;
  createdAt: string;
};

export type SocialAdminSecurityLog = {
  id: number;
  action: string;
  actorUserId: string;
  actorIp: string;
  success: boolean;
  detail: string | null;
  createdAt: string;
};
