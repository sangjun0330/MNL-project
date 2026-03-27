"use client";

import { useSyncExternalStore } from "react";
import type { AIRecoverySessionResponse } from "@/lib/aiRecovery";
import type { AIRecoveryPayload } from "@/lib/aiRecoveryContract";
import type { AIRecoveryPlannerPayload } from "@/lib/aiRecoveryPlanner";
import type { BootstrapPayload, RecoverySummary } from "@/lib/accountBootstrap";
import { todayISO } from "@/lib/date";

type SessionData = AIRecoverySessionResponse["data"];

type ResourceEntry<T> = {
  data: T | null;
  revision: number | null;
};

type CurrentAccountResources = {
  accountKey: string | null;
  bootstrap: BootstrapPayload | null;
  recoverySummary: RecoverySummary | null;
  sessions: Record<string, ResourceEntry<SessionData>>;
  planners: Record<string, ResourceEntry<AIRecoveryPlannerPayload>>;
  insights: Record<string, ResourceEntry<AIRecoveryPayload>>;
};

const listeners = new Set<() => void>();

function emptySnapshot(accountKey: string | null): CurrentAccountResources {
  return {
    accountKey,
    bootstrap: null,
    recoverySummary: null,
    sessions: {},
    planners: {},
    insights: {},
  };
}

let snapshot: CurrentAccountResources = emptySnapshot(null);

function emit() {
  for (const listener of listeners) listener();
}

function ensureAccount(accountKey: string | null) {
  if (snapshot.accountKey === accountKey) return;
  snapshot = emptySnapshot(accountKey);
  emit();
}

function isRenderableSession(data: SessionData | null | undefined): data is SessionData {
  return Boolean(
    data?.session?.brief &&
      data.session.status === "ready" &&
      !data.session.openaiMeta?.fallbackReason
  );
}

function selectLatestSession(entries: SessionData[]) {
  return [...entries].sort((a, b) => {
    const aTs = Date.parse(a.session?.generatedAt ?? "") || 0;
    const bTs = Date.parse(b.session?.generatedAt ?? "") || 0;
    return bTs - aTs;
  })[0] ?? null;
}

function arraysEqual(a: string[] | null | undefined, b: string[] | null | undefined) {
  const left = a ?? [];
  const right = b ?? [];
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function sameTodaySlots(a: SessionData["todaySlots"] | null | undefined, b: SessionData["todaySlots"] | null | undefined) {
  return (
    (a?.wakeReady ?? false) === (b?.wakeReady ?? false) &&
    (a?.postShiftReady ?? false) === (b?.postShiftReady ?? false) &&
    (a?.allReady ?? false) === (b?.allReady ?? false)
  );
}

function sameOrderStats(a: SessionData["orderStats"] | null | undefined, b: SessionData["orderStats"] | null | undefined) {
  return (
    (a?.todayWakeCompleted ?? 0) === (b?.todayWakeCompleted ?? 0) &&
    (a?.todayPostShiftCompleted ?? 0) === (b?.todayPostShiftCompleted ?? 0) &&
    (a?.todayTotalCompleted ?? 0) === (b?.todayTotalCompleted ?? 0) &&
    (a?.weekTotalCompleted ?? 0) === (b?.weekTotalCompleted ?? 0)
  );
}

function sameQuota(a: SessionData["quota"] | null | undefined, b: SessionData["quota"] | null | undefined) {
  return (
    (a?.canGenerateSession ?? false) === (b?.canGenerateSession ?? false) &&
    (a?.canRegenerateOrders ?? false) === (b?.canRegenerateOrders ?? false)
  );
}

function sameSessionPayload(a: SessionData["session"] | null | undefined, b: SessionData["session"] | null | undefined) {
  if (a === b) return true;
  if (!a || !b) return a === b;
  return (
    (a.generatedAt ?? null) === (b.generatedAt ?? null) &&
    a.status === b.status &&
    (a.inputSignature ?? null) === (b.inputSignature ?? null) &&
    (a.promptVersion ?? null) === (b.promptVersion ?? null) &&
    (a.language ?? null) === (b.language ?? null) &&
    (a.openaiMeta?.briefResponseId ?? null) === (b.openaiMeta?.briefResponseId ?? null) &&
    (a.openaiMeta?.ordersResponseId ?? null) === (b.openaiMeta?.ordersResponseId ?? null) &&
    (a.openaiMeta?.fallbackReason ?? null) === (b.openaiMeta?.fallbackReason ?? null) &&
    arraysEqual(
      a.orders?.items.map((item) => item.id) ?? [],
      b.orders?.items.map((item) => item.id) ?? []
    )
  );
}

function sameSessionData(a: SessionData | null | undefined, b: SessionData | null | undefined) {
  if (a === b) return true;
  if (!a || !b) return a === b;
  return (
    a.dateISO === b.dateISO &&
    a.slot === b.slot &&
    a.slotLabel === b.slotLabel &&
    a.slotDescription === b.slotDescription &&
    a.language === b.language &&
    a.stale === b.stale &&
    a.showGenerationControls === b.showGenerationControls &&
    a.hasAIEntitlement === b.hasAIEntitlement &&
    a.model === b.model &&
    a.tier === b.tier &&
    a.stateRevision === b.stateRevision &&
    a.gate.allowed === b.gate.allowed &&
    a.gate.code === b.gate.code &&
    a.gate.message === b.gate.message &&
    sameTodaySlots(a.todaySlots, b.todaySlots) &&
    sameOrderStats(a.orderStats, b.orderStats) &&
    sameQuota(a.quota, b.quota) &&
    arraysEqual(a.completions, b.completions) &&
    sameSessionPayload(a.session, b.session)
  );
}

function buildSummaryFromSessions(base: RecoverySummary | null, sessions: Record<string, ResourceEntry<SessionData>>) {
  const today = todayISO();
  const wake = sessions[`${today}:wake`]?.data ?? null;
  const postShift = sessions[`${today}:postShift`]?.data ?? null;
  const validSessions = [wake, postShift].filter(isRenderableSession);

  if (!validSessions.length) {
    if (!base || base.dateISO !== today) return base;
    return {
      ...base,
      todaySlots:
        wake?.todaySlots ??
        postShift?.todaySlots ??
        base.todaySlots,
    };
  }

  const latest = selectLatestSession(validSessions);
  const latestWithOrders =
    selectLatestSession(
      validSessions.filter((item) => (item.session?.orders?.items.length ?? 0) > 0)
    ) ?? latest;
  const completed = new Set(latestWithOrders?.completions ?? []);
  const pendingOrder =
    latestWithOrders?.session?.orders?.items.find((item) => !completed.has(item.id)) ?? null;

  return {
    dateISO: today,
    headline: latest?.session?.brief?.headline?.trim() || null,
    latestSlot: latest?.slot ?? null,
    pendingOrderTitle: pendingOrder?.body?.trim() || pendingOrder?.title?.trim() || null,
    ordersCompleted:
      Boolean(latestWithOrders?.session?.orders?.items.length) && !pendingOrder,
    hasAnySession: true,
    todaySlots:
      latest?.todaySlots ??
      latestWithOrders?.todaySlots ??
      base?.todaySlots ?? {
        wakeReady: false,
        postShiftReady: false,
        allReady: false,
      },
  };
}

function updateSnapshot(next: CurrentAccountResources) {
  snapshot = next;
  emit();
}

export function beginCurrentAccountSession(accountKey: string | null) {
  ensureAccount(accountKey);
}

export function resetCurrentAccountResources(accountKey: string | null = null) {
  snapshot = emptySnapshot(accountKey);
  emit();
}

export function getCurrentAccountResources() {
  return snapshot;
}

export function setCurrentAccountBootstrap(accountKey: string, bootstrap: BootstrapPayload | null) {
  ensureAccount(accountKey);
  const nextBootstrap = bootstrap;
  const nextRecoverySummary = bootstrap?.recoverySummary ?? null;
  updateSnapshot({
    ...snapshot,
    bootstrap: nextBootstrap,
    recoverySummary: nextRecoverySummary,
  });
}

export function readCurrentAccountSession(accountKey: string | null, key: string) {
  if (!accountKey || snapshot.accountKey !== accountKey) return null;
  return snapshot.sessions[key] ?? null;
}

export function storeCurrentAccountSession(accountKey: string, key: string, data: SessionData | null, revision: number | null) {
  ensureAccount(accountKey);
  const current = snapshot.sessions[key] ?? null;
  if (current && current.revision === revision && sameSessionData(current.data, data)) {
    return;
  }
  const sessions = {
    ...snapshot.sessions,
    [key]: { data, revision },
  };
  const recoverySummary = buildSummaryFromSessions(snapshot.recoverySummary, sessions);
  updateSnapshot({
    ...snapshot,
    sessions,
    recoverySummary,
    bootstrap: snapshot.bootstrap
      ? {
          ...snapshot.bootstrap,
          recoverySummary,
        }
      : snapshot.bootstrap,
  });
}

export function readCurrentAccountPlanner(accountKey: string | null, key: string) {
  if (!accountKey || snapshot.accountKey !== accountKey) return null;
  return snapshot.planners[key] ?? null;
}

export function storeCurrentAccountPlanner(
  accountKey: string,
  key: string,
  data: AIRecoveryPlannerPayload | null,
  revision: number | null
) {
  ensureAccount(accountKey);
  updateSnapshot({
    ...snapshot,
    planners: {
      ...snapshot.planners,
      [key]: { data, revision },
    },
  });
}

export function readCurrentAccountInsights(accountKey: string | null, key: string) {
  if (!accountKey || snapshot.accountKey !== accountKey) return null;
  return snapshot.insights[key] ?? null;
}

export function storeCurrentAccountInsights(accountKey: string, key: string, data: AIRecoveryPayload | null, revision: number | null) {
  ensureAccount(accountKey);
  updateSnapshot({
    ...snapshot,
    insights: {
      ...snapshot.insights,
      [key]: { data, revision },
    },
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useCurrentAccountResources() {
  return useSyncExternalStore(subscribe, getCurrentAccountResources, getCurrentAccountResources);
}
