import type { DailyVital } from "@/lib/vitals";

export type SvgCard = {
  svg: string;
  width: number;
  height: number;
  filename: string;
};

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function moodEmoji(m: number) {
  if (m <= 1) return "☹️";
  if (m === 2) return "😕";
  if (m === 3) return "😐";
  if (m === 4) return "🙂";
  return "😄";
}

function careInstruction(v: DailyVital) {
  if (v.mental.ema <= 20) return "질문 금지 / 수면 보장 / 치킨 요망";
  if (v.mental.ema <= 40) return "가벼운 대화만 / 공간 필요";
  if (v.body.value <= 30) return "휴식 우선 / 일정 최소화";
  return "평소처럼 대해도 OK";
}

export function buildGuardianCard(v: DailyVital): SvgCard {
  const width = 1080;
  const height = 1350;

  const body = Math.round(v.body.value);
  const mental = Math.round(v.mental.ema);

  const tags = (v.emotion?.tags ?? []).slice(0, 4).join(" ");
  const emoji = moodEmoji(v.inputs.mood ?? 3);
  const phase = v.menstrual.enabled && v.menstrual.dayInCycle ? `${v.menstrual.label} · D${v.menstrual.dayInCycle}` : "주기 미설정";

  const instr = careInstruction(v);

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="100%" stop-color="#F5F5F7"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${width}" height="${height}" rx="64" fill="url(#bg)"/>

  <text x="84" y="140" font-size="56" font-family="system-ui, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR'" font-weight="800" fill="#111">
    To. Guardian
  </text>
  <text x="84" y="200" font-size="30" font-family="system-ui, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR'" font-weight="600" fill="rgba(0,0,0,0.55)">
    오늘의 사용 설명서 · ${esc(v.dateISO)}
  </text>

  <g transform="translate(84,260)">
    <rect x="0" y="0" width="912" height="230" rx="44" fill="#FFFFFF" stroke="rgba(0,0,0,0.08)"/>
    <text x="48" y="78" font-size="34" font-weight="800" font-family="system-ui, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR'" fill="#111">
      ${emoji} 지금 상태
    </text>
    <text x="48" y="132" font-size="28" font-weight="700" font-family="system-ui, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR'" fill="rgba(0,0,0,0.60)">
      ${esc(tags || "#태그없음")}
    </text>
    <text x="48" y="186" font-size="26" font-weight="700" font-family="system-ui, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR'" fill="rgba(0,0,0,0.50)">
      ${esc(phase)}
    </text>
  </g>

  <g transform="translate(84,520)">
    <rect x="0" y="0" width="912" height="300" rx="44" fill="#FFFFFF" stroke="rgba(0,0,0,0.08)"/>
    <text x="48" y="82" font-size="30" font-weight="800" font-family="system-ui, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR'" fill="rgba(0,0,0,0.55)">
      배터리
    </text>

    <text x="48" y="160" font-size="56" font-weight="900" font-family="system-ui, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR'" fill="#00C7BE">
      Body ${body}%
    </text>
    <text x="48" y="232" font-size="56" font-weight="900" font-family="system-ui, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR'" fill="#FF8A80">
      Mental ${mental}%
    </text>
  </g>

  <g transform="translate(84,850)">
    <rect x="0" y="0" width="912" height="360" rx="44" fill="#FFFFFF" stroke="rgba(0,0,0,0.08)"/>
    <text x="48" y="82" font-size="34" font-weight="900" font-family="system-ui, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR'" fill="#111">
      취급 주의사항
    </text>
    <text x="48" y="150" font-size="30" font-weight="700" font-family="system-ui, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR'" fill="rgba(0,0,0,0.70)">
      ${esc(instr)}
    </text>
    <text x="48" y="220" font-size="26" font-weight="700" font-family="system-ui, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR'" fill="rgba(0,0,0,0.45)">
      ${esc(v.insight ?? v.burnout.reason)}
    </text>
  </g>

  <text x="84" y="1285" font-size="24" font-weight="700" font-family="system-ui, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR'" fill="rgba(0,0,0,0.35)">
    RNest · Emotion Vital
  </text>
</svg>`;

  return {
    svg,
    width,
    height,
    filename: `Guardian_${v.dateISO}.png`,
  };
}

export function buildSurvivalReportCard(v: DailyVital): SvgCard {
  const width = 1080;
  const height = 1350;

  const body = Math.round(v.body.value);
  const mental = Math.round(v.mental.ema);

  const tags = (v.emotion?.tags ?? []).slice(0, 6).join(" ");

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="${width}" height="${height}" fill="#FFFFFF"/>
  <rect x="60" y="80" width="960" height="1190" rx="48" fill="#F7F7F9" stroke="rgba(0,0,0,0.08)"/>

  <text x="120" y="170" font-size="44" font-weight="900" font-family="system-ui, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR'" fill="#111">
    간호 생존 신고서
  </text>
  <text x="120" y="220" font-size="26" font-weight="700" font-family="system-ui, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR'" fill="rgba(0,0,0,0.50)">
    ${esc(v.dateISO)} · Shift ${esc(v.shift)}
  </text>

  <line x1="120" y1="260" x2="960" y2="260" stroke="rgba(0,0,0,0.10)"/>

  <text x="120" y="340" font-size="30" font-weight="800" font-family="system-ui, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR'" fill="rgba(0,0,0,0.55)">
    BODY BATTERY
  </text>
  <text x="120" y="410" font-size="62" font-weight="900" font-family="system-ui, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR'" fill="#00C7BE">
    ${body}%
  </text>

  <text x="120" y="520" font-size="30" font-weight="800" font-family="system-ui, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR'" fill="rgba(0,0,0,0.55)">
    MENTAL VITAL (EMA)
  </text>
  <text x="120" y="590" font-size="62" font-weight="900" font-family="system-ui, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR'" fill="#FF8A80">
    ${mental}%
  </text>

  <text x="120" y="700" font-size="30" font-weight="800" font-family="system-ui, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR'" fill="rgba(0,0,0,0.55)">
    KEYWORDS
  </text>
  <text x="120" y="760" font-size="28" font-weight="800" font-family="system-ui, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR'" fill="rgba(0,0,0,0.70)">
    ${esc(tags || "#태그없음")}
  </text>

  <text x="120" y="890" font-size="30" font-weight="800" font-family="system-ui, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR'" fill="rgba(0,0,0,0.55)">
    TODAY’S NOTE
  </text>
  <text x="120" y="950" font-size="26" font-weight="700" font-family="system-ui, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR'" fill="rgba(0,0,0,0.60)">
    ${esc((v.note ?? "기록 없음").slice(0, 80))}
  </text>

  <text x="120" y="1120" font-size="24" font-weight="700" font-family="system-ui, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR'" fill="rgba(0,0,0,0.35)">
    RNest · Survival Report
  </text>
</svg>`;

  return { svg, width, height, filename: `Survival_${v.dateISO}.png` };
}
