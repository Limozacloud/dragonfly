import { appDataDir, join } from '@tauri-apps/api/path';
import { writeTextFile, readTextFile, rename, stat } from '@tauri-apps/plugin-fs';
import { getConfig, setConfig } from './database';

export type LogLevel = 'OK' | 'ERR' | 'WARN' | 'INFO' | 'DBG';

type LogCallback = (line: string) => void;

const listeners: Set<LogCallback> = new Set();
let writeQueue: string[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let logFilePath: string | null = null;
let oldLogFilePath: string | null = null;
let maxLogSizeMb = 5;

// Resolve paths lazily (Tauri APIs are async)
async function ensurePaths(): Promise<void> {
  if (logFilePath) return;
  const dataDir = await appDataDir();
  logFilePath = await join(dataDir, 'dragonfly.log');
  oldLogFilePath = await join(dataDir, 'dragonfly.log.old');
}

function formatTimestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * Log a message. Synchronously callable — file writes are batched.
 */
export function log(level: LogLevel, msg: string): void {
  const line = `[${formatTimestamp()}] [${level}] ${msg}`;

  // Notify listeners
  for (const cb of listeners) {
    try { cb(line); } catch { /* ignore listener errors */ }
  }

  // Queue for file write
  writeQueue.push(line);
  scheduleFlush();
}

/**
 * Subscribe to new log lines. Returns unsubscribe function.
 */
export function onLog(cb: LogCallback): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/**
 * Load last N lines from the log file (default 2000).
 */
export async function loadLogFile(maxLines = 2000): Promise<string[]> {
  await ensurePaths();
  try {
    const content = await readTextFile(logFilePath!);
    const lines = content.split('\n').filter((l) => l.length > 0);
    return lines.slice(-maxLines);
  } catch {
    return [];
  }
}

/**
 * Clear the log file.
 */
export async function clearLogFile(): Promise<void> {
  await ensurePaths();
  try {
    await writeTextFile(logFilePath!, '');
  } catch { /* file may not exist yet */ }
}

/**
 * Get the configured max log size in MB.
 */
export async function getMaxLogSize(): Promise<number> {
  try {
    const val = await getConfig('log_max_size_mb');
    if (val) {
      const n = parseFloat(val);
      if (n > 0) {
        maxLogSizeMb = n;
        return n;
      }
    }
  } catch { /* use default */ }
  return maxLogSizeMb;
}

/**
 * Set the max log size in MB.
 */
export async function setMaxLogSize(mb: number): Promise<void> {
  maxLogSizeMb = mb;
  await setConfig('log_max_size_mb', String(mb));
}

// --- Internal ---

function scheduleFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flush();
  }, 200);
}

async function flush(): Promise<void> {
  if (writeQueue.length === 0) return;
  const batch = writeQueue.join('\n') + '\n';
  writeQueue = [];

  try {
    await ensurePaths();
    await writeTextFile(logFilePath!, batch, { append: true });
    await checkRollover();
  } catch (err) {
    console.warn('[logService] flush failed:', err);
  }
}

async function checkRollover(): Promise<void> {
  try {
    const info = await stat(logFilePath!);
    const sizeBytes = info.size;
    if (sizeBytes > maxLogSizeMb * 1024 * 1024) {
      try {
        await rename(logFilePath!, oldLogFilePath!);
      } catch { /* old file write may fail, ignore */ }
      await writeTextFile(logFilePath!, '');
    }
  } catch { /* stat may fail if file doesn't exist yet */ }
}
