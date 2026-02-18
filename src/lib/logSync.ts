import type { ISODate } from "@/lib/date";

/**
 * Legacy no-op module.
 * Daily log outbox sync has been removed and user_state is the single source of truth.
 */
export function enqueueDailyLog(date: ISODate, payload: unknown, deviceIdOverride?: string) {
  void date;
  void payload;
  void deviceIdOverride;
}

export async function flushOutbox(opts?: { max?: number }) {
  void opts;
}
