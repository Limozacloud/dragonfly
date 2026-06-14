import { useTranslation } from 'react-i18next';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
} from '@dnd-kit/core';
import React, { useState } from 'react';
import { IconStar, IconSubtask, IconTag, IconChevronRight, IconPlus } from '@tabler/icons-react';
import { useTaskStore } from '../stores/taskStore';
import { Task, User } from '../types';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardHeader, CardContent } from './ui/card';
import { Progress } from './ui/progress';
import TodoTaskItem from './TodoTaskItem';
import { UserAvatar } from './ui/user-avatar';

interface TodoPageProps {
  onTaskClick: (task: Task) => void;
  view?: 'cards' | 'list';
  releaseFilter?: string | null;
  featureFilter?: string | null;
  tagFilter?: string | null;
  showDone?: boolean;
  searchQuery?: string;
  onQuickAdd?: (releaseId: string | null, featureId: string | null) => void;
}

function DropZone({ id, children, className }: { id: string; children: React.ReactNode; className?: string }) {
  const { setNodeRef, isOver } = useDroppable({ id });

  const getOverClass = () => {
    if (!isOver) return '';
    if (id.startsWith('feature:')) return 'bg-gradient-to-br from-warning/15 to-amber-300/15 border-2 border-dashed border-warning p-1';
    return 'bg-gradient-to-br from-accent/10 to-primary/10 border-2 border-dashed border-primary';
  };

  return (
    <div ref={setNodeRef} className={`${className || ''} ${getOverClass()}`}>
      {children}
    </div>
  );
}

function TodoPage({ onTaskClick, view = 'cards', releaseFilter, featureFilter, tagFilter, showDone, searchQuery, onQuickAdd }: TodoPageProps) {
  const { t } = useTranslation();
  const { tasks: allTasks, releases, users, updateTask } = useTaskStore();
  const [activeTask, setActiveTask] = useState<Task | null>(null);

  const tasks = allTasks.filter((task) => {
    if (!showDone && task.status === 'done') return false;
    if (releaseFilter && task.releaseId !== releaseFilter) return false;
    if (featureFilter) {
      if (task.type === 'feature') return task.id === featureFilter;
      return task.featureId === featureFilter;
    }
    if (tagFilter && !(task.tags || []).includes(tagFilter)) return false;
    if (searchQuery && !task.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const allReleaseKeys = releaseFilter
    ? [releaseFilter]
    : featureFilter
      ? (() => {
          const feature = allTasks.find((t) => t.id === featureFilter);
          return feature?.releaseId ? [feature.releaseId] : ['no-release'];
        })()
      : [...[...releases].sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true })).map(r => r.id), 'no-release'];

  const tasksByRelease = tasks.reduce((acc, task) => {
    const releaseKey = task.releaseId || 'no-release';
    if (!acc[releaseKey]) {
      acc[releaseKey] = [];
    }
    acc[releaseKey].push(task);
    return acc;
  }, {} as Record<string, Task[]>);

  const getReleaseName = (releaseId: string) => {
    if (releaseId === 'no-release') return t('kanban.backlog');
    const release = releases.find((r) => r.id === releaseId);
    return release?.name || releaseId;
  };

  const getAssignee = (assigneeId: string | null): User | null => {
    if (!assigneeId) return null;
    return users.find((u) => u.id === assigneeId) ?? null;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'done': return 'bg-success';
      case 'in_progress': return 'bg-primary';
      case 'review': return 'bg-warning';
      default: return 'bg-secondary';
    }
  };

  const getProgressColor = (percent: number) => {
    if (percent === 100) return '#22c55e';
    if (percent >= 60) return '#3b82f6';
    if (percent >= 30) return '#f59e0b';
    return '#94a3b8';
  };

  const getReleaseProgress = (releaseTasks: Task[]) => {
    const total = releaseTasks.length;
    const done = releaseTasks.filter(t => t.status === 'done').length;
    const percent = total > 0 ? Math.round((done / total) * 100) : 0;
    return { total, done, percent };
  };

  const organizeTasksInRelease = (releaseTasks: Task[]) => {
    const features = releaseTasks.filter((t) => t.type === 'feature');
    const tasksOnly = releaseTasks.filter((t) => t.type !== 'feature');
    const tasksWithFeatureInRelease = tasksOnly.filter((t) =>
      t.featureId && features.some((f) => f.id === t.featureId)
    );
    const orphanTasks = tasksOnly.filter((t) =>
      !t.featureId || !features.some((f) => f.id === t.featureId)
    );
    return { features, tasksWithFeatureInRelease, orphanTasks };
  };

  const handleDragStart = (event: DragStartEvent) => {
    const task = allTasks.find((t) => t.id === event.active.id);
    if (task) {
      setActiveTask(task);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveTask(null);

    if (!over) return;

    const taskId = active.id as string;
    const dropId = over.id as string;
    const task = allTasks.find((t) => t.id === taskId);

    if (!task) return;

    if (dropId.startsWith('release:')) {
      const releaseId = dropId.replace('release:', '');
      const newReleaseId = releaseId === 'no-release' ? null : releaseId;
      updateTask(taskId, { releaseId: newReleaseId, featureId: null });
    } else if (dropId.startsWith('no-feature:')) {
      const releaseId = dropId.replace('no-feature:', '');
      const newReleaseId = releaseId === 'no-release' ? null : releaseId;
      updateTask(taskId, { releaseId: newReleaseId, featureId: null });
    } else if (dropId.startsWith('feature:')) {
      const featureId = dropId.replace('feature:', '');
      if (task.type === 'task') {
        const feature = allTasks.find(t => t.id === featureId);
        if (feature) {
          updateTask(taskId, {
            featureId,
            releaseId: feature.releaseId
          });
        }
      }
    }
  };

  if (view === 'list') {
    const statusOrder: Record<string, number> = { in_progress: 0, review: 1, todo: 2, backlog: 3, done: 4 };
    const sortByStatus = (a: Task, b: Task) => (statusOrder[a.status] ?? 5) - (statusOrder[b.status] ?? 5);

    const getBadgeVariant = (status: string) => {
      if (status === 'done') return 'success';
      if (status === 'review') return 'warning';
      if (status === 'in_progress') return 'default';
      return 'secondary';
    };

    const renderTaskRow = (task: Task, indent: number) => {
      const assignee = getAssignee(task.assigneeId);
      const isFeature = task.type === 'feature';
      return (
        <tr
          key={task.id}
          className="border-b border-border hover:bg-muted/30 cursor-pointer transition-colors group"
          onClick={() => onTaskClick(task)}
        >
          <td className="py-2 px-3" style={{ paddingLeft: `${12 + indent * 20}px` }}>
            <div className="flex items-center gap-2">
              {indent > 0 && (
                <IconChevronRight size={12} className="text-muted-foreground/40" />
              )}
              {isFeature ? (
                <IconStar size={16} className="text-warning shrink-0" />
              ) : (
                <IconSubtask size={16} className="text-muted-foreground shrink-0" />
              )}
              <span className={`${task.status === 'done' ? 'line-through text-muted-foreground' : ''} ${isFeature ? 'font-medium' : ''}`}>
                {task.title}
              </span>
              {isFeature && onQuickAdd && (
                <button
                  type="button"
                  className="p-0.5 text-muted-foreground hover:text-primary hover:bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => { e.stopPropagation(); onQuickAdd(task.releaseId, task.id); }}
                  title={t('kanban.addTask')}
                >
                  <IconPlus size={14} />
                </button>
              )}
            </div>
          </td>
          <td className="py-2 px-3">
            <Badge variant={getBadgeVariant(task.status)} className="text-[0.7rem] whitespace-nowrap">
              {t(`kanban.${task.status}`)}
            </Badge>
          </td>
          <td className="py-2 px-3">
            <div className="flex gap-1 flex-wrap">
              {task.tags?.slice(0, 2).map((tag) => (
                <Badge key={tag} variant="secondary" className="text-[0.65rem] bg-primary/70">
                  {tag}
                </Badge>
              ))}
              {task.tags && task.tags.length > 2 && (
                <Badge variant="secondary" className="text-[0.65rem] bg-primary/70">
                  +{task.tags.length - 2}
                </Badge>
              )}
            </div>
          </td>
          <td className="py-2 px-3">
            {assignee && (
              <UserAvatar name={assignee.name} color={assignee.color} size="xs" />
            )}
          </td>
        </tr>
      );
    };

    return (
      <div>
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 select-none">
            <IconSubtask size={40} className="text-muted-foreground/20 mb-4" />
            <p className="text-muted-foreground text-sm mb-4">{t('kanban.noTasks')}</p>
            {onQuickAdd && (
              <Button size="sm" variant="outline" onClick={() => onQuickAdd(null, null)}>
                <IconPlus size={16} className="mr-1" />
                {t('dashboard.createTask')}
              </Button>
            )}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground whitespace-nowrap">
                <th className="py-2 px-3 font-medium">{t('task.title')}</th>
                <th className="py-2 px-3 font-medium">{t('task.status')}</th>
                <th className="py-2 px-3 font-medium">{t('task.tags')}</th>
                <th className="py-2 px-3 font-medium">{t('task.assignee')}</th>
              </tr>
            </thead>
            <tbody>
              {allReleaseKeys.map((releaseKey) => {
                const releaseTasks = tasksByRelease[releaseKey] || [];
                if (releaseTasks.length === 0) return null;
                const { features, tasksWithFeatureInRelease, orphanTasks } = organizeTasksInRelease(releaseTasks);
                const progress = getReleaseProgress(releaseTasks);

                return (
                  <React.Fragment key={releaseKey}>
                    {/* Release header row */}
                    <tr className="bg-muted/50 border-b border-border group/release">
                      <td className="py-2 px-3" colSpan={3}>
                        <div className="flex items-center gap-2">
                          <IconTag size={16} className="text-primary shrink-0" />
                          <span className="font-semibold text-foreground">{getReleaseName(releaseKey)}</span>
                          <span className="text-muted-foreground text-xs ml-1">
                            {progress.done}/{progress.total}
                          </span>
                          {onQuickAdd && (
                            <button
                              type="button"
                              className="p-0.5 text-muted-foreground hover:text-primary hover:bg-primary/10 opacity-0 group-hover/release:opacity-100 transition-opacity"
                              onClick={(e) => { e.stopPropagation(); onQuickAdd(releaseKey === 'no-release' ? null : releaseKey, null); }}
                              title={t('kanban.addTask')}
                            >
                              <IconPlus size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="py-2 px-3 text-right">
                        <span
                          className="inline-flex items-center px-1.5 py-0.5 text-[0.7rem] font-semibold text-white"
                          style={{ backgroundColor: getProgressColor(progress.percent) }}
                        >
                          {progress.percent}%
                        </span>
                      </td>
                    </tr>

                    {/* Features with their subtasks */}
                    {features.sort(sortByStatus).map((feature) => {
                      const subTasks = tasksWithFeatureInRelease
                        .filter((t) => t.featureId === feature.id)
                        .sort(sortByStatus);
                      return (
                        <React.Fragment key={feature.id}>
                          {renderTaskRow(feature, 1)}
                          {subTasks.map((subTask) => renderTaskRow(subTask, 2))}
                        </React.Fragment>
                      );
                    })}

                    {/* Orphan tasks (no feature) */}
                    {orphanTasks.sort(sortByStatus).map((task) => renderTaskRow(task, 1))}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="space-y-4">
        {allReleaseKeys.map((releaseKey) => {
          const releaseTasks = tasksByRelease[releaseKey] || [];
          if (releaseTasks.length === 0) return null;
          const { features, tasksWithFeatureInRelease, orphanTasks } = organizeTasksInRelease(releaseTasks);
          const hasFeatures = features.length > 0;
          const progress = getReleaseProgress(releaseTasks);

          return (
            <DropZone
              key={releaseKey}
              id={`release:${releaseKey}`}
            >
              <Card className="transition-all hover:shadow-lg hover:-translate-y-0.5">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-[0.8rem]">{getReleaseName(releaseKey)}</span>
                      <Badge variant="secondary">{t('project.tasks', { count: releaseTasks.length })}</Badge>
                      {onQuickAdd && (
                        <button
                          type="button"
                          className="p-0.5 text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                          onClick={(e) => { e.stopPropagation(); onQuickAdd(releaseKey === 'no-release' ? null : releaseKey, null); }}
                          title={t('kanban.addTask')}
                        >
                          <IconPlus size={16} />
                        </button>
                      )}
                    </div>
                    <span
                      className="inline-flex items-center px-1.5 py-0.5 text-[0.7rem] font-semibold text-white"
                      style={{ backgroundColor: getProgressColor(progress.percent) }}
                    >
                      {progress.percent}%
                    </span>
                  </div>
                  <div className="mt-2">
                    <Progress value={progress.percent} indicatorColor={getProgressColor(progress.percent)} />
                    <small className="text-[#8893a7] mt-1 block">{t('task.progressDone', { done: progress.done, total: progress.total })}</small>
                  </div>
                </CardHeader>

                <CardContent>
                  {releaseTasks.length > 0 || hasFeatures ? (
                    <div>
                      {features.map((feature) => {
                        const subTasks = tasksWithFeatureInRelease.filter(t => t.featureId === feature.id);
                        return (
                          <DropZone
                            key={feature.id}
                            id={`feature:${feature.id}`}
                            className="mb-3 transition-all"
                          >
                            <div className="border border-border border-l-[3px] border-l-warning bg-gradient-to-r from-amber-50 to-white p-2 group/feature">
                              <div className="flex items-center">
                                <div className="flex-1 min-w-0">
                                  <TodoTaskItem
                                    task={feature}
                                    indent={false}
                                    assignee={getAssignee(feature.assigneeId)}
                                    statusColor={getStatusColor(feature.status)}
                                    onTaskClick={onTaskClick}
                                  />
                                </div>
                                {onQuickAdd && (
                                  <button
                                    type="button"
                                    className="p-0.5 text-muted-foreground hover:text-primary hover:bg-primary/10 opacity-0 group-hover/feature:opacity-100 transition-opacity shrink-0 ml-1"
                                    onClick={(e) => { e.stopPropagation(); onQuickAdd(feature.releaseId, feature.id); }}
                                    title={t('kanban.addTask')}
                                  >
                                    <IconPlus size={14} />
                                  </button>
                                )}
                              </div>
                              {subTasks.map((subTask) => (
                                <TodoTaskItem
                                  key={subTask.id}
                                  task={subTask}
                                  indent={true}
                                  assignee={getAssignee(subTask.assigneeId)}
                                  statusColor={getStatusColor(subTask.status)}
                                  onTaskClick={onTaskClick}
                                />
                              ))}
                            </div>
                          </DropZone>
                        );
                      })}

                      {(orphanTasks.length > 0 || hasFeatures) && (
                        <DropZone
                          id={`no-feature:${releaseKey}`}
                          className="mt-2 min-h-[2rem] p-1 border border-dashed border-transparent transition-all"
                        >
                          {hasFeatures && orphanTasks.length === 0 && (
                            <div className="text-muted-foreground text-center py-2 text-sm">
                              {t('task.noFeature')}
                            </div>
                          )}
                          {orphanTasks.map((task) => (
                            <TodoTaskItem
                              key={task.id}
                              task={task}
                              indent={false}
                              assignee={getAssignee(task.assigneeId)}
                              statusColor={getStatusColor(task.status)}
                              onTaskClick={onTaskClick}
                            />
                          ))}
                        </DropZone>
                      )}
                    </div>
                  ) : (
                    <div className="text-muted-foreground text-center py-6 border border-dashed border-border">
                      {t('kanban.noTasks')}
                    </div>
                  )}
                </CardContent>
              </Card>
            </DropZone>
          );
        })}

        {tasks.length === 0 && releases.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 select-none">
            <IconSubtask size={40} className="text-muted-foreground/20 mb-4" />
            <p className="text-muted-foreground text-sm mb-4">{t('kanban.noTasks')}</p>
            {onQuickAdd && (
              <Button size="sm" variant="outline" onClick={() => onQuickAdd(null, null)}>
                <IconPlus size={16} className="mr-1" />
                {t('dashboard.createTask')}
              </Button>
            )}
          </div>
        )}
      </div>

      <DragOverlay>
        {activeTask && (
          <div className="flex items-center gap-3 bg-white shadow-lg p-3">
            {activeTask.type === 'feature' ? (
              <IconStar size={18} className="text-warning" />
            ) : (
              <IconSubtask size={18} className="text-muted-foreground" />
            )}
            <span>{activeTask.title}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

export default TodoPage;
