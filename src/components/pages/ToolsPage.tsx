"use client";

import Link from "next/link";
import { useBillingAccess } from "@/components/billing/useBillingAccess";
import { Card } from "@/components/ui/Card";
import { useI18n } from "@/lib/useI18n";

type ToolCategory = {
  id: "calculators" | "ai_search";
  name: string;
  description: string;
  href: string;
  keywords: string[];
  tone: "calculator" | "guide";
  quickLinks?: Array<{ label: string; href: string }>;
  secondaryLink?: { label: string; href: string };
};

const CATEGORY_CARDS: ToolCategory[] = [
  {
    id: "ai_search",
    name: "AI 임상 검색",
    description: "임상 질문에 AI가 즉시 답변합니다.",
    href: "/tools/med-safety",
    tone: "guide",
    keywords: ["ai", "검색", "질문", "약물", "기구", "임상", "간호", "안전"],
    quickLinks: [
      { label: "AI 검색", href: "/tools/med-safety" },
      { label: "최근 기록", href: "/tools/med-safety/recent" },
    ],
    secondaryLink: { label: "최근 검색 기록", href: "/tools/med-safety/recent" },
  },
  {
    id: "calculators",
    name: "통합 간호 계산기",
    description: "투약·주입·평가·임상 계산기를 한 페이지에서 전환합니다.",
    href: "/tools/nurse-calculators",
    tone: "calculator",
    keywords: [
      "계산기",
      "pump",
      "ivpb",
      "drip",
      "dilution",
      "check",
      "pediatric",
      "gcs",
      "bmi",
      "bsa",
      "crcl",
      "fluid balance",
      "unit converter",
      "소아",
      "체표면적",
      "수액",
      "단위 변환",
    ],
    quickLinks: [
      { label: "펌프", href: "/tools/nurse-calculators?tab=pump" },
      { label: "IVPB", href: "/tools/nurse-calculators?tab=ivpb" },
      { label: "GCS", href: "/tools/nurse-calculators?tab=gcs" },
      { label: "BMI", href: "/tools/nurse-calculators?tab=bmi" },
      { label: "CrCl", href: "/tools/nurse-calculators?tab=crcl" },
      { label: "수액 밸런스", href: "/tools/nurse-calculators?tab=fluid-balance" },
    ],
  },
];

function CategoryIcon({ tone }: { tone: ToolCategory["tone"] }) {
  if (tone === "guide") {
    return (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
        <path
          d="M14 3.5l8 3.2v6.4c0 5.1-3.2 9.4-8 11.4-4.8-2-8-6.3-8-11.4V6.7L14 3.5z"
          fill="#FFF1E2"
          stroke="#D97706"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path d="M14 8.2v8.8" stroke="#B45309" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M9.6 12.6H18.4" stroke="#B45309" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <rect x="4" y="3.5" width="20" height="21" rx="5" fill="#EEF4FF" stroke="#1D4ED8" strokeWidth="1.5" />
      <rect x="8" y="7.5" width="12" height="4" rx="2" fill="#BFDBFE" />
      <path d="M9 16h2.5" stroke="#1D4ED8" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M16.5 16H19" stroke="#1D4ED8" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M10.25 14.75v2.5" stroke="#1D4ED8" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="10.25" cy="20.25" r="1.2" fill="#1D4ED8" />
      <path d="M16 19.2l3 3" stroke="#1D4ED8" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M19 19.2l-3 3" stroke="#1D4ED8" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
      <path d="M5.5 3.5L9.5 7.5L5.5 11.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CreditBadge({ remaining }: { remaining: number }) {
  return (
    <span className="inline-flex items-center rounded-full border border-[color:var(--rnest-accent-border)] bg-[color:var(--rnest-accent-soft)] px-2.5 py-1 text-[11px] font-semibold text-[color:var(--rnest-accent)]">
      AI {remaining}회
    </span>
  );
}

export function ToolsPage() {
  const { t } = useI18n();
  const { loading: billingLoading, subscription } = useBillingAccess();
  const medSafetyRemaining = Math.max(0, Number(subscription?.medSafetyQuota?.totalRemaining ?? 0));

  return (
    <div className="mx-auto w-full max-w-[820px] px-4 pb-24 pt-6">
      <div className="mb-5">
        <div className="text-[30px] font-extrabold tracking-[-0.02em] text-ios-text">{t("툴")}</div>
      </div>

      <div className="space-y-4">
        {CATEGORY_CARDS.map((card) => (
            <Card
              key={card.id}
              className="overflow-hidden rounded-[30px] border border-ios-sep bg-white p-5 shadow-none transition hover:border-[color:var(--rnest-accent-border)]"
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] border border-ios-sep bg-[#F7F8FA]">
                    <CategoryIcon tone={card.tone} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-[22px] font-bold tracking-[-0.02em] text-ios-text">{t(card.name)}</div>
                      {card.id === "ai_search" && !billingLoading ? <CreditBadge remaining={medSafetyRemaining} /> : null}
                    </div>
                    <div className="mt-1 text-[13px] leading-6 text-ios-sub">{t(card.description)}</div>
                  </div>
                </div>
                <Link
                  href={card.href}
                  className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full border border-[color:var(--rnest-accent)] bg-[color:var(--rnest-accent-soft)] px-4 text-[13px] font-semibold text-[color:var(--rnest-accent)]"
                >
                  {t("열기")}
                  <ArrowIcon />
                </Link>
              </div>

              {card.quickLinks?.length ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {card.quickLinks.map((link) => (
                    <Link
                      key={`${card.id}-${link.label}`}
                      href={link.href}
                      className="inline-flex items-center rounded-full border border-ios-sep bg-[#F7F8FA] px-3 py-2 text-[12px] font-semibold text-ios-text"
                    >
                      {t(link.label)}
                    </Link>
                  ))}
                </div>
              ) : null}

              {card.secondaryLink ? (
                <div className="mt-4 border-t border-ios-sep pt-4">
                  <Link
                    href={card.secondaryLink.href}
                    className="inline-flex items-center gap-2 text-[12.5px] font-semibold text-[color:var(--rnest-accent)]"
                  >
                    {t(card.secondaryLink.label)}
                    <ArrowIcon />
                  </Link>
                </div>
              ) : null}
            </Card>
        ))}
      </div>
    </div>
  );
}

export default ToolsPage;
