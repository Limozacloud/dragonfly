import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { IconPlus, IconSearch, IconCheck, IconEdit, IconTrash, IconRefresh, IconBell, IconBellOff, IconCalendar } from '@tabler/icons-react';
import { useReminderStore } from '../stores/reminderStore';
import { Reminder } from '../types/reminder';
import { Button } from './ui/button';
import { Input } from './ui/input';
import ReminderFormModal from './ReminderFormModal';

import { FilterTab } from '@/types/ui';
import { PRIORITY_COLORS } from '@/lib/constants';

function formatRelativeDate(isoDate: string | null, t: (k: string) => string): string {
  if (!isoDate) return '';
  const date = new Date(isoDate);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return t('reminders.overdue');
  if (diffDays === 0) return t('reminders.today');
  if (diffDays === 1) return t('reminders.tomorrow');
  if (diffDays === 2) return t('reminders.dayAfterTomorrow');
  if (diffDays <= 7) return t('reminders.inNDays').replace('{{n}}', String(diffDays));
  return date.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function RecurrenceChip({ type }: { type: string }) {
  const { t } = useTranslation();
  if (type === 'none') return null;
  const labels: Record<string, string> = {
    daily: t('reminders.recurrenceDaily'),
    weekly: t('reminders.recurrenceWeekly'),
    monthly: t('reminders.recurrenceMonthly'),
    yearly: t('reminders.recurrenceYearly'),
  };
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-600 border border-blue-200">
      <IconRefresh size={10} />
      {labels[type] || type}
    </span>
  );
}

interface ReminderCardProps {
  reminder: Reminder;
  onComplete: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function ReminderCard({ reminder, onComplete, onEdit, onDelete }: ReminderCardProps) {
  const { t } = useTranslation();
  const borderColor = PRIORITY_COLORS[reminder.priority];
  const isOverdue =
    reminder.nextOccurrence &&
    new Date(reminder.nextOccurrence) < new Date() &&
    reminder.status === 'pending';

  return (
    <div
      className="bg-white border border-border rounded-lg p-4 flex gap-3 group hover:shadow-sm transition-shadow"
      style={{ borderLeft: `4px solid ${borderColor}` }}
    >
      {/* Complete button */}
      <button
        className={`mt-0.5 w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
          reminder.status === 'completed'
            ? 'bg-green-500 border-green-500 text-white'
            : 'border-gray-300 hover:border-green-400 hover:bg-green-50'
        }`}
        onClick={onComplete}
        disabled={reminder.status === 'completed'}
        title={t('reminders.complete')}
      >
        {reminder.status === 'completed' && <IconCheck size={12} />}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2 flex-wrap">
          <span
            className={`font-medium text-sm ${
              reminder.status === 'completed' ? 'line-through text-muted-foreground' : 'text-foreground'
            }`}
          >
            {reminder.title}
          </span>
          <span
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
            style={{ backgroundColor: borderColor + '20', color: borderColor }}
          >
            {t(`task.priority${reminder.priority.charAt(0).toUpperCase() + reminder.priority.slice(1)}`)}
          </span>
          <RecurrenceChip type={reminder.recurrenceType} />
          {reminder.notifyEmail && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-purple-50 text-purple-600 border border-purple-200">
              <IconBell size={10} />
              {t('reminders.emailBadge')}
            </span>
          )}
        </div>

        {reminder.notes && (
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{reminder.notes}</p>
        )}

        <div className="flex items-center gap-3 mt-2 flex-wrap">
          {reminder.nextOccurrence && (
            <span
              className={`flex items-center gap-1 text-xs font-medium ${
                isOverdue ? 'text-red-500' : 'text-muted-foreground'
              }`}
            >
              <IconCalendar size={12} />
              {formatRelativeDate(reminder.nextOccurrence, t)}
              {!reminder.allDay &&
                ' ' +
                  new Date(reminder.nextOccurrence).toLocaleTimeString(undefined, {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
            </span>
          )}
          {reminder.tags.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              {reminder.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-1.5 py-0.5 bg-muted text-muted-foreground text-[10px] rounded"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Actions (visible on hover) */}
      <div className="flex items-start gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          onClick={onEdit}
          title={t('task.edit')}
        >
          <IconEdit size={14} />
        </button>
        <button
          className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors"
          onClick={onDelete}
          title={t('task.delete')}
        >
          <IconTrash size={14} />
        </button>
      </div>
    </div>
  );
}

export default function RemindersPage() {
  const { t } = useTranslation();
  const { reminders, loadReminders, completeReminder, deleteReminder } = useReminderStore();
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [search, setSearch] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);

  useEffect(() => {
    loadReminders();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const now = new Date();
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const weekEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const filtered = reminders.filter((r) => {
    if (search && !r.title.toLowerCase().includes(search.toLowerCase())) return false;

    switch (activeTab) {
      case 'today':
        return (
          r.status === 'pending' &&
          r.nextOccurrence !== null &&
          new Date(r.nextOccurrence) < todayEnd
        );
      case 'upcoming':
        return (
          r.status === 'pending' &&
          r.nextOccurrence !== null &&
          new Date(r.nextOccurrence) >= todayEnd &&
          new Date(r.nextOccurrence) < weekEnd
        );
      case 'completed':
        return r.status === 'completed' || r.status === 'dismissed';
      default:
        return r.status === 'pending';
    }
  });

  const tabs: { id: FilterTab; label: string }[] = [
    { id: 'all', label: t('reminders.filterAll') },
    { id: 'today', label: t('reminders.filterToday') },
    { id: 'upcoming', label: t('reminders.filterUpcoming') },
    { id: 'completed', label: t('reminders.filterCompleted') },
  ];

  const handleEdit = (reminder: Reminder) => {
    setEditingReminder(reminder);
    setIsFormOpen(true);
  };

  const handleCreate = () => {
    setEditingReminder(null);
    setIsFormOpen(true);
  };

  const handleFormClose = () => {
    setIsFormOpen(false);
    setEditingReminder(null);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="h-14 min-h-[56px] px-6 flex items-center justify-between bg-white border-b border-border shadow-sm">
        <h4 className="font-semibold text-foreground m-0">{t('sidebar.reminders')}</h4>
        <div className="flex items-center gap-3">
          <div className="relative">
            <IconSearch size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              className="h-7 w-[160px] pl-7 text-sm"
              placeholder={t('reminders.search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button size="sm" onClick={handleCreate}>
            <IconPlus size={16} className="mr-1" />
            {t('reminders.create')}
          </Button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex border-b border-border bg-white px-6 gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`px-4 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="flex-1 overflow-auto p-6">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <IconBellOff size={48} className="text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground text-sm">{t('reminders.empty')}</p>
            {activeTab === 'all' && (
              <Button size="sm" variant="outline" className="mt-4" onClick={handleCreate}>
                <IconPlus size={14} className="mr-1" />
                {t('reminders.create')}
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3 max-w-2xl mx-auto">
            {filtered.map((reminder) => (
              <ReminderCard
                key={reminder.id}
                reminder={reminder}
                onComplete={() => completeReminder(reminder.id)}
                onEdit={() => handleEdit(reminder)}
                onDelete={() => deleteReminder(reminder.id)}
              />
            ))}
          </div>
        )}
      </div>

      <ReminderFormModal
        isOpen={isFormOpen}
        onClose={handleFormClose}
        editingReminder={editingReminder}
      />
    </div>
  );
}
