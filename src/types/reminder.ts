export type ReminderStatus = 'pending' | 'completed' | 'dismissed';
export type RecurrenceType = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
export type ReminderPriority = 'low' | 'medium' | 'high';

export interface Reminder {
  id: string;
  title: string;
  notes: string;
  status: ReminderStatus;
  dueDate: string | null;         // ISO datetime (same as nextOccurrence for non-recurring)
  allDay: boolean;
  recurrenceType: RecurrenceType;
  recurrenceInterval: number;     // every N days/weeks/etc
  recurrenceDays: number[];       // 0-6 for weekly (0=Mon, 6=Sun)
  recurrenceEnd: string | null;   // ISO date when recurrence stops
  nextOccurrence: string | null;  // computed, used for polling
  alertMinutes: number;           // -1=none, 0=at time, 5,15,30,60,1440
  notifyEmail: boolean;
  priority: ReminderPriority;
  tags: string[];
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function calculateNextOccurrence(reminder: Reminder, fromDate: Date): string | null {
  if (reminder.recurrenceType === 'none') return null;

  const next = new Date(fromDate);

  switch (reminder.recurrenceType) {
    case 'daily':
      next.setDate(next.getDate() + reminder.recurrenceInterval);
      break;
    case 'weekly': {
      if (reminder.recurrenceDays.length > 0) {
        // recurrenceDays: 0=Mon..6=Sun; Date.getDay(): 0=Sun,1=Mon..6=Sat
        const toAppDay = (d: number) => (d === 0 ? 6 : d - 1);
        const currentDay = toAppDay(next.getDay());
        const sorted = [...reminder.recurrenceDays].sort((a, b) => a - b);
        const nextDay = sorted.find((d) => d > currentDay) ?? sorted[0];
        const daysUntil =
          nextDay > currentDay ? nextDay - currentDay : 7 - currentDay + nextDay;
        next.setDate(next.getDate() + daysUntil);
      } else {
        next.setDate(next.getDate() + 7 * reminder.recurrenceInterval);
      }
      break;
    }
    case 'monthly':
      next.setMonth(next.getMonth() + reminder.recurrenceInterval);
      break;
    case 'yearly':
      next.setFullYear(next.getFullYear() + reminder.recurrenceInterval);
      break;
  }

  if (reminder.recurrenceEnd && next > new Date(reminder.recurrenceEnd)) {
    return null; // past end date — signal completion
  }

  return next.toISOString();
}
