import Database from '@tauri-apps/plugin-sql';
import { log } from './logService';
import type { AppConfigKey } from '../types/db';

export const SCHEMA_VERSION = 8;

let db: Database | null = null;
let dbPromise: Promise<Database> | null = null;

export async function getDb(): Promise<Database> {
  if (db) return db;

  // Prevent race condition: reuse the same promise if already loading
  if (!dbPromise) {
    dbPromise = Database.load('sqlite:dragonfly.db').then(async (database) => {
      // Enable WAL mode for better concurrent access
      await database.execute('PRAGMA journal_mode=WAL');
      db = database;
      return database;
    });
  }

  return dbPromise;
}

// Expected table schemas — single source of truth for all columns.
// When a new column is needed, add it here AND bump SCHEMA_VERSION.
// ensureColumns() will automatically add any missing columns on startup.
const TABLE_SCHEMAS: Record<string, Record<string, string>> = {
  app_config: {
    key: 'TEXT PRIMARY KEY',
    value: 'TEXT',
    updated_at: 'TEXT',
  },
  projects: {
    id: 'TEXT PRIMARY KEY',
    name: 'TEXT NOT NULL',
    description: "TEXT DEFAULT ''",
    color: "TEXT DEFAULT '#0077B6'",
    sync_url: "TEXT DEFAULT ''",
    sync_space_key: "TEXT DEFAULT ''",
    shared: 'INTEGER DEFAULT 0',
    project_passphrase: "TEXT DEFAULT ''",
    created_at: 'TEXT NOT NULL',
    updated_at: 'TEXT NOT NULL',
    deleted: 'INTEGER DEFAULT 0',
  },
  pb_servers: {
    url: 'TEXT PRIMARY KEY',
    admin_email: "TEXT DEFAULT ''",
    admin_password: "TEXT DEFAULT ''",
  },
  users: {
    id: 'TEXT PRIMARY KEY',
    name: 'TEXT NOT NULL',
    color: 'TEXT NOT NULL',
    project_id: "TEXT DEFAULT ''",
    created_at: 'TEXT NOT NULL',
    updated_at: 'TEXT NOT NULL',
    deleted: 'INTEGER DEFAULT 0',
  },
  releases: {
    id: 'TEXT PRIMARY KEY',
    name: 'TEXT NOT NULL',
    description: "TEXT DEFAULT ''",
    project_id: "TEXT DEFAULT ''",
    created_at: 'TEXT NOT NULL',
    updated_at: 'TEXT NOT NULL',
    deleted: 'INTEGER DEFAULT 0',
  },
  tasks: {
    id: 'TEXT PRIMARY KEY',
    title: 'TEXT NOT NULL',
    content: "TEXT DEFAULT ''",
    type: "TEXT DEFAULT 'task'",
    status: "TEXT DEFAULT 'backlog'",
    release_id: 'TEXT',
    assignee_id: 'TEXT',
    feature_id: 'TEXT',
    priority: "TEXT DEFAULT 'low'",
    tags: "TEXT DEFAULT '[]'",
    project_id: "TEXT DEFAULT ''",
    created_at: 'TEXT NOT NULL',
    updated_at: 'TEXT NOT NULL',
    deleted: 'INTEGER DEFAULT 0',
  },
  notes: {
    id: 'TEXT PRIMARY KEY',
    title: "TEXT DEFAULT ''",
    content: "TEXT DEFAULT ''",
    tags: "TEXT DEFAULT '[]'",
    parent_id: 'TEXT',
    favorite: 'INTEGER DEFAULT 0',
    project_id: "TEXT DEFAULT ''",
    created_at: 'TEXT NOT NULL',
    updated_at: 'TEXT NOT NULL',
    deleted: 'INTEGER DEFAULT 0',
  },
  attachments: {
    id: 'TEXT PRIMARY KEY',
    file_name: 'TEXT NOT NULL',
    file_path: 'TEXT NOT NULL',
    mime_type: 'TEXT',
    file_size: 'INTEGER',
    entity_type: 'TEXT',
    entity_id: 'TEXT',
    created_at: 'TEXT NOT NULL',
  },
  scratchpads: {
    id: 'TEXT PRIMARY KEY',
    project_id: "TEXT DEFAULT ''",
    title: "TEXT DEFAULT ''",
    content: "TEXT DEFAULT ''",
    favorite: 'INTEGER DEFAULT 0',
    created_at: 'TEXT NOT NULL',
    updated_at: 'TEXT NOT NULL',
    deleted: 'INTEGER DEFAULT 0',
  },
  personal_todos: {
    id: 'TEXT PRIMARY KEY',
    title: 'TEXT NOT NULL',
    notes: "TEXT DEFAULT ''",
    status: "TEXT DEFAULT 'pending'",
    due_date: 'TEXT',
    all_day: 'INTEGER DEFAULT 0',
    recurrence_type: "TEXT DEFAULT 'none'",
    recurrence_interval: 'INTEGER DEFAULT 1',
    recurrence_days: "TEXT DEFAULT '[]'",
    recurrence_end: 'TEXT',
    next_occurrence: 'TEXT',
    alert_minutes: 'INTEGER DEFAULT -1',
    notify_email: 'INTEGER DEFAULT 0',
    priority: "TEXT DEFAULT 'medium'",
    tags: "TEXT DEFAULT '[]'",
    completed_at: 'TEXT',
    created_at: 'TEXT NOT NULL',
    updated_at: 'TEXT NOT NULL',
    deleted: 'INTEGER DEFAULT 0',
  },
};

// Compare actual table columns against TABLE_SCHEMAS and add any missing columns.
async function ensureColumns(): Promise<void> {
  const database = await getDb();

  for (const [table, expectedCols] of Object.entries(TABLE_SCHEMAS)) {
    if (table === 'app_config') continue; // skip config table

    let rows: { name: string }[];
    try {
      rows = await database.select<{ name: string }[]>(`PRAGMA table_info(${table})`);
    } catch {
      continue; // table doesn't exist yet (will be created by CREATE TABLE IF NOT EXISTS)
    }

    const existingCols = new Set(rows.map((r) => r.name));

    for (const [col, def] of Object.entries(expectedCols)) {
      if (existingCols.has(col)) continue;

      // Derive a safe DEFAULT for ALTER TABLE (NOT NULL without DEFAULT needs one)
      let alterDef = def;
      if (def.includes('NOT NULL') && !def.includes('DEFAULT')) {
        alterDef = `${def} DEFAULT ''`;
      }
      // Remove PRIMARY KEY from ALTER TABLE (can't add PK column)
      alterDef = alterDef.replace('PRIMARY KEY', '');

      try {
        await database.execute(`ALTER TABLE ${table} ADD COLUMN ${col} ${alterDef}`);
        log('INFO', `db: Added missing column ${table}.${col}`);
      } catch (err) {
        log('WARN', `db: Failed to add column ${table}.${col}: ${String(err)}`);
      }
    }
  }
}

export async function initDatabase(): Promise<void> {
  const database = await getDb();

  // Create all tables (uses simple definitions; ensureColumns fills gaps)
  for (const [table, cols] of Object.entries(TABLE_SCHEMAS)) {
    const colDefs = Object.entries(cols)
      .map(([name, def]) => `${name} ${def}`)
      .join(',\n      ');
    await database.execute(`CREATE TABLE IF NOT EXISTS ${table} (\n      ${colDefs}\n    )`);
  }

  // Ensure all expected columns exist (fixes failed migrations, schema drift)
  await ensureColumns();

  // Migrate admin credentials from projects columns → pb_servers table (one-time, idempotent)
  try {
    const legacyRows = await database.select<{ sync_url: string; admin_email: string; admin_password: string }[]>(
      "SELECT sync_url, admin_email, admin_password FROM projects WHERE admin_email != '' AND sync_url != ''"
    );
    for (const row of legacyRows) {
      const url = row.sync_url.replace(/\/+$/, '');
      await database.execute(
        'INSERT OR IGNORE INTO pb_servers (url, admin_email, admin_password) VALUES (?, ?, ?)',
        [url, row.admin_email, row.admin_password]
      );
    }
  } catch {
    // Column may not exist on fresh DBs — safe to ignore
  }

  // Indexes
  await database.execute('CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)');
  await database.execute('CREATE INDEX IF NOT EXISTS idx_tasks_release ON tasks(release_id)');
  await database.execute('CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id)');
  await database.execute('CREATE INDEX IF NOT EXISTS idx_notes_parent ON notes(parent_id)');
  await database.execute('CREATE INDEX IF NOT EXISTS idx_scratchpads_project ON scratchpads(project_id)');
  await database.execute('CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id)');
  await database.execute('CREATE INDEX IF NOT EXISTS idx_releases_project ON releases(project_id)');
  await database.execute('CREATE INDEX IF NOT EXISTS idx_users_project ON users(project_id)');
  await database.execute('CREATE INDEX IF NOT EXISTS idx_notes_project ON notes(project_id)');
  await database.execute('CREATE INDEX IF NOT EXISTS idx_personal_todos_due ON personal_todos(next_occurrence)');
}


// Config helpers
export async function getConfig(key: AppConfigKey): Promise<string | null> {
  const database = await getDb();
  const result = await database.select<{ value: string }[]>(
    'SELECT value FROM app_config WHERE key = ?',
    [key]
  );
  return result.length > 0 ? result[0].value : null;
}

export async function setConfig(key: AppConfigKey, value: string): Promise<void> {
  const database = await getDb();
  const now = new Date().toISOString();
  await database.execute(
    'INSERT OR REPLACE INTO app_config (key, value, updated_at) VALUES (?, ?, ?)',
    [key, value, now]
  );
}

export async function deleteConfig(key: AppConfigKey): Promise<void> {
  const database = await getDb();
  await database.execute('DELETE FROM app_config WHERE key = ?', [key]);
}

// Schema version helpers
export async function getSchemaVersion(): Promise<number | null> {
  const val = await getConfig('schema_version');
  return val ? parseInt(val, 10) : null;
}

export async function setSchemaVersion(version: number): Promise<void> {
  await setConfig('schema_version', String(version));
}

// Schema verification: TABLE_SCHEMAS is the single source of truth.
// On startup, initDatabase creates tables + ensureColumns repairs drift.
// runMigrations only tracks the version number for forward-compatibility checks.
export async function runMigrations(): Promise<'ok' | 'app_too_old'> {
  const current = await getSchemaVersion();

  // If DB schema is newer than app knows about
  if (current !== null && current > SCHEMA_VERSION) {
    return 'app_too_old';
  }

  // Tables and columns are always verified by initDatabase → ensureColumns.
  // Just update the version stamp.
  if (current !== SCHEMA_VERSION) {
    await setSchemaVersion(SCHEMA_VERSION);
    log('INFO', `db: Schema version set to ${SCHEMA_VERSION}`);
  }

  return 'ok';
}

// Server admin credential helpers — keyed by PocketBase server URL (pb_servers table)
export async function getProjectAdminCredentials(projectId: string): Promise<{ email: string; password: string } | null> {
  const database = await getDb();
  const rows = await database.select<{ admin_email: string; admin_password: string }[]>(
    `SELECT s.admin_email, s.admin_password
     FROM pb_servers s
     JOIN projects p ON p.sync_url = s.url OR RTRIM(p.sync_url, '/') = s.url
     WHERE p.id = ?`,
    [projectId]
  );
  if (rows.length === 0 || !rows[0].admin_email) return null;
  return { email: rows[0].admin_email, password: rows[0].admin_password };
}

export async function setProjectAdminCredentials(projectId: string, email: string, password: string): Promise<void> {
  const database = await getDb();
  const urlRows = await database.select<{ sync_url: string }[]>(
    'SELECT sync_url FROM projects WHERE id = ?',
    [projectId]
  );
  const url = urlRows[0]?.sync_url?.replace(/\/+$/, '') ?? '';
  if (!url) return;
  await database.execute(
    'INSERT OR REPLACE INTO pb_servers (url, admin_email, admin_password) VALUES (?, ?, ?)',
    [url, email, password]
  );
}

export async function clearProjectAdminCredentials(projectId: string): Promise<void> {
  const database = await getDb();
  const urlRows = await database.select<{ sync_url: string }[]>(
    'SELECT sync_url FROM projects WHERE id = ?',
    [projectId]
  );
  const url = urlRows[0]?.sync_url?.replace(/\/+$/, '') ?? '';
  if (!url) return;
  await database.execute('DELETE FROM pb_servers WHERE url = ?', [url]);
}

