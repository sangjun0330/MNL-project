import type { DutyType, HandoffRiskLevel, RiskCode, RiskItem } from "./types";

type RiskRule = {
  code: RiskCode;
  weight: number;
  pattern: RegExp;
  rationale: string;
  actions: string[];
};

const RISK_RULES: RiskRule[] = [
  {
    code: "AIRWAY",
    weight: 40,
    pattern: /(기도|airway|삽관|ETT|기도폐쇄|흡인)/i,
    rationale: "기도 관련 위험 신호가 포함되어 즉시 확인이 필요합니다.",
    actions: ["기도 개방/튜브 위치 확인", "산소공급 상태 재점검", "기관 프로토콜에 따라 즉시 보고"],
  },
  {
    code: "BREATHING",
    weight: 40,
    pattern: /(호흡곤란|저산소|SpO2|산소포화도|환기|ventilator|호흡수)/i,
    rationale: "호흡 관련 급성 악화 가능성이 있습니다.",
    actions: ["호흡수/SpO2 즉시 재확인", "산소장치/회로 점검", "악화 시 즉시 보고"],
  },
  {
    code: "CIRCULATION",
    weight: 40,
    pattern: /(저혈압|MAP|쇼크|혈압\s*\d{2,3}\s*\/\s*\d{2,3}|순환)/i,
    rationale: "순환 저하 신호가 있어 우선 조치가 필요합니다.",
    actions: ["혈압/MAP 재측정", "라인/펌프 상태 확인", "승압제 조정 여부 기관 기준 확인"],
  },
  {
    code: "CIRCULATION",
    weight: 36,
    pattern: /(소변량|섭취\/?배설량|I\/O|urine\s*output|요량|oliguria)/i,
    rationale: "소변량/I/O 변화가 있어 순환·신장 관류 저하 가능성을 확인해야 합니다.",
    actions: ["소변량/I/O 추이 즉시 재확인", "수액/혈역학 상태 동시 점검", "기관 기준에 따라 보고/오더 확인"],
  },
  {
    code: "BLEEDING",
    weight: 30,
    pattern: /(출혈|흑변|혈변|토혈|멍|aPTT|응고|헤파린)/i,
    rationale: "출혈 또는 응고 이상 가능성이 시사됩니다.",
    actions: ["흑변/항응고 포함 출혈 징후 재평가", "응고수치 확인", "항응고제 투여 상태 기관 기준 확인"],
  },
  {
    code: "SEPSIS",
    weight: 25,
    pattern: /(발열|오한|패혈|sepsis|감염|중심정맥관|CRP|WBC)/i,
    rationale: "감염/패혈증 위험 신호를 포함합니다.",
    actions: ["체온/활력징후 재평가", "배양/검사 진행 상태 확인", "악화 징후 즉시 보고"],
  },
  {
    code: "ARRHYTHMIA",
    weight: 25,
    pattern: /(부정맥|arrhythmia|AF|VF|VT|서맥|빈맥)/i,
    rationale: "리듬 이상 가능성이 있어 모니터링 강화가 필요합니다.",
    actions: ["심전도/모니터 리듬 확인", "증상 동반 여부 확인", "기관 기준에 따라 즉시 보고"],
  },
  {
    code: "HIGH_ALERT_MED",
    weight: 20,
    pattern: /(vasopressor|노르에피|인슐린|헤파린|opioid|KCl|진정제|sedative)/i,
    rationale: "고위험 약물 관련 항목이 포함되어 있습니다.",
    actions: ["약물명/속도/경로 더블체크", "펌프 설정 재확인", "기관 고위험약 프로토콜 준수 확인"],
  },
  {
    code: "DEVICE_FAILURE",
    weight: 15,
    pattern: /(high pressure|occlusion|알람|기기오류|pump failure|vent alarm)/i,
    rationale: "기기 알람/고장 가능성이 감지됩니다.",
    actions: ["기기/라인 연결상태 점검", "알람 원인 확인 후 해소", "지속 알람 시 즉시 보고"],
  },
  {
    code: "NEURO_CHANGE",
    weight: 20,
    pattern: /(의식저하|섬망|신경학적|neuro|지남력 저하|동공)/i,
    rationale: "신경학적 상태 변화 가능성이 있습니다.",
    actions: ["신경학적 사정 재실시", "의식 수준 추적", "악화 시 즉시 보고"],
  },
  {
    code: "ALLERGY_REACTION",
    weight: 20,
    pattern: /(알레르기|allergy|두드러기|아나필락시스|호흡곤란.*약)/i,
    rationale: "약물/물질 반응 위험 신호가 있습니다.",
    actions: ["노출 약물 확인", "호흡/혈압 상태 확인", "기관 프로토콜 따라 즉시 조치"],
  },
  {
    code: "TRANSFUSION_REACTION",
    weight: 20,
    pattern: /(수혈|transfusion|오한.*수혈|발열.*수혈)/i,
    rationale: "수혈 반응 가능성을 시사합니다.",
    actions: ["수혈 진행 상태 확인", "반응 징후 재평가", "기관 기준 따라 즉시 보고"],
  },
  {
    code: "ELECTROLYTE_CRITICAL",
    weight: 15,
    pattern: /(KCl|칼륨|나트륨|electrolyte|저나트륨|고나트륨|저칼륨|고칼륨)/i,
    rationale: "전해질 이상 가능성이 있습니다.",
    actions: ["전해질 수치 재확인", "이상 수치 보고 및 조치 확인", "심전도/증상 동반 여부 확인"],
  },
  {
    code: "GLUCOSE_CRITICAL",
    weight: 15,
    pattern: /(저혈당|고혈당|혈당\s*\d+|insulin sliding|인슐린)/i,
    rationale: "혈당 급변 가능성이 포함되어 있습니다.",
    actions: ["혈당 재측정", "저/고혈당 프로토콜 확인", "증상 동반 시 즉시 보고"],
  },
  {
    code: "FALL_RISK",
    weight: 12,
    pattern: /(낙상|보행불안정|assist 필요|bed alarm)/i,
    rationale: "낙상 위험 인자가 있습니다.",
    actions: ["낙상 예방수칙 재적용", "침상/보행 보조 강화", "고위험 환자 표식 확인"],
  },
  {
    code: "PRESSURE_INJURY",
    weight: 10,
    pattern: /(욕창|압박손상|pressure injury|체위변경)/i,
    rationale: "피부 손상 위험 인자가 포함됩니다.",
    actions: ["체위변경 계획 확인", "피부 상태 점검", "예방 패드/도구 적용 확인"],
  },
];

const URGENCY_KEYWORD_PATTERN = /(즉시|바로|응급|호흡곤란|의식저하|긴급)/i;

function riskLevelFromScore(score: number): HandoffRiskLevel {
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}

function badgeFromLevel(level: HandoffRiskLevel) {
  if (level === "high") return "즉시 확인";
  if (level === "medium") return "우선 확인";
  return "모니터링";
}

function rankRiskScore(score: number, dutyType: DutyType) {
  const nightBonus = dutyType === "night" ? 4 : 0;
  return Math.min(100, score + nightBonus);
}

export function evaluateRisksFromText(text: string, dutyType: DutyType): RiskItem[] {
  const urgencyBonus = URGENCY_KEYWORD_PATTERN.test(text) ? 20 : 0;
  const matched = RISK_RULES.filter((rule) => rule.pattern.test(text));

  return matched
    .map((rule) => ({
      code: rule.code,
      score: rankRiskScore(rule.weight + urgencyBonus, dutyType),
      rationale: rule.rationale,
      actions: rule.actions,
    }))
    .sort((a, b) => b.score - a.score);
}

export function scorePriority(text: string, dutyType: DutyType) {
  const risks = evaluateRisksFromText(text, dutyType);
  const score = risks.length ? risks[0].score : rankRiskScore(12 + (URGENCY_KEYWORD_PATTERN.test(text) ? 8 : 0), dutyType);
  const level = riskLevelFromScore(score);
  const badge = badgeFromLevel(level);

  return {
    score,
    level,
    badge,
    labels: risks.map((risk) => risk.code),
  };
}
