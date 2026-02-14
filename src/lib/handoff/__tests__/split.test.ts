import test from "node:test";
import assert from "node:assert/strict";
import { splitSegmentsByPatient } from "../split";
import type { MaskedSegment } from "../types";

function seg(input: {
  id: string;
  text: string;
  startMs: number;
  endMs: number;
  patientAlias?: string | null;
}): MaskedSegment {
  return {
    segmentId: input.id,
    maskedText: input.text,
    startMs: input.startMs,
    endMs: input.endMs,
    uncertainties: [],
    patientAlias: input.patientAlias ?? null,
    phiHits: [],
    evidenceRef: {
      segmentId: input.id,
      startMs: input.startMs,
      endMs: input.endMs,
    },
  };
}

test("splitSegmentsByPatient carries forward active alias for continuation sentences", () => {
  const segments: MaskedSegment[] = [
    seg({
      id: "s1",
      text: "환자A POD0 통증자가조절기 유지",
      startMs: 0,
      endMs: 5000,
      patientAlias: "환자A",
    }),
    seg({
      id: "s2",
      text: "새벽 2시에 혈당 다시 확인 오더",
      startMs: 5000,
      endMs: 10000,
      patientAlias: null,
    }),
  ];

  const out = splitSegmentsByPatient(segments);
  assert.equal(out.unmatchedSegments.length, 0);
  assert.equal(out.wardEvents.length, 0);
  assert.equal(out.patientSegments["환자A"]?.length, 2);
});

test("splitSegmentsByPatient keeps ward-level events outside patient buckets", () => {
  const segments: MaskedSegment[] = [
    seg({
      id: "s1",
      text: "환자A 혈당 280",
      startMs: 0,
      endMs: 5000,
      patientAlias: "환자A",
    }),
    seg({
      id: "s2",
      text: "내일 오전 퇴원 2명 예정",
      startMs: 5000,
      endMs: 10000,
      patientAlias: null,
    }),
  ];

  const out = splitSegmentsByPatient(segments);
  assert.equal(out.patientSegments["환자A"]?.length, 1);
  assert.equal(out.wardEvents.length, 1);
  assert.equal(out.wardEvents[0].category, "discharge");
});

test("splitSegmentsByPatient does not force carry-forward after transition cue", () => {
  const segments: MaskedSegment[] = [
    seg({
      id: "s1",
      text: "환자A 항생제 10시",
      startMs: 0,
      endMs: 5000,
      patientAlias: "환자A",
    }),
    seg({
      id: "s2",
      text: "다음 환자 관련 내용은 확인 필요",
      startMs: 5000,
      endMs: 10000,
      patientAlias: null,
    }),
  ];

  const out = splitSegmentsByPatient(segments);
  assert.equal(out.patientSegments["환자A"]?.length, 1);
  assert.equal(out.unmatchedSegments.length, 1);
});
