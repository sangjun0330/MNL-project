"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { signInWithProvider, useAuthState } from "@/lib/auth";
import { formatKrw } from "@/lib/billing/plans";
import {
  approveAdminRefund,
  executeAdminRefund,
  fetchAdminBillingOrders,
  fetchAdminRefundDetail,
  fetchAdminRefundRequests,
  formatDateTimeLabel,
  markAdminRefundReview,
  rejectAdminRefund,
  runAdminRefundRetryBatch,
  refundStatusLabel,
  refundStatusTone,
  type AdminBillingOrder,
  type AdminBillingOrderKind,
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

function OpsMetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  tone: string;
}) {
  return (
    <div className="rounded-[22px] border border-white/70 bg-white/85 px-4 py-4 shadow-[0_10px_30px_rgba(17,41,75,0.05)]">
      <div className="text-[11px] font-semibold text-ios-sub">{label}</div>
      <div className={`mt-2 text-[22px] font-extrabold tracking-[-0.03em] ${tone}`}>{value}</div>
    </div>
  );
}

export function SettingsAdminRefundsPage() {
  const { status } = useAuthState();
  const [filter, setFilter] = useState<"ALL" | AdminRefundStatus>("ALL");
  const [userIdFilter, setUserIdFilter] = useState("");
  const [requests, setRequests] = useState<AdminRefundRequest[]>([]);
  const [orders, setOrders] = useState<AdminBillingOrder[]>([]);
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
      const userId = userIdFilter.trim() || null;
      const [refundRows, orderRows] = await Promise.all([
        fetchAdminRefundRequests({
          status: filter === "ALL" ? null : filter,
          userId,
          limit: 120,
        }),
        fetchAdminBillingOrders({
          userId,
          limit: 120,
        }),
      ]);
      setRequests(refundRows);
      setOrders(orderRows);
    } catch (e: any) {
      setError(parseErrorMessage(String(e?.message ?? "failed_to_load_refunds")));
    } finally {
      setLoading(false);
    }
  }, [filter, status, userIdFilter]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  const loadDetail = useCallback(
    async (refundId: number, skipIfLoaded = true) => {
      if (skipIfLoaded && details[refundId]) return;
      setDetailLoadingId(refundId);
      try {
        const detail = await fetchAdminRefundDetail(refundId);
        setDetails((prev) => ({ ...prev, [refundId]: detail }));
      } catch (e: any) {
        setError(parseErrorMessage(String(e?.message ?? "failed_to_load_refund_detail")));
      } finally {
        setDetailLoadingId(null);
      }
    },
    [details]
  );

  useEffect(() => {
    if (requests.length === 0) {
      if (selectedId !== null) setSelectedId(null);
      return;
    }

    const nextId = requests.some((request) => request.id === selectedId) ? selectedId : requests[0].id;
    if (nextId == null) return;
    if (selectedId !== nextId) setSelectedId(nextId);
    if (!details[nextId] && detailLoadingId !== nextId) {
      void loadDetail(nextId);
    }
  }, [detailLoadingId, details, loadDetail, requests, selectedId]);

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
    const requested = requests.filter((r) => r.status === "REQUESTED").length;
    const retryable = requests.filter((r) => r.status === "FAILED_RETRYABLE").length;
    return { open, done, failed, requested, retryable };
  }, [requests]);

  const orderSummary = useMemo(() => {
    let done = 0;
    let failed = 0;
    let canceled = 0;
    let ready = 0;
    let totalAmount = 0;
    const kindCounter: Record<AdminBillingOrderKind, number> = {
      subscription: 0,
      credit_pack: 0,
    };

    for (const order of orders) {
      if (order.status === "DONE") done += 1;
      else if (order.status === "FAILED") failed += 1;
      else if (order.status === "CANCELED") canceled += 1;
      else ready += 1;
      totalAmount += Math.max(0, Math.round(Number(order.amount ?? 0)));
      if (order.orderKind === "subscription" || order.orderKind === "credit_pack") {
        kindCounter[order.orderKind] += 1;
      }
    }
    return {
      total: orders.length,
      done,
      failed,
      canceled,
      ready,
      totalAmount,
      kindCounter,
    };
  }, [orders]);

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

  const selectedRequest = useMemo(
    () => requests.find((request) => request.id === selectedId) ?? null,
    [requests, selectedId]
  );
  const selectedDetail = selectedRequest ? details[selectedRequest.id] ?? null : null;
  const relatedOrder = useMemo(
    () => (selectedRequest ? orders.find((order) => order.orderId === selectedRequest.orderId) ?? null : null),
    [orders, selectedRequest]
  );
  const visibleOrders = useMemo(() => orders.slice(0, 12), [orders]);

  const canReview = selectedRequest ? boolState(selectedRequest.status, ["REQUESTED", "FAILED_RETRYABLE"]) : false;
  const canApprove = selectedRequest
    ? boolState(selectedRequest.status, ["REQUESTED", "UNDER_REVIEW", "FAILED_RETRYABLE"])
    : false;
  const canReject = selectedRequest
    ? boolState(selectedRequest.status, ["REQUESTED", "UNDER_REVIEW", "APPROVED", "FAILED_RETRYABLE"])
    : false;
  const canExecute = selectedRequest ? boolState(selectedRequest.status, ["APPROVED", "FAILED_RETRYABLE", "EXECUTING"]) : false;

  const selectRequest = useCallback(
    (refundId: number) => {
      setSelectedId(refundId);
      void loadDetail(refundId);
    },
    [loadDetail]
  );

  const startReview = useCallback(() => {
    if (!selectedRequest || !canReview) return;
    const note = window.prompt("검토 메모(선택)", "");
    void runAction(
      `review:${selectedRequest.id}`,
      selectedRequest.id,
      () => markAdminRefundReview(selectedRequest.id, note),
      `요청 #${selectedRequest.id}를 검토중으로 전환했습니다.`
    );
  }, [canReview, runAction, selectedRequest]);

  const approveSelected = useCallback(() => {
    if (!selectedRequest || !canApprove) return;
    const confirmed = window.confirm(`요청 #${selectedRequest.id}를 승인할까요?`);
    if (!confirmed) return;
    const note = window.prompt("승인 메모(선택)", "");
    void runAction(
      `approve:${selectedRequest.id}`,
      selectedRequest.id,
      () => approveAdminRefund(selectedRequest.id, note),
      `요청 #${selectedRequest.id}를 승인했습니다.`
    );
  }, [canApprove, runAction, selectedRequest]);

  const rejectSelected = useCallback(() => {
    if (!selectedRequest || !canReject) return;
    const reason = window.prompt("거절 사유(필수)", "");
    if (reason == null) return;
    if (!reason.trim()) {
      setError("거절 사유를 입력해 주세요.");
      return;
    }
    const note = window.prompt("내부 메모(선택)", "");
    void runAction(
      `reject:${selectedRequest.id}`,
      selectedRequest.id,
      () =>
        rejectAdminRefund({
          refundId: selectedRequest.id,
          reason,
          note,
        }),
      `요청 #${selectedRequest.id}를 거절했습니다.`
    );
  }, [canReject, runAction, selectedRequest]);

  const executeSelected = useCallback(() => {
    if (!selectedRequest || !canExecute) return;
    const confirmed = window.confirm(
      `요청 #${selectedRequest.id} 환불을 실제 실행할까요?\n토스 취소 API를 호출하고, 성공 시 플랜을 Free로 전환합니다.`
    );
    if (!confirmed) return;
    const note = window.prompt("실행 메모(선택)", "관리자 수동 환불 실행");
    void runAction(
      `execute:${selectedRequest.id}`,
      selectedRequest.id,
      () =>
        executeAdminRefund({
          refundId: selectedRequest.id,
          note,
          cancelAmount: selectedRequest.cancelAmount ?? undefined,
        }),
      `요청 #${selectedRequest.id} 환불 실행이 완료되었습니다.`
    );
  }, [canExecute, runAction, selectedRequest]);

  const approveAndExecuteSelected = useCallback(() => {
    if (!selectedRequest || !(canApprove && canExecute)) return;
    const confirmed = window.confirm(
      `요청 #${selectedRequest.id}를 승인 후 즉시 실행할까요?\n(승인 -> 토스 취소 호출 순서로 진행됩니다.)`
    );
    if (!confirmed) return;
    const approveNote = window.prompt("승인 메모(선택)", "");
    const executeNote = window.prompt("실행 메모(선택)", "관리자 즉시 환불 실행");
    void runAction(
      `approve_execute:${selectedRequest.id}`,
      selectedRequest.id,
      async () => {
        await approveAdminRefund(selectedRequest.id, approveNote);
        await executeAdminRefund({
          refundId: selectedRequest.id,
          note: executeNote,
          cancelAmount: selectedRequest.cancelAmount ?? undefined,
        });
      },
      `요청 #${selectedRequest.id} 승인 및 환불 실행이 완료되었습니다.`
    );
  }, [canApprove, canExecute, runAction, selectedRequest]);

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 pb-24 pt-6">
      <div className="mb-4 flex items-center gap-3">
        <Link
          href="/settings/admin"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/80 bg-white/90 text-[18px] text-ios-text shadow-[0_8px_24px_rgba(17,41,75,0.06)]"
        >
          ←
        </Link>
        <div>
          <div className="text-[28px] font-extrabold tracking-[-0.03em] text-ios-text">결제·환불 운영</div>
          <div className="text-[12.5px] text-ios-sub">환불 요청 큐와 결제 상태를 같은 기준으로 보고, 선택한 요청만 집중 처리합니다.</div>
        </div>
      </div>

      {status !== "authenticated" ? (
        <div className="rnest-surface p-5">
          <div className="text-[16px] font-bold text-ios-text">로그인이 필요합니다</div>
          <p className="mt-2 text-[13px] text-ios-sub">관리자 계정으로 로그인해야 환불 관리 기능을 사용할 수 있습니다.</p>
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
          <section className="rounded-[32px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(244,248,252,0.96))] p-6 shadow-[0_22px_70px_rgba(17,41,75,0.08)]">
            <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
              <div>
                <div className="inline-flex rounded-full border border-[#dbe4ef] bg-white px-3 py-1 text-[11px] font-semibold text-[#17324d]">
                  환불 처리 큐
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <OpsMetricCard label="열린 요청" value={summary.open} tone="text-[color:var(--rnest-accent)]" />
                  <OpsMetricCard label="즉시 검토 필요" value={summary.requested} tone="text-[#17324d]" />
                  <OpsMetricCard label="재시도 필요" value={summary.retryable} tone="text-[#C2410C]" />
                  <OpsMetricCard label="환불 완료" value={summary.done} tone="text-[#0B7A3E]" />
                </div>
              </div>

              <div>
                <div className="inline-flex rounded-full border border-[#dbe4ef] bg-white px-3 py-1 text-[11px] font-semibold text-[#17324d]">
                  결제 흐름
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <OpsMetricCard label="승인 완료" value={orderSummary.done} tone="text-[#0B7A3E]" />
                  <OpsMetricCard label="대기·재시도" value={orderSummary.ready} tone="text-[#17324d]" />
                  <OpsMetricCard label="실패·거절" value={summary.failed + orderSummary.failed} tone="text-[#B3261E]" />
                  <OpsMetricCard label="결제 시도액" value={formatKrw(orderSummary.totalAmount)} tone="text-ios-text" />
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-[24px] border border-[#e3eaf2] bg-white/88 p-4">
              <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
                <div>
                  <div className="text-[12px] font-semibold text-[#17324d]">상태 필터</div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {FILTER_ROWS.map((row) => (
                      <button
                        key={row.key}
                        type="button"
                        onClick={() => setFilter(row.key)}
                        className={`rounded-full border px-3 py-1.5 text-[11.5px] font-semibold transition ${
                          filter === row.key
                            ? "border-[color:var(--rnest-accent-border)] bg-[color:var(--rnest-accent-soft)] text-[color:var(--rnest-accent)]"
                            : "border-ios-sep bg-white text-ios-sub hover:bg-ios-bg"
                        }`}
                      >
                        {row.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[12px] font-semibold text-[#17324d]">운영 도구</div>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <input
                      value={userIdFilter}
                      onChange={(e) => setUserIdFilter(e.target.value)}
                      placeholder="userId 필터 (선택)"
                      className="h-11 w-full rounded-2xl border border-ios-sep bg-white px-4 text-[13px] text-ios-text outline-none placeholder:text-ios-muted focus:border-[color:var(--rnest-accent-border)]"
                    />
                    <button
                      type="button"
                      onClick={() => void loadRequests()}
                      className="rnest-btn-secondary inline-flex h-11 items-center justify-center px-4 text-[13px]"
                    >
                      새로고침
                    </button>
                    <button
                      type="button"
                      onClick={() => void runRetryBatch()}
                      disabled={batchLoading || isActionBusy}
                      className="rnest-btn-primary inline-flex h-11 items-center justify-center px-4 text-[13px] disabled:opacity-50"
                    >
                      {batchLoading ? "재시도 실행 중..." : "재시도 큐 실행"}
                    </button>
                  </div>
                </div>
              </div>

              {loading ? <div className="mt-3 text-[12px] text-ios-muted">데이터를 불러오는 중...</div> : null}
              {currentActionLabel ? <div className="mt-3 text-[12px] text-ios-muted">{currentActionLabel}</div> : null}
              {error ? <div className="mt-3 text-[12px] text-red-600">{error}</div> : null}
              {notice ? <div className="mt-3 text-[12px] text-[#0B7A3E]">{notice}</div> : null}
            </div>
          </section>

          <div className="mt-4 grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
            <section className="rnest-surface p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-[15px] font-bold text-ios-text">환불 요청 큐</div>
                  <div className="mt-1 text-[12px] text-ios-sub">먼저 처리할 요청을 선택하면 오른쪽 패널에서 바로 처리할 수 있습니다.</div>
                </div>
                <div className="rounded-full border border-[#d7dfeb] bg-[#f4f7fb] px-3 py-1 text-[11px] font-semibold text-[#11294b]">
                  {requests.length}건
                </div>
              </div>

              <div className="mt-4 max-h-[780px] space-y-2.5 overflow-auto pr-1">
                {requests.length === 0 ? (
                  <div className="rounded-2xl border border-ios-sep bg-white px-4 py-4 text-[13px] text-ios-sub">
                    조건에 맞는 환불 요청이 없습니다.
                  </div>
                ) : null}

                {requests.map((request) => {
                  const isSelected = selectedId === request.id;
                  return (
                    <button
                      key={request.id}
                      type="button"
                      onClick={() => selectRequest(request.id)}
                      className={`w-full rounded-[24px] border px-4 py-4 text-left transition ${
                        isSelected
                          ? "border-[color:var(--rnest-accent-border)] bg-[color:var(--rnest-accent-soft)] shadow-[0_14px_36px_rgba(17,41,75,0.08)]"
                          : "border-ios-sep bg-white/90 hover:border-[#cfd9e7]"
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[14px] font-bold text-ios-text">
                            #{request.id} · {request.orderId}
                          </div>
                          <div className="mt-1 text-[11.5px] text-ios-sub">
                            {request.userId} · {formatDateTimeLabel(request.requestedAt)}
                          </div>
                        </div>
                        <div className={`text-[12px] font-semibold ${refundStatusTone(request.status)}`}>
                          {refundStatusLabel(request.status)}
                        </div>
                      </div>

                      <div className="mt-3 rounded-[18px] border border-white/70 bg-white/70 px-3 py-3">
                        <div className="text-[12.5px] leading-5 text-ios-text">{request.reason}</div>
                        <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-semibold text-[#556a83]">
                          <span>{formatKrw(request.cancelAmount ?? 0)}</span>
                          <span>{request.currency}</span>
                          <span>재시도 {request.retryCount}회</span>
                        </div>
                      </div>

                      {request.errorCode || request.errorMessage ? (
                        <div className="mt-2 text-[11px] text-[#B3261E]">
                          {request.errorCode ?? "error"} {request.errorMessage ? `· ${request.errorMessage}` : ""}
                        </div>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="rnest-surface p-5 xl:sticky xl:top-4 xl:self-start">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-[15px] font-bold text-ios-text">선택 요청 상세</div>
                  <div className="mt-1 text-[12px] text-ios-sub">선택한 요청의 판단 정보, 결제 맥락, 실행 버튼을 한 패널에 모았습니다.</div>
                </div>
                {selectedRequest ? (
                  <button
                    type="button"
                    onClick={() => void loadDetail(selectedRequest.id, false)}
                    className="rnest-btn-secondary inline-flex h-9 items-center justify-center px-3 text-[12px]"
                  >
                    상세 새로고침
                  </button>
                ) : null}
              </div>

              {!selectedRequest ? (
                <div className="mt-4 rounded-[24px] border border-ios-sep bg-white px-4 py-5 text-[13px] text-ios-sub">
                  왼쪽 요청 큐에서 하나를 선택하면 상세와 처리 버튼이 이곳에 표시됩니다.
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  <div className="rounded-[24px] border border-ios-sep bg-white/90 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="text-[18px] font-bold tracking-[-0.02em] text-ios-text">
                          #{selectedRequest.id} · {selectedRequest.orderId}
                        </div>
                        <div className="mt-1 text-[12px] text-ios-sub">
                          {selectedRequest.userId} · {formatDateTimeLabel(selectedRequest.requestedAt)}
                        </div>
                      </div>
                      <div className={`text-[12px] font-semibold ${refundStatusTone(selectedRequest.status)}`}>
                        {refundStatusLabel(selectedRequest.status)}
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-[18px] border border-[#e8edf4] bg-[#f8fafc] px-3 py-3">
                        <div className="text-[11px] font-semibold text-[#60768d]">환불 요청 금액</div>
                        <div className="mt-1 text-[15px] font-bold text-ios-text">
                          {formatKrw(selectedRequest.cancelAmount ?? 0)} ({selectedRequest.currency})
                        </div>
                      </div>
                      <div className="rounded-[18px] border border-[#e8edf4] bg-[#f8fafc] px-3 py-3">
                        <div className="text-[11px] font-semibold text-[#60768d]">상태 추적</div>
                        <div className="mt-1 text-[12px] text-ios-sub">
                          재시도 {selectedRequest.retryCount}회 · 다음 시도 {formatDateTimeLabel(selectedRequest.nextRetryAt)}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 rounded-[20px] border border-[#e8edf4] bg-[#f8fafc] px-4 py-3">
                      <div className="text-[11px] font-semibold text-[#60768d]">환불 사유</div>
                      <div className="mt-1 text-[13px] leading-6 text-ios-text">{selectedRequest.reason}</div>
                      {selectedRequest.errorCode || selectedRequest.errorMessage ? (
                        <div className="mt-2 text-[11.5px] text-[#B3261E]">
                          {selectedRequest.errorCode ?? "error"} {selectedRequest.errorMessage ? `· ${selectedRequest.errorMessage}` : ""}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-ios-sep bg-white/90 p-4">
                    <div className="text-[13px] font-semibold text-ios-text">처리 판단 정보</div>
                    <div className="mt-3 grid gap-2 text-[12px] text-ios-sub sm:grid-cols-2">
                      <div>reviewedBy: {selectedRequest.reviewedBy ?? "-"}</div>
                      <div>reviewedAt: {formatDateTimeLabel(selectedRequest.reviewedAt)}</div>
                      <div>executedBy: {selectedRequest.executedBy ?? "-"}</div>
                      <div>executedAt: {formatDateTimeLabel(selectedRequest.executedAt)}</div>
                      <div>transactionKey: {selectedRequest.tossCancelTransactionKey ?? "-"}</div>
                      <div>notifyUserSentAt: {formatDateTimeLabel(selectedRequest.notifyUserSentAt)}</div>
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-ios-sep bg-white/90 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-[13px] font-semibold text-ios-text">결제 맥락</div>
                      {relatedOrder ? (
                        <div
                          className={`text-[12px] font-semibold ${
                            relatedOrder.status === "DONE"
                              ? "text-[#0B7A3E]"
                              : relatedOrder.status === "FAILED"
                                ? "text-[#B3261E]"
                                : relatedOrder.status === "CANCELED"
                                  ? "text-[#C2410C]"
                                  : "text-[color:var(--rnest-accent)]"
                          }`}
                        >
                          {relatedOrder.status}
                        </div>
                      ) : null}
                    </div>

                    {relatedOrder ? (
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-[18px] border border-[#e8edf4] bg-[#f8fafc] px-3 py-3">
                          <div className="text-[11px] font-semibold text-[#60768d]">주문 정보</div>
                          <div className="mt-1 text-[12.5px] text-ios-text">
                            {relatedOrder.orderId} · {relatedOrder.orderKind === "credit_pack" ? "추가 크레딧" : "구독"}
                          </div>
                          <div className="mt-1 text-[11.5px] text-ios-sub">{relatedOrder.orderName}</div>
                        </div>
                        <div className="rounded-[18px] border border-[#e8edf4] bg-[#f8fafc] px-3 py-3">
                          <div className="text-[11px] font-semibold text-[#60768d]">결제 금액</div>
                          <div className="mt-1 text-[12.5px] font-semibold text-ios-text">
                            {formatKrw(relatedOrder.amount)} ({relatedOrder.currency})
                          </div>
                          <div className="mt-1 text-[11.5px] text-ios-sub">
                            승인 {formatDateTimeLabel(relatedOrder.approvedAt)}
                          </div>
                        </div>
                        {relatedOrder.failCode || relatedOrder.failMessage ? (
                          <div className="sm:col-span-2 text-[11.5px] text-[#B3261E]">
                            {relatedOrder.failCode ?? "error"} {relatedOrder.failMessage ? `· ${relatedOrder.failMessage}` : ""}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="mt-3 rounded-[18px] border border-[#e8edf4] bg-[#f8fafc] px-3 py-3 text-[12px] text-ios-sub">
                        연결된 결제 로그를 찾지 못했습니다.
                      </div>
                    )}
                  </div>

                  <div className="rounded-[24px] border border-ios-sep bg-white/90 p-4">
                    <div className="text-[13px] font-semibold text-ios-text">빠른 처리</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {canReview ? (
                        <button
                          type="button"
                          disabled={isActionBusy}
                          onClick={startReview}
                          className="rnest-btn-secondary inline-flex h-10 items-center justify-center px-4 text-[12px] disabled:opacity-40"
                        >
                          검토 시작
                        </button>
                      ) : null}
                      {canApprove ? (
                        <button
                          type="button"
                          disabled={isActionBusy}
                          onClick={approveSelected}
                          className="inline-flex h-10 items-center justify-center rounded-full border border-[color:var(--rnest-accent-border)] bg-[color:var(--rnest-accent-soft)] px-4 text-[12px] font-semibold text-[color:var(--rnest-accent)] transition hover:brightness-[0.98] disabled:opacity-40"
                        >
                          승인
                        </button>
                      ) : null}
                      {canReject ? (
                        <button
                          type="button"
                          disabled={isActionBusy}
                          onClick={rejectSelected}
                          className="inline-flex h-10 items-center justify-center rounded-full border border-[#B3261E33] bg-[#B3261E12] px-4 text-[12px] font-semibold text-[#B3261E] transition hover:bg-[#B3261E1A] disabled:opacity-40"
                        >
                          거절
                        </button>
                      ) : null}
                      {canExecute ? (
                        <button
                          type="button"
                          disabled={isActionBusy}
                          onClick={executeSelected}
                          className="rnest-btn-primary inline-flex h-10 items-center justify-center px-4 text-[12px] disabled:opacity-40"
                        >
                          환불 실행
                        </button>
                      ) : null}
                      {canApprove && canExecute ? (
                        <button
                          type="button"
                          disabled={isActionBusy}
                          onClick={approveAndExecuteSelected}
                          className="inline-flex h-10 items-center justify-center rounded-full border border-ios-sep bg-white px-4 text-[12px] font-semibold text-ios-text transition hover:border-[color:var(--rnest-accent-border)] disabled:opacity-40"
                        >
                          승인+즉시실행
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="rounded-[24px] border border-ios-sep bg-white/90 p-4">
                    <div className="text-[13px] font-semibold text-ios-text">이벤트 로그</div>
                    {detailLoadingId === selectedRequest.id && !selectedDetail ? (
                      <div className="mt-3 text-[12px] text-ios-muted">상세를 불러오는 중...</div>
                    ) : (
                      <div className="mt-3 max-h-[320px] space-y-2 overflow-auto pr-1">
                        {(selectedDetail?.events ?? []).length === 0 ? (
                          <div className="rounded-[18px] border border-[#e8edf4] bg-[#f8fafc] px-3 py-3 text-[12px] text-ios-sub">
                            이벤트가 아직 없습니다.
                          </div>
                        ) : (
                          (selectedDetail?.events ?? []).map((event) => (
                            <div key={event.id} className="rounded-[18px] border border-[#e8edf4] bg-[#f8fafc] px-3 py-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="text-[12px] font-semibold text-ios-text">{eventTitle(event.eventType)}</div>
                                <div className="text-[11px] text-ios-muted">{formatDateTimeLabel(event.createdAt)}</div>
                              </div>
                              <div className="mt-1 text-[11.5px] text-ios-sub">
                                {event.fromStatus ?? "-"} → {event.toStatus ?? "-"} · {event.actorRole}
                              </div>
                              {event.message ? <div className="mt-1 text-[11.5px] text-ios-sub">{event.message}</div> : null}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>
          </div>

          <section className="rnest-surface mt-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-[15px] font-bold text-ios-text">최근 결제 로그</div>
                <div className="mt-1 text-[12px] text-ios-sub">결제 흐름은 짧은 행 단위로 요약하고, 상단 상세 패널은 환불 요청 처리에 집중합니다.</div>
              </div>
              <div className="rounded-full border border-[#d7dfeb] bg-[#f4f7fb] px-3 py-1 text-[11px] font-semibold text-[#11294b]">
                최근 {orderSummary.total}건
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <OpsMetricCard label="승인 완료" value={orderSummary.done} tone="text-[#0B7A3E]" />
              <OpsMetricCard label="대기" value={orderSummary.ready} tone="text-[#17324d]" />
              <OpsMetricCard label="취소/환불" value={orderSummary.canceled} tone="text-[#C2410C]" />
              <OpsMetricCard label="실패" value={orderSummary.failed} tone="text-[#B3261E]" />
            </div>

            <div className="mt-3 text-[12px] text-ios-sub">
              구독 {orderSummary.kindCounter.subscription}건 · 크레딧팩 {orderSummary.kindCounter.credit_pack}건 · 결제 시도액{" "}
              {formatKrw(orderSummary.totalAmount)}
            </div>

            <div className="mt-4 max-h-[420px] space-y-2 overflow-auto pr-1">
              {visibleOrders.length === 0 ? (
                <div className="rounded-2xl border border-ios-sep bg-white px-4 py-4 text-[13px] text-ios-sub">
                  조건에 맞는 결제 로그가 없습니다.
                </div>
              ) : (
                visibleOrders.map((order) => (
                  <div key={order.orderId} className="rounded-[20px] border border-ios-sep bg-white/90 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-semibold text-ios-text">
                          {order.orderId} · {order.orderKind === "credit_pack" ? "추가 크레딧" : "구독"}
                        </div>
                        <div className="mt-1 text-[11.5px] text-ios-sub">
                          {order.userId ?? "-"} · {order.orderName}
                        </div>
                      </div>
                      <div
                        className={`text-[12px] font-semibold ${
                          order.status === "DONE"
                            ? "text-[#0B7A3E]"
                            : order.status === "FAILED"
                              ? "text-[#B3261E]"
                              : order.status === "CANCELED"
                                ? "text-[#C2410C]"
                                : "text-[color:var(--rnest-accent)]"
                        }`}
                      >
                        {order.status}
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px] text-ios-sub">
                      <span>{formatKrw(order.amount)} ({order.currency})</span>
                      <span>생성 {formatDateTimeLabel(order.createdAt)}</span>
                      <span>승인 {formatDateTimeLabel(order.approvedAt)}</span>
                    </div>
                    {order.failCode || order.failMessage ? (
                      <div className="mt-1 text-[11px] text-[#B3261E]">
                        {order.failCode ?? "error"} {order.failMessage ? `· ${order.failMessage}` : ""}
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}

export default SettingsAdminRefundsPage;
