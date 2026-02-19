import test from "node:test";
import assert from "node:assert/strict";
import { applyPhiGuard } from "../phiGuard";
import type { NormalizedSegment } from "../types";

test("applyPhiGuard masks patient identifiers and keeps alias consistency", () => {
  const segments: NormalizedSegment[] = [
    {
      segmentId: "s1",
      normalizedText: "701호 최OO 폐렴. 연락처 010-1234-5678 차트번호 12345678",
      startMs: 0,
      endMs: 5_000,
      uncertainties: [],
    },
    {
      segmentId: "s2",
      normalizedText: "701호 최OO 항생제 10시 투약",
      startMs: 5_000,
      endMs: 10_000,
      uncertainties: [],
    },
  ];

  const out = applyPhiGuard(segments);

  assert.equal(out.segments.length, 2);
  assert.equal(out.segments[0].patientAlias, "환자A");
  assert.equal(out.segments[1].patientAlias, "환자A");

  assert.match(out.segments[0].maskedText, /환자A/);
  assert.doesNotMatch(out.segments[0].maskedText, /최OO/);
  assert.doesNotMatch(out.segments[0].maskedText, /701호/);
  assert.match(out.segments[0].maskedText, /\[REDACTED\]/);

  assert.equal(out.aliasMap["701호"], "환자A");
  assert.equal(out.aliasMap["최OO"], "환자A");
});

test("applyPhiGuard assigns next alias for another patient token", () => {
  const segments: NormalizedSegment[] = [
    {
      segmentId: "s1",
      normalizedText: "701호 최OO 상태 안정",
      startMs: 0,
      endMs: 5_000,
      uncertainties: [],
    },
    {
      segmentId: "s2",
      normalizedText: "703호 박OO 혈당 280",
      startMs: 5_000,
      endMs: 10_000,
      uncertainties: [],
    },
  ];

  const out = applyPhiGuard(segments);

  assert.equal(out.segments[0].patientAlias, "환자A");
  assert.equal(out.segments[1].patientAlias, "환자B");
});

test("applyPhiGuard normalizes spaced and Korean room mentions into one patient alias", () => {
  const segments: NormalizedSegment[] = [
    {
      segmentId: "s1",
      normalizedText: "7 0 1호 김민준 환자 인계",
      startMs: 0,
      endMs: 5_000,
      uncertainties: [],
    },
    {
      segmentId: "s2",
      normalizedText: "칠공일호 김민준 혈당 280",
      startMs: 5_000,
      endMs: 10_000,
      uncertainties: [],
    },
  ];

  const out = applyPhiGuard(segments);
  assert.equal(out.segments[0].patientAlias, "환자A");
  assert.equal(out.segments[1].patientAlias, "환자A");
  assert.equal(out.aliasMap["701호"], "환자A");
});

test("applyPhiGuard separates patients when same real name appears in different rooms", () => {
  const segments: NormalizedSegment[] = [
    {
      segmentId: "s1",
      normalizedText: "701호 김민준 환자 혈압 90/60",
      startMs: 0,
      endMs: 5_000,
      uncertainties: [],
    },
    {
      segmentId: "s2",
      normalizedText: "702호 김민준 환자 혈당 240",
      startMs: 5_000,
      endMs: 10_000,
      uncertainties: [],
    },
    {
      segmentId: "s3",
      normalizedText: "701호 김민준은 소변량 감소",
      startMs: 10_000,
      endMs: 15_000,
      uncertainties: [],
    },
  ];

  const out = applyPhiGuard(segments);
  assert.equal(out.segments[0].patientAlias, "환자A");
  assert.equal(out.segments[1].patientAlias, "환자B");
  assert.equal(out.segments[2].patientAlias, "환자A");
  assert.equal(out.aliasMap["701호"], "환자A");
  assert.equal(out.aliasMap["702호"], "환자B");
});

test("applyPhiGuard keeps active alias on continuation segment without explicit identifiers", () => {
  const segments: NormalizedSegment[] = [
    {
      segmentId: "s1",
      normalizedText: "703호 박지훈 환자 폐렴으로 항생제 시작",
      startMs: 0,
      endMs: 5_000,
      uncertainties: [],
    },
    {
      segmentId: "s2",
      normalizedText: "새벽 2시에 혈당 재측정 필요",
      startMs: 5_000,
      endMs: 10_000,
      uncertainties: [],
    },
  ];

  const out = applyPhiGuard(segments);
  assert.equal(out.segments[0].patientAlias, "환자A");
  assert.equal(out.segments[1].patientAlias, "환자A");
});
