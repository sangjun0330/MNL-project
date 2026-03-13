#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const USER_ID = process.env.USER_ID;
const REVISION_ID = Number(process.env.REVISION_ID);
const DOMAINS = String(process.env.DOMAINS || "schedule")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);
const DRY_RUN = process.env.DRY_RUN === "1";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("[recover-revision] missing env: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

if (!USER_ID || !Number.isFinite(REVISION_ID) || REVISION_ID <= 0) {
  console.error("[recover-revision] USER_ID and REVISION_ID are required");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value) {
  return isObject(value) ? value : {};
}

function countEntries(value) {
  return Object.keys(record(value)).length;
}

function mergeMap(backupMap, currentMap) {
  return {
    ...record(backupMap),
    ...record(currentMap),
  };
}

function mergeSettings(backupSettings, currentSettings) {
  return {
    ...record(backupSettings),
    ...record(currentSettings),
    menstrual: {
      ...record(record(backupSettings).menstrual),
      ...record(record(currentSettings).menstrual),
    },
    profile: {
      ...record(record(backupSettings).profile),
      ...record(record(currentSettings).profile),
    },
  };
}

function summarize(payload) {
  const state = record(payload);
  return {
    schedule: countEntries(state.schedule),
    shiftNames: countEntries(state.shiftNames),
    notes: countEntries(state.notes),
    emotions: countEntries(state.emotions),
    bio: countEntries(state.bio),
  };
}

function mergePayload(currentPayload, revisionPayload, domains) {
  const current = record(currentPayload);
  const revision = record(revisionPayload);
  const merged = {
    ...current,
  };

  if (domains.includes("schedule")) {
    merged.schedule = mergeMap(revision.schedule, current.schedule);
  }
  if (domains.includes("shiftNames")) {
    merged.shiftNames = mergeMap(revision.shiftNames, current.shiftNames);
  }
  if (domains.includes("notes")) {
    merged.notes = mergeMap(revision.notes, current.notes);
  }
  if (domains.includes("emotions")) {
    merged.emotions = mergeMap(revision.emotions, current.emotions);
  }
  if (domains.includes("bio")) {
    merged.bio = mergeMap(revision.bio, current.bio);
  }
  if (domains.includes("settings")) {
    merged.settings = mergeSettings(revision.settings, current.settings);
  }

  return merged;
}

async function main() {
  const [{ data: currentRow, error: currentError }, { data: revisionRow, error: revisionError }] = await Promise.all([
    supabase.from("rnest_user_state").select("user_id, payload, updated_at").eq("user_id", USER_ID).single(),
    supabase
      .from("rnest_user_state_revisions")
      .select("id, user_id, payload, source, created_at")
      .eq("id", REVISION_ID)
      .single(),
  ]);

  if (currentError) throw currentError;
  if (revisionError) throw revisionError;

  if (revisionRow.user_id !== USER_ID) {
    throw new Error(
      `[recover-revision] revision user mismatch: revision=${revisionRow.user_id} target=${USER_ID}`
    );
  }

  const currentPayload = record(currentRow.payload);
  const revisionPayload = record(revisionRow.payload);
  const mergedPayload = mergePayload(currentPayload, revisionPayload, DOMAINS);

  const currentScheduleKeys = new Set(Object.keys(record(currentPayload.schedule)));
  const revisionScheduleKeys = Object.keys(record(revisionPayload.schedule));
  const restoredScheduleKeys = revisionScheduleKeys.filter((key) => !currentScheduleKeys.has(key));

  console.log(
    JSON.stringify(
      {
        userId: USER_ID,
        revisionId: REVISION_ID,
        revisionSource: revisionRow.source,
        revisionCreatedAt: revisionRow.created_at,
        domains: DOMAINS,
        dryRun: DRY_RUN,
        before: summarize(currentPayload),
        revision: summarize(revisionPayload),
        after: summarize(mergedPayload),
        restoredScheduleKeys,
      },
      null,
      2
    )
  );

  if (DRY_RUN) return;

  const { error: saveError } = await supabase.from("rnest_user_state").upsert(
    {
      user_id: USER_ID,
      payload: mergedPayload,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (saveError) throw saveError;

  console.log("[recover-revision] recovery write completed");
}

main().catch((error) => {
  console.error("[recover-revision] fatal:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
