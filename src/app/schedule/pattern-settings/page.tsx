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

type TabId = "pattern" | "custom" | "scan";

const TABS: Array<{ id: TabId; label: string; icon: ReactNode }> = [
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
];

function IntroCard() {
  return (
    <div className="rounded-[32px] border border-white/60 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(250,250,251,0.98)_100%)] p-6 shadow-[0_24px_60px_rgba(15,23,42,0.06)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[22px] font-semibold tracking-[-0.03em] text-[#111827]">3교대 설정</div>
          <div className="mt-2 max-w-[620px] text-[13.5px] leading-7 text-[#6B7280]">
            패턴 적용, 병원별 근무 이름, 이미지 기반 일정 등록을 한 곳에서 정리합니다.
          </div>
        </div>
        <span className="inline-flex items-center rounded-full border border-black/5 bg-[#F7F7F8] px-3 py-1 text-[11px] font-semibold tracking-[-0.01em] text-[#4B5563]">
          Simple Setup
        </span>
      </div>
    </div>
  );
}

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
              "flex items-center justify-center gap-2 rounded-[22px] px-3 py-3 text-[13px] font-medium tracking-[-0.01em] transition-colors",
              activeTab === tab.id ? "bg-white text-[#111827] shadow-[0_10px_24px_rgba(15,23,42,0.06)]" : "text-[#6B7280] hover:bg-white/60"
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function PatternSettingsContent() {
  const router = useRouter();
  const store = useAppStore();
  const [activeTab, setActiveTab] = useState<TabId>("pattern");
  const selectedISO = store.selected ?? todayISO();
  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }
    router.push("/schedule");
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#FFFFFF_0%,#F7F7FA_46%,#F2F3F6_100%)]">
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
          <div>
            <div className="text-[16px] font-semibold tracking-[-0.02em] text-[#111827]">3교대 설정</div>
            <div className="text-[12px] text-[#6B7280]">간결하게 설정하고 바로 적용</div>
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-[980px] flex-col gap-5 px-4 py-6">
        <IntroCard />
        <TabBar activeTab={activeTab} onChange={setActiveTab} />

        {activeTab === "pattern" && (
          <div className="space-y-4">
            <div className="rounded-[28px] border border-white/60 bg-white/78 px-5 py-4 shadow-[0_16px_36px_rgba(15,23,42,0.05)] backdrop-blur-xl">
              <div className="text-[14px] font-semibold tracking-[-0.01em] text-[#111827]">기본 패턴 빠른 적용</div>
              <div className="mt-1.5 text-[12.5px] leading-6 text-[#6B7280]">D · E · N · M · OFF · VAC 또는 등록한 커스텀 이름으로 패턴을 입력하면 됩니다.</div>
            </div>
            <ShiftPatternQuickApplyCard selectedISO={selectedISO} />
          </div>
        )}

        {activeTab === "custom" && <CustomShiftManager />}

        {activeTab === "scan" && (
          <div className="space-y-4">
            <div className="rounded-[28px] border border-white/60 bg-white/78 px-5 py-4 shadow-[0_16px_36px_rgba(15,23,42,0.05)] backdrop-blur-xl">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-[14px] font-semibold tracking-[-0.01em] text-[#111827]">이미지 기반 일정 등록</div>
                  <div className="mt-1.5 text-[12.5px] leading-6 text-[#6B7280]">이미지를 올리고 검토 후 반영합니다. 이미지 자체는 저장하지 않고 요청 처리 중에만 사용합니다.</div>
                </div>
                <span className="inline-flex items-center rounded-full border border-[#DBEAFE] bg-[#EFF6FF] px-2.5 py-1 text-[11px] font-semibold text-[#2563EB]">
                  AI Import
                </span>
              </div>
            </div>
            <ShiftOCRUpload />
          </div>
        )}
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
