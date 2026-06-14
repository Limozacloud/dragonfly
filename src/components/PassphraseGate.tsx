import { useState, useEffect, KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { IconLock } from '@tabler/icons-react';
import { getConfig, setConfig } from '../services/database';
import { hashPassphrase, verifyPassphrase } from '../services/crypto';
import { Button } from './ui/button';
import { Input } from './ui/input';

interface PassphraseGateProps {
  onUnlock: (passphrase: string) => void;
}

function PassphraseGate({ onUnlock }: PassphraseGateProps) {
  const { t } = useTranslation();
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [isFirstTime, setIsFirstTime] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    checkExistingPassphrase();
  }, []);

  const checkExistingPassphrase = async () => {
    const hash = await getConfig('passphrase_hash');
    setIsFirstTime(!hash);
  };

  const handleSubmit = async () => {
    if (isLoading) return;
    setError('');
    setIsLoading(true);

    try {
      if (isFirstTime) {
        // Setting passphrase for the first time
        if (passphrase.length < 8) {
          setError(t('passphrase.tooShort'));
          setIsLoading(false);
          return;
        }
        if (passphrase !== confirmPassphrase) {
          setError(t('passphrase.noMatch'));
          setIsLoading(false);
          return;
        }

        const hash = await hashPassphrase(passphrase);
        await setConfig('passphrase_hash', hash);
        onUnlock(passphrase);
      } else {
        // Verify existing passphrase
        const storedHash = await getConfig('passphrase_hash');
        if (!storedHash) {
          setIsFirstTime(true);
          setIsLoading(false);
          return;
        }

        const isValid = await verifyPassphrase(passphrase, storedHash);
        if (isValid) {
          onUnlock(passphrase);
        } else {
          setError(t('passphrase.incorrect'));
        }
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  if (isFirstTime === null) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#0D1117]">
        <p className="text-white/60">{t('common.loading')}</p>
      </div>
    );
  }

  return (
    <div className="h-screen flex items-center justify-center bg-[#0D1117]">
      <div className="w-[380px]">
        {/* Header */}
        <div className="flex flex-col items-center mb-6">
          <img src="/images/dragonfly-icon.svg" alt="Dragonfly" className="w-16 h-16 -mb-6 z-0" />
          <h1
            className="text-2xl bg-gradient-to-r from-[#0077B6] to-[#00B4D8] bg-clip-text text-transparent overflow-visible z-10"
            style={{ fontFamily: "'Pacifico', cursive", lineHeight: 2 }}
          >
            Dragonfly
          </h1>
        </div>

        {/* Card */}
        <div className="bg-[#161b22] border border-[#30363d] rounded-[2px]">
          <div className="p-4 border-b border-[#30363d] flex items-center gap-2">
            <IconLock size={18} className="text-[#00B4D8]" />
            <span className="text-white font-medium">
              {isFirstTime ? t('passphrase.setup') : t('passphrase.title')}
            </span>
          </div>

          <div className="p-4 space-y-3">
            {isFirstTime && (
              <p className="text-sm text-[#8b949e]">{t('passphrase.hint')}</p>
            )}

            <Input
              type="password"
              placeholder={t('passphrase.placeholder')}
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
              className="bg-[#0d1117] border-[#30363d] text-white placeholder:text-[#484f58]"
            />

            {isFirstTime && (
              <Input
                type="password"
                placeholder={t('passphrase.confirmPlaceholder')}
                value={confirmPassphrase}
                onChange={(e) => setConfirmPassphrase(e.target.value)}
                onKeyDown={handleKeyDown}
                className="bg-[#0d1117] border-[#30363d] text-white placeholder:text-[#484f58]"
              />
            )}

            {error && (
              <p className="text-sm text-red-400">{error}</p>
            )}

            <Button
              className="w-full"
              onClick={handleSubmit}
              disabled={isLoading || !passphrase}
            >
              {isLoading ? t('common.loading') : t('passphrase.unlock')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PassphraseGate;
