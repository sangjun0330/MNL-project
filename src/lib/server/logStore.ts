import crypto from "crypto";
import fs from "fs/promises";
import path from "path";

type DailyLogRow = {
  deviceId: string;
  date: string; // ISODate
  payload: any;
  clientUpdatedAt: number;
  updatedAt: number;
};

function sanitizeSegment(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 128);
}

export function makeSignedToken(deviceId: string): string {
  const secret = process.env.LOG_SIGNING_SECRET;
  if (!secret) return "";
  const issuedAt = Date.now();
  const base = `${deviceId}|${issuedAt}`;
  const sig = crypto.createHmac("sha256", secret).update(base).digest("base64url");
  return `${deviceId}.${issuedAt}.${sig}`;
}

export function verifySignedToken(token: string | null, deviceId: string): boolean {
  const secret = process.env.LOG_SIGNING_SECRET;
  if (!secret) return true; // 시크릿이 없으면 개발/로컬 환경: 검증 스킵
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [did, issuedAtStr, sig] = parts;
  if (did !== deviceId) return false;
  const issuedAt = Number(issuedAtStr);
  if (!Number.isFinite(issuedAt)) return false;
  // 토큰 유효기간: 90일
  if (Date.now() - issuedAt > 90 * 24 * 60 * 60 * 1000) return false;
  const base = `${deviceId}|${issuedAt}`;
  const expected = crypto.createHmac("sha256", secret).update(base).digest("base64url");
  return expected === sig;
}

async function getPgPool() {
  // ✅ 중요: DB URL이 없으면 pg를 import하지 않음(로컬/프론트 단독 개발에서 'pg' 미설치로 터지는 이슈 방지)
  const url =
    process.env.SUPABASE_DATABASE_URL ??
    process.env.SUPABASE_DB_URL ??
    process.env.DATABASE_URL;
  if (!url) return null;

  // ✅ pg가 설치되지 않은 환경(프론트만 돌리는 환경)에서도 앱이 죽지 않게 try/catch
  let Pool: any;
  try {
    ({ Pool } = await import("pg"));
  } catch {
    return null;
  }
  const g = globalThis as any;
  if (!g.__wnlPgPool) {
    const useSsl = Boolean(process.env.SUPABASE_DATABASE_URL || process.env.SUPABASE_DB_URL);
    g.__wnlPgPool = new Pool({
      connectionString: url,
      ssl: useSsl ? { rejectUnauthorized: false } : undefined,
    });
  }
  return g.__wnlPgPool as import("pg").Pool;
}

async function ensureSchema() {
  const pool = await getPgPool();
  if (!pool) return;
  const g = globalThis as any;
  if (g.__wnlLogSchemaReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wnl_daily_logs (
      device_id TEXT NOT NULL,
      date_iso TEXT NOT NULL,
      payload JSONB NOT NULL,
      client_updated_at BIGINT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (device_id, date_iso)
    );
  `);
  g.__wnlLogSchemaReady = true;
}

async function saveToPostgres(row: DailyLogRow): Promise<void> {
  const pool = await getPgPool();
  if (!pool) throw new Error("DATABASE_URL not set");
  await ensureSchema();
  await pool.query(
    `
      INSERT INTO wnl_daily_logs (device_id, date_iso, payload, client_updated_at)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (device_id, date_iso)
      DO UPDATE SET payload = EXCLUDED.payload, client_updated_at = EXCLUDED.client_updated_at, updated_at = NOW();
    `,
    [row.deviceId, row.date, row.payload, row.clientUpdatedAt]
  );
}

async function listFromPostgres(params: {
  deviceId?: string;
  from?: string;
  to?: string;
  limit?: number;
}): Promise<DailyLogRow[]> {
  const pool = await getPgPool();
  if (!pool) throw new Error("DATABASE_URL not set");
  await ensureSchema();

  const where: string[] = [];
  const values: any[] = [];
  const push = (clause: string, v: any) => {
    values.push(v);
    where.push(clause.replace("$", `$${values.length}`));
  };

  if (params.deviceId) push("device_id = $", params.deviceId);
  if (params.from) push("date_iso >= $", params.from);
  if (params.to) push("date_iso <= $", params.to);

  const limit = Math.min(Math.max(params.limit ?? 200, 1), 1000);
  const sql = `
    SELECT device_id, date_iso, payload, client_updated_at, EXTRACT(EPOCH FROM updated_at)*1000 AS updated_ms
    FROM wnl_daily_logs
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY date_iso DESC
    LIMIT ${limit};
  `;
  const res = await pool.query(sql, values);
  return res.rows.map((r: any) => ({
    deviceId: r.device_id,
    date: r.date_iso,
    payload: r.payload,
    clientUpdatedAt: Number(r.client_updated_at),
    updatedAt: Math.round(Number(r.updated_ms) || Date.now()),
  }));
}

async function saveToFile(row: DailyLogRow): Promise<void> {
  const root = process.env.WNL_LOG_DIR ?? path.join(process.cwd(), ".wnl_logs");
  const did = sanitizeSegment(row.deviceId);
  const date = sanitizeSegment(row.date);
  const dir = path.join(root, did);
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${date}.json`);
  const body = {
    deviceId: row.deviceId,
    date: row.date,
    clientUpdatedAt: row.clientUpdatedAt,
    updatedAt: row.updatedAt,
    payload: row.payload,
  };
  await fs.writeFile(file, JSON.stringify(body, null, 2), "utf8");
}

async function listFromFile(params: {
  deviceId?: string;
  from?: string;
  to?: string;
  limit?: number;
}): Promise<DailyLogRow[]> {
  const root = process.env.WNL_LOG_DIR ?? path.join(process.cwd(), ".wnl_logs");
  const limit = Math.min(Math.max(params.limit ?? 200, 1), 1000);

  const deviceDirs: string[] = [];
  if (params.deviceId) {
    deviceDirs.push(path.join(root, sanitizeSegment(params.deviceId)));
  } else {
    try {
      const ents = await fs.readdir(root, { withFileTypes: true });
      for (const e of ents) if (e.isDirectory()) deviceDirs.push(path.join(root, e.name));
    } catch {
      return [];
    }
  }

  const rows: DailyLogRow[] = [];
  for (const dir of deviceDirs) {
    let files: string[] = [];
    try {
      files = (await fs.readdir(dir)).filter((f) => f.endsWith(".json"));
    } catch {
      continue;
    }
    for (const f of files) {
      const date = f.replace(/\.json$/, "");
      if (params.from && date < params.from) continue;
      if (params.to && date > params.to) continue;
      try {
        const raw = await fs.readFile(path.join(dir, f), "utf8");
        const parsed = JSON.parse(raw);
        rows.push({
          deviceId: parsed.deviceId,
          date: parsed.date,
          payload: parsed.payload,
          clientUpdatedAt: Number(parsed.clientUpdatedAt || 0),
          updatedAt: Number(parsed.updatedAt || 0),
        });
      } catch {
        // skip
      }
    }
  }

  rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.updatedAt - a.updatedAt));
  return rows.slice(0, limit);
}

export async function saveDailyLog(input: {
  deviceId: string;
  date: string;
  payload: any;
  clientUpdatedAt: number;
}): Promise<void> {
  const row: DailyLogRow = {
    deviceId: input.deviceId,
    date: input.date,
    payload: input.payload,
    clientUpdatedAt: input.clientUpdatedAt,
    updatedAt: Date.now(),
  };

  if (process.env.SUPABASE_DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.DATABASE_URL) {
    await saveToPostgres(row);
    return;
  }

  throw new Error("DB connection not configured");
}

export async function listDailyLogs(params: {
  deviceId?: string;
  from?: string;
  to?: string;
  limit?: number;
}): Promise<DailyLogRow[]> {
  if (process.env.SUPABASE_DATABASE_URL || process.env.SUPABASE_DB_URL || process.env.DATABASE_URL) {
    return listFromPostgres(params);
  }
  throw new Error("DB connection not configured");
}
