"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient, useAuthState } from "@/lib/auth";

async function authHeaders(): Promise<Record<string, string>> {
  const supabase = getSupabaseBrowserClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function SettingsBillingFailPage() {
  const params = useSearchParams();
  const { status } = useAuthState();
  const code = params.get("code") ?? "unknown_error";
  const message = params.get("message") ?? "결제가 취소되었거나 실패했습니다.";
  const orderId = params.get("orderId") ?? "-";
  const sentRef = useRef(false);

  useEffect(() => {
    if (status !== "authenticated" || sentRef.current) return;
    if (!orderId || orderId === "-") return;
    sentRef.current = true;

    const run = async () => {
      const headers = await authHeaders();
      await fetch("/api/billing/fail", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...headers,
        },
        body: JSON.stringify({ orderId, code, message }),
      }).catch(() => undefined);
    };

    void run();
  }, [status, orderId, code, message]);

  return (
    <div className="mx-auto w-full max-w-[720px] px-4 pb-24 pt-6">
      <div className="rounded-apple border border-ios-sep bg-white p-6 shadow-apple">
        <div className="text-[20px] font-extrabold tracking-[-0.02em] text-ios-text">결제 실패</div>
        <div className="mt-3 text-[14px] font-semibold text-red-600">{code}</div>
        <div className="mt-1 text-[12.5px] text-ios-sub break-all">{message}</div>
        <div className="mt-3 text-[11.5px] text-ios-muted break-all">orderId: {orderId}</div>

        <div className="mt-6 flex gap-2">
          <Link
            href="/settings/billing"
            className="inline-flex h-10 items-center justify-center rounded-full bg-black px-5 text-[13px] font-semibold text-white"
          >
            다시 시도
          </Link>
          <Link
            href="/settings"
            className="inline-flex h-10 items-center justify-center rounded-full border border-ios-sep bg-white px-5 text-[13px] font-semibold text-ios-text"
          >
            설정으로 이동
          </Link>
        </div>
      </div>
    </div>
  );
}

export default SettingsBillingFailPage;
