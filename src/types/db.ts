/** Raw database row shapes — mirror the SQLite column names exactly. */

export interface ProjectRow {
  id: string;
  name: string;
  description: string;
  color: string;
  sync_url: string;
  sync_space_key: string;
  shared: number; // 0 | 1
  created_at: string;
  updated_at: string;
  deleted: number;
}

export interface TaskRow {
  id: string;
  project_id: string;
  title: string;
  content: string;
  type: string;
  status: string;
  release_id: string | null;
  assignee_id: string | null;
  feature_id: string | null;
  priority: string;
  tags: string; // JSON array
  created_at: string;
  updated_at: string;
  deleted: number;
}

export interface ReleaseRow {
  id: string;
  project_id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  deleted: number;
}

export interface UserRow {
  id: string;
  project_id: string;
  name: string;
  color: string;
  created_at: string;
  updated_at: string;
  deleted: number;
}

export interface NoteRow {
  id: string;
  project_id: string;
  title: string;
  content: string;
  tags: string; // JSON array
  parent_id: string | null;
  favorite: number; // 0 | 1
  created_at: string;
  updated_at: string;
  deleted: number;
}

export interface ScratchpadRow {
  id: string;
  project_id: string;
  title: string;
  content: string;
  favorite: number; // 0 | 1
  created_at: string;
  updated_at: string;
  deleted: number;
}

export interface ReminderRow {
  id: string;
  title: string;
  notes: string;
  status: string;
  due_date: string | null;
  all_day: number; // 0 | 1
  recurrence_type: string;
  recurrence_interval: number;
  recurrence_days: string; // JSON array
  recurrence_end: string | null;
  next_occurrence: string | null;
  alert_minutes: number;
  notify_email: number; // 0 | 1
  priority: string;
  tags: string; // JSON array
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  deleted: number;
}

/** All valid keys for the app_config table. */
export type AppConfigKey =
  | 'schema_version'
  | 'auto_logout_minutes'
  | 'minimize_to_tray'
  | 'last_project_id'
  | 'passphrase_hash'
  | 'board_collapsed_columns'
  | 'dashboard_show_done'
  | 'todo_show_done'
  | 'todo_view'
  | 'log_max_size_mb'
  | 'openai_api_key'
  | 'voice_provider'
  | 'whisper_model'
  | 'prompt_notes'
  | 'prompt_tasks'
  | 'prompt_cab'
  | 'smtp_host'
  | 'smtp_port'
  | 'smtp_secure'
  | 'smtp_username'
  | 'smtp_password'
  | 'smtp_from_email'
  | 'smtp_from_name'
  | 'notification_email_to'
  | 'reminder_sync_enabled'
  | 'reminder_sync_project_id'
  | 'reminder_sync_secret'
  | 'reminder_sync_smtp'
  | 'reminder_settings_updated_at'
  | 'pb_identity_user_id';

export interface AppConfigRow {
  key: AppConfigKey;
  value: string | null;
  updated_at: string;
}
