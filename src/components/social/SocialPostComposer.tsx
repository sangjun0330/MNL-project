"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Eye, Globe2, House, Tags, Users } from "lucide-react";
import { BOTTOM_SHEET_DURATION_MS, BottomSheet } from "@/components/ui/BottomSheet";
import { DEFAULT_SOCIAL_POST_VISIBILITY } from "@/types/social";
import type {
  SocialGroupSummary,
  SocialHealthBadge,
  RecoveryCardSnapshot,
  SocialPost,
  SocialPostVisibility,
} from "@/types/social";
import { useAppStoreSelector } from "@/lib/store";
import { todayISO } from "@/lib/date";

type Props = {
  open: boolean;
  onClose: () => void;
  onPosted: (post: SocialPost) => void;
  onEdited?: (post: SocialPost) => void;
  userGroups?: Pick<SocialGroupSummary, "id" | "name">[];
  defaultVisibility?: SocialPostVisibility;
  editPost?: SocialPost; // 수정 모드
};

type ComposerStep = "media" | "details";

type VisibilityOption = {
  value: SocialPostVisibility;
  label: string;
  description: string;
  icon: LucideIcon;
};

type SelectedImage = {
  id: string;
  file: File;
  previewUrl: string;
};

const MAX_SOCIAL_POST_IMAGES = 10;
const MAX_SOCIAL_POST_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

const VISIBILITY_OPTIONS: VisibilityOption[] = [
  { value: "public_internal", label: "전체", description: "허브 멤버라면 누구나 볼 수 있어요", icon: Globe2 },
  { value: "followers", label: "팔로워", description: "나를 팔로우한 사람만 볼 수 있어요", icon: Eye },
  { value: "friends", label: "친구", description: "상호 연결된 친구에게만 공개돼요", icon: Users },
  { value: "group", label: "그룹 전용", description: "선택한 그룹 멤버만 볼 수 있어요", icon: House },
];

function normalizeTag(value: string) {
  const normalized = value
    .normalize("NFKC")
    .replace(/<[^>]*>/g, "")
    .replace(/^#+/, "")
    .replace(/[，]/g, ",")
    .replace(/\s+/g, "")
    .trim();
  return Array.from(normalized).slice(0, 24).join("");
}

function parseTagFragments(value: string) {
  return value
    .split(/[,\n]/g)
    .map((fragment) => normalizeTag(fragment))
    .filter(Boolean);
}

function mergeTags(baseTags: string[], draftValue: string) {
  const nextTags: string[] = [];
  const seen = new Set<string>();

  for (const tag of [...baseTags, ...parseTagFragments(draftValue)]) {
    const normalized = normalizeTag(tag);
    if (!normalized) continue;
    const dedupeKey = normalized.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    nextTags.push(normalized);
    if (nextTags.length >= 5) break;
  }

  return nextTags;
}

function revokeImageUrls(images: SelectedImage[]) {
  for (const image of images) {
    URL.revokeObjectURL(image.previewUrl);
  }
}

export function SocialPostComposer({
  open,
  onClose,
  onPosted,
  onEdited,
  userGroups = [],
  defaultVisibility = DEFAULT_SOCIAL_POST_VISIBILITY,
  editPost,
}: Props) {
  const isEditMode = Boolean(editPost);
  const today = todayISO();
  const schedule = useAppStoreSelector((s) => s.schedule as Record<string, string>);
  const bio = useAppStoreSelector((s) => s.bio as Record<string, any>);
  const emotions = useAppStoreSelector((s) => s.emotions as Record<string, any>);

  const todayShift: string | null = schedule[today] ?? null;
  const todayBio = bio[today] ?? null;
  const todayEmotion = emotions[today] ?? null;

  // 오늘 배터리 추정 (수면, 스트레스, 기분 기반 간이 계산)
  const estimatedBattery = useMemo<number | null>(() => {
    if (!todayBio) return null;
    const sleep = typeof todayBio.sleepHours === "number" ? todayBio.sleepHours : null;
    const stress = typeof todayBio.stress === "number" ? todayBio.stress : null;
    const mood = typeof todayBio.mood === "number" ? todayBio.mood : (typeof todayEmotion?.mood === "number" ? todayEmotion.mood : null);
    if (sleep === null && stress === null && mood === null) return null;
    const sleepScore = sleep !== null ? Math.min(100, (sleep / 8) * 100) : 70;
    const stressScore = stress !== null ? Math.max(0, 100 - stress * 25) : 70;
    const moodScore = mood !== null ? (mood / 5) * 100 : 70;
    return Math.round((sleepScore * 0.4 + stressScore * 0.35 + moodScore * 0.25));
  }, [todayBio, todayEmotion]);

  // 번아웃 레벨 추정
  const estimatedBurnout = useMemo<"ok" | "warning" | "danger">(() => {
    const stress = typeof todayBio?.stress === "number" ? todayBio.stress : 0;
    if (stress >= 3) return "danger";
    if (stress >= 2) return "warning";
    return "ok";
  }, [todayBio]);

  const [step, setStep] = useState<ComposerStep>(isEditMode ? "details" : "media");
  const [body, setBody] = useState(editPost?.body ?? "");
  const [selectedTags, setSelectedTags] = useState<string[]>(editPost?.tags ?? []);
  const [tagInput, setTagInput] = useState("");
  const [visibility, setVisibility] = useState<SocialPostVisibility>(editPost?.visibility ?? defaultVisibility);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(editPost?.groupId ?? null);
  const [selectedImages, setSelectedImages] = useState<SelectedImage[]>([]);
  // 수정 모드: 기존 이미지 경로 (제거 목록 추적)
  const [existingImagePaths, setExistingImagePaths] = useState<string[]>(editPost?.imagePaths ?? []);
  const [removedImagePaths, setRemovedImagePaths] = useState<string[]>([]);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [posting, setPosting] = useState(false);
  const [visibilityOpen, setVisibilityOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 건강 배지
  const [badgeOpen, setBadgeOpen] = useState(false);
  const [healthBadge, setHealthBadge] = useState<SocialHealthBadge | null>(editPost?.healthBadge ?? null);
  // 회복 카드
  const [recoveryCardOpen, setRecoveryCardOpen] = useState(false);
  const [recoveryCard, setRecoveryCard] = useState<RecoveryCardSnapshot | null>(editPost?.recoveryCard ?? null);
  const [recoveryHeadline, setRecoveryHeadline] = useState(editPost?.recoveryCard?.headline ?? "");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const selectedImagesRef = useRef<SelectedImage[]>([]);
  const resetTimeoutRef = useRef<number | null>(null);
  const wasOpenRef = useRef(open);

  useEffect(() => {
    selectedImagesRef.current = selectedImages;
  }, [selectedImages]);

  const clearScheduledReset = useCallback(() => {
    if (resetTimeoutRef.current === null) return;
    window.clearTimeout(resetTimeoutRef.current);
    resetTimeoutRef.current = null;
  }, []);

  const resetComposerState = useCallback(() => {
    revokeImageUrls(selectedImagesRef.current);
    selectedImagesRef.current = [];
    setSelectedImages([]);
    setActiveImageIndex(0);
    setStep(isEditMode ? "details" : "media");
    setBody(editPost?.body ?? "");
    setSelectedTags(editPost?.tags ?? []);
    setTagInput("");
    setVisibility(editPost?.visibility ?? defaultVisibility);
    setSelectedGroupId(editPost?.groupId ?? (defaultVisibility === "group" ? userGroups[0]?.id ?? null : null));
    setExistingImagePaths(editPost?.imagePaths ?? []);
    setRemovedImagePaths([]);
    setHealthBadge(editPost?.healthBadge ?? null);
    setRecoveryCard(editPost?.recoveryCard ?? null);
    setRecoveryHeadline(editPost?.recoveryCard?.headline ?? "");
    setBadgeOpen(false);
    setRecoveryCardOpen(false);
    setPosting(false);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [defaultVisibility, editPost, isEditMode, userGroups]);

  useEffect(() => {
    const hadPendingReset = resetTimeoutRef.current !== null;
    clearScheduledReset();

    if (open) {
      if (!wasOpenRef.current || hadPendingReset) {
        wasOpenRef.current = true;
        resetComposerState();
      }
      return;
    }

    if (!wasOpenRef.current) return;

    resetTimeoutRef.current = window.setTimeout(() => {
      resetComposerState();
      resetTimeoutRef.current = null;
      wasOpenRef.current = false;
    }, BOTTOM_SHEET_DURATION_MS);

    return clearScheduledReset;
  }, [clearScheduledReset, open, resetComposerState]);

  useEffect(() => {
    return () => {
      clearScheduledReset();
      revokeImageUrls(selectedImagesRef.current);
    };
  }, [clearScheduledReset]);

  useEffect(() => {
    if (open && step === "details") {
      const timeoutId = window.setTimeout(() => textareaRef.current?.focus(), 40);
      return () => window.clearTimeout(timeoutId);
    }
  }, [open, step]);

  useEffect(() => {
    if (visibility !== "group") return;

    if (userGroups.length === 0) {
      setVisibility(defaultVisibility === "group" ? "friends" : defaultVisibility);
      setSelectedGroupId(null);
      return;
    }

    if (selectedGroupId === null || !userGroups.some((group) => group.id === selectedGroupId)) {
      setSelectedGroupId(userGroups[0]?.id ?? null);
    }
  }, [defaultVisibility, selectedGroupId, userGroups, visibility]);

  const selectedVisibility =
    VISIBILITY_OPTIONS.find((option) => option.value === visibility) ?? VISIBILITY_OPTIONS[2];
  const SelectedVisibilityIcon = selectedVisibility.icon;
  const charCount = Array.from(body).length;
  const outgoingTags = useMemo(() => mergeTags(selectedTags, tagInput), [selectedTags, tagInput]);
  const totalImageCount = (isEditMode ? existingImagePaths.length - removedImagePaths.length : 0) + selectedImages.length;
  const canSubmit =
    !posting &&
    charCount <= 500 &&
    (body.trim().length > 0 || totalImageCount > 0 || (!isEditMode && selectedImages.length > 0)) &&
    (visibility !== "group" || selectedGroupId !== null);

  // 건강 배지 토글 핸들러
  const handleToggleBadge = useCallback(() => {
    if (healthBadge) {
      setHealthBadge(null);
      setBadgeOpen(false);
    } else {
      setHealthBadge({
        shiftType: todayShift ?? undefined,
        batteryLevel: estimatedBattery ?? undefined,
        burnoutLevel: estimatedBurnout,
      });
      setBadgeOpen(true);
    }
  }, [estimatedBattery, estimatedBurnout, healthBadge, todayShift]);

  // 회복 카드 토글 핸들러
  const handleToggleRecoveryCard = useCallback(() => {
    if (recoveryCard) {
      setRecoveryCard(null);
      setRecoveryCardOpen(false);
      setRecoveryHeadline("");
    } else {
      const avgBattery = estimatedBattery;
      const headline = avgBattery !== null
        ? `이번 주 배터리 ${avgBattery}% — 기록 중`
        : "이번 주 회복 기록";
      setRecoveryHeadline(headline);
      setRecoveryCard({
        headline,
        batteryAvg: avgBattery,
        sleepDebtHours: null,
        weekDays: 7,
      });
      setRecoveryCardOpen(true);
    }
  }, [estimatedBattery, recoveryCard]);

  const appendTags = useCallback((tags: string[]) => {
    setSelectedTags((prev) => {
      const seen = new Set(prev.map((tag) => tag.toLowerCase()));
      const next = [...prev];

      for (const rawTag of tags) {
        const tag = normalizeTag(rawTag);
        if (!tag) continue;
        const dedupeKey = tag.toLowerCase();
        if (seen.has(dedupeKey)) continue;
        if (next.length >= 5) break;
        seen.add(dedupeKey);
        next.push(tag);
      }

      return next;
    });
  }, []);

  const commitTagInput = useCallback(() => {
    if (!tagInput.trim()) return;
    appendTags(parseTagFragments(tagInput));
    setTagInput("");
  }, [appendTags, tagInput]);

  const handleTagKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter" || event.key === "," || event.key === "Tab") {
        if (!tagInput.trim()) return;
        event.preventDefault();
        commitTagInput();
        return;
      }

      if (event.key === "Backspace" && !tagInput && selectedTags.length > 0) {
        event.preventDefault();
        setSelectedTags((prev) => prev.slice(0, -1));
      }
    },
    [commitTagInput, selectedTags.length, tagInput]
  );

  const handleTagChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      if (value.includes(",") || value.includes("\n")) {
        appendTags(parseTagFragments(value));
        setTagInput("");
        return;
      }
      setTagInput(value);
    },
    [appendTags]
  );

  const openFilePicker = useCallback(() => {
    if (posting) return;
    fileInputRef.current?.click();
  }, [posting]);

  const handleImageSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;

    const remainingSlots = MAX_SOCIAL_POST_IMAGES - selectedImagesRef.current.length;
    if (remainingSlots <= 0) {
      setError(`사진은 최대 ${MAX_SOCIAL_POST_IMAGES}장까지 선택할 수 있어요.`);
      return;
    }

    const nextImages: SelectedImage[] = [];
    let nextError: string | null = null;

    for (const file of files) {
      if (nextImages.length >= remainingSlots) {
        nextError = `사진은 최대 ${MAX_SOCIAL_POST_IMAGES}장까지 선택할 수 있어요.`;
        break;
      }
      if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
        nextError = "JPG, PNG, WEBP 이미지만 첨부할 수 있어요.";
        continue;
      }
      if (file.size > MAX_SOCIAL_POST_IMAGE_BYTES) {
        nextError = "이미지는 5MB 이하만 첨부할 수 있어요.";
        continue;
      }

      nextImages.push({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }

    if (nextImages.length > 0) {
      setSelectedImages((prev) => {
        const merged = [...prev, ...nextImages];
        if (prev.length === 0) {
          setActiveImageIndex(0);
        }
        return merged;
      });
      setError(null);
    }

    if (nextError) {
      setError(nextError);
    }
  }, []);

  const removeImage = useCallback((imageId: string) => {
    setSelectedImages((prev) => {
      const index = prev.findIndex((image) => image.id === imageId);
      if (index === -1) return prev;

      const removed = prev[index];
      if (removed) {
        URL.revokeObjectURL(removed.previewUrl);
      }

      const next = prev.filter((image) => image.id !== imageId);
      setActiveImageIndex((current) => {
        if (next.length === 0) return 0;
        if (current > index) return current - 1;
        return Math.min(current, next.length - 1);
      });
      return next;
    });
  }, []);

  const uploadImages = useCallback(async () => {
    if (selectedImages.length === 0) return [] as string[];

    const uploaded: string[] = [];

    for (const image of selectedImages) {
      const formData = new FormData();
      formData.set("file", image.file);

      const res = await fetch("/api/social/posts/image", {
        method: "POST",
        body: formData,
      }).then((response) => response.json());

      if (!res.ok) {
        if (res.error === "login_required") throw new Error("로그인이 필요해요. 다시 로그인한 뒤 시도해 주세요.");
        if (res.error === "invalid_file_type") throw new Error("JPG, PNG, WEBP 이미지만 첨부할 수 있어요.");
        if (res.error === "file_too_large") throw new Error("이미지는 5MB 이하만 첨부할 수 있어요.");
        throw new Error("이미지 업로드에 실패했어요.");
      }

      const imagePath =
        res.data?.imagePath && typeof res.data.imagePath === "string"
          ? String(res.data.imagePath)
          : null;

      if (!imagePath) {
        throw new Error("이미지 업로드 응답이 올바르지 않아요.");
      }

      uploaded.push(imagePath);
    }

    return uploaded;
  }, [selectedImages]);

  const handlePost = useCallback(async () => {
    if (!canSubmit) return;
    if (visibility === "group" && !selectedGroupId) {
      setError("그룹 공개를 선택했다면 그룹을 지정해 주세요.");
      return;
    }

    setPosting(true);
    setError(null);

    try {
      const newImagePaths = await uploadImages();

      if (isEditMode && editPost) {
        // ── PATCH 모드 ─────────────────────────────────────
        const res = await fetch(`/api/social/posts/${editPost.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            body: body.trim(),
            tags: outgoingTags,
            visibility,
            groupId: visibility === "group" ? selectedGroupId : null,
            addImagePaths: newImagePaths,
            removeImagePaths: removedImagePaths,
            healthBadge: healthBadge ?? null,
            recoveryCard: recoveryCard ?? null,
          }),
        }).then((response) => response.json());

        if (!res.ok) {
          if (res.error === "not_found") throw new Error("게시글을 찾을 수 없어요.");
          if (res.error === "invalid_image_path") throw new Error("이미지 정보가 올바르지 않아요.");
          throw new Error("게시글을 수정하지 못했어요.");
        }
        onEdited?.(res.data.post as SocialPost);
        onClose();
        return;
      }

      // ── POST 모드 ────────────────────────────────────────
      const res = await fetch("/api/social/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: body.trim(),
          tags: outgoingTags,
          visibility,
          groupId: visibility === "group" ? selectedGroupId : null,
          imagePaths: newImagePaths,
          healthBadge: healthBadge ?? null,
          recoveryCard: recoveryCard ?? null,
        }),
      }).then((response) => response.json());

      if (!res.ok) {
        if (res.error === "content_required") throw new Error("텍스트나 사진 중 하나는 필요해요.");
        if (res.error === "invalid_image_path") throw new Error("이미지 업로드 정보가 올바르지 않아요. 다시 시도해 주세요.");
        if (res.error === "too_many_requests") throw new Error("게시글을 너무 많이 올리고 있어요. 잠시 후 다시 시도해 주세요.");
        if (res.error === "not_group_member") throw new Error("해당 그룹의 멤버가 아니에요.");
        throw new Error("게시글을 올리지 못했어요.");
      }

      onPosted(res.data.post as SocialPost);
      onClose();
    } catch (postError: any) {
      setError(String(postError?.message ?? "게시글을 올리지 못했어요."));
    } finally {
      setPosting(false);
    }
  }, [body, canSubmit, editPost, healthBadge, isEditMode, onClose, onEdited, onPosted, outgoingTags, recoveryCard, removedImagePaths, selectedGroupId, uploadImages, visibility]);

  const activeImage = selectedImages[activeImageIndex] ?? null;
  const handleRequestClose = useCallback(() => {
    if (posting) return;
    onClose();
  }, [onClose, posting]);

  const handleAdvanceStep = useCallback(() => {
    if (posting) return;
    setError(null);
    setStep("details");
  }, [posting]);

  const handleReturnToMedia = useCallback(() => {
    if (posting) return;
    setError(null);
    setStep("media");
  }, [posting]);

  const handleVisibilityChange = useCallback(
    (nextVisibility: SocialPostVisibility) => {
      if (nextVisibility === "group" && userGroups.length === 0) return;
      setVisibility(nextVisibility);
      if (nextVisibility !== "group") {
        setSelectedGroupId(null);
        return;
      }
      if (userGroups[0]) {
        setSelectedGroupId((current) => current ?? userGroups[0]?.id ?? null);
      }
    },
    [userGroups]
  );

  return (
    <BottomSheet
      open={open}
      onClose={handleRequestClose}
      dismissible={!posting}
      presentation="fullscreen"
      panelClassName="bg-transparent"
      contentClassName="bg-transparent"
      backdropClassName="bg-black/50 backdrop-blur-[10px]"
      footer={
        step === "details" ? (
          <div className="pt-1">
            {error ? (
              <p className="mb-2 text-center text-[12px] text-red-500">{error}</p>
            ) : null}
            <button
              type="button"
              onClick={handlePost}
              disabled={!canSubmit}
              className="h-12 w-full rounded-[18px] text-[14px] font-semibold text-white transition active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-[#c8ccd3]"
              style={{ backgroundColor: canSubmit ? "var(--rnest-accent)" : undefined }}
            >
              {posting ? "게시 중..." : "게시하기"}
            </button>
          </div>
        ) : undefined
      }
      footerClassName="border-t border-black/5 bg-white px-4 py-3"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        disabled={posting}
        hidden
        onChange={handleImageSelect}
      />

      {step === "media" ? (
        <div className="flex h-full min-h-0 flex-col bg-[#09090c] text-white">
          <div className="shrink-0 px-4 pb-4 pt-[calc(14px+env(safe-area-inset-top))]">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={handleRequestClose}
                disabled={posting}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/15 disabled:opacity-40"
                aria-label="닫기"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" className="h-5 w-5">
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
              <p className="text-[16px] font-semibold tracking-[-0.02em]">새 게시글</p>
              <button
                type="button"
                onClick={handleAdvanceStep}
                disabled={posting}
                className="min-w-[58px] text-right text-[15px] font-semibold text-[#9f9cff] disabled:opacity-40"
              >
                {selectedImages.length > 0 ? "다음" : "건너뛰기"}
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(24px+env(safe-area-inset-bottom))]">
            <div className="mx-auto flex max-w-[420px] flex-col">
              <div className="overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.04] shadow-[0_24px_60px_rgba(0,0,0,0.28)]">
                <div className="relative aspect-[4/5] bg-[#141416]">
                  {activeImage ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={activeImage.previewUrl}
                        alt="선택한 사진"
                        className="h-full w-full object-cover"
                      />
                      <div className="absolute right-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-medium text-white">
                        {activeImageIndex + 1}/{selectedImages.length}
                      </div>
                    </>
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center px-8 text-center">
                      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/10">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-8 w-8">
                          <path d="M4 7a2 2 0 0 1 2-2h8l2 2h2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
                          <circle cx="12" cy="13" r="3.5" />
                        </svg>
                      </div>
                      <p className="text-[18px] font-semibold tracking-[-0.02em]">사진을 먼저 골라보세요</p>
                      <p className="mt-2 text-[13px] leading-6 text-white/65">
                        갤러리에서 여러 장을 고를 수 있고, 텍스트만으로도 게시할 수 있어요.
                      </p>
                      <button
                        type="button"
                        onClick={openFilePicker}
                        disabled={posting}
                        className="mt-6 rounded-full bg-white px-5 py-2.5 text-[13px] font-semibold text-black transition hover:bg-white/90"
                      >
                        사진 선택
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 flex items-end justify-between gap-3 px-1">
                <div>
                  <p className="text-[15px] font-semibold tracking-[-0.02em]">선택한 사진</p>
                  <p className="mt-1 text-[12px] text-white/55">
                    {selectedImages.length > 0
                      ? `${selectedImages.length}장을 골랐어요. 오른쪽 위에서 다음 단계로 넘어갈 수 있어요.`
                      : "텍스트만 올리려면 오른쪽 위 건너뛰기를 눌러주세요."}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={openFilePicker}
                  disabled={posting}
                  className="shrink-0 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-[12px] font-semibold text-white transition hover:bg-white/15"
                >
                  {selectedImages.length > 0 ? "사진 추가" : "선택"}
                </button>
              </div>

              <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
                <button
                  type="button"
                  onClick={openFilePicker}
                  disabled={posting}
                  className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[22px] border border-dashed border-white/15 bg-white/[0.05] text-white/70 transition hover:bg-white/[0.08]"
                  aria-label="사진 추가"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-6 w-6">
                    <path d="M12 5v14" />
                    <path d="M5 12h14" />
                  </svg>
                </button>

                {selectedImages.map((image, index) => (
                  <div
                    key={image.id}
                    className="relative h-20 w-20 shrink-0 overflow-hidden rounded-[22px] border border-white/10 bg-white/5"
                  >
                    <button
                      type="button"
                      onClick={() => setActiveImageIndex(index)}
                      disabled={posting}
                      className="h-full w-full"
                      aria-label={`${index + 1}번 사진 선택`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={image.previewUrl} alt="" className="h-full w-full object-cover" />
                      <span className="absolute right-1.5 top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-black/70 px-1 text-[10px] font-semibold text-white">
                        {index + 1}
                      </span>
                      {index === activeImageIndex ? (
                        <div className="absolute inset-0 rounded-[22px] ring-2 ring-[color:var(--rnest-accent)]" />
                      ) : null}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeImage(image.id)}
                      disabled={posting}
                      className="absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white"
                      aria-label="사진 제거"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                        <path d="M18 6 6 18" />
                        <path d="m6 6 12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>

              {error ? (
                <p className="mt-4 px-1 text-[12px] leading-5 text-red-300">{error}</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex h-full min-h-0 flex-col bg-[#f4f5f7]">
          <div className="shrink-0 border-b border-black/5 bg-white/95 px-4 pb-3 pt-[calc(14px+env(safe-area-inset-top))] backdrop-blur">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={handleReturnToMedia}
                disabled={posting}
                className="flex h-9 w-9 items-center justify-center rounded-full text-[#1c1c1e] transition hover:bg-black/5 disabled:opacity-40"
                aria-label="이전 단계"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" className="h-5 w-5">
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </button>
              <p className="text-[16px] font-semibold tracking-[-0.02em] text-[#111827]">{isEditMode ? "게시글 수정" : "새 게시글"}</p>
              <div className="w-9" />
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="space-y-4 px-4 pb-6 pt-4">
              {selectedImages.length > 0 ? (
                <section className="overflow-hidden rounded-2xl border border-black/[0.05] bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
                  <div className="relative aspect-square bg-[#f2f3f5]">
                    {activeImage ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={activeImage.previewUrl}
                          alt="게시할 사진"
                          className="h-full w-full object-cover"
                        />
                        <div className="absolute right-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-medium text-white">
                          {activeImageIndex + 1}/{selectedImages.length}
                        </div>
                      </>
                    ) : null}
                  </div>

                  <div className="flex gap-2 overflow-x-auto px-3 py-3">
                    {selectedImages.map((image, index) => (
                      <button
                        key={image.id}
                        type="button"
                        onClick={() => setActiveImageIndex(index)}
                        disabled={posting}
                        className="relative shrink-0 overflow-hidden rounded-[16px]"
                        aria-label={`${index + 1}번 사진 보기`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={image.previewUrl}
                          alt=""
                          className="h-16 w-16 object-cover"
                        />
                        <span className="absolute right-1.5 top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-black/70 px-1 text-[10px] font-semibold text-white">
                          {index + 1}
                        </span>
                        {index === activeImageIndex ? (
                          <div className="absolute inset-0 rounded-[16px] ring-2 ring-[color:var(--rnest-accent)]" />
                        ) : null}
                      </button>
                    ))}

                    <button
                      type="button"
                      onClick={openFilePicker}
                      disabled={posting}
                      className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[16px] border border-dashed border-black/10 bg-[#f6f7f9] text-[#6b7280]"
                      aria-label="사진 추가"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-5 w-5">
                        <path d="M12 5v14" />
                        <path d="M5 12h14" />
                      </svg>
                    </button>
                  </div>
                </section>
              ) : (
                <section className="rounded-2xl border border-dashed border-black/10 bg-white px-5 py-6 text-center shadow-[0_14px_36px_rgba(15,23,42,0.05)]">
                  <p className="text-[14px] font-semibold text-[#111827]">텍스트만 작성하는 게시글</p>
                  <p className="mt-1 text-[12px] leading-5 text-[#6b7280]">
                    필요하면 언제든 이전 단계로 돌아가 사진을 추가할 수 있어요.
                  </p>
                  <button
                    type="button"
                    onClick={openFilePicker}
                    disabled={posting}
                    className="mt-4 rounded-full border border-black/10 px-4 py-2 text-[12px] font-semibold text-[#111827]"
                  >
                    사진 추가
                  </button>
                </section>
              )}

              <section className="rounded-2xl border border-black/[0.05] bg-white px-4 py-4 shadow-[0_16px_42px_rgba(15,23,42,0.06)]">
                <div className="flex items-center justify-between">
                  <p className="text-[12px] font-semibold tracking-[0.02em] text-[#6b7280]">캡션</p>
                  <p className="text-[12px] text-[#9ca3af]">{charCount}/500</p>
                </div>
                <textarea
                  ref={textareaRef}
                  value={body}
                  disabled={posting}
                  onChange={(event) => {
                    if (Array.from(event.target.value).length <= 500) {
                      setBody(event.target.value);
                    }
                  }}
                  rows={5}
                  placeholder="캡션을 입력하세요..."
                  className="mt-3 w-full resize-none bg-transparent text-[15px] leading-7 text-[#111827] outline-none placeholder:text-[#9ca3af]"
                />
              </section>

              <section className="rounded-2xl border border-black/[0.05] bg-white px-4 py-4 shadow-[0_16px_42px_rgba(15,23,42,0.06)]">
                <div className="flex items-center justify-between">
                  <p className="text-[12px] font-semibold tracking-[0.02em] text-[#6b7280]">태그</p>
                  <p className="text-[12px] text-[#9ca3af]">{outgoingTags.length}/5</p>
                </div>
                <div className="mt-3 rounded-[18px] border border-black/[0.06] bg-[#fafafa] px-3 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {selectedTags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 rounded-full bg-[color:var(--rnest-accent-soft)] px-3 py-1.5 text-[12px] font-medium text-[color:var(--rnest-accent)]"
                      >
                        #{tag}
                        <button
                          type="button"
                          onClick={() => setSelectedTags((prev) => prev.filter((item) => item !== tag))}
                          disabled={posting}
                          className="text-[color:var(--rnest-accent)]"
                          aria-label={`${tag} 태그 삭제`}
                        >
                          ×
                        </button>
                      </span>
                    ))}

                    {selectedTags.length < 5 ? (
                      <input
                        value={tagInput}
                        disabled={posting}
                        onChange={handleTagChange}
                        onKeyDown={handleTagKeyDown}
                        onBlur={commitTagInput}
                        placeholder="태그 입력 후 Enter"
                        className="min-w-[140px] flex-1 bg-transparent text-[13px] text-[#111827] outline-none placeholder:text-[#9ca3af]"
                      />
                    ) : null}
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-black/[0.05] bg-white px-4 py-4 shadow-[0_16px_42px_rgba(15,23,42,0.06)]">
                <p className="text-[12px] font-semibold tracking-[0.02em] text-[#6b7280]">공개 범위</p>
                {/* 현재 선택된 옵션 표시 + 탭하면 펼침 */}
                <button
                  type="button"
                  disabled={posting}
                  onClick={() => setVisibilityOpen((prev) => !prev)}
                  className="mt-3 flex w-full items-center gap-3 rounded-[18px] border border-black/[0.06] bg-[#fafafa] px-4 py-3 transition active:opacity-70"
                >
                  <SelectedVisibilityIcon className="h-[18px] w-[18px] shrink-0 text-[color:var(--rnest-accent)]" strokeWidth={1.9} />
                  <span className="flex-1 text-left text-[14px] font-medium text-[#111827]">
                    {selectedVisibility.label}
                  </span>
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.9"
                    className={`h-4 w-4 shrink-0 text-[#9ca3af] transition-transform duration-200 ${
                      visibilityOpen ? "rotate-180" : ""
                    }`}
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </button>

                {/* 펼침 목록 */}
                {visibilityOpen ? (
                  <div className="mt-2 overflow-hidden rounded-[18px] border border-black/[0.06] bg-white">
                    {VISIBILITY_OPTIONS.map((option) => {
                      const Icon = option.icon;
                      const isSelected = option.value === visibility;
                      const isDisabled = option.value === "group" && userGroups.length === 0;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          disabled={isDisabled || posting}
                          onClick={() => {
                            handleVisibilityChange(option.value);
                            setVisibilityOpen(false);
                          }}
                          className="flex w-full items-center gap-3 border-b border-black/[0.04] px-4 py-3 text-left last:border-b-0 transition active:bg-gray-50 disabled:opacity-40"
                        >
                          <Icon
                            className="h-[18px] w-[18px] shrink-0 text-[color:var(--rnest-accent)]"
                            strokeWidth={1.9}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-[14px] font-medium text-[#111827]">{option.label}</p>
                            <p className="mt-0.5 text-[11.5px] leading-relaxed text-[#6b7280]">
                              {option.description}
                            </p>
                          </div>
                          {isSelected ? (
                            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[color:var(--rnest-accent)]">
                              <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="white"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="h-3 w-3"
                              >
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            </span>
                          ) : (
                            <span className="h-5 w-5 shrink-0 rounded-full border-2 border-[#e5e7eb]" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </section>

              {visibility === "group" ? (
                <section className="rounded-2xl border border-black/[0.05] bg-white px-4 py-4 shadow-[0_16px_42px_rgba(15,23,42,0.06)]">
                  <p className="text-[12px] font-semibold tracking-[0.02em] text-[#6b7280]">
                    그룹 선택
                  </p>
                  <div className="mt-3 flex items-center gap-3 rounded-[18px] border border-black/[0.06] bg-[#fafafa] px-4 py-3">
                    <Tags className="h-[18px] w-[18px] text-[color:var(--rnest-accent)]" strokeWidth={1.9} />
                    <select
                      value={selectedGroupId ?? ""}
                      disabled={posting}
                      onChange={(event) => setSelectedGroupId(Number(event.target.value) || null)}
                      className="w-full appearance-none bg-transparent text-[14px] font-medium text-[#111827] outline-none"
                    >
                      <option value="" disabled>
                        그룹을 선택하세요
                      </option>
                      {userGroups.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name}
                        </option>
                      ))}
                    </select>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" className="h-4 w-4 text-[#9ca3af]">
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </div>
                </section>
              ) : null}

              {/* ── 오늘의 상태 배지 ─────────────────────────── */}
              <section className="rounded-2xl border border-black/[0.05] bg-white px-4 py-4 shadow-[0_16px_42px_rgba(15,23,42,0.06)]">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[12px] font-semibold tracking-[0.02em] text-[#6b7280]">오늘의 상태 배지</p>
                    <p className="mt-0.5 text-[11px] text-[#9ca3af]">근무·배터리 상태를 게시글에 첨부할 수 있어요</p>
                  </div>
                  <button
                    type="button"
                    disabled={posting}
                    onClick={handleToggleBadge}
                    className={`relative h-7 w-12 rounded-full transition-colors duration-200 ${
                      healthBadge ? "bg-[color:var(--rnest-accent)]" : "bg-gray-200"
                    }`}
                    aria-label="오늘의 상태 배지 토글"
                  >
                    <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                      healthBadge ? "translate-x-5" : "translate-x-0.5"
                    }`} />
                  </button>
                </div>
                {healthBadge && badgeOpen ? (
                  <div className="mt-3 space-y-2.5">
                    <div className="flex flex-wrap gap-2">
                      {healthBadge.shiftType ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f0eeff] px-3 py-1.5 text-[12px] font-medium text-[color:var(--rnest-accent)]">
                          <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                            <path d="M10 2a8 8 0 1 0 0 16A8 8 0 0 0 10 2zm1 11H9V9h2v4zm0-6H9V5h2v2z" />
                          </svg>
                          {healthBadge.shiftType} 근무
                          <button
                            type="button"
                            onClick={() => setHealthBadge((prev) => prev ? { ...prev, shiftType: undefined } : null)}
                            className="ml-0.5 opacity-60 hover:opacity-100"
                            aria-label="교대 배지 제거"
                          >
                            <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                              <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
                            </svg>
                          </button>
                        </span>
                      ) : null}
                      {healthBadge.batteryLevel !== undefined ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f0eeff] px-3 py-1.5 text-[12px] font-medium text-[color:var(--rnest-accent)]">
                          <svg viewBox="0 0 20 10" className="h-3 w-4.5" aria-hidden>
                            <rect x="0.5" y="0.5" width="15" height="9" rx="2" stroke="currentColor" strokeWidth="1" fill="none" />
                            <rect x="16" y="2.5" width="2.5" height="5" rx="0.8" fill="currentColor" />
                            <rect x="1.5" y="1.5" width={Math.round((healthBadge.batteryLevel / 100) * 12)} height="7" rx="1" fill="currentColor" />
                          </svg>
                          배터리 {healthBadge.batteryLevel}%
                          <button
                            type="button"
                            onClick={() => setHealthBadge((prev) => prev ? { ...prev, batteryLevel: undefined } : null)}
                            className="ml-0.5 opacity-60 hover:opacity-100"
                            aria-label="배터리 배지 제거"
                          >
                            <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                              <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
                            </svg>
                          </button>
                        </span>
                      ) : null}
                      {healthBadge.burnoutLevel ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f0eeff] px-3 py-1.5 text-[12px] font-medium text-[color:var(--rnest-accent)]">
                          <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                            <path fillRule="evenodd" d="M12.395 2.553a1 1 0 0 0-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 0 0-.613 3.58 2.64 2.64 0 0 1-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 0 0 5.05 6.05 6.981 6.981 0 0 0 3 11a7 7 0 1 0 11.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03z" clipRule="evenodd" />
                          </svg>
                          {healthBadge.burnoutLevel === "ok" ? "안정" : healthBadge.burnoutLevel === "warning" ? "주의" : "위험"}
                          <button
                            type="button"
                            onClick={() => setHealthBadge((prev) => prev ? { ...prev, burnoutLevel: undefined } : null)}
                            className="ml-0.5 opacity-60 hover:opacity-100"
                            aria-label="번아웃 배지 제거"
                          >
                            <svg viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                              <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z" />
                            </svg>
                          </button>
                        </span>
                      ) : null}
                    </div>
                    <p className="text-[11px] text-[#9ca3af]">
                      {todayShift ? `오늘 근무: ${todayShift}` : "오늘 일정 미입력"}{estimatedBattery !== null ? ` · 추정 배터리 ${estimatedBattery}%` : ""}
                    </p>
                  </div>
                ) : null}
              </section>

              {/* ── 회복 카드 첨부 ───────────────────────────── */}
              <section className="rounded-2xl border border-black/[0.05] bg-white px-4 py-4 shadow-[0_16px_42px_rgba(15,23,42,0.06)]">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[12px] font-semibold tracking-[0.02em] text-[#6b7280]">회복 카드 첨부</p>
                    <p className="mt-0.5 text-[11px] text-[#9ca3af]">이번 주 회복 현황을 카드로 공유할 수 있어요</p>
                  </div>
                  <button
                    type="button"
                    disabled={posting}
                    onClick={handleToggleRecoveryCard}
                    className={`relative h-7 w-12 rounded-full transition-colors duration-200 ${
                      recoveryCard ? "bg-[color:var(--rnest-accent)]" : "bg-gray-200"
                    }`}
                    aria-label="회복 카드 토글"
                  >
                    <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                      recoveryCard ? "translate-x-5" : "translate-x-0.5"
                    }`} />
                  </button>
                </div>
                {recoveryCard && recoveryCardOpen ? (
                  <div className="mt-3 overflow-hidden rounded-[14px] bg-gradient-to-r from-[#f0eeff] to-[#e8f5e9] px-3.5 py-3">
                    <div className="flex items-center gap-1.5 mb-2">
                      <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5 text-[color:var(--rnest-accent)] shrink-0">
                        <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0 1 12 2v5h4a1 1 0 0 1 .82 1.573l-7 10A1 1 0 0 1 8 18v-5H4a1 1 0 0 1-.82-1.573l7-10a1 1 0 0 1 1.12-.38z" clipRule="evenodd" />
                      </svg>
                      <span className="text-[11px] font-semibold uppercase tracking-widest text-[color:var(--rnest-accent)]">회복 카드</span>
                    </div>
                    <input
                      value={recoveryHeadline}
                      disabled={posting}
                      onChange={(e) => {
                        const v = e.target.value.slice(0, 100);
                        setRecoveryHeadline(v);
                        setRecoveryCard((prev) => prev ? { ...prev, headline: v } : prev);
                      }}
                      placeholder="예: 이번 주 배터리 72% — 나이트 이후 회복 완료"
                      className="w-full bg-transparent text-[13px] font-semibold text-gray-800 outline-none placeholder:text-gray-400 placeholder:font-normal"
                    />
                    <div className="mt-1.5 flex flex-wrap gap-2.5 text-[11px] text-gray-500">
                      {recoveryCard.batteryAvg !== null && recoveryCard.batteryAvg !== undefined ? (
                        <span>주간 평균 {recoveryCard.batteryAvg}%</span>
                      ) : null}
                      <span className="text-gray-400">7일 기준</span>
                    </div>
                  </div>
                ) : null}
              </section>

            </div>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
