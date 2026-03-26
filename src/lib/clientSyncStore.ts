"use client";

import { useSyncExternalStore } from "react";

export type ClientSyncSnapshot = {
  stateRevision: number | null;
  bootstrapRevision: number | null;
  lastRealtimeAt: number | null;
  subscriptionHealthy: boolean;
};

const listeners = new Set<() => void>();

let snapshot: ClientSyncSnapshot = {
  stateRevision: null,
  bootstrapRevision: null,
  lastRealtimeAt: null,
  subscriptionHealthy: false,
};

function emit() {
  for (const listener of listeners) listener();
}

function nextSnapshot(patch: Partial<ClientSyncSnapshot>) {
  const next: ClientSyncSnapshot = {
    ...snapshot,
    ...patch,
  };
  if (
    next.stateRevision === snapshot.stateRevision &&
    next.bootstrapRevision === snapshot.bootstrapRevision &&
    next.lastRealtimeAt === snapshot.lastRealtimeAt &&
    next.subscriptionHealthy === snapshot.subscriptionHealthy
  ) {
    return snapshot;
  }
  snapshot = next;
  emit();
  return snapshot;
}

function mergeRevision(current: number | null, next: number | null | undefined) {
  if (next === undefined) return current;
  if (next == null) return current;
  if (current == null) return next;
  return Math.max(current, next);
}

export function getClientSyncSnapshot() {
  return snapshot;
}

export function updateClientSyncSnapshot(patch: Partial<ClientSyncSnapshot>) {
  return nextSnapshot({
    ...patch,
    stateRevision: mergeRevision(snapshot.stateRevision, patch.stateRevision),
    bootstrapRevision: mergeRevision(snapshot.bootstrapRevision, patch.bootstrapRevision),
  });
}

export function resetClientSyncSnapshot() {
  snapshot = {
    stateRevision: null,
    bootstrapRevision: null,
    lastRealtimeAt: null,
    subscriptionHealthy: false,
  };
  emit();
}

export function markClientRealtimeHealthy() {
  return nextSnapshot({
    subscriptionHealthy: true,
  });
}

export function markClientRealtimeUnhealthy() {
  return nextSnapshot({
    subscriptionHealthy: false,
  });
}

export function markClientRealtimeEvent(at = Date.now()) {
  return nextSnapshot({
    lastRealtimeAt: at,
    subscriptionHealthy: true,
  });
}

export function shouldIgnoreStateRealtimeRevision(revision: number | null | undefined) {
  return revision != null && snapshot.stateRevision != null && revision <= snapshot.stateRevision;
}

export function shouldIgnoreBootstrapRealtimeRevision(revision: number | null | undefined) {
  return revision != null && snapshot.bootstrapRevision != null && revision <= snapshot.bootstrapRevision;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useClientSyncSnapshot() {
  return useSyncExternalStore(subscribe, getClientSyncSnapshot, getClientSyncSnapshot);
}
