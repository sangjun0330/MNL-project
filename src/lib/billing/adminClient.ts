"use client";

import { authHeaders } from "@/lib/billing/client";

export type AdminRefundStatus =
  | "REQUESTED"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "EXECUTING"
  | "REFUNDED"
  | "FAILED_RETRYABLE"
  | "FAILED_FINAL"
  | "WITHDRAWN";

export type AdminBillingOrderStatus = "READY" | "DONE" | "FAILED" | "CANCELED";
export type AdminBillingOrderKind = "subscription" | "credit_pack";

export type AdminRefundRequest = {
  id: number;
  userId: string;
  orderId: string;
  reason: string;
  status: AdminRefundStatus;
  adminNote: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  executedBy: string | null;
  executedAt: string | null;
  cancelAmount: number | null;
  currency: string;
  tossPaymentKeySnapshot: string | null;
  tossCancelTransactionKey: string | null;
  gatewayResponse: any;
  errorCode: string | null;
  errorMessage: string | null;
  retryCount: number;
  nextRetryAt: string | null;
  requestedAt: string | null;
  updatedAt: string | null;
  notifiedAt: string | null;
  notifyUserSentAt: string | null;
};

export type AdminBillingOrder = {
  orderId: string;
  userId?: string;
  planTier: "free" | "pro";
  orderKind: AdminBillingOrderKind;
  creditPackUnits: number;
  amount: number;
  currency: string;
  status: AdminBillingOrderStatus;
  orderName: string;
  paymentKey: string | null;
  failCode: string | null;
  failMessage: string | null;
  approvedAt: string | null;
  createdAt: string | null;
};

export type AdminRefundEvent = {
  id: number;
  requestId: number;
  userId: string;
  orderId: string;
  actorUserId: string | null;
  actorRole: "user" | "admin" | "system";
  eventType: string;
  fromStatus: string | null;
  toStatus: string | null;
  message: string | null;
  metadata: any;
  createdAt: string | null;
};

export type AdminRefundDetail = {
  request: AdminRefundRequest;
  events: AdminRefundEvent[];
};

export type RefundRetryBatchResult = {
  dryRun: boolean;
  total?: number;
  count?: number;
  successCount?: number;
  failCount?: number;
  items?: Array<Record<string, unknown>>;
  requests?: Array<Record<string, unknown>>;
};

function errMessage(json: any, res: Response, fallback = "request_failed") {
  return String(json?.error ?? `${fallback}:${res.status}`);
}

async function adminFetch(path: string, init?: RequestInit) {
  const headers = await authHeaders();
  const res = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...headers,
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.ok) {
    throw new Error(errMessage(json, res));
  }
  return json.data;
}

export async function fetchAdminRefundRequests(input?: {
  status?: string | null;
  userId?: string | null;
  limit?: number;
}): Promise<AdminRefundRequest[]> {
  const params = new URLSearchParams();
  if (input?.status) params.set("status", input.status);
  if (input?.userId) params.set("userId", input.userId);
  if (input?.limit != null) params.set("limit", String(input.limit));
  const qs = params.toString();
  const data = await adminFetch(`/api/admin/billing/refunds${qs ? `?${qs}` : ""}`, { method: "GET" });
  return (data?.requests ?? []) as AdminRefundRequest[];
}

export async function fetchAdminBillingOrders(input?: {
  status?: AdminBillingOrderStatus | null;
  orderKind?: AdminBillingOrderKind | null;
  userId?: string | null;
  limit?: number;
}): Promise<AdminBillingOrder[]> {
  const params = new URLSearchParams();
  if (input?.status) params.set("status", input.status);
  if (input?.orderKind) params.set("orderKind", input.orderKind);
  if (input?.userId) params.set("userId", input.userId);
  if (input?.limit != null) params.set("limit", String(input.limit));
  const qs = params.toString();
  const data = await adminFetch(`/api/admin/billing/orders${qs ? `?${qs}` : ""}`, { method: "GET" });
  return (data?.orders ?? []) as AdminBillingOrder[];
}

export async function fetchAdminRefundDetail(refundId: number): Promise<AdminRefundDetail> {
  const data = await adminFetch(`/api/admin/billing/refunds/${refundId}`, { method: "GET" });
  return data as AdminRefundDetail;
}

export async function markAdminRefundReview(refundId: number, note?: string | null): Promise<AdminRefundRequest> {
  const data = await adminFetch(`/api/admin/billing/refunds/${refundId}/review`, {
    method: "POST",
    body: JSON.stringify({ note: note ?? null }),
  });
  return data.request as AdminRefundRequest;
}

export async function approveAdminRefund(refundId: number, note?: string | null): Promise<AdminRefundRequest> {
  const data = await adminFetch(`/api/admin/billing/refunds/${refundId}/approve`, {
    method: "POST",
    body: JSON.stringify({ note: note ?? null }),
  });
  return data.request as AdminRefundRequest;
}

export async function rejectAdminRefund(input: {
  refundId: number;
  reason: string;
  note?: string | null;
}): Promise<AdminRefundRequest> {
  const data = await adminFetch(`/api/admin/billing/refunds/${input.refundId}/reject`, {
    method: "POST",
    body: JSON.stringify({
      reason: input.reason,
      note: input.note ?? null,
    }),
  });
  return data.request as AdminRefundRequest;
}

export async function executeAdminRefund(input: {
  refundId: number;
  note?: string | null;
  cancelAmount?: number | null;
}): Promise<{ request: AdminRefundRequest; subscription: any; cancelStatus: string }> {
  const data = await adminFetch(`/api/admin/billing/refunds/${input.refundId}/execute`, {
    method: "POST",
    body: JSON.stringify({
      note: input.note ?? null,
      cancelAmount: input.cancelAmount ?? null,
    }),
  });
  return data as { request: AdminRefundRequest; subscription: any; cancelStatus: string };
}

export async function fetchMyRefundRequests(limit = 20): Promise<AdminRefundRequest[]> {
  const data = await adminFetch(`/api/billing/refunds?limit=${Math.max(1, Math.min(50, Math.round(limit)))}`, {
    method: "GET",
  });
  return (data?.requests ?? []) as AdminRefundRequest[];
}

export async function withdrawMyRefundRequest(input: {
  refundId: number;
  note?: string | null;
}): Promise<AdminRefundRequest> {
  const data = await adminFetch(`/api/billing/refunds/${input.refundId}/withdraw`, {
    method: "POST",
    body: JSON.stringify({
      note: input.note ?? null,
    }),
  });
  return data.request as AdminRefundRequest;
}

export async function runAdminRefundRetryBatch(input?: {
  limit?: number;
  dryRun?: boolean;
}): Promise<RefundRetryBatchResult> {
  const data = await adminFetch("/api/admin/billing/refunds/retry", {
    method: "POST",
    body: JSON.stringify({
      limit: input?.limit ?? 10,
      dryRun: Boolean(input?.dryRun),
    }),
  });
  return data as RefundRetryBatchResult;
}

export function refundStatusLabel(status: AdminRefundStatus) {
  if (status === "REQUESTED") return "요청 접수";
  if (status === "UNDER_REVIEW") return "검토 중";
  if (status === "APPROVED") return "승인";
  if (status === "REJECTED") return "거절";
  if (status === "EXECUTING") return "실행 중";
  if (status === "REFUNDED") return "환불 완료";
  if (status === "FAILED_RETRYABLE") return "실패(재시도 가능)";
  if (status === "FAILED_FINAL") return "실패(최종)";
  return "철회";
}

export function refundStatusTone(status: AdminRefundStatus) {
  if (status === "REFUNDED") return "text-[#0B7A3E]";
  if (status === "REJECTED" || status === "FAILED_FINAL") return "text-[#B3261E]";
  if (status === "APPROVED" || status === "UNDER_REVIEW" || status === "EXECUTING") return "text-[color:var(--rnest-accent)]";
  if (status === "FAILED_RETRYABLE") return "text-[#C2410C]";
  return "text-ios-sub";
}

export function formatDateTimeLabel(value: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(
    d.getHours()
  ).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
