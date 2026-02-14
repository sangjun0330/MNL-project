"use client";

import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { HANDOFF_FLAGS } from "@/lib/handoff/featureFlags";
import { useI18n } from "@/lib/useI18n";

export function ToolsPage() {
  const { t } = useI18n();

  return (
    <div className="mx-auto w-full max-w-[760px] space-y-4 px-4 pb-24 pt-6">
      <div>
        <div className="text-[30px] font-extrabold tracking-[-0.02em] text-ios-text">{t("툴")}</div>
        <div className="mt-1 text-[13px] text-ios-sub">{t("실제 사용 기능만 간단하게 제공합니다.")}</div>
      </div>

      {HANDOFF_FLAGS.handoffEnabled ? (
        <Link href="/tools/handoff" className="block">
          <Card className="p-6 transition hover:translate-y-[-1px] hover:border-[color:var(--wnl-accent-border)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[20px] font-extrabold tracking-[-0.02em] text-ios-text">{t("AI 인계")}</div>
                <div className="mt-1 text-[13px] text-ios-sub">
                  {t("로컬 녹음/전사 기반으로 인계를 분석하고 환자 카드로 정리합니다.")}
                </div>
              </div>
              <span className="wnl-chip-accent px-3 py-1 text-[11px]">{t("로컬 전용")}</span>
            </div>
          </Card>
        </Link>
      ) : (
        <Card className="p-6 opacity-70">
          <div className="text-[18px] font-bold text-ios-text">{t("AI 인계")}</div>
          <div className="mt-1 text-[12.5px] text-ios-sub">{t("현재 비활성화 상태입니다. 환경변수를 확인해 주세요.")}</div>
        </Card>
      )}

      <Link href="/tools/med-safety" className="block">
        <Card className="p-6 transition hover:translate-y-[-1px] hover:border-[color:var(--wnl-accent-border)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[20px] font-extrabold tracking-[-0.02em] text-ios-text">{t("AI 약물·도구 검색기")}</div>
              <div className="mt-1 text-[13px] text-ios-sub">
                {t("사진/텍스트 기반으로 지금 할 일, 실행 절차, 중단·보고 기준을 빠르게 확인합니다.")}
              </div>
            </div>
            <span className="wnl-chip-accent px-3 py-1 text-[11px]">{t("OpenAI")}</span>
          </div>
        </Card>
      </Link>
    </div>
  );
}

export default ToolsPage;
