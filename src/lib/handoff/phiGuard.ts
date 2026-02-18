import {
  extractPatientAnchors,
  hasPatientTransitionCue,
  isLikelyClinicalContinuation,
  normalizeRoomMentions,
} from "./clinicalNlu";
import type { AliasMap, MaskResult, MaskedSegment, NormalizedSegment, PhiFinding, PhiType } from "./types";

type MaskRule = {
  type: PhiType;
  severity: "low" | "med" | "high";
  pattern: RegExp;
  replacement?: string;
};

const PASS1_RULES: MaskRule[] = [
  {
    type: "PHONE",
    severity: "high",
    pattern: /01[0-9][\s.-]?\d{3,4}[\s.-]?\d{4}/g,
  },
  {
    type: "RRN",
    severity: "high",
    pattern: /\d{6}[\s/-]?[1-4]\d{6}/g,
  },
  {
    type: "DOB",
    severity: "high",
    pattern: /(19|20)\d{2}[./-]?\d{1,2}[./-]?\d{1,2}/g,
  },
  {
    type: "MRN",
    severity: "high",
    pattern: /(MRN|등록|차트|환자번호|ID)\s*[:#-]?\s*[A-Za-z0-9-]{4,}/gi,
  },
  {
    type: "ADDRESS",
    severity: "high",
    pattern:
      /(?:[가-힣]{2,}(?:구|군|읍|면|동|로|길)\s*\d{1,4}(?:-\d{1,4})?(?:번지|호)?|[가-힣]{2,}시\s+[가-힣]{2,}(?:구|군|읍|면|동)\s*\d{1,4}(?:-\d{1,4})?(?:번지|호)?)/g,
  },
];

const PASS2_RULES: MaskRule[] = [
  {
    type: "LONG_DIGITS",
    severity: "med",
    pattern: /\b\d{7,12}\b/g,
  },
  {
    type: "ROOM_NAME",
    severity: "med",
    pattern: /(병실|침상|Bed|Room)\s*[A-Za-z0-9가-힣-]+\s*(?:님|씨)?\s*[가-힣]{2,4}/gi,
  },
  {
    type: "NAME_HINT",
    severity: "low",
    pattern: /[가-힣]{2,4}(?:님|씨)/g,
  },
];

const RESIDUAL_RULES: MaskRule[] = [...PASS1_RULES, ...PASS2_RULES];

type AliasRegistry = {
  tokenToAlias: Map<string, string>;
  aliasSeq: number;
};

function buildAlias(aliasIndex: number) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if (aliasIndex < alphabet.length) return `PATIENT_${alphabet[aliasIndex]}`;
  const head = Math.floor(aliasIndex / alphabet.length);
  const tail = aliasIndex % alphabet.length;
  return `PATIENT_${alphabet[head - 1]}${alphabet[tail]}`;
}

function sanitizeSample(raw: string) {
  const compact = raw.replace(/\s+/g, " ").trim();
  if (!compact) return "***";
  if (compact.length <= 2) return `${compact[0] ?? "*"}*`;
  if (compact.length <= 6) return `${compact.slice(0, 1)}***${compact.slice(-1)}`;
  return `${compact.slice(0, 2)}***${compact.slice(-2)}`;
}

function normalizeToken(token: string) {
  return token.replace(/\s+/g, " ").trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceLiteralAll(text: string, token: string, replacement: string) {
  if (!token) return text;
  return text.replace(new RegExp(escapeRegExp(token), "g"), replacement);
}

function applyRules(text: string, rules: MaskRule[]) {
  const findings: PhiFinding[] = [];
  let masked = text;

  rules.forEach((rule) => {
    const source = masked;
    let next = "";
    let lastIndex = 0;
    rule.pattern.lastIndex = 0;

    let match: RegExpExecArray | null = rule.pattern.exec(source);
    while (match) {
      const matched = match[0] ?? "";
      const start = match.index ?? 0;
      const end = start + matched.length;
      findings.push({
        type: rule.type,
        start,
        end,
        sample: sanitizeSample(matched),
        severity: rule.severity,
      });
      next += source.slice(lastIndex, start);
      next += rule.replacement ?? "[REDACTED]";
      lastIndex = end;
      if (matched.length === 0) {
        rule.pattern.lastIndex += 1;
      }
      match = rule.pattern.exec(source);
    }

    if (findings.length) {
      next += source.slice(lastIndex);
      masked = next || source;
    }
  });

  return {
    maskedText: masked,
    findings,
  };
}

function scanResidual(text: string) {
  const findings: PhiFinding[] = [];

  RESIDUAL_RULES.forEach((rule) => {
    rule.pattern.lastIndex = 0;
    let match: RegExpExecArray | null = rule.pattern.exec(text);
    while (match) {
      const matched = match[0] ?? "";
      const start = match.index ?? 0;
      findings.push({
        type: rule.type,
        start,
        end: start + matched.length,
        sample: sanitizeSample(matched),
        severity: rule.severity,
      });
      if (matched.length === 0) {
        rule.pattern.lastIndex += 1;
      }
      match = rule.pattern.exec(text);
    }
  });

  return findings;
}

function resolveAliasToken(
  text: string,
  registry: AliasRegistry,
  activeAlias: string | null,
  transitionPending: boolean
) {
  const normalized = normalizeRoomMentions(text);
  const anchors = extractPatientAnchors(normalized);
  const allTokens = [...anchors.roomTokens, ...anchors.nameTokens, ...anchors.maskedNameTokens]
    .map((token) => normalizeToken(token))
    .filter(Boolean);
  const uniqueTokens = [...new Set(allTokens)];

  const existingAliasCounter = new Map<string, number>();
  uniqueTokens.forEach((token) => {
    const alias = registry.tokenToAlias.get(token);
    if (!alias) return;
    const weight = /\d{3,4}\s*호/.test(token) ? 5 : 1;
    existingAliasCounter.set(alias, (existingAliasCounter.get(alias) ?? 0) + weight);
  });

  const roomTokens = anchors.roomTokens.map((token) => normalizeToken(token)).filter(Boolean);
  const roomAliases = roomTokens
    .map((token) => registry.tokenToAlias.get(token))
    .filter((alias): alias is string => Boolean(alias));
  const hasRoomAnchor = roomTokens.length > 0;
  const hasKnownRoomAlias = roomAliases.length > 0;

  let selectedAlias: string | null = null;
  if (hasKnownRoomAlias) {
    const byRoom = new Map<string, number>();
    roomAliases.forEach((alias) => {
      byRoom.set(alias, (byRoom.get(alias) ?? 0) + 1);
    });
    selectedAlias = [...byRoom.entries()].sort((a, b) => b[1] - a[1])[0][0];
  } else if (hasRoomAnchor && !hasKnownRoomAlias) {
    selectedAlias = buildAlias(registry.aliasSeq);
    registry.aliasSeq += 1;
  } else if (existingAliasCounter.size > 0) {
    selectedAlias = [...existingAliasCounter.entries()].sort((a, b) => b[1] - a[1])[0][0];
  } else if (anchors.hasStrongAnchor) {
    selectedAlias = buildAlias(registry.aliasSeq);
    registry.aliasSeq += 1;
  } else if (!transitionPending && activeAlias && isLikelyClinicalContinuation(normalized)) {
    selectedAlias = activeAlias;
  }

  if (!selectedAlias) {
    return {
      selectedAlias: null,
      tokens: uniqueTokens,
      transitionCue: hasPatientTransitionCue(normalized),
    };
  }

  uniqueTokens.forEach((token) => {
    const isRoomToken = /\d{3,4}\s*호/.test(token);
    if (isRoomToken || !registry.tokenToAlias.has(token)) {
      registry.tokenToAlias.set(token, selectedAlias!);
    }
  });

  return {
    selectedAlias,
    tokens: uniqueTokens,
    transitionCue: hasPatientTransitionCue(normalized),
  };
}

function applyAliasMasking(text: string, tokens: string[], alias: string | null) {
  if (!alias || !tokens.length) {
    return {
      maskedText: text,
      findings: [] as PhiFinding[],
    };
  }

  let maskedText = text;
  const findings: PhiFinding[] = [];
  const ordered = [...tokens].sort((a, b) => b.length - a.length || a.localeCompare(b, "ko"));

  ordered.forEach((token) => {
    if (!token) return;
    if (!maskedText.includes(token)) return;
    maskedText = replaceLiteralAll(maskedText, token, alias);
    findings.push({
      type: /\d{3,4}\s*호/.test(token) ? "ROOM" : "NAME",
      start: 0,
      end: 0,
      sample: sanitizeSample(token),
      severity: "med",
    });
  });

  return {
    maskedText,
    findings,
  };
}

export function applyPhiGuard(segments: NormalizedSegment[]) {
  const registry: AliasRegistry = {
    tokenToAlias: new Map<string, string>(),
    aliasSeq: 0,
  };

  const maskedSegments: MaskedSegment[] = [];
  const findings: PhiFinding[] = [];
  const residualFindings: PhiFinding[] = [];
  let activeAlias: string | null = null;
  let transitionPending = false;

  segments.forEach((segment) => {
    const resolved = resolveAliasToken(segment.normalizedText, registry, activeAlias, transitionPending);
    const aliasMasked = applyAliasMasking(normalizeRoomMentions(segment.normalizedText), resolved.tokens, resolved.selectedAlias);

    const pass1 = applyRules(aliasMasked.maskedText, PASS1_RULES);
    const pass2 = applyRules(pass1.maskedText, PASS2_RULES);
    const residual = scanResidual(pass2.maskedText);

    const segmentFindings = [...aliasMasked.findings, ...pass1.findings, ...pass2.findings];
    findings.push(...segmentFindings);
    residualFindings.push(...residual);

    maskedSegments.push({
      segmentId: segment.segmentId,
      maskedText: pass2.maskedText,
      startMs: segment.startMs,
      endMs: segment.endMs,
      uncertainties: segment.uncertainties,
      patientAlias: resolved.selectedAlias,
      phiHits: segmentFindings.map((hit) => hit.type),
      findings: segmentFindings,
      residualFindings: residual,
      evidenceRef: {
        segmentId: segment.segmentId,
        startMs: segment.startMs,
        endMs: segment.endMs,
      },
    });

    activeAlias = resolved.transitionCue ? null : resolved.selectedAlias ?? activeAlias;
    transitionPending = resolved.transitionCue;
  });

  const aliasMap: AliasMap = {};
  registry.tokenToAlias.forEach((alias, token) => {
    aliasMap[token] = alias;
  });

  const mask: MaskResult = {
    maskedText: maskedSegments.map((segment) => segment.maskedText).join("\n"),
    findings,
    aliasMap,
    residualFindings,
    safeToPersist: residualFindings.length === 0,
    exportAllowed: residualFindings.length === 0,
  };

  return {
    segments: maskedSegments,
    aliasMap,
    findings,
    residualFindings,
    safeToPersist: mask.safeToPersist,
    exportAllowed: mask.exportAllowed,
    mask,
  };
}
