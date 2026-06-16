import { useEffect, useState, useRef, useCallback } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { listen } from '@tauri-apps/api/event';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { useTaskStore } from './stores/taskStore';
import Sidebar from './components/Sidebar';
import KanbanBoard from './components/KanbanBoard';
import ReleaseSelector from './components/ReleaseSelector';
import UserSelector from './components/UserSelector';
import TaskModal from './components/TaskModal';
import SettingsPage from './components/SettingsPage';
import ReleasesPage from './components/ReleasesPage';
import TodoPage from './components/TodoPage';
import DashboardPage from './components/DashboardPage';
import NotesPage from './components/NotesPage';
import ScratchpadPage from './components/ScratchpadPage';
import RemindersPage from './components/RemindersPage';
import ReminderAlertModal from './components/ReminderAlertModal';
import PassphraseGate from './components/PassphraseGate';
import ProjectSelectionPage from './components/ProjectSelectionPage';
import { useNoteStore } from './stores/noteStore';
import { useScratchpadStore } from './stores/scratchpadStore';
import { useProjectStore } from './stores/projectStore';
import { useReminderStore } from './stores/reminderStore';
import { Task } from './types';
import { useTranslation } from 'react-i18next';
import { IconLayoutList, IconLayoutCards, IconDownload, IconSearch, IconAlertTriangle, IconPlus } from '@tabler/icons-react';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Switch } from './components/ui/switch';
import { AppModal } from './components/ui/app-modal';
import { initDatabase, getConfig, setConfig, runMigrations, SCHEMA_VERSION, getSchemaVersion } from './services/database';
import { syncService } from './services/syncService';
import { log } from './services/logService';
import { exportTasksCsv } from './services/csvExport';
import { useLayoutStore } from './stores/layoutStore';
import { open } from '@tauri-apps/plugin-shell';
import { invoke } from '@tauri-apps/api/core';

import { Page, TodoView } from './types/ui';
import { REMINDER_CHECK_INTERVAL_MS } from './lib/constants';

function App() {
  const { t } = useTranslation();
  const { tasks, releases, users, loadTasks, loadReleases, loadUsers } = useTaskStore();
  const { loadNotes } = useNoteStore();
  const { loadScratchpads } = useScratchpadStore();
  const { loadReminders, getDueReminders } = useReminderStore();
  const { projects, currentProjectId, loadProjects, setCurrentProject, getCurrentProject, updateProject } = useProjectStore();
  // Maps reminder id → last alerted nextOccurrence. Re-fires when nextOccurrence changes (snooze).
  const alertedRef = useRef<Map<string, string>>(new Map());
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const [projectSelected, setProjectSelected] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [todoView, setTodoView] = useState<TodoView>('cards');
  const [showDone, setShowDone] = useState(false);
  const [boardShowDone, setBoardShowDone] = useState(true);
  const [todoShowDone, setTodoShowDone] = useState(false);
  const [todoReleaseFilter, setTodoReleaseFilter] = useState<string | null>(null);
  const [todoFeatureFilter, setTodoFeatureFilter] = useState<string | null>(null);
  const [todoTagFilter, setTodoTagFilter] = useState<string | null>(null);
  const [releaseCreateRequested, setReleaseCreateRequested] = useState(false);
  const [noteCreateRequested, setNoteCreateRequested] = useState(false);
  const [scratchpadCreateRequested, setScratchpadCreateRequested] = useState(false);
  const [initialScratchpadId, setInitialScratchpadId] = useState<string | null>(null);
  const [todoSearch, setTodoSearch] = useState('');
  const [taskInitialValues, setTaskInitialValues] = useState<{ releaseId?: string | null; featureId?: string | null; type?: 'task' | 'feature' } | undefined>(undefined);
  const [showSplash, setShowSplash] = useState(true);
  const [showTombstoneModal, setShowTombstoneModal] = useState(false);
  const [dbReady, setDbReady] = useState(false);
  const [schemaBlocked, setSchemaBlocked] = useState(false);
  const [schemaVersionInfo, setSchemaVersionInfo] = useState<{ local: number; db: number } | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [_passphrase, setPassphrase] = useState<string | null>(null);
  const [autoLogoutMinutes, setAutoLogoutMinutes] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manualSwitchRef = useRef(false);
  const dbReadyRef = useRef(false);

  // Initialize database on mount (show splash for at least 2s)
  useEffect(() => {
    const init = async () => {
      try {
        const [,] = await Promise.all([
          new Promise((r) => setTimeout(r, 2000)),
          initDatabase(),
        ]);

        // Run schema migrations
        const result = await runMigrations();
        if (result === 'app_too_old') {
          const dbVersion = await getSchemaVersion();
          setSchemaVersionInfo({ local: SCHEMA_VERSION, db: dbVersion ?? 0 });
          setSchemaBlocked(true);
          return;
        }

        dbReadyRef.current = true;
        setDbReady(true);

        // Trigger personal todo + settings sync only if reminder sync is enabled (fire and forget)
        syncService.syncPersonalTodos().catch(() => {});
        syncService.syncPersonalSettings().catch(() => {});
      } catch (err) {
        log('ERR', 'app.init: Database initialization failed: ' + String(err));
      }
    };
    init();
  }, []);

  // BlockNote's file download button calls window.open() with asset:// URLs.
  // Tauri's WebView can't handle these as downloads, so we intercept and use Tauri's save dialog.
  useEffect(() => {
    const originalOpen = window.open.bind(window);
    window.open = function (url?: string | URL, ...args: unknown[]) {
      const href = url?.toString() || '';
      if (href.includes('asset.localhost') || href.startsWith('asset://')) {
        (async () => {
          try {
            const uuidExt = decodeURIComponent(href.split('/').pop() || '');
            const { getDb } = await import('./services/database');
            const db = await getDb();
            const rows = await db.select<{ file_name: string }[]>(
              "SELECT file_name FROM attachments WHERE file_path LIKE ?",
              [`%${uuidExt}%`]
            );
            const filename = rows[0]?.file_name || uuidExt;
            const savePath = await save({ defaultPath: filename });
            if (!savePath) return;
            const resp = await fetch(href);
            const buffer = await resp.arrayBuffer();
            await writeFile(savePath, new Uint8Array(buffer));
          } catch (err) {
            console.error('Download failed:', err);
          }
        })();
        return null;
      }
      return originalOpen(url as string, ...args);
    } as typeof window.open;
    return () => { window.open = originalOpen; };
  }, []);

  // Minimize to tray on close
  useEffect(() => {
    const win = getCurrentWindow();
    let unlisten: (() => void) | undefined;

    win.onCloseRequested(async (event) => {
      event.preventDefault(); // always take control to avoid re-trigger loop
      if (!dbReadyRef.current) {
        await win.destroy();
        return;
      }
      const setting = await getConfig('minimize_to_tray');
      if (setting === 'true') {
        await win.hide();
      } else {
        await win.destroy();
      }
    }).then((fn) => { unlisten = fn; });

    return () => { unlisten?.(); };
  }, []);

  // After unlock: migrate if needed, then load projects
  useEffect(() => {
    if (!unlocked || !dbReady) return;

    loadProjects();
  }, [unlocked, dbReady, loadProjects]);

  // Auto-select project if only one exists (skip on manual switch)
  useEffect(() => {
    if (!unlocked || !dbReady || projects.length === 0) return;
    if (projectSelected) return;
    if (manualSwitchRef.current) return;

    if (projects.length === 1) {
      setCurrentProject(projects[0].id);
      setProjectSelected(true);
    }
  }, [unlocked, dbReady, projects, projectSelected, setCurrentProject]);

  // Load data when project is selected, then dismiss splash
  useEffect(() => {
    if (!projectSelected || !currentProjectId) return;
    (async () => {
      try {
        await Promise.all([loadTasks(), loadReleases(), loadUsers(), loadNotes(), loadScratchpads(), loadReminders()]);
      } catch (err) {
        log('ERR', 'app: Failed to load stores: ' + String(err));
      }
      setShowSplash(false);
    })();
  }, [projectSelected, currentProjectId, loadTasks, loadReleases, loadUsers, loadNotes, loadScratchpads, loadReminders]);

  // Auto-connect to sync if credentials are saved (per-project)
  useEffect(() => {
    if (!unlocked || !dbReady || !projectSelected || !currentProjectId) return;
    if (syncService.isConnected) return;

    let cancelled = false;
    (async () => {
      try {
        const project = getCurrentProject();
        const savedUrl = project?.syncUrl;
        const savedKey = project?.syncSpaceKey;
        if (!savedUrl || !savedKey) {
          log('DBG', 'sync: No saved credentials for project, skipping auto-connect');
          return;
        }
        if (cancelled) return;
        log('INFO', 'sync: Auto-connecting to ' + savedUrl);
        await syncService.connect(savedUrl, savedKey, currentProjectId);
        log('OK', 'sync: Auto-connect successful');
      } catch (err) {
        log('ERR', 'sync: Auto-connect failed: ' + String(err));
      }
    })();

    return () => { cancelled = true; };
  }, [unlocked, dbReady, projectSelected, currentProjectId, getCurrentProject]);

  // Listen for incoming sync events and reload stores
  useEffect(() => {
    if (!unlocked || !dbReady || !projectSelected) return;

    const handleSync = () => {
      loadTasks();
      loadReleases();
      loadUsers();
      loadNotes();
      loadScratchpads();
    };

    window.addEventListener('dragonfly-sync', handleSync);
    return () => window.removeEventListener('dragonfly-sync', handleSync);
  }, [unlocked, dbReady, projectSelected, loadTasks, loadReleases, loadUsers, loadNotes, loadScratchpads]);

  // Reload reminders when reminder sync completes
  useEffect(() => {
    if (!unlocked || !dbReady) return;
    const handleReminderSync = () => loadReminders();
    window.addEventListener('dragonfly-reminders-sync', handleReminderSync);
    return () => window.removeEventListener('dragonfly-reminders-sync', handleReminderSync);
  }, [unlocked, dbReady, loadReminders]);

  // Reminder polling — check for due reminders every 60 seconds
  useEffect(() => {
    if (!unlocked || !dbReady) return;

    const checkDueReminders = async () => {
      const due = getDueReminders();
      for (const reminder of due) {
        const lastAlerted = alertedRef.current.get(reminder.id);
        if (lastAlerted === reminder.nextOccurrence) continue;
        alertedRef.current.set(reminder.id, reminder.nextOccurrence!);

        // If window is hidden (app in tray), bring it back up
        const win = getCurrentWindow();
        const windowVisible = await win.isVisible().catch(() => true);
        if (!windowVisible) {
          win.show().catch(() => {});
          win.setFocus().catch(() => {});
        }

        // In-app alert modal
        window.dispatchEvent(
          new CustomEvent('dragonfly-reminder-due', { detail: reminder })
        );

        // Email notification if configured
        if (reminder.notifyEmail) {
          try {
            const [smtpHost, smtpPort, smtpTls, smtpUser, smtpPass, smtpFrom, emailTo] =
              await Promise.all([
                getConfig('smtp_host'),
                getConfig('smtp_port'),
                getConfig('smtp_secure'),
                getConfig('smtp_username'),
                getConfig('smtp_password'),
                getConfig('smtp_from_email'),
                getConfig('notification_email_to'),
              ]);
            if (smtpHost && emailTo) {
              await invoke('send_notification_email', {
                to: emailTo,
                subject: t('reminders.emailSubject', { title: reminder.title }),
                body: `${reminder.title}\n\n${reminder.notes || ''}`,
                smtpHost,
                smtpPort: parseInt(smtpPort || '587', 10),
                smtpUsername: smtpUser || '',
                smtpPassword: smtpPass || '',
                smtpFrom: smtpFrom || smtpUser || '',
                smtpTls: smtpTls || 'starttls',
              });
            }
          } catch (err) {
            log('WARN', 'reminders: Email notification failed: ' + String(err));
          }
        }
      }
    };

    // Run immediately, then every 60s
    checkDueReminders();
    const interval = setInterval(checkDueReminders, REMINDER_CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [unlocked, dbReady, getDueReminders]);

  // Listen for project deletion events
  useEffect(() => {
    const handleProjectDeleted = async () => {
      await loadProjects();
      syncService.disconnect();
      manualSwitchRef.current = true;
      setProjectSelected(false);
    };

    const handleProjectTombstone = async () => {
      // Clear sync credentials so project becomes local-only (no reconnect loop)
      if (currentProjectId) {
        await updateProject(currentProjectId, { syncUrl: '', syncSpaceKey: '' });
      }
      setShowTombstoneModal(true);
    };

    window.addEventListener('dragonfly-project-deleted', handleProjectDeleted);
    window.addEventListener('dragonfly-project-tombstone', handleProjectTombstone);
    return () => {
      window.removeEventListener('dragonfly-project-deleted', handleProjectDeleted);
      window.removeEventListener('dragonfly-project-tombstone', handleProjectTombstone);
    };
  }, [loadProjects]);

  // Listen for scratchpad navigation from embedded blocks
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.scratchpadId) {
        setInitialScratchpadId(detail.scratchpadId);
        setCurrentPage('scratchpad');
      }
    };
    window.addEventListener('dragonfly-navigate-scratchpad', handler);
    return () => window.removeEventListener('dragonfly-navigate-scratchpad', handler);
  }, []);

  // Load user preferences after unlock
  useEffect(() => {
    if (!unlocked || !dbReady) return;
    (async () => {
      const val = await getConfig('auto_logout_minutes');
      setAutoLogoutMinutes(val ? parseInt(val, 10) || 0 : 0);
      const savedView = await getConfig('todo_view');
      if (savedView === 'cards' || savedView === 'list') setTodoView(savedView);
      const savedShowDone = await getConfig('dashboard_show_done');
      if (savedShowDone === 'true') setShowDone(true);
      const savedTodoShowDone = await getConfig('todo_show_done');
      if (savedTodoShowDone === 'true') setTodoShowDone(true);
      useLayoutStore.getState().loadDefaults();
    })();
  }, [unlocked, dbReady]);

  // Listen for config changes from SettingsPage
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.key === 'auto_logout_minutes') {
        setAutoLogoutMinutes(detail.value);
      }
    };
    window.addEventListener('dragonfly-config-changed', handler);
    return () => window.removeEventListener('dragonfly-config-changed', handler);
  }, []);

  // Auto-logout inactivity timer
  const resetTimer = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (autoLogoutMinutes > 0 && unlocked) {
      timeoutRef.current = setTimeout(() => {
        setUnlocked(false);
      }, autoLogoutMinutes * 60 * 1000);
    }
  }, [autoLogoutMinutes, unlocked]);

  useEffect(() => {
    if (!unlocked || autoLogoutMinutes <= 0) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      return;
    }

    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach((ev) => window.addEventListener(ev, resetTimer));
    resetTimer();

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, resetTimer));
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [unlocked, autoLogoutMinutes, resetTimer]);


  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        setEditingTask(null);
        setIsTaskModalOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleUnlock = (pw: string) => {
    setPassphrase(pw);
    setUnlocked(true);
  };

  const handleProjectSelect = (id: string) => {
    manualSwitchRef.current = false;
    setCurrentProject(id);
    setShowSplash(true);
    setProjectSelected(true);
  };

  const handleSwitchProject = () => {
    syncService.disconnect();
    manualSwitchRef.current = true;
    setProjectSelected(false);
  };

  const handleTaskClick = (task: Task) => {
    setEditingTask(task);
    setIsTaskModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsTaskModalOpen(false);
    setEditingTask(null);
    setTaskInitialValues(undefined);
  };

  const handleCreateTask = () => {
    setEditingTask(null);
    setTaskInitialValues(undefined);
    setIsTaskModalOpen(true);
  };

  const handleCreateTaskWith = (releaseId: string | null, featureId: string | null) => {
    setEditingTask(null);
    setTaskInitialValues({ releaseId, featureId });
    setIsTaskModalOpen(true);
  };

  // Global "add task" trigger — from tray menu item or Ctrl+N shortcut
  useEffect(() => {
    if (!unlocked || !dbReady || !currentProjectId) return;
    const unlisten = listen('dragonfly-add-task', () => {
      setCurrentPage('board');
      setEditingTask(null);
      setTaskInitialValues(undefined);
      setIsTaskModalOpen(true);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [unlocked, dbReady, currentProjectId]);

  // Show schema blocked screen
  if (schemaBlocked) {
    return (
      <div className="min-h-screen bg-[#0D1117] flex flex-col items-center justify-center p-8">
        <img src="/images/dragonfly-logo.svg" alt="DragonFly" className="w-14 h-14 mb-6" style={{ borderRadius: 6 }} />
        <IconAlertTriangle size={48} className="text-amber-500 mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">{t('schema.appTooOld')}</h2>
        <p className="text-white/60 text-sm text-center max-w-md mb-6">
          {t('schema.appTooOldMessage', {
            dbVersion: schemaVersionInfo?.db ?? '?',
            appVersion: schemaVersionInfo?.local ?? '?',
          })}
        </p>
        <Button onClick={() => open('https://github.com/Limozacloud/dragonfly/releases')}>
          <IconDownload size={16} className="mr-1" />
          {t('settings.downloadUpdate')}
        </Button>
      </div>
    );
  }

  // Show passphrase gate before anything else (once DB is ready)
  if (!unlocked) {
    if (!dbReady) {
      return (
        <div className="splash-screen">
          <img src="/images/dragonfly-logo.svg" alt="DragonFly" className="splash-logo" />
        </div>
      );
    }
    return <PassphraseGate onUnlock={handleUnlock} />;
  }

  // Show project selection when not yet selected (no projects, user switched, or multiple projects)
  if (!projectSelected) {
    return <ProjectSelectionPage onSelectProject={handleProjectSelect} />;
  }

  if (showSplash) {
    return (
      <div className="splash-screen">
        <img src="/images/dragonfly-logo.svg" alt="DragonFly" className="splash-logo" />
      </div>
    );
  }

  return (
    <div className="flex h-screen min-w-[800px] overflow-hidden bg-background">
      <Sidebar currentPage={currentPage} onPageChange={setCurrentPage} onSwitchProject={handleSwitchProject} />

      <div className="flex-1 flex flex-col overflow-hidden">
        {currentPage === 'dashboard' && (
          <>
            <div className="h-14 min-h-[56px] px-6 flex items-center justify-between bg-white border-b border-border shadow-sm overflow-x-auto">
              <h4 className="font-semibold text-foreground m-0 shrink-0">{t('sidebar.dashboard')}</h4>
              <div className="flex items-center gap-2 shrink-0">
                <label htmlFor="show-done" className="text-xs text-muted-foreground cursor-pointer select-none">
                  {t('dashboard.showDone')}
                </label>
                <Switch id="show-done" checked={showDone} onCheckedChange={(v) => { setShowDone(v); setConfig('dashboard_show_done', String(v)); }} />
              </div>
            </div>
            <div className="flex-1 overflow-auto p-6">
              <DashboardPage
                showDone={showDone}
                onReleaseClick={(releaseId) => {
                  setTodoReleaseFilter(releaseId);
                  setTodoFeatureFilter(null);
                  setTodoTagFilter(null);
                  setCurrentPage('todo');
                }}
                onFeatureClick={(featureId, releaseId) => {
                  setTodoReleaseFilter(releaseId);
                  setTodoFeatureFilter(featureId);
                  setTodoTagFilter(null);
                  setCurrentPage('todo');
                }}
                onCreateRelease={() => {
                  setReleaseCreateRequested(true);
                  setCurrentPage('releases');
                }}
                onCreateFeature={() => {
                  setEditingTask(null);
                  setTaskInitialValues({ type: 'feature' });
                  setIsTaskModalOpen(true);
                }}
                onCreateTask={() => {
                  setEditingTask(null);
                  setTaskInitialValues({ type: 'task' });
                  setIsTaskModalOpen(true);
                }}
                onCreateNote={() => {
                  setNoteCreateRequested(true);
                  setCurrentPage('notes');
                }}
              />
            </div>
          </>
        )}

        {currentPage === 'board' && (
          <>
            <div className="h-14 min-h-[56px] px-6 flex items-center justify-between bg-white border-b border-border shadow-sm overflow-x-auto">
              <h4 className="font-semibold text-foreground m-0 shrink-0">{t('sidebar.board')}</h4>
              <div className="flex items-center gap-2 shrink-0">
                <label htmlFor="board-show-done" className="text-xs text-muted-foreground cursor-pointer select-none">
                  {t('dashboard.showDone')}
                </label>
                <Switch id="board-show-done" checked={boardShowDone} onCheckedChange={setBoardShowDone} />
                <ReleaseSelector />
                <UserSelector />
                <Button size="sm" onClick={handleCreateTask} title={t('task.quickAdd')}>
                  {t('kanban.addTask')}
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-6">
              <KanbanBoard onTaskClick={handleTaskClick} showDone={boardShowDone} />
            </div>
          </>
        )}

        {currentPage === 'todo' && (
          <>
            <div className="h-14 min-h-[56px] px-6 flex items-center justify-between bg-white border-b border-border shadow-sm overflow-x-auto">
              <h4 className="font-semibold text-foreground m-0 shrink-0">{t('sidebar.todo')}</h4>
              <div className="flex items-center gap-3 shrink-0">
                <div className="relative">
                  <IconSearch size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                  <Input
                    className="h-7 w-[140px] pl-7 text-sm"
                    placeholder={t('task.search')}
                    value={todoSearch}
                    onChange={(e) => setTodoSearch(e.target.value)}
                  />
                </div>
                <div className="w-px h-5 bg-border" />
                <div className="flex items-center gap-1.5">
                  <select
                    className="h-7 w-[110px] bg-white border border-input px-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                    value={todoReleaseFilter || ''}
                    onChange={(e) => { setTodoReleaseFilter(e.target.value || null); setTodoFeatureFilter(null); }}
                  >
                    <option value="">{t('release.all')}</option>
                    {[...releases].sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true })).map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                  <select
                    className="h-7 w-[110px] bg-white border border-input px-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                    value={todoFeatureFilter || ''}
                    onChange={(e) => setTodoFeatureFilter(e.target.value || null)}
                  >
                    <option value="">{t('task.allFeatures')}</option>
                    {tasks.filter((t) => t.type === 'feature' && (!todoReleaseFilter || t.releaseId === todoReleaseFilter)).sort((a, b) => a.title.localeCompare(b.title)).map((f) => (
                      <option key={f.id} value={f.id}>{f.title}</option>
                    ))}
                  </select>
                  <select
                    className="h-7 w-[90px] bg-white border border-input px-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring"
                    value={todoTagFilter || ''}
                    onChange={(e) => setTodoTagFilter(e.target.value || null)}
                  >
                    <option value="">{t('task.allTags')}</option>
                    {[...new Set(tasks.flatMap((t) => t.tags || []))].sort().map((tag) => (
                      <option key={tag} value={tag}>{tag}</option>
                    ))}
                  </select>
                </div>
                <div className="w-px h-5 bg-border" />
                <div className="flex items-center gap-1.5">
                  <label htmlFor="todo-show-done" className="text-xs text-muted-foreground cursor-pointer select-none min-[1350px]:inline hidden">
                    {t('dashboard.showDone')}
                  </label>
                  <Switch id="todo-show-done" checked={todoShowDone} onCheckedChange={(v) => { setTodoShowDone(v); setConfig('todo_show_done', String(v)); }} title={t('dashboard.showDone')} />
                </div>
                <div className="w-px h-5 bg-border" />
                <div className="flex items-center gap-1.5">
                  <div className="flex border border-border">
                    <button
                      className={`p-1.5 ${todoView === 'cards' ? 'bg-primary text-white' : 'bg-white text-muted-foreground hover:bg-muted'}`}
                      onClick={() => { setTodoView('cards'); setConfig('todo_view', 'cards'); }}
                    >
                      <IconLayoutCards size={18} />
                    </button>
                    <button
                      className={`p-1.5 border-l border-border ${todoView === 'list' ? 'bg-primary text-white' : 'bg-white text-muted-foreground hover:bg-muted'}`}
                      onClick={() => { setTodoView('list'); setConfig('todo_view', 'list'); }}
                    >
                      <IconLayoutList size={18} />
                    </button>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => exportTasksCsv(tasks, releases, users)} title={t('task.export')}>
                    <IconDownload size={16} />
                  </Button>
                </div>
                <div className="w-px h-5 bg-border" />
                <Button size="sm" onClick={handleCreateTask} title={t('task.quickAdd')}>
                  <span className="min-[1350px]:inline hidden">{t('kanban.addTask')}</span>
                  <IconPlus size={16} className="min-[1350px]:hidden" />
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-auto p-6">
              <TodoPage onTaskClick={handleTaskClick} view={todoView} releaseFilter={todoReleaseFilter} featureFilter={todoFeatureFilter} tagFilter={todoTagFilter} showDone={todoShowDone} searchQuery={todoSearch} onQuickAdd={handleCreateTaskWith} />
            </div>
          </>
        )}

        {currentPage === 'releases' && (
          <>
            <div className="h-14 min-h-[56px] px-6 flex items-center justify-between bg-white border-b border-border shadow-sm overflow-x-auto">
              <h4 className="font-semibold text-foreground m-0 shrink-0">{t('release.title')}</h4>
              <Button size="sm" onClick={() => setReleaseCreateRequested(true)}>
                {t('release.create')}
              </Button>
            </div>
            <div className="flex-1 overflow-auto p-6">
              <ReleasesPage createRequested={releaseCreateRequested} onCreateHandled={() => setReleaseCreateRequested(false)} onCreateCancelled={() => setCurrentPage('dashboard')} />
            </div>
          </>
        )}

        {currentPage === 'notes' && (
          <>
            <div className="h-14 min-h-[56px] px-6 flex items-center justify-between bg-white border-b border-border shadow-sm overflow-x-auto">
              <h4 className="font-semibold text-foreground m-0 shrink-0">{t('sidebar.notes')}</h4>
              <Button size="sm" onClick={() => setNoteCreateRequested(true)}>
                {t('notes.create')}
              </Button>
            </div>
            <div className="flex-1 overflow-auto p-6">
              <NotesPage createRequested={noteCreateRequested} onCreateHandled={() => setNoteCreateRequested(false)} />
            </div>
          </>
        )}

        {currentPage === 'scratchpad' && (
          <>
            <div className="h-14 min-h-[56px] px-6 flex items-center justify-between bg-white border-b border-border shadow-sm overflow-x-auto">
              <h4 className="font-semibold text-foreground m-0 shrink-0">{t('scratchpad.title')}</h4>
              <Button size="sm" onClick={() => setScratchpadCreateRequested(true)}>
                {t('scratchpad.create')}
              </Button>
            </div>
            <div className="flex-1 overflow-hidden">
              <ScratchpadPage
                createRequested={scratchpadCreateRequested}
                onCreateHandled={() => setScratchpadCreateRequested(false)}
                initialScratchpadId={initialScratchpadId}
                onInitialHandled={() => setInitialScratchpadId(null)}
              />
            </div>
          </>
        )}

        {currentPage === 'reminders' && (
          <RemindersPage />
        )}

        {currentPage === 'settings' && (
          <>
            <div className="h-14 min-h-[56px] px-6 flex items-center justify-between bg-white border-b border-border shadow-sm overflow-x-auto">
              <h4 className="font-semibold text-foreground m-0 shrink-0">{t('settings.title')}</h4>
            </div>
            <div className="flex-1 overflow-auto p-6">
              <SettingsPage />
            </div>
          </>
        )}
      </div>

      <TaskModal
        isOpen={isTaskModalOpen}
        onClose={handleCloseModal}
        task={editingTask}
        onChildClick={handleTaskClick}
        initialValues={taskInitialValues}
      />

      <ReminderAlertModal />

      <AppModal
        isOpen={showTombstoneModal}
        onClose={() => {
          setShowTombstoneModal(false);
          loadProjects();
          manualSwitchRef.current = true;
          setProjectSelected(false);
        }}
        title={t('project.deletedByOther')}
        size="sm"
        footer={
          <Button onClick={() => {
            setShowTombstoneModal(false);
            loadProjects();
            manualSwitchRef.current = true;
            setProjectSelected(false);
          }}>
            {t('common.confirm')}
          </Button>
        }
      >
        <p className="text-sm text-muted-foreground">{t('project.deletedByOtherMessage')}</p>
      </AppModal>
    </div>
  );
}

export default App;
