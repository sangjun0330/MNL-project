import type { ISODate } from "@/lib/date";
import { isISODate } from "@/lib/date";
import {
  AI_RECOVERY_RETENTION_DAYS,
  type AIRecoveryDaily,
  type AIRecoveryDayPayload,
  type AIRecoverySlot,
  type AIRecoverySlotPayload,
} from "@/lib/aiRecovery";
import { loadUserState, saveUserState } from "@/lib/server/userStateStore";

type RecoveryOrderCompletions = Record<ISODate, string[] | undefined>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeDateMap<T>(value: unknown): Record<ISODate, T | undefined> {
  if (!isRecord(value)) return {};
  const out: Record<ISODate, T | undefined> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (!isISODate(key)) continue;
    out[key] = entry as T;
  }
  return out;
}

function pruneDateMap<T>(domain: Record<ISODate, T | undefined>, keepDates?: Set<ISODate>) {
  const dates = Object.keys(domain).filter(isISODate).sort();
  const latestKeep = new Set(dates.slice(-AI_RECOVERY_RETENTION_DAYS));
  const allowed = keepDates ? new Set([...latestKeep].filter((date) => keepDates.has(date))) : latestKeep;
  const next: Record<ISODate, T | undefined> = {};
  for (const key of dates) {
    if (!allowed.has(key)) continue;
    next[key] = domain[key];
  }
  return next;
}

function pruneAIRecoveryDaily(domain: AIRecoveryDaily): AIRecoveryDaily {
  return pruneDateMap(domain);
}

export async function loadAIRecoveryDomains(userId: string) {
  const row = await loadUserState(userId);
  const payload = isRecord(row?.payload) ? row.payload : {};
  return {
    payload,
    stateRevision: row?.updatedAt ?? null,
    aiRecoveryDaily: normalizeDateMap<AIRecoveryDayPayload>(payload.aiRecoveryDaily),
    recoveryOrderCompletions: normalizeDateMap<string[]>(payload.recoveryOrderCompletions),
  };
}

export async function readAIRecoverySlot(args: {
  userId: string;
  dateISO: ISODate;
  slot: AIRecoverySlot;
}) {
  const { aiRecoveryDaily, recoveryOrderCompletions } = await loadAIRecoveryDomains(args.userId);
  const day = aiRecoveryDaily[args.dateISO];
  const session = day?.[args.slot] ?? null;
  const completions = Array.isArray(recoveryOrderCompletions[args.dateISO]) ? recoveryOrderCompletions[args.dateISO] ?? [] : [];
  return { session, completions, aiRecoveryDaily, recoveryOrderCompletions };
}

export async function writeAIRecoverySlot(args: {
  userId: string;
  dateISO: ISODate;
  slot: AIRecoverySlot;
  session: AIRecoverySlotPayload;
}) {
  const { aiRecoveryDaily, recoveryOrderCompletions } = await loadAIRecoveryDomains(args.userId);
  const nextDaily = cloneJson(aiRecoveryDaily);
  const nextDay: AIRecoveryDayPayload = {
    version: 1,
    ...(nextDaily[args.dateISO] ?? {}),
  };
  nextDay[args.slot] = args.session;
  nextDaily[args.dateISO] = nextDay;
  const pruned = pruneAIRecoveryDaily(nextDaily);
  const keepDates = new Set(Object.keys(pruned).filter(isISODate));
  const prunedCompletions = pruneDateMap(recoveryOrderCompletions, keepDates);
  const saved = await saveUserState({
    userId: args.userId,
    payload: {
      aiRecoveryDaily: pruned,
      recoveryOrderCompletions: prunedCompletions,
    },
  });
  return {
    aiRecoveryDaily: pruned,
    stateRevision: saved.stateRevision,
  };
}

export async function writeAIRecoveryCompletions(args: {
  userId: string;
  dateISO: ISODate;
  orderId: string;
  completed: boolean;
}) {
  const { aiRecoveryDaily, recoveryOrderCompletions } = await loadAIRecoveryDomains(args.userId);
  const next = cloneJson(recoveryOrderCompletions) as RecoveryOrderCompletions;
  const current = Array.isArray(next[args.dateISO]) ? [...(next[args.dateISO] ?? [])] : [];
  const seen = new Set(current);
  if (args.completed) {
    seen.add(args.orderId);
  } else {
    seen.delete(args.orderId);
  }
  const values = Array.from(seen);
  if (values.length > 0) next[args.dateISO] = values;
  else delete next[args.dateISO];
  const keepDates = new Set(Object.keys(pruneAIRecoveryDaily(aiRecoveryDaily)).filter(isISODate));
  const pruned = pruneDateMap(next, keepDates);

  const saved = await saveUserState({
    userId: args.userId,
    payload: {
      recoveryOrderCompletions: pruned,
    },
  });
  return {
    completions: values,
    stateRevision: saved.stateRevision,
  };
}
