"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useBillingAccess } from "@/components/billing/useBillingAccess";
import { Card } from "@/components/ui/Card";
import { useI18n } from "@/lib/useI18n";

// ── Tool definitions ────────────────────────────────

type ToolItem = {
  id: string;
  emoji: string;
  name: string;
  description: string;
  href: string;
  badge: "LOCAL" | "NEW" | "AI";
  category: "medication" | "assessment" | "clinical" | "ai";
  keywords: string[];
};

const CATEGORIES = [
  { key: "medication" as const, label: "💉 투약·주입", count: 6 },
  { key: "assessment" as const, label: "📋 환자 평가", count: 3 },
  { key: "clinical" as const, label: "🧪 임상 계산", count: 3 },
  { key: "ai" as const, label: "🤖 AI 도구", count: 2 },
] as const;

const TOOLS: ToolItem[] = [
  // 💉 투약·주입
  {
    id: "pump",
    emoji: "💉",
    name: "펌프 변환",
    description: "처방 용량 → mL/hr 변환",
    href: "/tools/nurse-calculators?tab=pump",
    badge: "LOCAL",
    category: "medication",
    keywords: ["펌프", "pump", "ml/hr", "변환", "주입"],
  },
  {
    id: "ivpb",
    emoji: "💧",
    name: "IVPB 속도",
    description: "간헐적 정맥주입 속도 계산",
    href: "/tools/nurse-calculators?tab=ivpb",
    badge: "LOCAL",
    category: "medication",
    keywords: ["ivpb", "정맥주입", "속도", "간헐적"],
  },
  {
    id: "drip",
    emoji: "⏱️",
    name: "드립 환산",
    description: "mL/hr ↔ gtt/min 환산",
    href: "/tools/nurse-calculators?tab=drip",
    badge: "LOCAL",
    category: "medication",
    keywords: ["드립", "drip", "gtt", "환산"],
  },
  {
    id: "dilution",
    emoji: "🧴",
    name: "희석 농도",
    description: "희석 후 농도 계산",
    href: "/tools/nurse-calculators?tab=dilution",
    badge: "LOCAL",
    category: "medication",
    keywords: ["희석", "농도", "dilution"],
  },
  {
    id: "check",
    emoji: "✅",
    name: "역산 검산",
    description: "현재 펌프 설정 역산 검증",
    href: "/tools/nurse-calculators?tab=check",
    badge: "LOCAL",
    category: "medication",
    keywords: ["역산", "검산", "검증", "확인"],
  },
  {
    id: "pediatric-dose",
    emoji: "👶",
    name: "소아 용량",
    description: "체중 기반 mg/kg 용량 산출",
    href: "/tools/pediatric-dose",
    badge: "NEW",
    category: "medication",
    keywords: ["소아", "체중", "mg/kg", "pediatric", "용량"],
  },
  // 📋 환자 평가
  {
    id: "gcs",
    emoji: "🧠",
    name: "GCS 의식 평가",
    description: "Glasgow Coma Scale 점수",
    href: "/tools/gcs",
    badge: "NEW",
    category: "assessment",
    keywords: ["gcs", "의식", "glasgow", "coma"],
  },
  {
    id: "bmi",
    emoji: "📊",
    name: "BMI 계산",
    description: "체질량지수 (아시아 기준)",
    href: "/tools/bmi",
    badge: "NEW",
    category: "assessment",
    keywords: ["bmi", "체질량", "비만", "체중"],
  },
  {
    id: "bsa",
    emoji: "📐",
    name: "BSA 체표면적",
    description: "DuBois/Mosteller 체표면적",
    href: "/tools/bsa",
    badge: "NEW",
    category: "assessment",
    keywords: ["bsa", "체표면적", "dubois", "mosteller"],
  },
  // 🧪 임상 계산
  {
    id: "crcl",
    emoji: "🔬",
    name: "CrCl 신기능",
    description: "Cockcroft-Gault 청소율",
    href: "/tools/crcl",
    badge: "NEW",
    category: "clinical",
    keywords: ["crcl", "크레아티닌", "신기능", "cockcroft", "gault", "청소율"],
  },
  {
    id: "fluid-balance",
    emoji: "💦",
    name: "수액 밸런스",
    description: "섭취/배출 I/O 계산",
    href: "/tools/fluid-balance",
    badge: "NEW",
    category: "clinical",
    keywords: ["수액", "밸런스", "i/o", "intake", "output", "섭취", "배출"],
  },
  {
    id: "unit-converter",
    emoji: "🔄",
    name: "단위 변환기",
    description: "체온·체중·질량·용량 변환",
    href: "/tools/unit-converter",
    badge: "NEW",
    category: "clinical",
    keywords: ["단위", "변환", "체온", "celsius", "fahrenheit", "kg", "lb"],
  },
  // 🤖 AI 도구
  {
    id: "med-safety",
    emoji: "🛡️",
    name: "AI 약물·기구 안전 가이드",
    description: "투여 전 AI 안전 확인",
    href: "/tools/med-safety",
    badge: "AI",
    category: "ai",
    keywords: ["ai", "약물", "안전", "기구", "가이드", "med-safety"],
  },
  {
    id: "med-safety-recent",
    emoji: "📋",
    name: "최근 검색 기록",
    description: "AI 검색 히스토리",
    href: "/tools/med-safety/recent",
    badge: "AI",
    category: "ai",
    keywords: ["최근", "검색", "기록", "히스토리"],
  },
];

// ── Badge component ─────────────────────────────────

function ToolBadge({ badge, remainingText }: { badge: string; remainingText?: string }) {
  const cls =
    badge === "AI"
      ? "bg-purple-100 text-purple-700"
      : badge === "NEW"
        ? "bg-blue-100 text-blue-700"
        : "bg-gray-100 text-gray-600";
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}>
      {remainingText ?? badge}
    </span>
  );
}

// ── Main component ──────────────────────────────────

export function ToolsPage() {
  const { t } = useI18n();
  const { loading: billingLoading, subscription } = useBillingAccess();
  const medSafetyRemaining = Math.max(0, Number(subscription?.medSafetyQuota?.totalRemaining ?? 0));

  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!normalizedQuery) return null;
    return TOOLS.filter(
      (tool) =>
        tool.name.toLowerCase().includes(normalizedQuery) ||
        tool.description.toLowerCase().includes(normalizedQuery) ||
        tool.keywords.some((kw) => kw.includes(normalizedQuery)),
    );
  }, [normalizedQuery]);

  const getBadgeText = (tool: ToolItem) => {
    if (tool.badge === "AI" && !billingLoading) {
      return `${t("남은")} ${medSafetyRemaining}${t("회")}`;
    }
    return undefined;
  };

  return (
    <div className="mx-auto w-full max-w-[760px] px-4 pb-24 pt-6">
      {/* Header */}
      <div className="mb-5">
        <div className="text-[30px] font-extrabold tracking-[-0.02em] text-ios-text">{t("툴")}</div>
        <div className="mt-1 text-[13px] text-ios-sub">{t("현장에서 바로 쓰는 계산·안전 확인 도구입니다.")}</div>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <svg
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ios-muted"
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
        >
          <circle cx="7" cy="7" r="5.25" stroke="currentColor" strokeWidth="1.5" />
          <path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          type="text"
          className="w-full rounded-2xl border border-ios-sep bg-white py-3 pl-10 pr-4 text-[14px] outline-none placeholder:text-ios-muted focus:border-black"
          placeholder={t("계산기 검색...")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 rounded-full bg-black/10 p-1 transition hover:bg-black/15"
            aria-label="Clear"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        )}
      </div>

      {/* Search results */}
      {filtered !== null ? (
        filtered.length > 0 ? (
          <div className="space-y-2">
            {filtered.map((tool) => (
              <Link key={tool.id} href={tool.href} className="block">
                <Card className="flex items-center gap-3 p-4 transition hover:translate-y-[-1px] hover:border-[color:var(--rnest-accent-border)]">
                  <span className="text-[20px]">{tool.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-semibold text-ios-text">{t(tool.name)}</div>
                    <div className="text-[12px] text-ios-sub">{t(tool.description)}</div>
                  </div>
                  <ToolBadge badge={tool.badge} remainingText={getBadgeText(tool)} />
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <div className="py-16 text-center text-[14px] text-ios-muted">{t("검색 결과가 없습니다.")}</div>
        )
      ) : (
        /* Category grid */
        <div className="space-y-8">
          {CATEGORIES.map((cat) => {
            const tools = TOOLS.filter((t) => t.category === cat.key);
            return (
              <section key={cat.key}>
                <h2 className="mb-3 text-[15px] font-bold text-ios-text">{t(cat.label)}</h2>
                <div className="grid grid-cols-2 gap-2.5">
                  {tools.map((tool) => (
                    <Link key={tool.id} href={tool.href} className="block">
                      <Card className="flex h-full flex-col p-4 transition hover:translate-y-[-1px] hover:border-[color:var(--rnest-accent-border)]">
                        <div className="mb-2 flex items-center justify-between">
                          <span className="text-[22px]">{tool.emoji}</span>
                          <ToolBadge badge={tool.badge} remainingText={getBadgeText(tool)} />
                        </div>
                        <div className="text-[13px] font-semibold text-ios-text">{t(tool.name)}</div>
                        <div className="mt-0.5 text-[11px] leading-snug text-ios-sub">{t(tool.description)}</div>
                      </Card>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default ToolsPage;
