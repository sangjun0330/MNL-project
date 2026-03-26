import { Suspense } from "react";
import { ShopOrdersPage } from "@/components/pages/ShopOrdersPage";

export default function Page() {
  return (
      <Suspense fallback={null}>
        <ShopOrdersPage />
      </Suspense>
  );
}
