"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Textarea } from "@/components/ui/Textarea";

const FLAT_CARD_CLASS = "border-[color:var(--wnl-accent-border)] bg-white shadow-none";
const PRIMARY_FLAT_BTN =
  "h-11 rounded-2xl border border-[color:var(--wnl-accent)] bg-[color:var(--wnl-accent)] px-5 text-[13px] font-semibold text-white shadow-none hover:bg-[color:var(--wnl-accent)]";
const SECONDARY_FLAT_BTN =
  "h-11 rounded-2xl border border-[color:var(--wnl-accent-border)] bg-white px-4 text-[13px] font-semibold text-[color:var(--wnl-accent)] shadow-none hover:bg-[color:var(--wnl-accent-soft)]";
const SEGMENT_WRAPPER_CLASS = "inline-flex rounded-2xl border border-ios-sep bg-ios-bg p-1";

const RECENT_QUERY_KEY = "wnl_med_safety_recent_queries_v1";
const DEFAULT_QUICK_QUERIES = [
  "인슐린 투여 직전 체크",
  "헤파린 출혈 위험 확인",
  "반코마이신 주입 속도/모니터링",
  "IV 펌프 알람 즉시 대응",
  "중심정맥관 감염 의심 대응",
  "인공호흡기 알람 원인/조치",
] as const;

type ClinicalMode = "ward" | "er" | "icu";
type ClinicalSituation = "pre_admin" | "during_admin" | "alarm" | "adverse_suspect" | "general";

type MedSafetyItemType = "medication" | "device" | "unknown";
type MedSafetyQuickStatus = "OK" | "CHECK" | "STOP";
type ResultTab = "quick" | "do" | "safety";

type MedSafetyAnalyzeResult = {
  item: {
    name: string;
    type: MedSafetyItemType;
    aliases: string[];
    highRiskBadges: string[];
    primaryUse: string;
    confidence: number;
  };
  quick: {
    status: MedSafetyQuickStatus;
    topActions: string[];
    topNumbers: string[];
    topRisks: string[];
  };
  do: {
    steps: string[];
    calculatorsNeeded: string[];
    compatibilityChecks: string[];
  };
  safety: {
    holdRules: string[];
    monitor: string[];
    escalateWhen: string[];
  };
  patientScript20s: string;
  modePriority: string[];
  confidenceNote: string;
  model: string;
  analyzedAt: number;
  source: string;
};

const MODE_OPTIONS: Array<{ value: ClinicalMode; label: string }> = [
  { value: "ward", label: "병동" },
  { value: "er", label: "ER" },
  { value: "icu", label: "ICU" },
];

const SITUATION_OPTIONS: Array<{ value: ClinicalSituation; label: string }> = [
  { value: "pre_admin", label: "투여 직전" },
  { value: "during_admin", label: "투여 중" },
  { value: "alarm", label: "알람 발생" },
  { value: "adverse_suspect", label: "부작용 의심" },
  { value: "general", label: "일반 조회" },
];

function parseErrorMessage(raw: string) {
  if (!raw) return "분석 중 오류가 발생했습니다.";
  if (raw.includes("missing_openai_api_key")) return "OPENAI_API_KEY가 설정되지 않았습니다.";
  if (raw.includes("query_or_image_required")) return "텍스트를 입력하거나 사진을 업로드해 주세요.";
  if (raw.includes("image_too_large")) return "이미지 용량이 너무 큽니다. 6MB 이하로 다시 업로드해 주세요.";
  if (raw.includes("image_type_invalid")) return "이미지 파일만 업로드할 수 있습니다.";
  if (raw.includes("openai_responses_")) return "OpenAI 요청이 실패했습니다. 잠시 후 다시 시도해 주세요.";
  if (raw.includes("openai_invalid_json_payload")) return "AI 응답 형식 파싱에 실패했습니다. 다시 시도해 주세요.";
  return raw;
}

function parseCameraStartError(cause: unknown) {
  const name = String((cause as any)?.name ?? "");
  const message = String((cause as any)?.message ?? "");
  const merged = `${name} ${message}`.toLowerCase();
  if (merged.includes("notallowed")) return "카메라 권한이 거부되었습니다. 브라우저 권한을 허용해 주세요.";
  if (merged.includes("notfound") || merged.includes("devicesnotfound")) return "사용 가능한 카메라를 찾을 수 없습니다.";
  if (merged.includes("notreadable") || merged.includes("trackstart")) return "카메라가 다른 앱에서 사용 중입니다. 다른 앱을 종료 후 다시 시도해 주세요.";
  if (merged.includes("securecontext") || merged.includes("https")) return "카메라는 HTTPS 또는 localhost에서만 사용할 수 있습니다.";
  return "카메라를 시작하지 못했습니다. 권한/브라우저 환경을 확인해 주세요.";
}

function itemTypeLabel(itemType: MedSafetyItemType) {
  if (itemType === "medication") return "약물";
  if (itemType === "device") return "의료기구";
  return "미확정";
}

function statusLabel(status: MedSafetyQuickStatus) {
  if (status === "OK") return "OK 실행 가능";
  if (status === "STOP") return "STOP 즉시 중단/보고";
  return "CHECK 확인 필요";
}

function statusTone(status: MedSafetyQuickStatus) {
  if (status === "OK") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "STOP") return "border-red-200 bg-red-50 text-red-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

function tabLabel(tab: ResultTab) {
  if (tab === "quick") return "빠르게";
  if (tab === "do") return "실행";
  return "안전";
}

function modeLabel(mode: ClinicalMode) {
  if (mode === "ward") return "병동";
  if (mode === "er") return "ER";
  return "ICU";
}

function situationLabel(situation: ClinicalSituation) {
  const hit = SITUATION_OPTIONS.find((option) => option.value === situation);
  return hit?.label ?? "일반 조회";
}

function formatDateTime(value: number) {
  const d = new Date(value);
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yy}-${mm}-${dd} ${hh}:${min}`;
}

function sanitizeRecentQueries(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? "").replace(/\s+/g, " ").trim())
    .filter((item) => item.length >= 2)
    .slice(0, 8);
}

function dedupeText(items: string[]) {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const item of items) {
    const clean = item.trim();
    if (!clean) continue;
    if (seen.has(clean)) continue;
    seen.add(clean);
    output.push(clean);
  }
  return output;
}

function SectionList({ title, items }: { title: string; items: string[] }) {
  if (!items.length) {
    return (
      <div>
        <div className="text-[13px] font-semibold text-ios-text">{title}</div>
        <div className="mt-1 text-[12.5px] text-ios-sub">정보 없음</div>
      </div>
    );
  }

  return (
    <div>
      <div className="text-[13px] font-semibold text-ios-text">{title}</div>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-[12.5px] text-ios-sub">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export function ToolMedSafetyPage() {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<ClinicalMode>("ward");
  const [situation, setSituation] = useState<ClinicalSituation>("pre_admin");
  const [patientSummary, setPatientSummary] = useState("");
  const [result, setResult] = useState<MedSafetyAnalyzeResult | null>(null);
  const [resultTab, setResultTab] = useState<ResultTab>("quick");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const [recentQueries, setRecentQueries] = useState<string[]>([]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const suggestedQueries = useMemo(() => {
    return dedupeText([...recentQueries.slice(0, 4), ...DEFAULT_QUICK_QUERIES]).slice(0, 8);
  }, [recentQueries]);

  const stopCamera = useCallback(() => {
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraOpen(false);
    setCameraStarting(false);
  }, []);

  useEffect(() => {
    try {
      if (typeof window === "undefined") return;
      const raw = window.localStorage.getItem(RECENT_QUERY_KEY);
      if (!raw) return;
      setRecentQueries(sanitizeRecentQueries(JSON.parse(raw)));
    } catch {
      // ignore parse/storage failures
    }
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      stopCamera();
    };
  }, [previewUrl, stopCamera]);

  useEffect(() => {
    if (!cameraOpen) return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    if (video.srcObject !== stream) {
      video.srcObject = stream;
      void video.play().catch(() => {
        // autoplay policy differences across browsers
      });
    }
  }, [cameraOpen]);

  const storeRecentQueries = useCallback((queries: string[]) => {
    setRecentQueries(queries);
    try {
      if (typeof window === "undefined") return;
      window.localStorage.setItem(RECENT_QUERY_KEY, JSON.stringify(queries));
    } catch {
      // ignore storage failures
    }
  }, []);

  const pushRecentQuery = useCallback(
    (value: string) => {
      const clean = value.replace(/\s+/g, " ").trim();
      if (!clean) return;
      const merged = dedupeText([clean, ...recentQueries]).slice(0, 8);
      storeRecentQueries(merged);
    },
    [recentQueries, storeRecentQueries]
  );

  const onImagePicked = useCallback(
    (file: File) => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setImageFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setError(null);
      setCameraError(null);
    },
    [previewUrl]
  );

  const clearImage = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setImageFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [previewUrl]);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    setCameraStarting(true);

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setCameraStarting(false);
      setCameraError("이 브라우저는 실시간 카메라를 지원하지 않습니다.");
      return;
    }

    try {
      stopCamera();

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });

      streamRef.current = stream;
      setCameraOpen(true);

      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => {
          // autoplay constraints may block on some browsers
        });
      }
    } catch (cause) {
      setCameraError(parseCameraStartError(cause));
    } finally {
      setCameraStarting(false);
    }
  }, [stopCamera]);

  const captureFromCamera = useCallback(async () => {
    const video = videoRef.current;
    if (!video) {
      setCameraError("카메라 화면을 찾지 못했습니다.");
      return;
    }

    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) {
      setCameraError("카메라 영상이 아직 준비되지 않았습니다. 잠시 후 다시 촬영해 주세요.");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setCameraError("이미지 캡처를 처리할 수 없습니다.");
      return;
    }
    ctx.drawImage(video, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.92);
    });

    if (!blob) {
      setCameraError("캡처 이미지 생성에 실패했습니다.");
      return;
    }

    const file = new File([blob], `camera-${Date.now()}.jpg`, { type: "image/jpeg" });
    onImagePicked(file);
    stopCamera();
  }, [onImagePicked, stopCamera]);

  const runAnalyze = useCallback(
    async (forcedQuery?: string) => {
      const normalized = (forcedQuery ?? query).replace(/\s+/g, " ").trim();
      if (!normalized && !imageFile) {
        setError("텍스트를 입력하거나 사진을 업로드해 주세요.");
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const form = new FormData();
        if (normalized) form.set("query", normalized);
        if (patientSummary.trim()) form.set("patientSummary", patientSummary.trim());
        form.set("mode", mode);
        form.set("situation", situation);
        form.set("locale", "ko");
        if (imageFile) form.set("image", imageFile);

        const response = await fetch("/api/tools/med-safety/analyze", {
          method: "POST",
          body: form,
          cache: "no-store",
        });

        const payload = (await response.json().catch(() => null)) as
          | { ok: true; data: MedSafetyAnalyzeResult }
          | { ok: false; error?: string }
          | null;

        if (!response.ok || !payload?.ok) {
          setResult(null);
          setError(parseErrorMessage(String((payload as any)?.error ?? "med_safety_analyze_failed")));
          return;
        }

        setResult(payload.data);
        setResultTab("quick");
        if (forcedQuery) setQuery(forcedQuery);
        if (normalized) pushRecentQuery(normalized);
      } catch {
        setResult(null);
        setError("네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
      } finally {
        setIsLoading(false);
      }
    },
    [imageFile, mode, patientSummary, pushRecentQuery, query, situation]
  );

  return (
    <div className="mx-auto w-full max-w-[920px] space-y-4 px-4 pb-24 pt-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[31px] font-extrabold tracking-[-0.02em] text-ios-text">AI 약물·도구 검색기</div>
          <div className="mt-1 text-[13px] text-ios-sub">30초 안에 지금 해야 할 행동을 먼저 보여주고, 이어서 실행/안전 절차를 안내합니다.</div>
        </div>
        <Link href="/tools" className="pt-1 text-[12px] font-semibold text-[color:var(--wnl-accent)]">
          Tool 목록
        </Link>
      </div>

      <Card className={`p-5 ${FLAT_CARD_CLASS}`}>
        <div className="space-y-4">
          <div className="space-y-2">
            <div className="text-[13px] font-semibold text-ios-text">근무 모드</div>
            <div className={SEGMENT_WRAPPER_CLASS}>
              {MODE_OPTIONS.map((option) => {
                const active = mode === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`h-9 rounded-xl px-4 text-[12.5px] font-semibold ${
                      active ? "bg-[color:var(--wnl-accent)] text-white" : "text-ios-sub"
                    }`}
                    onClick={() => setMode(option.value)}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-[13px] font-semibold text-ios-text">현재 상황</div>
            <div className="flex flex-wrap gap-2">
              {SITUATION_OPTIONS.map((option) => {
                const active = situation === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`h-9 rounded-xl border px-3 text-[12px] font-semibold ${
                      active
                        ? "border-[color:var(--wnl-accent)] bg-[color:var(--wnl-accent-soft)] text-[color:var(--wnl-accent)]"
                        : "border-ios-sep bg-white text-ios-sub"
                    }`}
                    onClick={() => setSituation(option.value)}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          <Textarea
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="min-h-[110px] bg-white"
            placeholder="약물명/도구명/상황을 입력하세요. 예: 인슐린 투여 직전 혈당 78일 때 즉시 투여 가능한가요?"
          />

          <Textarea
            value={patientSummary}
            onChange={(event) => setPatientSummary(event.target.value)}
            className="min-h-[84px] bg-white"
            placeholder="(선택) 환자 요약: 활력징후, 신장/간 기능, 알레르기, 임신/수유, 라인 상태"
          />

          <div className="flex flex-wrap gap-2">
            {suggestedQueries.slice(0, 6).map((keyword) => (
              <button
                key={keyword}
                type="button"
                className="rounded-full border border-ios-sep px-3 py-1 text-[12px] font-semibold text-ios-sub hover:border-[color:var(--wnl-accent-border)] hover:text-[color:var(--wnl-accent)]"
                onClick={() => {
                  setQuery(keyword);
                  void runAnalyze(keyword);
                }}
              >
                {keyword}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                onImagePicked(file);
              }}
            />
            <Button variant="secondary" className={SECONDARY_FLAT_BTN} onClick={() => fileInputRef.current?.click()}>
              사진 업로드
            </Button>
            <Button variant="secondary" className={SECONDARY_FLAT_BTN} onClick={() => void startCamera()} disabled={cameraStarting}>
              {cameraStarting ? "카메라 연결 중..." : "실시간 카메라"}
            </Button>
            {imageFile ? (
              <Button variant="secondary" className={SECONDARY_FLAT_BTN} onClick={clearImage}>
                이미지 제거
              </Button>
            ) : null}
            <Button variant="secondary" className={PRIMARY_FLAT_BTN} onClick={() => void runAnalyze()} disabled={isLoading}>
              {isLoading ? "AI 분석 중..." : "AI 분석 실행"}
            </Button>
          </div>

          {cameraOpen ? (
            <div className="space-y-2 rounded-2xl border border-ios-sep p-2">
              <div className="overflow-hidden rounded-xl border border-ios-sep bg-black">
                <video ref={videoRef} className="h-auto w-full object-cover" autoPlay playsInline muted />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" className={PRIMARY_FLAT_BTN} onClick={() => void captureFromCamera()}>
                  현재 화면 촬영
                </Button>
                <Button variant="secondary" className={SECONDARY_FLAT_BTN} onClick={stopCamera}>
                  카메라 닫기
                </Button>
              </div>
            </div>
          ) : null}

          {previewUrl ? (
            <div className="overflow-hidden rounded-2xl border border-ios-sep p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previewUrl} alt="업로드 이미지 미리보기" className="max-h-[220px] w-full rounded-xl object-contain" />
              {imageFile ? <div className="mt-2 text-[12px] text-ios-sub">{imageFile.name}</div> : null}
            </div>
          ) : null}

          {cameraError ? <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-[12.5px] text-amber-700">{cameraError}</div> : null}
          {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-[12.5px] text-red-700">{error}</div> : null}
        </div>
      </Card>

      <Card className={`p-5 ${FLAT_CARD_CLASS}`}>
        {!result ? (
          <div className="py-1">
            <div className="text-[16px] font-semibold text-ios-text">결과 대기</div>
            <div className="mt-1 text-[13px] text-ios-sub">입력 후 AI 분석 실행을 누르면 `빠르게 / 실행 / 안전` 순서로 결과가 표시됩니다.</div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full border px-3 py-1 text-[12px] font-semibold ${statusTone(result.quick.status)}`}>{statusLabel(result.quick.status)}</span>
                <span className="rounded-full border border-ios-sep px-3 py-1 text-[12px] font-semibold text-ios-sub">{itemTypeLabel(result.item.type)}</span>
                <span className="rounded-full border border-ios-sep px-3 py-1 text-[12px] font-semibold text-ios-sub">신뢰도 {result.item.confidence}%</span>
              </div>
              <div className="mt-2 text-[18px] font-bold text-ios-text">{result.item.name}</div>
              <div className="mt-1 text-[13px] text-ios-sub">{result.item.primaryUse}</div>
              <div className="mt-1 text-[12px] text-ios-sub">
                모드: {modeLabel(mode)} · 상황: {situationLabel(situation)} · 분석: {formatDateTime(result.analyzedAt)}
              </div>
            </div>

            <div className="space-y-2 border-t border-ios-sep pt-4">
              <div className="text-[12px] font-semibold text-ios-text">30초 핵심 행동</div>
              <ul className="list-disc space-y-1 pl-5 text-[13px] text-ios-text">
                {result.quick.topActions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>

            <div className={SEGMENT_WRAPPER_CLASS}>
              {(["quick", "do", "safety"] as const).map((tab) => {
                const active = resultTab === tab;
                return (
                  <button
                    key={tab}
                    type="button"
                    className={`h-9 rounded-xl px-4 text-[12.5px] font-semibold ${
                      active ? "bg-[color:var(--wnl-accent)] text-white" : "text-ios-sub"
                    }`}
                    onClick={() => setResultTab(tab)}
                  >
                    {tabLabel(tab)}
                  </button>
                );
              })}
            </div>

            <div className="space-y-4 border-t border-ios-sep pt-4">
              {resultTab === "quick" ? (
                <div className="space-y-3">
                  <SectionList title="핵심 수치/조건" items={result.quick.topNumbers} />
                  <SectionList title="핵심 위험" items={result.quick.topRisks} />
                </div>
              ) : null}

              {resultTab === "do" ? (
                <div className="space-y-3">
                  <SectionList title="실행 단계" items={result.do.steps} />
                  <SectionList title="계산/보조 필요" items={result.do.calculatorsNeeded} />
                  <SectionList title="라인/호환 점검" items={result.do.compatibilityChecks} />
                </div>
              ) : null}

              {resultTab === "safety" ? (
                <div className="space-y-3">
                  <SectionList title="홀드/중단 기준" items={result.safety.holdRules} />
                  <SectionList title="모니터링" items={result.safety.monitor} />
                  <SectionList title="즉시 보고 기준" items={result.safety.escalateWhen} />
                </div>
              ) : null}
            </div>

            <div className="border-t border-ios-sep pt-4">
              <div className="text-[12px] font-semibold text-ios-text">환자 설명 20초 스크립트</div>
              <div className="mt-1 text-[12.5px] text-ios-sub">{result.patientScript20s}</div>

              {result.item.highRiskBadges.length ? (
                <div className="mt-3">
                  <div className="text-[12px] font-semibold text-ios-text">고위험 포인트</div>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {result.item.highRiskBadges.map((item) => (
                      <span key={item} className="rounded-full border border-ios-sep px-3 py-1 text-[11px] font-semibold text-ios-sub">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {result.modePriority.length ? (
                <div className="mt-3">
                  <div className="text-[12px] font-semibold text-ios-text">모드 우선순위</div>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {result.modePriority.map((item) => (
                      <span key={item} className="rounded-full border border-ios-sep px-3 py-1 text-[11px] font-semibold text-ios-sub">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}

              {result.confidenceNote ? <div className="mt-3 text-[12px] text-ios-sub">검증 메모: {result.confidenceNote}</div> : null}
            </div>
          </div>
        )}

        <div className="mt-4 border-t border-ios-sep pt-3 text-[12px] text-ios-sub">
          개인 보조용 결과입니다. 최종 판단은 병원 지침/처방/의료진 지시를 우선하세요.
        </div>
      </Card>
    </div>
  );
}

export default ToolMedSafetyPage;
