/** Top-level navigation pages */
export type Page =
  | 'dashboard'
  | 'board'
  | 'todo'
  | 'releases'
  | 'notes'
  | 'scratchpad'
  | 'reminders'
  | 'settings';

/** Todo list display mode */
export type TodoView = 'cards' | 'list';

/** Settings panel tabs */
export type SettingsTab =
  | 'general'
  | 'users'
  | 'data'
  | 'sync'
  | 'notifications'
  | 'prompts'
  | 'logs'
  | 'about';

/** Reminders page filter tabs */
export type FilterTab = 'all' | 'today' | 'upcoming' | 'completed';
