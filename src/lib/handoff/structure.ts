import { scorePriority } from "./priority";
import type {
  DutyType,
  GlobalTopItem,
  MaskedSegment,
  PatientCard,
  PatientProblem,
  PatientRisk,
  PatientTodo,
  PatientTopItem,
} from "./types";

type StructureInput = {
  patientSegments: Record<string, MaskedSegment[]>;
  dutyType: DutyType;
};

const TODO_PATTERN = /(오더|확인|재확인|재측정|재검|투약|검사|콜|모니터|체크|다시\s*보|recheck|repeat|follow\s*up)/i;
const DUE_HINT_PATTERN = /(\d{1,2}:\d{2}|\d{1,2}\s*시|새벽\s*\d{0,2}\s*시?|오전|오후|저녁|밤|내일\s*오전|내일\s*오후)/;
const PENDING_TODO_PATTERN = /(필요|예정|대기|부탁|계획|재평가|follow\s*up|보자|보라|다시)/i;
const ABNORMAL_PROBLEM_PATTERN =
  /(저혈압|고혈압|혈압\s*\d{2,3}\s*\/\s*\d{2,3}|저산소|호흡곤란|출혈|흑변|어지럽|통증|발열|고열|저체온|저혈당|고혈당|감염|쇼크|섬망|의식\s*저하|소변량\s*감소)/i;

type FactTopic =
  | "respiratory"
  | "hemodynamic"
  | "glycemic"
  | "infection"
  | "io"
  | "medication"
  | "lab"
  | "neuro"
  | "fall"
  | "general";

const TOPIC_RULES: Array<{ topic: FactTopic; pattern: RegExp }> = [
  { topic: "respiratory", pattern: /(호흡|SpO2|산소|저산소|호흡곤란|캐뉼라|산소포화도)/i },
  { topic: "hemodynamic", pattern: /(혈압|쇼크|맥박|심박|저혈압|고혈압|빈맥|서맥)/i },
  { topic: "glycemic", pattern: /(혈당|BST|저혈당|고혈당|인슐린|sliding)/i },
  { topic: "infection", pattern: /(감염|항생제|발열|체온|패혈|CRP|WBC)/i },
  { topic: "io", pattern: /(소변량|배뇨|수분출납|I\/O|섭취배설량|요량)/i },
  { topic: "medication", pattern: /(투약|약|오더|PRN|PCA|항응고|엘리퀴스|와파린)/i },
  { topic: "lab", pattern: /(검사|CBC|Hb|헤모글로빈|수치|결과|재검)/i },
  { topic: "neuro", pattern: /(의식|섬망|confusion|신경|지남력|어지럽)/i },
  { topic: "fall", pattern: /(낙상|보행|assist|침상|bed alarm)/i },
];

type PatientFact = {
  id: string;
  text: string;
  evidenceRef: MaskedSegment["evidenceRef"];
  topic: FactTopic;
  score: number;
  badge: string;
  level: "high" | "medium" | "low";
  dueHint: string | null;
  todoCandidate: boolean;
  problemCandidate: boolean;
};

function normalizeSentence(text: string) {
  return text
    .replace(/^환자[A-Z]{1,2}\s*/, "")
    .replace(/^[-•·]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function dedupeByText<T extends { text: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.text.trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function dedupeByNormalizedText<T extends { text: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const normalized = item.text
      .toLowerCase()
      .replace(/\d{1,2}:\d{2}/g, "#시각")
      .replace(/\d+(?:\.\d+)?/g, "#")
      .replace(/\s+/g, " ")
      .trim();
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}

function classifyTopic(text: string): FactTopic {
  for (const rule of TOPIC_RULES) {
    if (rule.pattern.test(text)) return rule.topic;
  }
  return "general";
}

function topicWeight(topic: FactTopic, dutyType: DutyType) {
  const base: Record<FactTopic, number> = {
    respiratory: 9,
    hemodynamic: 8,
    glycemic: 7,
    infection: 6,
    io: 5,
    medication: 5,
    lab: 4,
    neuro: 6,
    fall: 4,
    general: 2,
  };

  if (dutyType !== "night") return base[topic];
  if (topic === "respiratory" || topic === "hemodynamic") return base[topic] + 4;
  if (topic === "glycemic" || topic === "io" || topic === "neuro") return base[topic] + 2;
  return base[topic];
}

function riskLabelFromText(text: string, labels: string[]) {
  if (labels.length) return labels.join("/");
  if (/(출혈|흑변|항응고)/.test(text)) return "출혈/항응고";
  if (/(호흡|저산소|SpO2)/i.test(text)) return "호흡";
  if (/(의식|섬망)/.test(text)) return "의식";
  if (/(소변량|수분출납|I\/O)/i.test(text)) return "I/O";
  if (/(혈당|BST)/i.test(text)) return "혈당";
  return "관찰";
}

function buildPatientCard(alias: string, segments: MaskedSegment[], dutyType: DutyType): PatientCard {
  const facts: PatientFact[] = [];

  segments.forEach((segment) => {
    const text = normalizeSentence(segment.maskedText);
    if (!text) return;

    const priority = scorePriority(text, dutyType);
    const topic = classifyTopic(text);
    const dueHint = text.match(DUE_HINT_PATTERN)?.[0] ?? null;
    const todoCandidate = TODO_PATTERN.test(text) || (PENDING_TODO_PATTERN.test(text) && Boolean(dueHint));
    const problemCandidate = ABNORMAL_PROBLEM_PATTERN.test(text) || priority.level !== "low";
    const weightedScore = Math.min(100, priority.score + topicWeight(topic, dutyType));

    facts.push({
      id: segment.segmentId,
      text,
      evidenceRef: segment.evidenceRef,
      topic,
      score: weightedScore,
      badge: priority.badge,
      level: priority.level,
      dueHint,
      todoCandidate,
      problemCandidate,
    });
  });

  const bestFactByTopic = new Map<FactTopic, PatientFact>();
  facts.forEach((fact) => {
    const existing = bestFactByTopic.get(fact.topic);
    if (!existing || fact.score > existing.score) {
      bestFactByTopic.set(fact.topic, fact);
    }
  });

  const topItems = [...bestFactByTopic.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((fact) => ({
      id: `top-${fact.id}`,
      text: fact.text,
      score: fact.score,
      badge: fact.badge,
      evidenceRef: fact.evidenceRef,
    })) satisfies PatientTopItem[];

  const todos: PatientTodo[] = dedupeByNormalizedText(
    facts
      .filter((fact) => fact.todoCandidate)
      .map((fact) => ({
        id: `todo-${fact.id}`,
        text: fact.text,
        dueHint: fact.dueHint,
        level: fact.level,
        evidenceRef: fact.evidenceRef,
      }))
  )
    .sort((a, b) => {
      const lv = { high: 0, medium: 1, low: 2 } as const;
      return lv[a.level] - lv[b.level];
    })
    .slice(0, 4);

  const problems: PatientProblem[] = dedupeByNormalizedText(
    facts
      .filter((fact) => fact.problemCandidate)
      .sort((a, b) => b.score - a.score)
      .map((fact) => ({
        id: `problem-${fact.id}`,
        text: fact.text,
        evidenceRef: fact.evidenceRef,
      }))
  ).slice(0, 6);

  const risks: PatientRisk[] = dedupeByText(
    facts
      .filter((fact) => fact.level !== "low" || ABNORMAL_PROBLEM_PATTERN.test(fact.text))
      .sort((a, b) => b.score - a.score)
      .map((fact) => ({
        id: `risk-${fact.id}`,
        label: riskLabelFromText(fact.text, []),
        level: fact.level,
        text: riskLabelFromText(fact.text, []),
        evidenceRef: fact.evidenceRef,
      }))
  )
    .map(({ text, ...risk }) => ({
      ...risk,
      label: text,
    }))
    .slice(0, 4);

  return {
    alias,
    topItems,
    todos,
    problems,
    risks,
  };
}

export function buildPatientCards({ patientSegments, dutyType }: StructureInput): PatientCard[] {
  return Object.entries(patientSegments)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([alias, segments]) => buildPatientCard(alias, segments, dutyType));
}

export function buildGlobalTop(patients: PatientCard[]) {
  const merged: GlobalTopItem[] = patients.flatMap((patient) =>
    patient.topItems.map((item) => ({
      id: `${patient.alias}-${item.id}`,
      alias: patient.alias,
      text: item.text,
      badge: item.badge,
      score: item.score,
      evidenceRef: item.evidenceRef,
    }))
  );

  return merged.sort((a, b) => b.score - a.score).slice(0, 5);
}
