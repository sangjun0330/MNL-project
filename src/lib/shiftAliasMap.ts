import type { CoreShift, CustomShiftDef } from "@/lib/model";

export type NormalizedShift = {
  semanticType: CoreShift;
  displayName: string;
  fromCustom: boolean;
};

export type AliasResult = NormalizedShift | null;

const BUILTIN: Record<string, [CoreShift, string]> = {
  D: ["D", "주간"],
  DAY: ["D", "주간"],
  DAYSHIFT: ["D", "주간"],
  DAYDUTY: ["D", "주간"],
  주간: ["D", "주간"],
  주번: ["D", "주간"],
  주간근무: ["D", "주간근무"],
  데이: ["D", "데이"],
  데이번: ["D", "데이"],
  낮: ["D", "낮번"],
  낮번: ["D", "낮번"],
  낮근무: ["D", "낮근무"],
  AM: ["D", "AM"],
  오전: ["D", "오전번"],
  오전번: ["D", "오전번"],
  오전근무: ["D", "오전근무"],
  오후근무: ["E", "오후근무"],
  "1교대": ["D", "1교대"],
  "10D": ["D", "10D"],
  "10시데이": ["D", "10D"],
  "11D": ["D", "11D"],
  "11시데이": ["D", "11D"],

  E: ["E", "이브닝"],
  EVE: ["E", "이브닝"],
  EVENING: ["E", "이브닝"],
  EVENINGSHIFT: ["E", "이브닝"],
  EVENINGDUTY: ["E", "이브닝"],
  이브: ["E", "이브닝"],
  이브닝: ["E", "이브닝"],
  초번: ["E", "초번"],
  초: ["E", "초번"],
  저녁: ["E", "저녁번"],
  저녁번: ["E", "저녁번"],
  저녁근무: ["E", "저녁근무"],
  PM: ["E", "PM"],
  오후: ["E", "오후번"],
  오후번: ["E", "오후번"],
  "2교대": ["E", "2교대"],

  N: ["N", "나이트"],
  NIGHT: ["N", "나이트"],
  NIGHTSHIFT: ["N", "나이트"],
  NIGHTDUTY: ["N", "나이트"],
  나이트: ["N", "나이트"],
  야간: ["N", "야간"],
  야간근무: ["N", "야간근무"],
  야: ["N", "야번"],
  야번: ["N", "야번"],
  밤: ["N", "밤번"],
  밤번: ["N", "밤번"],
  밤근무: ["N", "밤근무"],
  "3교대": ["N", "3교대"],

  M: ["M", "미들"],
  MID: ["M", "미들"],
  MIDDLE: ["M", "미들"],
  MIDDAY: ["M", "미드데이"],
  MIDSHIFT: ["M", "미드"],
  MIDDUTY: ["M", "미드"],
  MD: ["M", "MD"],
  H: ["M", "H"],
  HALF: ["M", "H"],
  미들: ["M", "미들"],
  미드: ["M", "미드"],
  미드데이: ["M", "미드데이"],
  중간: ["M", "미들"],
  중간번: ["M", "미들"],
  중간근무: ["M", "중간근무"],
  보강근무: ["M", "보강근무"],
  DE: ["M", "DE"],
  ED: ["M", "ED"],
  EN: ["M", "EN"],
  EC: ["M", "EC"],
  ND: ["M", "ND"],
  NOD: ["M", "NOD"],
  데브닝: ["M", "데브닝"],
  더블듀티: ["M", "더블듀티"],
  DOUBLE: ["M", "DOUBLE"],
  "DOUBLEDUTY": ["M", "DOUBLE DUTY"],
  나오데: ["M", "나오데"],
  이브데이: ["M", "이브데이"],

  OFF: ["OFF", "오프"],
  O: ["OFF", "오프"],
  OF: ["OFF", "오프"],
  "-": ["OFF", "오프"],
  "_": ["OFF", "오프"],
  "/": ["OFF", "오프"],
  "//": ["OFF", "오프"],
  공: ["OFF", "공휴일"],
  공휴일: ["OFF", "공휴일"],
  휴무: ["OFF", "휴무"],
  휴일: ["OFF", "휴일"],
  쉬는날: ["OFF", "오프"],
  쉬는: ["OFF", "오프"],
  오프: ["OFF", "오프"],
  비번: ["OFF", "비번"],
  비: ["OFF", "비번"],
  NO: ["OFF", "NO"],
  NOFF: ["OFF", "NO"],
  "N/O": ["OFF", "NO"],
  "N-O": ["OFF", "NO"],
  NIGHTOFF: ["OFF", "NO"],
  "NIGHT OFF": ["OFF", "NO"],
  나이트오프: ["OFF", "NO"],
  나이트후휴무: ["OFF", "NO"],
  야간후휴무: ["OFF", "NO"],
  야간후오프: ["OFF", "NO"],
  회복휴무: ["OFF", "NO"],
  나이트후회복휴무: ["OFF", "NO"],
  R: ["OFF", "R"],
  REST: ["OFF", "R"],

  VAC: ["VAC", "연차"],
  VA: ["VAC", "연차"],
  V: ["VAC", "연차"],
  AL: ["VAC", "AL"],
  PG: ["VAC", "PG"],
  연차: ["VAC", "연차"],
  휴가: ["VAC", "휴가"],
  연: ["VAC", "연차"],
  휴: ["VAC", "휴가"],
  반차: ["VAC", "반차"],
};

const EMPTY_TOKENS = new Set(["", " ", "　", "·", "•", "×", "x", "X"]);

export const BUILTIN_SHIFT_PROMPT_GUIDE = [
  "기본 근무 코드:",
  "- D / DAY / 데이 / 낮번 / 주간근무 / 오전근무 / AM / 10D / 11D => 주간 계열",
  "- E / EVE / EVENING / 이브닝 / 초번 / 오후근무 / PM => 이브닝 계열",
  "- N / NIGHT / 나이트 / 밤번 / 야간근무 => 나이트 계열",
  "- O / OF / OFF / / / // / NO / NIGHT OFF / 나이트오프 / 야간후휴무 / 회복휴무 / 휴무 / 비번 => 오프 계열",
  "- M / MD / MID / MIDDAY / H / 미드 / 미들 / 중간근무 / 보강근무 => 중간/변형 근무 계열",
  "- VAC / VA / V / AL / PG / 연차 / 휴가 / 반차 => 휴가 계열",
  "병원별 추가 코드도 자주 보임:",
  "- DE / ED / EN / EC / ND / NOD / 데브닝 / 더블듀티 / 나오데 / 이브데이",
  "위 표기는 보이는 그대로 rawLabel에 남기고, 일정 추출에서 누락하지 마세요.",
].join("\n");

function canonicalizeAliasKey(value: string) {
  return value
    .replace(/[\s·•()[\]{}]+/g, "")
    .replace(/[／/\\_-]+/g, "")
    .toUpperCase();
}

function stripKnownShiftSuffixes(value: string) {
  return value
    .replace(/\s+/g, " ")
    .trim()
    .replace(/(번|근무|교대|SHIFT)$/i, "")
    .trim();
}

function stripTrailingAnnotations(value: string) {
  return value
    .replace(/\s*[([][^()[\]]+[)\]]\s*$/g, "")
    .replace(/\s*[~·•,:;]+$/g, "")
    .trim();
}

function collectCandidateKeys(raw: string) {
  const out = new Set<string>();
  const push = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    out.add(trimmed);
    out.add(trimmed.toUpperCase());
    const canonical = canonicalizeAliasKey(trimmed);
    if (canonical) out.add(canonical);
  };

  const base = raw.trim();
  push(base);
  push(base.replace(/\s+/g, " "));

  const deannotated = stripTrailingAnnotations(base);
  if (deannotated && deannotated !== base) push(deannotated);

  const stripped = stripKnownShiftSuffixes(base);
  if (stripped !== base) push(stripped);
  if (deannotated) {
    const deannotatedStripped = stripKnownShiftSuffixes(deannotated);
    if (deannotatedStripped && deannotatedStripped !== deannotated) push(deannotatedStripped);
  }

  return Array.from(out);
}

export function buildAliasMap(customDefs: CustomShiftDef[]) {
  const map = new Map<string, [CoreShift, string]>();

  for (const [key, value] of Object.entries(BUILTIN)) {
    map.set(key.toUpperCase(), value);
    map.set(key, value);
    const canonical = canonicalizeAliasKey(key);
    if (canonical) map.set(canonical, value);
  }

  for (const def of customDefs) {
    const value: [CoreShift, string] = [def.semanticType, def.displayName];
    map.set(def.displayName.toUpperCase(), value);
    map.set(def.displayName, value);
    const displayCanonical = canonicalizeAliasKey(def.displayName);
    if (displayCanonical) map.set(displayCanonical, value);
    for (const alias of def.aliases) {
      const normalized = alias.trim();
      if (!normalized) continue;
      map.set(normalized.toUpperCase(), value);
      map.set(normalized, value);
      const canonical = canonicalizeAliasKey(normalized);
      if (canonical) map.set(canonical, value);
    }
  }

  return map;
}

export function normalizeShiftText(raw: string, aliasMap: Map<string, [CoreShift, string]>, customDefs: CustomShiftDef[]): AliasResult {
  const text = raw.trim();
  if (!text || EMPTY_TOKENS.has(text)) {
    return {
      semanticType: "OFF",
      displayName: "오프",
      fromCustom: false,
    };
  }

  const candidates = collectCandidateKeys(text);
  const direct = candidates.map((candidate) => aliasMap.get(candidate)).find(Boolean);
  if (direct) {
    const candidateSet = new Set(candidates);
    const fromCustom = customDefs.some(
      (def) =>
        collectCandidateKeys(def.displayName).some((candidate) => candidateSet.has(candidate)) ||
        def.aliases.some((alias) => collectCandidateKeys(alias).some((candidate) => candidateSet.has(candidate)))
    );
    return {
      semanticType: direct[0],
      displayName: direct[1],
      fromCustom,
    };
  }

  return null;
}
