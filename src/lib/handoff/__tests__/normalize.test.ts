import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSegments } from "../normalize";
import type { RawSegment } from "../types";

function rawSegment(id: string, rawText: string): RawSegment {
  return {
    segmentId: id,
    rawText,
    startMs: 0,
    endMs: 5000,
  };
}

test("normalizeSegments expands bilingual clinical terms and suppresses routine uncertainty noise", () => {
  const [normalized] = normalizeSegments([
    rawSegment(
      "s1",
      "701호 김민준 환자 인계입니다. vital signs stable. SpO2 96% 유지. urine monitoring 부탁드립니다. CBC와 CRP 나갔고 결과 확인 필요합니다."
    ),
  ]);

  assert.match(normalized.normalizedText, /생체징후/);
  assert.match(normalized.normalizedText, /산소포화도 96%/);
  assert.match(normalized.normalizedText, /소변관찰/);
  assert.equal(
    normalized.uncertainties.some((item: { kind: string }) => item.kind === "unresolved_abbreviation"),
    false
  );
});

test("normalizeSegments only flags unknown abbreviations", () => {
  const [normalized] = normalizeSegments([
    rawSegment("s1", "환자A XYZ 오더 다시 확인 필요"),
  ]);

  assert.equal(
    normalized.uncertainties.some((item: { kind: string }) => item.kind === "unresolved_abbreviation"),
    true
  );
});
