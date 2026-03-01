"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import { authHeaders } from "@/lib/billing/client";
import { getSupabaseBrowserClient, signInWithProvider, signOut, useAuthState } from "@/lib/auth";
import { emptyShopShippingProfile, formatShopShippingSingleLine, isCompleteShopShippingProfile, type ShopShippingProfile } from "@/lib/shopProfile";
import { purgeAllLocalState } from "@/lib/store";
import { useI18n } from "@/lib/useI18n";

function providerLabel(provider: string | null | undefined, t: (key: string) => string) {
  if (provider === "google") return "Google";
  return t("알 수 없음");
}

/* ── 삭제 완료 확인 팝업 ── */
function DeleteSuccessOverlay({
  open,
  onConfirm,
}: {
  open: boolean;
  onConfirm: () => void;
}) {
  const { t } = useI18n();
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalEl(typeof document !== "undefined" ? document.body : null);
  }, []);

  useEffect(() => {
    if (open) {
      setMounted(true);
      const timer = setTimeout(() => setVisible(true), 30);
      return () => clearTimeout(timer);
    }
    setVisible(false);
    const timer = setTimeout(() => setMounted(false), 500);
    return () => clearTimeout(timer);
  }, [open]);

  if (!mounted || !portalEl) return null;

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-[90] flex items-center justify-center bg-black/40 px-6 backdrop-blur-[6px]",
        "transition-opacity duration-[400ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
        visible ? "opacity-100" : "opacity-0",
      )}
    >
      <div
        className={cn(
          "w-full max-w-[320px] rounded-[22px] border border-ios-sep bg-white p-6 shadow-[0_24px_80px_rgba(0,0,0,0.14)]",
          "transition-all duration-[500ms] ease-[cubic-bezier(0.175,0.885,0.32,1.1)]",
          visible
            ? "translate-y-0 scale-100 opacity-100"
            : "translate-y-4 scale-95 opacity-0",
        )}
      >
        {/* 체크마크 아이콘 */}
        <div className="flex justify-center">
          <div
            className={cn(
              "flex h-16 w-16 items-center justify-center rounded-full bg-[#34C759]/10",
              "transition-transform duration-[600ms] ease-[cubic-bezier(0.175,0.885,0.32,1.1)]",
              visible ? "scale-100" : "scale-50",
            )}
          >
            <svg
              className={cn(
                "h-8 w-8 text-[#34C759]",
                "transition-all duration-[500ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
                visible ? "opacity-100" : "opacity-0",
              )}
              style={{ transitionDelay: "200ms" }}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 13l4 4L19 7" />
            </svg>
          </div>
        </div>

        <div className="mt-5 text-center">
          <div className="text-[18px] font-bold tracking-[-0.02em] text-ios-text">
            {t("계정이 삭제되었습니다")}
          </div>
          <p className="mt-2 text-[14px] leading-[1.5] text-ios-sub">
            {t("모든 데이터가 안전하게 삭제되었습니다. 이용해 주셔서 감사합니다.")}
          </p>
        </div>

        <button
          type="button"
          onClick={onConfirm}
          className="mt-6 h-[48px] w-full rounded-[14px] bg-black text-[15px] font-semibold text-white transition-transform duration-[120ms] ease-[cubic-bezier(0.175,0.885,0.32,1.1)] active:scale-[0.97]"
        >
          {t("확인")}
        </button>
      </div>
    </div>,
    portalEl,
  );
}

export function SettingsAccountPage() {
  const { user: auth, status } = useAuthState();
  const isLoading = status === "loading";
  const { t } = useI18n();
  const router = useRouter();
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteNeedsReauth, setDeleteNeedsReauth] = useState(false);
  const [deleteSuccess, setDeleteSuccess] = useState(false);
  const deleteReady = deleteText.trim().toUpperCase() === "DELETE";
  const [shippingProfile, setShippingProfile] = useState<ShopShippingProfile>(emptyShopShippingProfile());
  const [shippingLoading, setShippingLoading] = useState(false);
  const [shippingMessage, setShippingMessage] = useState<string | null>(null);
  const [shippingMessageTone, setShippingMessageTone] = useState<"error" | "notice">("notice");

  useEffect(() => {
    let active = true;
    if (!auth?.userId) {
      setShippingProfile(emptyShopShippingProfile());
      setShippingLoading(false);
      return () => {
        active = false;
      };
    }

    const run = async () => {
      setShippingLoading(true);
      try {
        const headers = await authHeaders();
        const res = await fetch("/api/shop/profile", {
          method: "GET",
          headers: {
            "content-type": "application/json",
            ...headers,
          },
          cache: "no-store",
        });
        const json = await res.json().catch(() => null);
        if (!active) return;
        if (!res.ok || !json?.ok || !json?.data?.profile) {
          throw new Error(String(json?.error ?? `http_${res.status}`));
        }
        setShippingProfile(json.data.profile as ShopShippingProfile);
      } catch {
        if (!active) return;
        setShippingProfile(emptyShopShippingProfile());
        setShippingMessageTone("error");
        setShippingMessage("배송지 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
      } finally {
        if (!active) return;
        setShippingLoading(false);
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [auth?.userId]);

  const onDeleteAccount = async () => {
    if (!deleteReady || deleteBusy) return;
    setDeleteBusy(true);
    setDeleteError(null);
    setDeleteNeedsReauth(false);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const res = await fetch("/api/user/delete", {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        const code = String(json?.error ?? "");
        if (code === "reauth_required_recent_login") {
          setDeleteNeedsReauth(true);
          throw new Error(t("보안을 위해 최근 로그인 확인이 필요합니다. 다시 로그인한 뒤 계정 삭제를 진행해 주세요."));
        }
        const msg = json?.error ?? t("삭제에 실패했습니다. 다시 시도해 주세요.");
        throw new Error(msg);
      }
      // 삭제 성공: 먼저 확인 팝업 표시
      setDeleteOpen(false);
      setDeleteText("");
      setDeleteSuccess(true);
    } catch (err: any) {
      setDeleteError(err?.message ?? t("삭제에 실패했습니다. 다시 시도해 주세요."));
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleDeleteSuccessConfirm = useCallback(async () => {
    setDeleteSuccess(false);
    await signOut();
    purgeAllLocalState();
    router.push("/settings");
  }, [router]);

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pb-24 pt-6">
      <div className="mb-4 flex items-center gap-2">
        <Link href="/settings" className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-ios-sep bg-white text-[18px] text-ios-text">
          ←
        </Link>
        <div className="flex items-center gap-2 text-[24px] font-extrabold tracking-[-0.02em] text-ios-text">
          <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <circle cx="12" cy="9.2" r="2.8" />
            <path d="M7.2 17.2c1.5-2 8.1-2 9.6 0" />
          </svg>
          {t("계정")}
        </div>
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
            <Link
              href="/settings/account/shipping"
              className="flex items-center justify-between rounded-2xl border border-ios-sep bg-[#f8fafc] px-4 py-3 text-left transition hover:bg-[#f3f6fa]"
            >
              <div>
                <div className="text-[14px] font-semibold text-ios-text">{t("배송지 설정")}</div>
                <div className="mt-1 text-[12px] text-ios-sub">{t("대한민국 주소 검색으로 정확하게 저장합니다.")}</div>
              </div>
              <span className="text-[18px] text-ios-sub">›</span>
            </Link>
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
                  setDeleteNeedsReauth(false);
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

      <div className="rounded-apple border border-ios-sep bg-white p-5 shadow-apple">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[15px] font-bold text-ios-text">{t("기본 배송지")}</div>
            <div className="mt-1 text-[12px] text-ios-sub">{t("배송지 설정 탭에서 저장한 주소가 쇼핑 주문에 바로 사용됩니다.")}</div>
          </div>
          {auth?.userId && isCompleteShopShippingProfile(shippingProfile) ? (
            <span className="rounded-full border border-[#d7dfeb] bg-[#f4f7fb] px-3 py-1 text-[10px] font-semibold text-[#11294b]">
              {t("저장됨")}
            </span>
          ) : null}
        </div>

        {!auth ? (
          <div className="mt-4 rounded-2xl border border-[#eef2f7] bg-[#f8fafc] px-4 py-4 text-[12.5px] leading-5 text-ios-sub">
            {t("로그인 후 기본 배송지를 저장하면 쇼핑 상세 페이지에서 바로 결제를 진행할 수 있습니다.")}
          </div>
        ) : (
          <>
            {shippingMessage ? (
              <div
                className={[
                  "mt-4 rounded-2xl px-4 py-3 text-[12.5px] leading-5",
                  shippingMessageTone === "error" ? "border border-[#f1d0cc] bg-[#fff6f5] text-[#a33a2b]" : "border border-[#d7dfeb] bg-[#eef4fb] text-[#11294b]",
                ].join(" ")}
              >
                {shippingMessage}
              </div>
            ) : null}

            {shippingLoading ? (
              <div className="mt-4 rounded-2xl border border-[#eef2f7] bg-[#f8fafc] px-4 py-4 text-[12.5px] text-ios-sub">
                {t("배송지 정보를 불러오는 중입니다.")}
              </div>
            ) : null}

            {!shippingLoading && isCompleteShopShippingProfile(shippingProfile) ? (
              <div className="mt-4 rounded-2xl border border-[#eef2f7] bg-[#f8fafc] px-4 py-4 text-[12.5px] leading-5 text-[#44556d]">
                <div className="font-semibold text-ios-text">{shippingProfile.recipientName} · {shippingProfile.phone}</div>
                <div className="mt-1">{formatShopShippingSingleLine(shippingProfile)}</div>
                {shippingProfile.deliveryNote ? <div className="mt-1 text-ios-sub">{shippingProfile.deliveryNote}</div> : null}
              </div>
            ) : (
              !shippingLoading ? (
                <div className="mt-4 rounded-2xl border border-[#eef2f7] bg-[#f8fafc] px-4 py-4 text-[12.5px] leading-5 text-ios-sub">
                  {t("아직 저장된 배송지가 없습니다. 배송지 설정 탭에서 기본 배송지를 먼저 저장해 주세요.")}
                </div>
              ) : null
            )}

            <div className="mt-4 flex justify-end">
              <Link
                href="/settings/account/shipping"
                className="inline-flex shrink-0 items-center justify-center rounded-full bg-black px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-black/90"
              >
                {t("배송지 설정으로 이동")}
              </Link>
            </div>
          </>
        )}
      </div>

      <BottomSheet
        open={deleteOpen}
        onClose={() => {
          if (deleteBusy) return;
          setDeleteOpen(false);
          setDeleteText("");
          setDeleteError(null);
          setDeleteNeedsReauth(false);
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
          {deleteNeedsReauth ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3">
              <div className="text-[12px] font-semibold text-amber-900">{t("최근 로그인 확인 필요")}</div>
              <div className="mt-1 text-[12px] leading-5 text-amber-800">
                {t("계정 삭제 전 보안을 위해 다시 로그인해 주세요. 로그인 후 이 화면으로 돌아와 삭제를 다시 누르면 됩니다.")}
              </div>
              <div className="mt-2">
                <Button
                  type="button"
                  onClick={() => signInWithProvider("google")}
                  disabled={deleteBusy || isLoading}
                >
                  {t("Google로 다시 로그인")}
                </Button>
              </div>
            </div>
          ) : null}
          {deleteError ? <div className="text-[12px] text-red-600">{deleteError}</div> : null}
          <div className="flex items-center justify-end pt-1">
            <Button variant="secondary" onClick={() => setDeleteOpen(false)} disabled={deleteBusy}>
              {t("취소")}
            </Button>
          </div>
        </div>
      </BottomSheet>

      <DeleteSuccessOverlay open={deleteSuccess} onConfirm={handleDeleteSuccessConfirm} />
    </div>
  );
}

export default SettingsAccountPage;
