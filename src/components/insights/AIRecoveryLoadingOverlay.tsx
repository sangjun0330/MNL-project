"use client";

import Image from "next/image";

type AIRecoveryLoadingOverlayProps = {
  title: string;
  detail: string;
};

export function AIRecoveryLoadingOverlay({ title, detail }: AIRecoveryLoadingOverlayProps) {
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-white/88 px-6 backdrop-blur-sm">
      <div className="w-full max-w-[320px] rounded-[28px] border border-ios-sep bg-white px-6 py-7 text-center shadow-[0_18px_60px_rgba(15,23,42,0.10)]">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#F4F7FF]">
          <Image src="/rnest-logo.png" alt="RNest" width={34} height={34} className="h-[34px] w-[34px] object-contain" priority />
        </div>
        <div className="mt-4 text-[18px] font-bold tracking-[-0.02em] text-ios-text">{title}</div>
        <div className="mt-2 text-[13px] leading-6 text-ios-sub">{detail}</div>
        <div className="mt-5 flex items-center justify-center gap-2">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#315CA8]" />
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#7F9AE0]" style={{ animationDelay: "160ms" }} />
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-[#C0D0F8]" style={{ animationDelay: "320ms" }} />
        </div>
      </div>
    </div>
  );
}
