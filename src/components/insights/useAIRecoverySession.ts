"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addDays, fromISODate, toISODate, todayISO, type ISODate } from "@/lib/date";
import {
  DEFAULT_AI_RECOVERY_ORDER_GENERATION_OPTIONS,
  getAIRecoveryErrorMessage,
  normalizeAIRecoveryOrderGenerationOptions,
  pickPreferredAIRecoverySlot,
  type AIRecoveryOrderGenerationOptions,
  type AIRecoverySessionResponse,
  type AIRecoverySlot,
} from "@/lib/aiRecovery";
import { useAuthState } from "@/lib/auth";
import { getClientSyncSnapshot, updateClientSyncSnapshot, useClientSyncSnapshot } from "@/lib/clientSyncStore";
import {
  readCurrentAccountSession,
  storeCurrentAccountSession,
  useCurrentAccountResources,
} from "@/lib/currentAccountResourceStore";
import {
  CLIENT_DATA_SCOPE_HOME_PREVIEW,
  CLIENT_DATA_SCOPE_RECOVERY_SESSION,
  emitClientDataInvalidation,
} from "@/lib/clientDataEvents";
import { serializeStateForSupabase } from "@/lib/statePersistence";
import { getAppState } from "@/lib/store";
import type { AppState } from "@/lib/model";

type SessionData = AIRecoverySessionResponse["data"];

type HookArgs = {
  dateISO: ISODate;
  slot: AIRecoverySlot;
  autoGenerate?: boolean;
  enabled?: boolean;
  initialData?: SessionData | null;
};

type HookState = {
  data: SessionData | null;
  loading: boolean;
  generating: boolean;
  savingOrders: boolean;
  pendingAutoOrders: boolean;
  togglingCompletion: string | null;
  error: string | null;
  reload: () => Promise<void>;
  generate: (force?: boolean, orderOptions?: AIRecoveryOrderGenerationOptions) => Promise<void>;
  regenerateOrders: (orderOptions?: AIRecoveryOrderGenerationOptions) => Promise<void>;
  toggleCompletion: (orderId: string, completed: boolean) => Promise<void>;
};

type RouteEntryArgs = {
  dateISO: ISODate;
  requestedSlot?: AIRecoverySlot | null;
};

type RouteEntryState = {
  slot: AIRecoverySlot | null;
  initialData: SessionData | null;
  loading: boolean;
  error: string | null;
};

type SessionPreloadArgs = {
  accountKey: string | null;
  dateISO: ISODate;
  slot: AIRecoverySlot;
  stateRevision: number | null;
  force?: boolean;
};

type SessionPreloadRecord = {
  promise: Promise<SessionData | null>;
  createdAt: number;
};

type AutoOrdersRequestRecord = {
  options: AIRecoveryOrderGenerationOptions;
  status: "pending" | "completed";
  updatedAt: number;
};

const MAX_SESSION_PRELOAD_REQUESTS = 48;
const sessionPreloadRequests = new Map<string, SessionPreloadRecord>();
const MAX_AUTO_ORDERS_REQUESTS = 64;
const AUTO_ORDERS_STORAGE_PREFIX = "rnest:ai-recovery:auto-orders:";
const AUTO_ORDERS_PENDING_STALE_MS = 90_000;
const AUTO_ORDERS_COMPLETED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const AUTO_ORDERS_RELOAD_RETRY_MS = 700;
const AUTO_ORDERS_RELOAD_TIMEOUT_MS = 10_000;
// Track brief-without-orders sessions across hook instances and full reloads
// so a resumed page cannot enqueue the same orders generation with default options.
const autoOrdersRequests = new Map<string, AutoOrdersRequestRecord>();
const autoOrdersRequestListeners = new Set<() => void>();

function emitAutoOrdersRequestChange() {
  for (const listener of autoOrdersRequestListeners) listener();
}

function subscribeAutoOrdersRequestChange(listener: () => void) {
  autoOrdersRequestListeners.add(listener);
  return () => {
    autoOrdersRequestListeners.delete(listener);
  };
}

async function readJson<T>(response: Response): Promise<T | null> {
  return response.json().catch(() => null);
}

function hasSessionOrders(value: SessionData | null | undefined) {
  return Boolean(value?.session?.orders?.items?.length);
}

function hasBriefWithoutOrders(value: SessionData | null | undefined) {
  return Boolean(value?.session?.brief) && !hasSessionOrders(value);
}

function buildSessionResourceKey(dateISO: ISODate, slot: AIRecoverySlot) {
  return `${dateISO}:${slot}`;
}

function buildSessionPreloadKey(args: {
  accountKey: string | null;
  dateISO: ISODate;
  slot: AIRecoverySlot;
  stateRevision: number | null;
}) {
  return `${args.accountKey ?? "guest"}:${buildSessionResourceKey(args.dateISO, args.slot)}:${args.stateRevision ?? "none"}`;
}

function trimSessionPreloadRequests() {
  if (sessionPreloadRequests.size <= MAX_SESSION_PRELOAD_REQUESTS) return;
  const entries = [...sessionPreloadRequests.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt);
  for (const [key] of entries) {
    if (sessionPreloadRequests.size <= MAX_SESSION_PRELOAD_REQUESTS) break;
    sessionPreloadRequests.delete(key);
  }
}

function trimAutoOrdersRequests() {
  if (autoOrdersRequests.size <= MAX_AUTO_ORDERS_REQUESTS) return;
  const entries = [...autoOrdersRequests.entries()].sort((a, b) => a[1].updatedAt - b[1].updatedAt);
  for (const [key] of entries) {
    if (autoOrdersRequests.size <= MAX_AUTO_ORDERS_REQUESTS) break;
    autoOrdersRequests.delete(key);
  }
}

function buildAutoOrdersStorageKey(key: string) {
  return `${AUTO_ORDERS_STORAGE_PREFIX}${key}`;
}

function readPersistedAutoOrdersRequest(key: string): AutoOrdersRequestRecord | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(buildAutoOrdersStorageKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AutoOrdersRequestRecord> | null;
    if (!parsed || typeof parsed !== "object") return null;
    const status = parsed.status === "pending" || parsed.status === "completed" ? parsed.status : null;
    const updatedAt = Number(parsed.updatedAt);
    if (!status || !Number.isFinite(updatedAt)) return null;
    return {
      options: normalizeAIRecoveryOrderGenerationOptions(parsed.options),
      status,
      updatedAt,
    };
  } catch {
    return null;
  }
}

function persistAutoOrdersRequest(key: string, record: AutoOrdersRequestRecord) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(buildAutoOrdersStorageKey(key), JSON.stringify(record));
  } catch {}
}

function clearPersistedAutoOrdersRequest(key: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(buildAutoOrdersStorageKey(key));
  } catch {}
}

function isAutoOrdersRequestStale(record: AutoOrdersRequestRecord) {
  const age = Date.now() - record.updatedAt;
  if (record.status === "pending") return age > AUTO_ORDERS_PENDING_STALE_MS;
  return age > AUTO_ORDERS_COMPLETED_RETENTION_MS;
}

function getAutoOrdersRequestRecord(key: string): AutoOrdersRequestRecord | null {
  const inMemory = autoOrdersRequests.get(key);
  if (inMemory && !isAutoOrdersRequestStale(inMemory)) return inMemory;
  if (inMemory) autoOrdersRequests.delete(key);

  const persisted = readPersistedAutoOrdersRequest(key);
  if (!persisted) return null;
  if (isAutoOrdersRequestStale(persisted)) {
    clearPersistedAutoOrdersRequest(key);
    return null;
  }
  autoOrdersRequests.set(key, persisted);
  trimAutoOrdersRequests();
  return persisted;
}

function getAutoOrdersRequestOptions(key: string): AIRecoveryOrderGenerationOptions | null {
  const stored = getAutoOrdersRequestRecord(key)?.options;
  return stored ? normalizeAIRecoveryOrderGenerationOptions(stored) : null;
}

function getAutoOrdersRequestStatus(key: string) {
  return getAutoOrdersRequestRecord(key)?.status ?? null;
}

function beginAutoOrdersRequest(key: string, options?: AIRecoveryOrderGenerationOptions) {
  const existing = getAutoOrdersRequestRecord(key);
  if (existing?.status === "pending" || existing?.status === "completed") return false;
  if (!options) return false;
  const nextRecord = {
    options: normalizeAIRecoveryOrderGenerationOptions(options),
    status: "pending",
    updatedAt: Date.now(),
  } satisfies AutoOrdersRequestRecord;
  autoOrdersRequests.set(key, nextRecord);
  persistAutoOrdersRequest(key, nextRecord);
  trimAutoOrdersRequests();
  emitAutoOrdersRequestChange();
  return true;
}

function settleAutoOrdersRequest(key: string, success: boolean) {
  const existing = getAutoOrdersRequestRecord(key);
  if (!existing) return;
  if (!success) {
    autoOrdersRequests.delete(key);
    clearPersistedAutoOrdersRequest(key);
    emitAutoOrdersRequestChange();
    return;
  }
  const nextRecord = {
    ...existing,
    status: "completed",
    updatedAt: Date.now(),
  } satisfies AutoOrdersRequestRecord;
  autoOrdersRequests.set(key, nextRecord);
  persistAutoOrdersRequest(key, nextRecord);
  trimAutoOrdersRequests();
  emitAutoOrdersRequestChange();
}

function normalizeSessionData(
  value: SessionData | null | undefined,
  defaults?: {
    dateISO?: ISODate;
    slot?: AIRecoverySlot;
    hasAIEntitlement?: boolean;
  }
): SessionData | null {
  if (!value) return null;
  return {
    ...value,
    dateISO: value.dateISO ?? defaults?.dateISO ?? todayISO(),
    slot: value.slot ?? defaults?.slot ?? "wake",
    todaySlots: value.todaySlots ?? { wakeReady: false, postShiftReady: false, allReady: false },
    orderStats:
      value.orderStats ??
      {
        todayWakeCompleted: 0,
        todayPostShiftCompleted: 0,
        todayTotalCompleted: 0,
        weekTotalCompleted: 0,
      },
    showGenerationControls: value.showGenerationControls ?? false,
    hasAIEntitlement: value.hasAIEntitlement ?? defaults?.hasAIEntitlement ?? false,
    stateRevision: value.stateRevision ?? null,
  } satisfies SessionData;
}

function syncClientStateRevision(nextRevision: number | null | undefined) {
  if (nextRevision == null) return;
  const currentSync = getClientSyncSnapshot();
  updateClientSyncSnapshot({
    stateRevision: nextRevision,
    bootstrapRevision:
      currentSync.bootstrapRevision == null
        ? nextRevision
        : Math.max(currentSync.bootstrapRevision, nextRevision),
  });
}

function primeAIRecoverySessionPreload(args: {
  accountKey: string | null;
  dateISO: ISODate;
  slot: AIRecoverySlot;
  stateRevision: number | null;
  data: SessionData | null;
}) {
  const key = buildSessionPreloadKey(args);
  sessionPreloadRequests.set(key, {
    promise: Promise.resolve(args.data),
    createdAt: Date.now(),
  });
  trimSessionPreloadRequests();
}

function registerLoadedAIRecoverySession(args: {
  accountKey: string | null;
  dateISO: ISODate;
  slot: AIRecoverySlot;
  stateRevision: number | null;
  data: SessionData | null;
}) {
  syncClientStateRevision(args.stateRevision);
  if (args.accountKey) {
    storeCurrentAccountSession(args.accountKey, buildSessionResourceKey(args.dateISO, args.slot), args.data, args.stateRevision);
  }
  primeAIRecoverySessionPreload(args);
}

async function fetchAIRecoverySessionViewFromApi(args: {
  dateISO: ISODate;
  slot: AIRecoverySlot;
  context: string;
}) {
  const response = await fetch(`/api/insights/recovery/ai?date=${args.dateISO}&slot=${args.slot}`, {
    method: "GET",
    cache: "no-store",
  });
  const json = await readJson<{ ok?: boolean; error?: string; detail?: string | null; data?: SessionData }>(response);
  if (!response.ok || !json?.ok || !json.data) {
    console.error(`[AIRecovery] client_${args.context}_failed`, {
      status: response.status,
      error: json?.error ?? null,
      detail: json?.detail ?? null,
      dateISO: args.dateISO,
      slot: args.slot,
    });
    throw new Error(String(json?.error ?? `http_${response.status}`));
  }
  return normalizeSessionData(json.data, {
    dateISO: args.dateISO,
    slot: args.slot,
  });
}

export function preloadAIRecoverySessionView(args: SessionPreloadArgs): Promise<SessionData | null> {
  const key = buildSessionPreloadKey(args);
  if (!args.force) {
    const existing = sessionPreloadRequests.get(key);
    if (existing) return existing.promise;
  } else {
    sessionPreloadRequests.delete(key);
  }

  let requestPromise: Promise<SessionData | null>;
  requestPromise = fetchAIRecoverySessionViewFromApi({
    dateISO: args.dateISO,
    slot: args.slot,
    context: args.force ? "preload_force" : "preload",
  })
    .then((data) => {
      const nextStateRevision = data?.stateRevision ?? args.stateRevision ?? null;
      registerLoadedAIRecoverySession({
        accountKey: args.accountKey,
        dateISO: args.dateISO,
        slot: args.slot,
        stateRevision: nextStateRevision,
        data,
      });
      if (nextStateRevision !== args.stateRevision) {
        primeAIRecoverySessionPreload({
          accountKey: args.accountKey,
          dateISO: args.dateISO,
          slot: args.slot,
          stateRevision: nextStateRevision,
          data,
        });
      }
      return data;
    })
    .catch((error) => {
      const current = sessionPreloadRequests.get(key);
      if (current?.promise === requestPromise) {
        sessionPreloadRequests.delete(key);
      }
      throw error;
    });

  sessionPreloadRequests.set(key, {
    promise: requestPromise,
    createdAt: Date.now(),
  });
  trimSessionPreloadRequests();
  return requestPromise;
}

export async function warmAIRecoverySessionViews(args: {
  accountKey: string | null;
  dateISO: ISODate;
  preferredSlot: AIRecoverySlot | null;
  stateRevision: number | null;
}) {
  if (!args.accountKey) return;
  if (args.preferredSlot) {
    await preloadAIRecoverySessionView({
      accountKey: args.accountKey,
      dateISO: args.dateISO,
      slot: args.preferredSlot,
      stateRevision: args.stateRevision,
    });
    return;
  }
  await Promise.all([
    preloadAIRecoverySessionView({
      accountKey: args.accountKey,
      dateISO: args.dateISO,
      slot: "wake",
      stateRevision: args.stateRevision,
    }),
    preloadAIRecoverySessionView({
      accountKey: args.accountKey,
      dateISO: args.dateISO,
      slot: "postShift",
      stateRevision: args.stateRevision,
    }),
  ]);
}

export function useAIRecoveryRouteEntry(args: RouteEntryArgs): RouteEntryState {
  const { user } = useAuthState();
  const { stateRevision } = useClientSyncSnapshot();
  const resources = useCurrentAccountResources();
  const accountKey = user?.userId ?? null;
  const summaryLatestSlot = useMemo(() => {
    if (resources.recoverySummary?.dateISO !== args.dateISO) return null;
    return resources.recoverySummary.latestSlot ?? null;
  }, [args.dateISO, resources.recoverySummary?.dateISO, resources.recoverySummary?.latestSlot]);
  const preferredSlot = args.requestedSlot ?? summaryLatestSlot;
  const preferredInitialData = useMemo(() => {
    if (!preferredSlot) return null;
    const key = buildSessionResourceKey(args.dateISO, preferredSlot);
    return resources.sessions[key]?.data ?? null;
  }, [args.dateISO, preferredSlot, resources.sessions]);
  const [state, setState] = useState<RouteEntryState>(() => ({
    slot: preferredSlot,
    initialData: preferredInitialData,
    loading: !preferredSlot && Boolean(accountKey),
    error: null,
  }));

  useEffect(() => {
    if (preferredSlot) {
      setState((current) => {
        if (
          current.slot === preferredSlot &&
          !current.loading &&
          current.error == null &&
          current.initialData === preferredInitialData
        ) {
          return current;
        }
        return {
          slot: preferredSlot,
          initialData: preferredInitialData,
          loading: false,
          error: null,
        };
      });
      return;
    }

    if (!accountKey) {
      setState({
        slot: "wake",
        initialData: null,
        loading: false,
        error: null,
      });
      return;
    }

    let cancelled = false;
    setState((current) => ({
      slot: current.slot,
      initialData: current.initialData,
      loading: true,
      error: null,
    }));

    void Promise.all([
      preloadAIRecoverySessionView({
        accountKey,
        dateISO: args.dateISO,
        slot: "wake",
        stateRevision,
      }),
      preloadAIRecoverySessionView({
        accountKey,
        dateISO: args.dateISO,
        slot: "postShift",
        stateRevision,
      }),
    ])
      .then(([wake, postShift]) => {
        if (cancelled) return;
        const preferred = pickPreferredAIRecoverySlot({
          wake,
          postShift,
        });
        setState({
          slot: preferred.slot,
          initialData: preferred.data ?? null,
          loading: false,
          error: null,
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setState({
          slot: "wake",
          initialData: null,
          loading: false,
          error: getAIRecoveryErrorMessage((error as Error)?.message ?? error ?? "ai_recovery_load_failed"),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [accountKey, args.dateISO, preferredInitialData, preferredSlot, stateRevision]);

  return state;
}

export function useAIRecoverySession(args: HookArgs): HookState {
  const { user } = useAuthState();
  const { stateRevision } = useClientSyncSnapshot();
  const resources = useCurrentAccountResources();
  const accountKey = user?.userId ?? null;
  const resourceKey = buildSessionResourceKey(args.dateISO, args.slot);
  const memoryEntry =
    accountKey && resources.accountKey === accountKey
      ? resources.sessions[resourceKey] ?? null
      : readCurrentAccountSession(accountKey, resourceKey);
  const normalizeData = useCallback(
    (value: SessionData | null | undefined) =>
      normalizeSessionData(value, {
        dateISO: args.dateISO,
        slot: args.slot,
        hasAIEntitlement: Boolean(args.enabled),
      }),
    [args.dateISO, args.enabled, args.slot]
  );
  const initialSourceData = args.initialData ?? memoryEntry?.data ?? null;
  const initialData = useMemo(
    () =>
      normalizeSessionData(initialSourceData, {
        dateISO: args.dateISO,
        slot: args.slot,
        hasAIEntitlement: Boolean(args.enabled),
      }),
    [args.dateISO, args.enabled, args.slot, initialSourceData]
  );

  const buildAutoOrdersKey = useCallback((value: SessionData | null) => {
    const session = value?.session;
    const generatedAt = session?.generatedAt;
    if (!session || !hasBriefWithoutOrders(value) || !generatedAt) return null;
    if (session.status === "fallback" || session.openaiMeta?.fallbackReason) return null;
    return `${accountKey ?? "guest"}:${value.dateISO}:${value.slot}:${generatedAt}`;
  }, [accountKey]);

  const [data, setData] = useState<SessionData | null>(initialData);
  const [loading, setLoading] = useState(!initialData);
  const [generating, setGenerating] = useState(false);
  const [savingOrders, setSavingOrders] = useState(false);
  const [pendingAutoOrders, setPendingAutoOrders] = useState(() => {
    const initialAutoOrdersKey = buildAutoOrdersKey(initialData);
    return initialAutoOrdersKey ? getAutoOrdersRequestStatus(initialAutoOrdersKey) === "pending" : false;
  });
  const [togglingCompletion, setTogglingCompletion] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const autoRequestedRef = useRef(new Set<string>());
  const dataRequestRef = useRef(0);
  const generateInFlightRef = useRef(false);
  const ordersInFlightRef = useRef(false);
  const loadRef = useRef<(options?: { force?: boolean }) => Promise<void>>(async () => {});
  const togglingCompletionRef = useRef<string | null>(null);
  const committedCompletionVersionRef = useRef(0);
  const autoOrdersReloadRef = useRef<{ key: string; promise: Promise<boolean> } | null>(null);
  const autoOrdersRetryTimerRef = useRef<number | null>(null);
  const autoOrdersRetryResolveRef = useRef<(() => void) | null>(null);

  // Refs for stable toggleCompletion — always reflect latest values without re-creating the callback
  const dataRef = useRef<SessionData | null>(data);
  dataRef.current = data;
  const enabledRef = useRef<boolean>(args.enabled ?? false);
  enabledRef.current = args.enabled ?? false;
  const slotRef = useRef<AIRecoverySlot>(args.slot);
  slotRef.current = args.slot;
  const dateISORef = useRef<ISODate>(args.dateISO);
  dateISORef.current = args.dateISO;

  const key = `${args.dateISO}:${args.slot}`;
  const nextDataRequestId = () => {
    dataRequestRef.current += 1;
    return dataRequestRef.current;
  };

  const isCurrentDataRequest = (requestId: number) => dataRequestRef.current === requestId;

  const setFriendlyError = (value: unknown) => {
    setError(getAIRecoveryErrorMessage(value));
  };

  const pickLatestData = useCallback((current: SessionData | null, incoming: SessionData | null): SessionData | null => {
    if (!incoming) return current;
    if (!current) return incoming;
    // Always prefer incoming when slot or date changed — old data is irrelevant
    if (current.slot !== incoming.slot || current.dateISO !== incoming.dateISO) return incoming;
    const currentSession = current.session;
    const incomingSession = incoming.session;
    if (!incomingSession) return currentSession ? current : incoming;
    if (!currentSession) return incoming;

    const currentIsFallback = currentSession.status === "fallback" || Boolean(currentSession.openaiMeta?.fallbackReason);
    const incomingIsFallback = incomingSession.status === "fallback" || Boolean(incomingSession.openaiMeta?.fallbackReason);
    if (!incomingIsFallback && currentIsFallback) return incoming;
    if (incomingIsFallback && !currentIsFallback) return current;

    const currentTs = Date.parse(currentSession.generatedAt || "") || 0;
    const incomingTs = Date.parse(incomingSession.generatedAt || "") || 0;
    if (incomingTs > currentTs) return incoming;
    if (incomingTs < currentTs) return current;

    const currentHasOrders = Boolean(currentSession.orders?.items?.length);
    const incomingHasOrders = Boolean(incomingSession.orders?.items?.length);
    if (incomingHasOrders && !currentHasOrders) return incoming;
    if (!incomingHasOrders && currentHasOrders) return current;

    const currentOrdersId = currentSession.openaiMeta?.ordersResponseId ?? "";
    const incomingOrdersId = incomingSession.openaiMeta?.ordersResponseId ?? "";
    if (incomingOrdersId && !currentOrdersId) return incoming;
    if (!incomingOrdersId && currentOrdersId) return current;

    return incoming;
  }, []);

  const isSameRenderedSession = useCallback((current: SessionData | null, incoming: SessionData | null) => {
    if (!current?.session || !incoming?.session) return false;
    if (current.dateISO !== incoming.dateISO || current.slot !== incoming.slot) return false;
    if ((current.session.generatedAt ?? "") !== (incoming.session.generatedAt ?? "")) return false;
    const currentBriefId = current.session.openaiMeta?.briefResponseId ?? "";
    const incomingBriefId = incoming.session.openaiMeta?.briefResponseId ?? "";
    const currentOrdersId = current.session.openaiMeta?.ordersResponseId ?? "";
    const incomingOrdersId = incoming.session.openaiMeta?.ordersResponseId ?? "";
    if ((currentBriefId || incomingBriefId) && currentBriefId !== incomingBriefId) return false;
    if ((currentOrdersId || incomingOrdersId) && currentOrdersId !== incomingOrdersId) return false;
    return true;
  }, []);

  const mergeCompletionLists = useCallback((current: string[] | null | undefined, incoming: string[] | null | undefined) => {
    const next: string[] = [];
    const seen = new Set<string>();
    for (const item of current ?? []) {
      if (typeof item !== "string" || !item || seen.has(item)) continue;
      seen.add(item);
      next.push(item);
    }
    for (const item of incoming ?? []) {
      if (typeof item !== "string" || !item || seen.has(item)) continue;
      seen.add(item);
      next.push(item);
    }
    return next;
  }, []);

  const mergeInteractiveState = useCallback((
    current: SessionData | null,
    incoming: SessionData | null,
    preserveCommittedCompletions = false,
  ): SessionData | null => {
    if (!current || !incoming) return incoming;
    if (!togglingCompletionRef.current && !preserveCommittedCompletions) return incoming;
    if (!isSameRenderedSession(current, incoming)) return incoming;
    const mergedCompletions = mergeCompletionLists(current.completions, incoming.completions);
    return {
      ...incoming,
      completions: mergedCompletions,
      // Completion UI only supports additive checks, so never let an older
      // session refetch reduce counters after a successful toggle.
      orderStats: {
        todayWakeCompleted: Math.max(current.orderStats.todayWakeCompleted, incoming.orderStats.todayWakeCompleted),
        todayPostShiftCompleted: Math.max(current.orderStats.todayPostShiftCompleted, incoming.orderStats.todayPostShiftCompleted),
        todayTotalCompleted: Math.max(current.orderStats.todayTotalCompleted, incoming.orderStats.todayTotalCompleted),
        weekTotalCompleted: Math.max(current.orderStats.weekTotalCompleted, incoming.orderStats.weekTotalCompleted),
      },
    };
  }, [isSameRenderedSession, mergeCompletionLists]);

  const adoptIncomingData = useCallback((
    incoming: SessionData | null,
    options?: {
      completionVersionAtStart?: number;
    },
  ) => {
    setData((current) => {
      const preserveCommittedCompletions =
        options?.completionVersionAtStart != null && options.completionVersionAtStart !== committedCompletionVersionRef.current;
      const merged = mergeInteractiveState(current, incoming, preserveCommittedCompletions);
      return pickLatestData(current, merged);
    });
  }, [mergeInteractiveState, pickLatestData]);

  const listRequestDates = (pivotISO: ISODate, daysBefore: number, daysAfter: number) => {
    const pivot = fromISODate(pivotISO);
    const out: ISODate[] = [];
    for (let offset = -daysBefore; offset <= daysAfter; offset += 1) {
      out.push(toISODate(addDays(pivot, offset)));
    }
    return out;
  };

  const pickDateMap = <T,>(map: Record<string, T | undefined> | undefined, dates: ISODate[]) => {
    const out: Record<string, T | undefined> = {};
    for (const iso of dates) {
      if (map?.[iso] !== undefined) out[iso] = map[iso];
    }
    return out;
  };

  const buildRecoveryStatePayload = (raw: AppState) => {
    const serialized = serializeStateForSupabase(raw);
    const bioDates = Object.keys(serialized.bio ?? {});
    const emotionDates = Object.keys(serialized.emotions ?? {});
    const noteDates = Object.keys(serialized.notes ?? {});
    const allHealthDates = new Set<ISODate>([...bioDates, ...emotionDates, ...noteDates] as ISODate[]);
    const dateWindow = listRequestDates(args.dateISO, 21, 21);
    const healthDates = [...allHealthDates].filter((iso) => iso <= args.dateISO).sort().slice(-21);
    const includedDates = Array.from(new Set<ISODate>([...dateWindow, ...healthDates])).sort();

    return {
      selected: serialized.selected,
      schedule: pickDateMap(serialized.schedule as Record<string, AppState["schedule"][ISODate]>, includedDates),
      shiftNames: {},
      notes: pickDateMap(serialized.notes as Record<string, AppState["notes"][ISODate]>, includedDates),
      emotions: pickDateMap(serialized.emotions as Record<string, AppState["emotions"][ISODate]>, includedDates),
      bio: pickDateMap(serialized.bio as Record<string, AppState["bio"][ISODate]>, includedDates),
      memo: serialized.memo,
      records: serialized.records,
      settings: serialized.settings,
    } satisfies AppState;
  };

  const buildStatePayload = () => {
    try {
      return buildRecoveryStatePayload(getAppState());
    } catch {
      return null;
    }
  };

  const load = async (options?: { force?: boolean }) => {
    const requestId = nextDataRequestId();
    const completionVersionAtStart = committedCompletionVersionRef.current;
    if (!args.enabled || !accountKey) {
      setLoading(false);
      setData(null);
      setError(null);
      return;
    }
    const cached = readCurrentAccountSession(accountKey, resourceKey);
    const cachedData = normalizeData(cached?.data ?? dataRef.current ?? null);
    const shouldRevalidate = options?.force === true || !cachedData || (cached?.revision ?? null) !== (stateRevision ?? null);

    if (cachedData) {
      adoptIncomingData(cachedData, { completionVersionAtStart });
    }

    if (!shouldRevalidate) {
      setLoading(false);
      setError(null);
      // 캐시 히트 시에도 brief만 있고 orders가 없는 경우 자동 생성을 트리거한다.
      // (캐시 유효 판정으로 API 호출을 건너뛰면 아래 autoOrdersKey 체크에 도달하지 못하므로
      //  여기서 별도로 처리해야 오더 로딩 오버레이와 자동 생성이 정상 작동한다.)
      if (cachedData) {
        const autoOrdersKey = buildAutoOrdersKey(cachedData);
        const autoOrderOptions = autoOrdersKey ? getAutoOrdersRequestOptions(autoOrdersKey) : null;
        if (autoOrdersKey && autoOrderOptions && cachedData.quota.canRegenerateOrders) {
          if (beginAutoOrdersRequest(autoOrdersKey, autoOrderOptions)) {
            void regenerateOrdersInternal(true, autoOrderOptions, autoOrdersKey);
          }
        }
      }
      return;
    }

    setLoading(!cachedData);
    setError(null);
    try {
      const nextData = await preloadAIRecoverySessionView({
        accountKey,
        dateISO: args.dateISO,
        slot: args.slot,
        stateRevision: stateRevision ?? null,
        force: options?.force === true,
      });
      if (!isCurrentDataRequest(requestId)) return;
      adoptIncomingData(nextData, { completionVersionAtStart });
      const autoOrdersKey = buildAutoOrdersKey(nextData);
      const autoOrderOptions = autoOrdersKey ? getAutoOrdersRequestOptions(autoOrdersKey) : null;
      if (autoOrdersKey && autoOrderOptions && nextData?.quota.canRegenerateOrders) {
        if (beginAutoOrdersRequest(autoOrdersKey, autoOrderOptions)) {
          void regenerateOrdersInternal(true, autoOrderOptions, autoOrdersKey);
        }
      }
      const shouldAutoGenerate =
        args.autoGenerate !== false &&
        nextData?.gate.allowed &&
        !nextData.session &&
        nextData.quota.canGenerateSession &&
        !autoRequestedRef.current.has(key);
      if (shouldAutoGenerate) {
        autoRequestedRef.current.add(key);
        await generateInternal(Boolean(nextData.session), DEFAULT_AI_RECOVERY_ORDER_GENERATION_OPTIONS, key);
      }
    } catch (nextError) {
      if (!isCurrentDataRequest(requestId)) return;
      if (!cachedData) {
        setData(null);
      }
      setFriendlyError((nextError as any)?.message ?? nextError ?? "ai_recovery_load_failed");
    } finally {
      setLoading(false);
    }
  };

  const regenerateOrdersInternal = async (
    auto = false,
    orderOptions?: AIRecoveryOrderGenerationOptions,
    autoOrdersKey?: string | null,
  ) => {
    if (!args.enabled) return;
    if (ordersInFlightRef.current) return;
    const normalizedOrderOptions = normalizeAIRecoveryOrderGenerationOptions(orderOptions);
    ordersInFlightRef.current = true;
    const requestId = nextDataRequestId();
    const completionVersionAtStart = committedCompletionVersionRef.current;
    let autoOrdersSucceeded = false;
    setSavingOrders(true);
    if (!auto) setError(null);
    try {
      const response = await fetch("/api/insights/recovery/ai/orders", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          dateISO: args.dateISO,
          slot: args.slot,
          orderOptions: normalizedOrderOptions,
        }),
      });
      const json = await readJson<{ ok?: boolean; error?: string; detail?: string | null; data?: SessionData }>(response);
      if (!response.ok || !json?.ok || !json.data) {
        console.error("[AIRecovery] client_orders_failed", {
          status: response.status,
          error: json?.error ?? null,
          detail: json?.detail ?? null,
          auto,
        });
        throw new Error(String(json?.error ?? `http_${response.status}`));
      }
      if (!isCurrentDataRequest(requestId)) return;
      const nextData = normalizeData(json.data);
      const nextStateRevision = Number.isFinite(Number(json.data?.stateRevision)) ? Number(json.data?.stateRevision) : null;
      syncClientStateRevision(nextStateRevision);
      adoptIncomingData(nextData, { completionVersionAtStart });
      autoOrdersSucceeded = Boolean(nextData?.session?.orders?.items?.length);
      registerLoadedAIRecoverySession({
        accountKey,
        dateISO: args.dateISO,
        slot: args.slot,
        stateRevision: nextStateRevision ?? stateRevision ?? null,
        data: nextData,
      });
      emitClientDataInvalidation([CLIENT_DATA_SCOPE_RECOVERY_SESSION, CLIENT_DATA_SCOPE_HOME_PREVIEW]);
    } catch (nextError) {
      if (!isCurrentDataRequest(requestId)) return;
      try {
        const recovered = await fetchAIRecoverySessionViewFromApi({
          dateISO: args.dateISO,
          slot: args.slot,
          context: auto ? "orders_auto_recover" : "orders_recover",
        });
        if (!isCurrentDataRequest(requestId)) return;
        adoptIncomingData(recovered, { completionVersionAtStart });
        registerLoadedAIRecoverySession({
          accountKey,
          dateISO: args.dateISO,
          slot: args.slot,
          stateRevision: recovered?.stateRevision ?? stateRevision ?? null,
          data: recovered,
        });
        autoOrdersSucceeded = Boolean(recovered?.session?.orders?.items?.length);
        if (!auto) setError(null);
        return;
      } catch {}
      if (auto) {
        console.warn("[AIRecovery] client_orders_auto_failed", {
          message: (nextError as any)?.message ?? String(nextError),
        });
      } else {
        setFriendlyError((nextError as any)?.message ?? nextError ?? "ai_recovery_orders_failed");
      }
    } finally {
      if (autoOrdersKey) settleAutoOrdersRequest(autoOrdersKey, autoOrdersSucceeded);
      ordersInFlightRef.current = false;
      setSavingOrders(false);
    }
  };

  const generateInternal = async (force = false, orderOptions?: AIRecoveryOrderGenerationOptions, autoKey?: string) => {
    if (!args.enabled) return;
    if (generateInFlightRef.current) return;
    const normalizedOrderOptions = normalizeAIRecoveryOrderGenerationOptions(orderOptions);
    generateInFlightRef.current = true;
    const requestId = nextDataRequestId();
    const completionVersionAtStart = committedCompletionVersionRef.current;
    const previousGeneratedAt = data?.session?.generatedAt ?? null;
    setGenerating(true);
    setError(null);
    try {
      const response = await fetch("/api/insights/recovery/ai/generate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          dateISO: args.dateISO,
          slot: args.slot,
          force,
          state: buildStatePayload(),
        }),
      });
      const json = await readJson<{ ok?: boolean; error?: string; detail?: string | null; data?: SessionData }>(response);
      if (!response.ok || !json?.ok || !json.data) {
        console.error("[AIRecovery] client_generate_failed", {
          status: response.status,
          error: json?.error ?? null,
          detail: json?.detail ?? null,
        });
        throw new Error(String(json?.error ?? `http_${response.status}`));
      }
      if (!isCurrentDataRequest(requestId)) return;
      const nextData = normalizeData(json.data);
      const autoOrdersKey = buildAutoOrdersKey(nextData);
      const shouldStartAutoOrders =
        autoOrdersKey != null && nextData?.quota.canRegenerateOrders
          ? beginAutoOrdersRequest(autoOrdersKey, normalizedOrderOptions)
          : false;
      const nextStateRevision = Number.isFinite(Number(json.data?.stateRevision)) ? Number(json.data?.stateRevision) : null;
      syncClientStateRevision(nextStateRevision);
      adoptIncomingData(nextData, { completionVersionAtStart });
      registerLoadedAIRecoverySession({
        accountKey,
        dateISO: args.dateISO,
        slot: args.slot,
        stateRevision: nextStateRevision ?? stateRevision ?? null,
        data: nextData,
      });
      emitClientDataInvalidation([CLIENT_DATA_SCOPE_RECOVERY_SESSION, CLIENT_DATA_SCOPE_HOME_PREVIEW]);
      if (autoOrdersKey && shouldStartAutoOrders) {
        void regenerateOrdersInternal(true, normalizedOrderOptions, autoOrdersKey);
      }
    } catch (nextError) {
      if (autoKey) autoRequestedRef.current.delete(autoKey);
      if (!isCurrentDataRequest(requestId)) return;
      try {
        const recovered = await fetchAIRecoverySessionViewFromApi({
          dateISO: args.dateISO,
          slot: args.slot,
          context: "generate_recover",
        });
        if (!isCurrentDataRequest(requestId)) return;
        const recoveredGeneratedAt = recovered?.session?.generatedAt ?? null;
        if (recovered?.session && (recoveredGeneratedAt !== previousGeneratedAt || previousGeneratedAt != null)) {
          const autoOrdersKey = buildAutoOrdersKey(recovered);
          const shouldStartAutoOrders =
            autoOrdersKey != null && recovered?.quota.canRegenerateOrders
              ? beginAutoOrdersRequest(autoOrdersKey, normalizedOrderOptions)
              : false;
          adoptIncomingData(recovered, { completionVersionAtStart });
          registerLoadedAIRecoverySession({
            accountKey,
            dateISO: args.dateISO,
            slot: args.slot,
            stateRevision: recovered?.stateRevision ?? stateRevision ?? null,
            data: recovered,
          });
          setError(null);
          if (autoOrdersKey && shouldStartAutoOrders) {
            void regenerateOrdersInternal(true, normalizedOrderOptions, autoOrdersKey);
          }
          return;
        }
      } catch {}
      setFriendlyError((nextError as any)?.message ?? nextError ?? "ai_recovery_generate_failed");
    } finally {
      generateInFlightRef.current = false;
      setGenerating(false);
    }
  };
  loadRef.current = load;

  // useCallback으로 안정적인 참조를 유지합니다.
  // refs를 통해 항상 최신 data/slot/dateISO를 읽어 stale closure를 방지합니다.
  const toggleCompletion = useCallback(async (orderId: string, completed: boolean) => {
    const currentData = dataRef.current;
    if (!enabledRef.current || !currentData) return;
    togglingCompletionRef.current = orderId;
    setTogglingCompletion(orderId);
    setError(null);
    const previous = currentData.completions;
    const previousStats = currentData.orderStats;
    const next = completed ? Array.from(new Set([...previous, orderId])) : previous.filter((item) => item !== orderId);
    const changed = previous.includes(orderId) !== next.includes(orderId);
    const delta = changed ? (completed ? 1 : -1) : 0;
    const slot = slotRef.current;
    const optimisticStats =
      delta === 0
        ? previousStats
        : {
            ...previousStats,
            todayWakeCompleted: previousStats.todayWakeCompleted + (slot === "wake" ? delta : 0),
            todayPostShiftCompleted: previousStats.todayPostShiftCompleted + (slot === "postShift" ? delta : 0),
            todayTotalCompleted: previousStats.todayTotalCompleted + delta,
            weekTotalCompleted: previousStats.weekTotalCompleted + delta,
          };
    // 낙관적 업데이트: UI에 즉시 반영
    setData((current) => (current ? { ...current, completions: next, orderStats: optimisticStats } : current));
    try {
      const response = await fetch("/api/insights/recovery/ai/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          dateISO: dateISORef.current,
          orderId,
          completed,
        }),
      });
      const json = await readJson<{
        ok?: boolean;
        error?: string;
        data?: { completions?: string[]; orderStats?: SessionData["orderStats"]; stateRevision?: number | null };
      }>(response);
      if (!response.ok || !json?.ok) {
        throw new Error(String(json?.error ?? `http_${response.status}`));
      }
      const completions = Array.isArray(json?.data?.completions) ? json.data?.completions ?? [] : [];
      const orderStats = json?.data?.orderStats ?? optimisticStats;
      const nextStateRevision = Number.isFinite(Number(json?.data?.stateRevision)) ? Number(json?.data?.stateRevision) : null;
      const latestData = dataRef.current;
      const nextData = latestData ? { ...latestData, completions, orderStats } : latestData;
      committedCompletionVersionRef.current += 1;
      setData(nextData);
      if (nextData) {
        registerLoadedAIRecoverySession({
          accountKey,
          dateISO: dateISORef.current,
          slot,
          stateRevision: nextStateRevision ?? stateRevision ?? null,
          data: nextData,
        });
      } else {
        syncClientStateRevision(nextStateRevision);
      }
      emitClientDataInvalidation([CLIENT_DATA_SCOPE_RECOVERY_SESSION, CLIENT_DATA_SCOPE_HOME_PREVIEW]);
    } catch (nextError) {
      // API 실패 시 낙관적 업데이트 롤백
      setData((current) => (current ? { ...current, completions: previous, orderStats: previousStats } : current));
      setError(getAIRecoveryErrorMessage((nextError as any)?.message ?? nextError ?? "ai_recovery_completion_failed"));
    } finally {
      togglingCompletionRef.current = null;
      setTogglingCompletion(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (initialData && initialData.dateISO === args.dateISO && initialData.slot === args.slot) {
      setData((current) => pickLatestData(current?.dateISO === args.dateISO && current?.slot === args.slot ? current : null, initialData));
      syncClientStateRevision(initialData.stateRevision ?? null);
      setLoading(false);
      setError(null);
      return;
    }
    if (dataRef.current?.dateISO !== args.dateISO || dataRef.current?.slot !== args.slot) {
      setData(null);
      setLoading(true);
      setError(null);
    }
  }, [initialData, args.dateISO, args.slot, pickLatestData]);

  const pendingAutoOrdersKey = useMemo(
    () => buildAutoOrdersKey(data),
    [buildAutoOrdersKey, data]
  );

  useEffect(() => {
    if (!args.enabled) {
      if (autoOrdersRetryTimerRef.current != null) {
        window.clearTimeout(autoOrdersRetryTimerRef.current);
        autoOrdersRetryTimerRef.current = null;
      }
      autoOrdersRetryResolveRef.current?.();
      autoOrdersRetryResolveRef.current = null;
      autoOrdersReloadRef.current = null;
      setPendingAutoOrders(false);
      return;
    }

    let cancelled = false;

    const reloadCompletedAutoOrders = async (activeKey: string) => {
      const startedAt = Date.now();

      while (!cancelled) {
        if (getAutoOrdersRequestStatus(activeKey) !== "completed") {
          return hasSessionOrders(dataRef.current);
        }

        const sharedData = normalizeData(readCurrentAccountSession(accountKey, resourceKey)?.data ?? null);
        if (hasSessionOrders(sharedData)) {
          adoptIncomingData(sharedData);
          return true;
        }

        await loadRef.current({ force: true });

        const latestData = normalizeData(dataRef.current);
        if (hasSessionOrders(latestData)) {
          return true;
        }

        if (Date.now() - startedAt >= AUTO_ORDERS_RELOAD_TIMEOUT_MS) {
          return false;
        }

        await new Promise<void>((resolve) => {
          autoOrdersRetryResolveRef.current = () => {
            autoOrdersRetryResolveRef.current = null;
            autoOrdersRetryTimerRef.current = null;
            resolve();
          };
          autoOrdersRetryTimerRef.current = window.setTimeout(() => {
            autoOrdersRetryResolveRef.current?.();
          }, AUTO_ORDERS_RELOAD_RETRY_MS);
        });
      }

      return false;
    };

    const syncPendingAutoOrders = () => {
      const currentData = dataRef.current;
      const status = pendingAutoOrdersKey ? getAutoOrdersRequestStatus(pendingAutoOrdersKey) : null;
      const shouldKeepWaiting =
        status === "pending" ||
        (
          status === "completed" &&
          hasBriefWithoutOrders(currentData) &&
          !ordersInFlightRef.current
        );

      setPendingAutoOrders(shouldKeepWaiting);

      const shouldReloadCompletedOrders =
        status === "completed" &&
        hasBriefWithoutOrders(currentData) &&
        !ordersInFlightRef.current;

      if (!shouldReloadCompletedOrders || !pendingAutoOrdersKey) {
        return;
      }

      const existingReload = autoOrdersReloadRef.current;
      if (existingReload?.key === pendingAutoOrdersKey) return;

      const promise = reloadCompletedAutoOrders(pendingAutoOrdersKey).finally(() => {
        if (autoOrdersReloadRef.current?.key === pendingAutoOrdersKey) {
          autoOrdersReloadRef.current = null;
        }
        if (cancelled) return;
        const latestData = normalizeData(dataRef.current);
        const latestStatus = getAutoOrdersRequestStatus(pendingAutoOrdersKey);
        const stillWaiting =
          latestStatus === "pending" ||
          (
            latestStatus === "completed" &&
            hasBriefWithoutOrders(latestData) &&
            !ordersInFlightRef.current
          );
        setPendingAutoOrders(stillWaiting);
      });

      autoOrdersReloadRef.current = {
        key: pendingAutoOrdersKey,
        promise,
      };
    };

    syncPendingAutoOrders();
    const unsubscribe = subscribeAutoOrdersRequestChange(syncPendingAutoOrders);
    if (typeof window === "undefined") return unsubscribe;

    const handleStorage = (event: StorageEvent) => {
      if (event.key != null && !event.key.startsWith(AUTO_ORDERS_STORAGE_PREFIX)) return;
      syncPendingAutoOrders();
    };
    window.addEventListener("storage", handleStorage);
    return () => {
      cancelled = true;
      if (autoOrdersRetryTimerRef.current != null) {
        window.clearTimeout(autoOrdersRetryTimerRef.current);
        autoOrdersRetryTimerRef.current = null;
      }
      autoOrdersRetryResolveRef.current?.();
      autoOrdersRetryResolveRef.current = null;
      unsubscribe();
      window.removeEventListener("storage", handleStorage);
    };
  }, [accountKey, adoptIncomingData, args.enabled, normalizeData, pendingAutoOrdersKey, resourceKey]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [args.dateISO, args.slot, args.enabled, accountKey, resourceKey, stateRevision]);

  return {
    data,
    loading,
    generating,
    savingOrders,
    pendingAutoOrders,
    togglingCompletion,
    error,
    reload: load,
    generate: generateInternal,
    regenerateOrders: (orderOptions?: AIRecoveryOrderGenerationOptions) => regenerateOrdersInternal(false, orderOptions),
    toggleCompletion,
  };
}
