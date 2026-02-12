"use client";

import Link from "next/link";
import { useI18n } from "@/lib/useI18n";
import { PWAInstallButton } from "@/components/system/PWAInstallButton";

export function SettingsPage() {
  const { t } = useI18n();

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pb-24 pt-6">
      <div className="mb-4">
        <div className="text-[28px] font-extrabold tracking-[-0.02em]">{t("설정")}</div>
        <div className="mt-1 text-[13px] text-ios-sub">{t("모든 기능을 사용하려면 로그인해야 합니다.")}</div>
      </div>

      {/* PWA 앱 설치 */}
      <div className="mb-4">
        <PWAInstallButton />
      </div>

      <div className="mb-3 text-[13px] text-ios-sub">{t("설정 항목을 선택해 주세요.")}</div>

      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/settings/general"
          className="rounded-apple border border-ios-sep bg-white/95 p-4 shadow-apple-sm transition hover:translate-y-[-1px] hover:border-[color:var(--wnl-accent-border)]"
          aria-label={t("일반 설정 열기")}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[17px] font-bold text-ios-text">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[color:var(--wnl-accent-border)] bg-[color:var(--wnl-accent-soft)] text-[color:var(--wnl-accent)]">
                <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3.2" />
                  <path d="M19.4 15a1.6 1.6 0 0 0 .32 1.76l.02.02a2 2 0 0 1 0 2.82 2 2 0 0 1-2.82 0l-.02-.02a1.6 1.6 0 0 0-1.76-.32 1.6 1.6 0 0 0-.98 1.46V21a2 2 0 0 1-4 0v-.04a1.6 1.6 0 0 0-.98-1.46 1.6 1.6 0 0 0-1.76.32l-.02.02a2 2 0 1 1-2.82-2.82l.02-.02a1.6 1.6 0 0 0 .32-1.76 1.6 1.6 0 0 0-1.46-.98H3a2 2 0 0 1 0-4h.04a1.6 1.6 0 0 0 1.46-.98 1.6 1.6 0 0 0-.32-1.76l-.02-.02a2 2 0 0 1 0-2.82 2 2 0 0 1 2.82 0l.02.02a1.6 1.6 0 0 0 1.76.32h.01a1.6 1.6 0 0 0 .97-1.46V3a2 2 0 0 1 4 0v.04a1.6 1.6 0 0 0 .98 1.46h.01a1.6 1.6 0 0 0 1.76-.32l.02-.02a2 2 0 1 1 2.82 2.82l-.02.02a1.6 1.6 0 0 0-.32 1.76v.01a1.6 1.6 0 0 0 1.46.97H21a2 2 0 0 1 0 4h-.04a1.6 1.6 0 0 0-1.46.98z" />
                </svg>
              </span>
              {t("일반")}
            </div>
            <span className="text-[color:var(--wnl-accent)]">›</span>
          </div>
          <div className="mt-2 text-[12.5px] text-ios-sub">{t("모드와 언어를 설정합니다.")}</div>
        </Link>

        <Link
          href="/settings/account"
          className="rounded-apple border border-ios-sep bg-white/95 p-4 shadow-apple-sm transition hover:translate-y-[-1px] hover:border-[color:var(--wnl-accent-border)]"
          aria-label={t("계정 설정 열기")}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[17px] font-bold text-ios-text">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[color:var(--wnl-accent-border)] bg-[color:var(--wnl-accent-soft)] text-[color:var(--wnl-accent)]">
                <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9" />
                  <circle cx="12" cy="9.2" r="2.8" />
                  <path d="M7.2 17.2c1.5-2 8.1-2 9.6 0" />
                </svg>
              </span>
              {t("계정")}
            </div>
            <span className="text-[color:var(--wnl-accent)]">›</span>
          </div>
          <div className="mt-2 text-[12.5px] text-ios-sub">{t("로그인과 계정 관리를 설정합니다.")}</div>
        </Link>

        <Link
          href="/settings/billing"
          className="rounded-apple border border-ios-sep bg-white/95 p-4 shadow-apple-sm transition hover:translate-y-[-1px] hover:border-[color:var(--wnl-accent-border)]"
          aria-label="구독 설정 열기"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[17px] font-bold text-ios-text">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[color:var(--wnl-accent-border)] bg-[color:var(--wnl-accent-soft)] text-[color:var(--wnl-accent)]">
                <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="5" width="18" height="14" rx="3" />
                  <path d="M3 10h18" />
                  <path d="M7.5 14h3" />
                </svg>
              </span>
              구독
            </div>
            <span className="text-[color:var(--wnl-accent)]">›</span>
          </div>
          <div className="mt-2 text-[12.5px] text-ios-sub">플랜 결제 및 구독 상태를 관리합니다.</div>
        </Link>

        <Link
          href="/settings/admin"
          className="rounded-apple border border-ios-sep bg-white/95 p-4 shadow-apple-sm transition hover:translate-y-[-1px] hover:border-[color:var(--wnl-accent-border)]"
          aria-label="운영 관리자 페이지 열기"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[17px] font-bold text-ios-text">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[color:var(--wnl-accent-border)] bg-[color:var(--wnl-accent-soft)] text-[color:var(--wnl-accent)]">
                <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3l8 4v6c0 4.2-3.1 7.9-8 9-4.9-1.1-8-4.8-8-9V7l8-4z" />
                  <path d="M9 12l2 2 4-4" />
                </svg>
              </span>
              운영
            </div>
            <span className="text-[color:var(--wnl-accent)]">›</span>
          </div>
          <div className="mt-2 text-[12.5px] text-ios-sub">관리자 계정에서 환불/취소 요청을 검토하고 실행합니다.</div>
        </Link>
      </div>
    </div>
  );
}

export default SettingsPage;
