import { defaultSettings } from "@/lib/model";

const TRACKED_DOMAINS = ["schedule", "shiftNames", "notes", "emotions", "bio"] as const;

type TrackedDomain = (typeof TRACKED_DOMAINS)[number];

export type AppStateIntegritySummary = Record<TrackedDomain, number> & {
  protectedEntries: number;
  totalTrackedEntries: number;
  hasMeaningfulSettings: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function countRecordKeys(value: unknown): number {
  return Object.keys(asRecord(value)).length;
}

function hasMeaningfulSettings(rawState: unknown) {
  const state = asRecord(rawState);
  if (!isRecord(state.settings)) return false;
  return JSON.stringify(state.settings) !== JSON.stringify(defaultSettings());
}

export function summarizeAppState(rawState: unknown): AppStateIntegritySummary {
  const state = asRecord(rawState);
  const schedule = countRecordKeys(state.schedule);
  const shiftNames = countRecordKeys(state.shiftNames);
  const notes = countRecordKeys(state.notes);
  const emotions = countRecordKeys(state.emotions);
  const bio = countRecordKeys(state.bio);
  const protectedEntries = shiftNames + notes + emotions + bio;
  return {
    schedule,
    shiftNames,
    notes,
    emotions,
    bio,
    protectedEntries,
    totalTrackedEntries: schedule + protectedEntries,
    hasMeaningfulSettings: hasMeaningfulSettings(state),
  };
}

export function hasMeaningfulTrackedAppState(rawState: unknown): boolean {
  const summary = summarizeAppState(rawState);
  return summary.totalTrackedEntries > 0 || summary.hasMeaningfulSettings;
}

export function isStateMeaningfullyRicher(candidate: unknown, baseline: unknown): boolean {
  const next = summarizeAppState(candidate);
  const current = summarizeAppState(baseline);

  if (!hasMeaningfulTrackedAppState(candidate)) return false;
  if (!hasMeaningfulTrackedAppState(baseline)) return true;

  if (next.protectedEntries > current.protectedEntries && next.protectedEntries - current.protectedEntries >= 2) {
    return true;
  }

  if (
    next.protectedEntries >= 8 &&
    next.protectedEntries > current.protectedEntries &&
    next.protectedEntries >= current.protectedEntries * 2
  ) {
    return true;
  }

  if (next.totalTrackedEntries >= current.totalTrackedEntries + 10 && next.protectedEntries >= current.protectedEntries) {
    return true;
  }

  return false;
}

export function shouldPreferCandidateState(
  candidate: unknown,
  baseline: unknown,
  options?: {
    candidateUpdatedAt?: number | null;
    baselineUpdatedAt?: number | null;
  }
): boolean {
  const candidateSummary = summarizeAppState(candidate);
  const baselineSummary = summarizeAppState(baseline);

  if (!(candidateSummary.totalTrackedEntries > 0 || candidateSummary.hasMeaningfulSettings)) return false;
  if (!(baselineSummary.totalTrackedEntries > 0 || baselineSummary.hasMeaningfulSettings)) return true;

  const candidateUpdatedAt =
    typeof options?.candidateUpdatedAt === "number" && Number.isFinite(options.candidateUpdatedAt)
      ? options.candidateUpdatedAt
      : null;
  const baselineUpdatedAt =
    typeof options?.baselineUpdatedAt === "number" && Number.isFinite(options.baselineUpdatedAt)
      ? options.baselineUpdatedAt
      : null;

  if (candidateUpdatedAt != null && baselineUpdatedAt != null && candidateUpdatedAt > baselineUpdatedAt) {
    const protectedSafe =
      candidateSummary.protectedEntries >= baselineSummary.protectedEntries || baselineSummary.protectedEntries === 0;
    const totalSafe = candidateSummary.totalTrackedEntries + 2 >= baselineSummary.totalTrackedEntries;
    if (protectedSafe && totalSafe) {
      return true;
    }
  }

  return isStateMeaningfullyRicher(candidate, baseline);
}

export function compareDraftCandidates(
  a: { updatedAt: number; state: unknown },
  b: { updatedAt: number; state: unknown }
): number {
  const left = summarizeAppState(a.state);
  const right = summarizeAppState(b.state);

  if (left.protectedEntries !== right.protectedEntries) {
    return right.protectedEntries - left.protectedEntries;
  }

  if (left.totalTrackedEntries !== right.totalTrackedEntries) {
    return right.totalTrackedEntries - left.totalTrackedEntries;
  }

  if (left.hasMeaningfulSettings !== right.hasMeaningfulSettings) {
    return right.hasMeaningfulSettings ? 1 : -1;
  }

  return b.updatedAt - a.updatedAt;
}
