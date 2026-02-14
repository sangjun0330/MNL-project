import {
  detectUnknownClinicalAbbreviations,
  normalizeClinicalNarrative,
} from "./clinicalNlu";
import type { NormalizedSegment, RawSegment, SegmentUncertainty } from "./types";

const ABBREVIATION_RULES: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\bV\/?S\b/gi, replacement: "활력징후" },
  { pattern: /\bBST\b/gi, replacement: "혈당" },
  { pattern: /\bSpO2?\b/gi, replacement: "산소포화도" },
  { pattern: /\bBP\b/gi, replacement: "혈압" },
  { pattern: /\bHR\b/gi, replacement: "맥박" },
  { pattern: /\bRR\b/gi, replacement: "호흡수" },
  { pattern: /\bPCA\b/gi, replacement: "통증자가조절기" },
  { pattern: /\bABx\b/gi, replacement: "항생제" },
  { pattern: /\bPRN\b/gi, replacement: "필요시" },
  { pattern: /\bU\/?O\b/gi, replacement: "소변량" },
  { pattern: /\bNPO\b/gi, replacement: "금식" },
  { pattern: /\bIV\b/gi, replacement: "정맥" },
  { pattern: /\bPO\b/gi, replacement: "경구" },
  { pattern: /\bRA\b/gi, replacement: "실온공기" },
  { pattern: /\bHb\b/gi, replacement: "헤모글로빈" },
  { pattern: /\bI\/?O\b/gi, replacement: "수분출납" },
  { pattern: /\bLabs?\b/gi, replacement: "검사" },
  { pattern: /\bCBC\b/gi, replacement: "혈액검사" },
  { pattern: /\bCRP\b/gi, replacement: "염증수치" },
  { pattern: /\bNRS\b/gi, replacement: "통증척도" },
];

const TIME_PATTERN =
  /(\d{1,2}\s*시(?:\s*\d{1,2}\s*분)?|\d{1,2}:\d{2}|새벽\s*\d{0,2}\s*시?|오전|오후|저녁|밤|금일|오늘|내일|익일|매\s*\d+\s*시간|q\d+h)/i;
const VALUE_PATTERN = /(\d+(?:\.\d+)?(?:\s*(?:mg|ml|l|mmhg|bpm|%|회|명|시간|h|도|점|l))?)/i;
const TASK_HINT_PATTERN = /(투약|검사|오더|재측정|재검|체크|확인|콜|처치|드레싱|추적|보고|재평가|follow\s*up)/i;
const TASK_PENDING_HINT_PATTERN = /(필요|예정|다시|마다|전|후|내일|익일|오전|오후|밤|새벽|즉시|지금)/;
const TASK_COMPLETED_HINT_PATTERN = /(완료|종료|시행됨|시행|진행됨|들어갔|투약됨|투약했고|처치함|했다|했음)/;
const ROUTINE_OBSERVATION_PATTERN = /(모니터링|관찰|유지)\s*(필요|중|부탁)?/;
const LAB_PENDING_PATTERN = /(결과\s*확인\s*필요|검사\s*나갔|검사\s*대기|pending)/i;
const VALUE_TOPIC_PATTERN = /(혈당|헤모글로빈|체온|소변량|활력징후|혈압|맥박|호흡수|산소포화도|검사수치|수분출납|산소|염증수치|혈액검사)/i;
const VALUE_PRESENT_PATTERN = /((혈당|헤모글로빈|체온|소변량|활력징후|혈압|맥박|호흡수|산소포화도|산소)[^.!?\n]{0,14}\d+(?:\.\d+)?|\d+(?:\.\d+)?\s*(mg|ml|l|mmhg|bpm|%|회|도))/i;
const VALUE_QUALITATIVE_HINT_PATTERN = /(정상|안정|유지|양호|무변화|호전|악화\s*없|특이\s*없|음성|양성|소량|감소\s*경향|증가\s*경향|황색|명료)/;
const UNCERTAINTY_HINT_PATTERN = /(확인\s*부탁|미정|미기재|불명|애매|추후|나중|기억\s*안|모름|확실치)/;

function normalizeWhitespace(text: string) {
  return text.replace(/\s+/g, " ").replace(/\s*([,.;!?])\s*/g, "$1 ").trim();
}

function shouldFlagMissingTime(normalizedText: string) {
  if (!TASK_HINT_PATTERN.test(normalizedText)) return false;
  if (TIME_PATTERN.test(normalizedText)) return false;
  if (LAB_PENDING_PATTERN.test(normalizedText)) return false;

  const routineOnly =
    ROUTINE_OBSERVATION_PATTERN.test(normalizedText) &&
    !/(재측정|재검|다시|오더|투약|콜|처치|드레싱|보고)/.test(normalizedText);
  if (routineOnly) return false;

  const hasPendingCue = TASK_PENDING_HINT_PATTERN.test(normalizedText);
  const looksCompleted =
    TASK_COMPLETED_HINT_PATTERN.test(normalizedText) &&
    !/(다시|재측정|재검|추가|필요)/.test(normalizedText);

  if (looksCompleted && !hasPendingCue) return false;
  return hasPendingCue || /(재측정|재검|체크|확인|콜|모니터|추적|보고)/.test(normalizedText);
}

function shouldFlagMissingValue(normalizedText: string) {
  if (!VALUE_TOPIC_PATTERN.test(normalizedText)) return false;
  if (VALUE_PRESENT_PATTERN.test(normalizedText)) return false;
  if (VALUE_QUALITATIVE_HINT_PATTERN.test(normalizedText)) return false;
  if (LAB_PENDING_PATTERN.test(normalizedText)) return false;
  return !VALUE_PATTERN.test(normalizedText);
}

function detectUncertainties(originalText: string, normalizedText: string): SegmentUncertainty[] {
  const list: SegmentUncertainty[] = [];

  if (UNCERTAINTY_HINT_PATTERN.test(originalText)) {
    list.push({
      kind: "manual_review",
      reason: "원문에 확인 필요 표현이 포함되어 수동 검수가 필요합니다.",
    });
  }

  if (shouldFlagMissingTime(normalizedText)) {
    list.push({
      kind: "missing_time",
      reason: "업무/오더 항목에 시간 정보가 없어 확인이 필요합니다.",
    });
  }

  if (shouldFlagMissingValue(normalizedText)) {
    list.push({
      kind: "missing_value",
      reason: "임상 수치 항목에 값이 생략되어 확인이 필요합니다.",
    });
  }

  const unresolved = detectUnknownClinicalAbbreviations(originalText, 2);
  if (unresolved.length) {
    list.push({
      kind: "unresolved_abbreviation",
      reason: `미해석 약어(${unresolved.join(", ")})가 포함되어 확인이 필요합니다.`,
    });
  }

  return list;
}

export function normalizeSegments(segments: RawSegment[]): NormalizedSegment[] {
  return segments.map((segment) => {
    const preNormalized = normalizeWhitespace(segment.rawText);
    const clinicalNormalized = normalizeClinicalNarrative(preNormalized);
    let normalized = clinicalNormalized.text;
    ABBREVIATION_RULES.forEach((rule) => {
      normalized = normalized.replace(rule.pattern, rule.replacement);
    });
    normalized = normalizeWhitespace(normalized);

    return {
      segmentId: segment.segmentId,
      normalizedText: normalized,
      startMs: segment.startMs,
      endMs: segment.endMs,
      uncertainties: detectUncertainties(segment.rawText, normalized),
    };
  });
}
