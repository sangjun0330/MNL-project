"use client";

import type { ReactNode } from "react";
import { Suspense, useState } from "react";
import { useRouter } from "next/navigation";
import { todayISO } from "@/lib/date";
import { cn } from "@/lib/cn";
import { useAppStore } from "@/lib/store";
import { ShiftPatternQuickApplyCard } from "@/components/schedule/ShiftPatternQuickApplyCard";
import { CustomShiftManager } from "@/components/schedule/CustomShiftManager";
import { ShiftOCRUpload } from "@/components/schedule/ShiftOCRUpload";

type TabId = "scan" | "pattern" | "custom";

const TABS: Array<{ id: TabId; label: string; icon: ReactNode }> = [
  {
    id: "scan",
    label: "이미지 등록",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
        <circle cx="12" cy="13" r="4" />
      </svg>
    ),
  },
  {
    id: "pattern",
    label: "패턴 설정",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </svg>
    ),
  },
  {
    id: "custom",
    label: "근무 이름",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
    ),
  },
];

function TabBar({ activeTab, onChange }: { activeTab: TabId; onChange: (tab: TabId) => void }) {
  return (
    <div className="rounded-[28px] border border-white/60 bg-white/78 p-1.5 shadow-[0_18px_40px_rgba(15,23,42,0.05)] backdrop-blur-xl">
      <div className="grid grid-cols-3 gap-1.5">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn(
              "flex min-h-[68px] flex-col items-center justify-center gap-1.5 rounded-[22px] px-2 py-3 text-center text-[12px] font-medium leading-[1.15] tracking-[-0.01em] transition-colors sm:min-h-[56px] sm:flex-row sm:gap-2 sm:px-3 sm:text-[13px] sm:leading-none",
              activeTab === tab.id ? "bg-white text-[#111827] shadow-[0_10px_24px_rgba(15,23,42,0.06)]" : "text-[#6B7280] hover:bg-white/60"
            )}
          >
            {tab.icon}
            <span className="break-keep text-center">{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function PatternSettingsContent() {
  const router = useRouter();
  const store = useAppStore();
  const [activeTab, setActiveTab] = useState<TabId>("scan");
  const selectedISO = store.selected ?? todayISO();
  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/schedule");
  };

  return (
    <div className="schedule-config-page min-h-screen bg-[radial-gradient(circle_at_top,#FFFFFF_0%,#F7F7FA_46%,#F2F3F6_100%)]">
      <div className="sticky top-0 z-20 border-b border-white/50 bg-white/70 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-[980px] items-center gap-3 px-4 py-4">
          <button
            type="button"
            onClick={handleBack}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-black/5 bg-white text-[#111827] shadow-[0_8px_18px_rgba(15,23,42,0.05)] transition-colors hover:bg-[#F7F7F8]"
            aria-label="뒤로"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <div className="text-[16px] font-semibold tracking-[-0.02em] text-[#111827]">3교대 설정</div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-[980px] flex-col gap-4 px-4 py-6">
        <TabBar activeTab={activeTab} onChange={setActiveTab} />

        {activeTab === "scan" && <ShiftOCRUpload />}

        {activeTab === "pattern" && <ShiftPatternQuickApplyCard selectedISO={selectedISO} />}

        {activeTab === "custom" && <CustomShiftManager />}
      </div>
    </div>
  );
}

export default function PatternSettingsPage() {
  return (
    <Suspense>
      <PatternSettingsContent />
    </Suspense>
  );
}
