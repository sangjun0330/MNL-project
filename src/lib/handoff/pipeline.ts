import { normalizeSegments } from "@/lib/handoff/normalize";
import { applyPhiGuard } from "@/lib/handoff/phiGuard";
import { splitSegmentsByPatient } from "@/lib/handoff/split";
import { buildGlobalTop, buildPatientCards } from "@/lib/handoff/structure";
import type {
  DutyType,
  HandoffPipelineOutput,
  MaskedSegment,
  RawSegment,
  SegmentUncertainty,
  UncertaintyKind,
  UncertaintyItem,
} from "@/lib/handoff/types";

const DEFAULT_SEGMENT_MS = 5000;

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

function dedupeUncertainties(items: UncertaintyItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.kind}|${item.reason}|${item.evidenceRef.segmentId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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

  const result = {
    sessionId,
    dutyType,
    createdAt: Date.now(),
    globalTop,
    wardEvents: split.wardEvents,
    patients,
    uncertainties: dedupeUncertainties(uncertainties),
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
