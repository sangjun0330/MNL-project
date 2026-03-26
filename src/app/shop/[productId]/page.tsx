import { notFound } from "next/navigation";
import { ShopProductDetailMount } from "@/components/shop/ShopProductDetailMount";
import { loadShopCatalog } from "@/lib/server/shopCatalogStore";

export const runtime = "edge";
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
      <ShopProductDetailMount product={product} />
  );
}
