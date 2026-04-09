"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import type { SocialGroupSummary, SocialPost, SocialPostVisibility } from "@/types/social";

const QUICK_TAGS = [
  "야간후회복",
  "수면기록",
  "오프데이",
  "번아웃주의",
  "활력",
  "꿀휴식",
  "나이트회복",
  "감사한하루",
  "소소한일상",
  "간호사일상",
];

type Props = {
  open: boolean;
  onClose: () => void;
  onPosted: (post: SocialPost) => void;
  userGroups?: Pick<SocialGroupSummary, "id" | "name">[];
  defaultVisibility?: SocialPostVisibility;
};

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
  const [visibility, setVisibility] = useState<SocialPostVisibility>(defaultVisibility);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 시트 열릴 때 초기화
  useEffect(() => {
    if (!open) return;
    setBody("");
    setSelectedTags([]);
    setVisibility(defaultVisibility);
    setSelectedGroupId(null);
    setImageFile(null);
    setImagePreview(null);
    setPosting(false);
    setError(null);
  }, [defaultVisibility, open]);

  const charCount = Array.from(body).length;

  // 태그 토글
  const toggleTag = useCallback((tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag)
        ? prev.filter((t) => t !== tag)
        : prev.length < 5
        ? [...prev, tag]
        : prev
    );
  }, []);

  // 이미지 선택
  const handleImageSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
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
    reader.onload = (ev) => setImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }, [maxImageBytes]);

  const removeImage = useCallback(() => {
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  // Supabase Storage에 이미지 업로드 (게시글 생성 전에 수행)
  const uploadImage = useCallback(async (): Promise<string | null> => {
    if (!imageFile) return null;
    const formData = new FormData();
    formData.set("file", imageFile);

    const res = await fetch("/api/social/posts/image", {
      method: "POST",
      body: formData,
    }).then((r) => r.json());

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

  // 게시글 전송
  const handlePost = useCallback(async () => {
    const trimmedBody = body.trim();
    if (!trimmedBody || posting) return;
    if (visibility === "group" && !selectedGroupId) {
      setError("그룹을 선택해 주세요.");
      return;
    }

    setPosting(true);
    setError(null);

    try {
      let imagePath: string | null = null;
      if (imageFile) {
        imagePath = await uploadImage();
      }

      const res = await fetch("/api/social/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: trimmedBody,
          tags: selectedTags,
          visibility,
          groupId: visibility === "group" ? selectedGroupId : null,
          imagePath,
        }),
      }).then((r) => r.json());

      if (!res.ok) {
        if (res.error === "invalid_image_path") throw new Error("이미지 업로드 정보가 올바르지 않아요. 다시 시도해 주세요.");
        if (res.error === "too_many_requests") throw new Error("게시글을 너무 많이 올리고 있어요. 잠시 후 다시 시도해 주세요.");
        if (res.error === "not_group_member") throw new Error("해당 그룹의 멤버가 아니에요.");
        throw new Error("게시글을 올리지 못했어요.");
      }

      onPosted(res.data.post as SocialPost);
      onClose();
    } catch (err: any) {
      setError(String(err?.message ?? "게시글을 올리지 못했어요."));
    } finally {
      setPosting(false);
    }
  }, [body, posting, visibility, selectedGroupId, selectedTags, imageFile, uploadImage, onPosted, onClose]);

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="새 게시글"
      maxHeightClassName="max-h-[88dvh]"
      footer={
        <div className="px-4 py-3 border-t" style={{ borderColor: "var(--rnest-sep)" }}>
          {error && (
            <p className="text-[12px] text-red-500 mb-2 text-center">{error}</p>
          )}
          <Button
            variant="primary"
            className="w-full"
            style={{ backgroundColor: "var(--rnest-accent)" } as React.CSSProperties}
            onClick={handlePost}
            disabled={!body.trim() || posting || charCount > 500}
          >
            {posting ? "올리는 중..." : "게시하기"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4 px-4 py-2">
        {/* 텍스트 입력 */}
        <div>
          <textarea
            ref={textareaRef}
            value={body}
            onChange={(e) => {
              if (Array.from(e.target.value).length <= 500) setBody(e.target.value);
            }}
            placeholder="오늘 하루 어땠나요?"
            rows={4}
            className="w-full resize-none text-[14px] leading-relaxed outline-none bg-transparent placeholder:text-[var(--rnest-muted)] text-[var(--rnest-text)]"
            autoFocus={open}
          />
          <p className={`text-right text-[11px] mt-1 ${charCount > 480 ? "text-red-400" : "text-[var(--rnest-muted)]"}`}>
            {charCount}/500
          </p>
        </div>

        {/* 이미지 미리보기 */}
        {imagePreview && (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imagePreview}
              alt="첨부 이미지 미리보기"
              className="w-full rounded-xl object-cover"
              style={{ maxHeight: "220px" }}
            />
            <button
              className="absolute top-2 right-2 w-7 h-7 bg-black/50 rounded-full flex items-center justify-center text-white"
              onClick={removeImage}
              aria-label="이미지 제거"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        )}

        {/* 이미지 추가 버튼 */}
        {!imagePreview && (
          <button
            className="flex items-center gap-2 text-[13px] font-medium py-2.5 px-3 rounded-xl"
            style={{ backgroundColor: "var(--rnest-lavender-soft)", color: "var(--rnest-lavender)" }}
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <rect x="3" y="3" width="18" height="18" rx="3" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            사진 추가
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleImageSelect}
        />

        {/* 태그 빠른 선택 */}
        <div>
          <p className="text-[11px] font-medium text-[var(--rnest-muted)] mb-2">태그 추가 (최대 5개)</p>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_TAGS.map((tag) => {
              const isSelected = selectedTags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  className="text-[12px] font-medium px-3 py-1.5 rounded-full transition-all active:scale-95"
                  style={{
                    backgroundColor: isSelected ? "var(--rnest-accent)" : "var(--rnest-lavender-soft)",
                    color: isSelected ? "white" : "var(--rnest-lavender)",
                    border: `1px solid ${isSelected ? "var(--rnest-accent)" : "var(--rnest-lavender-border)"}`,
                  }}
                  onClick={() => toggleTag(tag)}
                >
                  #{tag}
                </button>
              );
            })}
          </div>
        </div>

        {/* 공개 범위 */}
        <div>
          <p className="text-[11px] font-medium text-[var(--rnest-muted)] mb-2">공개 범위</p>
          <div className="flex gap-2">
            <button
              type="button"
              className="flex-1 py-2.5 rounded-xl text-[13px] font-medium transition-all active:scale-95"
              style={{
                backgroundColor: visibility === "public_internal" ? "var(--rnest-accent)" : "var(--rnest-lavender-soft)",
                color: visibility === "public_internal" ? "white" : "var(--rnest-lavender)",
                border: `1px solid ${visibility === "public_internal" ? "var(--rnest-accent)" : "var(--rnest-lavender-border)"}`,
              }}
              onClick={() => setVisibility("public_internal")}
            >
              🌍 전체 허브
            </button>
            <button
              type="button"
              className="flex-1 py-2.5 rounded-xl text-[13px] font-medium transition-all active:scale-95"
              style={{
                backgroundColor: visibility === "followers" ? "var(--rnest-accent)" : "var(--rnest-lavender-soft)",
                color: visibility === "followers" ? "white" : "var(--rnest-lavender)",
                border: `1px solid ${visibility === "followers" ? "var(--rnest-accent)" : "var(--rnest-lavender-border)"}`,
              }}
              onClick={() => setVisibility("followers")}
            >
              👀 팔로워
            </button>
          </div>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="flex-1 py-2.5 rounded-xl text-[13px] font-medium transition-all active:scale-95"
              style={{
                backgroundColor: visibility === "friends" ? "var(--rnest-accent)" : "var(--rnest-lavender-soft)",
                color: visibility === "friends" ? "white" : "var(--rnest-lavender)",
                border: `1px solid ${visibility === "friends" ? "var(--rnest-accent)" : "var(--rnest-lavender-border)"}`,
              }}
              onClick={() => setVisibility("friends")}
            >
              👥 친구에게
            </button>
            <button
              type="button"
              className="flex-1 py-2.5 rounded-xl text-[13px] font-medium transition-all active:scale-95"
              style={{
                backgroundColor: visibility === "group" ? "var(--rnest-accent)" : "var(--rnest-lavender-soft)",
                color: visibility === "group" ? "white" : "var(--rnest-lavender)",
                border: `1px solid ${visibility === "group" ? "var(--rnest-accent)" : "var(--rnest-lavender-border)"}`,
              }}
              onClick={() => setVisibility("group")}
              disabled={userGroups.length === 0}
            >
              🏠 그룹에
            </button>
          </div>

          {/* 그룹 선택 드롭다운 */}
          {visibility === "group" && userGroups.length > 0 && (
            <select
              className="mt-2 w-full rounded-xl px-3 py-2.5 text-[13px] outline-none"
              style={{
                backgroundColor: "var(--rnest-bg)",
                border: "1px solid var(--rnest-sep)",
                color: "var(--rnest-text)",
              }}
              value={selectedGroupId ?? ""}
              onChange={(e) => setSelectedGroupId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">그룹 선택...</option>
              {userGroups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          )}

          {visibility === "group" && userGroups.length === 0 && (
            <p className="mt-2 text-[12px] text-[var(--rnest-muted)]">
              속한 그룹이 없어요. 먼저 그룹에 참여해 주세요.
            </p>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
