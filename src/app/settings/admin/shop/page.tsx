import { AppShell } from "@/components/shell/AppShell";
import { ShopAdminMount } from "@/components/shop/ShopAdminMount";

export default function Page() {
  return (
    <AppShell>
      <ShopAdminMount />
    </AppShell>
  );
}
