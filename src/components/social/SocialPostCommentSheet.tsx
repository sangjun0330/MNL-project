"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { MessageCircle } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { SocialAvatarGlyph } from "@/components/social/SocialAvatar";
import type { SocialPost, SocialPostComment } from "@/types/social";

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "방금";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  return `${day}일 전`;
}

type Props = {
  open: boolean;
  post: SocialPost | null;
  onClose: () => void;
  currentUserId?: string;
  isAdmin?: boolean;
  onCommentCountChange?: (postId: number, count: number) => void;
};

function updateCommentTree(
  comments: SocialPostComment[],
  commentId: number,
  updater: (comment: SocialPostComment) => SocialPostComment
): SocialPostComment[] {
  return comments.map((comment) => {
    if (comment.id === commentId) return updater(comment);
    if (comment.replies.length === 0) return comment;
    return { ...comment, replies: updateCommentTree(comment.replies, commentId, updater) };
  });
}

function removeCommentTree(comments: SocialPostComment[], commentId: number): SocialPostComment[] {
  return comments
    .filter((comment) => comment.id !== commentId)
    .map((comment) => {
      const nextReplies = removeCommentTree(comment.replies, commentId);
      return {
        ...comment,
        replies: nextReplies,
        replyCount: nextReplies.length,
      };
    });
}

function countComments(comments: SocialPostComment[]): number {
  return comments.reduce((total, comment) => total + 1 + countComments(comment.replies), 0);
}

export function SocialPostCommentSheet({
  open,
  post,
  onClose,
  currentUserId,
  isAdmin,
  onCommentCountChange,
}: Props) {
  const [comments, setComments] = useState<SocialPostComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [replyTarget, setReplyTarget] = useState<SocialPostComment | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // 댓글 로드
  const loadComments = useCallback(async (postId: number, cursor?: string | null) => {
    setLoading(true);
    try {
      const url = `/api/social/posts/${postId}/comments${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`;
      const res = await fetch(url).then((r) => r.json());
      if (res.ok) {
        if (cursor) {
          setComments((prev) => [...prev, ...res.data.comments]);
        } else {
          setComments(res.data.comments);
        }
        setNextCursor(res.data.nextCursor);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open || !post) return;
    setComments([]);
    setNextCursor(null);
    setInput("");
    setReplyTarget(null);
    loadComments(post.id);
  }, [open, post, loadComments]);

  // 댓글 전송
  const handleSend = useCallback(async () => {
    if (!input.trim() || !post || sending) return;
    const body = input.trim();
    setSending(true);
    setInput("");
    try {
      const res = await fetch(`/api/social/posts/${post.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, parentId: replyTarget?.parentId ? replyTarget.parentId : replyTarget?.id ?? null }),
      }).then((r) => r.json());
      if (res.ok) {
        const nextComment = res.data.comment as SocialPostComment;
        setComments((prev) => {
          const nextComments = !nextComment.parentId
            ? [...prev, nextComment]
            : prev.map((comment) => {
            if (comment.id !== nextComment.parentId) return comment;
            return {
              ...comment,
              replyCount: comment.replyCount + 1,
              replies: [...comment.replies, nextComment],
            };
          });
          onCommentCountChange?.(post.id, countComments(nextComments));
          return nextComments;
        });
        setReplyTarget(null);
        // 스크롤 아래로
        requestAnimationFrame(() => {
          listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
        });
      }
    } finally {
      setSending(false);
    }
  }, [input, onCommentCountChange, post, replyTarget, sending]);

  // 댓글 삭제
  const handleDeleteComment = useCallback(async (commentId: number) => {
    if (!post) return;
    const res = await fetch(
      `/api/social/posts/${post.id}/comments?commentId=${commentId}`,
      { method: "DELETE" }
    ).then((r) => r.json());
    if (res.ok) {
      setComments((prev) => {
        const nextComments = removeCommentTree(prev, commentId);
        onCommentCountChange?.(post.id, countComments(nextComments));
        return nextComments;
      });
    }
  }, [onCommentCountChange, post]);

  const handleLikeComment = useCallback(async (commentId: number, liked: boolean) => {
    if (!post) return;
    setComments((prev) =>
      updateCommentTree(prev, commentId, (comment) => ({
        ...comment,
        isLiked: !liked,
        likeCount: liked ? Math.max(0, comment.likeCount - 1) : comment.likeCount + 1,
      }))
    );

    const res = await fetch(`/api/social/posts/${post.id}/comments/${commentId}/like`, {
      method: "POST",
    }).then((r) => r.json());

    if (res.ok) {
      setComments((prev) =>
        updateCommentTree(prev, commentId, (comment) => ({
          ...comment,
          isLiked: res.data.liked,
          likeCount: res.data.count,
        }))
      );
    }
  }, [post]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const charCount = Array.from(input).length;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="댓글"
      maxHeightClassName="max-h-[75dvh]"
      footer={
        <div className="px-4 py-3 border-t" style={{ borderColor: "var(--rnest-sep)" }}>
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => {
                const val = e.target.value;
                if (Array.from(val).length <= 200) setInput(val);
              }}
              onKeyDown={handleKeyDown}
              placeholder={replyTarget ? `${replyTarget.authorProfile.displayName || replyTarget.authorProfile.nickname}님에게 답글 남기기...` : "댓글을 입력하세요..."}
              rows={1}
              className="flex-1 resize-none rounded-xl px-3 py-2.5 text-[14px] leading-relaxed outline-none bg-[var(--rnest-bg)] placeholder:text-[var(--rnest-muted)] text-[var(--rnest-text)]"
              style={{ maxHeight: "96px", minHeight: "40px", border: "1px solid var(--rnest-sep)" }}
            />
            <button
              disabled={!input.trim() || sending}
              onClick={handleSend}
              className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-95 disabled:opacity-40"
              style={{ backgroundColor: "var(--rnest-accent)" }}
              aria-label="댓글 전송"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
          {replyTarget ? (
            <div className="mt-2 flex items-center justify-between rounded-xl bg-[var(--rnest-bg)] px-3 py-2 text-[12px] text-[var(--rnest-muted)]">
              <span>
                @{replyTarget.authorProfile.handle ?? replyTarget.authorProfile.nickname} 님에게 답글 작성 중
              </span>
              <button type="button" onClick={() => setReplyTarget(null)} className="font-medium">
                취소
              </button>
            </div>
          ) : null}
          {charCount > 160 && (
            <p className="text-[11px] mt-1 text-right" style={{ color: charCount > 195 ? "#ef4444" : "var(--rnest-muted)" }}>
              {charCount}/200
            </p>
          )}
        </div>
      }
    >
      <div ref={listRef} className="flex flex-col overflow-y-auto px-4">
        {/* 원본 게시글 미리보기 */}
        {post && (
          <div className="py-3 border-b" style={{ borderColor: "var(--rnest-sep)" }}>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-7 h-7 rounded-full flex items-center justify-center text-sm shrink-0"
                style={{ backgroundColor: "var(--rnest-lavender-soft)" }}>
                <SocialAvatarGlyph emoji={post.authorProfile.avatarEmoji} className="h-5 w-5" />
              </span>
              <span className="text-[12px] font-semibold text-[var(--rnest-text)]">
                {post.authorProfile.nickname}
              </span>
            </div>
            <p className="text-[13px] text-[var(--rnest-sub)] line-clamp-2 leading-relaxed pl-9">
              {post.body}
            </p>
          </div>
        )}

        {/* 댓글 목록 */}
        {loading && comments.length === 0 ? (
          <div className="py-8 flex justify-center">
            <div className="w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor: "var(--rnest-accent)", borderTopColor: "transparent" }} />
          </div>
        ) : comments.length === 0 ? (
          <div className="py-10 text-center">
            <div className="flex flex-col items-center gap-2 text-[var(--rnest-muted)]">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--rnest-lavender-soft)]">
                <MessageCircle className="h-4 w-4" strokeWidth={2} />
              </span>
              <p className="text-[13px]">첫 댓글을 남겨보세요</p>
            </div>
          </div>
        ) : (
          <div className="py-2 space-y-1">
            {comments.map((comment) => {
              const canDeleteComment = currentUserId === comment.authorUserId || isAdmin;
              return (
                <div key={comment.id} className="flex items-start gap-2.5 py-2.5 group">
                  <span
                    className="w-7 h-7 rounded-full flex items-center justify-center text-sm shrink-0 mt-0.5 overflow-hidden"
                    style={{ backgroundColor: "var(--rnest-lavender-soft)" }}
                  >
                    {comment.authorProfile.profileImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={comment.authorProfile.profileImageUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <SocialAvatarGlyph emoji={comment.authorProfile.avatarEmoji} className="h-5 w-5" />
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-[12px] font-semibold text-[var(--rnest-text)]">
                        {comment.authorProfile.displayName || comment.authorProfile.nickname}
                      </span>
                      {comment.authorProfile.handle ? (
                        <span className="text-[11px] text-[var(--rnest-muted)]">@{comment.authorProfile.handle}</span>
                      ) : null}
                      <span className="text-[11px] text-[var(--rnest-muted)]">
                        {formatRelativeTime(comment.createdAt)}
                      </span>
                    </div>
                    <p className="text-[13px] text-[var(--rnest-sub)] leading-relaxed break-words">
                      {comment.body}
                    </p>
                    <div className="mt-1.5 flex items-center gap-3 text-[11px] text-[var(--rnest-muted)]">
                      <button type="button" onClick={() => handleLikeComment(comment.id, comment.isLiked)}>
                        {comment.isLiked ? "좋아요 취소" : "좋아요"}
                        {comment.likeCount > 0 ? ` ${comment.likeCount}` : ""}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setReplyTarget(comment);
                          inputRef.current?.focus();
                        }}
                      >
                        답글
                        {comment.replyCount > 0 ? ` ${comment.replyCount}` : ""}
                      </button>
                    </div>
                    {comment.replies.length > 0 ? (
                      <div className="mt-3 space-y-2 rounded-2xl bg-[var(--rnest-bg)] px-3 py-2.5">
                        {comment.replies.map((reply) => {
                          const canDeleteReply = currentUserId === reply.authorUserId || isAdmin;
                          return (
                            <div key={reply.id} className="flex items-start gap-2">
                              <span
                                className="w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0 overflow-hidden"
                                style={{ backgroundColor: "var(--rnest-lavender-soft)" }}
                              >
                                {reply.authorProfile.profileImageUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={reply.authorProfile.profileImageUrl} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <SocialAvatarGlyph emoji={reply.authorProfile.avatarEmoji} className="h-4 w-4" />
                                )}
                              </span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-[11.5px] font-semibold text-[var(--rnest-text)]">
                                    {reply.authorProfile.displayName || reply.authorProfile.nickname}
                                  </span>
                                  <span className="text-[10.5px] text-[var(--rnest-muted)]">
                                    {formatRelativeTime(reply.createdAt)}
                                  </span>
                                </div>
                                <p className="text-[12px] text-[var(--rnest-sub)] leading-relaxed break-words">
                                  {reply.body}
                                </p>
                                <div className="mt-1 flex items-center gap-3 text-[10.5px] text-[var(--rnest-muted)]">
                                  <button type="button" onClick={() => handleLikeComment(reply.id, reply.isLiked)}>
                                    {reply.isLiked ? "좋아요 취소" : "좋아요"}
                                    {reply.likeCount > 0 ? ` ${reply.likeCount}` : ""}
                                  </button>
                                  {canDeleteReply ? (
                                    <button type="button" onClick={() => handleDeleteComment(reply.id)}>
                                      삭제
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                  {canDeleteComment && (
                    <button
                      className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity p-1 text-[var(--rnest-muted)] hover:text-red-400"
                      onClick={() => handleDeleteComment(comment.id)}
                      aria-label="댓글 삭제"
                    >
                      <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </button>
                  )}
                </div>
              );
            })}

            {/* 더 보기 */}
            {nextCursor && (
              <button
                className="w-full py-3 text-[13px] font-medium text-center"
                style={{ color: "var(--rnest-accent)" }}
                onClick={() => post && loadComments(post.id, nextCursor)}
                disabled={loading}
              >
                {loading ? "불러오는 중..." : "더 보기"}
              </button>
            )}
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
