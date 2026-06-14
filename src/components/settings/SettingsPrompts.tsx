import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { IconCheck } from '@tabler/icons-react';
import { DEFAULT_NOTES_PROMPT, DEFAULT_TASKS_PROMPT } from '../../services/aiService';
import { DEFAULT_CAB_PROMPT } from '../../services/cabService';
import { getConfig, setConfig, deleteConfig } from '../../services/database';
import type { AppConfigKey } from '../../types/db';
import { Card } from '../ui/card';

export default function SettingsPrompts() {
  const { t } = useTranslation();

  const [promptNotes, setPromptNotes] = useState('');
  const [promptTasks, setPromptTasks] = useState('');
  const [promptCab, setPromptCab] = useState('');
  const [promptSaveStatus, setPromptSaveStatus] = useState<Record<string, string>>({});
  const promptSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [activePromptTab, setActivePromptTab] = useState<'prompt_notes' | 'prompt_tasks' | 'prompt_cab'>('prompt_notes');
  const editorRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    (async () => {
      const pn = await getConfig('prompt_notes');
      const pt = await getConfig('prompt_tasks');
      const pc = await getConfig('prompt_cab');
      setPromptNotes(pn ?? DEFAULT_NOTES_PROMPT);
      setPromptTasks(pt ?? DEFAULT_TASKS_PROMPT);
      setPromptCab(pc ?? DEFAULT_CAB_PROMPT);
    })();
  }, []);

  const savePrompt = useCallback((key: AppConfigKey, value: string, defaultValue: string) => {
    if (promptSaveTimers.current[key]) clearTimeout(promptSaveTimers.current[key]);
    promptSaveTimers.current[key] = setTimeout(async () => {
      if (value.trim() === defaultValue.trim() || !value.trim()) {
        await deleteConfig(key);
      } else {
        await setConfig(key, value);
      }
      setPromptSaveStatus((prev) => ({ ...prev, [key]: 'saved' }));
      setTimeout(() => setPromptSaveStatus((prev) => ({ ...prev, [key]: '' })), 2000);
    }, 800);
  }, []);

  const handleResetPrompt = async (key: AppConfigKey, defaultValue: string, setter: (v: string) => void) => {
    setter(defaultValue);
    await deleteConfig(key);
    setPromptSaveStatus((prev) => ({ ...prev, [key]: 'reset' }));
    setTimeout(() => setPromptSaveStatus((prev) => ({ ...prev, [key]: '' })), 2000);
  };

  const promptConfigs = [
    { key: 'prompt_notes' as const, label: t('settings.promptNotes'), value: promptNotes, setter: setPromptNotes, defaultValue: DEFAULT_NOTES_PROMPT },
    { key: 'prompt_tasks' as const, label: t('settings.promptTasks'), value: promptTasks, setter: setPromptTasks, defaultValue: DEFAULT_TASKS_PROMPT },
    { key: 'prompt_cab' as const, label: t('settings.promptCab'), value: promptCab, setter: setPromptCab, defaultValue: DEFAULT_CAB_PROMPT },
  ];
  const active = promptConfigs.find((p) => p.key === activePromptTab)!;
  const lines = active.value.split('\n');

  return (
    <Card>
      {/* Sub-tabs styled like file tabs */}
      <div className="flex bg-[#252526] pt-2 px-2 gap-0.5">
        {promptConfigs.map((p) => (
          <button
            key={p.key}
            className={`px-4 py-2 text-xs font-medium transition-colors relative ${
              activePromptTab === p.key
                ? 'bg-[#1e1e1e] text-white border-t-2 border-t-primary border-x border-x-[#333] rounded-t-sm'
                : 'bg-[#2d2d2d] text-[#888] hover:text-[#ccc] border-t-2 border-t-transparent border-x border-x-transparent rounded-t-sm'
            }`}
            onClick={() => setActivePromptTab(p.key)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#1e1e1e] border-b border-[#333]">
        <span className="text-xs text-[#888] font-mono">
          {lines.length} {lines.length === 1 ? t('settings.line') : t('settings.lines')}
        </span>
        <div className="flex items-center gap-2">
          {promptSaveStatus[active.key] === 'saved' && (
            <span className="text-xs text-emerald-400 flex items-center gap-1">
              <IconCheck size={13} />
              {t('settings.promptSaved')}
            </span>
          )}
          {promptSaveStatus[active.key] === 'reset' && (
            <span className="text-xs text-emerald-400 flex items-center gap-1">
              <IconCheck size={13} />
              {t('settings.promptResetDone')}
            </span>
          )}
          {active.value.trim() !== active.defaultValue.trim() && (
            <button
              className="text-xs text-[#888] hover:text-white px-2 py-0.5 border border-[#555] hover:border-[#888] transition-colors"
              onClick={() => handleResetPrompt(active.key, active.defaultValue, active.setter)}
            >
              {t('settings.promptReset')}
            </button>
          )}
        </div>
      </div>

      {/* Editor */}
      <div className="relative bg-[#1e1e1e] overflow-auto max-h-[650px]">
        <div className="flex">
          <div className="select-none text-right pr-3 pl-3 py-3 text-[#555] text-xs font-mono leading-[1.65] border-r border-[#333] sticky left-0 bg-[#1e1e1e] shrink-0" aria-hidden>
            {lines.map((_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
          </div>
          <textarea
            ref={editorRef}
            className="flex-1 bg-transparent text-[#d4d4d4] text-xs font-mono leading-[1.65] p-3 resize-none outline-none border-none min-h-[600px] w-full"
            value={active.value}
            onChange={(e) => {
              active.setter(e.target.value);
              savePrompt(active.key, e.target.value, active.defaultValue);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Tab') {
                e.preventDefault();
                const target = e.target as HTMLTextAreaElement;
                const start = target.selectionStart;
                const end = target.selectionEnd;
                const newValue = active.value.substring(0, start) + '  ' + active.value.substring(end);
                active.setter(newValue);
                savePrompt(active.key, newValue, active.defaultValue);
                requestAnimationFrame(() => {
                  target.selectionStart = target.selectionEnd = start + 2;
                });
              }
            }}
            spellCheck={false}
            wrap="off"
          />
        </div>
      </div>

      {/* Footer hint */}
      <div className="px-4 py-2 bg-[#252526] border-t border-[#333]">
        <p className="text-[0.65rem] text-[#888]">{t('settings.promptHint')}</p>
      </div>
    </Card>
  );
}
