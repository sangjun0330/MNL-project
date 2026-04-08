"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import type { SocialProfile, ScheduleVisibility, HealthVisibility } from "@/types/social";
import { useAppStoreSelector } from "@/lib/store";

const AVATAR_OPTIONS = ["🐧", "🦊", "🐱", "🐻", "🦁", "🐺", "🦅", "🐬"];

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function generateAutoStatus(schedule: Record<string, string>): string | null {
  const todayISO = toISODate(new Date());
  const tomorrowISO = toISODate(new Date(Date.now() + 86400000));
  const today = schedule[todayISO];
  const tomorrow = schedule[tomorrowISO];
  if (today === "OFF" || today === "VAC") return "오늘 오프 🎉";
  if (tomorrow === "OFF" || tomorrow === "VAC") return "내일 오프입니다 😊";
  if (today === "N") return "오늘 야간 근무 중 🌙";
  if (today === "D") return "오늘 낮 근무 중 ☀️";
  if (today === "E") return "오늘 저녁 근무 중 🌆";
  return null;
}

type Props = {
  open: boolean;
  onClose: () => void;
  profile: SocialProfile | null;
  onSaved: (profile: SocialProfile) => void;
};

type ShareState = "idle" | "link-copied" | "shared";

function formatCode(code: string | null) {
  if (!code) return "------";
  return `${code.slice(0, 3)} · ${code.slice(3)}`;
}

type ToggleSwitchProps = {
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
  label: string;
};

function ToggleSwitch({ checked, disabled = false, onToggle, label }: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={`inline-flex h-7 w-12 shrink-0 items-center overflow-hidden rounded-full p-0.5 transition-colors duration-200 ${
        checked ? "bg-[color:var(--rnest-accent)]" : "bg-ios-sep"
      } disabled:opacity-50`}
    >
      <span
        className={`block h-6 w-6 rounded-full bg-white shadow-[0_1px_3px_rgba(15,23,42,0.18)] transition-transform duration-200 ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

export function SocialProfileSheet({ open, onClose, profile, onSaved }: Props) {
  const mySchedule = useAppStoreSelector((s) => s.schedule as Record<string, string>);
  const autoStatus = useMemo(() => generateAutoStatus(mySchedule), [mySchedule]);

  const [nickname, setNickname] = useState(profile?.nickname ?? "");
  const [avatar, setAvatar] = useState(profile?.avatarEmoji ?? "🐧");
  const [statusMessage, setStatusMessage] = useState(profile?.statusMessage ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [code, setCode] = useState<string | null>(null);
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const [shareState, setShareState] = useState<ShareState>("idle");
  const [sharing, setSharing] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  // 프라이버시 설정 상태
  const [scheduleVisibility, setScheduleVisibility] = useState<ScheduleVisibility>("full");
  const [statusMsgVisible, setStatusMsgVisible] = useState(true);
  const [acceptInvites, setAcceptInvites] = useState(true);
  const [healthVisibility, setHealthVisibility] = useState<HealthVisibility>("hidden");
  const [prefsSaving, setPrefsSaving] = useState(false);

  const trimmedNickname = nickname.trim();
  const trimmedStatusMessage = statusMessage.trim().slice(0, 30);
  const dirty =
    trimmedNickname !== (profile?.nickname ?? "") ||
    avatar !== (profile?.avatarEmoji ?? "🐧") ||
    trimmedStatusMessage !== (profile?.statusMessage ?? "");

  useEffect(() => {
    if (!open) return;
    setNickname(profile?.nickname ?? "");
    setAvatar(profile?.avatarEmoji ?? "🐧");
    setStatusMessage(profile?.statusMessage ?? "");
    setError(null);
    setCodeCopied(false);
  }, [open, profile]);

  const loadCode = useCallback(async () => {
    setCodeLoading(true);
    setCodeError(null);
    try {
      const res = await fetch("/api/social/code", { cache: "no-store" }).then((r) => r.json());
      if (!res.ok) {
        throw new Error("내 코드를 불러오지 못했어요. 다시 시도해 주세요.");
      }
      setCode(res.data?.code ?? null);
    } catch (err: any) {
      setCode(null);
      setCodeError(String(err?.message ?? "내 코드를 불러오지 못했어요. 다시 시도해 주세요."));
    } finally {
      setCodeLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadCode();
    // 프라이버시 설정 로드
    fetch("/api/social/preferences", { cache: "no-store" })
      .then((r) => r.json())
      .then((res) => {
        if (res.ok) {
          setScheduleVisibility(res.data?.scheduleVisibility ?? "full");
          setStatusMsgVisible(res.data?.statusMessageVisible !== false);
          setAcceptInvites(res.data?.acceptInvites !== false);
          setHealthVisibility(res.data?.healthVisibility === "full" ? "full" : "hidden");
        }
      })
      .catch(() => {});
  }, [open, loadCode]);

  const formattedCode = useMemo(() => formatCode(code), [code]);

  const applyPreferenceState = useCallback((value: {
    scheduleVisibility: ScheduleVisibility;
    statusMessageVisible: boolean;
    acceptInvites: boolean;
    healthVisibility: HealthVisibility;
  }) => {
    setScheduleVisibility(value.scheduleVisibility);
    setStatusMsgVisible(value.statusMessageVisible);
    setAcceptInvites(value.acceptInvites);
    setHealthVisibility(value.healthVisibility);
  }, []);

  const handleSave = async () => {
    if (!trimmedNickname || saving) return;
    if (trimmedNickname.length > 12) {
      setError("닉네임은 12자 이하로 입력해 주세요.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/social/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nickname: trimmedNickname,
          avatarEmoji: avatar,
          statusMessage: trimmedStatusMessage,
        }),
      }).then((r) => r.json());

      if (!res.ok) {
        if (res.error === "nickname_required") throw new Error("닉네임을 입력해 주세요.");
        if (res.error === "invalid_avatar") throw new Error("아바타를 다시 선택해 주세요.");
        throw new Error("프로필 저장에 실패했어요.");
      }

      onSaved(res.data);
    } catch (err: any) {
      setError(String(err?.message ?? "프로필 저장에 실패했어요."));
    } finally {
      setSaving(false);
    }
  };

  const handleCopyCode = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    } catch {
      setError("클립보드에 복사하지 못했어요.");
    }
  };

  const handleShareLink = async () => {
    if (sharing) return;
    setSharing(true);
    setError(null);

    try {
      const res = await fetch("/api/social/share-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }).then((r) => r.json());

      if (!res.ok) {
        if (res.error === "too_many_requests") throw new Error("공유 링크를 너무 자주 만들고 있어요. 잠시 후 다시 시도해 주세요.");
        throw new Error("공유 링크를 만들지 못했어요.");
      }

      const inviteUrl = String(res.data?.url ?? "");
      const text = `RNest 소셜에서 친구 추가해줘.\n링크를 열면 친구 코드 입력칸이 바로 열려요.`;
      const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };

      if (typeof nav.share === "function") {
        await nav.share({ title: "RNest 소셜 초대", text, url: inviteUrl });
        setShareState("shared");
      } else {
        await navigator.clipboard.writeText(inviteUrl);
        setShareState("link-copied");
      }

      setTimeout(() => setShareState("idle"), 2400);
    } catch (err: any) {
      if (String(err?.name ?? "") !== "AbortError") {
        setError(String(err?.message ?? "공유 링크를 만들지 못했어요."));
      }
    } finally {
      setSharing(false);
    }
  };

  const handleSavePrefs = async (patch: Partial<{
    scheduleVisibility: ScheduleVisibility;
    statusMessageVisible: boolean;
    acceptInvites: boolean;
    healthVisibility: HealthVisibility;
  }>) => {
    if (prefsSaving) return;
    const previousPrefs = {
      scheduleVisibility,
      statusMessageVisible: statusMsgVisible,
      acceptInvites,
      healthVisibility,
    };
    setPrefsSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/social/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const res = await response.json().catch(() => null);
      if (!response.ok || !res?.ok) {
        throw new Error(String(res?.error ?? "failed_to_save_preferences"));
      }
      applyPreferenceState({
        scheduleVisibility: res.data?.scheduleVisibility ?? previousPrefs.scheduleVisibility,
        statusMessageVisible: res.data?.statusMessageVisible !== false,
        acceptInvites: res.data?.acceptInvites !== false,
        healthVisibility: res.data?.healthVisibility === "full" ? "full" : "hidden",
      });
    } catch {
      applyPreferenceState(previousPrefs);
      setError("프라이버시 설정 저장에 실패했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setPrefsSaving(false);
    }
  };

  const handleRegenerate = async () => {
    if (regenerating) return;
    setRegenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/social/code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regenerate: true }),
      }).then((r) => r.json());

      if (!res.ok) {
        if (res.error === "too_many_requests") throw new Error("코드 재생성은 하루에 몇 번만 가능해요. 잠시 후 다시 시도해 주세요.");
        throw new Error("코드를 재생성하지 못했어요.");
      }

      setCode(res.data?.code ?? null);
      setCodeError(null);
    } catch (err: any) {
      setCodeError(String(err?.message ?? "코드를 재생성하지 못했어요."));
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="내 소셜 프로필"
      subtitle="닉네임을 바꾸고, 내 코드를 확인하고, 공유 링크를 만들 수 있어요"
      variant="appstore"
      maxHeightClassName="max-h-[78dvh]"
    >
      <div className="space-y-5 pb-6">
        <div className="rounded-3xl bg-white px-4 py-4 shadow-apple">
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[color:var(--rnest-accent-soft)] text-[30px]">
              {avatar}
            </div>
            <div className="min-w-0">
              <p className="text-[16px] font-semibold text-ios-text">{trimmedNickname || "닉네임을 입력해 주세요"}</p>
              <p className="text-[12.5px] text-ios-muted">친구에게 이 프로필로 표시됩니다.</p>
            </div>
          </div>

          <div className="mt-4">
            <label className="mb-1.5 block text-[13px] font-semibold text-ios-text">
              닉네임 <span className="font-normal text-ios-muted">(최대 12자)</span>
            </label>
            <input
              value={nickname}
              onChange={(e) => {
                setNickname(e.target.value.slice(0, 12));
                setError(null);
              }}
              placeholder="닉네임 입력"
              maxLength={12}
              className="w-full rounded-2xl border border-ios-sep bg-ios-bg px-4 py-3 text-[15px] text-ios-text outline-none transition focus:border-[color:var(--rnest-accent)] placeholder:text-ios-muted/60"
            />
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[13px] font-semibold text-ios-text">
                상태 메시지 <span className="font-normal text-ios-muted">(선택)</span>
              </label>
              <div className="flex items-center gap-2">
                {autoStatus && (
                  <button
                    type="button"
                    onClick={() => { setStatusMessage(autoStatus); setError(null); }}
                    className="text-[11px] font-semibold text-[color:var(--rnest-accent)] underline underline-offset-2 transition active:opacity-60"
                  >
                    자동 제안
                  </button>
                )}
                <span className="text-[12px] text-ios-muted">{Array.from(trimmedStatusMessage).length}/30</span>
              </div>
            </div>
            <input
              value={statusMessage}
              onChange={(e) => {
                // 줄바꿈·탭 → 공백 (붙여넣기 방지), 30자 제한 (grapheme 단위)
                const cleaned = e.target.value.replace(/[\r\n\t]+/g, " ");
                const chars = Array.from(cleaned);
                if (chars.length <= 30) setStatusMessage(cleaned);
                setError(null);
              }}
              placeholder="한 줄 메시지를 입력해 주세요"
              maxLength={60}
              className="w-full rounded-2xl border border-ios-sep bg-ios-bg px-4 py-3 text-[15px] text-ios-text outline-none transition focus:border-[color:var(--rnest-accent)] placeholder:text-ios-muted/60"
            />
          </div>

          <div className="mt-4">
            <label className="mb-2 block text-[13px] font-semibold text-ios-text">아바타</label>
            <div className="flex flex-wrap gap-3">
              {AVATAR_OPTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => {
                    setAvatar(emoji);
                    setError(null);
                  }}
                  className={`flex h-12 w-12 items-center justify-center rounded-2xl text-[24px] transition active:scale-95 ${
                    avatar === emoji
                      ? "bg-[color:var(--rnest-accent-soft)] ring-2 ring-[color:var(--rnest-accent)]"
                      : "bg-ios-bg"
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          <Button
            variant="primary"
            disabled={!trimmedNickname || saving || !dirty}
            onClick={handleSave}
            className="mt-4 w-full rounded-2xl py-3.5 text-[15px]"
          >
            {saving ? "저장 중…" : dirty ? "프로필 저장" : "프로필 저장됨"}
          </Button>
        </div>

        <div className="rounded-3xl bg-white px-4 py-4 shadow-apple">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[14px] font-semibold text-ios-text">내 친구 코드</p>
              <p className="mt-0.5 text-[12px] text-ios-muted">친구가 직접 입력할 때 쓰는 6자리 코드예요.</p>
            </div>
            <button
              type="button"
              onClick={handleRegenerate}
              disabled={regenerating || codeLoading}
              className="shrink-0 text-[12px] font-semibold text-ios-muted underline underline-offset-2 transition active:opacity-60 disabled:opacity-40"
            >
              {regenerating ? "재생성 중…" : "재생성"}
            </button>
          </div>

          <div className="mt-3 flex h-24 items-center justify-center rounded-2xl bg-ios-bg">
            {codeLoading ? (
              <span className="text-[18px] font-semibold tracking-widest text-ios-muted">로드 중…</span>
            ) : codeError ? (
              <div className="flex flex-col items-center gap-2 px-4 text-center">
                <span className="text-[13px] text-red-500">{codeError}</span>
                <button
                  type="button"
                  onClick={() => void loadCode()}
                  className="text-[12px] font-semibold text-[color:var(--rnest-accent)] underline underline-offset-2"
                >
                  다시 불러오기
                </button>
              </div>
            ) : (
              <span className="select-all text-[28px] font-bold tracking-widest text-ios-text">{formattedCode}</span>
            )}
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <Button
              variant="secondary"
              disabled={!code || codeLoading || !!codeError}
              onClick={handleCopyCode}
              className="h-12 rounded-2xl text-[14px]"
            >
              {codeCopied ? "코드 복사됨" : "코드 복사"}
            </Button>
            <Button
              variant="secondary"
              disabled={sharing}
              onClick={handleShareLink}
              className="h-12 rounded-2xl text-[14px]"
            >
              {sharing
                ? "링크 준비 중…"
                : shareState === "link-copied"
                  ? "링크 복사됨"
                  : shareState === "shared"
                    ? "공유 완료"
                    : "공유 링크 보내기"}
            </Button>
          </div>

          <p className="mt-3 text-[11.5px] leading-5 text-ios-muted">
            공유 링크는 만료 시간이 있고, 코드 재생성 시 이전 공유 링크는 자동으로 만료됩니다.
          </p>
        </div>

        {/* 프라이버시 설정 */}
        <div className="rounded-3xl bg-white px-4 py-4 shadow-apple">
          <p className="text-[14px] font-semibold text-ios-text mb-3">프라이버시</p>

          {/* 근무 공개 범위 */}
          <div className="mb-3">
            <p className="text-[12.5px] font-medium text-ios-text mb-1.5">근무 공개 범위</p>
            <div className="flex rounded-2xl bg-ios-bg p-1 gap-1">
              {(["full", "off_only", "hidden"] as ScheduleVisibility[]).map((v) => {
                const labels: Record<ScheduleVisibility, string> = {
                  full: "전체 공개",
                  off_only: "오프만",
                  hidden: "비공개",
                };
                return (
                  <button
                    key={v}
                    type="button"
                    disabled={prefsSaving}
                    onClick={() => {
                      setScheduleVisibility(v);
                      void handleSavePrefs({ scheduleVisibility: v });
                    }}
                    className={`flex-1 rounded-xl py-2 text-[11.5px] font-semibold transition ${
                      scheduleVisibility === v
                        ? "bg-white text-ios-text shadow-sm"
                        : "text-ios-muted"
                    }`}
                  >
                    {labels[v]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 상태 메시지 공개 */}
          <div className="flex items-center justify-between py-2 border-t border-ios-sep">
            <div>
              <p className="text-[12.5px] font-medium text-ios-text">상태 메시지 공개</p>
              <p className="text-[11px] text-ios-muted mt-0.5">친구에게 내 상태 메시지 표시</p>
            </div>
            <ToggleSwitch
              checked={statusMsgVisible}
              disabled={prefsSaving}
              label="상태 메시지 공개"
              onToggle={() => {
                const next = !statusMsgVisible;
                setStatusMsgVisible(next);
                void handleSavePrefs({ statusMessageVisible: next });
              }}
            />
          </div>

          {/* 초대 링크 수신 */}
          <div className="flex items-center justify-between py-2 border-t border-ios-sep">
            <div>
              <p className="text-[12.5px] font-medium text-ios-text">친구 요청 수신</p>
              <p className="text-[11px] text-ios-muted mt-0.5">코드/링크로 연결 요청 받기</p>
            </div>
            <ToggleSwitch
              checked={acceptInvites}
              disabled={prefsSaving}
              label="친구 요청 수신"
              onToggle={() => {
                const next = !acceptInvites;
                setAcceptInvites(next);
                void handleSavePrefs({ acceptInvites: next });
              }}
            />
          </div>

          {/* 건강 데이터 그룹 공유 */}
          <div className="flex items-center justify-between py-2 border-t border-ios-sep">
            <div>
              <p className="text-[12.5px] font-medium text-ios-text">건강 데이터 그룹 공유</p>
              <p className="text-[11px] text-ios-muted mt-0.5">그룹 랭킹에 배터리·수면 점수 참여</p>
            </div>
            <ToggleSwitch
              checked={healthVisibility === "full"}
              disabled={prefsSaving}
              label="건강 데이터 그룹 공유"
              onToggle={() => {
                const next: HealthVisibility = healthVisibility === "full" ? "hidden" : "full";
                setHealthVisibility(next);
                void handleSavePrefs({ healthVisibility: next });
              }}
            />
          </div>
        </div>

        {error ? (
          <p className="rounded-2xl bg-red-50 px-4 py-3 text-[13px] text-red-600">{error}</p>
        ) : null}
      </div>
    </BottomSheet>
  );
}
