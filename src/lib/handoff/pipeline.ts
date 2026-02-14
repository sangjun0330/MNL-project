import { normalizeSegments } from "./normalize";
import { applyPhiGuard } from "./phiGuard";
import { splitSegmentsByPatient } from "./split";
import { buildGlobalTop, buildPatientCards } from "./structure";
import type {
  DutyType,
  HandoffPipelineOutput,
  MaskedSegment,
  RawSegment,
  SegmentUncertainty,
  UncertaintyKind,
  UncertaintyItem,
} from "./types";

const DEFAULT_SEGMENT_MS = 5000;
const MAX_UNCERTAINTY_ITEM_COUNT = 24;

const UNCERTAINTY_KIND_ORDER: Record<UncertaintyKind, number> = {
  manual_review: 0,
  missing_value: 1,
  missing_time: 2,
  unresolved_abbreviation: 3,
  ambiguous_patient: 4,
};

const AMBIGUOUS_PATIENT_CANDIDATE_PATTERN =
  /(혈당|헤모글로빈|체온|소변량|활력징후|투약|검사|오더|재측정|재검|체크|확인|콜|모니터|통증|호흡|산소|어지럽|흑변|출혈|항생제|항응고|의식|낙상|쇼크)/i;
const NON_PATIENT_CONTEXT_PATTERN = /(퇴원|입원|회진|병동|신규|가능|예정|\d+\s*명)/;

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
  return text
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?。])\s+/))
    .map((line) => line.trim())
    .filter(Boolean);
}

export function transcriptToRawSegments(text: string, options?: TranscriptOptions): RawSegment[] {
  const lines = splitTranscriptLines(text);
  const segmentDurationMs = options?.segmentDurationMs ?? DEFAULT_SEGMENT_MS;
  const startOffsetMs = options?.startOffsetMs ?? 0;
  const prefix = options?.idPrefix ?? "seg";

  return lines.map((line, index) => {
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

function isAmbiguousPatientCandidate(segment: MaskedSegment) {
  const text = segment.maskedText;
  if (!AMBIGUOUS_PATIENT_CANDIDATE_PATTERN.test(text)) return false;
  if (NON_PATIENT_CONTEXT_PATTERN.test(text) && !/(환자[A-Z]{1,2})/.test(text)) return false;
  return true;
}

function normalizeUncertaintyKeyText(text: string) {
  return text
    .toLowerCase()
    .replace(/환자[a-z]{1,2}/g, "환자")
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
  const globalTop = buildGlobalTop(patients);

  const uncertainties: UncertaintyItem[] = [];
  phi.segments.forEach((segment) => {
    segment.uncertainties.forEach((uncertainty) => {
      pushUncertainty(uncertainties, segment, uncertainty);
    });
  });

  split.unmatchedSegments.forEach((segment) => {
    if (!isAmbiguousPatientCandidate(segment)) return;
    pushUncertainty(
      uncertainties,
      segment,
      {
        kind: "ambiguous_patient",
        reason: "환자 분리가 애매하여 검수 대상에 추가되었습니다.",
      },
      segment.maskedText
    );
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

  const result = {
    sessionId,
    dutyType,
    createdAt: Date.now(),
    globalTop,
    wardEvents: split.wardEvents,
    patients,
    uncertainties: compactedUncertainties,
  };

  return {
    result,
    local: {
      maskedSegments: phi.segments,
      aliasMap: phi.aliasMap,
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
