import { create } from 'zustand';
import { Scratchpad } from '../types';
import type { ScratchpadRow } from '../types/db';
import { getDb } from '../services/database';
import { syncService } from '../services/syncService';
import { useProjectStore } from './projectStore';
import { log } from '../services/logService';

function getProjectId(): string {
  const id = useProjectStore.getState().currentProjectId;
  if (!id) throw new Error('No active project');
  return id;
}

async function pushScratchpad(id: string) {
  try {
    const db = await getDb();
    const rows = await db.select<ScratchpadRow[]>('SELECT * FROM scratchpads WHERE id = ?', [id]);
    if (rows.length > 0) {
      syncService.pushChanges('scratchpads', rows[0] as unknown as Parameters<typeof syncService.pushChanges>[1]).catch((err) => {
        log('WARN', `sync.pushScratchpad ${id} failed: ${String(err)}`);
      });
    }
  } catch (err) {
    log('WARN', `sync.pushScratchpad ${id} read failed: ${String(err)}`);
  }
}

interface ScratchpadStore {
  scratchpads: Scratchpad[];
  isLoading: boolean;

  loadScratchpads: () => Promise<void>;
  addScratchpad: (title?: string) => Promise<Scratchpad>;
  updateScratchpad: (id: string, updates: Partial<Pick<Scratchpad, 'title' | 'content'>>) => Promise<void>;
  deleteScratchpad: (id: string) => Promise<void>;
  toggleFavorite: (id: string) => Promise<void>;
  getDeletedScratchpads: () => Promise<Scratchpad[]>;
  restoreScratchpad: (id: string) => Promise<void>;
  permanentlyDeleteScratchpad: (id: string) => Promise<void>;
  permanentlyDeleteAllScratchpads: () => Promise<void>;
}

const generateId = () => crypto.randomUUID();
const getTimestamp = () => new Date().toISOString();

function rowToScratchpad(row: ScratchpadRow): Scratchpad {
  return {
    id: row.id,
    projectId: row.project_id || '',
    title: row.title || '',
    content: row.content || '',
    favorite: !!row.favorite,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const useScratchpadStore = create<ScratchpadStore>((set, get) => ({
  scratchpads: [],
  isLoading: false,

  loadScratchpads: async () => {
    set({ isLoading: true });
    try {
      const db = await getDb();
      const rows = await db.select<ScratchpadRow[]>(
        'SELECT * FROM scratchpads WHERE deleted = 0 AND project_id = ? ORDER BY title COLLATE NOCASE ASC',
        [getProjectId()]
      );
      set({ scratchpads: rows.map(rowToScratchpad), isLoading: false });
    } catch (err) {
      log('ERR', 'scratchpadStore.loadScratchpads: ' + String(err));
      set({ isLoading: false });
    }
  },

  addScratchpad: async (title?: string) => {
    const now = getTimestamp();
    const id = generateId();
    const projectId = getProjectId();
    const scratchpad: Scratchpad = {
      id,
      projectId,
      title: title || '',
      content: '',
      favorite: false,
      createdAt: now,
      updatedAt: now,
    };

    const updated = [...get().scratchpads, scratchpad].sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
    set({ scratchpads: updated });

    try {
      const db = await getDb();
      await db.execute(
        'INSERT INTO scratchpads (id, project_id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        [id, projectId, scratchpad.title, scratchpad.content, now, now]
      );
      pushScratchpad(id);
    } catch (err) {
      log('ERR', 'scratchpadStore.addScratchpad: ' + String(err));
    }

    return scratchpad;
  },

  updateScratchpad: async (id, updates) => {
    const now = getTimestamp();
    const newScratchpads = get().scratchpads.map((s) =>
      s.id === id ? { ...s, ...updates, updatedAt: now } : s
    );
    if (updates.title !== undefined) {
      newScratchpads.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
    }
    set({ scratchpads: newScratchpads });

    try {
      const db = await getDb();
      const updated = newScratchpads.find((s) => s.id === id);
      if (!updated) return;
      await db.execute(
        'UPDATE scratchpads SET title = ?, content = ?, updated_at = ? WHERE id = ?',
        [updated.title, updated.content, now, id]
      );
      pushScratchpad(id);
    } catch (err) {
      log('ERR', 'scratchpadStore.updateScratchpad: ' + String(err));
    }
  },

  toggleFavorite: async (id) => {
    const now = getTimestamp();
    const scratchpad = get().scratchpads.find((s) => s.id === id);
    if (!scratchpad) return;
    const newFavorite = !scratchpad.favorite;
    const newScratchpads = get().scratchpads.map((s) =>
      s.id === id ? { ...s, favorite: newFavorite, updatedAt: now } : s
    );
    set({ scratchpads: newScratchpads });

    try {
      const db = await getDb();
      await db.execute('UPDATE scratchpads SET favorite = ?, updated_at = ? WHERE id = ?', [newFavorite ? 1 : 0, now, id]);
      pushScratchpad(id);
    } catch (err) {
      log('ERR', 'scratchpadStore.toggleFavorite: ' + String(err));
    }
  },

  deleteScratchpad: async (id) => {
    const now = getTimestamp();
    set({ scratchpads: get().scratchpads.filter((s) => s.id !== id) });

    try {
      const db = await getDb();
      await db.execute('UPDATE scratchpads SET deleted = 1, updated_at = ? WHERE id = ?', [now, id]);
      pushScratchpad(id);
    } catch (err) {
      log('ERR', 'scratchpadStore.deleteScratchpad: ' + String(err));
    }
  },

  getDeletedScratchpads: async () => {
    try {
      const db = await getDb();
      const rows = await db.select<ScratchpadRow[]>('SELECT * FROM scratchpads WHERE deleted = 1 AND project_id = ? ORDER BY updated_at DESC', [getProjectId()]);
      return rows.map(rowToScratchpad);
    } catch (err) {
      log('ERR', 'scratchpadStore.getDeletedScratchpads: ' + String(err));
      return [];
    }
  },

  restoreScratchpad: async (id) => {
    const now = getTimestamp();
    try {
      const db = await getDb();
      const rows = await db.select<ScratchpadRow[]>('SELECT * FROM scratchpads WHERE id = ?', [id]);
      if (rows.length === 0) return;
      const row = rows[0];

      await db.execute('UPDATE scratchpads SET deleted = 0, updated_at = ? WHERE id = ?', [now, id]);
      pushScratchpad(id);

      const restored = rowToScratchpad({ ...row, deleted: 0, updated_at: now });
      const updated = [...get().scratchpads, restored].sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
      set({ scratchpads: updated });
    } catch (err) {
      log('ERR', 'scratchpadStore.restoreScratchpad: ' + String(err));
    }
  },

  permanentlyDeleteScratchpad: async (id) => {
    try {
      const db = await getDb();
      await db.execute('DELETE FROM scratchpads WHERE id = ?', [id]);
    } catch (err) {
      log('ERR', 'scratchpadStore.permanentlyDeleteScratchpad: ' + String(err));
    }
  },

  permanentlyDeleteAllScratchpads: async () => {
    try {
      const db = await getDb();
      await db.execute('DELETE FROM scratchpads WHERE deleted = 1 AND project_id = ?', [getProjectId()]);
    } catch (err) {
      log('ERR', 'scratchpadStore.permanentlyDeleteAllScratchpads: ' + String(err));
    }
  },
}));
