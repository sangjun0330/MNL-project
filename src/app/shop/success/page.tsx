import { Suspense } from "react";
import { ShopCheckoutSuccessPage } from "@/components/pages/ShopCheckoutSuccessPage";

export default function Page() {
  return (
      <Suspense fallback={null}>
        <ShopCheckoutSuccessPage />
      </Suspense>
  );
}
