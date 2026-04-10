"use client";

import type { SocialConnection, SocialProfile } from "@/types/social";

type Props = {
  connections: SocialConnection[];
  currentProfile: SocialProfile | null;
  onComposePost: () => void;
  onFriendTap?: (userId: string) => void;
};

export function SocialStoriesBar({
  connections,
  currentProfile,
  onComposePost,
  onFriendTap,
}: Props) {
  const hasConnections = connections.length > 0;

  return (
    <div className="flex items-start gap-3 overflow-x-auto px-3 py-3 border-b border-gray-100 scrollbar-hide bg-white">
      {/* ── 내 게시글 (작성 버튼) ─────────────────────────── */}
      <button
        type="button"
        onClick={onComposePost}
        className="flex flex-col items-center gap-1.5 shrink-0 min-w-0"
        aria-label="게시글 작성"
      >
        <div className="relative w-[60px] h-[60px]">
          {/* 아바타 링 */}
          <div className="w-full h-full rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center bg-gray-50 overflow-hidden text-[22px]">
            {currentProfile?.profileImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={currentProfile.profileImageUrl}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <span>{currentProfile?.avatarEmoji ?? "👤"}</span>
            )}
          </div>
          {/* + 배지 */}
          <div
            className="absolute -bottom-0.5 -right-0.5 w-[20px] h-[20px] rounded-full flex items-center justify-center border-2 border-white"
            style={{ backgroundColor: "var(--rnest-accent)" }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" className="w-3 h-3">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </div>
        </div>
        <span className="text-[10.5px] text-gray-600 w-[64px] text-center truncate leading-tight">
          내 게시글
        </span>
      </button>

      {/* ── 친구 목록 ──────────────────────────────────────── */}
      {hasConnections
        ? connections.slice(0, 20).map((connection) => (
            <button
              key={connection.userId}
              type="button"
              onClick={() => onFriendTap?.(connection.userId)}
              className="flex flex-col items-center gap-1.5 shrink-0 min-w-0"
              aria-label={`${connection.nickname} 스토리`}
            >
              {/* 그라디언트 링 */}
              <div className="w-[60px] h-[60px] rounded-full p-[2px] bg-gradient-to-tr from-[#FEDA75] via-[#FA7E1E] to-[#D62976]">
                <div className="w-full h-full rounded-full border-[2.5px] border-white bg-gray-100 flex items-center justify-center text-[20px] overflow-hidden">
                  <span>{connection.avatarEmoji || "👤"}</span>
                </div>
              </div>
              <span className="text-[10.5px] text-gray-700 w-[64px] text-center truncate leading-tight">
                {connection.nickname}
              </span>
            </button>
          ))
        : null}
    </div>
  );
}
