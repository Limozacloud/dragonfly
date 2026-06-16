import { useState, useMemo, useCallback, useEffect, useRef, KeyboardEvent } from 'react';
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
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  IconSearch,
  IconX,
  IconTrash,
  IconSparkles,
  IconArrowBack,
  IconNote,
  IconEdit,
  IconEye,
  IconChevronsUp,
  IconChevronsDown,
  IconArrowsSort,
  IconDownload,
  IconList,
  IconStarFilled,
  IconMicrophone,
  IconUsers,
} from '@tabler/icons-react';
import { usePresence } from '../hooks/usePresence';
import { cn } from '@/lib/utils';
import { useNoteStore } from '../stores/noteStore';
import { Note } from '../types';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import { improveText, hasApiKey } from '../services/aiService';
import { getConfig } from '../services/database';
import { getVoiceProvider } from '../services/voiceService';
import { VoiceRecorderModal } from './VoiceRecorderModal';
import { log } from '../services/logService';
import { createUploadHandler } from '../services/attachmentService';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { AppModal } from './ui/app-modal';
import NoteTreeItem from './NoteTreeItem';

import { extractTextFromJson, noteHasContent, extractHeadings } from '@/lib/content';
import { NOTE_SIDEBAR_WIDTH_DEFAULT, NOTE_SIDEBAR_WIDTH_MIN } from '@/lib/constants';

// ── Helpers ──────────────────────────────────────────────────────────

/** Check if potentialChildId is a descendant of ancestorId (cycle prevention) */
function isDescendant(ancestorId: string, potentialChildId: string, notes: Note[]): boolean {
  let current = notes.find((n) => n.id === potentialChildId);
  while (current?.parentId) {
    if (current.parentId === ancestorId) return true;
    current = notes.find((n) => n.id === current!.parentId);
  }
  return false;
}

/** Invisible drop zone at the bottom of the tree for moving notes to root */
function RootDropZone() {
  const { setNodeRef, isOver } = useDroppable({ id: 'root' });
  return (
    <div
      ref={setNodeRef}
      className={`h-6 mx-2 my-1 border border-dashed transition-colors ${
        isOver ? 'border-primary/50 bg-primary/5' : 'border-transparent'
      }`}
    />
  );
}

// ── Main component ───────────────────────────────────────────────────

function NotesPage({ createRequested, onCreateHandled }: { createRequested?: boolean; onCreateHandled?: () => void }) {
  const { t } = useTranslation();
  const { notes, addNote, updateNote, deleteNote, moveNote, toggleFavorite, getRootNotes, getChildren, getAllTags } =
    useNoteStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [editorKey, setEditorKey] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const prevNoteContentRef = useRef<string | undefined>(undefined);
  const [tocOpen, setTocOpen] = useState(false);
  const [changeCounter, setChangeCounter] = useState(0);

  // Inline edit state
  const [editTitle, setEditTitle] = useState('');
  const othersPresent = usePresence(selectedNoteId, 'notes');
  const [editTags, setEditTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  const editorContainerRef = useRef<HTMLDivElement>(null);
  const headingsRef = useRef<Array<{ id: string; level: number; text: string }>>([]);
  const isEditingRef = useRef(false);

  // Scratchpad picker
  const [scratchpadPickerEditor, setScratchpadPickerEditor] = useState<SlashMenuEditor | null>(null);

  // AI improve
  const [isImproving, setIsImproving] = useState(false);
  const [previousContent, setPreviousContent] = useState<string | null>(null);
  const [customPrompt, setCustomPrompt] = useState<string | undefined>(undefined);
  const [apiKeyAvailable, setApiKeyAvailable] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceModalOpen, setVoiceModalOpen] = useState(false);

  useEffect(() => {
    getConfig('prompt_notes').then((val) => {
      if (val) setCustomPrompt(val);
    });
    hasApiKey().then(setApiKeyAvailable);
    getVoiceProvider().then((p) => setVoiceEnabled(p !== null));
  }, []);

  // Delete dialog for notes with children
  const [deleteDialogNoteId, setDeleteDialogNoteId] = useState<string | null>(null);

  // Expand/collapse all tree items: key increments to trigger, expanded = target state
  const [expandSignal, setExpandSignal] = useState<{ key: number; expanded: boolean }>({ key: 0, expanded: false });
  const [tagsExpanded, setTagsExpanded] = useState(false);

  type NoteSort = 'title_asc' | 'title_desc' | 'created_asc' | 'created_desc';
  const [noteSort, setNoteSort] = useState<NoteSort>(
    () => (localStorage.getItem('dragonfly-notes-sort') as NoteSort) || 'created_asc'
  );
  const [sortMenuOpen, setSortMenuOpen] = useState(false);

  useEffect(() => {
    if (!sortMenuOpen) return;
    const handler = () => setSortMenuOpen(false);
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [sortMenuOpen]);

  const sortFn = useMemo(() => {
    switch (noteSort) {
      case 'title_asc':  return (a: Note, b: Note) => (a.title || '').localeCompare(b.title || '');
      case 'title_desc': return (a: Note, b: Note) => (b.title || '').localeCompare(a.title || '');
      case 'created_desc': return (a: Note, b: Note) => b.createdAt.localeCompare(a.createdAt);
      default:           return (a: Note, b: Note) => a.createdAt.localeCompare(b.createdAt);
    }
  }, [noteSort]);

  function handleSetSort(sort: NoteSort) {
    setNoteSort(sort);
    localStorage.setItem('dragonfly-notes-sort', sort);
    setSortMenuOpen(false);
  }
  const [favoritesExpanded, setFavoritesExpanded] = useState(false);

  // Drag & drop
  const [draggedNote, setDraggedNote] = useState<Note | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  // Resizable sidebar
  const [sidebarWidth, setSidebarWidth] = useState(NOTE_SIDEBAR_WIDTH_DEFAULT);
  const handleSidebarResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    const onMouseMove = (ev: MouseEvent) => {
      const newWidth = Math.max(NOTE_SIDEBAR_WIDTH_MIN, startWidth + (ev.clientX - startX));
      setSidebarWidth(newWidth);
    };
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [sidebarWidth]);

  // Auto-save timers — separate refs so title and content saves don't cancel each other
  const saveTitleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveContentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const allTags = getAllTags();
  const favoriteNotes = useMemo(
    () => notes.filter((n) => n.favorite),
    [notes]
  );
  const selectedNote = useMemo(
    () => notes.find((n) => n.id === selectedNoteId) ?? null,
    [notes, selectedNoteId]
  );

  // ── Filter logic ──

  const filterMatch = useMemo(() => {
    const hasFilter = searchQuery.trim() || selectedTag;
    if (!hasFilter) return new Set<string>();

    const q = searchQuery.toLowerCase();
    const directMatches = new Set<string>();

    for (const note of notes) {
      const matchesTag = !selectedTag || note.tags.includes(selectedTag);
      const matchesSearch =
        !q ||
        note.title.toLowerCase().includes(q) ||
        extractTextFromJson(note.content).toLowerCase().includes(q);
      if (matchesTag && matchesSearch) directMatches.add(note.id);
    }

    const visible = new Set<string>(directMatches);
    const addAncestors = (noteId: string) => {
      const n = notes.find((x) => x.id === noteId);
      if (n?.parentId) {
        visible.add(n.parentId);
        addAncestors(n.parentId);
      }
    };
    directMatches.forEach((id) => addAncestors(id));

    const addDescendants = (parentId: string) => {
      for (const child of notes.filter((n) => n.parentId === parentId)) {
        visible.add(child.id);
        addDescendants(child.id);
      }
    };
    directMatches.forEach((id) => addDescendants(id));

    return visible;
  }, [notes, searchQuery, selectedTag]);

  // ── BlockNote editor ──
  // Single editor instance used for both view (editable=false) and edit (editable=true).
  // Recreated via editorKey when switching notes or toggling edit mode.

  const initialContent = useMemo(() => {
    if (selectedNote?.content) {
      try {
        return JSON.parse(selectedNote.content);
      } catch {
        return undefined;
      }
    }
    return undefined;
  }, [editorKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const uploadFile = useMemo(
    () => createUploadHandler('note', selectedNoteId || 'new'),
    [selectedNoteId]
  );

  const editor = useCreateBlockNote({ schema, initialContent, uploadFile, pasteHandler: markdownPasteHandler }, [editorKey]);

  const headings = useMemo(() => {
    if (!editor) return [];
    return extractHeadings(editor.document as unknown as Parameters<typeof extractHeadings>[0]);
  }, [editor, changeCounter]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTocClick = (headingId: string) => {
    if (!editor) return;
    const el = (editor as unknown as { domElement?: Element }).domElement?.querySelector(`[data-id="${headingId}"]`) as HTMLElement | null;
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    editor.setTextCursorPosition(headingId, 'start');
    editor.focus();
  };

  // Keep refs in sync with state so closure-based handlers always have fresh values
  useEffect(() => { headingsRef.current = headings; }, [headings]);
  useEffect(() => { isEditingRef.current = isEditing; }, [isEditing]);

  // Intercept clicks on in-document anchor links (e.g. TOC generated from pasted markdown).
  // Uses document-level capture + direct DOM scan — no stale-closure or debounce issues.
  useEffect(() => {
    const slugify = (text: string) =>
      text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s/g, '-');

    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest('a');
      if (!a) return;
      const editorEl = a.closest('.bn-editor') as HTMLElement | null;
      if (!editorEl) return;

      // Extract the fragment slug — handle both "#heading" and "http://localhost/#heading"
      const rawHref = a.getAttribute('href') ?? '';
      let slug: string;
      if (rawHref.startsWith('#')) {
        slug = decodeURIComponent(rawHref.slice(1));
      } else {
        try {
          const url = new URL(rawHref);
          if (url.origin !== location.origin || !url.hash) return;
          slug = decodeURIComponent(url.hash.slice(1));
        } catch {
          return;
        }
      }
      if (!slug) return;

      // Always prevent fragment navigation; only scroll in view mode
      e.preventDefault();
      e.stopImmediatePropagation();
      if (isEditingRef.current) return;

      // Scan heading blocks directly in the live DOM
      const headingEls = editorEl.querySelectorAll('[data-content-type="heading"]');
      for (const el of headingEls) {
        const text = (el as HTMLElement).innerText?.trim() ?? '';
        if (slugify(text) === slug) {
          const blockEl = el.closest('[data-id]') as HTMLElement | null;
          (blockEl ?? (el as HTMLElement)).scrollIntoView({ behavior: 'smooth', block: 'start' });
          return;
        }
      }
    };

    document.addEventListener('click', onClick, { capture: true });
    return () => document.removeEventListener('click', onClick, { capture: true });
  }, []);

  // When selecting a different note, decide view vs edit
  useEffect(() => {
    if (selectedNote) {
      setEditTitle(selectedNote.title);
      setEditTags(selectedNote.tags || []);
      setTagInput('');
      setPreviousContent(null);

      // New / empty note -> edit mode, otherwise view mode
      const shouldEdit = !noteHasContent(selectedNote);
      setIsEditing(shouldEdit);
      setEditorKey((k) => k + 1);
    }
  }, [selectedNoteId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-initialize editor when sync resolves previously unresolved attachment URLs
  useEffect(() => {
    const content = selectedNote?.content;
    const prev = prevNoteContentRef.current;
    prevNoteContentRef.current = content;
    if (prev?.includes('dragonfly-attachment://') && content && !content.includes('dragonfly-attachment://')) {
      setEditorKey((k) => k + 1);
    }
  }, [selectedNote?.content]); // eslint-disable-line react-hooks/exhaustive-deps

  const switchToEdit = () => {
    setIsEditing(true);
    setEditorKey((k) => k + 1);
  };

  const switchToView = () => {
    // Flush editor content before leaving edit mode
    if (selectedNoteId && editor) {
      const content = JSON.stringify(editor.document);
      updateNote(selectedNoteId, { title: editTitle.trim(), content });
    }
    if (saveTitleTimerRef.current) clearTimeout(saveTitleTimerRef.current);
    if (saveContentTimerRef.current) clearTimeout(saveContentTimerRef.current);
    setIsEditing(false);
    setEditorKey((k) => k + 1);
  };

  // ── Auto-save ──

  const scheduleContentSave = useCallback(() => {
    if (!selectedNoteId || !editor || !isEditing) return;
    setChangeCounter((c) => c + 1);
    if (saveContentTimerRef.current) clearTimeout(saveContentTimerRef.current);
    saveContentTimerRef.current = setTimeout(() => {
      const content = JSON.stringify(editor.document);
      updateNote(selectedNoteId, { content });
    }, 1000);
  }, [selectedNoteId, editor, isEditing, updateNote]);

  const scheduleTitleSave = useCallback(
    (newTitle: string) => {
      if (!selectedNoteId) return;
      if (saveTitleTimerRef.current) clearTimeout(saveTitleTimerRef.current);
      saveTitleTimerRef.current = setTimeout(() => {
        updateNote(selectedNoteId, { title: newTitle.trim() });
      }, 1000);
    },
    [selectedNoteId, updateNote]
  );

  const saveTags = useCallback(
    (newTags: string[]) => {
      if (!selectedNoteId) return;
      updateNote(selectedNoteId, { tags: newTags });
    },
    [selectedNoteId, updateNote]
  );

  useEffect(() => {
    return () => {
      if (saveTitleTimerRef.current) clearTimeout(saveTitleTimerRef.current);
      if (saveContentTimerRef.current) clearTimeout(saveContentTimerRef.current);
    };
  }, []);

  // ── Handlers ──

  const handleSelectNote = (note: Note) => {
    // Flush pending saves before switching
    const hasPendingTitle = saveTitleTimerRef.current !== null;
    const hasPendingContent = saveContentTimerRef.current !== null;
    if (saveTitleTimerRef.current) clearTimeout(saveTitleTimerRef.current);
    if (saveContentTimerRef.current) clearTimeout(saveContentTimerRef.current);
    if ((hasPendingTitle || hasPendingContent) && selectedNoteId && editor && isEditing) {
      const content = JSON.stringify(editor.document);
      updateNote(selectedNoteId, { title: editTitle.trim(), content });
    }
    setSelectedNoteId(note.id);
  };

  const handleCreateNote = async (parentId: string | null = null) => {
    const note = await addNote({ title: '', content: '', tags: [], parentId });
    setSelectedNoteId(note.id);
  };

  const handleCreateChild = (parentId: string) => handleCreateNote(parentId);

  useEffect(() => {
    if (createRequested) {
      handleCreateNote(null);
      onCreateHandled?.();
    }
  }, [createRequested]);

  const handleDeleteRequest = () => {
    if (!selectedNoteId) return;
    setDeleteDialogNoteId(selectedNoteId);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteDialogNoteId) return;
    await deleteNote(deleteDialogNoteId);
    if (selectedNoteId === deleteDialogNoteId) setSelectedNoteId(null);
    setDeleteDialogNoteId(null);
  };

  const handleDeleteWithChildren = async () => {
    if (!deleteDialogNoteId) return;
    await deleteNote(deleteDialogNoteId, true);
    if (selectedNoteId === deleteDialogNoteId) setSelectedNoteId(null);
    setDeleteDialogNoteId(null);
  };

  const handleDeleteKeepChildren = async () => {
    if (!deleteDialogNoteId) return;
    await deleteNote(deleteDialogNoteId, false);
    if (selectedNoteId === deleteDialogNoteId) setSelectedNoteId(null);
    setDeleteDialogNoteId(null);
  };

  const handleTagKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault();
      const newTag = tagInput.trim();
      if (!editTags.includes(newTag)) {
        const newTags = [...editTags, newTag];
        setEditTags(newTags);
        saveTags(newTags);
      }
      setTagInput('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    const newTags = editTags.filter((tag) => tag !== tagToRemove);
    setEditTags(newTags);
    saveTags(newTags);
  };

  const handleImproveText = async () => {
    if (!editor || isImproving) return;
    const content = JSON.stringify(editor.document);
    setPreviousContent(content);
    setIsImproving(true);
    try {
      const improvedContent = await improveText(content, customPrompt);
      const blocks = JSON.parse(improvedContent);
      editor.replaceBlocks(editor.document, blocks);
      if (selectedNoteId) {
        updateNote(selectedNoteId, { content: JSON.stringify(editor.document) });
      }
    } catch (error) {
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
      if (selectedNoteId) updateNote(selectedNoteId, { content: previousContent });
    } catch {
      /* ignore */
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    const note = event.active.data.current?.note as Note | undefined;
    setDraggedNote(note ?? null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setDraggedNote(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const draggedId = active.id as string;

    // Drop on root zone
    if (over.id === 'root') {
      const draggedItem = notes.find((n) => n.id === draggedId);
      if (draggedItem?.parentId !== null) {
        moveNote(draggedId, null);
      }
      return;
    }

    const targetId = over.id as string;

    // Prevent dropping on self or own descendants (cycle)
    if (isDescendant(draggedId, targetId, notes)) return;

    // Prevent no-op (already a child of this parent)
    const draggedItem = notes.find((n) => n.id === draggedId);
    if (draggedItem?.parentId === targetId) return;

    moveNote(draggedId, targetId);
  };

  const handleExportMarkdown = async () => {
    if (!editor || !selectedNote) return;
    try {
      const parts: string[] = [];
      for (const block of editor.document) {
        if (block.type === 'mermaid') {
          const code = (block.props as Record<string, string>).code || '';
          parts.push('```mermaid\n' + code + '\n```');
        } else {
          // blocksToMarkdownLossy expects blocks from the default schema;
          // custom blocks are skipped gracefully at runtime.
          // block comes from editor.document (Block type); blocksToMarkdownLossy accepts PartialBlock.
          // PartialBlock is a subtype of Block at runtime — safe to cast.
          type BnBlock = NonNullable<Parameters<typeof editor.blocksToMarkdownLossy>[0]>[number];
          const blockMd = await editor.blocksToMarkdownLossy([block as unknown as BnBlock]);
          if (blockMd.trim()) parts.push(blockMd.trim());
        }
      }
      const md = parts.join('\n\n');
      const title = selectedNote.title.trim() || t('notes.untitled');
      const content = `# ${title}\n\n${md}`;
      const fileName = `${title.replace(/[^a-zA-Z0-9äöüÄÖÜß _-]/g, '_')}.md`;

      const filePath = await save({
        defaultPath: fileName,
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      });
      if (!filePath) return;

      await writeTextFile(filePath, content);
    } catch (err) {
      log('ERR', 'notesPage.handleExportMarkdown: ' + String(err));
    }
  };


  const rootNotes = getRootNotes().slice().sort(sortFn);
  const deleteDialogNote = deleteDialogNoteId
    ? notes.find((n) => n.id === deleteDialogNoteId)
    : null;
  const deleteDialogHasChildren = deleteDialogNoteId
    ? getChildren(deleteDialogNoteId).length > 0
    : false;

  // ── Render ──

  return (
    <div className="flex h-[calc(100vh-4rem)] -m-6">
      {/* ── Tree Panel ── */}
      <div className="shrink-0 border-r border-border bg-background flex flex-col relative" style={{ width: sidebarWidth }}>
        {/* Resize handle */}
        <div className="absolute top-0 right-0 w-0.5 h-full bg-border z-10 flex items-center justify-center">
          <div
            className="w-4 h-10 -mr-[7px] rounded-sm bg-muted border border-border shadow-sm cursor-col-resize hover:bg-primary/20 hover:border-primary/40 active:bg-primary/30 transition-colors flex items-center justify-center"
            onMouseDown={handleSidebarResize}
          >
            <div className="flex gap-[2px]">
              <div className="w-[2px] h-4 rounded-full bg-muted-foreground/40" />
              <div className="w-[2px] h-4 rounded-full bg-muted-foreground/40" />
            </div>
          </div>
        </div>
        <div className="px-3 pt-3 pb-2">
          <div className="relative">
            <IconSearch
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              placeholder={t('notes.search')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-sm"
            />
            {searchQuery && (
              <button
                type="button"
                className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 hover:bg-muted rounded-sm"
                onClick={() => setSearchQuery('')}
              >
                <IconX size={12} />
              </button>
            )}
          </div>
        </div>

        {favoriteNotes.length > 0 && (
          <div className="border-b border-border shrink-0">
            <button
              type="button"
              className="flex items-center justify-between w-full px-3 py-1.5 text-[0.65rem] font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors"
              onClick={() => setFavoritesExpanded(!favoritesExpanded)}
            >
              <span>{t('notes.favorites')} ({favoriteNotes.length})</span>
              {favoritesExpanded ? <IconChevronsDown size={12} /> : <IconChevronsUp size={12} />}
            </button>
            {favoritesExpanded && (
              <div className="pb-1.5">
                {favoriteNotes.map((note) => (
                  <div
                    key={note.id}
                    className={cn(
                      'group/fav flex items-center gap-1.5 px-3 py-1 cursor-pointer text-sm hover:bg-amber-100/60 transition-colors',
                      selectedNoteId === note.id && 'bg-amber-100/80 font-medium'
                    )}
                    onClick={() => handleSelectNote(note)}
                  >
                    <IconStarFilled size={13} className="shrink-0 text-amber-500" />
                    <span className="truncate flex-1">{note.title || t('notes.untitled')}</span>
                    <button
                      type="button"
                      className="shrink-0 p-0.5 opacity-0 group-hover/fav:opacity-100 hover:bg-amber-200/60 rounded-sm transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(note.id);
                      }}
                      title="Remove from favorites"
                    >
                      <IconX size={12} className="text-muted-foreground" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between px-3 pt-3 pb-1.5">
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">{t('sidebar.notes')}</span>
          <div className="flex items-center gap-0.5">
            {/* Sort dropdown */}
            <div className="relative">
              <button
                type="button"
                className="p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-sm transition-colors"
                onClick={() => setSortMenuOpen((o) => !o)}
                title={t('notes.sortLabel')}
              >
                <IconArrowsSort size={14} />
              </button>
              {sortMenuOpen && (
                <div
                  className="absolute right-0 top-6 z-50 bg-popover border rounded-md shadow-md py-1 min-w-[160px]"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  {(['created_asc', 'created_desc', 'title_asc', 'title_desc'] as const).map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      className={cn(
                        'w-full text-left px-3 py-1.5 text-xs hover:bg-muted transition-colors',
                        noteSort === opt && 'text-primary font-medium'
                      )}
                      onClick={() => handleSetSort(opt)}
                    >
                      {t(`notes.sort${opt.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join('')}`)}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              className="p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-sm transition-colors"
              onClick={() => setExpandSignal((s) => ({ key: s.key + 1, expanded: !s.expanded }))}
              title={expandSignal.expanded ? t('notes.collapseAll') : t('notes.expandAll')}
            >
              {expandSignal.expanded ? <IconChevronsUp size={14} /> : <IconChevronsDown size={14} />}
            </button>
          </div>
        </div>

        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="flex-1 overflow-y-auto">
              {rootNotes.length === 0 ? (
                <div className="text-center text-muted-foreground text-sm py-8 px-3">
                  {t('notes.empty')}
                </div>
              ) : (
                rootNotes.map((note) => (
                  <NoteTreeItem
                    key={note.id}
                    note={note}
                    level={0}
                    activeNoteId={selectedNoteId}
                    onSelect={handleSelectNote}
                    onCreateChild={handleCreateChild}
                    filterMatch={filterMatch}
                    expandSignal={expandSignal}
                    sortFn={sortFn}
                  />
                ))
              )}
              <RootDropZone />
            </div>
          <DragOverlay dropAnimation={null}>
            {draggedNote ? (
              <div className="flex items-center gap-1.5 py-1 px-3 bg-white border border-primary/30 shadow-md text-sm rounded-sm">
                <IconNote size={15} className="shrink-0 text-primary" />
                <span className="truncate">{draggedNote.title || t('notes.untitled')}</span>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>

        {allTags.length > 0 && (
          <div className="border-t border-border shrink-0">
            <button
              type="button"
              className="flex items-center justify-between w-full px-3 py-1.5 text-[0.65rem] font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors"
              onClick={() => setTagsExpanded(!tagsExpanded)}
            >
              <span>Tags ({allTags.length}){selectedTag ? ` — ${selectedTag}` : ''}</span>
              {tagsExpanded ? <IconChevronsDown size={12} /> : <IconChevronsUp size={12} />}
            </button>
            {tagsExpanded && (
              <div className="px-3 pb-2 flex gap-1 flex-wrap">
                <button
                  type="button"
                  className={`text-[0.65rem] px-2 py-0.5 border transition-colors ${
                    !selectedTag
                      ? 'bg-primary text-white border-primary'
                      : 'bg-transparent text-muted-foreground border-border hover:border-primary/50'
                  }`}
                  onClick={() => setSelectedTag(null)}
                >
                  {t('notes.allTags')}
                </button>
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className={`text-[0.65rem] px-2 py-0.5 border transition-colors ${
                      selectedTag === tag
                        ? 'bg-primary text-white border-primary'
                        : 'bg-transparent text-muted-foreground border-border hover:border-primary/50'
                    }`}
                    onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Content Panel ── */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#eef1f6]">
        {selectedNote ? (
          isEditing ? (
            /* ══ EDIT MODE ══ */
            <>
              {/* Header */}
              <div className="flex items-center gap-3 px-6 py-3 bg-white border-b border-border shrink-0">
                <input
                  type="text"
                  className="flex-1 text-lg font-bold bg-transparent border-none outline-none placeholder:text-muted-foreground"
                  placeholder={t('notes.titlePlaceholder')}
                  value={editTitle}
                  onChange={(e) => {
                    setEditTitle(e.target.value);
                    scheduleTitleSave(e.target.value);
                  }}
                  autoFocus
                />
                {othersPresent > 0 && (
                  <span className="flex items-center gap-1 text-xs text-amber-500 shrink-0">
                    <IconUsers size={13} />
                    {othersPresent}
                  </span>
                )}
                <Button variant="outline" size="sm" className="shrink-0" onClick={switchToView}>
                  <IconEye size={15} className="mr-1" />
                  {t('notes.view')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => setTocOpen((v) => !v)}
                  disabled={headings.length === 0}
                  title={t('notes.toc', 'Table of Contents')}
                >
                  <IconList size={15} />
                </Button>
                {voiceEnabled && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => setVoiceModalOpen(true)}
                    title={t('voice.title')}
                  >
                    <IconMicrophone size={15} />
                  </Button>
                )}
                <Button variant="outline" size="sm" className="shrink-0" onClick={handleExportMarkdown}>
                  <IconDownload size={15} className="mr-1" />
                  Markdown
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                  onClick={handleDeleteRequest}
                >
                  <IconTrash size={16} />
                </Button>
              </div>

              {/* Tags */}
              <div className="flex items-center gap-2 px-6 py-2 bg-white border-b border-border shrink-0 flex-wrap">
                {editTags.map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="flex items-center gap-1 text-[0.7rem]"
                  >
                    {tag}
                    <button
                      type="button"
                      className="ml-0.5 hover:text-foreground"
                      onClick={() => removeTag(tag)}
                    >
                      <IconX size={10} />
                    </button>
                  </Badge>
                ))}
                <Input
                  className="w-[160px] h-6 text-xs border-none shadow-none bg-transparent px-1"
                  placeholder={t('task.tagsPlaceholder')}
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleTagKeyDown}
                />
              </div>

              {/* AI bar */}
              <div className="flex items-center gap-2 px-6 py-1.5 bg-gradient-to-r from-primary to-[#005a8c] shrink-0">
                {previousContent && (
                  <button
                    type="button"
                    className="inline-flex items-center text-xs border border-white/30 text-white px-2 py-0.5 hover:bg-white/15"
                    onClick={handleUndoImprove}
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

              {/* Editor area - horizontal flex for editor + TOC */}
              <div className="flex-1 min-h-0 overflow-hidden flex flex-row">
                <div className="flex-1 min-w-0 bg-white flex flex-col">
                  {editor && (
                    <div ref={editorContainerRef} className="flex-1 min-h-0 overflow-y-auto">
                      <BlockNoteView editor={editor} theme="light" editable={true} onChange={scheduleContentSave} slashMenu={false}>
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
                  )}
                </div>
                {tocOpen && headings.length > 0 && (
                  <div className="w-[190px] shrink-0 border-l border-border bg-slate-50/60 overflow-y-auto">
                    <div className="px-3 pt-3 pb-2">
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
                        {t('notes.toc', 'On this page')}
                      </span>
                    </div>
                    <div className="pb-3">
                      {headings.map((h) => (
                        <button
                          key={h.id}
                          type="button"
                          className="w-full text-left py-0.5 text-[11px] leading-snug transition-colors truncate hover:text-primary"
                          style={{
                            paddingLeft: `${10 + (h.level - 1) * 10}px`,
                            paddingRight: '10px',
                            color: h.level === 1 ? '#374151' : h.level === 2 ? '#6b7280' : '#9ca3af',
                            fontWeight: h.level === 1 ? 500 : 400,
                          }}
                          onClick={() => handleTocClick(h.id)}
                        >
                          {h.text}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* ══ VIEW MODE ══ */
            <>
              {/* Header */}
              <div className="flex items-center gap-3 px-6 py-4 bg-white border-b border-border shrink-0">
                <h2 className="flex-1 text-xl font-bold text-foreground truncate">
                  {selectedNote.title || (
                    <span className="text-muted-foreground italic">
                      {t('notes.titlePlaceholder')}
                    </span>
                  )}
                </h2>
                <Button size="sm" onClick={switchToEdit}>
                  <IconEdit size={15} className="mr-1" />
                  {t('notes.edit')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  onClick={() => setTocOpen((v) => !v)}
                  disabled={headings.length === 0}
                  title={t('notes.toc', 'Table of Contents')}
                >
                  <IconList size={15} />
                </Button>
                <Button variant="outline" size="sm" className="shrink-0" onClick={handleExportMarkdown}>
                  <IconDownload size={15} className="mr-1" />
                  Markdown
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                  onClick={handleDeleteRequest}
                >
                  <IconTrash size={16} />
                </Button>
              </div>

              {/* Tags (read-only) */}
              {selectedNote.tags.length > 0 && (
                <div className="flex items-center gap-2 px-6 py-2 bg-white border-b border-border shrink-0 flex-wrap">
                  {selectedNote.tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="text-[0.7rem]">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}

              {/* BlockNote in read-only mode + TOC */}
              <div className="flex-1 min-h-0 overflow-hidden flex flex-row">
                <div className="flex-1 min-w-0 bg-white flex flex-col">
                  {editor && (
                    <div className="flex-1 min-h-0 overflow-y-auto">
                      <BlockNoteView editor={editor} theme="light" editable={false} slashMenu={false} />
                    </div>
                  )}
                </div>
                {tocOpen && headings.length > 0 && (
                  <div className="w-[190px] shrink-0 border-l border-border bg-slate-50/60 overflow-y-auto">
                    <div className="px-3 pt-3 pb-2">
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">
                        {t('notes.toc', 'On this page')}
                      </span>
                    </div>
                    <div className="pb-3">
                      {headings.map((h) => (
                        <button
                          key={h.id}
                          type="button"
                          className="w-full text-left py-0.5 text-[11px] leading-snug transition-colors truncate hover:text-primary"
                          style={{
                            paddingLeft: `${10 + (h.level - 1) * 10}px`,
                            paddingRight: '10px',
                            color: h.level === 1 ? '#374151' : h.level === 2 ? '#6b7280' : '#9ca3af',
                            fontWeight: h.level === 1 ? 500 : 400,
                          }}
                          onClick={() => handleTocClick(h.id)}
                        >
                          {h.text}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )
        ) : (
          /* ── No selection ── */
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <IconNote size={48} className="mx-auto mb-3 opacity-30" />
              <p>{t('notes.noSelection')}</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Delete dialog ── */}
      <AppModal
        isOpen={!!deleteDialogNoteId}
        onClose={() => setDeleteDialogNoteId(null)}
        title={t('task.delete')}
        size="sm"
        footer={
          deleteDialogHasChildren ? (
            <div className="flex gap-2 w-full">
              <Button
                variant="destructive"
                size="sm"
                className="flex-1"
                onClick={handleDeleteWithChildren}
              >
                {t('notes.deleteWithChildren')}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="flex-1"
                onClick={handleDeleteKeepChildren}
              >
                {t('notes.deleteKeepChildren')}
              </Button>
            </div>
          ) : (
            <div className="flex gap-2 w-full justify-end">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setDeleteDialogNoteId(null)}
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
          {deleteDialogHasChildren
            ? t('notes.deleteHasChildren', { title: deleteDialogNote?.title || '' })
            : t('notes.confirmDelete')
          }
        </p>
      </AppModal>

      {/* ── Scratchpad picker ── */}
      <ScratchpadPickerModal
        editor={scratchpadPickerEditor}
        onClose={() => setScratchpadPickerEditor(null)}
      />

      {/* ── Voice recorder ── */}
      <VoiceRecorderModal
        isOpen={voiceModalOpen}
        onClose={() => setVoiceModalOpen(false)}
        onTranscription={(text) => {
          if (!editor) return;
          try {
            const cursorBlock = editor.getTextCursorPosition().block;
            editor.insertBlocks(
              [{ type: 'paragraph', content: text }],
              cursorBlock,
              'after'
            );
          } catch {
            // Cursor not positioned — append at end of document
            const lastBlock = editor.document[editor.document.length - 1];
            if (lastBlock) {
              editor.insertBlocks(
                [{ type: 'paragraph', content: text }],
                lastBlock,
                'after'
              );
            }
          }
        }}
      />
    </div>
  );
}

export default NotesPage;
