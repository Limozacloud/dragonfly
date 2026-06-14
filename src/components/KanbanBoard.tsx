import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { useState } from 'react';
import { useTaskStore } from '../stores/taskStore';
import { Task, COLUMNS, TaskStatus } from '../types';
import KanbanColumn from './KanbanColumn';
import TaskCard from './TaskCard';

interface KanbanBoardProps {
  onTaskClick: (task: Task) => void;
  showDone?: boolean;
}

function KanbanBoard({ onTaskClick, showDone = true }: KanbanBoardProps) {
  const { getFilteredTasks, moveTask, moveTasks, releases } = useTaskStore();
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const allTasks = getFilteredTasks();

  // When showDone is off, hide features whose tasks are ALL done,
  // and hide their child tasks too
  const tasks = (() => {
    if (showDone) return allTasks;

    // Find features where every child task (and the feature itself) is "done"
    const doneFeatureIds = new Set<string>();
    const features = allTasks.filter((t) => t.type === 'feature');
    for (const feature of features) {
      const children = allTasks.filter((t) => t.featureId === feature.id);
      const allDone = feature.status === 'done' && children.every((c) => c.status === 'done');
      if (allDone) doneFeatureIds.add(feature.id);
    }

    return allTasks.filter((t) => {
      if (doneFeatureIds.has(t.id)) return false;
      if (t.featureId && doneFeatureIds.has(t.featureId)) return false;
      return true;
    });
  })();

  const releaseOrder = [...releases].sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }));
  const releaseIndex = new Map(releaseOrder.map((r, i) => [r.id, i]));

  const sortByRelease = (a: Task, b: Task) => {
    const ai = a.releaseId ? (releaseIndex.get(a.releaseId) ?? 999) : 1000;
    const bi = b.releaseId ? (releaseIndex.get(b.releaseId) ?? 999) : 1000;
    return ai - bi;
  };

  const getTasksByStatus = (status: TaskStatus) => {
    return tasks.filter((task) => task.status === status).sort(sortByRelease);
  };

  const handleDragStart = (event: DragStartEvent) => {
    const task = tasks.find((t) => t.id === event.active.id);
    if (task) {
      setActiveTask(task);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);

    if (!over) return;

    const taskId = active.id as string;
    const newStatus = over.id as TaskStatus;

    if (COLUMNS.some((col) => col.id === newStatus)) {
      const task = allTasks.find((t) => t.id === taskId);
      if (task && task.status !== newStatus) {
        if (task.type === 'feature') {
          // Batch-move feature + children in one state update + one DB query
          const idsToMove = [taskId, ...allTasks
            .filter((t) => t.featureId === taskId && t.status !== newStatus)
            .map((t) => t.id)];
          moveTasks(idsToMove, newStatus);
        } else {
          moveTask(taskId, newStatus);
        }
      }
    }
  };

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 h-full min-h-0 pb-4 overflow-x-auto">
        {COLUMNS.map((column) => (
          <KanbanColumn
            key={column.id}
            column={column}
            tasks={getTasksByStatus(column.id)}
            onTaskClick={onTaskClick}
          />
        ))}
      </div>

      <DragOverlay>
        {activeTask && (
          <TaskCard task={activeTask} onClick={() => {}} isDragging />
        )}
      </DragOverlay>
    </DndContext>
  );
}

export default KanbanBoard;
