"use client";

import { useEffect, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";

type Props = {
  open: boolean;
  onClose: () => void;
};

export function SocialMyCode({ open, onClose }: Props) {
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    if (!open || code) return;
    setLoading(true);
    fetch("/api/social/code")
      .then((r) => r.json())
      .then((res) => {
        if (res.ok) setCode(res.data.code);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, code]);

  const handleCopy = () => {
    if (!code) return;
    navigator.clipboard
      .writeText(code)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  };

  const handleShare = () => {
    if (!code) return;
    const text = `내 WNL 연결 코드: ${code}\n코드를 입력하면 서로의 근무 일정을 볼 수 있어요!`;
    const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
    if (typeof nav.share === "function") {
      nav.share({ text }).catch(() => {});
    } else if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
  };

  const handleRegenerate = async () => {
    if (regenerating) return;
    setRegenerating(true);
    try {
      const res = await fetch("/api/social/code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regenerate: true }),
      }).then((r) => r.json());
      if (res.ok) setCode(res.data.code);
    } catch {}
    setRegenerating(false);
  };

  // 코드를 3자리씩 포맷: "RN4B2K" → "RN4 · B2K"
  const formatted = code
    ? code.slice(0, 3) + " · " + code.slice(3)
    : "------";

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="내 연결 코드"
      subtitle="친구에게 코드를 알려주면 연결 요청을 보낼 수 있어요"
      variant="appstore"
    >
      <div className="flex flex-col items-center pb-6 pt-2">
        {/* 코드 표시 */}
        <div className="mb-6 flex h-24 w-full items-center justify-center rounded-2xl bg-ios-bg">
          {loading ? (
            <span className="text-[18px] font-semibold tracking-widest text-ios-muted">로드 중…</span>
          ) : (
            <span className="select-all text-[28px] font-bold tracking-widest text-ios-text">
              {formatted}
            </span>
          )}
        </div>

        {/* 액션 버튼 */}
        <div className="flex w-full gap-3">
          <button
            type="button"
            onClick={handleCopy}
            disabled={!code || loading}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-ios-bg py-3.5 text-[14px] font-semibold text-ios-text transition active:opacity-60 disabled:opacity-40"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            {copied ? "복사됨!" : "코드 복사"}
          </button>
          <button
            type="button"
            onClick={handleShare}
            disabled={!code || loading}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-ios-bg py-3.5 text-[14px] font-semibold text-ios-text transition active:opacity-60 disabled:opacity-40"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
            공유하기
          </button>
        </div>

        {/* 재생성 */}
        <button
          type="button"
          onClick={handleRegenerate}
          disabled={regenerating || loading}
          className="mt-4 text-[12.5px] text-ios-muted underline underline-offset-2 transition active:opacity-60 disabled:opacity-40"
        >
          {regenerating ? "재생성 중…" : "코드 재생성 (기존 친구 연결 유지)"}
        </button>
      </div>
    </BottomSheet>
  );
}
