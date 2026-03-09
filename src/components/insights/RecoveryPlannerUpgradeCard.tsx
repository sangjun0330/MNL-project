"use client";

import Link from "next/link";
import { DetailCard, DetailChip, DETAIL_ACCENTS } from "@/components/pages/insights/InsightDetailShell";

export function RecoveryPlannerUpgradeCard({
  title,
  description,
}: {
  title?: string;
  description?: string;
}) {
  return (
    <DetailCard className="p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <DetailChip color={DETAIL_ACCENTS.mint}>Pro</DetailChip>
        <DetailChip color={DETAIL_ACCENTS.navy}>회복 플래너 전체</DetailChip>
      </div>
      <div className="mt-3 text-[18px] font-bold tracking-[-0.02em] text-ios-text">
        {title ?? "전체 회복 플래너는 Pro에서 열립니다."}
      </div>
      <p className="mt-2 text-[14px] leading-relaxed text-ios-sub">
        {description ?? "회복 처방, 오늘 오더, 타임라인 전체와 AI 회복 해설까지 한 흐름으로 사용할 수 있어요."}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <DetailChip color={DETAIL_ACCENTS.mint}>회복 처방 전체</DetailChip>
        <DetailChip color={DETAIL_ACCENTS.navy}>오늘 오더 전체</DetailChip>
        <DetailChip color={DETAIL_ACCENTS.navy}>타임라인 전체</DetailChip>
        <DetailChip color={DETAIL_ACCENTS.mint}>AI 회복 해설</DetailChip>
      </div>
      <div className="mt-5 flex gap-2">
        <Link
          href="/settings/billing/upgrade"
          className="inline-flex h-11 items-center justify-center rounded-full bg-black px-5 text-[13px] font-semibold text-white"
        >
          Pro 시작하기
        </Link>
        <Link
          href="/settings/billing"
          className="inline-flex h-11 items-center justify-center rounded-full border border-ios-sep bg-white px-5 text-[13px] font-semibold text-ios-text"
        >
          플랜 보기
        </Link>
      </div>
    </DetailCard>
  );
}
