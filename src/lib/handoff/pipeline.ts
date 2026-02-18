import { normalizeRoomMentions } from "./clinicalNlu";
import { normalizeSegments } from "./normalize";
import { applyPhiGuard } from "./phiGuard";
import { splitSegmentsByPatient } from "./split";
import { buildGlobalTop, buildGlobalTop3, buildPatientCards } from "./structure";
import type {
  DutyType,
  HandoffPipelineOutput,
  MaskedSegment,
  RawSegment,
  SegmentUncertainty,
  UncertaintyItem,
  UncertaintyKind,
} from "./types";

const DEFAULT_SEGMENT_MS = 5000;
const MAX_UNCERTAINTY_ITEM_COUNT = 24;
const MAX_TRANSCRIPT_SEGMENT_COUNT = 360;
const RULESET_VERSION = "handoff-rules-v3";

const UNCERTAINTY_KIND_ORDER: Record<UncertaintyKind, number> = {
  manual_review: 0,
  missing_value: 1,
  missing_time: 2,
  confusable_abbreviation: 3,
  unresolved_abbreviation: 4,
  ambiguous_patient: 5,
};

const AMBIGUOUS_PATIENT_CANDIDATE_PATTERN =
  /(혈당|헤모글로빈|체온|소변량|활력징후|투약|검사|오더|재측정|재검|체크|확인|콜|모니터|통증|호흡|산소|어지럽|흑변|출혈|항생제|항응고|의식|낙상|쇼크)/i;
const INLINE_PATIENT_ANCHOR_PATTERN = /(\d{3,4}\s*호|PATIENT_[A-Z0-9]+|[가-힣]{1,3}[O○0]{2}|[가-힣]{2,4}\s*환자)/g;
const INLINE_TRANSITION_CUE_PATTERN = /(다음\s*환자|그다음|한편|반면|또한|그리고)/;

type TranscriptOptions = {
  startOffsetMs?: number;
  segmentDurationMs?: number;
  idPrefix?: string;
};

export type ManualUncertaintyInput = {
  kind?: UncertaintyKind;
  reason: string;
  text: string;
  startMs?: number;
  endMs?: number;
};

function splitTranscriptLines(text: string) {
  const baseLines = text
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?。])\s+/))
    .map((line) => line.trim())
    .filter(Boolean);

  const segmented: string[] = [];
  baseLines.forEach((line) => {
    const normalizedLine = normalizeRoomMentions(line);
    const anchors = [...normalizedLine.matchAll(INLINE_PATIENT_ANCHOR_PATTERN)];
    if (anchors.length < 2) {
      segmented.push(normalizedLine);
      return;
    }

    const cuts = [0];
    for (let index = 1; index < anchors.length; index += 1) {
      const anchorIndex = anchors[index].index ?? 0;
      const previousCut = cuts[cuts.length - 1] ?? 0;
      if (anchorIndex - previousCut < 12) continue;

      const between = normalizedLine.slice(previousCut, anchorIndex);
      const punctuationCut = Math.max(between.lastIndexOf(","), between.lastIndexOf(";"), between.lastIndexOf("·"));
      if (punctuationCut >= 2) {
        cuts.push(previousCut + punctuationCut + 1);
        continue;
      }

      const transition = between.match(INLINE_TRANSITION_CUE_PATTERN);
      if (transition?.index != null && transition.index >= 2) {
        cuts.push(previousCut + transition.index);
        continue;
      }

      cuts.push(anchorIndex);
    }

    cuts.push(normalizedLine.length);
    for (let i = 0; i < cuts.length - 1; i += 1) {
      const chunk = normalizedLine.slice(cuts[i], cuts[i + 1]).trim();
      if (chunk) segmented.push(chunk);
    }
  });

  return segmented.filter(Boolean);
}

export function transcriptToRawSegments(text: string, options?: TranscriptOptions): RawSegment[] {
  const lines = splitTranscriptLines(text);
  const boundedLines =
    lines.length <= MAX_TRANSCRIPT_SEGMENT_COUNT
      ? lines
      : [
          ...lines.slice(0, MAX_TRANSCRIPT_SEGMENT_COUNT - 1),
          `초과분 통합: ${lines.slice(MAX_TRANSCRIPT_SEGMENT_COUNT - 1).join(" ")}`.trim(),
        ];
  const segmentDurationMs = options?.segmentDurationMs ?? DEFAULT_SEGMENT_MS;
  const startOffsetMs = options?.startOffsetMs ?? 0;
  const prefix = options?.idPrefix ?? "seg";

  return boundedLines.map((line, index) => {
    const startMs = startOffsetMs + index * segmentDurationMs;
    return {
      segmentId: `${prefix}-${String(index + 1).padStart(3, "0")}`,
      rawText: line,
      startMs,
      endMs: startMs + segmentDurationMs,
    };
  });
}

function pushUncertainty(
  sink: UncertaintyItem[],
  segment: MaskedSegment,
  uncertainty: SegmentUncertainty,
  textOverride?: string
) {
  sink.push({
    id: `uncertainty-${segment.segmentId}-${sink.length + 1}`,
    kind: uncertainty.kind,
    reason: uncertainty.reason,
    text: textOverride ?? segment.maskedText,
    evidenceRef: segment.evidenceRef,
  });
}

function normalizeUncertaintyKeyText(text: string) {
  return text
    .toLowerCase()
    .replace(/patient_[a-z0-9]+/g, "patient")
    .replace(/\d{1,2}:\d{2}/g, "#시각")
    .replace(/\d{1,4}\s*호/g, "#호")
    .replace(/\d+(?:\.\d+)?/g, "#")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function compactUncertainties(items: UncertaintyItem[]) {
  type Bucket = {
    item: UncertaintyItem;
    count: number;
    startMs: number;
    endMs: number;
  };

  const buckets = new Map<string, Bucket>();

  items.forEach((item) => {
    const key = `${item.kind}|${item.reason}|${normalizeUncertaintyKeyText(item.text)}`;
    const existing = buckets.get(key);
    if (!existing) {
      buckets.set(key, {
        item,
        count: 1,
        startMs: item.evidenceRef.startMs,
        endMs: item.evidenceRef.endMs,
      });
      return;
    }

    existing.count += 1;
    existing.startMs = Math.min(existing.startMs, item.evidenceRef.startMs);
    existing.endMs = Math.max(existing.endMs, item.evidenceRef.endMs);
  });

  return [...buckets.values()]
    .map((bucket) => ({
      ...bucket.item,
      reason: bucket.count > 1 ? `${bucket.item.reason} (유사 ${bucket.count}건)` : bucket.item.reason,
      evidenceRef: {
        ...bucket.item.evidenceRef,
        startMs: bucket.startMs,
        endMs: bucket.endMs,
      },
    }))
    .sort((a, b) => {
      const byKind = UNCERTAINTY_KIND_ORDER[a.kind] - UNCERTAINTY_KIND_ORDER[b.kind];
      if (byKind !== 0) return byKind;
      if (a.evidenceRef.startMs !== b.evidenceRef.startMs) return a.evidenceRef.startMs - b.evidenceRef.startMs;
      return a.id.localeCompare(b.id);
    })
    .slice(0, MAX_UNCERTAINTY_ITEM_COUNT);
}

export function runHandoffPipeline({
  sessionId,
  dutyType,
  rawSegments,
  manualUncertainties,
}: {
  sessionId: string;
  dutyType: DutyType;
  rawSegments: RawSegment[];
  manualUncertainties?: ManualUncertaintyInput[];
}): HandoffPipelineOutput {
  const normalized = normalizeSegments(rawSegments);
  const phi = applyPhiGuard(normalized);
  const split = splitSegmentsByPatient(phi.segments);
  const patients = buildPatientCards({ patientSegments: split.patientSegments, dutyType });
  const globalTop3 = buildGlobalTop3(patients);
  const globalTop = buildGlobalTop(patients);

  const uncertainties: UncertaintyItem[] = [];
  phi.segments.forEach((segment) => {
    segment.uncertainties.forEach((uncertainty) => {
      pushUncertainty(uncertainties, segment, uncertainty);
    });
  });

  if (split.fallbackApplied) {
    uncertainties.push({
      id: "uncertainty-fallback-patient",
      kind: "ambiguous_patient",
      reason: "환자 분리가 불명확하여 PATIENT_A 단일 카드로 처리했습니다.",
      text: "환자 구분 불명확",
      evidenceRef: {
        segmentId: phi.segments[0]?.segmentId ?? "segment-0",
        startMs: phi.segments[0]?.startMs ?? 0,
        endMs: phi.segments[0]?.endMs ?? 0,
      },
    });
  }

  split.unmatchedSegments.forEach((segment) => {
    if (!AMBIGUOUS_PATIENT_CANDIDATE_PATTERN.test(segment.maskedText)) return;
    uncertainties.push({
      id: `uncertainty-ambiguous-${segment.segmentId}`,
      kind: "ambiguous_patient",
      reason: "환자 분리가 애매하여 검수 대상에 추가되었습니다.",
      text: segment.maskedText,
      evidenceRef: segment.evidenceRef,
    });
  });

  if (manualUncertainties?.length) {
    manualUncertainties.forEach((manual, index) => {
      const startMs = Math.max(0, manual.startMs ?? 0);
      const endMs = Math.max(startMs + 250, manual.endMs ?? startMs + 1000);
      uncertainties.push({
        id: `uncertainty-manual-${index + 1}`,
        kind: manual.kind ?? "manual_review",
        reason: manual.reason,
        text: manual.text,
        evidenceRef: {
          segmentId: `manual-${index + 1}`,
          startMs,
          endMs,
        },
      });
    });
  }

  const compactedUncertainties = compactUncertainties(uncertainties);
  const createdAtMs = Date.now();
  const createdAtIso = new Date(createdAtMs).toISOString();

  const result = {
    sessionId,
    dutyType,
    createdAt: createdAtIso,
    createdAtMs,
    mode: "local_only" as const,
    globalTop3,
    globalTop,
    wardEvents: split.wardEvents,
    patients,
    uncertainties: compactedUncertainties.map((item) => item.reason),
    uncertaintyItems: compactedUncertainties,
    safety: {
      phiSafe: phi.residualFindings.length === 0,
      residualCount: phi.residualFindings.length,
      exportAllowed: phi.exportAllowed,
      persistAllowed: phi.safeToPersist,
    },
    provenance: {
      stt: {
        engine: "whisper_wasm" as const,
        model: "local",
        chunkSeconds: Math.round(DEFAULT_SEGMENT_MS / 1000),
      },
      rulesetVersion: RULESET_VERSION,
      llmRefined: false,
    },
  };

  return {
    result,
    local: {
      maskedSegments: phi.segments,
      aliasMap: phi.aliasMap,
      mask: phi.mask,
    },
  };
}

export function buildEvidenceMap(segments: MaskedSegment[]) {
  const map: Record<string, string> = {};
  segments.forEach((segment) => {
    map[segment.segmentId] = segment.maskedText;
  });
  return map;
}
