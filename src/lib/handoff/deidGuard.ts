import type { HandoverSessionResult } from "./types";

export type DeidIssue = {
  field: string;
  pattern: string;
};

export type ResidualPhiIssue = {
  field: string;
  pattern: string;
};

type Rule = {
  id: string;
  pattern: RegExp;
  replacement: string;
};

const RULES: Rule[] = [
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
    id: "dob",
    pattern: /(19|20)\d{2}[./-]?\d{1,2}[./-]?\d{1,2}/g,
    replacement: "[REDACTED]",
  },
  {
    id: "mrn",
    pattern: /(MRN|등록|차트|환자번호|ID)\s*[:#-]?\s*[A-Za-z0-9-]{4,}/gi,
    replacement: "[REDACTED]",
  },
  {
    id: "address",
    pattern: /[가-힣0-9\-\s]{2,}(?:시|도|구|군|읍|면|동|로|길)[^.!?\n]{0,20}\d+/g,
    replacement: "[REDACTED]",
  },
  {
    id: "name-honorific",
    pattern: /[가-힣]{2,4}(?:님|씨)/g,
    replacement: "[REDACTED]",
  },
  {
    id: "masked-name",
    pattern: /[가-힣]{1,3}[O○0]{2}/g,
    replacement: "[REDACTED]",
  },
  {
    id: "room",
    pattern: /(?:^|\s)\d{3,4}\s*호(?=$|\s|[,.])/g,
    replacement: " [REDACTED]",
  },
  {
    id: "long-digits",
    pattern: /\b\d{7,12}\b/g,
    replacement: "[REDACTED]",
  },
];

const RESIDUAL_RULES: Array<{ id: string; pattern: RegExp }> = [
  { id: "phone", pattern: /01[0-9][\s./-]?\d{3,4}[\s./-]?\d{4}/i },
  { id: "rrn", pattern: /\d{6}[\s/-]?[1-4]\d{6}/i },
  { id: "dob", pattern: /(19|20)\d{2}[./-]?\d{1,2}[./-]?\d{1,2}/i },
  { id: "mrn", pattern: /(MRN|등록|차트|환자번호|ID)\s*[:#-]?\s*[A-Za-z0-9-]{4,}/i },
  { id: "address", pattern: /[가-힣0-9\-\s]{2,}(?:시|도|구|군|읍|면|동|로|길)[^.!?\n]{0,20}\d+/i },
  { id: "name-honorific", pattern: /[가-힣]{2,4}(?:님|씨)/ },
  { id: "masked-name", pattern: /[가-힣]{1,3}[O○0]{2}/ },
  { id: "room", pattern: /(?:^|\s)\d{3,4}\s*호(?=$|\s|[,.])/ },
  { id: "long-digits", pattern: /\b\d{7,12}\b/ },
];

function sanitizeText(text: string, field: string) {
  let output = text;
  const issues: DeidIssue[] = [];

  RULES.forEach((rule) => {
    output = output.replace(rule.pattern, (match) => {
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
    text: output.replace(/\s{2,}/g, " ").trim(),
    issues,
  };
}

function detectResidualPhiText(text: string, field: string) {
  const issues: ResidualPhiIssue[] = [];
  RESIDUAL_RULES.forEach((rule) => {
    if (!rule.pattern.test(text)) return;
    issues.push({
      field,
      pattern: rule.id,
    });
  });
  return issues;
}

function sanitizeStringArray(values: string[], field: string) {
  const issues: DeidIssue[] = [];
  const next = values.map((value, index) => {
    const sanitized = sanitizeText(value, `${field}[${index}]`);
    issues.push(...sanitized.issues);
    return sanitized.text;
  });
  return { values: next, issues };
}

function detectResidualStringArray(values: string[], field: string) {
  return values.flatMap((value, index) => detectResidualPhiText(value, `${field}[${index}]`));
}

export function detectResidualStructuredPhi(result: HandoverSessionResult) {
  const issues: ResidualPhiIssue[] = [];

  result.globalTop.forEach((item, index) => {
    issues.push(...detectResidualPhiText(item.alias, `globalTop[${index}].alias`));
    issues.push(...detectResidualPhiText(item.text, `globalTop[${index}].text`));
  });

  result.globalTop3.forEach((item, index) => {
    issues.push(...detectResidualPhiText(item.text, `globalTop3[${index}].text`));
    if (item.patientKey) {
      issues.push(...detectResidualPhiText(item.patientKey, `globalTop3[${index}].patientKey`));
    }
  });

  result.wardEvents.forEach((item, index) => {
    issues.push(...detectResidualPhiText(item.text, `wardEvents[${index}].text`));
  });

  result.patients.forEach((patient, patientIndex) => {
    issues.push(...detectResidualPhiText(patient.patientKey, `patients[${patientIndex}].patientKey`));
    issues.push(...detectResidualPhiText(patient.alias, `patients[${patientIndex}].alias`));
    issues.push(...detectResidualPhiText(patient.summary1, `patients[${patientIndex}].summary1`));
    issues.push(...detectResidualStringArray(patient.problems, `patients[${patientIndex}].problems`));
    issues.push(...detectResidualStringArray(patient.currentStatus, `patients[${patientIndex}].currentStatus`));
    issues.push(...detectResidualStringArray(patient.meds, `patients[${patientIndex}].meds`));
    issues.push(...detectResidualStringArray(patient.lines, `patients[${patientIndex}].lines`));
    issues.push(...detectResidualStringArray(patient.labs, `patients[${patientIndex}].labs`));
    issues.push(...detectResidualStringArray(patient.watchFor, `patients[${patientIndex}].watchFor`));
    issues.push(...detectResidualStringArray(patient.questions, `patients[${patientIndex}].questions`));

    patient.plan.forEach((plan, planIndex) => {
      issues.push(...detectResidualPhiText(plan.task, `patients[${patientIndex}].plan[${planIndex}].task`));
    });
    patient.risks.forEach((risk, riskIndex) => {
      issues.push(...detectResidualPhiText(risk.rationale, `patients[${patientIndex}].risks[${riskIndex}].rationale`));
      issues.push(...detectResidualStringArray(risk.actions, `patients[${patientIndex}].risks[${riskIndex}].actions`));
    });
    patient.topItems.forEach((item, itemIndex) => {
      issues.push(...detectResidualPhiText(item.text, `patients[${patientIndex}].topItems[${itemIndex}].text`));
    });
    patient.todos.forEach((todo, todoIndex) => {
      issues.push(...detectResidualPhiText(todo.text, `patients[${patientIndex}].todos[${todoIndex}].text`));
      if (todo.dueHint) {
        issues.push(...detectResidualPhiText(todo.dueHint, `patients[${patientIndex}].todos[${todoIndex}].dueHint`));
      }
    });
    patient.problemItems.forEach((problem, problemIndex) => {
      issues.push(...detectResidualPhiText(problem.text, `patients[${patientIndex}].problemItems[${problemIndex}].text`));
    });
    patient.riskItems.forEach((risk, riskIndex) => {
      issues.push(...detectResidualPhiText(risk.label, `patients[${patientIndex}].riskItems[${riskIndex}].label`));
    });
  });

  issues.push(...detectResidualStringArray(result.uncertainties, "uncertainties"));
  result.uncertaintyItems.forEach((item, index) => {
    issues.push(...detectResidualPhiText(item.reason, `uncertaintyItems[${index}].reason`));
    issues.push(...detectResidualPhiText(item.text, `uncertaintyItems[${index}].text`));
  });

  return issues;
}

export function sanitizeStructuredSession(result: HandoverSessionResult) {
  const issues: DeidIssue[] = [];

  const globalTop = result.globalTop.map((item, index) => {
    const aliasSanitized = sanitizeText(item.alias, `globalTop[${index}].alias`);
    const textSanitized = sanitizeText(item.text, `globalTop[${index}].text`);
    issues.push(...aliasSanitized.issues, ...textSanitized.issues);
    return {
      ...item,
      alias: aliasSanitized.text,
      text: textSanitized.text,
    };
  });

  const globalTop3 = result.globalTop3.map((item, index) => {
    const textSanitized = sanitizeText(item.text, `globalTop3[${index}].text`);
    const patientSanitized = item.patientKey
      ? sanitizeText(item.patientKey, `globalTop3[${index}].patientKey`)
      : { text: item.patientKey, issues: [] as DeidIssue[] };
    issues.push(...textSanitized.issues, ...patientSanitized.issues);
    return {
      ...item,
      text: textSanitized.text,
      patientKey: patientSanitized.text,
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
    const patientKeySanitized = sanitizeText(patient.patientKey, `patients[${patientIndex}].patientKey`);
    const aliasSanitized = sanitizeText(patient.alias, `patients[${patientIndex}].alias`);
    const summarySanitized = sanitizeText(patient.summary1, `patients[${patientIndex}].summary1`);
    issues.push(...patientKeySanitized.issues, ...aliasSanitized.issues, ...summarySanitized.issues);

    const problems = sanitizeStringArray(patient.problems, `patients[${patientIndex}].problems`);
    const currentStatus = sanitizeStringArray(patient.currentStatus, `patients[${patientIndex}].currentStatus`);
    const meds = sanitizeStringArray(patient.meds, `patients[${patientIndex}].meds`);
    const lines = sanitizeStringArray(patient.lines, `patients[${patientIndex}].lines`);
    const labs = sanitizeStringArray(patient.labs, `patients[${patientIndex}].labs`);
    const watchFor = sanitizeStringArray(patient.watchFor, `patients[${patientIndex}].watchFor`);
    const questions = sanitizeStringArray(patient.questions, `patients[${patientIndex}].questions`);
    issues.push(
      ...problems.issues,
      ...currentStatus.issues,
      ...meds.issues,
      ...lines.issues,
      ...labs.issues,
      ...watchFor.issues,
      ...questions.issues
    );

    return {
      ...patient,
      patientKey: patientKeySanitized.text,
      alias: aliasSanitized.text,
      summary1: summarySanitized.text,
      problems: problems.values,
      currentStatus: currentStatus.values,
      meds: meds.values,
      lines: lines.values,
      labs: labs.values,
      watchFor: watchFor.values,
      questions: questions.values,
      plan: patient.plan.map((plan, planIndex) => {
        const task = sanitizeText(plan.task, `patients[${patientIndex}].plan[${planIndex}].task`);
        issues.push(...task.issues);
        return {
          ...plan,
          task: task.text,
        };
      }),
      risks: patient.risks.map((risk, riskIndex) => {
        const rationale = sanitizeText(risk.rationale, `patients[${patientIndex}].risks[${riskIndex}].rationale`);
        const actions = sanitizeStringArray(risk.actions, `patients[${patientIndex}].risks[${riskIndex}].actions`);
        issues.push(...rationale.issues, ...actions.issues);
        return {
          ...risk,
          rationale: rationale.text,
          actions: actions.values,
        };
      }),
      topItems: patient.topItems.map((item, itemIndex) => {
        const text = sanitizeText(item.text, `patients[${patientIndex}].topItems[${itemIndex}].text`);
        issues.push(...text.issues);
        return {
          ...item,
          text: text.text,
        };
      }),
      todos: patient.todos.map((todo, todoIndex) => {
        const text = sanitizeText(todo.text, `patients[${patientIndex}].todos[${todoIndex}].text`);
        const dueHint = todo.dueHint
          ? sanitizeText(todo.dueHint, `patients[${patientIndex}].todos[${todoIndex}].dueHint`)
          : { text: todo.dueHint, issues: [] as DeidIssue[] };
        issues.push(...text.issues, ...dueHint.issues);
        return {
          ...todo,
          text: text.text,
          dueHint: dueHint.text,
        };
      }),
      problemItems: patient.problemItems.map((problem, problemIndex) => {
        const text = sanitizeText(problem.text, `patients[${patientIndex}].problemItems[${problemIndex}].text`);
        issues.push(...text.issues);
        return {
          ...problem,
          text: text.text,
        };
      }),
      riskItems: patient.riskItems.map((risk, riskIndex) => {
        const label = sanitizeText(risk.label, `patients[${patientIndex}].riskItems[${riskIndex}].label`);
        issues.push(...label.issues);
        return {
          ...risk,
          label: label.text,
        };
      }),
    };
  });

  const uncertainties = sanitizeStringArray(result.uncertainties, "uncertainties");
  issues.push(...uncertainties.issues);

  const uncertaintyItems = result.uncertaintyItems.map((item, index) => {
    const reason = sanitizeText(item.reason, `uncertaintyItems[${index}].reason`);
    const text = sanitizeText(item.text, `uncertaintyItems[${index}].text`);
    issues.push(...reason.issues, ...text.issues);
    return {
      ...item,
      reason: reason.text,
      text: text.text,
    };
  });

  const sanitizedResult: HandoverSessionResult = {
    ...result,
    globalTop,
    globalTop3,
    wardEvents,
    patients,
    uncertainties: uncertainties.values,
    uncertaintyItems,
  };

  const residualIssues = detectResidualStructuredPhi(sanitizedResult);
  return {
    result: sanitizedResult,
    issues,
    residualIssues,
  };
}
