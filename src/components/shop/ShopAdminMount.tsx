"use client";

import { useEffect, useState } from "react";
import { ShopAdminPage } from "@/components/pages/ShopAdminPage";

export function ShopAdminMount() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <div className="min-h-[40dvh] bg-[#f8f9fb]" />;
  }

  return <ShopAdminPage />;
}

export default ShopAdminMount;
