"use client";

import { useEffect, useState } from "react";
import { ShopProductDetailPage } from "@/components/pages/ShopProductDetailPage";
import type { ShopProduct } from "@/lib/shop";

export function ShopProductDetailMount({ product }: { product: ShopProduct }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="min-h-[40dvh] bg-[#f8f9fb]" />;
  }

  return <ShopProductDetailPage product={product} />;
}

export default ShopProductDetailMount;
