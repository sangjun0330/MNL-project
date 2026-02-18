import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeStructuredSession } from "../deidGuard";
import type { HandoverSessionResult } from "../types";

function sampleResult(): HandoverSessionResult {
  return {
    sessionId: "session-1",
    dutyType: "night",
    createdAt: "2026-02-18T00:00:00.000Z",
    createdAtMs: 1_700_000_000_000,
    mode: "local_only",
    globalTop3: [
      {
        text: "PATIENT_A 연락처 010-1234-5678 확인",
        score: 90,
        patientKey: "PATIENT_A",
        evidenceRef: { segmentId: "s1", startMs: 0, endMs: 5000 },
      },
    ],
    globalTop: [
      {
        id: "g1",
        alias: "PATIENT_A",
        text: "701호 최OO 항생제 10시 투약",
        badge: "즉시 확인",
        score: 90,
        evidenceRef: { segmentId: "s1", startMs: 0, endMs: 5000 },
      },
    ],
    wardEvents: [
      {
        id: "w1",
        category: "discharge",
        text: "내일 오전 퇴원 2명",
        evidenceRef: { segmentId: "s2", startMs: 5000, endMs: 10000 },
      },
    ],
    patients: [
      {
        patientKey: "PATIENT_A",
        alias: "PATIENT_A",
        summary1: "701호 최OO 상태 요약",
        problems: ["주민번호 900101-1234567 기록 확인"],
        currentStatus: ["혈압 90/60"],
        meds: ["연락처 010-1234-5678 확인"],
        lines: [],
        labs: [],
        plan: [
          {
            priority: "P1",
            task: "차트번호 12345678 재확인",
          },
        ],
        risks: [
          {
            code: "BLEEDING",
            score: 72,
            rationale: "박OO 어지럼",
            actions: ["MRN 1234567 확인"],
          },
        ],
        watchFor: ["최OO 시간 누락"],
        questions: ["MRN 1234567 확인"],
        entities: [],
        topItems: [
          {
            id: "t1",
            text: "연락처 010-1234-5678 확인",
            score: 70,
            badge: "우선 확인",
            evidenceRef: { segmentId: "s3", startMs: 10000, endMs: 15000 },
          },
        ],
        todos: [
          {
            id: "todo1",
            text: "차트번호 12345678 재확인",
            dueHint: "오전",
            level: "medium",
            evidenceRef: { segmentId: "s4", startMs: 15000, endMs: 20000 },
          },
        ],
        problemItems: [
          {
            id: "p1",
            text: "주민번호 900101-1234567 기록 확인",
            evidenceRef: { segmentId: "s5", startMs: 20000, endMs: 25000 },
          },
        ],
        riskItems: [
          {
            id: "r1",
            label: "박OO 어지럼",
            level: "high",
            evidenceRef: { segmentId: "s6", startMs: 25000, endMs: 30000 },
          },
        ],
      },
    ],
    uncertainties: ["MRN 1234567 확인"],
    uncertaintyItems: [
      {
        id: "u1",
        kind: "manual_review",
        reason: "MRN 1234567 확인",
        text: "최OO 시간 누락",
        evidenceRef: { segmentId: "s7", startMs: 30000, endMs: 35000 },
      },
    ],
    safety: {
      phiSafe: true,
      residualCount: 0,
      exportAllowed: true,
      persistAllowed: true,
    },
    provenance: {
      stt: {
        engine: "whisper_wasm",
        model: "local",
        chunkSeconds: 5,
      },
      rulesetVersion: "handoff-rules-v3",
      llmRefined: false,
    },
  };
}

test("sanitizeStructuredSession masks potential PHI in structured payload", () => {
  const result = sampleResult();
  const sanitized = sanitizeStructuredSession(result);

  assert.ok(sanitized.issues.length > 0);
  assert.match(sanitized.result.globalTop[0].text, /\[REDACTED\]/);
  assert.match(sanitized.result.globalTop3[0].text, /\[REDACTED\]/);
  assert.match(sanitized.result.patients[0].summary1, /\[REDACTED\]/);
  assert.match(sanitized.result.patients[0].plan[0].task, /\[REDACTED\]/);
  assert.match(sanitized.result.patients[0].problems[0], /\[REDACTED\]/);
  assert.match(sanitized.result.patients[0].risks[0].rationale, /\[REDACTED\]/);
  assert.match(sanitized.result.patients[0].risks[0].actions[0], /\[REDACTED\]/);
  assert.match(sanitized.result.uncertaintyItems[0].reason, /\[REDACTED\]/);
  assert.match(sanitized.result.uncertaintyItems[0].text, /\[REDACTED\]/);
  assert.match(sanitized.result.uncertainties[0], /\[REDACTED\]/);
  assert.equal(sanitized.residualIssues.length, 0);
});

test("sanitizeStructuredSession leaves clean aliases untouched", () => {
  const result = sampleResult();
  result.globalTop[0].text = "PATIENT_A 항생제 10시 투약";
  result.globalTop3[0].text = "PATIENT_A 항생제 10시 투약";
  result.patients[0].meds[0] = "항생제 투약 확인";
  result.patients[0].watchFor[0] = "호흡 상태 모니터링";
  result.patients[0].questions[0] = "오더 확인";
  result.patients[0].summary1 = "PATIENT_A 상태 요약";
  result.patients[0].plan[0].task = "오더 확인";
  result.patients[0].problems[0] = "통증 관찰";
  result.patients[0].risks[0].rationale = "호흡 상태 모니터링";
  result.patients[0].risks[0].actions = ["활력징후 확인"];
  result.patients[0].topItems[0].text = "혈당 재확인";
  result.patients[0].todos[0].text = "오더 확인";
  result.patients[0].problemItems[0].text = "통증 관찰";
  result.patients[0].riskItems[0].label = "호흡";
  result.uncertaintyItems[0].reason = "시간 누락";
  result.uncertaintyItems[0].text = "수치 확인 필요";
  result.uncertainties[0] = "수치 확인 필요";

  const sanitized = sanitizeStructuredSession(result);
  assert.equal(sanitized.issues.length, 0);
  assert.equal(sanitized.result.globalTop[0].text, "PATIENT_A 항생제 10시 투약");
  assert.equal(sanitized.residualIssues.length, 0);
});

test("sanitizeStructuredSession reports residual issues for unmatched identifier formats", () => {
  const result = sampleResult();
  result.globalTop[0].text = "PATIENT_A 연락처 010/1234/5678";
  const sanitized = sanitizeStructuredSession(result);
  assert.ok(sanitized.residualIssues.length > 0);
  assert.equal(sanitized.residualIssues[0].pattern, "phone");
});
