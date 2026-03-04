import { AppShell } from "@/components/shell/AppShell";
import { ShopOrdersMount } from "@/components/shop/ShopOrdersMount";

export default function Page() {
  return (
    <AppShell>
      <ShopOrdersMount />
    </AppShell>
  );
}
