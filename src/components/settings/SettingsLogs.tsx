import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { IconRefresh, IconTerminal2, IconTrashFilled } from '@tabler/icons-react';
import { loadLogFile, clearLogFile, getMaxLogSize, setMaxLogSize } from '../../services/logService';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';

interface SettingsLogsProps {
  syncLog: string[];
  setSyncLog: React.Dispatch<React.SetStateAction<string[]>>;
}

export default function SettingsLogs({ syncLog, setSyncLog }: SettingsLogsProps) {
  const { t } = useTranslation();
  const [logMaxSizeMb, setLogMaxSizeMb] = useState(5);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getMaxLogSize().then(setLogMaxSizeMb);
  }, []);

  const loadLogs = async () => {
    const lines = await loadLogFile();
    setSyncLog(lines);
    setTimeout(() => logEndRef.current?.scrollIntoView(), 50);
  };

  return (
    <>
      {/* Log settings */}
      <Card className="mb-4">
        <CardHeader className="flex-row items-center justify-between space-y-0 bg-[#fafafa] border-b border-border">
          <CardTitle className="text-base flex items-center gap-2">
            <IconTerminal2 size={18} />
            {t('settings.tabLogs')}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={loadLogs}>
              <IconRefresh size={14} className="mr-1" />
              {t('settings.loadLogs')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={async () => {
                await clearLogFile();
                setSyncLog([]);
              }}
            >
              <IconTrashFilled size={14} className="mr-1" />
              {t('settings.clearLogs')}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <Label>{t('settings.logMaxSize')}</Label>
            <Input
              type="number"
              min={1}
              max={100}
              value={logMaxSizeMb}
              onChange={async (e) => {
                const val = Math.max(1, parseInt(e.target.value, 10) || 5);
                setLogMaxSizeMb(val);
                await setMaxLogSize(val);
              }}
              className="w-20"
            />
            <span className="text-sm text-muted-foreground">MB</span>
          </div>
        </CardContent>
      </Card>

      {/* Log viewer */}
      <div className="bg-[#0D1117] border border-[#30363d] p-4 font-mono text-xs min-h-[400px] max-h-[600px] overflow-y-auto" style={{ borderRadius: 2 }}>
        {syncLog.length === 0 ? (
          <span className="text-white/30">{t('settings.noLogs')}</span>
        ) : (
          syncLog.map((line, i) => (
            <div key={i} className="flex">
              <span className="text-white/20 w-10 text-right mr-3 shrink-0 select-none">{i + 1}</span>
              <span className={
                line.includes('[OK]') ? 'text-green-400' :
                line.includes('[FIX]') || line.includes('[...') ? 'text-amber-400' :
                line.includes('[ERR]') ? 'text-red-400' :
                line.includes('[WARN]') ? 'text-orange-400' :
                line.includes('[DBG]') ? 'text-blue-400' :
                'text-white/50'
              }>
                {line}
              </span>
            </div>
          ))
        )}
        <div ref={logEndRef} />
      </div>
    </>
  );
}
