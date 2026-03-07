"use client";

import type { SocialGroupSummary } from "@/types/social";
import { SocialGroupBadge } from "@/components/social/SocialGroupBadge";
import { SocialGroupRoleBadge } from "@/components/social/SocialGroupRoleBadge";

type Props = {
  groups: SocialGroupSummary[];
  onOpenGroup: (group: SocialGroupSummary) => void;
  onCreateGroup: () => void;
};

export function SocialGroupList({ groups, onOpenGroup, onCreateGroup }: Props) {
  return (
    <div className="rounded-apple border border-ios-sep bg-white shadow-apple">
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <span className="text-[12px] font-semibold text-ios-muted">내 그룹 {groups.length}</span>
      </div>

      {groups.length === 0 ? (
        <div className="px-4 pb-4 pt-2 text-center">
          <p className="text-[13px] text-ios-muted">아직 참여 중인 그룹이 없어요</p>
          <p className="mt-0.5 text-[12px] text-ios-muted opacity-70">
            그룹을 만들고 초대 링크로 동료들을 모아보세요
          </p>
          <button
            type="button"
            onClick={onCreateGroup}
            className="mt-4 inline-flex h-11 items-center justify-center rounded-full bg-black px-5 text-[14px] font-semibold text-white transition active:opacity-60"
          >
            그룹 만들기
          </button>
        </div>
      ) : (
        <>
          <div className="divide-y divide-ios-sep">
            {groups.map((group) => (
              <button
                key={group.id}
                type="button"
                onClick={() => onOpenGroup(group)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition active:opacity-75"
              >
                <SocialGroupBadge groupId={group.id} name={group.name} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[13.5px] font-semibold text-ios-text">{group.name}</p>
                    <SocialGroupRoleBadge role={group.role} />
                    {group.pendingJoinRequestCount > 0 && (group.role === "owner" || group.role === "admin") ? (
                      <span className="shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[10.5px] font-semibold text-amber-700">
                        요청 {group.pendingJoinRequestCount}
                      </span>
                    ) : null}
                  </div>
                  {group.notice ? (
                    <p className="mt-0.5 truncate text-[11.5px] text-ios-muted">공지 · {group.notice}</p>
                  ) : group.description ? (
                    <p className="mt-0.5 truncate text-[11.5px] text-ios-muted">{group.description}</p>
                  ) : (
                    <p className="mt-0.5 text-[11.5px] text-ios-muted">멤버 {group.memberCount}명</p>
                  )}
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="flex -space-x-1.5">
                      {group.memberPreview.map((member) => (
                        <span
                          key={member.userId}
                          className="flex h-6 w-6 items-center justify-center rounded-full border border-white bg-ios-bg text-[13px]"
                        >
                          {member.avatarEmoji || "🐧"}
                        </span>
                      ))}
                    </div>
                    <span className="text-[10.5px] text-ios-muted">
                      멤버 {group.memberCount}/{group.maxMembers}명
                    </span>
                    {group.joinMode === "approval" ? (
                      <span className="text-[10.5px] text-ios-muted">승인제</span>
                    ) : null}
                  </div>
                </div>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="shrink-0 text-ios-muted"
                  aria-hidden="true"
                >
                  <polyline points="9 6 15 12 9 18" />
                </svg>
              </button>
            ))}
          </div>

          <div className="border-t border-ios-sep">
            <button
              type="button"
              onClick={onCreateGroup}
              className="flex w-full items-center justify-center gap-2 py-3.5 text-[13.5px] font-semibold text-[color:var(--rnest-accent)] transition active:opacity-60"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              새 그룹 만들기
            </button>
          </div>
        </>
      )}
    </div>
  );
}
