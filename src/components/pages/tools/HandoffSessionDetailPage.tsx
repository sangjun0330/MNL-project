"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { authHeaders } from "@/lib/billing/client";
import { appendHandoffAuditEvent } from "@/lib/handoff/auditLog";
import { sanitizeStructuredSession } from "@/lib/handoff/deidGuard";
import { HANDOFF_FLAGS } from "@/lib/handoff/featureFlags";
import { buildEvidenceMap, runHandoffPipeline } from "@/lib/handoff/pipeline";
import { evaluateHandoffPrivacyPolicy } from "@/lib/handoff/privacyPolicy";
import {
  deleteStructuredSession,
  loadStructuredSession,
  type StructuredSessionRecord,
} from "@/lib/handoff/sessionStore";
import { vaultCryptoShredSession, vaultLoadRawSegments } from "@/lib/handoff/vault";
import type { EvidenceRef } from "@/lib/handoff/types";
import { useAuthState } from "@/lib/auth";

function evidenceRange(evidenceRef: EvidenceRef) {
  return `${Math.floor(evidenceRef.startMs / 1000)}s-${Math.ceil(evidenceRef.endMs / 1000)}s`;
}

function levelClass(level: "high" | "medium" | "low") {
  if (level === "high") return "bg-red-50 text-red-700 border-red-200";
  if (level === "medium") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-emerald-50 text-emerald-700 border-emerald-200";
}

export function HandoffSessionDetailPage({ sessionId }: { sessionId: string }) {
  const { status: authStatus, user } = useAuthState();
  const [record, setRecord] = useState<StructuredSessionRecord | null>(null);
  const [evidenceMap, setEvidenceMap] = useState<Record<string, string>>({});
  const [activeEvidence, setActiveEvidence] = useState<EvidenceRef | null>(null);
  const [deidIssueCount, setDeidIssueCount] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const [adminChecking, setAdminChecking] = useState(false);
  const [adminAllowed, setAdminAllowed] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const privacyPolicy = evaluateHandoffPrivacyPolicy(HANDOFF_FLAGS);
  const authPending = privacyPolicy.authRequired && authStatus === "loading";
  const authBlocked = privacyPolicy.authRequired && authStatus !== "authenticated";
  const secureContextBlocked = privacyPolicy.secureContextRequired && !privacyPolicy.secureContextSatisfied;
  const adminBlocked = authStatus !== "loading" && !adminChecking && !adminAllowed;

  useEffect(() => {
    let active = true;
    if (authStatus !== "authenticated" || !user?.userId) {
      setAdminChecking(false);
      setAdminAllowed(false);
      setAdminError(null);
      return () => {
        active = false;
      };
    }

    const run = async () => {
      setAdminChecking(true);
      setAdminError(null);
      try {
        const headers = await authHeaders();
        const res = await fetch("/api/admin/billing/access", {
          method: "GET",
          headers: {
            "content-type": "application/json",
            ...headers,
          },
          cache: "no-store",
        });
        const json = await res.json().catch(() => null);
        if (!active) return;
        const allowed = Boolean(json?.ok && json?.data?.isAdmin);
        setAdminAllowed(allowed);
        if (!allowed) {
          setAdminError(String(json?.error ?? "admin_forbidden"));
        }
      } catch (cause) {
        if (!active) return;
        setAdminAllowed(false);
        setAdminError(String(cause));
      } finally {
        if (!active) return;
        setAdminChecking(false);
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [authStatus, user?.userId]);

  useEffect(() => {
    if (authBlocked || secureContextBlocked || adminChecking || adminBlocked) {
      setRecord(null);
      return;
    }

    const current = loadStructuredSession(sessionId);
    if (!current) {
      setRecord(null);
      setDeidIssueCount(0);
      setEvidenceMap({});
      setActiveEvidence(null);
      return;
    }

    const sanitized = sanitizeStructuredSession(current.result);
    setRecord({
      ...current,
      result: sanitized.result,
    });
    setDeidIssueCount(sanitized.issues.length);
    setEvidenceMap({});
    setActiveEvidence(null);

    if (!HANDOFF_FLAGS.handoffEvidenceEnabled) return;

    const run = async () => {
      const raw = await vaultLoadRawSegments(sessionId);
      if (!raw?.length) return;
      const output = runHandoffPipeline({
        sessionId,
        dutyType: sanitized.result.dutyType,
        rawSegments: raw,
      });
      setEvidenceMap(buildEvidenceMap(output.local.maskedSegments));
    };

    void run();
  }, [authBlocked, secureContextBlocked, adminChecking, adminBlocked, sessionId]);

  const removeSession = async () => {
    if (authBlocked || secureContextBlocked || adminChecking || adminBlocked) {
      setActionError("strict 정책으로 로그인 사용자만 세션 파기가 가능합니다.");
      return;
    }
    setActionError(null);
    try {
      await vaultCryptoShredSession(sessionId);
      deleteStructuredSession(sessionId);
      setRecord(null);
      setEvidenceMap({});
      appendHandoffAuditEvent({
        action: "session_shred",
        sessionId,
        detail: "detail_page",
      });
    } catch {
      setActionError("세션 삭제 중 오류가 발생했습니다. 다시 시도해 주세요.");
    }
  };

  if (authPending) {
    return (
      <div className="mx-auto w-full max-w-[760px] px-4 pb-24 pt-6">
        <Card className="p-5">
          <div className="text-[16px] font-semibold text-ios-text">인증 상태 확인 중입니다.</div>
          <div className="mt-2 text-[12.5px] text-ios-sub">strict 정책 적용을 위해 로그인 상태를 검증하고 있습니다.</div>
        </Card>
      </div>
    );
  }

  if (authBlocked) {
    return (
      <div className="mx-auto w-full max-w-[760px] px-4 pb-24 pt-6">
        <Card className="p-5">
          <div className="text-[16px] font-semibold text-ios-text">로그인 후 접근 가능합니다.</div>
          <div className="mt-2 text-[12.5px] text-ios-sub">strict 정책으로 세션 상세 조회는 인증 사용자만 허용됩니다.</div>
          <div className="mt-4">
            <Link href="/tools/handoff" className="text-[13px] font-semibold text-[color:var(--wnl-accent)]">
              ← AI 인계로 돌아가기
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  if (secureContextBlocked) {
    return (
      <div className="mx-auto w-full max-w-[760px] px-4 pb-24 pt-6">
        <Card className="p-5">
          <div className="text-[16px] font-semibold text-ios-text">보안 컨텍스트가 필요합니다.</div>
          <div className="mt-2 text-[12.5px] text-ios-sub">strict 정책으로 HTTPS secure context에서만 조회할 수 있습니다.</div>
          <div className="mt-4">
            <Link href="/tools/handoff" className="text-[13px] font-semibold text-[color:var(--wnl-accent)]">
              ← AI 인계로 돌아가기
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  if (adminChecking) {
    return (
      <div className="mx-auto w-full max-w-[760px] px-4 pb-24 pt-6">
        <Card className="p-5">
          <div className="text-[16px] font-semibold text-ios-text">관리자 권한 확인 중입니다.</div>
          <div className="mt-2 text-[12.5px] text-ios-sub">AI 인계 상세는 관리자 개발자 계정만 접근할 수 있습니다.</div>
        </Card>
      </div>
    );
  }

  if (adminBlocked) {
    return (
      <div className="mx-auto w-full max-w-[760px] px-4 pb-24 pt-6">
        <Card className="p-5">
          <div className="text-[16px] font-semibold text-ios-text">관리자 전용 페이지입니다.</div>
          <div className="mt-2 text-[12.5px] text-ios-sub">
            AI 인계 상세는 관리자 개발자 계정에서만 접근할 수 있습니다.
            {adminError ? ` (${adminError})` : ""}
          </div>
          <div className="mt-4">
            <Link href="/tools" className="text-[13px] font-semibold text-[color:var(--wnl-accent)]">
              ← Tool 목록으로
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  if (!record) {
    return (
      <div className="mx-auto w-full max-w-[760px] px-4 pb-24 pt-6">
        <Card className="p-5">
          <div className="text-[16px] font-semibold text-ios-text">세션을 찾을 수 없습니다.</div>
          <div className="mt-2 text-[12.5px] text-ios-sub">TTL 만료 또는 수동 삭제로 제거되었을 수 있습니다.</div>
          <div className="mt-4">
            <Link href="/tools/handoff" className="text-[13px] font-semibold text-[color:var(--wnl-accent)]">
              ← AI 인계로 돌아가기
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  const result = record.result;
  const evidenceText = activeEvidence ? evidenceMap[activeEvidence.segmentId] : null;

  return (
    <div data-testid="handoff-detail-root" className="mx-auto w-full max-w-[860px] space-y-4 px-4 pb-24 pt-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[28px] font-extrabold tracking-[-0.02em]">AI 인계 세션</div>
          <div className="mt-1 text-[12.5px] text-ios-sub">{result.sessionId} · {result.dutyType}</div>
        </div>
        <Link href="/tools/handoff" className="text-[12px] font-semibold text-[color:var(--wnl-accent)]">목록</Link>
      </div>

      <Card data-testid="handoff-detail-meta" className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-[13px] font-semibold text-ios-text">보관 만료</div>
          <div className="text-[12px] text-ios-sub">{new Date(record.expiresAt).toLocaleString()}</div>
        </div>
        {deidIssueCount > 0 ? (
          <div className="mt-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-800">
            구세션 데이터에서 잠재 PHI {deidIssueCount}건을 비식별 처리했습니다.
          </div>
        ) : null}
        <div className="mt-3 flex gap-2">
          <Button variant="danger" onClick={() => { void removeSession(); }}>세션 파기</Button>
        </div>
        {actionError ? (
          <div className="mt-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-[12px] text-red-700">
            {actionError}
          </div>
        ) : null}
      </Card>

      <Card data-testid="handoff-detail-global-top" className="p-5">
        <div className="text-[15px] font-semibold text-ios-text">Global Top</div>
        <div className="mt-3 space-y-2">
          {result.globalTop.map((item, idx) => (
            <div key={item.id} className="rounded-2xl border border-ios-sep bg-white p-3">
              <div className="flex items-center gap-2 text-[11px] text-ios-sub">
                <span className="rounded-full bg-black px-2 py-1 font-semibold text-white">TOP {idx + 1}</span>
                <span>{item.alias}</span>
                <span>{item.badge}</span>
                <span>{item.score}</span>
              </div>
              <div className="mt-1 text-[13px] text-ios-text">{item.text}</div>
              {HANDOFF_FLAGS.handoffEvidenceEnabled ? (
                <button
                  type="button"
                  className="mt-1 text-[11.5px] font-semibold text-[color:var(--wnl-accent)]"
                  onClick={() => setActiveEvidence(item.evidenceRef)}
                >
                  Evidence {evidenceRange(item.evidenceRef)}
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <div className="text-[15px] font-semibold text-ios-text">Ward Events</div>
        <div className="mt-2 space-y-2">
          {result.wardEvents.length ? (
            result.wardEvents.map((event) => (
              <div key={event.id} className="rounded-xl border border-ios-sep bg-white p-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-ios-sub">{event.category}</div>
                <div className="mt-1 text-[12.5px] text-ios-text">{event.text}</div>
                {HANDOFF_FLAGS.handoffEvidenceEnabled ? (
                  <button
                    type="button"
                    className="mt-1 text-[11.5px] font-semibold text-[color:var(--wnl-accent)]"
                    onClick={() => setActiveEvidence(event.evidenceRef)}
                  >
                    Evidence {evidenceRange(event.evidenceRef)}
                  </button>
                ) : null}
              </div>
            ))
          ) : (
            <div className="text-[12.5px] text-ios-sub">없음</div>
          )}
        </div>
      </Card>

      <Card className="p-5">
        <div className="text-[15px] font-semibold text-ios-text">Patient Cards</div>
        <div className="mt-3 space-y-3">
          {result.patients.map((patient) => (
            <div key={patient.alias} className="rounded-2xl border border-ios-sep bg-white p-4">
              <div className="text-[14px] font-semibold text-ios-text">{patient.patientKey}</div>
              <div className="mt-1 text-[12.5px] text-ios-sub">{patient.summary1}</div>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div>
                  <div className="text-[12px] font-semibold text-ios-sub">Current Status</div>
                  <ul className="mt-1 space-y-1 text-[12.5px] text-ios-text">
                    {patient.currentStatus.length ? patient.currentStatus.map((item, idx) => <li key={`${patient.alias}-status-${idx}`}>• {item}</li>) : <li className="text-ios-sub">없음</li>}
                  </ul>
                </div>
                <div>
                  <div className="text-[12px] font-semibold text-ios-sub">Problems</div>
                  <ul className="mt-1 space-y-1 text-[12.5px] text-ios-text">
                    {patient.problems.length ? patient.problems.map((item, idx) => <li key={`${patient.alias}-problem-${idx}`}>• {item}</li>) : <li className="text-ios-sub">없음</li>}
                  </ul>
                </div>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <div>
                  <div className="text-[12px] font-semibold text-ios-sub">Meds</div>
                  <ul className="mt-1 space-y-1 text-[12.5px] text-ios-text">
                    {patient.meds.length ? patient.meds.map((item, idx) => <li key={`${patient.alias}-med-${idx}`}>• {item}</li>) : <li className="text-ios-sub">없음</li>}
                  </ul>
                </div>
                <div>
                  <div className="text-[12px] font-semibold text-ios-sub">Lines</div>
                  <ul className="mt-1 space-y-1 text-[12.5px] text-ios-text">
                    {patient.lines.length ? patient.lines.map((item, idx) => <li key={`${patient.alias}-line-${idx}`}>• {item}</li>) : <li className="text-ios-sub">없음</li>}
                  </ul>
                </div>
                <div>
                  <div className="text-[12px] font-semibold text-ios-sub">Labs</div>
                  <ul className="mt-1 space-y-1 text-[12.5px] text-ios-text">
                    {patient.labs.length ? patient.labs.map((item, idx) => <li key={`${patient.alias}-lab-${idx}`}>• {item}</li>) : <li className="text-ios-sub">없음</li>}
                  </ul>
                </div>
              </div>

              <div className="mt-3">
                <div className="text-[12px] font-semibold text-ios-sub">Plan</div>
                <div className="mt-1 space-y-1.5">
                  {patient.plan.length ? patient.plan.map((todo, idx) => (
                    <div key={`${patient.alias}-plan-${idx}`} className="rounded-xl border border-ios-sep p-2">
                      <span className={`rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${levelClass(todo.priority === "P0" ? "high" : todo.priority === "P1" ? "medium" : "low")}`}>{todo.priority}</span>
                      <div className="mt-1 text-[12.5px] text-ios-text">{todo.task}</div>
                      {todo.evidenceRef && HANDOFF_FLAGS.handoffEvidenceEnabled ? (
                        <button
                          type="button"
                          className="mt-1 text-[11.5px] font-semibold text-[color:var(--wnl-accent)]"
                          onClick={() => setActiveEvidence(todo.evidenceRef!)}
                        >
                          Evidence {evidenceRange(todo.evidenceRef)}
                        </button>
                      ) : null}
                    </div>
                  )) : <div className="text-[12px] text-ios-sub">없음</div>}
                </div>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div>
                  <div className="text-[12px] font-semibold text-ios-sub">Watch For</div>
                  <ul className="mt-1 space-y-1 text-[12.5px] text-ios-text">
                    {patient.watchFor.length ? patient.watchFor.map((item, idx) => <li key={`${patient.alias}-watch-${idx}`}>• {item}</li>) : <li className="text-ios-sub">없음</li>}
                  </ul>
                </div>
                <div>
                  <div className="text-[12px] font-semibold text-ios-sub">Questions</div>
                  <ul className="mt-1 space-y-1 text-[12.5px] text-ios-text">
                    {patient.questions.length ? patient.questions.map((item, idx) => <li key={`${patient.alias}-question-${idx}`}>• {item}</li>) : <li className="text-ios-sub">없음</li>}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <div className="text-[15px] font-semibold text-ios-text">Uncertainties</div>
        <div className="mt-2 space-y-2">
          {result.uncertaintyItems.length ? (
            result.uncertaintyItems.map((item) => (
              <div key={item.id} className="rounded-xl border border-ios-sep bg-white p-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-ios-sub">{item.kind}</div>
                <div className="mt-1 text-[12.5px] text-ios-text">{item.reason}</div>
                {HANDOFF_FLAGS.handoffEvidenceEnabled ? (
                  <button
                    type="button"
                    className="mt-1 text-[11.5px] font-semibold text-[color:var(--wnl-accent)]"
                    onClick={() => setActiveEvidence(item.evidenceRef)}
                  >
                    Evidence {evidenceRange(item.evidenceRef)}
                  </button>
                ) : null}
              </div>
            ))
          ) : (
            <div className="text-[12.5px] text-ios-sub">없음</div>
          )}
        </div>
      </Card>

      {HANDOFF_FLAGS.handoffEvidenceEnabled && activeEvidence ? (
        <Card className="p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-[13px] font-semibold text-ios-text">Local Evidence</div>
              <div className="text-[11.5px] text-ios-sub">{activeEvidence.segmentId} · {evidenceRange(activeEvidence)}</div>
            </div>
            <Button variant="ghost" onClick={() => setActiveEvidence(null)} className="h-8 px-3 text-[11px]">닫기</Button>
          </div>
          <div className="mt-2 rounded-2xl border border-ios-sep bg-white p-3 text-[12.5px] text-ios-text">
            {evidenceText ?? "로컬 key가 없어서 evidence를 복호화할 수 없습니다."}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

export default HandoffSessionDetailPage;
