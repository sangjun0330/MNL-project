"use client";

import { useEffect, useState } from "react";
import { fetchSocialAdminStories, deleteSocialAdminStory } from "@/lib/social/adminClient";
import type { SocialAdminStory } from "@/types/socialAdmin";

function formatExpiry(iso: string): string {
  if (!iso) return "-";
  try {
    const diff = new Date(iso).getTime() - Date.now();
    if (diff <= 0) return "만료됨";
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 0) return `${hours}시간 ${minutes}분 후 만료`;
    return `${minutes}분 후 만료`;
  } catch { return iso; }
}

const CONTENT_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  text: { label: "텍스트", color: "bg-blue-50 text-blue-600" },
  image: { label: "이미지", color: "bg-purple-50 text-purple-600" },
  recovery: { label: "회복카드", color: "bg-[#f6f4ff] text-[color:var(--rnest-accent)]" },
};

function ConfirmModal({ story, onConfirm, onCancel }: { story: SocialAdminStory; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-sm rounded-t-3xl sm:rounded-3xl bg-white p-6 shadow-2xl">
        <p className="text-[16px] font-bold text-gray-900 mb-2">스토리 삭제</p>
        <p className="text-[13px] text-ios-muted mb-4">
          <span className="font-semibold text-gray-800">{story.authorNickname}</span> 님의 스토리를 삭제합니다.
        </p>
        <div className="flex gap-2">
          <button className="flex-1 rounded-xl border border-ios-sep py-2.5 text-[14px] font-semibold text-gray-700 active:opacity-60" onClick={onCancel}>취소</button>
          <button className="flex-1 rounded-xl bg-red-500 py-2.5 text-[14px] font-semibold text-white active:opacity-60" onClick={onConfirm}>삭제</button>
        </div>
      </div>
    </div>
  );
}

export function SocialAdminStoriesTab() {
  const [stories, setStories] = useState<SocialAdminStory[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [confirmStory, setConfirmStory] = useState<SocialAdminStory | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    fetchSocialAdminStories({ limit: 100 })
      .then(({ stories: s, total: t }) => { setStories(s); setTotal(t); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function handleDelete() {
    if (!confirmStory) return;
    setDeletingId(confirmStory.id);
    setConfirmStory(null);
    try {
      await deleteSocialAdminStory(confirmStory.id);
      setStories((prev) => prev.filter((s) => s.id !== confirmStory.id));
      setTotal((t) => t - 1);
      setNotice("스토리를 삭제했습니다.");
    } catch {
      setNotice("삭제에 실패했습니다.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="pb-24">
      {notice && (
        <div className="mx-4 mt-3 rounded-2xl border border-gray-100 bg-white px-4 py-3 text-[13px] text-gray-700">
          {notice}
          <button className="ml-2 text-ios-muted text-[12px]" onClick={() => setNotice(null)}>✕</button>
        </div>
      )}

      <div className="px-4 pt-3 pb-2 text-[12px] text-ios-muted">
        활성 스토리 {total.toLocaleString()}개 (24시간 내)
      </div>

      {loading ? (
        <div className="space-y-2 px-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-2xl border border-ios-sep bg-white p-4 shadow-apple-sm h-16" />
          ))}
        </div>
      ) : (
        <div className="space-y-2 px-4">
          {stories.length === 0 && (
            <div className="py-8 text-center text-[13px] text-ios-muted">활성 스토리가 없습니다.</div>
          )}
          {stories.map((story) => {
            const typeInfo = CONTENT_TYPE_LABELS[story.contentType] ?? { label: story.contentType, color: "bg-gray-100 text-gray-600" };
            return (
              <div key={story.id} className="rounded-2xl border border-ios-sep bg-white p-4 shadow-apple-sm">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-0.5">
                      <span className="text-[13px] font-semibold text-gray-900 truncate">
                        {story.authorNickname || "알 수 없음"}
                      </span>
                      {story.authorHandle && (
                        <span className="text-[11px] text-ios-muted">@{story.authorHandle}</span>
                      )}
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${typeInfo.color}`}>
                        {typeInfo.label}
                      </span>
                    </div>
                    {story.textPreview && (
                      <p className="text-[12px] text-gray-600 line-clamp-1">{story.textPreview}</p>
                    )}
                    <div className="mt-1 text-[11px] text-ios-muted flex items-center gap-2">
                      <span>조회 {story.viewCount}</span>
                      <span>·</span>
                      <span>{formatExpiry(story.expiresAt)}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => setConfirmStory(story)}
                    disabled={deletingId === story.id}
                    className="shrink-0 rounded-full bg-red-50 px-3 py-1.5 text-[11px] font-semibold text-red-600 border border-red-200 active:opacity-60 disabled:opacity-40"
                  >
                    {deletingId === story.id ? "…" : "삭제"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {confirmStory && (
        <ConfirmModal story={confirmStory} onConfirm={handleDelete} onCancel={() => setConfirmStory(null)} />
      )}
    </div>
  );
}
