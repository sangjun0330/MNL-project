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
  주간: ["D", "주간"],
  낮: ["D", "낮번"],
  낮번: ["D", "낮번"],
  AM: ["D", "AM"],
  오전: ["D", "오전번"],
  오전번: ["D", "오전번"],
  "1교대": ["D", "1교대"],

  E: ["E", "이브닝"],
  EVE: ["E", "이브닝"],
  EVENING: ["E", "이브닝"],
  이브: ["E", "이브닝"],
  이브닝: ["E", "이브닝"],
  저녁: ["E", "저녁번"],
  저녁번: ["E", "저녁번"],
  PM: ["E", "PM"],
  "2교대": ["E", "2교대"],

  N: ["N", "나이트"],
  NIGHT: ["N", "나이트"],
  나이트: ["N", "나이트"],
  야간: ["N", "야간"],
  야: ["N", "야번"],
  야번: ["N", "야번"],
  밤: ["N", "밤번"],
  밤번: ["N", "밤번"],
  "3교대": ["N", "3교대"],

  M: ["M", "미들"],
  MID: ["M", "미들"],
  MIDDLE: ["M", "미들"],
  미들: ["M", "미들"],
  중간: ["M", "미들"],
  중간번: ["M", "미들"],

  OFF: ["OFF", "오프"],
  O: ["OFF", "오프"],
  "-": ["OFF", "오프"],
  "_": ["OFF", "오프"],
  "/": ["OFF", "오프"],
  공: ["OFF", "공휴일"],
  공휴일: ["OFF", "공휴일"],
  쉬는날: ["OFF", "오프"],
  쉬는: ["OFF", "오프"],
  오프: ["OFF", "오프"],
  비번: ["OFF", "비번"],
  비: ["OFF", "비번"],

  VAC: ["VAC", "연차"],
  VA: ["VAC", "연차"],
  V: ["VAC", "연차"],
  연차: ["VAC", "연차"],
  휴가: ["VAC", "휴가"],
  연: ["VAC", "연차"],
  휴: ["VAC", "휴가"],
  반차: ["VAC", "반차"],
};

const EMPTY_TOKENS = new Set(["", " ", "　", "·", "•", "×", "x", "X"]);

export function buildAliasMap(customDefs: CustomShiftDef[]) {
  const map = new Map<string, [CoreShift, string]>();

  for (const [key, value] of Object.entries(BUILTIN)) {
    map.set(key.toUpperCase(), value);
    map.set(key, value);
  }

  for (const def of customDefs) {
    const value: [CoreShift, string] = [def.semanticType, def.displayName];
    map.set(def.displayName.toUpperCase(), value);
    map.set(def.displayName, value);
    for (const alias of def.aliases) {
      const normalized = alias.trim();
      if (!normalized) continue;
      map.set(normalized.toUpperCase(), value);
      map.set(normalized, value);
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

  const upper = text.toUpperCase();
  const direct = aliasMap.get(upper) ?? aliasMap.get(text);
  if (direct) {
    const fromCustom = customDefs.some(
      (def) =>
        def.displayName === text ||
        def.displayName.toUpperCase() === upper ||
        def.aliases.some((alias) => alias.toUpperCase() === upper)
    );
    return {
      semanticType: direct[0],
      displayName: direct[1],
      fromCustom,
    };
  }

  for (const [key, value] of aliasMap.entries()) {
    if (key.length < 2) continue;
    if (!text.includes(key)) continue;
    return {
      semanticType: value[0],
      displayName: text,
      fromCustom: false,
    };
  }

  return null;
}
