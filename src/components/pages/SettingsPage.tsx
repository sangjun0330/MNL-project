"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/useI18n";
import { PWAInstallButton } from "@/components/system/PWAInstallButton";
import { useAuthState } from "@/lib/auth";
import { authHeaders } from "@/lib/billing/client";
import { useAppStoreSelector } from "@/lib/store";
import {
  caffeineSensitivityPresetFromValue,
  caffeineSensitivityPresetLabel,
  chronotypePresetFromValue,
  chronotypePresetLabel,
  normalizeProfileSettings,
} from "@/lib/recoveryPlanner";

export function SettingsPage() {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const { status, user } = useAuthState();
  const profile = useAppStoreSelector((s) => normalizeProfileSettings(s.settings.profile));
  const [isAdmin, setIsAdmin] = useState(false);
  const authError = searchParams.get("authError");
  const personalizationSummary = `${chronotypePresetLabel(chronotypePresetFromValue(profile.chronotype))} · ${t("카페인")} ${caffeineSensitivityPresetLabel(
    caffeineSensitivityPresetFromValue(profile.caffeineSensitivity)
  )}`;

  useEffect(() => {
    let active = true;
    if (status !== "authenticated" || !user?.userId) {
      setIsAdmin(false);
      return () => {
        active = false;
      };
    }

    const run = async () => {
      try {
        const headers = await authHeaders();
        const adminRes = await fetch("/api/admin/billing/access", {
          method: "GET",
          headers: {
            "content-type": "application/json",
            ...headers,
          },
          cache: "no-store",
        });
        const adminJson = await adminRes.json().catch(() => null);
        if (!active) return;
        setIsAdmin(Boolean(adminJson?.ok && adminJson?.data?.isAdmin));
      } catch {
        if (!active) return;
        setIsAdmin(false);
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [status, user?.userId]);

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pb-24 pt-6">
      <div className="mb-4">
        <div className="text-[28px] font-extrabold tracking-[-0.02em]">{t("설정")}</div>
        <div className="mt-1 text-[13px] text-ios-sub">{t("모든 기능을 사용하려면 로그인해야 합니다.")}</div>
      </div>

      {authError ? (
        <div className="mb-4 rounded-apple border border-[#F3D7A8] bg-[#FFF8EC] px-4 py-3 text-[13px] leading-6 text-[#8A5A12] shadow-apple-sm">
          {authError === "unauthorized_email" || authError === "unauthorized_new_user"
            ? t("이 계정은 현재 테스트 허용 목록에 없어 로그인할 수 없어요.")
            : t("Google 로그인 처리에 실패했어요. 잠시 후 다시 시도해 주세요.")}
        </div>
      ) : null}

      {/* PWA 앱 설치 */}
      <div className="mb-4">
        <PWAInstallButton />
      </div>

      <div className="mb-3 text-[13px] text-ios-sub">{t("설정 항목을 선택해 주세요.")}</div>

      <div className="grid grid-cols-2 gap-3">
        <Link
          href="/settings/general"
          className="rounded-apple border border-ios-sep bg-white/95 p-4 shadow-apple-sm transition hover:translate-y-[-1px] hover:border-[color:var(--rnest-accent-border)]"
          aria-label={t("일반 설정 열기")}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2 text-[17px] font-bold text-ios-text">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[color:var(--rnest-accent-border)] bg-[color:var(--rnest-accent-soft)] text-[color:var(--rnest-accent)]">
                <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3.2" />
                  <path d="M19.4 15a1.6 1.6 0 0 0 .32 1.76l.02.02a2 2 0 0 1 0 2.82 2 2 0 0 1-2.82 0l-.02-.02a1.6 1.6 0 0 0-1.76-.32 1.6 1.6 0 0 0-.98 1.46V21a2 2 0 0 1-4 0v-.04a1.6 1.6 0 0 0-.98-1.46 1.6 1.6 0 0 0-1.76.32l-.02.02a2 2 0 1 1-2.82-2.82l.02-.02a1.6 1.6 0 0 0 .32-1.76 1.6 1.6 0 0 0-1.46-.98H3a2 2 0 0 1 0-4h.04a1.6 1.6 0 0 0 1.46-.98 1.6 1.6 0 0 0-.32-1.76l-.02-.02a2 2 0 0 1 0-2.82 2 2 0 0 1 2.82 0l.02.02a1.6 1.6 0 0 0 1.76.32h.01a1.6 1.6 0 0 0 .97-1.46V3a2 2 0 0 1 4 0v.04a1.6 1.6 0 0 0 .98 1.46h.01a1.6 1.6 0 0 0 1.76-.32l.02-.02a2 2 0 1 1 2.82 2.82l-.02.02a1.6 1.6 0 0 0-.32 1.76v.01a1.6 1.6 0 0 0 1.46.97H21a2 2 0 0 1 0 4h-.04a1.6 1.6 0 0 0-1.46.98z" />
                </svg>
              </span>
              <span className="truncate">{t("일반")}</span>
            </div>
            <span className="ml-1 inline-flex h-6 w-6 shrink-0 items-center justify-center text-[22px] leading-none text-[color:var(--rnest-accent)]">›</span>
          </div>
          <div className="mt-2 text-[12.5px] text-ios-sub">{t("언어를 설정합니다.")}</div>
        </Link>

        <Link
          href="/settings/account"
          className="rounded-apple border border-ios-sep bg-white/95 p-4 shadow-apple-sm transition hover:translate-y-[-1px] hover:border-[color:var(--rnest-accent-border)]"
          aria-label={t("계정 설정 열기")}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2 text-[17px] font-bold text-ios-text">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[color:var(--rnest-accent-border)] bg-[color:var(--rnest-accent-soft)] text-[color:var(--rnest-accent)]">
                <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9" />
                  <circle cx="12" cy="9.2" r="2.8" />
                  <path d="M7.2 17.2c1.5-2 8.1-2 9.6 0" />
                </svg>
              </span>
              <span className="truncate">{t("계정")}</span>
            </div>
            <span className="ml-1 inline-flex h-6 w-6 shrink-0 items-center justify-center text-[22px] leading-none text-[color:var(--rnest-accent)]">›</span>
          </div>
          <div className="mt-2 text-[12.5px] text-ios-sub">{t("로그인과 계정 관리를 설정합니다.")}</div>
        </Link>

        <Link
          href="/settings/personalization"
          className="rounded-apple border border-ios-sep bg-white/95 p-4 shadow-apple-sm transition hover:translate-y-[-1px] hover:border-[color:var(--rnest-accent-border)]"
          aria-label={t("개인화 설정 열기")}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2 text-[17px] font-bold text-ios-text">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[color:var(--rnest-accent-border)] bg-[color:var(--rnest-accent-soft)] text-[color:var(--rnest-accent)]">
                <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3v18" />
                  <path d="M7 7.5c1.2-1 3-1.5 5-1.5s3.8.5 5 1.5" />
                  <path d="M7 16.5c1.2 1 3 1.5 5 1.5s3.8-.5 5-1.5" />
                  <path d="M4.5 12H3" />
                  <path d="M21 12h-1.5" />
                </svg>
              </span>
              <span className="truncate">{t("개인화")}</span>
            </div>
            <span className="ml-1 inline-flex h-6 w-6 shrink-0 items-center justify-center text-[22px] leading-none text-[color:var(--rnest-accent)]">›</span>
          </div>
          <div className="mt-2 text-[12.5px] text-ios-sub">{t("회복 플래너와 AI 해설에 반영할 개인 리듬을 설정합니다.")}</div>
          <div className="mt-2 inline-flex rounded-full border border-ios-sep bg-ios-bg px-2.5 py-1 text-[11.5px] font-semibold text-ios-text">
            {personalizationSummary}
          </div>
        </Link>

        <Link
          href="/settings/billing"
          className="rounded-apple border border-ios-sep bg-white/95 p-4 shadow-apple-sm transition hover:translate-y-[-1px] hover:border-[color:var(--rnest-accent-border)]"
          aria-label={t("구독 설정 열기")}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2 text-[17px] font-bold text-ios-text">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[color:var(--rnest-accent-border)] bg-[color:var(--rnest-accent-soft)] text-[color:var(--rnest-accent)]">
                <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="5" width="18" height="14" rx="3" />
                  <path d="M3 10h18" />
                  <path d="M7.5 14h3" />
                </svg>
              </span>
              <span className="truncate">{t("구독")}</span>
            </div>
            <span className="ml-1 inline-flex h-6 w-6 shrink-0 items-center justify-center text-[22px] leading-none text-[color:var(--rnest-accent)]">›</span>
          </div>
          <div className="mt-2 text-[12.5px] text-ios-sub">{t("플랜 결제 및 구독 상태를 관리합니다.")}</div>
        </Link>

        {isAdmin ? (
          <Link
            href="/settings/admin"
            className="rounded-apple border border-ios-sep bg-white/95 p-4 shadow-apple-sm transition hover:translate-y-[-1px] hover:border-[color:var(--rnest-accent-border)]"
            aria-label={t("운영 관리자 페이지 열기")}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2 text-[17px] font-bold text-ios-text">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[color:var(--rnest-accent-border)] bg-[color:var(--rnest-accent-soft)] text-[color:var(--rnest-accent)]">
                  <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3l8 4v6c0 4.2-3.1 7.9-8 9-4.9-1.1-8-4.8-8-9V7l8-4z" />
                    <path d="M9 12l2 2 4-4" />
                  </svg>
                </span>
                <span className="truncate">{t("운영")}</span>
              </div>
              <span className="ml-1 inline-flex h-6 w-6 shrink-0 items-center justify-center text-[22px] leading-none text-[color:var(--rnest-accent)]">›</span>
            </div>
            <div className="mt-2 text-[12.5px] text-ios-sub">{t("관리자 계정에서 환불/취소 요청을 검토하고 실행합니다.")}</div>
          </Link>
        ) : null}
      </div>
    </div>
  );
}

export default SettingsPage;
