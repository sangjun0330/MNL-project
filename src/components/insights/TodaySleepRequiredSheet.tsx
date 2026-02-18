"use client";

import { useMemo } from "react";
import { todayISO, formatKoreanDate } from "@/lib/date";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { useI18n } from "@/lib/useI18n";

type TodaySleepRequiredSheetProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  titleText?: string;
  subtitleText?: string;
  primaryText?: string;
  descriptionText?: string;
  hintText?: string;
  confirmText?: string;
};

export function TodaySleepRequiredSheet({
  open,
  onClose,
  onConfirm,
  titleText,
  subtitleText,
  primaryText,
  descriptionText,
  hintText,
  confirmText,
}: TodaySleepRequiredSheetProps) {
  const { t } = useI18n();
  const today = useMemo(() => todayISO(), []);
  const resolvedTitle = titleText ?? t("오늘 수면 기록이 필요해요");
  const resolvedSubtitle = subtitleText ?? `${formatKoreanDate(today)} · ${t("AI 맞춤회복 분석 전 필수")}`;
  const resolvedPrimary = primaryText ?? t("먼저 오늘 수면 시간을 입력해 주세요.");
  const resolvedDescription = descriptionText ?? t("오늘 컨디션/회복 추천은 수면 기록이 있어야 정확하게 계산됩니다.");
  const resolvedHint = hintText ?? t("확인을 누르면 일정 페이지로 이동하고 오늘 건강 기록 팝업이 바로 열립니다.");
  const resolvedConfirm = confirmText ?? t("확인");

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={resolvedTitle}
      subtitle={resolvedSubtitle}
      variant="appstore"
      maxHeightClassName="max-h-[56dvh]"
    >
      <div className="space-y-4 pb-2">
        <div className="rounded-2xl border border-ios-sep bg-white p-4">
          <div className="text-[15px] font-bold text-ios-text">{resolvedPrimary}</div>
          <p className="mt-2 text-[13px] leading-relaxed text-ios-sub">
            {resolvedDescription}
          </p>
          <p className="mt-2 text-[12px] leading-relaxed text-ios-muted">
            {resolvedHint}
          </p>
        </div>

        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onClose}>
            {t("닫기")}
          </Button>
          <Button className="flex-1" onClick={onConfirm}>
            {resolvedConfirm}
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
