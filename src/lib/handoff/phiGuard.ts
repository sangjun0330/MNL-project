import {
  extractPatientAnchors,
  hasPatientTransitionCue,
  isLikelyClinicalContinuation,
  normalizeRoomMentions,
} from "./clinicalNlu";
import type { MaskedSegment, NormalizedSegment } from "./types";

const PHONE_PATTERN = /(01[0-9]-?\d{3,4}-?\d{4})/g;
const RRN_PATTERN = /(\d{6}-?[1-4]\d{6})/g;
const CHART_PATTERN = /(차트번호|등록번호|MRN)\s*[:#]?\s*\d{6,}/gi;
const ADDRESS_PATTERN = /([가-힣0-9\-\s]{2,}(?:동|로|길)\s*\d{1,4}(?:-\d{1,4})?)/g;

type PatientProfile = {
  alias: string;
  rooms: Set<string>;
  names: Set<string>;
  maskedNames: Set<string>;
  mentions: number;
  lastSeenMs: number;
};

type CandidateScore = {
  alias: string;
  score: number;
  roomOverlap: number;
  nameOverlap: number;
  maskedOverlap: number;
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceLiteralAll(text: string, needle: string, replacement: string) {
  return text.replace(new RegExp(escapeRegExp(needle), "g"), replacement);
}

function collectPatternTokens(text: string, pattern: RegExp) {
  const matches = [...text.matchAll(pattern)];
  return matches
    .map((match) => (match[1] ?? match[0] ?? "").trim())
    .filter((token) => token.length > 0);
}

function buildAlias(aliasIndex: number) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if (aliasIndex < alphabet.length) return `환자${alphabet[aliasIndex]}`;
  const head = Math.floor(aliasIndex / alphabet.length);
  const tail = aliasIndex % alphabet.length;
  return `환자${alphabet[head - 1]}${alphabet[tail]}`;
}

function countOverlap(source: Set<string>, target: string[]) {
  let count = 0;
  target.forEach((value) => {
    if (source.has(value)) count += 1;
  });
  return count;
}

function sortTokensForMasking(tokens: string[]) {
  return [...tokens].sort((a, b) => b.length - a.length || a.localeCompare(b, "ko"));
}

function createProfile(alias: string, nowMs: number): PatientProfile {
  return {
    alias,
    rooms: new Set<string>(),
    names: new Set<string>(),
    maskedNames: new Set<string>(),
    mentions: 0,
    lastSeenMs: nowMs,
  };
}

function scoreProfile(profile: PatientProfile, anchors: ReturnType<typeof extractPatientAnchors>, activeAlias: string | null) {
  const roomOverlap = countOverlap(profile.rooms, anchors.roomTokens);
  const nameOverlap = countOverlap(profile.names, anchors.nameTokens);
  const maskedOverlap = countOverlap(profile.maskedNames, anchors.maskedNameTokens);

  let score = roomOverlap * 10 + nameOverlap * 6 + maskedOverlap * 4;

  if (activeAlias && profile.alias === activeAlias) score += 1;
  if (anchors.roomTokens.length && roomOverlap === 0 && profile.rooms.size > 0) score -= 4;
  if (anchors.nameTokens.length && nameOverlap === 0 && roomOverlap === 0 && profile.names.size > 0) score -= 2;

  return {
    alias: profile.alias,
    score,
    roomOverlap,
    nameOverlap,
    maskedOverlap,
  } satisfies CandidateScore;
}

function pickAliasByScores(scores: CandidateScore[], activeAlias: string | null, hasRoomAnchor: boolean) {
  if (!scores.length) return null;

  const sorted = [...scores].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.roomOverlap !== a.roomOverlap) return b.roomOverlap - a.roomOverlap;
    if (b.nameOverlap !== a.nameOverlap) return b.nameOverlap - a.nameOverlap;
    if (b.maskedOverlap !== a.maskedOverlap) return b.maskedOverlap - a.maskedOverlap;
    return a.alias.localeCompare(b.alias, "ko");
  });

  const best = sorted[0];
  if (best.score <= 0) return null;

  if (sorted.length === 1) return best.alias;

  const second = sorted[1];
  if (best.score >= second.score + 3) return best.alias;

  if (hasRoomAnchor) {
    const roomMatched = sorted.filter((item) => item.roomOverlap > 0);
    if (roomMatched.length === 1) return roomMatched[0].alias;
    if (roomMatched.length > 1 && roomMatched[0].score >= roomMatched[1].score + 2) return roomMatched[0].alias;
  }

  if (activeAlias) {
    const active = sorted.find((item) => item.alias === activeAlias);
    if (active && active.score >= best.score - 1) return active.alias;
  }

  return null;
}

export function applyPhiGuard(segments: NormalizedSegment[]) {
  const profiles = new Map<string, PatientProfile>();
  const tokenOwners = new Map<string, Set<string>>();
  const maskedSegments: MaskedSegment[] = [];

  let activeAlias: string | null = null;
  let transitionPending = false;
  let aliasSeq = 0;

  const ensureProfile = (alias: string, nowMs: number) => {
    const existing = profiles.get(alias);
    if (existing) return existing;

    const created = createProfile(alias, nowMs);
    profiles.set(alias, created);
    return created;
  };

  const registerOwnership = (token: string, alias: string) => {
    if (!token) return;
    const owners = tokenOwners.get(token) ?? new Set<string>();
    owners.add(alias);
    tokenOwners.set(token, owners);
  };

  const resolveAlias = (
    anchors: ReturnType<typeof extractPatientAnchors>,
    sourceText: string,
    nowMs: number
  ): string | null => {
    if (anchors.hasStrongAnchor) {
      const scores = [...profiles.values()]
        .map((profile) => scoreProfile(profile, anchors, activeAlias))
        .filter((item) => item.score > 0);

      if (anchors.roomTokens.length > 0) {
        const roomMatchedScores = scores.filter((item) => item.roomOverlap > 0);
        if (!roomMatchedScores.length) {
          const alias = buildAlias(aliasSeq);
          aliasSeq += 1;
          ensureProfile(alias, nowMs);
          return alias;
        }
      }

      const selected = pickAliasByScores(scores, activeAlias, anchors.roomTokens.length > 0);
      if (selected) return selected;

      if (anchors.roomTokens.length > 0 || anchors.nameTokens.length > 0 || anchors.maskedNameTokens.length > 0) {
        const alias = buildAlias(aliasSeq);
        aliasSeq += 1;
        ensureProfile(alias, nowMs);
        return alias;
      }
    }

    if (!anchors.hasStrongAnchor && !transitionPending && activeAlias && isLikelyClinicalContinuation(sourceText)) {
      return activeAlias;
    }

    return null;
  };

  segments.forEach((segment) => {
    const sourceText = normalizeRoomMentions(segment.normalizedText);
    const anchors = extractPatientAnchors(sourceText);
    const transitionCue = hasPatientTransitionCue(sourceText);

    const patientAlias = resolveAlias(anchors, sourceText, segment.endMs);
    let maskedText = sourceText;
    const phiHits: string[] = [];

    if (patientAlias) {
      const profile = ensureProfile(patientAlias, segment.endMs);
      anchors.roomTokens.forEach((token) => {
        profile.rooms.add(token);
        registerOwnership(token, patientAlias);
      });
      anchors.nameTokens.forEach((token) => {
        profile.names.add(token);
        registerOwnership(token, patientAlias);
      });
      anchors.maskedNameTokens.forEach((token) => {
        profile.maskedNames.add(token);
        registerOwnership(token, patientAlias);
      });
      profile.mentions += 1;
      profile.lastSeenMs = segment.endMs;

      const replacementTokens = sortTokensForMasking([
        ...anchors.roomTokens,
        ...anchors.nameTokens,
        ...anchors.maskedNameTokens,
      ]);

      replacementTokens.forEach((token) => {
        if (!token || !maskedText.includes(token)) return;
        phiHits.push(token);
        maskedText = replaceLiteralAll(maskedText, token, patientAlias);
      });

      if (transitionCue && !anchors.hasStrongAnchor) {
        activeAlias = null;
      } else {
        activeAlias = patientAlias;
      }
    } else {
      activeAlias = transitionCue ? null : activeAlias;
    }

    [PHONE_PATTERN, RRN_PATTERN, ADDRESS_PATTERN].forEach((pattern) => {
      const hits = collectPatternTokens(maskedText, pattern);
      if (hits.length) {
        hits.forEach((token) => {
          phiHits.push(token);
          maskedText = replaceLiteralAll(maskedText, token, "[REDACTED]");
        });
      }
    });

    const chartHits = maskedText.match(CHART_PATTERN);
    if (chartHits?.length) {
      phiHits.push(...chartHits.map(() => "차트번호"));
      maskedText = maskedText.replace(CHART_PATTERN, "[REDACTED]");
    }

    transitionPending = transitionCue;

    maskedSegments.push({
      segmentId: segment.segmentId,
      maskedText,
      startMs: segment.startMs,
      endMs: segment.endMs,
      uncertainties: segment.uncertainties,
      patientAlias,
      phiHits,
      evidenceRef: {
        segmentId: segment.segmentId,
        startMs: segment.startMs,
        endMs: segment.endMs,
      },
    });
  });

  const aliasMap: Record<string, string> = {};
  tokenOwners.forEach((owners, token) => {
    if (owners.size !== 1) return;
    const [alias] = [...owners];
    aliasMap[token] = alias;
  });

  return {
    segments: maskedSegments,
    aliasMap,
  };
}
