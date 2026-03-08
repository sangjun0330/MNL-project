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
};

export type ScheduleVisibility = "full" | "off_only" | "hidden";
export type HealthVisibility = "full" | "hidden";

export type SocialPreferences = {
  scheduleVisibility: ScheduleVisibility;
  statusMessageVisible: boolean;
  acceptInvites: boolean;
  notifyRequests: boolean;
  healthVisibility: HealthVisibility;
};

/** 그룹 멤버의 지난 7일 건강 통계 (health_visibility=full인 멤버만 계산) */
export type MemberWeeklyVitals = {
  /** 지난 7일 평균 Body Battery (0-100) */
  weeklyAvgBattery: number;
  /** 지난 7일 평균 Mental Battery (0-100) */
  weeklyAvgMental: number;
  /** 지난 7일 평균 수면 시간 (수면 데이터 있는 날 기준, 없으면 null) */
  weeklyAvgSleep: number | null;
  /** 지난 7일 중 가장 나쁜 번아웃 레벨 */
  burnoutLevel: "ok" | "warning" | "danger";
  /** 실제 건강 입력이 있는 날 수 (3일 미만이면 null 반환) */
  daysCounted: number;
};

export type SocialEventType =
  | "connection_request"
  | "connection_accepted"
  | "connection_rejected"
  | "group_notice_posted"
  | "group_notice_updated"
  | "group_settings_updated"
  | "group_join_requested"
  | "group_join_approved"
  | "group_join_rejected"
  | "group_member_joined"
  | "group_member_left"
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
    title?: string;
    notice?: string;
    summary?: string;
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
  /** 건강 데이터 공유 여부 */
  healthVisibility: HealthVisibility;
  /** 지난 7일 건강 통계. null = 비공개이거나 데이터 3일 미만 */
  vitals: MemberWeeklyVitals | null;
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
  | "group_notice_posted"
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
    title?: string;
    notice?: string;
    role?: string;
    previousRole?: string;
    groupName?: string;
  };
  createdAt: string;
};

export type SocialGroupNoticePost = {
  id: number;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  authorUserId: string | null;
  authorNickname: string;
  authorAvatarEmoji: string;
};

export type SocialGroupBoard = {
  group: SocialGroupSummary;
  members: SocialGroupBoardMember[];
  commonOffDays: string[];
  hiddenScheduleMemberCount: number;
  notices: SocialGroupNoticePost[];
  joinRequests: SocialGroupJoinRequest[];
  activities: SocialGroupActivity[];
  permissions: SocialGroupPermissions;
};

export type SocialGroupInvitePreview = {
  token: string;
  state: "joinable" | "already_member" | "group_full" | "approval_required" | "request_pending";
  group: SocialGroupSummary;
};
