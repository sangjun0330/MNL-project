import type {
  SocialGroupAIBriefAction,
  SocialGroupAIBriefFlowRow,
  SocialGroupAIBriefPersonalCard,
  SocialGroupAIBriefTone,
} from "@/types/social";

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
  }>;
  personalCards: Array<{
    userId: string;
    nickname: string;
    avatarEmoji: string;
    statusLabel: SocialGroupAIBriefPersonalCard["statusLabel"];
    summaryFact: string;
    actionFact: string;
    defaultSummary: string;
    defaultAction: string;
  }>;
};
