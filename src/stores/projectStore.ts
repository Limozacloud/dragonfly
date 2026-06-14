import { create } from 'zustand';
import { Project } from '../types';
import type { ProjectRow } from '../types/db';
import { getDb, getConfig, setConfig } from '../services/database';
import { deleteAttachmentsForEntity } from '../services/attachmentService';
import { log } from '../services/logService';
import { optimisticUpdate } from './storeUtils';

function rowToProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    color: row.color || '#0077B6',
    syncUrl: row.sync_url || '',
    syncSpaceKey: row.sync_space_key || '',
    adminEmail: row.admin_email || '',
    adminPassword: row.admin_password || '',
    shared: row.shared !== undefined ? !!row.shared : true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface ProjectStore {
  projects: Project[];
  currentProjectId: string | null;
  isLoading: boolean;

  loadProjects: () => Promise<void>;
  setCurrentProject: (id: string) => void;
  addProject: (data: { name: string; description: string; color: string }) => Promise<Project>;
  updateProject: (id: string, updates: Partial<Pick<Project, 'name' | 'description' | 'color' | 'syncUrl' | 'syncSpaceKey' | 'adminEmail' | 'adminPassword' | 'shared'>>) => Promise<void>;
  deleteProject: (id: string) => Promise<boolean>;
  getCurrentProject: () => Project | null;
  getProjectStats: (projectId: string) => Promise<{ tasks: number; notes: number }>;
  joinProjects: (projects: Array<{ id: string; name: string; description: string; color: string }>, syncUrl: string, syncSpaceKey: string) => Promise<void>;
}

const generateId = () => crypto.randomUUID();
const getTimestamp = () => new Date().toISOString();

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: [],
  currentProjectId: null,
  isLoading: false,

  loadProjects: async () => {
    set({ isLoading: true });
    try {
      const db = await getDb();
      const rows = await db.select<ProjectRow[]>('SELECT * FROM projects WHERE deleted = 0 ORDER BY created_at ASC');
      const projects = rows.map(rowToProject);

      const lastProjectId = await getConfig('last_project_id');
      const validId = projects.find((p) => p.id === lastProjectId)?.id || projects[0]?.id || null;

      set({ projects, currentProjectId: validId, isLoading: false });
    } catch (err) {
      log('ERR', 'projectStore.loadProjects: ' + String(err));
      set({ isLoading: false });
    }
  },

  setCurrentProject: (id: string) => {
    set({ currentProjectId: id });
    setConfig('last_project_id', id);
  },

  addProject: async (data) => {
    const now = getTimestamp();
    const id = generateId();
    const project: Project = {
      id,
      name: data.name,
      description: data.description,
      color: data.color,
      syncUrl: '',
      syncSpaceKey: '',
      adminEmail: '',
      adminPassword: '',
      shared: true,
      createdAt: now,
      updatedAt: now,
    };

    await optimisticUpdate({
      get, set,
      keys: ['projects'],
      update: () => set({ projects: [...get().projects, project] }),
      db: async () => {
        const db = await getDb();
        await db.execute(
          'INSERT INTO projects (id, name, description, color, sync_url, sync_space_key, admin_email, admin_password, shared, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [id, project.name, project.description, project.color, '', '', '', '', 1, now, now]
        );
      },
      onError: (err) => log('ERR', 'projectStore.addProject: ' + String(err)),
    });

    return project;
  },

  updateProject: async (id, updates) => {
    const now = getTimestamp();
    const newProjects = get().projects.map((p) =>
      p.id === id ? { ...p, ...updates, updatedAt: now } : p
    );
    const updated = newProjects.find((p) => p.id === id);
    if (!updated) return;

    await optimisticUpdate({
      get, set,
      keys: ['projects'],
      update: () => set({ projects: newProjects }),
      db: async () => {
        const db = await getDb();
        await db.execute(
          'UPDATE projects SET name = ?, description = ?, color = ?, sync_url = ?, sync_space_key = ?, admin_email = ?, admin_password = ?, shared = ?, updated_at = ? WHERE id = ?',
          [updated.name, updated.description, updated.color, updated.syncUrl, updated.syncSpaceKey, updated.adminEmail, updated.adminPassword, updated.shared ? 1 : 0, now, id]
        );
      },
      onError: (err) => log('ERR', 'projectStore.updateProject: ' + String(err)),
    });
  },

  deleteProject: async (id) => {
    const { projects, currentProjectId } = get();
    if (projects.length <= 1) return false;

    const newProjects = projects.filter((p) => p.id !== id);
    const nextId = currentProjectId === id ? (newProjects[0]?.id || null) : currentProjectId;

    await optimisticUpdate({
      get, set,
      keys: ['projects', 'currentProjectId'],
      update: () => {
        set({ projects: newProjects, currentProjectId: nextId });
        if (currentProjectId === id && nextId) setConfig('last_project_id', nextId);
      },
      db: async () => {
        const db = await getDb();
        const taskIds = await db.select<{ id: string }[]>('SELECT id FROM tasks WHERE project_id = ?', [id]);
        const noteIds = await db.select<{ id: string }[]>('SELECT id FROM notes WHERE project_id = ?', [id]);
        for (const row of taskIds) await deleteAttachmentsForEntity('task', row.id);
        for (const row of noteIds) await deleteAttachmentsForEntity('note', row.id);
        for (const table of ['tasks', 'notes', 'releases', 'users']) {
          await db.execute(`DELETE FROM ${table} WHERE project_id = ?`, [id]);
        }
        await db.execute('DELETE FROM projects WHERE id = ?', [id]);
      },
      onError: (err) => log('ERR', 'projectStore.deleteProject: ' + String(err)),
    });

    return true;
  },

  getCurrentProject: () => {
    const { projects, currentProjectId } = get();
    return projects.find((p) => p.id === currentProjectId) || null;
  },

  getProjectStats: async (projectId: string) => {
    try {
      const db = await getDb();
      const taskRows = await db.select<{ count: number }[]>(
        'SELECT COUNT(*) as count FROM tasks WHERE project_id = ? AND deleted = 0',
        [projectId]
      );
      const noteRows = await db.select<{ count: number }[]>(
        'SELECT COUNT(*) as count FROM notes WHERE project_id = ? AND deleted = 0',
        [projectId]
      );
      return {
        tasks: taskRows[0]?.count || 0,
        notes: noteRows[0]?.count || 0,
      };
    } catch (err) {
      log('ERR', 'projectStore.getProjectStats: ' + String(err));
      return { tasks: 0, notes: 0 };
    }
  },

  joinProjects: async (projects, syncUrl, syncSpaceKey) => {
    const now = getTimestamp();
    const db = await getDb();
    const newProjects: Project[] = [];

    for (const p of projects) {
      // Skip if already exists locally
      const existing = await db.select<{ id: string }[]>('SELECT id FROM projects WHERE id = ?', [p.id]);
      if (existing.length > 0) continue;

      const project: Project = {
        id: p.id,
        name: p.name,
        description: p.description,
        color: p.color,
        syncUrl,
        syncSpaceKey,
        adminEmail: '',
        adminPassword: '',
        shared: true,
        createdAt: now,
        updatedAt: now,
      };

      await db.execute(
        'INSERT INTO projects (id, name, description, color, sync_url, sync_space_key, admin_email, admin_password, shared, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [p.id, p.name, p.description, p.color, syncUrl, syncSpaceKey, '', '', 1, now, now]
      );

      newProjects.push(project);
    }

    if (newProjects.length > 0) {
      set({ projects: [...get().projects, ...newProjects] });
    }
  },
}));
