const KOREAN_DIGIT_MAP: Record<string, string> = {
  공: "0",
  영: "0",
  일: "1",
  이: "2",
  삼: "3",
  사: "4",
  오: "5",
  육: "6",
  칠: "7",
  팔: "8",
  구: "9",
};

type ClinicalReplacementRule = {
  canonical: string;
  pattern: RegExp;
};

const CLINICAL_REPLACEMENT_RULES: ClinicalReplacementRule[] = [
  { canonical: "생체징후", pattern: /\bvital\s*signs?\b/gi },
  { canonical: "안정적", pattern: /\bstable\b/gi },
  { canonical: "혈압", pattern: /\bblood\s*pressure\b/gi },
  { canonical: "저혈압", pattern: /\bhypotension\b/gi },
  { canonical: "수액볼루스", pattern: /\bfluid\s*bolus\b/gi },
  { canonical: "의식상태", pattern: /\bmental\s*status\b/gi },
  { canonical: "지남력", pattern: /\borientation\b/gi },
  { canonical: "통증척도", pattern: /\bpain\s*score\b/gi },
  { canonical: "진통제", pattern: /\banalgesic\b/gi },
  { canonical: "호흡상태", pattern: /\brespiratory\s*status\b/gi },
  { canonical: "산소포화도", pattern: /\bspo\s*2\b/gi },
  { canonical: "비강산소공급", pattern: /\bnasal\s*cannula\b/gi },
  { canonical: "객담", pattern: /\bsputum\b/gi },
  { canonical: "황색", pattern: /\byellowish\b/gi },
  { canonical: "섭취배설량", pattern: /\bintake\s*&?\s*output\b/gi },
  { canonical: "소변량", pattern: /\burine\s*output\b/gi },
  { canonical: "소변관찰", pattern: /\burine\s*monitoring\b/gi },
  { canonical: "모니터링", pattern: /\bmonitoring\b/gi },
  { canonical: "검사", pattern: /\blaboratory\s*tests?\b/gi },
  { canonical: "혈액검사", pattern: /\bCBC\b/gi },
  { canonical: "염증수치", pattern: /\bCRP\b/gi },
  { canonical: "항생제", pattern: /\bantibiotics?\b/gi },
  { canonical: "첫투여", pattern: /\bfirst\s*dose\b/gi },
  { canonical: "낙상위험", pattern: /\bfall\s*risk\b/gi },
  { canonical: "침상경보", pattern: /\bbed\s*alarm\b/gi },
  { canonical: "보행", pattern: /\bambulation\b/gi },
  { canonical: "보조", pattern: /\bassist\b/gi },
  { canonical: "명료", pattern: /\balert\b/gi },
];

const NAME_PATTERNS = [
  /([가-힣]{2,4})(?=\s*(?:님|씨|환자))/g,
  /(?:\d{3,4}\s*호)\s*([가-힣]{2,4})(?=\s*(?:환자|님|씨|인계|이고|은|는|가|이))/g,
  /([가-힣]{1,3}[O○0]{2})/g,
];

const ROOM_TOKEN_PATTERN = /(\d{3,4}\s*호)/g;
const SPACED_ROOM_PATTERN = /((?:\d\s*){3,4})\s*(?:호|병실|룸)/g;
const KOREAN_ROOM_PATTERN = /([공영일이삼사오육칠팔구]{3,4})\s*(?:호|병실|룸)/g;
const ROOM_KEYWORD_PATTERN = /(?:병실|룸)\s*(\d{3,4})\b/g;

const SAFE_ENGLISH_TOKENS = new Set([
  "vital",
  "signs",
  "stable",
  "blood",
  "pressure",
  "hypotension",
  "fluid",
  "bolus",
  "mental",
  "status",
  "orientation",
  "pain",
  "score",
  "analgesic",
  "respiratory",
  "sputum",
  "yellowish",
  "intake",
  "output",
  "urine",
  "monitoring",
  "laboratory",
  "test",
  "tests",
  "antibiotics",
  "first",
  "dose",
  "fall",
  "risk",
  "bed",
  "alarm",
  "ambulation",
  "assist",
  "check",
  "alert",
]);

export const KNOWN_CLINICAL_ABBREVIATIONS = new Set([
  "V",
  "VS",
  "V/S",
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
  "I/O",
  "LAB",
  "LABS",
  "CBC",
  "CRP",
  "MRI",
  "CT",
  "ABGA",
  "ECG",
  "EKG",
  "K",
  "DM",
  "POD",
  "NRS",
  "SPO2",
]);

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function normalizeSubscriptDigits(text: string) {
  return text.replace(/₀/g, "0").replace(/₁/g, "1").replace(/₂/g, "2").replace(/₃/g, "3").replace(/₄/g, "4");
}

function compactRoomDigits(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 3 || digits.length > 4) return null;
  return `${digits}호`;
}

function replaceSpacedRoomMentions(text: string) {
  return text.replace(SPACED_ROOM_PATTERN, (matched, digitsPart: string) => {
    const compact = compactRoomDigits(digitsPart);
    return compact ?? matched;
  });
}

function koreanDigitsToArabic(raw: string) {
  const mapped = [...raw].map((ch) => KOREAN_DIGIT_MAP[ch] ?? "");
  if (mapped.some((digit) => !digit)) return null;
  const digits = mapped.join("");
  if (digits.length < 3 || digits.length > 4) return null;
  return digits;
}

function replaceKoreanRoomMentions(text: string) {
  return text.replace(KOREAN_ROOM_PATTERN, (matched, koreanDigits: string) => {
    const digits = koreanDigitsToArabic(koreanDigits);
    if (!digits) return matched;
    return `${digits}호`;
  });
}

export function normalizeRoomMentions(text: string) {
  let normalized = normalizeSubscriptDigits(text);
  normalized = replaceSpacedRoomMentions(normalized);
  normalized = replaceKoreanRoomMentions(normalized);
  normalized = normalized.replace(ROOM_KEYWORD_PATTERN, (_matched, digits: string) => `${digits}호`);
  return normalized;
}

export function normalizeClinicalNarrative(text: string) {
  let normalized = normalizeRoomMentions(text);
  normalized = normalized.replace(/시나리오\s*\d+/g, " ");

  const appliedTerms: string[] = [];
  CLINICAL_REPLACEMENT_RULES.forEach((rule) => {
    const replaced = normalized.replace(rule.pattern, rule.canonical);
    if (replaced !== normalized) appliedTerms.push(rule.canonical);
    normalized = replaced;
  });

  return {
    text: normalized.replace(/\s+/g, " ").trim(),
    appliedTerms: unique(appliedTerms),
  };
}

function collectPatternTokens(text: string, pattern: RegExp) {
  const matches = [...text.matchAll(pattern)];
  return matches
    .map((match) => (match[1] ?? match[0] ?? "").trim())
    .filter((token) => token.length > 0);
}

function extractNameTokens(text: string) {
  const candidates = NAME_PATTERNS.flatMap((pattern) => collectPatternTokens(text, pattern));
  return unique(candidates);
}

export function extractRoomTokens(text: string) {
  const normalized = normalizeRoomMentions(text);
  const tokens = collectPatternTokens(normalized, ROOM_TOKEN_PATTERN).map((token) => compactRoomDigits(token) ?? token);
  return unique(tokens.filter(Boolean) as string[]);
}

export function extractPatientTokens(text: string) {
  const normalized = normalizeRoomMentions(text);
  const roomTokens = extractRoomTokens(normalized);
  const nameTokens = extractNameTokens(normalized);
  return unique([...roomTokens, ...nameTokens]);
}

function isStrictAbbreviationToken(token: string) {
  const letters = token.replace(/[^A-Za-z]/g, "");
  if (letters.length < 2 || token.length > 7) return false;
  const upperLetters = (letters.match(/[A-Z]/g) ?? []).length;
  const hasDigit = /\d/.test(token);
  return upperLetters >= 2 || hasDigit;
}

export function detectUnknownClinicalAbbreviations(text: string, maxCount = 2) {
  const normalized = normalizeSubscriptDigits(text);
  const hits = normalized.match(/\b[A-Za-z][A-Za-z0-9/]{1,7}\b/g) ?? [];
  const unknown = new Set<string>();

  for (const token of hits) {
    if (!isStrictAbbreviationToken(token)) continue;
    const lower = token.toLowerCase();
    if (SAFE_ENGLISH_TOKENS.has(lower)) continue;

    const upper = token.toUpperCase();
    const normalizedUpper = upper.replace(/[^A-Z0-9/]/g, "");
    const lettersOnly = normalizedUpper.replace(/[0-9]/g, "");

    if (
      KNOWN_CLINICAL_ABBREVIATIONS.has(upper) ||
      KNOWN_CLINICAL_ABBREVIATIONS.has(normalizedUpper) ||
      KNOWN_CLINICAL_ABBREVIATIONS.has(lettersOnly)
    ) {
      continue;
    }

    unknown.add(normalizedUpper);
    if (unknown.size >= maxCount) break;
  }

  return [...unknown];
}
