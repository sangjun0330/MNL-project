"use client";

import Link from "next/link";
import { DetailCard, DetailChip, DETAIL_ACCENTS } from "@/components/pages/insights/InsightDetailShell";
import { withReturnTo } from "@/lib/navigation";

export function RecoveryPlannerUpgradeCard({
  title,
  description,
  returnTo,
}: {
  title?: string;
  description?: string;
  returnTo?: string;
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
        {description ?? "AI 맞춤회복과 오늘의 오더 전체를 한 흐름으로 보고, 체크리스트 실행까지 이어갈 수 있어요."}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <DetailChip color={DETAIL_ACCENTS.mint}>AI 맞춤회복</DetailChip>
        <DetailChip color={DETAIL_ACCENTS.navy}>오늘의 오더</DetailChip>
        <DetailChip color={DETAIL_ACCENTS.navy}>AI 체크리스트</DetailChip>
        <DetailChip color={DETAIL_ACCENTS.mint}>개인화 분석</DetailChip>
      </div>
      <div className="mt-5 flex gap-2">
        <Link
          href={withReturnTo("/settings/billing/upgrade", returnTo)}
          className="inline-flex h-11 items-center justify-center rounded-full bg-black px-5 text-[13px] font-semibold text-white"
        >
          Pro 시작하기
        </Link>
        <Link
          href={withReturnTo("/settings/billing", returnTo)}
          className="inline-flex h-11 items-center justify-center rounded-full border border-ios-sep bg-white px-5 text-[13px] font-semibold text-ios-text"
        >
          플랜 보기
        </Link>
      </div>
    </DetailCard>
  );
}
