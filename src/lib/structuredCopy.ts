"use client";

export type StructuredCopySection = {
  title: string;
  body?: string | null;
  items?: string[] | null;
};

function normalizeLine(value: string) {
  return String(value ?? "")
    .replace(/\u0000/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeBody(value: string | null | undefined) {
  const lines = String(value ?? "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) =>
      String(line ?? "")
        .replace(/\u0000/g, "")
        .replace(/[ \t]+/g, " ")
        .trim()
    );

  let start = 0;
  let end = lines.length;
  while (start < end && !lines[start]) start += 1;
  while (end > start && !lines[end - 1]) end -= 1;

  const trimmed = lines.slice(start, end);
  const out: string[] = [];
  let previousBlank = false;
  for (const line of trimmed) {
    const isBlank = !line;
    if (isBlank && previousBlank) continue;
    out.push(line);
    previousBlank = isBlank;
  }
  return out.join("\n").trim();
}

function normalizeItems(items: string[] | null | undefined) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of items ?? []) {
    const clean = normalizeLine(raw);
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

function buildDivider(length: number, token: string) {
  const size = Math.max(24, Math.min(56, Math.round(length)));
  return token.repeat(size);
}

export function buildStructuredCopyText(args: {
  title: string;
  metaLines?: string[];
  sections: StructuredCopySection[];
}) {
  const title = normalizeLine(args.title);
  const metaLines = (args.metaLines ?? []).map((line) => normalizeLine(line)).filter(Boolean);
  const blocks: string[] = [];

  if (title) {
    blocks.push(title);
    blocks.push(buildDivider(title.length + 6, "="));
  }
  if (metaLines.length) blocks.push(metaLines.join("\n"));

  for (const section of args.sections) {
    const heading = normalizeLine(section.title);
    const body = normalizeBody(section.body);
    const items = normalizeItems(section.items);
    if (!heading && !body && !items.length) continue;

    const blockLines: string[] = [];
    if (heading) blockLines.push(`[${heading}]`);
    if (body) blockLines.push(body);
    if (items.length) blockLines.push(...items.map((item) => `- ${item}`));
    blocks.push(blockLines.join("\n"));
  }

  return blocks.join("\n\n").trim();
}

export async function copyTextToClipboard(text: string) {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    return false;
  }
  await navigator.clipboard.writeText(text);
  return true;
}
