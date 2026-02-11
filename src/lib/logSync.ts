import type { ISODate } from "@/lib/date";
import { getOrCreateDeviceId } from "@/lib/healthLog";

/**
 * ✅ 로컬-퍼스트 Outbox
 * - 오프라인/불안정한 네트워크에서도 '파일 저장'이 깨지지 않게
 *   localStorage에 먼저 저장하고, 가능할 때 서버로 업로드합니다.
 */

type OutboxItem = {
  deviceId: string;
  date: ISODate;
  payload: any;
  updatedAt: number;
};

const OUTBOX_KEY = "wnl_log_outbox_v1";
const TOKEN_KEY = "wnl_log_token_v1";

function readOutbox(): OutboxItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(OUTBOX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeOutbox(items: OutboxItem[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(items));
  } catch {
    // ignore
  }
}

export function enqueueDailyLog(date: ISODate, payload: any, deviceIdOverride?: string) {
  if (typeof window === "undefined") return;
  const deviceId = deviceIdOverride ?? getOrCreateDeviceId();
  const updatedAt = Date.now();
  const items = readOutbox();
  const key = `${deviceId}:${date}`;
  const next = items.filter((it) => `${it.deviceId}:${it.date}` !== key);
  next.push({ deviceId, date, payload, updatedAt });
  // 최신부터 먼저 업로드되도록 updatedAt 기준 정렬
  next.sort((a, b) => b.updatedAt - a.updatedAt);
  writeOutbox(next);
}

async function ensureLogToken(deviceId: string): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const existing = localStorage.getItem(TOKEN_KEY);
  if (existing) return existing;
  try {
    const res = await fetch(`/api/logs/register?deviceId=${encodeURIComponent(deviceId)}`, {
      method: "GET",
      headers: { "content-type": "application/json" },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { token?: string };
    if (!json?.token) return null;
    localStorage.setItem(TOKEN_KEY, json.token);
    return json.token;
  } catch {
    return null;
  }
}

export async function flushOutbox(opts?: { max?: number }) {
  if (typeof window === "undefined") return;
  if (navigator && "onLine" in navigator && !navigator.onLine) return;

  const items = readOutbox();
  if (items.length === 0) return;
  const max = opts?.max ?? 12;
  const batch = items.slice(0, max);

  const deviceId = batch[0]?.deviceId ?? getOrCreateDeviceId();
  const token = await ensureLogToken(deviceId);

  const succeeded: string[] = [];
  for (const it of batch) {
    try {
      const res = await fetch("/api/logs/daily", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { "x-log-token": token } : {}),
        },
        body: JSON.stringify({
          deviceId: it.deviceId,
          date: it.date,
          updatedAt: it.updatedAt,
          payload: it.payload,
        }),
      });
      if (res.ok) {
        succeeded.push(`${it.deviceId}:${it.date}`);
      }
    } catch {
      // 네트워크 실패 → 다음 기회에 재시도
    }
  }

  if (succeeded.length > 0) {
    const remaining = readOutbox().filter((it) => !succeeded.includes(`${it.deviceId}:${it.date}`));
    writeOutbox(remaining);
  }
}
