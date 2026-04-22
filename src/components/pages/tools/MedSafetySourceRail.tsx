"use client";

import { MedSafetySourceButton } from "@/components/pages/tools/MedSafetySourceButton";
import type { MedSafetyGroundingMode, MedSafetyGroundingStatus, MedSafetySource } from "@/lib/medSafetySources";
import { useI18n } from "@/lib/useI18n";

type MedSafetySourceRailProps = {
  sources: MedSafetySource[];
  groundingMode: MedSafetyGroundingMode;
  groundingStatus: MedSafetyGroundingStatus;
  groundingError?: string | null;
  className?: string;
};

function joinClassNames(...values: Array<string | null | undefined | false>) {
  return values.filter(Boolean).join(" ");
}

export function MedSafetySourceRail(props: MedSafetySourceRailProps) {
  const { t } = useI18n();
  const { sources, groundingMode, groundingStatus, className } = props;

  if (groundingMode === "none") return null;

  if (groundingStatus === "failed") {
    return (
      <div
        className={joinClassNames(
          "rounded-[24px] border border-amber-200 bg-amber-50/90 px-4 py-4 text-[13px] leading-6 text-amber-800",
          className
        )}
      >
        <div className="font-semibold">{t("웹 근거를 불러오지 못해 AI 답변만 표시 중입니다.")}</div>
      </div>
    );
  }

  if (!sources.length) return null;

  return (
    <div className={joinClassNames("space-y-3", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center rounded-full border border-[#E6E8ED] bg-[#F7F7F8] px-3 py-1.5 text-[11px] font-semibold text-ios-sub">
          {t("근거 출처 {count}개", { count: sources.length })}
        </span>
      </div>
      <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1">
        {sources.map((source) => (
          <MedSafetySourceButton key={source.url} source={source} variant="card" />
        ))}
      </div>
    </div>
  );
}

export default MedSafetySourceRail;
