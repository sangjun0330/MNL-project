"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { DetailCard, DetailChip } from "@/components/pages/insights/InsightDetailShell";
import type {
  AIPlannerModule,
  AIPlannerModuleItem,
  AIPlannerTimelineItem,
  AIPlannerTimelineModule,
} from "@/lib/aiRecoveryPlanner";

type BasicModuleShape = Pick<AIPlannerModule, "eyebrow" | "title" | "headline" | "summary"> & {
  items?: AIPlannerModuleItem[];
};

type Accent = "mint" | "navy" | "rose";

const THEME: Record<
  Accent,
  {
    accent: string;
    surface: string;
    soft: string;
    softBorder: string;
  }
> = {
  mint: {
    accent: "#007AFF",
    surface: "linear-gradient(180deg, rgba(245,249,255,0.98) 0%, #FFFFFF 84%)",
    soft: "#F3F8FF",
    softBorder: "#D8E7FF",
  },
  navy: {
    accent: "#1B2747",
    surface: "linear-gradient(180deg, rgba(246,248,252,0.98) 0%, #FFFFFF 84%)",
    soft: "#F5F7FB",
    softBorder: "#D8E0EC",
  },
  rose: {
    accent: "#B2415A",
    surface: "linear-gradient(180deg, rgba(255,246,248,0.98) 0%, #FFFFFF 84%)",
    soft: "#FFF6F8",
    softBorder: "#F2D8E0",
  },
};

function ModuleItemBox({
  item,
  accent,
}: {
  item: AIPlannerModuleItem;
  accent: Accent;
}) {
  const theme = THEME[accent];
  return (
    <div
      className="rounded-[22px] px-4 py-4"
      style={{
        backgroundColor: theme.soft,
        boxShadow: `inset 0 0 0 1px ${theme.softBorder}`,
      }}
    >
      <div className="text-[11px] font-semibold tracking-[0.08em] text-ios-muted">{item.label}</div>
      <div className="mt-1 text-[16px] font-bold tracking-[-0.02em] text-ios-text">{item.title}</div>
      <p className="mt-2 break-keep text-[14px] leading-6 text-ios-sub">{item.body}</p>
      {item.chips?.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {item.chips.map((chip) => (
            <DetailChip key={`${item.title}-${chip}`} color={theme.accent}>
              {chip}
            </DetailChip>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TimelineItemBox({
  item,
  accent,
}: {
  item: AIPlannerTimelineItem;
  accent: Accent;
}) {
  const theme = THEME[accent];
  return (
    <div
      className="rounded-[22px] px-4 py-4"
      style={{
        backgroundColor: theme.soft,
        boxShadow: `inset 0 0 0 1px ${theme.softBorder}`,
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <DetailChip color={theme.accent}>{item.phase}</DetailChip>
        <span className="text-[12px] font-semibold" style={{ color: theme.accent }}>
          {item.focus}
        </span>
      </div>
      <p className="mt-3 break-keep text-[14px] leading-6 text-ios-text">{item.body}</p>
      {item.caution ? <p className="mt-2 break-keep text-[13px] leading-6 text-ios-sub">{item.caution}</p> : null}
    </div>
  );
}

function ModuleChrome({
  eyebrow,
  title,
  headline,
  summary,
  accent,
  action,
}: {
  eyebrow: string;
  title: string;
  headline: string;
  summary: string;
  accent: Accent;
  action?: ReactNode;
}) {
  const theme = THEME[accent];
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="max-w-[640px]">
        <div className="text-[11px] font-semibold tracking-[0.16em]" style={{ color: theme.accent }}>
          {eyebrow}
        </div>
        <div className="mt-1 text-[20px] font-bold tracking-[-0.03em] text-ios-text">{title}</div>
        <div className="mt-3 break-keep text-[17px] font-bold leading-7 tracking-[-0.02em] text-ios-text">{headline}</div>
        <p className="mt-2 break-keep text-[14px] leading-6 text-ios-sub">{summary}</p>
      </div>
      {action}
    </div>
  );
}

export function AIPlannerHeroCard({
  title,
  summary,
  chips,
  action,
}: {
  title: string;
  summary: string;
  chips?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <DetailCard
      className="overflow-hidden px-5 py-5 sm:px-6 sm:py-6"
      style={{ background: "linear-gradient(180deg, rgba(249,250,254,0.98) 0%, #FFFFFF 78%)" }}
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="max-w-[650px]">
            <div className="text-[11px] font-semibold tracking-[0.16em] text-[#007AFF]">TODAY PLANNER</div>
            <div className="mt-1 text-[22px] font-bold tracking-[-0.03em] text-ios-text">{title}</div>
            <p className="mt-3 break-keep text-[15px] leading-7 text-ios-sub">{summary}</p>
          </div>
          {action}
        </div>
        {chips ? <div className="flex flex-wrap gap-2">{chips}</div> : null}
      </div>
    </DetailCard>
  );
}

export function AIPlannerModuleLinkCard({
  href,
  accent,
  module,
  itemPreviewCount = 2,
}: {
  href: string;
  accent: Accent;
  module: BasicModuleShape;
  itemPreviewCount?: number;
}) {
  const theme = THEME[accent];
  const preview = (module.items ?? []).slice(0, itemPreviewCount);
  return (
    <Link href={href} className="block">
      <DetailCard className="overflow-hidden px-5 py-5 sm:px-6 sm:py-6" style={{ background: theme.surface }}>
        <ModuleChrome
          eyebrow={module.eyebrow}
          title={module.title}
          headline={module.headline}
          summary={module.summary}
          accent={accent}
          action={<div className="text-[24px] text-ios-muted">›</div>}
        />
        {preview.length ? (
          <div className="mt-5 grid gap-3">
            {preview.map((item) => (
              <ModuleItemBox key={`${module.title}-${item.label}-${item.title}`} item={item} accent={accent} />
            ))}
          </div>
        ) : null}
      </DetailCard>
    </Link>
  );
}

export function AIPlannerTimelineLinkCard({
  href,
  accent,
  module,
  itemPreviewCount = 2,
}: {
  href: string;
  accent: Accent;
  module: AIPlannerTimelineModule;
  itemPreviewCount?: number;
}) {
  const theme = THEME[accent];
  const preview = module.items.slice(0, itemPreviewCount);
  return (
    <Link href={href} className="block">
      <DetailCard className="overflow-hidden px-5 py-5 sm:px-6 sm:py-6" style={{ background: theme.surface }}>
        <ModuleChrome
          eyebrow={module.eyebrow}
          title={module.title}
          headline={module.headline}
          summary={module.summary}
          accent={accent}
          action={<div className="text-[24px] text-ios-muted">›</div>}
        />
        {preview.length ? (
          <div className="mt-5 grid gap-3">
            {preview.map((item) => (
              <TimelineItemBox key={`${module.title}-${item.phase}-${item.focus}`} item={item} accent={accent} />
            ))}
          </div>
        ) : null}
      </DetailCard>
    </Link>
  );
}

export function AIPlannerModuleDetailCard({
  accent,
  module,
}: {
  accent: Accent;
  module: BasicModuleShape;
}) {
  const theme = THEME[accent];
  return (
    <DetailCard className="overflow-hidden px-5 py-5 sm:px-6 sm:py-6" style={{ background: theme.surface }}>
      <ModuleChrome
        eyebrow={module.eyebrow}
        title={module.title}
        headline={module.headline}
        summary={module.summary}
        accent={accent}
      />
      {module.items?.length ? (
        <div className="mt-5 grid gap-3">
          {module.items.map((item) => (
            <ModuleItemBox key={`${module.title}-${item.label}-${item.title}`} item={item} accent={accent} />
          ))}
        </div>
      ) : null}
    </DetailCard>
  );
}

export function AIPlannerTimelineDetailCard({
  accent,
  module,
}: {
  accent: Accent;
  module: AIPlannerTimelineModule;
}) {
  const theme = THEME[accent];
  return (
    <DetailCard className="overflow-hidden px-5 py-5 sm:px-6 sm:py-6" style={{ background: theme.surface }}>
      <ModuleChrome
        eyebrow={module.eyebrow}
        title={module.title}
        headline={module.headline}
        summary={module.summary}
        accent={accent}
      />
      {module.items.length ? (
        <div className="mt-5 grid gap-3">
          {module.items.map((item) => (
            <TimelineItemBox key={`${module.title}-${item.phase}-${item.focus}`} item={item} accent={accent} />
          ))}
        </div>
      ) : null}
    </DetailCard>
  );
}
