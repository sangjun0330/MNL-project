"use client";

import { useEffect, useState } from "react";
import { ShopPage } from "@/components/pages/ShopPage";

export function ShopPageMount() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="min-h-[40dvh] bg-[#f8f9fb]" />;
  }

  return <ShopPage />;
}

export default ShopPageMount;
