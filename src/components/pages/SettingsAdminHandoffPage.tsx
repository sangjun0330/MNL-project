"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { signInWithProvider, useAuthState } from "@/lib/auth";
import { authHeaders } from "@/lib/billing/client";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { listHandoffAuditEvents, purgeExpiredHandoffAuditEvents, type HandoffAuditEvent } from "@/lib/handoff/auditLog";
import { isLocalSpeechAsrSupported } from "@/lib/handoff/asr";
import { HANDOFF_FLAGS } from "@/lib/handoff/featureFlags";
import { evaluateHandoffPrivacyPolicy } from "@/lib/handoff/privacyPolicy";
import { isHandoffRecorderSupported } from "@/lib/handoff/recorder";
import { getHandoffStorageScope } from "@/lib/handoff/storageScope";
import { isVaultKeyLoaded } from "@/lib/handoff/vault";
import { runHandoffWebDiagnostics, type HandoffDiagnosticReport } from "@/lib/handoff/webDiagnostics";
import { isWasmLocalAsrSupported } from "@/lib/handoff/wasmAsr";

function formatTime(value: number) {
  const d = new Date(value);
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yy}-${mm}-${dd} ${hh}:${min}`;
}

function parseAdminError(input: string | null) {
  const text = String(input ?? "");
  if (!text) return "관리자 권한 확인에 실패했습니다.";
  if (text.includes("login_required")) return "로그인이 필요합니다.";
  if (text.includes("admin_forbidden")) return "관리자 권한이 없는 계정입니다.";
  if (text.includes("billing_admin_not_configured")) return "관리자 권한 설정이 서버에 구성되지 않았습니다.";
  return text;
}

function diagnosticTone(status: "ok" | "warn" | "fail") {
  if (status === "ok") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "warn") return "border-amber-200 bg-amber-50 text-amber-800";
  return "border-red-200 bg-red-50 text-red-800";
}

function detectSecureStoreBackend(profile: string) {
  if (typeof window === "undefined") return "unknown";
  const plugin = (window as any)?.Capacitor?.Plugins?.HandoffSecureStore;
  const pluginReady =
    plugin &&
    typeof plugin.set === "function" &&
    typeof plugin.get === "function" &&
    typeof plugin.remove === "function";
  if (pluginReady) return "capacitor_secure_store";
  if (profile === "strict") return "memory_fallback";
  return "localstorage_fallback";
}

export function SettingsAdminHandoffPage() {
  const { status, user } = useAuthState();
  const [checkingAdmin, setCheckingAdmin] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<HandoffDiagnosticReport | null>(null);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [auditEvents, setAuditEvents] = useState<HandoffAuditEvent[]>([]);
  const [scopeName, setScopeName] = useState("anon");
  const [secureStoreBackend, setSecureStoreBackend] = useState("unknown");
  const [probeSessionId, setProbeSessionId] = useState("");
  const [vaultKeyLoaded, setVaultKeyLoaded] = useState<boolean | null>(null);

  const policy = useMemo(() => evaluateHandoffPrivacyPolicy(HANDOFF_FLAGS), []);
  const capability = useMemo(
    () => ({
      recorder: isHandoffRecorderSupported(),
      webSpeech: isLocalSpeechAsrSupported(),
      wasmLocal: isWasmLocalAsrSupported({
        workerUrl: HANDOFF_FLAGS.handoffWasmAsrWorkerUrl,
      }),
    }),
    []
  );

  const refreshDiagnostics = useCallback(async () => {
    setDiagnosticsLoading(true);
    try {
      const report = await runHandoffWebDiagnostics(HANDOFF_FLAGS);
      setDiagnostics(report);
    } finally {
      setDiagnosticsLoading(false);
    }
  }, []);

  const refreshAudit = useCallback(() => {
    purgeExpiredHandoffAuditEvents();
    setAuditEvents(listHandoffAuditEvents(80));
  }, []);

  useEffect(() => {
    let active = true;
    if (status !== "authenticated" || !user?.userId) {
      setIsAdmin(false);
      setAdminError(null);
      return () => {
        active = false;
      };
    }

    const verifyAdmin = async () => {
      setCheckingAdmin(true);
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
        setIsAdmin(allowed);
        if (!allowed) {
          setAdminError(parseAdminError(String(json?.error ?? "admin_forbidden")));
        }
      } catch (cause) {
        if (!active) return;
        setIsAdmin(false);
        setAdminError(parseAdminError(String(cause)));
      } finally {
        if (!active) return;
        setCheckingAdmin(false);
      }
    };

    void verifyAdmin();
    return () => {
      active = false;
    };
  }, [status, user?.userId]);

  useEffect(() => {
    if (!isAdmin) return;
    setScopeName(getHandoffStorageScope());
    setSecureStoreBackend(detectSecureStoreBackend(policy.profile));
    refreshAudit();
    void refreshDiagnostics();
  }, [isAdmin, policy.profile, refreshAudit, refreshDiagnostics]);

  useEffect(() => {
    const targetId = probeSessionId.trim();
    if (!targetId) {
      setVaultKeyLoaded(null);
      return;
    }
    setVaultKeyLoaded(isVaultKeyLoaded(targetId));
  }, [probeSessionId]);

  if (status !== "authenticated") {
    return (
      <div className="mx-auto w-full max-w-[860px] px-4 pb-24 pt-6">
        <div className="mb-4 flex items-center gap-2">
          <Link
            href="/settings/admin"
            className="wnl-btn-secondary inline-flex h-9 w-9 items-center justify-center text-[18px] text-ios-text"
          >
            ←
          </Link>
          <div className="text-[24px] font-extrabold tracking-[-0.02em] text-ios-text">AI 인계 관리자</div>
        </div>
        <div className="wnl-surface p-5">
          <div className="text-[16px] font-bold text-ios-text">로그인이 필요합니다</div>
          <p className="mt-2 text-[13px] text-ios-sub">관리자 진단 화면은 로그인 후 접근할 수 있습니다.</p>
          <button
            type="button"
            onClick={() => signInWithProvider("google")}
            className="wnl-btn-primary mt-4 px-4 py-2 text-[13px]"
          >
            Google로 로그인
          </button>
        </div>
      </div>
    );
  }

  if (checkingAdmin) {
    return (
      <div className="mx-auto w-full max-w-[860px] px-4 pb-24 pt-6">
        <div className="wnl-surface p-5 text-[13px] text-ios-sub">관리자 권한 확인 중입니다...</div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto w-full max-w-[860px] px-4 pb-24 pt-6">
        <div className="mb-4 flex items-center gap-2">
          <Link
            href="/settings/admin"
            className="wnl-btn-secondary inline-flex h-9 w-9 items-center justify-center text-[18px] text-ios-text"
          >
            ←
          </Link>
          <div className="text-[24px] font-extrabold tracking-[-0.02em] text-ios-text">AI 인계 관리자</div>
        </div>
        <div className="wnl-surface p-5">
          <div className="text-[16px] font-bold text-ios-text">접근 권한이 없습니다</div>
          <p className="mt-2 text-[13px] text-ios-sub">{adminError ?? "관리자 계정으로 다시 로그인해 주세요."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[860px] space-y-4 px-4 pb-24 pt-6">
      <div className="mb-1 flex items-center gap-2">
        <Link
          href="/settings/admin"
          className="wnl-btn-secondary inline-flex h-9 w-9 items-center justify-center text-[18px] text-ios-text"
        >
          ←
        </Link>
        <div>
          <div className="text-[24px] font-extrabold tracking-[-0.02em] text-ios-text">AI 인계 관리자</div>
          <div className="text-[12.5px] text-ios-sub">설정 상태, 진단, 보안 저장 상태, 로컬 감사 로그</div>
        </div>
      </div>

      <section className="wnl-surface p-5">
        <div className="text-[15px] font-bold text-ios-text">설정 상태</div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="wnl-sub-surface p-3 text-[12.5px] text-ios-text">handoff_enabled: {String(HANDOFF_FLAGS.handoffEnabled)}</div>
          <div className="wnl-sub-surface p-3 text-[12.5px] text-ios-text">execution_mode: {policy.executionMode}</div>
          <div className="wnl-sub-surface p-3 text-[12.5px] text-ios-text">privacy_profile: {policy.profile}</div>
          <div className="wnl-sub-surface p-3 text-[12.5px] text-ios-text">require_auth: {String(policy.authRequired)}</div>
          <div className="wnl-sub-surface p-3 text-[12.5px] text-ios-text">configured_asr_provider: {policy.configuredAsrProvider}</div>
          <div className="wnl-sub-surface p-3 text-[12.5px] text-ios-text">effective_asr_provider: {policy.effectiveAsrProvider}</div>
          <div className="wnl-sub-surface p-3 text-[12.5px] text-ios-text">remote_sync_configured: {String(policy.remoteSyncConfigured)}</div>
          <div className="wnl-sub-surface p-3 text-[12.5px] text-ios-text">remote_sync_effective: {String(policy.remoteSyncEffective)}</div>
          <div className="wnl-sub-surface p-3 text-[12.5px] text-ios-text">web_audio_capture_enabled: {String(HANDOFF_FLAGS.handoffWebAudioCaptureEnabled)}</div>
          <div className="wnl-sub-surface p-3 text-[12.5px] text-ios-text">local_asr_enabled: {String(HANDOFF_FLAGS.handoffLocalAsrEnabled)}</div>
          <div className="wnl-sub-surface p-3 text-[12.5px] text-ios-text">wasm_asr_enabled: {String(HANDOFF_FLAGS.handoffWasmAsrEnabled)}</div>
          <div className="wnl-sub-surface p-3 text-[12.5px] text-ios-text">evidence_enabled: {String(HANDOFF_FLAGS.handoffEvidenceEnabled)}</div>
          <div className="wnl-sub-surface p-3 text-[12.5px] text-ios-text">recorder_support: {String(capability.recorder)}</div>
          <div className="wnl-sub-surface p-3 text-[12.5px] text-ios-text">web_speech_support: {String(capability.webSpeech)}</div>
          <div className="wnl-sub-surface p-3 text-[12.5px] text-ios-text">wasm_local_support: {String(capability.wasmLocal)}</div>
        </div>
      </section>

      <section className="wnl-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[15px] font-bold text-ios-text">웹 환경 진단</div>
            <div className="text-[12.5px] text-ios-sub">
              {diagnostics?.checkedAt ? `최근 점검: ${formatTime(diagnostics.checkedAt)}` : "점검 전"}
            </div>
          </div>
          <Button variant="secondary" onClick={() => { void refreshDiagnostics(); }} disabled={diagnosticsLoading}>
            {diagnosticsLoading ? "점검 중..." : "다시 점검"}
          </Button>
        </div>
        {diagnostics ? (
          <div className="mt-3 space-y-2">
            {diagnostics.items.map((item) => (
              <div key={item.id} className={`rounded-2xl border p-3 ${diagnosticTone(item.status)}`}>
                <div className="text-[14px] font-semibold">{item.label}</div>
                <div className="mt-1 text-[12.5px]">{item.detail}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-3 rounded-2xl border border-ios-sep bg-ios-bg p-3 text-[12.5px] text-ios-sub">
            진단 결과가 없습니다. 다시 점검을 눌러 주세요.
          </div>
        )}
      </section>

      <section className="wnl-surface p-5">
        <div className="text-[15px] font-bold text-ios-text">보안/저장 상태</div>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-[13px] text-ios-sub">
          <li>Raw transcript/evidence: 로컬 암호화 Vault 저장(TTL 24h)</li>
          <li>Structured summary(de-identified): 로컬 저장(TTL 7d)</li>
          <li>Execution mode: {policy.executionMode}</li>
          <li>Privacy profile: {policy.profile}</li>
          <li>Auth required: {String(policy.authRequired)}</li>
          <li>Secure context required: {String(policy.secureContextRequired)}</li>
          <li>Secure context satisfied: {String(policy.secureContextSatisfied)}</li>
          <li>Storage scope: {scopeName}</li>
          <li>Key store backend: {secureStoreBackend}</li>
          <li>Remote sync configured: {String(policy.remoteSyncConfigured)}</li>
          <li>Remote sync effective: {String(policy.remoteSyncEffective)}</li>
          <li>Server transmission: {policy.networkEgressAllowed ? "enabled (hybrid_opt_in)" : "disabled (local_only)"}</li>
        </ul>

        <div className="mt-4 rounded-2xl border border-ios-sep bg-ios-bg p-3">
          <div className="text-[12px] font-semibold text-ios-sub">세션 키 로드 상태 확인</div>
          <Input
            value={probeSessionId}
            onChange={(event) => setProbeSessionId(event.target.value)}
            placeholder="세션 ID 입력"
            className="mt-2 bg-white"
          />
          <div className="mt-2 text-[12.5px] text-ios-sub">
            결과: {probeSessionId.trim() ? String(vaultKeyLoaded) : "세션 ID를 입력하세요"}
          </div>
        </div>
      </section>

      <section className="wnl-surface p-5">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-[15px] font-bold text-ios-text">로컬 감사 로그</div>
            <div className="text-[12.5px] text-ios-sub">정책차단/저장/파기 이벤트(비식별 메타데이터)</div>
          </div>
          <Button variant="secondary" onClick={refreshAudit}>새로고침</Button>
        </div>
        {auditEvents.length ? (
          <div className="mt-3 space-y-2">
            {auditEvents.map((event) => (
              <div key={event.id} className="wnl-sub-surface p-3">
                <div className="text-[13px] font-semibold text-ios-text">{event.action}</div>
                <div className="mt-1 text-[12px] text-ios-sub">{formatTime(event.at)}</div>
                <div className="mt-1 text-[12.5px] text-ios-sub">
                  {event.sessionId ? `session:${event.sessionId}` : "session:none"}
                  {event.detail ? ` | ${event.detail}` : ""}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-3 rounded-2xl border border-ios-sep bg-ios-bg p-3 text-[12.5px] text-ios-sub">
            기록된 감사 이벤트가 없습니다.
          </div>
        )}
      </section>
    </div>
  );
}

export default SettingsAdminHandoffPage;
