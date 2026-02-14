export type DutyType = "day" | "evening" | "night";

export type EvidenceRef = {
  segmentId: string;
  startMs: number;
  endMs: number;
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

export type MaskedSegment = {
  segmentId: string;
  maskedText: string;
  startMs: number;
  endMs: number;
  uncertainties: SegmentUncertainty[];
  patientAlias: string | null;
  phiHits: string[];
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
  alias: string;
  topItems: PatientTopItem[];
  todos: PatientTodo[];
  problems: PatientProblem[];
  risks: PatientRisk[];
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

export type HandoverSessionResult = {
  sessionId: string;
  dutyType: DutyType;
  createdAt: number;
  globalTop: GlobalTopItem[];
  wardEvents: WardEvent[];
  patients: PatientCard[];
  uncertainties: UncertaintyItem[];
};

export type HandoffPipelineOutput = {
  result: HandoverSessionResult;
  local: {
    maskedSegments: MaskedSegment[];
    aliasMap: Record<string, string>;
  };
};

export type HandoffAsrProvider = "manual" | "web_speech" | "wasm_local";
export type HandoffPrivacyProfile = "strict" | "standard";
export type HandoffExecutionMode = "local_only" | "hybrid_opt_in";

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
  handoffPrivacyProfile: HandoffPrivacyProfile;
  handoffRequireAuth: boolean;
};

export function createHandoffSessionId() {
  const rand = Math.random().toString(36).slice(2, 8);
  return `hs_${Date.now().toString(36)}_${rand}`;
}
