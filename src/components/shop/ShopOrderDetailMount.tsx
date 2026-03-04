"use client";

import { useEffect, useState } from "react";
import { ShopOrderDetailPage } from "@/components/pages/ShopOrderDetailPage";

export function ShopOrderDetailMount({ orderId }: { orderId: string }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="min-h-[40dvh] bg-[#f8f9fb]" />;
  }

  return <ShopOrderDetailPage orderId={orderId} />;
}

export default ShopOrderDetailMount;
