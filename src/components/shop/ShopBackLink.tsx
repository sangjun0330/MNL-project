"use client";

import Link from "next/link";
import { SHOP_BACK_BUTTON, SHOP_BACK_ICON_CLASS } from "@/lib/shopUi";

export function ShopBackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} data-auth-allow className={SHOP_BACK_BUTTON} aria-label={label}>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={SHOP_BACK_ICON_CLASS}
      >
        <path d="M15 18l-6-6 6-6" />
      </svg>
    </Link>
  );
}

export default ShopBackLink;
