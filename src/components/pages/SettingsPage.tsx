"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Segmented } from "@/components/ui/Segmented";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { getSupabaseBrowserClient, signInWithProvider, signOut, useAuthState } from "@/lib/auth";
import { purgeAllLocalState, useAppStore } from "@/lib/store";
import { useI18n } from "@/lib/useI18n";

function providerLabel(provider: string | null | undefined, t: (key: string) => string) {
  if (provider === "google") return "Google";
  return t("알 수 없음");
}

export function SettingsPage() {
  const { user: auth, status } = useAuthState();
  const isLoading = status === "loading";
  const store = useAppStore();
  const { t } = useI18n();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const theme = store.settings.theme ?? "light";
  const language = store.settings.language ?? "ko";
  const deleteReady = deleteText.trim().toUpperCase() === "DELETE";

  const onDeleteAccount = async () => {
    if (!deleteReady || deleteBusy) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const res = await fetch("/api/user/delete", {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) {
        const msg = (await res.json())?.error ?? t("삭제에 실패했습니다. 다시 시도해 주세요.");
        throw new Error(msg);
      }
      await signOut();
      purgeAllLocalState();
      setDeleteOpen(false);
      setDeleteText("");
    } catch (err: any) {
      setDeleteError(err?.message ?? t("삭제에 실패했습니다. 다시 시도해 주세요."));
    } finally {
      setDeleteBusy(false);
    }
  };

  const generalOptions = useMemo(
    () => [
      { value: "light", label: t("라이트 모드") },
      { value: "dark", label: t("다크 모드") },
    ],
    [t]
  );

  const languageOptions = useMemo(
    () => [
      { value: "ko", label: t("한국어") },
      { value: "en", label: t("영어 (미국)") },
    ],
    [t]
  );

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pb-24 pt-6">
      <div className="mb-4">
        <div className="text-[28px] font-extrabold tracking-[-0.02em]">{t("설정")}</div>
        <div className="mt-1 text-[13px] text-ios-sub">{t("모든 기능을 사용하려면 로그인해야 합니다.")}</div>
      </div>

      <div className="mb-6">
        <div className="mb-3 flex items-center gap-2 text-[14px] font-semibold text-ios-text">
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3.2" />
            <path d="M19.4 15a1.6 1.6 0 0 0 .32 1.76l.02.02a2 2 0 0 1 0 2.82 2 2 0 0 1-2.82 0l-.02-.02a1.6 1.6 0 0 0-1.76-.32 1.6 1.6 0 0 0-.98 1.46V21a2 2 0 0 1-4 0v-.04a1.6 1.6 0 0 0-.98-1.46 1.6 1.6 0 0 0-1.76.32l-.02.02a2 2 0 1 1-2.82-2.82l.02-.02a1.6 1.6 0 0 0 .32-1.76 1.6 1.6 0 0 0-1.46-.98H3a2 2 0 0 1 0-4h.04a1.6 1.6 0 0 0 1.46-.98 1.6 1.6 0 0 0-.32-1.76l-.02-.02a2 2 0 0 1 0-2.82 2 2 0 0 1 2.82 0l.02.02a1.6 1.6 0 0 0 1.76.32h.01a1.6 1.6 0 0 0 .97-1.46V3a2 2 0 0 1 4 0v.04a1.6 1.6 0 0 0 .98 1.46h.01a1.6 1.6 0 0 0 1.76-.32l.02-.02a2 2 0 1 1 2.82 2.82l-.02.02a1.6 1.6 0 0 0-.32 1.76v.01a1.6 1.6 0 0 0 1.46.97H21a2 2 0 0 1 0 4h-.04a1.6 1.6 0 0 0-1.46.98z" />
          </svg>
          {t("일반")}
        </div>
        <div className="rounded-apple border border-ios-sep bg-white p-5 shadow-apple">
          <div className="space-y-4">
            <div>
              <div className="text-[13px] font-semibold text-ios-text">{t("모드 설정")}</div>
              <div className="mt-2">
                <Segmented
                  value={theme}
                  options={generalOptions}
                  onValueChange={(v) => store.setSettings({ theme: v as "light" | "dark" })}
                />
              </div>
            </div>
            <div>
              <div className="text-[13px] font-semibold text-ios-text">{t("언어")}</div>
              <div className="mt-2">
                <Segmented
                  value={language}
                  options={languageOptions}
                  onValueChange={(v) => store.setSettings({ language: v as "ko" | "en" })}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center gap-2 text-[14px] font-semibold text-ios-text">
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <circle cx="12" cy="9.2" r="2.8" />
            <path d="M7.2 17.2c1.5-2 8.1-2 9.6 0" />
          </svg>
          {t("계정")}
        </div>
        <div className="rounded-apple border border-ios-sep bg-white p-5 shadow-apple">
          <div className="text-[15px] font-bold text-ios-text">{t("소셜 로그인")}</div>

          {auth ? (
            <div className="mt-4 space-y-3 text-[14px] text-ios-text">
              <div className="flex items-center justify-between">
                <span className="text-ios-sub">{t("로그인 방식")}</span>
                <span className="font-semibold">{providerLabel(auth.provider, t)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-ios-sub">{t("계정 이메일")}</span>
                <span className="font-semibold">{auth.email ?? t("알 수 없음")}</span>
              </div>
              <div className="rounded-2xl bg-black/[0.04] px-3 py-2 text-[12px] text-ios-sub">
                {t("로그인된 계정에 기록이 안전하게 저장됩니다.")}
              </div>
              <div className="flex items-center gap-5 pt-2">
                <button
                  type="button"
                  onClick={() => signOut()}
                  className="text-[15px] font-bold text-ios-text hover:opacity-80"
                >
                  {t("로그아웃")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDeleteError(null);
                    setDeleteText("");
                    setDeleteOpen(true);
                  }}
                  className="text-[13px] text-ios-sub hover:underline underline-offset-4"
                >
                  {t("계정삭제")}
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="text-[13px] text-ios-sub">
                {t(
                  "Google 계정으로 로그인하면 기록이 계정에 저장되어 앱을 지우거나 기기를 바꿔도 복원할 수 있습니다."
                )}
              </div>

              <div className="grid gap-2">
                <Button onClick={() => signInWithProvider("google")} disabled={isLoading}>
                  {t("Google로 계속")}
                </Button>
              </div>
              <div className="text-[12px] text-ios-muted">
                {isLoading
                  ? t("로그인 상태를 확인 중이에요.")
                  : t("로그인 후 모든 기능(일정, 기록, 인사이트)을 사용할 수 있어요.")}
              </div>
            </div>
          )}
        </div>
      </div>

      <BottomSheet
        open={deleteOpen}
        onClose={() => {
          if (deleteBusy) return;
          setDeleteOpen(false);
          setDeleteText("");
          setDeleteError(null);
        }}
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-[24px] font-extrabold tracking-[-0.02em] text-ios-text">{t("계정 삭제하기")}</div>
            <button
              type="button"
              onClick={onDeleteAccount}
              disabled={!deleteReady || deleteBusy}
              className={`inline-flex h-11 items-center justify-center rounded-full border px-5 text-[17px] font-semibold transition ${
                !deleteReady || deleteBusy
                  ? "cursor-not-allowed border-red-300 text-red-300"
                  : "border-red-600 text-red-600 hover:bg-red-50"
              }`}
            >
              {deleteBusy ? t("삭제 중...") : t("삭제")}
            </button>
          </div>
          <div className="text-[13px] text-ios-sub">{t("계정 삭제는 모든 데이터를 영구적으로 삭제합니다.")}</div>
          <div className="text-[13px] text-ios-sub">{t("삭제를 진행하려면 아래에 DELETE를 입력하세요.")}</div>
          <Input
            value={deleteText}
            onChange={(e) => setDeleteText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void onDeleteAccount();
            }}
            placeholder="DELETE"
            autoCapitalize="characters"
            autoCorrect="off"
          />
          {deleteError ? <div className="text-[12px] text-red-600">{deleteError}</div> : null}
          <div className="flex items-center justify-end pt-1">
            <Button variant="secondary" onClick={() => setDeleteOpen(false)} disabled={deleteBusy}>
              {t("취소")}
            </Button>
          </div>
        </div>
      </BottomSheet>
    </div>
  );
}

export default SettingsPage;
