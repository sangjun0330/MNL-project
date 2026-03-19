import type { ISODate } from "@/lib/date";
import { addDays, diffDays, fromISODate, toISODate } from "@/lib/date";
import { menstrualContextForDate, type MenstrualContext, type MenstrualPhase } from "@/lib/menstrual";
import type { BioInputs, MenstrualSettings } from "@/lib/model";
import type { Shift } from "@/lib/types";

export type MenstrualPosteriorPhase =
  | "period"
  | "late_period_tail"
  | "follicular"
  | "ovulation_window"
  | "luteal"
  | "pms"
  | "uncertain";

export type MenstrualClinicalFlag = "cycle_variability" | "long_gap" | "abnormal_period_length" | null;

export type MenstrualVisualLevel = "confirmed" | "probable" | "possible" | "uncertain";

export type MenstrualPosterior = MenstrualContext & {
  phaseProbabilities: Record<MenstrualPosteriorPhase, number>;
  dominantPhase: MenstrualPosteriorPhase;
  confidence: number;
  isObservedToday: boolean;
  isInferredToday: boolean;
  expectedNextStartP10: ISODate | null;
  expectedNextStartP50: ISODate | null;
  expectedNextStartP90: ISODate | null;
  expectedBleedingWindow: { startISO: ISODate; endISO: ISODate } | null;
  expectedImpact: number;
  drivers: string[];
  clinicalFlag: MenstrualClinicalFlag;
  observedStatus: "none" | "pms" | "period" | null;
  observedFlow: 0 | 1 | 2 | 3 | null;
  symptomSeverity: number | null;
  visualLevel: MenstrualVisualLevel;
  visualPhase: "period" | "pms" | "ovulation" | "follicular" | "luteal" | null;
};

type MenstrualEpisode = {
  startISO: ISODate;
  endISO: ISODate;
  length: number;
};

type WeightedStats = {
  mean: number;
  sigma: number;
  count: number;
};

type InferArgs = {
  iso: ISODate;
  settings?: MenstrualSettings | null;
  bioMap?: Record<ISODate, BioInputs | null | undefined>;
  schedule?: Record<ISODate, Shift | undefined>;
  symptomSeverity?: number | null;
  symptomObserved?: boolean;
  inputReliability?: number | null;
  shift?: Shift;
};

const POSTERIOR_PHASES: MenstrualPosteriorPhase[] = [
  "period",
  "late_period_tail",
  "follicular",
  "ovulation_window",
  "luteal",
  "pms",
  "uncertain",
];

function clamp(n: number, min: number, max: number) {
  const v = Number.isFinite(n) ? n : min;
  return Math.max(min, Math.min(max, v));
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}

function makePhaseMap(seed = 0): Record<MenstrualPosteriorPhase, number> {
  return {
    period: seed,
    late_period_tail: seed,
    follicular: seed,
    ovulation_window: seed,
    luteal: seed,
    pms: seed,
    uncertain: seed,
  };
}

function normalizePhaseMap(map: Record<MenstrualPosteriorPhase, number>) {
  const next = makePhaseMap(0);
  const total = POSTERIOR_PHASES.reduce((sum, key) => sum + Math.max(0, Number(map[key] ?? 0)), 0);
  if (total <= 0) {
    next.uncertain = 1;
    return next;
  }
  for (const key of POSTERIOR_PHASES) {
    next[key] = Math.round((Math.max(0, Number(map[key] ?? 0)) / total) * 1000) / 1000;
  }
  const remainder = 1 - POSTERIOR_PHASES.reduce((sum, key) => sum + next[key], 0);
  if (Math.abs(remainder) > 0.0001) next.uncertain = clamp(next.uncertain + remainder, 0, 1);
  return next;
}

function gaussianWeight(value: number, mean: number, sigma: number) {
  const safeSigma = Math.max(0.75, sigma);
  const z = (value - mean) / safeSigma;
  return Math.exp(-0.5 * z * z);
}

function flowLevel(bio?: BioInputs | null) {
  const raw = Number(bio?.menstrualFlow ?? null);
  if (!Number.isFinite(raw)) return null;
  return clamp(Math.round(raw), 0, 3) as 0 | 1 | 2 | 3;
}

function statusOf(bio?: BioInputs | null) {
  const raw = bio?.menstrualStatus ?? null;
  if (raw === "period" || raw === "pms" || raw === "none") return raw;
  return null;
}

function symptomLevel(value?: number | null) {
  if (value == null) return null;
  return clamp(Number(value), 0, 3);
}

function periodSignal(bio?: BioInputs | null) {
  const flow = flowLevel(bio);
  const status = statusOf(bio);
  return (flow != null && flow > 0) || status === "period";
}

function weightedStats(values: number[], fallbackMean: number, fallbackSigma: number): WeightedStats {
  if (!values.length) return { mean: fallbackMean, sigma: fallbackSigma, count: 0 };
  const weighted = values.map((value, index) => ({ value, weight: index + 1 }));
  const weightSum = weighted.reduce((sum, item) => sum + item.weight, 0);
  const mean = weighted.reduce((sum, item) => sum + item.value * item.weight, 0) / weightSum;
  const variance =
    weighted.reduce((sum, item) => sum + item.weight * Math.pow(item.value - mean, 2), 0) / Math.max(1, weightSum);
  return {
    mean,
    sigma: clamp(Math.sqrt(variance), 1, 8),
    count: values.length,
  };
}

function estimatePmsLead(params: {
  episodes: MenstrualEpisode[];
  bioMap?: Record<ISODate, BioInputs | null | undefined>;
  fallback: number;
}) {
  const { episodes, bioMap, fallback } = params;
  if (!bioMap || episodes.length < 2) return fallback;
  const leadDays: number[] = [];
  for (let i = 1; i < episodes.length; i++) {
    const nextStart = episodes[i].startISO;
    for (let offset = 1; offset <= 10; offset++) {
      const probe = toISODate(addDays(fromISODate(nextStart), -offset));
      if (statusOf(bioMap[probe]) === "pms") {
        leadDays.push(offset);
      }
    }
  }
  if (!leadDays.length) return fallback;
  const stats = weightedStats(leadDays, fallback, 1.5);
  return clamp(Math.round(stats.mean), 2, 8);
}

function extractEpisodes(params: {
  iso: ISODate;
  settings?: MenstrualSettings | null;
  bioMap?: Record<ISODate, BioInputs | null | undefined>;
}) {
  const { iso, settings, bioMap } = params;
  const end = fromISODate(iso);
  const start = addDays(end, -180);
  const episodes: MenstrualEpisode[] = [];

  if (!bioMap) return episodes;

  let activeStart: ISODate | null = null;
  let activeEnd: ISODate | null = null;
  let activeLength = 0;

  for (let cursor = start; cursor.getTime() <= end.getTime(); cursor = addDays(cursor, 1)) {
    const key = toISODate(cursor);
    const active = periodSignal(bioMap[key]);
    if (active) {
      if (!activeStart) activeStart = key;
      activeEnd = key;
      activeLength += 1;
      continue;
    }
    if (activeStart && activeEnd && activeLength > 0) {
      episodes.push({ startISO: activeStart, endISO: activeEnd, length: activeLength });
      activeStart = null;
      activeEnd = null;
      activeLength = 0;
    }
  }

  if (activeStart && activeEnd && activeLength > 0) {
    episodes.push({ startISO: activeStart, endISO: activeEnd, length: activeLength });
  }

  if (!episodes.length && settings?.lastPeriodStart) {
    const fallbackLength = clamp(Math.round(settings.periodLength ?? 5), 2, 10);
    const startISO = settings.lastPeriodStart;
    episodes.push({
      startISO,
      endISO: toISODate(addDays(fromISODate(startISO), fallbackLength - 1)),
      length: fallbackLength,
    });
  }

  return episodes.sort((a, b) => (a.startISO < b.startISO ? -1 : a.startISO > b.startISO ? 1 : 0));
}

function pickDominantPhase(map: Record<MenstrualPosteriorPhase, number>) {
  let phase: MenstrualPosteriorPhase = "uncertain";
  let score = -1;
  for (const key of POSTERIOR_PHASES) {
    const value = Number(map[key] ?? 0);
    if (value > score) {
      phase = key;
      score = value;
    }
  }
  return phase;
}

function compatibleLegacyPhase(dominantPhase: MenstrualPosteriorPhase, confidence: number, fallback: MenstrualPhase): MenstrualPhase {
  if (dominantPhase === "uncertain" && confidence < 0.45) return fallback === "none" ? "none" : fallback;
  if (dominantPhase === "period" || dominantPhase === "late_period_tail") return "period";
  if (dominantPhase === "pms") return "pms";
  if (dominantPhase === "ovulation_window") return "ovulation";
  if (dominantPhase === "follicular") return "follicular";
  if (dominantPhase === "luteal") return "luteal";
  return fallback;
}

function phaseLabel(phase: MenstrualPosteriorPhase, confidence: number, enabled: boolean) {
  if (!enabled) return "주기";
  if (phase === "uncertain" || confidence < 0.38) return "주기 변동 가능성";
  if (phase === "period" || phase === "late_period_tail") return confidence >= 0.72 ? "생리 기간" : "생리 가능성 높음";
  if (phase === "pms") return confidence >= 0.62 ? "생리 직전 기간" : "생리 직전 가능성";
  if (phase === "ovulation_window" || phase === "follicular") return "컨디션 안정 기간";
  return "컨디션 변화가 큰 날";
}

function expectedImpactByPhase(phase: MenstrualPosteriorPhase) {
  switch (phase) {
    case "period":
      return 0.24;
    case "late_period_tail":
      return 0.14;
    case "pms":
      return 0.18;
    case "luteal":
      return 0.09;
    case "ovulation_window":
      return 0.02;
    case "follicular":
      return 0.04;
    default:
      return 0.05;
  }
}

function buildVisualLevel(confidence: number, isObservedToday: boolean): MenstrualVisualLevel {
  if (isObservedToday || confidence >= 0.8) return "confirmed";
  if (confidence >= 0.6) return "probable";
  if (confidence >= 0.4) return "possible";
  return "uncertain";
}

function toVisualPhase(phase: MenstrualPosteriorPhase): MenstrualPosterior["visualPhase"] {
  if (phase === "period" || phase === "late_period_tail") return "period";
  if (phase === "pms") return "pms";
  if (phase === "ovulation_window") return "ovulation";
  if (phase === "follicular") return "follicular";
  if (phase === "luteal") return "luteal";
  return null;
}

function entropyConfidence(probabilities: Record<MenstrualPosteriorPhase, number>) {
  const totalStates = POSTERIOR_PHASES.length;
  const entropy = POSTERIOR_PHASES.reduce((sum, key) => {
    const p = clamp(Number(probabilities[key] ?? 0), 0, 1);
    return p > 0 ? sum - p * Math.log(p) : sum;
  }, 0);
  const normalized = clamp(entropy / Math.log(totalStates), 0, 1);
  return clamp(1 - normalized, 0, 1);
}

export function inferMenstrualPosterior(args: InferArgs): MenstrualPosterior {
  const { iso, settings, bioMap, schedule, symptomSeverity, symptomObserved, inputReliability, shift } = args;
  const fallback = menstrualContextForDate(iso, settings);
  const enabled = Boolean(settings?.enabled);
  const flow = flowLevel(bioMap?.[iso]) ?? null;
  const status = statusOf(bioMap?.[iso]) ?? null;
  const symptom = symptomLevel(symptomSeverity ?? bioMap?.[iso]?.symptomSeverity ?? null);
  const reliability = clamp(Number(inputReliability ?? 0.35), 0.35, 1);
  const observedDirect = status != null || flow != null || Boolean(symptomObserved);

  if (!enabled) {
    const probabilities = normalizePhaseMap({ ...makePhaseMap(0), uncertain: 1 });
    return {
      ...fallback,
      phaseProbabilities: probabilities,
      dominantPhase: "uncertain",
      confidence: 0,
      isObservedToday: false,
      isInferredToday: false,
      expectedNextStartP10: null,
      expectedNextStartP50: null,
      expectedNextStartP90: null,
      expectedBleedingWindow: null,
      expectedImpact: 0,
      drivers: [],
      clinicalFlag: null,
      observedStatus: status,
      observedFlow: flow,
      symptomSeverity: symptom,
      visualLevel: "uncertain",
      visualPhase: null,
    };
  }

  const episodes = extractEpisodes({ iso, settings, bioMap });
  const intervals = episodes.slice(1).map((episode, index) => diffDays(episode.startISO, episodes[index].startISO));
  const cycleStats = weightedStats(intervals, clamp(settings?.cycleLength ?? 28, 20, 45), 3.5);
  const periodStats = weightedStats(
    episodes.map((episode) => episode.length),
    clamp(settings?.periodLength ?? 5, 2, 10),
    1.4
  );
  const muPmsLead = estimatePmsLead({
    episodes,
    bioMap,
    fallback: clamp(settings?.pmsDays ?? 4, 2, 8),
  });

  const sigmaCycle = clamp(cycleStats.sigma + Math.max(0, 3 - cycleStats.count) * 0.6, 1.8, 8);
  const sigmaPeriod = clamp(periodStats.sigma + Math.max(0, 2 - periodStats.count) * 0.4, 0.8, 3);
  const recentNightCount = schedule
    ? Array.from({ length: 30 }).reduce<number>((count, _, index) => {
        const probe = toISODate(addDays(fromISODate(iso), -index));
        return count + ((schedule[probe] ?? (probe === iso ? shift : undefined)) === "N" ? 1 : 0);
      }, 0)
    : 0;
  const irregularityScore = clamp((sigmaCycle - 2) / 6 + recentNightCount / 30 * 0.25, 0, 1);

  const recentStartCandidates = episodes.filter((episode) => episode.startISO <= iso);
  const anchor = recentStartCandidates.length
    ? recentStartCandidates[recentStartCandidates.length - 1].startISO
    : (settings?.lastPeriodStart ?? null);
  const daySinceAnchor = anchor ? Math.max(0, diffDays(iso, anchor)) : 0;
  const muCycle = clamp(cycleStats.mean, 20, 45);
  const muPeriod = clamp(periodStats.mean, 2, 10);

  const prior = makePhaseMap(0);
  if (!anchor) {
    prior.uncertain = 1;
  } else {
    const sigmaForPrior = clamp(sigmaCycle + irregularityScore * 3, 1.5, 9);
    for (let cycleLen = 20; cycleLen <= 45; cycleLen++) {
      const weight = gaussianWeight(cycleLen, muCycle, sigmaForPrior);
      const cyc = ((daySinceAnchor % cycleLen) + cycleLen) % cycleLen;
      const periodLen = clamp(Math.round(muPeriod), 2, 10);
      const pmsLead = clamp(muPmsLead, 2, 8);
      const ovulationDay = clamp(Math.round(cycleLen - (settings?.lutealLength ?? 14)), 6, cycleLen - 8);
      if (cyc < Math.max(1, periodLen - 1)) prior.period += weight;
      else if (cyc <= periodLen) prior.late_period_tail += weight * 0.9;
      else if (cyc >= Math.max(periodLen + 2, cycleLen - pmsLead)) prior.pms += weight;
      else if (Math.abs(cyc - ovulationDay) <= 1) prior.ovulation_window += weight;
      else if (cyc < ovulationDay) prior.follicular += weight;
      else prior.luteal += weight;
    }
    prior.uncertain += 0.18 + irregularityScore * 0.25;
  }

  const posteriorRaw = { ...prior };
  const drivers: string[] = [];

  if (periodSignal(bioMap?.[iso])) {
    posteriorRaw.period += 5.2;
    posteriorRaw.late_period_tail += 1.2;
    posteriorRaw.uncertain *= 0.35;
    drivers.push("직접 생리 기록");
  } else if (status === "pms") {
    posteriorRaw.pms += 4.2;
    posteriorRaw.luteal += 1.0;
    posteriorRaw.uncertain *= 0.55;
    drivers.push("직접 PMS 기록");
  }

  if (flow != null && flow > 0) {
    posteriorRaw.period += 1.4 + flow * 0.45;
    posteriorRaw.late_period_tail += flow >= 1 ? 0.35 : 0;
    drivers.push("출혈 강도 반영");
  }

  if (symptom != null && symptom > 0) {
    const symptomWeight = symptomObserved ? 0.75 : 0.4;
    posteriorRaw.pms += symptom * 0.45 * symptomWeight;
    posteriorRaw.period += symptom * 0.25 * symptomWeight;
    posteriorRaw.luteal += symptom * 0.15 * symptomWeight;
    drivers.push(symptomObserved ? "직접 증상 기록" : "증상 추정치");
  }

  if (!observedDirect) {
    posteriorRaw.uncertain += (1 - reliability) * 1.6 + irregularityScore * 0.8;
  }

  if (recentNightCount >= 8) {
    posteriorRaw.uncertain += 0.3;
    drivers.push("교대근무 변동성 반영");
  }

  if (!drivers.length) drivers.push(anchor ? "최근 주기 기록 기반" : "설정값 기반");

  const phaseProbabilities = normalizePhaseMap(posteriorRaw);
  const entropy = entropyConfidence(phaseProbabilities);
  const evidenceConfidence = clamp(
    entropy * (observedDirect ? 1 : reliability) * (0.55 + Math.min(episodes.length, 6) * 0.08),
    0,
    1
  );
  const dominantPhase = pickDominantPhase(phaseProbabilities);
  const confidence = clamp(
    observedDirect ? Math.max(evidenceConfidence, 0.74) : evidenceConfidence,
    0,
    1
  );

  let clinicalFlag: MenstrualClinicalFlag = null;
  if (sigmaCycle >= 5.5) clinicalFlag = "cycle_variability";
  if (periodStats.mean >= 8) clinicalFlag = "abnormal_period_length";
  if (anchor && diffDays(iso, anchor) > 45 && dominantPhase !== "period") clinicalFlag = "long_gap";

  let predictionAnchor = anchor ? fromISODate(anchor) : null;
  if (predictionAnchor) {
    const roundedCycle = Math.max(20, Math.round(muCycle));
    while (toISODate(predictionAnchor) <= iso) {
      predictionAnchor = addDays(predictionAnchor, roundedCycle);
      if (diffDays(toISODate(predictionAnchor), iso) > 90) break;
    }
  }

  const spread = clamp(Math.max(sigmaCycle, 1.5) + irregularityScore * 2, 1.5, 10);
  const p10 = predictionAnchor ? toISODate(addDays(predictionAnchor, -Math.round(spread * 1.28))) : null;
  const p50 = predictionAnchor ? toISODate(predictionAnchor) : null;
  const p90 = predictionAnchor ? toISODate(addDays(predictionAnchor, Math.round(spread * 1.28))) : null;
  const expectedBleedingWindow =
    p50 == null
      ? null
      : {
          startISO: p50,
          endISO: toISODate(addDays(fromISODate(p50), Math.max(1, Math.round(muPeriod)) - 1)),
        };

  const expectedImpact = clamp(
    POSTERIOR_PHASES.reduce((sum, key) => sum + phaseProbabilities[key] * expectedImpactByPhase(key), 0) +
      clamp((symptom ?? 0) / 3, 0, 1) * 0.06 +
      clamp((flow ?? 0) / 3, 0, 1) * 0.08 +
      ((shift === "N" || shift === "E" || shift === "M") && (dominantPhase === "period" || dominantPhase === "pms")
        ? 0.03
        : 0),
    0,
    0.45
  );

  const visualLevel = buildVisualLevel(confidence, observedDirect);
  const visualPhase = toVisualPhase(dominantPhase);
  const phase = compatibleLegacyPhase(dominantPhase, confidence, fallback.phase);
  const label = phaseLabel(dominantPhase, confidence, enabled);
  const dayInCycle = anchor ? ((daySinceAnchor % Math.max(20, Math.round(muCycle))) + 1) : fallback.dayInCycle;

  return {
    ...fallback,
    phase,
    label,
    dayIndexInCycle: dayInCycle == null ? fallback.dayIndexInCycle : Math.max(0, dayInCycle - 1),
    dayInCycle: dayInCycle ?? fallback.dayInCycle,
    cycleLength: Math.round(muCycle),
    periodLength: Math.round(muPeriod),
    phaseProbabilities,
    dominantPhase,
    confidence,
    isObservedToday: observedDirect,
    isInferredToday: enabled && !observedDirect,
    expectedNextStartP10: p10,
    expectedNextStartP50: p50,
    expectedNextStartP90: p90,
    expectedBleedingWindow,
    expectedImpact,
    drivers,
    clinicalFlag,
    observedStatus: status,
    observedFlow: flow,
    symptomSeverity: symptom,
    visualLevel,
    visualPhase,
  };
}
