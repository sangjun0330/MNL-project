"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchSocialAdminSecurity } from "@/lib/social/adminClient";
import type { SocialAdminSecurityLog } from "@/types/socialAdmin";

const PAGE_SIZE = 60;

function formatDateTime(iso: string): string {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleString("ko-KR", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch { return iso; }
}

const ACTION_OPTIONS = [
  "",
  "post_create",
  "story_create",
  "group_create",
  "follow",
  "connect",
  "friend_request",
];

export function SocialAdminSecurityTab() {
  const [logs, setLogs] = useState<SocialAdminSecurityLog[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [actionFilter, setActionFilter] = useState("");
  const [userIdFilter, setUserIdFilter] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback((action: string, userId: string, off: number) => {
    setLoading(true);
    fetchSocialAdminSecurity({
      action: action || undefined,
      userId: userId || undefined,
      limit: PAGE_SIZE,
      offset: off,
    })
      .then(({ logs: l, total: t }) => { setLogs(l); setTotal(t); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => { load(actionFilter, userIdFilter, offset); }, [load, offset]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleApply() {
    setOffset(0);
    load(actionFilter, userIdFilter, 0);
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div className="pb-24">
      {/* 필터 */}
      <div className="px-4 py-3 space-y-2">
        <div className="flex gap-2">
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="flex-1 rounded-xl border border-ios-sep bg-white px-3 py-2.5 text-[13px] text-gray-700 outline-none"
          >
            {ACTION_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>{opt || "전체 액션"}</option>
            ))}
          </select>
          <button
            onClick={handleApply}
            className="rounded-xl bg-[color:var(--rnest-accent)] px-4 py-2.5 text-[13px] font-semibold text-white active:opacity-60"
          >
            조회
          </button>
        </div>
        <input
          value={userIdFilter}
          onChange={(e) => setUserIdFilter(e.target.value)}
          placeholder="사용자 ID 필터 (선택)"
          className="w-full rounded-xl border border-ios-sep bg-white px-4 py-2.5 text-[13px] text-gray-700 outline-none focus:border-[color:var(--rnest-accent)]"
        />
      </div>

      <div className="px-4 pb-2 text-[12px] text-ios-muted">총 {total.toLocaleString()}건</div>

      {loading ? (
        <div className="space-y-2 px-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-xl bg-white border border-ios-sep h-14" />
          ))}
        </div>
      ) : (
        <div className="px-4 space-y-1.5">
          {logs.length === 0 && (
            <div className="py-8 text-center text-[13px] text-ios-muted">로그가 없습니다.</div>
          )}
          {logs.map((log) => (
            <div
              key={log.id}
              className={`rounded-xl border px-3 py-2.5 ${
                log.success
                  ? "bg-white border-ios-sep"
                  : "bg-red-50 border-red-200"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[12px] font-bold ${log.success ? "text-gray-900" : "text-red-700"}`}>
                      {log.action}
                    </span>
                    <span className={`text-[10px] font-semibold rounded-full px-1.5 py-0.5 ${
                      log.success ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                    }`}>
                      {log.success ? "✓ 성공" : "✗ 실패"}
                    </span>
                  </div>
                  <div className="text-[11px] text-ios-muted mt-0.5 space-x-2">
                    <span>사용자: {log.actorUserId}</span>
                    <span>·</span>
                    <span>IP: {log.actorIp}</span>
                    {log.detail && (
                      <>
                        <span>·</span>
                        <span className="italic">{String(log.detail).slice(0, 40)}</span>
                      </>
                    )}
                  </div>
                </div>
                <span className="text-[10px] text-ios-muted shrink-0">{formatDateTime(log.createdAt)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 py-4 px-4">
          <button onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))} disabled={offset === 0} className="rounded-full border border-ios-sep px-4 py-2 text-[13px] font-semibold disabled:opacity-40 active:opacity-60">이전</button>
          <span className="text-[13px] text-ios-muted">{currentPage} / {totalPages}</span>
          <button onClick={() => setOffset(offset + PAGE_SIZE)} disabled={offset + PAGE_SIZE >= total} className="rounded-full border border-ios-sep px-4 py-2 text-[13px] font-semibold disabled:opacity-40 active:opacity-60">다음</button>
        </div>
      )}
    </div>
  );
}
