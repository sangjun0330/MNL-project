"use client";

import { cn } from "@/lib/cn";

type Props = {
  checked: boolean;
  disabled?: boolean;
  loading?: boolean;
  healthShareEnabled: boolean;
  onChange: (next: boolean) => void;
};

export function SocialGroupAIBriefPersonalCardToggle({
  checked,
  disabled = false,
  loading = false,
  healthShareEnabled,
  onChange,
}: Props) {
  const interactive = !disabled && !loading && healthShareEnabled;

  return (
    <div className="rounded-[28px] bg-white px-4 py-4 shadow-apple">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-ios-text">내 개인 카드 그룹에 표시</p>
          <p className="mt-1 text-[12px] leading-5 text-ios-muted">
            변경하면 개인 카드 밴드에 바로 반영되고, 서버 응답으로 최종 정합성을 맞춥니다.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          onClick={() => {
            if (!interactive) return;
            onChange(!checked);
          }}
          disabled={!interactive}
          className={cn(
            "relative inline-flex h-8 w-14 shrink-0 items-center rounded-full transition",
            checked ? "bg-[color:var(--rnest-accent)]" : "bg-ios-sep",
            !interactive && "opacity-50"
          )}
        >
          <span
            className={cn(
              "absolute left-1 top-1 h-6 w-6 rounded-full bg-white shadow-sm transition",
              checked && "translate-x-6"
            )}
          />
        </button>
      </div>
      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-ios-muted">
        <span className="rounded-full bg-ios-bg px-3 py-1">AI 요약 06:00 · 18:00 KST 갱신</span>
        <span className="rounded-full bg-ios-bg px-3 py-1">라이브 데이터 자동 반영</span>
        {!healthShareEnabled ? (
          <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700">
            건강 공유를 켜야 개인 카드에 참여할 수 있어요.
          </span>
        ) : null}
      </div>
    </div>
  );
}
