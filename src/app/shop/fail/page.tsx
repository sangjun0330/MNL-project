import { Suspense } from "react";
import { ShopCheckoutFailPage } from "@/components/pages/ShopCheckoutFailPage";

export default function Page() {
  return (
      <Suspense fallback={null}>
        <ShopCheckoutFailPage />
      </Suspense>
  );
}
