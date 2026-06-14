import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Excalidraw } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';

// Derive Excalidraw types from the component's props (avoids importing from internal paths)
type ExcalidrawProps = Parameters<typeof Excalidraw>[0];
type ExcalidrawOnChange = NonNullable<ExcalidrawProps['onChange']>;
type ExcalidrawChangeElements = Parameters<ExcalidrawOnChange>[0];
type ExcalidrawChangeAppState = Parameters<ExcalidrawOnChange>[1];
type ExcalidrawChangeFiles = Parameters<ExcalidrawOnChange>[2];
type ExcalidrawAPI = NonNullable<Parameters<NonNullable<ExcalidrawProps['excalidrawAPI']>>[0]>;

// Minimal library item shape used by the library change callback
interface LibraryItemLike {
  status: string;
}
import { IconSearch, IconX, IconTrash, IconBrush, IconDeviceFloppy, IconCheck, IconArrowsMaximize, IconStarFilled, IconStar, IconChevronsDown, IconChevronsUp } from '@tabler/icons-react';
import { mkdir, readDir, readTextFile, writeTextFile, BaseDirectory } from '@tauri-apps/plugin-fs';
import { useScratchpadStore } from '../stores/scratchpadStore';
import { Scratchpad } from '../types';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { AppModal } from './ui/app-modal';
import { cn } from '@/lib/utils';

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

// Transient appState fields to strip before persisting
const TRANSIENT_FIELDS = [
  'collaborators',
  'cursorButton',
  'draggingElement',
  'editingElement',
  'editingGroupId',
  'editingLinearElement',
  'isBindingEnabled',
  'isLoading',
  'isResizing',
  'isRotating',
  'lastPointerDownWith',
  'multiElement',
  'openDialog',
  'openMenu',
  'openPopup',
  'openSidebar',
  'pasteDialog',
  'pendingImageElementId',
  'previousSelectedElementIds',
  'resizingElement',
  'scrolledOutside',
  'selectedElementIds',
  'selectedGroupIds',
  'selectionElement',
  'showHyperlinkPopup',
  'suggestedBindings',
  'toast',
  'zenModeEnabled',
  'viewModeEnabled',
  'activeTool',
  'penMode',
  'penDetected',
  'selectedElementsAreBeingDragged',
  'selectedLinearElement',
  'snapLines',
  'startBoundElement',
  'originSnapOffset',
  'objectsSnapModeEnabled',
  'activeEmbeddable',
  'editingFrame',
  'elementsToHighlight',
  'frameRendering',
  'frameToHighlight',
  'newElement',
];

function sanitizeAppState(appState: ExcalidrawChangeAppState): Partial<ExcalidrawChangeAppState> {
  if (!appState) return {};
  const cleaned = { ...appState } as Partial<ExcalidrawChangeAppState> & Record<string, unknown>;
  for (const field of TRANSIENT_FIELDS) {
    delete cleaned[field];
  }
  return cleaned;
}

function ScratchpadPage({
  createRequested,
  onCreateHandled,
  initialScratchpadId,
  onInitialHandled,
}: {
  createRequested?: boolean;
  onCreateHandled?: () => void;
  initialScratchpadId?: string | null;
  onInitialHandled?: () => void;
}) {
  const { t } = useTranslation();
  const { scratchpads, addScratchpad, updateScratchpad, deleteScratchpad, toggleFavorite } =
    useScratchpadStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [excalidrawKey, setExcalidrawKey] = useState(0);
  const [deleteDialogId, setDeleteDialogId] = useState<string | null>(null);
  const [favoritesExpanded, setFavoritesExpanded] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState('');
  const titleInputRef = useRef<HTMLInputElement>(null);
  const excalidrawApiRef = useRef<ExcalidrawAPI | null>(null);
  // Tracks which scratchpad ID the current Excalidraw instance is actually showing.
  // Prevents race condition where onChange fires with stale content but new selectedId.
  const excalidrawScratchpadIdRef = useRef<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Resizable sidebar
  const [sidebarWidth, setSidebarWidth] = useState(290);
  const handleSidebarResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    const onMouseMove = (ev: MouseEvent) => {
      const newWidth = Math.max(290, startWidth + (ev.clientX - startX));
      setSidebarWidth(newWidth);
    };
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [sidebarWidth]);

  // Auto-save timer
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedContentRef = useRef<string>('');
  const pendingRef = useRef<{ id: string; content: string } | null>(null);

  const selectedScratchpad = useMemo(
    () => scratchpads.find((s) => s.id === selectedId) ?? null,
    [scratchpads, selectedId]
  );

  const favoriteScratchpads = useMemo(
    () => scratchpads.filter((s) => s.favorite),
    [scratchpads]
  );

  const filteredScratchpads = useMemo(() => {
    if (!searchQuery.trim()) return scratchpads;
    const q = searchQuery.toLowerCase();
    return scratchpads.filter((s) => s.title.toLowerCase().includes(q));
  }, [scratchpads, searchQuery]);

  // Parse initial scene data
  const initialData = useMemo(() => {
    if (!selectedScratchpad?.content) return undefined;
    try {
      const parsed = JSON.parse(selectedScratchpad.content);
      return {
        elements: parsed.elements || [],
        appState: parsed.appState || {},
        files: parsed.files || undefined,
      };
    } catch {
      return undefined;
    }
  }, [excalidrawKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle create request from parent
  useEffect(() => {
    if (createRequested) {
      handleCreate();
      onCreateHandled?.();
    }
  }, [createRequested]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle navigation from embedded scratchpad blocks
  useEffect(() => {
    if (initialScratchpadId) {
      setSelectedId(initialScratchpadId);
      onInitialHandled?.();
    }
  }, [initialScratchpadId]); // eslint-disable-line react-hooks/exhaustive-deps

  // When selecting a scratchpad, reset editor
  useEffect(() => {
    if (selectedScratchpad) {
      setTitleValue(selectedScratchpad.title);
      lastSavedContentRef.current = selectedScratchpad.content || '';
      setExcalidrawKey((k) => k + 1);
    }
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Flush pending save on unmount (page switch)
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      if (pendingRef.current) {
        updateScratchpad(pendingRef.current.id, { content: pendingRef.current.content });
        pendingRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load .excalidrawlib files from AppData/libraries/ folder
  const loadLibraries = useCallback(async (api: ExcalidrawAPI | null) => {
    if (!api) return;

    try {
      await mkdir('libraries', { baseDir: BaseDirectory.AppData, recursive: true });

      const entries = await readDir('libraries', { baseDir: BaseDirectory.AppData });
      const libFiles = entries.filter((e) => e.name?.endsWith('.excalidrawlib'));

      if (libFiles.length === 0) return;

      const allItems: unknown[] = [];
      for (const file of libFiles) {
        try {
          const content = await readTextFile(`libraries/${file.name}`, {
            baseDir: BaseDirectory.AppData,
          });
          const parsed = JSON.parse(content);
          if (parsed?.libraryItems) {
            allItems.push(...parsed.libraryItems);
          }
        } catch {
          // skip broken files
        }
      }

      if (allItems.length > 0) {
        api.updateLibrary({
          libraryItems: allItems as Parameters<typeof api.updateLibrary>[0]['libraryItems'],
          merge: true,
          defaultStatus: 'published',
        });
      }
    } catch {
      // silently ignore
    }
  }, []);

  // Persist personal library items to AppData/libraries/personal.excalidrawlib
  const librarySaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleLibraryChange = useCallback((items: readonly LibraryItemLike[]) => {
    // Only save unpublished (personal) items
    const personalItems = items.filter((item) => item.status !== 'published');

    if (librarySaveTimerRef.current) clearTimeout(librarySaveTimerRef.current);
    librarySaveTimerRef.current = setTimeout(async () => {
      try {
        await mkdir('libraries', { baseDir: BaseDirectory.AppData, recursive: true });
        const data = JSON.stringify({
          type: 'excalidrawlib',
          version: 2,
          libraryItems: personalItems,
        });
        await writeTextFile('libraries/personal.excalidrawlib', data, {
          baseDir: BaseDirectory.AppData,
        });
      } catch {
        // silently ignore
      }
    }, 1000);
  }, []);

  const handleCreate = async () => {
    const scratchpad = await addScratchpad();
    setSelectedId(scratchpad.id);
  };

  const handleSelect = (scratchpad: Scratchpad) => {
    // Flush pending save immediately
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (pendingRef.current) {
      updateScratchpad(pendingRef.current.id, { content: pendingRef.current.content });
      pendingRef.current = null;
    }
    // Prevent onChange during transition from saving to wrong scratchpad
    excalidrawScratchpadIdRef.current = null;
    setSelectedId(scratchpad.id);
  };

  const handleChange = useCallback(
    (elements: ExcalidrawChangeElements, appState: ExcalidrawChangeAppState, files: ExcalidrawChangeFiles) => {
      // Use ref instead of selectedId closure to avoid race condition:
      // When switching scratchpads, selectedId updates before excalidrawKey,
      // so the old Excalidraw instance would save its content under the new ID.
      const currentId = excalidrawScratchpadIdRef.current;
      if (!currentId) return;

      const content = JSON.stringify({
        elements,
        appState: sanitizeAppState(appState),
        files: files || undefined,
      });

      // Skip if content hasn't changed
      if (content === lastSavedContentRef.current) return;

      pendingRef.current = { id: currentId, content };

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        lastSavedContentRef.current = content;
        updateScratchpad(currentId, { content });
        pendingRef.current = null;
      }, 1500);
    },
    [updateScratchpad]
  );

  const handleTitleClick = () => {
    if (!selectedScratchpad) return;
    setTitleValue(selectedScratchpad.title);
    setEditingTitle(true);
    setTimeout(() => titleInputRef.current?.focus(), 0);
  };

  const handleTitleBlur = () => {
    setEditingTitle(false);
    if (selectedId) {
      updateScratchpad(selectedId, { title: titleValue.trim() });
    }
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleTitleBlur();
    }
  };

  const handleManualSave = useCallback(() => {
    if (!selectedId || !excalidrawApiRef.current) return;
    // Flush pending auto-save
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const api = excalidrawApiRef.current;
    const elements = api.getSceneElements();
    const appState = api.getAppState();
    const files = api.getFiles();
    const content = JSON.stringify({
      elements,
      appState: sanitizeAppState(appState),
      files: files || undefined,
    });
    lastSavedContentRef.current = content;
    updateScratchpad(selectedId, { content });
    pendingRef.current = null;
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }, [selectedId, updateScratchpad]);

  const handleDeleteRequest = (id: string) => {
    setDeleteDialogId(id);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteDialogId) return;
    await deleteScratchpad(deleteDialogId);
    if (selectedId === deleteDialogId) setSelectedId(null);
    setDeleteDialogId(null);
  };

  return (
    <div className="flex h-full">
      {/* Left panel - list */}
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
              placeholder={t('scratchpad.search')}
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

        {/* Favorites section */}
        {favoriteScratchpads.length > 0 && (
          <div className="border-b border-border shrink-0">
            <button
              type="button"
              className="flex items-center justify-between w-full px-3 py-1.5 text-[0.65rem] font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors"
              onClick={() => setFavoritesExpanded(!favoritesExpanded)}
            >
              <span>{t('notes.favorites')} ({favoriteScratchpads.length})</span>
              {favoritesExpanded ? <IconChevronsDown size={12} /> : <IconChevronsUp size={12} />}
            </button>
            {favoritesExpanded && (
              <div className="pb-1.5">
                {favoriteScratchpads.map((sp) => (
                  <div
                    key={sp.id}
                    className={cn(
                      'group/fav flex items-center gap-1.5 px-3 py-1 cursor-pointer text-sm hover:bg-amber-100/60 transition-colors',
                      selectedId === sp.id && 'bg-amber-100/80 font-medium'
                    )}
                    onClick={() => handleSelect(sp)}
                  >
                    <IconStarFilled size={13} className="shrink-0 text-amber-500" />
                    <span className="truncate flex-1">{sp.title || t('scratchpad.create')}</span>
                    <button
                      type="button"
                      className="shrink-0 p-0.5 opacity-0 group-hover/fav:opacity-100 hover:bg-amber-200/60 rounded-sm transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(sp.id);
                      }}
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
          <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">
            {t('scratchpad.title')}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredScratchpads.length === 0 ? (
            <div className="text-center text-muted-foreground text-sm py-8 px-3">
              {t('scratchpad.empty')}
            </div>
          ) : (
            filteredScratchpads.map((sp) => (
              <div
                key={sp.id}
                className={`group flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${
                  selectedId === sp.id
                    ? 'bg-primary/10 border-l-2 border-primary'
                    : 'hover:bg-muted border-l-2 border-transparent'
                }`}
                onClick={() => handleSelect(sp)}
              >
                <IconBrush size={15} className="shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">
                    {sp.title || t('scratchpad.create')}
                  </div>
                  <div className="text-[0.65rem] text-muted-foreground">
                    {formatDate(sp.createdAt)} <span className="text-[0.55rem] opacity-70">({formatDate(sp.updatedAt)})</span>
                  </div>
                </div>
                <button
                  type="button"
                  className={cn(
                    'p-1 transition-opacity',
                    sp.favorite
                      ? 'text-amber-500'
                      : 'text-muted-foreground hover:text-amber-500 opacity-0 group-hover:opacity-100'
                  )}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavorite(sp.id);
                  }}
                >
                  {sp.favorite ? <IconStarFilled size={14} /> : <IconStar size={14} />}
                </button>
                <button
                  type="button"
                  className="p-1 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteRequest(sp.id);
                  }}
                >
                  <IconTrash size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right panel - Excalidraw */}
      <div className="flex-1 flex flex-col min-w-0 bg-white">
        {selectedScratchpad ? (
          <>
            {/* Title bar */}
            <div className="flex items-center gap-3 px-6 py-3 bg-white border-b border-border shrink-0">
              {editingTitle ? (
                <input
                  ref={titleInputRef}
                  type="text"
                  className="flex-1 text-lg font-bold bg-transparent border-none outline-none placeholder:text-muted-foreground"
                  placeholder={t('scratchpad.create')}
                  value={titleValue}
                  onChange={(e) => setTitleValue(e.target.value)}
                  onBlur={handleTitleBlur}
                  onKeyDown={handleTitleKeyDown}
                />
              ) : (
                <h2
                  className="flex-1 text-lg font-bold text-foreground truncate cursor-pointer hover:text-primary transition-colors"
                  onClick={handleTitleClick}
                >
                  {selectedScratchpad.title || (
                    <span className="text-muted-foreground italic">
                      {t('scratchpad.create')}
                    </span>
                  )}
                </h2>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0"
                onClick={() => toggleFavorite(selectedScratchpad.id)}
              >
                {selectedScratchpad.favorite
                  ? <IconStarFilled size={16} className="text-amber-500" />
                  : <IconStar size={16} className="text-muted-foreground" />
                }
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => {
                  excalidrawApiRef.current?.scrollToContent(
                    excalidrawApiRef.current.getSceneElements(),
                    { fitToContent: true, animate: true }
                  );
                }}
                title={t('scratchpad.fitToContent')}
              >
                <IconArrowsMaximize size={16} />
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={handleManualSave}
                title={t('task.save')}
              >
                {saved ? <IconCheck size={16} className="text-green-600" /> : <IconDeviceFloppy size={16} />}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                onClick={() => handleDeleteRequest(selectedScratchpad.id)}
              >
                <IconTrash size={16} />
              </Button>
            </div>

            {/* Excalidraw canvas */}
            <div className="flex-1 min-h-0 relative">
              <Excalidraw
                key={excalidrawKey}
                initialData={initialData}
                onChange={handleChange}
                onLibraryChange={handleLibraryChange}
                excalidrawAPI={(api) => { excalidrawApiRef.current = api; excalidrawScratchpadIdRef.current = selectedId; loadLibraries(api); }}
                theme="light"
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-muted-foreground">
              <IconBrush size={48} className="mx-auto mb-3 opacity-30" />
              <p>{t('scratchpad.noSelection')}</p>
            </div>
          </div>
        )}
      </div>

      {/* Delete dialog */}
      <AppModal
        isOpen={!!deleteDialogId}
        onClose={() => setDeleteDialogId(null)}
        title={t('task.delete')}
        size="sm"
        footer={
          <div className="flex gap-2 w-full justify-end">
            <Button variant="secondary" size="sm" onClick={() => setDeleteDialogId(null)}>
              {t('task.cancel')}
            </Button>
            <Button variant="destructive" size="sm" onClick={handleDeleteConfirm}>
              {t('task.delete')}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-muted-foreground">{t('scratchpad.confirmDelete')}</p>
      </AppModal>
    </div>
  );
}

export default ScratchpadPage;
