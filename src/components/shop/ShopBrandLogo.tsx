"use client";

import Image from "next/image";

export function ShopBrandLogo({ className = "" }: { className?: string }) {
  return (
    <Image
      src="/rnest-logo.png"
      alt="RNest"
      width={3200}
      height={720}
      className={className}
      priority
    />
  );
}

export default ShopBrandLogo;
