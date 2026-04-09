"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import type { SocialGroupSummary, SocialPost, SocialPostVisibility } from "@/types/social";

type Props = {
  open: boolean;
  onClose: () => void;
  onPosted: (post: SocialPost) => void;
  userGroups?: Pick<SocialGroupSummary, "id" | "name">[];
  defaultVisibility?: SocialPostVisibility;
};

type VisibilityOption = {
  value: SocialPostVisibility;
  label: string;
  description: string;
  icon: string;
};

const VISIBILITY_OPTIONS: VisibilityOption[] = [
  {
    value: "public_internal",
    label: "허브 공개",
    description: "로그인한 RNest 사용자 모두에게 보여요.",
    icon: "🌍",
  },
  {
    value: "followers",
    label: "팔로워",
    description: "나를 팔로우한 사람에게만 보여요.",
    icon: "👀",
  },
  {
    value: "friends",
    label: "친구",
    description: "승인된 친구에게만 보여요.",
    icon: "👥",
  },
  {
    value: "group",
    label: "그룹",
    description: "선택한 그룹 멤버에게만 보여요.",
    icon: "🏠",
  },
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

function ComposerSection({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[24px] border border-black/5 bg-white px-4 py-4 shadow-[0_10px_30px_rgba(15,23,42,0.06)]">
      <div className="mb-3">
        <p className="text-[13px] font-semibold tracking-[-0.01em] text-[var(--rnest-text)]">{label}</p>
        {hint ? (
          <p className="mt-1 text-[11.5px] leading-5 text-[var(--rnest-muted)]">{hint}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function SocialPostComposer({
  open,
  onClose,
  onPosted,
  userGroups = [],
  defaultVisibility = "friends",
}: Props) {
  const maxImageBytes = 5 * 1024 * 1024;
  const [body, setBody] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [visibility, setVisibility] = useState<SocialPostVisibility>(defaultVisibility);
  const [visibilityMenuOpen, setVisibilityMenuOpen] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const tagInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setBody("");
    setSelectedTags([]);
    setTagInput("");
    setVisibility(defaultVisibility);
    setVisibilityMenuOpen(false);
    setSelectedGroupId(null);
    setImageFile(null);
    setImagePreview(null);
    setPosting(false);
    setError(null);
  }, [defaultVisibility, open]);

  const charCount = Array.from(body).length;
  const selectedVisibility = useMemo(
    () => VISIBILITY_OPTIONS.find((option) => option.value === visibility) ?? VISIBILITY_OPTIONS[2],
    [visibility]
  );

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

  const removeTag = useCallback((tag: string) => {
    setSelectedTags((prev) => prev.filter((item) => item !== tag));
  }, []);

  const commitTagInput = useCallback(() => {
    const fragments = parseTagFragments(tagInput);
    if (fragments.length > 0) {
      appendTags(fragments);
    }
    setTagInput("");
  }, [appendTags, tagInput]);

  const handleTagKeyDown = useCallback((event: React.KeyboardEvent<HTMLInputElement>) => {
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
  }, [commitTagInput, selectedTags.length, tagInput]);

  const handleTagChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value;
    if (value.includes(",") || value.includes("\n")) {
      appendTags(parseTagFragments(value));
      setTagInput("");
      return;
    }
    setTagInput(value);
  }, [appendTags]);

  const handleImageSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
    if (!allowedTypes.has(file.type)) {
      setError("JPG, PNG, WEBP 이미지만 첨부할 수 있어요.");
      return;
    }
    if (file.size > maxImageBytes) {
      setError("이미지는 5MB 이하만 첨부할 수 있어요.");
      return;
    }

    setError(null);
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (loadEvent) => setImagePreview(loadEvent.target?.result as string);
    reader.readAsDataURL(file);
  }, [maxImageBytes]);

  const removeImage = useCallback(() => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const uploadImage = useCallback(async (): Promise<string | null> => {
    if (!imageFile) return null;
    const formData = new FormData();
    formData.set("file", imageFile);

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
    return imagePath;
  }, [imageFile]);

  const handlePost = useCallback(async () => {
    const trimmedBody = body.trim();
    if (!trimmedBody || posting) return;
    const outgoingTags = mergeTags(selectedTags, tagInput);
    if (visibility === "group" && !selectedGroupId) {
      setError("그룹 공개를 선택했다면 그룹을 지정해 주세요.");
      return;
    }

    setPosting(true);
    setError(null);

    try {
      const imagePath = imageFile ? await uploadImage() : null;

      const res = await fetch("/api/social/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: trimmedBody,
          tags: outgoingTags,
          visibility,
          groupId: visibility === "group" ? selectedGroupId : null,
          imagePath,
        }),
      }).then((response) => response.json());

      if (!res.ok) {
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
  }, [body, imageFile, onClose, onPosted, posting, selectedGroupId, selectedTags, tagInput, uploadImage, visibility]);

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="새 게시글"
      subtitle="심플하게 작성하고, 공개 범위만 깔끔하게 정하세요"
      maxHeightClassName="max-h-[90dvh]"
      footer={
        <div className="border-t px-4 py-3" style={{ borderColor: "var(--rnest-sep)" }}>
          {error ? (
            <p className="mb-2 text-center text-[12px] text-red-500">{error}</p>
          ) : null}
          <div className="flex items-center justify-between gap-3">
            <div className="text-[11.5px] text-[var(--rnest-muted)]">
              {selectedTags.length}/5 태그
            </div>
            <Button
              variant="primary"
              className="h-12 flex-1 rounded-[18px] text-[14px] font-semibold"
              style={{ backgroundColor: "var(--rnest-accent)" }}
              onClick={handlePost}
              disabled={!body.trim() || posting || charCount > 500}
            >
              {posting ? "게시 중..." : "게시하기"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4 px-4 py-3">
        <section className="rounded-[28px] bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(248,248,250,0.98))] px-5 py-5 shadow-[0_18px_40px_rgba(15,23,42,0.06)] ring-1 ring-black/5">
          <p className="text-[18px] font-semibold tracking-[-0.03em] text-[var(--rnest-text)]">
            Create post
          </p>
          <p className="mt-1 text-[12.5px] leading-5 text-[var(--rnest-muted)]">
            `socialens-main`의 섹션형 작성 폼 구조를 기준으로, RNest에 맞게 더 가볍고 단정하게 정리했습니다.
          </p>
        </section>

        <ComposerSection
          label="Caption"
          hint="오늘의 기록을 자연스럽게 남겨보세요. 500자까지 입력할 수 있어요."
        >
          <div className="rounded-[20px] bg-[var(--rnest-bg)] px-4 py-4 ring-1 ring-black/5">
            <textarea
              ref={textareaRef}
              value={body}
              onChange={(event) => {
                if (Array.from(event.target.value).length <= 500) {
                  setBody(event.target.value);
                }
              }}
              placeholder="오늘 하루 어땠나요?"
              rows={7}
              className="w-full resize-none bg-transparent text-[15px] leading-7 text-[var(--rnest-text)] outline-none placeholder:text-[var(--rnest-muted)]"
              autoFocus={open}
            />
            <div className="mt-3 flex items-center justify-between">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-[12.5px] font-semibold text-[var(--rnest-text)] shadow-[0_8px_20px_rgba(15,23,42,0.06)] ring-1 ring-black/5"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 text-[var(--rnest-accent)]">
                  <rect x="3" y="3" width="18" height="18" rx="3" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                사진 추가
              </button>
              <p className={`text-[11.5px] ${charCount > 480 ? "text-red-400" : "text-[var(--rnest-muted)]"}`}>
                {charCount}/500
              </p>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleImageSelect}
          />

          {imagePreview ? (
            <div className="relative mt-3 overflow-hidden rounded-[20px] ring-1 ring-black/5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imagePreview}
                alt="첨부 이미지 미리보기"
                className="h-[220px] w-full object-cover"
              />
              <button
                type="button"
                className="absolute right-3 top-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur"
                onClick={removeImage}
                aria-label="이미지 제거"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          ) : null}
        </ComposerSection>

        <ComposerSection
          label="Tags"
          hint="인스타그램처럼 직접 입력하세요. Enter, 쉼표, 탭으로 추가되고 최대 5개까지 저장돼요."
        >
          <div className="rounded-[20px] bg-[var(--rnest-bg)] px-4 py-3 ring-1 ring-black/5">
            <div className="flex flex-wrap gap-2">
              {selectedTags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[12.5px] font-medium text-[var(--rnest-text)] ring-1 ring-black/5"
                >
                  #{tag}
                  <button
                    type="button"
                    onClick={() => removeTag(tag)}
                    className="text-[var(--rnest-muted)] transition hover:text-[var(--rnest-text)]"
                    aria-label={`${tag} 태그 삭제`}
                  >
                    ×
                  </button>
                </span>
              ))}
              {selectedTags.length < 5 ? (
                <input
                  ref={tagInputRef}
                  value={tagInput}
                  onChange={handleTagChange}
                  onKeyDown={handleTagKeyDown}
                  onBlur={commitTagInput}
                  placeholder={selectedTags.length === 0 ? "태그를 입력하고 Enter" : "다음 태그 추가"}
                  className="min-w-[140px] flex-1 bg-transparent py-1 text-[13.5px] text-[var(--rnest-text)] outline-none placeholder:text-[var(--rnest-muted)]"
                />
              ) : null}
            </div>
          </div>
        </ComposerSection>

        <ComposerSection
          label="Privacy"
          hint="버튼을 눌러 공개 범위를 선택하세요. 필요한 경우 그룹도 바로 지정할 수 있어요."
        >
          <div className="space-y-3">
            <div className="relative">
              <button
                type="button"
                onClick={() => setVisibilityMenuOpen((prev) => !prev)}
                className="flex w-full items-center justify-between rounded-[20px] bg-[var(--rnest-bg)] px-4 py-3.5 text-left ring-1 ring-black/5"
                aria-expanded={visibilityMenuOpen}
                aria-haspopup="listbox"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[15px]">{selectedVisibility.icon}</span>
                    <span className="text-[14px] font-semibold text-[var(--rnest-text)]">
                      {selectedVisibility.label}
                    </span>
                  </div>
                  <p className="mt-1 text-[12px] leading-5 text-[var(--rnest-muted)]">
                    {selectedVisibility.description}
                  </p>
                </div>
                <svg
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  className={`h-4 w-4 text-[var(--rnest-muted)] transition ${visibilityMenuOpen ? "rotate-180" : ""}`}
                >
                  <path d="M5 7.5L10 12.5L15 7.5" />
                </svg>
              </button>

              {visibilityMenuOpen ? (
                <div className="absolute left-0 right-0 top-[calc(100%+10px)] z-20 overflow-hidden rounded-[22px] bg-white shadow-[0_24px_60px_rgba(15,23,42,0.12)] ring-1 ring-black/5">
                  {VISIBILITY_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`flex w-full items-start gap-3 px-4 py-3.5 text-left transition ${
                        option.value === "group" && userGroups.length === 0
                          ? "cursor-not-allowed opacity-45"
                          : visibility === option.value
                            ? "bg-[var(--rnest-accent-soft)]"
                            : "hover:bg-black/[0.03]"
                      } ${option.value !== VISIBILITY_OPTIONS[VISIBILITY_OPTIONS.length - 1]?.value ? "border-b border-black/5" : ""}`}
                      disabled={option.value === "group" && userGroups.length === 0}
                      onClick={() => {
                        if (option.value === "group" && userGroups.length === 0) return;
                        setVisibility(option.value);
                        setVisibilityMenuOpen(false);
                        if (option.value !== "group") setSelectedGroupId(null);
                      }}
                    >
                      <span className="pt-0.5 text-[15px]">{option.icon}</span>
                      <span className="min-w-0">
                        <span className="block text-[13.5px] font-semibold text-[var(--rnest-text)]">
                          {option.label}
                        </span>
                        <span className="mt-0.5 block text-[11.5px] leading-5 text-[var(--rnest-muted)]">
                          {option.description}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            {visibility === "group" ? (
              <div className="rounded-[20px] bg-[var(--rnest-bg)] px-4 py-3 ring-1 ring-black/5">
                <label className="mb-2 block text-[12px] font-medium text-[var(--rnest-muted)]">
                  공개할 그룹 선택
                </label>
                <select
                  className="w-full rounded-[16px] bg-white px-4 py-3 text-[13.5px] font-medium text-[var(--rnest-text)] outline-none ring-1 ring-black/5"
                  value={selectedGroupId ?? ""}
                  onChange={(event) => setSelectedGroupId(event.target.value ? Number(event.target.value) : null)}
                >
                  <option value="">그룹을 선택하세요</option>
                  {userGroups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
                {userGroups.length === 0 ? (
                  <p className="mt-2 text-[11.5px] text-[var(--rnest-muted)]">
                    참여 중인 그룹이 없어서 그룹 공개를 사용할 수 없어요.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </ComposerSection>
      </div>
    </BottomSheet>
  );
}
