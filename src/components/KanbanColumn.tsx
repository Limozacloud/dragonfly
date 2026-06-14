import { useDroppable } from '@dnd-kit/core';
import { useTranslation } from 'react-i18next';
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { Column, Task } from '../types';
import { Badge } from './ui/badge';
import TaskCard from './TaskCard';
import { useLayoutStore } from '@/stores/layoutStore';

interface KanbanColumnProps {
  column: Column;
  tasks: Task[];
  onTaskClick: (task: Task) => void;
}

function KanbanColumn({ column, tasks, onTaskClick }: KanbanColumnProps) {
  const { t } = useTranslation();
  const { isColumnCollapsed, toggleColumn } = useLayoutStore();
  const collapsed = isColumnCollapsed(column.id);
  const { setNodeRef, isOver } = useDroppable({
    id: column.id,
  });

  const columnTitle = t(`kanban.${column.id}`);

  if (collapsed) {
    return (
      <div
        ref={setNodeRef}
        className={`w-[40px] min-w-[40px] flex flex-col items-center bg-white shadow-md border border-border cursor-pointer transition-colors ${
          isOver ? 'bg-gradient-to-br from-accent/10 to-primary/10' : ''
        }`}
        onClick={() => toggleColumn(column.id)}
      >
        <div className="py-3 flex justify-center">
          <IconChevronRight size={14} className="text-muted-foreground" />
        </div>
        <Badge variant="secondary" className="text-[0.65rem] px-1 py-0 min-w-0">
          {tasks.length}
        </Badge>
        <div
          className="flex-1 flex items-center justify-center py-4"
          style={{ writingMode: 'vertical-rl' }}
        >
          <span className="text-[0.75rem] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">
            {columnTitle}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-w-[280px] flex flex-col bg-white shadow-md border border-border">
      <div className="px-4 py-3 font-semibold text-[0.875rem] uppercase tracking-wide text-muted-foreground border-b border-border flex items-center justify-between bg-[#fafafa]">
        <div className="flex items-center gap-2">
          <span>{columnTitle}</span>
          <Badge variant="secondary" className="text-[0.75rem]">{tasks.length}</Badge>
        </div>
        <button
          className="p-0.5 text-muted-foreground/50 hover:text-muted-foreground transition-colors bg-transparent border-0 cursor-pointer"
          onClick={() => toggleColumn(column.id)}
        >
          <IconChevronLeft size={14} />
        </button>
      </div>

      <div
        ref={setNodeRef}
        className={`flex-1 overflow-y-auto p-3 min-h-[100px] transition-colors ${
          isOver ? 'bg-gradient-to-br from-accent/10 to-primary/10' : ''
        }`}
      >
        {tasks.length === 0 ? (
          <div className="text-muted-foreground text-center py-8">
            <small>{t('kanban.noTasks')}</small>
          </div>
        ) : (
          (() => {
            const features = tasks.filter((t) => t.type === 'feature');
            const featureIds = new Set(features.map((f) => f.id));
            const childrenByFeature = new Map<string, Task[]>();
            const standalone: Task[] = [];

            for (const task of tasks) {
              if (task.type === 'feature') continue;
              if (task.featureId && featureIds.has(task.featureId)) {
                const arr = childrenByFeature.get(task.featureId) || [];
                arr.push(task);
                childrenByFeature.set(task.featureId, arr);
              } else {
                standalone.push(task);
              }
            }

            return (
              <>
                {features.map((feature) => (
                  <div key={feature.id}>
                    <TaskCard task={feature} onClick={() => onTaskClick(feature)} />
                    {(childrenByFeature.get(feature.id) || []).map((child) => (
                      <TaskCard key={child.id} task={child} onClick={() => onTaskClick(child)} indented />
                    ))}
                  </div>
                ))}
                {standalone.map((task) => (
                  <TaskCard key={task.id} task={task} onClick={() => onTaskClick(task)} />
                ))}
              </>
            );
          })()
        )}
      </div>
    </div>
  );
}

export default KanbanColumn;
