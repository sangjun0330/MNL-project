import { evaluateRisksFromText, scorePriority } from "./priority";
import type {
  ClinicalEntity,
  DutyType,
  GlobalTop3Item,
  GlobalTopItem,
  MaskedSegment,
  PatientCard,
  PatientProblem,
  PatientRisk,
  PatientTodo,
  PatientTopItem,
  RiskItem,
  TodoDue,
  TodoItem,
} from "./types";

type StructureInput = {
  patientSegments: Record<string, MaskedSegment[]>;
  dutyType: DutyType;
};

const MED_PATTERN =
  /(투약|주입|infusion|vasopressor|노르에피|인슐린|헤파린|항생제|약물|펌프|속도|경구|정맥|PRN|opioid|KCl)/i;
const LINE_PATTERN = /(PIV|CVC|PICC|A-line|Foley|NG|ETT|Drain|라인|카테터|튜브)/i;
const LAB_PATTERN =
  /(검사|CBC|CRP|WBC|Hb|헤모글로빈|aPTT|결과|수치|전해질|Na|K|glucose|혈당)/i;
const STATUS_PATTERN = /(혈압|맥박|호흡|SpO2|산소포화도|체온|의식|통증|소변량|I\/O|상태|유지|안정|악화)/i;
const PLAN_PATTERN =
  /(확인|재확인|재측정|재검|콜|보고|오더|추적|모니터|체크|평가|follow\s*up|repeat|시행|조정)/i;
const WATCH_FOR_PATTERN = /(주의|watch|악화|저하|상승|낙상|출혈|호흡곤란|의식저하|알람)/i;
const ABNORMAL_PATTERN =
  /(저혈압|고혈압|저산소|호흡곤란|출혈|흑변|통증|발열|고열|저체온|저혈당|고혈당|감염|쇼크|섬망|의식\s*저하|소변량\s*감소|critical)/i;
const DUE_NOW_PATTERN = /(즉시|바로|응급|지금|STAT)/i;
const DUE_1H_PATTERN = /(1시간|한시간|within\s*1h|새벽|30분)/i;
const DUE_TODAY_PATTERN = /(오늘|금일|당일|오전|오후|저녁|밤)/i;
const DUE_NEXT_SHIFT_PATTERN = /(다음\s*근무|다음\s*인계|익일|내일)/i;

function normalizeSentence(text: string) {
  return text
    .replace(/^PATIENT_[A-Z0-9]+\s*[:,-]?\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupeStrings(values: string[], max: number) {
  const seen = new Set<string>();
  const out: string[] = [];
  values.forEach((value) => {
    const normalized = value.replace(/\s+/g, " ").trim();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    out.push(normalized);
  });
  return out.slice(0, max);
}

function riskLevelFromScore(score: number): "high" | "medium" | "low" {
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}

function parseDue(text: string): TodoDue | undefined {
  if (DUE_NOW_PATTERN.test(text)) return "now";
  if (DUE_1H_PATTERN.test(text)) return "within_1h";
  if (DUE_TODAY_PATTERN.test(text)) return "today";
  if (DUE_NEXT_SHIFT_PATTERN.test(text)) return "next_shift";
  return undefined;
}

function parseOwner(text: string): "RN" | "MD" | "RT" | "LAB" | undefined {
  if (/(검사|CBC|CRP|WBC|LAB|배양|수치)/i.test(text)) return "LAB";
  if (/(호흡|산소|vent|기도|SpO2)/i.test(text)) return "RT";
  if (/(처방|오더|의사|MD)/i.test(text)) return "MD";
  if (/(간호|드레싱|관찰|투약|모니터)/i.test(text)) return "RN";
  return undefined;
}

function inferTodoPriority(score: number): "P0" | "P1" | "P2" {
  if (score >= 70) return "P0";
  if (score >= 40) return "P1";
  return "P2";
}

function extractEntities(text: string): ClinicalEntity[] {
  const entities: ClinicalEntity[] = [];

  const bp = text.match(/(?:혈압|BP)\s*(\d{2,3})\s*\/\s*(\d{2,3})/i);
  if (bp) {
    entities.push({
      kind: "VITAL",
      name: "BP",
      value: Number(bp[1]),
      unit: "mmHg",
    });
  }

  const hr = text.match(/(?:맥박|HR)\s*(\d{2,3})/i);
  if (hr) {
    entities.push({
      kind: "VITAL",
      name: "HR",
      value: Number(hr[1]),
      unit: "bpm",
    });
  }

  const rr = text.match(/(?:호흡수|RR)\s*(\d{1,2})/i);
  if (rr) {
    entities.push({
      kind: "VITAL",
      name: "RR",
      value: Number(rr[1]),
      unit: "bpm",
    });
  }

  const spo2 = text.match(/(?:SpO2|산소포화도)\s*(\d{2,3})\s*%?/i);
  if (spo2) {
    entities.push({
      kind: "VITAL",
      name: "SpO2",
      value: Number(spo2[1]),
      unit: "%",
    });
  }

  const temp = text.match(/(?:체온|Temp)\s*(\d{2}(?:\.\d+)?)/i);
  if (temp) {
    entities.push({
      kind: "VITAL",
      name: "Temp",
      value: Number(temp[1]),
      unit: "C",
    });
  }

  if (MED_PATTERN.test(text)) {
    const highRisk = /(vasopressor|노르에피|인슐린|헤파린|opioid|KCl|진정제|sedative)/i.test(text);
    entities.push({
      kind: "MED",
      name: text.slice(0, 36),
      isHighRisk: highRisk,
    });
  }

  const lineMap: Array<{ pattern: RegExp; name: Extract<ClinicalEntity, { kind: "LINE" }>["name"] }> = [
    { pattern: /PIV/i, name: "PIV" },
    { pattern: /CVC|PICC|central/i, name: "CVC" },
    { pattern: /A-line/i, name: "A-line" },
    { pattern: /Foley|유치도뇨/i, name: "Foley" },
    { pattern: /NG|L-tube/i, name: "NG" },
    { pattern: /ETT|기관튜브/i, name: "ETT" },
    { pattern: /Drain|배액관/i, name: "Drain" },
  ];
  lineMap.forEach((candidate) => {
    if (!candidate.pattern.test(text)) return;
    entities.push({
      kind: "LINE",
      name: candidate.name,
      details: text.slice(0, 40),
    });
  });

  if (LAB_PATTERN.test(text)) {
    entities.push({
      kind: "LAB",
      name: text.slice(0, 40),
      flag: /critical|위험|상승|저하/i.test(text) ? "critical" : undefined,
    });
  }

  if (/(알람|alarm|high pressure|occlusion)/i.test(text)) {
    entities.push({
      kind: "ALARM",
      name: "device_alarm",
      context: text.slice(0, 60),
    });
  }

  if (PLAN_PATTERN.test(text)) {
    entities.push({
      kind: "PLAN",
      text,
    });
  }

  return entities;
}

function buildPlanFromSegments(
  facts: Array<{ text: string; score: number; evidenceRef: MaskedSegment["evidenceRef"] }>
) {
  const plans: TodoItem[] = [];

  facts.forEach((fact) => {
    if (!PLAN_PATTERN.test(fact.text)) return;
    plans.push({
      priority: inferTodoPriority(fact.score),
      task: fact.text,
      due: parseDue(fact.text),
      owner: parseOwner(fact.text),
      evidenceRef: fact.evidenceRef,
    });
  });

  const unique = dedupeStrings(
    plans.map((plan) => `${plan.priority}|${plan.task}|${plan.due ?? ""}|${plan.owner ?? ""}`),
    8
  );

  return unique.map((encoded) => {
    const [priority, task, due, owner] = encoded.split("|");
    return {
      priority: priority as TodoItem["priority"],
      task,
      due: (due || undefined) as TodoItem["due"],
      owner: (owner || undefined) as TodoItem["owner"],
    } satisfies TodoItem;
  });
}

function buildRiskItems(
  segments: Array<{ text: string; evidenceRef: MaskedSegment["evidenceRef"] }>,
  dutyType: DutyType
) {
  const byCode = new Map<string, RiskItem>();
  segments.forEach((segment) => {
    evaluateRisksFromText(segment.text, dutyType).forEach((risk) => {
      const existing = byCode.get(risk.code);
      if (existing && existing.score >= risk.score) return;
      byCode.set(risk.code, {
        ...risk,
        evidenceRef: segment.evidenceRef,
      });
    });
  });

  return [...byCode.values()].sort((a, b) => b.score - a.score).slice(0, 6);
}

function summarizePatient(
  patientKey: string,
  currentStatus: string[],
  riskItems: RiskItem[],
  plan: TodoItem[]
) {
  const headline = riskItems[0]
    ? `${riskItems[0].code} 위험 ${riskItems[0].score}점`
    : currentStatus[0] ?? "핵심 위험 신호 없음";
  const planHint = plan[0] ? `${plan[0].priority} ${plan[0].task}` : "우선 작업 없음";
  return `${patientKey}: ${headline} · ${planHint}`;
}

function toLegacyTopItems(
  facts: Array<{ id: string; text: string; score: number; evidenceRef: MaskedSegment["evidenceRef"] }>
) {
  return facts
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((fact) => {
      const level = riskLevelFromScore(fact.score);
      const badge = level === "high" ? "즉시 확인" : level === "medium" ? "우선 확인" : "모니터링";
      return {
        id: `top-${fact.id}`,
        text: fact.text,
        score: fact.score,
        badge,
        evidenceRef: fact.evidenceRef,
      } satisfies PatientTopItem;
    });
}

function toLegacyTodos(plan: TodoItem[]) {
  return plan.slice(0, 4).map((item, index) => {
    const level = item.priority === "P0" ? "high" : item.priority === "P1" ? "medium" : "low";
    return {
      id: `todo-${index + 1}`,
      text: item.task,
      dueHint: item.due ?? null,
      level,
      evidenceRef: item.evidenceRef ?? {
        segmentId: `derived-${index + 1}`,
        startMs: 0,
        endMs: 0,
      },
    } satisfies PatientTodo;
  });
}

function toLegacyProblems(problemTexts: string[]) {
  return problemTexts.slice(0, 6).map((text, index) => {
    return {
      id: `problem-${index + 1}`,
      text,
      evidenceRef: {
        segmentId: `derived-problem-${index + 1}`,
        startMs: 0,
        endMs: 0,
      },
    } satisfies PatientProblem;
  });
}

function toLegacyRisks(riskItems: RiskItem[]) {
  return riskItems.slice(0, 5).map((risk, index) => {
    const level = riskLevelFromScore(risk.score);
    return {
      id: `risk-${index + 1}`,
      label: risk.code,
      level,
      evidenceRef: risk.evidenceRef ?? {
        segmentId: `derived-risk-${index + 1}`,
        startMs: 0,
        endMs: 0,
      },
    } satisfies PatientRisk;
  });
}

function buildPatientCard(patientKey: string, segments: MaskedSegment[], dutyType: DutyType): PatientCard {
  const facts = segments
    .map((segment) => {
      const text = normalizeSentence(segment.maskedText);
      if (!text) return null;
      const priority = scorePriority(text, dutyType);
      return {
        id: segment.segmentId,
        text,
        score: priority.score,
        evidenceRef: segment.evidenceRef,
      };
    })
    .filter((fact): fact is { id: string; text: string; score: number; evidenceRef: MaskedSegment["evidenceRef"] } =>
      Boolean(fact)
    );

  const entities = dedupeStrings(
    facts.flatMap((fact) => extractEntities(fact.text).map((entity) => JSON.stringify(entity))),
    18
  ).map((raw) => JSON.parse(raw) as ClinicalEntity);

  const currentStatus = dedupeStrings(
    facts.filter((fact) => STATUS_PATTERN.test(fact.text)).map((fact) => fact.text),
    6
  );
  const meds = dedupeStrings(
    facts.filter((fact) => MED_PATTERN.test(fact.text)).map((fact) => fact.text),
    6
  );
  const lines = dedupeStrings(
    facts.filter((fact) => LINE_PATTERN.test(fact.text)).map((fact) => fact.text),
    5
  );
  const labs = dedupeStrings(
    facts.filter((fact) => LAB_PATTERN.test(fact.text)).map((fact) => fact.text),
    6
  );
  const problems = dedupeStrings(
    facts.filter((fact) => ABNORMAL_PATTERN.test(fact.text) || fact.score >= 40).map((fact) => fact.text),
    7
  );
  const plan = buildPlanFromSegments(facts);
  const riskItems = buildRiskItems(facts, dutyType);
  const watchFor = dedupeStrings(
    facts
      .filter((fact) => WATCH_FOR_PATTERN.test(fact.text))
      .map((fact) => fact.text)
      .concat(riskItems.map((risk) => `${risk.code}: ${risk.actions[0] ?? "즉시 확인"}`)),
    6
  );

  const questions = dedupeStrings(
    [
      plan.length === 0 ? "추가로 즉시 수행할 오더가 있는지 확인 필요" : "",
      riskItems.length === 0 ? "핵심 위험 신호 재확인이 필요함" : "",
      labs.length > 0 ? "검사 결과 확인 시점이 명확한지 확인" : "",
    ].filter(Boolean),
    4
  );

  const summary1 = summarizePatient(patientKey, currentStatus, riskItems, plan);

  return {
    patientKey,
    summary1,
    problems,
    currentStatus,
    meds,
    lines,
    labs,
    plan,
    risks: riskItems,
    watchFor,
    questions,
    entities,
    alias: patientKey,
    topItems: toLegacyTopItems(facts),
    todos: toLegacyTodos(plan),
    problemItems: toLegacyProblems(problems),
    riskItems: toLegacyRisks(riskItems),
  };
}

function toGlobalTop(patientCards: PatientCard[]) {
  const candidates: Array<GlobalTop3Item & { evidenceRef: NonNullable<GlobalTop3Item["evidenceRef"]> }> = [];

  patientCards.forEach((patient) => {
    patient.risks.forEach((risk) => {
      candidates.push({
        patientKey: patient.patientKey,
        score: risk.score,
        text: `${patient.patientKey}: ${risk.code} → ${risk.actions[0] ?? "즉시 확인"} (기관 확인)`,
        evidenceRef: risk.evidenceRef ?? {
          segmentId: `${patient.patientKey}-risk`,
          startMs: 0,
          endMs: 0,
        },
      });
    });
    patient.plan
      .filter((todo) => todo.priority === "P0")
      .forEach((todo) => {
        candidates.push({
          patientKey: patient.patientKey,
          score: 68,
          text: `${patient.patientKey}: ${todo.task}`,
          evidenceRef: todo.evidenceRef ?? {
            segmentId: `${patient.patientKey}-plan`,
            startMs: 0,
            endMs: 0,
          },
        });
      });
  });

  return candidates.sort((a, b) => b.score - a.score).slice(0, 3);
}

export function buildPatientCards({ patientSegments, dutyType }: StructureInput): PatientCard[] {
  const aliases = Object.keys(patientSegments).length ? Object.keys(patientSegments) : ["PATIENT_A"];
  return aliases
    .sort((a, b) => a.localeCompare(b))
    .map((alias) => buildPatientCard(alias, patientSegments[alias] ?? [], dutyType));
}

export function buildGlobalTop3(patients: PatientCard[]) {
  return toGlobalTop(patients);
}

export function buildGlobalTop(patients: PatientCard[]) {
  return buildGlobalTop3(patients).map((item, index) => {
    const level = riskLevelFromScore(item.score);
    const badge = level === "high" ? "즉시 확인" : level === "medium" ? "우선 확인" : "모니터링";
    return {
      id: `global-${index + 1}`,
      alias: item.patientKey ?? "PATIENT_A",
      text: item.text,
      badge,
      score: item.score,
      evidenceRef: item.evidenceRef ?? {
        segmentId: `global-${index + 1}`,
        startMs: 0,
        endMs: 0,
      },
    } satisfies GlobalTopItem;
  });
}
