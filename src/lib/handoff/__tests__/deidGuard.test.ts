import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeStructuredSession } from "../deidGuard";
import type { HandoverSessionResult } from "../types";

function sampleResult(): HandoverSessionResult {
  return {
    sessionId: "session-1",
    dutyType: "night",
    createdAt: 1_700_000_000_000,
    globalTop: [
      {
        id: "g1",
        alias: "환자A",
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
        alias: "환자A",
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
        problems: [
          {
            id: "p1",
            text: "주민번호 900101-1234567 기록 확인",
            evidenceRef: { segmentId: "s5", startMs: 20000, endMs: 25000 },
          },
        ],
        risks: [
          {
            id: "r1",
            label: "박OO 어지럼",
            level: "high",
            evidenceRef: { segmentId: "s6", startMs: 25000, endMs: 30000 },
          },
        ],
      },
    ],
    uncertainties: [
      {
        id: "u1",
        kind: "manual_review",
        reason: "MRN 1234567 확인",
        text: "최OO 시간 누락",
        evidenceRef: { segmentId: "s7", startMs: 30000, endMs: 35000 },
      },
    ],
  };
}

test("sanitizeStructuredSession masks potential PHI in structured payload", () => {
  const result = sampleResult();
  const sanitized = sanitizeStructuredSession(result);

  assert.ok(sanitized.issues.length > 0);
  assert.equal(sanitized.result.globalTop[0].alias, "환자A");
  assert.match(sanitized.result.globalTop[0].text, /\[REDACTED\]/);
  assert.match(sanitized.result.patients[0].topItems[0].text, /\[REDACTED\]/);
  assert.match(sanitized.result.patients[0].todos[0].text, /\[REDACTED\]/);
  assert.match(sanitized.result.patients[0].problems[0].text, /\[REDACTED\]/);
  assert.match(sanitized.result.patients[0].risks[0].label, /\[REDACTED\]/);
  assert.match(sanitized.result.uncertainties[0].reason, /\[REDACTED\]/);
  assert.match(sanitized.result.uncertainties[0].text, /\[REDACTED\]/);
  assert.equal(sanitized.residualIssues.length, 0);
});

test("sanitizeStructuredSession leaves clean aliases untouched", () => {
  const result = sampleResult();
  result.globalTop[0].text = "환자A 항생제 10시 투약";
  result.patients[0].topItems[0].text = "환자A 혈당 재확인";
  result.patients[0].todos[0].text = "오더 확인";
  result.patients[0].problems[0].text = "통증 관찰";
  result.patients[0].risks[0].label = "호흡";
  result.uncertainties[0].reason = "시간 누락";
  result.uncertainties[0].text = "수치 확인 필요";

  const sanitized = sanitizeStructuredSession(result);
  assert.equal(sanitized.issues.length, 0);
  assert.equal(sanitized.result.globalTop[0].text, "환자A 항생제 10시 투약");
  assert.equal(sanitized.residualIssues.length, 0);
});

test("sanitizeStructuredSession reports residual issues for unmatched identifier formats", () => {
  const result = sampleResult();
  result.globalTop[0].text = "환자A 연락처 010/1234/5678";
  const sanitized = sanitizeStructuredSession(result);
  assert.ok(sanitized.residualIssues.length > 0);
  assert.equal(sanitized.residualIssues[0].pattern, "phone");
});
