import { sanitizeMedSafetyTextUrls } from "@/lib/medSafetySources";

export type MedSafetyAnswerSectionTone = "summary" | "action" | "warning" | "compare" | "neutral";

export type MedSafetyAnswerSection = {
  title: string;
  lead: string;
  bodyLines: string[];
  tone: MedSafetyAnswerSectionTone;
  continuation?: boolean;
};

export type MedSafetyAnswerDisplayLine =
  | { kind: "blank"; level: number; content: string }
  | { kind: "bullet"; level: number; content: string }
  | { kind: "number"; level: number; content: string; marker: string }
  | { kind: "label"; level: number; content: string; marker: string }
  | { kind: "text"; level: number; content: string };

type SectionHeadingContext = {
  previousLine?: string | null;
  nextLine?: string | null;
};

const EXPLICIT_SECTION_TITLE_PATTERNS = [
  /^(핵심|핵심요약|핵심해석|핵심판단|요약|결론|한눈에요약|정의|임상의미)$/i,
  /^(구분포인트|감별포인트|비교|차이|선택기준)$/i,
  /^(보통이렇게생각합니다)$/i,
  /^(주의|주의점|위험|경고|보고기준|호출기준|중단기준|보고예시|보고문구|sbar|sbar예시)$/i,
  /^(즉시보고신호|보고신호|즉시보고|노티전확인|노티포인트)$/i,
  /^(질문에대한직접답|직접답|직접답변)$/i,
  /^(실무적으로는|실무적으로|실무정리|실무요약|실무포인트)$/i,
  /^(핵심관찰포인트|관찰포인트|모니터링포인트)$/i,
  /^.+(포인트|확인할것|예시|기준|주의|설명|정리|대응|할일|점|신호|의미)$/i,
];

function normalizeAnswerRawLine(value: string) {
  return String(value ?? "")
    .replace(/\u0000/g, "")
    .replace(/\r/g, "")
    .replace(/\t/g, "  ")
    .replace(/\s+$/g, "");
}

function stripMarkdownDecorations(value: string) {
  return String(value ?? "")
    .replace(/^\s{0,3}#{1,6}\s+/, "")
    .replace(/^\s*>\s?/, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/_([^_\n]+)_/g, "$1");
}

function stripMarkdownDisplayDecorations(value: string) {
  return String(value ?? "")
    .replace(/^\s{0,3}#{1,6}\s+/, "")
    .replace(/^\s*>\s?/, "")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1$2")
    .replace(/_([^_\n]+)_/g, "$1");
}

function cleanAnswerLine(value: string) {
  return stripMarkdownDecorations(normalizeAnswerRawLine(value))
    .replace(/\s+/g, " ")
    .trim();
}

function cleanAnswerDisplayLine(value: string) {
  return stripMarkdownDisplayDecorations(normalizeAnswerRawLine(value))
    .replace(/\s+/g, " ")
    .trim();
}

function unwrapBracketWrappedHeading(value: string) {
  const cleaned = cleanAnswerLine(value);
  const match = cleaned.match(/^(?:\[(.+)\]|【(.+)】|〔(.+)〕)$/);
  const inner = match?.[1] ?? match?.[2] ?? match?.[3] ?? "";
  return inner.trim() || cleaned;
}

function normalizeHeadingKey(value: string) {
  return unwrapBracketWrappedHeading(value)
    .replace(/^\s*["'`“”‘’]+/, "")
    .replace(/["'`“”‘’]+\s*$/, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/（[^）]*）/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/[:：]$/, "")
    .replace(/\s+/g, "")
    .trim()
    .toLowerCase();
}

function stripBulletPrefix(value: string) {
  return String(value ?? "")
    .trimStart()
    .replace(/^[-*•·]\s+/, "")
    .replace(/^\d+[.)]\s+/, "")
    .trim();
}

function extractLeadText(value: string) {
  const match = cleanAnswerDisplayLine(value).match(/^리드\s*문장\s*[:：]\s*(.+)\s*$/i);
  return match?.[1]?.trim() ?? null;
}

function looksLikeStructuredAnswerLine(value: string) {
  const raw = String(value ?? "").trimStart();
  if (!raw) return false;
  if (/^[-*•·]\s+/.test(raw)) return true;
  if (/^\d+[.)]\s+/.test(raw)) return true;
  if (/^[A-Za-z][A-Za-z0-9/+ -]{0,24}:\s*/.test(raw)) return true;
  return false;
}

function looksLikeSentence(value: string) {
  const normalized = cleanAnswerLine(value);
  if (!normalized) return false;
  if (/[.。!?？！]$/.test(normalized)) return true;
  if (/(니다|습니다|세요|시오|입니다|합니다|됩니다|였습니다|있습니다|없습니다)$/.test(normalized)) return true;
  return false;
}

function looksLikeQuestionHeading(value: string) {
  const trimmed = cleanAnswerLine(value);
  if (!trimmed) return false;
  if (!/[?？]$/.test(trimmed)) return false;
  if (trimmed.length > 60) return false;
  if (/^(왜|그럼|그러면|만약|언제|어떻게|어디서|무엇이|뭐가|어떤|~는|~은|현재)/.test(trimmed)) return true;
  if (/^.{2,30}(인가|하나|되나|일까|인지|할까)\s*[?？]$/.test(trimmed)) return true;
  return false;
}

function looksLikeTopLevelSectionHeading(value: string, context: SectionHeadingContext = {}) {
  const normalized = cleanAnswerLine(value);
  if (!normalized) return false;
  if (looksLikeStructuredAnswerLine(normalized)) return false;
  if (extractLeadText(normalized)) return false;

  const key = normalizeHeadingKey(normalized);
  if (!key) return false;

  const previousLineBlank = !cleanAnswerLine(context.previousLine ?? "");
  const nextLine = cleanAnswerLine(context.nextLine ?? "");
  const nextLineIsLead = Boolean(extractLeadText(nextLine));
  const hasNextLine = Boolean(nextLine);

  if (EXPLICIT_SECTION_TITLE_PATTERNS.some((pattern) => pattern.test(key))) {
    if (!hasNextLine) return false;
    if (nextLineIsLead) return true;
    if (key.length <= 32 && !looksLikeSentence(normalized)) return true;
    return previousLineBlank;
  }

  if (previousLineBlank && looksLikeQuestionHeading(normalized) && hasNextLine) {
    return true;
  }

  if (!previousLineBlank) return false;
  if (looksLikeSentence(normalized)) return false;
  if (key.length > 36) return false;

  if (nextLineIsLead) return true;

  if (hasNextLine && key.length <= 24 && !looksLikeSentence(normalized)) {
    return true;
  }

  return false;
}

function formatSectionTitle(value: string) {
  return stripBulletPrefix(unwrapBracketWrappedHeading(value)).replace(/[:：]$/, "").trim() || "핵심";
}

function trimBlankLines(lines: string[]) {
  let start = 0;
  let end = lines.length;
  while (start < end && !cleanAnswerLine(lines[start])) start += 1;
  while (end > start && !cleanAnswerLine(lines[end - 1])) end -= 1;
  return lines.slice(start, end);
}

function inferSectionTone(title: string, index: number): MedSafetyAnswerSectionTone {
  const normalized = normalizeHeadingKey(title);
  if (index === 0 || /(핵심|요약|결론|정의|임상의미|정리)/.test(normalized)) return "summary";
  if (/(지금할일|즉시대응|조치|확인|실무포인트|실무적으로|간호포인트|노티|보고예시|보고문구|sbar|예시)/.test(normalized)) return "action";
  if (/(주의|위험|경고|보고신호|즉시보고|호출|중단|stop)/.test(normalized)) return "warning";
  if (/(비교|차이|선택기준|구분포인트|감별포인트|직접답)/.test(normalized)) return "compare";
  return "neutral";
}

function buildSectionContent(lines: string[]) {
  const trimmedLines = trimBlankLines(lines.map((line) => normalizeAnswerRawLine(line)));
  if (!trimmedLines.length) return null;

  const explicitLead = extractLeadText(trimmedLines[0]);
  if (explicitLead) {
    return {
      lead: explicitLead,
      bodyLines: trimmedLines.slice(1),
    };
  }

  const firstParsed = parseMedSafetyDisplayLine(trimmedLines[0]);
  if (firstParsed.kind === "bullet" || firstParsed.kind === "number" || firstParsed.kind === "label") {
    return {
      lead: "",
      bodyLines: trimmedLines,
    };
  }

  return {
    lead: normalizeAnswerRawLine(trimmedLines[0]).trim(),
    bodyLines: trimmedLines.slice(1),
  };
}

function getIndentLevel(value: string) {
  const leadingWhitespace = String(value ?? "").match(/^(\s*)/)?.[1] ?? "";
  return Math.min(3, Math.floor(leadingWhitespace.length / 2));
}

export function normalizeMedSafetyAnswerText(value: unknown) {
  return String(value ?? "")
    .replace(/\u0000/g, "")
    .replace(/\r/g, "")
    .trim();
}

export function parseMedSafetyDisplayLine(value: string): MedSafetyAnswerDisplayLine {
  const raw = normalizeAnswerRawLine(value);
  if (!cleanAnswerLine(raw)) {
    return { kind: "blank", content: "", level: 0 };
  }

  const explicitLead = extractLeadText(raw);
  if (explicitLead) {
    return {
      kind: "text",
      content: explicitLead,
      level: getIndentLevel(raw),
    };
  }

  const bulletMatch = raw.match(/^(\s*)[-*•·]\s+(.*)$/);
  if (bulletMatch) {
    return {
      kind: "bullet",
      content: cleanAnswerDisplayLine(bulletMatch[2]),
      level: getIndentLevel(bulletMatch[1]),
    };
  }

  const numberedMatch = raw.match(/^(\s*)(\d+[.)])\s+(.*)$/);
  if (numberedMatch) {
    return {
      kind: "number",
      marker: numberedMatch[2],
      content: cleanAnswerDisplayLine(numberedMatch[3]),
      level: getIndentLevel(numberedMatch[1]),
    };
  }

  const labelMatch = raw.match(/^(\s*)([A-Za-z][A-Za-z0-9/+ -]{0,24}:)\s*(.*)$/);
  if (labelMatch) {
    return {
      kind: "label",
      marker: labelMatch[2],
      content: cleanAnswerDisplayLine(labelMatch[3]),
      level: getIndentLevel(labelMatch[1]),
    };
  }

  return {
    kind: "text",
    content: cleanAnswerDisplayLine(raw),
    level: getIndentLevel(raw),
  };
}

function renderCanonicalDisplayLine(value: string) {
  const parsed = parseMedSafetyDisplayLine(value);
  if (parsed.kind === "blank") return "";
  const indent = parsed.level > 0 ? "  ".repeat(parsed.level) : "";
  if (parsed.kind === "bullet") return `${indent}- ${parsed.content}`.trimEnd();
  if (parsed.kind === "number") return `${indent}${parsed.marker} ${parsed.content}`.trimEnd();
  if (parsed.kind === "label") return `${indent}${parsed.marker} ${parsed.content}`.trimEnd();
  return `${indent}${parsed.content}`.trimEnd();
}

export function buildMedSafetyDisplayLines(lines: string[]): MedSafetyAnswerDisplayLine[] {
  return lines.map((line) => parseMedSafetyDisplayLine(line));
}

export function parseMedSafetyAnswerSections(value: string): MedSafetyAnswerSection[] {
  const lines = String(value ?? "")
    .replace(/\r/g, "")
    .split("\n");

  const sections: MedSafetyAnswerSection[] = [];
  let currentTitle: string | null = null;
  let currentLines: string[] = [];

  const pushCurrent = () => {
    const content = buildSectionContent(currentLines);
    if (!content) {
      currentLines = [];
      return;
    }
    const resolvedTitle = currentTitle || (sections.length === 0 ? "결론" : "추가 설명");
    sections.push({
      title: resolvedTitle,
      lead: content.lead,
      bodyLines: content.bodyLines,
      tone: inferSectionTone(resolvedTitle, sections.length),
    });
    currentLines = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = normalizeAnswerRawLine(lines[index] ?? "");
    const line = cleanAnswerLine(rawLine);
    if (!line) {
      currentLines.push("");
      continue;
    }

    let nextNonEmptyLine: string | null = null;
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const candidate = cleanAnswerLine(lines[cursor] ?? "");
      if (!candidate) continue;
      nextNonEmptyLine = lines[cursor] ?? "";
      break;
    }

    if (
      looksLikeTopLevelSectionHeading(rawLine, {
        previousLine: index > 0 ? lines[index - 1] ?? "" : "",
        nextLine: nextNonEmptyLine,
      })
    ) {
      pushCurrent();
      currentTitle = formatSectionTitle(rawLine);
      continue;
    }

    currentLines.push(rawLine);
  }

  pushCurrent();

  if (sections.length) return sections;

  const fallback = buildSectionContent(lines);
  if (!fallback) {
    const rawText = normalizeMedSafetyAnswerText(value);
    return rawText
      ? [{ title: "결론", lead: rawText, bodyLines: [], tone: "summary" }]
      : [];
  }

  return [
    {
      title: "결론",
      lead: fallback.lead,
      bodyLines: fallback.bodyLines,
      tone: "summary",
    },
  ];
}

export function canonicalizeMedSafetyAnswerText(value: unknown) {
  const normalized = sanitizeMedSafetyTextUrls(normalizeMedSafetyAnswerText(value));
  if (!normalized) return "";

  const sections = parseMedSafetyAnswerSections(normalized);
  if (!sections.length) return normalized;

  const output: string[] = [];

  sections.forEach((section, index) => {
    const isImplicitConclusion = index === 0 && normalizeHeadingKey(section.title) === "결론";
    const lead = cleanAnswerDisplayLine(section.lead);
    const body = section.bodyLines
      .map((line) => renderCanonicalDisplayLine(line))
      .filter((line) => line.trim().length > 0);

    if (output.length) {
      output.push("");
      output.push("");
    }

    if (!isImplicitConclusion) output.push(formatSectionTitle(section.title));
    if (lead) output.push(lead);
    output.push(...body);
  });

  return output.join("\n").replace(/\n{4,}/g, "\n\n\n").trim();
}

export function buildMedSafetySectionBodyText(section: Pick<MedSafetyAnswerSection, "lead" | "bodyLines">) {
  return [section.lead, ...section.bodyLines]
    .filter((line) => String(line ?? "").trim().length > 0)
    .join("\n")
    .trim();
}
