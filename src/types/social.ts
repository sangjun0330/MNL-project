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
  | "connection_rejected";

export type SocialEvent = {
  id: number;
  type: SocialEventType;
  actorId: string | null;
  entityId: string | null;
  payload: {
    nickname?: string;
    avatarEmoji?: string;
  };
  readAt: string | null;
  createdAt: string;
};
