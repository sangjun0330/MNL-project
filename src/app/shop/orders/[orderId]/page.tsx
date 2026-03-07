import { AppShell } from "@/components/shell/AppShell";
import { ShopOrderDetailMount } from "@/components/shop/ShopOrderDetailMount";

type Props = { params: Promise<{ orderId: string }> };

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function Page({ params }: Props) {
  const { orderId } = await params;
  return (
    <AppShell>
      <ShopOrderDetailMount orderId={orderId} />
    </AppShell>
  );
}
