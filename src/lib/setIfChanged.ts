import type { Dispatch, MutableRefObject, SetStateAction } from "react";

/**
 * Fingerprint for order arrays — compares orderId + status + updatedAt.
 * If the fingerprint is unchanged, the data is the same and we skip setState.
 */
export function ordersFingerprint(
  orders: Array<{ orderId: string; status: string; updatedAt?: string | null }>
): string {
  return orders.map((o) => `${o.orderId}:${o.status}:${o.updatedAt ?? ""}`).join("|");
}

/**
 * Only calls `setter` if the fingerprint of `next` differs from `prevRef`.
 * Returns true if setState was called, false if skipped.
 */
export function setIfOrdersChanged<
  T extends Array<{ orderId: string; status: string; updatedAt?: string | null }>,
>(setter: Dispatch<SetStateAction<T>>, next: T, prevRef: MutableRefObject<string>): boolean {
  const fp = ordersFingerprint(next);
  if (fp === prevRef.current) return false;
  prevRef.current = fp;
  setter(next);
  return true;
}

/**
 * Fingerprint for a single order detail object.
 */
export function orderDetailFingerprint(order: {
  orderId: string;
  status: string;
  updatedAt?: string | null;
  trackingNumber?: string | null;
  deliveredAt?: string | null;
}): string {
  return `${order.orderId}:${order.status}:${order.updatedAt ?? ""}:${order.trackingNumber ?? ""}:${order.deliveredAt ?? ""}`;
}
