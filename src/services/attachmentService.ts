import { mkdir, writeFile, remove, BaseDirectory } from '@tauri-apps/plugin-fs';
import { extractAttachmentIds } from '@/lib/content';
import { join, appDataDir } from '@tauri-apps/api/path';
import { convertFileSrc } from '@tauri-apps/api/core';
import { getDb } from './database';
import { syncService } from './syncService';
import { log } from './logService';

const generateId = () => crypto.randomUUID();

function getExtension(fileName: string): string {
  const parts = fileName.split('.');
  return parts.length > 1 ? parts.pop()! : 'bin';
}

export async function saveAttachment(
  file: File,
  entityType: string,
  entityId: string
): Promise<string> {
  const id = generateId();
  const ext = getExtension(file.name);
  const storedName = `${id}.${ext}`;
  const now = new Date().toISOString();

  try {
    await mkdir('attachments', { baseDir: BaseDirectory.AppData, recursive: true });
  } catch {
    // Directory might already exist
  }

  // Write file to disk + save metadata
  let absolutePath: string;
  try {
    const relativePath = `attachments/${storedName}`;
    const arrayBuffer = await file.arrayBuffer();
    await writeFile(relativePath, new Uint8Array(arrayBuffer), {
      baseDir: BaseDirectory.AppData,
    });

    const dataDir = await appDataDir();
    absolutePath = await join(dataDir, 'attachments', storedName);

    const db = await getDb();
    await db.execute(
      'INSERT INTO attachments (id, file_name, file_path, mime_type, file_size, entity_type, entity_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, file.name, absolutePath, file.type, file.size, entityType, entityId, now]
    );
  } catch (err) {
    log('ERR', 'attachmentService.saveAttachment: ' + String(err));
    throw err;
  }

  // Upload to PocketBase if connected
  if (syncService.isConnected) {
    try {
      await syncService.uploadAttachment(id, file, entityType, entityId);
    } catch (error) {
      log('ERR', 'attachmentService: Failed to sync attachment: ' + String(error));
    }
  }

  return convertFileSrc(absolutePath);
}

// Delete a single attachment (local file + DB + PocketBase)
export async function deleteAttachment(id: string): Promise<void> {
  try {
    const db = await getDb();

    // Get file path before deleting from DB
    const rows = await db.select<{ file_path: string }[]>(
      'SELECT file_path FROM attachments WHERE id = ?',
      [id]
    );

    if (rows.length === 0) return;

    const filePath = rows[0].file_path;

    // Delete local file
    try {
      await remove(filePath);
    } catch {
      // File might not exist
    }

    // Delete from DB
    await db.execute('DELETE FROM attachments WHERE id = ?', [id]);

    // Delete from PocketBase
    if (syncService.isConnected) {
      try {
        await syncService.deleteAttachment(id);
      } catch (error) {
        log('ERR', 'attachmentService: Failed to delete remote attachment: ' + String(error));
      }
    }
  } catch (err) {
    log('ERR', 'attachmentService.deleteAttachment: ' + String(err));
  }
}

// Delete all attachments for a given entity (e.g. when deleting a note/task)
export async function deleteAttachmentsForEntity(entityType: string, entityId: string): Promise<void> {
  const db = await getDb();
  const rows = await db.select<{ id: string }[]>(
    'SELECT id FROM attachments WHERE entity_type = ? AND entity_id = ?',
    [entityType, entityId]
  );

  for (const row of rows) {
    await deleteAttachment(row.id);
  }
}


// Clean up orphaned attachments: delete any attachment for this entity
// that is no longer referenced in the content
export async function cleanupOrphanedAttachments(
  entityType: string,
  entityId: string,
  currentContent: string
): Promise<void> {
  const db = await getDb();

  // Get all attachments for this entity
  const rows = await db.select<{ id: string }[]>(
    'SELECT id FROM attachments WHERE entity_type = ? AND entity_id = ?',
    [entityType, entityId]
  );

  if (rows.length === 0) return;

  // Extract IDs still referenced in content
  const referencedIds = extractAttachmentIds(currentContent);

  // Delete any that are no longer referenced
  for (const row of rows) {
    if (!referencedIds.has(row.id)) {
      await deleteAttachment(row.id);
    }
  }
}

// BlockNote uploadFile handler factory
export function createUploadHandler(entityType: string, entityId: string) {
  return async (file: File): Promise<string> => {
    return saveAttachment(file, entityType, entityId);
  };
}

// Tauri asset URL pattern — matches UUID-named files on all platforms:
// Windows: http://asset.localhost/{url-encoded-path}/{uuid}.{ext}
// macOS:   asset://localhost/{path}/{uuid}.{ext}
const UUID_PATTERN = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const ASSET_UUID_RE = new RegExp(
  `(?:https?:\\/\\/asset\\.localhost|asset:\\/\\/localhost)\\/[^"']*?(${UUID_PATTERN})\\.([a-zA-Z0-9]+)`,
  'g'
);
const PORTABLE_RE = new RegExp(
  `dragonfly-attachment:\\/\\/(${UUID_PATTERN})\\.([a-zA-Z0-9]+)`,
  'g'
);

// Normalize machine-specific asset URLs to portable dragonfly-attachment:// format.
// Call this before writing content to the DB or pushing to PocketBase.
export function normalizeAttachmentUrls(content: string): string {
  if (!content) return content;
  return content.replace(new RegExp(ASSET_UUID_RE.source, 'g'), 'dragonfly-attachment://$1.$2');
}

// Resolve portable dragonfly-attachment:// URLs (and legacy foreign-machine asset URLs)
// to the local machine's actual asset:// URLs. Call this after loading content from the DB.
export async function resolveAttachmentUrls(content: string): Promise<string> {
  if (!content) return content;
  const hasPortable = content.includes('dragonfly-attachment://');
  const hasLegacy = content.includes('asset.localhost') || content.includes('asset://localhost');
  if (!hasPortable && !hasLegacy) return content;

  // Collect all unique UUIDs from both formats
  const uuids = new Set<string>();
  for (const m of content.matchAll(new RegExp(PORTABLE_RE.source, 'g'))) uuids.add(m[1]);
  for (const m of content.matchAll(new RegExp(ASSET_UUID_RE.source, 'g'))) uuids.add(m[1]);

  if (uuids.size === 0) return content;

  const db = await getDb();
  const uuidList = [...uuids];
  const placeholders = uuidList.map(() => '?').join(',');
  const rows = await db.select<{ id: string; file_path: string }[]>(
    `SELECT id, file_path FROM attachments WHERE id IN (${placeholders})`,
    uuidList
  );
  const lookup = new Map(rows.map((r) => [r.id, convertFileSrc(r.file_path)]));

  let result = content.replace(
    new RegExp(PORTABLE_RE.source, 'g'),
    (match, uuid) => lookup.get(uuid) ?? match
  );
  result = result.replace(
    new RegExp(ASSET_UUID_RE.source, 'g'),
    (match, uuid) => lookup.get(uuid) ?? match
  );
  return result;
}
