import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  IconCheck, IconDownload, IconTrash, IconAlertTriangle, IconMicrophone, IconLock,
} from '@tabler/icons-react';
import { getApiKey, setApiKey } from '../../services/aiService';
import {
  getModelsStatus, downloadModel, deleteModel, isWebSpeechAvailable,
  type ModelStatus, type VoiceProvider, type WhisperModel,
} from '../../services/voiceService';
import { syncService } from '../../services/syncService';
import { getConfig, setConfig, deleteConfig } from '../../services/database';
import { hashPassphrase, verifyPassphrase } from '../../services/crypto';
import { log } from '../../services/logService';
import { enable as autostartEnable, disable as autostartDisable, isEnabled as autostartIsEnabled } from '@tauri-apps/plugin-autostart';
import { useLayoutStore } from '@/stores/layoutStore';
import { useProjectStore } from '@/stores/projectStore';
import { COLUMNS } from '@/types';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { AppModal } from '../ui/app-modal';

export default function SettingsGeneral() {
  const { t, i18n } = useTranslation();
  const { defaultCollapsed, setDefaultCollapsed } = useLayoutStore();
  const { projects, currentProjectId, deleteProject } = useProjectStore();
  const currentProject = projects.find((p) => p.id === currentProjectId);

  const [apiKey, setApiKeyState] = useState('');
  const [apiKeySaved, setApiKeySaved] = useState(false);
  const [autoLogoutMinutes, setAutoLogoutMinutes] = useState(0);
  const [minimizeToTray, setMinimizeToTray] = useState(false);
  const [autostart, setAutostart] = useState(false);

  // Voice-to-text
  const [voiceProvider, setVoiceProviderState] = useState<VoiceProvider | null>(null);
  const [whisperModel, setWhisperModelState] = useState<WhisperModel>('small');
  const [voiceModels, setVoiceModels] = useState<ModelStatus[]>([]);
  const [downloadingModel, setDownloadingModel] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);

  // Change passphrase
  const [currentPassphrase, setCurrentPassphrase] = useState('');
  const [newPassphrase, setNewPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [passphraseError, setPassphraseError] = useState('');
  const [passphraseSuccess, setPassphraseSuccess] = useState(false);
  const [isChangingPassphrase, setIsChangingPassphrase] = useState(false);

  const handleChangePassphrase = async () => {
    setPassphraseError('');
    setPassphraseSuccess(false);
    if (newPassphrase.length < 8) { setPassphraseError(t('passphrase.tooShort')); return; }
    if (newPassphrase !== confirmPassphrase) { setPassphraseError(t('passphrase.noMatch')); return; }
    setIsChangingPassphrase(true);
    try {
      const storedHash = await getConfig('passphrase_hash');
      if (storedHash) {
        const valid = await verifyPassphrase(currentPassphrase, storedHash);
        if (!valid) { setPassphraseError(t('passphrase.currentIncorrect')); return; }
      }
      const newHash = await hashPassphrase(newPassphrase);
      await setConfig('passphrase_hash', newHash);
      setCurrentPassphrase('');
      setNewPassphrase('');
      setConfirmPassphrase('');
      setPassphraseSuccess(true);
      setTimeout(() => setPassphraseSuccess(false), 3000);
    } catch (err) {
      setPassphraseError(String(err));
    } finally {
      setIsChangingPassphrase(false);
    }
  };

  // Danger zone
  const [showLeaveProject, setShowLeaveProject] = useState(false);
  const [showDeleteProject, setShowDeleteProject] = useState(false);
  const [deleteConfirmName, setDeleteConfirmName] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    (async () => {
      const savedKey = await getApiKey();
      if (savedKey) setApiKeyState(savedKey);

      const val = await getConfig('auto_logout_minutes');
      if (val) setAutoLogoutMinutes(parseInt(val, 10) || 0);

      const tray = await getConfig('minimize_to_tray');
      setMinimizeToTray(tray === 'true');

      const [provider, model] = await Promise.all([
        getConfig('voice_provider'),
        getConfig('whisper_model'),
      ]);
      if (provider === 'local' || provider === 'openai' || provider === 'live') {
        setVoiceProviderState(provider as VoiceProvider);
      }
      if (model === 'tiny' || model === 'small' || model === 'medium' || model === 'large') {
        setWhisperModelState(model as WhisperModel);
      }
      try {
        const statuses = await getModelsStatus();
        setVoiceModels(statuses);
      } catch {
        // Tauri command may not yet be available
      }
    })();

    autostartIsEnabled().then(setAutostart).catch(() => {});
  }, []);

  const handleSaveApiKey = async () => {
    await setApiKey(apiKey);
    setApiKeySaved(true);
    setTimeout(() => setApiKeySaved(false), 2000);
  };

  const handleSetVoiceProvider = async (provider: VoiceProvider | null) => {
    setVoiceProviderState(provider);
    if (provider === null) {
      await deleteConfig('voice_provider');
    } else {
      await setConfig('voice_provider', provider);
    }
  };

  const handleSetWhisperModel = async (model: WhisperModel) => {
    setWhisperModelState(model);
    await setConfig('whisper_model', model);
  };

  const handleDownloadModel = async (model: string) => {
    setDownloadingModel(model);
    setDownloadProgress(0);
    try {
      await downloadModel(model as WhisperModel, (progress) => {
        setDownloadProgress(progress);
      });
      const statuses = await getModelsStatus();
      setVoiceModels(statuses);
    } catch (err) {
      log('ERR', 'settings: downloadModel: ' + String(err));
    } finally {
      setDownloadingModel(null);
    }
  };

  const handleDeleteVoiceModel = async (model: string) => {
    try {
      await deleteModel(model as WhisperModel);
      const statuses = await getModelsStatus();
      setVoiceModels(statuses);
    } catch (err) {
      log('ERR', 'settings: deleteModel: ' + String(err));
    }
  };

  const formatModelSize = (bytes: number) => {
    if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
    return `${Math.round(bytes / 1_000_000)} MB`;
  };

  const handleAutoLogoutChange = async (value: string) => {
    const num = Math.max(0, parseInt(value, 10) || 0);
    setAutoLogoutMinutes(num);
    await setConfig('auto_logout_minutes', String(num));
    window.dispatchEvent(new CustomEvent('dragonfly-config-changed', { detail: { key: 'auto_logout_minutes', value: num } }));
  };

  const handleMinimizeToTrayChange = async (value: boolean) => {
    setMinimizeToTray(value);
    await setConfig('minimize_to_tray', String(value));
  };

  const handleAutostartChange = async (value: boolean) => {
    setAutostart(value);
    if (value) {
      await autostartEnable().catch(() => {});
    } else {
      await autostartDisable().catch(() => {});
    }
  };

  const handleLanguageChange = (lang: string) => {
    i18n.changeLanguage(lang);
    localStorage.setItem('dragonfly-language', lang);
  };

  const handleLeaveProject = async () => {
    if (!currentProjectId) return;
    setIsDeleting(true);
    try {
      if (syncService.isConnected) await syncService.disconnect();
      await deleteProject(currentProjectId);
      setShowLeaveProject(false);
      window.dispatchEvent(new Event('dragonfly-project-deleted'));
    } catch (err) {
      log('ERR', 'settings: handleLeaveProject failed: ' + String(err));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteProject = async () => {
    if (!currentProjectId || !currentProject) return;
    setIsDeleting(true);
    try {
      if (syncService.isConnected) {
        try {
          await syncService.deleteProjectRemote(currentProjectId);
        } catch (err) {
          log('ERR', 'settings: deleteProjectRemote failed: ' + String(err));
        }
        await syncService.disconnect();
      }
      await deleteProject(currentProjectId);
      setShowDeleteProject(false);
      setDeleteConfirmName('');
      window.dispatchEvent(new Event('dragonfly-project-deleted'));
    } catch (err) {
      log('ERR', 'settings: handleDeleteProject failed: ' + String(err));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      {/* Language Settings */}
      <Card className="mb-4">
        <CardHeader className="bg-[#fafafa] border-b border-border">
          <CardTitle className="text-base">{t('settings.language')}</CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid grid-cols-4 gap-0 w-full">
            {([
              ['de', 'german'],
              ['en', 'english'],
              ['pl', 'polish'],
              ['fr', 'french'],
              ['es', 'spanish'],
              ['it', 'italian'],
              ['ro', 'romanian'],
            ] as const).map(([code, key]) => (
              <Button
                key={code}
                variant={i18n.language === code ? 'default' : 'outline'}
                className="rounded-none border-r-0 last:border-r [&:nth-child(-n+4)]:border-b-0"
                onClick={() => handleLanguageChange(code)}
              >
                {t(`settings.${key}`)}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Board Columns */}
      <Card className="mb-4">
        <CardHeader className="bg-[#fafafa] border-b border-border">
          <CardTitle className="text-base">{t('settings.boardColumns')}</CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <small className="text-muted-foreground block mb-3">{t('settings.boardColumnsHint')}</small>
          <div className="flex flex-wrap gap-2">
            {COLUMNS.map((col) => {
              const isCollapsed = defaultCollapsed.has(col.id);
              return (
                <button
                  key={col.id}
                  className={`px-3 py-1.5 text-xs font-medium border transition-colors ${
                    isCollapsed
                      ? 'bg-muted text-muted-foreground border-border'
                      : 'bg-primary text-white border-primary'
                  }`}
                  onClick={() => setDefaultCollapsed(col.id, !isCollapsed)}
                >
                  {t(`kanban.${col.id}`)}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Auto-Lock Settings */}
      <Card className="mb-4">
        <CardHeader className="bg-[#fafafa] border-b border-border">
          <CardTitle className="text-base">{t('settings.autoLogout')}</CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <Input
              type="number"
              min={0}
              value={autoLogoutMinutes}
              onChange={(e) => handleAutoLogoutChange(e.target.value)}
              className="w-24"
            />
            <Label>{t('settings.minutes')}</Label>
          </div>
          <small className="text-muted-foreground mt-2 block">{t('settings.autoLogoutHint')}</small>
        </CardContent>
      </Card>

      {/* Minimize to Tray */}
      <Card className="mb-4">
        <CardHeader className="bg-[#fafafa] border-b border-border">
          <CardTitle className="text-base">{t('settings.minimizeToTray', 'Minimize to Tray')}</CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <Switch id="minimize-to-tray" checked={minimizeToTray} onCheckedChange={handleMinimizeToTrayChange} />
            <Label htmlFor="minimize-to-tray">{t('settings.minimizeToTrayLabel', 'Hide to system tray instead of closing')}</Label>
          </div>
          <small className="text-muted-foreground mt-2 block">
            {t('settings.minimizeToTrayHint', 'When enabled, clicking X minimizes the app to the tray. Left-click the tray icon to restore it.')}
          </small>
        </CardContent>
      </Card>

      {/* Autostart */}
      <Card className="mb-4">
        <CardHeader className="bg-[#fafafa] border-b border-border">
          <CardTitle className="text-base">{t('settings.autostart')}</CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <Switch id="autostart" checked={autostart} onCheckedChange={handleAutostartChange} />
            <Label htmlFor="autostart">{t('settings.autostartLabel')}</Label>
          </div>
          <small className="text-muted-foreground mt-2 block">{t('settings.autostartHint')}</small>
        </CardContent>
      </Card>

      {/* API Key Settings */}
      <Card className="mb-4">
        <CardHeader className="bg-[#fafafa] border-b border-border">
          <CardTitle className="text-base">{t('settings.apiKey')}</CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="flex">
            <Input
              type="password"
              placeholder={t('settings.apiKeyPlaceholder')}
              value={apiKey}
              onChange={(e) => setApiKeyState(e.target.value)}
              className="rounded-r-none"
            />
            <Button onClick={handleSaveApiKey} disabled={!apiKey.trim()} className="rounded-l-none">
              {apiKeySaved ? (
                <>
                  <IconCheck size={16} className="mr-1" />
                  {t('settings.apiKeySaved')}
                </>
              ) : (
                t('task.save')
              )}
            </Button>
          </div>
          <small className="text-muted-foreground mt-2 block">{t('settings.apiKeyHint')}</small>
        </CardContent>
      </Card>

      {/* Voice-to-Text Settings */}
      <Card className="mb-4">
        <CardHeader className="bg-[#fafafa] border-b border-border">
          <CardTitle className="text-base flex items-center gap-2">
            <IconMicrophone size={16} />
            {t('settings.voice.title')}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="flex gap-2 mb-4 flex-wrap">
            <Button
              size="sm"
              variant={voiceProvider === null ? 'default' : 'outline'}
              onClick={() => handleSetVoiceProvider(null)}
            >
              {t('settings.voice.disabled')}
            </Button>
            {isWebSpeechAvailable() && (
              <Button
                size="sm"
                variant={voiceProvider === 'live' ? 'default' : 'outline'}
                onClick={() => handleSetVoiceProvider('live')}
              >
                {t('settings.voice.live')}
              </Button>
            )}
            <Button
              size="sm"
              variant={voiceProvider === 'openai' ? 'default' : 'outline'}
              onClick={() => handleSetVoiceProvider('openai')}
              disabled={!apiKey.trim()}
              title={!apiKey.trim() ? t('settings.voice.openaiKeyRequired') : undefined}
            >
              {t('settings.voice.openai')}
            </Button>
            <Button
              size="sm"
              variant={voiceProvider === 'local' ? 'default' : 'outline'}
              onClick={() => handleSetVoiceProvider('local')}
            >
              {t('settings.voice.local')}
            </Button>
          </div>

          {voiceProvider === 'live' && (
            <small className="text-muted-foreground block">{t('settings.voice.liveHint')}</small>
          )}

          {voiceProvider === 'openai' && (
            <small className="text-muted-foreground block">{t('settings.voice.openaiHint')}</small>
          )}

          {voiceProvider === 'local' && (
            <div className="space-y-2">
              <small className="text-muted-foreground block mb-3">{t('settings.voice.localHint')}</small>
              {voiceModels.length === 0 && (
                <p className="text-xs text-muted-foreground">{t('settings.voice.loadingModels')}</p>
              )}
              {voiceModels.map((m) => (
                <div
                  key={m.name}
                  className="flex items-center justify-between p-3 border border-border rounded-md bg-white"
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      id={`whisper-${m.name}`}
                      name="whisper-model"
                      checked={whisperModel === m.name}
                      onChange={() => handleSetWhisperModel(m.name as WhisperModel)}
                      disabled={!m.downloaded}
                      className="cursor-pointer"
                    />
                    <label htmlFor={`whisper-${m.name}`} className="cursor-pointer">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium capitalize">{m.name}</span>
                        <span className="text-xs text-muted-foreground">({formatModelSize(m.size_bytes)})</span>
                        {m.name === 'small' && (
                          <span className="text-[0.65rem] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium">
                            {t('settings.voice.recommended')}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {t(`settings.voice.model${m.name.charAt(0).toUpperCase() + m.name.slice(1)}`)}
                      </p>
                    </label>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {m.downloaded ? (
                      <>
                        <span className="text-xs text-green-600 flex items-center gap-1">
                          <IconCheck size={12} /> {t('settings.voice.downloaded')}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive h-7 w-7 p-0"
                          onClick={() => handleDeleteVoiceModel(m.name)}
                        >
                          <IconTrash size={13} />
                        </Button>
                      </>
                    ) : downloadingModel === m.name ? (
                      <div className="flex items-center gap-2 text-xs">
                        <div className="w-20 h-1.5 bg-border rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary transition-all duration-300"
                            style={{ width: `${downloadProgress}%` }}
                          />
                        </div>
                        <span className="text-muted-foreground w-8 text-right">{downloadProgress}%</span>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => handleDownloadModel(m.name)}
                        disabled={!!downloadingModel}
                      >
                        <IconDownload size={12} className="mr-1" />
                        {t('settings.voice.download')}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Change Passphrase */}
      <Card className="mb-4">
        <CardHeader className="bg-[#fafafa] border-b border-border">
          <CardTitle className="text-base flex items-center gap-2">
            <IconLock size={16} />
            {t('passphrase.changeTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-3">
          <div>
            <Label className="mb-1.5 block text-xs text-muted-foreground">{t('passphrase.currentPassphrase')}</Label>
            <Input
              type="password"
              placeholder={t('passphrase.placeholder')}
              value={currentPassphrase}
              onChange={(e) => setCurrentPassphrase(e.target.value)}
            />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs text-muted-foreground">{t('passphrase.newPassphrase')}</Label>
            <Input
              type="password"
              placeholder={t('passphrase.placeholder')}
              value={newPassphrase}
              onChange={(e) => setNewPassphrase(e.target.value)}
            />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs text-muted-foreground">{t('passphrase.confirmNew')}</Label>
            <Input
              type="password"
              placeholder={t('passphrase.confirmPlaceholder')}
              value={confirmPassphrase}
              onChange={(e) => setConfirmPassphrase(e.target.value)}
            />
          </div>
          {passphraseError && <p className="text-sm text-red-500">{passphraseError}</p>}
          {passphraseSuccess && (
            <p className="text-sm text-green-600 flex items-center gap-1">
              <IconCheck size={14} /> {t('passphrase.changeSuccess')}
            </p>
          )}
          <Button
            onClick={handleChangePassphrase}
            disabled={isChangingPassphrase || !currentPassphrase || !newPassphrase || !confirmPassphrase}
            size="sm"
          >
            {isChangingPassphrase ? t('common.loading') : t('passphrase.changeTitle')}
          </Button>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      {projects.length > 1 && currentProject && (() => {
        const isSynced = !!currentProject.syncUrl || syncService.isConnected;
        return (
          <Card className="mb-4 border-red-300">
            <CardHeader className="bg-red-50 border-b border-red-200">
              <CardTitle className="text-base text-red-700 flex items-center gap-2">
                <IconAlertTriangle size={18} />
                {t('settings.dangerZone')}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              {isSynced ? (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{t('settings.leaveProject')}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{t('settings.leaveProjectHint')}</p>
                    </div>
                    <Button variant="outline" size="sm" className="border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700 shrink-0" onClick={() => setShowLeaveProject(true)}>
                      {t('settings.leaveProject')}
                    </Button>
                  </div>
                  <div className="border-t border-red-200" />
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{t('settings.deleteProject')}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{t('settings.deleteProjectHint')}</p>
                    </div>
                    <Button variant="destructive" size="sm" className="shrink-0" onClick={() => setShowDeleteProject(true)}>
                      {t('settings.deleteProject')}
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{t('settings.deleteProject')}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{t('settings.deleteProjectHintLocal')}</p>
                  </div>
                  <Button variant="destructive" size="sm" className="shrink-0" onClick={() => setShowDeleteProject(true)}>
                    {t('settings.deleteProject')}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* Leave Project Confirmation */}
      <AppModal
        isOpen={showLeaveProject}
        onClose={() => setShowLeaveProject(false)}
        title={t('settings.leaveProject')}
        size="sm"
        footer={
          <div className="flex gap-2 w-full justify-end">
            <Button variant="secondary" size="sm" onClick={() => setShowLeaveProject(false)}>
              {t('task.cancel')}
            </Button>
            <Button variant="destructive" size="sm" onClick={handleLeaveProject} disabled={isDeleting}>
              {isDeleting ? t('common.loading') : t('settings.leaveProjectConfirm')}
            </Button>
          </div>
        }
      >
        <p className="text-sm text-muted-foreground">
          {t('settings.leaveProjectMessage', { name: currentProject?.name })}
        </p>
      </AppModal>

      {/* Delete Project Confirmation */}
      <AppModal
        isOpen={showDeleteProject}
        onClose={() => { setShowDeleteProject(false); setDeleteConfirmName(''); }}
        title={
          <span className="flex items-center gap-2 text-red-600">
            <IconAlertTriangle size={20} />
            {t('settings.deleteProject')}
          </span>
        }
        size="sm"
        footer={
          <div className="flex gap-2 w-full justify-end">
            <Button variant="secondary" size="sm" onClick={() => { setShowDeleteProject(false); setDeleteConfirmName(''); }}>
              {t('task.cancel')}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={handleDeleteProject}
              disabled={deleteConfirmName !== currentProject?.name || isDeleting}
            >
              {isDeleting ? t('common.loading') : t('settings.deleteProjectConfirm')}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{t('settings.deleteProjectIrreversible')}</p>
          <div className="bg-red-50 border border-red-200 p-3 text-sm text-red-700 space-y-1">
            <p className="font-medium">{t('settings.deleteProjectWarning')}</p>
            <ul className="list-disc list-inside text-xs space-y-0.5">
              <li>{t('settings.deleteProjectBulletTasks')}</li>
              <li>{t('settings.deleteProjectBulletNotes')}</li>
              <li>{t('settings.deleteProjectBulletSync')}</li>
            </ul>
          </div>
          <div>
            <Label className="mb-2 block text-sm">
              {t('settings.deleteProjectTypeConfirm', { name: currentProject?.name })}
            </Label>
            <Input
              value={deleteConfirmName}
              onChange={(e) => setDeleteConfirmName(e.target.value)}
              placeholder={currentProject?.name}
              autoFocus
            />
          </div>
        </div>
      </AppModal>
    </>
  );
}
