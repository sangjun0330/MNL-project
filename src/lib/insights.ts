import type { DailyVital } from "@/lib/vitals";
import type { Shift } from "@/lib/types";

export type ShiftMoodStat = {
  shift: Shift;
  days: number;
  avgMental: number; // EMA 평균
  avgBody: number;
};

export function computeShiftStats(vitals: DailyVital[]): ShiftMoodStat[] {
  const shifts: Shift[] = ["D", "E", "N", "M", "OFF", "VAC"];
  const rows: ShiftMoodStat[] = [];

  for (const s of shifts) {
    const list = vitals.filter((v) => v.shift === s);
    if (list.length === 0) {
      rows.push({ shift: s, days: 0, avgMental: 0, avgBody: 0 });
      continue;
    }
    const avgMental = list.reduce((a, b) => a + b.mental.ema, 0) / list.length;
    const avgBody = list.reduce((a, b) => a + b.body.value, 0) / list.length;
    rows.push({ shift: s, days: list.length, avgMental, avgBody });
  }

  // ✅ 인사이트 페이지가 "높은 순 정렬"을 기대하므로 정렬을 여기서 보장
  rows.sort((a, b) => b.avgMental - a.avgMental);
  return rows;
}

export function bestShift(stat: ShiftMoodStat[]) {
  const filtered = stat.filter((r) => r.days > 0);
  if (filtered.length === 0) return null;
  return filtered.reduce((best, cur) => (cur.avgMental > best.avgMental ? cur : best), filtered[0]);
}

export function worstShift(stat: ShiftMoodStat[]) {
  const filtered = stat.filter((r) => r.days > 0);
  if (filtered.length === 0) return null;
  return filtered.reduce((best, cur) => (cur.avgMental < best.avgMental ? cur : best), filtered[0]);
}

export type WardWeather = {
  title: string;
  // ✅ InsightsPage에서 weather.detail을 사용하므로 detail로 맞춰줌(호환)
  detail: string;
  topTags: Array<{ tag: string; count: number }>;
};

export function computeWardWeather(vitals: DailyVital[]): WardWeather {
  // NOTE: 실제 서비스에선 전체 사용자 집계가 필요하지만,
  // PWA MVP에서는 "내 데이터" 기반으로 병동날씨를 만들어줍니다.
  const last7 = vitals.slice(-7);
  const freq = new Map<string, number>();

  for (const v of last7) {
    for (const t of v.emotion?.tags ?? []) {
      if (!t.startsWith("#")) continue;
      freq.set(t, (freq.get(t) ?? 0) + 1);
    }
  }

  const topTags = [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag, count]) => ({ tag, count }));

  const avg = last7.reduce((a, b) => a + b.mental.ema, 0) / Math.max(1, last7.length);
  const title =
    avg >= 70 ? "매우 맑음 ☀️" : avg >= 50 ? "대체로 맑음 🌤️" : avg >= 35 ? "흐림 ☁️" : "폭풍우 🌩️";

  const detail = topTags.length
    ? `최근 7일 키워드: ${topTags.slice(0, 3).map((t) => t.tag).join(" ")}`
    : "최근 7일 키워드 기록이 없어요";

  return { title, detail, topTags };
}

/**
 * ✅ InsightsPage가 호출하는 함수
 * - Mental(EMA) 기준으로 베스트/워스트 day를 뽑는다.
 */
export function bestAndWorstDay(vitals: DailyVital[]) {
  const list = vitals.filter((v) => Number.isFinite(v.mental?.ema));
  if (list.length === 0) return { best: null as DailyVital | null, worst: null as DailyVital | null };

  let best = list[0];
  let worst = list[0];

  for (const v of list) {
    if (v.mental.ema > best.mental.ema) best = v;
    if (v.mental.ema < worst.mental.ema) worst = v;
  }

  return { best, worst };
}
