import type { CoreShift, CustomShiftDef } from "@/lib/model";

const CORE_SHIFT_SET = new Set<CoreShift>(["D", "E", "N", "M", "OFF", "VAC"]);

function asCoreShift(value: unknown): CoreShift | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim() as CoreShift;
  return CORE_SHIFT_SET.has(trimmed) ? trimmed : null;
}

function sanitizeAliasList(value: unknown, maxItems = 15, maxLength = 20) {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const normalized = item.replace(/\s+/g, " ").trim().slice(0, maxLength);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
    if (out.length >= maxItems) break;
  }
  return out;
}

export function sanitizeCustomShiftTypes(value: unknown, maxItems = 40): CustomShiftDef[] {
  if (!Array.isArray(value)) return [];
  const out: CustomShiftDef[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const displayName =
      typeof record.displayName === "string" ? record.displayName.replace(/\s+/g, " ").trim().slice(0, 20) : "";
    const semanticType = asCoreShift(record.semanticType);
    if (!displayName || !semanticType) continue;

    const dedupeKey = `${displayName.toLowerCase()}::${semanticType}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const id =
      typeof record.id === "string" && record.id.trim()
        ? record.id.trim().slice(0, 80)
        : `custom-shift-${index}-${displayName}`;

    out.push({
      id,
      displayName,
      semanticType,
      aliases: sanitizeAliasList(record.aliases),
    });

    if (out.length >= maxItems) break;
  }

  return out;
}

export function sanitizeOcrLastUserName(value: unknown, maxLength = 24) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}
