import type { ShopClaimRecord } from "@/lib/server/shopClaimStore";
import type { ShopAdminOrderSummary } from "@/lib/server/shopOrderStore";

function cleanText(value: unknown, max = 120) {
  return String(value ?? "").trim().slice(0, max);
}

function maskUserId(userId: string) {
  const text = cleanText(userId, 120);
  if (!text) return "unknown";
  if (text.length <= 8) return `${text.slice(0, 2)}***`;
  return `${text.slice(0, 4)}…${text.slice(-4)}`;
}

export function toUserShopClaimSummary(claim: ShopClaimRecord) {
  return {
    claimId: claim.claimId,
    orderId: claim.orderId,
    claimType: claim.claimType,
    status: claim.status,
    reason: claim.reason,
    detail: claim.detail,
    adminNote: claim.adminNote,
    requestedAt: claim.requestedAt,
    reviewedAt: claim.reviewedAt,
    returnTrackingNumber: claim.returnTrackingNumber,
    returnCourier: claim.returnCourier,
    returnShippedAt: claim.returnShippedAt,
    returnReceivedAt: claim.returnReceivedAt,
    exchangeTrackingNumber: claim.exchangeTrackingNumber,
    exchangeCourier: claim.exchangeCourier,
    exchangeShippedAt: claim.exchangeShippedAt,
    refundCompletedAt: claim.refundCompletedAt,
  };
}

export function toAdminShopClaimSummary(
  claim: ShopClaimRecord,
  order: ShopAdminOrderSummary | null
) {
  return {
    claimId: claim.claimId,
    orderId: claim.orderId,
    userLabel: order?.userLabel ?? maskUserId(claim.userId),
    claimType: claim.claimType,
    status: claim.status,
    reason: claim.reason,
    detail: claim.detail,
    adminNote: claim.adminNote,
    requestedAt: claim.requestedAt,
    reviewedAt: claim.reviewedAt,
    returnTrackingNumber: claim.returnTrackingNumber,
    returnCourier: claim.returnCourier,
    returnShippedAt: claim.returnShippedAt,
    returnReceivedAt: claim.returnReceivedAt,
    exchangeTrackingNumber: claim.exchangeTrackingNumber,
    exchangeCourier: claim.exchangeCourier,
    exchangeShippedAt: claim.exchangeShippedAt,
    refundCompletedAt: claim.refundCompletedAt,
    order,
  };
}
