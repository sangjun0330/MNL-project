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

test("normalizeSegments maps Korean pronunciations from lexicon to canonical clinical terms", () => {
  const [normalized] = normalizeSegments([
    rawSegment("s1", "에스피오투 88로 떨어져 엔알비 쓰고 브이에스 q2h로 다시 보자"),
  ]);

  assert.match(normalized.normalizedText, /산소포화도 88/);
  assert.match(normalized.normalizedText, /비재호흡 마스크/);
  assert.match(normalized.normalizedText, /활력징후/);
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

test("normalizeSegments flags confusion-pair context mismatch (HR/RR)", () => {
  const [normalized] = normalizeSegments([
    rawSegment("s1", "환자A HR 24회/분으로 호흡수 빠르고 재확인 필요"),
  ]);

  assert.equal(
    normalized.uncertainties.some((item: { kind: string }) => item.kind === "confusable_abbreviation"),
    true
  );
});

test("normalizeSegments flags confusion-pair context mismatch (DC/D-C)", () => {
  const [normalized] = normalizeSegments([
    rawSegment("s1", "환자A D/C 오더인데 오늘 퇴원인지 약 중단인지 확인 필요"),
  ]);

  assert.equal(
    normalized.uncertainties.some((item: { kind: string }) => item.kind === "confusable_abbreviation"),
    true
  );
});
