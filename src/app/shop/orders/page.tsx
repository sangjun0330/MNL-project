import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { ShopOrdersMount } from "@/components/shop/ShopOrdersMount";

export default function Page() {
  return (
    <AppShell>
      <Suspense fallback={<div className="min-h-[40dvh] rounded-apple bg-white/70" />}>
        <ShopOrdersMount />
      </Suspense>
    </AppShell>
  );
}
