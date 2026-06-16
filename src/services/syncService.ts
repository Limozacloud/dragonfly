import PocketBase from 'pocketbase';
import { appDataDir, join } from '@tauri-apps/api/path';
import { mkdir, writeFile, exists, readFile } from '@tauri-apps/plugin-fs';
import { getDb, getConfig, setConfig } from './database';
import type { AppConfigKey } from '../types/db';
import { SCHEMA_VERSION } from './database';
import { deriveSyncKey, encrypt, decrypt, deriveReminderEncKey, hashSecret } from './crypto';
import { log as logToService, type LogLevel } from './logService';
import { PB_PRESENCE, getPresenceFields } from './presenceService';

type LocalTable = 'tasks' | 'releases' | 'users' | 'notes' | 'scratchpads';

// PocketBase collection names (prefixed to avoid conflicts with PB's built-in 'users')
const PB_COLLECTIONS: Record<LocalTable, string> = {
  tasks: 'df_tasks',
  releases: 'df_releases',
  users: 'df_users',
  notes: 'df_notes',
  scratchpads: 'df_scratchpads',
};
const PB_ATTACHMENTS = 'df_attachments';
const PB_PROJECTS = 'df_projects';
const PB_TOMBSTONES = 'df_tombstones';
const PB_META = 'df_meta';
const PB_PERSONAL_TODOS = 'df_personal_todos';
const PB_PERSONAL_SETTINGS = 'df_personal_settings';
const SYNC_USER_EMAIL = 'sync@dragonfly.local';

// Bumped whenever the PocketBase collection schema changes.
// Admins must run "Upgrade Schema" when this version is higher than the server's sync_schema_version.
export const SYNC_SCHEMA_VERSION = 2;

// PocketBase collection field descriptor (shared between schema approaches)
type PbField = Record<string, unknown> & { name: string };

// PocketBase collection response (fields or legacy schema property)
type PbCollection = { id: string; fields?: PbField[]; schema?: PbField[] } & Record<string, unknown>;

// A PocketBase record from getFullList / getFirstListItem / create / update
type PbRecord = Record<string, unknown> & { id: string; local_id: string; data: string; updated_at: string; created: string; file?: string; entity_type?: string; entity_id?: string; table_name?: string; deleted_at?: string };

// A local DB row with at least these fields.
// The index signature allows access to arbitrary column names (project_id, title, etc.)
// without requiring all callers to know the exact schema.
// Call sites in stores use `as unknown as LocalRow` to satisfy this type.
type LocalRow = { id: string; deleted?: number; updated_at: string; created_at: string; [key: string]: unknown };

class SyncService {
  private pb: PocketBase | null = null;
  private syncKey: CryptoKey | null = null;
  private url: string = '';
  private spaceKey: string = '';
  private projectId: string = '';
  private connected: boolean = false;
  private unsubscribes: (() => void)[] = [];
  private failedPushQueue = new Map<string, { table: LocalTable; id: string; retries: number }>();
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private _serverSyncSchemaVersion: number = 0;

  get isConnected() {
    return this.connected;
  }

  get serverUrl() {
    return this.url;
  }

  get serverSyncSchemaVersion() {
    return this._serverSyncSchemaVersion;
  }

  get isSchemaMismatch() {
    return this._serverSyncSchemaVersion > 0 && this._serverSyncSchemaVersion < SYNC_SCHEMA_VERSION;
  }

  get pocketBase(): PocketBase | null {
    return this.pb;
  }

  private log(msg: string) {
    // Parse level prefix from message (e.g. "[OK] ..." → OK)
    const match = msg.match(/^\[(\w+)\]/);
    const level: LogLevel = match
      ? (['OK', 'ERR', 'WARN', 'INFO', 'DBG'].includes(match[1]) ? match[1] as LogLevel : 'INFO')
      : 'INFO';
    // Strip the prefix from the message since logService adds its own
    const cleanMsg = match ? msg.slice(match[0].length).trim() : msg;
    logToService(level, 'sync: ' + cleanMsg);
  }

  private queueFailedPush(table: LocalTable, id: string): void {
    const key = `${table}/${id}`;
    const existing = this.failedPushQueue.get(key);
    const retries = existing ? existing.retries + 1 : 0;
    if (retries > 5) {
      this.failedPushQueue.delete(key);
      logToService('WARN', `sync: Giving up on ${key} after 5 retry attempts`);
      return;
    }
    this.failedPushQueue.set(key, { table, id, retries });
    if (!this.retryTimer) {
      this.retryTimer = setTimeout(() => { void this.retryFailedPushes(); }, 60_000);
    }
  }

  private async retryFailedPushes(): Promise<void> {
    this.retryTimer = null;
    if (!this.pb || !this.syncKey) return;
    const db = await getDb();
    const entries = [...this.failedPushQueue.values()];
    this.failedPushQueue.clear();
    for (const entry of entries) {
      try {
        const rows = await db.select<LocalRow[]>(`SELECT * FROM ${entry.table} WHERE id = ?`, [entry.id]);
        if (rows.length === 0) continue;
        await this._doPush(entry.table, rows[0]);
        logToService('INFO', `sync: Retry succeeded for ${entry.table}/${entry.id}`);
      } catch (error) {
        logToService('WARN', `sync: Retry ${entry.retries + 1}/5 failed for ${entry.table}/${entry.id}: ${String(error)}`);
        if (entry.retries < 4) {
          this.failedPushQueue.set(`${entry.table}/${entry.id}`, { ...entry, retries: entry.retries + 1 });
        } else {
          logToService('WARN', `sync: Giving up on ${entry.table}/${entry.id} after 5 retries`);
        }
      }
    }
    if (this.failedPushQueue.size > 0 && !this.retryTimer) {
      this.retryTimer = setTimeout(() => { void this.retryFailedPushes(); }, 60_000);
    }
  }

  private clearRetryQueue(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.failedPushQueue.clear();
  }

  // Authenticate as PocketBase admin
  private async adminAuth(pb: PocketBase, adminEmail: string, adminPassword: string): Promise<void> {
    try {
      await pb.collection('_superusers').authWithPassword(adminEmail, adminPassword);
    } catch {
      // Fallback for older PocketBase versions that use `admins` instead of `_superusers`
      await (pb as unknown as { admins: { authWithPassword: (e: string, p: string) => Promise<unknown> } }).admins.authWithPassword(adminEmail, adminPassword);
    }
  }

  // Verify admin credentials against a PocketBase server
  async verifyAdmin(url: string, email: string, password: string): Promise<boolean> {
    const pb = new PocketBase(url);
    try {
      await this.adminAuth(pb, email, password);
      pb.authStore.clear();
      return true;
    } catch {
      pb.authStore.clear();
      return false;
    }
  }

  // Merge desired fields into existing ones (preserves PB field IDs)
  private mergeFields(existing: PbField[], desired: PbField[]): PbField[] {
    const merged = existing.map((ef) => {
      const match = desired.find((df) => df.name === ef.name);
      if (match) {
        return { ...ef, ...match, id: ef.id };
      }
      return ef;
    });
    // Add fields that don't exist yet
    for (const df of desired) {
      if (!existing.find((ef) => ef.name === df.name)) {
        merged.push(df);
      }
    }
    return merged;
  }

  // Create or update a collection with proper schema
  private async ensureCollection(
    pb: PocketBase,
    name: string,
    fields: PbField[],
    authRules: Record<string, string | null>
  ): Promise<void> {
    let existing: PbCollection | null = null;
    try {
      existing = await pb.collections.getOne(name) as unknown as PbCollection;
    } catch {
      // Collection doesn't exist
    }

    if (existing) {
      // Get existing fields and merge with desired (keeps PB field IDs)
      const existingFields: PbField[] = (existing.fields || existing.schema || []) as PbField[];
      const mergedFields = this.mergeFields(existingFields, fields);

      // Try `fields` first (PB v0.23+), fall back to `schema`
      try {
        await pb.collections.update(existing.id, { ...authRules, fields: mergedFields });
        this.log(`[OK] ${name}: updated`);
      } catch {
        try {
          await pb.collections.update(existing.id, { ...authRules, schema: mergedFields });
          this.log(`[OK] ${name}: updated (schema)`);
        } catch (e2: unknown) {
          const err = e2 as { response?: unknown; message?: string };
          this.log(`[ERR] ${name}: update failed: ${JSON.stringify(err?.response || err?.message || e2)}`);
        }
      }
    } else {
      // Create new collection
      try {
        await pb.collections.create({ name, type: 'base', fields, ...authRules });
        this.log(`[OK] ${name}: created`);
      } catch {
        try {
          await pb.collections.create({ name, type: 'base', schema: fields, ...authRules });
          this.log(`[OK] ${name}: created (schema)`);
        } catch (e2: unknown) {
          const err = e2 as { response?: unknown; message?: string };
          this.log(`[ERR] ${name}: create failed: ${JSON.stringify(err?.response || err?.message || e2)}`);
        }
      }
    }
  }

  // Ensure sync user exists, returns user ID for rules
  private async ensureSyncUser(pb: PocketBase, spaceKey: string): Promise<string> {
    // Check if server is already set up
    try {
      await pb.collection('users').getFirstListItem(`email="${SYNC_USER_EMAIL}"`);
      throw new Error('SERVER_ALREADY_CONFIGURED');
    } catch (e: unknown) {
      if (e instanceof Error && e.message === 'SERVER_ALREADY_CONFIGURED') throw e;
    }

    // Create sync user for fresh server
    try {
      const created = await pb.collection('users').create({
        email: SYNC_USER_EMAIL,
        password: spaceKey,
        passwordConfirm: spaceKey,
        verified: true,
      });
      return created.id;
    } catch (createErr: unknown) {
      const err = createErr as { response?: { data?: unknown }; data?: unknown };
      const detail = JSON.stringify(err?.response?.data || err?.data || {});
      throw new Error('Could not create sync user: ' + detail, { cause: createErr });
    }
  }

  // Get the expected schema definitions
  private getDataFields() {
    return [
      { name: 'local_id', type: 'text', required: true },
      { name: 'data', type: 'text', required: false, options: { min: 0, max: 10000000 }, min: 0, max: 10000000 },
      { name: 'created_at', type: 'text', required: false },
      { name: 'updated_at', type: 'text', required: false },
    ];
  }

  private getProjectFields() {
    return [
      ...this.getDataFields(),
      { name: 'owner_id', type: 'text', required: false },
    ];
  }

  private getAttachmentFields() {
    return [
      { name: 'local_id', type: 'text', required: true },
      { name: 'file', type: 'file', required: false, options: { maxSelect: 1, maxSize: 524288000 }, maxSize: 524288000 },
      { name: 'entity_type', type: 'text', required: false },
      { name: 'entity_id', type: 'text', required: false },
    ];
  }

  private getTombstoneFields() {
    return [
      { name: 'local_id', type: 'text', required: true },
      { name: 'table_name', type: 'text', required: true },
      { name: 'deleted_at', type: 'text', required: false },
    ];
  }

  private getMetaFields() {
    return [
      { name: 'key', type: 'text', required: true },
      { name: 'value', type: 'text', required: false },
    ];
  }

  private getMetaAuthRules(syncUserId?: string) {
    const viewRule = syncUserId
      ? `@request.auth.id = "${syncUserId}"`
      : '@request.auth.id != ""';
    return {
      listRule: viewRule,
      viewRule: viewRule,
      createRule: null as string | null,
      updateRule: null as string | null,
      deleteRule: null as string | null,
    };
  }

  private getOpenRules() {
    return { listRule: '', viewRule: '', createRule: '', updateRule: '', deleteRule: '' };
  }

  private getPersonalTodosFields() {
    return [
      { name: 'sync_id', type: 'text', required: true },
      { name: 'local_id', type: 'text', required: true },
      { name: 'data', type: 'text', required: false, options: { min: 0, max: 10000000 }, min: 0, max: 10000000 },
      { name: 'updated_at', type: 'text', required: false },
    ];
  }

  private getPersonalSettingsFields() {
    return [
      { name: 'sync_id', type: 'text', required: true },
      { name: 'data', type: 'text', required: false, options: { min: 0, max: 100000 }, min: 0, max: 100000 },
      { name: 'updated_at', type: 'text', required: false },
    ];
  }

  private getAuthRules(syncUserId?: string) {
    // If we know the sync user ID, lock rules to only that user
    const rule = syncUserId
      ? `@request.auth.id = "${syncUserId}"`
      : '@request.auth.id != ""';
    return {
      listRule: rule,
      viewRule: rule,
      createRule: rule,
      updateRule: rule,
      deleteRule: rule,
    };
  }

  // Setup: create collections + sync user via Admin API
  async setupServer(url: string, adminEmail: string, adminPassword: string, spaceKey: string): Promise<void> {
    const pb = new PocketBase(url);
    await this.adminAuth(pb, adminEmail, adminPassword);

    // First ensure sync user exists (need ID for rules)
    const syncUserId = await this.ensureSyncUser(pb, spaceKey);
    const authRules = this.getAuthRules(syncUserId);

    // Create/update data collections with user-specific rules
    for (const name of Object.values(PB_COLLECTIONS)) {
      await this.ensureCollection(pb, name, this.getDataFields(), authRules);
    }

    // Projects collection (includes owner_id for personal identity)
    await this.ensureCollection(pb, PB_PROJECTS, this.getProjectFields(), authRules);

    // Attachments collection
    await this.ensureCollection(pb, PB_ATTACHMENTS, this.getAttachmentFields(), authRules);

    // Tombstones collection (tracks deleted record IDs)
    await this.ensureCollection(pb, PB_TOMBSTONES, this.getTombstoneFields(), authRules);

    // Presence collection (real-time editing indicators) - open read/write for sync user
    await this.ensureCollection(pb, PB_PRESENCE, getPresenceFields(), authRules);

    // Meta collection (schema version, etc.) - admin-only writes, sync user can read
    const metaAuthRules = this.getMetaAuthRules(syncUserId);
    await this.ensureCollection(pb, PB_META, this.getMetaFields(), metaAuthRules);

    // Write schema version records
    for (const [key, value] of [['schema_version', String(SCHEMA_VERSION)], ['sync_schema_version', String(SYNC_SCHEMA_VERSION)]]) {
      try {
        const existing = await pb.collection(PB_META).getFirstListItem(`key="${key}"`);
        await pb.collection(PB_META).update(existing.id, { value });
      } catch {
        await pb.collection(PB_META).create({ key, value });
      }
    }

    pb.authStore.clear();
  }

  // Check and fix schema on all collections, returns a report
  async checkSchema(url: string, adminEmail: string, adminPassword: string): Promise<string[]> {
    const pb = new PocketBase(url);
    await this.adminAuth(pb, adminEmail, adminPassword);

    const report: string[] = [];

    // Find sync user ID for rules
    let syncUserId: string | undefined;
    try {
      const syncUser = await pb.collection('users').getFirstListItem(`email="${SYNC_USER_EMAIL}"`);
      syncUserId = syncUser.id;
      report.push(`[OK] Sync user: ${syncUserId}`);
    } catch {
      report.push('[WARN] Sync user not found - run setup to create');
    }

    const authRules = this.getAuthRules(syncUserId);
    const allCollections: Record<string, PbField[]> = {};

    for (const [, name] of Object.entries(PB_COLLECTIONS)) {
      allCollections[name] = this.getDataFields();
    }
    allCollections[PB_PROJECTS] = this.getProjectFields();
    allCollections[PB_ATTACHMENTS] = this.getAttachmentFields();
    allCollections[PB_TOMBSTONES] = this.getTombstoneFields();
    allCollections[PB_META] = this.getMetaFields();
    allCollections[PB_PRESENCE] = getPresenceFields();

    const metaAuthRules = this.getMetaAuthRules(syncUserId);

    for (const [collName, expectedFields] of Object.entries(allCollections)) {
      // df_meta uses special admin-only write rules
      const rules = collName === PB_META ? metaAuthRules : authRules;

      try {
        const coll = await pb.collections.getOne(collName);
        report.push(`[OK] ${collName} exists`);

        // Check fields (PB v0.23+ uses 'fields', older uses 'schema')
        const existingFields: PbField[] = ((coll as unknown as PbCollection).fields || (coll as unknown as PbCollection).schema || []) as PbField[];
        const existingNames = new Set(existingFields.map((f) => f.name));
        const missingFields = expectedFields.filter((f) => !existingNames.has(f.name));

        // Log data field details
        const dataField = existingFields.find((f) => f.name === 'data') as (PbField & { max?: number; options?: { max?: number }; type?: string }) | undefined;
        if (dataField) {
          report.push(`[DBG] ${collName}.data: max=${dataField.max ?? dataField.options?.max ?? 'n/a'}, type=${dataField.type}`);
        }

        if (missingFields.length > 0) {
          report.push(`[FIX] ${collName}: adding fields: ${missingFields.map((f) => f.name).join(', ')}`);
          await this.ensureCollection(pb, collName, expectedFields, rules);
        } else {
          // Always update to ensure field options (like max) are correct
          await this.ensureCollection(pb, collName, expectedFields, rules);
          report.push(`[OK] ${collName} fields updated`);
        }

        // Check rules
        const ruleKeys = Object.keys(rules) as (keyof typeof rules)[];
        const brokenRules = ruleKeys.filter((k) => coll[k] !== rules[k]);
        if (brokenRules.length > 0) {
          report.push(`[FIX] ${collName}: updating rules: ${brokenRules.join(', ')}`);
          await this.ensureCollection(pb, collName, expectedFields, rules);
        } else {
          report.push(`[OK] ${collName} rules correct`);
        }
      } catch {
        report.push(`[FIX] ${collName}: collection missing, creating...`);
        await this.ensureCollection(pb, collName, expectedFields, rules);
      }
    }

    // Update sync_schema_version after successful migration
    try {
      const existing = await pb.collection(PB_META).getFirstListItem('key="sync_schema_version"');
      await pb.collection(PB_META).update(existing.id, { value: String(SYNC_SCHEMA_VERSION) });
    } catch {
      await pb.collection(PB_META).create({ key: 'sync_schema_version', value: String(SYNC_SCHEMA_VERSION) });
    }
    report.push(`[OK] sync_schema_version updated to v${SYNC_SCHEMA_VERSION}`);

    pb.authStore.clear();
    return report;
  }

  // Connect: authenticate as sync user with space key, then sync
  async connect(url: string, spaceKey: string, projectId?: string): Promise<void> {
    this.url = url;
    this.spaceKey = spaceKey;
    this.projectId = projectId || '';
    this.pb = new PocketBase(url);
    this.syncKey = await deriveSyncKey(spaceKey, url);

    await this.ensureAuth();
    this.connected = true;

    // Check server sync schema version before syncing
    await this.checkServerSyncSchemaVersion();
    if (this.isSchemaMismatch) {
      this.log(`[WARN] Server sync schema v${this._serverSyncSchemaVersion} < app v${SYNC_SCHEMA_VERSION} — sync blocked`);
      window.dispatchEvent(new Event('dragonfly-sync'));
      return;
    }

    await this.fullSync();
    await this.subscribe();
    this.log('[OK] Connected & subscribed');
  }

  private async checkServerSyncSchemaVersion(): Promise<void> {
    if (!this.pb) return;
    try {
      const rec = await this.pb.collection(PB_META).getFirstListItem('key="sync_schema_version"');
      this._serverSyncSchemaVersion = parseInt(rec.value as string, 10) || 1;
    } catch {
      // Key doesn't exist yet → old server = v1
      this._serverSyncSchemaVersion = 1;
    }
  }

  // Always re-authenticate against the server (never trust localStorage-cached token)
  private async ensureAuth(): Promise<void> {
    if (!this.pb || !this.spaceKey) return;
    this.pb.authStore.clear();
    this.log('[...] Authenticating...');
    await this.pb.collection('users').authWithPassword(SYNC_USER_EMAIL, this.spaceKey);
    this.connected = true;
    this.log('[OK] Authenticated');
  }

  async disconnect(): Promise<void> {
    for (const unsub of this.unsubscribes) {
      unsub();
    }
    this.unsubscribes = [];
    if (this.pb) {
      this.pb.authStore.clear();
    }
    this.pb = null;
    this.syncKey = null;
    this.connected = false;
    this.url = '';
    this.spaceKey = '';
    this.projectId = '';
    this.clearRetryQueue();
  }

  async fullSync(): Promise<void> {
    if (!this.pb || !this.syncKey) return;
    if (this.isSchemaMismatch) {
      this.log(`[WARN] Sync blocked — server schema v${this._serverSyncSchemaVersion} < required v${SYNC_SCHEMA_VERSION}`);
      return;
    }

    // Re-auth if token expired
    await this.ensureAuth();

    // Fetch all tombstones once, grouped by table
    const allTombstones = await this.pb.collection(PB_TOMBSTONES).getFullList();
    const tombstonesByTable = new Map<string, Set<string>>();
    for (const t of allTombstones) {
      if (!tombstonesByTable.has(t.table_name)) {
        tombstonesByTable.set(t.table_name, new Set());
      }
      tombstonesByTable.get(t.table_name)!.add(t.local_id);
    }

    // Check if current project has a tombstone (deleted by another user)
    const projectTombstones = tombstonesByTable.get('projects') || new Set<string>();
    if (this.projectId && projectTombstones.has(this.projectId)) {
      this.log('[WARN] Project was deleted by another user');
      await this.disconnect();
      window.dispatchEvent(new Event('dragonfly-project-tombstone'));
      return;
    }

    const tables: LocalTable[] = ['tasks', 'releases', 'users', 'notes', 'scratchpads'];
    for (const table of tables) {
      this.log(`[...] Syncing ${table}...`);
      const tombstoneIds = tombstonesByTable.get(table) || new Set<string>();
      await this.syncCollection(table, tombstoneIds);
    }

    // Sync project metadata
    if (this.projectId) {
      this.log('[...] Syncing project metadata...');
      await this.syncProjectMetadata();
    }

    this.log('[...] Syncing attachments...');
    await this.syncAttachments();
    this.clearRetryQueue();
    this.log('[OK] Sync complete');
    window.dispatchEvent(new Event('dragonfly-sync'));
  }

  // Find PB record by local_id
  private async findRemoteByLocalId(collection: string, localId: string): Promise<PbRecord | null> {
    if (!this.pb) return null;
    try {
      return await this.pb.collection(collection).getFirstListItem(`local_id="${localId}"`) as PbRecord;
    } catch {
      return null;
    }
  }

  private async syncCollection(table: LocalTable, tombstoneIds: Set<string>): Promise<void> {
    if (!this.pb || !this.syncKey) return;
    const db = await getDb();
    const pbCollection = PB_COLLECTIONS[table];

    try {
      const remoteRecords = await this.pb.collection(pbCollection).getFullList() as PbRecord[];
      const remoteByLocalId = new Map<string, PbRecord>();
      for (const r of remoteRecords) {
        remoteByLocalId.set(r.local_id, r);
      }

      let pulled = 0;
      let pushed = 0;
      let deleted = 0;

      // --- PULL: PB record exists = alive → ensure local has it with deleted=0 ---
      for (const remote of remoteRecords) {
        try {
          const decryptedData = await decrypt(remote.data, this.syncKey);
          const record = JSON.parse(decryptedData);
          // Force deleted=0: if record exists in PB, it's alive
          record.deleted = 0;
          const localId = remote.local_id;

          const localRows = await db.select<{ updated_at: string; deleted: number }[]>(
            `SELECT updated_at, deleted FROM ${table} WHERE id = ?`,
            [localId]
          );

          if (localRows.length === 0) {
            await this.insertLocal(table, record);
            pulled++;
          } else {
            const localDeleted = localRows[0].deleted || 0;
            const localUpdatedAt = localRows[0].updated_at;
            const remoteUpdatedAt = record.updated_at || record.updatedAt;

            // Pull if: locally deleted (restore) OR remote is newer
            if (localDeleted === 1 || remoteUpdatedAt > localUpdatedAt) {
              await this.updateLocal(table, record);
              pulled++;
            }
          }
        } catch {
          // Can't decrypt = wrong key, skip
        }
      }

      // --- PUSH + TOMBSTONE CHECK ---
      const localRows = this.projectId
        ? await db.select<LocalRow[]>(`SELECT * FROM ${table} WHERE project_id = ?`, [this.projectId])
        : await db.select<LocalRow[]>(`SELECT * FROM ${table}`);

      for (const local of localRows) {
        const existingRemote = remoteByLocalId.get(local.id);
        const localDeleted = local.deleted || 0;

        if (localDeleted === 1) {
          if (tombstoneIds.has(local.id)) {
            // Both sides confirm deletion → permanently remove from local recycle bin + attachments
            await db.execute(`DELETE FROM ${table} WHERE id = ?`, [local.id]);
            await db.execute(`DELETE FROM attachments WHERE entity_type = ? AND entity_id = ?`, [table.replace(/s$/, ''), local.id]);
            continue;
          }
          // Deleted locally, no tombstone yet → remove from PB + create tombstone
          if (existingRemote) {
            try {
              await this.pb!.collection(pbCollection).delete(existingRemote.id);
              deleted++;
            } catch (err: unknown) {
              logToService('WARN', `sync: delete from PB failed ${table}/${local.id}: ${String(err)}`);
            }
          }
          try {
            await this.pb!.collection(PB_TOMBSTONES).create({
              local_id: local.id,
              table_name: table,
              deleted_at: new Date().toISOString(),
            });
            tombstoneIds.add(local.id);
          } catch { /* tombstone may already exist */ }
          continue;
        }

        // Alive locally but tombstone exists → check if restored after deletion
        if (tombstoneIds.has(local.id)) {
          let restoredAfterDelete = false;
          try {
            const tombstone = await this.pb!.collection(PB_TOMBSTONES).getFirstListItem(
              `local_id="${local.id}" && table_name="${table}"`
            );
            if (local.updated_at > tombstone.deleted_at) {
              await this.pb!.collection(PB_TOMBSTONES).delete(tombstone.id);
              tombstoneIds.delete(local.id);
              restoredAfterDelete = true;
            }
          } catch { /* tombstone lookup failed, treat as genuine delete */ }

          if (!restoredAfterDelete) {
            await db.execute(
              `UPDATE ${table} SET deleted = 1, updated_at = ? WHERE id = ?`,
              [new Date().toISOString(), local.id]
            );
            deleted++;
            continue;
          }
        }

        // Alive locally, no tombstone → push/update to PB
        const data = JSON.stringify(local);
        const encryptedData = await encrypt(data, this.syncKey);

        if (!existingRemote) {
          try {
            const created = await this.pb!.collection(pbCollection).create({
              local_id: local.id,
              data: encryptedData,
              created_at: local.created_at,
              updated_at: local.updated_at,
            });
            remoteByLocalId.set(local.id, created as unknown as PbRecord);
            pushed++;
          } catch (err: unknown) {
            const e = err as { response?: unknown; data?: unknown; message?: string };
            const detail = JSON.stringify(e?.response || e?.data || e?.message || err);
            this.log(`[ERR] ${table}: push failed for ${local.id.substring(0, 8)}... ${detail}`);
          }
        } else {
          try {
            const decryptedRemote = await decrypt(existingRemote.data, this.syncKey);
            const remoteRecord = JSON.parse(decryptedRemote);
            const remoteUpdatedAt = remoteRecord.updated_at || remoteRecord.updatedAt;
            if (local.updated_at > remoteUpdatedAt) {
              await this.pb!.collection(pbCollection).update(existingRemote.id, {
                data: encryptedData,
                created_at: local.created_at,
                updated_at: local.updated_at,
              });
              pushed++;
            }
          } catch {
            // Can't decrypt remote → overwrite with local
            await this.pb!.collection(pbCollection).update(existingRemote.id, {
              data: encryptedData,
              created_at: local.created_at,
              updated_at: local.updated_at,
            });
            pushed++;
          }
        }
      }

      this.log(`[OK] ${table}: ${remoteRecords.length} remote, ${localRows.length} local, ${pulled} pulled, ${pushed} pushed, ${deleted} deleted`);
    } catch (error) {
      this.log(`[ERR] ${table}: ${String(error)}`);
    }
  }

  private async insertLocal(table: LocalTable, record: LocalRow): Promise<void> {
    const db = await getDb();

    switch (table) {
      case 'tasks':
        await db.execute(
          'INSERT OR IGNORE INTO tasks (id, project_id, title, content, type, status, release_id, assignee_id, feature_id, priority, tags, created_at, updated_at, deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [record.id, record.project_id || '', record.title, record.content, record.type, record.status, record.release_id, record.assignee_id, record.feature_id, record.priority || 'low', record.tags, record.created_at, record.updated_at, record.deleted || 0]
        );
        break;
      case 'releases':
        await db.execute(
          'INSERT OR IGNORE INTO releases (id, project_id, name, description, created_at, updated_at, deleted) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [record.id, record.project_id || '', record.name, record.description, record.created_at, record.updated_at, record.deleted || 0]
        );
        break;
      case 'users':
        await db.execute(
          'INSERT OR IGNORE INTO users (id, project_id, name, color, created_at, updated_at, deleted) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [record.id, record.project_id || '', record.name, record.color, record.created_at, record.updated_at, record.deleted || 0]
        );
        break;
      case 'notes':
        await db.execute(
          'INSERT OR IGNORE INTO notes (id, project_id, title, content, tags, parent_id, created_at, updated_at, deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [record.id, record.project_id || '', record.title, record.content, record.tags, record.parent_id, record.created_at, record.updated_at, record.deleted || 0]
        );
        break;
      case 'scratchpads':
        await db.execute(
          'INSERT OR IGNORE INTO scratchpads (id, project_id, title, content, created_at, updated_at, deleted) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [record.id, record.project_id || '', record.title, record.content, record.created_at, record.updated_at, record.deleted || 0]
        );
        break;
    }
  }

  private async updateLocal(table: LocalTable, record: LocalRow): Promise<void> {
    const db = await getDb();

    switch (table) {
      case 'tasks':
        await db.execute(
          'UPDATE tasks SET title = ?, content = ?, type = ?, status = ?, release_id = ?, assignee_id = ?, feature_id = ?, priority = ?, tags = ?, updated_at = ?, deleted = ? WHERE id = ?',
          [record.title, record.content, record.type, record.status, record.release_id, record.assignee_id, record.feature_id, record.priority || 'low', record.tags, record.updated_at, record.deleted || 0, record.id]
        );
        break;
      case 'releases':
        await db.execute(
          'UPDATE releases SET name = ?, description = ?, updated_at = ?, deleted = ? WHERE id = ?',
          [record.name, record.description, record.updated_at, record.deleted || 0, record.id]
        );
        break;
      case 'users':
        await db.execute(
          'UPDATE users SET name = ?, color = ?, updated_at = ?, deleted = ? WHERE id = ?',
          [record.name, record.color, record.updated_at, record.deleted || 0, record.id]
        );
        break;
      case 'notes':
        await db.execute(
          'UPDATE notes SET title = ?, content = ?, tags = ?, parent_id = ?, updated_at = ?, deleted = ? WHERE id = ?',
          [record.title, record.content, record.tags, record.parent_id, record.updated_at, record.deleted || 0, record.id]
        );
        break;
      case 'scratchpads':
        await db.execute(
          'UPDATE scratchpads SET title = ?, content = ?, updated_at = ?, deleted = ? WHERE id = ?',
          [record.title, record.content, record.updated_at, record.deleted || 0, record.id]
        );
        break;
    }
  }

  private async subscribe(): Promise<void> {
    if (!this.pb || !this.syncKey) return;

    const tables: LocalTable[] = ['tasks', 'releases', 'users', 'notes', 'scratchpads'];

    for (const table of tables) {
      const pbCollection = PB_COLLECTIONS[table];
      try {
        await this.pb.collection(pbCollection).subscribe('*', async (e) => {
          if (!this.syncKey) return;
          this.log(`[RT] ${table}: ${e.action} ${e.record.local_id || e.record.id}`);

          try {
            if (e.action === 'create' || e.action === 'update') {
              const decryptedData = await decrypt(e.record.data, this.syncKey);
              const record = JSON.parse(decryptedData);
              record.deleted = 0; // exists in PB = alive
              const localId = e.record.local_id;

              const db = await getDb();
              const existing = await db.select<{ updated_at: string }[]>(
                `SELECT updated_at FROM ${table} WHERE id = ?`,
                [localId]
              );

              if (existing.length === 0) {
                await this.insertLocal(table, record);
                this.log(`[RT] ${table}: inserted ${localId}`);
              } else {
                await this.updateLocal(table, record);
                this.log(`[RT] ${table}: updated ${localId}`);
              }

              window.dispatchEvent(new Event('dragonfly-sync'));
            } else if (e.action === 'delete') {
              // Record deleted from PB → soft-delete locally
              const localId = e.record.local_id;
              if (localId) {
                const db = await getDb();
                await db.execute(
                  `UPDATE ${table} SET deleted = 1, updated_at = ? WHERE id = ?`,
                  [new Date().toISOString(), localId]
                );
                window.dispatchEvent(new Event('dragonfly-sync'));
                this.log(`[RT] ${table}: deleted ${localId}`);
              }
            }
          } catch (err) {
            this.log(`[RT] ${table}: decrypt/apply failed: ${String(err)}`);
          }
        });

        this.unsubscribes.push(() => {
          this.pb?.collection(pbCollection).unsubscribe('*');
        });
      } catch (error) {
        logToService('ERR', `sync: Subscribe failed for ${table}: ${String(error)}`);
      }
    }
  }

  // Sync current project metadata to/from df_projects
  private async syncProjectMetadata(): Promise<void> {
    if (!this.pb || !this.syncKey || !this.projectId) return;
    const db = await getDb();

    try {
      // Get current project from local DB
      const localRows = await db.select<LocalRow[]>(
        'SELECT * FROM projects WHERE id = ? AND deleted = 0',
        [this.projectId]
      );
      if (localRows.length === 0) return;
      const local = localRows[0];
      const isShared = local.shared !== undefined ? !!local.shared : true;
      const identityHash = await getConfig('pb_identity_user_id');

      // Check if project already exists on remote
      const existing = await this.findRemoteByLocalId(PB_PROJECTS, this.projectId);

      // If not shared AND no personal identity → old behavior: remove from PB entirely
      if (!isShared && !identityHash) {
        if (existing) {
          try {
            await this.pb!.collection(PB_PROJECTS).delete(existing.id);
            this.log('[OK] project: removed from remote (not shared, no identity)');
          } catch (err: unknown) {
            logToService('WARN', 'sync: delete project from PB failed: ' + String(err));
          }
        }
        return;
      }

      // If not shared but HAS identity → keep on PB with owner_id (private, only owner can find)
      // If shared → keep on PB (discoverable by all)
      const ownerIdValue = identityHash || '';

      const projectData = {
        id: local.id,
        name: local.name,
        description: local.description || '',
        color: local.color || '#0077B6',
        updated_at: local.updated_at,
        created_at: local.created_at,
      };

      if (existing) {
        // Compare timestamps to decide direction
        try {
          const decryptedRemote = await decrypt(existing.data, this.syncKey);
          const remoteProject = JSON.parse(decryptedRemote);
          const remoteUpdatedAt = remoteProject.updated_at || '';

          if (remoteUpdatedAt > local.updated_at) {
            // Remote is newer → update local project metadata
            await db.execute(
              'UPDATE projects SET name = ?, description = ?, color = ?, updated_at = ? WHERE id = ?',
              [remoteProject.name, remoteProject.description || '', remoteProject.color || '#0077B6', remoteProject.updated_at, this.projectId]
            );
            this.log('[OK] project: pulled metadata update');
          } else if (local.updated_at > remoteUpdatedAt || (existing.owner_id as string | undefined) !== ownerIdValue) {
            // Local is newer OR owner_id changed → push
            const encryptedData = await encrypt(JSON.stringify(projectData), this.syncKey);
            await this.pb!.collection(PB_PROJECTS).update(existing.id, {
              data: encryptedData,
              owner_id: ownerIdValue,
              created_at: local.created_at,
              updated_at: local.updated_at,
            });
            this.log('[OK] project: pushed metadata update');
          }
        } catch {
          // Can't decrypt → overwrite with local
          const encryptedData = await encrypt(JSON.stringify(projectData), this.syncKey);
          await this.pb!.collection(PB_PROJECTS).update(existing.id, {
            data: encryptedData,
            owner_id: ownerIdValue,
            created_at: local.created_at,
            updated_at: local.updated_at,
          });
        }
      } else {
        // New → push to remote
        const encryptedData = await encrypt(JSON.stringify(projectData), this.syncKey);
        await this.pb!.collection(PB_PROJECTS).create({
          local_id: this.projectId,
          data: encryptedData,
          owner_id: ownerIdValue,
          created_at: local.created_at,
          updated_at: local.updated_at,
        });
        this.log('[OK] project: pushed metadata');
      }
    } catch (error) {
      this.log(`[ERR] project metadata: ${String(error)}`);
    }
  }

  // Register a new personal account on the PocketBase server
  async registerIdentity(email: string, password: string): Promise<string> {
    if (!this.pb) throw new Error('Not connected');
    const pb = new PocketBase(this.url);
    try {
      const user = await pb.collection('users').create({ email, password, passwordConfirm: password });
      return user.id as string;
    } catch (err: unknown) {
      const pbErr = err as { response?: { data?: Record<string, { message?: string }> }; status?: number; message?: string };
      if (pbErr?.response?.data) {
        const fieldErrors = Object.entries(pbErr.response.data)
          .map(([field, e]) => `${field}: ${e?.message ?? ''}`)
          .join(', ');
        throw new Error(fieldErrors || pbErr.message || String(err));
      }
      throw new Error(pbErr?.message || String(err));
    } finally {
      pb.authStore.clear();
    }
  }

  // Login with an existing personal account — returns the stable PB user ID
  async loginIdentity(email: string, password: string): Promise<string> {
    if (!this.pb) throw new Error('Not connected');
    const pb = new PocketBase(this.url);
    try {
      const auth = await pb.collection('users').authWithPassword(email, password);
      return auth.record.id as string;
    } catch (err: unknown) {
      const pbErr = err as { status?: number; message?: string };
      if (pbErr?.status === 400) throw new Error('Invalid email or password.');
      throw new Error(pbErr?.message || String(err));
    } finally {
      pb.authStore.clear();
    }
  }

  // Returns true if the current connected project already has an owner_id set on the server.
  // Used to decide whether to offer Register (no owner) or only Login (owner exists).
  async getRemoteProjectHasOwner(): Promise<boolean> {
    if (!this.pb || !this.projectId) return false;
    try {
      const existing = await this.findRemoteByLocalId(PB_PROJECTS, this.projectId);
      return !!(existing && (existing.owner_id as string));
    } catch {
      return false;
    }
  }

  // Fetch all remote projects (for Join flow) without modifying local state
  async fetchRemoteProjects(url: string, spaceKey: string, ownerHash?: string): Promise<{ id: string; name: string; description: string; color: string; isPrivate: boolean }[]> {
    const pb = new PocketBase(url);
    const syncKey = await deriveSyncKey(spaceKey, url);

    await pb.collection('users').authWithPassword(SYNC_USER_EMAIL, spaceKey);

    try {
      const remoteRecords = await pb.collection(PB_PROJECTS).getFullList();
      const projects: { id: string; name: string; description: string; color: string; isPrivate: boolean }[] = [];

      let decryptFailed = 0;
      for (const remote of remoteRecords) {
        // Filter: show public (no owner_id) + own (owner_id matches)
        const remoteOwnerId = (remote.owner_id as string) || '';
        if (remoteOwnerId !== '' && remoteOwnerId !== ownerHash) continue;

        try {
          const decryptedData = await decrypt(remote.data, syncKey);
          const record = JSON.parse(decryptedData);
          projects.push({
            id: record.id,
            name: record.name || 'Unnamed',
            description: record.description || '',
            color: record.color || '#0077B6',
            isPrivate: remoteOwnerId !== '',
          });
        } catch {
          decryptFailed++;
        }
      }

      // Records exist but none could be decrypted = wrong space key
      if (projects.length === 0 && decryptFailed > 0) {
        throw new Error(`${decryptFailed} project(s) found but could not be decrypted. Check your Space Key.`);
      }

      return projects;
    } finally {
      pb.authStore.clear();
    }
  }

  // Delete a project from PB: remove project record, create tombstone, clean up all remote data
  async deleteProjectRemote(projectId: string): Promise<void> {
    if (!this.pb || !this.syncKey) return;
    await this.ensureAuth();

    try {
      // Delete project record from df_projects
      const projectRemote = await this.findRemoteByLocalId(PB_PROJECTS, projectId);
      if (projectRemote) {
        await this.pb.collection(PB_PROJECTS).delete(projectRemote.id);
        this.log('[OK] Deleted project from remote');
      }

      // Create a single tombstone for the project
      try {
        await this.pb.collection(PB_TOMBSTONES).create({
          local_id: projectId,
          table_name: 'projects',
          deleted_at: new Date().toISOString(),
        });
        this.log('[OK] Created project tombstone');
      } catch { /* tombstone may already exist */ }

      // Clean up all data records for this project from PB
      const tables: LocalTable[] = ['tasks', 'releases', 'users', 'notes', 'scratchpads'];
      for (const table of tables) {
        const pbCollection = PB_COLLECTIONS[table];
        try {
          const remoteRecords = await this.pb.collection(pbCollection).getFullList();
          for (const remote of remoteRecords) {
            try {
              const decryptedData = await decrypt(remote.data, this.syncKey!);
              const record = JSON.parse(decryptedData);
              if (record.project_id === projectId) {
                await this.pb!.collection(pbCollection).delete(remote.id);
              }
            } catch { /* can't decrypt = wrong key, skip */ }
          }
        } catch (err) {
          this.log(`[ERR] Cleanup ${table}: ${String(err)}`);
        }
      }
      this.log('[OK] Remote project data cleaned up');
    } catch (error) {
      this.log(`[ERR] deleteProjectRemote: ${String(error)}`);
    }
  }

  // record is typed as LocalRow but callers may pass typed row interfaces (NoteRow, etc.)
  // which don't have an index signature — they are assignable via the structural subtype
  // as long as the required fields are present.
  private async _doPush(table: LocalTable, record: { id: string; deleted?: number; updated_at?: string; created_at?: string; [key: string]: unknown }): Promise<void> {
    const pbCollection = PB_COLLECTIONS[table];
    const existing = await this.findRemoteByLocalId(pbCollection, record.id);

    if (record.deleted) {
      if (existing) {
        await this.pb!.collection(pbCollection).delete(existing.id);
      }
      try {
        await this.pb!.collection(PB_TOMBSTONES).create({
          local_id: record.id,
          table_name: table,
          deleted_at: new Date().toISOString(),
        });
      } catch { /* tombstone may already exist */ }
      return;
    }

    try {
      const tombstone = await this.pb!.collection(PB_TOMBSTONES).getFirstListItem(
        `local_id="${record.id}" && table_name="${table}"`
      );
      await this.pb!.collection(PB_TOMBSTONES).delete(tombstone.id);
    } catch { /* no tombstone exists */ }

    const data = JSON.stringify(record);
    const encryptedData = await encrypt(data, this.syncKey!);

    if (existing) {
      await this.pb!.collection(pbCollection).update(existing.id, {
        data: encryptedData,
        created_at: record.created_at,
        updated_at: record.updated_at,
      });
    } else {
      await this.pb!.collection(pbCollection).create({
        local_id: record.id,
        data: encryptedData,
        created_at: record.created_at,
        updated_at: record.updated_at,
      });
    }
  }

  async pushChanges(table: LocalTable, record: { id: string; deleted?: number; updated_at?: string; created_at?: string; [key: string]: unknown }): Promise<void> {
    if (!this.pb || !this.syncKey) return;
    await this.ensureAuth();
    try {
      await this._doPush(table, record);
    } catch (error) {
      logToService('ERR', `sync: Push failed for ${table}/${record.id}: ${String(error)}`);
      this.queueFailedPush(table, record.id);
    }
  }

  // Fetch remote schema version (authenticates as sync user)
  async fetchRemoteSchemaVersion(url: string, spaceKey: string): Promise<number | null> {
    const pb = new PocketBase(url);
    try {
      await pb.collection('users').authWithPassword(SYNC_USER_EMAIL, spaceKey);
    } catch {
      pb.authStore.clear();
      throw new Error('AUTH_FAILED');
    }
    try {
      const record = await pb.collection(PB_META).getFirstListItem('key="schema_version"');
      pb.authStore.clear();
      return parseInt(record.value, 10) || null;
    } catch {
      pb.authStore.clear();
      return null;
    }
  }

  async fetchRemoteSyncSchemaVersion(url: string, spaceKey: string): Promise<number> {
    const pb = new PocketBase(url);
    try {
      await pb.collection('users').authWithPassword(SYNC_USER_EMAIL, spaceKey);
      try {
        const record = await pb.collection(PB_META).getFirstListItem('key="sync_schema_version"');
        return parseInt(record.value as string, 10) || 1;
      } catch {
        return 1; // old server without sync_schema_version = v1
      }
    } catch {
      return 1;
    } finally {
      pb.authStore.clear();
    }
  }

  // Upgrade remote schema (admin auth required)
  async upgradeRemoteSchema(
    url: string,
    adminEmail: string,
    adminPassword: string,
    _spaceKey: string
  ): Promise<string[]> {
    // Run full checkSchema first (creates its own PB instance)
    const report = await this.checkSchema(url, adminEmail, adminPassword);

    // Now create a fresh admin-authenticated PB instance for the meta record
    const pb = new PocketBase(url);
    await this.adminAuth(pb, adminEmail, adminPassword);

    // Update schema_version record (admin auth allows writing to df_meta)
    try {
      const existing = await pb.collection(PB_META).getFirstListItem('key="schema_version"');
      await pb.collection(PB_META).update(existing.id, { value: String(SCHEMA_VERSION) });
    } catch {
      await pb.collection(PB_META).create({ key: 'schema_version', value: String(SCHEMA_VERSION) });
    }

    report.push(`[OK] Remote schema_version set to ${SCHEMA_VERSION}`);
    pb.authStore.clear();
    return report;
  }

  // Upload a single attachment to PocketBase (throws on failure)
  async uploadAttachment(localId: string, file: File, entityType: string, entityId: string): Promise<void> {
    if (!this.pb) return;
    await this.ensureAuth();

    const formData = new FormData();
    formData.append('local_id', localId);
    formData.append('file', file);
    formData.append('entity_type', entityType);
    formData.append('entity_id', entityId);

    const result = await this.pb.collection(PB_ATTACHMENTS).create(formData);
    this.log(`[DBG] attachment created: id=${result.id}, local_id=${result.local_id}, file=${result.file}, collection=${PB_ATTACHMENTS}`);
  }

  // Delete an attachment from PocketBase by local_id
  async deleteAttachment(localId: string): Promise<void> {
    if (!this.pb) return;

    try {
      const remote = await this.findRemoteByLocalId(PB_ATTACHMENTS, localId);
      if (remote) {
        await this.pb.collection(PB_ATTACHMENTS).delete(remote.id);
      }
    } catch {
      // Might not exist on server
    }
  }

  // Pull attachments from PocketBase that we don't have locally
  private async syncAttachments(): Promise<void> {
    if (!this.pb) return;
    await this.ensureAuth();

    try {
      const remoteAttachments = await this.pb.collection(PB_ATTACHMENTS).getFullList() as PbRecord[];
      const db = await getDb();
      const dataDir = await appDataDir();
      const attachmentsDir = await join(dataDir, 'attachments');

      try {
        await mkdir(attachmentsDir, { recursive: true });
      } catch { /* already exists */ }

      let pulled = 0;
      for (const remote of remoteAttachments) {
        const localId = remote.local_id;
        const localRows = await db.select<{ id: string }[]>(
          'SELECT id FROM attachments WHERE id = ?',
          [localId]
        );

        if (localRows.length > 0) continue;

        const fileUrl = this.pb.files.getURL(remote as Parameters<typeof this.pb.files.getURL>[0], remote.file as string);

        try {
          const response = await fetch(fileUrl);
          const arrayBuffer = await response.arrayBuffer();
          const fileName = remote.file as string;
          const localPath = await join(attachmentsDir, fileName);

          await writeFile(localPath, new Uint8Array(arrayBuffer));

          await db.execute(
            'INSERT OR IGNORE INTO attachments (id, file_name, file_path, mime_type, file_size, entity_type, entity_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [localId, fileName, localPath, '', 0, remote.entity_type || '', remote.entity_id || '', remote.created || new Date().toISOString()]
          );
          pulled++;
        } catch (error) {
          this.log(`[ERR] attachment pull ${localId}: ${String(error)}`);
        }
      }

      // Push local attachments that aren't on remote
      const localAttachments = await db.select<{ id: string; file_name: string; file_path: string; mime_type: string; entity_type: string; entity_id: string }[]>('SELECT * FROM attachments');
      const remoteLocalIds = new Set(remoteAttachments.map((r) => r.local_id));
      const toPush = localAttachments.filter((a) => !remoteLocalIds.has(a.id));

      let pushed = 0;
      for (const local of toPush) {
        try {
          const fileExists = await exists(local.file_path);
          if (!fileExists) {
            this.log(`[WARN] attachment file missing: ${local.file_name}`);
            continue;
          }

          // Read file directly via Tauri fs
          const fileData = await readFile(local.file_path);
          const blob = new Blob([fileData], { type: local.mime_type || 'application/octet-stream' });
          const file = new File([blob], local.file_name, { type: local.mime_type || 'application/octet-stream' });

          await this.uploadAttachment(local.id, file, local.entity_type, local.entity_id);
          pushed++;
        } catch (error) {
          this.log(`[ERR] attachment push ${local.file_name}: ${String(error)}`);
        }
      }

      this.log(`[OK] attachments: ${remoteAttachments.length} remote, ${localAttachments.length} local, ${pulled} pulled, ${pushed} pushed`);
    } catch (error) {
      this.log(`[ERR] attachments: ${String(error)}`);
    }
  }

  // ─── Reminder Sync ────────────────────────────────────────────────────────

  async setupReminderServer(url: string, adminEmail: string, adminPassword: string): Promise<void> {
    const pb = new PocketBase(url);
    await this.adminAuth(pb, adminEmail, adminPassword);
    const rules = this.getOpenRules();
    await this.ensureCollection(pb, PB_PERSONAL_TODOS, this.getPersonalTodosFields(), rules);
    await this.ensureCollection(pb, PB_PERSONAL_SETTINGS, this.getPersonalSettingsFields(), rules);
    pb.authStore.clear();
  }

  async checkReminderSchema(url: string, adminEmail: string, adminPassword: string): Promise<string[]> {
    const pb = new PocketBase(url);
    await this.adminAuth(pb, adminEmail, adminPassword);
    const rules = this.getOpenRules();
    const report: string[] = [];
    for (const [name, fields] of [
      [PB_PERSONAL_TODOS, this.getPersonalTodosFields()],
      [PB_PERSONAL_SETTINGS, this.getPersonalSettingsFields()],
    ] as [string, PbField[]][]) {
      try {
        await pb.collections.getOne(name);
        await this.ensureCollection(pb, name, fields, rules);
        report.push(`[OK] ${name}`);
      } catch {
        await this.ensureCollection(pb, name, fields, rules);
        report.push(`[FIX] ${name}: created`);
      }
    }
    pb.authStore.clear();
    return report;
  }

  // Resolve the PocketBase URL + admin creds for reminder sync from the selected project.
  private async getReminderSyncConfig(): Promise<{ url: string; email: string; password: string; secret: string } | null> {
    const [enabled, projectId, secret] = await Promise.all([
      getConfig('reminder_sync_enabled'),
      getConfig('reminder_sync_project_id'),
      getConfig('reminder_sync_secret'),
    ]);
    if (enabled !== '1' || !projectId || !secret) return null;

    const db = await getDb();
    const rows = await db.select<{ sync_url: string; admin_email: string; admin_password: string }[]>(
      'SELECT sync_url, admin_email, admin_password FROM projects WHERE id = ? AND deleted = 0',
      [projectId]
    );
    if (rows.length === 0 || !rows[0].sync_url || !rows[0].admin_email) return null;

    return { url: rows[0].sync_url, email: rows[0].admin_email, password: rows[0].admin_password, secret };
  }

  async syncPersonalTodos(): Promise<void> {
    const cfg = await this.getReminderSyncConfig();
    if (!cfg) return;
    const { url, email, password, secret } = cfg;

    try {
      const pb = new PocketBase(url);
      await this.adminAuth(pb, email, password);
      const encKey = await deriveReminderEncKey(secret);
      const syncId = await hashSecret(secret);

      // Pull
      const remoteRecords = await pb.collection(PB_PERSONAL_TODOS).getFullList({
        filter: `sync_id="${syncId}"`,
      }) as PbRecord[];
      const db = await getDb();

      for (const remote of remoteRecords) {
        try {
          const decrypted = await decrypt(remote.data, encKey);
          const r = JSON.parse(decrypted);
          const existing = await db.select<{ updated_at: string }[]>(
            'SELECT updated_at FROM personal_todos WHERE id = ?', [r.id]
          );
          if (existing.length === 0) {
            await db.execute(
              `INSERT OR REPLACE INTO personal_todos
                (id, title, notes, status, due_date, all_day, recurrence_type, recurrence_interval,
                 recurrence_days, recurrence_end, next_occurrence, alert_minutes, notify_email,
                 priority, tags, completed_at, created_at, updated_at, deleted)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
              [r.id, r.title ?? '', r.notes ?? '', r.status ?? 'pending', r.due_date ?? null,
               r.all_day ?? 0, r.recurrence_type ?? 'none', r.recurrence_interval ?? 1,
               r.recurrence_days ?? '[]', r.recurrence_end ?? null, r.next_occurrence ?? null,
               r.alert_minutes ?? -1, r.notify_email ?? 0, r.priority ?? 'medium',
               r.tags ?? '[]', r.completed_at ?? null, r.created_at, r.updated_at, r.deleted ?? 0]
            );
          } else if ((remote.updated_at as string) > existing[0].updated_at) {
            await db.execute(
              `UPDATE personal_todos SET
                title=?, notes=?, status=?, due_date=?, all_day=?, recurrence_type=?,
                recurrence_interval=?, recurrence_days=?, recurrence_end=?, next_occurrence=?,
                alert_minutes=?, notify_email=?, priority=?, tags=?, completed_at=?,
                updated_at=?, deleted=?
               WHERE id=?`,
              [r.title ?? '', r.notes ?? '', r.status ?? 'pending', r.due_date ?? null,
               r.all_day ?? 0, r.recurrence_type ?? 'none', r.recurrence_interval ?? 1,
               r.recurrence_days ?? '[]', r.recurrence_end ?? null, r.next_occurrence ?? null,
               r.alert_minutes ?? -1, r.notify_email ?? 0, r.priority ?? 'medium',
               r.tags ?? '[]', r.completed_at ?? null, r.updated_at, r.deleted ?? 0, r.id]
            );
          }
        } catch (e) {
          this.log(`[ERR] reminder pull ${remote.local_id}: ${String(e)}`);
        }
      }

      // Push (only active records — deleted ones are removed from PB via deleteReminderFromPb)
      const localRecords = await db.select<LocalRow[]>('SELECT * FROM personal_todos WHERE deleted = 0');
      const remoteByLocalId = new Map((remoteRecords as PbRecord[]).map((r) => [r.local_id, r]));

      for (const local of localRecords) {
        try {
          const encrypted = await encrypt(JSON.stringify(local), encKey);
          const remote = remoteByLocalId.get(local.id);
          if (remote) {
            if (local.updated_at > (remote.updated_at as string)) {
              await pb.collection(PB_PERSONAL_TODOS).update(remote.id, {
                data: encrypted,
                updated_at: local.updated_at,
              });
            }
          } else {
            await pb.collection(PB_PERSONAL_TODOS).create({
              sync_id: syncId,
              local_id: local.id,
              data: encrypted,
              updated_at: local.updated_at,
            });
          }
        } catch (e) {
          this.log(`[ERR] reminder push ${local.id}: ${String(e)}`);
        }
      }

      this.log(`[OK] reminder sync: ${remoteRecords.length} remote, ${localRecords.length} local`);
      window.dispatchEvent(new Event('dragonfly-reminders-sync'));
      pb.authStore.clear();
    } catch (e) {
      this.log(`[ERR] reminder sync: ${String(e)}`);
    }
  }

  async deleteReminderFromPb(id: string): Promise<void> {
    const cfg = await this.getReminderSyncConfig();
    if (!cfg) return;
    const { url, email, password, secret } = cfg;

    try {
      const pb = new PocketBase(url);
      await this.adminAuth(pb, email, password);
      const syncId = await hashSecret(secret);

      try {
        const remote = await pb.collection(PB_PERSONAL_TODOS).getFirstListItem(
          `sync_id="${syncId}" && local_id="${id}"`
        );
        await pb.collection(PB_PERSONAL_TODOS).delete(remote.id);
      } catch { /* not in PB, nothing to do */ }

      pb.authStore.clear();
    } catch (e) {
      this.log(`[ERR] deleteReminderFromPb ${id}: ${String(e)}`);
    }
  }

  async pushReminder(id: string): Promise<void> {
    const cfg = await this.getReminderSyncConfig();
    if (!cfg) return;
    const { url, email, password, secret } = cfg;

    try {
      const db = await getDb();
      const rows = await db.select<LocalRow[]>('SELECT * FROM personal_todos WHERE id = ?', [id]);
      if (rows.length === 0) return;
      const local = rows[0];

      const pb = new PocketBase(url);
      await this.adminAuth(pb, email, password);
      const encKey = await deriveReminderEncKey(secret);
      const syncId = await hashSecret(secret);
      const encrypted = await encrypt(JSON.stringify(local), encKey);

      let remote: PbRecord | null = null;
      try {
        remote = await pb.collection(PB_PERSONAL_TODOS).getFirstListItem(
          `sync_id="${syncId}" && local_id="${local.id}"`
        ) as PbRecord;
      } catch { /* not found */ }

      if (remote) {
        await pb.collection(PB_PERSONAL_TODOS).update(remote.id, {
          data: encrypted,
          updated_at: local.updated_at,
        });
      } else {
        await pb.collection(PB_PERSONAL_TODOS).create({
          sync_id: syncId,
          local_id: local.id,
          data: encrypted,
          updated_at: local.updated_at,
        });
      }
      pb.authStore.clear();
    } catch (e) {
      this.log(`[ERR] pushReminder ${id}: ${String(e)}`);
    }
  }

  async syncPersonalSettings(): Promise<void> {
    const [cfg, syncSmtp] = await Promise.all([
      this.getReminderSyncConfig(),
      getConfig('reminder_sync_smtp'),
    ]);
    if (!cfg) return;
    if (syncSmtp !== '1') return; // user opted out (default off)
    const { url, email, password, secret } = cfg;

    try {
      const pb = new PocketBase(url);
      await this.adminAuth(pb, email, password);
      const encKey = await deriveReminderEncKey(secret);
      const syncId = await hashSecret(secret);

      const [host, port, sec, user, pass, fromEmail, fromName, emailTo, localUpdatedAt] = await Promise.all([
        getConfig('smtp_host'), getConfig('smtp_port'), getConfig('smtp_secure'),
        getConfig('smtp_username'), getConfig('smtp_password'),
        getConfig('smtp_from_email'), getConfig('smtp_from_name'),
        getConfig('notification_email_to'), getConfig('reminder_settings_updated_at'),
      ]);
      const localTs = localUpdatedAt || '1970-01-01T00:00:00.000Z';
      const settings = {
        smtp_host: host, smtp_port: port, smtp_secure: sec,
        smtp_username: user, smtp_password: pass,
        smtp_from_email: fromEmail, smtp_from_name: fromName,
        notification_email_to: emailTo,
      };

      let remote: PbRecord | null = null;
      try {
        remote = await pb.collection(PB_PERSONAL_SETTINGS).getFirstListItem(`sync_id="${syncId}"`) as PbRecord;
      } catch { /* not found */ }

      if (remote && remote.updated_at > localTs) {
        // Pull: remote is newer
        const decrypted = await decrypt(remote.data, encKey);
        const remoteSettings = JSON.parse(decrypted) as Record<string, string>;
        await Promise.all(
          Object.entries(remoteSettings)
            .filter(([, v]) => v != null)
            .map(([k, v]) => setConfig(k as AppConfigKey, v))
        );
        await setConfig('reminder_settings_updated_at', remote.updated_at);
        window.dispatchEvent(new Event('reminder-settings-synced'));
        this.log('[OK] reminder settings: pulled from remote');
      } else {
        // Push: local is newer or no remote
        const now = new Date().toISOString();
        const encrypted = await encrypt(JSON.stringify(settings), encKey);
        if (remote) {
          await pb.collection(PB_PERSONAL_SETTINGS).update(remote.id, { data: encrypted, updated_at: now });
        } else {
          await pb.collection(PB_PERSONAL_SETTINGS).create({ sync_id: syncId, data: encrypted, updated_at: now });
        }
        await setConfig('reminder_settings_updated_at', now);
        this.log('[OK] reminder settings: pushed to remote');
      }
      pb.authStore.clear();
    } catch (e) {
      this.log(`[ERR] syncPersonalSettings: ${String(e)}`);
    }
  }
}

export const syncService = new SyncService();
