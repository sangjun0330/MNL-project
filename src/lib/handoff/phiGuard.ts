import type { MaskedSegment, NormalizedSegment } from "./types";

const NAME_PATTERNS = [
  /([가-힣]{2,4})(?=\s*(?:님|씨|환자))/g,
  /([가-힣]{1,3}O{2})/g,
  /([가-힣]{1,3}○{2})/g,
];

const ROOM_PATTERN = /(?:^|\s)(\d{3,4}\s*호)(?=$|\s|[,.])/g;
const PHONE_PATTERN = /(01[0-9]-?\d{3,4}-?\d{4})/g;
const RRN_PATTERN = /(\d{6}-?[1-4]\d{6})/g;
const CHART_PATTERN = /(차트번호|등록번호|MRN)\s*[:#]?\s*\d{6,}/gi;
const ADDRESS_PATTERN = /([가-힣0-9\-\s]{2,}(?:동|로|길)\s*\d{1,4}(?:-\d{1,4})?)/g;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceLiteralAll(text: string, needle: string, replacement: string) {
  return text.replace(new RegExp(escapeRegExp(needle), "g"), replacement);
}

function collectPatternTokens(text: string, pattern: RegExp) {
  const matches = [...text.matchAll(pattern)];
  return matches
    .map((match) => (match[1] ?? match[0] ?? "").trim())
    .filter((token) => token.length > 0);
}

function buildAlias(aliasIndex: number) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if (aliasIndex < alphabet.length) return `환자${alphabet[aliasIndex]}`;
  const head = Math.floor(aliasIndex / alphabet.length);
  const tail = aliasIndex % alphabet.length;
  return `환자${alphabet[head - 1]}${alphabet[tail]}`;
}

function getOrCreateAlias(tokens: string[], aliasMap: Map<string, string>) {
  for (const token of tokens) {
    const existing = aliasMap.get(token);
    if (existing) return existing;
  }
  const alias = buildAlias(new Set(aliasMap.values()).size);
  tokens.forEach((token) => aliasMap.set(token, alias));
  return alias;
}

export function applyPhiGuard(segments: NormalizedSegment[]) {
  const tokenToAlias = new Map<string, string>();

  const maskedSegments: MaskedSegment[] = segments.map((segment) => {
    const nameTokens = NAME_PATTERNS.flatMap((pattern) => collectPatternTokens(segment.normalizedText, pattern));
    const roomTokens = collectPatternTokens(segment.normalizedText, ROOM_PATTERN);
    const patientTokens = [...new Set([...nameTokens, ...roomTokens])];

    const patientAlias = patientTokens.length ? getOrCreateAlias(patientTokens, tokenToAlias) : null;
    let maskedText = segment.normalizedText;
    const phiHits: string[] = [];

    if (patientAlias) {
      patientTokens.forEach((token) => {
        phiHits.push(token);
        maskedText = replaceLiteralAll(maskedText, token, patientAlias);
      });
    }

    [PHONE_PATTERN, RRN_PATTERN, ADDRESS_PATTERN].forEach((pattern) => {
      const hits = collectPatternTokens(maskedText, pattern);
      if (hits.length) {
        hits.forEach((token) => {
          phiHits.push(token);
          maskedText = replaceLiteralAll(maskedText, token, "[REDACTED]");
        });
      }
    });

    const chartHits = maskedText.match(CHART_PATTERN);
    if (chartHits?.length) {
      phiHits.push(...chartHits.map(() => "차트번호"));
      maskedText = maskedText.replace(CHART_PATTERN, "[REDACTED]");
    }

    return {
      segmentId: segment.segmentId,
      maskedText,
      startMs: segment.startMs,
      endMs: segment.endMs,
      uncertainties: segment.uncertainties,
      patientAlias,
      phiHits,
      evidenceRef: {
        segmentId: segment.segmentId,
        startMs: segment.startMs,
        endMs: segment.endMs,
      },
    };
  });

  return {
    segments: maskedSegments,
    aliasMap: Object.fromEntries(tokenToAlias.entries()),
  };
}
