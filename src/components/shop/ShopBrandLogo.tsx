"use client";

import { RNestLogo } from "@/components/brand/RNestLogo";
import { cn } from "@/lib/cn";

export function ShopBrandLogo({ className = "" }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center text-[#161616]", className)}>
      <RNestLogo className="h-auto w-full" />
    </span>
  );
}

export default ShopBrandLogo;
