"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { authHeaders } from "@/lib/billing/client";
import { signInWithProvider, useAuthState } from "@/lib/auth";
import { fetchAdminRefundRequests } from "@/lib/billing/adminClient";

function parseErrorMessage(input: string | null) {
  const text = String(input ?? "");
  if (!text) return "관리자 정보를 불러오지 못했습니다.";
  if (text.includes("admin_forbidden")) return "관리자 권한이 없는 계정입니다.";
  if (text.includes("billing_admin_not_configured")) return "BILLING_ADMIN_USER_IDS/BILLING_ADMIN_EMAILS가 설정되지 않았습니다.";
  if (text.includes("login_required")) return "로그인이 필요합니다.";
  return text;
}

function AdminMetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <div className="rounded-[24px] border border-white/70 bg-white/85 px-4 py-4 shadow-[0_10px_30px_rgba(17,41,75,0.06)]">
      <div className="text-[11px] font-semibold text-ios-sub">{label}</div>
      <div className={`mt-2 text-[24px] font-extrabold tracking-[-0.03em] ${tone}`}>{value}</div>
    </div>
  );
}

function AdminEntryCard({
  title,
  description,
  bullets,
  href,
  cta,
  accent,
}: {
  title: string;
  description: string;
  bullets: string[];
  href: string;
  cta: string;
  accent: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-[28px] border border-white/80 bg-white/90 p-5 shadow-[0_18px_50px_rgba(17,41,75,0.07)] transition hover:-translate-y-[1px]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[17px] font-bold tracking-[-0.02em] text-ios-text">{title}</div>
          <p className="mt-2 text-[12.5px] leading-6 text-ios-sub">{description}</p>
        </div>
        <div className={`rounded-full px-3 py-1 text-[11px] font-semibold ${accent}`}>{cta}</div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {bullets.map((bullet) => (
          <span
            key={bullet}
            className="rounded-full border border-[#d9e2ee] bg-[#f7f9fc] px-3 py-1 text-[11px] font-semibold text-[#41556f]"
          >
            {bullet}
          </span>
        ))}
      </div>
      <div className="mt-4 inline-flex items-center gap-2 text-[12px] font-semibold text-[#17324d]">
        열기
        <span className="transition group-hover:translate-x-0.5">→</span>
      </div>
    </Link>
  );
}

export function SettingsAdminPage() {
  const { status } = useAuthState();
  const [accessState, setAccessState] = useState<"unknown" | "granted" | "denied">("unknown");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [openCount, setOpenCount] = useState(0);
  const [doneCount, setDoneCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);

  const load = useCallback(async () => {
    if (status !== "authenticated") {
      setAccessState("unknown");
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const headers = await authHeaders();
      const accessRes = await fetch("/api/admin/billing/access", {
        method: "GET",
        headers: {
          "content-type": "application/json",
          ...headers,
        },
        cache: "no-store",
      });
      const accessJson = await accessRes.json().catch(() => null);
      if (!accessRes.ok || !accessJson?.ok) {
        throw new Error(String(accessJson?.error ?? `failed_to_check_admin_access:${accessRes.status}`));
      }
      if (!accessJson?.data?.isAdmin) {
        setAccessState("denied");
        setTotal(0);
        setOpenCount(0);
        setDoneCount(0);
        setFailedCount(0);
        return;
      }

      setAccessState("granted");
      try {
        const rows = await fetchAdminRefundRequests({ limit: 200 });
        setTotal(rows.length);
        setOpenCount(
          rows.filter((r) => ["REQUESTED", "UNDER_REVIEW", "APPROVED", "EXECUTING", "FAILED_RETRYABLE"].includes(r.status)).length
        );
        setDoneCount(rows.filter((r) => r.status === "REFUNDED").length);
        setFailedCount(rows.filter((r) => r.status === "FAILED_FINAL" || r.status === "REJECTED").length);
      } catch (dashboardError: any) {
        setTotal(0);
        setOpenCount(0);
        setDoneCount(0);
        setFailedCount(0);
        setError(parseErrorMessage(String(dashboardError?.message ?? "failed_to_load_admin_dashboard")));
      }
    } catch (e: any) {
      setAccessState("denied");
      setError(parseErrorMessage(String(e?.message ?? "failed_to_load_admin_dashboard")));
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  const cards = useMemo(
    () => [
      { label: "열린 요청", value: openCount, tone: "text-[color:var(--rnest-accent)]" },
      { label: "환불 완료", value: doneCount, tone: "text-[#0B7A3E]" },
      { label: "거절/최종실패", value: failedCount, tone: "text-[#B3261E]" },
      { label: "총 요청(최근 200건)", value: total, tone: "text-ios-text" },
    ],
    [doneCount, failedCount, openCount, total]
  );

  const toolCards = useMemo(
    () => [
      {
        title: "쇼핑 운영",
        description: "상품 카탈로그, 주문 흐름, 배송 처리, 쇼핑 환불을 한 화면 흐름으로 관리합니다.",
        bullets: ["상품 등록", "주문·배송", "쇼핑 환불"],
        href: "/settings/admin/shop",
        cta: "쇼핑 관리",
        accent: "bg-[#eaf1f8] text-[#17324d]",
      },
      {
        title: "결제·환불 로그",
        description: "Toss 결제 로그와 구독/크레딧팩 환불 워크플로를 같은 기준으로 정리합니다.",
        bullets: [`열린 요청 ${openCount}건`, `완료 ${doneCount}건`, `실패 ${failedCount}건`],
        href: "/settings/admin/refunds",
        cta: "정산 관리",
        accent: "bg-[#eef4fb] text-[#11294b]",
      },
    ],
    [doneCount, failedCount, openCount]
  );

  return (
    <div className="mx-auto w-full max-w-[920px] px-4 pb-24 pt-6">
      <div className="mb-4 flex items-center gap-3">
        <Link
          href="/settings"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/80 bg-white/90 text-[18px] text-ios-text shadow-[0_8px_24px_rgba(17,41,75,0.06)]"
        >
          ←
        </Link>
        <div>
          <div className="text-[28px] font-extrabold tracking-[-0.03em] text-ios-text">운영 관리자</div>
          <div className="text-[12.5px] text-ios-sub">쇼핑 운영과 결제 운영을 역할별로 나눠 관리합니다.</div>
        </div>
      </div>

      {status !== "authenticated" ? (
        <div className="rnest-surface p-5">
          <div className="text-[16px] font-bold text-ios-text">로그인이 필요합니다</div>
          <p className="mt-2 text-[13px] text-ios-sub">관리자 화면은 관리자 계정 로그인 후 접근할 수 있습니다.</p>
          <button
            type="button"
            onClick={() => signInWithProvider("google")}
            className="rnest-btn-primary mt-4 px-4 py-2 text-[13px]"
          >
            Google로 로그인
          </button>
        </div>
      ) : null}

      {status === "authenticated" ? (
        <>
          {accessState === "granted" ? (
            <>
              <section className="rounded-[32px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(244,248,252,0.96))] p-6 shadow-[0_22px_70px_rgba(17,41,75,0.08)]">
                <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
                  <div>
                    <div className="inline-flex rounded-full border border-[#dbe4ef] bg-white px-3 py-1 text-[11px] font-semibold text-[#17324d]">
                      운영 요약
                    </div>
                    <div className="mt-4 text-[24px] font-bold tracking-[-0.03em] text-ios-text">
                      한 번에 보고, 필요한 화면으로 바로 이동
                    </div>
                    <p className="mt-2 text-[13px] leading-6 text-ios-sub">
                      쇼핑 운영은 상품·주문·배송 중심으로, 결제 운영은 환불·정산 로그 중심으로 분리해 관리합니다.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <span className="rounded-full border border-[#d9e2ee] bg-white px-3 py-1 text-[11px] font-semibold text-[#41556f]">
                        최근 환불 요청 {total}건
                      </span>
                      <span className="rounded-full border border-[#d9e2ee] bg-white px-3 py-1 text-[11px] font-semibold text-[#41556f]">
                        처리 대기 {openCount}건
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                  {cards.map((card) => (
                    <AdminMetricCard key={card.label} label={card.label} value={card.value} tone={card.tone} />
                  ))}
                  </div>
                </div>
                {loading ? <div className="mt-3 text-[12px] text-ios-muted">불러오는 중...</div> : null}
                {error ? <div className="mt-3 text-[12px] text-red-600">{error}</div> : null}
              </section>

              <section className="mt-4 grid gap-4 md:grid-cols-2">
                {toolCards.map((card) => (
                  <AdminEntryCard key={card.title} {...card} />
                ))}
              </section>
            </>
          ) : (
            <section className="rnest-surface p-5">
              <div className="text-[15px] font-bold text-ios-text">관리자 권한 확인</div>
              <p className="mt-2 text-[13px] leading-6 text-ios-sub">
                {loading
                  ? "관리자 권한을 확인하는 중입니다."
                  : error || "현재 로그인한 계정은 운영 관리자 권한이 없습니다."}
              </p>
            </section>
          )}
        </>
      ) : null}
    </div>
  );
}

export default SettingsAdminPage;
