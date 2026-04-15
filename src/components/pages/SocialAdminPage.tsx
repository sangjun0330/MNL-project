"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authHeaders } from "@/lib/billing/client";
import { SocialAdminDashboardTab } from "@/components/social/admin/SocialAdminDashboardTab";
import { SocialAdminUsersTab } from "@/components/social/admin/SocialAdminUsersTab";
import { SocialAdminPostsTab } from "@/components/social/admin/SocialAdminPostsTab";
import { SocialAdminGroupsTab } from "@/components/social/admin/SocialAdminGroupsTab";
import { SocialAdminStoriesTab } from "@/components/social/admin/SocialAdminStoriesTab";
import { SocialAdminSecurityTab } from "@/components/social/admin/SocialAdminSecurityTab";

type AdminTab = "dashboard" | "users" | "posts" | "groups" | "stories" | "security";

const TABS: { id: AdminTab; label: string }[] = [
  { id: "dashboard", label: "대시보드" },
  { id: "users", label: "사용자" },
  { id: "posts", label: "게시글" },
  { id: "groups", label: "그룹" },
  { id: "stories", label: "스토리" },
  { id: "security", label: "보안 로그" },
];

export function SocialAdminPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<AdminTab>("dashboard");
  const [checkState, setCheckState] = useState<"loading" | "ok" | "forbidden">("loading");

  useEffect(() => {
    (async () => {
      try {
        const headers = await authHeaders();
        const res = await fetch("/api/admin/billing/access", {
          headers: { "content-type": "application/json", ...headers },
          cache: "no-store",
        });
        const json = await res.json().catch(() => null);
        setCheckState(json?.ok && json?.data?.isAdmin ? "ok" : "forbidden");
      } catch {
        setCheckState("forbidden");
      }
    })();
  }, []);

  const handleBack = useCallback(() => {
    router.push("/social");
  }, [router]);

  if (checkState === "loading") {
    return (
      <div className="min-h-screen bg-white">
        <header className="sticky top-0 z-30 border-b border-gray-100 bg-white/95 backdrop-blur-sm">
          <div className="flex items-center gap-3 px-4 py-3">
            <button
              type="button"
              onClick={handleBack}
              className="flex h-9 w-9 items-center justify-center rounded-full text-gray-700 transition hover:bg-gray-100 active:opacity-60"
              aria-label="뒤로가기"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <span className="text-[18px] font-bold text-gray-900">소셜 관리</span>
          </div>
        </header>
        <div className="flex items-center justify-center py-20">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-gray-200 border-t-[color:var(--rnest-accent)]" />
        </div>
      </div>
    );
  }

  if (checkState === "forbidden") {
    return (
      <div className="min-h-screen bg-white">
        <header className="sticky top-0 z-30 border-b border-gray-100 bg-white/95 backdrop-blur-sm">
          <div className="flex items-center gap-3 px-4 py-3">
            <button type="button" onClick={handleBack} className="flex h-9 w-9 items-center justify-center rounded-full text-gray-700 transition hover:bg-gray-100 active:opacity-60" aria-label="뒤로가기">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <span className="text-[18px] font-bold text-gray-900">소셜 관리</span>
          </div>
        </header>
        <div className="px-4 pt-12 text-center">
          <div className="text-4xl mb-4">🚫</div>
          <p className="text-[16px] font-semibold text-gray-900">접근 권한이 없습니다</p>
          <p className="mt-2 text-[13px] text-ios-muted">관리자 계정으로 로그인해야 이 페이지에 접근할 수 있습니다.</p>
          <button
            onClick={handleBack}
            className="mt-6 inline-flex h-10 items-center justify-center rounded-full bg-[color:var(--rnest-accent)] px-6 text-[14px] font-semibold text-white transition active:opacity-60"
          >
            소셜로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ios-bg">
      {/* 헤더 */}
      <header className="sticky top-0 z-30 border-b border-gray-100 bg-white/95 backdrop-blur-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleBack}
              className="flex h-9 w-9 items-center justify-center rounded-full text-gray-700 transition hover:bg-gray-100 active:opacity-60"
              aria-label="뒤로가기"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <div className="flex items-center gap-2">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[color:var(--rnest-accent)]">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <span className="text-[18px] font-bold text-gray-900">소셜 관리</span>
            </div>
          </div>
        </div>

        {/* 탭 바 */}
        <div className="flex overflow-x-auto scrollbar-none border-t border-gray-100">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`shrink-0 px-4 py-2.5 text-[13px] font-semibold transition-colors ${
                activeTab === tab.id
                  ? "border-b-2 border-[color:var(--rnest-accent)] text-[color:var(--rnest-accent)]"
                  : "text-ios-muted hover:text-gray-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      {/* 탭 콘텐츠 */}
      <div className="pt-2">
        {activeTab === "dashboard" && <SocialAdminDashboardTab />}
        {activeTab === "users" && <SocialAdminUsersTab />}
        {activeTab === "posts" && <SocialAdminPostsTab />}
        {activeTab === "groups" && <SocialAdminGroupsTab />}
        {activeTab === "stories" && <SocialAdminStoriesTab />}
        {activeTab === "security" && <SocialAdminSecurityTab />}
      </div>
    </div>
  );
}
