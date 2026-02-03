"use client";

import type { DailyVital } from "@/lib/vitals";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { buildGuardianCard, buildSurvivalReportCard } from "@/lib/shareCards";
import { downloadSvgAsPng } from "@/lib/exportImage";

export function ShareSheet({
  open,
  onClose,
  vital,
}: {
  open: boolean;
  onClose: () => void;
  vital: DailyVital | null;
}) {
  const disabled = !vital;

  const downloadGuardian = async () => {
    if (!vital) return;
    const c = buildGuardianCard(vital);
    await downloadSvgAsPng({ svg: c.svg, filename: c.filename, width: c.width, height: c.height });
  };

  const downloadSurvival = async () => {
    if (!vital) return;
    const c = buildSurvivalReportCard(vital);
    await downloadSvgAsPng({ svg: c.svg, filename: c.filename, width: c.width, height: c.height });
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="공유 카드" subtitle="카카오톡/인스타용 이미지로 저장">
      <div className="space-y-4">
        <div className="rounded-2xl border border-ios-sep bg-white p-4">
          <div className="text-[13px] font-semibold">1) 가족/연인용: 오늘의 사용 설명서</div>
          <div className="mt-1 text-[12.5px] text-ios-muted">
            배터리 잔량 + 키워드 + 취급 주의사항을 한 장으로
          </div>
          <div className="mt-3">
            <Button disabled={disabled} onClick={downloadGuardian}>
              PNG 저장
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-ios-sep bg-white p-4">
          <div className="text-[13px] font-semibold">2) SNS용: 간호 생존 신고서</div>
          <div className="mt-1 text-[12.5px] text-ios-muted">
            영수증/포스터 느낌의 요약 카드
          </div>
          <div className="mt-3">
            <Button disabled={disabled} onClick={downloadSurvival}>
              PNG 저장
            </Button>
          </div>
        </div>

        {disabled ? (
          <div className="text-[12.5px] text-ios-muted">선택 날짜의 분석 데이터가 없어요. 홈에서 날짜를 선택해 주세요.</div>
        ) : null}

        <div className="pt-1">
          <Button variant="secondary" onClick={onClose}>
            닫기
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
