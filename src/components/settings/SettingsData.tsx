import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { IconRestore, IconTrash, IconTrashX, IconDatabaseExport } from '@tabler/icons-react';
import { useNoteStore } from '../../stores/noteStore';
import { useTaskStore } from '../../stores/taskStore';
import { useScratchpadStore } from '../../stores/scratchpadStore';
import { Note, Task, Scratchpad } from '../../types';
import { createBackup, listBackups, deleteBackup, type BackupEntry } from '../../services/backupService';
import { log } from '../../services/logService';
import { Button } from '../ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { AppModal } from '../ui/app-modal';

export default function SettingsData() {
  const { t } = useTranslation();
  const { getDeletedNotes, restoreNote, permanentlyDeleteNote, permanentlyDeleteAll } = useNoteStore();
  const { getDeletedTasks, restoreTask, permanentlyDeleteTask, permanentlyDeleteAllTasks } = useTaskStore();
  const { getDeletedScratchpads, restoreScratchpad, permanentlyDeleteScratchpad, permanentlyDeleteAllScratchpads } = useScratchpadStore();

  const [deletedNotes, setDeletedNotes] = useState<Note[]>([]);
  const [deletedTasks, setDeletedTasks] = useState<Task[]>([]);
  const [deletedScratchpads, setDeletedScratchpads] = useState<Scratchpad[]>([]);
  const [recycleBinLoading, setRecycleBinLoading] = useState(false);

  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [backupLoading, setBackupLoading] = useState(false);
  const [deleteBackupTarget, setDeleteBackupTarget] = useState<string | null>(null);

  const [deleteNoteId, setDeleteNoteId] = useState<string | null>(null);
  const [deleteTaskId, setDeleteTaskId] = useState<string | null>(null);
  const [deleteScratchpadId, setDeleteScratchpadId] = useState<string | null>(null);
  const [emptyNotesConfirm, setEmptyNotesConfirm] = useState(false);
  const [emptyTasksConfirm, setEmptyTasksConfirm] = useState(false);
  const [emptyScratchpadsConfirm, setEmptyScratchpadsConfirm] = useState(false);

  const loadBackups = async () => {
    const list = await listBackups();
    setBackups(list);
  };

  const loadDeletedNotes = async () => {
    setRecycleBinLoading(true);
    const notes = await getDeletedNotes();
    setDeletedNotes(notes);
    setRecycleBinLoading(false);
  };

  const loadDeletedTasksList = async () => {
    const tasks = await getDeletedTasks();
    setDeletedTasks(tasks);
  };

  const loadDeletedScratchpadsList = async () => {
    const scratchpads = await getDeletedScratchpads();
    setDeletedScratchpads(scratchpads);
  };

  useEffect(() => {
    loadDeletedNotes();
    loadDeletedTasksList();
    loadDeletedScratchpadsList();
    loadBackups();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreateBackup = async () => {
    setBackupLoading(true);
    try {
      await createBackup();
      await loadBackups();
    } catch (error) {
      log('ERR', 'settings: Backup failed: ' + String(error));
    } finally {
      setBackupLoading(false);
    }
  };

  const handleDeleteBackup = async () => {
    if (!deleteBackupTarget) return;
    await deleteBackup(deleteBackupTarget);
    setDeleteBackupTarget(null);
    await loadBackups();
  };

  const handleRestore = async (id: string) => {
    await restoreNote(id);
    await loadDeletedNotes();
  };

  const handlePermanentDelete = async () => {
    if (!deleteNoteId) return;
    await permanentlyDeleteNote(deleteNoteId);
    setDeleteNoteId(null);
    await loadDeletedNotes();
  };

  const handleEmptyRecycleBin = async () => {
    await permanentlyDeleteAll();
    setDeletedNotes([]);
    setEmptyNotesConfirm(false);
  };

  const handleRestoreTask = async (id: string) => {
    await restoreTask(id);
    await loadDeletedTasksList();
  };

  const handlePermanentDeleteTask = async () => {
    if (!deleteTaskId) return;
    await permanentlyDeleteTask(deleteTaskId);
    setDeleteTaskId(null);
    await loadDeletedTasksList();
  };

  const handleEmptyTaskRecycleBin = async () => {
    await permanentlyDeleteAllTasks();
    setDeletedTasks([]);
    setEmptyTasksConfirm(false);
  };

  const handleRestoreScratchpad = async (id: string) => {
    await restoreScratchpad(id);
    await loadDeletedScratchpadsList();
  };

  const handlePermanentDeleteScratchpad = async () => {
    if (!deleteScratchpadId) return;
    await permanentlyDeleteScratchpad(deleteScratchpadId);
    setDeleteScratchpadId(null);
    await loadDeletedScratchpadsList();
  };

  const handleEmptyScratchpadRecycleBin = async () => {
    await permanentlyDeleteAllScratchpads();
    setDeletedScratchpads([]);
    setEmptyScratchpadsConfirm(false);
  };

  return (
    <>
      {/* Database Backup */}
      <Card className="mb-4">
        <CardHeader className="flex-row items-center justify-between space-y-0 bg-[#fafafa] border-b border-border">
          <CardTitle className="text-base flex items-center gap-2">
            <IconDatabaseExport size={18} />
            {t('settings.backup')}
          </CardTitle>
          <Button size="sm" onClick={handleCreateBackup} disabled={backupLoading}>
            {backupLoading ? t('settings.creatingBackup') : t('settings.createBackup')}
          </Button>
        </CardHeader>
        <CardContent className="p-4">
          {backups.length === 0 ? (
            <p className="text-muted-foreground text-center text-sm">{t('settings.noBackups')}</p>
          ) : (
            <div className="divide-y divide-border">
              {backups.map((backup) => (
                <div
                  key={backup.name}
                  className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium truncate block">{backup.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(backup.created).toLocaleString()} — {(backup.size / 1024 / 1024).toFixed(1)} MB
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-destructive hover:text-destructive shrink-0 ml-2"
                    onClick={() => setDeleteBackupTarget(backup.name)}
                    title={t('settings.deleteBackup')}
                  >
                    <IconTrash size={16} />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recycle Bin - Notes */}
      <Card className="mb-4">
        <CardHeader className="flex-row items-center justify-between space-y-0 bg-[#fafafa] border-b border-border">
          <CardTitle className="text-base">{t('notes.recycleBin')}</CardTitle>
          {deletedNotes.length > 0 && (
            <Button variant="destructive" size="sm" onClick={() => setEmptyNotesConfirm(true)}>
              <IconTrashX size={16} className="mr-1" />
              {t('notes.emptyRecycleBin')}
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-4">
          {recycleBinLoading ? (
            <p className="text-muted-foreground text-center text-sm">{t('common.loading')}</p>
          ) : deletedNotes.length === 0 ? (
            <p className="text-muted-foreground text-center text-sm">{t('notes.recycleBinEmpty')}</p>
          ) : (
            <div className="divide-y divide-border">
              {deletedNotes.map((note) => (
                <div
                  key={note.id}
                  className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium truncate block">
                      {note.title || <span className="italic text-muted-foreground">{t('notes.untitled')}</span>}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(note.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex gap-1 shrink-0 ml-2">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleRestore(note.id)}
                      title={t('notes.restore')}
                    >
                      <IconRestore size={16} className="text-primary" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleteNoteId(note.id)}
                      title={t('notes.deletePermanently')}
                    >
                      <IconTrash size={16} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recycle Bin - Tasks */}
      <Card className="mb-4">
        <CardHeader className="flex-row items-center justify-between space-y-0 bg-[#fafafa] border-b border-border">
          <CardTitle className="text-base">{t('task.recycleBin')}</CardTitle>
          {deletedTasks.length > 0 && (
            <Button variant="destructive" size="sm" onClick={() => setEmptyTasksConfirm(true)}>
              <IconTrashX size={16} className="mr-1" />
              {t('task.emptyRecycleBin')}
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-4">
          {deletedTasks.length === 0 ? (
            <p className="text-muted-foreground text-center text-sm">{t('task.recycleBinEmpty')}</p>
          ) : (
            <div className="divide-y divide-border">
              {deletedTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">
                        {task.title || <span className="italic text-muted-foreground">{t('notes.untitled')}</span>}
                      </span>
                      <span className="text-[0.65rem] px-1.5 py-0 border border-border text-muted-foreground shrink-0">
                        {task.type === 'feature' ? t('task.typeFeature') : t('task.typeTask')}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(task.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex gap-1 shrink-0 ml-2">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleRestoreTask(task.id)}
                      title={t('task.restore')}
                    >
                      <IconRestore size={16} className="text-primary" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleteTaskId(task.id)}
                      title={t('task.deletePermanently')}
                    >
                      <IconTrash size={16} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recycle Bin - Scratchpads */}
      <Card className="mb-4">
        <CardHeader className="flex-row items-center justify-between space-y-0 bg-[#fafafa] border-b border-border">
          <CardTitle className="text-base">{t('scratchpad.recycleBin')}</CardTitle>
          {deletedScratchpads.length > 0 && (
            <Button variant="destructive" size="sm" onClick={() => setEmptyScratchpadsConfirm(true)}>
              <IconTrashX size={16} className="mr-1" />
              {t('scratchpad.emptyRecycleBin')}
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-4">
          {deletedScratchpads.length === 0 ? (
            <p className="text-muted-foreground text-center text-sm">{t('scratchpad.recycleBinEmpty')}</p>
          ) : (
            <div className="divide-y divide-border">
              {deletedScratchpads.map((scratchpad) => (
                <div
                  key={scratchpad.id}
                  className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <span className="text-sm font-medium truncate block">
                      {scratchpad.title || <span className="italic text-muted-foreground">{t('notes.untitled')}</span>}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(scratchpad.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex gap-1 shrink-0 ml-2">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => handleRestoreScratchpad(scratchpad.id)}
                      title={t('scratchpad.restore')}
                    >
                      <IconRestore size={16} className="text-primary" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleteScratchpadId(scratchpad.id)}
                      title={t('scratchpad.deletePermanently')}
                    >
                      <IconTrash size={16} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Backup Confirmation */}
      <AppModal
        isOpen={!!deleteBackupTarget}
        onClose={() => setDeleteBackupTarget(null)}
        title={t('settings.deleteBackup')}
        size="sm"
        footer={
          <div className="flex gap-2 w-full justify-end">
            <Button variant="secondary" size="sm" onClick={() => setDeleteBackupTarget(null)}>
              {t('task.cancel')}
            </Button>
            <Button variant="destructive" size="sm" onClick={handleDeleteBackup}>
              {t('task.delete')}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-muted-foreground">{t('common.confirmDelete')}</p>
      </AppModal>

      {/* Delete single note confirmation */}
      <AppModal
        isOpen={!!deleteNoteId}
        onClose={() => setDeleteNoteId(null)}
        title={t('notes.deletePermanently')}
        size="sm"
        footer={
          <div className="flex gap-2 w-full justify-end">
            <Button variant="secondary" size="sm" onClick={() => setDeleteNoteId(null)}>
              {t('task.cancel')}
            </Button>
            <Button variant="destructive" size="sm" onClick={handlePermanentDelete}>
              {t('task.delete')}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-muted-foreground">{t('notes.confirmPermanentDelete')}</p>
      </AppModal>

      {/* Delete single task confirmation */}
      <AppModal
        isOpen={!!deleteTaskId}
        onClose={() => setDeleteTaskId(null)}
        title={t('task.deletePermanently')}
        size="sm"
        footer={
          <div className="flex gap-2 w-full justify-end">
            <Button variant="secondary" size="sm" onClick={() => setDeleteTaskId(null)}>
              {t('task.cancel')}
            </Button>
            <Button variant="destructive" size="sm" onClick={handlePermanentDeleteTask}>
              {t('task.delete')}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-muted-foreground">{t('task.confirmPermanentDelete')}</p>
      </AppModal>

      {/* Empty Notes Recycle Bin Confirmation */}
      <AppModal
        isOpen={emptyNotesConfirm}
        onClose={() => setEmptyNotesConfirm(false)}
        title={t('notes.emptyRecycleBin')}
        size="sm"
        footer={
          <div className="flex gap-2 w-full justify-end">
            <Button variant="secondary" size="sm" onClick={() => setEmptyNotesConfirm(false)}>
              {t('task.cancel')}
            </Button>
            <Button variant="destructive" size="sm" onClick={handleEmptyRecycleBin}>
              {t('task.delete')}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-muted-foreground">{t('notes.confirmEmptyRecycleBin')}</p>
      </AppModal>

      {/* Empty Tasks Recycle Bin Confirmation */}
      <AppModal
        isOpen={emptyTasksConfirm}
        onClose={() => setEmptyTasksConfirm(false)}
        title={t('task.emptyRecycleBin')}
        size="sm"
        footer={
          <div className="flex gap-2 w-full justify-end">
            <Button variant="secondary" size="sm" onClick={() => setEmptyTasksConfirm(false)}>
              {t('task.cancel')}
            </Button>
            <Button variant="destructive" size="sm" onClick={handleEmptyTaskRecycleBin}>
              {t('task.delete')}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-muted-foreground">{t('task.confirmEmptyRecycleBin')}</p>
      </AppModal>

      {/* Delete single scratchpad confirmation */}
      <AppModal
        isOpen={!!deleteScratchpadId}
        onClose={() => setDeleteScratchpadId(null)}
        title={t('scratchpad.deletePermanently')}
        size="sm"
        footer={
          <div className="flex gap-2 w-full justify-end">
            <Button variant="secondary" size="sm" onClick={() => setDeleteScratchpadId(null)}>
              {t('task.cancel')}
            </Button>
            <Button variant="destructive" size="sm" onClick={handlePermanentDeleteScratchpad}>
              {t('task.delete')}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-muted-foreground">{t('scratchpad.confirmPermanentDelete')}</p>
      </AppModal>

      {/* Empty Scratchpads Recycle Bin Confirmation */}
      <AppModal
        isOpen={emptyScratchpadsConfirm}
        onClose={() => setEmptyScratchpadsConfirm(false)}
        title={t('scratchpad.emptyRecycleBin')}
        size="sm"
        footer={
          <div className="flex gap-2 w-full justify-end">
            <Button variant="secondary" size="sm" onClick={() => setEmptyScratchpadsConfirm(false)}>
              {t('task.cancel')}
            </Button>
            <Button variant="destructive" size="sm" onClick={handleEmptyScratchpadRecycleBin}>
              {t('task.delete')}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-muted-foreground">{t('scratchpad.confirmEmptyRecycleBin')}</p>
      </AppModal>
    </>
  );
}
