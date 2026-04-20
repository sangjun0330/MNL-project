export type MedSafetySource = {
  url: string;
  title: string;
  domain: string;
  cited: boolean;
};

export type MedSafetyGroundingMode = "none" | "premium_web";
export type MedSafetyGroundingStatus = "none" | "ok" | "failed";

type MedSafetySourceInput = {
  url?: unknown;
  title?: unknown;
  domain?: unknown;
  cited?: unknown;
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

function normalizeText(value: unknown) {
  return String(value ?? "")
    .replace(/\r/g, "")
    .replace(/\u0000/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeMedSafetySourceUrl(value: unknown) {
  const trimmed = normalizeText(value);
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.toString();
  } catch {
    return "";
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
    url,
    domain,
    title: buildNormalizedTitle(input.title, domain),
    cited: input.cited === true,
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
    current.cited ||= next.cited;
    if (isFallbackLikeTitle(current.title, current.domain) && !isFallbackLikeTitle(next.title, next.domain)) {
      current.title = next.title;
    }
    if (!current.domain && next.domain) current.domain = next.domain;
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
