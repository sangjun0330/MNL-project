"use client";

import Link from "next/link";
import { useI18n } from "@/lib/useI18n";

export function SettingsPage() {
  const { t } = useI18n();

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pb-24 pt-6">
      <div className="mb-4">
        <div className="text-[28px] font-extrabold tracking-[-0.02em]">{t("설정")}</div>
        <div className="mt-1 text-[13px] text-ios-sub">{t("모든 기능을 사용하려면 로그인해야 합니다.")}</div>
      </div>

      <div className="mb-3 text-[13px] text-ios-sub">{t("설정 항목을 선택해 주세요.")}</div>

      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/settings/general"
          className="rounded-apple border border-ios-sep bg-white p-4 shadow-apple transition hover:translate-y-[-1px]"
          aria-label={t("일반 설정 열기")}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[17px] font-bold text-ios-text">
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3.2" />
                <path d="M19.4 15a1.6 1.6 0 0 0 .32 1.76l.02.02a2 2 0 0 1 0 2.82 2 2 0 0 1-2.82 0l-.02-.02a1.6 1.6 0 0 0-1.76-.32 1.6 1.6 0 0 0-.98 1.46V21a2 2 0 0 1-4 0v-.04a1.6 1.6 0 0 0-.98-1.46 1.6 1.6 0 0 0-1.76.32l-.02.02a2 2 0 1 1-2.82-2.82l.02-.02a1.6 1.6 0 0 0 .32-1.76 1.6 1.6 0 0 0-1.46-.98H3a2 2 0 0 1 0-4h.04a1.6 1.6 0 0 0 1.46-.98 1.6 1.6 0 0 0-.32-1.76l-.02-.02a2 2 0 0 1 0-2.82 2 2 0 0 1 2.82 0l.02.02a1.6 1.6 0 0 0 1.76.32h.01a1.6 1.6 0 0 0 .97-1.46V3a2 2 0 0 1 4 0v.04a1.6 1.6 0 0 0 .98 1.46h.01a1.6 1.6 0 0 0 1.76-.32l.02-.02a2 2 0 1 1 2.82 2.82l-.02.02a1.6 1.6 0 0 0-.32 1.76v.01a1.6 1.6 0 0 0 1.46.97H21a2 2 0 0 1 0 4h-.04a1.6 1.6 0 0 0-1.46.98z" />
              </svg>
              {t("일반")}
            </div>
            <span className="text-ios-muted">›</span>
          </div>
          <div className="mt-2 text-[12.5px] text-ios-sub">{t("모드와 언어를 설정합니다.")}</div>
        </Link>

        <Link
          href="/settings/account"
          className="rounded-apple border border-ios-sep bg-white p-4 shadow-apple transition hover:translate-y-[-1px]"
          aria-label={t("계정 설정 열기")}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[17px] font-bold text-ios-text">
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
                <circle cx="12" cy="9.2" r="2.8" />
                <path d="M7.2 17.2c1.5-2 8.1-2 9.6 0" />
              </svg>
              {t("계정")}
            </div>
            <span className="text-ios-muted">›</span>
          </div>
          <div className="mt-2 text-[12.5px] text-ios-sub">{t("로그인과 계정 관리를 설정합니다.")}</div>
        </Link>
      </div>

      <div className="mt-6 rounded-2xl border border-ios-sep bg-white p-4 text-[12.5px] text-ios-sub">
        <div className="mb-2 flex items-center gap-2 font-semibold text-ios-text">
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 8v4" />
            <path d="M12 16h.01" />
          </svg>
          {t("언어")}
        </div>
        {t("영어로 바꾸면 상세 설명, 기록 칸, 팝업 문구까지 영어로 표시됩니다.")}
      </div>
    </div>
  );
}

export default SettingsPage;
