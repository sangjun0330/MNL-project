import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { ShopCheckoutSuccessPage } from "@/components/pages/ShopCheckoutSuccessPage";

export default function Page() {
  return (
    <AppShell>
      <Suspense fallback={<div className="min-h-[40dvh] rounded-apple bg-white/70" />}>
        <ShopCheckoutSuccessPage />
      </Suspense>
    </AppShell>
  );
}
