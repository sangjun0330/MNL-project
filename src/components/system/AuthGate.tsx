"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthState, signInWithProvider } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/useI18n";

const ALLOW_PATHS = ["/settings"];

export function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { status } = useAuthState();
  const { t } = useI18n();

  const isAllowed = ALLOW_PATHS.some((p) => pathname?.startsWith(p));

  if (status === "loading") {
    return (
      <div className="rounded-apple border border-ios-sep bg-white p-5 shadow-apple">
        <div className="text-[14px] font-semibold">{t("로그인 확인 중…")}</div>
        <div className="mt-1 text-[12.5px] text-ios-muted">{t("잠시만 기다려 주세요.")}</div>
      </div>
    );
  }

  if (status !== "authenticated" && !isAllowed) {
    return (
      <div className={cn("rounded-apple border border-ios-sep bg-white p-5 shadow-apple")}
      >
        <div className="text-[15px] font-semibold">{t("로그인이 필요합니다")}</div>
        <div className="mt-1 text-[12.5px] text-ios-muted">
          {t("모든 기능은 로그인 후 사용할 수 있어요. 설정에서 소셜 로그인으로 연결해 주세요.")}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/settings"
            className="rounded-full bg-black px-4 py-2 text-[12.5px] font-semibold text-white"
          >
            {t("설정으로 이동")}
          </Link>
          <button
            type="button"
            onClick={() => signInWithProvider("google")}
            className="rounded-full border border-ios-sep bg-white px-4 py-2 text-[12.5px] font-semibold"
          >
            {t("Google로 로그인")}
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
