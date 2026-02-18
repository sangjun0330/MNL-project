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
    out.result.uncertaintyItems.filter((item: { kind: string }) => item.kind === "unresolved_abbreviation").length,
    0
  );
  assert.ok(out.result.uncertaintyItems.length <= 4);
});

test("runHandoffPipeline splits inline multi-patient narrative into distinct patient cards", () => {
  const transcript =
    "701호 최OO 혈압 90/60이라 수액 볼루스 시행, 703호 박OO 혈당 280으로 새벽 2시에 재측정 오더, 701호 최OO 산소 2L 유지.";

  const out = runHandoffPipeline({
    sessionId: "hs_test_inline_multi",
    dutyType: "night",
    rawSegments: transcriptToRawSegments(transcript, {
      idPrefix: "inline",
      segmentDurationMs: 3500,
    }),
  });

  assert.ok(out.result.patients.length >= 2);
  const planOrRiskCounts = out.result.patients
    .map((patient) => patient.plan.length + patient.risks.length)
    .sort((a, b) => b - a);
  assert.ok(planOrRiskCounts[0] >= 1);
});

test("transcriptToRawSegments bounds excessive segment counts for stability", () => {
  const longTranscript = Array.from({ length: 520 }, (_, idx) => `701호 환자A 혈당 ${100 + idx} 확인 필요.`).join("\n");
  const raw = transcriptToRawSegments(longTranscript, { idPrefix: "long", segmentDurationMs: 2000 });

  assert.ok(raw.length <= 360);
  assert.match(raw[raw.length - 1].rawText, /초과분 통합/);
});

test("runHandoffPipeline remains stable on long mixed transcript", () => {
  const longTranscript = Array.from({ length: 180 }, (_, idx) => {
    const room = 701 + (idx % 4);
    const alias = ["최OO", "박OO", "정OO", "김OO"][idx % 4];
    return `${room}호 ${alias} 환자 혈당 ${130 + (idx % 80)}이고 ${idx % 3 === 0 ? "재측정 오더" : "모니터링 유지"} 필요`;
  }).join(". ");

  const out = runHandoffPipeline({
    sessionId: "hs_test_long_stability",
    dutyType: "night",
    rawSegments: transcriptToRawSegments(longTranscript, {
      idPrefix: "stability",
      segmentDurationMs: 2500,
    }),
  });

  assert.ok(out.result.patients.length >= 3);
  assert.ok(out.result.globalTop.length > 0);
  assert.ok(out.result.uncertaintyItems.length <= 24);
});

test("runHandoffPipeline keeps glucose and I/O risk signals in global top after de-id", () => {
  const transcript =
    "703호 박OO 환자 혈당 280으로 새벽 2시 재측정 오더. 708호 정OO 환자 소변량 감소 경향 있어 I/O 모니터링.";

  const out = runHandoffPipeline({
    sessionId: "hs_test_glucose_io_global_top",
    dutyType: "night",
    rawSegments: transcriptToRawSegments(transcript, {
      idPrefix: "glucose-io",
      segmentDurationMs: 3000,
    }),
  });

  const globalTopText = out.result.globalTop.map((item) => item.text).join(" ");
  assert.match(globalTopText, /(혈당|재측정)/);
  assert.match(globalTopText, /(소변량|I\/O)/);
});
