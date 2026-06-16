import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { IconEdit, IconTrash, IconFileReport, IconCircleCheck, IconRocket, IconPlus } from '@tabler/icons-react';
import { useTaskStore } from '../stores/taskStore';
import { useNoteStore } from '../stores/noteStore';
import { Release } from '../types';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardHeader, CardTitle, CardContent } from './ui/card';
import { AppModal } from './ui/app-modal';
import { Progress } from './ui/progress';
import { hasApiKey } from '../services/aiService';
import { getConfig } from '../services/database';
import { log } from '../services/logService';
import { generateCABBlocks, improveCABReport } from '../services/cabService';

function ReleasesPage({ createRequested, onCreateHandled, onCreateCancelled }: { createRequested?: boolean; onCreateHandled?: () => void; onCreateCancelled?: () => void }) {
  const { t } = useTranslation();
  const { releases, tasks, users, addRelease, updateRelease, deleteRelease } = useTaskStore();
  const { notes, addNote } = useNoteStore();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRelease, setEditingRelease] = useState<Release | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Release | null>(null);
  const [cabLoading, setCabLoading] = useState<string | null>(null);
  const [cabDropdown, setCabDropdown] = useState<string | null>(null);
  const cabDropdownRef = useRef<HTMLDivElement>(null);
  const [customCabPrompt, setCustomCabPrompt] = useState<string | undefined>(undefined);
  const [openedFromExternal, setOpenedFromExternal] = useState(false);
  const [apiKeyAvailable, setApiKeyAvailable] = useState(false);

  useEffect(() => {
    getConfig('prompt_cab').then((val) => {
      if (val) setCustomCabPrompt(val);
    });
    hasApiKey().then(setApiKeyAvailable);
  }, []);

  useEffect(() => {
    if (createRequested) {
      setOpenedFromExternal(true);
      handleOpenModal();
      onCreateHandled?.();
    }
    // onCreateHandled intentionally excluded — stable prop callback
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createRequested]);

  // Close CAB dropdown on outside click
  useEffect(() => {
    if (!cabDropdown) return;
    const handler = (e: MouseEvent) => {
      if (cabDropdownRef.current && !cabDropdownRef.current.contains(e.target as Node)) {
        setCabDropdown(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [cabDropdown]);

  const handleOpenModal = (release?: Release) => {
    if (release) {
      setEditingRelease(release);
      setName(release.name);
      setDescription(release.description);
    } else {
      setEditingRelease(null);
      setName('');
      setDescription('');
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    if (openedFromExternal) {
      setOpenedFromExternal(false);
      onCreateCancelled?.();
    }
    setEditingRelease(null);
    setName('');
    setDescription('');
  };

  const handleSave = async () => {
    if (!name.trim() || isSaving) return;
    setIsSaving(true);
    try {
      if (editingRelease) {
        await updateRelease(editingRelease.id, {
          name: name.trim(),
          description: description.trim(),
        });
      } else {
        await addRelease({
          name: name.trim(),
          description: description.trim(),
        });
      }
      setOpenedFromExternal(false);
      handleCloseModal();
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteRequest = (release: Release) => {
    setDeleteTarget(release);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    await deleteRelease(deleteTarget.id);
    setDeleteTarget(null);
  };

  const getReleaseStats = (releaseId: string) => {
    const relTasks = tasks.filter((task) => task.releaseId === releaseId);
    const total = relTasks.length;
    const done = relTasks.filter((t) => t.status === 'done').length;
    const inProgress = relTasks.filter((t) => t.status === 'in_progress').length;
    const review = relTasks.filter((t) => t.status === 'review').length;
    const percent = total > 0 ? Math.round((done / total) * 100) : 0;
    const allDone = total > 0 && done === total;
    return { total, done, inProgress, review, percent, allDone };
  };

  const handleGenerateCAB = async (release: Release, useAI: boolean) => {
    setCabDropdown(null);
    setCabLoading(release.id);

    try {
      let blocks = generateCABBlocks(release, tasks, users);

      if (useAI) {
        blocks = await improveCABReport(blocks, customCabPrompt);
      }

      // Find or create "CAB-Releases" parent note
      let parentNote = notes.find((n) => n.title === 'CAB-Releases' && !n.parentId);
      if (!parentNote) {
        parentNote = await addNote({
          title: 'CAB-Releases',
          content: JSON.stringify([{
            id: crypto.randomUUID(),
            type: 'paragraph',
            props: {},
            content: [{ type: 'text', text: 'CAB Reports for Releases', styles: {} }],
            children: [],
          }]),
          tags: ['cab'],
          parentId: null,
        });
      }

      // Create the CAB note
      await addNote({
        title: `CAB ${release.name}`,
        content: JSON.stringify(blocks),
        tags: ['cab'],
        parentId: parentNote.id,
      });
    } catch (err) {
      log('ERR', 'releases: CAB generation failed: ' + String(err));
    } finally {
      setCabLoading(null);
    }
  };

  return (
    <div>
      {releases.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 select-none">
          <IconRocket size={40} className="text-muted-foreground/20 mb-4" />
          <p className="text-muted-foreground text-sm mb-4">{t('release.noReleases')}</p>
          <Button size="sm" variant="outline" onClick={() => handleOpenModal()}>
            <IconPlus size={16} className="mr-1" />
            {t('dashboard.createRelease')}
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...releases].sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true })).map((release) => (
            <Card key={release.id}>
              <CardHeader className="flex-row items-center justify-between space-y-0 pb-2 bg-[#fafafa] border-b border-border">
                <CardTitle className="text-[0.8rem]">{release.name}</CardTitle>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => handleOpenModal(release)}
                  >
                    <IconEdit size={16} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleDeleteRequest(release)}
                  >
                    <IconTrash size={16} />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-4">
                {(() => {
                  const stats = getReleaseStats(release.id);
                  return (
                    <>
                      <p className="text-muted-foreground text-[0.75rem] mb-3">
                        {release.description || '-'}
                      </p>

                      {/* Progress bar */}
                      <div className="mb-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-muted-foreground">
                            {stats.done}/{stats.total} {t('kanban.done').toLowerCase()}
                          </span>
                          <span className="text-xs font-medium">{stats.percent}%</span>
                        </div>
                        <Progress
                          value={stats.percent}
                          className="h-1.5"
                          indicatorColor={stats.allDone ? '#16a34a' : undefined}
                        />
                      </div>

                      {/* Status badges */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {stats.allDone ? (
                          <Badge className="bg-green-600 text-white hover:bg-green-600">
                            <IconCircleCheck size={13} className="mr-1" />
                            {t('kanban.done')}
                          </Badge>
                        ) : (
                          <>
                            {stats.inProgress > 0 && (
                              <Badge variant="outline" className="text-xs">
                                {stats.inProgress} {t('kanban.in_progress')}
                              </Badge>
                            )}
                            {stats.review > 0 && (
                              <Badge variant="outline" className="text-xs">
                                {stats.review} {t('kanban.review')}
                              </Badge>
                            )}
                            {stats.total === 0 && (
                              <Badge variant="outline" className="text-xs text-muted-foreground">
                                {t('kanban.noTasks')}
                              </Badge>
                            )}
                          </>
                        )}

                        {/* CAB button - only when all done */}
                        {stats.allDone && (
                          <div className="relative ml-auto" ref={cabDropdown === release.id ? cabDropdownRef : undefined}>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 px-2 text-xs"
                              disabled={cabLoading === release.id}
                              onClick={() => setCabDropdown(cabDropdown === release.id ? null : release.id)}
                            >
                              <IconFileReport size={14} className="mr-1" />
                              {cabLoading === release.id ? t('release.cabGenerating') : t('release.cab')}
                            </Button>
                            {cabDropdown === release.id && (
                              <div className="absolute z-50 mt-1 right-0 bg-popover border border-border shadow-md min-w-[180px]">
                                <button
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
                                  onClick={() => handleGenerateCAB(release, false)}
                                >
                                  {t('release.cabGenerate')}
                                </button>
                                {apiKeyAvailable && (
                                  <button
                                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
                                    onClick={() => handleGenerateCAB(release, true)}
                                  >
                                    {t('release.cabGenerateAI')}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </>
                  );
                })()}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modal */}
      <AppModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingRelease ? t('release.edit') : t('release.create')}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={handleCloseModal}>
              {t('release.cancel')}
            </Button>
            <Button onClick={handleSave} disabled={!name.trim() || isSaving}>
              {isSaving ? t('common.loading') : t('release.save')}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <Label className="mb-2 block">{t('release.name')}</Label>
            <Input
              placeholder={t('release.namePlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div>
            <Label className="mb-2 block">{t('release.description')}</Label>
            <textarea
              className="flex min-h-[80px] w-full border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder={t('release.descriptionPlaceholder')}
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
      </AppModal>

      {/* Delete confirmation dialog */}
      <AppModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title={t('release.delete')}
        size="sm"
        footer={
          <div className="flex gap-2 w-full justify-end">
            <Button variant="secondary" size="sm" onClick={() => setDeleteTarget(null)}>
              {t('release.cancel')}
            </Button>
            {deleteTarget && getReleaseStats(deleteTarget.id).total === 0 && (
              <Button variant="destructive" size="sm" onClick={handleDeleteConfirm}>
                {t('task.delete')}
              </Button>
            )}
          </div>
        }
      >
        <p className="text-sm text-muted-foreground">
          {deleteTarget && getReleaseStats(deleteTarget.id).total > 0
            ? t('release.hasTasksDependency', { count: getReleaseStats(deleteTarget.id).total })
            : t('release.confirmDelete')
          }
        </p>
      </AppModal>
    </div>
  );
}

export default ReleasesPage;
