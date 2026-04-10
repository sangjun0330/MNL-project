"use client";

import { useState } from "react";
import type { SocialConnection } from "@/types/social";

type Props = {
  incoming: SocialConnection[];
  sent: SocialConnection[];
  onRefresh: () => void;
};

export function SocialPendingCard({ incoming, sent, onRefresh }: Props) {
  const [loadingId, setLoadingId] = useState<number | null>(null);

  const handleAction = async (id: number, action: "accept" | "reject" | "delete") => {
    if (loadingId) return;
    setLoadingId(id);
    try {
      await fetch(`/api/social/connections/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      onRefresh();
    } catch {}
    setLoadingId(null);
  };

  if (incoming.length === 0 && sent.length === 0) return null;

  return (
    <div className="space-y-2">
      {/* 받은 요청 */}
      {incoming.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
          <div className="px-4 pt-3 pb-1">
            <span className="text-[12px] font-semibold text-[color:var(--rnest-accent)]">
              연결 요청 {incoming.length}건
            </span>
          </div>
          <div className="divide-y divide-gray-100">
            {incoming.map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                <span className="text-[24px]">{c.avatarEmoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[13.5px] font-semibold text-gray-900 truncate">
                    {c.nickname || "익명"}
                  </p>
                  <p className="text-[12px] text-gray-500">연결 요청을 보냈어요</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    disabled={loadingId === c.id}
                    onClick={() => handleAction(c.id, "accept")}
                    className="rounded-full bg-[color:var(--rnest-accent)] px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition active:opacity-60 disabled:opacity-40"
                  >
                    수락
                  </button>
                  <button
                    type="button"
                    disabled={loadingId === c.id}
                    onClick={() => handleAction(c.id, "reject")}
                    className="rounded-full bg-gray-100 px-3.5 py-1.5 text-[12.5px] font-semibold text-gray-600 transition active:opacity-60 disabled:opacity-40"
                  >
                    거절
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 보낸 요청 */}
      {sent.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
          <div className="px-4 pt-3 pb-1">
            <span className="text-[12px] font-semibold text-gray-500">보낸 요청</span>
          </div>
          <div className="divide-y divide-gray-100">
            {sent.map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                <span className="text-[24px]">{c.avatarEmoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[13.5px] font-semibold text-gray-900 truncate">
                    {c.nickname || "익명"}
                    <span className="ml-2 text-[11px] font-normal text-gray-500">수락 대기 중</span>
                  </p>
                </div>
                <button
                  type="button"
                  disabled={loadingId === c.id}
                  onClick={() => handleAction(c.id, "delete")}
                  className="rounded-full bg-gray-100 px-3.5 py-1.5 text-[12.5px] font-semibold text-red-500 transition active:opacity-60 disabled:opacity-40"
                >
                  취소
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
