import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { IconRefresh, IconDownload } from '@tabler/icons-react';
import { open } from '@tauri-apps/plugin-shell';
import { checkForUpdate, type UpdateInfo } from '../../services/updateService';
import { Button } from '../ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';

const LICENSE_TEXT = `Copyright (c) 2026 DragonFly

Permission is hereby granted, free of charge, to any person or organization obtaining a copy of this software and associated documentation files (the "Software"), to use, copy, and distribute the Software for any purpose, including commercial and corporate use, subject to the following conditions:

1. The Software may not be used for any activity that violates applicable laws or regulations.

2. The Software is provided "as is", without warranty of any kind, express or implied, including but not limited to the warranties of merchantability, fitness for a particular purpose, and noninfringement. In no event shall the authors or copyright holders be liable for any claim, damages, or other liability, whether in an action of contract, tort, or otherwise, arising from, out of, or in connection with the Software or the use or other dealings in the Software.

3. Redistribution or resale of the Software as a standalone product is not permitted. You may freely use the Software as a tool within your personal or business workflow.`;

const THIRD_PARTY_LICENSES = [
  {
    license: 'MIT License',
    packages: [
      'React', 'React DOM', 'Vite', 'Zustand', 'Tailwind CSS',
      '@dnd-kit/core', '@dnd-kit/sortable', '@tabler/icons-react',
      'Radix UI', 'i18next', 'react-i18next', 'clsx', 'tailwind-merge',
      'PocketBase JS SDK', 'Tiptap', 'ProseMirror', 'Yjs', 'nanoid',
      'Excalidraw',
    ],
  },
  {
    license: 'Apache License 2.0',
    packages: [
      'Tauri', '@tauri-apps/api', '@tauri-apps/plugin-dialog',
      '@tauri-apps/plugin-fs', '@tauri-apps/plugin-shell',
      '@tauri-apps/plugin-sql', 'TypeScript',
    ],
  },
  {
    license: 'MPL 2.0',
    packages: ['BlockNote (@blocknote/core, @blocknote/react, @blocknote/shadcn)', 'LightningCSS'],
  },
  {
    license: 'Other',
    packages: ['tslib (0BSD)', 'entities (BSD-2)', 'source-map-js (BSD-3)', 'argparse (Python-2.0)'],
  },
];

export default function SettingsAbout() {
  const { t } = useTranslation();
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateError, setUpdateError] = useState(false);

  const handleCheckUpdate = async () => {
    setIsCheckingUpdate(true);
    setUpdateError(false);
    try {
      const info = await checkForUpdate();
      setUpdateInfo(info);
    } catch {
      setUpdateError(true);
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  useEffect(() => {
    handleCheckUpdate();
  }, []);

  return (
    <>
      {/* App Update */}
      <Card className="mb-4">
        <CardHeader className="flex-row items-center justify-between space-y-0 bg-[#fafafa] border-b border-border">
          <CardTitle className="text-base">{t('settings.update')}</CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={handleCheckUpdate}
            disabled={isCheckingUpdate}
          >
            <IconRefresh size={16} className={`mr-1 ${isCheckingUpdate ? 'animate-spin' : ''}`} />
            {isCheckingUpdate ? t('settings.checking') : t('settings.checkUpdate')}
          </Button>
        </CardHeader>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm">
                <span className="text-muted-foreground">{t('settings.currentVersion')}:</span>{' '}
                <span className="font-medium">v{updateInfo?.currentVersion ?? '...'}</span>
              </p>
              {updateInfo && !updateError && (
                <p className={`text-sm mt-1 font-medium ${updateInfo.hasUpdate ? 'text-amber-600' : 'text-green-600'}`}>
                  {updateInfo.hasUpdate
                    ? t('settings.updateAvailable', { version: updateInfo.latestVersion })
                    : t('settings.upToDate')
                  }
                </p>
              )}
              {updateError && (
                <p className="text-sm mt-1 text-red-500">{t('settings.updateError')}</p>
              )}
            </div>
            {updateInfo?.hasUpdate && (
              <Button size="sm" onClick={() => open(updateInfo.releaseUrl)}>
                <IconDownload size={16} className="mr-1" />
                {t('settings.downloadUpdate')}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* License */}
      <Card className="mb-4">
        <CardHeader className="bg-[#fafafa] border-b border-border">
          <CardTitle className="text-base">{t('settings.license')}</CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <p className="text-sm font-medium">DragonFly License</p>
          <p className="text-xs text-muted-foreground mb-3">Copyright (c) 2026 DragonFly</p>
          <div className="text-xs text-muted-foreground bg-muted p-3 max-h-[180px] overflow-y-auto whitespace-pre-wrap font-mono leading-relaxed">
            {LICENSE_TEXT}
          </div>
        </CardContent>
      </Card>

      {/* Third-Party Licenses */}
      <Card className="mb-4">
        <CardHeader className="bg-[#fafafa] border-b border-border">
          <CardTitle className="text-base">{t('settings.thirdPartyLicenses')}</CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="space-y-3">
            {THIRD_PARTY_LICENSES.map((group) => (
              <div key={group.license}>
                <p className="text-xs font-semibold text-foreground mb-1">{group.license}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {group.packages.join(', ')}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
