import { describe, it, expect } from 'vitest';
import { calculateNextOccurrence, type Reminder } from '@/types/reminder';

const base: Reminder = {
  id: '1',
  title: 'Test',
  notes: '',
  status: 'pending',
  dueDate: null,
  allDay: false,
  recurrenceType: 'daily',
  recurrenceInterval: 1,
  recurrenceDays: [],
  recurrenceEnd: null,
  nextOccurrence: null,
  alertMinutes: -1,
  notifyEmail: false,
  priority: 'medium',
  tags: [],
  completedAt: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const date = (iso: string) => new Date(iso);

describe('calculateNextOccurrence', () => {
  it('returns null for non-recurring reminders', () => {
    const r = { ...base, recurrenceType: 'none' as const };
    expect(calculateNextOccurrence(r, date('2026-01-01T10:00:00Z'))).toBeNull();
  });

  it('adds interval days for daily recurrence', () => {
    const r = { ...base, recurrenceType: 'daily' as const, recurrenceInterval: 3 };
    const result = calculateNextOccurrence(r, date('2026-01-01T10:00:00Z'));
    expect(result).toBe(new Date('2026-01-04T10:00:00Z').toISOString());
  });

  it('daily recurrence with interval 1', () => {
    const r = { ...base, recurrenceType: 'daily' as const, recurrenceInterval: 1 };
    const result = calculateNextOccurrence(r, date('2026-06-13T08:00:00Z'));
    expect(result).toBe(new Date('2026-06-14T08:00:00Z').toISOString());
  });

  it('adds interval months for monthly recurrence', () => {
    const r = { ...base, recurrenceType: 'monthly' as const, recurrenceInterval: 2 };
    const result = calculateNextOccurrence(r, date('2026-01-15T00:00:00Z'));
    expect(result).toBe(new Date('2026-03-15T00:00:00Z').toISOString());
  });

  it('adds interval years for yearly recurrence', () => {
    const r = { ...base, recurrenceType: 'yearly' as const, recurrenceInterval: 1 };
    const result = calculateNextOccurrence(r, date('2026-06-13T00:00:00Z'));
    expect(result).toBe(new Date('2027-06-13T00:00:00Z').toISOString());
  });

  it('adds 7 * interval days for weekly without specific days', () => {
    const r = { ...base, recurrenceType: 'weekly' as const, recurrenceInterval: 2, recurrenceDays: [] };
    const result = calculateNextOccurrence(r, date('2026-01-01T00:00:00Z'));
    expect(result).toBe(new Date('2026-01-15T00:00:00Z').toISOString());
  });

  it('returns null when next occurrence is past recurrenceEnd', () => {
    const r = {
      ...base,
      recurrenceType: 'daily' as const,
      recurrenceInterval: 1,
      recurrenceEnd: '2026-01-01',
    };
    const result = calculateNextOccurrence(r, date('2026-01-01T12:00:00Z'));
    expect(result).toBeNull();
  });

  it('returns a date when next occurrence is before recurrenceEnd', () => {
    const r = {
      ...base,
      recurrenceType: 'daily' as const,
      recurrenceInterval: 1,
      recurrenceEnd: '2027-12-31',
    };
    const result = calculateNextOccurrence(r, date('2026-01-01T00:00:00Z'));
    expect(result).not.toBeNull();
  });
});
