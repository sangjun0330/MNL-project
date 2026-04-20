import { mergeMedSafetySources, type MedSafetySource } from "@/lib/medSafetySources";

export const MED_SAFETY_SCHEMA_VERSION = "med_safety_answer_v2" as const;

export const MED_SAFETY_QUESTION_TYPES = [
  "general",
  "drug",
  "lab",
  "compare",
  "guideline",
  "device",
  "procedure",
  "image",
] as const;
export type MedSafetyQuestionType = (typeof MED_SAFETY_QUESTION_TYPES)[number];

export const MED_SAFETY_TRIAGE_LEVELS = ["routine", "urgent", "critical"] as const;
export type MedSafetyTriageLevel = (typeof MED_SAFETY_TRIAGE_LEVELS)[number];

export const MED_SAFETY_EVIDENCE_STATUSES = ["supported", "needs_review"] as const;
export type MedSafetyEvidenceStatus = (typeof MED_SAFETY_EVIDENCE_STATUSES)[number];

export const MED_SAFETY_VERIFICATION_STATUSES = ["verified", "dated", "unknown"] as const;
export type MedSafetyVerificationStatus = (typeof MED_SAFETY_VERIFICATION_STATUSES)[number];

export type MedSafetyAnswerItem = {
  text: string;
  citation_ids: string[];
  evidence_status: MedSafetyEvidenceStatus;
};

export type MedSafetyComparisonTableRow = {
  role: string;
  when_to_use: string;
  effect_onset: string;
  limitations: string;
  bedside_points: string;
  citation_ids: string[];
  evidence_status: MedSafetyEvidenceStatus;
};

export type MedSafetyAnswerFreshness = {
  retrieved_at: string | null;
  newest_effective_date: string | null;
  note: string;
  verification_status: MedSafetyVerificationStatus;
};

export type MedSafetyAnswerUncertainty = {
  summary: string;
  needs_verification: boolean;
  reasons: string[];
};

export type MedSafetyStructuredAnswer = {
  schema_version: typeof MED_SAFETY_SCHEMA_VERSION;
  question_type: MedSafetyQuestionType;
  triage_level: MedSafetyTriageLevel;
  bottom_line: string;
  bottom_line_citation_ids: string[];
  key_points: MedSafetyAnswerItem[];
  recommended_actions: MedSafetyAnswerItem[];
  do_not_do: MedSafetyAnswerItem[];
  when_to_escalate: MedSafetyAnswerItem[];
  patient_specific_caveats: MedSafetyAnswerItem[];
  uncertainty: MedSafetyAnswerUncertainty;
  freshness: MedSafetyAnswerFreshness;
  citations: MedSafetySource[];
  comparison_table: MedSafetyComparisonTableRow[];
};

export type MedSafetyVerificationIssueCode =
  | "claim_citation_mismatch"
  | "unsupported_specificity"
  | "missing_urgency"
  | "self_contradiction"
  | "overlong_indirect";

export type MedSafetyVerificationReport = {
  ran: boolean;
  passed: boolean;
  issues: MedSafetyVerificationIssueCode[];
  notes: string[];
  corrected_answer: MedSafetyStructuredAnswer | null;
};

export type MedSafetyQualitySnapshot = {
  verification_run: boolean;
  verification_passed: boolean;
  official_citation_rate: number;
  unsupported_claim_count: number;
  supported_claim_count: number;
  total_claim_count: number;
  grounded: boolean;
  high_risk: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeText(value: unknown) {
  return String(value ?? "")
    .replace(/\r/g, "")
    .replace(/\u0000/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function uniqueStrings(values: unknown, limit = 8) {
  if (!Array.isArray(values)) return [] as string[];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const text = normalizeText(value);
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= limit) break;
  }
  return out;
}

function normalizeEvidenceStatus(value: unknown, citationIds: string[]): MedSafetyEvidenceStatus {
  const raw = normalizeText(value).toLowerCase();
  if (raw === "needs_review") return "needs_review";
  if (!citationIds.length) return "needs_review";
  return "supported";
}

function normalizeQuestionType(value: unknown, hasComparisonTable: boolean): MedSafetyQuestionType {
  const raw = normalizeText(value).toLowerCase();
  if (MED_SAFETY_QUESTION_TYPES.includes(raw as MedSafetyQuestionType)) {
    return raw as MedSafetyQuestionType;
  }
  return hasComparisonTable ? "compare" : "general";
}

function normalizeTriageLevel(value: unknown): MedSafetyTriageLevel {
  const raw = normalizeText(value).toLowerCase();
  if (MED_SAFETY_TRIAGE_LEVELS.includes(raw as MedSafetyTriageLevel)) {
    return raw as MedSafetyTriageLevel;
  }
  return "routine";
}

function normalizeIsoDate(value: unknown) {
  const text = normalizeText(value);
  if (!text) return null;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function normalizeDateOnly(value: unknown) {
  const text = normalizeText(value);
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function normalizeCitation(source: unknown, fallbackId: string): (MedSafetySource & { id: string }) | null {
  if (!isRecord(source)) return null;
  const url = normalizeText(source.url);
  const title = normalizeText(source.title);
  const domain = normalizeText(source.domain);
  if (!url && !domain && !title) return null;
  const id = normalizeText(source.id) || fallbackId;
  return {
    id,
    url,
    title,
    domain,
    cited: source.cited === true,
    organization: normalizeText(source.organization) || null,
    docType: normalizeText(source.docType ?? source.doc_type) || null,
    effectiveDate: normalizeDateOnly(source.effectiveDate ?? source.effective_date),
    retrievedAt: normalizeIsoDate(source.retrievedAt ?? source.retrieved_at),
    claimScope: normalizeText(source.claimScope ?? source.claim_scope) || null,
    supportStrength: normalizeText(source.supportStrength ?? source.support_strength).toLowerCase() === "background" ? "background" : "direct",
    official: source.official !== false,
  };
}

function dedupeCitations(values: unknown, fallbackSources: MedSafetySource[]) {
  const rawList = Array.isArray(values) ? values : [];
  const normalized: Array<MedSafetySource & { id: string }> = [];
  const byKey = new Map<string, number>();

  const pushCitation = (source: MedSafetySource & { id: string }) => {
    const key = normalizeText(source.url || source.id || source.title || source.domain).toLowerCase();
    if (!key) return;
    const existingIndex = byKey.get(key);
    if (existingIndex == null) {
      byKey.set(key, normalized.length);
      normalized.push(source);
      return;
    }
    const existing = normalized[existingIndex]!;
    normalized[existingIndex] = {
      ...existing,
      ...source,
      id: existing.id || source.id,
      cited: existing.cited || source.cited,
      official: existing.official !== false || source.official !== false,
      supportStrength: existing.supportStrength === "direct" ? "direct" : source.supportStrength,
      organization: existing.organization || source.organization,
      docType: existing.docType || source.docType,
      effectiveDate: existing.effectiveDate || source.effectiveDate,
      retrievedAt: existing.retrievedAt || source.retrievedAt,
      claimScope: existing.claimScope || source.claimScope,
      title: existing.title || source.title,
      domain: existing.domain || source.domain,
      url: existing.url || source.url,
    };
  };

  rawList.forEach((item, index) => {
    const citation = normalizeCitation(item, `src_${index + 1}`);
    if (citation) pushCitation(citation);
  });

  mergeMedSafetySources(fallbackSources, 12).forEach((source: MedSafetySource, index: number) => {
    pushCitation({
      ...source,
      id: normalizeText((source as Record<string, unknown>).id) || `fallback_${index + 1}`,
      organization: source.organization ?? null,
      docType: source.docType ?? null,
      effectiveDate: source.effectiveDate ?? null,
      retrievedAt: source.retrievedAt ?? null,
      claimScope: source.claimScope ?? null,
      supportStrength: source.supportStrength ?? "direct",
      official: source.official !== false,
    });
  });

  return normalized.slice(0, 12);
}

function normalizeAnswerItem(value: unknown): MedSafetyAnswerItem | null {
  if (typeof value === "string") {
    const text = normalizeText(value);
    if (!text) return null;
    return {
      text,
      citation_ids: [],
      evidence_status: "needs_review",
    };
  }
  if (!isRecord(value)) return null;
  const text = normalizeText(value.text);
  if (!text) return null;
  const citationIds = uniqueStrings(value.citation_ids, 6);
  return {
    text,
    citation_ids: citationIds,
    evidence_status: normalizeEvidenceStatus(value.evidence_status, citationIds),
  };
}

function normalizeAnswerItems(value: unknown, limit = 6) {
  if (!Array.isArray(value)) return [] as MedSafetyAnswerItem[];
  const out: MedSafetyAnswerItem[] = [];
  for (const item of value) {
    const normalized = normalizeAnswerItem(item);
    if (!normalized) continue;
    out.push(normalized);
    if (out.length >= limit) break;
  }
  return out;
}

function normalizeComparisonRow(value: unknown): MedSafetyComparisonTableRow | null {
  if (!isRecord(value)) return null;
  const role = normalizeText(value.role);
  const whenToUse = normalizeText(value.when_to_use);
  const effectOnset = normalizeText(value.effect_onset);
  const limitations = normalizeText(value.limitations);
  const bedsidePoints = normalizeText(value.bedside_points);
  if (!role && !whenToUse && !effectOnset && !limitations && !bedsidePoints) return null;
  const citationIds = uniqueStrings(value.citation_ids, 6);
  return {
    role,
    when_to_use: whenToUse,
    effect_onset: effectOnset,
    limitations,
    bedside_points: bedsidePoints,
    citation_ids: citationIds,
    evidence_status: normalizeEvidenceStatus(value.evidence_status, citationIds),
  };
}

function normalizeComparisonTable(value: unknown, limit = 8) {
  if (!Array.isArray(value)) return [] as MedSafetyComparisonTableRow[];
  const out: MedSafetyComparisonTableRow[] = [];
  for (const item of value) {
    const normalized = normalizeComparisonRow(item);
    if (!normalized) continue;
    out.push(normalized);
    if (out.length >= limit) break;
  }
  return out;
}

function collectCitationIds(answer: Omit<MedSafetyStructuredAnswer, "schema_version" | "citations">) {
  const ids = new Set<string>();
  uniqueStrings(answer.bottom_line_citation_ids, 6).forEach((id) => ids.add(id));
  [
    answer.key_points,
    answer.recommended_actions,
    answer.do_not_do,
    answer.when_to_escalate,
    answer.patient_specific_caveats,
  ].forEach((items) => {
    items.forEach((item) => item.citation_ids.forEach((id) => ids.add(id)));
  });
  answer.comparison_table.forEach((row) => row.citation_ids.forEach((id) => ids.add(id)));
  return ids;
}

function normalizeFreshness(value: unknown, citations: Array<MedSafetySource & { id: string }>): MedSafetyAnswerFreshness {
  const node = isRecord(value) ? value : {};
  const newestEffectiveDate =
    normalizeDateOnly(node.newest_effective_date) ??
    citations
      .map((citation) => citation.effectiveDate)
      .filter((item): item is string => Boolean(item))
      .sort()
      .at(-1) ??
    null;
  const retrievedAt =
    normalizeIsoDate(node.retrieved_at) ??
    citations
      .map((citation) => citation.retrievedAt)
      .filter((item): item is string => Boolean(item))
      .sort()
      .at(-1) ??
    null;
  const verificationStatusRaw = normalizeText(node.verification_status).toLowerCase();
  const verificationStatus: MedSafetyVerificationStatus =
    MED_SAFETY_VERIFICATION_STATUSES.includes(verificationStatusRaw as MedSafetyVerificationStatus)
      ? (verificationStatusRaw as MedSafetyVerificationStatus)
      : newestEffectiveDate
        ? "verified"
        : citations.length
          ? "unknown"
          : "dated";
  return {
    retrieved_at: retrievedAt,
    newest_effective_date: newestEffectiveDate,
    note:
      normalizeText(node.note) ||
      (citations.length
        ? verificationStatus === "verified"
          ? "공식 또는 공공 근거를 확인한 뒤 정리했습니다."
          : "검색 시점 기준으로 확인했지만 문서 날짜는 일부 확인되지 않았습니다."
        : "공식 근거를 충분히 확보하지 못했습니다."),
    verification_status: verificationStatus,
  };
}

function normalizeUncertainty(value: unknown, hasMissingSupport: boolean): MedSafetyAnswerUncertainty {
  const node = isRecord(value) ? value : {};
  const reasons = uniqueStrings(node.reasons, 6);
  const needsVerification = node.needs_verification === true || hasMissingSupport;
  return {
    summary:
      normalizeText(node.summary) ||
      (needsVerification ? "일부 내용은 공식 근거 연결이 약해 추가 확인이 필요합니다." : "핵심 내용은 확보한 근거 범위 안에서 정리했습니다."),
    needs_verification: needsVerification,
    reasons: reasons.length ? reasons : needsVerification ? ["근거 연결이 약한 항목이 있습니다."] : [],
  };
}

export function normalizeMedSafetyStructuredAnswer(raw: unknown, fallbackSources: MedSafetySource[] = []): MedSafetyStructuredAnswer {
  const node = isRecord(raw) ? raw : {};
  const comparisonTable = normalizeComparisonTable(node.comparison_table);
  const citations = dedupeCitations(node.citations, fallbackSources);
  const citationIds = new Set(citations.map((citation) => citation.id));

  const answer = {
    question_type: normalizeQuestionType(node.question_type, comparisonTable.length > 0),
    triage_level: normalizeTriageLevel(node.triage_level),
    bottom_line: normalizeText(node.bottom_line),
    bottom_line_citation_ids: uniqueStrings(node.bottom_line_citation_ids, 6),
    key_points: normalizeAnswerItems(node.key_points),
    recommended_actions: normalizeAnswerItems(node.recommended_actions),
    do_not_do: normalizeAnswerItems(node.do_not_do),
    when_to_escalate: normalizeAnswerItems(node.when_to_escalate),
    patient_specific_caveats: normalizeAnswerItems(node.patient_specific_caveats),
    comparison_table: comparisonTable,
  };

  if (!answer.bottom_line) {
    answer.bottom_line =
      answer.key_points[0]?.text ||
      answer.recommended_actions[0]?.text ||
      "질문 의도에 맞는 직접 결론을 충분히 생성하지 못했습니다. 공식 근거를 다시 확인해 주세요.";
  }

  const allClaimIds = collectCitationIds({
    ...answer,
    uncertainty: { summary: "", needs_verification: false, reasons: [] },
    freshness: { retrieved_at: null, newest_effective_date: null, note: "", verification_status: "unknown" },
  } as Omit<MedSafetyStructuredAnswer, "schema_version" | "citations">);

  const normalizedCitations = citations.map((citation) => ({
    ...citation,
    cited: citation.cited || allClaimIds.has(citation.id),
  }));

  const cleanIds = (ids: string[]) => ids.filter((id) => citationIds.has(id));
  answer.bottom_line_citation_ids = cleanIds(answer.bottom_line_citation_ids);
  [
    answer.key_points,
    answer.recommended_actions,
    answer.do_not_do,
    answer.when_to_escalate,
    answer.patient_specific_caveats,
  ].forEach((items) => {
    items.forEach((item) => {
      item.citation_ids = cleanIds(item.citation_ids);
      item.evidence_status = normalizeEvidenceStatus(item.evidence_status, item.citation_ids);
    });
  });
  answer.comparison_table.forEach((row) => {
    row.citation_ids = cleanIds(row.citation_ids);
    row.evidence_status = normalizeEvidenceStatus(row.evidence_status, row.citation_ids);
  });

  const missingSupport =
    !answer.bottom_line_citation_ids.length ||
    [
      ...answer.key_points,
      ...answer.recommended_actions,
      ...answer.do_not_do,
      ...answer.when_to_escalate,
      ...answer.patient_specific_caveats,
    ].some((item) => item.evidence_status !== "supported") ||
    answer.comparison_table.some((row) => row.evidence_status !== "supported");

  return {
    schema_version: MED_SAFETY_SCHEMA_VERSION,
    question_type: answer.question_type,
    triage_level: answer.triage_level,
    bottom_line: answer.bottom_line,
    bottom_line_citation_ids: answer.bottom_line_citation_ids,
    key_points: answer.key_points,
    recommended_actions: answer.recommended_actions,
    do_not_do: answer.do_not_do,
    when_to_escalate: answer.when_to_escalate,
    patient_specific_caveats: answer.patient_specific_caveats,
    uncertainty: normalizeUncertainty(node.uncertainty, missingSupport),
    freshness: normalizeFreshness(node.freshness, normalizedCitations),
    citations: normalizedCitations,
    comparison_table: answer.comparison_table,
  };
}

function pushAnswerItemLines(lines: string[], title: string, items: MedSafetyAnswerItem[]) {
  if (!items.length) return;
  lines.push(`${title}:`);
  items.forEach((item) => {
    const suffix = item.evidence_status === "needs_review" ? " (근거 확인 필요)" : "";
    lines.push(`- ${item.text}${suffix}`);
  });
}

export function buildMedSafetyAnswerText(answer: MedSafetyStructuredAnswer) {
  const lines: string[] = [answer.bottom_line];
  pushAnswerItemLines(lines, "핵심 포인트", answer.key_points);
  pushAnswerItemLines(lines, "권고", answer.recommended_actions);
  pushAnswerItemLines(lines, "피해야 할 점", answer.do_not_do);
  pushAnswerItemLines(lines, "즉시 보고/에스컬레이션", answer.when_to_escalate);
  pushAnswerItemLines(lines, "환자별 예외", answer.patient_specific_caveats);

  if (answer.comparison_table.length) {
    lines.push("비교:");
    answer.comparison_table.forEach((row) => {
      const parts = [row.role, row.when_to_use, row.effect_onset, row.limitations, row.bedside_points]
        .map((part) => normalizeText(part))
        .filter(Boolean);
      if (!parts.length) return;
      const suffix = row.evidence_status === "needs_review" ? " (근거 확인 필요)" : "";
      lines.push(`- ${parts.join(" / ")}${suffix}`);
    });
  }

  if (answer.uncertainty.summary) {
    lines.push(`근거 제한: ${answer.uncertainty.summary}`);
  }
  if (answer.freshness.note) {
    lines.push(`최신성: ${answer.freshness.note}`);
  }

  return lines.join("\n");
}

export function buildMedSafetyQualitySnapshot(args: {
  answer: MedSafetyStructuredAnswer;
  verification: MedSafetyVerificationReport | null;
  grounded: boolean;
}): MedSafetyQualitySnapshot {
  const claimItems = [
    { citation_ids: args.answer.bottom_line_citation_ids, evidence_status: args.answer.bottom_line_citation_ids.length ? "supported" : "needs_review" },
    ...args.answer.key_points,
    ...args.answer.recommended_actions,
    ...args.answer.do_not_do,
    ...args.answer.when_to_escalate,
    ...args.answer.patient_specific_caveats,
    ...args.answer.comparison_table,
  ];
  const totalClaimCount = claimItems.length;
  const supportedClaimCount = claimItems.filter(
    (item) => item.evidence_status === "supported" && Array.isArray(item.citation_ids) && item.citation_ids.length > 0
  ).length;
  const unsupportedClaimCount = Math.max(0, totalClaimCount - supportedClaimCount);
  const citations = mergeMedSafetySources(args.answer.citations, 12);
  const officialCitations = citations.filter((citation: MedSafetySource) => citation.official !== false).length;
  const officialCitationRate = citations.length ? Number((officialCitations / citations.length).toFixed(4)) : 0;

  return {
    verification_run: Boolean(args.verification?.ran),
    verification_passed: args.verification ? args.verification.passed : true,
    official_citation_rate: officialCitationRate,
    unsupported_claim_count: unsupportedClaimCount,
    supported_claim_count: supportedClaimCount,
    total_claim_count: totalClaimCount,
    grounded: args.grounded,
    high_risk: args.answer.triage_level !== "routine",
  };
}

export function getReferencedCitationIds(answer: MedSafetyStructuredAnswer) {
  return Array.from(collectCitationIds(answer));
}
