import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { IconChevronDown, IconChevronUp } from '@tabler/icons-react';
import { Reminder, ReminderPriority, RecurrenceType } from '../types/reminder';
import { useReminderStore } from '../stores/reminderStore';
import { getConfig } from '../services/database';
import { AppModal } from './ui/app-modal';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  editingReminder: Reminder | null;
}

const PRIORITY_OPTIONS: { value: ReminderPriority; color: string; labelKey: string }[] = [
  { value: 'low', color: '#22c55e', labelKey: 'task.priorityLow' },
  { value: 'medium', color: '#f59e0b', labelKey: 'task.priorityMedium' },
  { value: 'high', color: '#ef4444', labelKey: 'task.priorityHigh' },
];

const ALERT_OPTIONS = [
  { value: -1, labelKey: 'reminders.alertNone' },
  { value: 0, labelKey: 'reminders.alertAtTime' },
  { value: 5, labelKey: 'reminders.alert5min' },
  { value: 15, labelKey: 'reminders.alert15min' },
  { value: 30, labelKey: 'reminders.alert30min' },
  { value: 60, labelKey: 'reminders.alert1h' },
  { value: 1440, labelKey: 'reminders.alert1day' },
];

const RECURRENCE_OPTIONS: { value: RecurrenceType; labelKey: string }[] = [
  { value: 'none', labelKey: 'reminders.recurrenceNone' },
  { value: 'daily', labelKey: 'reminders.recurrenceDaily' },
  { value: 'weekly', labelKey: 'reminders.recurrenceWeekly' },
  { value: 'monthly', labelKey: 'reminders.recurrenceMonthly' },
  { value: 'yearly', labelKey: 'reminders.recurrenceYearly' },
];

// Day names: 0=Mon, 1=Tue, ..., 6=Sun (keys resolved via t() inside component)
const WEEKDAY_KEYS = [
  'reminders.weekdayMon',
  'reminders.weekdayTue',
  'reminders.weekdayWed',
  'reminders.weekdayThu',
  'reminders.weekdayFri',
  'reminders.weekdaySat',
  'reminders.weekdaySun',
];

function toLocalDateTimeValue(iso: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return '';
  }
}

function toLocalDateValue(iso: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  } catch {
    return '';
  }
}

export default function ReminderFormModal({ isOpen, onClose, editingReminder }: Props) {
  const { t } = useTranslation();
  const { addReminder, updateReminder } = useReminderStore();

  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [priority, setPriority] = useState<ReminderPriority>('medium');
  const [dueDate, setDueDate] = useState(''); // datetime-local value
  const [allDay, setAllDay] = useState(false);
  const [alertMinutes, setAlertMinutes] = useState(-1);
  const [notifyEmail, setNotifyEmail] = useState(false);
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>('none');
  const [recurrenceInterval, setRecurrenceInterval] = useState(1);
  const [recurrenceDays, setRecurrenceDays] = useState<number[]>([]);
  const [recurrenceEnd, setRecurrenceEnd] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [showRecurrence, setShowRecurrence] = useState(false);
  const [smtpConfigured, setSmtpConfigured] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    // Check SMTP configuration
    getConfig('smtp_host').then((v) => setSmtpConfigured(!!v));

    if (editingReminder) {
      setTitle(editingReminder.title);
      setNotes(editingReminder.notes);
      setPriority(editingReminder.priority);
      setAllDay(editingReminder.allDay);
      setDueDate(
        editingReminder.allDay
          ? toLocalDateValue(editingReminder.dueDate)
          : toLocalDateTimeValue(editingReminder.dueDate)
      );
      setAlertMinutes(editingReminder.alertMinutes);
      setNotifyEmail(editingReminder.notifyEmail);
      setRecurrenceType(editingReminder.recurrenceType);
      setRecurrenceInterval(editingReminder.recurrenceInterval);
      setRecurrenceDays(editingReminder.recurrenceDays);
      setRecurrenceEnd(toLocalDateValue(editingReminder.recurrenceEnd));
      setTags(editingReminder.tags);
      setShowRecurrence(editingReminder.recurrenceType !== 'none');
    } else {
      // Defaults
      setTitle('');
      setNotes('');
      setPriority('medium');
      setAllDay(false);
      setDueDate('');
      setAlertMinutes(0);
      setNotifyEmail(false);
      setRecurrenceType('none');
      setRecurrenceInterval(1);
      setRecurrenceDays([]);
      setRecurrenceEnd('');
      setTags([]);
      setShowRecurrence(false);
    }
    setTagInput('');
    setIsSaving(false);
  }, [isOpen, editingReminder]);

  const parseDueDate = (): string | null => {
    if (!dueDate) return null;
    if (allDay) {
      return new Date(dueDate + 'T00:00:00').toISOString();
    }
    return new Date(dueDate).toISOString();
  };

  const handleSave = async () => {
    if (!title.trim()) return;
    setIsSaving(true);
    try {
      const payload = {
        title: title.trim(),
        notes,
        priority,
        dueDate: parseDueDate(),
        allDay,
        recurrenceType,
        recurrenceInterval,
        recurrenceDays,
        recurrenceEnd: recurrenceEnd ? new Date(recurrenceEnd + 'T00:00:00').toISOString() : null,
        alertMinutes,
        notifyEmail,
        tags,
      };

      if (editingReminder) {
        await updateReminder(editingReminder.id, {
          ...payload,
          nextOccurrence: payload.dueDate, // reset on edit
        });
      } else {
        await addReminder(payload);
      }
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Enter' || e.key === ',') && tagInput.trim()) {
      e.preventDefault();
      const newTag = tagInput.trim().replace(/,$/, '');
      if (newTag && !tags.includes(newTag)) {
        setTags([...tags, newTag]);
      }
      setTagInput('');
    }
  };

  const removeTag = (tag: string) => setTags(tags.filter((t) => t !== tag));

  const toggleDay = (day: number) => {
    setRecurrenceDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  };

  const recurrenceUnitKey = () => {
    switch (recurrenceType) {
      case 'daily': return 'reminders.days';
      case 'weekly': return 'reminders.weeks';
      case 'monthly': return 'reminders.months';
      case 'yearly': return 'reminders.years';
      default: return '';
    }
  };

  return (
    <AppModal
      isOpen={isOpen}
      onClose={onClose}
      title={editingReminder ? t('reminders.edit') : t('reminders.create')}
      footer={
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onClose}>{t('task.cancel')}</Button>
          <Button onClick={handleSave} disabled={!title.trim() || isSaving}>
            {isSaving ? t('common.loading') : t('task.save')}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Title */}
        <div>
          <Label className="text-xs mb-1 block">{t('task.title')} *</Label>
          <Input
            autoFocus
            placeholder={t('reminders.titlePlaceholder')}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          />
        </div>

        {/* Priority */}
        <div>
          <Label className="text-xs mb-1 block">{t('task.priority')}</Label>
          <div className="flex gap-2">
            {PRIORITY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded border text-xs font-medium transition-colors ${
                  priority === opt.value
                    ? 'border-2'
                    : 'border border-border text-muted-foreground hover:border-gray-400'
                }`}
                style={priority === opt.value ? { borderColor: opt.color, color: opt.color } : {}}
                onClick={() => setPriority(opt.value)}
                type="button"
              >
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: opt.color }}
                />
                {t(opt.labelKey)}
              </button>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div>
          <Label className="text-xs mb-1 block">{t('task.content')}</Label>
          <textarea
            className="w-full border border-input rounded px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring min-h-[70px]"
            placeholder={t('reminders.notesPlaceholder')}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {/* Due date */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <Label className="text-xs">{t('reminders.dueDate')}</Label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => {
                  setAllDay(e.target.checked);
                  setDueDate(''); // reset on toggle
                }}
              />
              {t('reminders.allDay')}
            </label>
          </div>
          <Input
            type={allDay ? 'date' : 'datetime-local'}
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="text-sm"
          />
        </div>

        {/* Alert */}
        <div>
          <Label className="text-xs mb-1 block">{t('reminders.alert')}</Label>
          <select
            className="w-full border border-input rounded px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-ring"
            value={alertMinutes}
            onChange={(e) => setAlertMinutes(Number(e.target.value))}
          >
            {ALERT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
            ))}
          </select>
        </div>

        {/* Email notification (only if SMTP configured) */}
        {smtpConfigured && (
          <div className="flex items-center gap-2">
            <input
              id="notify-email"
              type="checkbox"
              checked={notifyEmail}
              onChange={(e) => setNotifyEmail(e.target.checked)}
            />
            <Label htmlFor="notify-email" className="text-sm cursor-pointer">
              {t('reminders.notifyEmail')}
            </Label>
          </div>
        )}

        {/* Tags */}
        <div>
          <Label className="text-xs mb-1 block">{t('task.tags')}</Label>
          <div className="flex flex-wrap gap-1 mb-1">
            {tags.map((tag) => (
              <span
                key={tag}
                className="flex items-center gap-1 px-2 py-0.5 bg-muted rounded text-xs"
              >
                {tag}
                <button
                  type="button"
                  className="hover:text-red-500 ml-0.5"
                  onClick={() => removeTag(tag)}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <Input
            placeholder={t('task.tagsPlaceholder')}
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={handleTagKeyDown}
            className="text-sm"
          />
        </div>

        {/* Recurrence (collapsible) */}
        <div className="border border-border rounded">
          <button
            type="button"
            className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-foreground hover:bg-muted/50"
            onClick={() => setShowRecurrence((v) => !v)}
          >
            <span>{t('reminders.recurrence')}</span>
            {showRecurrence ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
          </button>

          {showRecurrence && (
            <div className="px-3 pb-3 flex flex-col gap-3 border-t border-border pt-3">
              {/* Type */}
              <div>
                <Label className="text-xs mb-1 block">{t('reminders.recurrenceType')}</Label>
                <select
                  className="w-full border border-input rounded px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-ring"
                  value={recurrenceType}
                  onChange={(e) => {
                    setRecurrenceType(e.target.value as RecurrenceType);
                    setRecurrenceDays([]);
                  }}
                >
                  {RECURRENCE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
                  ))}
                </select>
              </div>

              {recurrenceType !== 'none' && (
                <>
                  {/* Interval */}
                  <div className="flex items-center gap-2">
                    <Label className="text-xs shrink-0">{t('reminders.recurrenceEvery')}</Label>
                    <Input
                      type="number"
                      min={1}
                      max={99}
                      value={recurrenceInterval}
                      onChange={(e) => setRecurrenceInterval(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-16 text-sm"
                    />
                    <span className="text-xs text-muted-foreground">{t(recurrenceUnitKey())}</span>
                  </div>

                  {/* Day selector for weekly */}
                  {recurrenceType === 'weekly' && (
                    <div>
                      <Label className="text-xs mb-1.5 block">{t('reminders.recurrenceDays')}</Label>
                      <div className="flex gap-1 flex-wrap">
                        {WEEKDAY_KEYS.map((key, idx) => (
                          <button
                            key={idx}
                            type="button"
                            className={`w-8 h-8 rounded text-xs font-medium transition-colors ${
                              recurrenceDays.includes(idx)
                                ? 'bg-primary text-white'
                                : 'bg-muted text-muted-foreground hover:bg-muted/80'
                            }`}
                            onClick={() => toggleDay(idx)}
                          >
                            {t(key)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* End date */}
                  <div>
                    <Label className="text-xs mb-1 block">{t('reminders.recurrenceEnd')}</Label>
                    <Input
                      type="date"
                      value={recurrenceEnd}
                      onChange={(e) => setRecurrenceEnd(e.target.value)}
                      className="text-sm"
                      placeholder={t('reminders.recurrenceEndNever')}
                    />
                    {recurrenceEnd && (
                      <button
                        type="button"
                        className="text-xs text-muted-foreground mt-1 hover:text-foreground"
                        onClick={() => setRecurrenceEnd('')}
                      >
                        {t('reminders.recurrenceEndNever')}
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </AppModal>
  );
}
