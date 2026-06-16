import { useEffect, useState, useMemo, KeyboardEvent } from 'react';
import { usePresence } from '../hooks/usePresence';
import { useTranslation } from 'react-i18next';
import { useCreateBlockNote, SuggestionMenuController, getDefaultReactSlashMenuItems } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/shadcn';
import { filterSuggestionItems } from '@blocknote/core/extensions';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/shadcn/style.css';
import { schema, markdownPasteHandler } from '@/editor/schema';
import { getScratchpadSlashMenuItems, type SlashMenuEditor } from '@/editor/scratchpadSlashItems';
import { getMermaidSlashMenuItems } from '@/editor/mermaidSlashItems';
import { ScratchpadPickerModal } from '@/editor/ScratchpadPickerModal';
import { IconSparkles, IconArrowBack, IconSubtask, IconStar, IconSettings2, IconLayoutKanban, IconFlag3, IconTag, IconUser, IconHash, IconUsers } from '@tabler/icons-react';
import { useTaskStore } from '../stores/taskStore';
import { Task, TaskStatus, TaskType, TaskPriority, COLUMNS } from '../types';
import { improveText, hasApiKey } from '../services/aiService';
import { getConfig } from '../services/database';
import { createUploadHandler } from '../services/attachmentService';
import { log } from '../services/logService';
import { AppModal } from './ui/app-modal';
import { ModalSection } from './ui/modal-section';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Label } from './ui/label';

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: Task | null;
  onChildClick?: (task: Task) => void;
  initialValues?: { releaseId?: string | null; featureId?: string | null; type?: TaskType };
}

function TaskModal({ isOpen, onClose, task, onChildClick, initialValues }: TaskModalProps) {
  const { t } = useTranslation();
  const { addTask, updateTask, deleteTask, deleteFeature, releases, users, getFeatures, getChildTasks } = useTaskStore();

  const [title, setTitle] = useState('');
  const [type, setType] = useState<TaskType>('task');
  const [status, setStatus] = useState<TaskStatus>('backlog');
  const [releaseId, setReleaseId] = useState<string | null>(null);
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [featureId, setFeatureId] = useState<string | null>(null);
  const [priority, setPriority] = useState<TaskPriority>('low');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [scratchpadPickerEditor, setScratchpadPickerEditor] = useState<SlashMenuEditor | null>(null);
  const [isImproving, setIsImproving] = useState(false);
  const [previousContent, setPreviousContent] = useState<string | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [customPrompt, setCustomPrompt] = useState<string | undefined>(undefined);
  const [apiKeyAvailable, setApiKeyAvailable] = useState(false);
  const othersPresent = usePresence(isOpen ? task?.id : null, 'tasks');

  useEffect(() => {
    getConfig('prompt_tasks').then((val) => {
      if (val) setCustomPrompt(val);
    });
    hasApiKey().then(setApiKeyAvailable);
  }, []);

  const features = getFeatures();

  const initialContent = useMemo(() => {
    if (task?.content) {
      try {
        return JSON.parse(task.content);
      } catch {
        return undefined;
      }
    }
    return undefined;
  }, [editorKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const uploadFile = useMemo(
    () => createUploadHandler('task', task?.id || 'new'),
    [task?.id]
  );

  const editor = useCreateBlockNote({ schema, initialContent, uploadFile, pasteHandler: markdownPasteHandler }, [editorKey]);

  const handleImproveText = async () => {
    if (!editor || isImproving) return;

    const content = JSON.stringify(editor.document);
    setPreviousContent(content);
    setIsImproving(true);

    try {
      const improvedContent = await improveText(content, customPrompt);
      const blocks = JSON.parse(improvedContent);
      editor.replaceBlocks(editor.document, blocks);
    } catch (error) {
      log('ERR', 'taskModal: Failed to improve text: ' + String(error));
      alert(error instanceof Error ? error.message : 'Failed to improve text');
      setPreviousContent(null);
    } finally {
      setIsImproving(false);
    }
  };

  const handleUndoImprove = () => {
    if (!editor || !previousContent) return;

    try {
      const blocks = JSON.parse(previousContent);
      editor.replaceBlocks(editor.document, blocks);
      setPreviousContent(null);
    } catch (error) {
      log('ERR', 'taskModal: Failed to restore text: ' + String(error));
    }
  };

  useEffect(() => {
    if (isOpen) {
      if (task) {
        setTitle(task.title);
        setType(task.type || 'task');
        setStatus(task.status);
        setReleaseId(task.releaseId);
        setAssigneeId(task.assigneeId);
        setFeatureId(task.featureId);
        setPriority(task.priority || 'low');
        setTags(task.tags || []);
      } else {
        setTitle('');
        setType(initialValues?.type ?? 'task');
        setStatus('backlog');
        setReleaseId(initialValues?.releaseId ?? null);
        setAssigneeId(null);
        setFeatureId(initialValues?.featureId ?? null);
        setPriority('low');
        setTags([]);
      }
      setTagInput('');
      setPreviousContent(null);
      setEditorKey((k) => k + 1);
    }
    // initialValues fields intentionally excluded — only re-initialize on open/task change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, task]);

  const handleSave = async () => {
    if (!title.trim()) return;

    const content = JSON.stringify(editor.document);

    const taskData = {
      title: title.trim(),
      content,
      type,
      status,
      releaseId,
      assigneeId,
      featureId: type === 'task' ? featureId : null,
      priority,
      tags,
    };

    if (task) {
      await updateTask(task.id, taskData);
    } else {
      await addTask(taskData);
    }

    onClose();
  };

  const childTaskCount = task?.type === 'feature' ? getChildTasks(task.id).length : 0;

  const handleDeleteRequest = () => {
    setShowDeleteDialog(true);
  };

  const handleDeleteConfirm = async () => {
    if (!task) return;
    await deleteTask(task.id);
    setShowDeleteDialog(false);
    onClose();
  };

  const handleDeleteWithChildren = async () => {
    if (!task) return;
    await deleteFeature(task.id, true);
    setShowDeleteDialog(false);
    onClose();
  };

  const handleDeleteKeepChildren = async () => {
    if (!task) return;
    await deleteFeature(task.id, false);
    setShowDeleteDialog(false);
    onClose();
  };

  const handleTagKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault();
      if (!tags.includes(tagInput.trim())) {
        setTags([...tags, tagInput.trim()]);
      }
      setTagInput('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter((tag) => tag !== tagToRemove));
  };

  const selectClass = "flex h-9 w-full border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring";

  return (<>
    <AppModal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          {task ? t('task.edit') : t('task.create')}
          {othersPresent > 0 && (
            <span className="flex items-center gap-1 text-xs font-normal text-amber-500">
              <IconUsers size={13} />
              {othersPresent}
            </span>
          )}
        </span>
      }
      footer={
        <>
          {task && (
            <Button variant="destructive" className="mr-auto" onClick={handleDeleteRequest}>
              {t('task.delete')}
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            {t('task.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={!title.trim()}>
            {t('task.save')}
          </Button>
        </>
      }
    >
      {/* Title & Type */}
      <div className="bg-white border border-[#dde1e8] mb-4 shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
        <div className="flex gap-2 mb-3">
          {([
            { value: 'feature' as TaskType, label: t('task.typeFeature'), icon: IconStar },
            { value: 'task' as TaskType, label: t('task.typeTask'), icon: IconSubtask },
          ]).map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              className={`flex items-center gap-1.5 px-3 h-8 text-sm border transition-colors ${
                type === value
                  ? 'border-primary bg-primary/10 text-primary font-medium'
                  : 'border-input bg-transparent text-muted-foreground hover:bg-muted/50'
              }`}
              onClick={() => setType(value)}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>
        <Input
          className="text-lg h-11"
          placeholder={type === 'feature' ? t('task.featureTitlePlaceholder') : t('task.titlePlaceholder')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />
      </div>

      {/* Properties Section */}
      <ModalSection variant="subtle" title={<span className="flex items-center gap-1.5"><IconSettings2 size={13} />{t('task.status')} &amp; {t('task.assignee')}</span>}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <Label className="mb-2 flex items-center gap-1.5"><IconLayoutKanban size={13} className="text-muted-foreground" />{t('task.status')}</Label>
            <select
              className={selectClass}
              value={status}
              onChange={(e) => setStatus(e.target.value as TaskStatus)}
            >
              {COLUMNS.map((col) => (
                <option key={col.id} value={col.id}>
                  {t(`kanban.${col.id}`)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="mb-2 flex items-center gap-1.5"><IconFlag3 size={13} className="text-muted-foreground" />{t('task.priority')}</Label>
            <div className="flex gap-1">
              {(['high', 'medium', 'low'] as TaskPriority[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`flex items-center gap-1.5 px-2.5 h-9 text-sm border transition-colors ${
                    priority === p
                      ? 'border-primary bg-primary/10 font-medium'
                      : 'border-input bg-transparent hover:bg-muted/50'
                  }`}
                  onClick={() => setPriority(p)}
                >
                  <span className={`w-2 h-2 rounded-full ${
                    p === 'high' ? 'bg-destructive' : p === 'medium' ? 'bg-amber-500' : 'bg-muted-foreground/40'
                  }`} />
                  <span className="hidden md:inline">{t(`task.priority${p.charAt(0).toUpperCase() + p.slice(1)}`)}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label className="mb-2 flex items-center gap-1.5"><IconTag size={13} className="text-muted-foreground" />{t('task.release')}</Label>
            <select
              className={selectClass}
              value={releaseId || ''}
              onChange={(e) => setReleaseId(e.target.value || null)}
            >
              <option value="">{t('task.noRelease')}</option>
              {releases.map((release) => (
                <option key={release.id} value={release.id}>
                  {release.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="mb-2 flex items-center gap-1.5"><IconUser size={13} className="text-muted-foreground" />{t('task.assignee')}</Label>
            <select
              className={selectClass}
              value={assigneeId || ''}
              onChange={(e) => setAssigneeId(e.target.value || null)}
            >
              <option value="">{t('task.noAssignee')}</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Feature (only for tasks) */}
        {type === 'task' && features.length > 0 && (
          <div className="mt-3">
            <Label className="mb-2 flex items-center gap-1.5"><IconStar size={13} className="text-muted-foreground" />{t('task.feature')}</Label>
            <select
              className={selectClass}
              value={featureId || ''}
              onChange={(e) => setFeatureId(e.target.value || null)}
            >
              <option value="">{t('task.noFeature')}</option>
              {features.filter(f => f.id !== task?.id).map((feature) => (
                <option key={feature.id} value={feature.id}>
                  {feature.title}
                </option>
              ))}
            </select>
          </div>
        )}
      </ModalSection>

      {/* Tags Section */}
      <ModalSection variant="subtle" title={<span className="flex items-center gap-1.5"><IconHash size={13} />{t('task.tags')}</span>}>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {tags.map((tag) => (
              <Badge key={tag} variant="secondary" className="flex items-center gap-1">
                {tag}
                <button
                  type="button"
                  className="ml-1 hover:text-white/80"
                  onClick={() => removeTag(tag)}
                >
                  x
                </button>
              </Badge>
            ))}
          </div>
        )}
        <Input
          placeholder={t('task.tagsPlaceholder')}
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={handleTagKeyDown}
        />
      </ModalSection>

      {/* Content / Editor Section */}
      <ModalSection
        noPadding
        title={
          <div className="flex justify-between items-center w-full">
            <span>{t('task.content')}</span>
            <div className="flex gap-2">
              {previousContent && (
                <button
                  type="button"
                  className="inline-flex items-center text-xs border border-white/30 text-white px-2 py-0.5 hover:bg-white/15"
                  onClick={handleUndoImprove}
                  title={t('task.undoImprove')}
                >
                  <IconArrowBack size={14} className="mr-1" />
                  {t('task.undoImprove')}
                </button>
              )}
              {apiKeyAvailable && (
                <button
                  type="button"
                  className="inline-flex items-center text-xs border border-white/30 text-white px-2 py-0.5 hover:bg-white/15 disabled:opacity-50"
                  onClick={handleImproveText}
                  disabled={isImproving}
                >
                  <IconSparkles size={14} className="mr-1" />
                  {isImproving ? t('task.improving') : t('task.improveText')}
                </button>
              )}
            </div>
          </div>
        }
      >
        <div className="min-h-[240px] flex flex-col [&>*]:flex-1">
          <BlockNoteView editor={editor} theme="light" slashMenu={false}>
            <SuggestionMenuController
              triggerCharacter="/"
              getItems={async (query) =>
                filterSuggestionItems(
                  [...getDefaultReactSlashMenuItems(editor), ...getScratchpadSlashMenuItems(editor, setScratchpadPickerEditor), ...getMermaidSlashMenuItems(editor)],
                  query
                )
              }
            />
          </BlockNoteView>
        </div>
      </ModalSection>

      {/* Child tasks list (only for existing features) */}
      {task && type === 'feature' && (() => {
        const children = getChildTasks(task.id);
        if (children.length === 0) return null;
        return (
          <ModalSection title={<>{t('task.childTasks')} <Badge variant="secondary" className="ml-1 text-[0.65rem]">{children.length}</Badge></>}>
            <div className="divide-y divide-border">
              {children.map((child) => (
                <div
                  key={child.id}
                  className="flex items-center gap-2 py-2 first:pt-0 last:pb-0 cursor-pointer hover:bg-muted/50 -mx-1 px-1"
                  onClick={() => { onClose(); setTimeout(() => onChildClick?.(child), 150); }}
                >
                  <IconSubtask size={14} className="text-muted-foreground shrink-0" />
                  <span className="text-sm flex-1 truncate">{child.title}</span>
                  <Badge variant="secondary" className="text-[0.6rem] shrink-0">
                    {t(`kanban.${child.status}`)}
                  </Badge>
                </div>
              ))}
            </div>
          </ModalSection>
        );
      })()}
    </AppModal>

    {/* Delete confirmation dialog */}
    <AppModal
      isOpen={showDeleteDialog}
      onClose={() => setShowDeleteDialog(false)}
      title={t('task.delete')}
      size="sm"
      footer={
        task?.type === 'feature' && childTaskCount > 0 ? (
          <div className="flex gap-2 w-full">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowDeleteDialog(false)}
            >
              {t('task.cancel')}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="flex-1"
              onClick={handleDeleteWithChildren}
            >
              {t('task.deleteWithChildren')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={handleDeleteKeepChildren}
            >
              {t('task.deleteKeepChildren')}
            </Button>
          </div>
        ) : (
          <div className="flex gap-2 w-full justify-end">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowDeleteDialog(false)}
            >
              {t('task.cancel')}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteConfirm}
            >
              {t('task.delete')}
            </Button>
          </div>
        )
      }
    >
      <p className="text-sm text-muted-foreground">
        {task?.type === 'feature' && childTaskCount > 0
          ? t('task.deleteHasChildren', { title: task?.title || '', count: childTaskCount })
          : t('task.confirmDelete')
        }
      </p>
    </AppModal>

    <ScratchpadPickerModal
      editor={scratchpadPickerEditor}
      onClose={() => setScratchpadPickerEditor(null)}
    />
  </>
  );
}

export default TaskModal;
