"use client";

import { useEffect, useRef, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";

type Props = {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  prefillCode?: string | null;
  prefillMessage?: string | null;
};

const ERROR_MESSAGES: Record<string, string> = {
  code_not_found: "코드를 찾을 수 없어요. 다시 확인해 주세요.",
  cannot_connect_to_self: "내 코드는 입력할 수 없어요.",
  already_connected: "이미 연결된 친구예요.",
  request_already_pending: "이미 연결 요청을 보냈거나 받았어요.",
  blocked: "연결할 수 없는 사용자예요.",
  invalid_code_format: "코드는 6자리 영숫자예요.",
  too_many_requests: "너무 자주 시도하고 있어요. 잠시 후 다시 시도해 주세요.",
};

export function SocialConnectForm({ open, onClose, onSuccess, prefillCode, prefillMessage }: Props) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setInput(prefillCode ?? "");
    setError(null);
    setSuccess(null);
  }, [open, prefillCode]);

  // 시트가 열릴 때 자동 포커스 (키보드 표시)
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 350); // BottomSheet 애니메이션 완료 후
    return () => clearTimeout(timer);
  }, [open]);

  const handleClose = () => {
    setInput("");
    setError(null);
    setSuccess(null);
    onClose();
  };

  const handleChange = (v: string) => {
    // 대문자 영숫자만, 최대 6자
    const clean = v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    setInput(clean);
    setError(null);
    setSuccess(null);
  };

  const handleSubmit = async () => {
    if (input.length !== 6 || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/social/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: input }),
      }).then((r) => r.json());

      if (res.ok) {
        const name = res.data?.receiverNickname;
        setSuccess(
          name
            ? `${name}님께 연결 요청을 보냈어요!`
            : "연결 요청을 보냈어요! 상대방이 수락하면 일정을 볼 수 있어요."
        );
        setInput("");
        onSuccess?.();
      } else {
        setError(ERROR_MESSAGES[res.error] ?? "요청에 실패했어요. 다시 시도해 주세요.");
      }
    } catch {
      setError("네트워크 오류가 발생했어요.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={handleClose}
      title="친구 코드 입력"
      subtitle="친구에게 받은 6자리 코드를 입력하세요"
      variant="appstore"
    >
      <div className="pb-6">
        {prefillMessage && (
          <p className="mb-3 rounded-xl bg-[color:var(--rnest-accent-soft)] px-4 py-2.5 text-[13px] text-[color:var(--rnest-accent)]">
            {prefillMessage}
          </p>
        )}

        {/* 코드 입력 박스 — input이 전체 영역을 커버 */}
        <div className="relative mb-4 flex h-20 items-center justify-center rounded-2xl border-2 border-ios-sep bg-ios-bg transition focus-within:border-[color:var(--rnest-accent)]">
          {/* 6칸 시각 표시 (포인터 이벤트 차단하여 input이 클릭 받음) */}
          <div className="pointer-events-none flex gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className={`flex h-10 w-10 items-center justify-center rounded-xl border border-ios-sep text-[20px] font-bold transition ${
                  input[i]
                    ? "bg-[color:var(--rnest-accent-soft)] text-[color:var(--rnest-accent)]"
                    : "bg-white text-ios-muted"
                }`}
              >
                {input[i] ?? ""}
              </div>
            ))}
          </div>

          {/* 실제 input — 전체 영역 커버, 투명 */}
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => handleChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void handleSubmit();
            }}
            maxLength={6}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="characters"
            spellCheck={false}
            aria-label="친구 코드 입력"
            className="absolute inset-0 h-full w-full cursor-text rounded-2xl opacity-0"
          />
        </div>

        {/* 에러 / 성공 메시지 */}
        {error && (
          <p className="mb-3 rounded-xl bg-red-50 px-4 py-2.5 text-[13px] text-red-600">{error}</p>
        )}
        {success && (
          <p className="mb-3 rounded-xl bg-emerald-50 px-4 py-2.5 text-[13px] text-emerald-700">
            ✓ {success}
          </p>
        )}

        <Button
          variant="primary"
          disabled={input.length !== 6 || loading}
          onClick={handleSubmit}
          className="w-full rounded-2xl py-3.5 text-[15px]"
        >
          {loading ? "요청 중…" : "연결 요청 보내기"}
        </Button>
      </div>
    </BottomSheet>
  );
}
