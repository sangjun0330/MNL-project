export type ShopCarrierOption = {
  code: string;
  label: string;
  aliases: string[];
};

export const SHOP_CARRIER_OPTIONS: ShopCarrierOption[] = [
  { code: "01", label: "우체국택배", aliases: ["우체국", "우체국택배", "KOREAPOST", "POST"] },
  { code: "04", label: "CJ대한통운", aliases: ["CJ", "CJ대한통운", "대한통운"] },
  { code: "05", label: "한진택배", aliases: ["한진", "한진택배"] },
  { code: "06", label: "로젠택배", aliases: ["로젠", "로젠택배"] },
  { code: "08", label: "롯데택배", aliases: ["롯데", "롯데택배", "롯데글로벌로지스"] },
  { code: "11", label: "일양로지스", aliases: ["일양", "일양로지스"] },
  { code: "12", label: "EMS", aliases: ["EMS"] },
  { code: "13", label: "DHL", aliases: ["DHL"] },
  { code: "21", label: "FedEx", aliases: ["FEDEX", "FEDEXKOREA", "FedEx"] },
  { code: "23", label: "경동택배", aliases: ["경동", "경동택배"] },
  { code: "32", label: "합동택배", aliases: ["합동", "합동택배"] },
];

function cleanText(value: unknown, max = 120) {
  return String(value ?? "").trim().slice(0, max);
}

function normalizeCarrierText(value: unknown) {
  return cleanText(value, 120)
    .toUpperCase()
    .replace(/[\s().,_-]/g, "");
}

export function findShopCarrierOptionByCode(code: string | null | undefined) {
  const safeCode = cleanText(code, 40);
  if (!safeCode) return null;
  return SHOP_CARRIER_OPTIONS.find((item) => item.code === safeCode) ?? null;
}

export function findShopCarrierOptionByLabel(label: string | null | undefined) {
  const normalized = normalizeCarrierText(label);
  if (!normalized) return null;
  return (
    SHOP_CARRIER_OPTIONS.find((item) => {
      if (normalizeCarrierText(item.label) === normalized) return true;
      return item.aliases.some((alias) => normalizeCarrierText(alias) === normalized);
    }) ?? null
  );
}

export function resolveSweetTrackerCarrier(input: {
  carrierCode?: string | null;
  courier?: string | null;
}): ShopCarrierOption | { code: string; label: string } | null {
  const byCode = findShopCarrierOptionByCode(input.carrierCode ?? null);
  if (byCode) return byCode;

  const byLabel = findShopCarrierOptionByLabel(input.courier ?? null);
  if (byLabel) return byLabel;

  const safeCode = cleanText(input.carrierCode, 40);
  const safeCourier = cleanText(input.courier, 60);
  if (safeCode) {
    return {
      code: safeCode,
      label: safeCourier || safeCode,
    };
  }
  return null;
}

export function resolveSweetTrackerCarrierCode(input: {
  carrierCode?: string | null;
  courier?: string | null;
}) {
  return resolveSweetTrackerCarrier(input)?.code ?? null;
}
