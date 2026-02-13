"use client";

/**
 * wnl_daily_logs 기능은 제거되었습니다.
 * 사용자 상태 저장은 /api/user/state (wnl_user_state) 경로만 사용합니다.
 */
export function AutoHealthLogger({ userId }: { userId?: string | null }) {
  void userId;
  return null;
}
