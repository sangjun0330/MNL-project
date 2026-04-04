import type {
  SocialGroupAIBriefAction,
  SocialGroupAIBriefFlowRow,
  SocialGroupAIBriefPersonalCard,
  SocialGroupAIBriefTone,
  SocialMemberPreview,
} from "@/types/social";

export type BriefNarrativeAxis =
  | "recover_risk"
  | "sleep_short"
  | "mental_drift"
  | "body_low"
  | "coordination_gap"
  | "night_reset"
  | "steady_maintain";

export type BriefSecondaryAxis =
  | BriefNarrativeAxis
  | "sleep_guard"
  | "mental_guard"
  | "risk_watch"
  | "coordination_some"
  | "none";

export type BriefSeverityBand = "recover" | "watch" | "steady";
export type BriefSleepBand = "very_short" | "short" | "guarded" | "steady";
export type BriefBodyBand = "very_low" | "low" | "guarded" | "steady";
export type BriefMentalBand = "very_low" | "low" | "guarded" | "steady";
export type BriefDriftBand = "wide" | "visible" | "aligned";
export type BriefRiskBand = "recover" | "watch_many" | "watch_single" | "stable";
export type BriefCoordinationBand = "dense" | "some" | "sparse";
export type BriefNightBand = "clustered" | "single" | "none";
export type BriefTodayModifier = "night_and_off" | "night_only" | "off_only" | "neutral";
export type BriefActionPriorityProfile =
  | "risk_first"
  | "sleep_first"
  | "mental_first"
  | "body_first"
  | "coordination_first"
  | "night_first"
  | "steady_first";
export type BriefCopySlotKey = "06-slot" | "18-slot";

export type BriefNarrativeSpec = {
  tone: SocialGroupAIBriefTone;
  dominantAxis: BriefNarrativeAxis;
  secondaryAxis: BriefSecondaryAxis;
  severityBand: BriefSeverityBand;
  sleepBand: BriefSleepBand;
  bodyBand: BriefBodyBand;
  mentalBand: BriefMentalBand;
  driftBand: BriefDriftBand;
  riskBand: BriefRiskBand;
  coordinationBand: BriefCoordinationBand;
  nightBand: BriefNightBand;
  todayModifier: BriefTodayModifier;
  actionPriorityProfile: BriefActionPriorityProfile;
  copySlotKey: BriefCopySlotKey;
  variationSeed: string;
};

export type BriefVariantIds = {
  heroHeadline: string;
  heroSubheadline: string;
  actionTitles: Record<string, string>;
  actionBodies: Record<string, string>;
  actionReasons: Record<string, string>;
};

export type BriefUsageMeta = {
  archetypeId: BriefNarrativeAxis;
  dominantAxis: BriefNarrativeAxis;
  secondaryAxis: BriefSecondaryAxis;
  copySlotKey: BriefCopySlotKey;
  variantIds: BriefVariantIds;
  copyFingerprint: string;
  previousFingerprint: string | null;
  topActionIds: string[];
  promptVersion: string;
};

export type SocialGroupAIBriefFactBundle = {
  contributorCount: number;
  avgBattery: number | null;
  avgMental: number | null;
  avgSleep: number | null;
  warningCount: number;
  dangerCount: number;
  commonOffCount: number;
  nightCountToday: number;
  offCountToday: number;
};

export type SocialGroupAIBriefSnapshot = {
  week: {
    startISO: string;
    endISO: string;
    label: string;
  };
  metrics: {
    contributorCount: number;
    optInCardCount: number;
    avgBattery: number | null;
    avgSleep: number | null;
    avgMental: number | null;
    avgStress: number | null;
    avgActivity: number | null;
    avgCaffeine: number | null;
    warningCount: number;
    dangerCount: number;
    commonOffCount: number;
    nightCountToday: number;
    offCountToday: number;
  };
  narrativeSpec: BriefNarrativeSpec;
  factBundle: SocialGroupAIBriefFactBundle;
  previousCopy: {
    fingerprint: string | null;
    heroHeadline: string | null;
    actionTitles: string[];
  };
  copyMeta: BriefUsageMeta;
  hero: {
    tone: SocialGroupAIBriefTone;
    defaultHeadline: string;
    defaultSubheadline: string;
  };
  findings: Array<{
    id: SocialGroupAIBriefFlowRow["id"];
    tone: SocialGroupAIBriefTone;
    factLabel: string;
    factText: string;
    defaultTitle: string;
    defaultBody: string;
  }>;
  actions: Array<{
    id: SocialGroupAIBriefAction["id"];
    reason: string;
    factText: string;
    defaultTitle: string;
    defaultBody: string;
  }>;
  windows: Array<{
    dateISO: string;
    label: string;
    reason: string;
    members: SocialMemberPreview[];
  }>;
  personalCards: Array<{
    userId: string;
    nickname: string;
    avatarEmoji: string;
    statusLabel: SocialGroupAIBriefPersonalCard["statusLabel"];
    vitalScore: number | null;
    bodyBattery: number | null;
    mentalBattery: number | null;
    sleepDebtHours: number | null;
    summaryFact: string;
    actionFact: string;
    defaultSummary: string;
    defaultAction: string;
  }>;
};
