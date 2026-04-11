"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Globe, Link2, Lock, User, Users } from "lucide-react";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import {
  DEFAULT_SOCIAL_AVATAR,
  SOCIAL_AVATAR_OPTIONS,
  SocialAvatarBadge,
} from "@/components/social/SocialAvatar";
import type {
  HealthVisibility,
  ScheduleVisibility,
  SocialPostVisibility,
  SocialProfile,
} from "@/types/social";
import { cn } from "@/lib/cn";
import { useAppStoreSelector } from "@/lib/store";

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function generateAutoStatus(schedule: Record<string, string>): string | null {
  const todayISO = toISODate(new Date());
  const tomorrowISO = toISODate(new Date(Date.now() + 86400000));
  const today = schedule[todayISO];
  const tomorrow = schedule[tomorrowISO];
  if (today === "OFF" || today === "VAC") return "오늘 오프";
  if (tomorrow === "OFF" || tomorrow === "VAC") return "내일 오프입니다";
  if (today === "N") return "오늘 야간 근무 중";
  if (today === "D") return "오늘 낮 근무 중";
  if (today === "E") return "오늘 저녁 근무 중";
  return null;
}

type Props = {
  open: boolean;
  onClose: () => void;
  profile: SocialProfile | null;
  onSaved: (profile: SocialProfile) => void;
};

type ShareState = "idle" | "link-copied" | "shared";
type EditorView =
  | "root"
  | "profile"
  | "visibility"
  | "friendProfile"
  | "privacy"
  | "connectCode"
  | "displayName"
  | "handle"
  | "nickname"
  | "bio"
  | "statusMessage";
type AvailabilityField = "displayName" | "handle" | "nickname";
type AvailabilityState = {
  status: "idle" | "checking" | "available" | "unavailable" | "invalid";
  message: string | null;
  normalizedValue: string;
};

const HANDLE_REGEX = /^[a-z0-9](?:[a-z0-9._-]{1,28}[a-z0-9])?$/;
const INVISIBLE_UNSAFE_CHARS = /[\u0000-\u001f\u007f-\u009f\u200b-\u200d\u2060\ufeff\u202a-\u202e\u2066-\u2069]/g;

function formatCode(code: string | null) {
  if (!code) return "------";
  return `${code.slice(0, 3)} · ${code.slice(3)}`;
}

function buildProfileState(profile: SocialProfile | null): SocialProfile {
  return {
    nickname: profile?.nickname ?? "",
    avatarEmoji: profile?.avatarEmoji ?? DEFAULT_SOCIAL_AVATAR,
    statusMessage: profile?.statusMessage ?? "",
    handle: profile?.handle ?? null,
    displayName: profile?.displayName ?? "",
    bio: profile?.bio ?? "",
    profileImagePath: profile?.profileImagePath ?? null,
    profileImageUrl: profile?.profileImageUrl ?? null,
    discoverability: profile?.discoverability ?? "internal",
    defaultPostVisibility: profile?.defaultPostVisibility ?? "friends",
  };
}

function limitCharacters(value: string, maxLength: number) {
  return Array.from(value).slice(0, maxLength).join("");
}

function cleanNameLikeValue(value: string, maxLength: number) {
  const normalized = value
    .normalize("NFKC")
    .replace(INVISIBLE_UNSAFE_CHARS, "")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(normalized).slice(0, maxLength).join("");
}

function cleanHandleValue(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 30);
}

function cleanBioDraft(value: string) {
  return limitCharacters(value, 160);
}

function normalizeBioForSave(value: string) {
  return cleanBioDraft(value).trim();
}

function cleanStatusDraft(value: string) {
  const cleaned = value.replace(/[\r\n\t]+/g, " ");
  return Array.from(cleaned).slice(0, 30).join("");
}

function normalizeStatusForSave(value: string) {
  return cleanStatusDraft(value).trim();
}

function getAvailabilityMeta(field: AvailabilityField) {
  if (field === "displayName") {
    return {
      label: "표시 이름",
      requiredMessage: "표시 이름을 입력해 주세요.",
      takenMessage: "이미 사용 중인 표시 이름이에요.",
      availableMessage: "사용 가능한 표시 이름이에요.",
      sameMessage: "현재 표시 이름이에요.",
    };
  }

  if (field === "nickname") {
    return {
      label: "닉네임",
      requiredMessage: "닉네임을 입력해 주세요.",
      takenMessage: "이미 사용 중인 닉네임이에요.",
      availableMessage: "사용 가능한 닉네임이에요.",
      sameMessage: "현재 닉네임이에요.",
    };
  }

  return {
    label: "핸들",
    requiredMessage: "핸들은 영문 소문자, 숫자, 점, 밑줄, 하이픈으로 3~30자여야 해요.",
    takenMessage: "이미 사용 중인 핸들이에요.",
    availableMessage: "사용 가능한 핸들이에요.",
    sameMessage: "현재 핸들이에요.",
  };
}

function normalizeAvailabilityInput(field: AvailabilityField, rawValue: string) {
  if (field === "displayName") {
    const normalizedValue = cleanNameLikeValue(rawValue, 24);
    return {
      normalizedValue,
      errorMessage: normalizedValue ? null : getAvailabilityMeta(field).requiredMessage,
    };
  }

  if (field === "nickname") {
    const normalizedValue = cleanNameLikeValue(rawValue, 12);
    return {
      normalizedValue,
      errorMessage: normalizedValue ? null : getAvailabilityMeta(field).requiredMessage,
    };
  }

  const normalizedValue = cleanHandleValue(rawValue);
  if (!HANDLE_REGEX.test(normalizedValue)) {
    return {
      normalizedValue,
      errorMessage: getAvailabilityMeta(field).requiredMessage,
    };
  }

  return { normalizedValue, errorMessage: null };
}

function mapProfileSaveError(errorCode: string | null | undefined) {
  if (errorCode === "nickname_required") return "닉네임을 입력해 주세요.";
  if (errorCode === "display_name_required") return "표시 이름을 입력해 주세요.";
  if (errorCode === "display_name_taken") return "이미 사용 중인 표시 이름이에요.";
  if (errorCode === "nickname_taken") return "이미 사용 중인 닉네임이에요.";
  if (errorCode === "invalid_avatar") return "아바타를 다시 선택해 주세요.";
  if (errorCode === "invalid_handle") return "핸들 형식을 다시 확인해 주세요.";
  if (errorCode === "handle_taken") return "이미 사용 중인 핸들이에요.";
  return "프로필 저장에 실패했어요.";
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

function ChevronRightIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function InputStatusIcon({ status }: { status: AvailabilityState["status"] }) {
  if (status === "available") {
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-full border border-emerald-500 text-emerald-600">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
    );
  }

  if (status === "unavailable" || status === "invalid") {
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-full border border-red-400 text-red-500">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 8v5" />
          <path d="M12 16h.01" />
          <circle cx="12" cy="12" r="9" />
        </svg>
      </span>
    );
  }

  return <span className="h-7 w-7" />;
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-3xl bg-white px-4 py-4 shadow-apple">
      <p className="text-[14px] font-semibold text-ios-text">{title}</p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function SettingRow({
  label,
  value,
  muted = false,
  onClick,
}: {
  label: string;
  value: string;
  muted?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 py-3 text-left first:pt-0 last:pb-0"
    >
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-ios-text">{label}</p>
        <p className={cn("mt-1 truncate text-[14px]", muted ? "text-ios-muted" : "text-ios-text")}>{value}</p>
      </div>
      <span className="shrink-0 text-ios-muted">
        <ChevronRightIcon />
      </span>
    </button>
  );
}

function SegmentedOptionButton({
  active,
  disabled,
  label,
  onClick,
}: {
  active: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-2xl px-3 py-2.5 text-[12px] font-semibold transition ${
        active ? "bg-[color:var(--rnest-accent)] text-white" : "bg-ios-bg text-ios-muted"
      } disabled:opacity-50`}
    >
      {label}
    </button>
  );
}

function SettingsListRow({
  icon,
  label,
  description,
  badge,
  onClick,
  isLast = false,
}: {
  icon: React.ReactNode;
  label: string;
  description?: string;
  badge?: string;
  onClick: () => void;
  isLast?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition active:bg-gray-50 ${
        !isLast ? "border-b border-ios-sep" : ""
      }`}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[color:var(--rnest-accent-soft)] text-[color:var(--rnest-accent)]">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-semibold text-ios-text">{label}</p>
        {description ? (
          <p className="mt-0.5 truncate text-[12px] text-ios-muted">{description}</p>
        ) : null}
      </div>
      {badge ? (
        <span className="shrink-0 text-[12px] text-ios-muted">{badge}</span>
      ) : null}
      <span className="shrink-0 text-ios-muted">
        <ChevronRightIcon />
      </span>
    </button>
  );
}

function RadioRow({
  active,
  label,
  description,
  disabled = false,
  onClick,
}: {
  active: boolean;
  label: string;
  description?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center gap-3 py-3 text-left first:pt-1 last:pb-1 disabled:opacity-40"
    >
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-semibold text-ios-text">{label}</p>
        {description ? (
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-ios-muted">{description}</p>
        ) : null}
      </div>
      <span
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition ${
          active
            ? "border-[color:var(--rnest-accent)] bg-[color:var(--rnest-accent)]"
            : "border-ios-sep bg-white"
        }`}
      >
        {active ? <span className="h-2 w-2 rounded-full bg-white" /> : null}
      </span>
    </button>
  );
}

export function SocialProfileSheet({ open, onClose, profile, onSaved }: Props) {
  const mySchedule = useAppStoreSelector((s) => s.schedule as Record<string, string>);
  const autoStatus = useMemo(() => generateAutoStatus(mySchedule), [mySchedule]);

  const [savedProfile, setSavedProfile] = useState<SocialProfile>(() => buildProfileState(profile));
  const [activeView, setActiveView] = useState<EditorView>("root");
  const [displayNameDraft, setDisplayNameDraft] = useState(profile?.displayName ?? "");
  const [handleDraft, setHandleDraft] = useState(profile?.handle ?? "");
  const [nicknameDraft, setNicknameDraft] = useState(profile?.nickname ?? "");
  const [bioDraft, setBioDraft] = useState(profile?.bio ?? "");
  const [statusMessageDraft, setStatusMessageDraft] = useState(profile?.statusMessage ?? "");
  const [availability, setAvailability] = useState<AvailabilityState>({
    status: "idle",
    message: null,
    normalizedValue: "",
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const [code, setCode] = useState<string | null>(null);
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [codeCopied, setCodeCopied] = useState(false);
  const [shareState, setShareState] = useState<ShareState>("idle");
  const [sharing, setSharing] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const [scheduleVisibility, setScheduleVisibility] = useState<ScheduleVisibility>("full");
  const [statusMsgVisible, setStatusMsgVisible] = useState(true);
  const [acceptInvites, setAcceptInvites] = useState(true);
  const [healthVisibility, setHealthVisibility] = useState<HealthVisibility>("hidden");
  const [prefsSaving, setPrefsSaving] = useState(false);

  const formattedCode = useMemo(() => formatCode(code), [code]);
  const activeIdentityField =
    activeView === "displayName" || activeView === "handle" || activeView === "nickname" ? activeView : null;

  const applySavedProfile = useCallback(
    (nextProfile: SocialProfile) => {
      setSavedProfile(nextProfile);
      setDisplayNameDraft(nextProfile.displayName);
      setHandleDraft(nextProfile.handle ?? "");
      setNicknameDraft(nextProfile.nickname);
      setBioDraft(nextProfile.bio);
      setStatusMessageDraft(nextProfile.statusMessage);
      onSaved(nextProfile);
    },
    [onSaved]
  );

  useEffect(() => {
    if (!open) return;
    const nextProfile = buildProfileState(profile);
    setSavedProfile(nextProfile);
    setActiveView("root");
    setDisplayNameDraft(nextProfile.displayName);
    setHandleDraft(nextProfile.handle ?? "");
    setNicknameDraft(nextProfile.nickname);
    setBioDraft(nextProfile.bio);
    setStatusMessageDraft(nextProfile.statusMessage);
    setAvailability({ status: "idle", message: null, normalizedValue: "" });
    setError(null);
    setCodeCopied(false);
    setShareState("idle");
  }, [open]);

  const commitProfilePatch = useCallback(
    async (
      patch: Partial<{
        nickname: string;
        avatarEmoji: string;
        statusMessage: string;
        displayName: string;
        bio: string;
        handle: string;
        discoverability: SocialProfile["discoverability"];
        defaultPostVisibility: SocialPostVisibility;
      }>
    ) => {
      if (profileSaving) return null;
      setProfileSaving(true);
      setError(null);
      try {
        const response = await fetch("/api/social/profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        const res = await response.json().catch(() => null);
        if (!response.ok || !res?.ok) {
          throw new Error(mapProfileSaveError(res?.error));
        }
        const nextProfile = buildProfileState((res?.data as SocialProfile) ?? null);
        applySavedProfile(nextProfile);
        return nextProfile;
      } catch (saveError: any) {
        setError(String(saveError?.message ?? "프로필 저장에 실패했어요."));
        return null;
      } finally {
        setProfileSaving(false);
      }
    },
    [applySavedProfile, profileSaving]
  );

  const saveInstantProfilePatch = useCallback(
    async (
      patch: Partial<{
        avatarEmoji: string;
        discoverability: SocialProfile["discoverability"];
        defaultPostVisibility: SocialPostVisibility;
      }>,
      optimisticPatch: Partial<SocialProfile>
    ) => {
      if (profileSaving || uploadingImage) return;
      const previousProfile = savedProfile;
      setSavedProfile({ ...savedProfile, ...optimisticPatch });
      const nextProfile = await commitProfilePatch(patch);
      if (!nextProfile) {
        setSavedProfile(previousProfile);
      }
    },
    [commitProfilePatch, profileSaving, savedProfile, uploadingImage]
  );

  const handleProfileImageSelect = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      setUploadingImage(true);
      setError(null);
      try {
        const formData = new FormData();
        formData.set("file", file);
        const res = await fetch("/api/social/profile/image", {
          method: "POST",
          body: formData,
        }).then((response) => response.json());

        if (!res.ok) {
          if (res.error === "invalid_file_type") throw new Error("JPG, PNG, WEBP 이미지만 첨부할 수 있어요.");
          if (res.error === "file_too_large") throw new Error("이미지는 5MB 이하만 첨부할 수 있어요.");
          throw new Error("프로필 사진 업로드에 실패했어요.");
        }

        const nextProfile = buildProfileState((res.data?.profile as SocialProfile) ?? null);
        applySavedProfile(nextProfile);
      } catch (uploadError: any) {
        setError(String(uploadError?.message ?? "프로필 사진 업로드에 실패했어요."));
      } finally {
        setUploadingImage(false);
        if (imageInputRef.current) imageInputRef.current.value = "";
      }
    },
    [applySavedProfile]
  );

  const loadCode = useCallback(async () => {
    setCodeLoading(true);
    setCodeError(null);
    try {
      const res = await fetch("/api/social/code", { cache: "no-store" }).then((r) => r.json());
      if (!res.ok) {
        throw new Error("내 코드를 불러오지 못했어요. 다시 시도해 주세요.");
      }
      setCode(res.data?.code ?? null);
    } catch (loadError: any) {
      setCode(null);
      setCodeError(String(loadError?.message ?? "내 코드를 불러오지 못했어요. 다시 시도해 주세요."));
    } finally {
      setCodeLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadCode();
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
  }, [loadCode, open]);

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

  const handleSavePrefs = async (
    patch: Partial<{
      scheduleVisibility: ScheduleVisibility;
      statusMessageVisible: boolean;
      acceptInvites: boolean;
      healthVisibility: HealthVisibility;
    }>
  ) => {
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
        throw new Error("failed_to_save_preferences");
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
      const text = "RNest 소셜에서 친구 추가해줘.\n링크를 열면 친구 코드 입력칸이 바로 열려요.";
      const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };

      if (typeof nav.share === "function") {
        await nav.share({ title: "RNest 소셜 초대", text, url: inviteUrl });
        setShareState("shared");
      } else {
        await navigator.clipboard.writeText(inviteUrl);
        setShareState("link-copied");
      }

      setTimeout(() => setShareState("idle"), 2400);
    } catch (shareError: any) {
      if (String(shareError?.name ?? "") !== "AbortError") {
        setError(String(shareError?.message ?? "공유 링크를 만들지 못했어요."));
      }
    } finally {
      setSharing(false);
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
    } catch (regenError: any) {
      setCodeError(String(regenError?.message ?? "코드를 재생성하지 못했어요."));
    } finally {
      setRegenerating(false);
    }
  };

  useEffect(() => {
    if (!open || !activeIdentityField) return;

    const meta = getAvailabilityMeta(activeIdentityField);
    const currentValue =
      activeIdentityField === "displayName"
        ? savedProfile.displayName
        : activeIdentityField === "handle"
          ? savedProfile.handle ?? ""
          : savedProfile.nickname;
    const rawValue =
      activeIdentityField === "displayName"
        ? displayNameDraft
        : activeIdentityField === "handle"
          ? handleDraft
          : nicknameDraft;
    const normalized = normalizeAvailabilityInput(activeIdentityField, rawValue);

    if (normalized.errorMessage) {
      setAvailability({
        status: "invalid",
        message: normalized.errorMessage,
        normalizedValue: normalized.normalizedValue,
      });
      return;
    }

    if (normalized.normalizedValue === currentValue) {
      setAvailability({
        status: "available",
        message: meta.sameMessage,
        normalizedValue: normalized.normalizedValue,
      });
      return;
    }

    setAvailability((prev) => ({
      status: "checking",
      message: null,
      normalizedValue: normalized.normalizedValue,
    }));

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const url = new URL("/api/social/profile/availability", window.location.origin);
        url.searchParams.set("field", activeIdentityField);
        url.searchParams.set("value", rawValue);
        const response = await fetch(url.toString(), {
          cache: "no-store",
          signal: controller.signal,
        });
        const res = await response.json().catch(() => null);
        if (!response.ok || !res?.ok) {
          throw new Error("failed_to_check_availability");
        }

        const reason = String(res.data?.reason ?? "");
        const available = Boolean(res.data?.available);
        setAvailability({
          status: available ? "available" : "unavailable",
          message:
            reason === "same"
              ? meta.sameMessage
              : available
                ? meta.availableMessage
                : meta.takenMessage,
          normalizedValue: String(res.data?.normalizedValue ?? normalized.normalizedValue),
        });
      } catch (availabilityError: any) {
        if (availabilityError?.name === "AbortError") return;
        setAvailability({
          status: "invalid",
          message: `${meta.label} 중복 여부를 확인하지 못했어요.`,
          normalizedValue: normalized.normalizedValue,
        });
      }
    }, 280);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    activeIdentityField,
    displayNameDraft,
    handleDraft,
    nicknameDraft,
    open,
    savedProfile.displayName,
    savedProfile.handle,
    savedProfile.nickname,
  ]);

  const identityEditorChanged =
    activeIdentityField === "displayName"
      ? normalizeAvailabilityInput("displayName", displayNameDraft).normalizedValue !== savedProfile.displayName
      : activeIdentityField === "handle"
        ? normalizeAvailabilityInput("handle", handleDraft).normalizedValue !== (savedProfile.handle ?? "")
        : activeIdentityField === "nickname"
          ? normalizeAvailabilityInput("nickname", nicknameDraft).normalizedValue !== savedProfile.nickname
          : false;

  const handleIdentitySave = useCallback(async () => {
    if (!activeIdentityField || !identityEditorChanged) return;
    if (availability.status !== "available") return;

    if (activeIdentityField === "displayName") {
      const nextProfile = await commitProfilePatch({ displayName: availability.normalizedValue });
      if (nextProfile) setActiveView("profile");
      return;
    }

    if (activeIdentityField === "handle") {
      const nextProfile = await commitProfilePatch({ handle: availability.normalizedValue });
      if (nextProfile) setActiveView("profile");
      return;
    }

    const nextProfile = await commitProfilePatch({ nickname: availability.normalizedValue });
    if (nextProfile) setActiveView("friendProfile");
  }, [activeIdentityField, availability, commitProfilePatch, identityEditorChanged]);

  const sheetFooter = useMemo(() => {
    if (!activeIdentityField || !identityEditorChanged) return null;
    return (
      <Button
        variant="primary"
        disabled={profileSaving || availability.status !== "available"}
        onClick={handleIdentitySave}
        className="h-12 w-full rounded-2xl text-[15px]"
      >
        저장하기
      </Button>
    );
  }, [activeIdentityField, availability.status, handleIdentitySave, identityEditorChanged, profileSaving]);

  const handleBackFromSubview = useCallback(() => {
    setError(null);
    if (activeView === "displayName") {
      setDisplayNameDraft(savedProfile.displayName);
      setAvailability({ status: "idle", message: null, normalizedValue: "" });
      setActiveView("profile");
    } else if (activeView === "handle") {
      setHandleDraft(savedProfile.handle ?? "");
      setAvailability({ status: "idle", message: null, normalizedValue: "" });
      setActiveView("profile");
    } else if (activeView === "bio") {
      setActiveView("profile");
    } else if (activeView === "nickname") {
      setNicknameDraft(savedProfile.nickname);
      setAvailability({ status: "idle", message: null, normalizedValue: "" });
      setActiveView("friendProfile");
    } else if (activeView === "statusMessage") {
      setActiveView("friendProfile");
    } else {
      setActiveView("root");
    }
  }, [activeView, savedProfile.displayName, savedProfile.handle, savedProfile.nickname]);

  const handleBioBlur = useCallback(() => {
    const nextBio = normalizeBioForSave(bioDraft);
    if (nextBio === savedProfile.bio) return;
    void commitProfilePatch({ bio: nextBio });
  }, [bioDraft, commitProfilePatch, savedProfile.bio]);

  const handleStatusBlur = useCallback(() => {
    const nextStatus = normalizeStatusForSave(statusMessageDraft);
    if (nextStatus === savedProfile.statusMessage) return;
    void commitProfilePatch({ statusMessage: nextStatus });
  }, [commitProfilePatch, savedProfile.statusMessage, statusMessageDraft]);

  const renderSubviewHeader = (title: string, description?: string) => (
    <div className="px-1 pb-2">
      <button
        type="button"
        onClick={handleBackFromSubview}
        disabled={profileSaving}
        className="mb-5 flex h-10 w-10 items-center justify-center rounded-full text-ios-text transition active:opacity-60 disabled:opacity-40"
        aria-label="뒤로"
      >
        <BackIcon />
      </button>
      <h2 className="text-[28px] font-bold tracking-[-0.03em] text-ios-text">{title}</h2>
      {description ? <p className="mt-3 text-[15px] leading-7 text-ios-muted">{description}</p> : null}
    </div>
  );

  const renderIdentityEditor = () => {
    if (!activeIdentityField) return null;
    const field = activeIdentityField;
    const meta = getAvailabilityMeta(field);
    const title =
      field === "displayName" ? "표시 이름" : field === "handle" ? "핸들" : "닉네임";
    const description =
      field === "handle"
        ? "핸들을 바꾸면 프로필 주소도 바뀌어요."
        : field === "nickname"
          ? "친구와 그룹에서 표시되는 이름이에요."
          : undefined;
    const rawValue =
      field === "displayName" ? displayNameDraft : field === "handle" ? handleDraft : nicknameDraft;
    const inputLabel =
      field === "displayName"
        ? "표시 이름 (최대 24자)"
        : field === "handle"
          ? "핸들 (3~30자, 영문·숫자·._-)"
          : "닉네임 (최대 12자)";

    return (
      <div className="space-y-5 pb-2">
        {renderSubviewHeader(title, description)}

        <div className="rounded-3xl bg-white px-4 py-4 shadow-apple">
          <label className="mb-2 block text-[13px] font-semibold text-ios-text">{inputLabel}</label>
          <div
            className={cn(
              "flex items-center rounded-[26px] border bg-white px-5 py-3.5 transition",
              availability.status === "available"
                ? "border-emerald-300"
                : availability.status === "unavailable" || availability.status === "invalid"
                  ? "border-red-200"
                  : "border-ios-sep"
            )}
          >
            {field === "handle" ? <span className="mr-1 text-[16px] text-ios-muted">@</span> : null}
            <input
              value={rawValue}
              onChange={(event) => {
                setError(null);
                if (field === "displayName") {
                  setDisplayNameDraft(limitCharacters(event.target.value, 24));
                } else if (field === "handle") {
                  setHandleDraft(cleanHandleValue(event.target.value));
                } else {
                  setNicknameDraft(limitCharacters(event.target.value, 12));
                }
              }}
              placeholder={field === "handle" ? "my-handle" : ""}
              autoFocus
              spellCheck={false}
              autoCapitalize={field === "handle" ? "none" : "sentences"}
              autoCorrect="off"
              disabled={profileSaving}
              className="min-w-0 flex-1 bg-transparent text-[17px] font-semibold text-ios-text outline-none placeholder:text-ios-muted/55"
            />
            <InputStatusIcon status={availability.status} />
          </div>

          {availability.message ? (
            <p
              className={cn(
                "mt-3 text-[12.5px]",
                availability.status === "available" ? "text-emerald-600" : "text-red-500"
              )}
            >
              {availability.status === "available" ? "✓ " : ""}
              {availability.message}
            </p>
          ) : null}
        </div>
      </div>
    );
  };

  const renderBioEditor = () => {
    const count = Array.from(cleanBioDraft(bioDraft)).length;
    return (
      <div className="space-y-5 pb-2">
        {renderSubviewHeader("소개")}
        <div className="rounded-3xl bg-white px-4 py-4 shadow-apple">
          <label className="mb-2 block text-[13px] font-semibold text-ios-text">소개 (최대 160자)</label>
          <textarea
            value={bioDraft}
            onChange={(event) => {
              setError(null);
              setBioDraft(cleanBioDraft(event.target.value));
            }}
            onBlur={handleBioBlur}
            rows={5}
            autoFocus
            disabled={profileSaving}
            className="w-full resize-none rounded-[26px] border border-ios-sep bg-white px-4 py-4 text-[15px] leading-6 text-ios-text outline-none transition placeholder:text-ios-muted/55"
            placeholder="내 소개를 적어보세요"
          />
          <div className="mt-2 flex items-center justify-between text-[12px] text-ios-muted">
            <span>{count} / 160</span>
            <span>포커스가 이동하면 자동 저장돼요</span>
          </div>
        </div>
      </div>
    );
  };

  const renderStatusEditor = () => {
    const count = Array.from(cleanStatusDraft(statusMessageDraft)).length;
    return (
      <div className="space-y-5 pb-2">
        {renderSubviewHeader("상태 메시지")}
        <div className="rounded-3xl bg-white px-4 py-4 shadow-apple">
          <div className="mb-2 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                if (!autoStatus) return;
                setError(null);
                setStatusMessageDraft(autoStatus);
              }}
              disabled={!autoStatus || profileSaving}
              className="text-[12px] font-semibold text-[color:var(--rnest-accent)] underline underline-offset-2 disabled:opacity-30"
            >
              자동 제안
            </button>
            <span className="text-[12px] text-ios-muted">{count} / 30</span>
          </div>
          <input
            value={statusMessageDraft}
            onChange={(event) => {
              setError(null);
              setStatusMessageDraft(cleanStatusDraft(event.target.value));
            }}
            onBlur={handleStatusBlur}
            autoFocus
            disabled={profileSaving}
            className="w-full rounded-[26px] border border-ios-sep bg-white px-4 py-4 text-[15px] text-ios-text outline-none transition placeholder:text-ios-muted/55"
            placeholder="한 줄 메시지를 입력해 주세요"
          />
          <div className="mt-2 flex justify-end text-[12px] text-ios-muted">
            <span>포커스가 이동하면 자동 저장돼요</span>
          </div>
        </div>
      </div>
    );
  };

  // ── 설정 루트 목록 ────────────────────────────────────────
  const renderRootView = () => (
    <div className="space-y-3 pb-4">
      {/* 피드 / 검색 프로필 — 탐색·공개 피드에 보이는 설정 */}
      <div className="overflow-hidden rounded-3xl bg-white shadow-apple">
        <p className="px-4 pb-2 pt-4 text-[11px] font-semibold uppercase tracking-wider text-ios-muted">
          피드 / 검색 프로필
        </p>
        <SettingsListRow
          icon={<User className="h-[18px] w-[18px]" />}
          label="소셜 프로필"
          description={savedProfile.displayName || "이름, 사진, 소개 수정"}
          onClick={() => setActiveView("profile")}
        />
        <SettingsListRow
          icon={<Globe className="h-[18px] w-[18px]" />}
          label="공개 범위"
          description={
            savedProfile.discoverability === "internal" ? "공개 계정" : "비공개 계정"
          }
          badge={
            savedProfile.discoverability === "internal" &&
            (savedProfile.defaultPostVisibility === "followers" ||
              savedProfile.defaultPostVisibility === "friends")
              ? "혼합"
              : undefined
          }
          onClick={() => setActiveView("visibility")}
          isLast
        />
      </div>

      {/* 친구 / 그룹 프로필 — 연결된 사람들에게 보이는 설정 */}
      <div className="overflow-hidden rounded-3xl bg-white shadow-apple">
        <p className="px-4 pb-2 pt-4 text-[11px] font-semibold uppercase tracking-wider text-ios-muted">
          친구 / 그룹 프로필
        </p>
        <SettingsListRow
          icon={<Users className="h-[18px] w-[18px]" />}
          label="친구 프로필"
          description={savedProfile.nickname || "닉네임, 상태 메시지"}
          onClick={() => setActiveView("friendProfile")}
        />
        <SettingsListRow
          icon={<Link2 className="h-[18px] w-[18px]" />}
          label="연결 코드"
          description="친구 연결용 코드 및 공유 링크"
          onClick={() => setActiveView("connectCode")}
          isLast
        />
      </div>

      {/* 기타 */}
      <div className="overflow-hidden rounded-3xl bg-white shadow-apple">
        <p className="px-4 pb-2 pt-4 text-[11px] font-semibold uppercase tracking-wider text-ios-muted">
          기타
        </p>
        <SettingsListRow
          icon={<Lock className="h-[18px] w-[18px]" />}
          label="프라이버시"
          description="근무 공개, 건강 데이터 설정"
          onClick={() => setActiveView("privacy")}
          isLast
        />
      </div>

      {error ? (
        <p className="rounded-2xl bg-red-50 px-4 py-3 text-[13px] text-red-600">{error}</p>
      ) : null}
    </div>
  );

  // ── 소셜 프로필 ────────────────────────────────────────────
  const renderProfileView = () => (
    <div className="space-y-5 pb-2">
      {renderSubviewHeader("소셜 프로필")}
      <SectionCard title="프로필 사진">
        <div className="rounded-[28px] bg-ios-bg px-4 py-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              disabled={uploadingImage || profileSaving}
              className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-[color:var(--rnest-accent-soft)] text-[30px] disabled:opacity-50"
            >
              {savedProfile.profileImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={savedProfile.profileImageUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                savedProfile.avatarEmoji
              )}
            </button>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleProfileImageSelect}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[18px] font-semibold text-ios-text">
                {savedProfile.displayName || savedProfile.nickname || "프로필을 완성해 주세요"}
              </p>
              <p className="mt-0.5 text-[13px] text-ios-muted">
                {savedProfile.handle ? `@${savedProfile.handle}` : "피드와 검색에서 보여져요"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              disabled={uploadingImage || profileSaving}
              className="shrink-0 rounded-full bg-white px-3 py-2 text-[12px] font-semibold text-ios-text disabled:opacity-50"
            >
              사진 변경
            </button>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="기본 정보">
        <div className="divide-y divide-ios-sep">
          <SettingRow
            label="표시 이름"
            value={savedProfile.displayName || "표시 이름을 설정해 주세요"}
            muted={!savedProfile.displayName}
            onClick={() => {
              setError(null);
              setDisplayNameDraft(savedProfile.displayName);
              setAvailability({ status: "idle", message: null, normalizedValue: "" });
              setActiveView("displayName");
            }}
          />
          <SettingRow
            label="핸들"
            value={savedProfile.handle ? `@${savedProfile.handle}` : "핸들을 설정해 주세요"}
            muted={!savedProfile.handle}
            onClick={() => {
              setError(null);
              setHandleDraft(savedProfile.handle ?? "");
              setAvailability({ status: "idle", message: null, normalizedValue: "" });
              setActiveView("handle");
            }}
          />
          <SettingRow
            label="소개"
            value={savedProfile.bio || "소개를 추가해 보세요"}
            muted={!savedProfile.bio}
            onClick={() => {
              setError(null);
              setActiveView("bio");
            }}
          />
        </div>
      </SectionCard>

      <SectionCard title="아바타">
        <div className="flex flex-wrap gap-3">
          {SOCIAL_AVATAR_OPTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              disabled={profileSaving || uploadingImage}
              onClick={() => {
                if (savedProfile.avatarEmoji === emoji) return;
                void saveInstantProfilePatch({ avatarEmoji: emoji }, { avatarEmoji: emoji });
              }}
              className={`flex h-12 w-12 items-center justify-center rounded-2xl transition active:scale-95 disabled:opacity-50 ${
                savedProfile.avatarEmoji === emoji
                  ? "bg-[color:var(--rnest-accent-soft)] ring-2 ring-[color:var(--rnest-accent)]"
                  : "bg-ios-bg"
              }`}
            >
              <SocialAvatarBadge
                emoji={emoji}
                className="h-9 w-9 bg-transparent"
                iconClassName="h-8 w-8"
              />
            </button>
          ))}
        </div>
      </SectionCard>

      {error ? (
        <p className="rounded-2xl bg-red-50 px-4 py-3 text-[13px] text-red-600">{error}</p>
      ) : null}
    </div>
  );

  // ── 공개 범위 (Instagram-style) ───────────────────────────
  const renderVisibilityView = () => {
    const isPublic = savedProfile.discoverability === "internal";
    const hasMismatch =
      isPublic &&
      (savedProfile.defaultPostVisibility === "followers" ||
        savedProfile.defaultPostVisibility === "friends");
    const hasPrivateMismatch =
      !isPublic && savedProfile.defaultPostVisibility === "public_internal";

    return (
      <div className="space-y-5 pb-2">
        {renderSubviewHeader("공개 범위", "내 게시글과 프로필을 누가 볼 수 있는지 설정해요")}

        <SectionCard title="계정 공개 범위">
          <div className="flex items-start justify-between gap-3 pb-1">
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-semibold text-ios-text">
                {isPublic ? "공개 계정" : "비공개 계정"}
              </p>
              <p className="mt-1 text-[12px] leading-5 text-ios-muted">
                {isPublic
                  ? "허브 내 누구나 내 프로필을 검색하고 팔로우할 수 있어요"
                  : "내 프로필이 탐색에 노출되지 않아요"}
              </p>
            </div>
            <ToggleSwitch
              checked={isPublic}
              disabled={profileSaving || uploadingImage}
              label="계정 공개"
              onToggle={() => {
                const nextDiscoverability = isPublic ? "off" : "internal";
                // 비공개 전환 시 게시글이 전체면 팔로워로 자동 조정
                const shouldCascade =
                  isPublic && savedProfile.defaultPostVisibility === "public_internal";
                if (shouldCascade) {
                  void saveInstantProfilePatch(
                    { discoverability: "off", defaultPostVisibility: "followers" },
                    { discoverability: "off", defaultPostVisibility: "followers" }
                  );
                } else {
                  void saveInstantProfilePatch(
                    { discoverability: nextDiscoverability },
                    { discoverability: nextDiscoverability }
                  );
                }
              }}
            />
          </div>
        </SectionCard>

        <SectionCard title="기본 게시글 공개 범위">
          <div className="divide-y divide-ios-sep">
            <RadioRow
              active={savedProfile.defaultPostVisibility === "public_internal"}
              label="전체"
              description="허브 멤버라면 누구나 볼 수 있어요"
              disabled={!isPublic || profileSaving || uploadingImage}
              onClick={() => {
                if (savedProfile.defaultPostVisibility === "public_internal") return;
                void saveInstantProfilePatch(
                  { defaultPostVisibility: "public_internal" },
                  { defaultPostVisibility: "public_internal" }
                );
              }}
            />
            <RadioRow
              active={savedProfile.defaultPostVisibility === "followers"}
              label="팔로워"
              description="나를 팔로우한 사람만 볼 수 있어요"
              disabled={profileSaving || uploadingImage}
              onClick={() => {
                if (savedProfile.defaultPostVisibility === "followers") return;
                void saveInstantProfilePatch(
                  { defaultPostVisibility: "followers" },
                  { defaultPostVisibility: "followers" }
                );
              }}
            />
            <RadioRow
              active={savedProfile.defaultPostVisibility === "friends"}
              label="친구"
              description="상호 연결된 친구에게만 공개돼요"
              disabled={profileSaving || uploadingImage}
              onClick={() => {
                if (savedProfile.defaultPostVisibility === "friends") return;
                void saveInstantProfilePatch(
                  { defaultPostVisibility: "friends" },
                  { defaultPostVisibility: "friends" }
                );
              }}
            />
          </div>
          <p className="mt-3 border-t border-ios-sep pt-3 text-[11px] leading-relaxed text-ios-muted">
            그룹 전용 게시글은 작성 시점에 직접 지정할 수 있어요
          </p>
        </SectionCard>

        {hasMismatch ? (
          <p className="rounded-2xl bg-[#f6f4ff] px-4 py-3 text-[11.5px] leading-5 text-[color:var(--rnest-accent)]">
            공개 계정이지만 기본 게시글은 제한 공개로 설정돼 있어요. 의도한 설정이라면 그대로 두세요.
          </p>
        ) : null}

        {hasPrivateMismatch ? (
          <p className="rounded-2xl bg-amber-50 px-4 py-3 text-[11.5px] leading-5 text-amber-700">
            비공개 계정이지만 기본 게시글이 전체로 설정돼 있어요. 팔로워 공개로 변경을 권장해요.
          </p>
        ) : null}

        {error ? (
          <p className="rounded-2xl bg-red-50 px-4 py-3 text-[13px] text-red-600">{error}</p>
        ) : null}
      </div>
    );
  };

  // ── 친구 프로필 ────────────────────────────────────────────
  const renderFriendProfileView = () => (
    <div className="space-y-5 pb-2">
      {renderSubviewHeader("친구 프로필")}
      <SectionCard title="친구 / 그룹 프로필">
        <div className="divide-y divide-ios-sep">
          <SettingRow
            label="닉네임"
            value={savedProfile.nickname || "닉네임을 설정해 주세요"}
            muted={!savedProfile.nickname}
            onClick={() => {
              setError(null);
              setNicknameDraft(savedProfile.nickname);
              setAvailability({ status: "idle", message: null, normalizedValue: "" });
              setActiveView("nickname");
            }}
          />
          <SettingRow
            label="상태 메시지"
            value={savedProfile.statusMessage || "(없음)"}
            muted={!savedProfile.statusMessage}
            onClick={() => {
              setError(null);
              setActiveView("statusMessage");
            }}
          />
        </div>
      </SectionCard>

      {error ? (
        <p className="rounded-2xl bg-red-50 px-4 py-3 text-[13px] text-red-600">{error}</p>
      ) : null}
    </div>
  );

  // ── 연결 코드 ──────────────────────────────────────────────
  const renderConnectCodeView = () => (
    <div className="space-y-5 pb-2">
      {renderSubviewHeader("연결 코드")}
      <SectionCard title="내 친구 코드">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[12px] text-ios-muted">친구가 직접 입력할 때 쓰는 6자리 코드예요.</p>
          <button
            type="button"
            onClick={handleRegenerate}
            disabled={regenerating || codeLoading}
            className="shrink-0 text-[12px] font-semibold text-ios-muted underline underline-offset-2 disabled:opacity-40"
          >
            재생성
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
            <span className="select-all text-[28px] font-bold tracking-widest text-ios-text">
              {formattedCode}
            </span>
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
            {shareState === "link-copied"
              ? "링크 복사됨"
              : shareState === "shared"
                ? "공유 완료"
                : "공유 링크 보내기"}
          </Button>
        </div>
      </SectionCard>
    </div>
  );

  // ── 프라이버시 ─────────────────────────────────────────────
  const renderPrivacyView = () => (
    <div className="space-y-5 pb-2">
      {renderSubviewHeader("프라이버시")}
      <SectionCard title="공개 설정">
        <div className="divide-y divide-ios-sep">
          <div className="pb-3">
            <p className="mb-1.5 text-[12.5px] font-medium text-ios-text">근무 공개 범위</p>
            <div className="flex rounded-2xl bg-ios-bg p-1 gap-1">
              {(["full", "off_only", "hidden"] as ScheduleVisibility[]).map((value) => {
                const labels: Record<ScheduleVisibility, string> = {
                  full: "전체 공개",
                  off_only: "오프만",
                  hidden: "비공개",
                };
                return (
                  <button
                    key={value}
                    type="button"
                    disabled={prefsSaving}
                    onClick={() => {
                      if (scheduleVisibility === value) return;
                      setScheduleVisibility(value);
                      void handleSavePrefs({ scheduleVisibility: value });
                    }}
                    className={`flex-1 rounded-xl py-2 text-[11.5px] font-semibold transition ${
                      scheduleVisibility === value
                        ? "bg-white text-ios-text shadow-sm"
                        : "text-ios-muted"
                    }`}
                  >
                    {labels[value]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between py-3">
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

          <div className="flex items-center justify-between py-3">
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

          <div className="flex items-center justify-between pt-3">
            <div>
              <p className="text-[12.5px] font-medium text-ios-text">건강 데이터 그룹 공유</p>
              <p className="text-[11px] text-ios-muted mt-0.5">그룹 랭킹에 배터리·수면 점수 참여</p>
            </div>
            <ToggleSwitch
              checked={healthVisibility === "full"}
              disabled={prefsSaving}
              label="건강 데이터 그룹 공유"
              onToggle={() => {
                const next: HealthVisibility =
                  healthVisibility === "full" ? "hidden" : "full";
                setHealthVisibility(next);
                void handleSavePrefs({ healthVisibility: next });
              }}
            />
          </div>
        </div>
      </SectionCard>
    </div>
  );

  const content =
    activeView === "root"
      ? renderRootView()
      : activeView === "profile"
        ? renderProfileView()
        : activeView === "visibility"
          ? renderVisibilityView()
          : activeView === "friendProfile"
            ? renderFriendProfileView()
            : activeView === "connectCode"
              ? renderConnectCodeView()
              : activeView === "privacy"
                ? renderPrivacyView()
                : activeView === "bio"
                  ? renderBioEditor()
                  : activeView === "statusMessage"
                    ? renderStatusEditor()
                    : renderIdentityEditor();

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={activeView === "root" ? "설정" : undefined}
      subtitle={activeView === "root" ? "프로필, 공개 범위, 프라이버시를 관리해요" : undefined}
      variant="appstore"
      maxHeightClassName="max-h-[84dvh]"
      footer={sheetFooter}
      footerClassName="bg-white"
    >
      {content}
    </BottomSheet>
  );
}
