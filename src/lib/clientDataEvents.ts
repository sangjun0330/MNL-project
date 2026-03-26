"use client";

import { useMemo, useSyncExternalStore } from "react";

export const CLIENT_DATA_SCOPE_APP_STATE = "app-state";
export const CLIENT_DATA_SCOPE_RECOVERY_SESSION = "recovery-session";
export const CLIENT_DATA_SCOPE_RECOVERY_PLANNER = "recovery-planner";
export const CLIENT_DATA_SCOPE_HOME_PREVIEW = "home-preview";

const revisions = new Map<string, number>();
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

function normalizeScopes(scopes: string | string[]) {
  return Array.from(new Set(Array.isArray(scopes) ? scopes : [scopes])).filter(Boolean);
}

export function emitClientDataInvalidation(scopes: string | string[]) {
  const normalized = normalizeScopes(scopes);
  if (!normalized.length) return;
  for (const scope of normalized) {
    revisions.set(scope, (revisions.get(scope) ?? 0) + 1);
  }
  notify();
}

export function getClientDataRevision(scope: string) {
  return revisions.get(scope) ?? 0;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useClientDataRevision(scopes: string | string[]) {
  const normalizedScopes = useMemo(() => normalizeScopes(scopes), [scopes]);

  return useSyncExternalStore(
    subscribe,
    () => normalizedScopes.map((scope) => `${scope}:${getClientDataRevision(scope)}`).join("|"),
    () => ""
  );
}
