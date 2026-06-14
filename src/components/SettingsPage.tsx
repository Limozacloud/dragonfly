import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  IconSettings, IconUsers, IconDatabase, IconCloudComputing,
  IconInfoCircle, IconSparkles, IconTerminal2, IconBell,
} from '@tabler/icons-react';
import { onLog } from '../services/logService';
import { SettingsTab } from '@/types/ui';
import SettingsGeneral from './settings/SettingsGeneral';
import SettingsUsers from './settings/SettingsUsers';
import SettingsData from './settings/SettingsData';
import SettingsSync from './settings/SettingsSync';
import SettingsNotifications from './settings/SettingsNotifications';
import SettingsPrompts from './settings/SettingsPrompts';
import SettingsLogs from './settings/SettingsLogs';
import SettingsAbout from './settings/SettingsAbout';

function SettingsPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [syncLog, setSyncLog] = useState<string[]>([]);

  useEffect(() => {
    const addLog = (msg: string) => setSyncLog((prev) => [...prev, msg]);
    const unsub = onLog(addLog);
    return () => unsub();
  }, []);

  const tabs: { id: SettingsTab; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
    { id: 'general', label: t('settings.tabGeneral'), icon: IconSettings },
    { id: 'users', label: t('users.title'), icon: IconUsers },
    { id: 'data', label: t('settings.tabData'), icon: IconDatabase },
    { id: 'sync', label: t('sync.title'), icon: IconCloudComputing },
    { id: 'notifications', label: t('settings.tabNotifications'), icon: IconBell },
    { id: 'prompts', label: t('settings.tabPrompts'), icon: IconSparkles },
    { id: 'logs', label: t('settings.tabLogs'), icon: IconTerminal2 },
    { id: 'about', label: t('settings.tabAbout'), icon: IconInfoCircle },
  ];

  return (
    <div className="w-[60%] min-w-3xl mx-auto">
      {/* Tab Bar */}
      <div className="flex justify-center border-b border-border mb-8">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            }`}
            onClick={() => setActiveTab(tab.id)}
          >
            <tab.icon size={15} />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'general' && <SettingsGeneral />}
      {activeTab === 'users' && <SettingsUsers />}
      {activeTab === 'data' && <SettingsData />}
      {activeTab === 'sync' && (
        <SettingsSync addLog={(msg) => setSyncLog((prev) => [...prev, msg])} />
      )}
      {activeTab === 'notifications' && <SettingsNotifications />}
      {activeTab === 'prompts' && <SettingsPrompts />}
      {activeTab === 'logs' && (
        <SettingsLogs syncLog={syncLog} setSyncLog={setSyncLog} />
      )}
      {activeTab === 'about' && <SettingsAbout />}
    </div>
  );
}

export default SettingsPage;
