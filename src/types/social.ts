// Social feature types

export type SocialConnection = {
  id: number;
  userId: string;
  nickname: string;
  avatarEmoji: string;
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
  schedule: Record<string, string>; // "YYYY-MM-DD" → shift type
};

export type FriendsScheduleData = {
  friends: FriendSchedule[];
  commonOffDays: string[];
};
