export type MedSafetySourceSupportStrength = "direct" | "background";

export type MedSafetySource = {
  id?: string;
  url: string;
  title: string;
  domain: string;
  cited: boolean;
  organization?: string | null;
  docType?: string | null;
  effectiveDate?: string | null;
  retrievedAt?: string | null;
  claimScope?: string | null;
  supportStrength?: MedSafetySourceSupportStrength | null;
  official?: boolean;
};

export type MedSafetyInlineCitationParseResult = {
  text: string;
  citations: MedSafetySource[];
};

export type MedSafetyGroundingMode = "none" | "premium_web" | "official_search";
export type MedSafetyGroundingStatus = "none" | "ok" | "failed";

type MedSafetySourceInput = {
  id?: unknown;
  url?: unknown;
  title?: unknown;
  domain?: unknown;
  cited?: unknown;
  organization?: unknown;
  docType?: unknown;
  doc_type?: unknown;
  effectiveDate?: unknown;
  effective_date?: unknown;
  retrievedAt?: unknown;
  retrieved_at?: unknown;
  claimScope?: unknown;
  claim_scope?: unknown;
  supportStrength?: unknown;
  support_strength?: unknown;
  official?: unknown;
};

const COMMON_LABEL_MAP: Array<[RegExp, string]> = [
  [/pubmed/i, "PubMed"],
  [/clinicaltrials/i, "ClinicalTrials"],
  [/(^|\.)fda\.gov$/i, "FDA"],
  [/(^|\.)cdc\.gov$/i, "CDC"],
  [/(^|\.)who\.int$/i, "WHO"],
  [/(^|\.)nih\.gov$/i, "NIH"],
  [/(^|\.)medlineplus\.gov$/i, "MedlinePlus"],
  [/(^|\.)nice\.org\.uk$/i, "NICE"],
  [/(^|\.)nhs\.uk$/i, "NHS"],
  [/(^|\.)ema\.europa\.eu$/i, "EMA"],
  [/(^|\.)cochranelibrary\.com$/i, "Cochrane"],
  [/(^|\.)mfds\.go\.kr$/i, "MFDS"],
  [/(^|\.)kdca\.go\.kr$/i, "KDCA"],
];

const MED_SAFETY_URL_PATTERN = /https?:\/\/[^\s<>"')\]]+/gi;

function normalizeText(value: unknown) {
  return String(value ?? "")
    .replace(/\r/g, "")
    .replace(/\u0000/g, "")
    .replace(/\s+/g, " ")
    .trim();
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

function shouldStripMedSafetyTrackingParam(key: string, value: string) {
  const normalizedKey = normalizeText(key).toLowerCase();
  const normalizedValue = normalizeText(value).toLowerCase();
  if (!normalizedKey) return false;
  if (normalizedKey.startsWith("utm_")) return true;
  if (normalizedKey === "source" && normalizedValue === "openai") return true;
  return false;
}

export function normalizeMedSafetySourceUrl(value: unknown) {
  const trimmed = normalizeText(value);
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    for (const [key, paramValue] of Array.from(url.searchParams.entries())) {
      if (shouldStripMedSafetyTrackingParam(key, paramValue)) {
        url.searchParams.delete(key);
      }
    }
    return url.toString();
  } catch {
    return "";
  }
}

export function sanitizeMedSafetyTextUrls(value: unknown) {
  return String(value ?? "").replace(MED_SAFETY_URL_PATTERN, (match) => normalizeMedSafetySourceUrl(match) || match);
}

function normalizeMedSafetySourceLookupUrl(value: unknown) {
  const url = normalizeMedSafetySourceUrl(value);
  if (!url) return "";
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    if (parsed.pathname !== "/") {
      parsed.pathname = parsed.pathname.replace(/\/+$/g, "") || "/";
    }
    return parsed.toString();
  } catch {
    return url.replace(/\/+$/g, "");
  }
}

export function getMedSafetySourceDomain(value: unknown) {
  const url = normalizeMedSafetySourceUrl(value);
  if (!url) return "";
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

export function formatMedSafetySourceDomain(domain: string) {
  return normalizeText(domain).replace(/^www\./i, "");
}

export function isOfficialMedSafetyDomain(domain: string) {
  const host = formatMedSafetySourceDomain(domain);
  return COMMON_LABEL_MAP.some(([pattern]) => pattern.test(host));
}

export function inferMedSafetyOrganization(domain: string, title?: string | null) {
  const host = formatMedSafetySourceDomain(domain);
  for (const [pattern, label] of COMMON_LABEL_MAP) {
    if (pattern.test(host)) return label;
  }
  const normalizedTitle = normalizeText(title);
  return normalizedTitle && normalizedTitle.length <= 32 ? normalizedTitle : fallbackTitleFromDomain(host);
}

function fallbackTitleFromDomain(domain: string) {
  const host = formatMedSafetySourceDomain(domain);
  for (const [pattern, label] of COMMON_LABEL_MAP) {
    if (pattern.test(host)) return label;
  }
  const parts = host.split(".").filter(Boolean);
  const core = parts.length >= 2 ? parts[parts.length - 2] ?? host : host;
  return core
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildNormalizedTitle(title: unknown, domain: string) {
  return normalizeText(title) || fallbackTitleFromDomain(domain) || "Source";
}

function isFallbackLikeTitle(title: string, domain: string) {
  const normalizedTitle = normalizeText(title).toLowerCase();
  const fallback = fallbackTitleFromDomain(domain).toLowerCase();
  return !normalizedTitle || normalizedTitle === fallback;
}

export function buildMedSafetySource(input: MedSafetySourceInput): MedSafetySource | null {
  const url = normalizeMedSafetySourceUrl(input.url);
  if (!url) return null;
  const domain = formatMedSafetySourceDomain(normalizeText(input.domain) || getMedSafetySourceDomain(url));
  if (!domain) return null;
  return {
    id: normalizeText(input.id) || undefined,
    url,
    domain,
    title: buildNormalizedTitle(input.title, domain),
    cited: input.cited === true,
    organization: normalizeText(input.organization) || inferMedSafetyOrganization(domain, normalizeText(input.title)) || null,
    docType: normalizeText(input.docType ?? input.doc_type) || null,
    effectiveDate: normalizeDateOnly(input.effectiveDate ?? input.effective_date),
    retrievedAt: normalizeIsoDate(input.retrievedAt ?? input.retrieved_at),
    claimScope: normalizeText(input.claimScope ?? input.claim_scope) || null,
    supportStrength:
      normalizeText(input.supportStrength ?? input.support_strength).toLowerCase() === "background" ? "background" : "direct",
    official: input.official === false ? false : isOfficialMedSafetyDomain(domain),
  };
}

export function mergeMedSafetySources(values: MedSafetySourceInput[], limit = 8) {
  const normalizedLimit = Math.max(0, Math.min(24, Math.round(limit)));
  if (!normalizedLimit) return [] as MedSafetySource[];

  const orderedKeys: string[] = [];
  const byUrl = new Map<string, MedSafetySource>();

  for (const value of values) {
    const next = buildMedSafetySource(value);
    if (!next) continue;
    const key = next.url;
    const current = byUrl.get(key);
    if (!current) {
      byUrl.set(key, next);
      orderedKeys.push(key);
      continue;
    }
    current.id ||= next.id;
    current.cited ||= next.cited;
    if (isFallbackLikeTitle(current.title, current.domain) && !isFallbackLikeTitle(next.title, next.domain)) {
      current.title = next.title;
    }
    if (!current.domain && next.domain) current.domain = next.domain;
    current.organization ||= next.organization;
    current.docType ||= next.docType;
    current.effectiveDate ||= next.effectiveDate;
    current.retrievedAt ||= next.retrievedAt;
    current.claimScope ||= next.claimScope;
    current.official = current.official !== false || next.official !== false;
    if (current.supportStrength !== "direct" && next.supportStrength === "direct") {
      current.supportStrength = "direct";
    } else if (!current.supportStrength) {
      current.supportStrength = next.supportStrength ?? "direct";
    }
  }

  const ordered = orderedKeys
    .map((key) => byUrl.get(key))
    .filter((value): value is MedSafetySource => Boolean(value));

  const cited = ordered.filter((item) => item.cited);
  const uncited = ordered.filter((item) => !item.cited);
  return [...cited, ...uncited].slice(0, normalizedLimit);
}

export function getMedSafetySourceLabel(source: Pick<MedSafetySource, "domain" | "title">) {
  const domain = formatMedSafetySourceDomain(source.domain);
  for (const [pattern, label] of COMMON_LABEL_MAP) {
    if (pattern.test(domain)) return label;
  }
  const shortTitle = normalizeText(source.title);
  if (shortTitle && shortTitle.length <= 18) return shortTitle;
  return fallbackTitleFromDomain(domain);
}

export function buildMedSafetySourcesCopyLines(sources: MedSafetySource[]) {
  return mergeMedSafetySources(sources).map((source, index) => `${index + 1}. ${source.title} — ${source.url}`);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function trimInlineCitationUrl(value: string) {
  let output = normalizeText(value);
  while (output && /[),.;\]]$/.test(output)) {
    if (output.endsWith(")")) {
      const openCount = (output.match(/\(/g) ?? []).length;
      const closeCount = (output.match(/\)/g) ?? []).length;
      if (openCount >= closeCount) break;
    }
    output = output.slice(0, -1).trimEnd();
  }
  return output;
}

function cleanupInlineCitationText(value: string) {
  return normalizeText(
    String(value ?? "")
      .replace(/\[\s*\]\(\s*\)/g, " ")
      .replace(/\(\s*\)/g, " ")
      .replace(/\[\s*\]/g, " ")
      .replace(/【\s*】/g, " ")
      .replace(/\{\s*\}/g, " ")
      .replace(/\s+([,.;:!?)\]])/g, "$1")
      .replace(/([(［【])\s+/g, "$1")
      .replace(/\s{2,}/g, " ")
      .replace(/(?:\s*[-–,:;])+\s*$/g, "")
      .replace(/[([{\s]+$/g, "")
  );
}

function matchMedSafetySourceByUrl(url: string, sources: MedSafetySource[]) {
  const normalizedUrl = normalizeMedSafetySourceLookupUrl(url);
  if (!normalizedUrl) return null;
  for (const source of sources) {
    if (normalizeMedSafetySourceLookupUrl(source.url) === normalizedUrl) return source;
  }
  const domain = formatMedSafetySourceDomain(getMedSafetySourceDomain(normalizedUrl));
  if (!domain) return null;
  return sources.find((source) => formatMedSafetySourceDomain(source.domain) === domain) ?? null;
}

function stripBracketWrappedSourceToken(text: string, token: string) {
  const normalizedToken = normalizeText(token);
  if (!normalizedToken) return text;
  const escapedToken = escapeRegExp(normalizedToken);
  return text.replace(new RegExp(`(?:\\[\\s*${escapedToken}\\s*\\]|\\(\\s*${escapedToken}\\s*\\)|【\\s*${escapedToken}\\s*】)`, "gi"), " ");
}

export function extractMedSafetyInlineCitations(
  value: unknown,
  sources: MedSafetySource[]
): MedSafetyInlineCitationParseResult {
  const normalizedSources = mergeMedSafetySources(sources, 12);
  let workingText = String(value ?? "").replace(/\r/g, "").replace(/\u0000/g, "").trim();
  if (!workingText) return { text: "", citations: [] };

  const citations: MedSafetySource[] = [];
  const seen = new Set<string>();

  const collectCitation = (source: MedSafetySource | null) => {
    if (!source) return;
    const key = normalizeMedSafetySourceLookupUrl(source.url) || source.url;
    if (!key || seen.has(key)) return;
    seen.add(key);
    citations.push(source);
  };

  workingText = workingText.replace(/https?:\/\/[^\s]+/gi, (match) => {
    const trimmedUrl = trimInlineCitationUrl(match);
    const matchedSource =
      matchMedSafetySourceByUrl(trimmedUrl, normalizedSources) ??
      buildMedSafetySource({
        url: trimmedUrl,
        title: getMedSafetySourceDomain(trimmedUrl),
        cited: true,
      });
    collectCitation(matchedSource);
    return " ";
  });

  for (const source of normalizedSources) {
    const domain = formatMedSafetySourceDomain(source.domain);
    const label = getMedSafetySourceLabel(source);
    const domainPattern = domain
      ? new RegExp(`(?:\\[\\s*${escapeRegExp(domain)}\\s*\\]|\\(\\s*${escapeRegExp(domain)}\\s*\\)|【\\s*${escapeRegExp(domain)}\\s*】)`, "i")
      : null;
    const labelPattern = label
      ? new RegExp(`(?:\\[\\s*${escapeRegExp(label)}\\s*\\]|\\(\\s*${escapeRegExp(label)}\\s*\\)|【\\s*${escapeRegExp(label)}\\s*】)`, "i")
      : null;

    if ((domainPattern && domainPattern.test(workingText)) || (labelPattern && labelPattern.test(workingText))) {
      collectCitation(source);
      if (domain) workingText = stripBracketWrappedSourceToken(workingText, domain);
      if (label) workingText = stripBracketWrappedSourceToken(workingText, label);
      if (source.title) workingText = stripBracketWrappedSourceToken(workingText, source.title);
    }
  }

  for (const source of citations) {
    workingText = stripBracketWrappedSourceToken(workingText, source.domain);
    workingText = stripBracketWrappedSourceToken(workingText, getMedSafetySourceLabel(source));
    workingText = stripBracketWrappedSourceToken(workingText, source.title);
  }

  return {
    text: cleanupInlineCitationText(workingText),
    citations,
  };
}
