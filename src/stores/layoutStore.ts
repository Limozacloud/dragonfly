import { create } from 'zustand';
import { TaskStatus } from '../types';
import { getConfig, setConfig } from '../services/database';
import { log } from '../services/logService';

const DEFAULT_COLLAPSED: TaskStatus[] = ['backlog', 'review', 'done'];

interface LayoutStore {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  collapsedColumns: Set<TaskStatus>;
  toggleColumn: (columnId: TaskStatus) => void;
  isColumnCollapsed: (columnId: TaskStatus) => boolean;
  defaultCollapsed: Set<TaskStatus>;
  setDefaultCollapsed: (columnId: TaskStatus, collapsed: boolean) => void;
  loadDefaults: () => Promise<void>;
}

export const useLayoutStore = create<LayoutStore>((set, get) => ({
  sidebarCollapsed: false,
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  collapsedColumns: new Set<TaskStatus>(DEFAULT_COLLAPSED),
  toggleColumn: (columnId) =>
    set((state) => {
      const next = new Set(state.collapsedColumns);
      if (next.has(columnId)) {
        next.delete(columnId);
      } else {
        next.add(columnId);
      }
      return { collapsedColumns: next };
    }),
  isColumnCollapsed: (columnId) => get().collapsedColumns.has(columnId),
  defaultCollapsed: new Set<TaskStatus>(DEFAULT_COLLAPSED),
  setDefaultCollapsed: (columnId, collapsed) => {
    const next = new Set(get().defaultCollapsed);
    if (collapsed) {
      next.add(columnId);
    } else {
      next.delete(columnId);
    }
    set({ defaultCollapsed: next, collapsedColumns: new Set(next) });
    setConfig('board_collapsed_columns', JSON.stringify([...next]));
  },
  loadDefaults: async () => {
    const saved = await getConfig('board_collapsed_columns');
    if (saved) {
      try {
        const arr = JSON.parse(saved) as TaskStatus[];
        const s = new Set<TaskStatus>(arr);
        set({ defaultCollapsed: s, collapsedColumns: new Set(s) });
      } catch (err) {
        log('WARN', 'layoutStore.loadDefaults: invalid JSON for board_collapsed_columns: ' + String(err));
      }
    }
  },
}));
