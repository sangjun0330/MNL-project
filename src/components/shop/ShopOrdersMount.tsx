"use client";

import { useEffect, useState } from "react";
import { ShopOrdersPage } from "@/components/pages/ShopOrdersPage";

export function ShopOrdersMount() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="min-h-[40dvh] bg-[#f8f9fb]" />;
  }

  return <ShopOrdersPage />;
}

export default ShopOrdersMount;
