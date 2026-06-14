import { useState, KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useTaskStore } from '../stores/taskStore';
import { TaskStatus } from '../types';
import { Input } from './ui/input';

interface QuickAddTaskProps {
  status: TaskStatus;
}

function QuickAddTask({ status }: QuickAddTaskProps) {
  const { t } = useTranslation();
  const { addTask } = useTaskStore();
  const [title, setTitle] = useState('');

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && title.trim()) {
      addTask({
        title: title.trim(),
        content: '',
        status,
        type: 'task',
        releaseId: null,
        assigneeId: null,
        featureId: null,
        priority: 'low',
        tags: [],
      });
      setTitle('');
    }
  };

  return (
    <div>
      <Input
        placeholder={t('kanban.addTask')}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={handleKeyDown}
        className="h-7 text-xs"
      />
    </div>
  );
}

export default QuickAddTask;
