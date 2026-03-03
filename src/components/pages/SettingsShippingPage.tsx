"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { signInWithProvider, useAuthState } from "@/lib/auth";
import { authHeaders } from "@/lib/billing/client";
import {
  buildShopShippingAddress,
  createShopShippingAddressId,
  defaultShopShippingAddressBook,
  emptyShopShippingProfile,
  formatShopShippingSingleLine,
  isCompleteShopShippingProfile,
  resolveDefaultShopShippingAddress,
  type ShopShippingAddress,
  type ShopShippingAddressBook,
} from "@/lib/shopProfile";
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
const PRIMARY_BUTTON = "inline-flex items-center justify-center rounded-2xl border border-[#3b6fc9] bg-[#3b6fc9] px-4 font-semibold text-white transition disabled:opacity-60";
const SECONDARY_BUTTON = "inline-flex items-center justify-center rounded-2xl border border-[#d7dfeb] bg-[#f4f7fb] px-4 font-semibold text-[#11294b] transition disabled:opacity-60";
const DANGER_BUTTON = "inline-flex items-center justify-center rounded-2xl border border-[#f1d0cc] bg-[#fff6f5] px-4 font-semibold text-[#a33a2b] transition disabled:opacity-60";

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

function emptyAddressDraft(): ShopShippingAddress {
  return {
    id: createShopShippingAddressId(),
    label: "기본 배송지",
    ...emptyShopShippingProfile(),
  };
}

function addressBookSignature(book: ShopShippingAddressBook) {
  return JSON.stringify({
    addresses: book.addresses,
    defaultAddressId: book.defaultAddressId,
  });
}

export function SettingsShippingPage() {
  const { t } = useI18n();
  const { user, status } = useAuthState();
  const [addressBook, setAddressBook] = useState<ShopShippingAddressBook>(defaultShopShippingAddressBook());
  const [draft, setDraft] = useState<ShopShippingAddress>(emptyAddressDraft());
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [postcodeLoading, setPostcodeLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"error" | "notice">("notice");
  const [savedSignature, setSavedSignature] = useState<string | null>(null);
  const addressLine2Ref = useRef<HTMLInputElement | null>(null);

  const defaultAddress = useMemo(() => resolveDefaultShopShippingAddress(addressBook), [addressBook]);
  const editingExisting = editingAddressId && addressBook.addresses.some((item) => item.id === editingAddressId);
  const canSaveDraft = isCompleteShopShippingProfile(draft);
  const isPersisted = savedSignature === addressBookSignature(addressBook);

  useEffect(() => {
    let active = true;
    if (!user?.userId) {
      setAddressBook(defaultShopShippingAddressBook());
      setDraft(emptyAddressDraft());
      setEditingAddressId(null);
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
        if (!res.ok || !json?.ok) {
          throw new Error(String(json?.error ?? `http_${res.status}`));
        }

        const nextBook: ShopShippingAddressBook = {
          addresses: Array.isArray(json?.data?.addresses) ? (json.data.addresses as ShopShippingAddress[]) : [],
          defaultAddressId: typeof json?.data?.defaultAddressId === "string" ? json.data.defaultAddressId : null,
        };
        const normalizedBook = {
          addresses: nextBook.addresses,
          defaultAddressId: nextBook.defaultAddressId ?? nextBook.addresses[0]?.id ?? null,
        };
        setAddressBook(normalizedBook);
        setSavedSignature(addressBookSignature(normalizedBook));
        const nextDefault = resolveDefaultShopShippingAddress(normalizedBook);
        setDraft(nextDefault ?? emptyAddressDraft());
        setEditingAddressId(nextDefault?.id ?? null);

        if (json?.data?.degraded) {
          setMessageTone("notice");
          setMessage("기본 저장소가 준비되지 않아 호환 모드로 불러왔습니다. 저장은 정상 동작합니다.");
        }
      } catch {
        if (!active) return;
        setAddressBook(defaultShopShippingAddressBook());
        setDraft(emptyAddressDraft());
        setEditingAddressId(null);
        setSavedSignature(null);
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

  const persistAddressBook = useCallback(
    async (nextBook: ShopShippingAddressBook, successMessage: string) => {
      if (!user?.userId) return false;
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
            addresses: nextBook.addresses,
            defaultAddressId: nextBook.defaultAddressId,
          }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok) {
          throw new Error(String(json?.error ?? `http_${res.status}`));
        }

        const savedBook: ShopShippingAddressBook = {
          addresses: Array.isArray(json?.data?.addresses) ? (json.data.addresses as ShopShippingAddress[]) : nextBook.addresses,
          defaultAddressId:
            typeof json?.data?.defaultAddressId === "string" ? json.data.defaultAddressId : nextBook.defaultAddressId,
        };
        const normalizedSavedBook = {
          addresses: savedBook.addresses,
          defaultAddressId: savedBook.defaultAddressId ?? savedBook.addresses[0]?.id ?? null,
        };
        setAddressBook(normalizedSavedBook);
        setSavedSignature(addressBookSignature(normalizedSavedBook));
        const nextEditing =
          (editingAddressId
            ? normalizedSavedBook.addresses.find((item) => item.id === editingAddressId)
            : resolveDefaultShopShippingAddress(normalizedSavedBook)) ?? normalizedSavedBook.addresses[0] ?? emptyAddressDraft();
        setDraft(nextEditing);
        setEditingAddressId(normalizedSavedBook.addresses.some((item) => item.id === nextEditing.id) ? nextEditing.id : null);
        setMessageTone("notice");
        setMessage(successMessage);
        return true;
      } catch (error: any) {
        const code = String(error?.message ?? "failed_to_save_shop_profile");
        setMessageTone("error");
        if (code === "invalid_shop_shipping_profile") {
          setMessage("받는 분, 연락처, 우편번호, 기본 주소를 모두 입력한 배송지만 저장할 수 있습니다.");
        } else if (code === "shop_profile_storage_unavailable") {
          setMessage("배송지 저장소를 사용할 수 없습니다. 현재 환경의 Supabase 상태를 확인해 주세요.");
        } else {
          setMessage("배송지 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.");
        }
        return false;
      } finally {
        setSaving(false);
      }
    },
    [editingAddressId, user?.userId]
  );

  const openAddressSearch = useCallback(async () => {
    setPostcodeLoading(true);
    setMessage(null);
    try {
      await ensureDaumPostcodeScript();
      const postcode = new window.daum!.Postcode({
        oncomplete: (data) => {
          const nextAddress = buildDaumAddress(data);
          setDraft((current) => ({
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

  const handleSaveDraft = useCallback(async () => {
    if (!user?.userId || saving) return;
    if (!isCompleteShopShippingProfile(draft)) {
      setMessageTone("error");
      setMessage("받는 분, 연락처, 우편번호, 기본 주소를 모두 입력해 주세요.");
      return;
    }

    const normalizedDraft = buildShopShippingAddress(draft, {
      id: draft.id || createShopShippingAddressId(),
      label: draft.label || "배송지",
    });
    const exists = addressBook.addresses.some((item) => item.id === normalizedDraft.id);
    const nextAddresses = exists
      ? addressBook.addresses.map((item) => (item.id === normalizedDraft.id ? normalizedDraft : item))
      : [normalizedDraft, ...addressBook.addresses].slice(0, 8);
    const nextDefaultAddressId = addressBook.defaultAddressId ?? normalizedDraft.id;

    const saved = await persistAddressBook(
      {
        addresses: nextAddresses,
        defaultAddressId: nextDefaultAddressId,
      },
      exists ? "배송지가 변경되었습니다." : "배송지가 추가되었습니다."
    );

    if (saved) {
      setEditingAddressId(normalizedDraft.id);
    }
  }, [addressBook.addresses, addressBook.defaultAddressId, draft, persistAddressBook, saving, user?.userId]);

  const handleEditAddress = useCallback(
    (addressId: string) => {
      const target = addressBook.addresses.find((item) => item.id === addressId);
      if (!target) return;
      setDraft(target);
      setEditingAddressId(addressId);
      setMessage(null);
    },
    [addressBook.addresses]
  );

  const handleCreateNew = useCallback(() => {
    setDraft(emptyAddressDraft());
    setEditingAddressId(null);
    setMessage(null);
  }, []);

  const handleResetDraft = useCallback(() => {
    if (editingExisting && editingAddressId) {
      const existing = addressBook.addresses.find((item) => item.id === editingAddressId);
      setDraft(existing ?? emptyAddressDraft());
      setMessage(null);
      return;
    }
    setDraft(emptyAddressDraft());
    setMessage(null);
  }, [addressBook.addresses, editingAddressId, editingExisting]);

  const handleSetDefault = useCallback(
    async (addressId: string) => {
      if (addressBook.defaultAddressId === addressId || saving) return;
      await persistAddressBook(
        {
          addresses: addressBook.addresses,
          defaultAddressId: addressId,
        },
        "기본 배송지가 변경되었습니다."
      );
    },
    [addressBook.addresses, addressBook.defaultAddressId, persistAddressBook, saving]
  );

  const handleRemoveAddress = useCallback(
    async (addressId: string) => {
      if (saving) return;
      const nextAddresses = addressBook.addresses.filter((item) => item.id !== addressId);
      const nextDefaultAddressId =
        addressBook.defaultAddressId === addressId ? nextAddresses[0]?.id ?? null : addressBook.defaultAddressId;
      await persistAddressBook(
        {
          addresses: nextAddresses,
          defaultAddressId: nextDefaultAddressId,
        },
        nextAddresses.length > 0 ? "배송지가 삭제되었습니다." : "저장된 배송지가 모두 초기화되었습니다."
      );
      if (editingAddressId === addressId) {
        const nextEditing = nextAddresses[0] ?? emptyAddressDraft();
        setDraft(nextEditing);
        setEditingAddressId(nextAddresses[0]?.id ?? null);
      }
    },
    [addressBook.addresses, addressBook.defaultAddressId, editingAddressId, persistAddressBook, saving]
  );

  const handleClearAll = useCallback(async () => {
    if (saving || addressBook.addresses.length === 0) return;
    const saved = await persistAddressBook(defaultShopShippingAddressBook(), "저장된 배송지가 초기화되었습니다.");
    if (saved) {
      setDraft(emptyAddressDraft());
      setEditingAddressId(null);
    }
  }, [addressBook.addresses.length, persistAddressBook, saving]);

  return (
    <div className="mx-auto w-full max-w-[760px] px-4 pb-24 pt-6">
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
            {t("배송지는 로그인된 계정에 영구 저장됩니다. 먼저 로그인한 뒤 다시 시도해 주세요.")}
          </div>
          <div className="mt-4">
            <Button onClick={() => signInWithProvider("google")} disabled={status === "loading"}>
              {t("Google로 로그인")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="rounded-apple border border-ios-sep bg-white p-5 shadow-apple">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="text-[16px] font-bold text-[#11294b]">{t("기본 배송지 관리")}</div>
                <div className="mt-1 text-[12px] leading-5 text-ios-sub">
                  {t("대한민국 공식 주소 검색으로 배송지를 저장하고, 결제 전에 원하는 주소를 선택할 수 있습니다.")}
                </div>
              </div>
              {isPersisted && addressBook.addresses.length > 0 ? (
                <span className="rounded-full border border-[#d7dfeb] bg-[#eef4fb] px-3 py-1 text-[10px] font-semibold text-[#11294b]">
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

            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" data-auth-allow onClick={handleCreateNew} className={`${PRIMARY_BUTTON} h-10 text-[12px]`}>
                {t("배송지 추가하기")}
              </button>
              <button type="button" data-auth-allow onClick={handleResetDraft} className={`${SECONDARY_BUTTON} h-10 text-[12px]`}>
                {editingExisting ? t("변경 취소") : t("입력 초기화")}
              </button>
              {addressBook.addresses.length > 0 ? (
                <button type="button" data-auth-allow onClick={() => void handleClearAll()} className={`${DANGER_BUTTON} h-10 text-[12px]`}>
                  {t("저장 주소 초기화")}
                </button>
              ) : null}
            </div>

            {loading ? (
              <div className="mt-4 rounded-2xl border border-[#eef2f7] bg-[#f8fafc] px-4 py-4 text-[12.5px] text-ios-sub">
                {t("배송지 정보를 불러오는 중입니다.")}
              </div>
            ) : null}

            {!loading && defaultAddress ? (
              <div className="mt-4 rounded-2xl border border-[#d7dfeb] bg-[#eef4fb] px-4 py-4 text-[12.5px] leading-5 text-[#44556d]">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-[#3b6fc9] px-2 py-0.5 text-[10px] font-semibold text-white">{t("기본")}</span>
                  <span className="font-semibold text-[#11294b]">{defaultAddress.label}</span>
                </div>
                <div className="mt-2 font-semibold text-ios-text">{defaultAddress.recipientName} · {defaultAddress.phone}</div>
                <div className="mt-1">{formatShopShippingSingleLine(defaultAddress)}</div>
                {defaultAddress.deliveryNote ? <div className="mt-1 text-ios-sub">{defaultAddress.deliveryNote}</div> : null}
              </div>
            ) : null}
          </div>

          <div className="rounded-apple border border-ios-sep bg-white p-5 shadow-apple">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[15px] font-bold text-[#11294b]">{t("저장된 배송지")}</div>
                <div className="mt-1 text-[12px] text-ios-sub">{t("결제 전에 여기서 저장한 주소 중 하나를 선택할 수 있습니다.")}</div>
              </div>
              <div className="rounded-full bg-[#f4f7fb] px-3 py-1 text-[10px] font-semibold text-[#11294b]">
                {addressBook.addresses.length} {t("개")}
              </div>
            </div>

            <div className="mt-4 space-y-3">
              {addressBook.addresses.length === 0 ? (
                <div className="rounded-2xl border border-[#eef2f7] bg-[#f8fafc] px-4 py-4 text-[12.5px] leading-5 text-ios-sub">
                  {t("아직 저장된 배송지가 없습니다. 새 배송지를 추가해서 결제에 사용할 주소를 먼저 등록해 주세요.")}
                </div>
              ) : (
                addressBook.addresses.map((address) => {
                  const isDefault = address.id === addressBook.defaultAddressId;
                  const isEditing = address.id === editingAddressId;
                  return (
                    <div
                      key={address.id}
                      className={[
                        "rounded-2xl border px-4 py-4",
                        isEditing ? "border-[#3b6fc9] bg-[#f7fbff]" : "border-[#eef2f7] bg-[#f8fafc]",
                      ].join(" ")}
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            {isDefault ? (
                              <span className="rounded-full bg-[#3b6fc9] px-2 py-0.5 text-[10px] font-semibold text-white">{t("기본")}</span>
                            ) : null}
                            <span className="text-[13px] font-semibold text-[#11294b]">{address.label}</span>
                          </div>
                          <div className="mt-2 text-[13px] font-semibold text-ios-text">{address.recipientName} · {address.phone}</div>
                          <div className="mt-1 text-[12.5px] leading-5 text-[#44556d]">{formatShopShippingSingleLine(address)}</div>
                          {address.deliveryNote ? <div className="mt-1 text-[12px] text-ios-sub">{address.deliveryNote}</div> : null}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {!isDefault ? (
                            <button type="button" data-auth-allow onClick={() => void handleSetDefault(address.id)} className={`${SECONDARY_BUTTON} h-9 text-[11px]`}>
                              {t("기본으로")}
                            </button>
                          ) : null}
                          <button type="button" data-auth-allow onClick={() => handleEditAddress(address.id)} className={`${SECONDARY_BUTTON} h-9 text-[11px]`}>
                            {t("수정")}
                          </button>
                          <button type="button" data-auth-allow onClick={() => void handleRemoveAddress(address.id)} className={`${DANGER_BUTTON} h-9 text-[11px]`}>
                            {t("삭제")}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="rounded-apple border border-ios-sep bg-white p-5 shadow-apple">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="text-[16px] font-bold text-[#11294b]">{editingExisting ? t("배송지 변경") : t("새 배송지 추가")}</div>
                <div className="mt-1 text-[12px] leading-5 text-ios-sub">
                  {t("주소록에 저장할 배송지 정보를 입력합니다. 검색한 기본 주소 위에 상세 주소만 추가하면 됩니다.")}
                </div>
              </div>
              {editingExisting ? (
                <span className="rounded-full bg-[#eef4fb] px-3 py-1 text-[10px] font-semibold text-[#11294b]">{t("수정 중")}</span>
              ) : null}
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <label className="block md:col-span-1">
                <div className="mb-2 text-[12px] font-semibold text-[#11294b]">{t("배송지 이름")}</div>
                <Input
                  value={draft.label}
                  onChange={(event) => setDraft((current) => ({ ...current, label: event.target.value }))}
                  placeholder={t("예: 집, 병원, 사무실")}
                />
              </label>
              <label className="block md:col-span-1">
                <div className="mb-2 text-[12px] font-semibold text-[#11294b]">{t("받는 분")}</div>
                <Input
                  value={draft.recipientName}
                  onChange={(event) => setDraft((current) => ({ ...current, recipientName: event.target.value }))}
                  placeholder={t("홍길동")}
                />
              </label>
              <label className="block md:col-span-1">
                <div className="mb-2 text-[12px] font-semibold text-[#11294b]">{t("연락처")}</div>
                <Input
                  value={draft.phone}
                  onChange={(event) => setDraft((current) => ({ ...current, phone: event.target.value }))}
                  placeholder="010-0000-0000"
                />
              </label>
            </div>

            <div className="mt-4 rounded-2xl border border-[#eef2f7] bg-[#f8fafc] p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="text-[13px] font-semibold text-[#11294b]">{t("주소 찾기")}</div>
                  <div className="mt-1 text-[12px] leading-5 text-ios-sub">
                    {t("다음(카카오) 우편번호 검색으로 정확한 대한민국 주소를 불러옵니다.")}
                  </div>
                </div>
                <button type="button" data-auth-allow onClick={() => void openAddressSearch()} disabled={postcodeLoading} className={`${PRIMARY_BUTTON} h-10 text-[12px]`}>
                  {postcodeLoading ? t("불러오는 중...") : t("주소 검색")}
                </button>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-[140px_1fr]">
                <label className="block">
                  <div className="mb-2 text-[12px] font-semibold text-[#11294b]">{t("우편번호")}</div>
                  <Input value={draft.postalCode} readOnly placeholder="06236" />
                </label>
                <label className="block">
                  <div className="mb-2 text-[12px] font-semibold text-[#11294b]">{t("기본 주소")}</div>
                  <Input value={draft.addressLine1} readOnly placeholder={t("주소 검색으로 자동 입력")} />
                </label>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="block">
                <div className="mb-2 text-[12px] font-semibold text-[#11294b]">{t("상세 주소")}</div>
                <Input
                  ref={addressLine2Ref}
                  value={draft.addressLine2}
                  onChange={(event) => setDraft((current) => ({ ...current, addressLine2: event.target.value }))}
                  placeholder={t("101동 1201호")}
                />
              </label>
              <label className="block">
                <div className="mb-2 text-[12px] font-semibold text-[#11294b]">{t("배송 메모")}</div>
                <Input
                  value={draft.deliveryNote}
                  onChange={(event) => setDraft((current) => ({ ...current, deliveryNote: event.target.value }))}
                  placeholder={t("문 앞에 놓아주세요")}
                />
              </label>
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" data-auth-allow onClick={handleResetDraft} className={`${SECONDARY_BUTTON} h-10 text-[12px]`}>
                {editingExisting ? t("원래 값으로") : t("입력 초기화")}
              </button>
              <button type="button" data-auth-allow onClick={() => void handleSaveDraft()} disabled={saving || !canSaveDraft} className={`${PRIMARY_BUTTON} h-10 text-[12px]`}>
                {saving ? t("저장 중...") : editingExisting ? t("배송지 변경 저장") : t("배송지 추가 저장")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SettingsShippingPage;
