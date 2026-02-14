"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
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

export function SettingsAdminPage() {
  const { status } = useAuthState();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [openCount, setOpenCount] = useState(0);
  const [doneCount, setDoneCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);

  const load = useCallback(async () => {
    if (status !== "authenticated") return;
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchAdminRefundRequests({ limit: 200 });
      setTotal(rows.length);
      setOpenCount(
        rows.filter((r) => ["REQUESTED", "UNDER_REVIEW", "APPROVED", "EXECUTING", "FAILED_RETRYABLE"].includes(r.status)).length
      );
      setDoneCount(rows.filter((r) => r.status === "REFUNDED").length);
      setFailedCount(rows.filter((r) => r.status === "FAILED_FINAL" || r.status === "REJECTED").length);
    } catch (e: any) {
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
      { label: "열린 요청", value: openCount, tone: "text-[color:var(--wnl-accent)]" },
      { label: "환불 완료", value: doneCount, tone: "text-[#0B7A3E]" },
      { label: "거절/최종실패", value: failedCount, tone: "text-[#B3261E]" },
      { label: "총 요청(최근 200건)", value: total, tone: "text-ios-text" },
    ],
    [doneCount, failedCount, openCount, total]
  );

  return (
    <div className="mx-auto w-full max-w-[780px] px-4 pb-24 pt-6">
      <div className="mb-4 flex items-center gap-2">
        <Link
          href="/settings"
          className="wnl-btn-secondary inline-flex h-9 w-9 items-center justify-center text-[18px] text-ios-text"
        >
          ←
        </Link>
        <div className="text-[24px] font-extrabold tracking-[-0.02em] text-ios-text">운영 관리자</div>
      </div>

      {status !== "authenticated" ? (
        <div className="wnl-surface p-5">
          <div className="text-[16px] font-bold text-ios-text">로그인이 필요합니다</div>
          <p className="mt-2 text-[13px] text-ios-sub">관리자 화면은 관리자 계정 로그인 후 접근할 수 있습니다.</p>
          <button
            type="button"
            onClick={() => signInWithProvider("google")}
            className="wnl-btn-primary mt-4 px-4 py-2 text-[13px]"
          >
            Google로 로그인
          </button>
        </div>
      ) : null}

      {status === "authenticated" ? (
        <>
          <section className="wnl-surface p-5">
            <div className="text-[13px] font-semibold text-ios-sub">운영 요약</div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {cards.map((card) => (
                <div key={card.label} className="wnl-sub-surface p-3">
                  <div className="text-[11px] text-ios-sub">{card.label}</div>
                  <div className={`mt-1 text-[20px] font-extrabold tracking-[-0.02em] ${card.tone}`}>{card.value}</div>
                </div>
              ))}
            </div>
            {loading ? <div className="mt-3 text-[12px] text-ios-muted">불러오는 중...</div> : null}
            {error ? <div className="mt-3 text-[12px] text-red-600">{error}</div> : null}
          </section>

          <section className="wnl-surface mt-4 p-5">
            <div className="text-[15px] font-bold text-ios-text">관리 기능</div>
            <div className="mt-3 grid gap-2">
              <Link
                href="/settings/admin/refunds"
                className="wnl-btn-secondary inline-flex h-11 items-center justify-between px-4 text-[13px]"
              >
                환불/결제취소 요청 관리
                <span className="text-ios-sub">›</span>
              </Link>
              <Link
                href="/settings/admin/handoff"
                className="wnl-btn-secondary inline-flex h-11 items-center justify-between px-4 text-[13px]"
              >
                AI 인계 진단/보안/로그
                <span className="text-ios-sub">›</span>
              </Link>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

export default SettingsAdminPage;
