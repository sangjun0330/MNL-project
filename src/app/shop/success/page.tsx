import { AppShell } from "@/components/shell/AppShell";
import { ShopCheckoutSuccessPage } from "@/components/pages/ShopCheckoutSuccessPage";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <AppShell>
      <ShopCheckoutSuccessPage />
    </AppShell>
  );
}
