import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { IconPlus, IconEdit, IconFolder, IconLink, IconCheck, IconCloud, IconDeviceDesktop, IconAlertTriangle, IconLoader2, IconDownload } from '@tabler/icons-react';
import { open } from '@tauri-apps/plugin-shell';
import { useProjectStore } from '../stores/projectStore';
import { syncService } from '../services/syncService';
import { SCHEMA_VERSION, getProjectAdminCredentials, setProjectAdminCredentials } from '../services/database';
import { parseSpaceUrl } from '../services/spaceUrl';
import { Project } from '../types';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { AppModal } from './ui/app-modal';

import { PROJECT_COLORS } from '@/lib/constants';

interface ProjectSelectionPageProps {
  onSelectProject: (id: string) => void;
}

function ProjectSelectionPage({ onSelectProject }: ProjectSelectionPageProps) {
  const { t } = useTranslation();
  const { projects, addProject, updateProject, deleteProject, joinProjects } = useProjectStore();
  const [stats, setStats] = useState<Record<string, { tasks: number; notes: number }>>({});

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(PROJECT_COLORS[0]);

  // Join project state - now uses Space URL
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinSpaceUrl, setJoinSpaceUrl] = useState('');
  const [parsedServerUrl, setParsedServerUrl] = useState('');
  const [parsedSpaceKey, setParsedSpaceKey] = useState('');
  const [remoteProjects, setRemoteProjects] = useState<Array<{ id: string; name: string; description: string; color: string }>>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isFetching, setIsFetching] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState('');

  // Schema check state
  const [checkingProject, setCheckingProject] = useState<string | null>(null);
  const [showSchemaAppTooOld, setShowSchemaAppTooOld] = useState(false);
  const [showSchemaServerTooOld, setShowSchemaServerTooOld] = useState(false);
  const [schemaConflict, setSchemaConflict] = useState<{ remote: number; local: number; projectId: string } | null>(null);
  const [schemaAdminEmail, setSchemaAdminEmail] = useState('');
  const [schemaAdminPassword, setSchemaAdminPassword] = useState('');
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [upgradeError, setUpgradeError] = useState('');
  const [showAuthError, setShowAuthError] = useState(false);
  const [authErrorProjectId, setAuthErrorProjectId] = useState<string | null>(null);
  const [authCorrectedKey, setAuthCorrectedKey] = useState('');
  const [authFixLoading, setAuthFixLoading] = useState(false);

  const { getProjectStats } = useProjectStore();

  useEffect(() => {
    const loadStats = async () => {
      const result: Record<string, { tasks: number; notes: number }> = {};
      for (const p of projects) {
        result[p.id] = await getProjectStats(p.id);
      }
      setStats(result);
    };
    loadStats();
  }, [projects, getProjectStats]);

  // Pre-fill admin credentials from current project
  useEffect(() => {
    const projectId = useProjectStore.getState().currentProjectId;
    if (!projectId) return;
    (async () => {
      const creds = await getProjectAdminCredentials(projectId);
      if (creds) {
        setSchemaAdminEmail(creds.email);
        setSchemaAdminPassword(creds.password);
      }
    })();
  }, []);

  const handleOpenModal = (project?: Project) => {
    if (project) {
      setEditingProject(project);
      setName(project.name);
      setDescription(project.description);
      setColor(project.color);
    } else {
      setEditingProject(null);
      setName('');
      setDescription('');
      setColor(PROJECT_COLORS[Math.floor(Math.random() * PROJECT_COLORS.length)]);
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingProject(null);
    setName('');
    setDescription('');
    setColor(PROJECT_COLORS[0]);
  };

  const handleSave = async () => {
    if (!name.trim()) return;

    if (editingProject) {
      await updateProject(editingProject.id, {
        name: name.trim(),
        description: description.trim(),
        color,
      });
      handleCloseModal();
    } else {
      const project = await addProject({
        name: name.trim(),
        description: description.trim(),
        color,
      });
      handleCloseModal();
      onSelectProject(project.id);
    }
  };

  const handleSelect = async (id: string) => {
    // Read from store directly to get latest data (avoids stale state after updateProject)
    const project = useProjectStore.getState().projects.find((p) => p.id === id);
    if (!project) return;

    // Local project → enter directly
    if (!project.syncUrl) {
      onSelectProject(id);
      return;
    }

    // Synced project → check remote schema version
    setCheckingProject(id);
    try {
      const remoteVersion = await syncService.fetchRemoteSchemaVersion(project.syncUrl, project.syncSpaceKey);

      const effectiveRemote = remoteVersion ?? 0;

      if (effectiveRemote === SCHEMA_VERSION) {
        // Equal → enter normally
        onSelectProject(id);
        return;
      }

      if (effectiveRemote > SCHEMA_VERSION) {
        // Server newer → app too old
        setSchemaConflict({ remote: effectiveRemote, local: SCHEMA_VERSION, projectId: id });
        setShowSchemaAppTooOld(true);
        return;
      }

      // Server older (or no df_meta at all) → offer upgrade
      setSchemaConflict({ remote: effectiveRemote, local: SCHEMA_VERSION, projectId: id });
      // Pre-fill stored credentials if available
      const creds = await getProjectAdminCredentials(id);
      if (creds) {
        setSchemaAdminEmail(creds.email);
        setSchemaAdminPassword(creds.password);
      }
      setShowSchemaServerTooOld(true);
    } catch (err) {
      if (err instanceof Error && err.message === 'AUTH_FAILED') {
        setAuthErrorProjectId(id);
        setAuthCorrectedKey('');
        setShowAuthError(true);
      } else {
        // Connection error → enter anyway (will try sync later)
        onSelectProject(id);
      }
    } finally {
      setCheckingProject(null);
    }
  };

  const handleUpgradeRemoteSchema = async () => {
    if (!schemaConflict || !schemaAdminEmail.trim() || !schemaAdminPassword.trim()) return;
    const project = projects.find((p) => p.id === schemaConflict.projectId);
    if (!project?.syncUrl) return;

    setIsUpgrading(true);
    setUpgradeError('');
    try {
      await syncService.upgradeRemoteSchema(
        project.syncUrl,
        schemaAdminEmail.trim(),
        schemaAdminPassword.trim(),
        project.syncSpaceKey
      );
      // Save admin credentials
      await setProjectAdminCredentials(project.id, schemaAdminEmail.trim(), schemaAdminPassword.trim());
      setShowSchemaServerTooOld(false);
      setSchemaConflict(null);
      onSelectProject(project.id);
    } catch (err) {
      setUpgradeError(String(err));
    } finally {
      setIsUpgrading(false);
    }
  };

  const localProjectIds = new Set(projects.map((p) => p.id));

  const isSpaceUrlValid = !!parseSpaceUrl(joinSpaceUrl);

  const handleFetchProjects = async () => {
    const parsed = parseSpaceUrl(joinSpaceUrl);
    if (!parsed) return;

    setParsedServerUrl(parsed.serverUrl);
    setParsedSpaceKey(parsed.spaceKey);
    setIsFetching(true);
    setJoinError('');
    setRemoteProjects([]);
    setSelectedIds(new Set());

    try {
      // Check remote schema version first
      const remoteVersion = await syncService.fetchRemoteSchemaVersion(parsed.serverUrl, parsed.spaceKey);
      const effectiveRemote = remoteVersion ?? 0;

      if (effectiveRemote > SCHEMA_VERSION) {
        // Server is newer than our app
        setSchemaConflict({ remote: effectiveRemote, local: SCHEMA_VERSION, projectId: '' });
        setShowSchemaAppTooOld(true);
        setIsFetching(false);
        return;
      }

      if (effectiveRemote < SCHEMA_VERSION) {
        // Server older (or no df_meta) → show upgrade dialog
        setSchemaConflict({ remote: effectiveRemote, local: SCHEMA_VERSION, projectId: '' });
        setShowSchemaServerTooOld(true);
        setIsFetching(false);
        return;
      }

      const result = await syncService.fetchRemoteProjects(parsed.serverUrl, parsed.spaceKey);
      setRemoteProjects(result);
      if (result.length === 0) {
        setJoinError(t('project.noProjectsFound'));
      }
    } catch (err) {
      if (err instanceof Error && err.message === 'AUTH_FAILED') {
        setJoinError(t('sync.authFailed'));
      } else {
        setJoinError(String(err));
      }
    } finally {
      setIsFetching(false);
    }
  };

  const handleToggleProject = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleJoin = async () => {
    const toJoin = remoteProjects.filter((p) => selectedIds.has(p.id));
    if (toJoin.length === 0) return;
    setIsJoining(true);
    setJoinError('');

    try {
      await joinProjects(toJoin, parsedServerUrl, parsedSpaceKey);
      setShowJoinModal(false);
      setRemoteProjects([]);
      setSelectedIds(new Set());
      setJoinSpaceUrl('');
      setParsedServerUrl('');
      setParsedSpaceKey('');
    } catch (err) {
      setJoinError(String(err));
    } finally {
      setIsJoining(false);
    }
  };

  const handleCloseJoinModal = () => {
    setShowJoinModal(false);
    setRemoteProjects([]);
    setSelectedIds(new Set());
    setJoinError('');
  };

  return (
    <div className="min-h-screen bg-[#0D1117] flex flex-col items-center justify-center p-8">
      {/* Header */}
      <div className="text-center mb-5">
        <div className="flex flex-col items-center mb-4">
          <img src="/images/dragonfly-icon.svg" alt="Dragonfly" className="w-16 h-16 -mb-6 z-0" />
          <h1
            className="text-2xl bg-gradient-to-r from-[#0077B6] to-[#00B4D8] bg-clip-text text-transparent overflow-visible z-10"
            style={{ fontFamily: "'Pacifico', cursive", lineHeight: 2 }}
          >
            Dragonfly
          </h1>
        </div>
        <p className="text-white/50 text-sm">{t('project.select')}</p>
      </div>

      {/* Project Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-[900px] w-full mb-6">
        {projects.map((project) => (
          <div
            key={project.id}
            className={`group relative bg-[#161b22] border border-[#30363d] hover:border-[#0077B6] transition-colors cursor-pointer ${
              checkingProject === project.id ? 'opacity-70 pointer-events-none' : ''
            }`}
            style={{ borderRadius: 2 }}
            onClick={() => handleSelect(project.id)}
          >
            <div className="p-5">
              <div className="flex items-start gap-3 mb-3">
                <div
                  className="w-3 h-3 rounded-full mt-1 shrink-0"
                  style={{ backgroundColor: project.color }}
                />
                <div className="flex-1 min-w-0">
                  <h3 className="text-white font-semibold text-base truncate">{project.name}</h3>
                  {project.description && (
                    <p className="text-white/40 text-xs mt-1 line-clamp-2">{project.description}</p>
                  )}
                </div>
                {checkingProject === project.id && (
                  <IconLoader2 size={16} className="text-white/50 animate-spin shrink-0" />
                )}
              </div>
              <div className="flex items-center gap-4 text-white/30 text-xs">
                <span>{t('project.tasks', { count: stats[project.id]?.tasks ?? 0 })}</span>
                <span>{t('project.notes', { count: stats[project.id]?.notes ?? 0 })}</span>
                <span className="ml-auto flex items-center gap-1">
                  {project.syncUrl ? (
                    <><IconCloud size={12} />{t('project.synced')}</>
                  ) : (
                    <><IconDeviceDesktop size={12} />{t('project.local')}</>
                  )}
                </span>
              </div>
              {project.syncUrl && (
                <div className="text-white/20 text-[10px] truncate mt-1">{project.syncUrl.replace(/\/+$/, '')}</div>
              )}
              <div className="text-white/15 text-[10px] font-mono truncate mt-0.5">{project.id}</div>
            </div>
            {/* Action buttons (visible on hover) */}
            <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                className="p-1 text-white/30 hover:text-white/70 transition-colors"
                onClick={(e) => { e.stopPropagation(); handleOpenModal(project); }}
                title={t('project.edit')}
              >
                <IconEdit size={14} />
              </button>
            </div>
          </div>
        ))}

        {/* New Project Card */}
        <button
          className="bg-transparent border border-dashed border-[#30363d] hover:border-[#0077B6] transition-colors flex flex-col items-center justify-center p-5 gap-2 min-h-[100px] cursor-pointer"
          style={{ borderRadius: 2 }}
          onClick={() => handleOpenModal()}
        >
          <IconPlus size={20} className="text-white/30" />
          <span className="text-white/30 text-sm">{t('project.create')}</span>
        </button>

        {/* Join Project Card */}
        <button
          className="bg-transparent border border-dashed border-[#30363d] hover:border-[#00B4D8] transition-colors flex flex-col items-center justify-center p-5 gap-2 min-h-[100px] cursor-pointer"
          style={{ borderRadius: 2 }}
          onClick={() => setShowJoinModal(true)}
        >
          <IconLink size={20} className="text-white/30" />
          <span className="text-white/30 text-sm">{t('project.join')}</span>
        </button>
      </div>

      {/* Create/Edit Project Modal */}
      <AppModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={
          <span className="flex items-center gap-2">
            <IconFolder size={20} />
            {editingProject ? t('project.edit') : t('project.create')}
          </span>
        }
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={handleCloseModal}>
              {t('task.cancel')}
            </Button>
            <Button onClick={handleSave} disabled={!name.trim()}>
              {t('task.save')}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <Label className="mb-2 block">{t('project.name')}</Label>
            <Input
              placeholder={t('project.namePlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <Label className="mb-2 block">{t('project.description')}</Label>
            <Input
              placeholder={t('project.descriptionPlaceholder')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div>
            <Label className="mb-2 block">{t('project.color')}</Label>
            <div className="flex flex-wrap gap-2">
              {PROJECT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="w-8 h-8 rounded-full transition-all"
                  style={{
                    backgroundColor: c,
                    border: color === c ? '2px solid #6366f1' : '2px solid transparent',
                    boxShadow: color === c ? '0 0 0 2px white, 0 0 0 4px #6366f1' : 'none',
                  }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>
        </div>
      </AppModal>

      {/* Join Project Modal - Space URL */}
      <AppModal
        isOpen={showJoinModal && !showSchemaAppTooOld && !showSchemaServerTooOld}
        onClose={handleCloseJoinModal}
        title={
          <span className="flex items-center gap-2">
            <IconLink size={20} />
            {t('project.join')}
          </span>
        }
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={handleCloseJoinModal}>
              {t('task.cancel')}
            </Button>
            {remoteProjects.length > 0 && (
              <Button onClick={handleJoin} disabled={isJoining || selectedIds.size === 0}>
                {isJoining ? t('project.joining') : t('project.join')}
              </Button>
            )}
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{t('project.joinDescription')}</p>
          <div>
            <Label className="mb-2 block">{t('sync.spaceUrlLabel')}</Label>
            <Input
              placeholder={t('sync.spaceUrlPlaceholder')}
              value={joinSpaceUrl}
              onChange={(e) => setJoinSpaceUrl(e.target.value)}
              disabled={remoteProjects.length > 0}
            />
            {joinSpaceUrl.trim() && !isSpaceUrlValid && (
              <p className="text-xs text-amber-500 mt-1">{t('sync.invalidSpaceUrl')}</p>
            )}
          </div>

          {remoteProjects.length === 0 && (
            <Button
              className="w-full"
              onClick={handleFetchProjects}
              disabled={isFetching || !isSpaceUrlValid}
            >
              {isFetching ? t('common.loading') : t('project.fetchProjects')}
            </Button>
          )}

          {remoteProjects.length > 0 && (
            <div className="space-y-2">
              {remoteProjects.map((rp) => {
                const alreadyJoined = localProjectIds.has(rp.id);
                return (
                  <label
                    key={rp.id}
                    className={`flex items-center gap-3 p-3 border transition-colors cursor-pointer ${
                      alreadyJoined
                        ? 'border-border bg-muted/50 opacity-60 cursor-default'
                        : selectedIds.has(rp.id)
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/50'
                    }`}
                    style={{ borderRadius: 2 }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(rp.id)}
                      disabled={alreadyJoined}
                      onChange={() => handleToggleProject(rp.id)}
                      className="accent-[#0077B6]"
                    />
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: rp.color }}
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium block truncate">{rp.name}</span>
                      <span className="text-[10px] text-muted-foreground/60 font-mono block truncate">{rp.id}</span>
                    </div>
                    {alreadyJoined && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                        <IconCheck size={14} />
                        {t('project.alreadyJoined')}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          )}

          {joinError && (
            <p className="text-sm text-red-500">{joinError}</p>
          )}
        </div>
      </AppModal>

      {/* Schema: App Too Old Dialog */}
      <AppModal
        isOpen={showSchemaAppTooOld}
        onClose={() => { setShowSchemaAppTooOld(false); setSchemaConflict(null); }}
        title={
          <span className="flex items-center gap-2 text-amber-600">
            <IconAlertTriangle size={20} />
            {t('schema.appTooOld')}
          </span>
        }
        size="sm"
        footer={
          <div className="flex gap-2 w-full justify-end">
            <Button variant="secondary" onClick={() => { setShowSchemaAppTooOld(false); setSchemaConflict(null); }}>
              {t('common.confirm')}
            </Button>
            <Button onClick={() => open('https://github.com/McHill007/dragonfly-release/releases')}>
              <IconDownload size={16} className="mr-1" />
              {t('settings.downloadUpdate')}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-muted-foreground">
          {t('schema.appTooOldMessage', {
            dbVersion: schemaConflict?.remote ?? '?',
            appVersion: schemaConflict?.local ?? '?',
          })}
        </p>
      </AppModal>

      {/* Auth Failed Dialog */}
      <AppModal
        isOpen={showAuthError}
        onClose={() => { setShowAuthError(false); setAuthErrorProjectId(null); setAuthCorrectedKey(''); setAuthFixLoading(false); }}
        title={
          <span className="flex items-center gap-2 text-red-600">
            <IconAlertTriangle size={20} />
            {t('sync.error')}
          </span>
        }
        size="sm"
        footer={
          <Button variant="secondary" onClick={() => { setShowAuthError(false); setAuthErrorProjectId(null); setAuthCorrectedKey(''); setAuthFixLoading(false); }}>
            {t('task.cancel')}
          </Button>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t('sync.authFailed')}
          </p>

          {/* Fix Space Key */}
          <div>
            <Label className="mb-2 block">{t('sync.spaceKey')}</Label>
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder={t('sync.spaceKeyPlaceholder')}
                value={authCorrectedKey}
                onChange={(e) => setAuthCorrectedKey(e.target.value)}
              />
              <Button
                onClick={async () => {
                  if (!authErrorProjectId || authCorrectedKey.trim().length < 8) return;
                  setAuthFixLoading(true);
                  try {
                    await updateProject(authErrorProjectId, { syncSpaceKey: authCorrectedKey.trim() });
                    // Retry selecting the project
                    setShowAuthError(false);
                    setAuthCorrectedKey('');
                    setAuthFixLoading(false);
                    handleSelect(authErrorProjectId);
                  } catch {
                    setAuthFixLoading(false);
                  }
                }}
                disabled={authFixLoading || authCorrectedKey.trim().length < 8}
              >
                {authFixLoading ? <IconLoader2 size={14} className="animate-spin" /> : t('task.save')}
              </Button>
            </div>
            {authCorrectedKey.trim().length > 0 && authCorrectedKey.trim().length < 8 && (
              <p className="text-xs text-amber-500 mt-1">{t('sync.spaceKeyTooShort')}</p>
            )}
          </div>

          {/* Leave Project */}
          <div className="border-t border-border pt-3">
            <Button
              variant="outline"
              size="sm"
              className="border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"
              onClick={async () => {
                if (!authErrorProjectId) return;
                await deleteProject(authErrorProjectId);
                setShowAuthError(false);
                setAuthErrorProjectId(null);
                setAuthCorrectedKey('');
              }}
            >
              {t('settings.leaveProject')}
            </Button>
          </div>
        </div>
      </AppModal>

      {/* Schema: Server Too Old Dialog (admin upgrade) */}
      <AppModal
        isOpen={showSchemaServerTooOld}
        onClose={() => { setShowSchemaServerTooOld(false); setSchemaConflict(null); setUpgradeError(''); }}
        title={
          <span className="flex items-center gap-2 text-amber-600">
            <IconAlertTriangle size={20} />
            {t('schema.serverTooOld')}
          </span>
        }
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setShowSchemaServerTooOld(false); setSchemaConflict(null); setUpgradeError(''); }}>
              {t('task.cancel')}
            </Button>
            <Button
              onClick={handleUpgradeRemoteSchema}
              disabled={isUpgrading || !schemaAdminEmail.trim() || !schemaAdminPassword.trim()}
            >
              {isUpgrading ? t('common.loading') : t('schema.upgradeAsAdmin')}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t('schema.serverTooOldMessage', {
              serverVersion: schemaConflict?.remote ?? '?',
              appVersion: schemaConflict?.local ?? '?',
            })}
          </p>
          <div className="bg-amber-50 border border-amber-200 p-3 text-sm text-amber-700">
            <IconAlertTriangle size={14} className="inline mr-1" />
            {t('schema.upgradeWarning')}
          </div>
          <div>
            <Label className="mb-2 block">{t('sync.adminEmail')}</Label>
            <Input
              type="email"
              placeholder="admin@example.com"
              value={schemaAdminEmail}
              onChange={(e) => setSchemaAdminEmail(e.target.value)}
            />
          </div>
          <div>
            <Label className="mb-2 block">{t('sync.adminPassword')}</Label>
            <Input
              type="password"
              placeholder="********"
              value={schemaAdminPassword}
              onChange={(e) => setSchemaAdminPassword(e.target.value)}
            />
          </div>
          {upgradeError && (
            <p className="text-sm text-red-500">{upgradeError}</p>
          )}
        </div>
      </AppModal>
    </div>
  );
}

export default ProjectSelectionPage;
