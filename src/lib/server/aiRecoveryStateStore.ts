import type { ISODate } from "@/lib/date";
import { isISODate, todayISO } from "@/lib/date";
import {
  AI_RECOVERY_RETENTION_DAYS,
  type AIRecoveryDaily,
  type AIRecoveryDayPayload,
  type AIRecoverySlot,
  type AIRecoverySlotPayload,
} from "@/lib/aiRecovery";
import type { RecoverySummary } from "@/lib/accountBootstrap";
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

function isRenderableSession(session: AIRecoverySlotPayload | null | undefined): session is AIRecoverySlotPayload {
  return Boolean(session?.brief && session.status === "ready" && !session.openaiMeta?.fallbackReason);
}

function sortByGeneratedAtDesc(a: { slot: AIRecoverySlot; session: AIRecoverySlotPayload }, b: { slot: AIRecoverySlot; session: AIRecoverySlotPayload }) {
  const aTs = Date.parse(a.session.generatedAt ?? "") || 0;
  const bTs = Date.parse(b.session.generatedAt ?? "") || 0;
  return bTs - aTs;
}

function buildTodaySlots(day: AIRecoveryDayPayload | undefined) {
  const wakeReady = isRenderableSession(day?.wake);
  const postShiftReady = isRenderableSession(day?.postShift);
  return {
    wakeReady,
    postShiftReady,
    allReady: wakeReady && postShiftReady,
  };
}

export function buildAIRecoverySummary(args: {
  dateISO?: ISODate;
  aiRecoveryDaily: AIRecoveryDaily;
  recoveryOrderCompletions: RecoveryOrderCompletions;
}): RecoverySummary | null {
  const dateISO = args.dateISO ?? todayISO();
  const day = args.aiRecoveryDaily[dateISO];
  const sessions = ([
    day?.wake ? { slot: "wake" as const, session: day.wake } : null,
    day?.postShift ? { slot: "postShift" as const, session: day.postShift } : null,
  ].filter(Boolean) as Array<{ slot: AIRecoverySlot; session: AIRecoverySlotPayload }>).filter((entry) =>
    isRenderableSession(entry.session)
  );

  if (!sessions.length) {
    return {
      dateISO,
      headline: null,
      latestSlot: null,
      pendingOrderTitle: null,
      ordersCompleted: false,
      hasAnySession: false,
      todaySlots: buildTodaySlots(day),
    };
  }

  const latest = [...sessions].sort(sortByGeneratedAtDesc)[0] ?? null;
  const withOrders = [...sessions]
    .filter((entry) => (entry.session.orders?.items.length ?? 0) > 0)
    .sort(sortByGeneratedAtDesc)[0] ?? latest;
  const completions = new Set(Array.isArray(args.recoveryOrderCompletions[dateISO]) ? args.recoveryOrderCompletions[dateISO] ?? [] : []);
  const pendingOrder = withOrders?.session.orders?.items.find((item) => !completions.has(item.id)) ?? null;

  return {
    dateISO,
    headline: latest?.session.brief?.headline?.trim() || null,
    latestSlot: latest?.slot ?? null,
    pendingOrderTitle: pendingOrder?.body?.trim() || pendingOrder?.title?.trim() || null,
    ordersCompleted: Boolean(withOrders?.session.orders?.items.length) && !pendingOrder,
    hasAnySession: true,
    todaySlots: buildTodaySlots(day),
  };
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

export async function loadAIRecoverySummary(userId: string, dateISO: ISODate = todayISO()) {
  const { aiRecoveryDaily, recoveryOrderCompletions } = await loadAIRecoveryDomains(userId);
  return buildAIRecoverySummary({
    dateISO,
    aiRecoveryDaily,
    recoveryOrderCompletions,
  });
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
