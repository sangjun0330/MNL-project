"use client";

import { BottomSheet } from "@/components/ui/BottomSheet";
import {
  AI_RECOVERY_ORDER_COUNT_MAX,
  AI_RECOVERY_ORDER_COUNT_MIN,
  type AIRecoveryOrderGenerationOptions,
} from "@/lib/aiRecovery";

const COUNT_OPTIONS = Array.from(
  { length: AI_RECOVERY_ORDER_COUNT_MAX - AI_RECOVERY_ORDER_COUNT_MIN + 1 },
  (_, index) => AI_RECOVERY_ORDER_COUNT_MIN + index,
);

function OptionPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "inline-flex h-11 items-center justify-center rounded-full border px-4 text-[14px] font-semibold transition",
        active
          ? "border-[#8F83F7] bg-[rgba(244,240,255,0.96)] text-[#6B5CE7] shadow-[0_10px_24px_rgba(122,114,232,0.10)]"
          : "border-black/[0.08] bg-white text-[#4B5563]",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function LevelCard({
  active,
  title,
  description,
  onClick,
}: {
  active: boolean;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "w-full rounded-[24px] border px-4 py-4 text-left transition",
        active
          ? "border-[#8F83F7] bg-[rgba(244,240,255,0.96)] shadow-[0_10px_24px_rgba(122,114,232,0.10)]"
          : "border-black/[0.08] bg-white",
      ].join(" ")}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-[16px] font-semibold tracking-[-0.03em] text-[#111827]">{title}</div>
        <div
          className={[
            "flex h-6 w-6 items-center justify-center rounded-full border text-[12px] font-semibold",
            active ? "border-[#8F83F7] bg-[#8F83F7] text-white" : "border-black/[0.08] bg-white text-[#98A2B3]",
          ].join(" ")}
        >
          {active ? "✓" : ""}
        </div>
      </div>
      <p className="mt-2 break-keep text-[13px] leading-6 text-[#667085]">{description}</p>
    </button>
  );
}

export function AIRecoveryOrderOptionsSheet({
  open,
  onClose,
  value,
  onChange,
  onConfirm,
  busy = false,
  mode = "create",
}: {
  open: boolean;
  onClose: () => void;
  value: AIRecoveryOrderGenerationOptions;
  onChange: (next: AIRecoveryOrderGenerationOptions) => void;
  onConfirm: () => void;
  busy?: boolean;
  mode?: "create" | "regenerate";
}) {
  return (
    <BottomSheet
      open={open}
      onClose={busy ? () => {} : onClose}
      title="오더 생성 옵션"
      subtitle="개수와 레벨을 고른 뒤 오더를 생성하세요."
      variant="appstore"
      maxHeightClassName="max-h-[76dvh]"
      footer={
        <button
          type="button"
          disabled={busy}
          onClick={onConfirm}
          className="inline-flex h-12 w-full items-center justify-center rounded-full border-2 border-[#B8B0E8] bg-white text-[14px] font-semibold text-[#6B5CE7] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "만드는 중…" : mode === "regenerate" ? "이 설정으로 다시 만들기" : "이 설정으로 만들기"}
        </button>
      }
    >
      <div className="space-y-5">
        <section className="rounded-[28px] border border-black/[0.06] bg-white px-4 py-4">
          <div className="text-[12px] font-semibold tracking-[0.16em] text-[#8C95A6]">ORDER COUNT</div>
          <div className="mt-2 text-[18px] font-semibold tracking-[-0.03em] text-[#111827]">오더 생성 개수</div>
          <p className="mt-2 text-[13px] leading-6 text-[#667085]">1개부터 5개까지 선택할 수 있고, 기본값은 3개입니다.</p>
          <div className="mt-4 grid grid-cols-5 gap-2">
            {COUNT_OPTIONS.map((count) => (
              <OptionPill
                key={count}
                active={value.count === count}
                onClick={() => onChange({ ...value, count })}
              >
                {count}개
              </OptionPill>
            ))}
          </div>
        </section>

        <section className="rounded-[28px] border border-black/[0.06] bg-white px-4 py-4">
          <div className="text-[12px] font-semibold tracking-[0.16em] text-[#8C95A6]">LEVEL</div>
          <div className="mt-2 text-[18px] font-semibold tracking-[-0.03em] text-[#111827]">레벨 선택</div>
          <div className="mt-4 space-y-3">
            <LevelCard
              active={value.level === 1}
              title="1단계 · 심플"
              description="오더 문장을 더 단순하게 만들고, 시간·횟수·장소·조건 중 1가지만 드러나는 빠른 실행형 오더로 생성합니다."
              onClick={() => onChange({ ...value, level: 1 })}
            />
            <LevelCard
              active={value.level === 2}
              title="2단계 · 기본"
              description="현재 방식 그대로, 더 구체적인 실행 장면과 맥락이 보이는 오더로 생성합니다."
              onClick={() => onChange({ ...value, level: 2 })}
            />
          </div>
        </section>
      </div>
    </BottomSheet>
  );
}
