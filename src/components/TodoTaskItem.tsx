import { useDraggable } from '@dnd-kit/core';
import { useTranslation } from 'react-i18next';
import { IconStar, IconSubtask, IconGripVertical } from '@tabler/icons-react';
import { Task, User } from '../types';
import { Badge } from './ui/badge';
import { UserAvatar } from './ui/user-avatar';

interface TodoTaskItemProps {
  task: Task;
  indent: boolean;
  assignee: User | null;
  statusColor: string;
  onTaskClick: (task: Task) => void;
}

function TodoTaskItem({ task, indent, assignee, statusColor, onTaskClick }: TodoTaskItemProps) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
  });

  const style = transform
    ? {
        transform: `translate(${transform.x}px, ${transform.y}px)`,
        opacity: isDragging ? 0.5 : 1,
      }
    : undefined;

  const getStatusVariant = () => {
    switch (statusColor) {
      case 'bg-success': return 'success' as const;
      case 'bg-warning': return 'warning' as const;
      case 'bg-primary': return 'default' as const;
      default: return 'secondary' as const;
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 p-3 bg-white border border-border mb-1 transition-all hover:shadow-sm hover:-translate-y-0.5 hover:bg-muted/30 hover:border-primary ${
        indent ? 'ml-8 border-l-2 border-l-accent' : ''
      } ${task.type === 'feature' ? 'border-l-[3px] border-l-warning' : ''}`}
    >
      {/* Drag Handle */}
      <div
        {...attributes}
        {...listeners}
        className="shrink-0 text-muted-foreground cursor-grab"
      >
        <IconGripVertical size={16} />
      </div>

      {/* Type Icon */}
      <div className="shrink-0">
        {task.type === 'feature' ? (
          <IconStar size={13} className="text-warning" />
        ) : (
          <IconSubtask size={13} className="text-muted-foreground" />
        )}
      </div>

      {/* Status */}
      <Badge variant={getStatusVariant()} className="min-w-[70px] justify-center text-[0.65rem]">
        {t(`kanban.${task.status}`)}
      </Badge>

      {/* Priority indicator */}
      {task.priority === 'high' && <span className="w-2 h-2 rounded-full bg-destructive shrink-0" />}
      {task.priority === 'medium' && <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />}

      {/* Title - clickable */}
      <div
        className="flex-1 cursor-pointer"
        onClick={() => onTaskClick(task)}
      >
        <span className={`text-[0.8rem] ${task.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>
          {task.title}
        </span>
      </div>

      {/* Tags */}
      {task.tags && task.tags.length > 0 && (
        <div className="flex gap-1">
          {task.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="text-[0.6rem] text-muted-foreground/70 bg-muted px-1.5 leading-relaxed">
              {tag}
            </span>
          ))}
          {task.tags.length > 3 && (
            <span className="text-muted-foreground/60 text-[0.6rem]">
              +{task.tags.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Assignee */}
      {assignee && (
        <UserAvatar
          name={assignee.name}
          color={assignee.color}
          size="xs"
        />
      )}
    </div>
  );
}

export default TodoTaskItem;
