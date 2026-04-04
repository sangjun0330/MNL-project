"use client";

import { useEffect, useMemo, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import type { SocialGroupSummary } from "@/types/social";
import { SocialGroupBadge } from "@/components/social/SocialGroupBadge";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (group: SocialGroupSummary) => void;
};

export function SocialGroupCreateSheet({ open, onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName("");
    setDescription("");
    setSaving(false);
    setError(null);
  }, [open]);

  const trimmedName = useMemo(() => Array.from(name.trim()).slice(0, 20).join(""), [name]);
  const trimmedDescription = useMemo(() => Array.from(description.trim()).slice(0, 80).join(""), [description]);

  const handleSubmit = async () => {
    if (!trimmedName || saving) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/social/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          description: trimmedDescription,
        }),
      }).then((r) => r.json());

      if (!res.ok) {
        if (res.error === "group_name_required") throw new Error("그룹 이름을 입력해 주세요.");
        if (res.error === "too_many_requests") throw new Error("그룹을 너무 자주 만들고 있어요. 잠시 후 다시 시도해 주세요.");
        if (res.error === "paid_plan_required_for_group_create") throw new Error("그룹 만들기는 Plus/Pro에서 사용할 수 있어요.");
        throw new Error("그룹을 만들지 못했어요.");
      }

      onCreated(res.data);
    } catch (err: any) {
      setError(String(err?.message ?? "그룹을 만들지 못했어요."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="새 그룹 만들기"
      subtitle="근무를 함께 보는 작은 팀 공간을 만들 수 있어요"
      variant="appstore"
      maxHeightClassName="max-h-[76dvh]"
    >
      <div className="space-y-4 pb-6">
        <div className="rounded-3xl bg-white px-4 py-4 shadow-apple">
          <div className="flex items-center gap-3">
            <SocialGroupBadge groupId={0} name={trimmedName || "G"} size="lg" />
            <div className="min-w-0">
              <p className="truncate text-[16px] font-semibold text-ios-text">
                {trimmedName || "그룹 이름을 입력해 주세요"}
              </p>
              <p className="mt-0.5 text-[12.5px] text-ios-muted">
                최대 12명까지 함께 근무 현황을 볼 수 있어요.
              </p>
            </div>
          </div>

          <div className="mt-4">
            <label className="mb-1.5 block text-[13px] font-semibold text-ios-text">
              그룹 이름 <span className="font-normal text-ios-muted">(최대 20자)</span>
            </label>
            <input
              value={name}
              onChange={(e) => {
                setName(Array.from(e.target.value).slice(0, 20).join(""));
                setError(null);
              }}
              placeholder="예: 3병동 야간팀"
              maxLength={40}
              className="w-full rounded-2xl border border-ios-sep bg-ios-bg px-4 py-3 text-[15px] text-ios-text outline-none transition focus:border-[color:var(--rnest-accent)] placeholder:text-ios-muted/60"
            />
          </div>

          <div className="mt-4">
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <label className="block text-[13px] font-semibold text-ios-text">
                그룹 소개 <span className="font-normal text-ios-muted">(선택)</span>
              </label>
              <span className="text-[12px] text-ios-muted">{Array.from(trimmedDescription).length}/80</span>
            </div>
            <textarea
              value={description}
              onChange={(e) => {
                setDescription(Array.from(e.target.value.replace(/[\r\n\t]+/g, " ")).slice(0, 80).join(""));
                setError(null);
              }}
              placeholder="간단한 소개를 적어 두면 초대받은 사람이 그룹을 더 잘 이해할 수 있어요"
              className="min-h-[96px] w-full resize-none rounded-2xl border border-ios-sep bg-ios-bg px-4 py-3 text-[14px] leading-6 text-ios-text outline-none transition focus:border-[color:var(--rnest-accent)] placeholder:text-ios-muted/60"
            />
          </div>

          <Button
            variant="primary"
            disabled={!trimmedName || saving}
            onClick={handleSubmit}
            className="mt-4 h-12 w-full rounded-2xl text-[15px]"
          >
            {saving ? "그룹 만드는 중…" : "그룹 만들기"}
          </Button>
        </div>

        {error ? (
          <p className="rounded-2xl bg-red-50 px-4 py-3 text-[13px] text-red-600">{error}</p>
        ) : null}
      </div>
    </BottomSheet>
  );
}
