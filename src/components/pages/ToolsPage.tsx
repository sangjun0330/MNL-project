"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useBillingAccess } from "@/components/billing/useBillingAccess";
import { Card } from "@/components/ui/Card";
import { useAuthState } from "@/lib/auth";
import { authHeaders } from "@/lib/billing/client";
import { HANDOFF_FLAGS } from "@/lib/handoff/featureFlags";
import { useI18n } from "@/lib/useI18n";

export function ToolsPage() {
  const { t } = useI18n();
  const router = useRouter();
  const { status, user } = useAuthState();
  const { hasPaidAccess, loading: billingLoading } = useBillingAccess();
  const [isHandoffAdmin, setIsHandoffAdmin] = useState(false);

  useEffect(() => {
    let active = true;
    if (status !== "authenticated" || !user?.userId) {
      setIsHandoffAdmin(false);
      return () => {
        active = false;
      };
    }

    const run = async () => {
      try {
        const headers = await authHeaders();
        const res = await fetch("/api/admin/billing/access", {
          method: "GET",
          headers: {
            "content-type": "application/json",
            ...headers,
          },
          cache: "no-store",
        });
        const json = await res.json().catch(() => null);
        if (!active) return;
        setIsHandoffAdmin(Boolean(json?.ok && json?.data?.isAdmin));
      } catch {
        if (!active) return;
        setIsHandoffAdmin(false);
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [status, user?.userId]);

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

      <Link
        href="/tools/med-safety"
        className="block"
        onClick={(event) => {
          if (billingLoading || hasPaidAccess) return;
          event.preventDefault();
          const confirmed = window.confirm(
            t("AI 약물·기구 안전 가이드는 유료 플랜 전용 기능입니다.\n플랜 업그레이드 페이지로 이동할까요?")
          );
          if (confirmed) router.push("/settings/billing/upgrade");
        }}
      >
        <Card className="p-6 transition hover:translate-y-[-1px] hover:border-[color:var(--wnl-accent-border)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[20px] font-extrabold tracking-[-0.02em] text-ios-text">{t("AI 약물·기구 안전 가이드")}</div>
              <div className="mt-1 text-[13px] text-ios-sub">
                {!billingLoading && !hasPaidAccess
                  ? t("유료 플랜에서 AI 약물·기구 안전 가이드를 사용할 수 있어요.")
                  : t("사진·텍스트로 투여 전 확인사항, 수행 절차, 중단·보고 기준을 빠르게 정리해줍니다.")}
              </div>
            </div>
            <span className="wnl-chip-accent px-3 py-1 text-[11px]">{!billingLoading && !hasPaidAccess ? t("PRO") : t("AI")}</span>
          </div>
        </Card>
      </Link>

      {HANDOFF_FLAGS.handoffEnabled && isHandoffAdmin ? (
        <Link href="/tools/handoff" className="block">
          <Card className="p-6 transition hover:translate-y-[-1px] hover:border-[color:var(--wnl-accent-border)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[20px] font-extrabold tracking-[-0.02em] text-ios-text">{t("AI 인계")}</div>
                <div className="mt-1 text-[13px] text-ios-sub">
                  {t("온디바이스 녹음/로컬 ASR/PHI 마스킹으로 인계를 환자별 카드로 구조화합니다.")}
                </div>
              </div>
              <span className="wnl-chip-accent px-3 py-1 text-[11px]">{t("ADMIN")}</span>
            </div>
          </Card>
        </Link>
      ) : null}
    </div>
  );
}

export default ToolsPage;
