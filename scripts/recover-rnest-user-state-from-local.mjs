#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const SOURCE_DIR = process.env.RNEST_LOCAL_USER_STATE_DIR || ".rnest_users";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "[recover] missing env: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required"
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function isObject(value) {
  return typeof value === "object" && value !== null;
}

function readStateFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    if (!current) continue;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const next = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(next);
        continue;
      }
      if (entry.isFile() && entry.name === "state.json") {
        out.push(next);
      }
    }
  }
  return out.sort();
}

function parseStateFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const json = JSON.parse(raw);
  if (!isObject(json) || !isObject(json.payload)) return null;
  return {
    source: filePath,
    sourceUserId: String(json.userId || ""),
    payload: json.payload,
    updatedAt: typeof json.updatedAt === "number" ? new Date(json.updatedAt).toISOString() : new Date().toISOString(),
  };
}

function extractEmail(sourceUserId) {
  if (!sourceUserId) return null;
  if (/^[^:]+:.+@.+$/.test(sourceUserId)) return sourceUserId.split(":").slice(1).join(":").toLowerCase();
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(sourceUserId)) return sourceUserId.toLowerCase();
  return null;
}

function mergeMap(backupMap, currentMap) {
  const b = isObject(backupMap) ? backupMap : {};
  const c = isObject(currentMap) ? currentMap : {};
  return { ...b, ...c };
}

function mergeState(backup, current) {
  const b = isObject(backup) ? backup : {};
  const c = isObject(current) ? current : {};
  return {
    ...b,
    ...c,
    selected: c.selected ?? b.selected,
    schedule: mergeMap(b.schedule, c.schedule),
    notes: mergeMap(b.notes, c.notes),
    emotions: mergeMap(b.emotions, c.emotions),
    bio: mergeMap(b.bio, c.bio),
    shiftNames: mergeMap(b.shiftNames, c.shiftNames),
    settings: {
      ...(isObject(b.settings) ? b.settings : {}),
      ...(isObject(c.settings) ? c.settings : {}),
      menstrual: {
        ...(isObject(b.settings?.menstrual) ? b.settings.menstrual : {}),
        ...(isObject(c.settings?.menstrual) ? c.settings.menstrual : {}),
      },
      profile: {
        ...(isObject(b.settings?.profile) ? b.settings.profile : {}),
        ...(isObject(c.settings?.profile) ? c.settings.profile : {}),
      },
    },
  };
}

async function loadAuthUsers() {
  const out = [];
  let page = 1;
  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const users = data?.users ?? [];
    out.push(...users);
    if (users.length < 200) break;
    page += 1;
  }
  return out;
}

function resolveTargetUserId(record, authUsersByEmail) {
  const sourceUserId = record.sourceUserId;
  if (/^[0-9a-f-]{36}$/i.test(sourceUserId)) return sourceUserId;
  const email = extractEmail(sourceUserId);
  if (!email) return null;
  return authUsersByEmail.get(email) ?? null;
}

function summarize(state) {
  const s = isObject(state) ? state : {};
  return {
    schedule: Object.keys(isObject(s.schedule) ? s.schedule : {}).length,
    notes: Object.keys(isObject(s.notes) ? s.notes : {}).length,
    emotions: Object.keys(isObject(s.emotions) ? s.emotions : {}).length,
    bio: Object.keys(isObject(s.bio) ? s.bio : {}).length,
  };
}

async function recoverRecord(record, authUsersByEmail) {
  const targetUserId = resolveTargetUserId(record, authUsersByEmail);
  if (!targetUserId) {
    return { ok: false, reason: "target_user_not_resolved", source: record.source };
  }

  const { data: currentRow, error: currentErr } = await supabase
    .from("rnest_user_state")
    .select("payload, updated_at")
    .eq("user_id", targetUserId)
    .maybeSingle();
  if (currentErr) throw currentErr;

  const currentPayload = isObject(currentRow?.payload) ? currentRow.payload : {};
  const merged = mergeState(record.payload, currentPayload);
  const now = new Date().toISOString();

  const { error: upsertErr } = await supabase.from("rnest_user_state").upsert(
    {
      user_id: targetUserId,
      payload: merged,
      updated_at: now,
    },
    { onConflict: "user_id" }
  );
  if (upsertErr) throw upsertErr;

  return {
    ok: true,
    source: record.source,
    sourceUserId: record.sourceUserId,
    targetUserId,
    before: summarize(currentPayload),
    backup: summarize(record.payload),
    after: summarize(merged),
  };
}

async function main() {
  const files = readStateFiles(SOURCE_DIR);
  const records = files.map(parseStateFile).filter(Boolean);

  const authUsers = await loadAuthUsers();
  const authUsersByEmail = new Map(
    authUsers
      .filter((u) => typeof u.email === "string" && u.email.trim())
      .map((u) => [u.email.toLowerCase(), u.id])
  );

  const results = [];
  for (const record of records) {
    try {
      results.push(await recoverRecord(record, authUsersByEmail));
    } catch (error) {
      results.push({
        ok: false,
        reason: error instanceof Error ? error.message : String(error),
        source: record.source,
      });
    }
  }

  const success = results.filter((r) => r.ok).length;
  const failed = results.length - success;

  console.log("[recover] local files:", files.length);
  console.log("[recover] attempted:", results.length);
  console.log("[recover] success:", success);
  console.log("[recover] failed:", failed);
  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error("[recover] fatal:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
