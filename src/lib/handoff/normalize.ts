import type { NormalizedSegment, RawSegment, SegmentUncertainty } from "@/lib/handoff/types";

const ABBREVIATION_RULES: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\bV\/?S\b/gi, replacement: "활력징후" },
  { pattern: /\bBST\b/gi, replacement: "혈당" },
  { pattern: /\bPCA\b/gi, replacement: "통증자가조절기" },
  { pattern: /\bABx\b/gi, replacement: "항생제" },
  { pattern: /\bPRN\b/gi, replacement: "필요시" },
  { pattern: /\bU\/?O\b/gi, replacement: "소변량" },
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
  "PCA",
  "ABX",
  "PRN",
  "UO",
  "RA",
  "HB",
  "IO",
  "LAB",
  "LABS",
  "CBC",
  "K",
  "DM",
  "POD",
]);

const TIME_PATTERN = /(\d{1,2}\s*시|\d{1,2}:\d{2}|새벽\s*\d{0,2}\s*시?|오전|오후|저녁|밤|금일|오늘|내일|익일)/;
const VALUE_PATTERN = /(\d+(?:\.\d+)?(?:\s*(?:mg|ml|L|%|회|명|시간|h|도))?)/i;
const TASK_HINT_PATTERN = /(투약|검사|오더|재측정|재검|체크|확인|콜|모니터)/;
const UNCERTAINTY_HINT_PATTERN = /(확인\s*부탁|미정|미기재|불명|애매|추후|나중|기억\s*안|모름|확실치)/;

function normalizeWhitespace(text: string) {
  return text.replace(/\s+/g, " ").replace(/\s*([,.;!?])\s*/g, "$1 ").trim();
}

function detectUnresolvedAbbreviations(text: string) {
  const hits = text.match(/\b[A-Za-z]{2,6}\b/g) ?? [];
  const unknown = new Set<string>();
  hits.forEach((token) => {
    const upper = token.toUpperCase();
    if (!KNOWN_ABBREVIATIONS.has(upper)) unknown.add(token);
  });
  return [...unknown];
}

function detectUncertainties(originalText: string, normalizedText: string): SegmentUncertainty[] {
  const list: SegmentUncertainty[] = [];

  if (UNCERTAINTY_HINT_PATTERN.test(originalText)) {
    list.push({
      kind: "manual_review",
      reason: "원문에 확인 필요 표현이 포함되어 수동 검수가 필요합니다.",
    });
  }

  if (TASK_HINT_PATTERN.test(normalizedText) && !TIME_PATTERN.test(normalizedText)) {
    list.push({
      kind: "missing_time",
      reason: "업무/오더 항목에 시간 정보가 없어 확인이 필요합니다.",
    });
  }

  if (/(혈당|헤모글로빈|체온|소변량|활력징후|검사|투약|항생제)/.test(normalizedText) && !VALUE_PATTERN.test(normalizedText)) {
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
