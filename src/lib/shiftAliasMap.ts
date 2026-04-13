/**
 * shiftAliasMap.ts
 *
 * OCR로 인식된 셀 텍스트를 CoreShift + 표시명으로 정규화하는 유틸리티.
 * Python 없이 브라우저에서 직접 실행됩니다.
 */

import type { CoreShift, CustomShiftDef } from "@/lib/model";

export type NormalizedShift = {
  /** 의미 타입 — AI/회복 분석용 */
  semanticType: CoreShift;
  /** 사용자에게 표시될 이름 ("낮번", "야간특" 등) */
  displayName: string;
  /** 커스텀 정의에서 매칭됐는지 여부 */
  fromCustom: boolean;
};

/** raw 텍스트 → { semanticType, displayName } | null (인식 불가) */
export type AliasResult = NormalizedShift | null;

// ────────────────────────────────────────────────────────────
// 기본 내장 별칭 사전
// key: 정규화된 대문자 텍스트
// value: [semanticType, displayName]
// ────────────────────────────────────────────────────────────
const BUILTIN: Record<string, [CoreShift, string]> = {
  // ── 주간 (D) ──
  D: ["D", "주간"],
  DAY: ["D", "주간"],
  주간: ["D", "주간"],
  낮: ["D", "낮번"],
  낮번: ["D", "낮번"],
  AM: ["D", "AM"],
  "A번": ["D", "A번"],
  오전: ["D", "오전번"],
  오전번: ["D", "오전번"],
  "1교대": ["D", "1교대"],

  // ── 이브닝 (E) ──
  E: ["E", "이브닝"],
  EVE: ["E", "이브닝"],
  EVENING: ["E", "이브닝"],
  이브: ["E", "이브닝"],
  이브닝: ["E", "이브닝"],
  저녁: ["E", "저녁번"],
  저녁번: ["E", "저녁번"],
  PM: ["E", "PM"],
  "P번": ["E", "P번"],
  "2교대": ["E", "2교대"],

  // ── 나이트 (N) ──
  N: ["N", "나이트"],
  NIGHT: ["N", "나이트"],
  나이트: ["N", "나이트"],
  나: ["N", "나이트"],
  야간: ["N", "야간"],
  야: ["N", "야번"],
  야번: ["N", "야번"],
  밤: ["N", "밤번"],
  밤번: ["N", "밤번"],
  "3교대": ["N", "3교대"],

  // ── 미들 (M) ──
  M: ["M", "미들"],
  MID: ["M", "미들"],
  MIDDLE: ["M", "미들"],
  미들: ["M", "미들"],
  중간: ["M", "미들"],
  "중간번": ["M", "미들"],

  // ── 오프 (OFF) ──
  OFF: ["OFF", "오프"],
  O: ["OFF", "오프"],
  "-": ["OFF", "오프"],
  "_": ["OFF", "오프"],
  "/": ["OFF", "오프"],
  "공": ["OFF", "공휴일"],
  공휴일: ["OFF", "공휴일"],
  쉬는날: ["OFF", "오프"],
  쉬는: ["OFF", "오프"],
  오프: ["OFF", "오프"],
  비번: ["OFF", "비번"],
  비: ["OFF", "비번"],

  // ── 연차/휴가 (VAC) ──
  VAC: ["VAC", "연차"],
  VA: ["VAC", "연차"],
  V: ["VAC", "연차"],
  연차: ["VAC", "연차"],
  휴가: ["VAC", "휴가"],
  연: ["VAC", "연차"],
  휴: ["VAC", "휴가"],
  반차: ["VAC", "반차"],
};

// 빈 셀 / 구분자 → OFF로 처리
const EMPTY_TOKENS = new Set(["", " ", "　", "·", "•", "×", "x", "X"]);

/**
 * 사용자 정의 CustomShiftDef[] + 내장 별칭을 합쳐
 * 실행 시간 룩업 맵을 생성합니다.
 */
export function buildAliasMap(
  customDefs: CustomShiftDef[]
): Map<string, [CoreShift, string]> {
  const map = new Map<string, [CoreShift, string]>();

  // 내장 별칭 먼저 삽입
  for (const [key, val] of Object.entries(BUILTIN)) {
    map.set(key.toUpperCase(), val);
    map.set(key, val); // 원본 케이스도 저장
  }

  // 커스텀 정의로 덮어쓰기 (사용자 설정 우선)
  for (const def of customDefs) {
    const entry: [CoreShift, string] = [def.semanticType, def.displayName];
    // displayName 자체를 키로 등록
    map.set(def.displayName.toUpperCase(), entry);
    map.set(def.displayName, entry);
    // 별칭들도 등록
    for (const alias of def.aliases) {
      if (!alias.trim()) continue;
      map.set(alias.trim().toUpperCase(), entry);
      map.set(alias.trim(), entry);
    }
  }

  return map;
}

/**
 * OCR 셀 텍스트 → NormalizedShift | null
 *
 * - 매칭 성공: { semanticType, displayName, fromCustom }
 * - 매칭 실패: null  (UI에서 "알 수 없는 근무" 처리)
 */
export function normalizeShiftText(
  raw: string,
  aliasMap: Map<string, [CoreShift, string]>,
  customDefs: CustomShiftDef[]
): AliasResult {
  const t = raw.trim();

  // 빈 셀 → OFF
  if (!t || EMPTY_TOKENS.has(t)) {
    return { semanticType: "OFF", displayName: "오프", fromCustom: false };
  }

  // 1) 정확 일치 (대소문자 무시)
  const upper = t.toUpperCase();
  const hit = aliasMap.get(upper) ?? aliasMap.get(t);
  if (hit) {
    const fromCustom = customDefs.some(
      (d) =>
        d.displayName === t ||
        d.displayName.toUpperCase() === upper ||
        d.aliases.some((a) => a.toUpperCase() === upper)
    );
    return { semanticType: hit[0], displayName: hit[1], fromCustom };
  }

  // 2) 부분 포함 매칭 (짧은 키워드가 텍스트 안에 포함될 때)
  //    예: "낮번(특)" → "낮번" 매칭
  for (const [key, val] of aliasMap) {
    if (key.length >= 2 && t.includes(key)) {
      return { semanticType: val[0], displayName: t, fromCustom: false };
    }
  }

  // 매칭 실패
  return null;
}

// ────────────────────────────────────────────────────────────
// 한국어 이름 판별 유틸
// ────────────────────────────────────────────────────────────
const KOREAN_NAME_RE = /^[가-힣]{2,4}$/;

/**
 * 근무 코드가 아닌 한국어 이름일 가능성이 높은 셀인지 판별
 * (다인 근무표에서 이름 컬럼 감지용)
 */
export function isLikelyKoreanName(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  // 알려진 근무 코드는 이름이 아님
  if (BUILTIN[t] || BUILTIN[t.toUpperCase()]) return false;
  return KOREAN_NAME_RE.test(t);
}
