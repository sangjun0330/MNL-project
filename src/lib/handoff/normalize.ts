import type { NormalizedSegment, RawSegment, SegmentUncertainty } from "@/lib/handoff/types";

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
];

const KNOWN_ABBREVIATIONS = new Set([
  "V",
  "VS",
  "BST",
  "SPO",
  "SPO2",
  "BP",
  "HR",
  "RR",
  "PCA",
  "ABX",
  "PRN",
  "UO",
  "NPO",
  "IV",
  "PO",
  "RA",
  "HB",
  "IO",
  "LAB",
  "LABS",
  "CBC",
  "MRI",
  "CT",
  "ABGA",
  "ECG",
  "EKG",
  "K",
  "DM",
  "POD",
]);

const TIME_PATTERN = /(\d{1,2}\s*시|\d{1,2}:\d{2}|새벽\s*\d{0,2}\s*시?|오전|오후|저녁|밤|금일|오늘|내일|익일)/;
const VALUE_PATTERN = /(\d+(?:\.\d+)?(?:\s*(?:mg|ml|l|mmhg|bpm|%|회|명|시간|h|도))?)/i;
const TASK_HINT_PATTERN = /(투약|검사|오더|재측정|재검|체크|확인|콜|모니터|처치|드레싱|추적|보고)/;
const TASK_PENDING_HINT_PATTERN = /(필요|예정|다시|마다|전|후|내일|익일|오전|오후|밤|새벽|즉시|지금)/;
const TASK_COMPLETED_HINT_PATTERN = /(완료|종료|시행됨|시행|진행됨|들어갔|투약됨|투약했고|처치함|했다|했음)/;
const VALUE_TOPIC_PATTERN = /(혈당|헤모글로빈|체온|소변량|활력징후|혈압|맥박|호흡수|산소포화도|검사수치|수분출납|산소)/i;
const VALUE_PRESENT_PATTERN = /((혈당|헤모글로빈|체온|소변량|활력징후|혈압|맥박|호흡수|산소포화도|산소)[^.!?\n]{0,14}\d+(?:\.\d+)?|\d+(?:\.\d+)?\s*(mg|ml|l|mmhg|bpm|%|회|도))/i;
const VALUE_QUALITATIVE_HINT_PATTERN = /(정상|안정|유지|양호|무변화|호전|악화\s*없|특이\s*없|음성|양성)/;
const UNCERTAINTY_HINT_PATTERN = /(확인\s*부탁|미정|미기재|불명|애매|추후|나중|기억\s*안|모름|확실치)/;

function normalizeWhitespace(text: string) {
  return text.replace(/\s+/g, " ").replace(/\s*([,.;!?])\s*/g, "$1 ").trim();
}

function isAbbreviationLike(token: string) {
  const letters = token.replace(/[^A-Za-z]/g, "");
  if (letters.length < 2) return false;
  const hasDigit = /\d/.test(token);
  const upperCount = (token.match(/[A-Z]/g) ?? []).length;
  return hasDigit || token === token.toUpperCase() || upperCount >= 2;
}

function detectUnresolvedAbbreviations(text: string) {
  const hits = text.match(/\b[A-Za-z][A-Za-z0-9]{1,7}\b/g) ?? [];
  const unknown = new Set<string>();
  hits.forEach((token) => {
    if (!isAbbreviationLike(token)) return;
    const upper = token.toUpperCase();
    const lettersOnly = upper.replace(/[0-9]/g, "");
    if (KNOWN_ABBREVIATIONS.has(upper) || KNOWN_ABBREVIATIONS.has(lettersOnly)) return;
    unknown.add(upper);
  });
  return [...unknown];
}

function shouldFlagMissingTime(normalizedText: string) {
  if (!TASK_HINT_PATTERN.test(normalizedText)) return false;
  if (TIME_PATTERN.test(normalizedText)) return false;

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

  const unresolved = detectUnresolvedAbbreviations(originalText);
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
    let normalized = normalizeWhitespace(segment.rawText);
    ABBREVIATION_RULES.forEach((rule) => {
      normalized = normalized.replace(rule.pattern, rule.replacement);
    });

    return {
      segmentId: segment.segmentId,
      normalizedText: normalized,
      startMs: segment.startMs,
      endMs: segment.endMs,
      uncertainties: detectUncertainties(segment.rawText, normalized),
    };
  });
}
