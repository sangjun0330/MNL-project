import type { HandoverSessionResult } from "./types";

export type DeidIssue = {
  field: string;
  pattern: string;
};

export type ResidualPhiIssue = {
  field: string;
  pattern: string;
};

type SanitizeResult = {
  text: string;
  issues: DeidIssue[];
};

type Rule = {
  id: string;
  pattern: RegExp;
  replacement: string;
};

const RULES: Rule[] = [
  {
    id: "masked-name",
    pattern: /[가-힣]{1,3}[O○]{2}/g,
    replacement: "[REDACTED]",
  },
  {
    id: "korean-name-honorific",
    pattern: /([가-힣]{2,4})(?=\s*(?:님|씨))/g,
    replacement: "[REDACTED]",
  },
  {
    id: "room",
    pattern: /(?:^|\s)\d{3,4}\s*호(?=$|\s|[,.])/g,
    replacement: " [REDACTED]",
  },
  {
    id: "phone",
    pattern: /01[0-9][\s.-]?\d{3,4}[\s.-]?\d{4}/g,
    replacement: "[REDACTED]",
  },
  {
    id: "rrn",
    pattern: /\d{6}[\s/-]?[1-4]\d{6}/g,
    replacement: "[REDACTED]",
  },
  {
    id: "chart",
    pattern: /(차트번호|등록번호|MRN)\s*[:#-]?\s*[A-Z0-9-]{6,}/gi,
    replacement: "[REDACTED]",
  },
  {
    id: "email",
    pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
    replacement: "[REDACTED]",
  },
  {
    id: "patient-id",
    pattern: /(환자번호|환자ID|PID)\s*[:#]?\s*[A-Z0-9-]{4,}/gi,
    replacement: "[REDACTED]",
  },
];

const RESIDUAL_RULES: Array<{ id: string; pattern: RegExp }> = [
  { id: "masked-name", pattern: /[가-힣]{1,3}[O○]{2}/ },
  { id: "korean-name-honorific", pattern: /[가-힣]{2,4}(?=\s*(?:님|씨|환자))/ },
  { id: "room", pattern: /(?:^|\s)\d{3,4}\s*호(?=$|\s|[,.])/ },
  { id: "phone", pattern: /01[0-9][\s./-]?\d{3,4}[\s./-]?\d{4}/ },
  { id: "rrn", pattern: /\d{6}[\s/-]?[1-4]\d{6}/ },
  { id: "chart", pattern: /(차트번호|등록번호|MRN)\s*[:#-]?\s*[A-Z0-9-]{6,}/i },
  { id: "email", pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i },
  { id: "patient-id", pattern: /(환자번호|환자ID|PID)\s*[:#]?\s*[A-Z0-9-]{4,}/i },
];

function sanitizeText(text: string, field: string): SanitizeResult {
  let next = text;
  const issues: DeidIssue[] = [];

  RULES.forEach((rule) => {
    next = next.replace(rule.pattern, (match) => {
      issues.push({
        field,
        pattern: rule.id,
      });
      if (/^\s+/.test(match) && !/^\s+/.test(rule.replacement)) {
        return ` ${rule.replacement}`;
      }
      return rule.replacement;
    });
  });

  return {
    text: next.replace(/\s{2,}/g, " ").trim(),
    issues,
  };
}

function sanitizeNullableText(
  value: string | null,
  field: string
): { value: string | null; issues: DeidIssue[] } {
  if (!value) return { value, issues: [] };
  const sanitized = sanitizeText(value, field);
  return { value: sanitized.text, issues: sanitized.issues };
}

function detectResidualPhiText(text: string, field: string) {
  const hits: ResidualPhiIssue[] = [];
  RESIDUAL_RULES.forEach((rule) => {
    if (rule.pattern.test(text)) {
      hits.push({
        field,
        pattern: rule.id,
      });
    }
  });
  return hits;
}

export function detectResidualStructuredPhi(result: HandoverSessionResult) {
  const issues: ResidualPhiIssue[] = [];

  result.globalTop.forEach((item, index) => {
    issues.push(...detectResidualPhiText(item.alias, `globalTop[${index}].alias`));
    issues.push(...detectResidualPhiText(item.text, `globalTop[${index}].text`));
  });

  result.wardEvents.forEach((item, index) => {
    issues.push(...detectResidualPhiText(item.text, `wardEvents[${index}].text`));
  });

  result.patients.forEach((patient, patientIndex) => {
    issues.push(...detectResidualPhiText(patient.alias, `patients[${patientIndex}].alias`));
    patient.topItems.forEach((item, itemIndex) => {
      issues.push(...detectResidualPhiText(item.text, `patients[${patientIndex}].topItems[${itemIndex}].text`));
    });
    patient.todos.forEach((todo, todoIndex) => {
      issues.push(...detectResidualPhiText(todo.text, `patients[${patientIndex}].todos[${todoIndex}].text`));
      if (todo.dueHint) {
        issues.push(
          ...detectResidualPhiText(todo.dueHint, `patients[${patientIndex}].todos[${todoIndex}].dueHint`)
        );
      }
    });
    patient.problems.forEach((problem, problemIndex) => {
      issues.push(
        ...detectResidualPhiText(problem.text, `patients[${patientIndex}].problems[${problemIndex}].text`)
      );
    });
    patient.risks.forEach((risk, riskIndex) => {
      issues.push(...detectResidualPhiText(risk.label, `patients[${patientIndex}].risks[${riskIndex}].label`));
    });
  });

  result.uncertainties.forEach((item, index) => {
    issues.push(...detectResidualPhiText(item.reason, `uncertainties[${index}].reason`));
    issues.push(...detectResidualPhiText(item.text, `uncertainties[${index}].text`));
  });

  return issues;
}

export function sanitizeStructuredSession(result: HandoverSessionResult) {
  const issues: DeidIssue[] = [];

  const globalTop = result.globalTop.map((item, index) => {
    const sanitizedAlias = sanitizeText(item.alias, `globalTop[${index}].alias`);
    const sanitized = sanitizeText(item.text, `globalTop[${index}].text`);
    issues.push(...sanitizedAlias.issues, ...sanitized.issues);
    return {
      ...item,
      alias: sanitizedAlias.text,
      text: sanitized.text,
    };
  });

  const wardEvents = result.wardEvents.map((item, index) => {
    const sanitized = sanitizeText(item.text, `wardEvents[${index}].text`);
    issues.push(...sanitized.issues);
    return {
      ...item,
      text: sanitized.text,
    };
  });

  const patients = result.patients.map((patient, patientIndex) => {
    const sanitizedAlias = sanitizeText(patient.alias, `patients[${patientIndex}].alias`);
    issues.push(...sanitizedAlias.issues);
    return {
    ...patient,
    alias: sanitizedAlias.text,
    topItems: patient.topItems.map((item, itemIndex) => {
      const sanitized = sanitizeText(item.text, `patients[${patientIndex}].topItems[${itemIndex}].text`);
      issues.push(...sanitized.issues);
      return {
        ...item,
        text: sanitized.text,
      };
    }),
    todos: patient.todos.map((todo, todoIndex) => {
      const sanitizedText = sanitizeText(todo.text, `patients[${patientIndex}].todos[${todoIndex}].text`);
      const sanitizedDue = sanitizeNullableText(
        todo.dueHint,
        `patients[${patientIndex}].todos[${todoIndex}].dueHint`
      );
      issues.push(...sanitizedText.issues, ...sanitizedDue.issues);
      return {
        ...todo,
        text: sanitizedText.text,
        dueHint: sanitizedDue.value,
      };
    }),
    problems: patient.problems.map((problem, problemIndex) => {
      const sanitized = sanitizeText(problem.text, `patients[${patientIndex}].problems[${problemIndex}].text`);
      issues.push(...sanitized.issues);
      return {
        ...problem,
        text: sanitized.text,
      };
    }),
    risks: patient.risks.map((risk, riskIndex) => {
      const sanitized = sanitizeText(risk.label, `patients[${patientIndex}].risks[${riskIndex}].label`);
      issues.push(...sanitized.issues);
      return {
        ...risk,
        label: sanitized.text,
      };
    }),
  };
  });

  const uncertainties = result.uncertainties.map((item, index) => {
    const sanitizedReason = sanitizeText(item.reason, `uncertainties[${index}].reason`);
    const sanitizedText = sanitizeText(item.text, `uncertainties[${index}].text`);
    issues.push(...sanitizedReason.issues, ...sanitizedText.issues);
    return {
      ...item,
      reason: sanitizedReason.text,
      text: sanitizedText.text,
    };
  });

  const sanitizedResult = {
    ...result,
    globalTop,
    wardEvents,
    patients,
    uncertainties,
  };

  return {
    result: {
      ...sanitizedResult,
    },
    issues,
    residualIssues: detectResidualStructuredPhi(sanitizedResult),
  };
}
