import { create } from 'zustand';
import { Task, Release, User, TaskStatus, TaskType, TaskPriority } from '../types';
import type { TaskRow, ReleaseRow, UserRow } from '../types/db';
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
    log('WARN', `taskStore.safeParseJsonArray: JSON.parse failed for tags: ${(raw || '').substring(0, 100)}`);
    return [];
  }
}

function getProjectId(): string {
  const id = useProjectStore.getState().currentProjectId;
  if (!id) throw new Error('No active project');
  return id;
}

type SyncTable = 'tasks' | 'releases' | 'users';

// Push a record to PocketBase (fire-and-forget)
async function pushRecord(table: SyncTable, id: string) {
  try {
    const db = await getDb();
    const rows = await db.select<Record<string, unknown>[]>(`SELECT * FROM ${table} WHERE id = ?`, [id]);
    if (rows.length > 0) {
      syncService.pushChanges(table, rows[0] as unknown as Parameters<typeof syncService.pushChanges>[1]).catch((err) => {
        log('WARN', `sync.pushRecord ${table}/${id} failed: ${String(err)}`);
      });
    }
  } catch (err) {
    log('WARN', `sync.pushRecord ${table}/${id} read failed: ${String(err)}`);
  }
}

interface TaskStore {
  tasks: Task[];
  releases: Release[];
  users: User[];
  selectedReleaseId: string | null;
  selectedUserId: string | null;
  isLoading: boolean;
  error: string | null;

  // Task actions
  loadTasks: () => Promise<void>;
  addTask: (task: Omit<Task, 'id' | 'projectId' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateTask: (id: string, updates: Partial<Task>) => Promise<void>;
  deleteTask: (id: string) => Promise<void>;
  deleteFeature: (id: string, deleteChildren: boolean) => Promise<void>;
  moveTask: (id: string, status: TaskStatus) => Promise<void>;
  moveTasks: (ids: string[], status: TaskStatus) => Promise<void>;

  // Task recycle bin
  getDeletedTasks: () => Promise<Task[]>;
  restoreTask: (id: string) => Promise<void>;
  permanentlyDeleteTask: (id: string) => Promise<void>;
  permanentlyDeleteAllTasks: () => Promise<void>;
  getChildTasks: (featureId: string) => Task[];

  // Release actions
  loadReleases: () => Promise<void>;
  addRelease: (release: Omit<Release, 'id' | 'projectId' | 'createdAt'>) => Promise<void>;
  updateRelease: (id: string, updates: Partial<Release>) => Promise<void>;
  deleteRelease: (id: string) => Promise<boolean>;
  setSelectedReleaseId: (id: string | null) => void;

  // User actions
  loadUsers: () => Promise<void>;
  addUser: (user: Omit<User, 'id' | 'projectId' | 'createdAt'>) => Promise<void>;
  updateUser: (id: string, updates: Partial<User>) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
  setSelectedUserId: (id: string | null) => void;

  // Filtered tasks
  getFilteredTasks: () => Task[];
  getFeatures: () => Task[];
}

const generateId = () => crypto.randomUUID();
const getTimestamp = () => new Date().toISOString();

function rowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    projectId: row.project_id || '',
    title: row.title,
    content: row.content || '',
    type: row.type as TaskType,
    status: row.status as TaskStatus,
    releaseId: row.release_id || null,
    assigneeId: row.assignee_id || null,
    featureId: row.feature_id || null,
    priority: (row.priority || 'low') as TaskPriority,
    tags: safeParseJsonArray(row.tags),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToRelease(row: ReleaseRow): Release {
  return {
    id: row.id,
    projectId: row.project_id || '',
    name: row.name,
    description: row.description || '',
    createdAt: row.created_at,
  };
}

function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    projectId: row.project_id || '',
    name: row.name,
    color: row.color,
    createdAt: row.created_at,
  };
}

export const useTaskStore = create<TaskStore>((set, get) => ({
  tasks: [],
  releases: [],
  users: [],
  selectedReleaseId: null,
  selectedUserId: null,
  isLoading: false,
  error: null,

  loadTasks: async () => {
    set({ isLoading: true, error: null });
    try {
      const db = await getDb();
      const rows = await db.select<TaskRow[]>('SELECT * FROM tasks WHERE deleted = 0 AND project_id = ?', [getProjectId()]);
      const tasks = await Promise.all(rows.map(async (row) => {
        const task = rowToTask(row);
        task.content = await resolveAttachmentUrls(task.content);
        return task;
      }));
      set({ tasks, isLoading: false });
    } catch (error) {
      log('ERR', 'taskStore.loadTasks: ' + String(error));
      set({ error: String(error), isLoading: false });
    }
  },

  addTask: async (taskData) => {
    const now = getTimestamp();
    const id = generateId();
    const projectId = getProjectId();
    const task: Task = {
      ...taskData,
      id,
      projectId,
      createdAt: now,
      updatedAt: now,
    };

    await optimisticUpdate({
      get, set,
      keys: ['tasks'],
      update: () => set({ tasks: [...get().tasks, task] }),
      db: async () => {
        const db = await getDb();
        await db.execute(
          'INSERT INTO tasks (id, project_id, title, content, type, status, release_id, assignee_id, feature_id, priority, tags, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [id, projectId, task.title, normalizeAttachmentUrls(task.content), task.type, task.status, task.releaseId, task.assigneeId, task.featureId, task.priority, JSON.stringify(task.tags), now, now]
        );
        pushRecord('tasks', id);
      },
      onError: (err) => { log('ERR', 'taskStore.addTask: ' + String(err)); set({ error: String(err) }); },
    });
  },

  updateTask: async (id, updates) => {
    const now = getTimestamp();
    const newTasks = get().tasks.map((task) =>
      task.id === id ? { ...task, ...updates, updatedAt: now } : task
    );
    const updated = newTasks.find((t) => t.id === id);
    if (!updated) return;

    await optimisticUpdate({
      get, set,
      keys: ['tasks'],
      update: () => set({ tasks: newTasks }),
      db: async () => {
        const db = await getDb();
        await db.execute(
          'UPDATE tasks SET title = ?, content = ?, type = ?, status = ?, release_id = ?, assignee_id = ?, feature_id = ?, priority = ?, tags = ?, updated_at = ? WHERE id = ?',
          [updated.title, normalizeAttachmentUrls(updated.content), updated.type, updated.status, updated.releaseId, updated.assigneeId, updated.featureId, updated.priority, JSON.stringify(updated.tags), now, id]
        );
        pushRecord('tasks', id);
        if (updates.content !== undefined) {
          cleanupOrphanedAttachments('task', id, updated.content).catch(() => {});
        }
      },
      onError: (err) => { log('ERR', 'taskStore.updateTask: ' + String(err)); set({ error: String(err) }); },
    });
  },

  deleteTask: async (id) => {
    const now = getTimestamp();
    const newTasks = get().tasks.filter((task) => task.id !== id);
    set({ tasks: newTasks });

    try {
      const db = await getDb();
      await db.execute('UPDATE tasks SET deleted = 1, updated_at = ? WHERE id = ?', [now, id]);
      pushRecord('tasks', id);

      deleteAttachmentsForEntity('task', id).catch(() => {});
    } catch (error) {
      log('ERR', 'taskStore.deleteTask: ' + String(error));
      set({ error: String(error) });
    }
  },

  deleteFeature: async (id, deleteChildren) => {
    const now = getTimestamp();
    const { tasks } = get();
    const childTasks = tasks.filter((t) => t.featureId === id);

    if (deleteChildren) {
      const toDeleteIds = new Set([id, ...childTasks.map((t) => t.id)]);
      const newTasks = tasks.filter((t) => !toDeleteIds.has(t.id));
      set({ tasks: newTasks });

      try {
        const db = await getDb();
        for (const delId of toDeleteIds) {
          await db.execute('UPDATE tasks SET deleted = 1, updated_at = ? WHERE id = ?', [now, delId]);
          pushRecord('tasks', delId);
        }
      } catch (error) {
        log('ERR', 'taskStore.deleteFeature: ' + String(error));
        set({ error: String(error) });
      }
    } else {
      const newTasks = tasks
        .filter((t) => t.id !== id)
        .map((t) => (t.featureId === id ? { ...t, featureId: null, updatedAt: now } : t));
      set({ tasks: newTasks });

      try {
        const db = await getDb();
        await db.execute('UPDATE tasks SET deleted = 1, updated_at = ? WHERE id = ?', [now, id]);
        pushRecord('tasks', id);
        await db.execute('UPDATE tasks SET feature_id = NULL, updated_at = ? WHERE feature_id = ? AND deleted = 0', [now, id]);
        for (const child of childTasks) {
          pushRecord('tasks', child.id);
        }
      } catch (error) {
        log('ERR', 'taskStore.deleteFeature: ' + String(error));
        set({ error: String(error) });
      }
    }
  },

  moveTask: async (id, status) => {
    const now = getTimestamp();
    await optimisticUpdate({
      get, set,
      keys: ['tasks'],
      update: () => set({ tasks: get().tasks.map((task) => task.id === id ? { ...task, status, updatedAt: now } : task) }),
      db: async () => {
        const db = await getDb();
        await db.execute('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?', [status, now, id]);
        pushRecord('tasks', id);
      },
      onError: (err) => { log('ERR', 'taskStore.moveTask: ' + String(err)); set({ error: String(err) }); },
    });
  },

  moveTasks: async (ids, status) => {
    if (ids.length === 0) return;
    const now = getTimestamp();
    const idSet = new Set(ids);
    await optimisticUpdate({
      get, set,
      keys: ['tasks'],
      update: () => set({ tasks: get().tasks.map((task) => idSet.has(task.id) ? { ...task, status, updatedAt: now } : task) }),
      db: async () => {
        const db = await getDb();
        const placeholders = ids.map(() => '?').join(',');
        await db.execute(
          `UPDATE tasks SET status = ?, updated_at = ? WHERE id IN (${placeholders})`,
          [status, now, ...ids]
        );
        for (const id of ids) pushRecord('tasks', id);
      },
      onError: (err) => { log('ERR', 'taskStore.moveTasks: ' + String(err)); set({ error: String(err) }); },
    });
  },

  loadReleases: async () => {
    try {
      const db = await getDb();
      const rows = await db.select<ReleaseRow[]>('SELECT * FROM releases WHERE deleted = 0 AND project_id = ?', [getProjectId()]);
      set({ releases: rows.map(rowToRelease) });
    } catch (error) {
      log('ERR', 'taskStore.loadReleases: ' + String(error));
      set({ error: String(error) });
    }
  },

  addRelease: async (releaseData) => {
    const now = getTimestamp();
    const id = generateId();
    const projectId = getProjectId();
    const release: Release = {
      ...releaseData,
      id,
      projectId,
      createdAt: now,
    };

    set({ releases: [...get().releases, release] });

    try {
      const db = await getDb();
      await db.execute(
        'INSERT INTO releases (id, project_id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        [id, projectId, release.name, release.description, now, now]
      );
      pushRecord('releases', id);
    } catch (error) {
      log('ERR', 'taskStore.addRelease: ' + String(error));
      set({ error: String(error) });
    }
  },

  updateRelease: async (id, updates) => {
    const now = getTimestamp();
    const newReleases = get().releases.map((release) =>
      release.id === id ? { ...release, ...updates } : release
    );
    set({ releases: newReleases });

    try {
      const db = await getDb();
      const updated = newReleases.find((r) => r.id === id);
      if (!updated) return;
      await db.execute(
        'UPDATE releases SET name = ?, description = ?, updated_at = ? WHERE id = ?',
        [updated.name, updated.description, now, id]
      );
    } catch (error) {
      log('ERR', 'taskStore.updateRelease: ' + String(error));
      set({ error: String(error) });
    }
  },

  deleteRelease: async (id) => {
    // Block deletion if tasks still reference this release
    const dependentTasks = get().tasks.filter((t) => t.releaseId === id);
    if (dependentTasks.length > 0) {
      return false;
    }

    const now = getTimestamp();
    const newReleases = get().releases.filter((release) => release.id !== id);
    set({ releases: newReleases });

    try {
      const db = await getDb();
      await db.execute('UPDATE releases SET deleted = 1, updated_at = ? WHERE id = ?', [now, id]);
      pushRecord('releases', id);
    } catch (error) {
      log('ERR', 'taskStore.deleteRelease: ' + String(error));
      set({ error: String(error) });
    }
    return true;
  },

  setSelectedReleaseId: (id) => {
    set({ selectedReleaseId: id });
  },

  loadUsers: async () => {
    try {
      const db = await getDb();
      const rows = await db.select<UserRow[]>('SELECT * FROM users WHERE deleted = 0 AND project_id = ?', [getProjectId()]);
      set({ users: rows.map(rowToUser) });
    } catch (error) {
      log('ERR', 'taskStore.loadUsers: ' + String(error));
      set({ error: String(error) });
    }
  },

  addUser: async (userData) => {
    const now = getTimestamp();
    const id = generateId();
    const projectId = getProjectId();
    const user: User = {
      ...userData,
      id,
      projectId,
      createdAt: now,
    };

    set({ users: [...get().users, user] });

    try {
      const db = await getDb();
      await db.execute(
        'INSERT INTO users (id, project_id, name, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        [id, projectId, user.name, user.color, now, now]
      );
      pushRecord('users', id);
    } catch (error) {
      log('ERR', 'taskStore.addUser: ' + String(error));
      set({ error: String(error) });
    }
  },

  updateUser: async (id, updates) => {
    const now = getTimestamp();
    const newUsers = get().users.map((user) =>
      user.id === id ? { ...user, ...updates } : user
    );
    set({ users: newUsers });

    try {
      const db = await getDb();
      const updated = newUsers.find((u) => u.id === id);
      if (!updated) return;
      await db.execute(
        'UPDATE users SET name = ?, color = ?, updated_at = ? WHERE id = ?',
        [updated.name, updated.color, now, id]
      );
      pushRecord('users', id);
    } catch (error) {
      log('ERR', 'taskStore.updateUser: ' + String(error));
      set({ error: String(error) });
    }
  },

  deleteUser: async (id) => {
    const now = getTimestamp();
    const newUsers = get().users.filter((user) => user.id !== id);
    const newTasks = get().tasks.map((task) =>
      task.assigneeId === id ? { ...task, assigneeId: null, updatedAt: now } : task
    );
    set({ users: newUsers, tasks: newTasks });

    try {
      const db = await getDb();
      await db.execute('UPDATE users SET deleted = 1, updated_at = ? WHERE id = ?', [now, id]);
      pushRecord('users', id);
      await db.execute('UPDATE tasks SET assignee_id = NULL, updated_at = ? WHERE assignee_id = ?', [now, id]);
    } catch (error) {
      log('ERR', 'taskStore.deleteUser: ' + String(error));
      set({ error: String(error) });
    }
  },

  setSelectedUserId: (id) => {
    set({ selectedUserId: id });
  },

  getDeletedTasks: async () => {
    try {
      const db = await getDb();
      const rows = await db.select<TaskRow[]>('SELECT * FROM tasks WHERE deleted = 1 AND project_id = ? ORDER BY updated_at DESC', [getProjectId()]);
      return rows.map(rowToTask);
    } catch (err) {
      log('ERR', 'taskStore.getDeletedTasks: ' + String(err));
      return [];
    }
  },

  restoreTask: async (id) => {
    const now = getTimestamp();
    try {
      const db = await getDb();
      const rows = await db.select<TaskRow[]>('SELECT * FROM tasks WHERE id = ?', [id]);
      if (rows.length === 0) return;
      const row = rows[0];
      let featureId = row.feature_id || null;

      // Check if featureId still exists and is not deleted
      if (featureId) {
        const featureRows = await db.select<Pick<TaskRow, 'id' | 'deleted'>[]>('SELECT id, deleted FROM tasks WHERE id = ?', [featureId]);
        if (featureRows.length === 0 || featureRows[0].deleted === 1) {
          featureId = null;
        }
      }

      await db.execute('UPDATE tasks SET deleted = 0, feature_id = ?, updated_at = ? WHERE id = ?', [featureId, now, id]);
      pushRecord('tasks', id);

      const restored = rowToTask({ ...row, deleted: 0, feature_id: featureId, updated_at: now });
      set({ tasks: [...get().tasks, restored] });
    } catch (err) {
      log('ERR', 'taskStore.restoreTask: ' + String(err));
    }
  },

  permanentlyDeleteTask: async (id) => {
    try {
      const db = await getDb();
      await db.execute('DELETE FROM tasks WHERE id = ?', [id]);
      deleteAttachmentsForEntity('task', id).catch(() => {});
    } catch (err) {
      log('ERR', 'taskStore.permanentlyDeleteTask: ' + String(err));
    }
  },

  permanentlyDeleteAllTasks: async () => {
    try {
      const db = await getDb();
      const rows = await db.select<Pick<TaskRow, 'id'>[]>('SELECT id FROM tasks WHERE deleted = 1 AND project_id = ?', [getProjectId()]);
      for (const row of rows) {
        await db.execute('DELETE FROM tasks WHERE id = ?', [row.id]);
        deleteAttachmentsForEntity('task', row.id).catch(() => {});
      }
    } catch (err) {
      log('ERR', 'taskStore.permanentlyDeleteAllTasks: ' + String(err));
    }
  },

  getChildTasks: (featureId) => {
    return get().tasks.filter((t) => t.featureId === featureId);
  },

  getFilteredTasks: () => {
    const { tasks, selectedReleaseId, selectedUserId } = get();
    let filtered = tasks;

    if (selectedReleaseId) {
      filtered = filtered.filter((task) => task.releaseId === selectedReleaseId);
    }

    if (selectedUserId) {
      filtered = filtered.filter((task) => task.assigneeId === selectedUserId);
    }

    return filtered;
  },

  getFeatures: () => {
    return get().tasks.filter((task) => task.type === 'feature');
  },
}));
