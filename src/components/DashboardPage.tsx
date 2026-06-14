import { useTranslation } from 'react-i18next';
import { useTaskStore } from '../stores/taskStore';
import { Task } from '../types';
import { Card, CardContent } from './ui/card';
import { Progress } from './ui/progress';
import { IconRocket, IconStar, IconSubtask, IconNote } from '@tabler/icons-react';

function getProgress(tasks: Task[]) {
  if (tasks.length === 0) return { total: 0, done: 0, percent: 0 };
  const done = tasks.filter((t) => t.status === 'done').length;
  return { total: tasks.length, done, percent: Math.round((done / tasks.length) * 100) };
}

function getStatusCounts(tasks: Task[]) {
  return {
    backlog: tasks.filter((t) => t.status === 'backlog').length,
    todo: tasks.filter((t) => t.status === 'todo').length,
    in_progress: tasks.filter((t) => t.status === 'in_progress').length,
    review: tasks.filter((t) => t.status === 'review').length,
    done: tasks.filter((t) => t.status === 'done').length,
  };
}

function StatusDots({ counts }: { counts: ReturnType<typeof getStatusCounts> }) {
  const items = [
    { key: 'backlog', color: '#94a3b8' },
    { key: 'todo', color: '#3b82f6' },
    { key: 'in_progress', color: '#f59e0b' },
    { key: 'review', color: '#a855f7' },
    { key: 'done', color: '#22c55e' },
  ];

  return (
    <div className="flex gap-3 mt-2">
      {items.map((item) => {
        const count = counts[item.key as keyof typeof counts];
        if (count === 0) return null;
        return (
          <span
            key={item.key}
            className="flex items-center gap-1 text-[0.75rem] text-[#8893a7]"
          >
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            {count}
          </span>
        );
      })}
    </div>
  );
}

function getProgressColor(percent: number) {
  if (percent === 100) return '#22c55e';
  if (percent >= 60) return '#3b82f6';
  if (percent >= 30) return '#f59e0b';
  return '#94a3b8';
}

function isReleaseDone(releaseId: string, tasks: Task[]) {
  const releaseTasks = tasks.filter((t) => t.releaseId === releaseId);
  return releaseTasks.length > 0 && releaseTasks.every((t) => t.status === 'done');
}

function isFeatureDone(feature: Task, tasks: Task[]) {
  const subTasks = tasks.filter((t) => t.featureId === feature.id);
  const allItems = [feature, ...subTasks];
  return allItems.every((t) => t.status === 'done');
}

interface DashboardPageProps {
  showDone: boolean;
  onReleaseClick?: (releaseId: string) => void;
  onFeatureClick?: (featureId: string, releaseId: string | null) => void;
  onCreateRelease?: () => void;
  onCreateFeature?: () => void;
  onCreateTask?: () => void;
  onCreateNote?: () => void;
}

function DashboardPage({ showDone, onReleaseClick, onFeatureClick, onCreateRelease, onCreateFeature, onCreateTask, onCreateNote }: DashboardPageProps) {
  const { t } = useTranslation();
  const { tasks, releases } = useTaskStore();

  const features = tasks.filter((t) => t.type === 'feature');

  const filteredReleases = (showDone
    ? releases
    : releases.filter((r) => !isReleaseDone(r.id, tasks))
  ).sort((a, b) => a.name.localeCompare(b.name));

  const filteredFeatures = (showDone
    ? [...features]
    : features.filter((f) => !isFeatureDone(f, tasks))
  ).sort((a, b) => a.title.localeCompare(b.title));
  const isEmpty = filteredReleases.length === 0 && filteredFeatures.length === 0;

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center h-full select-none">
        <img
          src="/images/dragonfly-sidebar.svg"
          alt="DragonFly"
          className="w-20 h-20 opacity-20 mb-6"
          draggable={false}
        />
        <p className="text-muted-foreground text-sm mb-8">{t('dashboard.welcome')}</p>
        <div className="flex gap-4">
          <Card
            className="w-40 cursor-pointer transition-all hover:shadow-lg hover:-translate-y-0.5"
            onClick={onCreateRelease}
          >
            <CardContent className="p-4 flex flex-col items-center gap-2">
              <IconRocket size={24} className="text-primary" />
              <span className="text-sm font-medium text-foreground">{t('dashboard.createRelease')}</span>
            </CardContent>
          </Card>
          <Card
            className="w-40 cursor-pointer transition-all hover:shadow-lg hover:-translate-y-0.5"
            onClick={onCreateFeature}
          >
            <CardContent className="p-4 flex flex-col items-center gap-2">
              <IconStar size={24} className="text-primary" />
              <span className="text-sm font-medium text-foreground">{t('dashboard.createFeature')}</span>
            </CardContent>
          </Card>
          <Card
            className="w-40 cursor-pointer transition-all hover:shadow-lg hover:-translate-y-0.5"
            onClick={onCreateTask}
          >
            <CardContent className="p-4 flex flex-col items-center gap-2">
              <IconSubtask size={24} className="text-primary" />
              <span className="text-sm font-medium text-foreground">{t('dashboard.createTask')}</span>
            </CardContent>
          </Card>
          <Card
            className="w-40 cursor-pointer transition-all hover:shadow-lg hover:-translate-y-0.5"
            onClick={onCreateNote}
          >
            <CardContent className="p-4 flex flex-col items-center gap-2">
              <IconNote size={24} className="text-primary" />
              <span className="text-sm font-medium text-foreground">{t('dashboard.createNote')}</span>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Releases */}
      <h5 className="font-semibold text-foreground mb-3">{t('dashboard.releases')}</h5>
      {filteredReleases.length === 0 ? (
        <p className="text-muted-foreground">{t('release.noReleases')}</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
          {filteredReleases.map((release) => {
            const releaseTasks = tasks.filter((t) => t.releaseId === release.id);
            const progress = getProgress(releaseTasks);
            const counts = getStatusCounts(releaseTasks);

            return (
              <Card key={release.id} className="transition-all hover:shadow-lg hover:-translate-y-0.5 cursor-pointer" onClick={() => onReleaseClick?.(release.id)}>
                <CardContent className="p-4">
                  <div className="flex justify-between items-start mb-2">
                    <h6 className="font-semibold text-[0.8rem] text-foreground">{release.name}</h6>
                    <span
                      className="inline-flex items-center px-2 py-0.5 text-[0.8rem] font-semibold text-white"
                      style={{
                        backgroundColor: getProgressColor(progress.percent),
                      }}
                    >
                      {progress.percent}%
                    </span>
                  </div>

                  <Progress value={progress.percent} indicatorColor={getProgressColor(progress.percent)} />

                  <div className="flex justify-between items-center mt-2">
                    <small className="text-[#8893a7]">
                      {progress.done} / {progress.total} {t('dashboard.tasks')}
                    </small>
                  </div>

                  <StatusDots counts={counts} />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Features */}
      <h5 className="font-semibold text-foreground mb-3">{t('dashboard.features')}</h5>
      {filteredFeatures.length === 0 ? (
        <p className="text-muted-foreground">{t('dashboard.noFeatures')}</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredFeatures.map((feature) => {
            const subTasks = tasks.filter((t) => t.featureId === feature.id);
            const allItems = [feature, ...subTasks];
            const progress = getProgress(allItems);
            const counts = getStatusCounts(allItems);
            const release = releases.find((r) => r.id === feature.releaseId);

            return (
              <Card key={feature.id} className="transition-all hover:shadow-lg hover:-translate-y-0.5 border-l-[3px] border-l-warning cursor-pointer" onClick={() => onFeatureClick?.(feature.id, feature.releaseId)}>
                <CardContent className="p-4">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h6 className="font-semibold text-[0.8rem] text-foreground">{feature.title}</h6>
                      {release && (
                        <small className="text-muted-foreground">{release.name}</small>
                      )}
                    </div>
                    <span
                      className="inline-flex items-center px-2 py-0.5 text-[0.8rem] font-semibold text-white"
                      style={{
                        backgroundColor: getProgressColor(progress.percent),
                      }}
                    >
                      {progress.percent}%
                    </span>
                  </div>

                  <Progress value={progress.percent} indicatorColor={getProgressColor(progress.percent)} />

                  <div className="flex justify-between items-center mt-2">
                    <small className="text-[#8893a7]">
                      {progress.done} / {progress.total} {t('dashboard.items')}
                    </small>
                  </div>

                  <StatusDots counts={counts} />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default DashboardPage;
