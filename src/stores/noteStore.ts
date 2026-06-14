import { create } from 'zustand';
import { Note } from '../types';
import type { NoteRow } from '../types/db';
import { getDb } from '../services/database';
import { cleanupOrphanedAttachments, deleteAttachmentsForEntity, normalizeAttachmentUrls, resolveAttachmentUrls } from '../services/attachmentService';
import { syncService } from '../services/syncService';
import { useProjectStore } from './projectStore';
import { log } from '../services/logService';
import { optimisticUpdate } from './storeUtils';

function safeParseJsonArray(raw: string | null | undefined): string[] {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    log('WARN', `noteStore.safeParseJsonArray: JSON.parse failed for tags: ${(raw || '').substring(0, 100)}`);
    return [];
  }
}

function getProjectId(): string {
  const id = useProjectStore.getState().currentProjectId;
  if (!id) throw new Error('No active project');
  return id;
}

// Push a note record to PocketBase (fire-and-forget)
async function pushNote(id: string) {
  try {
    const db = await getDb();
    const rows = await db.select<NoteRow[]>('SELECT * FROM notes WHERE id = ?', [id]);
    if (rows.length > 0) {
      syncService.pushChanges('notes', rows[0] as unknown as Parameters<typeof syncService.pushChanges>[1]).catch((err) => {
        log('WARN', `sync.pushNote ${id} failed: ${String(err)}`);
      });
    }
  } catch (err) {
    log('WARN', `sync.pushNote ${id} read failed: ${String(err)}`);
  }
}

interface NoteStore {
  notes: Note[];
  isLoading: boolean;

  loadNotes: () => Promise<void>;
  addNote: (note: Omit<Note, 'id' | 'projectId' | 'favorite' | 'createdAt' | 'updatedAt'>) => Promise<Note>;
  updateNote: (id: string, updates: Partial<Note>) => Promise<void>;
  deleteNote: (id: string, deleteChildren?: boolean) => Promise<void>;
  moveNote: (id: string, newParentId: string | null) => Promise<void>;
  toggleFavorite: (id: string) => Promise<void>;

  getDeletedNotes: () => Promise<Note[]>;
  restoreNote: (id: string) => Promise<void>;
  permanentlyDeleteNote: (id: string) => Promise<void>;
  permanentlyDeleteAll: () => Promise<void>;

  getRootNotes: () => Note[];
  getChildren: (parentId: string) => Note[];
  getAllTags: () => string[];
}

const generateId = () => crypto.randomUUID();
const getTimestamp = () => new Date().toISOString();

function rowToNote(row: NoteRow): Note {
  return {
    id: row.id,
    projectId: row.project_id || '',
    title: row.title || '',
    content: row.content || '',
    tags: safeParseJsonArray(row.tags),
    parentId: row.parent_id || null,
    favorite: !!row.favorite,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const useNoteStore = create<NoteStore>((set, get) => ({
  notes: [],
  isLoading: false,

  loadNotes: async () => {
    set({ isLoading: true });
    try {
      const db = await getDb();
      const rows = await db.select<NoteRow[]>('SELECT * FROM notes WHERE deleted = 0 AND project_id = ?', [getProjectId()]);
      const notes = await Promise.all(rows.map(async (row) => {
        const note = rowToNote(row);
        note.content = await resolveAttachmentUrls(note.content);
        return note;
      }));
      set({ notes, isLoading: false });
    } catch (err) {
      log('ERR', 'noteStore.loadNotes: ' + String(err));
      set({ isLoading: false });
    }
  },

  addNote: async (noteData) => {
    const now = getTimestamp();
    const id = generateId();
    const projectId = getProjectId();
    const note: Note = {
      ...noteData,
      id,
      projectId,
      favorite: false,
      createdAt: now,
      updatedAt: now,
    };

    await optimisticUpdate({
      get, set,
      keys: ['notes'],
      update: () => set({ notes: [...get().notes, note] }),
      db: async () => {
        const db = await getDb();
        await db.execute(
          'INSERT INTO notes (id, project_id, title, content, tags, parent_id, favorite, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [id, projectId, note.title, normalizeAttachmentUrls(note.content), JSON.stringify(note.tags), note.parentId, 0, now, now]
        );
        pushNote(id);
      },
      onError: (err) => log('ERR', 'noteStore.addNote: ' + String(err)),
    });

    return note;
  },

  updateNote: async (id, updates) => {
    const now = getTimestamp();
    const newNotes = get().notes.map((n) =>
      n.id === id ? { ...n, ...updates, updatedAt: now } : n
    );
    const updated = newNotes.find((n) => n.id === id);
    if (!updated) return;

    await optimisticUpdate({
      get, set,
      keys: ['notes'],
      update: () => set({ notes: newNotes }),
      db: async () => {
        const db = await getDb();
        await db.execute(
          'UPDATE notes SET title = ?, content = ?, tags = ?, parent_id = ?, favorite = ?, updated_at = ? WHERE id = ?',
          [updated.title, normalizeAttachmentUrls(updated.content), JSON.stringify(updated.tags), updated.parentId, updated.favorite ? 1 : 0, now, id]
        );
        pushNote(id);
        if (updates.content !== undefined) {
          cleanupOrphanedAttachments('note', id, updated.content).catch(() => {});
        }
      },
      onError: (err) => log('ERR', 'noteStore.updateNote: ' + String(err)),
    });
  },

  deleteNote: async (id, deleteChildren = true) => {
    const now = getTimestamp();
    const { notes } = get();

    if (deleteChildren) {
      // Recursively collect all descendant IDs
      const toDelete = new Set<string>();
      const collect = (parentId: string) => {
        toDelete.add(parentId);
        notes.filter((n) => n.parentId === parentId).forEach((n) => collect(n.id));
      };
      collect(id);

      const newNotes = notes.filter((n) => !toDelete.has(n.id));
      set({ notes: newNotes });

      try {
        const db = await getDb();
        for (const delId of toDelete) {
          await db.execute('UPDATE notes SET deleted = 1, updated_at = ? WHERE id = ?', [now, delId]);
          pushNote(delId);
        }
      } catch (err) {
        log('ERR', 'noteStore.deleteNote: ' + String(err));
      }
    } else {
      // Move children up: children get deleted note's parentId
      const deletedNote = notes.find((n) => n.id === id);
      const newParentId = deletedNote?.parentId ?? null;
      const newNotes = notes
        .filter((n) => n.id !== id)
        .map((n) =>
          n.parentId === id ? { ...n, parentId: newParentId } : n
        );
      set({ notes: newNotes });

      try {
        const db = await getDb();
        await db.execute('UPDATE notes SET deleted = 1, updated_at = ? WHERE id = ?', [now, id]);
        pushNote(id);
        await db.execute('UPDATE notes SET parent_id = ?, updated_at = ? WHERE parent_id = ? AND deleted = 0', [newParentId, now, id]);
        // Push moved children
        for (const child of newNotes.filter((n) => n.parentId === newParentId)) {
          pushNote(child.id);
        }
      } catch (err) {
        log('ERR', 'noteStore.deleteNote: ' + String(err));
      }
    }
  },

  moveNote: async (id, newParentId) => {
    const now = getTimestamp();
    await optimisticUpdate({
      get, set,
      keys: ['notes'],
      update: () => set({ notes: get().notes.map((n) => n.id === id ? { ...n, parentId: newParentId, updatedAt: now } : n) }),
      db: async () => {
        const db = await getDb();
        await db.execute('UPDATE notes SET parent_id = ?, updated_at = ? WHERE id = ?', [newParentId, now, id]);
        pushNote(id);
      },
      onError: (err) => log('ERR', 'noteStore.moveNote: ' + String(err)),
    });
  },

  toggleFavorite: async (id) => {
    const now = getTimestamp();
    const note = get().notes.find((n) => n.id === id);
    if (!note) return;
    const newFavorite = !note.favorite;
    await optimisticUpdate({
      get, set,
      keys: ['notes'],
      update: () => set({ notes: get().notes.map((n) => n.id === id ? { ...n, favorite: newFavorite, updatedAt: now } : n) }),
      db: async () => {
        const db = await getDb();
        await db.execute('UPDATE notes SET favorite = ?, updated_at = ? WHERE id = ?', [newFavorite ? 1 : 0, now, id]);
        pushNote(id);
      },
      onError: (err) => log('ERR', 'noteStore.toggleFavorite: ' + String(err)),
    });
  },

  getDeletedNotes: async () => {
    try {
      const db = await getDb();
      const rows = await db.select<NoteRow[]>('SELECT * FROM notes WHERE deleted = 1 AND project_id = ? ORDER BY updated_at DESC', [getProjectId()]);
      return rows.map(rowToNote);
    } catch (err) {
      log('ERR', 'noteStore.getDeletedNotes: ' + String(err));
      return [];
    }
  },

  restoreNote: async (id) => {
    const now = getTimestamp();
    try {
      const db = await getDb();
      // Check if parentId still exists and is not deleted
      const rows = await db.select<NoteRow[]>('SELECT * FROM notes WHERE id = ?', [id]);
      if (rows.length === 0) return;
      const row = rows[0];
      let parentId = row.parent_id || null;

      if (parentId) {
        const parentRows = await db.select<{ id: string; deleted: number }[]>('SELECT id, deleted FROM notes WHERE id = ?', [parentId]);
        if (parentRows.length === 0 || parentRows[0].deleted === 1) {
          parentId = null;
        }
      }

      await db.execute('UPDATE notes SET deleted = 0, parent_id = ?, updated_at = ? WHERE id = ?', [parentId, now, id]);
      pushNote(id);

      // Add back to store
      const restored = rowToNote({ ...row, deleted: 0, parent_id: parentId, updated_at: now });
      set({ notes: [...get().notes, restored] });
    } catch (err) {
      log('ERR', 'noteStore.restoreNote: ' + String(err));
    }
  },

  permanentlyDeleteNote: async (id) => {
    try {
      const db = await getDb();
      await db.execute('DELETE FROM notes WHERE id = ?', [id]);
      deleteAttachmentsForEntity('note', id).catch(() => {});
    } catch (err) {
      log('ERR', 'noteStore.permanentlyDeleteNote: ' + String(err));
    }
  },

  permanentlyDeleteAll: async () => {
    try {
      const db = await getDb();
      const rows = await db.select<{ id: string }[]>('SELECT id FROM notes WHERE deleted = 1 AND project_id = ?', [getProjectId()]);
      for (const row of rows) {
        await db.execute('DELETE FROM notes WHERE id = ?', [row.id]);
        deleteAttachmentsForEntity('note', row.id).catch(() => {});
      }
    } catch (err) {
      log('ERR', 'noteStore.permanentlyDeleteAll: ' + String(err));
    }
  },

  getRootNotes: () => {
    return get().notes.filter((n) => !n.parentId);
  },

  getChildren: (parentId) => {
    return get().notes.filter((n) => n.parentId === parentId);
  },

  getAllTags: () => {
    const tags = new Set<string>();
    get().notes.forEach((n) => n.tags.forEach((t) => tags.add(t)));
    return Array.from(tags).sort();
  },
}));
