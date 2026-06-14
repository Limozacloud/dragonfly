import { useDraggable } from '@dnd-kit/core';
import { IconStar, IconSubtask } from '@tabler/icons-react';
import { useTaskStore } from '../stores/taskStore';
import { Task } from '../types';
import { UserAvatar } from './ui/user-avatar';

interface TaskCardProps {
  task: Task;
  onClick: () => void;
  isDragging?: boolean;
  indented?: boolean;
}

function TaskCard({ task, onClick, isDragging = false, indented = false }: TaskCardProps) {
  const { releases, users } = useTaskStore();
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: task.id,
  });

  const release = task.releaseId
    ? releases.find((r) => r.id === task.releaseId)
    : null;

  const assignee = task.assigneeId
    ? users.find((u) => u.id === task.assigneeId)
    : null;

  const style = transform
    ? {
        transform: `translate(${transform.x}px, ${transform.y}px)`,
      }
    : undefined;

  const isFeature = task.type === 'feature';

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`bg-white border border-border p-2.5 mb-2 cursor-grab transition-all border-l-[3px] ${indented ? 'ml-4' : ''} ${
        isFeature
          ? 'border-l-warning bg-gradient-to-r from-amber-50 to-white'
          : 'border-l-accent'
      } ${
        isDragging ? 'opacity-50 cursor-grabbing rotate-3' : ''
      } hover:shadow-md hover:-translate-y-0.5 hover:border-l-accent`}
      onClick={onClick}
    >
      <div className="flex items-start gap-2">
        <span className="shrink-0 mt-0.5">
          {isFeature ? (
            <IconStar size={13} className="text-warning" />
          ) : (
            <IconSubtask size={13} className="text-muted-foreground" />
          )}
        </span>
        <div className="flex-1 min-w-0 font-medium text-[0.8rem] text-foreground break-words leading-snug flex items-center gap-1.5">
          {task.priority === 'high' && <span className="w-2 h-2 rounded-full bg-destructive shrink-0" />}
          {task.priority === 'medium' && <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />}
          {task.title}
        </div>
        {assignee && (
          <UserAvatar
            name={assignee.name}
            color={assignee.color}
            size="xs"
            className="shrink-0 mt-0.5"
          />
        )}
      </div>
      {(release || (task.tags && task.tags.length > 0)) && (
        <div className="flex items-center gap-1 mt-1.5 ml-[21px] flex-wrap">
          {release && (
            <span className="text-[0.6rem] text-muted-foreground font-medium">{release.name}</span>
          )}
          {task.tags && task.tags.length > 0 && (
            <>
              {task.tags.slice(0, 3).map((tag) => (
                <span key={tag} className="text-[0.6rem] text-muted-foreground/70 bg-muted px-1.5 py-0 leading-relaxed">
                  {tag}
                </span>
              ))}
              {task.tags.length > 3 && (
                <span className="text-muted-foreground/60 text-[0.6rem]">
                  +{task.tags.length - 3}
                </span>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default TaskCard;
