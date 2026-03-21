import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { ShopCheckoutSuccessPage } from "@/components/pages/ShopCheckoutSuccessPage";

export default function Page() {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <ShopCheckoutSuccessPage />
      </Suspense>
    </AppShell>
  );
}
