import { MEDICAL_CONFUSION_PAIRS, MEDICAL_PRONUNCIATION_ENTRIES } from "./medicalPronunciationLexicon";

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

type LexiconReplacementRule = {
  canonical: string;
  regex: RegExp;
  hasHangul: boolean;
  priority: number;
  quickNeedles: string[];
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

const BASE_NAME_PATTERNS = [
  /([가-힣]{2,4})(?=\s*(?:님|씨|환자))/g,
  /([가-힣]{1,3}[O○0]{2})/g,
];

const ROOM_CONTEXT_NAME_PATTERN =
  /(?:\d{3,4}\s*호)\s*([가-힣]{2,4})(?=\s*(?:환자|님|씨|인계|이고|은|는|가|이|폐렴|저혈압|고혈압|혈당|상태|호흡|통증|수술|낙상|검사))/g;
const ROOM_TOKEN_PATTERN = /(\d{3,4}\s*호)/g;
const SPACED_ROOM_PATTERN = /((?:\d\s*){3,4})\s*(?:호|병실|룸)/g;
const KOREAN_ROOM_PATTERN = /([공영일이삼사오육칠팔구]{3,4})\s*(?:호|병실|룸)/g;
const ROOM_KEYWORD_PATTERN = /(?:병실|룸)\s*(\d{3,4})\b/g;

const HANGUL_PARTICLE_SUFFIXES = [
  "으로",
  "에서",
  "까지",
  "은",
  "는",
  "이",
  "가",
  "을",
  "를",
  "에",
  "와",
  "과",
  "도",
  "로",
  "만",
];

const POSSIBLE_NAME_STOPWORDS = new Set([
  "해당",
  "상기",
  "동일",
  "당해",
  "환자",
  "인계",
  "오늘",
  "오전",
  "오후",
  "새벽",
  "병동",
  "상태",
  "수치",
  "혈압",
  "혈당",
  "호흡",
  "산소",
  "검사",
  "확인",
  "투약",
  "오더",
  "퇴원",
  "입원",
  "모니터링",
  "유지",
  "필요",
  "통증",
  "소변량",
  "활력징후",
  "체온",
  "낙상",
  "위험",
  "회진",
  "신규",
  "가능",
  "예정",
  "금일",
  "익일",
]);

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

const BASE_KNOWN_CLINICAL_ABBREVIATIONS = new Set([
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
  "Q2H",
  "Q4H",
  "Q6H",
  "Q8H",
  "Q12H",
  "QD",
  "BID",
  "TID",
  "QID",
]);

const CONTINUATION_HINT_PATTERN =
  /(혈당|혈압|호흡|산소|오더|투약|검사|통증|소변량|활력징후|체온|항생제|콜|모니터|확인|재측정|재검|수치|I\/O|SpO2|스포투|에스피오투|브이에스|바이탈)/i;
const TRANSITION_CUE_PATTERN = /(다음|그다음|이어서|한편|반면|다른\s*환자|신규\s*환자|신규\s*입원|퇴원\s*예정)/;
const TOKEN_REPLACE_PATTERN = /[A-Za-z0-9가-힣&;_./-]{2,}/g;
const PATIENT_PRONOUN_CONTINUATION_PATTERN = /(해당\s*환자|그\s*환자|이\s*환자|상기\s*환자|동일\s*환자)/;
const CONFUSION_CONTEXT_WINDOW_RADIUS = 24;

const CARDIAC_CONTEXT_PATTERN = /(맥박|심박|pulse|bpm|heart\s*rate|빈맥|서맥|심전도|ECG|EKG)/i;
const RESPIRATORY_CONTEXT_PATTERN = /(호흡|resp|breath|호흡수|호흡곤란|회\/분|r\/min|흡기|호기)/i;
const DISCHARGE_CONTEXT_PATTERN = /(퇴원|discharge|전원|귀가|집으로)/i;
const DISCONTINUE_CONTEXT_PATTERN = /(중단|중지|보류|hold|stop|끊|종료|off|약\s*중단|투약\s*중단)/i;
const RENAL_CONTEXT_PATTERN = /(creatinine|크레아티닌|신장|renal|콩팥|eGFR|BUN|요독)/i;
const INFLAMMATORY_CONTEXT_PATTERN = /(염증|감염|패혈|sepsis|wbc|procalcitonin|CRP)/i;
const PRN_CONTEXT_PATTERN = /(필요시|as needed|증상시|통증시|불편시|발열시)/i;
const PR_CONTEXT_PATTERN = /(직장|rectal|per\s*rectum|좌약)/i;
const PE_CONTEXT_PATTERN = /(폐색전|embolism|d-dimer|CTPA|흉통|호흡곤란)/i;
const PEA_CONTEXT_PATTERN = /(무맥성|심정지|arrest|CPR|resuscitation|소생술)/i;
const FLEXIBLE_TOKEN_REGEX_CACHE = new Map<string, RegExp>();

type TokenMention = {
  index: number;
  token: string;
  window: string;
};

export type ConfusableAbbreviationWarning = {
  pair: [string, string];
  token: string;
  reason: string;
  snippet: string;
};

export type PatientAnchors = {
  roomTokens: string[];
  nameTokens: string[];
  maskedNameTokens: string[];
  hasStrongAnchor: boolean;
};

function unique<T>(values: T[]) {
  return [...new Set(values)];
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeSubscriptDigits(text: string) {
  return text.replace(/₀/g, "0").replace(/₁/g, "1").replace(/₂/g, "2").replace(/₃/g, "3").replace(/₄/g, "4");
}

export function foldClinicalToken(value: string) {
  return normalizeSubscriptDigits(value)
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[\s._\-/]+/g, "")
    .replace(/[()\[\]{}'"`]/g, "")
    .replace(/[;:]/g, "")
    .replace(/&/g, "and")
    .trim();
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

function cleanMeaning(raw: string) {
  return raw.replace(/\s+/g, " ").trim();
}

function splitVariantParts(variant: string) {
  return variant
    .split(/[\s_./-]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function isLikelyAbbreviationToken(value: string) {
  const letters = value.replace(/[^A-Za-z]/g, "");
  if (letters.length < 2 || value.length > 12) return false;
  const upperLetters = (letters.match(/[A-Z]/g) ?? []).length;
  return upperLetters >= 2 || /\d/.test(value) || /^[A-Za-z]{2,5}$/.test(value);
}

function buildLexiconLookup() {
  const singleTokenMap = new Map<string, string>();
  const multiWordRules: LexiconReplacementRule[] = [];
  const knownAbbreviations = new Set(BASE_KNOWN_CLINICAL_ABBREVIATIONS);
  const seenMultiWordRuleKeys = new Set<string>();

  MEDICAL_PRONUNCIATION_ENTRIES.forEach((entry) => {
    const canonical = cleanMeaning(entry.meaning) || entry.term;
    const variants = unique([
      entry.term,
      entry.full,
      ...entry.synonyms,
      ...entry.pronunciations,
      canonical,
    ]);

    variants.forEach((variantRaw) => {
      const variant = variantRaw.trim();
      if (!variant) return;

      const folded = foldClinicalToken(variant);
      if (!folded) return;

      if (!singleTokenMap.has(folded)) {
        singleTokenMap.set(folded, canonical);
      }

      const upper = variant.toUpperCase().replace(/[^A-Z0-9/]/g, "");
      const lettersOnly = upper.replace(/[0-9]/g, "");
      if (isLikelyAbbreviationToken(variant)) {
        if (upper) knownAbbreviations.add(upper);
        if (lettersOnly) knownAbbreviations.add(lettersOnly);
      }

      const parts = splitVariantParts(variant);
      if (parts.length < 2) return;

      const corePattern = parts.map((part) => escapeRegExp(part)).join("[\\s_./-]*");
      const hasHangul = /[가-힣]/.test(variant);
      const key = `${corePattern}|${canonical}|${hasHangul ? "ko" : "en"}`;
      if (seenMultiWordRuleKeys.has(key)) return;
      seenMultiWordRuleKeys.add(key);

      const regex = hasHangul
        ? new RegExp(
            `(^|[^A-Za-z0-9가-힣])(${corePattern})(?:(${HANGUL_PARTICLE_SUFFIXES.join("|")}))?(?=$|[^A-Za-z0-9가-힣])`,
            "gi"
          )
        : new RegExp(`(^|[^A-Za-z0-9])(${corePattern})(?=$|[^A-Za-z0-9])`, "gi");

      multiWordRules.push({
        canonical,
        regex,
        hasHangul,
        priority: folded.length,
        quickNeedles: unique(
          parts
            .map((part) => part.toLowerCase().trim())
            .filter((part) => part.length >= 2 && /[a-z가-힣]/i.test(part))
            .slice(0, 2)
        ),
      });
    });
  });

  multiWordRules.sort((a, b) => b.priority - a.priority);

  return {
    singleTokenMap,
    multiWordRules,
    knownAbbreviations,
  };
}

const LEXICON_LOOKUP = buildLexiconLookup();

export const KNOWN_CLINICAL_ABBREVIATIONS = new Set(LEXICON_LOOKUP.knownAbbreviations);

function applyLexiconPhraseRules(text: string, appliedTerms: Set<string>) {
  let output = text;
  let lowerOutput = output.toLowerCase();

  LEXICON_LOOKUP.multiWordRules.forEach((rule) => {
    if (rule.quickNeedles.length && !rule.quickNeedles.some((needle) => lowerOutput.includes(needle))) {
      return;
    }

    const before = output;
    if (rule.hasHangul) {
      output = output.replace(rule.regex, (_matched, prefix: string, _term: string, particle?: string) => {
        appliedTerms.add(rule.canonical);
        return `${prefix}${rule.canonical}${particle ?? ""}`;
      });
      if (output !== before) {
        lowerOutput = output.toLowerCase();
      }
      return;
    }

    output = output.replace(rule.regex, (_matched, prefix: string) => {
      appliedTerms.add(rule.canonical);
      return `${prefix}${rule.canonical}`;
    });
    if (output !== before) {
      lowerOutput = output.toLowerCase();
    }
  });

  return output;
}

function splitTrailingHangulParticle(token: string) {
  for (const suffix of HANGUL_PARTICLE_SUFFIXES) {
    if (token.length <= suffix.length + 1) continue;
    if (token.endsWith(suffix)) {
      return {
        stem: token.slice(0, -suffix.length),
        suffix,
      };
    }
  }
  return {
    stem: token,
    suffix: "",
  };
}

function applyLexiconTokenRules(text: string, appliedTerms: Set<string>) {
  return text.replace(TOKEN_REPLACE_PATTERN, (token) => {
    const folded = foldClinicalToken(token);
    const direct = LEXICON_LOOKUP.singleTokenMap.get(folded);
    if (direct) {
      appliedTerms.add(direct);
      return direct;
    }

    if (!/[가-힣]/.test(token)) return token;

    const { stem, suffix } = splitTrailingHangulParticle(token);
    const stemFolded = foldClinicalToken(stem);
    const fromStem = LEXICON_LOOKUP.singleTokenMap.get(stemFolded);
    if (!fromStem) return token;

    appliedTerms.add(fromStem);
    return `${fromStem}${suffix}`;
  });
}

export function normalizeClinicalNarrative(text: string) {
  let normalized = normalizeRoomMentions(text);
  normalized = normalized.replace(/시나리오\s*\d+/g, " ");

  const appliedTerms = new Set<string>();

  CLINICAL_REPLACEMENT_RULES.forEach((rule) => {
    const replaced = normalized.replace(rule.pattern, rule.canonical);
    if (replaced !== normalized) appliedTerms.add(rule.canonical);
    normalized = replaced;
  });

  normalized = applyLexiconPhraseRules(normalized, appliedTerms);
  normalized = applyLexiconTokenRules(normalized, appliedTerms);

  return {
    text: normalized.replace(/\s+/g, " ").trim(),
    appliedTerms: [...appliedTerms],
  };
}

function collectPatternTokens(text: string, pattern: RegExp) {
  const matches = [...text.matchAll(pattern)];
  return matches
    .map((match) => (match[1] ?? match[0] ?? "").trim())
    .filter((token) => token.length > 0);
}

function isPlausibleNameToken(token: string) {
  if (!/^[가-힣]{2,4}$/.test(token)) return false;
  if (POSSIBLE_NAME_STOPWORDS.has(token)) return false;
  return true;
}

function extractNameTokens(text: string) {
  const baseCandidates = BASE_NAME_PATTERNS.flatMap((pattern) => collectPatternTokens(text, pattern));
  const roomContextCandidates = collectPatternTokens(text, ROOM_CONTEXT_NAME_PATTERN);
  const candidates = unique([...baseCandidates, ...roomContextCandidates]);
  return candidates.filter(isPlausibleNameToken);
}

function extractMaskedNameTokens(text: string) {
  return unique(text.match(/[가-힣]{1,3}[O○0]{2}/g) ?? []);
}

export function extractRoomTokens(text: string) {
  const normalized = normalizeRoomMentions(text);
  const tokens = collectPatternTokens(normalized, ROOM_TOKEN_PATTERN).map((token) => compactRoomDigits(token) ?? token);
  return unique(tokens.filter(Boolean) as string[]);
}

export function extractPatientAnchors(text: string): PatientAnchors {
  const normalized = normalizeRoomMentions(text);
  const roomTokens = extractRoomTokens(normalized);
  const nameTokens = extractNameTokens(normalized);
  const maskedNameTokens = extractMaskedNameTokens(normalized);

  return {
    roomTokens,
    nameTokens,
    maskedNameTokens,
    hasStrongAnchor: roomTokens.length > 0 || nameTokens.length > 0 || maskedNameTokens.length > 0,
  };
}

export function extractPatientTokens(text: string) {
  const anchors = extractPatientAnchors(text);
  return unique([...anchors.roomTokens, ...anchors.nameTokens, ...anchors.maskedNameTokens]);
}

export function hasPatientTransitionCue(text: string) {
  return TRANSITION_CUE_PATTERN.test(text);
}

export function isLikelyClinicalContinuation(text: string) {
  return CONTINUATION_HINT_PATTERN.test(text) || PATIENT_PRONOUN_CONTINUATION_PATTERN.test(text);
}

function isStrictAbbreviationToken(token: string) {
  const letters = token.replace(/[^A-Za-z]/g, "");
  if (letters.length < 2 || token.length > 10) return false;
  const hasDigit = /\d/.test(token);
  const upperCount = (token.match(/[A-Z]/g) ?? []).length;
  return hasDigit || token === token.toUpperCase() || upperCount >= 2;
}

export function detectUnknownClinicalAbbreviations(text: string, maxCount = 2) {
  const normalized = normalizeSubscriptDigits(text);
  const hits = normalized.match(/\b[A-Za-z][A-Za-z0-9/]{1,10}\b/g) ?? [];
  const unknown = new Set<string>();

  for (const token of hits) {
    if (!isStrictAbbreviationToken(token)) continue;
    if (/^[OX]{2,4}$/i.test(token)) continue;
    const lower = token.toLowerCase();
    if (SAFE_ENGLISH_TOKENS.has(lower)) continue;
    if (/^q\\d+h$/i.test(token)) continue;
    if (/^(qd|bid|tid|qid)$/i.test(token)) continue;

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

function buildConfusionPairKey(left: string, right: string) {
  return [foldClinicalToken(left), foldClinicalToken(right)].sort((a, b) => a.localeCompare(b, "en")).join("|");
}

const CONFIGURED_CONFUSION_PAIR_KEYS = new Set(
  MEDICAL_CONFUSION_PAIRS.map(([left, right]) => buildConfusionPairKey(left, right))
);

function hasConfiguredConfusionPair(left: string, right: string) {
  return CONFIGURED_CONFUSION_PAIR_KEYS.has(buildConfusionPairKey(left, right));
}

function buildFlexibleTokenRegex(token: string) {
  const key = token.trim().toLowerCase();
  const cached = FLEXIBLE_TOKEN_REGEX_CACHE.get(key);
  if (cached) return cached;

  const escaped = escapeRegExp(token.trim());
  const core = escaped
    .replace(/\\\//g, "[\\s/]*")
    .replace(/\\-/g, "[\\s-]*")
    .replace(/\\\./g, "[\\s.]*")
    .replace(/\s+/g, "[\\s]*");
  const compiled = new RegExp(`(^|[^A-Za-z0-9가-힣])(${core})(?=$|[^A-Za-z0-9가-힣])`, "gi");
  FLEXIBLE_TOKEN_REGEX_CACHE.set(key, compiled);
  return compiled;
}

function buildContextWindow(text: string, start: number, end: number) {
  const from = Math.max(0, start - CONFUSION_CONTEXT_WINDOW_RADIUS);
  const to = Math.min(text.length, end + CONFUSION_CONTEXT_WINDOW_RADIUS);
  return text.slice(from, to);
}

function collectTokenMentions(text: string, token: string) {
  const baseRegex = buildFlexibleTokenRegex(token);
  const regex = new RegExp(baseRegex.source, baseRegex.flags);
  const mentions: TokenMention[] = [];
  let match = regex.exec(text);
  while (match) {
    const prefix = match[1] ?? "";
    const literal = match[2] ?? token;
    const start = match.index + prefix.length;
    const end = start + literal.length;
    mentions.push({
      index: start,
      token: literal,
      window: buildContextWindow(text, start, end),
    });
    match = regex.exec(text);
  }
  return mentions;
}

function uniqueMentionsByIndex(mentions: TokenMention[]) {
  const seen = new Set<number>();
  return mentions.filter((mention) => {
    if (seen.has(mention.index)) return false;
    seen.add(mention.index);
    return true;
  });
}

function pushConfusableWarning(
  warnings: ConfusableAbbreviationWarning[],
  dedupe: Set<string>,
  pair: [string, string],
  token: string,
  reason: string,
  snippet: string
) {
  const key = `${buildConfusionPairKey(pair[0], pair[1])}|${foldClinicalToken(token)}|${reason}`;
  if (dedupe.has(key)) return;
  dedupe.add(key);
  warnings.push({
    pair,
    token,
    reason,
    snippet: snippet.replace(/\s+/g, " ").trim(),
  });
}

function detectHrRrConfusion(
  text: string,
  warnings: ConfusableAbbreviationWarning[],
  dedupe: Set<string>
) {
  if (!hasConfiguredConfusionPair("HR", "RR")) return;

  collectTokenMentions(text, "HR").forEach((mention) => {
    const hasCardiac = CARDIAC_CONTEXT_PATTERN.test(mention.window);
    const hasResp = RESPIRATORY_CONTEXT_PATTERN.test(mention.window);
    if (hasResp && !hasCardiac) {
      pushConfusableWarning(
        warnings,
        dedupe,
        ["HR", "RR"],
        "HR",
        "HR가 호흡 문맥으로 해석될 가능성이 있어 RR과 혼동 검토가 필요합니다.",
        mention.window
      );
    }
  });

  collectTokenMentions(text, "RR").forEach((mention) => {
    const hasCardiac = CARDIAC_CONTEXT_PATTERN.test(mention.window);
    const hasResp = RESPIRATORY_CONTEXT_PATTERN.test(mention.window);
    if (hasCardiac && !hasResp) {
      pushConfusableWarning(
        warnings,
        dedupe,
        ["HR", "RR"],
        "RR",
        "RR가 맥박 문맥으로 해석될 가능성이 있어 HR과 혼동 검토가 필요합니다.",
        mention.window
      );
    }
  });
}

function detectDcConfusion(
  text: string,
  warnings: ConfusableAbbreviationWarning[],
  dedupe: Set<string>
) {
  if (!hasConfiguredConfusionPair("DC", "D/C")) return;

  const mentions = uniqueMentionsByIndex([
    ...collectTokenMentions(text, "DC"),
    ...collectTokenMentions(text, "D/C"),
  ]);

  mentions.forEach((mention) => {
    const hasDischarge = DISCHARGE_CONTEXT_PATTERN.test(mention.window);
    const hasDiscontinue = DISCONTINUE_CONTEXT_PATTERN.test(mention.window);
    if ((hasDischarge && hasDiscontinue) || (!hasDischarge && !hasDiscontinue)) {
      pushConfusableWarning(
        warnings,
        dedupe,
        ["DC", "D/C"],
        mention.token,
        "DC/D-C 의미(퇴원 vs 중단)가 문맥에서 모호해 검토가 필요합니다.",
        mention.window
      );
    }
  });
}

function detectCrCrpConfusion(
  text: string,
  warnings: ConfusableAbbreviationWarning[],
  dedupe: Set<string>
) {
  if (!hasConfiguredConfusionPair("Cr", "CRP")) return;

  collectTokenMentions(text, "Cr").forEach((mention) => {
    const hasRenal = RENAL_CONTEXT_PATTERN.test(mention.window);
    const hasInflammatory = INFLAMMATORY_CONTEXT_PATTERN.test(mention.window);
    if (hasInflammatory && !hasRenal) {
      pushConfusableWarning(
        warnings,
        dedupe,
        ["Cr", "CRP"],
        "Cr",
        "Cr 표기가 염증 문맥과 섞여 CRP와 혼동될 가능성이 있습니다.",
        mention.window
      );
    }
  });

  collectTokenMentions(text, "CRP").forEach((mention) => {
    const hasRenal = RENAL_CONTEXT_PATTERN.test(mention.window);
    const hasInflammatory = INFLAMMATORY_CONTEXT_PATTERN.test(mention.window);
    if (hasRenal && !hasInflammatory) {
      pushConfusableWarning(
        warnings,
        dedupe,
        ["Cr", "CRP"],
        "CRP",
        "CRP 표기가 신장수치 문맥과 섞여 Cr(크레아티닌)과 혼동될 가능성이 있습니다.",
        mention.window
      );
    }
  });
}

function detectPrPrnConfusion(
  text: string,
  warnings: ConfusableAbbreviationWarning[],
  dedupe: Set<string>
) {
  if (!hasConfiguredConfusionPair("PR", "PRN")) return;

  collectTokenMentions(text, "PR").forEach((mention) => {
    const hasPr = PR_CONTEXT_PATTERN.test(mention.window);
    const hasPrn = PRN_CONTEXT_PATTERN.test(mention.window);
    if (hasPrn && !hasPr) {
      pushConfusableWarning(
        warnings,
        dedupe,
        ["PR", "PRN"],
        "PR",
        "PR 표기가 필요시 문맥으로 읽혀 PRN과 혼동될 가능성이 있습니다.",
        mention.window
      );
    }
  });

  collectTokenMentions(text, "PRN").forEach((mention) => {
    const hasPr = PR_CONTEXT_PATTERN.test(mention.window);
    const hasPrn = PRN_CONTEXT_PATTERN.test(mention.window);
    if (hasPr && !hasPrn) {
      pushConfusableWarning(
        warnings,
        dedupe,
        ["PR", "PRN"],
        "PRN",
        "PRN 표기가 직장투여 문맥과 섞여 PR과 혼동될 가능성이 있습니다.",
        mention.window
      );
    }
  });
}

function detectPePeaConfusion(
  text: string,
  warnings: ConfusableAbbreviationWarning[],
  dedupe: Set<string>
) {
  if (!hasConfiguredConfusionPair("PE", "PEA")) return;

  collectTokenMentions(text, "PE").forEach((mention) => {
    const hasPe = PE_CONTEXT_PATTERN.test(mention.window);
    const hasPea = PEA_CONTEXT_PATTERN.test(mention.window);
    if (hasPea && !hasPe) {
      pushConfusableWarning(
        warnings,
        dedupe,
        ["PE", "PEA"],
        "PE",
        "PE 표기가 소생술 문맥에 있어 PEA와 혼동될 가능성이 있습니다.",
        mention.window
      );
    }
  });

  collectTokenMentions(text, "PEA").forEach((mention) => {
    const hasPe = PE_CONTEXT_PATTERN.test(mention.window);
    const hasPea = PEA_CONTEXT_PATTERN.test(mention.window);
    if (hasPe && !hasPea) {
      pushConfusableWarning(
        warnings,
        dedupe,
        ["PE", "PEA"],
        "PEA",
        "PEA 표기가 폐색전 문맥에 있어 PE와 혼동될 가능성이 있습니다.",
        mention.window
      );
    }
  });
}

export function detectConfusableAbbreviationWarnings(text: string, maxCount = 2) {
  const normalized = normalizeSubscriptDigits(text);
  const warnings: ConfusableAbbreviationWarning[] = [];
  const dedupe = new Set<string>();

  detectHrRrConfusion(normalized, warnings, dedupe);
  detectDcConfusion(normalized, warnings, dedupe);
  detectCrCrpConfusion(normalized, warnings, dedupe);
  detectPrPrnConfusion(normalized, warnings, dedupe);
  detectPePeaConfusion(normalized, warnings, dedupe);

  return warnings.slice(0, maxCount);
}

export function getMedicalPronunciationEntryCount() {
  return MEDICAL_PRONUNCIATION_ENTRIES.length;
}
