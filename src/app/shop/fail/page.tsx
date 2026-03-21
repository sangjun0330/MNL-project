import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { ShopCheckoutFailPage } from "@/components/pages/ShopCheckoutFailPage";

export default function Page() {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <ShopCheckoutFailPage />
      </Suspense>
    </AppShell>
  );
}
