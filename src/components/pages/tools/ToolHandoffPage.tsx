"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Segmented } from "@/components/ui/Segmented";
import { Textarea } from "@/components/ui/Textarea";
import { createLocalSpeechAsr, isLocalSpeechAsrSupported, type LocalAsrController } from "@/lib/handoff/asr";
import { appendHandoffAuditEvent } from "@/lib/handoff/auditLog";
import { detectResidualStructuredPhi, sanitizeStructuredSession } from "@/lib/handoff/deidGuard";
import {
  clearAllHandoffDraftMeta,
  clearHandoffDraftMeta,
  loadHandoffDraftMeta,
  saveHandoffDraftMeta,
} from "@/lib/handoff/draftStore";
import { HANDOFF_FLAGS } from "@/lib/handoff/featureFlags";
import { buildEvidenceMap, runHandoffPipeline, transcriptToRawSegments } from "@/lib/handoff/pipeline";
import type { ManualUncertaintyInput } from "@/lib/handoff/pipeline";
import { evaluateHandoffPrivacyPolicy } from "@/lib/handoff/privacyPolicy";
import { createHandoffRecorder, isHandoffRecorderSupported, type HandoffRecorderController, type RecorderChunk } from "@/lib/handoff/recorder";
import {
  deleteAllStructuredSessions,
  deleteStructuredSession,
  listStructuredSessions,
  purgeExpiredStructuredSessions,
  saveStructuredSession,
  type StructuredSessionRecord,
} from "@/lib/handoff/sessionStore";
import { purgeHandoffLocalScope } from "@/lib/handoff/storageScope";
import {
  purgeAllVaultRecords,
  purgeExpiredVaultRecords,
  vaultLoadRawSegments,
  vaultCryptoShredSession,
  vaultSaveRawSegments,
} from "@/lib/handoff/vault";
import {
  createWasmLocalAsr,
  isWasmLocalAsrSupported,
  type WasmAsrController,
} from "@/lib/handoff/wasmAsr";
import type {
  DutyType,
  EvidenceRef,
  HandoffRiskLevel,
  HandoverSessionResult,
  RawSegment,
} from "@/lib/handoff/types";
import { createHandoffSessionId } from "@/lib/handoff/types";
import { useAuthState } from "@/lib/auth";
import { useI18n } from "@/lib/useI18n";

const DUTY_OPTIONS: ReadonlyArray<{ value: DutyType; label: string }> = [
  { value: "day", label: "Day" },
  { value: "evening", label: "Evening" },
  { value: "night", label: "Night" },
];

type ReviewState = {
  resolved: boolean;
  note: string;
};

type ChunkLog = {
  chunkId: string;
  durationMs: number;
  rangeText: string;
  sizeBytes: number;
  hasTranscript: boolean;
};

const MAX_SEGMENT_COUNT = 480;
const MAX_SEGMENT_TOTAL_TEXT_LENGTH = 120_000;

function levelTone(level: HandoffRiskLevel) {
  if (level === "high") return "bg-red-50 text-red-700 border-red-200";
  if (level === "medium") return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-emerald-50 text-emerald-700 border-emerald-200";
}

function scoreTone(score: number) {
  if (score >= 70) return "bg-red-50 text-red-700 border-red-200";
  if (score >= 40) return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-emerald-50 text-emerald-700 border-emerald-200";
}

function formatTime(value: number) {
  const d = new Date(value);
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yy}-${mm}-${dd} ${hh}:${min}`;
}

function formatEvidenceRange(evidenceRef: EvidenceRef) {
  const startSec = Math.max(0, Math.floor(evidenceRef.startMs / 1000));
  const endSec = Math.max(startSec, Math.ceil(evidenceRef.endMs / 1000));
  return `${startSec}s-${endSec}s`;
}

function sortSegments(segments: RawSegment[]) {
  return [...segments].sort((a, b) => {
    if (a.startMs !== b.startMs) return a.startMs - b.startMs;
    return a.segmentId.localeCompare(b.segmentId);
  });
}

function totalSegmentTextLength(segments: RawSegment[]) {
  return segments.reduce((acc, segment) => acc + segment.rawText.length, 0);
}

function segmentBudgetOkay(current: RawSegment[], incoming: RawSegment[]) {
  const merged = [...current, ...incoming];
  if (merged.length > MAX_SEGMENT_COUNT) {
    return {
      ok: false,
      reason: `세그먼트 수 제한(${MAX_SEGMENT_COUNT})을 초과했습니다. 세션을 저장하거나 새로 시작해 주세요.`,
    };
  }
  const totalLength = totalSegmentTextLength(merged);
  if (totalLength > MAX_SEGMENT_TOTAL_TEXT_LENGTH) {
    return {
      ok: false,
      reason: `전사 텍스트 총량 제한(${MAX_SEGMENT_TOTAL_TEXT_LENGTH.toLocaleString()} chars)을 초과했습니다.`,
    };
  }
  return { ok: true as const, reason: null };
}

function ResultSection({
  result,
  evidenceEnabled,
  evidenceMap,
}: {
  result: HandoverSessionResult;
  evidenceEnabled: boolean;
  evidenceMap: Record<string, string>;
}) {
  const [activeEvidence, setActiveEvidence] = useState<EvidenceRef | null>(null);

  const evidenceText = activeEvidence ? evidenceMap[activeEvidence.segmentId] : null;

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div data-testid="handoff-global-top-section" className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[15px] font-semibold text-ios-text">Global Top</div>
            <div className="mt-1 text-[12.5px] text-ios-sub">위험/긴급 우선순위 3~5개</div>
          </div>
          <span className="rounded-full border border-ios-sep px-2 py-1 text-[11px] font-semibold text-ios-sub">
            {result.globalTop.length}개
          </span>
        </div>
        <div className="mt-3 space-y-2">
          {result.globalTop.length ? (
            result.globalTop.map((item, idx) => (
              <div key={item.id} className="rounded-2xl border border-ios-sep bg-white p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-black px-2 py-1 text-[11px] font-semibold text-white">TOP {idx + 1}</span>
                  <span className="rounded-full border border-ios-sep px-2 py-1 text-[11px] font-semibold text-ios-sub">{item.alias}</span>
                  <span className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${scoreTone(item.score)}`}>{item.badge}</span>
                  <span className="text-[11px] font-semibold text-ios-sub">score {item.score}</span>
                </div>
                <div className="mt-2 text-[13.5px] text-ios-text">{item.text}</div>
                {evidenceEnabled ? (
                  <button
                    type="button"
                    className="mt-2 text-[12px] font-semibold text-[color:var(--wnl-accent)]"
                    onClick={() => setActiveEvidence(item.evidenceRef)}
                  >
                    Evidence {formatEvidenceRange(item.evidenceRef)}
                  </button>
                ) : null}
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-ios-sep p-3 text-[12.5px] text-ios-sub">결과가 없습니다.</div>
          )}
        </div>
      </Card>

      <Card className="p-5">
        <div className="text-[15px] font-semibold text-ios-text">Ward Events</div>
        <div className="mt-1 text-[12.5px] text-ios-sub">퇴원/입원/회진/장비/민원 등 병동 단위 이벤트</div>
        <div className="mt-3 space-y-2">
          {result.wardEvents.length ? (
            result.wardEvents.map((event) => (
              <div key={event.id} className="rounded-2xl border border-ios-sep bg-white p-3">
                <div className="text-[12px] font-semibold uppercase tracking-[0.04em] text-ios-sub">{event.category}</div>
                <div className="mt-1 text-[13.5px] text-ios-text">{event.text}</div>
                {evidenceEnabled ? (
                  <button
                    type="button"
                    className="mt-2 text-[12px] font-semibold text-[color:var(--wnl-accent)]"
                    onClick={() => setActiveEvidence(event.evidenceRef)}
                  >
                    Evidence {formatEvidenceRange(event.evidenceRef)}
                  </button>
                ) : null}
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-ios-sep p-3 text-[12.5px] text-ios-sub">분리된 Ward 이벤트가 없습니다.</div>
          )}
        </div>
      </Card>

      <Card className="p-5">
        <div className="text-[15px] font-semibold text-ios-text">Patient Cards</div>
        <div className="mt-1 text-[12.5px] text-ios-sub">환자별 Top/To-do/리스크를 1화면에 표시</div>
        <div className="mt-3 space-y-3">
          {result.patients.length ? (
            result.patients.map((patient) => (
              <div key={patient.alias} className="rounded-2xl border border-ios-sep bg-white p-4">
                <div className="flex items-center justify-between">
                  <div className="text-[14px] font-semibold text-ios-text">{patient.alias}</div>
                  <span className="text-[12px] text-ios-sub">Top {patient.topItems.length} · To-do {patient.todos.length}</span>
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div>
                    <div className="text-[12px] font-semibold text-ios-sub">TOP Items</div>
                    <div className="mt-2 space-y-1.5">
                      {patient.topItems.length ? (
                        patient.topItems.map((item) => (
                          <div key={item.id} className="rounded-xl border border-ios-sep p-2">
                            <div className="flex items-center gap-2">
                              <span className={`rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${scoreTone(item.score)}`}>
                                {item.badge}
                              </span>
                              <span className="text-[11px] text-ios-sub">{item.score}</span>
                            </div>
                            <div className="mt-1 text-[12.5px] text-ios-text">{item.text}</div>
                            {evidenceEnabled ? (
                              <button
                                type="button"
                                className="mt-1 text-[11.5px] font-semibold text-[color:var(--wnl-accent)]"
                                onClick={() => setActiveEvidence(item.evidenceRef)}
                              >
                                Evidence {formatEvidenceRange(item.evidenceRef)}
                              </button>
                            ) : null}
                          </div>
                        ))
                      ) : (
                        <div className="rounded-xl border border-dashed border-ios-sep p-2 text-[12px] text-ios-sub">항목 없음</div>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-[12px] font-semibold text-ios-sub">To-do</div>
                    <div className="mt-2 space-y-1.5">
                      {patient.todos.length ? (
                        patient.todos.map((todo) => (
                          <div key={todo.id} className="rounded-xl border border-ios-sep p-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${levelTone(todo.level)}`}>{todo.level}</span>
                              {todo.dueHint ? <span className="text-[11px] font-semibold text-ios-sub">{todo.dueHint}</span> : null}
                            </div>
                            <div className="mt-1 text-[12.5px] text-ios-text">{todo.text}</div>
                            {evidenceEnabled ? (
                              <button
                                type="button"
                                className="mt-1 text-[11.5px] font-semibold text-[color:var(--wnl-accent)]"
                                onClick={() => setActiveEvidence(todo.evidenceRef)}
                              >
                                Evidence {formatEvidenceRange(todo.evidenceRef)}
                              </button>
                            ) : null}
                          </div>
                        ))
                      ) : (
                        <div className="rounded-xl border border-dashed border-ios-sep p-2 text-[12px] text-ios-sub">항목 없음</div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div>
                    <div className="text-[12px] font-semibold text-ios-sub">Problems</div>
                    <ul className="mt-1 space-y-1 text-[12.5px] text-ios-text">
                      {patient.problems.length ? patient.problems.map((problem) => <li key={problem.id}>• {problem.text}</li>) : <li className="text-ios-sub">없음</li>}
                    </ul>
                  </div>

                  <div>
                    <div className="text-[12px] font-semibold text-ios-sub">Risks</div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {patient.risks.length ? (
                        patient.risks.map((risk) => (
                          <span key={risk.id} className={`rounded-full border px-2 py-1 text-[11px] font-semibold ${levelTone(risk.level)}`}>
                            {risk.label}
                          </span>
                        ))
                      ) : (
                        <span className="text-[12px] text-ios-sub">없음</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-ios-sep p-3 text-[12.5px] text-ios-sub">환자 카드가 없습니다.</div>
          )}
        </div>
      </Card>

      <Card className="p-5">
        <div className="text-[15px] font-semibold text-ios-text">Uncertainties</div>
        <div className="mt-1 text-[12.5px] text-ios-sub">미기재/애매 항목 10초 검수 리스트</div>
        <div className="mt-3 space-y-2">
          {result.uncertainties.length ? (
            result.uncertainties.map((item) => (
              <div key={item.id} className="rounded-2xl border border-ios-sep bg-white p-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-ios-sub">{item.kind}</div>
                <div className="mt-1 text-[12.5px] font-medium text-ios-text">{item.reason}</div>
                <div className="mt-1 text-[12px] text-ios-sub">{item.text}</div>
                {evidenceEnabled ? (
                  <button
                    type="button"
                    className="mt-2 text-[11.5px] font-semibold text-[color:var(--wnl-accent)]"
                    onClick={() => setActiveEvidence(item.evidenceRef)}
                  >
                    Evidence {formatEvidenceRange(item.evidenceRef)}
                  </button>
                ) : null}
              </div>
            ))
          ) : (
            <div className="rounded-2xl border border-dashed border-ios-sep p-3 text-[12.5px] text-ios-sub">검수 항목 없음</div>
          )}
        </div>
      </Card>

      {evidenceEnabled && activeEvidence ? (
        <Card className="p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-[13px] font-semibold text-ios-text">Local Evidence</div>
              <div className="text-[11.5px] text-ios-sub">
                {activeEvidence.segmentId} · {formatEvidenceRange(activeEvidence)}
              </div>
            </div>
            <Button variant="ghost" onClick={() => setActiveEvidence(null)} className="h-8 px-3 text-[11px]">
              닫기
            </Button>
          </div>
          <div className="mt-2 rounded-2xl border border-ios-sep bg-white p-3 text-[12.5px] text-ios-text">
            {evidenceText ?? "로컬 키가 없어 evidence를 복구할 수 없습니다."}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

export function ToolHandoffPage() {
  const { t } = useI18n();
  const { status: authStatus } = useAuthState();
  const [sessionId, setSessionId] = useState(() => createHandoffSessionId());
  const [dutyType, setDutyType] = useState<DutyType>("night");
  const [chunkInput, setChunkInput] = useState("");
  const [rawSegments, setRawSegments] = useState<RawSegment[]>([]);
  const [running, setRunning] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [result, setResult] = useState<HandoverSessionResult | null>(null);
  const [evidenceMap, setEvidenceMap] = useState<Record<string, string>>({});
  const [savedSessions, setSavedSessions] = useState<StructuredSessionRecord[]>([]);
  const [reviewMap, setReviewMap] = useState<Record<string, ReviewState>>({});
  const [reviewCountdown, setReviewCountdown] = useState(0);
  const [chunkLogs, setChunkLogs] = useState<ChunkLog[]>([]);
  const [recordingState, setRecordingState] = useState<"idle" | "recording" | "stopping">("idle");
  const [webSpeechSupported, setWebSpeechSupported] = useState(false);
  const [wasmAsrSupported, setWasmAsrSupported] = useState(false);
  const [recorderSupported, setRecorderSupported] = useState(false);
  const [liveAsrPreview, setLiveAsrPreview] = useState("");
  const [sessionSaved, setSessionSaved] = useState(false);
  const [manualUncertainties, setManualUncertainties] = useState<ManualUncertaintyInput[]>([]);
  const [draftRecoveredAt, setDraftRecoveredAt] = useState<number | null>(null);
  const [draftSaveState, setDraftSaveState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [deidIssueCount, setDeidIssueCount] = useState(0);
  const [residualIssueCount, setResidualIssueCount] = useState(0);
  const [showAllUncertainties, setShowAllUncertainties] = useState(false);

  const recorderRef = useRef<HandoffRecorderController | null>(null);
  const asrRef = useRef<LocalAsrController | null>(null);
  const wasmAsrRef = useRef<WasmAsrController | null>(null);
  const sessionIdRef = useRef(sessionId);
  const rawSegmentsRef = useRef<RawSegment[]>([]);
  const liveSegmentSeqRef = useRef(0);
  const asrErrorCountRef = useRef(0);
  const chunkUncertaintyKeysRef = useRef(new Set<string>());
  const asrPolicyBlockLoggedRef = useRef(false);
  const remotePolicyBlockLoggedRef = useRef(false);

  const segmentStats = useMemo(() => {
    if (!rawSegments.length) return { count: 0, sec: 0 };
    const sec = Math.ceil(rawSegments[rawSegments.length - 1].endMs / 1000);
    return { count: rawSegments.length, sec };
  }, [rawSegments]);

  const unresolvedCount = useMemo(() => {
    if (!result?.uncertainties.length) return 0;
    return result.uncertainties.filter((item) => !reviewMap[item.id]?.resolved).length;
  }, [result, reviewMap]);
  const uncertaintySummary = useMemo(() => {
    if (!result?.uncertainties.length) return [] as Array<{ kind: string; count: number }>;
    const counter = new Map<string, number>();
    result.uncertainties.forEach((item) => {
      counter.set(item.kind, (counter.get(item.kind) ?? 0) + 1);
    });
    return [...counter.entries()]
      .map(([kind, count]) => ({ kind, count }))
      .sort((a, b) => b.count - a.count);
  }, [result]);
  const visibleUncertainties = useMemo(() => {
    if (!result?.uncertainties.length) return [];
    return showAllUncertainties ? result.uncertainties : result.uncertainties.slice(0, 12);
  }, [result, showAllUncertainties]);

  const privacyPolicy = evaluateHandoffPrivacyPolicy(HANDOFF_FLAGS);
  const authPending = privacyPolicy.authRequired && authStatus === "loading";
  const authBlocked = privacyPolicy.authRequired && authStatus !== "authenticated";
  const secureContextBlocked = privacyPolicy.secureContextRequired && !privacyPolicy.secureContextSatisfied;
  const actionBlocked = authBlocked || secureContextBlocked;
  const configuredAsrProvider = privacyPolicy.configuredAsrProvider;
  const asrProvider = privacyPolicy.effectiveAsrProvider;
  const webSpeechAsrEnabled = HANDOFF_FLAGS.handoffLocalAsrEnabled && asrProvider === "web_speech";
  const wasmLocalAsrEnabled = HANDOFF_FLAGS.handoffWasmAsrEnabled && asrProvider === "wasm_local";
  const liveAsrEnabled = webSpeechAsrEnabled || wasmLocalAsrEnabled;
  const webAudioCaptureEnabled = HANDOFF_FLAGS.handoffWebAudioCaptureEnabled;
  const asrProviderReady =
    asrProvider === "web_speech"
      ? webSpeechSupported
      : asrProvider === "wasm_local"
        ? wasmAsrSupported
        : false;
  const canStartRecording =
    recordingState === "idle" &&
    webAudioCaptureEnabled &&
    recorderSupported &&
    (asrProvider === "manual" || (liveAsrEnabled && asrProviderReady)) &&
    !actionBlocked;
  const reviewLockActive = Boolean(result?.uncertainties.length) && !sessionSaved && reviewCountdown > 0;
  const flatButtonBase =
    "inline-flex h-11 items-center justify-center rounded-full border px-4 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";
  const flatButtonSecondary = `${flatButtonBase} border-ios-sep bg-[#F2F2F7] text-ios-text`;
  const flatButtonPrimary = `${flatButtonBase} border-[color:var(--wnl-accent-border)] bg-[color:var(--wnl-accent-soft)] text-[color:var(--wnl-accent)]`;
  const flatButtonDanger = `${flatButtonBase} border-[#F3C1C1] bg-[#FFECEC] text-[#B3261E]`;

  const refreshStoredLists = useCallback(() => {
    setSavedSessions(listStructuredSessions());
  }, []);

  useEffect(() => {
    if (!privacyPolicy.asrProviderDowngraded || asrPolicyBlockLoggedRef.current) return;
    asrPolicyBlockLoggedRef.current = true;
    appendHandoffAuditEvent({
      action: "policy_blocked",
      detail: `provider ${configuredAsrProvider} -> ${asrProvider}`,
    });
  }, [asrProvider, configuredAsrProvider, privacyPolicy.asrProviderDowngraded]);

  useEffect(() => {
    if (!privacyPolicy.remoteSyncConfigured || privacyPolicy.remoteSyncEffective || remotePolicyBlockLoggedRef.current) return;
    remotePolicyBlockLoggedRef.current = true;
    appendHandoffAuditEvent({
      action: "policy_blocked",
      detail: "remote_sync configured but blocked by local_only policy",
    });
  }, [privacyPolicy.remoteSyncConfigured, privacyPolicy.remoteSyncEffective]);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    rawSegmentsRef.current = rawSegments;
  }, [rawSegments]);

  useEffect(() => {
    if (authBlocked || secureContextBlocked) {
      setSavedSessions([]);
      setResult(null);
      setEvidenceMap({});
      setRawSegments([]);
      setChunkLogs([]);
      setManualUncertainties([]);
      setShowAllUncertainties(false);
      setDraftRecoveredAt(null);
      return;
    }

    const bootstrap = async () => {
      purgeExpiredStructuredSessions();
      await purgeExpiredVaultRecords();
      refreshStoredLists();
      setWebSpeechSupported(isLocalSpeechAsrSupported());
      setWasmAsrSupported(
        isWasmLocalAsrSupported({
          workerUrl: HANDOFF_FLAGS.handoffWasmAsrWorkerUrl,
        })
      );
      setRecorderSupported(isHandoffRecorderSupported());

      const draft = loadHandoffDraftMeta();
      if (!draft) return;
      const restoredSegments = await vaultLoadRawSegments(draft.sessionId);
      if (!restoredSegments?.length) {
        clearHandoffDraftMeta(draft.sessionId);
        return;
      }

      setSessionId(draft.sessionId);
      setDutyType(draft.dutyType);
      setRawSegments(sortSegments(restoredSegments));
      setDraftRecoveredAt(Date.now());
    };
    void bootstrap();
  }, [authBlocked, secureContextBlocked, refreshStoredLists]);

  useEffect(() => {
    if (authBlocked || secureContextBlocked) return;
    const timer = window.setInterval(() => {
      const run = async () => {
        purgeExpiredStructuredSessions();
        await purgeExpiredVaultRecords();
        refreshStoredLists();
      };
      void run();
    }, 60_000);

    return () => window.clearInterval(timer);
  }, [authBlocked, secureContextBlocked, refreshStoredLists]);

  useEffect(() => {
    return () => {
      asrRef.current?.destroy();
      asrRef.current = null;
      void wasmAsrRef.current?.destroy();
      wasmAsrRef.current = null;
      void recorderRef.current?.destroy();
      recorderRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!result || sessionSaved) {
      setReviewCountdown(0);
      return;
    }
    if (!result.uncertainties.length) {
      setReviewCountdown(0);
      return;
    }

    setReviewCountdown(10);
    const timer = window.setInterval(() => {
      setReviewCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1_000);

    return () => window.clearInterval(timer);
  }, [result, sessionSaved]);

  useEffect(() => {
    if (!rawSegments.length) {
      clearHandoffDraftMeta(sessionId);
      setDraftSaveState("idle");
      return;
    }

    setDraftSaveState("saving");
    const timer = window.setTimeout(() => {
      const persist = async () => {
        try {
          saveHandoffDraftMeta({
            sessionId,
            dutyType,
            updatedAt: Date.now(),
          });
          const ok = await vaultSaveRawSegments(sessionId, rawSegments);
          setDraftSaveState(ok ? "saved" : "failed");
        } catch {
          setDraftSaveState("failed");
        }
      };
      void persist();
    }, 700);

    return () => window.clearTimeout(timer);
  }, [sessionId, dutyType, rawSegments]);

  const appendSegments = (segments: RawSegment[]) => {
    if (!segments.length) return;
    const budget = segmentBudgetOkay(rawSegmentsRef.current, segments);
    if (!budget.ok) {
      setError(budget.reason);
      return;
    }
    setRawSegments((prev) => sortSegments([...prev, ...segments]));
    setError(null);
  };

  const pushManualUncertainty = (
    reason: string,
    text: string,
    range?: {
      startMs: number;
      endMs: number;
    }
  ) => {
    const fallbackStart = rawSegmentsRef.current.length
      ? rawSegmentsRef.current[rawSegmentsRef.current.length - 1].endMs
      : 0;
    const startMs = Math.max(0, range?.startMs ?? fallbackStart);
    const endMs = Math.max(startMs + 250, range?.endMs ?? startMs + 2_000);

    setManualUncertainties((prev) => [
      ...prev,
      {
        kind: "manual_review",
        reason,
        text,
        startMs,
        endMs,
      },
    ]);
    setSessionSaved(false);
  };

  const pushChunk = () => {
    const text = chunkInput.trim();
    if (!text) return;

    const startOffsetMs = rawSegmentsRef.current.length
      ? rawSegmentsRef.current[rawSegmentsRef.current.length - 1].endMs
      : 0;

    const chunk = transcriptToRawSegments(text, {
      idPrefix: `${sessionId}-manual-${rawSegmentsRef.current.length + 1}`,
      startOffsetMs,
    });

    if (!chunk.length) {
      setError("청크를 분리하지 못했습니다. 줄바꿈 또는 마침표 단위로 입력해 주세요.");
      return;
    }

    appendSegments(chunk);
    setChunkInput("");
    setError(null);
    setSessionSaved(false);
  };

  const appendChunkLog = (chunk: RecorderChunk, hasTranscript: boolean) => {
    setChunkLogs((prev) => [
      {
        chunkId: chunk.chunkId,
        durationMs: chunk.durationMs,
        rangeText: `${Math.floor(chunk.startMs / 1000)}s-${Math.ceil(chunk.endMs / 1000)}s`,
        sizeBytes: chunk.blob.size,
        hasTranscript,
      },
      ...prev,
    ].slice(0, 12));
  };

  const handleRecordedChunk = (chunk: RecorderChunk) => {
    const chunkSessionId = sessionIdRef.current;
    window.setTimeout(() => {
      if (sessionIdRef.current !== chunkSessionId) return;

      const hasTranscript = rawSegmentsRef.current.some((segment) => {
        const windowStart = chunk.startMs - 1_200;
        const windowEnd = chunk.endMs + 1_200;
        return segment.endMs >= windowStart && segment.startMs <= windowEnd;
      });

      if (!hasTranscript) {
        const missingKey = `${chunk.chunkId}:${chunk.startMs}:${chunk.endMs}`;
        if (!chunkUncertaintyKeysRef.current.has(missingKey)) {
          chunkUncertaintyKeysRef.current.add(missingKey);
          pushManualUncertainty(
            "녹음 chunk 대비 전사 구간이 확인되지 않아 수동 검수가 필요합니다.",
            `${chunk.chunkId} (${Math.floor(chunk.startMs / 1000)}s-${Math.ceil(chunk.endMs / 1000)}s) 전사 누락 가능`,
            {
              startMs: chunk.startMs,
              endMs: chunk.endMs,
            }
          );
        }
      }

      appendChunkLog(chunk, hasTranscript);
    }, 7_000);
  };

  const handleManualRecordedChunk = (chunk: RecorderChunk) => {
    // manual 모드에서는 자동 전사를 하지 않으므로 chunk 로그만 남긴다.
    appendChunkLog(chunk, false);
  };

  const handleWasmRecordedChunk = async (chunk: RecorderChunk) => {
    const chunkSessionId = sessionIdRef.current;
    const controller = wasmAsrRef.current;
    if (!controller || !controller.isRunning()) {
      appendChunkLog(chunk, false);
      pushManualUncertainty(
        "WASM ASR 컨트롤러가 실행 중이 아니어서 수동 검수가 필요합니다.",
        `${chunk.chunkId} 전사 실패`,
        {
          startMs: chunk.startMs,
          endMs: chunk.endMs,
        }
      );
      return;
    }

    try {
      const segments = await controller.transcribeChunk({
        chunkId: chunk.chunkId,
        blob: chunk.blob,
        startMs: chunk.startMs,
        endMs: chunk.endMs,
        mimeType: chunk.mimeType,
      });

      if (sessionIdRef.current !== chunkSessionId) return;

      if (!segments.length) {
        appendChunkLog(chunk, false);
        const missingKey = `${chunk.chunkId}:${chunk.startMs}:${chunk.endMs}`;
        if (!chunkUncertaintyKeysRef.current.has(missingKey)) {
          chunkUncertaintyKeysRef.current.add(missingKey);
          pushManualUncertainty(
            "WASM 로컬 전사 결과가 비어 있어 수동 검수가 필요합니다.",
            `${chunk.chunkId} (${Math.floor(chunk.startMs / 1000)}s-${Math.ceil(chunk.endMs / 1000)}s) 전사 누락 가능`,
            {
              startMs: chunk.startMs,
              endMs: chunk.endMs,
            }
          );
        }
        return;
      }

      const asRawSegments: RawSegment[] = [];
      segments.forEach((segment) => {
        const text = segment.text.trim();
        if (!text) return;
        liveSegmentSeqRef.current += 1;
        const boundedStart = Math.max(chunk.startMs, segment.startMs);
        const boundedEndCandidate = Math.min(
          chunk.endMs,
          Math.max(boundedStart + 250, segment.endMs)
        );
        const boundedEnd = Math.max(boundedStart + 250, boundedEndCandidate);

        asRawSegments.push({
          segmentId: `${sessionIdRef.current}-wasm-${String(liveSegmentSeqRef.current).padStart(3, "0")}`,
          rawText: text,
          startMs: boundedStart,
          endMs: boundedEnd,
        });
      });

      if (!asRawSegments.length) {
        appendChunkLog(chunk, false);
        pushManualUncertainty(
          "WASM 로컬 전사에서 유효 텍스트를 생성하지 못해 검수가 필요합니다.",
          `${chunk.chunkId} 유효 전사 없음`,
          {
            startMs: chunk.startMs,
            endMs: chunk.endMs,
          }
        );
        return;
      }

      appendSegments(asRawSegments);
      setLiveAsrPreview(asRawSegments[asRawSegments.length - 1].rawText);
      setSessionSaved(false);
      appendChunkLog(chunk, true);
    } catch (cause) {
      appendChunkLog(chunk, false);
      pushManualUncertainty(
        "WASM 로컬 전사 중 오류가 발생해 수동 검수가 필요합니다.",
        `${chunk.chunkId} 전사 오류: ${String(cause)}`,
        {
          startMs: chunk.startMs,
          endMs: chunk.endMs,
        }
      );
      setRecordingError(`WASM ASR 오류: ${String(cause)}`);
    }
  };

  const startRecording = async () => {
    if (recordingState !== "idle") return;
    setRecordingError(null);

    if (authBlocked) {
      setRecordingError("strict 정책으로 로그인 사용자인 경우에만 녹음을 시작할 수 있습니다.");
      return;
    }

    if (secureContextBlocked) {
      setRecordingError("strict 정책으로 HTTPS secure context에서만 녹음을 허용합니다.");
      return;
    }

    if (!webAudioCaptureEnabled) {
      setRecordingError("handoff_web_audio_capture_enabled 플래그가 비활성화되어 있습니다.");
      return;
    }

    if (!recorderSupported) {
      setRecordingError("브라우저에서 로컬 녹음을 지원하지 않습니다.");
      return;
    }

    if (asrProvider !== "manual" && !liveAsrEnabled) {
      setRecordingError(
        asrProvider === "web_speech"
          ? "handoff_local_asr_enabled 플래그가 비활성화되어 있습니다."
          : "handoff_wasm_asr_enabled 플래그가 비활성화되어 있습니다."
      );
      return;
    }

    if (asrProvider === "web_speech" && !webSpeechSupported) {
      setRecordingError("로컬 ASR(Web Speech)을 지원하지 않아 수동 전사 입력으로 진행해 주세요.");
      return;
    }

    if (asrProvider === "wasm_local" && !wasmAsrSupported) {
      setRecordingError("WASM 로컬 ASR 런타임을 찾지 못했습니다. worker/runtime 설정을 확인해 주세요.");
      return;
    }

    if (asrProvider === "wasm_local") {
      const wasm = createWasmLocalAsr({
        lang: "ko",
        workerUrl: HANDOFF_FLAGS.handoffWasmAsrWorkerUrl,
        runtimeUrl: HANDOFF_FLAGS.handoffWasmAsrRuntimeUrl,
        modelUrl: HANDOFF_FLAGS.handoffWasmAsrModelUrl,
        onError: (cause) => {
          setRecordingError(`WASM ASR 오류: ${String(cause)}`);
        },
      });
      const wasmStarted = await wasm.start();
      if (!wasmStarted) {
        setRecordingError("WASM 로컬 ASR 초기화에 실패했습니다. runtime/model 경로를 확인해 주세요.");
        await wasm.destroy();
        return;
      }
      wasmAsrRef.current = wasm;
    }

    const recorder = createHandoffRecorder({
      chunkMs: 30_000,
      overlapMs: 800,
      onChunk:
        asrProvider === "wasm_local"
          ? handleWasmRecordedChunk
          : asrProvider === "web_speech"
            ? handleRecordedChunk
            : handleManualRecordedChunk,
      onError: (cause) => {
        setRecordingError(`녹음 오류: ${String(cause)}`);
      },
    });

    const started = await recorder.start();
    if (!started) {
      setRecordingError("마이크 권한 또는 녹음 초기화에 실패했습니다.");
      await wasmAsrRef.current?.stop();
      await wasmAsrRef.current?.destroy();
      wasmAsrRef.current = null;
      return;
    }

    recorderRef.current = recorder;
    setRecordingState("recording");

    if (asrProvider !== "web_speech") {
      return;
    }

    const asr = createLocalSpeechAsr({
      lang: "ko-KR",
      onFinalSegment: (segment) => {
        asrErrorCountRef.current = 0;
        liveSegmentSeqRef.current += 1;
        const raw: RawSegment = {
          segmentId: `${sessionId}-live-${String(liveSegmentSeqRef.current).padStart(3, "0")}`,
          rawText: segment.text,
          startMs: segment.startMs,
          endMs: Math.max(segment.endMs, segment.startMs + 250),
        };
        appendSegments([raw]);
        setLiveAsrPreview(segment.text);
        setSessionSaved(false);
      },
      onError: (cause) => {
        asrErrorCountRef.current += 1;
        const retryCount = asrErrorCountRef.current;
        setRecordingError(`ASR 오류(${retryCount}/2): ${String(cause)}`);
        if (retryCount >= 2 && retryCount % 2 === 0) {
          pushManualUncertainty(
            "로컬 ASR가 연속 실패해 수동 검수가 필요합니다.",
            "마이크/권한 상태를 확인하고 누락 구간을 수동 전사로 보완해 주세요."
          );
        }
      },
    });

    asrRef.current = asr;
    const asrStarted = asr.start();
    if (!asrStarted) {
      setRecordingError("ASR 시작 실패. 수동 전사 입력으로 진행해 주세요.");
    }
  };

  const stopRecording = async () => {
    if (recordingState === "idle") return;

    setRecordingState("stopping");
    asrRef.current?.stop();
    asrRef.current?.destroy();
    asrRef.current = null;
    await wasmAsrRef.current?.stop();
    await wasmAsrRef.current?.destroy();
    wasmAsrRef.current = null;

    await recorderRef.current?.stop();
    await recorderRef.current?.destroy();
    recorderRef.current = null;

    setRecordingState("idle");
  };

  const run = async () => {
    if (authBlocked) {
      setError("strict 정책으로 로그인 사용자만 분석을 실행할 수 있습니다.");
      return;
    }
    if (secureContextBlocked) {
      setError("strict 정책으로 HTTPS secure context에서만 분석을 허용합니다.");
      return;
    }

    const draftSegments = sortSegments(rawSegmentsRef.current);

    const mergedSegments = chunkInput.trim()
      ? sortSegments([
          ...draftSegments,
          ...transcriptToRawSegments(chunkInput.trim(), {
            idPrefix: `${sessionId}-manual-run-${draftSegments.length + 1}`,
            startOffsetMs: draftSegments.length ? draftSegments[draftSegments.length - 1].endMs : 0,
          }),
        ])
      : draftSegments;

    const runBudget = segmentBudgetOkay([], mergedSegments);
    if (!runBudget.ok) {
      setError(runBudget.reason);
      return;
    }

    if (!mergedSegments.length) {
      setError("분석할 전사 텍스트를 입력해 주세요.");
      return;
    }

    setRunning(true);
    setError(null);

    try {
      const output = runHandoffPipeline({
        sessionId,
        dutyType,
        rawSegments: mergedSegments,
        manualUncertainties,
      });
      const sanitized = sanitizeStructuredSession(output.result);
      setDeidIssueCount(sanitized.issues.length);
      setResidualIssueCount(sanitized.residualIssues.length);
      if (sanitized.residualIssues.length) {
        setError(
          `잔여 식별 패턴 ${sanitized.residualIssues.length}건이 남아 저장이 차단될 수 있습니다. 검수 메모에서 식별 텍스트를 제거해 주세요.`
        );
      }

      let stored = false;
      try {
        stored = await vaultSaveRawSegments(sessionId, mergedSegments);
      } catch {
        stored = false;
      }
      if (!stored) {
        setError("로컬 Vault 저장에 실패했습니다. 브라우저 보안 설정(저장소/프라이빗 모드)을 확인해 주세요.");
      }

      const nextReviewMap: Record<string, ReviewState> = {};
      sanitized.result.uncertainties.forEach((item) => {
        nextReviewMap[item.id] = { resolved: false, note: "" };
      });

      setReviewMap(nextReviewMap);
      setChunkInput("");
      setRawSegments(mergedSegments);
      setResult(sanitized.result);
      setShowAllUncertainties(false);
      setEvidenceMap(buildEvidenceMap(output.local.maskedSegments));
      setSessionSaved(false);
      appendHandoffAuditEvent({
        action: "pipeline_run",
        sessionId,
        detail: `segments=${mergedSegments.length}|uncertainties=${sanitized.result.uncertainties.length}`,
      });
      refreshStoredLists();
    } finally {
      setRunning(false);
    }
  };

  const finalizeSession = async () => {
    if (!result) return;
    if (authBlocked) {
      setError("strict 정책으로 로그인 사용자만 저장할 수 있습니다.");
      return;
    }
    if (secureContextBlocked) {
      setError("strict 정책으로 HTTPS secure context에서만 저장할 수 있습니다.");
      return;
    }

    setFinalizing(true);
    try {
      const reviewed = {
        ...result,
        uncertainties: result.uncertainties.map((item) => {
          const review = reviewMap[item.id];
          if (!review) return item;

          const flags: string[] = [];
          if (review.resolved) flags.push("검수완료");
          if (review.note.trim()) flags.push(`메모:${review.note.trim()}`);

          if (!flags.length) return item;
          return {
            ...item,
            reason: `${item.reason} | ${flags.join(" | ")}`,
          };
        }),
      };

      const sanitized = sanitizeStructuredSession(reviewed);
      const residual = detectResidualStructuredPhi(sanitized.result);
      if (residual.length) {
        setResidualIssueCount(residual.length);
        setError(`잔여 식별 패턴 ${residual.length}건이 감지되어 저장을 차단했습니다.`);
        return;
      }
      const saved = saveStructuredSession(sanitized.result);
      if (!saved) {
        setError("구조화 결과 저장에 실패했습니다. 브라우저 저장소 상태를 확인해 주세요.");
        return;
      }
      setResult(sanitized.result);
      setDeidIssueCount(sanitized.issues.length);
      setResidualIssueCount(0);
      setSessionSaved(true);
      appendHandoffAuditEvent({
        action: "session_saved",
        sessionId: sanitized.result.sessionId,
        detail: "reviewed=true",
      });
      refreshStoredLists();
    } finally {
      setFinalizing(false);
    }
  };

  const saveWithoutReview = () => {
    if (!result) return;
    if (authBlocked) {
      setError("strict 정책으로 로그인 사용자만 저장할 수 있습니다.");
      return;
    }
    if (secureContextBlocked) {
      setError("strict 정책으로 HTTPS secure context에서만 저장할 수 있습니다.");
      return;
    }
    const sanitized = sanitizeStructuredSession(result);
    const residual = detectResidualStructuredPhi(sanitized.result);
    if (residual.length) {
      setResidualIssueCount(residual.length);
      setError(`잔여 식별 패턴 ${residual.length}건이 감지되어 저장을 차단했습니다.`);
      return;
    }
    const saved = saveStructuredSession(sanitized.result);
    if (!saved) {
      setError("구조화 결과 저장에 실패했습니다. 브라우저 저장소 상태를 확인해 주세요.");
      return;
    }
    setResult(sanitized.result);
    setDeidIssueCount(sanitized.issues.length);
    setResidualIssueCount(0);
    appendHandoffAuditEvent({
      action: "session_saved",
      sessionId: sanitized.result.sessionId,
      detail: "reviewed=false",
    });
    refreshStoredLists();
    setSessionSaved(true);
  };

  const startNewSession = async () => {
    await stopRecording();
    clearHandoffDraftMeta(sessionId);
    setSessionId(createHandoffSessionId());
    liveSegmentSeqRef.current = 0;
    setChunkInput("");
    setRawSegments([]);
    setChunkLogs([]);
    setResult(null);
    setReviewMap({});
    setEvidenceMap({});
    setShowAllUncertainties(false);
    setLiveAsrPreview("");
    setError(null);
    setRecordingError(null);
    setSessionSaved(false);
    setManualUncertainties([]);
    setDraftRecoveredAt(null);
    setDeidIssueCount(0);
    setResidualIssueCount(0);
    chunkUncertaintyKeysRef.current.clear();
    asrErrorCountRef.current = 0;
  };

  const shredCurrentSession = async () => {
    await stopRecording();
    await vaultCryptoShredSession(sessionId);
    clearHandoffDraftMeta(sessionId);
    deleteStructuredSession(sessionId);
    appendHandoffAuditEvent({
      action: "session_shred",
      sessionId,
      detail: "single_session",
    });
    refreshStoredLists();

    if (result?.sessionId === sessionId) {
      setResult(null);
      setReviewMap({});
      setEvidenceMap({});
    }

    setRawSegments([]);
    setChunkLogs([]);
    setLiveAsrPreview("");
    setSessionSaved(false);
    setManualUncertainties([]);
    setDraftRecoveredAt(null);
    setDeidIssueCount(0);
    setResidualIssueCount(0);
    chunkUncertaintyKeysRef.current.clear();
    asrErrorCountRef.current = 0;
  };

  const purgeAllHandoffData = async () => {
    await stopRecording();
    const structuredDeleted = deleteAllStructuredSessions();
    const rawDeleted = await purgeAllVaultRecords();
    clearAllHandoffDraftMeta();
    const removedKeys = purgeHandoffLocalScope({ includeLegacy: true });

    appendHandoffAuditEvent({
      action: "all_data_purged",
      detail: `structured=${structuredDeleted}|raw=${rawDeleted}|keys=${removedKeys}`,
    });
    refreshStoredLists();

    setResult(null);
    setReviewMap({});
    setEvidenceMap({});
    setShowAllUncertainties(false);
    setRawSegments([]);
    setChunkLogs([]);
    setChunkInput("");
    setLiveAsrPreview("");
    setSessionId(createHandoffSessionId());
    setRecordingError(null);
    setSessionSaved(false);
    setManualUncertainties([]);
    setDraftRecoveredAt(null);
    setDeidIssueCount(0);
    setResidualIssueCount(0);
    setError(null);
    liveSegmentSeqRef.current = 0;
    chunkUncertaintyKeysRef.current.clear();
    asrErrorCountRef.current = 0;
  };

  const setReviewResolved = (id: string, resolved: boolean) => {
    setReviewMap((prev) => ({
      ...prev,
      [id]: {
        resolved,
        note: prev[id]?.note ?? "",
      },
    }));
    setSessionSaved(false);
  };

  const setReviewNote = (id: string, note: string) => {
    setReviewMap((prev) => ({
      ...prev,
      [id]: {
        resolved: prev[id]?.resolved ?? false,
        note,
      },
    }));
    setSessionSaved(false);
  };

  if (!HANDOFF_FLAGS.handoffEnabled) {
    return (
      <div className="mx-auto w-full max-w-[760px] px-4 pb-24 pt-6">
        <Card className="p-5">
          <div className="text-[16px] font-semibold text-ios-text">{t("AI 인계 기능이 비활성화되어 있습니다.")}</div>
          <div className="mt-2 text-[13px] text-ios-sub">NEXT_PUBLIC_HANDOFF_ENABLED=true 설정 후 다시 확인해 주세요.</div>
          <div className="mt-4">
            <Link href="/tools" className="text-[13px] font-semibold text-[color:var(--wnl-accent)]">
              ← Tool 목록으로
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  if (authPending) {
    return (
      <div className="mx-auto w-full max-w-[760px] px-4 pb-24 pt-6">
        <Card className="p-5">
          <div className="text-[16px] font-semibold text-ios-text">인증 상태 확인 중입니다.</div>
          <div className="mt-2 text-[13px] text-ios-sub">strict 정책 적용을 위해 로그인 상태를 검증하고 있습니다.</div>
        </Card>
      </div>
    );
  }

  if (authBlocked) {
    return (
      <div className="mx-auto w-full max-w-[760px] px-4 pb-24 pt-6">
        <Card className="p-5">
          <div className="text-[16px] font-semibold text-ios-text">로그인 후 접근 가능합니다.</div>
          <div className="mt-2 text-[13px] text-ios-sub">strict 정책으로 AI 인계 기능은 인증 사용자에게만 허용됩니다.</div>
          <div className="mt-4">
            <Link href="/settings" className="text-[13px] font-semibold text-[color:var(--wnl-accent)]">
              설정(로그인)으로 이동 →
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
          <div className="mt-2 text-[13px] text-ios-sub">
            strict 정책으로 AI 인계는 HTTPS secure context(개발 localhost 예외)에서만 허용됩니다.
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div data-testid="handoff-page-root" className="mx-auto w-full max-w-[860px] space-y-4 px-4 pb-24 pt-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[30px] font-extrabold tracking-[-0.02em]">{t("AI 인계")}</div>
          <div className="mt-1 text-[13px] text-ios-sub">
            {t("온디바이스 녹음/로컬 ASR/PHI 마스킹으로 인계를 환자별 카드로 구조화합니다.")}
          </div>
        </div>
        <Link href="/tools" className="pt-1 text-[12px] font-semibold text-[color:var(--wnl-accent)]">
          Tool 목록
        </Link>
      </div>

      <Card className="p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <div className="text-[12px] font-semibold text-ios-sub">Session ID</div>
            <Input value={sessionId} readOnly className="mt-1 bg-ios-bg" />
            <div className="mt-2 text-[11.5px] text-ios-sub">
              {segmentStats.count} segments · {segmentStats.sec}s
            </div>
          </div>

          <div>
            <div className="text-[12px] font-semibold text-ios-sub">Duty Type</div>
            <div className="mt-1">
              <Segmented
                value={dutyType}
                onValueChange={(next) => setDutyType(next as DutyType)}
                options={DUTY_OPTIONS}
              />
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-2">
          <Button
            data-testid="handoff-new-session"
            variant="secondary"
            className={flatButtonSecondary}
            onClick={() => { void startNewSession(); }}
          >
            {t("새 세션")}
          </Button>
          <Button
            data-testid="handoff-run-pipeline"
            className={flatButtonPrimary}
            onClick={run}
            disabled={running || recordingState !== "idle" || actionBlocked}
          >
            {running ? t("분석 중...") : t("분석 실행")}
          </Button>
        </div>

        <details className="mt-3 rounded-2xl border border-ios-sep bg-ios-bg px-4 py-3">
          <summary className="cursor-pointer text-[12.5px] font-semibold text-ios-sub">고급 데이터 관리</summary>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <Button
              data-testid="handoff-shred-session"
              variant="danger"
              className={flatButtonDanger}
              onClick={() => { void shredCurrentSession(); }}
              disabled={running || finalizing || recordingState !== "idle"}
            >
              세션 파기
            </Button>
            <Button
              variant="danger"
              className={flatButtonDanger}
              onClick={() => { void purgeAllHandoffData(); }}
              disabled={running || finalizing || recordingState !== "idle"}
            >
              전체 완전 파기
            </Button>
          </div>
        </details>

        <div className="mt-3 text-[12px] text-ios-sub">
          draft 상태: {draftSaveState}
          {draftRecoveredAt ? ` · 복구됨 ${formatTime(draftRecoveredAt)}` : ""}
        </div>
        {deidIssueCount > 0 ? (
          <div className="mt-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-[12.5px] text-amber-800">
            비식별 안전가드가 잠재 PHI {deidIssueCount}건을 자동 치환했습니다.
          </div>
        ) : null}
        {residualIssueCount > 0 ? (
          <div className="mt-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-[12.5px] text-red-800">
            저장 차단: 잔여 식별 패턴 {residualIssueCount}건이 감지되었습니다.
          </div>
        ) : null}
        {privacyPolicy.asrProviderDowngraded ? (
          <div className="mt-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-[12.5px] text-amber-800">
            개인정보 보호 정책으로 자동 전사 제공자가 조정되었습니다: {configuredAsrProvider} → {asrProvider}
          </div>
        ) : null}
      </Card>

      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[14px] font-semibold text-ios-text">{t("실시간 녹음 + 로컬 전사")}</div>
            <div className="mt-1 text-[12.5px] text-ios-sub">
              {t("로컬 전용 모드로 동작합니다. 자동 전사가 없으면 수동 입력과 함께 사용하세요.")}
            </div>
          </div>
          {recordingState === "recording" ? (
            <Button
              data-testid="handoff-stop-recording"
              variant="danger"
              className={flatButtonDanger}
              onClick={() => { void stopRecording(); }}
            >
              {t("녹음 중지")}
            </Button>
          ) : (
            <Button
              data-testid="handoff-start-recording"
              className={flatButtonPrimary}
              onClick={() => { void startRecording(); }}
              disabled={!canStartRecording}
            >
              {t("녹음 시작")}
            </Button>
          )}
        </div>

        <div className="mt-3 text-[12px] text-ios-sub">
          상태: <span className="font-semibold text-ios-text">{recordingState}</span>
          {liveAsrPreview ? <span> · 최신 전사: {liveAsrPreview}</span> : null}
          {chunkLogs.length ? <span> · 최근 chunk {chunkLogs.length}개</span> : null}
        </div>

        {asrProvider === "manual" ? (
          <div className="mt-2 rounded-2xl border border-ios-sep bg-ios-bg p-3 text-[12.5px] text-ios-sub">
            manual 모드: 자동 전사가 비활성화됩니다. 아래 수동 전사 입력을 사용하세요.
          </div>
        ) : null}

        {asrProvider === "web_speech" ? (
          <div className="mt-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-[12.5px] text-amber-800">
            web_speech는 브라우저 구현에 따라 외부 STT를 사용할 수 있습니다. hybrid_opt_in에서만 제한적으로 사용하세요.
          </div>
        ) : null}

        {asrProvider === "wasm_local" ? (
          <div className="mt-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-[12.5px] text-emerald-800">
            wasm_local은 온디바이스 런타임(worker/plugin)이 준비되어야 동작합니다. 모델/런타임 경로를 확인하세요.
          </div>
        ) : null}

        {recordingError ? (
          <div className="mt-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-[12.5px] font-semibold text-red-700">
            {recordingError}
          </div>
        ) : null}

        {manualUncertainties.length ? (
          <div className="mt-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-[12.5px] text-amber-800">
            ASR 실패 기반 검수 항목 {manualUncertainties.length}건이 자동 추가되었습니다.
          </div>
        ) : null}

        {chunkLogs.length ? (
          <div className="mt-3 rounded-2xl border border-ios-sep bg-ios-bg p-3 text-[12px] text-ios-sub">
            최근 녹음 {chunkLogs.length}개 조각이 수집되었습니다.
          </div>
        ) : null}
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[14px] font-semibold text-ios-text">{t("수동 전사 입력")}</div>
            <div className="mt-1 text-[12.5px] text-ios-sub">
              {t("ASR 미지원 환경에서는 전사를 직접 붙여넣어 동일 파이프라인으로 분석할 수 있습니다.")}
            </div>
          </div>
          <Button
            data-testid="handoff-add-chunk"
            variant="secondary"
            className={flatButtonSecondary}
            onClick={pushChunk}
            disabled={actionBlocked}
          >
            {t("청크 추가")}
          </Button>
        </div>

        <div className="mt-3">
          <Textarea
            data-testid="handoff-manual-input"
            value={chunkInput}
            onChange={(e) => setChunkInput(e.target.value)}
            placeholder="예: 701호 최OO 폐렴이고 ABx 10시에 들어갔고..."
            className="min-h-[160px]"
          />
        </div>

        {rawSegments.length ? (
          <div className="mt-3 rounded-2xl border border-ios-sep bg-white p-3">
            <div className="text-[12px] font-semibold text-ios-sub">{t("수집된 전사 세그먼트")}</div>
            <ul className="mt-2 space-y-1 text-[12.5px] text-ios-text">
              {rawSegments.slice(-8).map((segment) => (
                <li key={segment.segmentId}>
                  <span className="font-semibold text-ios-sub">{segment.segmentId}</span> · {formatEvidenceRange({ segmentId: segment.segmentId, startMs: segment.startMs, endMs: segment.endMs })} · {segment.rawText}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {error ? <div className="mt-3 text-[12.5px] font-semibold text-red-600">{error}</div> : null}
      </Card>

      {result ? (
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[15px] font-semibold text-ios-text">{t("10초 검수")}</div>
              <div className="mt-1 text-[12.5px] text-ios-sub">
                {result.uncertainties.length
                  ? `${t("미기재/애매 항목을 확인 후 저장해 주세요.")} (${unresolvedCount}/${result.uncertainties.length})`
                  : t("검수 항목이 없어 바로 저장할 수 있습니다.")}
              </div>
            </div>
            <div data-testid="handoff-review-timer" className="text-[12px] font-semibold text-ios-sub">timer: {reviewCountdown}s</div>
          </div>
          {reviewLockActive ? (
            <div className="mt-2 rounded-2xl border border-ios-sep bg-ios-bg p-3 text-[12px] text-ios-sub">
              10초 검수 창이 진행 중입니다. 저장 버튼은 타이머 종료 후 활성화됩니다.
            </div>
          ) : null}

          {result.uncertainties.length ? (
            <div className="mt-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                {uncertaintySummary.map((item) => (
                  <span key={item.kind} className="rounded-full border border-ios-sep bg-ios-bg px-2 py-1 text-[11px] font-semibold text-ios-sub">
                    {item.kind}: {item.count}
                  </span>
                ))}
              </div>
              {visibleUncertainties.map((item) => {
                const review = reviewMap[item.id] ?? { resolved: false, note: "" };
                return (
                  <div key={item.id} className="rounded-2xl border border-ios-sep bg-white p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-[12.5px] font-semibold text-ios-text">{item.kind}</div>
                      <label className="inline-flex items-center gap-1 text-[12px] text-ios-sub">
                        <input
                          type="checkbox"
                          checked={review.resolved}
                          onChange={(e) => setReviewResolved(item.id, e.target.checked)}
                        />
                        검수 완료
                      </label>
                    </div>
                    <div className="mt-1 text-[12px] text-ios-sub">{item.reason}</div>
                    <Input
                      value={review.note}
                      onChange={(e) => setReviewNote(item.id, e.target.value)}
                      placeholder="검수 메모 (선택)"
                      className="mt-2"
                    />
                  </div>
                );
              })}
              {result.uncertainties.length > 12 ? (
                <div className="pt-1">
                  <Button
                    variant="secondary"
                    className={flatButtonSecondary}
                    onClick={() => setShowAllUncertainties((prev) => !prev)}
                  >
                    {showAllUncertainties
                      ? "핵심 항목만 보기"
                      : `전체 보기 (+${result.uncertainties.length - visibleUncertainties.length}건)`}
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="mt-4 grid gap-2 md:grid-cols-2">
            <Button
              data-testid="handoff-save-reviewed"
              className={flatButtonPrimary}
              onClick={() => { void finalizeSession(); }}
              disabled={finalizing || running || reviewLockActive || actionBlocked}
            >
              {finalizing ? "저장 중..." : sessionSaved ? "검수 반영 저장 완료" : "검수 반영 저장"}
            </Button>
            <Button
              data-testid="handoff-save-without-review"
              variant="secondary"
              className={flatButtonSecondary}
              onClick={saveWithoutReview}
              disabled={finalizing || running || reviewLockActive || actionBlocked}
            >
              검수 생략 즉시 저장
            </Button>
          </div>
        </Card>
      ) : null}

      {savedSessions.length ? (
        <Card className="p-5">
          <div className="text-[14px] font-semibold text-ios-text">{t("저장된 세션")}</div>
          <div className="mt-2 space-y-2">
            {savedSessions.slice(0, 8).map((session) => (
              <div key={session.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ios-sep bg-white p-3">
                <div>
                  <div className="text-[12.5px] font-semibold text-ios-text">{session.id}</div>
                  <div className="text-[11.5px] text-ios-sub">{formatTime(session.createdAt)} · {session.result.dutyType}</div>
                </div>
                <Link
                  data-testid="handoff-saved-session-link"
                  href={`/tools/handoff/session/${session.id}`}
                  className="text-[12px] font-semibold text-[color:var(--wnl-accent)]"
                >
                  상세 보기
                </Link>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {result ? (
        <ResultSection
          result={result}
          evidenceEnabled={HANDOFF_FLAGS.handoffEvidenceEnabled}
          evidenceMap={evidenceMap}
        />
      ) : null}
    </div>
  );
}

export default ToolHandoffPage;
