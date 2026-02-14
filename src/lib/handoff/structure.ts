import { scorePriority } from "@/lib/handoff/priority";
import type {
  DutyType,
  GlobalTopItem,
  MaskedSegment,
  PatientCard,
  PatientProblem,
  PatientRisk,
  PatientTodo,
  PatientTopItem,
} from "@/lib/handoff/types";

type StructureInput = {
  patientSegments: Record<string, MaskedSegment[]>;
  dutyType: DutyType;
};

const TODO_PATTERN = /(오더|확인|재확인|재측정|재검|투약|검사|콜|모니터|체크)/;
const DUE_HINT_PATTERN = /(\d{1,2}:\d{2}|\d{1,2}\s*시|새벽\s*\d{0,2}\s*시?|오전|오후|저녁|밤|내일\s*오전|내일\s*오후)/;

function normalizeSentence(text: string) {
  return text
    .replace(/^환자[A-Z]{1,2}\s*/, "")
    .replace(/^[-•·]\s*/, "")
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
  const topCandidates: PatientTopItem[] = [];
  const todoCandidates: PatientTodo[] = [];
  const problemCandidates: PatientProblem[] = [];
  const riskCandidates: PatientRisk[] = [];

  segments.forEach((segment) => {
    const text = normalizeSentence(segment.maskedText);
    if (!text) return;

    const priority = scorePriority(text, dutyType);
    const evidenceRef = segment.evidenceRef;

    problemCandidates.push({
      id: `problem-${segment.segmentId}`,
      text,
      evidenceRef,
    });

    topCandidates.push({
      id: `top-${segment.segmentId}`,
      text,
      score: priority.score,
      badge: priority.badge,
      evidenceRef,
    });

    if (TODO_PATTERN.test(text)) {
      const dueHint = text.match(DUE_HINT_PATTERN)?.[0] ?? null;
      todoCandidates.push({
        id: `todo-${segment.segmentId}`,
        text,
        dueHint,
        level: priority.level,
        evidenceRef,
      });
    }

    if (priority.level !== "low" || /(출혈|흑변|호흡|저산소|의식|항응고|어지럽|낙상|쇼크)/.test(text)) {
      riskCandidates.push({
        id: `risk-${segment.segmentId}`,
        label: riskLabelFromText(text, priority.labels),
        level: priority.level,
        evidenceRef,
      });
    }
  });

  const problems = dedupeByText(problemCandidates).slice(0, 5);
  const topItems = [...topCandidates].sort((a, b) => b.score - a.score).slice(0, 3);
  const todos = dedupeByText(todoCandidates)
    .sort((a, b) => {
      const lv = { high: 0, medium: 1, low: 2 } as const;
      return lv[a.level] - lv[b.level];
    })
    .slice(0, 3);
  const risks = dedupeByText(
    riskCandidates.map((risk) => ({
      ...risk,
      text: risk.label,
    }))
  )
    .map(({ text, ...risk }) => ({ ...risk, label: text }))
    .slice(0, 3);

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
