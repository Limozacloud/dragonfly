import { ReminderPriority } from '@/types/reminder';

// ── Project & avatar color palettes ──────────────────────────────────

export const PROJECT_COLORS: string[] = [
  '#0077B6', '#005f8f', '#00B4D8', '#0ea5e9',
  '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7',
  '#ef4444', '#f97316', '#f59e0b', '#22c55e',
  '#10b981', '#14b8a6', '#ec4899', '#d946ef',
];

export const AVATAR_COLORS: string[] = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308',
  '#84cc16', '#22c55e', '#10b981', '#14b8a6',
  '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1',
  '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
];

export const PRIORITY_COLORS: Record<ReminderPriority, string> = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#22c55e',
};

export const PRIORITY_GRADIENTS: Record<ReminderPriority, string> = {
  high: 'from-red-500 to-red-600',
  medium: 'from-amber-500 to-amber-600',
  low: 'from-green-500 to-green-600',
};

// ── Layout ────────────────────────────────────────────────────────────

export const NOTE_SIDEBAR_WIDTH_DEFAULT = 280;
export const SCRATCHPAD_SIDEBAR_WIDTH_DEFAULT = 290;
export const NOTE_SIDEBAR_WIDTH_MIN = 280;

// ── Timers & intervals ────────────────────────────────────────────────

export const REMINDER_CHECK_INTERVAL_MS = 60_000;

// ── Reminder chime ────────────────────────────────────────────────────

/** A-major chord arpeggio: A5 - C#6 - E6 */
export const CHIME_FREQUENCIES = [880, 1108, 1318] as const;
export const CHIME_NOTE_DELAY_S = 0.12;
export const CHIME_NOTE_DURATION_S = 0.6;
export const CHIME_CONTEXT_CLOSE_DELAY_MS = 1500;
