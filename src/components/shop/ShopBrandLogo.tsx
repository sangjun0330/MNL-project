"use client";

import Image from "next/image";

export function ShopBrandLogo({ className = "" }: { className?: string }) {
  return (
    <Image
      src="/shop/rnest-logo.svg"
      alt="RNest"
      width={300}
      height={78}
      className={className}
      priority
    />
  );
}

export default ShopBrandLogo;
