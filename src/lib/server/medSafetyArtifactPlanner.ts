import type {
  MedSafetyInternalDecision,
  MedSafetyMicroPackId,
  MedSafetyPackPlan,
  MedSafetyPromptBlueprint,
  MedSafetyPromptPackId,
  MedSafetyPromptProjection,
  MedSafetyProjectionDirectiveKey,
} from "@/lib/server/medSafetyTypes";
import type { MedSafetyQuestionSignals } from "@/lib/server/medSafetySignalLexicon";

const PBW_PATTERNS = [/\bpbw\b/i, /predicted body weight/i, /예상\s*체중/i];

function uniqueStrings(items: string[]) {
  return Array.from(new Set(items.filter(Boolean)));
}

function uniquePacks(items: MedSafetyPromptPackId[]) {
  return Array.from(new Set(items));
}

function inferOpeningMode(decision: MedSafetyInternalDecision) {
  if (decision.priorityMode === "notify_first" || decision.priorityMode === "action_first" || decision.priorityMode === "safety_first") {
    return "action_first" as const;
  }
  if (decision.intent === "compare") return "compare_first" as const;
  if (decision.intent === "numeric") return "numeric_first" as const;
  return "direct" as const;
}

function buildMicroPackScores(decision: MedSafetyInternalDecision, signals: MedSafetyQuestionSignals) {
  const clinicalRiskWeight = decision.risk === "high" ? 4 : decision.risk === "medium" ? 2 : 1;
  const actionabilityWeight =
    decision.priorityMode === "action_first" || decision.priorityMode === "notify_first" || decision.priorityMode === "safety_first" ? 3 : 1;
  const reportingWeight = decision.reportingNeed ? (decision.communicationProfile === "script" ? 4 : 3) : 0;
  const exceptionWeight = decision.exceptionProfile === "full" ? 4 : decision.exceptionProfile === "light" ? 2 : 0;
  const ambiguityWeight = decision.entityClarity === "low" ? 3 : decision.entityClarity === "medium" ? 2 : 0;
  const pairedProblemWeight = decision.pairedProblemNeed ? 4 : 0;
  const lengthPenalty = decision.compressionTarget === "tight" ? 2 : decision.compressionTarget === "compressed_detailed" ? 1 : 0;

  const scores: Partial<Record<MedSafetyMicroPackId, number>> = {
    direct_core: 100,
    severity_frame:
      clinicalRiskWeight * 2 +
      (decision.intent === "numeric" || decision.intent === "compare" ? 2 : 0) +
      (decision.pairedProblemNeed ? 2 : 0) -
      1,
    bedside_check:
      actionabilityWeight * 2 +
      (decision.detailProfile === "bedside" || decision.detailProfile === "paired" ? 4 : 0) +
      (signals.bedsideSweep ? 2 : 0) -
      lengthPenalty,
    reversible_cause:
      (decision.reversibleCauseNeed ? 7 : 0) +
      (signals.mentionsAlarm || signals.mentionsLineOrTube || signals.mentionsVentilation ? 2 : 0) -
      lengthPenalty,
    false_worsening:
      (decision.falseWorseningNeed ? 7 : 0) +
      (signals.falseWorseningRisk || signals.hasSuddenMarker ? 2 : 0) -
      lengthPenalty,
    exception_boundary:
      exceptionWeight * 2 +
      (decision.intent === "compare" ? 2 : 0) +
      (signals.mixedNumericAction ? 2 : 0) -
      lengthPenalty,
    measurement_guard:
      (decision.measurementGuardNeed ? 6 : 0) +
      ambiguityWeight +
      (signals.mentionsABGA || signals.mentionsSetting ? 2 : 0) -
      lengthPenalty,
    notify_payload:
      reportingWeight * 2 +
      (decision.workflowStage === "pre_notification" ? 2 : 0) -
      lengthPenalty,
    notify_script:
      (decision.communicationProfile === "script" ? 8 : 0) +
      (decision.priorityMode === "notify_first" ? 2 : 0) -
      lengthPenalty,
    paired_problem_split:
      pairedProblemWeight * 2 +
      (decision.detailProfile === "paired" ? 2 : 0) -
      lengthPenalty,
  };

  return scores;
}

function selectMicroPacks(scores: Partial<Record<MedSafetyMicroPackId, number>>, decision: MedSafetyInternalDecision) {
  const ranked = (Object.entries(scores) as Array<[MedSafetyMicroPackId, number]>)
    .sort((a, b) => b[1] - a[1])
    .filter(([, score]) => score > 0);
  const maxSelected = decision.answerDepth === "short" ? 3 : decision.answerDepth === "detailed" ? 5 : 4;
  const selectedMicroPacks = ranked.slice(0, maxSelected).map(([pack]) => pack);
  const deferredMicroPacks = ranked.slice(maxSelected).map(([pack]) => pack);
  return { selectedMicroPacks, deferredMicroPacks };
}

function mapMicroToVisiblePacks(microPacks: MedSafetyMicroPackId[]) {
  const visible: MedSafetyPromptPackId[] = ["direct_core_pack"];
  if (microPacks.some((pack) => ["bedside_check", "reversible_cause", "false_worsening"].includes(pack))) visible.push("bedside_pack");
  if (microPacks.some((pack) => ["exception_boundary", "measurement_guard"].includes(pack))) visible.push("exception_pack");
  if (microPacks.some((pack) => ["notify_payload", "notify_script"].includes(pack))) visible.push("notify_pack");
  if (microPacks.includes("paired_problem_split")) visible.push("paired_problem_pack");
  return uniquePacks(visible);
}

function buildMustNotAssert(decision: MedSafetyInternalDecision, signals: MedSafetyQuestionSignals, query: string) {
  const items: string[] = [];
  if (decision.entityClarity !== "high") {
    items.push("확인되지 않은 용량, 속도, 희석, 경로", "정체가 확실하지 않은 대상에 대한 구체 세팅값");
  }
  if (signals.mentionsCompatibility) items.push("검증되지 않은 호환성 단정");
  if (signals.mentionsSetting) items.push("모델 미확인 상태의 구체 조작값");
  if ((signals.mentionsABGA || signals.mentionsVentilation) && !PBW_PATTERNS.some((pattern) => pattern.test(query))) {
    items.push("PBW 확인 없는 Vt 적정성 단정");
  }
  if (decision.protocolCaveatNeed) items.push("기관 또는 제조사 고유 수치의 임의 제시");
  return uniqueStrings(items);
}

function buildSectionHints(decision: MedSafetyInternalDecision, visiblePacks: MedSafetyPromptPackId[]) {
  const hints: string[] = ["핵심 판단"];
  if (decision.priorityMode !== "balanced") hints.push("지금 할 일");
  if (visiblePacks.includes("bedside_pack")) {
    hints.push(decision.workflowStage === "pre_notification" ? "노티 전 지금 확인할 것" : "지금 확인할 것");
  }
  if (visiblePacks.includes("paired_problem_pack")) hints.push("같이 봐야 할 문제");
  if (visiblePacks.includes("exception_pack")) hints.push("헷갈리기 쉬운 예외");
  if (visiblePacks.includes("notify_pack")) hints.push("주치의 노티 포인트");
  if (decision.needsEscalation || decision.urgencyLevel !== "routine") hints.push("즉시 보고 신호");
  return uniqueStrings(hints).slice(0, 5);
}

function inferLengthPlan(decision: MedSafetyInternalDecision, hasImage: boolean) {
  if (decision.answerDepth === "short" || decision.compressionTarget === "tight") return "tight" as const;
  if (decision.risk === "high" || decision.answerDepth === "detailed" || hasImage) return "expanded" as const;
  return "standard" as const;
}

function shouldIncludeFastDistinctionPoint(decision: MedSafetyInternalDecision, signals: MedSafetyQuestionSignals) {
  if (decision.intent === "compare") return true;
  if (signals.mixedNumericAction || signals.asksSelection || signals.asksThreshold) return true;
  if (signals.mentionsAlarm || signals.mentionsLineOrTube) return true;
  return false;
}

function shouldIncludeQuickCheckSequence(decision: MedSafetyInternalDecision, signals: MedSafetyQuestionSignals) {
  if (decision.intent === "action") return true;
  if (signals.bedsideSweep || signals.falseWorseningRisk || signals.preNotification) return true;
  if (signals.mentionsAlarm || signals.mentionsLineOrTube || signals.mentionsSetting) return true;
  return false;
}

function buildProjection(
  decision: MedSafetyInternalDecision,
  packPlan: MedSafetyPackPlan,
  locale: "ko" | "en",
  signals: MedSafetyQuestionSignals
): MedSafetyPromptProjection {
  const includeCoverage = packPlan.visiblePacks.includes("bedside_pack") || packPlan.visiblePacks.includes("paired_problem_pack");
  const includeException = packPlan.visiblePacks.includes("exception_pack");
  const includeCommunication = packPlan.visiblePacks.includes("notify_pack");
  const needsFastDistinctionPoint = shouldIncludeFastDistinctionPoint(decision, signals);
  const needsQuickCheckSequence = shouldIncludeQuickCheckSequence(decision, signals);

  const activeDirectiveKeys: MedSafetyProjectionDirectiveKey[] = [
    "openingDirective",
    "priorityDirective",
    "safetyDirective",
    "compressionDirective",
    "renderDirective",
  ];
  if (includeCoverage) activeDirectiveKeys.push("coverageDirective");
  if (includeException) activeDirectiveKeys.push("exceptionDirective");
  if (includeCommunication) activeDirectiveKeys.push("communicationDirective");

  if (locale === "en") {
    return {
      openingDirective:
        "Begin with a titleless conclusion that states the preferred action or interpretation, then explain only the reasoning that changes the bedside next step.",
      priorityDirective:
        decision.priorityMode === "notify_first"
          ? "Put action and clinician-facing reporting before background explanation."
          : decision.priorityMode === "safety_first"
            ? "Put immediate safety and stop-report boundaries before mechanism or teaching points."
            : decision.priorityMode === "action_first"
              ? "Put what to do now before background explanation."
              : "Keep the answer balanced, but do not let background explanation delay the direct answer.",
      coverageDirective: includeCoverage
        ? packPlan.visiblePacks.includes("paired_problem_pack")
          ? "Separate the linked problems instead of blending them, and keep bedside checks focused on what would change the next lever."
          : "Use one bedside card only, focused on the checks most likely to change the next decision: patient effect, waveform or circuit state, and reversible or false-worsening causes."
        : null,
      exceptionDirective: includeException
        ? "Add a compact boundary card that states when the main recommendation stops being safe and which missing measurement or identifier would change the choice."
        : null,
      communicationDirective: includeCommunication
        ? decision.communicationProfile === "script"
          ? "Include a compact notify card with the minimum useful report payload and a 2-3 sentence script that can be read aloud naturally."
          : "Include a compact notify card with only the minimum report payload the clinician needs for the next decision."
        : null,
      safetyDirective:
        decision.protocolCaveatNeed || decision.specificityRisk !== "low"
          ? "Stay conservative on specifics. Do not invent unsupported numbers, settings, or compatibility claims, and use protocol or manufacturer caveats only where they materially protect safety."
          : "Do not add unsupported specifics or generic filler.",
      compressionDirective:
        decision.compressionTarget === "tight"
          ? "Keep it tight: use a conclusion plus at most 3 short cards, only if they materially change action, safety, or reporting."
          : decision.compressionTarget === "compressed_detailed"
            ? "Be detailed only where the detail changes the choice. Keep the whole answer to a conclusion plus at most 4 short cards, and remove educational padding and repeated warnings."
            : "Keep the answer compressed and high density rather than long. Use a conclusion plus at most 4 short cards.",
      renderDirective:
        "Output plain text only. Use a titleless conclusion first, then short cards with concrete headings. Each card must have one lead sentence and only 2-3 bullets. Do not expose internal planning language.",
      needsFastDistinctionPoint,
      needsQuickCheckSequence,
      activeDirectiveKeys,
      droppedDirectiveKeys: [],
    };
  }

  return {
    openingDirective:
      "첫 문단은 제목 없는 결론으로 시작하고, 추천 선택이나 핵심 해석을 먼저 말한 뒤 그 선택을 바꾸는 이유만 짧게 덧붙인다.",
    priorityDirective:
      decision.priorityMode === "notify_first"
        ? "배경 설명보다 지금 할 일과 어떻게 보고할지를 먼저 둔다."
        : decision.priorityMode === "safety_first"
          ? "기전 설명보다 즉시 위험, 중단 기준, 보고 경계를 먼저 둔다."
          : decision.priorityMode === "action_first"
            ? "배경 설명보다 지금 할 행동을 먼저 둔다."
            : "직접 답을 먼저 주되, 배경 설명이 판단을 지연시키지 않게 한다.",
    coverageDirective: includeCoverage
      ? packPlan.visiblePacks.includes("paired_problem_pack")
        ? "얽혀 있는 두 문제를 섞지 말고 분리해 다루며, bedside 확인은 다음 선택을 바꾸는 항목만 남긴다."
        : "bedside 카드는 하나만 쓰고, 환자 상태, waveform 또는 circuit 상태, reversible cause나 false worsening 배제처럼 다음 선택을 바꾸는 확인만 남긴다."
      : null,
    exceptionDirective: includeException
      ? "현재 추천이 언제부터 위험해지는지와, 어떤 누락 측정값이나 식별 정보가 선택을 바꾸는지 짧은 예외 카드로 정리한다."
      : null,
    communicationDirective: includeCommunication
      ? decision.communicationProfile === "script"
        ? "노티 카드는 최소한의 핵심 데이터 묶음과 2~3문장 실제 보고 문장까지 포함한다."
        : "노티 카드는 다음 의사결정에 필요한 최소한의 데이터 묶음만 남긴다."
      : null,
    safetyDirective:
      decision.protocolCaveatNeed || decision.specificityRisk !== "low"
        ? "근거 없는 수치, 세팅값, 호환성 결론을 만들지 말고, 안전을 지키는 데 필요할 때만 프로토콜이나 제조사 확인 caveat를 남긴다."
        : "근거 없는 구체값과 반복 경고를 넣지 않는다.",
    compressionDirective:
      decision.compressionTarget === "tight"
        ? "결론과 실제로 행동을 바꾸는 카드만 남겨 짧게 쓰고, 전체는 결론 뒤 최대 3개 카드까지만 쓴다."
        : decision.compressionTarget === "compressed_detailed"
          ? "상세하더라도 선택을 바꾸는 디테일만 남기고 교육용 설명과 반복 경고는 빼며, 전체는 결론 뒤 최대 4개 카드까지만 쓴다."
          : "길이보다 판단 밀도를 높이는 쪽으로 압축하고, 전체는 결론 뒤 최대 4개 카드까지만 쓴다.",
    renderDirective:
      "최종 출력은 평문만 사용하고, 제목 없는 결론 뒤에 구체 제목 카드들을 배치한다. 각 카드는 리드 1문장과 2~3개 bullet만 사용하며 내부 기획 용어는 노출하지 않는다.",
    needsFastDistinctionPoint,
    needsQuickCheckSequence,
    activeDirectiveKeys,
    droppedDirectiveKeys: [],
  };
}

export function buildMedSafetyPromptBlueprint(
  decision: MedSafetyInternalDecision,
  options: {
    hasImage?: boolean;
    query?: string;
    locale: "ko" | "en";
    signals: MedSafetyQuestionSignals;
  }
): MedSafetyPromptBlueprint {
  const scores = buildMicroPackScores(decision, options.signals);
  const { selectedMicroPacks, deferredMicroPacks } = selectMicroPacks(scores, decision);
  const visiblePacks = mapMicroToVisiblePacks(selectedMicroPacks);
  const packPlan: MedSafetyPackPlan = {
    visiblePacks,
    selectedMicroPacks,
    deferredMicroPacks,
    droppedMicroPacks: [],
    microPackScores: scores,
  };

  return {
    openingMode: inferOpeningMode(decision),
    sectionHints: buildSectionHints(decision, visiblePacks),
    mustNotAssert: buildMustNotAssert(decision, options.signals, String(options.query ?? "")),
    lengthPlan: inferLengthPlan(decision, Boolean(options.hasImage)),
    packPlan,
    projection: buildProjection(decision, packPlan, options.locale, options.signals),
  };
}
