import type { ISODate } from "@/lib/date";
import { addDays, fromISODate, toISODate } from "@/lib/date";
import type { Shift } from "@/lib/types";

/**
 * Pattern utilities
 *
 * Supported tokens:
 *  - D, E, N, M
 *  - OFF (OFF, O, -, _, 0)
 *  - VAC (VAC, VA, V)
 *
 * Supported formats:
 *  - "D D E E N N OFF OFF"
 *  - "DDEENN--"
 *  - "D2 E2 N2 OFF2"
 *  - "D2E2N2OFF2"   ✅ no spaces
 */
export function parsePattern(input: string): Shift[] {
  const raw = (input ?? "").trim();
  if (!raw) return [];
  const up = raw.toUpperCase();

  const mapToken = (t: string): Shift | null => {
    if (t === "OFF" || t === "O" || t === "-" || t === "_" || t === "0") return "OFF";
    if (t === "VAC" || t === "VA" || t === "V") return "VAC";
    if (t === "D" || t === "DAY") return "D";
    if (t === "E" || t === "EVE") return "E";
    if (t === "N" || t === "NIGHT") return "N";
    if (t === "M" || t === "MID" || t === "MIDDLE") return "M";

    // 아주 약한 한글 허용(옵션)
    if (t.includes("오")) return "OFF";
    if (t.includes("연") || t.includes("휴")) return "VAC";
    if (t.includes("데") || t.includes("주")) return "D";
    if (t.includes("이") || t.includes("석")) return "E";
    if (t.includes("나")) return "N";
    if (t.includes("미")) return "M";
    return null;
  };

  const clampCount = (n: number) => Math.max(1, Math.min(365, Math.floor(n)));

  const out: Shift[] = [];

  // 1) 공백/구분자 있는 케이스
  if (/[\s,\/|]+/.test(up)) {
    const parts = up.split(/[\s,\/|]+/).filter(Boolean);
    for (const part of parts) {
      const m = part.match(/^([A-Z가-힣\-_0]+)(\d+)?$/);
      const base = (m?.[1] ?? part).trim();
      const count = m?.[2] ? clampCount(Number(m[2])) : 1;

      const s = mapToken(base);
      if (s) {
        for (let i = 0; i < count; i++) out.push(s);
        continue;
      }

      // "DDEENN--" 같은 것도 여기서 들어올 수 있으니 fallback
      const re2 = /(OFF|VAC|VA|D|E|N|M|O|-|_|0|V)/g;
      const tokens = base.match(re2) ?? [];
      for (const tk of tokens) {
        const ss = mapToken(tk);
        if (ss) out.push(ss);
      }
    }
    return out;
  }

  // 2) 구분자 없는 케이스: "D2E2N2OFF2", "DDEENN--"
  const re = /(OFF|VAC|VA|D|E|N|M|O|-|_|0|V)(\d+)?/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(up)) !== null) {
    const base = match[1];
    const count = match[2] ? clampCount(Number(match[2])) : 1;
    const s = mapToken(base);
    if (s) for (let i = 0; i < count; i++) out.push(s);
  }

  return out;
}

export function applyPatternToSchedule(params: {
  pattern: Shift[];
  startISO: ISODate;
  days: number;
  mode: "overwrite" | "fill-empty";
  existing: Record<ISODate, Shift | undefined>;
}): Record<ISODate, Shift> {
  const { pattern, startISO, days, mode, existing } = params;
  if (!pattern.length || days <= 0) return {};

  const patch: Record<ISODate, Shift> = {};
  let idx = 0;

  const start = fromISODate(startISO);
  const total = Math.max(1, Math.min(365, Math.floor(days)));

  for (let i = 0; i < total; i++) {
    const iso = toISODate(addDays(start, i));
    const val = pattern[idx % pattern.length];
    idx++;

    if (mode === "fill-empty") {
      if (existing[iso] == null) patch[iso] = val;
    } else {
      patch[iso] = val;
    }
  }

  return patch;
}
