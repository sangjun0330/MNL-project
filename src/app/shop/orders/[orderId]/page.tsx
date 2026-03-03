import { AppShell } from "@/components/shell/AppShell";
import { ShopOrderDetailPage } from "@/components/pages/ShopOrderDetailPage";

type Props = { params: Promise<{ orderId: string }> };

export default async function Page({ params }: Props) {
  const { orderId } = await params;
  return (
    <AppShell>
      <ShopOrderDetailPage orderId={orderId} />
    </AppShell>
  );
}
