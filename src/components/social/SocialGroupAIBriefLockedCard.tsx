"use client";

import Link from "next/link";
import { withReturnTo } from "@/lib/navigation";

type Props = {
  groupId: number;
};

export function SocialGroupAIBriefLockedCard({ groupId }: Props) {
  return (
    <div className="rounded-[32px] bg-white px-5 py-5 shadow-apple">
      <div className="inline-flex rounded-full bg-[color:var(--rnest-accent-soft)] px-3 py-1 text-[11px] font-semibold text-[color:var(--rnest-accent)]">
        AI 브리프
      </div>
      <h3 className="mt-4 text-[22px] font-bold tracking-[-0.03em] text-ios-text">
        이번 주 그룹 회복 패턴을 더 깔끔하게 볼 수 있어요.
      </h3>
      <p className="mt-2 text-[13px] leading-6 text-ios-muted">
        이번 주 그룹 회복 패턴과 같이 쉬기 좋은 창을 AI로 요약해드려요.
      </p>
      <div className="mt-4 space-y-2 rounded-[24px] bg-ios-bg px-4 py-4">
        <p className="text-[12.5px] text-ios-text">그룹 피로 패턴 요약</p>
        <p className="text-[12.5px] text-ios-text">공통 OFF와 낮은 부담 창 추천</p>
        <p className="text-[12.5px] text-ios-text">opt-in 개인 카드</p>
      </div>
      <Link
        href={withReturnTo("/settings/billing/upgrade", `/social/groups/${groupId}?tab=aiBrief`)}
        className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-full bg-black px-5 text-[14px] font-semibold text-white transition active:opacity-60"
      >
        Plus/Pro로 열기
      </Link>
    </div>
  );
}
