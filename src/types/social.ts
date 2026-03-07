// Social feature types

export type SocialProfile = {
  nickname: string;
  avatarEmoji: string;
  statusMessage: string;
};

export type SocialConnection = {
  id: number;
  userId: string;
  nickname: string;
  avatarEmoji: string;
  statusMessage: string;
  connectedAt?: string;
  requestedAt?: string;
};

export type SocialConnectionsData = {
  accepted: SocialConnection[];
  pendingIncoming: SocialConnection[];
  pendingSent: SocialConnection[];
};

export type FriendSchedule = {
  userId: string;
  nickname: string;
  avatarEmoji: string;
  statusMessage: string;
  schedule: Record<string, string>; // "YYYY-MM-DD" → shift type
};

export type FriendsScheduleData = {
  friends: FriendSchedule[];
  commonOffDays: string[];
};

export type FriendMeta = {
  pinned: boolean;
  alias: string; // 빈 문자열이면 원래 닉네임 사용
  muted: boolean;
};

export type ScheduleVisibility = "full" | "off_only" | "hidden";

export type SocialPreferences = {
  scheduleVisibility: ScheduleVisibility;
  statusMessageVisible: boolean;
  acceptInvites: boolean;
  notifyRequests: boolean;
};

export type SocialEventType =
  | "connection_request"
  | "connection_accepted"
  | "connection_rejected"
  | "group_join_requested"
  | "group_join_approved"
  | "group_join_rejected"
  | "group_role_changed"
  | "group_owner_transferred"
  | "group_member_removed";

export type SocialEvent = {
  id: number;
  type: SocialEventType;
  actorId: string | null;
  entityId: string | null;
  payload: {
    nickname?: string;
    avatarEmoji?: string;
    groupName?: string;
    role?: string;
  };
  readAt: string | null;
  createdAt: string;
};

export type SocialGroupRole = "owner" | "admin" | "member";
export type SocialGroupJoinMode = "open" | "approval";

export type SocialGroupPermissions = {
  canCreateInvite: boolean;
  canEditBasicInfo: boolean;
  canEditNotice: boolean;
  canChangeInvitePolicy: boolean;
  canManageJoinRequests: boolean;
  canManageMembers: boolean;
  canPromoteMembers: boolean;
  canTransferOwner: boolean;
  canRemoveMembers: boolean;
  canDeleteGroup: boolean;
};

export type SocialGroupPreviewMember = {
  userId: string;
  nickname: string;
  avatarEmoji: string;
};

export type SocialGroupSummary = {
  id: number;
  name: string;
  description: string;
  role: SocialGroupRole;
  ownerUserId: string;
  memberCount: number;
  joinedAt: string;
  memberPreview: SocialGroupPreviewMember[];
  notice: string;
  joinMode: SocialGroupJoinMode;
  allowMemberInvites: boolean;
  maxMembers: number;
  pendingJoinRequestCount: number;
};

export type SocialGroupBoardMember = {
  userId: string;
  nickname: string;
  avatarEmoji: string;
  statusMessage: string;
  role: SocialGroupRole;
  joinedAt: string;
  schedule: Record<string, string>;
};

export type SocialGroupJoinRequest = {
  id: number;
  requesterUserId: string;
  nickname: string;
  avatarEmoji: string;
  statusMessage: string;
  createdAt: string;
};

export type SocialGroupActivityType =
  | "group_created"
  | "group_settings_updated"
  | "group_notice_updated"
  | "group_join_requested"
  | "group_join_approved"
  | "group_join_rejected"
  | "group_member_joined"
  | "group_member_left"
  | "group_member_removed"
  | "group_role_changed"
  | "group_owner_transferred"
  | "group_invite_rotated";

export type SocialGroupActivity = {
  id: number;
  type: SocialGroupActivityType;
  actorUserId: string | null;
  actorNickname: string;
  actorAvatarEmoji: string;
  targetUserId: string | null;
  targetNickname: string;
  targetAvatarEmoji: string;
  payload: {
    notice?: string;
    role?: string;
    previousRole?: string;
    groupName?: string;
  };
  createdAt: string;
};

export type SocialGroupBoard = {
  group: SocialGroupSummary;
  members: SocialGroupBoardMember[];
  commonOffDays: string[];
  hiddenScheduleMemberCount: number;
  joinRequests: SocialGroupJoinRequest[];
  activities: SocialGroupActivity[];
  permissions: SocialGroupPermissions;
};

export type SocialGroupInvitePreview = {
  token: string;
  state: "joinable" | "already_member" | "group_full" | "approval_required" | "request_pending";
  group: SocialGroupSummary;
};
