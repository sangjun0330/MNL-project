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

function hasTransitionCue(text: string) {
  return /(다음|그다음|이어서|한편|반면|또\b|또는)/.test(text);
}

function isLikelyPatientContinuation(text: string) {
  if (extractAliasFromText(text)) return true;
  return /(오더|투약|검사|혈당|헤모글로빈|항생제|필요시|소변량|통증|호흡|SpO2|흑변|어지럽|확인|콜|모니터|POD|PCA)/i.test(
    text
  );
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
  const ordered = [...segments].sort((a, b) => {
    if (a.startMs !== b.startMs) return a.startMs - b.startMs;
    return a.segmentId.localeCompare(b.segmentId);
  });

  let activeAlias: string | null = null;
  let transitionPending = false;

  ordered.forEach((segment) => {
    const transitionCue = hasTransitionCue(segment.maskedText);
    const aliasFromText = extractAliasFromText(segment.maskedText);
    const segmentAlias = segment.patientAlias ?? aliasFromText;
    const category = classifyWardEvent(segment.maskedText);
    if (category && (!segmentAlias || isWardLevelContext(segment.maskedText))) {
      wardEvents.push({
        id: `ward-${segment.segmentId}`,
        category,
        text: segment.maskedText,
        evidenceRef: segment.evidenceRef,
      });
      transitionPending = transitionCue;
      return;
    }

    if (segmentAlias) {
      if (!patientSegments[segmentAlias]) {
        patientSegments[segmentAlias] = [];
      }
      patientSegments[segmentAlias].push({
        ...segment,
        patientAlias: segmentAlias,
      });
      activeAlias = segmentAlias;
      transitionPending = transitionCue;
      return;
    }

    if (!transitionPending && !transitionCue && activeAlias && isLikelyPatientContinuation(segment.maskedText)) {
      if (!patientSegments[activeAlias]) {
        patientSegments[activeAlias] = [];
      }
      patientSegments[activeAlias].push({
        ...segment,
        patientAlias: activeAlias,
      });
      transitionPending = transitionCue;
      return;
    }

    unmatchedSegments.push(segment);
    transitionPending = transitionCue;
  });

  return { wardEvents, patientSegments, unmatchedSegments };
}
