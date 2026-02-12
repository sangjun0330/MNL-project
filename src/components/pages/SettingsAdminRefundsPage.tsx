"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { signInWithProvider, useAuthState } from "@/lib/auth";
import { formatKrw } from "@/lib/billing/plans";
import {
  approveAdminRefund,
  executeAdminRefund,
  fetchAdminRefundDetail,
  fetchAdminRefundRequests,
  formatDateTimeLabel,
  markAdminRefundReview,
  rejectAdminRefund,
  runAdminRefundRetryBatch,
  refundStatusLabel,
  refundStatusTone,
  type AdminRefundDetail,
  type AdminRefundRequest,
  type AdminRefundStatus,
} from "@/lib/billing/adminClient";

const FILTER_ROWS: { key: "ALL" | AdminRefundStatus; label: string }[] = [
  { key: "ALL", label: "전체" },
  { key: "REQUESTED", label: "요청 접수" },
  { key: "UNDER_REVIEW", label: "검토 중" },
  { key: "APPROVED", label: "승인" },
  { key: "EXECUTING", label: "실행 중" },
  { key: "FAILED_RETRYABLE", label: "재시도 필요" },
  { key: "REFUNDED", label: "완료" },
  { key: "REJECTED", label: "거절" },
  { key: "FAILED_FINAL", label: "실패(최종)" },
  { key: "WITHDRAWN", label: "사용자 철회" },
];

function parseErrorMessage(input: string | null) {
  const text = String(input ?? "");
  if (!text) return "처리 중 오류가 발생했습니다.";
  if (text.includes("admin_forbidden")) return "관리자 권한이 없는 계정입니다.";
  if (text.includes("billing_admin_not_configured")) return "운영 환경변수(BILLING_ADMIN_USER_IDS/BILLING_ADMIN_EMAILS) 설정이 필요합니다.";
  if (text.includes("login_required")) return "로그인이 필요합니다.";
  if (text.includes("invalid_refund_request_state:")) return `상태 충돌: ${text.split(":")[1] ?? "invalid"}`;
  if (text.includes("toss_key_mode_mismatch")) return "토스 클라이언트키/시크릿키 모드(test/live)가 다릅니다.";
  if (text.includes("missing_toss_secret_key")) return "TOSS_SECRET_KEY 환경변수가 없습니다.";
  if (text.includes("missing_toss_client_key")) return "NEXT_PUBLIC_TOSS_CLIENT_KEY 환경변수가 없습니다.";
  if (text.includes("toss_cancel_network_error")) return "토스 취소 API 네트워크 오류입니다. 재시도해 주세요.";
  if (text.includes("retry_batch_failed")) return "재시도 배치 실행에 실패했습니다.";
  return text;
}

function eventTitle(eventType: string) {
  if (eventType === "refund.requested") return "요청 접수";
  if (eventType === "refund.under_review") return "검토 시작";
  if (eventType === "refund.approved") return "승인";
  if (eventType === "refund.rejected") return "거절";
  if (eventType === "refund.executing") return "실행 시작";
  if (eventType === "refund.refunded") return "환불 완료";
  if (eventType === "refund.failed_retryable") return "실패(재시도 가능)";
  if (eventType === "refund.failed_final") return "실패(최종)";
  if (eventType === "refund.admin_notified") return "관리자 알림 발송";
  if (eventType === "refund.withdrawn") return "사용자 철회";
  if (eventType === "refund.refunded_by_webhook") return "웹훅 동기화 완료";
  return eventType;
}

function boolState(input: AdminRefundStatus, targets: AdminRefundStatus[]) {
  return targets.includes(input);
}

export function SettingsAdminRefundsPage() {
  const { status } = useAuthState();
  const [filter, setFilter] = useState<"ALL" | AdminRefundStatus>("ALL");
  const [userIdFilter, setUserIdFilter] = useState("");
  const [requests, setRequests] = useState<AdminRefundRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [actionLoadingKey, setActionLoadingKey] = useState<string | null>(null);
  const [batchLoading, setBatchLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [details, setDetails] = useState<Record<number, AdminRefundDetail>>({});
  const [detailLoadingId, setDetailLoadingId] = useState<number | null>(null);

  const loadRequests = useCallback(async () => {
    if (status !== "authenticated") return;
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchAdminRefundRequests({
        status: filter === "ALL" ? null : filter,
        userId: userIdFilter.trim() || null,
        limit: 120,
      });
      setRequests(rows);
    } catch (e: any) {
      setError(parseErrorMessage(String(e?.message ?? "failed_to_load_refunds")));
    } finally {
      setLoading(false);
    }
  }, [filter, status, userIdFilter]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  const openDetail = useCallback(async (refundId: number) => {
    setSelectedId((prev) => (prev === refundId ? null : refundId));
    if (details[refundId]) return;
    setDetailLoadingId(refundId);
    try {
      const detail = await fetchAdminRefundDetail(refundId);
      setDetails((prev) => ({ ...prev, [refundId]: detail }));
    } catch (e: any) {
      setError(parseErrorMessage(String(e?.message ?? "failed_to_load_refund_detail")));
    } finally {
      setDetailLoadingId(null);
    }
  }, [details]);

  const refreshDetail = useCallback(async (refundId: number) => {
    try {
      const detail = await fetchAdminRefundDetail(refundId);
      setDetails((prev) => ({ ...prev, [refundId]: detail }));
    } catch {
      // ignore detail refresh failure
    }
  }, []);

  const runAction = useCallback(
    async (key: string, refundId: number, work: () => Promise<unknown>, successMessage: string) => {
      if (actionLoadingKey) return;
      setActionLoadingKey(key);
      setError(null);
      setNotice(null);
      try {
        await work();
        setNotice(successMessage);
        await loadRequests();
        await refreshDetail(refundId);
      } catch (e: any) {
        setError(parseErrorMessage(String(e?.message ?? "action_failed")));
      } finally {
        setActionLoadingKey(null);
      }
    },
    [actionLoadingKey, loadRequests, refreshDetail]
  );

  const isActionBusy = actionLoadingKey !== null;

  const runRetryBatch = useCallback(async () => {
    if (batchLoading || isActionBusy) return;
    setBatchLoading(true);
    setError(null);
    setNotice(null);
    try {
      const result = await runAdminRefundRetryBatch({ limit: 12, dryRun: false });
      const successCount = Number(result.successCount ?? 0);
      const failCount = Number(result.failCount ?? 0);
      const total = Number(result.total ?? 0);
      setNotice(`재시도 배치 완료 · 총 ${total}건 / 성공 ${successCount}건 / 실패 ${failCount}건`);
      await loadRequests();
    } catch (e: any) {
      setError(parseErrorMessage(String(e?.message ?? "retry_batch_failed")));
    } finally {
      setBatchLoading(false);
    }
  }, [batchLoading, isActionBusy, loadRequests]);

  const summary = useMemo(() => {
    const open = requests.filter((r) => ["REQUESTED", "UNDER_REVIEW", "APPROVED", "EXECUTING", "FAILED_RETRYABLE"].includes(r.status)).length;
    const done = requests.filter((r) => r.status === "REFUNDED").length;
    const failed = requests.filter((r) => r.status === "FAILED_FINAL" || r.status === "REJECTED").length;
    return { open, done, failed };
  }, [requests]);

  const currentActionLabel = useMemo(() => {
    if (!actionLoadingKey) return null;
    const [action, id] = actionLoadingKey.split(":");
    const actionMap: Record<string, string> = {
      review: "검토 시작",
      approve: "승인",
      reject: "거절",
      execute: "환불 실행",
      approve_execute: "승인+즉시실행",
    };
    return `${actionMap[action] ?? action} 처리 중 (#${id ?? "-"})`;
  }, [actionLoadingKey]);

  return (
    <div className="mx-auto w-full max-w-[860px] px-4 pb-24 pt-6">
      <div className="mb-4 flex items-center gap-2">
        <Link
          href="/settings/admin"
          className="wnl-btn-secondary inline-flex h-9 w-9 items-center justify-center text-[18px] text-ios-text"
        >
          ←
        </Link>
        <div className="text-[24px] font-extrabold tracking-[-0.02em] text-ios-text">환불/결제취소 관리</div>
      </div>

      {status !== "authenticated" ? (
        <div className="wnl-surface p-5">
          <div className="text-[16px] font-bold text-ios-text">로그인이 필요합니다</div>
          <p className="mt-2 text-[13px] text-ios-sub">관리자 계정으로 로그인해야 환불 관리 기능을 사용할 수 있습니다.</p>
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
            <div className="grid grid-cols-3 gap-2">
              <div className="wnl-sub-surface p-3">
                <div className="text-[11px] text-ios-sub">열린 요청</div>
                <div className="mt-1 text-[20px] font-extrabold text-[color:var(--wnl-accent)]">{summary.open}</div>
              </div>
              <div className="wnl-sub-surface p-3">
                <div className="text-[11px] text-ios-sub">환불 완료</div>
                <div className="mt-1 text-[20px] font-extrabold text-[#0B7A3E]">{summary.done}</div>
              </div>
              <div className="wnl-sub-surface p-3">
                <div className="text-[11px] text-ios-sub">거절/실패</div>
                <div className="mt-1 text-[20px] font-extrabold text-[#B3261E]">{summary.failed}</div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-1.5">
              {FILTER_ROWS.map((row) => (
                <button
                  key={row.key}
                  type="button"
                  onClick={() => setFilter(row.key)}
                  className={`rounded-full border px-3 py-1 text-[12px] font-semibold transition ${
                    filter === row.key
                      ? "border-[color:var(--wnl-accent-border)] bg-[color:var(--wnl-accent-soft)] text-[color:var(--wnl-accent)]"
                      : "border-ios-sep bg-white text-ios-sub hover:bg-ios-bg"
                  }`}
                >
                  {row.label}
                </button>
              ))}
            </div>

            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input
                value={userIdFilter}
                onChange={(e) => setUserIdFilter(e.target.value)}
                placeholder="userId 필터 (선택)"
                className="h-10 w-full rounded-full border border-ios-sep bg-white px-4 text-[13px] text-ios-text outline-none placeholder:text-ios-muted focus:border-[color:var(--wnl-accent-border)]"
              />
              <button
                type="button"
                onClick={() => void loadRequests()}
                className="wnl-btn-secondary inline-flex h-10 items-center justify-center px-4 text-[13px]"
              >
                새로고침
              </button>
              <button
                type="button"
                onClick={() => void runRetryBatch()}
                disabled={batchLoading || isActionBusy}
                className="wnl-btn-primary inline-flex h-10 items-center justify-center px-4 text-[13px] disabled:opacity-50"
              >
                {batchLoading ? "재시도 실행 중..." : "재시도 큐 실행"}
              </button>
            </div>

            {loading ? <div className="mt-3 text-[12px] text-ios-muted">불러오는 중...</div> : null}
            {currentActionLabel ? <div className="mt-3 text-[12px] text-ios-muted">{currentActionLabel}</div> : null}
            {error ? <div className="mt-3 text-[12px] text-red-600">{error}</div> : null}
            {notice ? <div className="mt-3 text-[12px] text-[#0B7A3E]">{notice}</div> : null}
          </section>

          <section className="mt-4 space-y-2.5">
            {requests.length === 0 ? (
              <div className="wnl-surface p-5 text-[13px] text-ios-sub">
                조건에 맞는 환불 요청이 없습니다.
              </div>
            ) : null}

            {requests.map((request) => {
              const isSelected = selectedId === request.id;
              const canReview = boolState(request.status, ["REQUESTED", "FAILED_RETRYABLE"]);
              const canApprove = boolState(request.status, ["REQUESTED", "UNDER_REVIEW", "FAILED_RETRYABLE"]);
              const canReject = boolState(request.status, ["REQUESTED", "UNDER_REVIEW", "APPROVED", "FAILED_RETRYABLE"]);
              const canExecute = boolState(request.status, ["APPROVED", "FAILED_RETRYABLE", "EXECUTING"]);

              return (
                <div key={request.id} className="wnl-surface p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-[15px] font-bold text-ios-text">#{request.id} · {request.orderId}</div>
                      <div className="mt-0.5 text-[12px] text-ios-sub">
                        user: {request.userId} · {formatDateTimeLabel(request.requestedAt)}
                      </div>
                    </div>
                    <div className={`text-[12px] font-semibold ${refundStatusTone(request.status)}`}>
                      {refundStatusLabel(request.status)}
                    </div>
                  </div>

                  <div className="wnl-sub-surface mt-2 px-3 py-2">
                    <div className="text-[12px] text-ios-sub">사유</div>
                    <div className="mt-0.5 text-[13px] text-ios-text">{request.reason}</div>
                    <div className="mt-1 text-[12px] text-ios-sub">
                      환불 요청 금액: {formatKrw(request.cancelAmount ?? 0)} ({request.currency})
                    </div>
                    {request.errorCode || request.errorMessage ? (
                      <div className="mt-1 text-[11.5px] text-[#B3261E]">
                        {request.errorCode ?? "error"} {request.errorMessage ? `· ${request.errorMessage}` : ""}
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => void openDetail(request.id)}
                      className="wnl-btn-secondary inline-flex h-9 items-center justify-center px-3 text-[12px]"
                    >
                      {isSelected ? "상세 닫기" : "상세 보기"}
                    </button>
                    {canReview ? (
                      <button
                        type="button"
                        disabled={actionLoadingKey !== null}
                        onClick={() => {
                          const note = window.prompt("검토 메모(선택)", "");
                          void runAction(
                            `review:${request.id}`,
                            request.id,
                            () => markAdminRefundReview(request.id, note),
                            `요청 #${request.id}를 검토중으로 전환했습니다.`
                          );
                        }}
                        className="wnl-btn-secondary inline-flex h-9 items-center justify-center px-3 text-[12px] disabled:opacity-40"
                      >
                        검토 시작
                      </button>
                    ) : null}
                    {canApprove ? (
                      <button
                        type="button"
                        disabled={actionLoadingKey !== null}
                        onClick={() => {
                          const confirmed = window.confirm(`요청 #${request.id}를 승인할까요?`);
                          if (!confirmed) return;
                          const note = window.prompt("승인 메모(선택)", "");
                          void runAction(
                            `approve:${request.id}`,
                            request.id,
                            () => approveAdminRefund(request.id, note),
                            `요청 #${request.id}를 승인했습니다.`
                          );
                        }}
                        className="inline-flex h-9 items-center justify-center rounded-full border border-[color:var(--wnl-accent-border)] bg-[color:var(--wnl-accent-soft)] px-3 text-[12px] font-semibold text-[color:var(--wnl-accent)] transition hover:brightness-[0.98] disabled:opacity-40"
                      >
                        승인
                      </button>
                    ) : null}
                    {canReject ? (
                      <button
                        type="button"
                        disabled={actionLoadingKey !== null}
                        onClick={() => {
                          const reason = window.prompt("거절 사유(필수)", "");
                          if (reason == null) return;
                          if (!reason.trim()) {
                            setError("거절 사유를 입력해 주세요.");
                            return;
                          }
                          const note = window.prompt("내부 메모(선택)", "");
                          void runAction(
                            `reject:${request.id}`,
                            request.id,
                            () =>
                              rejectAdminRefund({
                                refundId: request.id,
                                reason,
                                note,
                              }),
                            `요청 #${request.id}를 거절했습니다.`
                          );
                        }}
                        className="inline-flex h-9 items-center justify-center rounded-full border border-[#B3261E33] bg-[#B3261E12] px-3 text-[12px] font-semibold text-[#B3261E] transition hover:bg-[#B3261E1A] disabled:opacity-40"
                      >
                        거절
                      </button>
                    ) : null}
                    {canExecute ? (
                      <button
                        type="button"
                        disabled={isActionBusy}
                        onClick={() => {
                          const confirmed = window.confirm(
                            `요청 #${request.id} 환불을 실제 실행할까요?\n토스 취소 API를 호출하고, 성공 시 플랜을 Free로 전환합니다.`
                          );
                          if (!confirmed) return;
                          const note = window.prompt("실행 메모(선택)", "관리자 수동 환불 실행");
                          void runAction(
                            `execute:${request.id}`,
                            request.id,
                            () =>
                              executeAdminRefund({
                                refundId: request.id,
                                note,
                                cancelAmount: request.cancelAmount ?? undefined,
                              }),
                            `요청 #${request.id} 환불 실행이 완료되었습니다.`
                          );
                        }}
                        className="wnl-btn-primary inline-flex h-9 items-center justify-center px-3 text-[12px] disabled:opacity-40"
                      >
                        환불 실행
                      </button>
                    ) : null}
                    {canApprove && canExecute ? (
                      <button
                        type="button"
                        disabled={isActionBusy}
                        onClick={() => {
                          const confirmed = window.confirm(
                            `요청 #${request.id}를 승인 후 즉시 실행할까요?\n(승인 -> 토스 취소 호출 순서로 진행됩니다.)`
                          );
                          if (!confirmed) return;
                          const approveNote = window.prompt("승인 메모(선택)", "");
                          const executeNote = window.prompt("실행 메모(선택)", "관리자 즉시 환불 실행");
                          void runAction(
                            `approve_execute:${request.id}`,
                            request.id,
                            async () => {
                              await approveAdminRefund(request.id, approveNote);
                              await executeAdminRefund({
                                refundId: request.id,
                                note: executeNote,
                                cancelAmount: request.cancelAmount ?? undefined,
                              });
                            },
                            `요청 #${request.id} 승인 및 환불 실행이 완료되었습니다.`
                          );
                        }}
                        className="inline-flex h-9 items-center justify-center rounded-full border border-ios-sep bg-white px-3 text-[12px] font-semibold text-ios-text transition hover:border-[color:var(--wnl-accent-border)] disabled:opacity-40"
                      >
                        승인+즉시실행
                      </button>
                    ) : null}
                  </div>

                  {isSelected ? (
                    <div className="wnl-sub-surface mt-3 px-3 py-3">
                      {detailLoadingId === request.id ? (
                        <div className="text-[12px] text-ios-muted">상세를 불러오는 중...</div>
                      ) : (
                        <>
                          <div className="text-[12px] font-semibold text-ios-sub">상세 상태</div>
                          <div className="mt-1 grid gap-1 text-[12px] text-ios-sub">
                            <div>reviewedBy: {request.reviewedBy ?? "-"}</div>
                            <div>reviewedAt: {formatDateTimeLabel(request.reviewedAt)}</div>
                            <div>executedBy: {request.executedBy ?? "-"}</div>
                            <div>executedAt: {formatDateTimeLabel(request.executedAt)}</div>
                            <div>retryCount: {request.retryCount}</div>
                            <div>nextRetryAt: {formatDateTimeLabel(request.nextRetryAt)}</div>
                            <div>transactionKey: {request.tossCancelTransactionKey ?? "-"}</div>
                          </div>

                          <div className="mt-3 border-t border-ios-sep pt-2">
                            <div className="text-[12px] font-semibold text-ios-sub">이벤트 로그</div>
                            <div className="mt-1 space-y-1.5">
                              {(details[request.id]?.events ?? []).length === 0 ? (
                                <div className="text-[12px] text-ios-muted">이벤트가 아직 없습니다.</div>
                              ) : (
                                (details[request.id]?.events ?? []).map((event) => (
                                  <div key={event.id} className="rounded-xl border border-ios-sep bg-white/85 px-2.5 py-2">
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="text-[12px] font-semibold text-ios-text">{eventTitle(event.eventType)}</div>
                                      <div className="text-[11px] text-ios-muted">{formatDateTimeLabel(event.createdAt)}</div>
                                    </div>
                                    <div className="mt-0.5 text-[11.5px] text-ios-sub">
                                      {event.fromStatus ?? "-"} → {event.toStatus ?? "-"} · {event.actorRole}
                                    </div>
                                    {event.message ? <div className="mt-0.5 text-[11.5px] text-ios-sub">{event.message}</div> : null}
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </section>
        </>
      ) : null}
    </div>
  );
}

export default SettingsAdminRefundsPage;
