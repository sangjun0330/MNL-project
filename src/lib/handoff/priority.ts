import type { DutyType, HandoffRiskLevel } from "./types";

type Rule = {
  pattern: RegExp;
  score: number;
  label: string;
};

const BASE_RULES: Rule[] = [
  { pattern: /(호흡|SpO2|저산소|산소|호흡곤란)/i, score: 38, label: "호흡" },
  { pattern: /(출혈|흑변|토혈|혈압\s*저하|저혈압)/i, score: 36, label: "출혈" },
  { pattern: /(항응고|엘리퀴스|와파린|헤파린)/i, score: 32, label: "항응고" },
  { pattern: /(의식|섬망|confusion|신경학)/i, score: 30, label: "의식" },
  { pattern: /(소변량|U\/O|수분출납|I\/O|I\/O|배뇨)/i, score: 24, label: "I/O" },
  { pattern: /(혈당|BST|저혈당|고혈당)/i, score: 22, label: "혈당" },
  { pattern: /(발열|체온|오한|감염|항생제)/i, score: 20, label: "감염" },
  { pattern: /(POD|수술|통증자가조절기|PCA|통증)/i, score: 18, label: "수술" },
  { pattern: /(검사|labs|CBC|헤모글로빈|Hb|K)/i, score: 16, label: "검사" },
  { pattern: /(투약|오더|재측정|재검|콜|확인)/i, score: 14, label: "오더" },
];

const NIGHT_BONUS: Rule[] = [
  { pattern: /(호흡|SpO2|저산소|산소|호흡곤란)/i, score: 12, label: "호흡" },
  { pattern: /(출혈|흑변|항응고|엘리퀴스|와파린)/i, score: 10, label: "출혈/항응고" },
  { pattern: /(의식|섬망|confusion)/i, score: 8, label: "의식" },
  { pattern: /(소변량|수분출납|배뇨)/i, score: 6, label: "I/O" },
  { pattern: /(\d{1,2}\s*시|\d{1,2}:\d{2}|새벽|오전|오후).*(투약|검사|항생제|혈당)/i, score: 6, label: "시간박힌 오더" },
];

function inferRiskLevel(score: number): HandoffRiskLevel {
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}

function inferBadge(level: HandoffRiskLevel) {
  if (level === "high") return "즉시 확인";
  if (level === "medium") return "우선 확인";
  return "모니터링";
}

function collectRuleHits(text: string, rules: Rule[]) {
  const hits: string[] = [];
  let score = 0;
  rules.forEach((rule) => {
    if (rule.pattern.test(text)) {
      score += rule.score;
      if (!hits.includes(rule.label)) hits.push(rule.label);
    }
  });
  return { score, hits };
}

export function scorePriority(text: string, dutyType: DutyType) {
  const base = collectRuleHits(text, BASE_RULES);
  const nightBonus = dutyType === "night" ? collectRuleHits(text, NIGHT_BONUS) : { score: 0, hits: [] };

  const total = Math.min(100, base.score + nightBonus.score);
  const level = inferRiskLevel(total);
  const badge = inferBadge(level);

  return {
    score: total,
    level,
    badge,
    labels: [...new Set([...base.hits, ...nightBonus.hits])],
  };
}
