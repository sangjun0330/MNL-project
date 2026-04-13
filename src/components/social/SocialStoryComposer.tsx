"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { BOTTOM_SHEET_DURATION_MS, BottomSheet } from "@/components/ui/BottomSheet";
import type { RecoveryCardSnapshot, SocialStoryContentType } from "@/types/social";
import { useAppStoreSelector } from "@/lib/store";
import { todayISO } from "@/lib/date";

// 배경색 팔레트 (인스타그램 스타일)
const BG_PALETTE = [
  "#1e1e2e",
  "#6c63ff",
  "#ee2a7b",
  "#f9ce34",
  "#4ade80",
  "#38bdf8",
];

const TEXT_COLORS = ["#ffffff", "#1e1e2e", "#f9ce34", "#ee2a7b", "#4ade80"];

type Props = {
  open: boolean;
  onClose: () => void;
  onPosted?: () => void;
};

type StoryType = SocialStoryContentType;

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" className={className}>
      <path d="M18 6 6 18" /><path d="m6 6 12 12" />
    </svg>
  );
}

function ImageIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}

function TextIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="4 7 4 4 20 4 20 7" />
      <line x1="9" y1="20" x2="15" y2="20" />
      <line x1="12" y1="4" x2="12" y2="20" />
    </svg>
  );
}

function BoltIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0 1 12 2v5h4a1 1 0 0 1 .82 1.573l-7 10A1 1 0 0 1 8 18v-5H4a1 1 0 0 1-.82-1.573l7-10a1 1 0 0 1 1.12-.38z" clipRule="evenodd" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className={className}>
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

export function SocialStoryComposer({ open, onClose, onPosted }: Props) {
  const today = todayISO();
  const bio = useAppStoreSelector((s) => s.bio as Record<string, unknown>);
  const emotions = useAppStoreSelector((s) => s.emotions as Record<string, unknown>);
  const schedule = useAppStoreSelector((s) => s.schedule as Record<string, string>);

  const todayBio = (bio[today] ?? null) as Record<string, unknown> | null;
  const todayEmotion = (emotions[today] ?? null) as Record<string, unknown> | null;
  const todayShift: string | null = schedule[today] ?? null;

  // 회복 카드 스냅샷 추정
  const recoverySnapshot = useMemo<RecoveryCardSnapshot>(() => {
    const sleep = typeof todayBio?.sleepHours === "number" ? (todayBio.sleepHours as number) : null;
    const stress = typeof todayBio?.stress === "number" ? (todayBio.stress as number) : null;
    const mood = typeof todayBio?.mood === "number"
      ? (todayBio.mood as number)
      : typeof todayEmotion?.mood === "number" ? (todayEmotion.mood as number) : null;

    const sleepScore = sleep !== null ? Math.min(100, (sleep / 8) * 100) : 70;
    const stressScore = stress !== null ? Math.max(0, 100 - stress * 25) : 70;
    const moodScore = mood !== null ? (mood / 5) * 100 : 70;
    const batteryAvg = Math.round(sleepScore * 0.4 + stressScore * 0.35 + moodScore * 0.25);

    const sleepDebt = sleep !== null ? Math.max(0, 8 - sleep) : null;

    const shiftLabel = todayShift
      ? { day: "데이", evening: "이브닝", night: "야간", off: "휴무" }[todayShift] ?? todayShift
      : null;
    const headline = shiftLabel
      ? `${shiftLabel} 근무 · 회복 점수 ${batteryAvg}%`
      : `오늘의 회복 점수 ${batteryAvg}%`;

    return { headline, batteryAvg, sleepDebtHours: sleepDebt, weekDays: 1 };
  }, [todayBio, todayEmotion, todayShift]);

  const [storyType, setStoryType] = useState<StoryType>("text");
  const [text, setText] = useState("");
  const [bgColor, setBgColor] = useState(BG_PALETTE[0]!);
  const [textColor, setTextColor] = useState(TEXT_COLORS[0]!);
  const [selectedImage, setSelectedImage] = useState<{ file: File; previewUrl: string } | null>(null);
  const [recoveryHeadline, setRecoveryHeadline] = useState(recoverySnapshot.headline);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = useCallback(() => {
    setText("");
    setBgColor(BG_PALETTE[0]!);
    setTextColor(TEXT_COLORS[0]!);
    setSelectedImage(null);
    setStoryType("text");
    setError(null);
    setSubmitting(false);
  }, []);

  const handleClose = useCallback(() => {
    if (selectedImage) URL.revokeObjectURL(selectedImage.previewUrl);
    setTimeout(resetState, BOTTOM_SHEET_DURATION_MS);
    onClose();
  }, [onClose, resetState, selectedImage]);

  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (selectedImage) URL.revokeObjectURL(selectedImage.previewUrl);
    setSelectedImage({ file, previewUrl: URL.createObjectURL(file) });
    setStoryType("image");
  }, [selectedImage]);

  const handleSubmit = useCallback(async () => {
    if (submitting) return;
    if (storyType === "text" && !text.trim()) { setError("텍스트를 입력해 주세요."); return; }
    if (storyType === "image" && !selectedImage) { setError("이미지를 선택해 주세요."); return; }

    setError(null);
    setSubmitting(true);

    try {
      let mediaPath: string | null = null;

      // 이미지 업로드 처리
      if (storyType === "image" && selectedImage) {
        const ext = selectedImage.file.name.split(".").pop() ?? "jpg";
        const uploadPath = `story_${crypto.randomUUID()}.${ext}`;
        const uploadRes = await fetch(`/api/social/stories/upload?path=${encodeURIComponent(uploadPath)}`, {
          method: "POST",
          headers: { "Content-Type": selectedImage.file.type },
          body: selectedImage.file,
        });
        if (uploadRes.ok) {
          const uploadData = await uploadRes.json() as { path?: string };
          mediaPath = uploadData.path ?? uploadPath;
        }
      }

      const body: Record<string, unknown> = { contentType: storyType };

      if (storyType === "text") {
        body.text = text.trim();
        body.bgColor = bgColor;
        body.textColor = textColor;
      } else if (storyType === "image") {
        body.mediaPath = mediaPath;
        body.text = text.trim() || null;
      } else if (storyType === "recovery") {
        body.recoverySnapshot = { ...recoverySnapshot, headline: recoveryHeadline };
        body.bgColor = bgColor;
      }

      const res = await fetch("/api/social/stories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json() as { ok: boolean; error?: string };

      if (!data.ok) {
        setError(data.error ?? "스토리를 올리지 못했어요. 다시 시도해 주세요.");
        setSubmitting(false);
        return;
      }

      if (selectedImage) URL.revokeObjectURL(selectedImage.previewUrl);
      onPosted?.();
      setTimeout(resetState, BOTTOM_SHEET_DURATION_MS);
      onClose();
    } catch {
      setError("연결 오류가 발생했어요. 다시 시도해 주세요.");
      setSubmitting(false);
    }
  }, [submitting, storyType, text, selectedImage, bgColor, textColor, recoverySnapshot, recoveryHeadline, onPosted, onClose, resetState]);

  const canSubmit =
    (storyType === "text" && text.trim().length > 0) ||
    (storyType === "image" && selectedImage !== null) ||
    storyType === "recovery";

  return (
    <BottomSheet open={open} onClose={handleClose} title="새 스토리" maxHeightClassName="max-h-[92dvh]">
      <div className="flex flex-col h-full">
        {/* 타입 탭 */}
        <div className="flex border-b border-gray-100 shrink-0">
          {([
            { type: "text" as StoryType, label: "텍스트", Icon: TextIcon },
            { type: "image" as StoryType, label: "이미지", Icon: ImageIcon },
            { type: "recovery" as StoryType, label: "회복 카드", Icon: BoltIcon },
          ] as const).map(({ type, label, Icon }) => (
            <button
              key={type}
              type="button"
              onClick={() => setStoryType(type)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-[13px] font-medium border-b-2 transition-colors ${
                storyType === type
                  ? "border-[color:var(--rnest-accent)] text-[color:var(--rnest-accent)]"
                  : "border-transparent text-gray-400"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* 텍스트 스토리 */}
          {storyType === "text" && (
            <div className="p-4 flex flex-col gap-4">
              {/* 미리보기 */}
              <div
                className="w-full rounded-[16px] overflow-hidden flex items-center justify-center"
                style={{ backgroundColor: bgColor, aspectRatio: "9/16", maxHeight: "320px" }}
              >
                <p
                  className="text-[22px] font-bold text-center whitespace-pre-wrap px-8 drop-shadow-md"
                  style={{ color: textColor }}
                >
                  {text || "텍스트를 입력하세요"}
                </p>
              </div>

              {/* 텍스트 입력 */}
              <textarea
                className="w-full rounded-xl border border-gray-200 px-3 py-3 text-[14px] resize-none focus:outline-none focus:ring-2 focus:ring-[color:var(--rnest-accent)]/40"
                rows={4}
                maxLength={200}
                placeholder="스토리에 쓸 내용을 입력하세요..."
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <p className="text-[11px] text-gray-400 text-right -mt-2">{text.length}/200</p>

              {/* 배경색 선택 */}
              <div>
                <p className="text-[12px] text-gray-500 font-medium mb-2">배경색</p>
                <div className="flex gap-2">
                  {BG_PALETTE.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setBgColor(color)}
                      className={`h-8 w-8 rounded-full transition-transform ${bgColor === color ? "scale-125 ring-2 ring-offset-1 ring-gray-400" : ""}`}
                      style={{ backgroundColor: color }}
                      aria-label={`배경색 ${color}`}
                    />
                  ))}
                </div>
              </div>

              {/* 텍스트색 선택 */}
              <div>
                <p className="text-[12px] text-gray-500 font-medium mb-2">텍스트 색상</p>
                <div className="flex gap-2">
                  {TEXT_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setTextColor(color)}
                      className={`h-8 w-8 rounded-full border border-gray-200 transition-transform ${textColor === color ? "scale-125 ring-2 ring-offset-1 ring-gray-400" : ""}`}
                      style={{ backgroundColor: color }}
                      aria-label={`텍스트 색상 ${color}`}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* 이미지 스토리 */}
          {storyType === "image" && (
            <div className="p-4 flex flex-col gap-4">
              {selectedImage ? (
                <div className="relative w-full rounded-[16px] overflow-hidden" style={{ aspectRatio: "9/16", maxHeight: "320px" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={selectedImage.previewUrl} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => {
                      URL.revokeObjectURL(selectedImage.previewUrl);
                      setSelectedImage(null);
                    }}
                    className="absolute top-2 right-2 h-8 w-8 rounded-full bg-black/50 flex items-center justify-center text-white"
                    aria-label="이미지 제거"
                  >
                    <CloseIcon className="h-4 w-4" />
                  </button>
                  {/* 텍스트 오버레이 (선택) */}
                  {text ? (
                    <p className="absolute bottom-4 left-0 right-0 text-center text-white font-semibold text-[16px] drop-shadow-lg px-6">
                      {text}
                    </p>
                  ) : null}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full rounded-[16px] border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-3 text-gray-400"
                  style={{ aspectRatio: "9/16", maxHeight: "320px" }}
                >
                  <ImageIcon className="h-10 w-10" />
                  <span className="text-[13px]">이미지를 선택하세요</span>
                </button>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleImageSelect}
              />

              {!selectedImage && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border border-gray-200 text-[13px] font-medium text-gray-600"
                >
                  <PlusIcon className="h-4 w-4" />
                  이미지 선택
                </button>
              )}

              {/* 선택적 텍스트 오버레이 */}
              <div>
                <p className="text-[12px] text-gray-500 font-medium mb-2">텍스트 추가 (선택)</p>
                <textarea
                  className="w-full rounded-xl border border-gray-200 px-3 py-3 text-[14px] resize-none focus:outline-none focus:ring-2 focus:ring-[color:var(--rnest-accent)]/40"
                  rows={2}
                  maxLength={100}
                  placeholder="이미지에 쓸 내용을 추가하세요..."
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* 회복 카드 스토리 */}
          {storyType === "recovery" && (
            <div className="p-4 flex flex-col gap-4">
              {/* 미리보기 카드 */}
              <div
                className="w-full rounded-[16px] overflow-hidden flex flex-col items-center justify-center gap-4 p-6"
                style={{ backgroundColor: bgColor, aspectRatio: "9/16", maxHeight: "320px" }}
              >
                <div className="w-full rounded-[14px] bg-white/10 backdrop-blur-sm px-5 py-5 text-white">
                  <div className="flex items-center gap-2 mb-3">
                    <BoltIcon className="h-4 w-4 text-yellow-300" />
                    <span className="text-[11px] font-bold uppercase tracking-widest text-white/70">회복 카드</span>
                  </div>
                  <p className="text-[16px] font-bold leading-snug mb-3">
                    {recoveryHeadline}
                  </p>
                  <div className="flex gap-4 text-[12px] text-white/70">
                    {recoverySnapshot.batteryAvg !== null ? (
                      <span>배터리 {recoverySnapshot.batteryAvg}%</span>
                    ) : null}
                    {recoverySnapshot.sleepDebtHours !== null ? (
                      <span>수면부채 {recoverySnapshot.sleepDebtHours.toFixed(1)}h</span>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* 헤드라인 편집 */}
              <div>
                <p className="text-[12px] text-gray-500 font-medium mb-2">헤드라인 수정</p>
                <input
                  type="text"
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-[14px] focus:outline-none focus:ring-2 focus:ring-[color:var(--rnest-accent)]/40"
                  maxLength={60}
                  value={recoveryHeadline}
                  onChange={(e) => setRecoveryHeadline(e.target.value)}
                />
              </div>

              {/* 배경색 선택 */}
              <div>
                <p className="text-[12px] text-gray-500 font-medium mb-2">배경색</p>
                <div className="flex gap-2">
                  {BG_PALETTE.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setBgColor(color)}
                      className={`h-8 w-8 rounded-full transition-transform ${bgColor === color ? "scale-125 ring-2 ring-offset-1 ring-gray-400" : ""}`}
                      style={{ backgroundColor: color }}
                      aria-label={`배경색 ${color}`}
                    />
                  ))}
                </div>
              </div>

              {/* 데이터 메모 */}
              <div className="rounded-xl bg-[color:var(--rnest-lavender-soft)] p-3">
                <p className="text-[12px] text-[color:var(--rnest-accent)] font-medium mb-1">자동 집계 데이터</p>
                <div className="flex flex-wrap gap-2 text-[11px] text-gray-600">
                  {recoverySnapshot.batteryAvg !== null && (
                    <span className="rounded-full bg-white px-2 py-0.5">배터리 {recoverySnapshot.batteryAvg}%</span>
                  )}
                  {recoverySnapshot.sleepDebtHours !== null && (
                    <span className="rounded-full bg-white px-2 py-0.5">수면부채 {recoverySnapshot.sleepDebtHours.toFixed(1)}h</span>
                  )}
                  {todayShift && (
                    <span className="rounded-full bg-white px-2 py-0.5">근무 {todayShift}</span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 에러 */}
        {error && (
          <p className="px-4 py-2 text-[12px] text-red-500 shrink-0">{error}</p>
        )}

        {/* 게시 버튼 */}
        <div className="px-4 pb-[calc(16px+env(safe-area-inset-bottom))] pt-3 shrink-0 border-t border-gray-100">
          <button
            type="button"
            disabled={!canSubmit || submitting}
            onClick={handleSubmit}
            className="w-full py-3.5 rounded-xl text-[14px] font-semibold text-white transition-all active:scale-[0.98] disabled:opacity-50"
            style={{ backgroundColor: "var(--rnest-accent)" }}
          >
            {submitting ? "업로드 중..." : "스토리 올리기"}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
