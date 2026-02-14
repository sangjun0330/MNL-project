import { hasPatientTransitionCue, isLikelyClinicalContinuation } from "./clinicalNlu";
import type { MaskedSegment, WardEvent, WardEventCategory } from "./types";

const WARD_RULES: Array<{ category: WardEventCategory; patterns: RegExp[] }> = [
  { category: "discharge", patterns: [/퇴원/, /discharge/i] },
  { category: "admission", patterns: [/입원/, /admission/i, /신규\s*입원/] },
  { category: "round", patterns: [/회진/, /round/i] },
  { category: "equipment", patterns: [/장비/, /기계/, /모니터/, /폴리/, /foley/i] },
  { category: "complaint", patterns: [/민원/, /클레임/, /불만/] },
];

function classifyWardEvent(text: string): WardEventCategory | null {
  for (const rule of WARD_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(text))) return rule.category;
  }
  return null;
}

function isWardLevelContext(text: string) {
  return /(\d+\s*명|가능|예정|내일|금일|병동|신규)/.test(text);
}

function extractAliasFromText(text: string) {
  const hit = text.match(/환자[A-Z]{1,2}/);
  return hit ? hit[0] : null;
}

function assignToPatientBucket(store: Record<string, MaskedSegment[]>, alias: string, segment: MaskedSegment) {
  if (!store[alias]) store[alias] = [];
  store[alias].push({
    ...segment,
    patientAlias: alias,
  });
}

export type SplitOutput = {
  wardEvents: WardEvent[];
  patientSegments: Record<string, MaskedSegment[]>;
  unmatchedSegments: MaskedSegment[];
};

export function splitSegmentsByPatient(segments: MaskedSegment[]): SplitOutput {
  const wardEvents: WardEvent[] = [];
  const patientSegments: Record<string, MaskedSegment[]> = {};
  const unmatchedSegments: MaskedSegment[] = [];
  const wardSegmentIds = new Set<string>();
  const ordered = [...segments].sort((a, b) => {
    if (a.startMs !== b.startMs) return a.startMs - b.startMs;
    return a.segmentId.localeCompare(b.segmentId);
  });

  const timeline: Array<{ segment: MaskedSegment; alias: string | null }> = [];

  let activeAlias: string | null = null;
  let transitionPending = false;

  ordered.forEach((segment) => {
    const transitionCue = hasPatientTransitionCue(segment.maskedText);
    const aliasFromText = extractAliasFromText(segment.maskedText);
    const segmentAlias = segment.patientAlias ?? aliasFromText;
    const category = classifyWardEvent(segment.maskedText);
    const continuationLike = isLikelyClinicalContinuation(segment.maskedText);
    const wardCandidate =
      category != null &&
      (segmentAlias
        ? isWardLevelContext(segment.maskedText)
        : isWardLevelContext(segment.maskedText) || (!activeAlias && !continuationLike));
    if (category && wardCandidate) {
      wardEvents.push({
        id: `ward-${segment.segmentId}`,
        category,
        text: segment.maskedText,
        evidenceRef: segment.evidenceRef,
      });
      wardSegmentIds.add(segment.segmentId);
      timeline.push({ segment, alias: null });
      transitionPending = transitionCue;
      return;
    }

    if (segmentAlias) {
      assignToPatientBucket(patientSegments, segmentAlias, segment);
      timeline.push({ segment, alias: segmentAlias });
      activeAlias = segmentAlias;
      transitionPending = transitionCue;
      return;
    }

    if (!transitionPending && !transitionCue && activeAlias && isLikelyClinicalContinuation(segment.maskedText)) {
      assignToPatientBucket(patientSegments, activeAlias, segment);
      timeline.push({ segment, alias: activeAlias });
      transitionPending = transitionCue;
      return;
    }

    unmatchedSegments.push(segment);
    timeline.push({ segment, alias: null });
    transitionPending = transitionCue;
  });

  const unmatchedIds = new Set(unmatchedSegments.map((segment) => segment.segmentId));
  const adoptedIds = new Set<string>();

  timeline.forEach((entry, index) => {
    if (entry.alias || wardSegmentIds.has(entry.segment.segmentId)) return;
    if (!unmatchedIds.has(entry.segment.segmentId)) return;
    if (hasPatientTransitionCue(entry.segment.maskedText)) return;
    if (!isLikelyClinicalContinuation(entry.segment.maskedText)) return;

    let previousAlias: string | null = null;
    for (let i = index - 1; i >= 0; i -= 1) {
      if (!timeline[i].alias) continue;
      previousAlias = timeline[i].alias;
      break;
    }

    let nextAlias: string | null = null;
    for (let i = index + 1; i < timeline.length; i += 1) {
      if (!timeline[i].alias) continue;
      nextAlias = timeline[i].alias;
      break;
    }

    if (previousAlias && nextAlias && previousAlias === nextAlias) {
      assignToPatientBucket(patientSegments, previousAlias, entry.segment);
      adoptedIds.add(entry.segment.segmentId);
      return;
    }

    if (previousAlias && !nextAlias) {
      assignToPatientBucket(patientSegments, previousAlias, entry.segment);
      adoptedIds.add(entry.segment.segmentId);
    }
  });

  const finalUnmatched = unmatchedSegments.filter((segment) => !adoptedIds.has(segment.segmentId));

  return { wardEvents, patientSegments, unmatchedSegments: finalUnmatched };
}
