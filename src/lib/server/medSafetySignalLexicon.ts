import type { MedSafetyEvidenceSignals, MedSafetyIntent } from "@/lib/server/medSafetyTypes";

export type IntentScoreMap = Record<MedSafetyIntent, number>;
export type MedSafetyQuestionSignals = MedSafetyEvidenceSignals;

const COMPARE_PATTERNS = [/차이/i, /구분/i, /\bvs\b/i, /헷갈/i, /어떤\s*걸/i];
const NUMERIC_PATTERNS = [/정상\s*범위/i, /수치/i, /해석/i, /계산/i, /\bp\/f\b/i, /\babga\b/i];
const DEVICE_PATTERNS = [/펌프/i, /라인/i, /카테터/i, /튜브/i, /회로/i, /알람/i, /\biabp\b/i, /\bpcv\b/i, /\bpeep\b/i];
const ACTION_PATTERNS = [/어떻게/i, /대응/i, /조치/i, /먼저/i, /우선/i, /지금\s*할/i, /바로/i, /중단/i, /확인/i];
const SELECTION_PATTERNS = [/선택/i, /추천/i, /무엇을\s*먼저/i, /뭐가\s*낫/i];
const INTERPRET_PATTERNS = [/해석/i, /의미/i, /시사/i, /왜/i];
const THRESHOLD_PATTERNS = [/언제/i, /기준/i, /threshold/i, /보고\s*기준/i, /호출\s*기준/i, /노티/i];
const TREND_PATTERNS = [/추이/i, /비교/i, /이전/i, /trend/i, /악화\s*추세/i];
const SCRIPT_PATTERNS = [/보고\s*문장/i, /노티\s*문장/i, /뭐라고\s*말/i, /sbar/i, /예시/i];
const COMPATIBILITY_PATTERNS = [/호환성/i, /compatible/i, /incompat/i, /섞/i, /y-?site/i];
const SETTING_PATTERNS = [/세팅/i, /설정/i, /\brr\b/i, /\bpeep\b/i, /\bfio2\b/i, /\bpi\b/i, /trigger/i, /mode/i, /rate/i];
const LINE_TUBE_PATTERNS = [/라인/i, /튜브/i, /ett/i, /cuff/i, /circuit/i, /drain/i, /catheter/i, /루멘/i];
const MEDICATION_PATTERNS = [/약물?/i, /주입/i, /투여/i, /희석/i, /amp/i, /vial/i, /수액/i, /항생제/i];
const PATIENT_STATE_PATTERNS = [/혈압/i, /맥박/i, /spo2/i, /의식/i, /호흡/i, /발열/i, /통증/i, /shock/i, /저산소/i, /비동기/i];
const VENTILATION_PATTERNS = [/\bvent\b/i, /환기/i, /\brr\b/i, /\bvt\b/i, /\bvte\b/i, /\bpcv\b/i, /\bpi\b/i, /minute ventilation/i];
const ABGA_PATTERNS = [/\babga\b/i, /\bph\b/i, /\bpco2\b/i, /\bpo2\b/i, /pao2/i, /paco2/i];
const OXYGENATION_PATTERNS = [/산소화/i, /저산소/i, /hypox/i, /\bfio2\b/i, /\bpeep\b/i, /\bspo2\b/i, /\bpao2\b/i, /\bp\/f\b/i];
const ALARM_PATTERNS = [/알람/i, /\balarm\b/i, /occlusion/i, /air-?in-?line/i, /high pressure/i];
const PRE_NOTIFICATION_PATTERNS = [/노티\s*전/i, /보고\s*전/i, /주치의/i, /호출\s*전/i, /전달/i];
const BEDSIDE_SWEEP_PATTERNS = [/지금\s*확인/i, /bedside/i, /재확인/i, /waveform/i, /tube/i, /circuit/i, /직접\s*보/i];
const FALSE_WORSENING_PATTERNS = [/가짜\s*악화/i, /채혈\s*오류/i, /artifact/i, /sampling/i, /직전\s*suction/i, /체위\s*변화/i];
const HIGH_RISK_PATTERNS = [
  /저산소/i,
  /쇼크/i,
  /출혈/i,
  /기흉/i,
  /아나필락시스/i,
  /extravasation/i,
  /line\s*mix-?up/i,
  /호환성/i,
  /세팅값/i,
  /용량/i,
  /속도/i,
  /의식\s*저하/i,
];
const SUDDEN_PATTERNS = [/갑자기/i, /급격히/i, /방금/i, /지속되/i, /sudden/i];
const GENERIC_ENTITY_PATTERNS = [/이\s*약/i, /이\s*기구/i, /이거/i, /이게/i, /이\s*수치/i, /이\s*라인/i];
const GENERIC_HEAD_NOUN_PATTERNS = [/약물?/i, /기구/i, /장비/i, /튜브/i, /라인/i, /펌프/i, /수치/i, /검사/i];
const AMBIGUOUS_SHORT_ENTITY_PATTERNS = [/^[a-z0-9가-힣/+.-]{2,8}$/i];
const RISK_ESCALATION_PATTERNS = [/즉시/i, /바로/i, /호출/i, /보고/i, /중단/i, /clamp/i, /산소/i, /분리/i];

export const FILLER_PATTERNS = [/상황에\s*따라/i, /일반적으로/i, /필요시/i, /추가로\s*고려/i, /도움이\s*될\s*수/i];

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
  const intentFamiliesMatched = Object.values(intentScores).filter((score) => score > 0).length;
  const mentionsVentilation = countPatternHits(query, VENTILATION_PATTERNS) > 0;
  const mentionsABGA = countPatternHits(query, ABGA_PATTERNS) > 0;
  const mentionsOxygenation = countPatternHits(query, OXYGENATION_PATTERNS) > 0;
  const mentionsMedication = countPatternHits(query, MEDICATION_PATTERNS) > 0;
  const mentionsLineOrTube = countPatternHits(query, LINE_TUBE_PATTERNS) > 0;
  const mentionsCompatibility = countPatternHits(query, COMPATIBILITY_PATTERNS) > 0;
  const mentionsSetting = countPatternHits(query, SETTING_PATTERNS) > 0;
  const mentionsPatientState = countPatternHits(query, PATIENT_STATE_PATTERNS) > 0;
  const mentionsAlarm = countPatternHits(query, ALARM_PATTERNS) > 0;
  const preNotification = countPatternHits(query, PRE_NOTIFICATION_PATTERNS) > 0;
  const wantsScript = countPatternHits(query, SCRIPT_PATTERNS) > 0;
  const asksThreshold = countPatternHits(query, THRESHOLD_PATTERNS) > 0;
  const asksInterpretation = countPatternHits(query, INTERPRET_PATTERNS) > 0 || intentScores.numeric > 0;
  const asksImmediateAction = countPatternHits(query, ACTION_PATTERNS) > 0;
  const asksTrendReview = countPatternHits(query, TREND_PATTERNS) > 0;
  const bedsideSweep = countPatternHits(query, BEDSIDE_SWEEP_PATTERNS) > 0;
  const falseWorseningRisk = countPatternHits(query, FALSE_WORSENING_PATTERNS) > 0;
  const hasHighRiskMarker = countPatternHits(query, HIGH_RISK_PATTERNS) > 0;
  const hasSuddenMarker = countPatternHits(query, SUDDEN_PATTERNS) > 0;
  const mixedNumericAction =
    (intentScores.numeric > 0 || mentionsABGA) && (intentScores.action > 0 || preNotification || asksImmediateAction);
  const pairedProblem = (mentionsVentilation || mentionsABGA) && mentionsOxygenation;

  return {
    intentScores,
    intentFamiliesMatched,
    mixedIntent: intentFamiliesMatched >= 2,
    asksSelection: countPatternHits(query, SELECTION_PATTERNS) > 0 || intentScores.compare > 0,
    asksInterpretation,
    asksThreshold,
    asksImmediateAction,
    asksTrendReview,
    needsEntityDisambiguation: includesGenericEntity(query) || isAmbiguousShortEntity(query),
    preNotification,
    bedsideSweep,
    falseWorseningRisk,
    pairedProblem,
    mixedNumericAction,
    mentionsVentilation,
    mentionsABGA,
    mentionsOxygenation,
    mentionsMedication,
    mentionsLineOrTube,
    mentionsCompatibility,
    mentionsSetting,
    mentionsPatientState,
    mentionsAlarm,
    hasSuddenMarker,
    hasHighRiskMarker,
    wantsScript,
    subjectFocus:
      mentionsMedication || mentionsCompatibility
        ? "medication"
        : mentionsLineOrTube || mentionsAlarm || intentScores.device > 0
          ? "device"
          : mentionsABGA || mentionsOxygenation
            ? "lab"
            : mentionsPatientState || mentionsVentilation
              ? "patient_state"
              : "general",
  };
}

export function countHighRiskHits(query: string) {
  return countPatternHits(query, HIGH_RISK_PATTERNS);
}
