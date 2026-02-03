type UserStateRow = {
  userId: string;
  payload: any;
  updatedAt: number;
};

async function getPgPool() {
  const url =
    process.env.SUPABASE_DATABASE_URL ??
    process.env.SUPABASE_DB_URL ??
    process.env.DATABASE_URL;
  if (!url) return null;

  let Pool: any;
  try {
    ({ Pool } = await import("pg"));
  } catch {
    return null;
  }
  const g = globalThis as any;
  if (!g.__wnlUserPgPool) {
    const useSsl = Boolean(process.env.SUPABASE_DATABASE_URL || process.env.SUPABASE_DB_URL);
    g.__wnlUserPgPool = new Pool({
      connectionString: url,
      ssl: useSsl ? { rejectUnauthorized: false } : undefined,
    });
  }
  return g.__wnlUserPgPool as import("pg").Pool;
}

async function ensureSchema() {
  const pool = await getPgPool();
  if (!pool) return;
  const g = globalThis as any;
  if (g.__wnlUserSchemaReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wnl_users (
      user_id TEXT PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS wnl_user_state (
      user_id TEXT PRIMARY KEY,
      payload JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  g.__wnlUserSchemaReady = true;
}

async function upsertUser(userId: string) {
  const pool = await getPgPool();
  if (!pool) throw new Error("SUPABASE_DATABASE_URL not set");
  await ensureSchema();
  await pool.query(
    `
      INSERT INTO wnl_users (user_id)
      VALUES ($1)
      ON CONFLICT (user_id)
      DO UPDATE SET last_seen = NOW();
    `,
    [userId]
  );
}

async function saveToPostgres(row: UserStateRow): Promise<void> {
  const pool = await getPgPool();
  if (!pool) throw new Error("SUPABASE_DATABASE_URL not set");
  await ensureSchema();
  await upsertUser(row.userId);
  await pool.query(
    `
      INSERT INTO wnl_user_state (user_id, payload)
      VALUES ($1, $2)
      ON CONFLICT (user_id)
      DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW();
    `,
    [row.userId, row.payload]
  );
}

async function loadFromPostgres(userId: string): Promise<UserStateRow | null> {
  const pool = await getPgPool();
  if (!pool) throw new Error("SUPABASE_DATABASE_URL not set");
  await ensureSchema();
  await upsertUser(userId);

  const res = await pool.query(
    `
      SELECT user_id, payload, EXTRACT(EPOCH FROM updated_at)*1000 AS updated_ms
      FROM wnl_user_state
      WHERE user_id = $1
      LIMIT 1;
    `,
    [userId]
  );

  if (!res.rows?.length) return null;
  const row = res.rows[0];
  return {
    userId: row.user_id,
    payload: row.payload,
    updatedAt: Math.round(Number(row.updated_ms) || Date.now()),
  };
}

export async function saveUserState(input: { userId: string; payload: any }): Promise<void> {
  const row: UserStateRow = {
    userId: input.userId,
    payload: input.payload,
    updatedAt: Date.now(),
  };

  await saveToPostgres(row);
}

export async function loadUserState(userId: string): Promise<UserStateRow | null> {
  return loadFromPostgres(userId);
}
