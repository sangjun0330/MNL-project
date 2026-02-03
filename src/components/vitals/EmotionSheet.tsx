"use client";

import { useEffect, useMemo, useState } from "react";
import type { ISODate } from "@/lib/date";
import type { EmotionEntry, MoodScore } from "@/lib/model";
import { useAppStore } from "@/lib/store";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";

function moodEmoji(m: MoodScore) {
  return m === 1 ? "☹️" : m === 2 ? "😕" : m === 3 ? "😐" : m === 4 ? "🙂" : "😄";
}

export function EmotionSheet({
  open,
  onClose,
  iso,
  value,
  onSave,
  onClear,
}: {
  open: boolean;
  onClose: () => void;
  iso: ISODate;
  value?: EmotionEntry;
  onSave: (entry: Omit<EmotionEntry, "createdAt"> & { createdAt?: number }) => void;
  onClear: () => void;
}) {
  const store = useAppStore();

  const [mood, setMood] = useState<MoodScore>(3);
  const [tags, setTags] = useState<string[]>([]);
  const [custom, setCustom] = useState("");

  useEffect(() => {
    if (!open) return;
    setMood((value?.mood ?? 3) as MoodScore);
    setTags(value?.tags ?? []);
    setCustom("");
  }, [open, value]);

  const grouped = useMemo(() => {
    const posPreset = store.settings.emotionTagsPositive ?? [];
    const negPreset = store.settings.emotionTagsNegative ?? [];
    return [
      { title: "좋았던 이유", list: posPreset },
      { title: "힘들었던 이유", list: negPreset },
    ];
  }, [store.settings.emotionTagsPositive, store.settings.emotionTagsNegative]);

  const toggle = (t: string) => {
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  };

  const addCustom = () => {
    const raw = custom.trim();
    if (!raw) return;
    const t = raw.startsWith("#") ? raw : `#${raw}`;
    setCustom("");
    setTags((prev) => (prev.includes(t) ? prev : [...prev, t]));
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="감정 차팅" subtitle={`${iso} · 1~5 + 태그`}>
      <div className="space-y-5">
        <div className="rounded-2xl border border-ios-sep bg-white p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[13px] font-semibold">오늘 기분</div>
              <div className="mt-1 text-[12.5px] text-ios-muted">{moodEmoji(mood)} {mood}/5</div>
            </div>
            <div className="text-[28px]">{moodEmoji(mood)}</div>
          </div>

          <input
            className="mt-3 w-full"
            type="range"
            min={1}
            max={5}
            step={1}
            value={mood}
            onChange={(e) => setMood(Number(e.target.value) as MoodScore)}
          />
        </div>

        <div className="rounded-2xl border border-ios-sep bg-white p-4">
          <div className="text-[13px] font-semibold">태그</div>
          <div className="mt-1 text-[12.5px] text-ios-muted">설정에 등록된 프리셋 + 직접 추가</div>

          <div className="mt-4 space-y-4">
            {grouped.map((g) => (
              <div key={g.title}>
                <div className="mb-2 text-[12px] font-semibold text-ios-muted">{g.title}</div>
                <div className="flex flex-wrap gap-2">
                  {g.list.length === 0 ? (
                    <div className="text-[12.5px] text-ios-muted">(설정에서 프리셋을 추가해줘)</div>
                  ) : (
                    g.list.map((t) => {
                      const active = tags.includes(t);
                      return (
                        <button
                          key={t}
                          onClick={() => toggle(t)}
                          className={cn(
                            "rounded-full border px-3 py-1 text-[12px] font-semibold",
                            active ? "border-black bg-black text-white" : "border-ios-sep bg-white text-ios-text"
                          )}
                        >
                          {t}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex gap-2">
            <Input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="#태그 추가" />
            <Button variant="secondary" onClick={addCustom}>
              추가
            </Button>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={() => {
              onSave({ mood, tags });
              onClose();
            }}
          >
            저장
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              onClear();
              onClose();
            }}
          >
            삭제
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
