export type TaskStatus = 'backlog' | 'todo' | 'in_progress' | 'review' | 'done';
export type TaskType = 'feature' | 'task';
export type TaskPriority = 'high' | 'medium' | 'low';

export interface Project {
  id: string;
  name: string;
  description: string;
  color: string;
  syncUrl: string;
  syncSpaceKey: string;
  adminEmail: string;
  adminPassword: string;
  shared: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  content: string; // BlockNote JSON
  type: TaskType;
  status: TaskStatus;
  releaseId: string | null;
  assigneeId: string | null;
  featureId: string | null; // Only for type='task', links to a feature
  priority: TaskPriority;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface Release {
  id: string;
  projectId: string;
  name: string;
  description: string;
  createdAt: string;
}

export interface User {
  id: string;
  projectId: string;
  name: string;
  color: string; // Avatar color
  createdAt: string;
}

export interface Column {
  id: TaskStatus;
  title: string;
}

export interface Note {
  id: string;
  projectId: string;
  title: string;
  content: string; // BlockNote JSON
  tags: string[];
  parentId: string | null;
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Scratchpad {
  id: string;
  projectId: string;
  title: string;
  content: string; // Excalidraw scene JSON
  favorite: boolean;
  createdAt: string;
  updatedAt: string;
}

export const COLUMNS: Column[] = [
  { id: 'backlog', title: 'Backlog' },
  { id: 'todo', title: 'To Do' },
  { id: 'in_progress', title: 'In Progress' },
  { id: 'review', title: 'Review' },
  { id: 'done', title: 'Done' },
];
