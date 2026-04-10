"use client";

import { useEffect, useMemo, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { SocialAvatarBadge } from "@/components/social/SocialAvatar";

export type SocialOverlapSelectorItem = {
  id: string;
  label: string;
  emoji?: string;
  description?: string;
};

type Props = {
  open: boolean;
  title: string;
  subtitle: string;
  noun: string;
  items: SocialOverlapSelectorItem[];
  selectedIds: string[];
  onClose: () => void;
  onApply: (selectedIds: string[]) => void;
};

export function SocialOverlapSelectorSheet({
  open,
  title,
  subtitle,
  noun,
  items,
  selectedIds,
  onClose,
  onApply,
}: Props) {
  const [draftSelectedIds, setDraftSelectedIds] = useState<string[]>(selectedIds);

  useEffect(() => {
    if (!open) return;
    setDraftSelectedIds(selectedIds);
  }, [open, selectedIds]);

  const draftSelectedIdSet = useMemo(() => new Set(draftSelectedIds), [draftSelectedIds]);

  const toggleItem = (id: string) => {
    setDraftSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]
    );
  };

  const footer = (
    <div className="flex gap-2">
      <Button
        variant="secondary"
        onClick={onClose}
        className="h-11 flex-1 rounded-2xl text-[13px]"
      >
        닫기
      </Button>
      <Button
        variant="primary"
        onClick={() => {
          onApply(draftSelectedIds);
          onClose();
        }}
        className="h-11 flex-1 rounded-2xl text-[13px]"
      >
        선택 적용
      </Button>
    </div>
  );

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      footer={footer}
      maxHeightClassName="max-h-[72dvh]"
    >
      <div className="space-y-3">
        <div className="rounded-3xl bg-white px-4 py-4 shadow-apple">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[13px] font-semibold text-ios-text">선택된 {noun}</p>
              <p className="mt-1 text-[12px] text-ios-muted">
                {draftSelectedIds.length}명 선택됨
              </p>
            </div>
            <span className="rounded-full bg-[color:var(--rnest-accent-soft)] px-3 py-1 text-[11px] font-semibold text-[color:var(--rnest-accent)]">
              내 일정 자동 포함
            </span>
          </div>
          {items.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setDraftSelectedIds(items.map((item) => item.id))}
                className="rounded-full bg-ios-bg px-3 py-1.5 text-[11px] font-semibold text-[color:var(--rnest-accent)] transition active:opacity-60"
              >
                전체 선택
              </button>
              <button
                type="button"
                onClick={() => setDraftSelectedIds([])}
                className="rounded-full bg-ios-bg px-3 py-1.5 text-[11px] font-semibold text-ios-muted transition active:opacity-60"
              >
                모두 해제
              </button>
            </div>
          ) : null}
        </div>

        {items.length === 0 ? (
          <div className="rounded-3xl bg-white px-4 py-5 text-[13px] text-ios-muted shadow-apple">
            선택할 수 있는 {noun}가 아직 없어요.
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => {
              const selected = draftSelectedIdSet.has(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => toggleItem(item.id)}
                  className={`flex w-full items-center gap-3 rounded-[28px] bg-white px-4 py-3 text-left shadow-apple transition active:opacity-80 ${
                    selected ? "ring-2 ring-[color:var(--rnest-accent)]/30" : ""
                  }`}
                >
                  <SocialAvatarBadge
                    emoji={item.emoji || "👤"}
                    className="h-12 w-12 shrink-0 rounded-2xl bg-ios-bg"
                    iconClassName="h-8 w-8"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-semibold text-ios-text">{item.label}</p>
                    <p className="mt-1 truncate text-[11.5px] text-ios-muted">
                      {item.description || "이 멤버와의 공통 쉬는 날을 계산해요."}
                    </p>
                  </div>
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[13px] font-bold transition ${
                      selected
                        ? "border-[color:var(--rnest-accent)] bg-[color:var(--rnest-accent)] text-white"
                        : "border-ios-sep bg-white text-transparent"
                    }`}
                    aria-hidden="true"
                  >
                    ✓
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
