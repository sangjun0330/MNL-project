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
    label: "이미지 스캔",
    icon: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
        <circle cx="12" cy="13" r="4" />
      </svg>
    ),
  },
];

function PatternSettingsContent() {
  const router = useRouter();
  const store = useAppStore();
  const [activeTab, setActiveTab] = useState<TabId>("pattern");
  const selectedISO = store.selected ?? todayISO();

  return (
    <div className="min-h-screen bg-ios-bg">
      <div className="sticky top-0 z-20 border-b border-ios-sep bg-white/95 backdrop-blur-sm">
        <div className="flex items-center gap-2 px-4 py-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-ios-fill active:opacity-60"
            aria-label="뒤로"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <h1 className="text-[16px] font-semibold">3교대 패턴 설정</h1>
        </div>

        <div className="flex px-4">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 border-b-2 px-2 py-2.5 text-[13px] font-medium transition-colors",
                activeTab === tab.id ? "border-black text-black" : "border-transparent text-ios-muted hover:text-ios-label"
              )}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4 p-4">
        {activeTab === "pattern" && (
          <>
            <div className="rounded-xl bg-violet-50 px-4 py-3">
              <p className="text-[12.5px] font-medium text-violet-800">기본 패턴 빠른 적용</p>
              <p className="mt-0.5 text-[12px] text-violet-600">
                D·E·N·M·OFF·VAC 또는 등록한 커스텀 근무 이름으로 패턴을 입력하세요.
              </p>
            </div>
            <ShiftPatternQuickApplyCard selectedISO={selectedISO} />
          </>
        )}

        {activeTab === "custom" && (
          <>
            <div className="rounded-xl bg-violet-50 px-4 py-3">
              <p className="text-[12.5px] font-medium text-violet-800">병원별 근무 이름 등록</p>
              <p className="mt-0.5 text-[12px] text-violet-600">
                낮번, 야간특, AM 같은 이름을 등록하면 AI 스캔과 일정 표시에 자동 적용됩니다.
              </p>
            </div>
            <CustomShiftManager />
          </>
        )}

        {activeTab === "scan" && (
          <>
            <div className="rounded-xl bg-violet-50 px-4 py-3">
              <p className="text-[12.5px] font-medium text-violet-800">근무표 이미지 자동 등록</p>
              <p className="mt-0.5 text-[12px] text-violet-600">
                로그인 후 근무표 이미지를 올리면 AI가 표를 읽고 일정에 바로 반영할 수 있게 정리합니다.
              </p>
            </div>
            <ShiftOCRUpload />

            <div className="space-y-2.5 rounded-2xl border border-ios-sep bg-white p-4">
              <p className="text-[13px] font-semibold">처리 흐름</p>
              <ol className="list-decimal list-inside space-y-1.5 text-[12.5px] text-ios-muted">
                <li>근무표 이미지 또는 스크린샷을 업로드합니다.</li>
                <li>AI가 연월, 이름 후보, 날짜별 근무 표기를 구조화합니다.</li>
                <li>여러 명 근무표면 내 이름을 선택합니다.</li>
                <li>검토 후 덮어쓰기 또는 빈칸만 적용으로 일정에 반영합니다.</li>
                <li>모르는 근무 표기는 직접 지정하고 커스텀 이름으로 저장할 수 있습니다.</li>
              </ol>
              <div className="rounded-xl bg-ios-fill p-2.5 text-[11.5px] text-ios-muted">
                업로드 이미지는 저장하지 않고 요청 처리 중에만 사용합니다. AI 처리를 위해 외부 모델 API로 전송됩니다.
              </div>
            </div>
          </>
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
