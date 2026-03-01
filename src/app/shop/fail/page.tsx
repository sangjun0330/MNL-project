import { AppShell } from "@/components/shell/AppShell";
import { ShopCheckoutFailPage } from "@/components/pages/ShopCheckoutFailPage";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <AppShell>
      <ShopCheckoutFailPage />
    </AppShell>
  );
}
