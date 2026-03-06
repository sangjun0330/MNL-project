"use client";

import { useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";

const AVATAR_OPTIONS = ["🐧", "🦊", "🐱", "🐻", "🦁", "🐺", "🦅", "🐬"];

type Props = {
  open: boolean;
  onComplete: () => void;
  onSkip: () => void;
};

export function SocialOnboarding({ open, onComplete, onSkip }: Props) {
  const [nickname, setNickname] = useState("");
  const [avatar, setAvatar] = useState("🐧");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const trimmed = nickname.trim();
    if (!trimmed) {
      setError("닉네임을 입력해 주세요.");
      return;
    }
    if (trimmed.length > 12) {
      setError("닉네임은 12자 이하로 입력해 주세요.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/social/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: trimmed, avatarEmoji: avatar }),
      }).then((r) => r.json());

      if (res.ok) {
        onComplete();
      } else {
        setError("저장에 실패했어요. 다시 시도해 주세요.");
      }
    } catch {
      setError("네트워크 오류가 발생했어요. 나중에 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={onSkip}
      title="소셜 기능을 시작해요"
      subtitle="친구에게 보여질 닉네임과 아바타를 선택하세요"
      variant="appstore"
    >
      <div className="pb-6 space-y-5">
        {/* 닉네임 */}
        <div>
          <label className="mb-1.5 block text-[13px] font-semibold text-ios-text">
            닉네임 <span className="font-normal text-ios-muted">(최대 12자)</span>
          </label>
          <input
            value={nickname}
            onChange={(e) => {
              setNickname(e.target.value.slice(0, 12));
              setError(null);
            }}
            placeholder="닉네임 입력"
            maxLength={12}
            className="w-full rounded-2xl border border-ios-sep bg-ios-bg px-4 py-3 text-[15px] text-ios-text outline-none transition focus:border-[color:var(--rnest-accent)] placeholder:text-ios-muted/60"
          />
        </div>

        {/* 아바타 */}
        <div>
          <label className="mb-2 block text-[13px] font-semibold text-ios-text">아바타</label>
          <div className="flex flex-wrap gap-3">
            {AVATAR_OPTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => setAvatar(emoji)}
                className={`flex h-12 w-12 items-center justify-center rounded-2xl text-[24px] transition active:scale-95 ${
                  avatar === emoji
                    ? "bg-[color:var(--rnest-accent-soft)] ring-2 ring-[color:var(--rnest-accent)]"
                    : "bg-ios-bg"
                }`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className="rounded-xl bg-red-50 px-4 py-2.5 text-[13px] text-red-600">{error}</p>
        )}

        <Button
          variant="primary"
          disabled={!nickname.trim() || loading}
          onClick={handleSubmit}
          className="w-full rounded-2xl py-3.5 text-[15px]"
        >
          {loading ? "저장 중…" : "시작하기"}
        </Button>

        {/* 네트워크 실패 시 탈출구 */}
        <button
          type="button"
          onClick={onSkip}
          className="w-full text-center text-[12.5px] text-ios-muted transition active:opacity-60"
        >
          나중에 설정하기
        </button>
      </div>
    </BottomSheet>
  );
}
