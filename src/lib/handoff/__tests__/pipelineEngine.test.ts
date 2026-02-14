import test from "node:test";
import assert from "node:assert/strict";
import { runHandoffPipeline, transcriptToRawSegments } from "../pipeline";

test("runHandoffPipeline keeps uncertainty compact for RNest scenario-like bilingual narration", () => {
  const transcript = `701호 김민준 환자 인계입니다.
오늘 낮 동안 vital signs stable 했고 오후 blood pressure 90/60까지 떨어져 fluid bolus 시행, 현재 110/70 유지 중.
Respiratory status는 SpO2 96%로 nasal cannula 2L 유지.
Intake & Output 균형이나 urine output 감소 경향 있어 monitoring 필요.
CBC와 CRP 나갔고 결과 확인 필요, antibiotics first dose 완료.
낙상 위험 높아 bed alarm 유지, ambulation 시 assist 필요.`;

  const rawSegments = transcriptToRawSegments(transcript, {
    idPrefix: "case",
    segmentDurationMs: 4000,
  });

  const out = runHandoffPipeline({
    sessionId: "hs_test_case",
    dutyType: "night",
    rawSegments,
  });

  assert.ok(out.result.patients.length >= 1);
  assert.equal(
    out.result.uncertainties.filter((item: { kind: string }) => item.kind === "unresolved_abbreviation").length,
    0
  );
  assert.ok(out.result.uncertainties.length <= 4);
});
