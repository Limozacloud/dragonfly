import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  IconCheck, IconCloud, IconCloudOff, IconRefresh, IconSettings,
  IconInfoCircle, IconAlertTriangle, IconCopy, IconLink,
  IconLoader2, IconEye, IconEyeOff, IconPlugConnected,
} from '@tabler/icons-react';
import { syncService } from '../../services/syncService';
import { getProjectAdminCredentials, setProjectAdminCredentials, clearProjectAdminCredentials, SCHEMA_VERSION } from '../../services/database';
import { generateSpaceUrl, parseSpaceUrl } from '../../services/spaceUrl';
import { useProjectStore } from '@/stores/projectStore';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { AppModal } from '../ui/app-modal';

function spaceKeyStrength(key: string): 'weak' | 'fair' | 'strong' {
  if (key.length < 12) return 'weak';
  let score = 0;
  if (/[a-z]/.test(key)) score++;
  if (/[A-Z]/.test(key)) score++;
  if (/[0-9]/.test(key)) score++;
  if (/[^a-zA-Z0-9]/.test(key)) score++;
  if (key.length >= 20 || (key.length >= 12 && score >= 3)) return 'strong';
  if (score >= 2) return 'fair';
  return 'weak';
}

function SpaceKeyInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation();
  if (value.trim().length === 0) return (
    <Input
      type="password"
      placeholder={t('sync.spaceKeyPlaceholder')}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
  const strength = spaceKeyStrength(value.trim());
  const bars = { weak: 1, fair: 2, strong: 3 }[strength];
  const colors = { weak: 'bg-red-500', fair: 'bg-amber-400', strong: 'bg-green-500' };
  const labels = {
    weak: t('sync.spaceKeyStrengthWeak'),
    fair: t('sync.spaceKeyStrengthFair'),
    strong: t('sync.spaceKeyStrengthStrong'),
  };
  return (
    <div className="space-y-2">
      <Input
        type="password"
        placeholder={t('sync.spaceKeyPlaceholder')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="flex gap-1">
        {[1, 2, 3].map((i) => (
          <div key={i} className={`h-1 flex-1 rounded-full ${i <= bars ? colors[strength] : 'bg-muted'}`} />
        ))}
      </div>
      <p className={`text-xs ${strength === 'weak' ? 'text-red-500' : strength === 'fair' ? 'text-amber-500' : 'text-green-600'}`}>
        {labels[strength]}
      </p>
    </div>
  );
}

interface SettingsSyncProps {
  addLog: (msg: string) => void;
}

export default function SettingsSync({ addLog }: SettingsSyncProps) {
  const { t } = useTranslation();
  const { projects, joinProjects } = useProjectStore();

  const [spaceUrl, setSpaceUrl] = useState('');
  const [spaceKey, setSpaceKey] = useState('');
  const [spaceUrlInput, setSpaceUrlInput] = useState('');
  const [spaceUrlParsed, setSpaceUrlParsed] = useState(false);
  const [hasSavedCredentials, setHasSavedCredentials] = useState(false);
  const [isSyncConnected, setIsSyncConnected] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const [hasAdminCredentials, setHasAdminCredentials] = useState(false);
  const [displaySpaceUrl, setDisplaySpaceUrl] = useState('');
  const [spaceUrlCopied, setSpaceUrlCopied] = useState(false);
  const [showDeleteAdminConfirm, setShowDeleteAdminConfirm] = useState(false);
  const [isVerifyingAdmin, setIsVerifyingAdmin] = useState(false);
  const [adminVerifyError, setAdminVerifyError] = useState('');
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);

  const [showSetup, setShowSetup] = useState(false);
  const [setupUrl, setSetupUrl] = useState('');
  const [setupSpaceKey, setSetupSpaceKey] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [isSettingUp, setIsSettingUp] = useState(false);
  const [setupStatus, setSetupStatus] = useState('');

  const [remoteProjects, setRemoteProjects] = useState<Array<{ id: string; name: string; description: string; color: string }>>([]);
  const [remoteProjectsLoading, setRemoteProjectsLoading] = useState(false);
  const [remoteSelectedIds, setRemoteSelectedIds] = useState<Set<string>>(new Set());
  const [remoteJoining, setRemoteJoining] = useState(false);
  const [remoteError, setRemoteError] = useState('');

  useEffect(() => {
    setIsSyncConnected(syncService.isConnected);
    if (syncService.isConnected) setSpaceUrl(syncService.serverUrl);

    (async () => {
      const project = useProjectStore.getState().getCurrentProject();
      const savedUrl = project?.syncUrl || '';
      const savedSpaceKey = project?.syncSpaceKey || '';
      if (savedUrl) setSpaceUrl(savedUrl);
      if (savedSpaceKey) setSpaceKey(savedSpaceKey);
      if (savedUrl && savedSpaceKey) {
        setHasSavedCredentials(true);
        setDisplaySpaceUrl(generateSpaceUrl(savedUrl, savedSpaceKey));
      }

      const projId = useProjectStore.getState().currentProjectId;
      if (projId) {
        const adminCreds = await getProjectAdminCredentials(projId);
        if (adminCreds) {
          setAdminEmail(adminCreds.email);
          setAdminPassword(adminCreds.password);
          setHasAdminCredentials(true);
        }
      }

      setIsSyncConnected(syncService.isConnected);
      if (syncService.isConnected && syncService.serverUrl) setSpaceUrl(syncService.serverUrl);
    })();

    const interval = setInterval(() => setIsSyncConnected(syncService.isConnected), 2000);
    return () => clearInterval(interval);
  }, []);

  const handleParseSpaceUrl = () => {
    const parsed = parseSpaceUrl(spaceUrlInput.trim());
    if (parsed) {
      setSpaceUrl(parsed.serverUrl);
      setSpaceKey(parsed.spaceKey);
      setSpaceUrlParsed(true);
    }
  };

  const handleConnect = async () => {
    if (!spaceUrl.trim() || !spaceKey.trim()) return;
    setIsSyncing(true);
    try {
      const projectId = useProjectStore.getState().currentProjectId;
      await syncService.connect(spaceUrl.trim(), spaceKey.trim(), projectId || undefined);
      setIsSyncConnected(true);
      if (projectId) {
        await useProjectStore.getState().updateProject(projectId, {
          syncUrl: spaceUrl.trim(),
          syncSpaceKey: spaceKey.trim(),
        });
      }
      setHasSavedCredentials(true);
      setDisplaySpaceUrl(generateSpaceUrl(spaceUrl.trim(), spaceKey.trim()));
    } catch (error) {
      addLog('[ERR] ' + String(error));
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSetupServer = async () => {
    if (!setupUrl.trim() || !adminEmail.trim() || !adminPassword.trim() || spaceKeyStrength(setupSpaceKey.trim()) === 'weak') return;
    setIsSettingUp(true);
    setSetupStatus('');
    try {
      addLog('[...] Setting up server...');
      await syncService.setupServer(setupUrl.trim(), adminEmail.trim(), adminPassword.trim(), setupSpaceKey.trim());
      addLog('[OK] ' + t('sync.setupSuccess'));
      setSetupStatus(t('sync.setupSuccess'));

      const projId = useProjectStore.getState().currentProjectId;
      if (projId) await setProjectAdminCredentials(projId, adminEmail.trim(), adminPassword.trim());
      setHasAdminCredentials(true);

      setTimeout(async () => {
        setShowSetup(false);
        setSetupStatus('');
        setSpaceUrl(setupUrl.trim());
        setSpaceKey(setupSpaceKey.trim());
        setIsSyncing(true);
        try {
          const projectId = useProjectStore.getState().currentProjectId;
          await syncService.connect(setupUrl.trim(), setupSpaceKey.trim(), projectId || undefined);
          setIsSyncConnected(true);
          if (projectId) {
            await useProjectStore.getState().updateProject(projectId, {
              syncUrl: setupUrl.trim(),
              syncSpaceKey: setupSpaceKey.trim(),
            });
          }
          setHasSavedCredentials(true);
          setDisplaySpaceUrl(generateSpaceUrl(setupUrl.trim(), setupSpaceKey.trim()));
        } catch (error) {
          addLog('[ERR] Connect: ' + String(error));
        } finally {
          setIsSyncing(false);
        }
      }, 1500);
    } catch (error) {
      const errMsg = error instanceof Error && error.message === 'SERVER_ALREADY_CONFIGURED'
        ? t('sync.serverAlreadyConfigured')
        : String(error);
      setSetupStatus(t('sync.error') + ': ' + errMsg);
      addLog('[ERR] Setup: ' + errMsg);
    } finally {
      setIsSettingUp(false);
    }
  };

  const handleFetchRemoteProjects = async () => {
    if (!spaceUrl.trim() || !spaceKey.trim()) return;
    setRemoteProjectsLoading(true);
    setRemoteError('');
    setRemoteProjects([]);
    setRemoteSelectedIds(new Set());
    try {
      const result = await syncService.fetchRemoteProjects(spaceUrl.trim(), spaceKey.trim());
      setRemoteProjects(result);
    } catch (err) {
      setRemoteError(String(err));
    } finally {
      setRemoteProjectsLoading(false);
    }
  };

  const handleJoinRemoteProjects = async () => {
    const toJoin = remoteProjects.filter((p) => remoteSelectedIds.has(p.id));
    if (toJoin.length === 0) return;
    setRemoteJoining(true);
    setRemoteError('');
    try {
      await joinProjects(toJoin, spaceUrl.trim(), spaceKey.trim());
      setRemoteSelectedIds(new Set());
    } catch (err) {
      setRemoteError(String(err));
    } finally {
      setRemoteJoining(false);
    }
  };

  const isSynced = hasSavedCredentials;
  const isAdmin = hasAdminCredentials;
  const syncView: 'setup' | 'admin' | 'user' = !isSynced ? 'setup' : isAdmin ? 'admin' : 'user';

  return (
    <>
      <Card className="mb-4">
        <CardHeader className="flex-row items-center justify-between space-y-0 bg-[#fafafa] border-b border-border">
          <CardTitle className="text-base flex items-center gap-2">
            {isSyncConnected ? (
              <IconCloud size={18} className="text-green-500" />
            ) : (
              <IconCloudOff size={18} className="text-muted-foreground" />
            )}
            {t('sync.title')}
            {isSyncConnected && (
              <span className="text-xs font-normal text-green-600">({t('sync.connected')})</span>
            )}
          </CardTitle>
        </CardHeader>

        <CardContent className="p-4 space-y-4">
          {/* ── NOT CONNECTED ── */}
          {syncView === 'setup' && (
            <>
              {/* Section 1: Join */}
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium mb-1">{t('sync.joinTitle')}</p>
                  <p className="text-xs text-muted-foreground mb-3">{t('sync.joinHint')}</p>
                </div>

                {/* Space URL paste shortcut */}
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="dragonfly://pb.example.com/…"
                    value={spaceUrlInput}
                    onChange={(e) => { setSpaceUrlInput(e.target.value); setSpaceUrlParsed(false); }}
                    className="font-mono text-xs"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleParseSpaceUrl}
                    disabled={!spaceUrlInput.trim()}
                  >
                    {t('sync.parseAndFill')}
                  </Button>
                </div>
                {spaceUrlParsed && (
                  <p className="text-xs text-green-600">{t('sync.spaceUrlParsed')}</p>
                )}

                <div className="relative flex items-center gap-2">
                  <div className="flex-1 border-t border-border" />
                  <span className="text-xs text-muted-foreground px-2">{t('sync.orEnterManually')}</span>
                  <div className="flex-1 border-t border-border" />
                </div>

                <div>
                  <Label className="mb-1.5 block text-xs">{t('sync.spaceUrl')}</Label>
                  <Input
                    placeholder="https://pb.example.com"
                    value={spaceUrl}
                    onChange={(e) => setSpaceUrl(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="mb-1.5 block text-xs">{t('sync.spaceKey')}</Label>
                  <SpaceKeyInput value={spaceKey} onChange={setSpaceKey} />
                </div>

                <Button
                  className="w-full"
                  onClick={handleConnect}
                  disabled={isSyncing || !spaceUrl.trim() || spaceKeyStrength(spaceKey.trim()) === 'weak'}
                >
                  <IconPlugConnected size={15} className="mr-2" />
                  {isSyncing ? t('sync.connecting') : t('sync.connect')}
                </Button>
              </div>

              {/* Divider */}
              <div className="relative flex items-center gap-2 py-1">
                <div className="flex-1 border-t border-border" />
                <span className="text-xs text-muted-foreground px-2">or</span>
                <div className="flex-1 border-t border-border" />
              </div>

              {/* Section 2: First-time setup */}
              <div className="bg-muted/40 border border-border p-4 space-y-2" style={{ borderRadius: 4 }}>
                <p className="text-sm font-medium">{t('sync.setupNewTitle')}</p>
                <p className="text-xs text-muted-foreground">{t('sync.setupNewHint')}</p>
                <Button
                  variant="outline"
                  className="w-full mt-1"
                  onClick={() => setShowSetup(true)}
                >
                  {t('sync.setupSync')} →
                </Button>
              </div>
            </>
          )}

          {/* ── CONNECTED ── */}
          {(syncView === 'admin' || syncView === 'user') && (
            <>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{t('sync.schemaVersion')}</span>
                <span className="font-mono text-xs">v{SCHEMA_VERSION}</span>
              </div>

              {displaySpaceUrl && (
                <div>
                  <Label className="mb-1.5 block text-xs">{t('sync.spaceUrlLabel')}</Label>
                  <div className="flex gap-2">
                    <Input value={displaySpaceUrl} readOnly className="flex-1 font-mono text-xs" />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        navigator.clipboard.writeText(displaySpaceUrl);
                        setSpaceUrlCopied(true);
                        setTimeout(() => setSpaceUrlCopied(false), 2000);
                      }}
                      title={t('sync.copySpaceUrl')}
                    >
                      {spaceUrlCopied ? <IconCheck size={16} className="text-green-500" /> : <IconCopy size={16} />}
                    </Button>
                  </div>
                  {spaceUrlCopied && (
                    <p className="text-xs text-green-500 mt-1">{t('sync.spaceUrlCopied')}</p>
                  )}
                </div>
              )}

              {(() => {
                const project = useProjectStore.getState().getCurrentProject();
                const isShared = project?.shared ?? true;
                return (
                  <div className="flex items-center justify-between py-2 border-t border-border pt-3">
                    <div>
                      <Label className="block">{t('sync.shareProject')}</Label>
                      <small className="text-muted-foreground">{t('sync.shareProjectHint')}</small>
                    </div>
                    <Switch
                      checked={isShared}
                      onCheckedChange={async (v: boolean) => {
                        const pid = useProjectStore.getState().currentProjectId;
                        if (pid) await useProjectStore.getState().updateProject(pid, { shared: v });
                      }}
                    />
                  </div>
                );
              })()}
            </>
          )}
        </CardContent>
      </Card>

      {/* Remote Projects */}
      {(syncView === 'admin' || syncView === 'user') && (
        <Card className="mb-4">
          <CardHeader className="flex-row items-center justify-between space-y-0 bg-[#fafafa] border-b border-border">
            <CardTitle className="text-base flex items-center gap-2">
              <IconLink size={18} />
              {t('project.remoteProjects')}
            </CardTitle>
            <div className="flex items-center gap-2">
              {remoteProjects.length > 0 && (() => {
                const localIds = new Set(projects.map((p) => p.id));
                const joinable = remoteProjects.filter((rp) => !localIds.has(rp.id));
                if (joinable.length === 0) return null;
                return (
                  <Button size="sm" onClick={handleJoinRemoteProjects} disabled={remoteJoining || remoteSelectedIds.size === 0}>
                    {remoteJoining ? t('project.joining') : t('project.joinSelected')}
                  </Button>
                );
              })()}
              <Button size="sm" variant="outline" onClick={handleFetchRemoteProjects} disabled={remoteProjectsLoading}>
                {remoteProjectsLoading ? (
                  <IconLoader2 size={14} className="mr-1 animate-spin" />
                ) : (
                  <IconRefresh size={14} className="mr-1" />
                )}
                {t('project.loadRemoteProjects')}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            {remoteProjects.length === 0 && !remoteProjectsLoading && !remoteError && (
              <p className="text-muted-foreground text-center text-sm">{t('project.remoteProjectsHint')}</p>
            )}
            {remoteError && <p className="text-sm text-red-500 text-center">{remoteError}</p>}
            {remoteProjects.length > 0 && (() => {
              const localIds = new Set(projects.map((p) => p.id));
              return (
                <div className="space-y-2">
                  {remoteProjects.map((rp) => {
                    const alreadyJoined = localIds.has(rp.id);
                    return (
                      <label
                        key={rp.id}
                        className={`flex items-center gap-3 p-3 border transition-colors ${
                          alreadyJoined
                            ? 'border-border bg-muted/50 cursor-default'
                            : remoteSelectedIds.has(rp.id)
                              ? 'border-primary bg-primary/5 cursor-pointer'
                              : 'border-border hover:border-primary/50 cursor-pointer'
                        }`}
                        style={{ borderRadius: 2 }}
                      >
                        {!alreadyJoined && (
                          <input
                            type="checkbox"
                            checked={remoteSelectedIds.has(rp.id)}
                            onChange={() => {
                              setRemoteSelectedIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(rp.id)) next.delete(rp.id);
                                else next.add(rp.id);
                                return next;
                              });
                            }}
                            className="accent-[#0077B6]"
                          />
                        )}
                        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: rp.color }} />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium block truncate">{rp.name}</span>
                          {rp.description && (
                            <span className="text-xs text-muted-foreground block truncate">{rp.description}</span>
                          )}
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
              );
            })()}
          </CardContent>
        </Card>
      )}

      {/* Admin Credentials */}
      {(syncView === 'admin' || syncView === 'user') && (
        <Card className="mb-4">
          <CardHeader className="flex-row items-center justify-between space-y-0 bg-[#fafafa] border-b border-border">
            <CardTitle className="text-base flex items-center gap-2">
              <IconSettings size={18} />
              {t('sync.adminCredentials')}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            {syncView === 'admin' ? (
              <>
                <div>
                  <Label className="mb-1 block text-xs text-muted-foreground">{t('sync.adminEmail')}</Label>
                  <Input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} />
                </div>
                <div>
                  <Label className="mb-1 block text-xs text-muted-foreground">{t('sync.adminPassword')}</Label>
                  <div className="relative">
                    <Input
                      type={showAdminPassword ? 'text' : 'password'}
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      className="pr-9"
                    />
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      onClick={() => setShowAdminPassword(!showAdminPassword)}
                      tabIndex={-1}
                    >
                      {showAdminPassword ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                    </button>
                  </div>
                </div>
                {adminVerifyError && <p className="text-sm text-red-500">{adminVerifyError}</p>}
                <div className="flex justify-between">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      if (!adminEmail.trim() || !adminPassword.trim()) return;
                      setIsVerifyingAdmin(true);
                      setAdminVerifyError('');
                      const ok = await syncService.verifyAdmin(spaceUrl, adminEmail.trim(), adminPassword.trim());
                      if (ok) {
                        const pId = useProjectStore.getState().currentProjectId;
                        if (pId) await setProjectAdminCredentials(pId, adminEmail.trim(), adminPassword.trim());
                        setHasAdminCredentials(true);
                        setAdminVerifyError('');
                      } else {
                        setAdminVerifyError(t('sync.adminVerifyFailed'));
                      }
                      setIsVerifyingAdmin(false);
                    }}
                    disabled={isVerifyingAdmin || !adminEmail.trim() || !adminPassword.trim()}
                  >
                    {isVerifyingAdmin ? t('common.loading') : t('sync.saveCredentials')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setShowDeleteAdminConfirm(true)}
                  >
                    {t('sync.deleteAdminCredentials')}
                  </Button>
                </div>
              </>
            ) : (
              <>
                {!showAdminLogin ? (
                  <Button variant="outline" size="sm" onClick={() => setShowAdminLogin(true)}>
                    {t('sync.loginAsAdmin')}
                  </Button>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <Label className="mb-1 block text-xs text-muted-foreground">{t('sync.adminEmail')}</Label>
                      <Input type="email" placeholder="admin@example.com" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} />
                    </div>
                    <div>
                      <Label className="mb-1 block text-xs text-muted-foreground">{t('sync.adminPassword')}</Label>
                      <div className="relative">
                        <Input
                          type={showAdminPassword ? 'text' : 'password'}
                          placeholder="********"
                          value={adminPassword}
                          onChange={(e) => setAdminPassword(e.target.value)}
                          className="pr-9"
                        />
                        <button
                          type="button"
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          onClick={() => setShowAdminPassword(!showAdminPassword)}
                          tabIndex={-1}
                        >
                          {showAdminPassword ? <IconEyeOff size={16} /> : <IconEye size={16} />}
                        </button>
                      </div>
                    </div>
                    {adminVerifyError && <p className="text-sm text-red-500">{adminVerifyError}</p>}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={async () => {
                          if (!adminEmail.trim() || !adminPassword.trim()) return;
                          setIsVerifyingAdmin(true);
                          setAdminVerifyError('');
                          const ok = await syncService.verifyAdmin(spaceUrl, adminEmail.trim(), adminPassword.trim());
                          if (ok) {
                            const pId = useProjectStore.getState().currentProjectId;
                            if (pId) await setProjectAdminCredentials(pId, adminEmail.trim(), adminPassword.trim());
                            setHasAdminCredentials(true);
                            setShowAdminLogin(false);
                            setAdminVerifyError('');
                            if (spaceUrl && spaceKey) setDisplaySpaceUrl(generateSpaceUrl(spaceUrl, spaceKey));
                          } else {
                            setAdminVerifyError(t('sync.adminVerifyFailed'));
                          }
                          setIsVerifyingAdmin(false);
                        }}
                        disabled={isVerifyingAdmin || !adminEmail.trim() || !adminPassword.trim()}
                      >
                        {isVerifyingAdmin ? t('common.loading') : t('sync.saveCredentials')}
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => { setShowAdminLogin(false); setAdminVerifyError(''); }}>
                        {t('task.cancel')}
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Backup info */}
      {(syncView === 'admin' || syncView === 'user') && (
        <Card className="mb-4">
          <CardHeader className="flex-row items-center justify-between space-y-0 bg-[#fafafa] border-b border-border">
            <CardTitle className="text-base flex items-center gap-2">
              <IconInfoCircle size={18} />
              {t('sync.backupTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3 text-sm text-muted-foreground">
            <p>{t('sync.backupDescription')}</p>
            <div className="bg-muted p-3 space-y-2 text-xs" style={{ borderRadius: 2 }}>
              <p className="font-medium text-foreground">{t('sync.backupSteps')}</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>{t('sync.backupStep1')}</li>
                <li>{t('sync.backupStep2')}</li>
                <li>{t('sync.backupStep3')}</li>
              </ol>
              <p className="font-medium text-foreground mt-3">{t('sync.restoreSteps')}</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>{t('sync.restoreStep1')}</li>
                <li>{t('sync.restoreStep2')}</li>
                <li>{t('sync.restoreStep3')}</li>
              </ol>
            </div>
            <div className="bg-amber-50 border border-amber-200 p-3 text-xs text-amber-700 flex items-start gap-2" style={{ borderRadius: 2 }}>
              <IconAlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>{t('sync.backupHint', { version: SCHEMA_VERSION })}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Delete Admin Credentials Modal */}
      <AppModal
        isOpen={showDeleteAdminConfirm}
        onClose={() => setShowDeleteAdminConfirm(false)}
        title={t('sync.deleteAdminCredentials')}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowDeleteAdminConfirm(false)}>
              {t('task.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                const pId = useProjectStore.getState().currentProjectId;
                if (pId) await clearProjectAdminCredentials(pId);
                setAdminEmail('');
                setAdminPassword('');
                setHasAdminCredentials(false);
                setDisplaySpaceUrl('');
                setShowDeleteAdminConfirm(false);
              }}
            >
              {t('sync.deleteAdminCredentials')}
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted-foreground">{t('sync.deleteAdminConfirm')}</p>
      </AppModal>

      {/* Setup Modal — everything in one place */}
      <AppModal
        isOpen={showSetup}
        onClose={() => { setShowSetup(false); setSetupStatus(''); }}
        title={t('sync.setup')}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setShowSetup(false); setSetupStatus(''); }}>
              {t('task.cancel')}
            </Button>
            <Button
              onClick={handleSetupServer}
              disabled={isSettingUp || !setupUrl.trim() || !adminEmail.trim() || !adminPassword.trim() || spaceKeyStrength(setupSpaceKey.trim()) === 'weak'}
            >
              {isSettingUp ? t('common.loading') : t('sync.setupButton')}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{t('sync.setupHint')}</p>

          <div>
            <Label className="mb-1.5 block text-xs">{t('sync.spaceUrl')}</Label>
            <Input placeholder="https://pb.example.com" value={setupUrl} onChange={(e) => setSetupUrl(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs">{t('sync.adminEmail')}</Label>
            <Input type="email" placeholder="admin@example.com" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} />
          </div>
          <div>
            <Label className="mb-1.5 block text-xs">{t('sync.adminPassword')}</Label>
            <div className="relative">
              <Input
                type={showAdminPassword ? 'text' : 'password'}
                placeholder="********"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                className="pr-9"
              />
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowAdminPassword(!showAdminPassword)}
                tabIndex={-1}
              >
                {showAdminPassword ? <IconEyeOff size={16} /> : <IconEye size={16} />}
              </button>
            </div>
          </div>
          <div>
            <Label className="mb-1.5 block text-xs">{t('sync.spaceKey')}</Label>
            <SpaceKeyInput value={setupSpaceKey} onChange={setSetupSpaceKey} />
          </div>

          {setupStatus && (
            <p className={`text-sm ${setupStatus.includes(t('sync.error')) ? 'text-red-400' : 'text-green-500'}`}>
              {setupStatus}
            </p>
          )}
        </div>
      </AppModal>
    </>
  );
}
