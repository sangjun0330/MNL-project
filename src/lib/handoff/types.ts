export type IsoTs = string;
export type DutyType = "day" | "evening" | "night";

export type EvidenceRef = {
  segmentId: string;
  startMs: number;
  endMs: number;
};

export type AudioChunk = {
  id: string;
  startedAt: IsoTs;
  endedAt: IsoTs;
  mime: "audio/webm" | "audio/mp4" | "audio/wav";
  blob: Blob;
  pcm?: Float32Array;
  vad?: { speechRatio: number; segments: Array<{ s: number; e: number }> };
};

export type TranscriptSegment = {
  chunkId: string;
  t0: number;
  t1: number;
  text: string;
  confidence?: number;
};

export type TranscriptBuffer = {
  segments: TranscriptSegment[];
  rawText: string;
  normalizedText: string;
};

export type RawSegment = {
  segmentId: string;
  rawText: string;
  startMs: number;
  endMs: number;
};

export type UncertaintyKind =
  | "missing_time"
  | "missing_value"
  | "confusable_abbreviation"
  | "ambiguous_patient"
  | "unresolved_abbreviation"
  | "manual_review";

export type SegmentUncertainty = {
  kind: UncertaintyKind;
  reason: string;
};

export type NormalizedSegment = {
  segmentId: string;
  normalizedText: string;
  startMs: number;
  endMs: number;
  uncertainties: SegmentUncertainty[];
};

export type PhiType =
  | "PHONE"
  | "RRN"
  | "MRN"
  | "ADDRESS"
  | "NAME"
  | "DOB"
  | "BED"
  | "ROOM"
  | "ID_LIKE"
  | "CUSTOM"
  | "LONG_DIGITS"
  | "ROOM_NAME"
  | "NAME_HINT";

export type PhiFinding = {
  type: PhiType;
  start: number;
  end: number;
  sample: string;
  severity: "low" | "med" | "high";
};

export type AliasMap = Record<string, string>;

export type MaskResult = {
  maskedText: string;
  findings: PhiFinding[];
  aliasMap: AliasMap;
  residualFindings: PhiFinding[];
  safeToPersist: boolean;
  exportAllowed: boolean;
};

export type MaskedSegment = {
  segmentId: string;
  maskedText: string;
  startMs: number;
  endMs: number;
  uncertainties: SegmentUncertainty[];
  patientAlias: string | null;
  phiHits: string[];
  findings: PhiFinding[];
  residualFindings: PhiFinding[];
  evidenceRef: EvidenceRef;
};

export type WardEventCategory =
  | "discharge"
  | "admission"
  | "round"
  | "equipment"
  | "complaint"
  | "general";

export type WardEvent = {
  id: string;
  category: WardEventCategory;
  text: string;
  evidenceRef: EvidenceRef;
};

export type Unit = "mmHg" | "bpm" | "C" | "%" | "mg" | "mcg" | "mEq" | "units" | "mL" | "L/min";

export type ClinicalEntity =
  | { kind: "VITAL"; name: "BP" | "HR" | "RR" | "SpO2" | "Temp"; value: number; unit: Unit; trend?: "up" | "down" | "stable" }
  | { kind: "MED"; name: string; route?: string; rate?: string; isHighRisk?: boolean }
  | { kind: "LINE"; name: "PIV" | "CVC" | "A-line" | "Foley" | "NG" | "ETT" | "Drain"; details?: string }
  | { kind: "LAB"; name: string; value?: string; flag?: "high" | "low" | "critical" }
  | { kind: "ALARM"; name: string; context?: string }
  | { kind: "DX"; name: string }
  | { kind: "PLAN"; text: string };

export type RiskCode =
  | "AIRWAY"
  | "BREATHING"
  | "CIRCULATION"
  | "BLEEDING"
  | "SEPSIS"
  | "ARRHYTHMIA"
  | "HIGH_ALERT_MED"
  | "DEVICE_FAILURE"
  | "NEURO_CHANGE"
  | "ALLERGY_REACTION"
  | "TRANSFUSION_REACTION"
  | "ELECTROLYTE_CRITICAL"
  | "GLUCOSE_CRITICAL"
  | "FALL_RISK"
  | "PRESSURE_INJURY";

export type RiskItem = {
  code: RiskCode;
  score: number;
  rationale: string;
  actions: string[];
  evidenceRef?: EvidenceRef;
};

export type TodoPriority = "P0" | "P1" | "P2";
export type TodoDue = "now" | "within_1h" | "today" | "next_shift";

export type TodoItem = {
  priority: TodoPriority;
  task: string;
  due?: TodoDue;
  owner?: "RN" | "MD" | "RT" | "LAB";
  evidenceRef?: EvidenceRef;
};

export type HandoffRiskLevel = "high" | "medium" | "low";

export type PatientTopItem = {
  id: string;
  text: string;
  score: number;
  badge: string;
  evidenceRef: EvidenceRef;
};

export type PatientTodo = {
  id: string;
  text: string;
  dueHint: string | null;
  level: HandoffRiskLevel;
  evidenceRef: EvidenceRef;
};

export type PatientProblem = {
  id: string;
  text: string;
  evidenceRef: EvidenceRef;
};

export type PatientRisk = {
  id: string;
  label: string;
  level: HandoffRiskLevel;
  evidenceRef: EvidenceRef;
};

export type PatientCard = {
  patientKey: string;
  summary1: string;
  problems: string[];
  currentStatus: string[];
  meds: string[];
  lines: string[];
  labs: string[];
  plan: TodoItem[];
  risks: RiskItem[];
  watchFor: string[];
  questions: string[];
  entities: ClinicalEntity[];
  alias: string;
  topItems: PatientTopItem[];
  todos: PatientTodo[];
  problemItems: PatientProblem[];
  riskItems: PatientRisk[];
};

export type GlobalTop3Item = {
  text: string;
  score: number;
  patientKey?: string;
  evidenceRef?: EvidenceRef;
};

export type GlobalTopItem = {
  id: string;
  alias: string;
  text: string;
  badge: string;
  score: number;
  evidenceRef: EvidenceRef;
};

export type UncertaintyItem = {
  id: string;
  kind: UncertaintyKind;
  reason: string;
  text: string;
  evidenceRef: EvidenceRef;
};

export type HandoffSafetyState = {
  phiSafe: boolean;
  residualCount: number;
  exportAllowed: boolean;
  persistAllowed: boolean;
};

export type HandoffProvenance = {
  stt: { engine: "whisper_wasm"; model: string; chunkSeconds: number };
  rulesetVersion: string;
  llmRefined: boolean;
};

export type HandoffOutput = {
  createdAt: IsoTs;
  mode: "local_only";
  globalTop3: GlobalTop3Item[];
  patients: PatientCard[];
  uncertainties: string[];
  safety: HandoffSafetyState;
  provenance: HandoffProvenance;
};

export type HandoverSessionResult = HandoffOutput & {
  sessionId: string;
  dutyType: DutyType;
  createdAtMs: number;
  globalTop: GlobalTopItem[];
  wardEvents: WardEvent[];
  uncertaintyItems: UncertaintyItem[];
};

export type HandoffPipelineOutput = {
  result: HandoverSessionResult;
  local: {
    maskedSegments: MaskedSegment[];
    aliasMap: AliasMap;
    mask: MaskResult;
  };
};

export type HandoffAsrProvider = "manual" | "web_speech" | "wasm_local";
export type HandoffPrivacyProfile = "strict" | "standard";
export type HandoffExecutionMode = "local_only" | "hybrid_opt_in";
export type HandoffWasmAsrEngine = "worker_runtime" | "transformers_whisper";
export type HandoffWasmAsrDevice = "auto" | "webgpu" | "wasm";

export type HandoffFeatureFlags = {
  handoffEnabled: boolean;
  handoffLocalAsrEnabled: boolean;
  handoffEvidenceEnabled: boolean;
  handoffExecutionMode: HandoffExecutionMode;
  handoffRemoteSyncEnabled: boolean;
  handoffAsrProvider: HandoffAsrProvider;
  handoffWebAudioCaptureEnabled: boolean;
  handoffWasmAsrEnabled: boolean;
  handoffWasmAsrWorkerUrl: string;
  handoffWasmAsrModelUrl: string;
  handoffWasmAsrRuntimeUrl: string;
  handoffWasmAsrEngine: HandoffWasmAsrEngine;
  handoffWasmAsrModelId: string;
  handoffWasmAsrDevice: HandoffWasmAsrDevice;
  handoffWasmAsrDType: string;
  handoffVadEnabled: boolean;
  handoffVadMinSpeechRatio: number;
  handoffVadMinSegmentMs: number;
  handoffVadThreshold: number;
  handoffWebLlmRefineEnabled: boolean;
  handoffWebLlmUseMlc: boolean;
  handoffWebLlmModelId: string;
  handoffPrivacyProfile: HandoffPrivacyProfile;
  handoffRequireAuth: boolean;
};

export function createHandoffSessionId() {
  const rand = Math.random().toString(36).slice(2, 8);
  return `hs_${Date.now().toString(36)}_${rand}`;
}
