import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { IconCheck, IconMail, IconBell, IconAlertTriangle, IconCopy, IconLoader2 } from '@tabler/icons-react';
import { syncService } from '../../services/syncService';
import { getConfig, setConfig, getProjectAdminCredentials } from '../../services/database';
import { useProjectStore } from '@/stores/projectStore';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';

export default function SettingsNotifications() {
  const { t } = useTranslation();
  const { projects } = useProjectStore();

  // SMTP settings
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpSecure, setSmtpSecure] = useState<'tls' | 'starttls' | 'none'>('starttls');
  const [smtpUsername, setSmtpUsername] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [smtpFromEmail, setSmtpFromEmail] = useState('');
  const [smtpFromName, setSmtpFromName] = useState('');
  const [notificationEmailTo, setNotificationEmailTo] = useState('');
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [smtpSaved, setSmtpSaved] = useState(false);
  const [smtpTestStatus, setSmtpTestStatus] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle');
  const [smtpTestError, setSmtpTestError] = useState('');

  // Reminder sync settings
  const [reminderSyncEnabled, setReminderSyncEnabled] = useState(false);
  const [reminderSyncProjectId, setReminderSyncProjectId] = useState('');
  const [reminderSyncSecret, setReminderSyncSecret] = useState('');
  const [reminderSyncSecretInput, setReminderSyncSecretInput] = useState('');
  const [reminderSyncSmtp, setReminderSyncSmtp] = useState(false);
  const [reminderSyncSetupStatus, setReminderSyncSetupStatus] = useState<'idle' | 'running' | 'ok' | 'error'>('idle');
  const [reminderSyncSetupError, setReminderSyncSetupError] = useState('');
  const [reminderSyncCopied, setReminderSyncCopied] = useState(false);
  const [reminderSyncNewWarn, setReminderSyncNewWarn] = useState(false);

  useEffect(() => {
    (async () => {
      const [host, port, sec, user, pass, fromEmail, fromName, emailTo] = await Promise.all([
        getConfig('smtp_host'),
        getConfig('smtp_port'),
        getConfig('smtp_secure'),
        getConfig('smtp_username'),
        getConfig('smtp_password'),
        getConfig('smtp_from_email'),
        getConfig('smtp_from_name'),
        getConfig('notification_email_to'),
      ]);
      if (host) setSmtpHost(host);
      if (port) setSmtpPort(port);
      if (sec === 'tls' || sec === 'starttls' || sec === 'none') setSmtpSecure(sec);
      if (user) setSmtpUsername(user);
      if (pass) setSmtpPassword(pass);
      if (fromEmail) setSmtpFromEmail(fromEmail);
      if (fromName) setSmtpFromName(fromName);
      if (emailTo) setNotificationEmailTo(emailTo);

      const [rEnabled, rProjectId, rSecret, rSmtp] = await Promise.all([
        getConfig('reminder_sync_enabled'),
        getConfig('reminder_sync_project_id'),
        getConfig('reminder_sync_secret'),
        getConfig('reminder_sync_smtp'),
      ]);
      setReminderSyncEnabled(rEnabled === '1');
      if (rProjectId) setReminderSyncProjectId(rProjectId);
      if (rSecret) setReminderSyncSecret(rSecret);
      setReminderSyncSmtp(rSmtp === '1');
    })();
  }, []);

  const handleSmtpSave = async () => {
    setSmtpSaving(true);
    try {
      await Promise.all([
        setConfig('smtp_host', smtpHost),
        setConfig('smtp_port', smtpPort),
        setConfig('smtp_secure', smtpSecure),
        setConfig('smtp_username', smtpUsername),
        setConfig('smtp_password', smtpPassword),
        setConfig('smtp_from_email', smtpFromEmail),
        setConfig('smtp_from_name', smtpFromName),
        setConfig('notification_email_to', notificationEmailTo),
      ]);
      setSmtpSaved(true);
      setTimeout(() => setSmtpSaved(false), 2000);
    } finally {
      setSmtpSaving(false);
    }
  };

  const handleSmtpTest = async () => {
    setSmtpTestStatus('sending');
    setSmtpTestError('');
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('send_notification_email', {
        to: notificationEmailTo,
        subject: t('settings.smtpTestSubject'),
        body: t('settings.smtpTestBody'),
        smtpHost,
        smtpPort: parseInt(smtpPort, 10) || 587,
        smtpUsername,
        smtpPassword,
        smtpFrom: smtpFromEmail || smtpUsername,
        smtpTls: smtpSecure,
      });
      setSmtpTestStatus('ok');
      setTimeout(() => setSmtpTestStatus('idle'), 3000);
    } catch (err) {
      setSmtpTestStatus('error');
      setSmtpTestError(String(err));
    }
  };

  const handleReminderSyncToggle = async (enabled: boolean) => {
    setReminderSyncEnabled(enabled);
    await setConfig('reminder_sync_enabled', enabled ? '1' : '0');
    if (enabled && !reminderSyncSecret) {
      const newSecret = crypto.randomUUID();
      setReminderSyncSecret(newSecret);
      await setConfig('reminder_sync_secret', newSecret);
    }
    if (enabled) {
      syncService.syncPersonalTodos().catch(() => {});
    }
  };

  const handleReminderSyncProjectChange = async (projectId: string) => {
    setReminderSyncProjectId(projectId);
    await setConfig('reminder_sync_project_id', projectId);
    if (reminderSyncEnabled) {
      syncService.syncPersonalTodos().catch(() => {});
    }
  };

  const handleReminderSyncSetup = async () => {
    if (!reminderSyncProjectId) return;
    setReminderSyncSetupStatus('running');
    setReminderSyncSetupError('');
    try {
      const project = projects.find((p) => p.id === reminderSyncProjectId);
      if (!project?.syncUrl) throw new Error(t('settings.reminderSyncNoUrl'));
      const adminCreds = await getProjectAdminCredentials(reminderSyncProjectId);
      if (!adminCreds) throw new Error(t('settings.reminderSyncNoAdminCreds'));
      await syncService.setupReminderServer(project.syncUrl, adminCreds.email, adminCreds.password);
      setReminderSyncSetupStatus('ok');
      setTimeout(() => setReminderSyncSetupStatus('idle'), 3000);
      syncService.syncPersonalTodos().catch(() => {});
      syncService.syncPersonalSettings().catch(() => {});
    } catch (err) {
      setReminderSyncSetupStatus('error');
      setReminderSyncSetupError(String(err));
    }
  };

  const handleReminderSyncCopy = () => {
    navigator.clipboard.writeText(reminderSyncSecret);
    setReminderSyncCopied(true);
    setTimeout(() => setReminderSyncCopied(false), 2000);
  };

  const handleReminderSyncNew = async () => {
    setReminderSyncNewWarn(false);
    const newSecret = crypto.randomUUID();
    setReminderSyncSecret(newSecret);
    await setConfig('reminder_sync_secret', newSecret);
  };

  const handleReminderSyncApply = async () => {
    if (!reminderSyncSecretInput.trim()) return;
    const newSecret = reminderSyncSecretInput.trim();
    setReminderSyncSecret(newSecret);
    setReminderSyncSecretInput('');
    await setConfig('reminder_sync_secret', newSecret);
    syncService.syncPersonalTodos().catch(() => {});
  };

  return (
    <>
      {/* SMTP */}
      <Card className="mb-4">
        <CardHeader className="bg-[#fafafa] border-b border-border">
          <CardTitle className="text-base flex items-center gap-2">
            <IconMail size={16} />
            {t('settings.smtpTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground mb-4">{t('settings.smtpHint')}</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs mb-1 block">{t('settings.smtpHost')}</Label>
              <Input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.example.com" className="text-sm" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">{t('settings.smtpPort')}</Label>
              <Input type="number" value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} placeholder="587" className="text-sm" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">{t('settings.smtpSecurity')}</Label>
              <select
                className="w-full border border-input rounded px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-ring"
                value={smtpSecure}
                onChange={(e) => setSmtpSecure(e.target.value as 'tls' | 'starttls' | 'none')}
              >
                <option value="starttls">STARTTLS</option>
                <option value="tls">TLS/SSL</option>
                <option value="none">{t('settings.smtpSecurityNone')}</option>
              </select>
            </div>
            <div>
              <Label className="text-xs mb-1 block">{t('settings.smtpUsername')}</Label>
              <Input value={smtpUsername} onChange={(e) => setSmtpUsername(e.target.value)} placeholder="user@example.com" className="text-sm" />
            </div>
            <div className="col-span-2">
              <Label className="text-xs mb-1 block">{t('settings.smtpPassword')}</Label>
              <Input type="password" value={smtpPassword} onChange={(e) => setSmtpPassword(e.target.value)} placeholder="••••••••" className="text-sm" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">{t('settings.smtpFromName')}</Label>
              <Input value={smtpFromName} onChange={(e) => setSmtpFromName(e.target.value)} placeholder="DragonFly" className="text-sm" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">{t('settings.smtpFromEmail')}</Label>
              <Input value={smtpFromEmail} onChange={(e) => setSmtpFromEmail(e.target.value)} placeholder="noreply@example.com" className="text-sm" />
            </div>
            <div className="col-span-2">
              <Label className="text-xs mb-1 block">{t('settings.notificationEmailTo')}</Label>
              <Input value={notificationEmailTo} onChange={(e) => setNotificationEmailTo(e.target.value)} placeholder="you@example.com" className="text-sm" />
            </div>
          </div>

          <div className="flex items-center gap-3 mt-4">
            <Button onClick={handleSmtpSave} disabled={smtpSaving} size="sm">
              {smtpSaved ? <><IconCheck size={14} className="mr-1" />{t('settings.smtpSaved')}</> : t('task.save')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleSmtpTest}
              disabled={!smtpHost || !notificationEmailTo || smtpTestStatus === 'sending'}
            >
              <IconMail size={14} className="mr-1" />
              {smtpTestStatus === 'sending' ? t('common.loading') : t('settings.smtpTest')}
            </Button>
            {smtpTestStatus === 'ok' && (
              <span className="text-xs text-green-600 flex items-center gap-1">
                <IconCheck size={14} />{t('settings.smtpTestOk')}
              </span>
            )}
            {smtpTestStatus === 'error' && (
              <span className="text-xs text-red-500">{smtpTestError || t('settings.smtpTestError')}</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Reminder Sync */}
      <Card className="mb-4">
        <CardHeader className="bg-[#fafafa] border-b border-border">
          <CardTitle className="text-base flex items-center gap-2 justify-between">
            <span className="flex items-center gap-2">
              <IconBell size={16} />
              {t('settings.reminderSyncTitle')}
            </span>
            <Switch checked={reminderSyncEnabled} onCheckedChange={handleReminderSyncToggle} />
          </CardTitle>
        </CardHeader>
        {reminderSyncEnabled && (
          <CardContent className="p-4 space-y-4">
            <p className="text-xs text-muted-foreground">{t('settings.reminderSyncHint')}</p>

            {/* Project server selection */}
            <div>
              <Label className="text-xs mb-1 block">{t('settings.reminderSyncServer')}</Label>
              <div className="flex items-center gap-2">
                <select
                  className="flex-1 border border-input rounded px-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-ring"
                  value={reminderSyncProjectId}
                  onChange={(e) => handleReminderSyncProjectChange(e.target.value)}
                >
                  <option value="">{t('settings.reminderSyncSelectProject')}</option>
                  {Array.from(
                    new Map(
                      projects
                        .filter((p) => p.syncUrl)
                        .map((p) => [p.syncUrl.replace(/\/+$/, ''), p])
                    ).values()
                  ).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.syncUrl.replace(/\/+$/, '')}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  onClick={handleReminderSyncSetup}
                  disabled={!reminderSyncProjectId || reminderSyncSetupStatus === 'running'}
                >
                  {reminderSyncSetupStatus === 'running' ? (
                    <IconLoader2 size={14} className="animate-spin" />
                  ) : reminderSyncSetupStatus === 'ok' ? (
                    <IconCheck size={14} />
                  ) : null}
                  {t('settings.reminderSyncSetup')}
                </Button>
              </div>
              {reminderSyncSetupStatus === 'error' && (
                <p className="text-xs text-red-500 mt-1">{reminderSyncSetupError}</p>
              )}
            </div>

            <hr className="border-border" />

            {/* Sync secret */}
            <div>
              <Label className="text-xs mb-1 block">{t('settings.reminderSyncSecret')}</Label>
              <div className="flex items-center gap-2">
                <Input value={reminderSyncSecret} readOnly className="text-sm font-mono text-muted-foreground" />
                <Button variant="outline" size="sm" onClick={handleReminderSyncCopy}>
                  {reminderSyncCopied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setReminderSyncNewWarn(true)}>
                  {t('settings.reminderSyncNew')}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{t('settings.reminderSyncSecretHint')}</p>
            </div>

            {reminderSyncNewWarn && (
              <div className="rounded border border-yellow-300 bg-yellow-50 p-3 text-xs text-yellow-800 flex items-start gap-2">
                <IconAlertTriangle size={14} className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium mb-1">{t('settings.reminderSyncNewWarn')}</p>
                  <div className="flex gap-2 mt-2">
                    <Button size="sm" variant="destructive" onClick={handleReminderSyncNew}>{t('settings.reminderSyncNewConfirm')}</Button>
                    <Button size="sm" variant="outline" onClick={() => setReminderSyncNewWarn(false)}>{t('task.cancel')}</Button>
                  </div>
                </div>
              </div>
            )}

            <hr className="border-border" />

            {/* Enter secret from other device */}
            <div>
              <Label className="text-xs mb-1 block">{t('settings.reminderSyncEnter')}</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={reminderSyncSecretInput}
                  onChange={(e) => setReminderSyncSecretInput(e.target.value)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className="text-sm font-mono"
                />
                <Button size="sm" onClick={handleReminderSyncApply} disabled={!reminderSyncSecretInput.trim()}>
                  {t('settings.reminderSyncApply')}
                </Button>
              </div>
            </div>

            <hr className="border-border" />

            {/* SMTP sync toggle */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{t('settings.reminderSyncSmtpToggle')}</p>
                <p className="text-xs text-muted-foreground">{t('settings.reminderSyncSmtpToggleHint')}</p>
              </div>
              <Switch
                checked={reminderSyncSmtp}
                onCheckedChange={async (v) => {
                  setReminderSyncSmtp(v);
                  await setConfig('reminder_sync_smtp', v ? '1' : '0');
                }}
              />
            </div>
          </CardContent>
        )}
      </Card>
    </>
  );
}
