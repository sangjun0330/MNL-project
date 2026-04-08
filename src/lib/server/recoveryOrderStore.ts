import { addDays, fromISODate, toISODate, todayISO as currentISODate, type ISODate } from "@/lib/date";
import { loadUserState, saveUserState } from "@/lib/server/userStateStore";

export type RecoveryOrderCompletionMap = Record<string, string[]>;

const STATE_KEY = "recoveryOrderCompletions";
const MAX_STORED_DAYS = 35;
const MAX_IDS_PER_DAY = 12;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isISODateString(value: string): value is ISODate {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeCompletedIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const next: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const value = String(item ?? "").trim().slice(0, 80);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    next.push(value);
    if (next.length >= MAX_IDS_PER_DAY) break;
  }
  return next;
}

export function normalizeRecoveryOrderCompletions(
  raw: unknown,
  anchorDateISO: ISODate = currentISODate()
): RecoveryOrderCompletionMap {
  if (!isRecord(raw)) return {};
  const cutoffISO = toISODate(addDays(fromISODate(anchorDateISO), -(MAX_STORED_DAYS - 1)));
  const entries = Object.entries(raw)
    .filter(([dateISO]) => isISODateString(dateISO) && dateISO >= cutoffISO && dateISO <= anchorDateISO)
    .sort(([left], [right]) => left.localeCompare(right));

  const next: RecoveryOrderCompletionMap = {};
  for (const [dateISO, value] of entries) {
    const ids = normalizeCompletedIds(value);
    if (!ids.length) continue;
    next[dateISO] = ids;
  }
  return next;
}

function payloadRecord(row: Awaited<ReturnType<typeof loadUserState>>): Record<string, unknown> {
  return row?.payload && isRecord(row.payload) ? (row.payload as Record<string, unknown>) : {};
}

export async function loadRecoveryOrderCompletions(
  userId: string,
  anchorDateISO: ISODate = currentISODate()
): Promise<RecoveryOrderCompletionMap> {
  const row = await loadUserState(userId);
  const payload = payloadRecord(row);
  return normalizeRecoveryOrderCompletions(payload[STATE_KEY], anchorDateISO);
}

export async function readRecoveryOrderCompletedIds(
  userId: string,
  dateISO: ISODate
): Promise<string[]> {
  const completions = await loadRecoveryOrderCompletions(userId, dateISO);
  return completions[dateISO] ?? [];
}

export async function writeRecoveryOrderCompletedIds(
  userId: string,
  dateISO: ISODate,
  rawIds: unknown
): Promise<string[]> {
  const row = await loadUserState(userId);
  const payload = payloadRecord(row);
  const completions = normalizeRecoveryOrderCompletions(payload[STATE_KEY], dateISO);
  const ids = normalizeCompletedIds(rawIds);
  const nextCompletions: RecoveryOrderCompletionMap = {
    ...completions,
  };

  if (ids.length) {
    nextCompletions[dateISO] = ids;
  } else {
    delete nextCompletions[dateISO];
  }

  await saveUserState({
    userId,
    payload: {
      [STATE_KEY]: normalizeRecoveryOrderCompletions(nextCompletions, dateISO),
    },
  });

  return ids;
}

export function countRecoveryOrderCompletionsFromPayload(
  payload: Record<string, unknown>,
  anchorDateISO: ISODate,
  days = 7
): number | null {
  const normalized = normalizeRecoveryOrderCompletions(payload[STATE_KEY], anchorDateISO);
  const safeDays = Math.max(1, Math.min(31, Math.round(days || 7)));
  let count = 0;
  let hasAnyDay = false;

  for (let offset = 0; offset < safeDays; offset += 1) {
    const dateISO = toISODate(addDays(fromISODate(anchorDateISO), -offset));
    const ids = normalized[dateISO];
    if (!ids) continue;
    hasAnyDay = true;
    count += ids.length;
  }

  return hasAnyDay ? count : 0;
}
