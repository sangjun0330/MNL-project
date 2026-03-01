import { notFound } from "next/navigation";
import { ShopProductDetailPage } from "@/components/pages/ShopProductDetailPage";
import { AppShell } from "@/components/shell/AppShell";
import { loadShopCatalog } from "@/lib/server/shopCatalogStore";

export const dynamic = "force-dynamic";

function resolveProductId(value: string) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export default async function Page(props: { params: Promise<{ productId: string }> }) {
  const params = await props.params;
  const productId = resolveProductId(params?.productId ?? "");
  if (!productId) notFound();

  const products = await loadShopCatalog();
  const product = products.find((item) => item.id === productId);
  if (!product) notFound();

  return (
    <AppShell>
      <ShopProductDetailPage product={product} />
    </AppShell>
  );
}
