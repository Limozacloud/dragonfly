import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { IconBell, IconCheck, IconClock, IconX } from '@tabler/icons-react';
import { Reminder } from '../types/reminder';
import { useReminderStore } from '../stores/reminderStore';
import { Button } from './ui/button';

import { PRIORITY_COLORS, PRIORITY_GRADIENTS, CHIME_FREQUENCIES, CHIME_NOTE_DELAY_S, CHIME_NOTE_DURATION_S, CHIME_CONTEXT_CLOSE_DELAY_MS } from '@/lib/constants';

function playChime() {
  try {
    const ctx = new AudioContext();
    CHIME_FREQUENCIES.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = ctx.currentTime + i * CHIME_NOTE_DELAY_S;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + CHIME_NOTE_DURATION_S);
      osc.start(start);
      osc.stop(start + CHIME_NOTE_DURATION_S);
    });
    setTimeout(() => ctx.close(), CHIME_CONTEXT_CLOSE_DELAY_MS);
  } catch {
    // AudioContext not available — silently skip
  }
}

export default function ReminderAlertModal() {
  const { t } = useTranslation();
  const { completeReminder, dismissReminder, snoozeReminder } = useReminderStore();
  const [queue, setQueue] = useState<Reminder[]>([]);
  const [isVisible, setIsVisible] = useState(false);

  // Listen for dragonfly-reminder-due events
  useEffect(() => {
    const handler = (e: Event) => {
      const reminder = (e as CustomEvent<Reminder>).detail;
      setQueue((prev) => {
        // Avoid duplicates
        if (prev.some((r) => r.id === reminder.id)) return prev;
        playChime();
        return [...prev, reminder];
      });
    };
    window.addEventListener('dragonfly-reminder-due', handler);
    return () => window.removeEventListener('dragonfly-reminder-due', handler);
  }, []);

  // Show modal when queue has items
  useEffect(() => {
    setIsVisible(queue.length > 0);
  }, [queue]);

  const current = queue[0];

  const handleComplete = async () => {
    if (!current) return;
    await completeReminder(current.id);
    setQueue((prev) => prev.slice(1));
  };

  const handleSnooze = async () => {
    if (!current) return;
    await snoozeReminder(current.id, 15);
    setQueue((prev) => prev.slice(1));
  };

  const handleDismiss = async () => {
    if (!current) return;
    await dismissReminder(current.id);
    setQueue((prev) => prev.slice(1));
  };

  if (!isVisible || !current) return null;

  const gradient = PRIORITY_GRADIENTS[current.priority];
  const accentColor = PRIORITY_COLORS[current.priority];
  const recurrenceLabels: Record<string, string> = {
    none: '',
    daily: t('reminders.recurrenceDaily'),
    weekly: t('reminders.recurrenceWeekly'),
    monthly: t('reminders.recurrenceMonthly'),
    yearly: t('reminders.recurrenceYearly'),
  };
  const recurrenceLabel = recurrenceLabels[current.recurrenceType] || '';

  const formattedDue = current.nextOccurrence
    ? new Date(current.nextOccurrence).toLocaleString(undefined, {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        ...(current.allDay ? {} : { hour: '2-digit', minute: '2-digit' }),
      })
    : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleDismiss} />

      {/* Card */}
      <div className="relative w-full max-w-md rounded-2xl overflow-hidden shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-300">
        {/* Gradient header */}
        <div className={`bg-gradient-to-r ${gradient} px-6 py-5 text-white`}>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
              <IconBell size={22} />
            </div>
            <div className="flex-1">
              <p className="text-xs font-medium uppercase tracking-wider text-white/80">
                {t('reminders.alertTitle')}
              </p>
              {queue.length > 1 && (
                <p className="text-xs text-white/70">
                  +{queue.length - 1} {t('reminders.moreReminders')}
                </p>
              )}
            </div>
            <button
              className="w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
              onClick={handleDismiss}
            >
              <IconX size={14} />
            </button>
          </div>

          <h2 className="text-xl font-bold leading-tight">{current.title}</h2>

          {recurrenceLabel && (
            <span className="inline-block mt-1 text-xs bg-white/20 px-2 py-0.5 rounded-full">
              🔄 {recurrenceLabel}
            </span>
          )}
        </div>

        {/* Body */}
        <div className="bg-white px-6 py-4">
          {current.notes && (
            <p className="text-sm text-muted-foreground mb-3 leading-relaxed">{current.notes}</p>
          )}

          {formattedDue && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
              <IconClock size={15} style={{ color: accentColor }} />
              <span>{formattedDue}</span>
            </div>
          )}

          {/* Priority indicator */}
          <div
            className="h-1 rounded-full mb-5"
            style={{ backgroundColor: accentColor + '30' }}
          >
            <div
              className="h-full rounded-full"
              style={{ backgroundColor: accentColor, width: '100%' }}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 flex-col sm:flex-row">
            <Button
              className="flex-1"
              onClick={handleComplete}
            >
              <IconCheck size={16} className="mr-1.5" />
              {t('reminders.actionComplete')}
            </Button>
            <Button
              variant="outline"
              className="flex-1"
              onClick={handleSnooze}
            >
              <IconClock size={16} className="mr-1.5" />
              {t('reminders.actionSnooze')}
            </Button>
            <Button
              variant="ghost"
              className="text-muted-foreground"
              onClick={handleDismiss}
            >
              {t('reminders.actionDismiss')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
