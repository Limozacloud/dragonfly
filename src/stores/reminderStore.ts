import { create } from 'zustand';
import { Reminder, ReminderPriority, ReminderStatus, RecurrenceType, calculateNextOccurrence } from '../types/reminder';
import type { ReminderRow } from '../types/db';
import { getDb } from '../services/database';
import { log } from '../services/logService';
import { syncService } from '../services/syncService';

const generateId = () => crypto.randomUUID();
const getTimestamp = () => new Date().toISOString();

function safeParseArray<T>(raw: string | null | undefined): T[] {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function rowToReminder(row: ReminderRow): Reminder {
  return {
    id: row.id,
    title: row.title || '',
    notes: row.notes || '',
    status: (row.status || 'pending') as ReminderStatus,
    dueDate: row.due_date || null,
    allDay: !!row.all_day,
    recurrenceType: (row.recurrence_type || 'none') as RecurrenceType,
    recurrenceInterval: row.recurrence_interval || 1,
    recurrenceDays: safeParseArray<number>(row.recurrence_days),
    recurrenceEnd: row.recurrence_end || null,
    nextOccurrence: row.next_occurrence || null,
    alertMinutes: row.alert_minutes ?? -1,
    notifyEmail: !!row.notify_email,
    priority: (row.priority || 'medium') as ReminderPriority,
    tags: safeParseArray<string>(row.tags),
    completedAt: row.completed_at || null,
    createdAt: row.created_at || getTimestamp(),
    updatedAt: row.updated_at || getTimestamp(),
  };
}

type ReminderInput = Pick<Reminder, 'title' | 'notes' | 'priority' | 'dueDate' | 'allDay' | 'recurrenceType' | 'recurrenceInterval' | 'recurrenceDays' | 'recurrenceEnd' | 'alertMinutes' | 'notifyEmail' | 'tags'>;

interface ReminderStore {
  reminders: Reminder[];
  isLoading: boolean;
  error: string | null;

  loadReminders: () => Promise<void>;
  addReminder: (input: ReminderInput) => Promise<Reminder>;
  updateReminder: (id: string, updates: Partial<Reminder>) => Promise<void>;
  deleteReminder: (id: string) => Promise<void>;
  completeReminder: (id: string) => Promise<void>;
  dismissReminder: (id: string) => Promise<void>;
  snoozeReminder: (id: string, minutes: number) => Promise<void>;

  getDeletedReminders: () => Promise<Reminder[]>;
  restoreReminder: (id: string) => Promise<void>;
  permanentlyDeleteReminder: (id: string) => Promise<void>;

  getDueReminders: () => Reminder[];
}

export const useReminderStore = create<ReminderStore>((set, get) => ({
  reminders: [],
  isLoading: false,
  error: null,

  loadReminders: async () => {
    set({ isLoading: true, error: null });
    try {
      const db = await getDb();
      const rows = await db.select<ReminderRow[]>(
        `SELECT * FROM personal_todos WHERE deleted = 0 ORDER BY next_occurrence ASC, created_at DESC`
      );
      set({ reminders: rows.map(rowToReminder), isLoading: false });
    } catch (err) {
      log('ERR', 'reminderStore.loadReminders: ' + String(err));
      set({ error: String(err), isLoading: false });
    }
  },

  addReminder: async (input: ReminderInput) => {
    const db = await getDb();
    const now = getTimestamp();
    const id = generateId();

    // nextOccurrence = dueDate for the first occurrence
    const nextOccurrence = input.dueDate || null;

    await db.execute(
      `INSERT INTO personal_todos (
        id, title, notes, status, due_date, all_day,
        recurrence_type, recurrence_interval, recurrence_days, recurrence_end,
        next_occurrence, alert_minutes, notify_email,
        priority, tags, completed_at, created_at, updated_at, deleted
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,?,?,0)`,
      [
        id,
        input.title,
        input.notes,
        'pending',
        input.dueDate,
        input.allDay ? 1 : 0,
        input.recurrenceType,
        input.recurrenceInterval,
        JSON.stringify(input.recurrenceDays),
        input.recurrenceEnd,
        nextOccurrence,
        input.alertMinutes,
        input.notifyEmail ? 1 : 0,
        input.priority,
        JSON.stringify(input.tags),
        now,
        now,
      ]
    );

    const reminder: Reminder = {
      id,
      title: input.title,
      notes: input.notes,
      status: 'pending',
      dueDate: input.dueDate,
      allDay: input.allDay,
      recurrenceType: input.recurrenceType,
      recurrenceInterval: input.recurrenceInterval,
      recurrenceDays: input.recurrenceDays,
      recurrenceEnd: input.recurrenceEnd,
      nextOccurrence,
      alertMinutes: input.alertMinutes,
      notifyEmail: input.notifyEmail,
      priority: input.priority,
      tags: input.tags,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    };

    set((state) => ({ reminders: [...state.reminders, reminder] }));
    syncService.pushReminder(id).catch(() => {});
    return reminder;
  },

  updateReminder: async (id: string, updates: Partial<Reminder>) => {
    const db = await getDb();
    const now = getTimestamp();

    // Build SET clause dynamically
    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.title !== undefined) { fields.push('title = ?'); values.push(updates.title); }
    if (updates.notes !== undefined) { fields.push('notes = ?'); values.push(updates.notes); }
    if (updates.status !== undefined) { fields.push('status = ?'); values.push(updates.status); }
    if (updates.dueDate !== undefined) { fields.push('due_date = ?'); values.push(updates.dueDate); }
    if (updates.allDay !== undefined) { fields.push('all_day = ?'); values.push(updates.allDay ? 1 : 0); }
    if (updates.recurrenceType !== undefined) { fields.push('recurrence_type = ?'); values.push(updates.recurrenceType); }
    if (updates.recurrenceInterval !== undefined) { fields.push('recurrence_interval = ?'); values.push(updates.recurrenceInterval); }
    if (updates.recurrenceDays !== undefined) { fields.push('recurrence_days = ?'); values.push(JSON.stringify(updates.recurrenceDays)); }
    if (updates.recurrenceEnd !== undefined) { fields.push('recurrence_end = ?'); values.push(updates.recurrenceEnd); }
    if (updates.nextOccurrence !== undefined) { fields.push('next_occurrence = ?'); values.push(updates.nextOccurrence); }
    if (updates.alertMinutes !== undefined) { fields.push('alert_minutes = ?'); values.push(updates.alertMinutes); }
    if (updates.notifyEmail !== undefined) { fields.push('notify_email = ?'); values.push(updates.notifyEmail ? 1 : 0); }
    if (updates.priority !== undefined) { fields.push('priority = ?'); values.push(updates.priority); }
    if (updates.tags !== undefined) { fields.push('tags = ?'); values.push(JSON.stringify(updates.tags)); }
    if (updates.completedAt !== undefined) { fields.push('completed_at = ?'); values.push(updates.completedAt); }

    fields.push('updated_at = ?');
    values.push(now);
    values.push(id);

    await db.execute(
      `UPDATE personal_todos SET ${fields.join(', ')} WHERE id = ?`,
      values
    );

    set((state) => ({
      reminders: state.reminders.map((r) =>
        r.id === id ? { ...r, ...updates, updatedAt: now } : r
      ),
    }));
    syncService.pushReminder(id).catch(() => {});
  },

  deleteReminder: async (id: string) => {
    const db = await getDb();
    const now = getTimestamp();
    await db.execute(
      'UPDATE personal_todos SET deleted = 1, updated_at = ? WHERE id = ?',
      [now, id]
    );
    set((state) => ({ reminders: state.reminders.filter((r) => r.id !== id) }));
    syncService.deleteReminderFromPb(id).catch(() => {});
  },

  completeReminder: async (id: string) => {
    const reminder = get().reminders.find((r) => r.id === id);
    if (!reminder) return;

    const now = getTimestamp();

    if (reminder.recurrenceType === 'none') {
      await get().updateReminder(id, { status: 'completed', completedAt: now });
    } else {
      const next = calculateNextOccurrence(reminder, new Date());
      if (next === null) {
        // Past recurrence end — mark completed
        await get().updateReminder(id, { status: 'completed', completedAt: now });
      } else {
        // Advance to next occurrence
        await get().updateReminder(id, {
          nextOccurrence: next,
          completedAt: now,
          status: 'pending',
        });
      }
    }
  },

  dismissReminder: async (id: string) => {
    const reminder = get().reminders.find((r) => r.id === id);
    if (!reminder) return;

    if (reminder.recurrenceType === 'none') {
      await get().updateReminder(id, { status: 'dismissed' });
    } else {
      // For recurring, advance to next occurrence
      const next = calculateNextOccurrence(reminder, new Date());
      if (next === null) {
        await get().updateReminder(id, { status: 'dismissed' });
      } else {
        await get().updateReminder(id, { nextOccurrence: next });
      }
    }
  },

  snoozeReminder: async (id: string, minutes: number) => {
    const snoozeUntil = new Date(Date.now() + minutes * 60 * 1000).toISOString();
    await get().updateReminder(id, { nextOccurrence: snoozeUntil });
  },

  getDeletedReminders: async () => {
    const db = await getDb();
    const rows = await db.select<ReminderRow[]>(
      `SELECT * FROM personal_todos WHERE deleted = 1 ORDER BY updated_at DESC`
    );
    return rows.map(rowToReminder);
  },

  restoreReminder: async (id: string) => {
    const db = await getDb();
    const now = getTimestamp();
    await db.execute(
      'UPDATE personal_todos SET deleted = 0, updated_at = ? WHERE id = ?',
      [now, id]
    );
    await get().loadReminders();
  },

  permanentlyDeleteReminder: async (id: string) => {
    const db = await getDb();
    await db.execute('DELETE FROM personal_todos WHERE id = ?', [id]);
    syncService.deleteReminderFromPb(id).catch(() => {});
  },

  getDueReminders: () => {
    const now = new Date();
    return get().reminders.filter((r) => {
      if (r.status !== 'pending') return false;
      if (r.nextOccurrence === null) return false;
      if (r.alertMinutes === -1) return false;
      const dueTime = new Date(r.nextOccurrence);
      const alertTime = new Date(dueTime.getTime() - r.alertMinutes * 60 * 1000);
      return alertTime <= now;
    });
  },
}));
