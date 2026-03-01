"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { signInWithProvider, useAuthState } from "@/lib/auth";
import { authHeaders } from "@/lib/billing/client";
import { emptyShopShippingProfile, formatShopShippingSingleLine, isCompleteShopShippingProfile, type ShopShippingProfile } from "@/lib/shopProfile";
import { useI18n } from "@/lib/useI18n";

declare global {
  interface Window {
    daum?: {
      Postcode: new (options: {
        oncomplete: (data: {
          zonecode?: string;
          roadAddress?: string;
          jibunAddress?: string;
          userSelectedType?: "R" | "J";
          bname?: string;
          buildingName?: string;
          apartment?: "Y" | "N";
        }) => void;
      }) => {
        open: () => void;
      };
    };
  }
}

const DAUM_POSTCODE_SCRIPT_ID = "daum-postcode-script";
const DAUM_POSTCODE_SCRIPT_SRC = "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";

function buildDaumAddress(data: {
  zonecode?: string;
  roadAddress?: string;
  jibunAddress?: string;
  userSelectedType?: "R" | "J";
  bname?: string;
  buildingName?: string;
  apartment?: "Y" | "N";
}) {
  const primaryAddress = data.userSelectedType === "R" ? data.roadAddress ?? "" : data.jibunAddress ?? "";
  let extra = "";
  if (data.userSelectedType === "R") {
    if (data.bname) extra = data.bname;
    if (data.buildingName && data.apartment === "Y") {
      extra = extra ? `${extra}, ${data.buildingName}` : data.buildingName;
    }
  }
  return {
    postalCode: String(data.zonecode ?? "").trim(),
    addressLine1: extra ? `${primaryAddress} (${extra})`.trim() : primaryAddress.trim(),
  };
}

async function ensureDaumPostcodeScript() {
  if (typeof window === "undefined") return;
  if (window.daum?.Postcode) return;

  await new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(DAUM_POSTCODE_SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("failed_to_load_daum_postcode")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = DAUM_POSTCODE_SCRIPT_ID;
    script.src = DAUM_POSTCODE_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("failed_to_load_daum_postcode"));
    document.head.appendChild(script);
  });

  if (!window.daum?.Postcode) {
    throw new Error("missing_daum_postcode");
  }
}

export function SettingsShippingPage() {
  const { t } = useI18n();
  const { user, status } = useAuthState();
  const [profile, setProfile] = useState<ShopShippingProfile>(emptyShopShippingProfile());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [postcodeLoading, setPostcodeLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"error" | "notice">("notice");
  const addressLine2Ref = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let active = true;
    if (!user?.userId) {
      setProfile(emptyShopShippingProfile());
      setLoading(false);
      return () => {
        active = false;
      };
    }

    const run = async () => {
      setLoading(true);
      setMessage(null);
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
        setProfile(json.data.profile as ShopShippingProfile);
        if (json?.data?.degraded) {
          setMessageTone("notice");
          setMessage("기본 저장소가 준비되지 않아 호환 모드로 불러왔습니다. 저장은 정상 동작합니다.");
        }
      } catch {
        if (!active) return;
        setProfile(emptyShopShippingProfile());
        setMessageTone("error");
        setMessage("배송지 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
      } finally {
        if (!active) return;
        setLoading(false);
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [user?.userId]);

  const openAddressSearch = useCallback(async () => {
    setPostcodeLoading(true);
    setMessage(null);
    try {
      await ensureDaumPostcodeScript();
      const postcode = new window.daum!.Postcode({
        oncomplete: (data) => {
          const nextAddress = buildDaumAddress(data);
          setProfile((current) => ({
            ...current,
            postalCode: nextAddress.postalCode,
            addressLine1: nextAddress.addressLine1,
          }));
          setTimeout(() => {
            addressLine2Ref.current?.focus();
          }, 40);
        },
      });
      postcode.open();
    } catch {
      setMessageTone("error");
      setMessage("주소 검색을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setPostcodeLoading(false);
    }
  }, []);

  const handleSave = useCallback(async () => {
    if (!user?.userId || saving) return;
    setSaving(true);
    setMessage(null);
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/shop/profile", {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          ...headers,
        },
        body: JSON.stringify({
          profile,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok || !json?.data?.profile) {
        throw new Error(String(json?.error ?? `http_${res.status}`));
      }
      setProfile(json.data.profile as ShopShippingProfile);
      setMessageTone("notice");
      setMessage("기본 배송지가 저장되었습니다.");
    } catch (error: any) {
      const code = String(error?.message ?? "failed_to_save_shop_profile");
      setMessageTone("error");
      if (code === "shop_profile_storage_unavailable") {
        setMessage("배송지 저장소를 사용할 수 없습니다. 현재 환경의 Supabase 상태를 확인해 주세요.");
      } else {
        setMessage("배송지 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      }
    } finally {
      setSaving(false);
    }
  }, [profile, saving, user?.userId]);

  const shippingReady = isCompleteShopShippingProfile(profile);

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pb-24 pt-6">
      <div className="mb-4 flex items-center gap-2">
        <Link href="/settings/account" className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-ios-sep bg-white text-[18px] text-ios-text">
          ←
        </Link>
        <div className="text-[24px] font-extrabold tracking-[-0.02em] text-ios-text">{t("배송지 설정")}</div>
      </div>

      {!user?.userId ? (
        <div className="rounded-apple border border-ios-sep bg-white p-5 shadow-apple">
          <div className="text-[15px] font-bold text-ios-text">{t("로그인이 필요합니다")}</div>
          <div className="mt-2 text-[13px] leading-6 text-ios-sub">
            {t("기본 배송지는 로그인된 계정에 영구 저장됩니다. 먼저 로그인한 뒤 다시 시도해 주세요.")}
          </div>
          <div className="mt-4">
            <Button onClick={() => signInWithProvider("google")} disabled={status === "loading"}>
              {t("Google로 로그인")}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="rounded-apple border border-ios-sep bg-white p-5 shadow-apple">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[16px] font-bold text-ios-text">{t("대한민국 기본 배송지")}</div>
                <div className="mt-1 text-[12px] leading-5 text-ios-sub">
                  {t("다음(카카오) 우편번호 검색으로 정확한 도로명/지번 주소를 찾고, 쇼핑 주문에서 바로 사용합니다.")}
                </div>
              </div>
              {shippingReady ? (
                <span className="rounded-full border border-[#d7dfeb] bg-[#f4f7fb] px-3 py-1 text-[10px] font-semibold text-[#11294b]">
                  {t("저장됨")}
                </span>
              ) : null}
            </div>

            {message ? (
              <div
                className={[
                  "mt-4 rounded-2xl px-4 py-3 text-[12.5px] leading-5",
                  messageTone === "error" ? "border border-[#f1d0cc] bg-[#fff6f5] text-[#a33a2b]" : "border border-[#d7dfeb] bg-[#eef4fb] text-[#11294b]",
                ].join(" ")}
              >
                {message}
              </div>
            ) : null}

            {loading ? (
              <div className="mt-4 rounded-2xl border border-[#eef2f7] bg-[#f8fafc] px-4 py-4 text-[12.5px] text-ios-sub">
                {t("배송지 정보를 불러오는 중입니다.")}
              </div>
            ) : null}

            {!loading && shippingReady ? (
              <div className="mt-4 rounded-2xl border border-[#eef2f7] bg-[#f8fafc] px-4 py-4 text-[12.5px] leading-5 text-[#44556d]">
                <div className="font-semibold text-ios-text">{profile.recipientName} · {profile.phone}</div>
                <div className="mt-1">{formatShopShippingSingleLine(profile)}</div>
                {profile.deliveryNote ? <div className="mt-1 text-ios-sub">{profile.deliveryNote}</div> : null}
              </div>
            ) : null}

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="block">
                <div className="mb-2 text-[12px] font-semibold text-[#11294b]">{t("받는 분")}</div>
                <Input
                  value={profile.recipientName}
                  onChange={(event) => setProfile((current) => ({ ...current, recipientName: event.target.value }))}
                  placeholder={t("홍길동")}
                />
              </label>
              <label className="block">
                <div className="mb-2 text-[12px] font-semibold text-[#11294b]">{t("연락처")}</div>
                <Input
                  value={profile.phone}
                  onChange={(event) => setProfile((current) => ({ ...current, phone: event.target.value }))}
                  placeholder="010-0000-0000"
                />
              </label>
            </div>

            <div className="mt-4 rounded-2xl border border-[#eef2f7] bg-[#f8fafc] p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-[13px] font-semibold text-[#11294b]">{t("주소 찾기")}</div>
                  <div className="mt-1 text-[12px] leading-5 text-ios-sub">
                    {t("공식 우편번호 검색으로 도로명/지번 주소를 불러옵니다.")}
                  </div>
                </div>
                <Button onClick={() => void openAddressSearch()} disabled={postcodeLoading}>
                  {postcodeLoading ? t("불러오는 중...") : t("주소 검색")}
                </Button>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-[140px_1fr]">
                <label className="block">
                  <div className="mb-2 text-[12px] font-semibold text-[#11294b]">{t("우편번호")}</div>
                  <Input value={profile.postalCode} readOnly placeholder="06236" />
                </label>
                <label className="block">
                  <div className="mb-2 text-[12px] font-semibold text-[#11294b]">{t("기본 주소")}</div>
                  <Input value={profile.addressLine1} readOnly placeholder={t("주소 검색으로 자동 입력")} />
                </label>
              </div>
            </div>

            <label className="mt-4 block">
              <div className="mb-2 text-[12px] font-semibold text-[#11294b]">{t("상세 주소")}</div>
              <Input
                ref={addressLine2Ref}
                value={profile.addressLine2}
                onChange={(event) => setProfile((current) => ({ ...current, addressLine2: event.target.value }))}
                placeholder={t("101동 1201호")}
              />
            </label>

            <label className="mt-3 block">
              <div className="mb-2 text-[12px] font-semibold text-[#11294b]">{t("배송 메모")}</div>
              <Input
                value={profile.deliveryNote}
                onChange={(event) => setProfile((current) => ({ ...current, deliveryNote: event.target.value }))}
                placeholder={t("문 앞에 놓아주세요")}
              />
            </label>

            <div className="mt-5 flex justify-end">
              <Button onClick={() => void handleSave()} disabled={saving}>
                {saving ? t("저장 중...") : t("기본 배송지 저장")}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default SettingsShippingPage;
