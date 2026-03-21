import type { MedSafetyIntent, MedSafetySubjectFocus } from "@/lib/server/medSafetyTypes";

export type IntentScoreMap = Record<MedSafetyIntent, number>;

export type MedSafetyQuestionSignals = {
  intentScores: IntentScoreMap;
  intentFamiliesMatched: number;
  mixedIntent: boolean;
  asksSelection: boolean;
  asksDefinition: boolean;
  asksInterpretation: boolean;
  asksThreshold: boolean;
  asksImmediateAction: boolean;
  asksBedsideRecheck: boolean;
  asksFalseWorseningSweep: boolean;
  asksReportScript: boolean;
  asksTrendReview: boolean;
  asksExceptionBoundary: boolean;
  mentionsCompatibility: boolean;
  mentionsSetting: boolean;
  mentionsAlarm: boolean;
  mentionsLineOrTube: boolean;
  mentionsProcedure: boolean;
  mentionsMedication: boolean;
  mentionsPatientState: boolean;
  mentionsLabOrNumeric: boolean;
  mentionsVentilation: boolean;
  mentionsOxygenation: boolean;
  mentionsABGA: boolean;
  mentionsPreNotification: boolean;
  mentionsSuddenDeterioration: boolean;
  mentionsMeasurementError: boolean;
  mentionsReportNeed: boolean;
  mentionsPairedVentOxyProblem: boolean;
  mentionsNumericActionMix: boolean;
  subjectFocus: MedSafetySubjectFocus;
};

const COMPARE_PATTERNS = [/차이/i, /구분/i, /\bvs\b/i, /뭐가\s*달라/i, /헷갈/i, /어떤\s*걸\s*써/i];
const NUMERIC_PATTERNS = [/정상\s*범위/i, /정상범위/i, /수치/i, /해석/i, /계산/i, /몇이\s*정상/i, /\bp\/f\b/i];
const DEVICE_PATTERNS = [/펌프/i, /라인/i, /카테터/i, /알람/i, /세팅/i, /모니터/i, /튜브/i, /회로/i, /\bpcv\b/i, /\bpeep\b/i];
const ACTION_PATTERNS = [/어떻게/i, /대응/i, /조치/i, /절차/i, /중단/i, /보고/i, /확인해야/i, /해야\s*해/i, /먼저/i, /우선/i];
const SELECTION_PATTERNS = [/어떤\s*걸\s*써/i, /선택/i, /추천/i, /뭐가\s*나아/i, /우선/i];
const DEFINITION_PATTERNS = [/무엇/i, /뭐예/i, /설명/i, /알려/i, /정의/i];
const INTERPRET_PATTERNS = [/해석/i, /의미/i, /시사/i, /왜/i];
const THRESHOLD_PATTERNS = [/언제/i, /기준/i, /threshold/i, /보고\s*기준/i, /호출\s*기준/i, /노티/i];
const IMMEDIATE_ACTION_PATTERNS = [/지금\s*할\s*일/i, /바로\s*할/i, /즉시/i, /우선/i, /먼저/i];
const HIGH_RISK_PATTERNS = [
  /용량/i,
  /속도/i,
  /희석/i,
  /경로/i,
  /호환성/i,
  /세팅값/i,
  /쇼크/i,
  /의식\s*저하/i,
  /저산소/i,
  /산증/i,
  /출혈/i,
  /기흉/i,
  /line\s*mix-?up/i,
  /line\s*disconnection/i,
  /extravasation/i,
  /아나필락시스/i,
];
const COMPATIBILITY_PATTERNS = [/호환성/i, /compatible/i, /incompat/i, /같이\s*들어/i, /섞/i, /y-?site/i];
const SETTING_PATTERNS = [/세팅/i, /설정/i, /rate/i, /flow/i, /rr\b/i, /fio2/i, /peep/i, /pi\b/i, /pressure/i];
const ALARM_PATTERNS = [/알람/i, /\balarm\b/i, /occlusion/i, /air-?in-?line/i, /high pressure/i];
const LINE_TUBE_PATTERNS = [/라인/i, /튜브/i, /카테터/i, /drain/i, /ett/i, /cuff/i, /circuit/i, /picc/i, /c-?line/i];
const PROCEDURE_PATTERNS = [/절차/i, /순서/i, /flush/i, /clamp/i, /교체/i, /드레싱/i, /삽입/i, /제거/i, /흡인/i];
const MEDICATION_PATTERNS = [/약물?/i, /주입/i, /투여/i, /희석/i, /amp/i, /vial/i, /수액/i, /항생제/i, /진정제/i, /진통제/i];
const PATIENT_STATE_PATTERNS = [/통증/i, /발열/i, /혈압/i, /맥박/i, /심박/i, /호흡/i, /의식/i, /spo2/i, /산소포화/i, /agitation/i, /sedation/i];
const LAB_PATTERNS = [/\babga\b/i, /\bph\b/i, /\bpco2\b/i, /\bpo2\b/i, /pao2/i, /paco2/i, /검사/i, /수치/i, /lab/i];
const VENTILATION_PATTERNS = [/\bvent\b/i, /ventilator/i, /환기/i, /\brr\b/i, /\bpcv\b/i, /\bvt\b/i, /\bvte\b/i, /\bpi\b/i];
const OXYGENATION_PATTERNS = [/산소화/i, /저산소/i, /hypox/i, /p\/f/i, /\bfio2\b/i, /\bpeep\b/i, /\bspo2\b/i, /\bpao2\b/i];
const ABGA_PATTERNS = [/\babga\b/i, /\bph\b/i, /\bpco2\b/i, /\bpo2\b/i, /pao2/i, /paco2/i];
const PRE_NOTIFICATION_PATTERNS = [/노티\s*전/i, /보고\s*전/i, /호출\s*전/i, /주치의/i];
const REPORT_SCRIPT_PATTERNS = [/보고\s*문장/i, /노티\s*포인트/i, /뭐라고\s*말/i, /sbar/i, /보고\s*예시/i];
const BEDSIDE_RECHECK_PATTERNS = [/지금\s*확인/i, /bedside/i, /다시\s*보/i, /재확인/i, /waveform/i];
const FALSE_WORSENING_PATTERNS = [/가짜\s*악화/i, /채혈\s*오류/i, /artifact/i, /측정\s*오류/i, /sampling error/i];
const SUDDEN_DETERIORATION_PATTERNS = [/갑자기/i, /급격히/i, /방금/i, /막\s*나온/i, /악화/i, /sudden/i];
const MEASUREMENT_ERROR_PATTERNS = [/채혈\s*오류/i, /동맥\s*채혈/i, /sampling/i, /measurement/i, /직전\s*suction/i, /체위\s*변화/i];
const TREND_PATTERNS = [/추이/i, /비교/i, /이전/i, /trend/i, /갑자기\s*악화/i];
const EXCEPTION_PATTERNS = [/예외/i, /반대로/i, /언제는/i, /다만/i, /하지만/i, /조건부/i];
const GENERIC_ENTITY_PATTERNS = [/이\s*약/i, /이\s*기구/i, /이거/i, /이게/i, /이\s*수치/i, /이\s*검사/i, /이\s*라인/i];
const GENERIC_HEAD_NOUN_PATTERNS = [/약물?/i, /기구/i, /장비/i, /튜브/i, /라인/i, /펌프/i, /수액/i, /검사/i, /수치/i];
const AMBIGUOUS_SHORT_ENTITY_PATTERNS = [/^[a-z0-9가-힣/+.-]{2,8}$/i];
const RISK_ESCALATION_PATTERNS = [/즉시/i, /바로/i, /호출/i, /보고/i, /중단/i, /clamp/i, /산소/i, /분리/i];

export const FILLER_PATTERNS = [/꾸준한\s*관리/i, /신경\s*쓰/i, /활용해\s*보/i, /상황에\s*맞게/i, /필요시/i, /일반적으로/i];

export function normalizeText(value: unknown) {
  return String(value ?? "")
    .replace(/\r/g, "")
    .replace(/\u0000/g, "")
    .trim();
}

export function normalizeQuery(value: string) {
  return normalizeText(value)
    .toLowerCase()
    .normalize("NFKC");
}

export function countPatternHits(text: string, patterns: RegExp[]) {
  return patterns.reduce((count, pattern) => count + (pattern.test(text) ? 1 : 0), 0);
}

export function includesGenericEntity(text: string) {
  return GENERIC_ENTITY_PATTERNS.some((pattern) => pattern.test(text));
}

export function includesGenericHeadNoun(text: string) {
  return GENERIC_HEAD_NOUN_PATTERNS.some((pattern) => pattern.test(text));
}

export function isAmbiguousShortEntity(text: string) {
  return AMBIGUOUS_SHORT_ENTITY_PATTERNS.some((pattern) => pattern.test(text.replace(/\s+/g, "")));
}

export function hasEscalationLanguage(text: string) {
  return RISK_ESCALATION_PATTERNS.some((pattern) => pattern.test(text));
}

function inferIntentScores(query: string): IntentScoreMap {
  return {
    compare: countPatternHits(query, COMPARE_PATTERNS),
    numeric: countPatternHits(query, NUMERIC_PATTERNS),
    device: countPatternHits(query, DEVICE_PATTERNS),
    action: countPatternHits(query, ACTION_PATTERNS),
    knowledge: 0,
  };
}

export function pickTopIntent(scores: IntentScoreMap) {
  const ordered = (Object.keys(scores) as MedSafetyIntent[]).sort((a, b) => scores[b] - scores[a]);
  const top = ordered[0] ?? "knowledge";
  const second = ordered[1] ?? "knowledge";
  return {
    top,
    second,
    topScore: scores[top],
    secondScore: scores[second],
    isAmbiguous: scores[top] > 0 && scores[top] === scores[second],
  };
}

export function buildQuestionSignals(query: string): MedSafetyQuestionSignals {
  const intentScores = inferIntentScores(query);
  const intentFamiliesMatched = (Object.values(intentScores) as number[]).filter((score) => score > 0).length;
  const mentionsCompatibility = countPatternHits(query, COMPATIBILITY_PATTERNS) > 0;
  const mentionsSetting = countPatternHits(query, SETTING_PATTERNS) > 0;
  const mentionsAlarm = countPatternHits(query, ALARM_PATTERNS) > 0;
  const mentionsLineOrTube = countPatternHits(query, LINE_TUBE_PATTERNS) > 0;
  const mentionsProcedure = countPatternHits(query, PROCEDURE_PATTERNS) > 0;
  const mentionsMedication = countPatternHits(query, MEDICATION_PATTERNS) > 0;
  const mentionsPatientState = countPatternHits(query, PATIENT_STATE_PATTERNS) > 0;
  const mentionsLabOrNumeric = countPatternHits(query, LAB_PATTERNS) > 0 || intentScores.numeric > 0;
  const mentionsVentilation = countPatternHits(query, VENTILATION_PATTERNS) > 0;
  const mentionsOxygenation = countPatternHits(query, OXYGENATION_PATTERNS) > 0;
  const mentionsABGA = countPatternHits(query, ABGA_PATTERNS) > 0;
  const mentionsPreNotification = countPatternHits(query, PRE_NOTIFICATION_PATTERNS) > 0;
  const asksReportScript = countPatternHits(query, REPORT_SCRIPT_PATTERNS) > 0;
  const asksBedsideRecheck = countPatternHits(query, BEDSIDE_RECHECK_PATTERNS) > 0;
  const asksFalseWorseningSweep = countPatternHits(query, FALSE_WORSENING_PATTERNS) > 0;
  const mentionsSuddenDeterioration = countPatternHits(query, SUDDEN_DETERIORATION_PATTERNS) > 0;
  const mentionsMeasurementError = countPatternHits(query, MEASUREMENT_ERROR_PATTERNS) > 0;
  const asksTrendReview = countPatternHits(query, TREND_PATTERNS) > 0;
  const asksExceptionBoundary = countPatternHits(query, EXCEPTION_PATTERNS) > 0;
  const mentionsReportNeed = mentionsPreNotification || asksReportScript || /보고|호출|노티|주치의/i.test(query);
  const mentionsPairedVentOxyProblem = (mentionsVentilation || mentionsABGA) && mentionsOxygenation;
  const mentionsNumericActionMix =
    (intentScores.numeric > 0 || mentionsABGA || mentionsLabOrNumeric) && (intentScores.action > 0 || mentionsPreNotification);

  const subjectFocus: MedSafetySubjectFocus =
    mentionsMedication || mentionsCompatibility
      ? "medication"
      : mentionsAlarm || mentionsLineOrTube || intentScores.device > 0
        ? "device"
        : mentionsLabOrNumeric
          ? "lab"
          : mentionsProcedure
            ? "procedure"
            : mentionsPatientState || mentionsVentilation || mentionsOxygenation
              ? "patient_state"
              : "general";

  return {
    intentScores,
    intentFamiliesMatched,
    mixedIntent: intentFamiliesMatched >= 2,
    asksSelection: countPatternHits(query, SELECTION_PATTERNS) > 0 || intentScores.compare > 0,
    asksDefinition: countPatternHits(query, DEFINITION_PATTERNS) > 0,
    asksInterpretation: countPatternHits(query, INTERPRET_PATTERNS) > 0 || intentScores.numeric > 0,
    asksThreshold: countPatternHits(query, THRESHOLD_PATTERNS) > 0,
    asksImmediateAction: countPatternHits(query, IMMEDIATE_ACTION_PATTERNS) > 0 || intentScores.action > 0,
    asksBedsideRecheck,
    asksFalseWorseningSweep,
    asksReportScript,
    asksTrendReview,
    asksExceptionBoundary,
    mentionsCompatibility,
    mentionsSetting,
    mentionsAlarm,
    mentionsLineOrTube,
    mentionsProcedure,
    mentionsMedication,
    mentionsPatientState,
    mentionsLabOrNumeric,
    mentionsVentilation,
    mentionsOxygenation,
    mentionsABGA,
    mentionsPreNotification,
    mentionsSuddenDeterioration,
    mentionsMeasurementError,
    mentionsReportNeed,
    mentionsPairedVentOxyProblem,
    mentionsNumericActionMix,
    subjectFocus,
  };
}

export function countHighRiskHits(query: string) {
  return countPatternHits(query, HIGH_RISK_PATTERNS);
}
