import { Suspense } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { ShopOrdersPage } from "@/components/pages/ShopOrdersPage";

export default function Page() {
  return (
    <AppShell>
      <Suspense fallback={null}>
        <ShopOrdersPage />
      </Suspense>
    </AppShell>
  );
}
