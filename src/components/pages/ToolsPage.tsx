"use client";

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { useI18n } from "@/lib/useI18n";

export function ToolsPage() {
  const { t } = useI18n();

  return (
    <div className="mx-auto w-full max-w-[760px] space-y-4 px-4 pb-24 pt-6">
      <div>
        <div className="text-[30px] font-extrabold tracking-[-0.02em] text-ios-text">{t("툴")}</div>
        <div className="mt-1 text-[13px] text-ios-sub">{t("현장에서 바로 쓰는 계산·안전 확인 도구입니다.")}</div>
      </div>

      <Link href="/tools/nurse-calculators" className="block">
        <Card className="p-6 transition hover:translate-y-[-1px] hover:border-[color:var(--wnl-accent-border)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[20px] font-extrabold tracking-[-0.02em] text-ios-text">{t("간호사 투약·주입 계산기")}</div>
              <div className="mt-1 text-[13px] text-ios-sub">
                {t("펌프 변환, IVPB 속도, 드립 환산, 희석 농도, 역산 검산을 100% 로컬로 즉시 계산합니다.")}
              </div>
            </div>
            <span className="wnl-chip-accent px-3 py-1 text-[11px]">{t("LOCAL")}</span>
          </div>
        </Card>
      </Link>

      <Link href="/tools/med-safety" className="block">
        <Card className="p-6 transition hover:translate-y-[-1px] hover:border-[color:var(--wnl-accent-border)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[20px] font-extrabold tracking-[-0.02em] text-ios-text">{t("AI 약물·기구 안전 가이드")}</div>
              <div className="mt-1 text-[13px] text-ios-sub">
                {t("사진·텍스트로 투여 전 확인사항, 수행 절차, 중단·보고 기준을 빠르게 정리해줍니다.")}
              </div>
            </div>
            <span className="wnl-chip-accent px-3 py-1 text-[11px]">{t("AI")}</span>
          </div>
        </Card>
      </Link>
    </div>
  );
}

export default ToolsPage;
